"""NeuTTS text-to-speech (https://github.com/neuphonic/neutts).

NeuTTS is a small speaker-cloning TTS stack: a language-model backbone predicts
NeuCodec acoustic tokens conditioned on a *reference voice* — three to fifteen
seconds of audio plus its transcript — and a codec decodes them to 24 kHz speech.

Two backbone families matter here, and they differ in a way that decides how
this engine behaves:

* ``neuphonic/neutts-2e`` takes **BPE** input and understands an emotion token
  (angry / disgusted / fearful / happy / neutral / sad / surprised), and ships
  four pre-encoded reference speakers. This is the default, because a roleplay
  that can only speak in one register stops being a performance.
* ``neutts-air`` and the ``neutts-nano`` family take **phonemes** — better plain
  narration and multilingual, but :meth:`NeuTTS._check_emotion` rejects the
  emotion argument outright, so those load with expression routing switched off.

Which cue drives the emotion on any given line is decided in
:mod:`personaparlour.tts.expression`, not here.
"""

from __future__ import annotations

import asyncio
import os
import re
import threading
from contextlib import contextmanager
from pathlib import Path

import numpy as np

from personaparlour.tts.base import TTSAudio, TTSEngine
from personaparlour.tts.expression import EMOTIONS, extract_expression
from personaparlour.utils import logger

# Reference audio the engine will pick up from the refs directory.
_AUDIO_EXTENSIONS = (".wav", ".flac", ".mp3", ".ogg", ".m4a")

# NeuTTS holds a 2048-token context that has to fit the reference codes, the
# reference transcript and the line being spoken. Long input is split rather
# than truncated, so a paragraph is never silently cut off mid-word.
_MAX_CHARS_PER_UTTERANCE = 320

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?…])\s+|(?<=[;:])\s+|\n+")

# What "auto" resolves to. Both are the same emotional model; the quantized one
# runs roughly four times faster on CPU and is the backend NeuTTS streams from,
# but it needs llama-cpp-python, which is a compiled dependency this project
# cannot assume. Measured here: ~4x slower than real time against ~12x.
_AUTO_BACKBONE_GGUF = "neuphonic/neutts-2e-q8-gguf"
_AUTO_BACKBONE_TORCH = "neuphonic/neutts-2e"


def _resolve_auto_backbone() -> str:
    """Pick the fastest backbone this installation can actually run."""
    try:
        import llama_cpp  # noqa: F401
    except ImportError:
        logger.info(
            f"NEUTTS_BACKBONE=auto -> {_AUTO_BACKBONE_TORCH} (torch). Install llama-cpp-python "
            "for the quantized backbone, which is about four times faster on CPU."
        )
        return _AUTO_BACKBONE_TORCH
    logger.info(f"NEUTTS_BACKBONE=auto -> {_AUTO_BACKBONE_GGUF} (llama-cpp available)")
    return _AUTO_BACKBONE_GGUF


def _looks_like_auth_failure(error: Exception) -> bool:
    """True when a load failed because of credentials rather than a bad name.

    A stale token in the Hugging Face cache makes public repos 401, and the hub
    reports that as "not a valid model identifier" — which sends you looking for
    a typo that is not there.
    """
    text = f"{type(error).__name__}: {error}".lower()
    return any(
        marker in text
        for marker in (
            "401",
            "unauthorized",
            "signature verification",
            "repositorynotfound",
            "is not a local folder",
            "authenticated",
            "gated",
        )
    )


@contextmanager
def _anonymous_hub():
    """Resolve Hugging Face downloads with no credentials for the duration.

    ``get_token()`` consults ``HF_TOKEN``, then ``HUGGING_FACE_HUB_TOKEN``, then
    the path in ``constants.HF_TOKEN_PATH`` — all read per call, so pointing that
    last one at a file that does not exist makes every library in the process
    (transformers, neucodec, the hub itself) fall back to anonymous access
    together. Scoped to a ``with`` block so a token that *is* valid keeps working
    for everything else the app loads.
    """
    from huggingface_hub import constants

    saved_env = {key: os.environ.pop(key, None) for key in ("HF_TOKEN", "HUGGING_FACE_HUB_TOKEN")}
    saved_path = constants.HF_TOKEN_PATH
    constants.HF_TOKEN_PATH = str(Path(saved_path).with_name("personaparlour-no-such-token"))
    try:
        yield
    finally:
        constants.HF_TOKEN_PATH = saved_path
        for key, value in saved_env.items():
            if value is not None:
                os.environ[key] = value


class NeuTTSEngine(TTSEngine):
    """NeuTTS engine with selectable reference voices and emotional delivery."""

    def __init__(
        self,
        backbone_repo: str = "auto",
        backbone_device: str = "cpu",
        codec_repo: str = "neuphonic/neucodec",
        codec_device: str = "cpu",
        ref_audio_dir: str | None = None,
        default_voice: str = "emily",
        target_sample_rate: int = 24000,
        temperature: float = 1.0,
        top_k: int = 50,
        language: str | None = None,
        seed: int | None = None,
        expressive: bool = True,
        transcriber=None,
    ):
        """
        Args:
            backbone_repo: HF repo (or local path) for the backbone. ``"auto"``
                picks the quantized emotional model when llama-cpp-python is
                installed and the torch one otherwise; name a repo to override.
            backbone_device: Torch device for the backbone ("cpu", "cuda", "mps").
            codec_repo: NeuCodec repo. ``neuphonic/neucodec-onnx-decoder`` is a
                CPU-only decode-only variant; it cannot encode new voices.
            codec_device: Torch device for the codec.
            ref_audio_dir: Directory of custom reference voices. Each ``name.wav``
                is paired with a ``name.txt`` transcript.
            default_voice: Voice loaded at startup.
            target_sample_rate: Output rate. NeuTTS is native 24 kHz; anything
                else costs a resample.
            temperature: Sampling temperature — higher is more varied delivery.
            top_k: Top-K sampling cutoff.
            language: eSpeak language code, only needed for a phoneme backbone
                loaded from a path the library cannot recognise.
            seed: Fixed seed for reproducible takes; ``None`` varies each line.
            expressive: Whether the scene's cues may set the emotion per line.
                Off speaks everything in the reference voice's own register.
            transcriber: Optional ``(path) -> str`` used to caption a reference
                clip that has no ``.txt`` beside it. Engine manager passes
                Whisper, so a dropped-in voice file works without hand-typing
                its transcript.
        """
        self.backbone_repo = (
            _resolve_auto_backbone()
            if str(backbone_repo).strip().lower() == "auto"
            else backbone_repo
        )
        self.backbone_device = backbone_device
        self.codec_repo = codec_repo
        self.codec_device = codec_device
        self.ref_audio_dir = Path(ref_audio_dir) if ref_audio_dir else None
        self.target_sample_rate = target_sample_rate
        self.temperature = temperature
        self.top_k = top_k
        self.language = language
        self.seed = seed
        self.expressive = expressive
        self._transcriber = transcriber

        self.model = None
        self.current_voice_name: str | None = None
        self._current_ref: tuple[object, str] | None = None
        # Encoding a reference costs a codec pass; a voice switched back and
        # forth mid-scene should not pay it twice.
        self._ref_cache: dict[str, tuple[object, str]] = {}
        self._builtin_voices: list[str] = []
        self._custom_voices: list[str] = []
        # The backbone is a single stateful graph; serialize calls so two
        # overlapping phrases cannot interleave inside it.
        self._lock = threading.Lock()

        logger.info(
            f"Initializing NeuTTS: {backbone_repo} (codec {codec_repo}) on {backbone_device}"
        )
        self._load_model()
        self._discover_voices()

        if not self.load_voice(default_voice):
            fallback = next(iter(self.list_voices()), None)
            if fallback and self.load_voice(fallback):
                logger.warning(f"NeuTTS voice '{default_voice}' unavailable; using '{fallback}'")
            else:
                logger.error("NeuTTS started with no usable reference voice")

    # ----- loading --------------------------------------------------------

    def _load_model(self) -> None:
        try:
            from neutts import NeuTTS
        except ImportError as e:
            raise ImportError(
                "NeuTTS is not installed. Install it with: pip install neutts\n"
                "  (GGUF backbones also need: pip install llama-cpp-python)"
            ) from e

        kwargs = {
            "backbone_repo": self.backbone_repo,
            "backbone_device": self.backbone_device,
            "codec_repo": self.codec_repo,
            "codec_device": self.codec_device,
            "seed": self.seed,
        }
        if self.language:
            kwargs["language"] = self.language

        try:
            self.model = NeuTTS(**kwargs)
        except Exception as e:
            if not _looks_like_auth_failure(e):
                raise
            logger.warning(
                f"NeuTTS could not read '{self.backbone_repo}' with the stored Hugging Face "
                f"credentials ({e}). The NeuTTS weights are public, so retrying anonymously. "
                "If this keeps happening the cached token is stale — refresh it with "
                "`hf auth login` (or log out) to silence this."
            )
            with _anonymous_hub():
                self.model = NeuTTS(**kwargs)

        self._promote_cpu_backbone_to_float32()

        is_bpe = getattr(self.model, "input_format", "phonemes") != "phonemes"
        emotions = getattr(self.model, "_supported_emotions", None)
        if emotions:
            self.supported_emotions: list[str] = sorted(set(emotions) & set(EMOTIONS))
        elif is_bpe:
            # A GGUF backbone only advertises its emotion list when the optional
            # `gguf` package is installed to read array metadata; without it the
            # list comes back empty from a model that does support emotions.
            # Assume the standard set — a token the vocab lacks is caught and
            # retried plainly at synthesis rather than losing expression outright.
            self.supported_emotions = sorted(EMOTIONS)
            logger.info(
                "NeuTTS backbone did not advertise its emotions; assuming the standard set. "
                "Install the `gguf` package to read them from the model instead."
            )
        else:
            self.supported_emotions = []
        self.supports_emotion = self.expressive and is_bpe and bool(self.supported_emotions)
        self.model_sample_rate = int(getattr(self.model, "sample_rate", 24000))

        logger.info(
            f"NeuTTS loaded: input_format={getattr(self.model, 'input_format', '?')}, "
            f"emotions={'/'.join(self.supported_emotions) or 'none'}, "
            f"sample_rate={self.model_sample_rate}Hz"
        )
        if not self.expressive:
            logger.info("NeuTTS expressive delivery disabled by config; speaking every line plain")
        elif not self.supports_emotion:
            logger.warning(
                f"'{self.backbone_repo}' takes no emotion token, so every line is spoken in the "
                "same register. Use a 'neuphonic/neutts-2e' backbone for emotional delivery."
            )

    def _promote_cpu_backbone_to_float32(self) -> None:
        """Cast a CPU torch backbone out of bfloat16.

        NeuTTS loads its torch backbones in bfloat16, which is the right choice
        on a GPU and the wrong one on most CPUs: without AMX there are no native
        bf16 matmul kernels, so every layer round-trips through emulation.
        Measured on this box, float32 generation runs about a quarter faster for
        identical output. GGUF backbones carry their own quantization and are
        left alone.
        """
        if self.model is None or getattr(self.model, "_is_quantized_model", False):
            return
        if "cpu" not in str(self.backbone_device).lower():
            return

        try:
            import torch

            backbone = self.model.backbone
            if next(backbone.parameters()).dtype is torch.bfloat16:
                self.model.backbone = backbone.float()
                logger.info("NeuTTS backbone cast to float32 for CPU inference")
        except Exception as e:  # pragma: no cover - purely an optimization
            logger.debug(f"Could not cast NeuTTS backbone to float32: {e}")

    # ----- voices ---------------------------------------------------------

    def _builtin_sample_dir(self) -> Path | None:
        """Locate the reference speakers bundled inside the installed wheel."""
        try:
            from neutts.neutts_2e import NeuTTS2E

            sample_dir = Path(NeuTTS2E.SAMPLE_DIR)
        except Exception:
            return None
        return sample_dir if sample_dir.is_dir() else None

    def _discover_voices(self) -> None:
        """Collect built-in speakers and any custom reference clips."""
        sample_dir = self._builtin_sample_dir()
        if sample_dir:
            # The bundled ".pt" files are NeuCodec codes, so they condition any
            # NeuTTS backbone that uses the same codec — not just neutts-2e.
            self._builtin_voices = sorted(
                path.stem
                for path in sample_dir.glob("*.pt")
                if (sample_dir / f"{path.stem}.txt").exists()
            )

        self._custom_voices = []
        if self.ref_audio_dir and self.ref_audio_dir.is_dir():
            seen: set[str] = set()
            for path in sorted(self.ref_audio_dir.iterdir()):
                if path.suffix.lower() in _AUDIO_EXTENSIONS and path.stem not in seen:
                    seen.add(path.stem)
                    self._custom_voices.append(path.stem)

        logger.info(
            f"NeuTTS voices: {len(self._builtin_voices)} built-in "
            f"({', '.join(self._builtin_voices) or 'none'}), "
            f"{len(self._custom_voices)} custom "
            f"({', '.join(self._custom_voices) or 'none'})"
        )

    def list_voices(self) -> list[str]:
        """All selectable voices: bundled speakers first, then custom clones."""
        return [*self._builtin_voices, *self._custom_voices]

    def _custom_audio_path(self, voice_name: str) -> Path | None:
        if not self.ref_audio_dir:
            return None
        for ext in _AUDIO_EXTENSIONS:
            candidate = self.ref_audio_dir / f"{voice_name}{ext}"
            if candidate.exists():
                return candidate
        return None

    def _reference_transcript(self, audio_path: Path) -> str | None:
        """Transcript beside the clip, transcribing it once if that is possible.

        NeuTTS conditions on the reference *text* as well as its audio, so a
        clone with the wrong transcript comes out slurred. A missing one is
        therefore a real failure, not something to paper over with a guess.
        """
        transcript_path = audio_path.with_suffix(".txt")
        if transcript_path.exists():
            text = transcript_path.read_text(encoding="utf-8", errors="replace").strip()
            if text:
                return text

        if self._transcriber is None:
            logger.error(
                f"Reference voice '{audio_path.stem}' has no transcript. Write what is said in "
                f"the clip to {transcript_path.name}, beside the audio."
            )
            return None

        try:
            text = (self._transcriber(str(audio_path)) or "").strip()
        except Exception as e:
            logger.error(f"Could not transcribe reference voice '{audio_path.stem}': {e}")
            return None

        if not text:
            logger.error(f"Transcription of reference voice '{audio_path.stem}' came back empty")
            return None

        try:
            transcript_path.write_text(text, encoding="utf-8")
            logger.info(
                f"Transcribed reference voice '{audio_path.stem}' -> {transcript_path.name}"
            )
        except OSError as e:
            logger.warning(f"Could not cache transcript for '{audio_path.stem}': {e}")
        return text

    def _resolve_voice(self, voice_name: str) -> tuple[object, str] | None:
        """Reference codes + transcript for *voice_name*, cached after first use."""
        if voice_name in self._ref_cache:
            return self._ref_cache[voice_name]

        resolved: tuple[object, str] | None = None

        if voice_name in self._builtin_voices:
            sample_dir = self._builtin_sample_dir()
            if sample_dir:
                import torch

                codes = torch.load(sample_dir / f"{voice_name}.pt")
                text = (sample_dir / f"{voice_name}.txt").read_text(encoding="utf-8").strip()
                resolved = (codes, text)
        else:
            audio_path = self._custom_audio_path(voice_name)
            if audio_path:
                transcript = self._reference_transcript(audio_path)
                if transcript:
                    logger.info(f"Encoding reference voice '{voice_name}' from {audio_path.name}")
                    codes = self.model.encode_reference(str(audio_path))  # type: ignore[union-attr]
                    resolved = (codes, transcript)

        if resolved:
            self._ref_cache[voice_name] = resolved
        return resolved

    def load_voice(self, voice_name: str) -> bool:
        """Select a reference voice by name."""
        if not voice_name:
            return False
        if voice_name == self.current_voice_name and self._current_ref is not None:
            return True

        try:
            resolved = self._resolve_voice(voice_name)
        except Exception as e:
            logger.error(f"Failed to load NeuTTS voice '{voice_name}': {e}", exc_info=True)
            return False

        if resolved is None:
            logger.error(f"NeuTTS voice not found: {voice_name}")
            return False

        self._current_ref = resolved
        self.current_voice_name = voice_name
        logger.info(f"NeuTTS voice loaded: {voice_name}")
        return True

    def get_voice_metadata(self, voice_name: str) -> dict:
        """Describe a voice for the picker — where it came from and how it reads."""
        builtin = voice_name in self._builtin_voices
        metadata: dict = {
            "engine": "neutts",
            "kind": "builtin" if builtin else "cloned",
            "supports_emotion": self.supports_emotion,
        }
        cached = self._ref_cache.get(voice_name)
        if cached:
            metadata["reference_text"] = str(cached[1])[:160]
        elif not builtin:
            audio_path = self._custom_audio_path(voice_name)
            if audio_path:
                metadata["reference_audio"] = audio_path.name
                metadata["has_transcript"] = audio_path.with_suffix(".txt").exists()
        return metadata

    # ----- synthesis ------------------------------------------------------

    @staticmethod
    def _split_utterances(text: str) -> list[str]:
        """Break text into pieces that fit the backbone's context.

        Splits on sentence boundaries first and only falls back to word-level
        packing for a single run-on sentence longer than the budget.
        """
        chunks: list[str] = []
        for sentence in _SENTENCE_SPLIT_RE.split(text):
            sentence = sentence.strip()
            if not sentence:
                continue
            if len(sentence) <= _MAX_CHARS_PER_UTTERANCE:
                if chunks and len(chunks[-1]) + len(sentence) + 1 <= _MAX_CHARS_PER_UTTERANCE:
                    chunks[-1] = f"{chunks[-1]} {sentence}"
                else:
                    chunks.append(sentence)
                continue

            current = ""
            for word in sentence.split():
                if current and len(current) + len(word) + 1 > _MAX_CHARS_PER_UTTERANCE:
                    chunks.append(current)
                    current = word
                else:
                    current = f"{current} {word}".strip()
            if current:
                chunks.append(current)
        return chunks

    def _resolve_emotion(self, emotion: str | None) -> str | None:
        """Keep only an emotion this backbone can actually take."""
        if not emotion or not self.supports_emotion:
            return None
        emotion = emotion.strip().lower()
        if emotion in ("", "neutral"):
            # NeuTTS treats neutral as "no token"; passing it through is the
            # same result with an extra chance of a vocab error.
            return None
        return emotion if emotion in self.supported_emotions else None

    def _synthesize_blocking(self, text: str, emotion: str | None) -> np.ndarray:
        """Run the backbone. Called on a worker thread, one caller at a time."""
        if self.model is None or self._current_ref is None:
            raise RuntimeError("NeuTTS engine has no model or reference voice loaded")

        ref_codes, ref_text = self._current_ref
        pieces: list[np.ndarray] = []

        with self._lock:
            for chunk in self._split_utterances(text):
                try:
                    wav = self._infer_chunk(chunk, ref_codes, ref_text, emotion)
                except ValueError as e:
                    # NeuTTS raises for an emotion the backbone will not take.
                    # A line spoken plainly beats a reply that dies mid-sentence,
                    # and disabling it here stops every later line paying the cost.
                    if emotion is None or "emotion" not in str(e).lower():
                        raise
                    logger.warning(
                        f"NeuTTS backbone rejected emotion '{emotion}' ({e}); "
                        "speaking plainly and disabling expression for this engine."
                    )
                    self.supports_emotion = False
                    emotion = None
                    wav = self._infer_chunk(chunk, ref_codes, ref_text, None)
                pieces.append(np.asarray(wav, dtype=np.float32).reshape(-1))

        if not pieces:
            return np.zeros(0, dtype=np.float32)
        if len(pieces) == 1:
            return pieces[0]
        # A short rest between sentences, so a split paragraph does not run together.
        gap = np.zeros(int(self.model_sample_rate * 0.12), dtype=np.float32)
        joined: list[np.ndarray] = []
        for index, piece in enumerate(pieces):
            if index:
                joined.append(gap)
            joined.append(piece)
        return np.concatenate(joined)

    def _infer_chunk(self, chunk: str, ref_codes, ref_text: str, emotion: str | None):
        return self.model.infer(
            chunk,
            ref_codes,
            ref_text,
            emotion=emotion,
            temperature=self.temperature,
            top_k=self.top_k,
        )

    def _to_pcm16(self, wav: np.ndarray) -> bytes:
        """Resample to the target rate if needed, then pack as PCM16LE."""
        if wav.size == 0:
            return b""

        if self.target_sample_rate != self.model_sample_rate:
            import librosa

            wav = librosa.resample(
                wav, orig_sr=self.model_sample_rate, target_sr=self.target_sample_rate
            )

        peak = float(np.abs(wav).max()) if wav.size else 0.0
        if peak > 1.0:
            wav = wav / peak
        return (np.clip(wav, -1.0, 1.0) * 32767.0).astype(np.int16).tobytes()

    async def synthesize(self, text: str, emotion: str | None = None, **kwargs) -> TTSAudio:
        """Speak *text*, optionally in a given emotion.

        Args:
            text: Line to speak. Any ``[mood: ...]`` or ``[laugh]``-style tag
                still present is read for delivery and removed before speaking.
            emotion: One of the backbone's supported emotions. Wins over
                anything found in the text; ignored by phoneme backbones.
            **kwargs: ``voice`` selects a reference voice for this line only.

        Returns:
            TTSAudio with PCM16LE at ``target_sample_rate``.
        """
        voice = kwargs.get("voice")
        if voice and voice != self.current_voice_name:
            self.load_voice(voice)

        spoken, tagged_emotion = extract_expression(text or "")
        spoken = spoken.strip()
        if not spoken:
            return TTSAudio(b"", self.target_sample_rate)

        resolved = self._resolve_emotion(emotion) or self._resolve_emotion(tagged_emotion)

        try:
            wav = await asyncio.to_thread(self._synthesize_blocking, spoken, resolved)
        except Exception as e:
            logger.error(f"NeuTTS synthesis failed: {e}", exc_info=True)
            raise

        return TTSAudio(self._to_pcm16(wav), self.target_sample_rate)

    # ----- introspection --------------------------------------------------

    def get_info(self) -> dict:
        return {
            "name": "NeuTTS",
            "backbone": self.backbone_repo,
            "codec": self.codec_repo,
            "current_voice": self.current_voice_name,
            "available_voices": self.list_voices(),
            "builtin_voices": list(self._builtin_voices),
            "cloned_voices": list(self._custom_voices),
            "ref_audio_dir": str(self.ref_audio_dir) if self.ref_audio_dir else None,
            "sample_rate": self.target_sample_rate,
            "model_sample_rate": self.model_sample_rate,
            "device": self.backbone_device,
            "input_format": getattr(self.model, "input_format", None),
            "supports_emotion": self.supports_emotion,
            "supported_emotions": list(self.supported_emotions),
            "temperature": self.temperature,
            "top_k": self.top_k,
        }

    def get_device_info(self) -> dict:
        loaded = self.model is not None
        memory_mb = 0.0
        if loaded and "cuda" in str(self.backbone_device):
            try:
                import torch

                if torch.cuda.is_available():
                    memory_mb = torch.cuda.memory_allocated() / (1024 * 1024)
            except Exception:
                pass
        return {
            "device": self.backbone_device,
            "loaded": loaded,
            "memory_allocated_mb": round(memory_mb, 1),
        }


__all__ = ["NeuTTSEngine"]
