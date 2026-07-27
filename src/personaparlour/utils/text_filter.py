"""
Streaming Text Filter for TTS
Filters out formatted text (like *actions* and (context)) from a streaming text source.
"""


class StreamingTextFilter:
    """
    Stateful filter for streaming text that removes formatted blocks
    like *actions*, **bold**, (parentheses), and [brackets].
    """

    def __init__(self):
        self.buffer = ""
        self.in_asterisk = False  # *...*
        self.in_double_asterisk = False  # **...**
        self.in_parentheses = False  # (...)
        self.in_bracket = False  # [...]

        # Regex for identifying start/end of blocks
        # We need to handle them carefully in a stream

    def process(self, chunk: str) -> str:
        """
        Process a chunk of text and return the clean, speakable part.
        Updates internal state.
        """
        self.buffer += chunk
        return self._process_state_machine()

    def _process_state_machine(self) -> str:
        result = ""
        i = 0
        n = len(self.buffer)

        while i < n:
            # Lookahead check: if we are at the last character and it's a potential special char start,
            # we might need to wait for more data to decide (e.g. * vs **).

            # Special case: potential ** start
            # If we see *, and we are at the end, wait.
            if not self._any_block_active() and self.buffer[i] == "*" and i == n - 1:
                break  # Stop processing, keep this * in buffer for next chunk

            char = self.buffer[i]

            # Check for block starts
            if not self._any_block_active():
                if char == "*" and i + 1 < n and self.buffer[i + 1] == "*":
                    self.in_double_asterisk = True
                    i += 2
                    continue
                elif char == "*":
                    self.in_asterisk = True
                    i += 1
                    continue
                elif char == "(":
                    self.in_parentheses = True
                    i += 1
                    continue
                elif char == "[":
                    self.in_bracket = True
                    i += 1
                    continue
                else:
                    # Normal character
                    result += char
                    i += 1
                    continue

            # Inside Double Asterisk **...**
            elif self.in_double_asterisk:
                # Need to check for closing **
                # If we see *, and we are at the end, wait.
                if char == "*" and i == n - 1:
                    break

                if char == "*" and i + 1 < n and self.buffer[i + 1] == "*":
                    self.in_double_asterisk = False
                    i += 2
                    continue
                else:
                    i += 1
                    continue

            # Inside Asterisk *...*
            elif self.in_asterisk:
                if char == "*":
                    self.in_asterisk = False
                    i += 1
                    continue
                else:
                    i += 1
                    continue

            # Inside Parentheses (... )
            elif self.in_parentheses:
                if char == ")":
                    self.in_parentheses = False
                    i += 1
                    continue
                else:
                    i += 1
                    continue

            # Inside Brackets [...]
            elif self.in_bracket:
                if char == "]":
                    self.in_bracket = False
                    i += 1
                    continue
                else:
                    i += 1
                    continue

        # Update buffer to keep only unprocessed part
        self.buffer = self.buffer[i:]
        return result

    def _any_block_active(self):
        return self.in_asterisk or self.in_double_asterisk or self.in_parentheses or self.in_bracket

    def flush(self) -> str:
        """
        Return any remaining text that might be valid if the stream ends.
        Note: If we are inside an open block (e.g. *action), we discard it because it's formatted.
        If we are just buffering a potential marker that turned out to be nothing?
        E.g. "2 *" -> ends. We should probably output "2 *".
        However, for TTS "cleaner", dropping incomplete formatted blocks is usually safer than speaking nonsense.
        Current logic: whatever is in buffer is either:
        1. A trailing * that we were waiting on.
        2. Content inside an open block (which we consumed up to i).

        Wait, my `_process_state_machine` consumes "inside block" chars.
        So `self.buffer` only contains characters we STOPPED at (like trailing *).

        If `self.buffer` has content, it's likely a trailing `*` or similar that we paused on.
        If we flush, we should just correct it and output it.
        """
        res = self.buffer
        self.buffer = ""
        # Reset state
        self.in_asterisk = False
        self.in_double_asterisk = False
        self.in_parentheses = False
        self.in_bracket = False
        return res
