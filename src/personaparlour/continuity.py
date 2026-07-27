"""
Continuity Guard — the story's canon, and a check that each new reply honours it.

Local models forget. Not dramatically, but in the small way that quietly ruins a
long roleplay: the grey eyes turn green, the character who left the room answers
a question, the knife that was thrown is back on the belt, someone knows a name
they were never told. By the time you notice, the contradiction is fifteen turns
back and baked into the story.

This module keeps a *canon* — a short ledger of durable facts the story has
established — and uses it twice:

* **Before the reply.** The canon is injected as one compact system block
  (``build_canon_block``), so most contradictions never get written at all. This
  is the half that does the real work; the check below is the safety net.
* **After the reply.** One background pass (``review_reply``) reads the new
  passage against the ledger and reports hard conflicts, while harvesting any
  durable new facts the passage established. Both jobs share a single generation,
  because a local model's time is the scarcest thing in the room.

Nothing here mutates the conversation. A contradiction is *reported*, never
silently fixed: the story is the user's, and the three ways out — reroll the
reply, accept the new version as canon, or wave it through — are all theirs to
pick. The ledger itself is plain text and fully editable, so a fact the model got
wrong is a one-line correction rather than an argument.
"""

from __future__ import annotations

import json
import re
import uuid

from personaparlour.llm import OllamaClient
from personaparlour.memory import conversation_messages, render_transcript
from personaparlour.prompts import (
    build_canon_harvest_messages,
    build_continuity_review_messages,
)
from personaparlour.utils import logger

# Ledger limits. The canon is meant to stay a page of facts, not a second
# transcript: a ledger that grows without bound would crowd out the story it is
# supposed to protect, and give the checking model more to misread.
MAX_FACTS = 80
MAX_FACT_CHARS = 220
MAX_SUBJECT_CHARS = 40
# How many facts reach the prompt (canon block and check payload). Pinned facts
# always make the cut; the rest is the most recently established.
CANON_PROMPT_LIMIT = 40

# A check is background work nobody is waiting on, but a wedged inference server
# must not hold the slot forever and quietly disable the guard for the session.
REVIEW_TIMEOUT_SECONDS = 180
HARVEST_TIMEOUT_SECONDS = 300

# Generation ceilings — a runaway model is cut off rather than trusted.
MAX_REVIEW_CHARS = 4000
MAX_HARVEST_CHARS = 8000

# Appended for the one retry after a model answers in prose instead of JSON.
RETRY_REMINDER = (
    "Your previous answer was not valid JSON. Answer again with the JSON object "
    "alone — no explanation, no markdown fence, no text before or after it. If "
    "there is nothing to report, the correct answer is "
    '{"contradictions":[],"facts":[]}.'
)


# ----- The ledger ---------------------------------------------------------


def _clean_text(value: object, limit: int) -> str:
    """Collapse a model- or user-supplied string into one tidy line."""
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value).strip()[:limit]


def new_fact(text: str, *, subject: str = "", turn: int = 0, pinned: bool = False) -> dict:
    """Mint one canon entry. Ids are short and opaque — the model quotes them back."""
    return {
        "id": uuid.uuid4().hex[:8],
        "subject": _clean_text(subject, MAX_SUBJECT_CHARS),
        "text": _clean_text(text, MAX_FACT_CHARS),
        "turn": max(0, int(turn or 0)),
        "pinned": bool(pinned),
    }


def normalize_fact(raw: object) -> dict | None:
    """Coerce one entry from the model, a saved story, or the UI into a fact.

    Returns ``None`` for anything without usable text, so a malformed entry is
    dropped rather than poisoning the ledger with a blank line.
    """
    if not isinstance(raw, dict):
        return None
    text = _clean_text(raw.get("text") or raw.get("fact"), MAX_FACT_CHARS)
    if not text:
        return None
    fact = new_fact(
        text,
        subject=str(raw.get("subject") or ""),
        turn=raw.get("turn") or 0,
        pinned=bool(raw.get("pinned")),
    )
    # Preserve an existing id so edits, pins, and contradiction reports keep
    # pointing at the same entry across a save/load round trip.
    existing_id = raw.get("id")
    if isinstance(existing_id, str) and re.fullmatch(r"[a-zA-Z0-9_-]{1,16}", existing_id):
        fact["id"] = existing_id
    return fact


def normalize_facts(raw: object) -> list[dict]:
    """Sanitize a whole ledger, dropping duplicates and anything unusable."""
    if not isinstance(raw, list):
        return []
    facts: list[dict] = []
    seen: set[str] = set()
    for entry in raw:
        fact = normalize_fact(entry)
        if not fact:
            continue
        key = _fact_key(fact["text"])
        if key in seen:
            continue
        seen.add(key)
        facts.append(fact)
    return facts[:MAX_FACTS]


def _normalize(text: str) -> str:
    """Letters, digits and single spaces — the form two phrasings are compared in."""
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


# Words that carry no identifying weight when deciding whether two sentences are
# saying the same thing. Kept small on purpose: the goal is to ignore grammar,
# not content.
_FILLER_WORDS = frozenset(
    """a an and are as at be been but by for from had has have he her hers him his in into is it
    its of on or she that the their them they this to was were with""".split()
)


def _significant_words(fact: dict) -> set[str]:
    """The content words of a fact, subject included, for near-duplicate matching."""
    words = _normalize(f"{fact.get('subject', '')} {fact.get('text', '')}").split()
    return {w for w in words if w not in _FILLER_WORDS and len(w) > 1}


def _fact_key(text: str) -> str:
    """A loose identity for a fact, so an exact restatement is never stored twice."""
    return _normalize(text)


def _says_the_same_thing(a: set[str], b: set[str]) -> bool:
    """Whether two facts are restatements of each other rather than two facts.

    Models re-offer what they already established, in slightly different words
    every time ("Tomas drowned two winters ago" / "he drowned two winters ago and
    is dead"). Comparing content words by containment catches that, while leaving
    genuinely different claims about the same subject apart — "Mira's eyes are
    grey" and "Mira's eyes are green" overlap too little to be merged, which is
    exactly right: that pair is a contradiction, not a duplicate.
    """
    if not a or not b:
        return False
    shared = len(a & b)
    return shared / min(len(a), len(b)) >= 0.75


def merge_facts(existing: list[dict], incoming: list[dict]) -> tuple[list[dict], int]:
    """Add genuinely new facts to the ledger; returns the ledger and how many landed.

    When the ledger is full the oldest *unpinned* facts give way. Pinned entries
    are the user saying "this one matters" and are never evicted — if everything
    is pinned, the ledger simply stops growing.
    """
    merged = list(existing)
    seen = {_fact_key(f.get("text", "")) for f in merged}
    signatures = [_significant_words(f) for f in merged]
    added = 0
    for fact in incoming:
        key = _fact_key(fact.get("text", ""))
        if not key or key in seen:
            continue
        signature = _significant_words(fact)
        if any(_says_the_same_thing(signature, existing_words) for existing_words in signatures):
            continue
        seen.add(key)
        signatures.append(signature)
        merged.append(fact)
        added += 1

    if len(merged) > MAX_FACTS:
        overflow = len(merged) - MAX_FACTS
        for index, fact in enumerate(list(merged)):
            if overflow <= 0:
                break
            if not fact.get("pinned"):
                merged[index] = None  # type: ignore[call-overload]
                overflow -= 1
        merged = [f for f in merged if f]
    return merged, added


def rebuild_canon(existing: list[dict], harvested: list[dict]) -> tuple[list[dict], int]:
    """Replace the ledger with a fresh reading of the whole story.

    A harvest has just read everything, so what it returns *is* the canon — folding
    it into the old ledger only produces two wordings of every fact, since a model
    never phrases the same detail the same way twice. Pinned facts are the
    exception: those are the user's, and they survive any rebuild.
    """
    kept = [fact for fact in existing if fact.get("pinned")]
    return merge_facts(kept, harvested)


def canon_facts(state) -> list[dict]:
    return list(getattr(state, "canon", []) or [])


def prompt_facts(state) -> list[dict]:
    """The slice of the ledger that reaches the model: pinned first, then recent."""
    facts = canon_facts(state)
    if len(facts) <= CANON_PROMPT_LIMIT:
        return facts
    pinned = [f for f in facts if f.get("pinned")]
    rest = [f for f in facts if not f.get("pinned")]
    room = max(0, CANON_PROMPT_LIMIT - len(pinned))
    keep = pinned + rest[-room:] if room else pinned[:CANON_PROMPT_LIMIT]
    # Preserve the ledger's own ordering so the block reads as one list.
    keep_ids = {f["id"] for f in keep}
    return [f for f in facts if f["id"] in keep_ids]


def render_fact(fact: dict) -> str:
    subject = fact.get("subject", "")
    text = fact.get("text", "")
    return f"{subject}: {text}" if subject else text


def build_canon_block(state) -> str:
    """Render the canon into one grounding system block.

    Returns "" when the guard is off or nothing has been established yet, so a
    fresh story costs exactly what it did before this feature existed.
    """
    if not getattr(state, "continuity_enabled", False):
        return ""
    facts = prompt_facts(state)
    if not facts:
        return ""
    lines = "\n".join(f"- {render_fact(fact)}" for fact in facts)
    return (
        "[Story canon — details this story has already established. Every line is "
        "true and stays true. Write the next reply so none of them is broken; if a "
        "line is inconvenient, work around it rather than quietly changing it.]\n" + lines
    )


def reset_canon(state) -> None:
    """Forget everything the story established (a cleared chat, or the user's ask)."""
    state.canon = []
    state.canon_covered = 0
    state.continuity_alert = None
    state.continuity_note = ""


# ----- Reading the model's answer ----------------------------------------


def _parse_json_object(raw: str) -> dict | None:
    """Pull the first JSON object out of a reply, tolerating fences and preamble."""
    text = raw.strip()
    fence = re.match(r"^```[a-zA-Z]*\s*\n(.*?)\n?```$", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    start = text.find("{")
    if start == -1:
        return None
    try:
        parsed, _ = json.JSONDecoder().raw_decode(text[start:])
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


def parse_contradictions(payload: dict, facts: list[dict], passage: str = "") -> list[dict]:
    """Keep only reports that name a real fact and quote real words from the reply.

    A false alarm is worse than a miss here: it interrupts a story that was fine,
    and teaches the reader to ignore the guard. Small models offer plenty of them
    — an invented fact id, a hallucinated quote, and (seen in the wild) a
    "contradiction" whose own explanation says nothing was contradicted. Requiring
    the quoted words to actually appear in the passage rejects all three, because
    a model that cannot point at the offending text has not found anything.
    """
    by_id = {fact["id"]: fact for fact in facts}
    haystack = _normalize(passage)
    reports: list[dict] = []
    seen: set[str] = set()
    for raw in payload.get("contradictions") or []:
        if not isinstance(raw, dict):
            continue
        fact = by_id.get(str(raw.get("id", "")).strip())
        if not fact or fact["id"] in seen:
            continue
        why = _clean_text(raw.get("why"), 200)
        quote = _clean_text(raw.get("quote"), 200)
        if not why or not quote:
            continue
        if haystack and _normalize(quote) not in haystack:
            logger.debug(
                f"Continuity report dropped: quoted words are not in the reply ({quote!r})"
            )
            continue
        seen.add(fact["id"])
        reports.append(
            {
                "fact_id": fact["id"],
                "fact": render_fact(fact),
                "quote": quote,
                "why": why,
                "revised": _clean_text(raw.get("revised"), MAX_FACT_CHARS),
            }
        )
    return reports


def parse_facts(payload: dict, *, turn: int = 0) -> list[dict]:
    """Turn the model's harvested facts into ledger entries."""
    facts: list[dict] = []
    for raw in payload.get("facts") or []:
        if isinstance(raw, str):
            raw = {"text": raw}
        fact = normalize_fact({**raw, "turn": turn}) if isinstance(raw, dict) else None
        if fact:
            fact["id"] = uuid.uuid4().hex[:8]  # freshly established, freshly identified
            facts.append(fact)
    return facts


# ----- The passes ---------------------------------------------------------


async def _generate(state, messages: list[dict], ceiling: int) -> str:
    """Run one auxiliary pass, with the model's deliberation switched off.

    Both jobs here ask for a few lines of JSON, and a reasoning model will happily
    spend minutes thinking about that — time the user waits through for a check
    that was supposed to be invisible. None of that reasoning reaches us anyway,
    so it is asked for plainly. A model with no thinking to disable is unaffected.
    """
    raw = ""
    client = OllamaClient(host=state.llm_host, default_model=state.llm_model)
    async for delta in client.stream_chat(messages, model=state.llm_model, think=False):
        raw += delta
        if len(raw) > ceiling:
            break
    return raw


async def review_reply(state, reply_text: str) -> dict | None:
    """Check one new passage against the canon and harvest what it establishes.

    Returns ``{"contradictions": [...], "facts": [...]}`` — either list may be
    empty, which is the ordinary case for a well-behaved reply — or ``None`` when
    there is nothing to check or no model to check with.
    """
    passage = (reply_text or "").strip()
    if not passage:
        return None
    if not state.llm_model:
        logger.warning("Continuity check skipped: no LLM model selected")
        return None

    facts = prompt_facts(state)
    messages = build_continuity_review_messages(
        facts,
        passage,
        getattr(state, "char_name", "") or "",
        getattr(state, "user_name", "") or "",
    )
    raw = await _generate(state, messages, MAX_REVIEW_CHARS)
    payload = _parse_json_object(raw)
    if payload is None:
        # Small models drop the contract every so often and answer in prose. One
        # more try costs a few seconds of background work; giving up costs the
        # check entirely, and silently — the story would look guarded when it was
        # not. Two failures in a row is a model that cannot do this job today.
        logger.info("Continuity check answered in prose; asking once more")
        raw = await _generate(
            state, [*messages, {"role": "system", "content": RETRY_REMINDER}], MAX_REVIEW_CHARS
        )
        payload = _parse_json_object(raw)
    if payload is None:
        logger.warning("Continuity check returned nothing parseable; skipping this reply")
        return None

    turn = len(conversation_messages(state))
    result = {
        "contradictions": parse_contradictions(payload, facts, passage),
        "facts": parse_facts(payload, turn=turn),
    }
    logger.info(
        f"Continuity check: {len(result['contradictions'])} contradiction(s), "
        f"{len(result['facts'])} new fact(s) offered"
    )
    return result


async def harvest_canon(state) -> list[dict] | None:
    """Read the whole story and rebuild the ledger from it.

    This is the "adopt the guard mid-story" path: turning the feature on after
    forty turns should not mean starting from an empty canon. Returns the facts
    to merge, or ``None`` when there is nothing to read.
    """
    history = conversation_messages(state)
    if not history:
        return None
    if not state.llm_model:
        logger.warning("Canon harvest skipped: no LLM model selected")
        return None

    char_name = getattr(state, "char_name", "") or ""
    user_name = getattr(state, "user_name", "") or ""
    # The running story memory is read alongside the transcript, so facts that
    # scrolled out of context long ago are not lost to the harvest.
    transcript = render_transcript(history, user_name, char_name)
    if not transcript.strip():
        return None

    messages = build_canon_harvest_messages(
        canon_facts(state),
        transcript,
        getattr(state, "memory_summary", "") or "",
        char_name,
        user_name,
    )
    raw = await _generate(state, messages, MAX_HARVEST_CHARS)
    payload = _parse_json_object(raw)
    if payload is None:
        logger.warning("Canon harvest returned nothing parseable; keeping the ledger as it is")
        return None

    facts = parse_facts(payload, turn=len(history))
    logger.info(f"Canon harvest read {len(history)} messages and offered {len(facts)} facts")
    return facts


# ----- Acting on a contradiction -----------------------------------------


def build_continuity_note(contradictions: list[dict]) -> str:
    """The one-shot directive that steers a reroll away from the conflict.

    Injected for exactly one generation. It names what went wrong in the previous
    attempt rather than restating the canon — the canon block is already there,
    and the model has just demonstrated that reading it once was not enough.
    """
    if not contradictions:
        return ""
    lines = []
    for report in contradictions[:4]:
        quote = report.get("quote", "")
        detail = f'Your last attempt wrote "{quote}", which breaks: ' if quote else "Do not break: "
        lines.append(f"- {detail}{report.get('fact', '')}")
    return (
        "[Continuity correction — your previous attempt at this reply contradicted "
        "the established story. Write it again, keeping everything else you were "
        "going to do, but without the conflict below. Do not mention, explain, or "
        "apologise for the correction.]\n" + "\n".join(lines)
    )


def apply_revision(state, fact_id: str, revised: str) -> bool:
    """Accept the new passage as the truth: rewrite (or drop) the fact it broke.

    An empty ``revised`` means the fact simply no longer holds and is removed —
    the honest outcome when a story kills a character or breaks an object.
    """
    facts = canon_facts(state)
    for index, fact in enumerate(facts):
        if fact.get("id") != fact_id:
            continue
        text = _clean_text(revised, MAX_FACT_CHARS)
        if text:
            facts[index] = {**fact, "text": text}
        else:
            facts.pop(index)
        state.canon = facts
        return True
    return False
