from types import SimpleNamespace

from aiassistant.roleplay import (
    PRESENCE_BEATS,
    apply_placeholders,
    build_llm_messages,
    build_presence_directive,
    describe_quiet,
    presence_max_beats,
)


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


def test_presence_directive_names_the_cast_and_forbids_answering_a_silence():
    state = make_state()

    directive = build_presence_directive(state, "Mira", "Alex", quiet_seconds=120)

    assert "{{char}}" not in directive and "{{user}}" not in directive
    assert "Alex has been quiet for about 2 minutes" in directive
    # The prompt still ends on the user's last message, so the model must be told
    # explicitly that there is nothing new to answer.
    assert "do not answer, quote, or invent a message from them" in directive
    # An idle beat must never turn into "are you still there?".
    assert "still there" in directive


def test_presence_beats_rotate_so_a_long_silence_does_not_repeat_itself():
    state = make_state()

    beats = [
        build_presence_directive(state, "Mira", "Alex", beat_index=index)
        for index in range(len(PRESENCE_BEATS) + 1)
    ]

    distinct = {beat for beat in beats}
    assert len(distinct) == len(PRESENCE_BEATS)  # the cursor wraps cleanly
    assert beats[0] == beats[len(PRESENCE_BEATS)]


def test_quiet_stretches_are_described_the_way_a_person_would():
    assert describe_quiet(0) == "a little while"
    assert describe_quiet(45) == "a little while"
    assert describe_quiet(120) == "about 2 minutes"
    assert describe_quiet(3600) == "about an hour"
    assert describe_quiet(10800) == "about 3 hours"


def test_only_configured_presence_modes_allow_unprompted_turns():
    assert presence_max_beats("off") == 0
    assert presence_max_beats("") == 0
    assert presence_max_beats("nonsense") == 0
    assert presence_max_beats("rarely") == 1
    assert presence_max_beats("OFTEN") == 3
