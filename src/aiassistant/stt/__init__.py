"""Speech-to-Text module"""

from aiassistant.stt.base import STTEngine
from aiassistant.stt.whisper import WhisperSTT

__all__ = ["STTEngine", "WhisperSTT"]
