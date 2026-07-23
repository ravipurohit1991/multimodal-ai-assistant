import asyncio
import json
from types import SimpleNamespace

import aiassistant.continuity as continuity_module
from aiassistant.continuity import (
    CANON_PROMPT_LIMIT,
    _parse_json_object,
    apply_revision,
    build_canon_block,
    build_continuity_note,
    merge_facts,
    new_fact,
    normalize_facts,
    parse_contradictions,
    parse_facts,
    prompt_facts,
    rebuild_canon,
    reset_canon,
    review_reply,
)
from aiassistant.roleplay import build_llm_messages


def make_state(turns: int = 0, **overrides):
    """A connection state with ``turns`` alternating user/assistant messages."""
    messages = [{"role": "system", "content": "system contract"}]
    for index in range(turns):
        role = "user" if index % 2 == 0 else "assistant"
        messages.append({"role": role, "content": f"turn {index}"})
    values = {
        "messages": messages,
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
        "memory_enabled": False,
        "memory_summary": "",
        "memory_covered": 0,
        "memory_keep_recent": 12,
        "memory_trigger": 20,
        "continuity_enabled": True,
        "continuity_auto": True,
        "canon": [],
        "canon_covered": 0,
        "continuity_alert": None,
        "continuity_note": "",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_a_story_with_the_guard_off_is_prompted_exactly_as_before():
    facts = [new_fact("Mira's eyes are grey.")]
    state = make_state(turns=4, continuity_enabled=False, canon=facts)

    assert build_canon_block(state) == ""
    assert not any("Story canon" in m["content"] for m in build_llm_messages(state))


def test_an_empty_canon_contributes_nothing():
    state = make_state(turns=4)

    assert build_canon_block(state) == ""


def test_established_facts_are_injected_as_one_block():
    state = make_state(
        turns=4,
        canon=[
            new_fact("Mira's eyes are grey.", subject="Mira"),
            new_fact("Alex gave Mira the brass key."),
        ],
    )

    blocks = [
        m
        for m in build_llm_messages(state)
        if m["role"] == "system" and "Story canon" in m["content"]
    ]

    assert len(blocks) == 1
    assert "Mira: Mira's eyes are grey." in blocks[0]["content"]
    assert "Alex gave Mira the brass key." in blocks[0]["content"]


def test_a_correction_rides_last_so_the_retry_cannot_miss_it():
    state = make_state(
        turns=4, continuity_note="[Continuity correction]\n- do not break: grey eyes"
    )

    messages = build_llm_messages(state)

    corrections = [i for i, m in enumerate(messages) if "Continuity correction" in m["content"]]
    styles = [i for i, m in enumerate(messages) if "Scene direction" in m["content"]]
    assert len(corrections) == 1
    assert corrections[0] > styles[0]


def test_the_prompt_carries_pinned_facts_even_when_the_ledger_is_long():
    pinned = new_fact("Mira is afraid of deep water.", pinned=True)
    filler = [new_fact(f"Detail number {i}.") for i in range(CANON_PROMPT_LIMIT + 20)]
    state = make_state(canon=[pinned, *filler])

    carried = prompt_facts(state)

    assert len(carried) <= CANON_PROMPT_LIMIT
    assert pinned["id"] in {fact["id"] for fact in carried}
    # The newest details survive; the oldest unpinned ones are the ones dropped.
    assert filler[-1]["id"] in {fact["id"] for fact in carried}
    assert filler[0]["id"] not in {fact["id"] for fact in carried}


def test_the_same_fact_told_twice_is_stored_once():
    existing = [new_fact("Mira's eyes are grey.")]

    merged, added = merge_facts(existing, [new_fact("Mira's eyes are GREY!")])

    assert added == 0
    assert len(merged) == 1


def test_a_fact_restated_in_other_words_is_not_stored_twice():
    existing = [
        new_fact("Mira's brother Tomas drowned two winters ago.", subject="Tomas"),
        new_fact("The lighthouse lamp has been dark since the storm.", subject="lighthouse"),
    ]
    # What a small model actually offers back, turn after turn.
    restatements = [
        new_fact("he drowned two winters ago and is dead", subject="Mira's brother Tomas"),
        new_fact("its lamp remains dark", subject="the lighthouse"),
    ]

    merged, added = merge_facts(existing, restatements)

    assert added == 0
    assert len(merged) == 2


def test_reading_the_story_again_rebuilds_the_ledger_instead_of_doubling_it():
    pinned = new_fact("Mira is afraid of deep water.", pinned=True)
    old_reading = [pinned, new_fact("Mira has grey hair."), new_fact("Alex arrived late.")]
    # A second reading of the same story, phrased the way a model phrases things.
    new_reading = [
        new_fact("Mira's hair is cropped and grey."),
        new_fact("Alex arrived three days late."),
    ]

    rebuilt, added = rebuild_canon(old_reading, new_reading)

    assert added == 2
    assert len(rebuilt) == 3
    assert pinned["id"] in {fact["id"] for fact in rebuilt}


def test_two_different_claims_about_the_same_thing_both_survive():
    existing = [new_fact("Mira's eyes are grey.", subject="Mira")]

    merged, added = merge_facts(existing, [new_fact("Mira's eyes are green.", subject="Mira")])

    # This pair is the contradiction the guard exists to catch, not a duplicate.
    assert added == 1
    assert len(merged) == 2


def test_a_contradiction_against_a_fact_nobody_established_is_ignored():
    facts = [new_fact("Mira's eyes are grey.")]
    payload = {
        "contradictions": [
            {"id": "not-a-real-id", "quote": "her green eyes", "why": "eyes changed colour"},
            {"id": facts[0]["id"], "quote": "her green eyes", "why": "eyes changed colour"},
            {"id": facts[0]["id"], "quote": "again", "why": "duplicate report"},
        ]
    }

    reports = parse_contradictions(payload, facts)

    assert len(reports) == 1
    assert reports[0]["fact"] == "Mira's eyes are grey."
    assert reports[0]["quote"] == "her green eyes"


def test_a_report_without_a_reason_is_not_worth_interrupting_for():
    facts = [new_fact("Mira's eyes are grey.")]

    assert parse_contradictions({"contradictions": [{"id": facts[0]["id"]}]}, facts) == []


def test_a_report_that_cannot_point_at_the_offending_words_is_dropped():
    facts = [new_fact("Mira's eyes are grey.")]
    passage = "*She turned, her green eyes catching the lamplight.*"
    payload = {
        "contradictions": [
            # A small model reporting a conflict it then explains away — seen in
            # the wild, and exactly the interruption nobody wants.
            {"id": facts[0]["id"], "quote": "", "why": "The passage does not mention eye colour."},
            # A quote the reply never contained.
            {"id": facts[0]["id"], "quote": "her blue eyes", "why": "eyes changed colour"},
        ]
    }

    assert parse_contradictions(payload, facts, passage) == []


def test_a_report_quoting_the_reply_survives_punctuation_and_asterisks():
    facts = [new_fact("Mira's eyes are grey.")]
    passage = "*She turned, her green eyes catching the lamplight.*"
    payload = {
        "contradictions": [
            {"id": facts[0]["id"], "quote": "her green eyes catching", "why": "grey, not green"}
        ]
    }

    assert len(parse_contradictions(payload, facts, passage)) == 1


def test_a_fenced_answer_from_a_chatty_model_is_still_read():
    raw = 'Sure! Here you go:\n```json\n{"contradictions": [], "facts": [{"text": "It rained."}]}\n```'

    payload = _parse_json_object(raw)

    assert payload is not None
    assert parse_facts(payload)[0]["text"] == "It rained."


def test_accepting_the_new_version_rewrites_the_fact():
    fact = new_fact("Mira's eyes are grey.")
    state = make_state(canon=[fact])

    assert apply_revision(state, fact["id"], "Mira's eyes are green.")
    assert state.canon[0]["text"] == "Mira's eyes are green."
    assert state.canon[0]["id"] == fact["id"]


def test_a_fact_the_story_retired_is_dropped_rather_than_kept_wrong():
    fact = new_fact("The lantern hangs by the door.")
    state = make_state(canon=[fact])

    assert apply_revision(state, fact["id"], "")
    assert state.canon == []


def test_the_correction_names_what_went_wrong_not_just_the_rule():
    note = build_continuity_note(
        [{"fact": "Mira's eyes are grey.", "quote": "her green eyes narrowed", "why": "colour"}]
    )

    assert "her green eyes narrowed" in note
    assert "Mira's eyes are grey." in note
    assert build_continuity_note([]) == ""


def test_a_restored_ledger_keeps_its_ids_so_pins_and_edits_survive():
    saved = [{"id": "abc123", "text": "Mira's eyes are grey.", "pinned": True, "subject": "Mira"}]

    restored = normalize_facts(saved + [{"text": "   "}, "not a fact", {"id": "abc123"}])

    assert len(restored) == 1
    assert restored[0]["id"] == "abc123"
    assert restored[0]["pinned"] is True


class FakeClient:
    """Stands in for the LLM, replaying one canned answer as a stream."""

    answer = ""

    def __init__(self, *args, **kwargs):
        pass

    async def stream_chat(self, messages, model=None, think=None):
        assert think is False, "side-tasks must not pay for a reasoning model's deliberation"
        for chunk in (FakeClient.answer[i : i + 7] for i in range(0, len(FakeClient.answer), 7)):
            yield chunk


def run_review(monkeypatch, state, answer, reply="Her green eyes narrowed."):
    FakeClient.answer = answer
    monkeypatch.setattr(continuity_module, "OllamaClient", FakeClient)
    return asyncio.run(review_reply(state, reply))


def test_a_reply_that_breaks_a_fact_is_reported_and_offers_the_new_version(monkeypatch):
    fact = new_fact("Mira's eyes are grey.")
    state = make_state(turns=6, canon=[fact], llm_model="test-model", llm_host="http://localhost")

    result = run_review(
        monkeypatch,
        state,
        json.dumps(
            {
                "contradictions": [
                    {
                        "id": fact["id"],
                        "quote": "Her green eyes narrowed",
                        "why": "Her eyes were established as grey.",
                        "revised": "Mira's eyes are green.",
                    }
                ],
                "facts": [{"subject": "Mira", "text": "Mira carries a brass key."}],
            }
        ),
    )

    assert result is not None
    assert result["contradictions"][0]["fact"] == "Mira's eyes are grey."
    assert result["contradictions"][0]["revised"] == "Mira's eyes are green."
    assert result["facts"][0]["text"] == "Mira carries a brass key."


def test_a_reply_that_honours_the_canon_interrupts_nobody(monkeypatch):
    state = make_state(
        turns=6,
        canon=[new_fact("Mira's eyes are grey.")],
        llm_model="test-model",
        llm_host="http://localhost",
    )

    result = run_review(monkeypatch, state, '{"contradictions": [], "facts": []}')

    assert result == {"contradictions": [], "facts": []}


def test_a_checking_model_that_answers_with_nonsense_is_ignored(monkeypatch):
    state = make_state(
        turns=6,
        canon=[new_fact("Mira's eyes are grey.")],
        llm_model="test-model",
        llm_host="http://localhost",
    )

    assert run_review(monkeypatch, state, "I'm sorry, I can't help with that.") is None


def test_nothing_is_checked_without_a_model():
    state = make_state(turns=6, llm_model=None, llm_host="http://localhost")

    assert asyncio.run(review_reply(state, "Anything at all.")) is None


def test_clearing_the_story_clears_what_it_established():
    state = make_state(canon=[new_fact("Mira's eyes are grey.")], canon_covered=8)
    state.continuity_alert = {"items": [{"fact_id": "x"}]}

    reset_canon(state)

    assert state.canon == []
    assert state.canon_covered == 0
    assert state.continuity_alert is None
    assert state.continuity_note == ""
