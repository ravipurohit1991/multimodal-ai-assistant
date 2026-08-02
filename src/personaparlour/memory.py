"""
Story Memory — a rolling, LLM-written record of everything that has scrolled out
of the model's working context.

Long roleplays outgrow a local model's context window. Without help there are
only two outcomes: resend the whole transcript every turn (slow, and eventually
truncated by the inference server anyway), or let the oldest turns fall off
silently, at which point the character forgets promises, injuries, and names.

Story Memory closes that gap. Older turns are periodically folded into a
compact "story so far" written by the model itself; that record is injected as
one system block while only the most recent exchanges are sent verbatim. The
canonical history in ``ConnState.messages`` is never mutated — memory only
changes what a single turn's prompt looks like — so the visible conversation,
swipes, and edits all keep working exactly as before.
"""

from __future__ import annotations

import re

from personaparlour.llm import get_chat_client
from personaparlour.prompts import build_memory_summary_messages
from personaparlour.utils import logger

# Tuning defaults. `keep_recent` is how many recent messages always reach the
# model word-for-word; `trigger` is how many messages must pile up *beyond* that
# window before an automatic summarization pass is worth its latency.
DEFAULT_KEEP_RECENT = 12
DEFAULT_TRIGGER = 20
MIN_KEEP_RECENT = 4
MAX_KEEP_RECENT = 60
MIN_TRIGGER = 4
MAX_TRIGGER = 100

# Hard ceiling on a generated summary, so a runaway model can never grow the
# memory block until it crowds out the conversation it is supposed to support.
MAX_SUMMARY_CHARS = 6000

# The contract asks for at most about 400 words. This is the server-side ceiling
# behind that ask: the char guard below only stops reading, whereas this stops
# the model generating, so a runaway pass costs seconds instead of minutes.
SUMMARY_TOKEN_CEILING = 1600

# Upkeep is background work with no user waiting on it, but it must not stall
# forever either: LLM streams are opened without a timeout, so a wedged server
# would otherwise hold the slot and quietly disable memory for the session.
PASS_TIMEOUT_SECONDS = 300


def conversation_messages(state) -> list[dict]:
    """The user/assistant turns only — the same view the memory cursor indexes."""
    return [m for m in state.messages if m.get("role") in ("user", "assistant")]


def memory_cursor(state, history_len: int) -> int:
    """How many of the newest-first ``history_len`` turns the summary covers.

    Clamped on every read because the frontend can rewind, delete, or re-sync
    the history underneath a cursor that was recorded against a longer story.
    At least the latest turn always survives verbatim.
    """
    covered = int(getattr(state, "memory_covered", 0) or 0)
    return max(0, min(covered, max(0, history_len - 1)))


def keep_recent(state) -> int:
    value = int(getattr(state, "memory_keep_recent", DEFAULT_KEEP_RECENT) or DEFAULT_KEEP_RECENT)
    return max(MIN_KEEP_RECENT, min(MAX_KEEP_RECENT, value))


def trigger_after(state) -> int:
    value = int(getattr(state, "memory_trigger", DEFAULT_TRIGGER) or DEFAULT_TRIGGER)
    return max(MIN_TRIGGER, min(MAX_TRIGGER, value))


def pending_count(state) -> int:
    """Messages old enough to summarize that the memory does not cover yet."""
    history = conversation_messages(state)
    boundary = len(history) - keep_recent(state)
    return max(0, boundary - memory_cursor(state, len(history)))


def should_summarize(state) -> bool:
    """Whether enough has happened to justify an automatic memory pass."""
    if not getattr(state, "memory_enabled", False):
        return False
    return pending_count(state) >= trigger_after(state)


def build_memory_block(state) -> str:
    """Render the running memory into one grounding system block.

    Returns "" when memory is off or nothing has been summarized yet, so a short
    conversation costs exactly what it did before this feature existed.
    """
    if not getattr(state, "memory_enabled", False):
        return ""
    summary = (getattr(state, "memory_summary", "") or "").strip()
    if not summary:
        return ""
    return (
        "[Story so far — established events from earlier in this conversation "
        "that are no longer shown in full below. Treat every line as something "
        "that has already happened and stay consistent with it. Do not recap, "
        "quote, or mention this record; continue from the most recent messages.]\n" + summary
    )


def _format_turn(message: dict, user_name: str, char_name: str) -> str:
    """One transcript line, attributed by name so the summary reads as a story."""
    role = message.get("role")
    content = str(message.get("content", "")).strip()
    if not content:
        return ""
    if role == "user":
        speaker = user_name or "User"
    else:
        # Group scenes already store replies as "Name: text"; leave those alone.
        if re.match(r"^[^\n:]{1,40}:\s", content):
            return content
        speaker = char_name or "Character"
    return f"{speaker}: {content}"


def render_transcript(messages: list[dict], user_name: str, char_name: str) -> str:
    lines = [_format_turn(m, user_name, char_name) for m in messages]
    return "\n\n".join(line for line in lines if line)


def _clean_summary(raw: str) -> str:
    """Strip the wrappers small models like to add around a plain-prose answer."""
    text = raw.strip()
    fence = re.match(r"^```[a-zA-Z]*\s*\n(.*?)\n?```$", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    text = re.sub(
        r"^(?:updated\s+)?(?:story\s+)?memory\s*(?:summary)?\s*:\s*", "", text, flags=re.IGNORECASE
    )
    return text.strip()[:MAX_SUMMARY_CHARS]


async def summarize_story(state, *, force: bool = False) -> tuple[str, int] | None:
    """Fold newly-aged turns into the memory.

    Returns ``(summary, covered)`` for the caller to store, or ``None`` when
    there is nothing worth summarizing (or no model to do it with). ``force``
    runs a pass triggered by the user even if the automatic threshold has not
    been reached yet.
    """
    history = conversation_messages(state)
    cursor = memory_cursor(state, len(history))
    boundary = len(history) - keep_recent(state)
    if boundary <= cursor:
        return None
    if not force and (boundary - cursor) < trigger_after(state):
        return None
    if not state.llm_model:
        logger.warning("Story memory skipped: no LLM model selected")
        return None

    char_name = getattr(state, "char_name", "") or ""
    user_name = getattr(state, "user_name", "") or ""
    transcript = render_transcript(history[cursor:boundary], user_name, char_name)
    if not transcript.strip():
        # Nothing but empty turns aged out — advance past them without spending
        # a generation, so the same blank window is not re-examined forever.
        return getattr(state, "memory_summary", "") or "", boundary

    messages = build_memory_summary_messages(
        getattr(state, "memory_summary", "") or "",
        transcript,
        char_name,
        user_name,
    )

    raw = ""
    client = get_chat_client(state.llm_host, state.llm_model)
    async for delta in client.stream_chat(
        messages, model=state.llm_model, options={"num_predict": SUMMARY_TOKEN_CEILING}
    ):
        raw += delta
        if len(raw) > MAX_SUMMARY_CHARS * 2:
            break

    summary = _clean_summary(raw)
    if not summary:
        logger.warning("Story memory pass returned nothing usable; keeping previous memory")
        return None

    logger.info(
        f"Story memory updated: {boundary - cursor} turns folded in "
        f"({len(summary)} chars, covering {boundary} of {len(history)} messages)"
    )
    return summary, boundary


def reset_memory(state) -> None:
    """Forget the running record (a cleared chat, a wipe, or the user's request)."""
    state.memory_summary = ""
    state.memory_covered = 0
