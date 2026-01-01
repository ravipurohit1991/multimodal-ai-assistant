"""Audio processing utilities"""

import numpy as np


def pcm16le_to_float32(pcm: bytes) -> np.ndarray:
    """
    Convert PCM16LE audio to float32 numpy array.

    Args:
        pcm: Raw PCM16LE audio bytes

    Returns:
        Float32 numpy array normalized to [-1.0, 1.0]
    """
    audio_i16 = np.frombuffer(pcm, dtype=np.int16)
    return audio_i16.astype(np.float32) / 32768.0
