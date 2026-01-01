"""Text-to-Speech module"""

from aiassistant.tts.base import TTSAudio, TTSEngine
from aiassistant.tts.chatterbox import ChatterboxTTS
from aiassistant.tts.piper import PiperTTS
from aiassistant.tts.soprano import SopranoTTS

__all__ = ["TTSEngine", "TTSAudio", "PiperTTS", "ChatterboxTTS", "SopranoTTS"]
