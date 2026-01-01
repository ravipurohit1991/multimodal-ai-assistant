"""Whisper STT implementation using faster-whisper"""

from __future__ import annotations

import os

import numpy as np
import psutil
from faster_whisper import WhisperModel

from aiassistant.logger import logger
from aiassistant.stt.base import STTEngine


class WhisperSTT(STTEngine):
    """Whisper-based Speech-to-Text engine"""

    def __init__(
        self, model: str = "large-v3-turbo", device: str = "cuda", compute_type: str = "float16"
    ):
        """
        Initialize Whisper STT engine.

        Args:
            model: Whisper model name or local path to model directory
            device: Device to run on ("cuda" or "cpu")
            compute_type: Compute type ("float16", "int8", etc.)
        """
        self.model_name = model
        self.device = device
        self.compute_type = compute_type
        self._model: WhisperModel | None = None
        self._memory_footprint_mb = 0.0

        # Check if model is a local path
        self.is_local_path = os.path.exists(model) or os.path.isabs(model)

        logger.info(f"Initializing Whisper STT: {model} on {device} ({compute_type})")

    def _resolve_local_model_path(self, path: str) -> str:
        """
        Resolve HuggingFace cache directory structure to actual model path.
        If path points to models--org--name directory, find the latest snapshot.

        Args:
            path: Path to model directory

        Returns:
            Resolved path to actual model files
        """
        if not os.path.exists(path):
            return path

        # Check if this is a HuggingFace cache directory (contains snapshots/)
        snapshots_dir = os.path.join(path, "snapshots")
        if os.path.exists(snapshots_dir) and os.path.isdir(snapshots_dir):
            # Get all snapshot directories
            snapshots = [d for d in os.listdir(snapshots_dir) if os.path.isdir(os.path.join(snapshots_dir, d))]
            if snapshots:
                # Use the most recent snapshot (by modification time)
                latest_snapshot = max(snapshots, key=lambda d: os.path.getmtime(os.path.join(snapshots_dir, d)))
                resolved_path = os.path.join(snapshots_dir, latest_snapshot)
                logger.info(f"Resolved HuggingFace cache path to snapshot: {resolved_path}")
                return resolved_path

        return path

    def _get_model(self) -> WhisperModel:
        """Lazy load the Whisper model"""
        if self._model is None:
            import torch

            from aiassistant.utils import get_resource_monitor

            monitor = get_resource_monitor()

            # Resolve local path if needed (handle HuggingFace cache structure)
            model_path = self.model_name
            if self.is_local_path:
                model_path = self._resolve_local_model_path(self.model_name)

            # Check if loading from local path
            if self.is_local_path:
                logger.info(f"Loading Whisper model from local path: {model_path}")
            else:
                logger.info(f"Loading Whisper model from HuggingFace: {model_path}")

            # Measure memory before loading
            if self.device == "cuda" and torch.cuda.is_available():
                gpu_stats_before = monitor.get_gpu_stats(0)
                mem_before = gpu_stats_before.memory_used_mb if gpu_stats_before else 0.0
            else:
                system_stats = monitor.get_system_stats()
                mem_before = system_stats.process_ram_mb

            # Prepare loading parameters
            load_kwargs: dict = {
                "device": self.device,
                "compute_type": self.compute_type,
            }

            # Add local_files_only if loading from local path
            if self.is_local_path:
                load_kwargs["local_files_only"] = True

            # Load model
            self._model = WhisperModel(model_path, **load_kwargs)

            # Measure memory after loading
            if self.device == "cuda" and torch.cuda.is_available():
                torch.cuda.synchronize()
                mem_after = torch.cuda.memory_allocated() / (1024**2)
            else:
                mem_after = psutil.Process().memory_info().rss / (1024**2)

            self._memory_footprint_mb = mem_after - mem_before
            logger.info(f"Whisper model loaded ({self._memory_footprint_mb:.1f} MB)")
        return self._model

    @staticmethod
    def pcm16le_to_float32(pcm: bytes) -> np.ndarray:
        """Convert PCM16LE audio to float32 numpy array"""
        audio_i16 = np.frombuffer(pcm, dtype=np.int16)
        return audio_i16.astype(np.float32) / 32768.0

    def transcribe_audio(self, audio_data: bytes, sample_rate: int = 16000) -> str:
        """
        Transcribe audio data to text using Whisper.

        Args:
            audio_data: Raw PCM16LE audio bytes
            sample_rate: Audio sample rate in Hz (should be 16000)

        Returns:
            Transcribed text
        """
        model = self._get_model()
        audio = self.pcm16le_to_float32(audio_data)

        # faster-whisper expects 16kHz audio array
        segments, _info = model.transcribe(audio, language=None, vad_filter=True)
        text = "".join(seg.text for seg in segments).strip()
        return text

    def get_info(self) -> dict:
        """Get information about the Whisper STT engine"""
        return {
            "name": "Whisper",
            "model": self.model_name,
            "device": self.device,
            "compute_type": self.compute_type,
            "loaded": self._model is not None,
        }

    def get_device_info(self) -> dict:
        """Get device and memory information for Whisper model"""
        device_info = {
            "device": self.device,
            "loaded": self._model is not None,
            "memory_allocated_mb": self._memory_footprint_mb if self._model is not None else 0,
        }
        return device_info
