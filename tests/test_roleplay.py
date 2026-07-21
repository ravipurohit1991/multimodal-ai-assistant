from types import SimpleNamespace

from aiassistant.roleplay import apply_placeholders, build_llm_messages


def make_state(**overrides):
    values = {
        "messages": [
            {"role": "system", "content": "system contract"},
            {"role": "user", "content": "old question"},
            {"role": "assistant", "content": "old answer"},
        ],
        "use_context": True,
        "char_name": "Mira",
        "user_name": "Alex",
        "lorebook": [],
        "lorebook_scan_depth": 4,
        "author_note": "",
        "author_note_depth": 3,
        "response_length": "normal",
        "narration_perspective": "default",
        "pacing": "steady",
        "director_beat": "",
        "scene_time": "",
        "scene_weather": "",
        "scene_location": "",
        "include_mood": False,
        "include_animation": False,
        "auto_scene": False,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_final_contract_reminder_is_last_and_history_is_not_mutated():
    state = make_state(author_note="Keep the tension understated.")
    original = [dict(message) for message in state.messages]

    messages = build_llm_messages(state)

    assert messages[-1]["role"] == "system"
    assert messages[-1]["content"].startswith("[Final reply check")
    assert "preserve the user's agency" in messages[-1]["content"]
    assert state.messages == original


def test_no_context_mode_keeps_the_enriched_latest_user_message():
    state = make_state(use_context=False)
    enriched = "What is this?\n\n[Attached image description: a red kite]"

    messages = build_llm_messages(state, no_context_user_text=enriched)

    user_messages = [message for message in messages if message["role"] == "user"]
    assert user_messages == [{"role": "user", "content": enriched}]


def test_final_reminder_tracks_enabled_character_controls():
    state = make_state(include_mood=True, include_animation=True, auto_scene=True)

    reminder = build_llm_messages(state)[-1]["content"]

    assert "one leading mood tag" in reminder
    assert "one animation tag" in reminder
    assert "scene tag only if the setting changed" in reminder
    assert "purely OOC" in reminder


def test_placeholder_names_are_literal_even_with_regex_replacement_syntax():
    result = apply_placeholders("{{char}} greets {{user}}", r"Captain \g<0>", r"User \1")

    assert result == r"Captain \g<0> greets User \1"
