"""Speech-to-Text module"""

from personaparlour.stt.base import STTEngine
from personaparlour.stt.whisper import WhisperSTT

__all__ = ["STTEngine", "WhisperSTT"]
