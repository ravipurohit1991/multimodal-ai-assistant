"""Chatterbox TTS implementation"""

from pathlib import Path
from typing import List, Optional

import numpy as np
import torch
import torchaudio

from .base import TTSAudio, TTSEngine


class ChatterboxTTS(TTSEngine):
    """Chatterbox Text-to-Speech engine

    Chatterbox is a family of state-of-the-art, open-source TTS models by Resemble AI.
    This implementation supports:
    - Chatterbox-Turbo: 350M parameter model with paralinguistic tags ([laugh], [chuckle], etc.)
    - Chatterbox: Original 500M English model with CFG & exaggeration tuning
    - Chatterbox-Multilingual: 500M model supporting 23+ languages

    All models support zero-shot voice cloning from reference audio.
    """

    def __init__(
        self,
        model_type: str = "turbo",
        device: str = "cuda",
        ref_audio_dir: Optional[str] = None,
        default_ref_audio: Optional[str] = None,
        exaggeration: float = 0.5,
        cfg_weight: float = 0.5,
        target_sample_rate: int = 16000,
    ):
        """
        Initialize Chatterbox TTS engine.

        Args:
            model_type: Type of model to use ("turbo", "standard", or "multilingual")
            device: Device to run on ("cuda", "cpu", or "mps")
            ref_audio_dir: Directory containing reference audio files for voice cloning
            default_ref_audio: Path to default reference audio file
            exaggeration: Exaggeration control (0.0-1.0+, default 0.5). Higher = more expressive
            cfg_weight: CFG weight (0.0-1.0, default 0.5). Lower = slower, more deliberate pacing
            target_sample_rate: Target sample rate for output audio (default 16000)
        """
        self.model_type = model_type.lower()
        self.device = device
        self.ref_audio_dir = Path(ref_audio_dir) if ref_audio_dir else None
        self.current_ref_audio = default_ref_audio
        self.current_voice_name = None
        self.exaggeration = exaggeration
        self.cfg_weight = cfg_weight
        self.target_sample_rate = target_sample_rate
        self.model = None
        self._available_voices = []
        self._model_sample_rate = None

        print(f"Initializing Chatterbox TTS: {model_type} on {device}")
        self._load_model()

        # Scan for available reference audio files
        if self.ref_audio_dir and self.ref_audio_dir.exists():
            self._scan_reference_audio()

        # Auto-load default reference audio if provided
        if default_ref_audio and Path(default_ref_audio).exists():
            voice_name = Path(default_ref_audio).stem
            self.load_voice(voice_name)
            print(f"Default reference voice loaded: {voice_name}")
        elif self._available_voices:
            # Load first available voice if no default specified
            self.load_voice(self._available_voices[0])
            print(f"Auto-loaded first available voice: {self._available_voices[0]}")

    def _load_model(self):
        """Load the appropriate Chatterbox model"""
        try:
            if self.model_type == "turbo":
                from chatterbox.tts_turbo import ChatterboxTurboTTS

                self.model = ChatterboxTurboTTS.from_pretrained(device=self.device)
                self._model_sample_rate = self.model.sr
                print(f"Chatterbox Turbo loaded successfully on {self.device}!")
                print(f"   Sample rate: {self._model_sample_rate}Hz")

            elif self.model_type == "multilingual":
                from chatterbox.mtl_tts import ChatterboxMultilingualTTS

                self.model = ChatterboxMultilingualTTS.from_pretrained(device=self.device)  # type: ignore
                self._model_sample_rate = self.model.sr
                print(f"Chatterbox Multilingual loaded successfully on {self.device}!")
                print(f"   Sample rate: {self._model_sample_rate}Hz")

            elif self.model_type == "standard":
                from chatterbox.tts import ChatterboxTTS as ChatterboxStandardTTS

                self.model = ChatterboxStandardTTS.from_pretrained(device=self.device)
                self._model_sample_rate = self.model.sr
                print(f"Chatterbox Standard loaded successfully on {self.device}!")
                print(f"   Sample rate: {self._model_sample_rate}Hz")

            else:
                raise ValueError(
                    f"Unknown model_type: {self.model_type}. Use 'turbo', 'standard', or 'multilingual'"
                )

        except ImportError as e:
            print("Chatterbox library not found.")
            print("   Install with: pip install chatterbox-tts")
            print(f"   Error: {e}")
            raise
        except Exception as e:
            print(f"Error loading Chatterbox model: {e}")
            import traceback

            traceback.print_exc()
            raise

    def _scan_reference_audio(self):
        """Scan reference audio directory for available voices"""
        if not self.ref_audio_dir or not self.ref_audio_dir.exists():
            return

        audio_extensions = {".wav", ".mp3", ".flac", ".ogg", ".m4a"}
        for file in self.ref_audio_dir.iterdir():
            if file.suffix.lower() in audio_extensions and file.is_file():
                voice_name = file.stem
                if voice_name not in self._available_voices:
                    self._available_voices.append(voice_name)

        self._available_voices.sort()
        if self._available_voices:
            print(f"Found {len(self._available_voices)} reference audio files")

    def list_voices(self) -> List[str]:
        """List all available reference voices"""
        return self._available_voices.copy()

    def load_voice(self, voice_name: str) -> bool:
        """
        Load a specific reference voice.

        Args:
            voice_name: Name of the voice (filename without extension)

        Returns:
            True if successful, False otherwise
        """
        if not self.ref_audio_dir:
            print("No reference audio directory configured")
            return False

        # Try different audio extensions
        audio_extensions = [".wav", ".mp3", ".flac", ".ogg", ".m4a"]
        ref_audio_path = None

        for ext in audio_extensions:
            candidate = self.ref_audio_dir / f"{voice_name}{ext}"
            if candidate.exists():
                ref_audio_path = candidate
                break

        if not ref_audio_path:
            print(f"Reference audio not found: {voice_name}")
            return False

        print(f"Loading Chatterbox voice: {voice_name}")
        self.current_ref_audio = str(ref_audio_path)
        self.current_voice_name = voice_name

        if voice_name not in self._available_voices:
            self._available_voices.append(voice_name)
            self._available_voices.sort()

        print(f"Voice loaded: {voice_name}")
        return True

    async def synthesize(
        self, text: str, language_id: Optional[str] = None, emotion: str = "neutral", **kwargs
    ) -> TTSAudio:
        """
        Synthesize text to speech using Chatterbox TTS.

        Args:
            text: Text to synthesize. For Turbo model, can include paralinguistic tags:
                  [laugh], [chuckle], [cough], [gasp], etc.
            language_id: Language code for multilingual model (e.g., "en", "fr", "zh")
            emotion: Emotion parameter (kept for API compatibility, use tags for Turbo)
            **kwargs: Additional parameters:
                - exaggeration: Override default exaggeration (0.0-1.0+)
                - cfg_weight: Override default CFG weight (0.0-1.0)
                - audio_prompt_path: Override current reference audio

        Returns:
            TTSAudio with PCM16LE audio data at target_sample_rate
        """
        if not text.strip():
            # Return silence for empty text
            silence = np.zeros(int(self.target_sample_rate * 0.1), dtype=np.int16)  # 100ms
            return TTSAudio(silence.tobytes(), self.target_sample_rate)

        if not self.model:
            raise RuntimeError("Chatterbox model not loaded")

        # Get parameters
        audio_prompt_path = kwargs.get("audio_prompt_path", self.current_ref_audio)
        exaggeration = kwargs.get("exaggeration", self.exaggeration)
        cfg_weight = kwargs.get("cfg_weight", self.cfg_weight)

        try:
            # Generate audio based on model type
            if self.model_type == "turbo":
                # Turbo model doesn't use exaggeration/cfg_weight
                if audio_prompt_path:
                    wav = self.model.generate(text, audio_prompt_path=audio_prompt_path)  # type: ignore
                else:
                    wav = self.model.generate(text)  # type: ignore

            elif self.model_type == "multilingual":
                # Multilingual model requires language_id
                if not language_id:
                    language_id = "en"  # Default to English

                if audio_prompt_path:
                    wav = self.model.generate(
                        text,
                        language_id=language_id,  # type: ignore
                        audio_prompt_path=audio_prompt_path,
                        exaggeration=exaggeration,
                        cfg_weight=cfg_weight,
                    )
                else:
                    wav = self.model.generate(
                        text,
                        language_id=language_id,  # type: ignore
                        exaggeration=exaggeration,
                        cfg_weight=cfg_weight,
                    )

            else:  # standard
                # Standard model supports exaggeration and cfg_weight
                if audio_prompt_path:
                    wav = self.model.generate(  # type: ignore
                        text,
                        audio_prompt_path=audio_prompt_path,
                        exaggeration=exaggeration,
                        cfg_weight=cfg_weight,
                    )
                else:
                    wav = self.model.generate(  # type: ignore
                        text, exaggeration=exaggeration, cfg_weight=cfg_weight
                    )

            # Convert tensor to numpy if needed
            if torch.is_tensor(wav):
                wav = wav.cpu().numpy()

            # Ensure correct shape (should be 1D)
            if wav.ndim > 1:
                wav = wav.squeeze()

            # Resample if necessary
            if self._model_sample_rate != self.target_sample_rate:
                wav_tensor = torch.from_numpy(wav).float().unsqueeze(0)
                resampler = torchaudio.transforms.Resample(
                    orig_freq=self._model_sample_rate,  # type: ignore
                    new_freq=self.target_sample_rate,
                )
                wav_tensor = resampler(wav_tensor)
                wav = wav_tensor.squeeze().numpy()

            # Convert to int16 PCM
            if wav.dtype != np.int16:
                # Normalize to [-1, 1] if needed
                if wav.max() > 1.0 or wav.min() < -1.0:
                    wav = wav / np.abs(wav).max()
                # Convert to int16
                wav = (wav * 32767).astype(np.int16)

            pcm16le = wav.tobytes()
            return TTSAudio(pcm16le, self.target_sample_rate)

        except Exception as e:
            print(f"Error during Chatterbox synthesis: {e}")
            import traceback

            traceback.print_exc()
            raise

    def get_info(self) -> dict:
        """Get information about the Chatterbox TTS engine"""
        info = {
            "name": f"Chatterbox-{self.model_type.title()}",
            "model_type": self.model_type,
            "current_voice": self.current_voice_name,
            "current_ref_audio": self.current_ref_audio,
            "ref_audio_dir": str(self.ref_audio_dir) if self.ref_audio_dir else None,
            "available_voices": self._available_voices,
            "sample_rate": self.target_sample_rate,
            "model_sample_rate": self._model_sample_rate,
            "device": self.device,
            "exaggeration": self.exaggeration,
            "cfg_weight": self.cfg_weight,
        }

        if self.model_type == "turbo":
            info["supports_tags"] = True
            info["available_tags"] = ["[laugh]", "[chuckle]", "[cough]", "[gasp]", "[sigh]"]

        if self.model_type == "multilingual":
            info["supported_languages"] = [
                "ar",
                "da",
                "de",
                "el",
                "en",
                "es",
                "fi",
                "fr",
                "he",
                "hi",
                "it",
                "ja",
                "ko",
                "ms",
                "nl",
                "no",
                "pl",
                "pt",
                "ru",
                "sv",
                "sw",
                "tr",
                "zh",
            ]

        return info

    def get_device_info(self) -> dict:
        """Get device information for monitoring"""
        import torch

        device_name = self.device
        loaded = self.model is not None
        memory_mb = 0.0

        # Estimate memory usage
        if loaded and torch.cuda.is_available() and "cuda" in self.device:
            try:
                if self.model_type == "turbo":
                    memory_mb = 1500  # ~1.5GB for turbo
                elif self.model_type == "multilingual":
                    memory_mb = 2500  # ~2.5GB for multilingual
                else:
                    memory_mb = 2000  # ~2GB for standard
            except Exception:
                pass

        return {
            "device": device_name,
            "loaded": loaded,
            "memory_allocated_mb": memory_mb,
        }
