import asyncio
import importlib
import json
import sys
from types import ModuleType, SimpleNamespace

from fastapi import WebSocketDisconnect

HABIT = "Answers a hard question with a question of her own"
LINE = "You can stand there all night."


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
    return [frame for frame in socket.sent if frame.get("type") == "character_study_updated"]


def test_a_hand_written_line_lands_in_the_sheet_and_shapes_replies(monkeypatch):
    socket = run_socket(
        monkeypatch,
        [
            {"type": "set_cast", "names": ["Mira", "Tomas"]},
            {"type": "add_study_trait", "character": "Mira", "facet": "voice", "text": HABIT},
        ],
    )
    latest = snapshots(socket)[-1]
    trait = latest["traits"][0]
    assert trait["text"] == HABIT
    assert trait["character"] == "Mira"
    # The author's own line is established at once, and is never auto-revised.
    assert trait["origin"] == "authored"
    assert trait["pinned"] is True
    assert latest["cast"] == ["Mira", "Tomas"]
    assert latest["studied"] == ["Mira"]


def test_a_bond_records_who_it_is_about(monkeypatch):
    socket = run_socket(
        monkeypatch,
        [
            {"type": "set_cast", "names": ["Mira", "Tomas"]},
            {
                "type": "add_study_trait",
                "character": "Mira",
                "facet": "bond",
                "text": "no longer hides the tremor in her hands",
                "about": "Tomas",
            },
        ],
    )
    assert snapshots(socket)[-1]["traits"][0]["about"] == "Tomas"


def test_a_line_facet_is_stored_as_the_spoken_words_alone(monkeypatch):
    socket = run_socket(
        monkeypatch,
        [
            {"type": "add_study_trait", "character": "Mira", "facet": "line", "text": f'"{LINE}"'},
        ],
    )
    assert snapshots(socket)[-1]["traits"][0]["text"] == LINE


def test_a_trait_with_no_character_is_refused(monkeypatch):
    socket = run_socket(
        monkeypatch,
        [
            {"type": "add_study_trait", "text": HABIT},
            {"type": "add_study_trait", "character": "Mira", "text": "  "},
        ],
    )
    assert snapshots(socket)[-1]["traits"] == []


def test_the_sheet_survives_a_restore_and_reports_what_it_has_read(monkeypatch):
    """A reconnecting browser hands back its sheet; the backend takes it as-is."""
    socket = run_socket(
        monkeypatch,
        [
            {"type": "set_cast", "names": ["Mira"]},
            {
                "type": "set_character_study",
                "enabled": True,
                "auto": False,
                "watch": True,
                "interval": 9,
                "traits": [
                    {
                        "id": "keepthis",
                        "character": "Mira",
                        "facet": "voice",
                        "text": HABIT,
                        "observations": 3,
                        "first_turn": 4,
                        "last_turn": 40,
                    }
                ],
                "locked": ["Mira"],
                "covered": 0,
            },
        ],
    )
    latest = snapshots(socket)[-1]
    assert latest["traits"][0]["id"] == "keepthis"
    assert latest["traits"][0]["observations"] == 3
    assert latest["watch"] is True
    assert latest["auto"] is False
    assert latest["interval"] == 9
    assert latest["locked"] == ["Mira"]


def test_the_covered_cursor_cannot_outrun_the_story_it_was_saved_against(monkeypatch):
    socket = run_socket(
        monkeypatch,
        [{"type": "set_character_study", "covered": 500}],
    )
    # A saved cursor from a 500-message story must not claim to have read a fresh one.
    assert snapshots(socket)[-1]["covered"] == 0


def test_editing_the_sheet_by_hand_is_authoritative(monkeypatch):
    socket = run_socket(
        monkeypatch,
        [
            {"type": "add_study_trait", "character": "Mira", "text": HABIT},
            {"type": "set_study_traits", "traits": []},
        ],
    )
    assert snapshots(socket)[-1]["traits"] == []


def test_locking_and_unlocking_a_study_round_trips(monkeypatch):
    socket = run_socket(
        monkeypatch,
        [
            {"type": "set_study_lock", "character": "Mira", "locked": True},
            {"type": "set_study_lock", "character": "Tomas", "locked": True},
            {"type": "set_study_lock", "character": "Mira", "locked": False},
        ],
    )
    assert snapshots(socket)[-1]["locked"] == ["Tomas"]


def test_forgetting_the_studies_clears_the_sheet(monkeypatch):
    socket = run_socket(
        monkeypatch,
        [
            {"type": "add_study_trait", "character": "Mira", "text": HABIT},
            {"type": "forget_character_study"},
        ],
    )
    latest = snapshots(socket)[-1]
    assert latest["traits"] == []
    assert latest["covered"] == 0


def test_switching_the_study_off_disarms_a_pending_correction(monkeypatch):
    socket = run_socket(
        monkeypatch,
        [{"type": "set_character_study", "enabled": False}],
    )
    assert snapshots(socket)[-1]["enabled"] is False


def test_a_refresh_with_the_study_off_answers_rather_than_hanging(monkeypatch):
    """The UI shows a spinner the moment it asks, so a refusal must clear it."""
    socket = run_socket(
        monkeypatch,
        [
            {"type": "set_character_study", "enabled": False},
            {"type": "refresh_character_study", "rebuild": True},
        ],
    )
    statuses = [f for f in socket.sent if f.get("type") == "character_study_status"]
    assert statuses and statuses[-1]["busy"] is False
    assert snapshots(socket)[-1].get("unchanged") is True


def test_a_catch_up_with_nothing_to_read_answers_rather_than_hanging(monkeypatch):
    socket = run_socket(
        monkeypatch,
        [{"type": "refresh_character_study"}],
    )
    statuses = [f for f in socket.sent if f.get("type") == "character_study_status"]
    assert statuses and statuses[-1]["busy"] is False
    assert snapshots(socket)[-1].get("unchanged") is True


def test_resolving_a_drift_report_with_no_alert_is_harmless(monkeypatch):
    socket = run_socket(
        monkeypatch,
        [{"type": "resolve_study_drift", "action": "accept"}],
    )
    resolved = [f for f in socket.sent if f.get("type") == "study_drift_resolved"]
    assert resolved and resolved[-1]["action"] == "accept"


def test_the_cast_arriving_republishes_the_study_view(monkeypatch):
    """The card builds its "about" picker from the same list the sheet is scoped to."""
    socket = run_socket(monkeypatch, [{"type": "set_cast", "names": ["Mira", "Tomas"]}])
    assert snapshots(socket)[-1]["cast"] == ["Mira", "Tomas"]


def test_clearing_the_chat_forgets_who_everyone_became(monkeypatch):
    socket = run_socket(
        monkeypatch,
        [
            {"type": "add_study_trait", "character": "Mira", "text": HABIT},
            {"type": "clear_chat"},
        ],
    )
    assert snapshots(socket)[-1]["traits"] == []


# ----- Inventing a character ----------------------------------------------
# Kept beside the study tests because they share the harness, and because a
# generated name colliding with the roster would quietly share a study sheet.


def card_frames(socket: ScriptedWebSocket) -> list[dict]:
    return [frame for frame in socket.sent if frame.get("type") == "character_card_generated"]


def test_an_invented_card_comes_back_over_the_socket(monkeypatch):
    import aiassistant.character_cards as cards_module

    async def fake_generate(state, messages):
        return json.dumps(
            {
                "name": "Osmund Brask",
                "description": "A broad man in a burned apron.",
                "personality": "gruff, dry",
                "first_message": '*He looks up.* "Forge is cold."',
            }
        )

    monkeypatch.setattr(cards_module, "_generate", fake_generate)
    socket = run_socket(
        monkeypatch,
        [
            {"type": "set_llm_model", "model": "test-model"},
            {"type": "generate_character_card", "guidance": "a village blacksmith"},
            # A second frame gives the background task a turn to finish.
            {"type": "set_cast", "names": ["Mira"]},
        ],
    )
    frames = card_frames(socket)
    assert frames, "no card frame was published"
    assert frames[-1]["card"]["name"] == "Osmund Brask"
    statuses = [f for f in socket.sent if f.get("type") == "character_card_status"]
    assert statuses[0]["busy"] is True
    assert statuses[-1]["busy"] is False


def test_an_unusable_answer_is_reported_rather_than_left_spinning(monkeypatch):
    import aiassistant.character_cards as cards_module

    async def fake_generate(state, messages):
        return "I'm afraid I can't do that."

    monkeypatch.setattr(cards_module, "_generate", fake_generate)
    socket = run_socket(
        monkeypatch,
        [
            {"type": "set_llm_model", "model": "test-model"},
            {"type": "generate_character_card"},
            {"type": "set_cast", "names": ["Mira"]},
        ],
    )
    frames = card_frames(socket)
    assert frames and frames[-1]["card"] is None
    assert frames[-1]["error"]
    statuses = [f for f in socket.sent if f.get("type") == "character_card_status"]
    assert statuses[-1]["busy"] is False


def test_an_invented_name_is_kept_clear_of_the_existing_cast(monkeypatch):
    import aiassistant.character_cards as cards_module

    async def fake_generate(state, messages):
        return json.dumps({"name": "Mira", "description": "Another one entirely."})

    monkeypatch.setattr(cards_module, "_generate", fake_generate)
    socket = run_socket(
        monkeypatch,
        [
            {"type": "set_llm_model", "model": "test-model"},
            {"type": "set_cast", "names": ["Mira"]},
            {"type": "generate_character_card"},
            {"type": "set_cast", "names": ["Mira"]},
        ],
    )
    # Two cast members sharing a name would share a Character Study sheet.
    assert card_frames(socket)[-1]["card"]["name"] == "Mira 2"
