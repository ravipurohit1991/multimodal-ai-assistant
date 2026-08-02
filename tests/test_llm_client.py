"""The request the app actually sends, and the accounting it reads back.

These cover the failure that motivated the whole change: a request that names no
context window is not a smaller request, it is a truncated one. Ollama applies
its own default, keeps the leading system message, and drops what will not fit —
which, in this app's layout, is the conversation. The prompt was paid for in full
and arrived at the model with the story cut off.
"""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest

from personaparlour.llm.ollama import (
    OllamaClient,
    default_chat_options,
    get_chat_client,
    structured_pass_options,
)


class FakeStream:
    """One canned Ollama response, replayed as newline-delimited JSON frames."""

    def __init__(self, frames: list[dict]):
        self._frames = frames
        self.is_error = False

    async def aiter_lines(self):
        for frame in self._frames:
            yield json.dumps(frame)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class RecordingHttpClient:
    """Captures the payload the client sends, and replays a scripted answer."""

    def __init__(self, frames: list[dict], sent: list[dict]):
        self._frames = frames
        self._sent = sent

    def stream(self, method, url, headers=None, json=None):
        self._sent.append(json)
        return FakeStream(self._frames)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


def run_chat(monkeypatch, frames, **kwargs):
    """Drive one stream_chat call, returning (text, sent payload, usage)."""
    sent: list[dict] = []
    monkeypatch.setattr(
        "personaparlour.llm.ollama.httpx.AsyncClient",
        lambda *a, **k: RecordingHttpClient(frames, sent),
    )
    usage: dict = {}
    client = OllamaClient(host="http://localhost:11434", default_model="test-model")

    async def drive():
        text = ""
        async for delta in client.stream_chat(
            [{"role": "user", "content": "hello"}],
            on_usage=usage.update,
            **kwargs,
        ):
            text += delta
        return text

    return asyncio.run(drive()), sent[0], usage


def reply_frames(text="hi", **done_fields):
    return [
        {"message": {"content": text}, "done": False},
        {"message": {"content": ""}, "done": True, **done_fields},
    ]


# ----- Every request names its context window -----------------------------


def test_every_request_states_the_context_window(monkeypatch):
    _, payload, _ = run_chat(monkeypatch, reply_frames())

    assert payload["options"]["num_ctx"] > 0


def test_per_call_options_ride_on_top_of_the_defaults(monkeypatch):
    _, payload, _ = run_chat(
        monkeypatch, reply_frames(), options={"num_predict": 400, "stop": ["\nAlex:"]}
    )

    assert payload["options"]["num_predict"] == 400
    assert payload["options"]["stop"] == ["\nAlex:"]
    # The window is still named — a caller cannot drop it by passing options.
    assert payload["options"]["num_ctx"] == default_chat_options()["num_ctx"]


def test_a_caller_cannot_unset_the_window_with_a_none(monkeypatch):
    _, payload, _ = run_chat(monkeypatch, reply_frames(), options={"num_ctx": None})

    assert payload["options"]["num_ctx"] == default_chat_options()["num_ctx"]


def test_sampling_knobs_are_only_sent_when_the_user_configured_them(monkeypatch):
    monkeypatch.setattr("personaparlour.llm.ollama.config.llm_temperature", None)
    assert "temperature" not in default_chat_options()

    monkeypatch.setattr("personaparlour.llm.ollama.config.llm_temperature", 0.7)
    assert default_chat_options()["temperature"] == 0.7


# ----- The accounting the server already reports --------------------------


def test_the_final_frame_reports_what_the_turn_actually_cost(monkeypatch):
    text, _, usage = run_chat(
        monkeypatch, reply_frames(prompt_eval_count=5_900, eval_count=250)
    )

    assert text == "hi"
    assert usage["prompt_tokens"] == 5_900
    assert usage["completion_tokens"] == 250
    assert usage["total_tokens"] == 6_150
    assert usage["context_limit"] == default_chat_options()["num_ctx"]


def test_a_server_that_reports_nothing_produces_no_usage(monkeypatch):
    _, _, usage = run_chat(monkeypatch, reply_frames())

    assert usage == {}


def test_a_partial_report_is_still_read(monkeypatch):
    _, _, usage = run_chat(monkeypatch, reply_frames(prompt_eval_count=120))

    assert usage["prompt_tokens"] == 120
    assert usage["completion_tokens"] == 0


def test_a_prompt_that_nearly_fills_the_window_is_warned_about(monkeypatch, caplog):
    monkeypatch.setattr("personaparlour.llm.ollama.config.llm_num_ctx", 4096)
    with caplog.at_level("WARNING"):
        run_chat(monkeypatch, reply_frames(prompt_eval_count=4_000, eval_count=10))

    assert any("context tokens" in record.message for record in caplog.records)


def test_a_comfortable_prompt_warns_about_nothing(monkeypatch, caplog):
    monkeypatch.setattr("personaparlour.llm.ollama.config.llm_num_ctx", 16384)
    with caplog.at_level("WARNING"):
        run_chat(monkeypatch, reply_frames(prompt_eval_count=4_000, eval_count=10))

    assert not [r for r in caplog.records if "context tokens" in r.message]


# ----- One shared, configured client --------------------------------------


def test_one_client_is_shared_per_host_and_carries_the_configured_keep_alive(monkeypatch):
    monkeypatch.setattr("personaparlour.llm.ollama.config.llm_keep_alive", "0")
    monkeypatch.setattr("personaparlour.llm.ollama._CLIENT_CACHE", {})

    first = get_chat_client("http://localhost:11434", "model-a")
    second = get_chat_client("http://localhost:11434/", "model-b")

    # The same client, so LOW_VRAM_MODE's keep_alive reaches every generation —
    # it previously only reached one client that never made a request.
    assert first is second
    assert first.keep_alive == "0"
    assert first.default_model == "model-b"
    assert get_chat_client("http://elsewhere:11434") is not first


# ----- Ceilings for the structured side tasks -----------------------------


@pytest.mark.parametrize("char_ceiling", [4000, 6000, 8000, 10000])
def test_a_structured_pass_caps_what_it_may_generate(char_ceiling):
    options = structured_pass_options(char_ceiling)

    assert options["num_predict"] >= 256
    assert options["num_predict"] <= char_ceiling


def test_a_tiny_ceiling_still_leaves_room_for_a_real_answer():
    """Never cap so hard that a valid empty-result JSON object cannot be emitted."""
    assert structured_pass_options(10)["num_predict"] == 256


# ----- The reply path assembles both halves -------------------------------


def test_the_reply_payload_carries_the_window_and_the_dial(monkeypatch):
    from personaparlour.roleplay import build_stop_sequences, reply_token_ceiling

    state = SimpleNamespace(response_length="brief", user_name="Alex", cast=["Mira"])
    options = {
        "num_predict": reply_token_ceiling(state),
        "stop": build_stop_sequences(state, "Mira"),
    }
    _, payload, _ = run_chat(monkeypatch, reply_frames(), options=options)

    assert payload["options"]["num_ctx"] > 0
    assert payload["options"]["num_predict"] == 400
    assert payload["options"]["stop"] == ["\nAlex:"]
