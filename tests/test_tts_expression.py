"""Routing the story's cues onto NeuTTS emotion tokens."""

import pytest

from personaparlour.tts.expression import (
    EMOTIONS,
    StreamingExpressionTracker,
    emotion_from_action,
    emotion_from_bare_tags,
    emotion_from_mood_tag,
    extract_expression,
    resolve_emotion,
    strip_expression_tags,
)


class TestResolveEmotion:
    def test_maps_canonical_names_to_themselves(self):
        for emotion in EMOTIONS:
            assert resolve_emotion(emotion) == emotion

    @pytest.mark.parametrize(
        "word,expected",
        [
            ("flirty", "happy"),
            ("delighted", "happy"),
            ("wistful", "sad"),
            ("heartbroken", "sad"),
            ("livid", "angry"),
            ("icy", "angry"),
            ("terrified", "fearful"),
            ("uneasy", "fearful"),
            ("stunned", "surprised"),
            ("appalled", "disgusted"),
            ("composed", "neutral"),
        ],
    )
    def test_maps_the_words_a_character_voice_actually_uses(self, word, expected):
        assert resolve_emotion(word) == expected

    def test_reads_past_a_qualifier(self):
        # "quietly furious" is a mood a model writes; "quietly" is not the feeling.
        assert resolve_emotion("quietly furious") == "angry"
        assert resolve_emotion("a little sad") == "sad"

    def test_is_case_and_punctuation_insensitive(self):
        assert resolve_emotion("  FURIOUS! ") == "angry"

    def test_unknown_words_route_nowhere(self):
        # Better a line spoken plainly than one spoken in the wrong feeling.
        assert resolve_emotion("peckish") is None
        assert resolve_emotion("") is None
        assert resolve_emotion(None) is None


class TestCueSources:
    def test_reads_the_hidden_mood_tag(self):
        assert emotion_from_mood_tag("[mood: wistful] She looks away.") == "sad"
        assert emotion_from_mood_tag("[emotion: furious]") == "angry"

    def test_last_mood_tag_wins(self):
        assert emotion_from_mood_tag("[mood: happy] ... [mood: terrified]") == "fearful"

    def test_reads_bare_paralinguistic_tags(self):
        assert emotion_from_bare_tags("[laugh] You cannot be serious.") == "happy"
        assert emotion_from_bare_tags("[sigh] Fine.") == "sad"
        assert emotion_from_bare_tags("[gasp]") == "surprised"

    def test_ignores_other_tag_families(self):
        # An image request is not a delivery cue, and must not be eaten as one.
        assert emotion_from_bare_tags("[IMAGE: a dark hallway]") is None
        assert emotion_from_mood_tag("[SCENE: time=night]") is None

    def test_reads_action_block_verbs(self):
        assert emotion_from_action("*she snarls, backing away*") == "angry"
        assert emotion_from_action("*He chuckles.*") == "happy"
        assert emotion_from_action("*she recoils*") == "disgusted"

    def test_ignores_cue_words_outside_action_blocks(self):
        # Dialogue about laughing is not a stage direction to laugh.
        assert emotion_from_action("I remember how she laughs at that.") is None


class TestStripping:
    def test_removes_cue_tags_but_keeps_the_words(self):
        assert strip_expression_tags("[mood: sad] I know.") == "I know."
        assert strip_expression_tags("[laugh] You're joking.") == "You're joking."

    def test_leaves_unrecognised_brackets_for_other_filters(self):
        # Routing must not silently swallow an image request.
        assert "[IMAGE: a lantern]" in strip_expression_tags("Look. [IMAGE: a lantern]")

    def test_extract_returns_speakable_text_and_emotion(self):
        spoken, emotion = extract_expression("[mood: furious] Get out.")
        assert spoken == "Get out."
        assert emotion == "angry"

    def test_precedence_prefers_the_explicit_mood_tag(self):
        _, emotion = extract_expression("[mood: sad] [laugh] *she grins*")
        assert emotion == "sad"

    def test_falls_through_to_action_prose(self):
        _, emotion = extract_expression("*she trembles* I'm fine.")
        assert emotion == "fearful"


class TestStreamingTracker:
    def feed(self, tracker, *deltas):
        for delta in deltas:
            tracker.process(delta)

    def test_starts_with_no_opinion(self):
        assert StreamingExpressionTracker().take() is None

    def test_mood_tag_is_sticky_across_phrases(self):
        tracker = StreamingExpressionTracker()
        self.feed(tracker, "[mood: wistful] ", "She looks away. ", "The rain keeps on.")
        assert tracker.take() == "sad"
        # Still sad on the next phrase: a standing mood is not consumed.
        assert tracker.take() == "sad"

    def test_action_cue_colours_one_phrase_then_yields(self):
        tracker = StreamingExpressionTracker()
        self.feed(tracker, "[mood: neutral] ", "*she laughs* ", "You're serious?")
        assert tracker.take() == "happy"
        assert tracker.take() == "neutral"

    def test_reassembles_a_tag_split_across_deltas(self):
        # Ollama streams roughly a token at a time, so tags arrive in pieces.
        tracker = StreamingExpressionTracker()
        self.feed(tracker, "[mo", "od: ter", "rified] ", "Don't move.")
        assert tracker.take() == "fearful"

    def test_reassembles_an_action_block_split_across_deltas(self):
        tracker = StreamingExpressionTracker()
        self.feed(tracker, "*she sn", "arls*", " Get back.")
        assert tracker.take() == "angry"

    def test_a_new_mood_outranks_a_cue_queued_before_it(self):
        tracker = StreamingExpressionTracker()
        self.feed(tracker, "*she laughs* ", "[mood: furious] ")
        assert tracker.take() == "angry"

    def test_peek_does_not_consume(self):
        tracker = StreamingExpressionTracker()
        self.feed(tracker, "*she gasps*")
        assert tracker.peek() == "surprised"
        assert tracker.peek() == "surprised"
        assert tracker.take() == "surprised"
        assert tracker.take() is None

    def test_default_seeds_the_standing_mood(self):
        assert StreamingExpressionTracker(default="melancholy").take() == "sad"

    def test_buffer_does_not_grow_without_bound(self):
        # An unterminated "*" early in a long reply must not pin the buffer.
        tracker = StreamingExpressionTracker()
        self.feed(tracker, "*never closed ", *["filler text " for _ in range(200)])
        assert len(tracker._buffer) <= tracker._MAX_BUFFER

    def test_ignores_prose_that_merely_mentions_a_feeling(self):
        tracker = StreamingExpressionTracker()
        self.feed(tracker, "He said he was angry about the price of bread.")
        assert tracker.take() is None
