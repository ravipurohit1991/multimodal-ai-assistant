"""
Character Study — the sheet the story writes about who each character has become.

Every other ledger here tracks the *world*. Story Memory records what happened,
the Continuity Guard records what must stay true, Story Threads record what is
still open, and Sightlines records who is allowed to know it. None of them track
the *person*, which is why the strongest line in the reply prompt is also the
emptiest one: "stay consistent with the character's established personality,
voice, and motives" is an instruction with nothing behind it. The card is a
paragraph the author wrote once, before the character had said anything.

So one model writes every character, and it quietly sands them all down to its
own narrator voice. Twenty turns in, the terse ex-soldier and the arch academic
produce the same three-clause sentences with the same em-dashes. Nothing is
contradicted — the canon is clean, the sightlines are clean — the cast has simply
merged into one person wearing different name tags.

This module keeps a *study* for each character: a short ledger of specific,
evidence-backed observations about how they speak, how they behave, where they
stand with the people around them, what they are after, and what the story has
changed in them. It is used in three places:

* **Before the reply** (``build_study_block``). The speaker's own firm sheet is
  rendered for them, along with the exemplar lines they have actually said —
  few-shot anchoring holds a voice where a pile of adjectives does not. In a
  group scene it also renders one contrast line per other cast member, because
  voice only exists differentially: telling the model what the *others* sound
  like is what stops the merge, where describing one character alone never has.
* **Periodically** (``reflect``). A batched background pass reads the turns
  nobody has read yet and offers observations. Evolution is slow, so this does
  not need a pass per reply — it runs every few turns, which is what makes the
  feature cheap enough to leave on.
* **After a reply** (``watch_reply``). An opt-in pass reads one passage against
  the speaker's firm sheet and reports where the reply is not them.

Two rules keep the sheet honest, and they are the whole reason to trust it:

The **authored card is never touched.** ``description`` and ``personality``
belong to the author. The study is a separate layer, and every line in it is
attributed. A pin freezes a line the way it does in the canon.

**Confidence, not rewriting.** An observation seen once is provisional and does
not reach the prompt at all; seen again in a *later* pass, over later turns, it
firms up and starts shaping replies. That makes the sheet self-correcting without
any user labour — one odd reply cannot redefine a character — and it is the guard
against the failure mode this kind of feature ships with by default: the sheet is
learned from the model's own output and then fed back to the model, so a tic
observed once would otherwise become a tic performed always. Traits that stop
being observed fade back out, so the sheet stays a current portrait rather than an
accumulating pile.

Nothing here rewrites the story. Drift is *reported* against the reply that
caused it, and the three ways out — write it again, accept it as who they are now,
or leave it — are the user's. A violation is either a mistake or a development,
and only the reader can say which.
"""

from __future__ import annotations

import json
import re
import uuid

from personaparlour.llm import get_chat_client, structured_pass_options
from personaparlour.memory import conversation_messages, render_transcript
from personaparlour.prompts import (
    build_study_harvest_messages,
    build_study_reflect_messages,
    build_study_watch_messages,
)
from personaparlour.utils import logger

# The kinds of observation a study holds. Each answers a different question about
# the person, and each is rendered under its own heading in the reply block.
#   voice  — how they speak: rhythm, register, tics, what they say instead
#   line   — a sentence they actually said, kept verbatim as a voice anchor
#   manner — what they do: physical habits, their default move under pressure
#   bond   — where they stand with one other participant (``about``)
#   want   — what this person is after now
#   mark   — what the story has changed in them
FACETS = ("voice", "line", "manner", "bond", "want", "mark")

FACET_HEADINGS = {
    "voice": "How you speak",
    "line": "Lines you have actually said — match this register, do not reuse the words",
    "manner": "How you behave",
    "bond": "Where you stand with the people around you",
    "want": "What you are after",
    "mark": "What this story has changed in you",
}

# The human participant, as a rename-proof token rather than a display name —
# the same sentinel Sightlines uses, for the same reason.
USER_TOKEN = "@user"

# Ledger limits. A study is a page about one person, not a second character card:
# a sheet that grows without bound crowds out the story it is meant to sharpen,
# and gives the watching model more to misread.
MAX_TRAITS = 160
MAX_TRAITS_PER_CHARACTER = 16
MAX_TEXT_CHARS = 200
MAX_LINE_CHARS = 240
MAX_QUOTE_CHARS = 200
MAX_NAME_CHARS = 60
MAX_EVIDENCE = 3
MAX_HISTORY = 6

# How many separate passes must see an observation before it shapes a reply. Two
# is the smallest number that means "not a one-off", which is the entire job.
FIRM_AT = 2

# How much of a study reaches a reply prompt.
PROMPT_LIMIT_PER_CHARACTER = 8
LINE_PROMPT_LIMIT = 3
CONTRAST_LIMIT = 4

# A trait nobody has observed for this many turns stops reaching the prompt. It
# stays in the sheet's history: the character is no longer defined by something
# they did once, two hundred turns ago, but the record of having done it survives.
FADE_AFTER_TURNS = 80

# How many new turns pile up before a reflection pass is worth its latency.
DEFAULT_INTERVAL = 6
MIN_INTERVAL = 2
MAX_INTERVAL = 40

REFLECT_TIMEOUT_SECONDS = 240
WATCH_TIMEOUT_SECONDS = 180
HARVEST_TIMEOUT_SECONDS = 300

MAX_REFLECT_CHARS = 6000
MAX_WATCH_CHARS = 4000
MAX_HARVEST_CHARS = 10000

_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,16}$")

_FILLER_WORDS = frozenset(
    """a an and are as at be been but by for from had has have he her hers him his in into is it
    its of on or she that the their them they this to was were with you your""".split()
)

RETRY_REMINDER = (
    "Your previous answer was not valid JSON. Answer again with the JSON object "
    "alone — no explanation, no markdown fence, no text before or after it. If "
    "there is nothing to report, the correct answer is an object with empty arrays."
)


# ----- Small helpers ------------------------------------------------------


def _clean_text(value: object, limit: int) -> str:
    """Collapse a model- or user-supplied string into one tidy line."""
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value).strip()[:limit]


def _key(name: object) -> str:
    """The case- and space-insensitive identity two names share."""
    return re.sub(r"\s+", " ", str(name or "")).strip().casefold()


def _normalized(text: str) -> str:
    """Letters, digits and single spaces — the form two phrasings are compared in."""
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def _facet(value: object) -> str:
    candidate = _key(value)
    return candidate if candidate in FACETS else "manner"


# An asterisked action beat, and the quote marks a model wraps a line in anyway.
# Only double quotes are removed wholesale: an apostrophe is part of the words.
_ACTION_BEAT_RE = re.compile(r"\*[^*]*\*")
_DOUBLE_QUOTES_RE = re.compile(r"[\"“”]")
_WRAPPING_SINGLES_RE = re.compile(r"^['‘’]+|['‘’]+$")


def _clean_line(value: object) -> str:
    """Reduce a quoted exemplar to the spoken words alone.

    The block renders a line inside its own quotation marks, and a model asked for
    a line of dialogue hands back the quotes — and often the stage direction that
    surrounded it — however plainly it was asked not to. A line arrives as
    ``"The letter." *He does not look up.* "There. Said."``, and rendering that
    verbatim would teach the model to write stage directions inside dialogue and
    to nest quotes inside quotes. Dropping the beats and every double quote leaves
    the speech itself, which is the only part that anchors a voice.
    """
    text = _clean_text(value, MAX_LINE_CHARS * 2)
    text = _DOUBLE_QUOTES_RE.sub("", _ACTION_BEAT_RE.sub(" ", text))
    # Removing a beat between two quoted halves leaves the gap behind it, and
    # removing the quotes leaves punctuation adrift from the word it belongs to.
    text = re.sub(r"\s+([,.!?;:])", r"\1", re.sub(r"\s+", " ", text)).strip()
    return _WRAPPING_SINGLES_RE.sub("", text).strip()[:MAX_LINE_CHARS]


def cast_names(state) -> list[str]:
    """The in-scene cast, as the browser last reported it.

    The roster lives in the frontend; the backend learns only the names of who is
    currently in the scene (``set_cast``). An empty roster falls back to the
    single active character, which is exactly a solo scene.
    """
    names: list[str] = []
    seen: set[str] = set()
    for raw in list(getattr(state, "cast", []) or []):
        name = _clean_text(raw, MAX_NAME_CHARS)
        if not name or _key(name) in seen:
            continue
        seen.add(_key(name))
        names.append(name)
    if not names:
        solo = _clean_text(getattr(state, "char_name", ""), MAX_NAME_CHARS)
        if solo:
            names.append(solo)
    return names


def display_name(name: str, user_name: str = "") -> str:
    """Render a stored participant for a prompt or the UI."""
    if _key(name) == _key(USER_TOKEN):
        return _clean_text(user_name, MAX_NAME_CHARS) or "the user"
    return name


def resolve_name(raw: object, known: list[str]) -> str:
    """Match a model- or UI-supplied name against the cast, plus the user token.

    Returns "" for anything unrecognised, so an invented name can never open a
    study for a character this story does not have.
    """
    candidate = _key(raw)
    if not candidate:
        return ""
    if candidate in {_key(USER_TOKEN), "user", "you", "@you"}:
        return USER_TOKEN
    for name in known:
        if _key(name) == candidate:
            return name
    return ""


# ----- The ledger ---------------------------------------------------------


def new_trait(
    text: str,
    *,
    character: str,
    facet: str = "manner",
    about: str = "",
    quote: str = "",
    turn: int = 0,
    observations: int = 1,
    origin: str = "learned",
    pinned: bool = False,
) -> dict:
    """Mint one observation. Ids are short and opaque — the model quotes them back."""
    cleaned_text = (
        _clean_line(text) if _facet(facet) == "line" else _clean_text(text, MAX_TEXT_CHARS)
    )
    evidence: list[dict] = []
    cleaned_quote = _clean_text(quote, MAX_QUOTE_CHARS)
    if cleaned_quote:
        evidence.append({"quote": cleaned_quote, "turn": max(0, int(turn or 0))})
    return {
        "id": uuid.uuid4().hex[:8],
        "character": _clean_text(character, MAX_NAME_CHARS),
        "facet": _facet(facet),
        "text": cleaned_text,
        # Only a bond points at someone else; every other facet is about the
        # character alone, and a stray ``about`` would render as nonsense.
        "about": _clean_text(about, MAX_NAME_CHARS) if _facet(facet) == "bond" else "",
        "evidence": evidence,
        "observations": max(1, int(observations or 1)),
        "first_turn": max(0, int(turn or 0)),
        "last_turn": max(0, int(turn or 0)),
        "origin": "authored" if origin == "authored" else "learned",
        "pinned": bool(pinned),
        "history": [],
    }


def _normalize_evidence(raw: object) -> list[dict]:
    rows: list[dict] = []
    for item in raw if isinstance(raw, list) else []:
        if isinstance(item, str):
            item = {"quote": item}
        if not isinstance(item, dict):
            continue
        quote = _clean_text(item.get("quote"), MAX_QUOTE_CHARS)
        if not quote:
            continue
        rows.append({"quote": quote, "turn": max(0, int(item.get("turn") or 0))})
    return rows[:MAX_EVIDENCE]


def _normalize_history(raw: object) -> list[dict]:
    rows: list[dict] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        text = _clean_text(item.get("text"), MAX_LINE_CHARS)
        if not text:
            continue
        rows.append({"text": text, "turn": max(0, int(item.get("turn") or 0))})
    return rows[-MAX_HISTORY:]


def normalize_trait(raw: object) -> dict | None:
    """Coerce one row from the model, a saved story, or the UI into a trait.

    Returns ``None`` for anything without usable text or a character to be about,
    so a malformed row is dropped rather than becoming a blank line in a sheet.
    """
    if not isinstance(raw, dict):
        return None
    facet = _facet(raw.get("facet"))
    limit = MAX_LINE_CHARS if facet == "line" else MAX_TEXT_CHARS
    text = _clean_text(raw.get("text"), limit)
    character = _clean_text(raw.get("character"), MAX_NAME_CHARS)
    if not text or not character:
        return None

    trait = new_trait(
        text,
        character=character,
        facet=facet,
        about=str(raw.get("about") or ""),
        turn=raw.get("first_turn") or raw.get("turn") or 0,
        observations=raw.get("observations") or 1,
        origin=str(raw.get("origin") or "learned"),
        pinned=bool(raw.get("pinned")),
    )
    trait["evidence"] = _normalize_evidence(raw.get("evidence"))
    trait["history"] = _normalize_history(raw.get("history"))
    last_turn = max(0, int(raw.get("last_turn") or 0))
    trait["last_turn"] = max(last_turn, trait["first_turn"])
    # Preserve an existing id so edits, pins, and drift reports keep pointing at
    # the same row across a save/load round trip.
    existing_id = raw.get("id")
    if isinstance(existing_id, str) and _ID_RE.fullmatch(existing_id):
        trait["id"] = existing_id
    return trait


def normalize_traits(raw: object) -> list[dict]:
    """Sanitize a whole study, dropping duplicates and anything unusable."""
    if not isinstance(raw, list):
        return []
    traits: list[dict] = []
    seen_ids: set[str] = set()
    seen_text: set[tuple[str, str, str]] = set()
    for item in raw:
        trait = normalize_trait(item)
        if not trait:
            continue
        key = (_key(trait["character"]), trait["facet"], _normalized(trait["text"]))
        # Ids are the mutation boundary for model operations. Two rows sharing an
        # id would make ordering an accidental API, so the first one wins.
        if key in seen_text or trait["id"] in seen_ids:
            continue
        seen_text.add(key)
        seen_ids.add(trait["id"])
        traits.append(trait)
    return traits[:MAX_TRAITS]


def study_traits(state) -> list[dict]:
    return list(getattr(state, "studies", []) or [])


def traits_for(state, name: str) -> list[dict]:
    """Every observation about one character, in ledger order."""
    target = _key(name)
    if not target:
        return []
    return [trait for trait in study_traits(state) if _key(trait.get("character")) == target]


def studied_names(state) -> list[str]:
    """Every character the study holds something about, in first-seen order."""
    names: list[str] = []
    seen: set[str] = set()
    for trait in study_traits(state):
        name = trait.get("character", "")
        if not name or _key(name) in seen:
            continue
        seen.add(_key(name))
        names.append(name)
    return names


def is_locked(state, name: str) -> bool:
    """Whether the user has frozen this character's study.

    A locked study still reaches the prompt — it is the *portrait* that is
    finished, not the character. Nothing automatic may add to or revise it.
    """
    target = _key(name)
    return any(_key(entry) == target for entry in getattr(state, "study_locked", []) or [])


def set_lock(state, name: str, locked: bool) -> bool:
    """Freeze or unfreeze one character's study. Idempotent."""
    resolved = _clean_text(name, MAX_NAME_CHARS)
    if not resolved:
        return False
    current = [
        entry
        for entry in (getattr(state, "study_locked", []) or [])
        if _key(entry) != _key(resolved)
    ]
    if locked:
        current.append(resolved)
    state.study_locked = current
    return True


def is_firm(trait: dict) -> bool:
    """Whether an observation has earned a place in the prompt.

    Anything the user wrote or pinned counts immediately: a pin is the reader
    saying "this is who they are", and there is nothing to be confident about.
    """
    if trait.get("pinned") or trait.get("origin") == "authored":
        return True
    return int(trait.get("observations", 1)) >= FIRM_AT


def trait_status(trait: dict, turn: int) -> str:
    """``provisional`` (not yet in the prompt), ``firm``, or ``faded``."""
    if not is_firm(trait):
        return "provisional"
    if trait.get("pinned") or trait.get("origin") == "authored":
        return "firm"
    if turn and turn - int(trait.get("last_turn", 0)) > FADE_AFTER_TURNS:
        return "faded"
    return "firm"


def prompt_traits(state, name: str, turn: int = 0) -> list[dict]:
    """The slice of one character's study that reaches the model.

    Firm and unfaded only, pinned first, then the most recently observed — so a
    long sheet spends its budget on who this character is *now*.
    """
    firm = [
        trait
        for trait in traits_for(state, name)
        if trait_status(trait, turn) == "firm" and trait.get("text")
    ]
    if len(firm) <= PROMPT_LIMIT_PER_CHARACTER:
        return firm
    ranked = sorted(
        firm,
        key=lambda trait: (
            bool(trait.get("pinned")),
            int(trait.get("observations", 1)),
            int(trait.get("last_turn", 0)),
        ),
        reverse=True,
    )
    keep_ids = {trait["id"] for trait in ranked[:PROMPT_LIMIT_PER_CHARACTER]}
    # Preserve the ledger's own ordering so the block reads as one sheet.
    return [trait for trait in firm if trait["id"] in keep_ids]


# ----- Merging what a pass observed --------------------------------------


def _significant_words(text: str) -> set[str]:
    """The content words of an observation, for near-duplicate matching."""
    words = _normalized(text).split()
    return {word for word in words if word not in _FILLER_WORDS and len(word) > 2}


def _says_the_same_thing(left: set[str], right: set[str]) -> bool:
    """Whether two observations are restatements of each other.

    A model never phrases the same habit the same way twice ("answers a question
    with a question" / "deflects questions by asking her own"). Comparing content
    words by containment folds those together, which is what makes the
    observation count mean "seen again" rather than "worded differently".
    """
    if not left or not right:
        return False
    return len(left & right) / min(len(left), len(right)) >= 0.6


def merge_observations(
    existing: list[dict],
    incoming: list[dict],
    *,
    turn: int = 0,
    locked: frozenset[str] = frozenset(),
) -> tuple[list[dict], int, int]:
    """Fold one pass's observations into the study.

    Returns the new ledger, how many traits are new, and how many were confirmed.

    A match bumps the observation count — but only when the evidence is *newer*
    than what the trait was last seen at, and only once per pass however many
    times the model repeats itself. Both rules exist for the same reason: this
    ledger is learned from the model's own output and then fed back to it, so
    confidence has to mean "seen again later", never "said twice in one breath".
    """
    merged = [dict(trait) for trait in existing]
    signatures = [
        (
            _key(trait.get("character")),
            trait.get("facet"),
            _significant_words(trait.get("text", "")),
        )
        for trait in merged
    ]
    bumped: set[str] = set()
    added = 0
    confirmed = 0

    for candidate in incoming:
        character = candidate.get("character", "")
        if not character or _key(character) in locked:
            continue
        facet = _facet(candidate.get("facet"))
        signature = _significant_words(candidate.get("text", ""))
        matched = -1
        for index, (name, existing_facet, words) in enumerate(signatures):
            if name != _key(character) or existing_facet != facet:
                continue
            if _says_the_same_thing(signature, words):
                matched = index
                break

        if matched >= 0:
            trait = merged[matched]
            if trait["id"] in bumped:
                continue
            evidence_turn = max(
                (int(row.get("turn") or 0) for row in candidate.get("evidence", [])),
                default=turn,
            )
            if evidence_turn <= int(trait.get("last_turn", 0)):
                # The same turns re-read. Nothing was seen *again*, so nothing is
                # more certain than it was — a rebuild must not firm up a sheet.
                continue
            bumped.add(trait["id"])
            trait["observations"] = int(trait.get("observations", 1)) + 1
            trait["last_turn"] = evidence_turn
            trait["evidence"] = (
                trait.get("evidence", []) + candidate.get("evidence", [])
            )[-MAX_EVIDENCE:]
            confirmed += 1
            continue

        if sum(1 for name, _, _ in signatures if name == _key(character)) >= (
            MAX_TRAITS_PER_CHARACTER
        ):
            # A full sheet gives way at its weakest point rather than refusing to
            # learn: the provisional observation nobody has confirmed and nothing
            # has seen for longest is the one worth losing.
            evictable = [
                index
                for index, trait in enumerate(merged)
                if _key(trait.get("character")) == _key(character)
                and not trait.get("pinned")
                and trait.get("origin") != "authored"
            ]
            if not evictable:
                continue
            victim = min(
                evictable,
                key=lambda index: (
                    int(merged[index].get("observations", 1)),
                    int(merged[index].get("last_turn", 0)),
                ),
            )
            merged.pop(victim)
            signatures.pop(victim)

        merged.append(candidate)
        signatures.append((_key(character), facet, signature))
        added += 1

    if len(merged) > MAX_TRAITS:
        keep: list[dict] = []
        overflow = len(merged) - MAX_TRAITS
        for trait in merged:
            if overflow > 0 and not trait.get("pinned") and trait.get("origin") != "authored":
                overflow -= 1
                continue
            keep.append(trait)
        merged = keep
    return merged, added, confirmed


def rebuild_study(existing: list[dict], harvested: list[dict]) -> tuple[list[dict], int]:
    """Replace the study with a fresh reading of the whole story.

    A harvest has just read everything, so what it returns *is* the sheet; folding
    it into the old one would only produce two wordings of every habit. Anything
    the user wrote or pinned survives: a model re-reading the transcript has no
    standing to retire the reader's own portrait.
    """
    kept = [
        trait
        for trait in existing
        if trait.get("pinned") or trait.get("origin") == "authored"
    ]
    merged, added, _ = merge_observations(kept, harvested)
    return merged, added


def update_trait(state, trait_id: str, text: str, *, turn: int = 0) -> bool:
    """Rewrite one observation, keeping the old wording in its history.

    This is the "accept it as who they are now" path, and the reason the history
    exists: the card should be able to show that she *became* this, not merely
    that she is it.
    """
    traits = study_traits(state)
    for index, trait in enumerate(traits):
        if trait.get("id") != trait_id:
            continue
        cleaned = (
            _clean_line(text)
            if trait.get("facet") == "line"
            else _clean_text(text, MAX_TEXT_CHARS)
        )
        if not cleaned:
            traits.pop(index)
            state.studies = traits
            return True
        if _normalized(cleaned) == _normalized(trait.get("text", "")):
            return False
        history = [
            *trait.get("history", []),
            {"text": trait.get("text", ""), "turn": int(trait.get("last_turn", 0))},
        ][-MAX_HISTORY:]
        traits[index] = {
            **trait,
            "text": cleaned,
            "history": history,
            "last_turn": max(int(trait.get("last_turn", 0)), max(0, int(turn or 0))),
            # A trait the story just revised is the current reading of the
            # character, so it keeps shaping replies rather than dropping back to
            # provisional and leaving the sheet briefly silent about it.
            "observations": max(int(trait.get("observations", 1)), FIRM_AT),
        }
        state.studies = traits
        return True
    return False


def reset_study(state) -> None:
    """Forget who everyone became (a cleared chat, or the user's ask)."""
    state.studies = []
    state.studies_covered = 0
    state.study_alert = None
    state.study_note = ""


# ----- Cursor and scheduling ---------------------------------------------


def study_cursor(state, history_len: int) -> int:
    """How many turns the study has already read, clamped to the real history."""
    covered = int(getattr(state, "studies_covered", 0) or 0)
    return max(0, min(covered, max(0, history_len)))


def interval(state) -> int:
    value = int(getattr(state, "study_interval", DEFAULT_INTERVAL) or DEFAULT_INTERVAL)
    return max(MIN_INTERVAL, min(MAX_INTERVAL, value))


def pending_count(state) -> int:
    """Turns nobody has read for what they show about the cast."""
    history = conversation_messages(state)
    return max(0, len(history) - study_cursor(state, len(history)))


def should_reflect(state) -> bool:
    """Whether enough has happened to justify one automatic reflection pass."""
    if not getattr(state, "character_study_enabled", False):
        return False
    if not getattr(state, "character_study_auto", True):
        return False
    return pending_count(state) >= interval(state)


def should_watch(state, speaker: str = "") -> bool:
    """Whether a completed reply is worth one adherence pass.

    Costs nothing when the speaker has no firm sheet yet, which is the whole of a
    new story: there is nothing to be out of character *against*.
    """
    if not getattr(state, "character_study_enabled", False):
        return False
    if not getattr(state, "character_study_watch", False):
        return False
    name = resolve_name(speaker, cast_names(state)) or (
        cast_names(state)[0] if cast_names(state) else ""
    )
    if not name:
        return False
    return bool(prompt_traits(state, name, len(conversation_messages(state))))


# ----- The reply-time block ----------------------------------------------


def _render_trait(trait: dict, user_name: str = "") -> str:
    text = trait.get("text", "")
    if trait.get("facet") == "line":
        return f'"{text}"'
    about = trait.get("about", "")
    if trait.get("facet") == "bond" and about:
        return f"With {display_name(about, user_name)}: {text}"
    return text


def _contrast_line(state, name: str, turn: int) -> str:
    """One line naming how somebody else in the room sounds.

    This is the load-bearing half of the block in a group scene. A voice exists
    only by contrast, so the model is told what the *others* sound like while it
    writes this character — describing one character alone has never stopped a
    local model from merging the cast into a single narrator.
    """
    traits = prompt_traits(state, name, turn)
    voice = [trait for trait in traits if trait.get("facet") == "voice"]
    if not voice:
        voice = [trait for trait in traits if trait.get("facet") == "manner"]
    if not voice:
        return ""
    strongest = max(voice, key=lambda trait: int(trait.get("observations", 1)))
    return f"- {name}: {strongest.get('text', '')}"


def build_study_block(state, speaker: str = "") -> str:
    """Render the speaker's study, and how the rest of the room differs from it.

    Returns "" when the feature is off or nothing has firmed up yet, so a fresh
    story costs exactly what it did before this feature existed.
    """
    if not getattr(state, "character_study_enabled", False):
        return ""
    everyone = cast_names(state)
    me = resolve_name(speaker, everyone) or (everyone[0] if everyone else "")
    if not me or _key(me) == _key(USER_TOKEN):
        return ""

    turn = len(conversation_messages(state))
    user_name = getattr(state, "user_name", "") or ""
    traits = prompt_traits(state, me, turn)

    groups: dict[str, list[str]] = {}
    for facet in FACETS:
        rows = [trait for trait in traits if trait.get("facet") == facet]
        if facet == "line":
            rows = sorted(
                rows, key=lambda trait: int(trait.get("last_turn", 0)), reverse=True
            )[:LINE_PROMPT_LIMIT]
        rendered = [f"- {_render_trait(trait, user_name)}" for trait in rows if trait.get("text")]
        if rendered:
            groups[facet] = rendered

    contrasts = [
        line
        for line in (
            _contrast_line(state, name, turn)
            for name in everyone
            if _key(name) != _key(me) and _key(name) != _key(USER_TOKEN)
        )
        if line
    ][:CONTRAST_LIMIT]

    if not groups and not contrasts:
        return ""

    sections = [
        f"[Character study — {me}, as this story has actually played them. This is "
        "who they have become: not a replacement for their card, but what the "
        "story has added to it. Write from it without ever naming, quoting, or "
        "alluding to this record. These are habits and tendencies, not a "
        "checklist — do not perform every one of them in a single reply.]"
    ]
    for facet, rendered in groups.items():
        sections.append(f"{FACET_HEADINGS[facet]}:\n" + "\n".join(rendered))
    if contrasts:
        sections.append(
            "The others in this scene do not sound like you. Keep them distinct "
            "and do not drift into their voice or their habits:\n" + "\n".join(contrasts)
        )
    return "\n\n".join(sections)


def build_drift_note(items: list[dict]) -> str:
    """The one-shot directive that steers a reroll back into character.

    Injected for exactly one generation. It names what went wrong rather than
    restating the sheet — the study block was already there, and the model has
    just demonstrated that reading it once was not enough.
    """
    if not items:
        return ""
    lines = []
    for report in items[:4]:
        quote = report.get("quote", "")
        detail = f'Your last attempt wrote "{quote}", which is not how ' if quote else "Remember how "
        lines.append(f"- {detail}this character is: {report.get('trait', '')}")
    return (
        "[Character correction — your previous attempt at this reply was not this "
        "character. Write it again, keeping everything else you were going to do, "
        "but in their own voice and manner. Do not mention, explain, or apologise "
        "for the correction.]\n" + "\n".join(lines)
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


def _in_order(words: list[str], haystack: list[str]) -> bool:
    """Whether every word appears in the passage, in this order (gaps allowed)."""
    position = 0
    for word in words:
        try:
            position = haystack.index(word, position) + 1
        except ValueError:
            return False
    return True


def _quotes_the_passage(quote: str, passage: str) -> bool:
    """Whether a quoted line is really in the text, and says anything at all.

    A model that cannot point at the words has not observed anything, and this is
    the one rule that keeps a sheet from filling up with "kind but guarded": an
    observation has to be anchored in something the character actually said or did.

    Unlike the other ledgers, what is read here is a *transcript*, where a line of
    dialogue is routinely split by a beat of asterisked action. Models quote across
    that gap — ``"She read it." *Still the fire.* "Been three days of this."`` comes
    back as one quote — so an exact substring match rejects a great many perfectly
    real quotations. A contiguous match is still the strong form; failing that, the
    quote's content words must all appear in the passage *in order*, which a
    fabricated quotation essentially never manages.
    """
    needle = _normalized(quote)
    haystack = _normalized(passage)
    tokens = needle.split()
    meaningful = [token for token in tokens if len(token) > 2 and token not in _FILLER_WORDS]
    if len(needle) < 8 or len(tokens) < 3 or len(meaningful) < 2 or not haystack:
        return False
    if needle in haystack:
        return True
    return len(meaningful) >= 3 and _in_order(meaningful, haystack.split())


def parse_traits(
    payload: dict,
    known: list[str],
    passage: str,
    *,
    turn: int = 0,
    user_name: str = "",
) -> list[dict]:
    """Turn one pass's answer into observations, dropping everything unproven.

    Fails closed in three ways, because a wrong line here does not merely sit in a
    ledger — it goes on to shape how a character is written. The character must be
    one this story has, the quote must really appear in what was read, and a bond
    must point at a real participant.
    """
    display_to_stored = {_key(display_name(name, user_name)): name for name in known}
    display_to_stored[_key(display_name(USER_TOKEN, user_name))] = USER_TOKEN
    traits: list[dict] = []
    seen: set[tuple[str, str, str]] = set()

    for raw in payload.get("traits") or []:
        if not isinstance(raw, dict):
            continue
        character = resolve_name(raw.get("character"), known) or display_to_stored.get(
            _key(raw.get("character")), ""
        )
        # The user is a person in the room, not a character the AI plays, and a
        # study of them would only ever be used to write them. Never that.
        if not character or _key(character) == _key(USER_TOKEN):
            continue
        facet = _facet(raw.get("facet"))
        text = (
            _clean_line(raw.get("text"))
            if facet == "line"
            else _clean_text(raw.get("text"), MAX_TEXT_CHARS)
        )
        if not text:
            continue
        quote = _clean_text(raw.get("quote"), MAX_QUOTE_CHARS)
        # A line *is* its own evidence: the text is the quote. Every other facet
        # is an inference, and has to be paid for with the words behind it.
        if facet == "line":
            quote = quote or text
            if not _quotes_the_passage(text, passage):
                logger.debug(f"Study line dropped: not found in what was read ({text[:60]!r})")
                continue
        elif not _quotes_the_passage(quote, passage):
            logger.debug(f"Study trait dropped: no usable evidence ({quote[:60]!r})")
            continue

        about = ""
        if facet == "bond":
            about = resolve_name(raw.get("about"), known) or display_to_stored.get(
                _key(raw.get("about")), ""
            )
            if not about or _key(about) == _key(character):
                continue

        key = (_key(character), facet, _normalized(text))
        if key in seen:
            continue
        seen.add(key)
        traits.append(
            new_trait(
                text,
                character=character,
                facet=facet,
                about=about,
                quote=quote,
                turn=max(0, int(raw.get("turn") or turn)),
            )
        )
    return traits


def parse_drift(payload: dict, traits: list[dict], passage: str) -> list[dict]:
    """Keep only reports naming a real trait and quoting real words from the reply.

    A false alarm is worse than a miss: it accuses a reply that was fine, and a
    reader who is accused twice stops reading the reports. Requiring the quoted
    words to appear in the passage rejects an invented trait id, a hallucinated
    quote, and a report whose own explanation says nothing went wrong.
    """
    by_id = {trait["id"]: trait for trait in traits}
    reports: list[dict] = []
    seen: set[str] = set()
    for raw in payload.get("drift") or []:
        if not isinstance(raw, dict):
            continue
        trait = by_id.get(str(raw.get("id", "")).strip())
        if not trait or trait["id"] in seen:
            continue
        why = _clean_text(raw.get("why"), 200)
        quote = _clean_text(raw.get("quote"), MAX_QUOTE_CHARS)
        if not why or not quote or not _quotes_the_passage(quote, passage):
            logger.debug(f"Study drift dropped: no usable evidence in the reply ({quote[:60]!r})")
            continue
        limit = MAX_LINE_CHARS if trait.get("facet") == "line" else MAX_TEXT_CHARS
        seen.add(trait["id"])
        reports.append(
            {
                "trait_id": trait["id"],
                "trait": trait.get("text", ""),
                "facet": trait.get("facet", "manner"),
                "character": trait.get("character", ""),
                "quote": quote,
                "why": why,
                "revised": _clean_text(raw.get("revised"), limit),
            }
        )
    return reports


# ----- The passes ---------------------------------------------------------


async def _generate(state, messages: list[dict], ceiling: int) -> str:
    """Run one auxiliary pass, with the model's deliberation switched off.

    Every job here asks for a few lines of JSON, and a reasoning model will
    happily spend minutes thinking about that — time spent on work that was
    supposed to be invisible. None of that reasoning reaches us anyway.
    """
    raw = ""
    client = get_chat_client(state.llm_host, state.llm_model)
    async for delta in client.stream_chat(
        messages,
        model=state.llm_model,
        think=False,
        options=structured_pass_options(ceiling),
    ):
        raw += delta
        if len(raw) > ceiling:
            break
    return raw


async def _ask(state, messages: list[dict], ceiling: int, label: str) -> dict | None:
    """One generation, with a single retry when a small model answers in prose."""
    raw = await _generate(state, messages, ceiling)
    payload = _parse_json_object(raw)
    if payload is None:
        # One more try costs a few seconds of background work; giving up costs the
        # pass entirely, and silently — the sheet would look current when it was
        # not. Two failures in a row is a model that cannot do this job today.
        logger.info(f"{label} answered in prose; asking once more")
        raw = await _generate(
            state, [*messages, {"role": "system", "content": RETRY_REMINDER}], ceiling
        )
        payload = _parse_json_object(raw)
    if payload is None:
        logger.warning(f"{label} returned nothing parseable; skipping it")
    return payload


async def reflect(state) -> list[dict] | None:
    """Read the turns nobody has read yet for what they show about the cast.

    This is the evolution engine, and it is deliberately batched: characters do
    not change every turn, so paying for a pass every turn would buy nothing but
    latency. Returns the observations to merge, or ``None`` when there is nothing
    to read or no model to read with.
    """
    history = conversation_messages(state)
    if not history:
        return None
    if not state.llm_model:
        logger.warning("Character study skipped: no LLM model selected")
        return None

    covered = study_cursor(state, len(history))
    fresh = history[covered:]
    if not fresh:
        return None

    char_name = getattr(state, "char_name", "") or ""
    user_name = getattr(state, "user_name", "") or ""
    known = cast_names(state)
    # The turns just before the new ones explain what the new ones are reacting
    # to, but they are not evidence: an observation has to be anchored in text
    # this pass is actually responsible for reading.
    context = render_transcript(history[max(0, covered - 4) : covered], user_name, char_name)
    passage = render_transcript(fresh, user_name, char_name)
    if not passage.strip():
        return None

    messages = build_study_reflect_messages(
        study_traits(state),
        passage,
        context,
        characters=[display_name(name, user_name) for name in known],
        user_name=user_name,
    )
    payload = await _ask(state, messages, MAX_REFLECT_CHARS, "Character study")
    if payload is None:
        return None

    traits = parse_traits(
        payload, known, passage, turn=len(history), user_name=user_name
    )
    logger.info(
        f"Character study read {len(fresh)} new message(s) and offered {len(traits)} observation(s)"
    )
    return traits


async def watch_reply(state, reply_text: str, speaker: str = "") -> dict | None:
    """Read one reply against the speaker's firm sheet and report where it is not them.

    Returns ``{"drift": [...]}`` — usually empty, which is the ordinary case for a
    reply that sounded right — or ``None`` when there is nothing to check.
    """
    passage = (reply_text or "").strip()
    if not passage:
        return None
    if not state.llm_model:
        logger.warning("Character study check skipped: no LLM model selected")
        return None

    known = cast_names(state)
    user_name = getattr(state, "user_name", "") or ""
    me = resolve_name(speaker, known) or (known[0] if known else "")
    if not me:
        return None
    traits = prompt_traits(state, me, len(conversation_messages(state)))
    if not traits:
        return None

    messages = build_study_watch_messages(
        traits,
        passage,
        speaker=display_name(me, user_name),
        user_name=user_name,
    )
    payload = await _ask(state, messages, MAX_WATCH_CHARS, "Character study check")
    if payload is None:
        return None

    result = {"drift": parse_drift(payload, traits, passage)}
    logger.info(f"Character study check: {len(result['drift'])} drift report(s) offered")
    return result


async def harvest_study(state) -> list[dict] | None:
    """Read the whole story and rebuild every sheet from it.

    This is the "adopt the study mid-story" path: turning it on after two hundred
    turns should hand you a portrait, not an empty page. The transcript is read
    whole, so the earliest turns count — those are the voice the author intended,
    before any drift.
    """
    history = conversation_messages(state)
    if not history:
        return None
    if not state.llm_model:
        logger.warning("Character study harvest skipped: no LLM model selected")
        return None

    char_name = getattr(state, "char_name", "") or ""
    user_name = getattr(state, "user_name", "") or ""
    transcript = render_transcript(history, user_name, char_name)
    if not transcript.strip():
        return None

    known = cast_names(state)
    messages = build_study_harvest_messages(
        study_traits(state),
        transcript,
        getattr(state, "memory_summary", "") or "",
        characters=[display_name(name, user_name) for name in known],
        user_name=user_name,
    )
    payload = await _ask(state, messages, MAX_HARVEST_CHARS, "Character study harvest")
    if payload is None:
        return None

    traits = parse_traits(
        payload, known, transcript, turn=len(history), user_name=user_name
    )
    # A harvest is one reading, so nothing it offers has been *seen again*. The
    # sheet it produces is trusted enough to write from all the same: it read the
    # whole story rather than four turns of it, which is the stronger evidence.
    for trait in traits:
        trait["observations"] = FIRM_AT
    logger.info(
        f"Character study harvest read {len(history)} messages and offered {len(traits)} observation(s)"
    )
    return traits
