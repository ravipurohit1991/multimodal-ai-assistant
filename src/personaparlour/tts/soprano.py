"""Soprano TTS implementation"""

import os
from pathlib import Path
from typing import List, Optional

import numpy as np
import torch

from .base import TTSAudio, TTSEngine


class SopranoTTS(TTSEngine):
    """Soprano Text-to-Speech engine

    Soprano is an ultra-lightweight, open-source TTS model designed for
    real-time, high-fidelity speech synthesis at unprecedented speed.

    Features:
    - Only 80M parameters with ~2000× real-time factor (RTF)
    - High-fidelity 32 kHz audio output
    - Ultra-low latency streaming (<15 ms)
    - Vocoder-based neural decoder (Vocos architecture)
    - State-of-the-art neural audio codec (~15 tokens/sec at 0.2 kbps)
    - Sentence-level streaming for infinite context

    Note: Requires CUDA-enabled GPU. CPU support coming in future updates.
    """

    def __init__(
        self,
        device: str = "cuda",
        backend: str = "auto",
        cache_size_mb: int = 10,
        decoder_batch_size: int = 1,
        target_sample_rate: int = 16000,
        temperature: float = 0.7,
        top_p: float = 0.95,
        repetition_penalty: float = 1.0,
        model_dir: Optional[str] = None,
    ):
        """
        Initialize Soprano TTS engine.

        Args:
            device: Device to run on ("cuda" required, CPU support coming soon)
            backend: Inference backend ("auto", "lmdeploy", or "transformers")
            cache_size_mb: Cache size in MB for inference optimization (default: 10)
            decoder_batch_size: Decoder batch size for speed optimization (default: 1)
            target_sample_rate: Target sample rate for output audio (default: 16000)
            temperature: Sampling temperature (0.0-1.0+, default: 0.7)
            top_p: Nucleus sampling parameter (0.0-1.0, default: 0.95)
            repetition_penalty: Repetition penalty (1.0+, default: 1.0)
            model_dir: Directory containing local model files for caching
        """
        self.device = device
        self.backend = backend
        self.cache_size_mb = cache_size_mb
        self.decoder_batch_size = decoder_batch_size
        self.target_sample_rate = target_sample_rate
        self.temperature = temperature
        self.top_p = top_p
        self.repetition_penalty = repetition_penalty
        self.model_dir = Path(model_dir) if model_dir else None
        self.model = None
        self._model_sample_rate = None
        self.current_voice_name = "soprano-default"  # For API compatibility

        print(f"Initializing Soprano TTS on {device}")
        if self.model_dir:
            print(f"Using local model directory: {self.model_dir}")
        self._load_model()

    def _load_model(self):
        """Load the Soprano TTS model"""
        try:
            # Set custom cache directory if specified
            if self.model_dir:
                self.model_dir.mkdir(parents=True, exist_ok=True)
                os.environ["HF_HOME"] = str(self.model_dir)
                os.environ["HUGGINGFACE_HUB_CACHE"] = str(self.model_dir / "hub")
                print(f"HuggingFace cache: {os.environ['HUGGINGFACE_HUB_CACHE']}")

            from soprano import SopranoTTS as SopranoModel

            backend_to_use = self.backend

            # Try loading with the specified backend
            try:
                self.model = SopranoModel(
                    backend=backend_to_use,
                    device=self.device,
                    cache_size_mb=self.cache_size_mb,
                    decoder_batch_size=self.decoder_batch_size,
                )
            except (AssertionError, RuntimeError) as e:
                error_msg = str(e)
                # If LMDeploy fails due to missing CUDA_PATH or other issues, fallback to transformers
                if "CUDA_PATH" in error_msg or "lmdeploy" in error_msg.lower():
                    if backend_to_use == "auto":
                        print(
                            "LMDeploy backend not available (missing CUDA_PATH), falling back to transformers..."
                        )
                        backend_to_use = "transformers"
                        self.model = SopranoModel(
                            backend=backend_to_use,
                            device=self.device,
                            cache_size_mb=self.cache_size_mb,
                            decoder_batch_size=self.decoder_batch_size,
                        )
                    else:
                        raise
                else:
                    raise

            # Soprano outputs at 32 kHz
            self._model_sample_rate = 32000

            print(f"Soprano TTS loaded successfully on {self.device}!")
            print(f"   Backend: {backend_to_use}")
            print(f"   Cache size: {self.cache_size_mb} MB")
            print(f"   Decoder batch size: {self.decoder_batch_size}")
            print(f"   Model sample rate: {self._model_sample_rate}Hz")
            print(f"   Target output rate: {self.target_sample_rate}Hz")

        except ImportError as e:
            raise ImportError(
                "Soprano TTS not installed. Install with: pip install soprano-tts\n"
                "Note: Soprano requires CUDA GPU and PyTorch 2.8.0 with CUDA 12.6"
            ) from e
        except Exception as e:
            error_msg = f"Failed to load Soprano TTS: {e}"
            raise RuntimeError(error_msg) from e

    async def synthesize(self, text: str, **kwargs) -> TTSAudio:
        """
        Synthesize text to speech using Soprano TTS.

        Args:
            text: Text to synthesize (works best with sentences 2-15 seconds long)
            **kwargs: Additional parameters (temperature, top_p, repetition_penalty)

        Returns:
            TTSAudio with PCM16 audio data at target_sample_rate
        """
        if not text.strip():
            # Return silence for empty text
            silence = np.zeros(int(self.target_sample_rate * 0.1), dtype=np.int16)  # 100ms silence
            return TTSAudio(silence.tobytes(), self.target_sample_rate)

        if not self.model:
            raise RuntimeError("Soprano model not loaded")

        # Extract custom parameters or use defaults
        temperature = kwargs.get("temperature", self.temperature)
        top_p = kwargs.get("top_p", self.top_p)
        repetition_penalty = kwargs.get("repetition_penalty", self.repetition_penalty)

        try:
            # Generate audio using Soprano
            # Note: Soprano infer() returns a torch tensor
            audio_tensor = self.model.infer(
                text, temperature=temperature, top_p=top_p, repetition_penalty=repetition_penalty
            )

            # Convert tensor to numpy array if needed
            if isinstance(audio_tensor, torch.Tensor):
                audio_np = audio_tensor.cpu().numpy()
            else:
                audio_np = np.array(audio_tensor)

            # Ensure audio is 1D
            if audio_np.ndim > 1:
                audio_np = audio_np.squeeze()

            # Soprano outputs float32 in range [-1, 1], convert to int16
            if audio_np.dtype == np.float32 or audio_np.dtype == np.float64:
                audio_np = (audio_np * 32767.0).astype(np.int16)
            elif audio_np.dtype != np.int16:
                audio_np = audio_np.astype(np.int16)

            # Resample if needed (from 32kHz to target_sample_rate)
            if self._model_sample_rate != self.target_sample_rate:
                audio_np = self._resample(
                    audio_np,
                    self._model_sample_rate,  # type: ignore
                    self.target_sample_rate,
                )

            # Convert to bytes
            pcm16le = audio_np.tobytes()

            return TTSAudio(pcm16le, self.target_sample_rate)

        except Exception as e:
            print(f"Soprano synthesis error: {e}")
            raise RuntimeError(f"Soprano TTS synthesis failed: {e}") from e

    def _resample(self, audio: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
        """
        Resample audio from orig_sr to target_sr using torchaudio.

        Args:
            audio: Input audio array (int16)
            orig_sr: Original sample rate
            target_sr: Target sample rate

        Returns:
            Resampled audio array (int16)
        """
        try:
            import torchaudio

            # Convert to float32 tensor for resampling
            audio_float = torch.from_numpy(audio.astype(np.float32) / 32767.0)

            # Add channel dimension if needed
            if audio_float.ndim == 1:
                audio_float = audio_float.unsqueeze(0)

            # Resample
            resampler = torchaudio.transforms.Resample(orig_freq=orig_sr, new_freq=target_sr)
            audio_resampled = resampler(audio_float)

            # Convert back to int16
            audio_resampled = (audio_resampled.squeeze().numpy() * 32767.0).astype(np.int16)

            return audio_resampled

        except ImportError:
            # Fallback to simple linear interpolation if torchaudio not available
            print("torchaudio not available, using simple resampling")
            return self._simple_resample(audio, orig_sr, target_sr)

    def _simple_resample(self, audio: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
        """
        Simple linear interpolation resampling fallback.

        Args:
            audio: Input audio array (int16)
            orig_sr: Original sample rate
            target_sr: Target sample rate

        Returns:
            Resampled audio array (int16)
        """
        duration = len(audio) / orig_sr
        target_length = int(duration * target_sr)
        indices = np.linspace(0, len(audio) - 1, target_length)
        return np.interp(indices, np.arange(len(audio)), audio).astype(np.int16)

    def list_voices(self) -> List[str]:
        """
        List available voices.

        Note: Current Soprano version doesn't support multiple voices.
        Returns a single default voice.

        Returns:
            List with single default voice
        """
        return ["soprano-default"]

    def load_voice(self, voice_name: str) -> bool:
        """
        Load a specific voice.

        Note: Current Soprano version doesn't support voice selection.
        This method is provided for API compatibility.

        Args:
            voice_name: Name of the voice (ignored)

        Returns:
            True if model is loaded, False otherwise
        """
        if self.model is None:
            print("Soprano model not loaded")
            return False

        if voice_name != "soprano-default":
            print("Soprano doesn't support custom voices. Using default voice.")

        return True

    def get_info(self) -> dict:
        """Get information about the Soprano TTS engine"""
        info = {
            "engine": "Soprano TTS",
            "version": "1.0",
            "description": "Ultra-lightweight, ultra-fast TTS with 80M parameters",
            "device": self.device,
            "backend": self.backend,
            "cache_size_mb": self.cache_size_mb,
            "decoder_batch_size": self.decoder_batch_size,
            "model_sample_rate": self._model_sample_rate,
            "target_sample_rate": self.target_sample_rate,
            "parameters": {
                "temperature": self.temperature,
                "top_p": self.top_p,
                "repetition_penalty": self.repetition_penalty,
            },
            "features": [
                "80M parameters",
                "~2000× real-time factor",
                "32 kHz high-fidelity audio",
                "Ultra-low latency (<15 ms streaming)",
                "Vocoder-based decoder (Vocos)",
                "Sentence-level streaming",
            ],
            "limitations": [
                "No voice cloning support (yet)",
                "No multilingual support (yet)",
                "CUDA GPU required (CPU support coming)",
                "Works best with 2-15 second sentences",
            ],
            "tips": [
                "Convert numbers to words (1+1 -> 'one plus one')",
                "Use proper grammar and contractions",
                "Avoid multiple spaces or improper formatting",
                "Regenerate if unsatisfied (stochastic sampling)",
            ],
        }

        if self.model:
            info["status"] = "loaded"
            info["available_voices"] = self.list_voices()
        else:
            info["status"] = "not loaded"

        return info

    def get_device_info(self) -> dict:
        """Get device information for monitoring"""
        import torch

        device_name = self.device
        loaded = self.model is not None
        memory_mb = 0.0

        # Estimate memory usage for Soprano
        if loaded and torch.cuda.is_available() and "cuda" in self.device:
            try:
                # Soprano is ~80M params, roughly 500-800MB with cache
                memory_mb = 500 + (self.cache_size_mb * 10)  # Approximate
            except Exception:
                pass

        return {
            "device": device_name,
            "loaded": loaded,
            "memory_allocated_mb": memory_mb,
        }
