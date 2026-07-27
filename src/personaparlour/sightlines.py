"""
Sightlines — who in this story knows what.

Story Memory records what happened, the Continuity Guard records what must stay
true, and Story Threads record what remains open. All three are *global*: every
block they produce is assembled once and sent unchanged no matter which cast
member is about to speak. That makes everyone in a group scene omniscient. The
canon says Mira poisoned the wine; Tomas, asleep upstairs at the time, will
reference it two turns later and nothing will flag it, because nothing was
contradicted — the fact is true. It simply was not his to know.

This module gives each piece of knowledge an *audience*, and makes the reply
prompt speaker-aware. It is used in two places:

* **Before the reply** (``build_sightlines_block``). The speaker is told, in full,
  the private things they know — and who else in the room does or does not share
  them — so they can act on a secret or guard it. For everything they are *not*
  in the audience of, they are told the ``topic`` alone and never the ``text``: a
  model cannot be told "you do not know X" by being told X.
* **After the reply** (``review_reply``). One background pass reads the passage
  for two things: a *leak* (the speaker acted on knowledge they do not have) and
  a *transfer* (someone was told, or overheard, something they did not know).
  Both jobs share one generation, and both must quote the passage to be believed.

Nothing here rewrites the story. A leak is reported against the reply that caused
it, while that reply is still the last thing said, and the three ways out — write
it again, decide they know it now, or leave it — are the user's.

The preventive half costs no extra generation at all: an empty ledger produces an
empty block and a prompt identical to one from before this feature existed. Only
the watching half costs a pass, which is why it is the half that is off by
default.
"""

from __future__ import annotations

import json
import re
import uuid

from personaparlour.llm import OllamaClient
from personaparlour.memory import conversation_messages, render_transcript
from personaparlour.prompts import (
    build_sightline_harvest_messages,
    build_sightline_review_messages,
)
from personaparlour.utils import logger

# The human participant. A sentinel rather than the user's name, so renaming
# yourself mid-story never silently hands you a secret you were being kept from.
USER_TOKEN = "@user"

# Ledger limits. Sightlines is a page of secrets, not a second canon: a ledger
# that grows without bound crowds out the story it is meant to shape, and gives
# the checking model more to misread.
MAX_ENTRIES = 40
MAX_TEXT_CHARS = 220
MAX_TOPIC_CHARS = 90
MAX_KNOWERS = 16
# How many entries reach a reply prompt. Pinned first, then the most recent.
SIGHTLINE_PROMPT_LIMIT = 12

REVIEW_TIMEOUT_SECONDS = 180
HARVEST_TIMEOUT_SECONDS = 300

MAX_REVIEW_CHARS = 4000
MAX_HARVEST_CHARS = 8000

_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,16}$")

_FILLER_WORDS = frozenset(
    """a an and are as at be been but by for from had has have he her hers him his in into is it
    its of on or she that the their them they this to was were with you your""".split()
)

RETRY_REMINDER = (
    "Your previous answer was not valid JSON. Answer again with the JSON object "
    "alone — no explanation, no markdown fence, no text before or after it. If "
    "there is nothing to report, the correct answer is "
    '{"leaks":[],"learned":[]}.'
)


# ----- Participants -------------------------------------------------------


def _clean_text(value: object, limit: int) -> str:
    """Collapse a model- or user-supplied string into one tidy line."""
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value).strip()[:limit]


def _key(name: object) -> str:
    """The case- and space-insensitive identity two participant names share."""
    return re.sub(r"\s+", " ", str(name or "")).strip().casefold()


def cast_names(state) -> list[str]:
    """The in-scene cast, as the browser last reported it.

    The roster lives in the frontend; the backend only ever learns the names of
    whoever is currently in the scene (``set_cast``). An empty roster falls back
    to the single active character, which is exactly a solo scene.
    """
    names: list[str] = []
    seen: set[str] = set()
    for raw in list(getattr(state, "cast", []) or []):
        name = _clean_text(raw, MAX_TOPIC_CHARS)
        if not name or _key(name) in seen:
            continue
        seen.add(_key(name))
        names.append(name)
    if not names:
        solo = _clean_text(getattr(state, "char_name", ""), MAX_TOPIC_CHARS)
        if solo:
            names.append(solo)
    return names[:MAX_KNOWERS]


def participants(state) -> list[str]:
    """Everyone whose knowledge can be tracked: the in-scene cast, plus you."""
    return [*cast_names(state), USER_TOKEN]


def display_name(name: str, user_name: str = "") -> str:
    """Render a stored participant for a prompt or the UI."""
    if _key(name) == _key(USER_TOKEN):
        return _clean_text(user_name, MAX_TOPIC_CHARS) or "the user"
    return name


def resolve_participant(raw: object, known: list[str]) -> str:
    """Match a model- or UI-supplied name against the participant list.

    Returns "" for anything unrecognised, so an invented name can never create a
    knower — and therefore can never quietly widen a secret's audience.
    """
    candidate = _key(raw)
    if not candidate:
        return ""
    if candidate in {_key(USER_TOKEN), "user", "@you", "you"}:
        return USER_TOKEN
    for name in known:
        if _key(name) == candidate:
            return name
    return ""


def normalize_knowers(raw: object, known: list[str] | None = None) -> list[str]:
    """Sanitize an audience, dropping duplicates and (when scoped) strangers."""
    values = raw if isinstance(raw, list) else []
    result: list[str] = []
    seen: set[str] = set()
    for item in values:
        name = resolve_participant(item, known) if known is not None else _clean_text(
            item, MAX_TOPIC_CHARS
        )
        if known is None and _key(name) in {_key(USER_TOKEN), "user"}:
            name = USER_TOKEN
        if not name or _key(name) in seen:
            continue
        seen.add(_key(name))
        result.append(name)
    return result[:MAX_KNOWERS]


# ----- The ledger ---------------------------------------------------------


def new_entry(
    text: str,
    *,
    topic: str = "",
    knows: object = None,
    turn: int = 0,
    pinned: bool = False,
) -> dict:
    """Mint one sightline. Ids are short and opaque — the model quotes them back."""
    return {
        "id": uuid.uuid4().hex[:8],
        "topic": _clean_text(topic, MAX_TOPIC_CHARS),
        "text": _clean_text(text, MAX_TEXT_CHARS),
        "knows": normalize_knowers(knows),
        "turn": max(0, int(turn or 0)),
        "pinned": bool(pinned),
    }


def normalize_entry(raw: object) -> dict | None:
    """Coerce one entry from the model, a saved story, or the UI into a sightline.

    Returns ``None`` for anything without usable text, so a malformed row is
    dropped rather than becoming a blank secret nobody can act on.
    """
    if not isinstance(raw, dict):
        return None
    text = _clean_text(raw.get("text") or raw.get("fact"), MAX_TEXT_CHARS)
    if not text:
        return None
    entry = new_entry(
        text,
        topic=str(raw.get("topic") or ""),
        knows=raw.get("knows") if raw.get("knows") is not None else raw.get("audience"),
        turn=raw.get("turn") or 0,
        pinned=bool(raw.get("pinned")),
    )
    existing_id = raw.get("id")
    if isinstance(existing_id, str) and _ID_RE.fullmatch(existing_id):
        entry["id"] = existing_id
    return entry


def _entry_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def normalize_entries(raw: object) -> list[dict]:
    """Sanitize a whole ledger, dropping duplicates and anything unusable."""
    if not isinstance(raw, list):
        return []
    entries: list[dict] = []
    seen_text: set[str] = set()
    seen_ids: set[str] = set()
    for item in raw:
        entry = normalize_entry(item)
        if not entry:
            continue
        key = _entry_key(entry["text"])
        # Ids are the mutation boundary for model operations. Two rows sharing an
        # id would make ordering an accidental API, so the first one wins.
        if key in seen_text or entry["id"] in seen_ids:
            continue
        seen_text.add(key)
        seen_ids.add(entry["id"])
        entries.append(entry)
    return entries[:MAX_ENTRIES]


def merge_entries(existing: list[dict], incoming: list[dict]) -> tuple[list[dict], int]:
    """Add genuinely new sightlines; returns the ledger and how many landed.

    When the ledger is full the oldest *unpinned* entries give way. A pin is the
    user saying "this secret matters" and is never evicted.
    """
    merged = list(existing)
    seen = {_entry_key(entry.get("text", "")) for entry in merged}
    added = 0
    for entry in incoming:
        key = _entry_key(entry.get("text", ""))
        if not key or key in seen:
            continue
        seen.add(key)
        merged.append(entry)
        added += 1

    if len(merged) > MAX_ENTRIES:
        overflow = len(merged) - MAX_ENTRIES
        kept: list[dict] = []
        for entry in merged:
            if overflow > 0 and not entry.get("pinned"):
                overflow -= 1
                continue
            kept.append(entry)
        merged = kept
    return merged, added


def rebuild_sightlines(existing: list[dict], harvested: list[dict]) -> tuple[list[dict], int]:
    """Replace the ledger with a fresh reading of the whole story.

    A harvest has just read everything, so what it returns *is* the ledger. Only
    pinned entries survive: those are the user's own dramatic decisions, and a
    model re-reading the transcript has no standing to retire them.
    """
    kept = [entry for entry in existing if entry.get("pinned")]
    return merge_entries(kept, harvested)


def sightline_entries(state) -> list[dict]:
    return list(getattr(state, "sightlines", []) or [])


def prompt_entries(state) -> list[dict]:
    """The slice of the ledger that reaches the model: pinned first, then recent."""
    entries = sightline_entries(state)
    if len(entries) <= SIGHTLINE_PROMPT_LIMIT:
        return entries
    pinned = [entry for entry in entries if entry.get("pinned")]
    rest = [entry for entry in entries if not entry.get("pinned")]
    room = max(0, SIGHTLINE_PROMPT_LIMIT - len(pinned))
    keep = pinned + rest[-room:] if room else pinned[:SIGHTLINE_PROMPT_LIMIT]
    keep_ids = {entry["id"] for entry in keep}
    # Preserve the ledger's own ordering so the block reads as one list.
    return [entry for entry in entries if entry["id"] in keep_ids]


def knows(entry: dict, name: str) -> bool:
    """Whether one participant is in an entry's audience."""
    target = _key(name)
    if not target:
        return False
    return any(_key(knower) == target for knower in entry.get("knows", []))


def is_private(entry: dict, everyone: list[str]) -> bool:
    """Whether anyone present is being kept out of this entry.

    An entry everyone knows is not a sightline at all — it is ordinary context,
    already carried by the canon and the transcript, and rendering it again would
    only spend tokens telling the model something it can already see.
    """
    return any(not knows(entry, name) for name in everyone)


def grant_knowledge(state, entry_id: str, name: str) -> bool:
    """Let one participant in on one sightline. Idempotent."""
    everyone = participants(state)
    resolved = resolve_participant(name, cast_names(state))
    if not resolved:
        return False
    entries = sightline_entries(state)
    for index, entry in enumerate(entries):
        if entry.get("id") != entry_id:
            continue
        if knows(entry, resolved):
            return False
        entries[index] = {
            **entry,
            "knows": normalize_knowers([*entry.get("knows", []), resolved], everyone),
        }
        state.sightlines = entries
        return True
    return False


def reset_sightlines(state) -> None:
    """Forget who knew what (a cleared chat, or the user's ask)."""
    state.sightlines = []
    state.sightlines_covered = 0
    state.sightline_alert = None
    state.sightline_note = ""


# ----- The reply-time block ----------------------------------------------


def blind_spot_topic(entry: dict, user_name: str = "") -> str:
    """A spoiler-free handle for something the speaker must not learn here.

    Falling back to the entry's own words would defeat the whole point, so an
    entry with no topic is described only by who is holding it. That is still
    actionable — the character can be told there is nothing for them here —
    without the block becoming the leak it exists to prevent.
    """
    topic = _clean_text(entry.get("topic"), MAX_TOPIC_CHARS)
    if topic:
        return topic
    holders = [display_name(name, user_name) for name in entry.get("knows", [])]
    if holders:
        return f"something {holders[0]} has not shared with you"
    return "something established outside your hearing"


def build_sightlines_block(state, speaker: str = "") -> str:
    """Render one speaker's knowledge and blind spots as a system block.

    Returns "" when the feature is off, the ledger is empty, or nothing in it is
    private — so an ordinary story pays nothing at all for this being available.
    """
    if not getattr(state, "sightlines_enabled", True):
        return ""
    entries = prompt_entries(state)
    if not entries:
        return ""

    everyone = participants(state)
    user_name = getattr(state, "user_name", "") or ""
    me = resolve_participant(speaker, cast_names(state)) or (
        cast_names(state)[0] if cast_names(state) else ""
    )
    if not me:
        return ""

    known_lines: list[str] = []
    blind_lines: list[str] = []
    for entry in entries:
        if not is_private(entry, everyone):
            continue
        if knows(entry, me):
            others = [
                display_name(name, user_name)
                for name in everyone
                if _key(name) != _key(me) and knows(entry, name)
            ]
            unaware = [
                display_name(name, user_name)
                for name in everyone
                if _key(name) != _key(me) and not knows(entry, name)
            ]
            line = f"- {entry['text']}"
            if others:
                line += f" (also known to {', '.join(others)})"
            if unaware:
                line += f" — {', '.join(unaware)} does not know this."
            known_lines.append(line)
        else:
            blind_lines.append(f"- {blind_spot_topic(entry, user_name)}")

    if not known_lines and not blind_lines:
        return ""

    sections = [
        f"[Sightlines — what {display_name(me, user_name)} does and does not know. "
        "This governs what you may act on.]"
    ]
    if known_lines:
        sections.append(
            "You know these things, and not everyone present does. Act on them, "
            "guard them, or let them show — whichever the character would. Do not "
            "announce them merely because they are listed here:\n"
            + "\n".join(known_lines)
        )
    if blind_lines:
        sections.append(
            "You do not know the following, and the story has not told you what "
            "they are. Do not reference, hint at, guess at, or act on them, and do "
            "not behave as though you are aware there is anything to know. If one "
            "is raised, react as someone who genuinely has no idea:\n"
            + "\n".join(blind_lines)
        )
    return "\n\n".join(sections)


def build_leak_note(leaks: list[dict], user_name: str = "") -> str:
    """The one-shot directive that steers a reroll away from a leak.

    Injected for exactly one generation. It names what went wrong rather than
    restating the ledger: the sightlines block was already there, and the model
    has just demonstrated that reading it once was not enough.
    """
    if not leaks:
        return ""
    lines = []
    for report in leaks[:4]:
        quote = report.get("quote", "")
        topic = report.get("topic", "") or "something you were not told"
        detail = f'Your last attempt wrote "{quote}", which used ' if quote else "Do not use "
        lines.append(f"- {detail}knowledge you do not have: {topic}.")
    return (
        "[Knowledge correction — your previous attempt at this reply used "
        "something this character has no way of knowing. Write it again, keeping "
        "everything else you were going to do, but without that knowledge. Do not "
        "mention, explain, or apologise for the correction.]\n" + "\n".join(lines)
    )


# ----- Reading the model's answer ----------------------------------------


def _parse_json_object(raw: str) -> dict | None:
    """Pull the first JSON object out of a reply, tolerating fences and preamble."""
    text = (raw or "").strip()
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


def _normalized(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def _quotes_the_passage(quote: str, passage: str) -> bool:
    """Whether a reported quote is really in the reply, and says anything at all.

    A model that cannot point at the offending words has not found a leak, and a
    false alarm is worse than a miss: it interrupts a story that was fine and
    teaches the reader to ignore the report.
    """
    needle = _normalized(quote)
    haystack = _normalized(passage)
    tokens = needle.split()
    meaningful = {token for token in tokens if len(token) > 2 and token not in _FILLER_WORDS}
    return bool(
        len(needle) >= 8
        and len(tokens) >= 3
        and len(meaningful) >= 2
        and haystack
        and needle in haystack
    )


def parse_leaks(
    payload: dict,
    entries: list[dict],
    passage: str,
    speaker: str,
    *,
    user_name: str = "",
) -> list[dict]:
    """Keep only reports naming a real entry the speaker really does not know."""
    by_id = {entry["id"]: entry for entry in entries}
    reports: list[dict] = []
    seen: set[str] = set()
    for raw in payload.get("leaks") or []:
        if not isinstance(raw, dict):
            continue
        entry = by_id.get(str(raw.get("id", "")).strip())
        if not entry or entry["id"] in seen:
            continue
        # The speaker knowing it is the ordinary case, not a leak. Checking here
        # rather than trusting the model means a stale or confused report is
        # dropped instead of prompting the user to "fix" a correct reply.
        if knows(entry, speaker):
            continue
        why = _clean_text(raw.get("why"), 200)
        quote = _clean_text(raw.get("quote"), 200)
        if not why or not quote or not _quotes_the_passage(quote, passage):
            logger.debug(f"Sightline leak dropped: no usable evidence in the reply ({quote!r})")
            continue
        seen.add(entry["id"])
        reports.append(
            {
                "entry_id": entry["id"],
                "topic": blind_spot_topic(entry, user_name),
                "text": entry["text"],
                "quote": quote,
                "why": why,
            }
        )
    return reports


def parse_learned(
    payload: dict,
    entries: list[dict],
    passage: str,
    everyone: list[str],
) -> list[dict]:
    """Keep only transfers naming a real entry and a real participant.

    Widening an audience is the one operation here that silently changes what
    future replies may say, so it fails closed twice: the participant must be one
    the story actually has, and the passage must contain the words offered as
    proof.
    """
    by_id = {entry["id"]: entry for entry in entries}
    transfers: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for raw in payload.get("learned") or []:
        if not isinstance(raw, dict):
            continue
        entry = by_id.get(str(raw.get("id", "")).strip())
        if not entry:
            continue
        who = resolve_participant(raw.get("who"), [n for n in everyone if n != USER_TOKEN])
        if not who or knows(entry, who):
            continue
        quote = _clean_text(raw.get("quote"), 200)
        if not quote or not _quotes_the_passage(quote, passage):
            continue
        key = (entry["id"], _key(who))
        if key in seen:
            continue
        seen.add(key)
        transfers.append({"entry_id": entry["id"], "who": who, "quote": quote})
    return transfers


def parse_entries(payload: dict, everyone: list[str], *, turn: int = 0) -> list[dict]:
    """Turn a harvest into ledger entries, failing open into public knowledge.

    An entry whose audience cannot be resolved becomes something everyone knows.
    That is exactly how the app behaved before this feature existed, so the worst
    case of a confused harvest is the status quo — never an invented secret that
    silently gags a character.
    """
    entries: list[dict] = []
    for raw in payload.get("entries") or payload.get("sightlines") or []:
        if not isinstance(raw, dict):
            continue
        text = _clean_text(raw.get("text"), MAX_TEXT_CHARS)
        if not text:
            continue
        audience = normalize_knowers(raw.get("knows"), everyone)
        if not audience:
            audience = list(everyone)
        entries.append(
            new_entry(
                text,
                topic=str(raw.get("topic") or ""),
                knows=audience,
                turn=turn,
            )
        )
    return entries


# ----- The passes ---------------------------------------------------------


async def _generate(state, messages: list[dict], ceiling: int) -> str:
    """Run one auxiliary pass, with the model's deliberation switched off.

    Both jobs here ask for a few lines of JSON, and a reasoning model will happily
    spend minutes on that — time the user waits through for a check that was
    supposed to be invisible. None of that reasoning reaches us anyway.
    """
    raw = ""
    client = OllamaClient(host=state.llm_host, default_model=state.llm_model)
    async for delta in client.stream_chat(messages, model=state.llm_model, think=False):
        raw += delta
        if len(raw) > ceiling:
            break
    return raw


def should_review(state) -> bool:
    """Whether a completed reply is worth one automatic sightlines pass."""
    if not getattr(state, "sightlines_enabled", True):
        return False
    if not getattr(state, "sightlines_auto", False):
        return False
    everyone = participants(state)
    return any(is_private(entry, everyone) for entry in sightline_entries(state))


async def review_reply(state, reply_text: str, speaker: str = "") -> dict | None:
    """Read one new passage for leaked knowledge and for knowledge changing hands.

    Returns ``{"leaks": [...], "learned": [...]}`` — either list may be empty,
    which is the ordinary case for a well-behaved reply — or ``None`` when there
    is nothing to check or no model to check with.
    """
    passage = (reply_text or "").strip()
    if not passage:
        return None
    if not state.llm_model:
        logger.warning("Sightlines check skipped: no LLM model selected")
        return None

    everyone = participants(state)
    entries = [entry for entry in prompt_entries(state) if is_private(entry, everyone)]
    if not entries:
        return None

    user_name = getattr(state, "user_name", "") or ""
    me = resolve_participant(speaker, cast_names(state)) or (
        cast_names(state)[0] if cast_names(state) else ""
    )
    if not me:
        return None

    messages = build_sightline_review_messages(
        entries,
        passage,
        speaker=display_name(me, user_name),
        participants=[display_name(name, user_name) for name in everyone],
        knows_map={
            entry["id"]: [display_name(name, user_name) for name in entry.get("knows", [])]
            for entry in entries
        },
    )
    raw = await _generate(state, messages, MAX_REVIEW_CHARS)
    payload = _parse_json_object(raw)
    if payload is None:
        # Small models drop the contract every so often and answer in prose. One
        # more try costs a few seconds of background work; giving up costs the
        # check entirely, and silently.
        logger.info("Sightlines check answered in prose; asking once more")
        raw = await _generate(
            state, [*messages, {"role": "system", "content": RETRY_REMINDER}], MAX_REVIEW_CHARS
        )
        payload = _parse_json_object(raw)
    if payload is None:
        logger.warning("Sightlines check returned nothing parseable; skipping this reply")
        return None

    # The model answers about display names; the ledger stores participants.
    display_to_stored = {display_name(name, user_name): name for name in everyone}
    result = {
        "leaks": parse_leaks(payload, entries, passage, me, user_name=user_name),
        "learned": [
            {**transfer, "who": display_to_stored.get(transfer["who"], transfer["who"])}
            for transfer in parse_learned(
                payload,
                entries,
                passage,
                [display_name(name, user_name) for name in everyone],
            )
        ],
    }
    logger.info(
        f"Sightlines check: {len(result['leaks'])} leak(s), "
        f"{len(result['learned'])} transfer(s) offered"
    )
    return result


async def harvest_sightlines(state) -> list[dict] | None:
    """Read the whole story and propose who has been kept out of what.

    This is the "adopt sightlines mid-story" path: turning the feature on after
    forty turns should not mean starting from an empty ledger.
    """
    history = conversation_messages(state)
    if not history:
        return None
    if not state.llm_model:
        logger.warning("Sightlines harvest skipped: no LLM model selected")
        return None

    char_name = getattr(state, "char_name", "") or ""
    user_name = getattr(state, "user_name", "") or ""
    transcript = render_transcript(history, user_name, char_name)
    if not transcript.strip():
        return None

    everyone = participants(state)
    messages = build_sightline_harvest_messages(
        sightline_entries(state),
        transcript,
        getattr(state, "memory_summary", "") or "",
        participants=[display_name(name, user_name) for name in everyone],
    )
    raw = await _generate(state, messages, MAX_HARVEST_CHARS)
    payload = _parse_json_object(raw)
    if payload is None:
        logger.warning("Sightlines harvest returned nothing parseable; keeping the ledger as is")
        return None

    display_to_stored = {display_name(name, user_name): name for name in everyone}
    proposed = parse_entries(
        payload,
        [display_name(name, user_name) for name in everyone],
        turn=len(history),
    )
    for entry in proposed:
        entry["knows"] = [display_to_stored.get(name, name) for name in entry["knows"]]

    logger.info(
        f"Sightlines harvest read {len(history)} messages and offered {len(proposed)} entries"
    )
    return proposed
