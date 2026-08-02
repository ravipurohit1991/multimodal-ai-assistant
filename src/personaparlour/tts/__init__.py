"""Text-to-Speech module"""

from personaparlour.tts.base import TTSAudio, TTSEngine
from personaparlour.tts.chatterbox import ChatterboxTTS
from personaparlour.tts.expression import (
    EMOTIONS,
    StreamingExpressionTracker,
    extract_expression,
    resolve_emotion,
)
from personaparlour.tts.neutts import NeuTTSEngine
from personaparlour.tts.piper import PiperTTS
from personaparlour.tts.soprano import SopranoTTS

__all__ = [
    "TTSEngine",
    "TTSAudio",
    "PiperTTS",
    "ChatterboxTTS",
    "SopranoTTS",
    "NeuTTSEngine",
    "EMOTIONS",
    "StreamingExpressionTracker",
    "extract_expression",
    "resolve_emotion",
]
