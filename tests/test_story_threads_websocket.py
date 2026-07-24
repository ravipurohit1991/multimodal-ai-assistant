import asyncio
import importlib
import json
import sys
from types import ModuleType, SimpleNamespace

from fastapi import WebSocketDisconnect


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
    monkeypatch.setitem(
        sys.modules,
        "aiassistant.engine_manager",
        fake_manager_module,
    )
    sys.modules.pop("aiassistant.websocket", None)
    return importlib.import_module("aiassistant.websocket")


def test_history_replacement_preserves_only_pinned_threads_and_clear_resets_all(
    monkeypatch,
):
    websocket_module = _load_websocket_module_without_real_engines(monkeypatch)
    original_history = [
        {"role": "user", "content": "Who sent the letter?"},
        {"role": "assistant", "content": "The seal is unfamiliar."},
    ]
    rewritten_history = [
        {"role": "user", "content": "The room is quiet."},
        {"role": "assistant", "content": "Mira closes the window."},
    ]
    socket = ScriptedWebSocket(
        [
            {"type": "sync_history", "history": original_history},
            {
                "type": "set_story_threads",
                "enabled": True,
                "auto": True,
                "covered": 2,
                "threads": [
                    {
                        "id": "keep_pin",
                        "title": "Keep Mira safe",
                        "summary": "A reader-authored priority.",
                        "kind": "promise",
                        "status": "active",
                        "pinned": True,
                        "created_turn": 1,
                        "updated_turn": 2,
                    },
                    {
                        "id": "old_hook",
                        "title": "Who sent the letter?",
                        "summary": "The sender is unknown.",
                        "kind": "mystery",
                        "status": "active",
                        "pinned": False,
                        "created_turn": 1,
                        "updated_turn": 2,
                    },
                ],
            },
            {"type": "sync_history", "history": rewritten_history},
            {"type": "clear_chat"},
        ]
    )

    try:
        asyncio.run(websocket_module.ws_endpoint(socket))
    finally:
        sys.modules.pop("aiassistant.websocket", None)

    snapshots = [
        frame for frame in socket.sent if frame.get("type") == "story_threads_updated"
    ]
    assert socket.accepted is True
    assert [thread["id"] for thread in snapshots[-2]["threads"]] == ["keep_pin"]
    assert snapshots[-2]["covered"] == 0
    assert snapshots[-2]["total"] == len(rewritten_history)
    assert snapshots[-1]["threads"] == []
    assert snapshots[-1]["covered"] == 0
    assert snapshots[-1]["total"] == 0
    # Restoring a snapshot does not begin a model pass before the rest of a
    # reconnect's model/host settings arrive.
    assert not any(
        frame.get("type") == "story_threads_status" and frame.get("busy")
        for frame in socket.sent
    )
