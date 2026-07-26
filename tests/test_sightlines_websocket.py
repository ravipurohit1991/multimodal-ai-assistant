import asyncio
import importlib
import json
import sys
from types import ModuleType, SimpleNamespace

from fastapi import WebSocketDisconnect

from aiassistant.sightlines import USER_TOKEN

SECRET = "Mira poisoned the wine at the Duke's table"
TOPIC = "what happened to the wine"


class ScriptedWebSocket:
    """Small protocol harness that feeds text frames, then disconnects."""

    def __init__(self, messages: list[dict]):
        self.headers: dict[str, str] = {}
        self._messages = list(messages)
        self.sent: list[dict] = []
        self.accepted = False

    async def accept(self):
        self.accepted = True

    async def send_text(self, text: str):
        self.sent.append(json.loads(text))

    async def receive(self):
        if self._messages:
            return {"text": json.dumps(self._messages.pop(0))}
        raise WebSocketDisconnect()


def _load_websocket_module_without_real_engines(monkeypatch):
    """Import orchestration without initializing Whisper/Piper model assets."""

    fake_manager_module = ModuleType("aiassistant.engine_manager")
    fake_manager_module.engine_manager = SimpleNamespace(
        stt_engine=object(),
        tts_engine=object(),
        image_explainer=None,
        image_generator=None,
    )
    monkeypatch.setitem(sys.modules, "aiassistant.engine_manager", fake_manager_module)
    sys.modules.pop("aiassistant.websocket", None)
    return importlib.import_module("aiassistant.websocket")


def run_socket(monkeypatch, frames: list[dict]) -> ScriptedWebSocket:
    websocket_module = _load_websocket_module_without_real_engines(monkeypatch)
    socket = ScriptedWebSocket(frames)
    try:
        asyncio.run(websocket_module.ws_endpoint(socket))
    finally:
        sys.modules.pop("aiassistant.websocket", None)
    return socket


def snapshots(socket: ScriptedWebSocket) -> list[dict]:
    return [frame for frame in socket.sent if frame.get("type") == "sightlines_updated"]


def test_the_cast_is_the_participant_list_the_ui_builds_its_grid_from(monkeypatch):
    socket = run_socket(
        monkeypatch,
        [
            {"type": "set_cast", "names": ["Mira", "Tomas", "  ", 7, "Mira"]},
            {"type": "add_sightline", "text": SECRET, "topic": TOPIC, "knows": ["Mira"]},
        ],
    )

    latest = snapshots(socket)[-1]
    assert latest["participants"] == ["Mira", "Tomas", USER_TOKEN]
    assert latest["entries"][0]["knows"] == ["Mira"]
    assert latest["entries"][0]["topic"] == TOPIC


def test_a_character_who_steps_out_of_the_scene_does_not_forget(monkeypatch):
    """Narrowing a hand-authored audience to the cast would lose real knowledge."""
    socket = run_socket(
        monkeypatch,
        [
            {"type": "set_cast", "names": ["Mira", "Tomas"]},
            {"type": "add_sightline", "text": SECRET, "topic": TOPIC, "knows": ["Mira", "Tomas"]},
            {"type": "set_cast", "names": ["Mira"]},
            # An unrelated edit round-trips the whole ledger through the backend.
            {
                "type": "set_sightline_entries",
                "entries": [
                    {"text": SECRET, "topic": "the wine", "knows": ["Mira", "Tomas"]},
                ],
            },
        ],
    )

    latest = snapshots(socket)[-1]
    assert latest["participants"] == ["Mira", USER_TOKEN]
    assert latest["entries"][0]["knows"] == ["Mira", "Tomas"]


def test_an_entry_added_without_an_audience_starts_as_shared_context(monkeypatch):
    socket = run_socket(
        monkeypatch,
        [
            {"type": "set_cast", "names": ["Mira", "Tomas"]},
            {"type": "add_sightline", "text": "The tavern closes at midnight."},
        ],
    )

    entry = snapshots(socket)[-1]["entries"][0]
    assert entry["knows"] == ["Mira", "Tomas", USER_TOKEN]


def test_a_restored_ledger_survives_a_reconnect_and_clear_resets_it(monkeypatch):
    saved = [
        {
            "id": "keep_pin",
            "text": SECRET,
            "topic": TOPIC,
            "knows": ["Mira"],
            "pinned": True,
            "turn": 2,
        }
    ]
    socket = run_socket(
        monkeypatch,
        [
            {"type": "set_cast", "names": ["Mira", "Tomas"]},
            {
                "type": "sync_history",
                "history": [
                    {"role": "user", "content": "What was in the cup?"},
                    {"role": "assistant", "content": "Mira says nothing."},
                ],
            },
            {
                "type": "set_sightlines",
                "enabled": True,
                "auto": False,
                "covered": 2,
                "entries": saved,
            },
            {"type": "clear_chat"},
        ],
    )

    restored, cleared = snapshots(socket)[-2], snapshots(socket)[-1]
    assert [entry["id"] for entry in restored["entries"]] == ["keep_pin"]
    assert restored["covered"] == 2
    assert cleared["entries"] == []
    assert cleared["covered"] == 0
    # Restoring a snapshot never starts a model pass on its own.
    assert not any(
        frame.get("type") == "sightlines_status" and frame.get("busy") for frame in socket.sent
    )


def test_rewinding_the_story_retracts_a_leak_but_keeps_who_knows_what(monkeypatch):
    socket = run_socket(
        monkeypatch,
        [
            {"type": "set_cast", "names": ["Mira", "Tomas"]},
            {"type": "add_sightline", "text": SECRET, "topic": TOPIC, "knows": ["Mira"]},
            {"type": "sync_history", "history": [{"role": "user", "content": "Start again."}]},
        ],
    )

    latest = snapshots(socket)[-1]
    assert [entry["text"] for entry in latest["entries"]] == [SECRET]
    assert latest["covered"] == 0


def test_switching_sightlines_off_disarms_any_pending_correction(monkeypatch):
    socket = run_socket(
        monkeypatch,
        [
            {"type": "set_cast", "names": ["Mira", "Tomas"]},
            {"type": "add_sightline", "text": SECRET, "topic": TOPIC, "knows": ["Mira"]},
            {"type": "set_sightlines", "enabled": False},
            {"type": "forget_sightlines"},
        ],
    )

    off, forgotten = snapshots(socket)[-2], snapshots(socket)[-1]
    assert off["enabled"] is False
    assert forgotten["entries"] == []


def test_checking_with_the_feature_off_answers_instead_of_spinning(monkeypatch):
    """A disabled feature must answer the UI, or its modal waits forever."""
    socket = run_socket(
        monkeypatch,
        [
            {"type": "set_cast", "names": ["Mira", "Tomas"]},
            {"type": "set_sightlines", "enabled": False},
            {"type": "check_sightlines", "speaker_name": "Tomas"},
            {"type": "harvest_sightlines"},
        ],
    )

    replies = snapshots(socket)[-2:]
    assert all(reply.get("unchanged") for reply in replies)
    assert not any(
        frame.get("type") == "sightlines_status" and frame.get("busy") for frame in socket.sent
    )
