"""Base class for Text-to-Speech engines"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class TTSAudio:
    """Container for TTS audio output"""

    pcm16le: bytes
    sample_rate: int


class TTSEngine(ABC):
    """Abstract base class for TTS engines"""

    @abstractmethod
    async def synthesize(self, text: str, **kwargs) -> TTSAudio:
        """
        Synthesize text to speech.

        Args:
            text: Text to synthesize
            **kwargs: Additional engine-specific parameters

        Returns:
            TTSAudio object containing PCM16LE audio data
        """
        pass

    @abstractmethod
    def list_voices(self) -> list[str]:
        """
        List available voices.

        Returns:
            List of voice names
        """
        pass

    @abstractmethod
    def load_voice(self, voice_name: str) -> bool:
        """
        Load a specific voice.

        Args:
            voice_name: Name of the voice to load

        Returns:
            True if successful, False otherwise
        """
        pass

    @abstractmethod
    def get_info(self) -> dict:
        """
        Get information about the TTS engine.

        Returns:
            Dictionary with engine info (name, current_voice, sample_rate, etc.)
        """
        pass
