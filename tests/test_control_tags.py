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
