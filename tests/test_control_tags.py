from aiassistant.control_tags import (
    StreamingHiddenTagFilter,
    find_animation_tag_body,
    parse_animation_tag,
    strip_animation_tags,
)


def stream(chunks):
    """Feed chunks through the display filter the way the WebSocket handler does."""
    filt = StreamingHiddenTagFilter()
    return "".join(filt.process(chunk) for chunk in chunks) + filt.flush()


def test_json_animation_tag_survives_nested_braces():
    text = 'She waves. [ANIM: {"gesture":"wave","pose":{"head":{"rotation":-8}}}] Then she smiles.'

    body = find_animation_tag_body(text)

    assert body is not None
    assert body.endswith("}}}")
    assert strip_animation_tags(text) == "She waves.  Then she smiles."


def test_every_animation_tag_is_stripped_from_stored_text():
    text = "[POSE: gesture=wave] Hello. [ACTION: posture=lean in] Bye."

    assert strip_animation_tags(text) == " Hello.  Bye."


def test_unterminated_animation_tag_does_not_leak_into_stored_text():
    assert strip_animation_tags("Hi [ANIM: gesture=wave") == "Hi "


def test_animation_values_are_clamped_and_unknown_bones_dropped():
    body = '{"intensity": 9, "duration": 99, "pose": {"Right Hand": {"rotation": 400}, "tail": {"rotation": 10}}}'

    directive = parse_animation_tag(body)

    assert directive["intensity"] == 1.0
    assert directive["duration"] == 8.0
    # "Right Hand" normalizes onto the rig's rightHand bone; "tail" has no bone.
    assert directive["pose"] == {"rightHand": {"rotation": 110.0}}


def test_key_value_animation_tag_is_parsed_without_json():
    directive = parse_animation_tag("emotion=curious; gesture=soft reach; intensity=0.4")

    assert directive["emotion"] == "curious"
    assert directive["gesture"] == "soft reach"
    assert directive["intensity"] == 0.4


def test_hidden_tags_are_filtered_across_chunk_boundaries():
    chunks = ["She grins. [mo", "od: happy] ", "Then ", "[IMAGE: a red ki", "te] done."]

    assert stream(chunks) == "She grins.  Then  done."


def test_ordinary_bracket_tags_are_preserved():
    assert stream(["She laughs ", "[laugh]", " softly."]) == "She laughs [laugh] softly."


def test_partial_hidden_prefix_at_end_of_stream_is_released():
    # The stream ends mid-candidate; flush must not swallow real prose.
    assert stream(["All done ", "[la"]) == "All done [la"


def test_streamed_json_animation_tag_is_hidden_entirely():
    chunks = ['Hi [ANIM: {"pose":{"head":', '{"rotation":-8}}}] there']

    assert stream(chunks) == "Hi  there"


# ----- Speaker prefixes ---------------------------------------------------
# A group reply is stored as "Mira: ..." so the model can track who spoke, and the
# model then copies that label into its own next reply. Left alone the transcript
# fills with "Mira: Mira: *she turns*".

from aiassistant.control_tags import (  # noqa: E402
    StreamingSpeakerPrefixFilter,
    strip_speaker_prefix,
)

CAST = ["Mira", "Tomas"]


def test_a_copied_speaker_label_is_removed():
    assert strip_speaker_prefix("Mira: *She turns.*", CAST) == "*She turns.*"
    assert strip_speaker_prefix("  Tomas : Ask her.", CAST) == "Ask her."
    assert strip_speaker_prefix("mira: fine.", CAST) == "fine."


def test_a_name_that_is_not_in_the_scene_is_left_alone():
    assert strip_speaker_prefix("Narrator: the storm broke.", CAST).startswith("Narrator:")
    assert strip_speaker_prefix("Mira: *She turns.*", []) == "Mira: *She turns.*"


def test_dialogue_that_merely_begins_with_a_name_is_not_touched():
    for reply in (
        '"Mira, don\'t." *He steps back.*',
        "*She looks up.* \"Tomas: that's what the ledger says.\"",
        "Mira had already gone.",
    ):
        assert strip_speaker_prefix(reply, CAST) == reply


def test_a_colon_inside_real_prose_is_not_mistaken_for_a_label():
    reply = "*She counts them off: three days, two boats, one road.*"
    assert strip_speaker_prefix(reply, CAST) == reply


def test_the_streaming_filter_removes_the_label_before_the_reader_sees_it():
    filter_ = StreamingSpeakerPrefixFilter(CAST)
    out = "".join(filter_.process(chunk) for chunk in ["Mi", "ra", ": *She", " turns.*"])
    out += filter_.flush()
    assert out == "*She turns.*"


def test_the_streaming_filter_passes_an_ordinary_reply_through_unchanged():
    filter_ = StreamingSpeakerPrefixFilter(CAST)
    chunks = ["*She ", "turns.* ", '"What letter?"']
    out = "".join(filter_.process(chunk) for chunk in chunks) + filter_.flush()
    assert out == "".join(chunks)


def test_the_streaming_filter_holds_nothing_back_in_a_solo_scene():
    filter_ = StreamingSpeakerPrefixFilter([])
    assert filter_.process("Mira: *She turns.*") == "Mira: *She turns.*"


def test_the_streaming_filter_releases_a_reply_shorter_than_a_label():
    filter_ = StreamingSpeakerPrefixFilter(CAST)
    held = filter_.process("Fine")
    assert held + filter_.flush() == "Fine"
