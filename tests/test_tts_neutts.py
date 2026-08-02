"""NeuTTSEngine logic that runs without loading a backbone.

The model itself is a ~500M-parameter download, so these exercise the parts that
decide *what* gets sent to it — utterance splitting, emotion gating, PCM
conversion — against an engine built without ``__init__``.
"""

import builtins
import sys
import types

import numpy as np
import pytest

from personaparlour.tts.base import TTSAudio
from personaparlour.tts.neutts import (
    _AUTO_BACKBONE_GGUF,
    _AUTO_BACKBONE_TORCH,
    _MAX_CHARS_PER_UTTERANCE,
    NeuTTSEngine,
    _anonymous_hub,
    _looks_like_auth_failure,
    _resolve_auto_backbone,
)


class FakeModel:
    """Stands in for neutts.NeuTTS, recording how it was called."""

    def __init__(self, sample_rate=24000):
        self.sample_rate = sample_rate
        self.calls: list[dict] = []

    def infer(self, text, ref_codes, ref_text, emotion=None, temperature=1.0, top_k=50):
        self.calls.append(
            {
                "text": text,
                "ref_text": ref_text,
                "emotion": emotion,
                "temperature": temperature,
                "top_k": top_k,
            }
        )
        # A tenth of a second of quiet tone, so lengths are checkable.
        return np.full(int(self.sample_rate * 0.1), 0.5, dtype=np.float32)


def make_engine(*, supports_emotion=True, sample_rate=24000, target=24000, expressive=True):
    engine = NeuTTSEngine.__new__(NeuTTSEngine)
    engine.model = FakeModel(sample_rate)
    engine.model_sample_rate = sample_rate
    engine.target_sample_rate = target
    engine.expressive = expressive
    engine.supports_emotion = supports_emotion and expressive
    engine.supported_emotions = ["angry", "disgusted", "fearful", "happy", "sad", "surprised"]
    engine.temperature = 1.0
    engine.top_k = 50
    engine.current_voice_name = "emily"
    engine._current_ref = (object(), "reference transcript")
    engine._builtin_voices = ["emily", "paul"]
    engine._custom_voices = ["brittney"]
    engine._ref_cache = {}
    engine.ref_audio_dir = None
    import threading

    engine._lock = threading.Lock()
    return engine


class TestUtteranceSplitting:
    def test_short_text_stays_one_utterance(self):
        assert NeuTTSEngine._split_utterances("Hello there.") == ["Hello there."]

    def test_packs_sentences_up_to_the_context_budget(self):
        chunks = NeuTTSEngine._split_utterances("One. Two. Three.")
        assert chunks == ["One. Two. Three."]

    def test_splits_a_long_passage_on_sentence_boundaries(self):
        sentence = "The lantern guttered against the glass and she said nothing at all. "
        chunks = NeuTTSEngine._split_utterances(sentence * 8)
        assert len(chunks) > 1
        assert all(len(c) <= _MAX_CHARS_PER_UTTERANCE for c in chunks)
        # Nothing is dropped: every sentence survives the split.
        assert " ".join(chunks).count("The lantern guttered") == 8

    def test_splits_a_run_on_sentence_without_cutting_a_word(self):
        run_on = " ".join(["word"] * 200)
        chunks = NeuTTSEngine._split_utterances(run_on)
        assert all(len(c) <= _MAX_CHARS_PER_UTTERANCE for c in chunks)
        assert " ".join(chunks).split() == run_on.split()

    def test_blank_text_yields_nothing(self):
        assert NeuTTSEngine._split_utterances("   \n  ") == []


class TestEmotionGating:
    def test_passes_through_a_supported_emotion(self):
        assert make_engine()._resolve_emotion("angry") == "angry"

    def test_neutral_becomes_no_token(self):
        # NeuTTS treats neutral as the absence of a token; sending it only adds
        # a chance of a vocab error for the same result.
        assert make_engine()._resolve_emotion("neutral") is None

    def test_unsupported_emotion_is_dropped(self):
        assert make_engine()._resolve_emotion("peckish") is None

    def test_phoneme_backbone_refuses_every_emotion(self):
        # NeuTTS raises outright if a phoneme model is handed an emotion.
        engine = make_engine(supports_emotion=False)
        assert engine._resolve_emotion("angry") is None

    def test_expressive_off_drops_emotions_on_a_capable_model(self):
        assert make_engine(expressive=False)._resolve_emotion("angry") is None


class TestSynthesize:
    @pytest.mark.asyncio
    async def test_speaks_text_and_reports_the_target_rate(self):
        engine = make_engine()
        audio = await engine.synthesize("Hello there.")
        assert isinstance(audio, TTSAudio)
        assert audio.sample_rate == 24000
        assert len(audio.pcm16le) == int(24000 * 0.1) * 2  # int16 == 2 bytes

    @pytest.mark.asyncio
    async def test_reads_delivery_out_of_the_text(self):
        engine = make_engine()
        await engine.synthesize("[mood: furious] Get out.")
        call = engine.model.calls[0]
        assert call["emotion"] == "angry"
        # The tag is routed, not spoken.
        assert call["text"] == "Get out."

    @pytest.mark.asyncio
    async def test_explicit_emotion_beats_the_tag_in_the_text(self):
        engine = make_engine()
        await engine.synthesize("[mood: happy] Get out.", emotion="angry")
        assert engine.model.calls[0]["emotion"] == "angry"

    @pytest.mark.asyncio
    async def test_empty_text_makes_no_call_and_no_audio(self):
        engine = make_engine()
        audio = await engine.synthesize("   ")
        assert audio.pcm16le == b""
        assert engine.model.calls == []

    @pytest.mark.asyncio
    async def test_text_that_is_only_a_tag_is_not_spoken(self):
        engine = make_engine()
        audio = await engine.synthesize("[mood: sad]")
        assert audio.pcm16le == b""
        assert engine.model.calls == []

    @pytest.mark.asyncio
    async def test_long_text_is_split_and_joined_with_a_gap(self):
        engine = make_engine()
        sentence = "The lantern guttered against the glass and she said nothing at all. "
        audio = await engine.synthesize(sentence * 8)
        assert len(engine.model.calls) > 1
        # Every piece, plus one 120ms rest between each neighbouring pair.
        pieces = len(engine.model.calls)
        expected = pieces * int(24000 * 0.1) + (pieces - 1) * int(24000 * 0.12)
        assert len(audio.pcm16le) == expected * 2

    @pytest.mark.asyncio
    async def test_resamples_when_the_target_rate_differs(self):
        engine = make_engine(sample_rate=24000, target=16000)
        audio = await engine.synthesize("Hello there.")
        assert audio.sample_rate == 16000
        # 100ms at 16kHz, within a sample or two of resampler edge handling.
        assert abs(len(audio.pcm16le) // 2 - 1600) <= 8

    @pytest.mark.asyncio
    async def test_sampling_knobs_reach_the_model(self):
        engine = make_engine()
        engine.temperature = 0.7
        engine.top_k = 20
        await engine.synthesize("Hello.")
        assert engine.model.calls[0]["temperature"] == 0.7
        assert engine.model.calls[0]["top_k"] == 20


class TestEmotionRejectionFallback:
    """A backbone that will not take a token must not kill the reply."""

    class RejectingModel(FakeModel):
        def infer(self, text, ref_codes, ref_text, emotion=None, temperature=1.0, top_k=50):
            if emotion is not None:
                raise ValueError(f"Emotion token <|{emotion.upper()}|> is not in the model vocab.")
            return super().infer(text, ref_codes, ref_text, None, temperature, top_k)

    @pytest.mark.asyncio
    async def test_retries_the_line_plainly(self):
        engine = make_engine()
        engine.model = self.RejectingModel()
        audio = await engine.synthesize("Get out.", emotion="angry")
        assert audio.pcm16le, "the line should still be spoken"

    @pytest.mark.asyncio
    async def test_stops_paying_the_cost_on_every_later_line(self):
        engine = make_engine()
        engine.model = self.RejectingModel()
        await engine.synthesize("Get out.", emotion="angry")
        assert engine.supports_emotion is False
        # The second line no longer attempts an emotion at all.
        engine.model.calls.clear()
        await engine.synthesize("Please leave.", emotion="sad")
        assert [c["emotion"] for c in engine.model.calls] == [None]

    @pytest.mark.asyncio
    async def test_unrelated_failures_still_surface(self):
        class BrokenModel(FakeModel):
            def infer(self, *args, **kwargs):
                raise ValueError("reference codes are malformed")

        engine = make_engine()
        engine.model = BrokenModel()
        with pytest.raises(ValueError, match="malformed"):
            await engine.synthesize("Hello.", emotion="angry")


class TestPcmConversion:
    def test_normalises_audio_that_clips(self):
        engine = make_engine()
        loud = np.array([2.0, -2.0, 1.0], dtype=np.float32)
        samples = np.frombuffer(engine._to_pcm16(loud), dtype=np.int16)
        assert samples.max() <= 32767
        assert samples.min() >= -32768
        assert abs(int(samples[0])) > 32000  # scaled, not simply flattened

    def test_empty_audio_yields_empty_bytes(self):
        assert make_engine()._to_pcm16(np.zeros(0, dtype=np.float32)) == b""


class TestVoiceListing:
    def test_lists_builtin_speakers_before_cloned_ones(self):
        assert make_engine().list_voices() == ["emily", "paul", "brittney"]

    def test_metadata_marks_where_a_voice_came_from(self):
        engine = make_engine()
        assert engine.get_voice_metadata("emily")["kind"] == "builtin"
        assert engine.get_voice_metadata("brittney")["kind"] == "cloned"


class TestAutoBackbone:
    """ "auto" must land on the fastest backbone the install can actually run."""

    def test_prefers_the_quantized_build_when_llama_cpp_is_importable(self, monkeypatch):
        monkeypatch.setitem(sys.modules, "llama_cpp", types.ModuleType("llama_cpp"))
        assert _resolve_auto_backbone() == _AUTO_BACKBONE_GGUF

    def test_falls_back_to_torch_without_llama_cpp(self, monkeypatch):
        real_import = builtins.__import__

        def refuse_llama_cpp(name, *args, **kwargs):
            if name == "llama_cpp":
                raise ImportError("No module named 'llama_cpp'")
            return real_import(name, *args, **kwargs)

        monkeypatch.delitem(sys.modules, "llama_cpp", raising=False)
        monkeypatch.setattr(builtins, "__import__", refuse_llama_cpp)
        assert _resolve_auto_backbone() == _AUTO_BACKBONE_TORCH

    def test_both_choices_are_emotional_backbones(self):
        # The whole point of the default is expressive delivery; a phoneme model
        # resolved here would silently drop it.
        assert "2e" in _AUTO_BACKBONE_GGUF
        assert "2e" in _AUTO_BACKBONE_TORCH


class TestAuthFallback:
    @pytest.mark.parametrize(
        "error",
        [
            OSError(
                "neuphonic/neutts-2e is not a local folder and is not a valid model identifier"
            ),
            OSError("401 Client Error. OAuth token signature verification failed"),
            RuntimeError("RepositoryNotFoundError: not found"),
        ],
    )
    def test_recognises_a_credentials_problem(self, error):
        # A stale token makes public repos 401, which the hub reports as a bad
        # repo name — the retry only fires when that is what actually happened.
        assert _looks_like_auth_failure(error)

    def test_leaves_real_failures_alone(self):
        assert not _looks_like_auth_failure(RuntimeError("CUDA out of memory"))
        assert not _looks_like_auth_failure(ImportError("No module named 'llama_cpp'"))

    def test_anonymous_hub_restores_credentials_afterwards(self, monkeypatch):
        from huggingface_hub import constants, utils

        monkeypatch.setenv("HF_TOKEN", "hf_original")
        original_path = constants.HF_TOKEN_PATH

        with _anonymous_hub():
            assert utils.get_token() is None

        assert constants.HF_TOKEN_PATH == original_path
        assert utils.get_token() == "hf_original"
