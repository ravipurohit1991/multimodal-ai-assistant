"""Text-to-Speech module"""

from personaparlour.tts.base import TTSAudio, TTSEngine
from personaparlour.tts.chatterbox import ChatterboxTTS
from personaparlour.tts.piper import PiperTTS
from personaparlour.tts.soprano import SopranoTTS

__all__ = ["TTSEngine", "TTSAudio", "PiperTTS", "ChatterboxTTS", "SopranoTTS"]
