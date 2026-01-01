"""Piper TTS implementation"""

from __future__ import annotations

import json
import os

import numpy as np
import torch
from piper import PiperVoice

from aiassistant.tts.base import TTSAudio, TTSEngine
from aiassistant.utils import get_resource_monitor, logger


class PiperTTS(TTSEngine):
    """Piper-based Text-to-Speech engine"""

    def __init__(
        self,
        voices_dir: str,
        default_voice: str = "en_GB-jenny_dioco-medium",
        use_cuda: bool = True,
    ):
        """
        Initialize Piper TTS engine.

        Args:
            voices_dir: Directory containing voice model files
            default_voice: Default voice to load
            use_cuda: Whether to use CUDA acceleration for Piper
        """
        self.voices_dir = voices_dir
        self.current_voice_name = None
        self.voice = None
        self.use_cuda = use_cuda
        self._memory_footprint_mb = 0.0

        # Load default voice
        if self.load_voice(default_voice):
            logger.info(f"Piper TTS initialized with voice: {default_voice}")
        else:
            logger.warning(f"Default voice {default_voice} not found")

    def list_voices(self) -> list[str]:
        """List all available .onnx voice models"""
        if not os.path.exists(self.voices_dir):
            return []
        voices = []
        for file in os.listdir(self.voices_dir):
            if file.endswith(".onnx"):
                voices.append(file.replace(".onnx", ""))
        return sorted(voices)

    def load_voice(self, voice_name: str) -> bool:
        """Load a specific voice model"""
        voice_path = os.path.join(self.voices_dir, f"{voice_name}.onnx")
        if not os.path.exists(voice_path):
            logger.error(f"Voice not found: {voice_path}")
            return False

        monitor = get_resource_monitor()
        logger.info(f"Loading Piper TTS voice: {voice_name}")

        # Measure memory before loading
        if self.use_cuda and torch.cuda.is_available():
            gpu_stats_before = monitor.get_gpu_stats(0)
            mem_before = gpu_stats_before.memory_used_mb if gpu_stats_before else 0.0
        else:
            system_stats = monitor.get_system_stats()
            mem_before = system_stats.process_ram_mb

        # Load voice
        self.voice = PiperVoice.load(voice_path, use_cuda=self.use_cuda)
        self.current_voice_name = voice_name

        # Measure memory after loading
        if self.use_cuda and torch.cuda.is_available():
            gpu_stats_after = monitor.get_gpu_stats(0)
            mem_after = gpu_stats_after.memory_used_mb if gpu_stats_after else 0.0
        else:
            system_stats = monitor.get_system_stats()
            mem_after = system_stats.process_ram_mb

        self._memory_footprint_mb = max(0.0, mem_after - mem_before)
        logger.info(
            f"Voice loaded! Sample rate: {self.voice.config.sample_rate}Hz ({self._memory_footprint_mb:.1f} MB)"
        )
        return True

    async def synthesize(self, text: str, emotion: str = "neutral", **kwargs) -> TTSAudio:
        """
        Synthesize text to speech using Piper TTS.

        Args:
            text: Text to synthesize
            emotion: Emotion parameter (not used by Piper, but kept for API compatibility)
            **kwargs: Additional parameters

        Returns:
            TTSAudio with PCM16 audio data
        """
        if not text.strip():
            # Return silence for empty text
            silence = np.zeros(1600, dtype=np.int16)  # 100ms of silence at 16kHz
            return TTSAudio(silence.tobytes(), 16000)

        if not self.voice:
            raise RuntimeError("No voice loaded")

        # Synthesize using Piper - returns iterator of AudioChunks
        result = self.voice.synthesize(text)

        # Collect all audio chunks
        chunks = []
        for chunk in result:
            chunks.append(chunk.audio_int16_bytes)

        pcm16le = b"".join(chunks)

        return TTSAudio(pcm16le, self.voice.config.sample_rate)

    def get_voice_metadata(self, voice_name: str) -> dict:
        """Get metadata for a specific voice"""
        json_file = os.path.join(self.voices_dir, f"{voice_name}.onnx.json")
        if os.path.exists(json_file):
            try:
                with open(json_file, "r") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def get_info(self) -> dict:
        """Get information about the Piper TTS engine"""
        info = {
            "name": "Piper",
            "current_voice": self.current_voice_name,
            "voices_dir": self.voices_dir,
            "available_voices": self.list_voices(),
        }
        return info

    def get_device_info(self) -> dict:
        """Get device and memory information for Piper TTS"""
        device = "cuda" if self.use_cuda else "cpu"
        device_info = {
            "device": device,
            "loaded": self.voice is not None,
            "memory_allocated_mb": self._memory_footprint_mb if self.voice is not None else 0,
        }
        return device_info
