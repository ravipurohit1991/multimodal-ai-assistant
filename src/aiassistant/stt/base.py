"""Base class for Speech-to-Text engines"""

from __future__ import annotations

from abc import ABC, abstractmethod


class STTEngine(ABC):
    """Abstract base class for STT engines"""

    @abstractmethod
    def transcribe_audio(self, audio_data: bytes, sample_rate: int = 16000) -> str:
        """
        Transcribe audio data to text.

        Args:
            audio_data: Raw PCM16LE audio bytes
            sample_rate: Audio sample rate in Hz

        Returns:
            Transcribed text
        """
        pass

    @abstractmethod
    def get_info(self) -> dict:
        """
        Get information about the STT engine.

        Returns:
            Dictionary with engine info (name, model, device, etc.)
        """
        pass
