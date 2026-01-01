"""Text processing utilities"""

from __future__ import annotations


def phrase_chunker(buffer: str) -> tuple[list[str], str]:
    """
    Split text buffer into ready-to-speak phrases and remaining buffer.

    This function enables "speak-early" behavior by splitting on sentence
    boundaries and also allows medium-length chunks.

    Args:
        buffer: Text buffer to process

    Returns:
        Tuple of (ready_chunks, remaining_buffer)
        - ready_chunks: List of complete phrases ready to synthesize
        - remaining_buffer: Text that should wait for more content
    """
    chunks = []
    working = buffer

    # Strong boundaries first (sentence endings)
    for sep in [". ", "? ", "! ", "\n"]:
        while sep in working:
            idx = working.find(sep)
            part = working[: idx + len(sep)].strip()
            if part:
                chunks.append(part)
            working = working[idx + len(sep) :]

    # If remaining text is still big, cut by word count
    words = working.split()
    if len(words) >= 18:
        part = " ".join(words[:18]).strip()
        rest = " ".join(words[18:]).strip()
        if part:
            chunks.append(part)
        working = rest

    return chunks, working
