"""Text-to-Speech module"""

from aiassistant.tts.base import TTSAudio, TTSEngine
from aiassistant.tts.piper import PiperTTS

__all__ = ["TTSEngine", "TTSAudio", "PiperTTS"]
