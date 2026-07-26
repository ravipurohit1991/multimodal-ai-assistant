"""
Roleplay context utilities — Lorebook (World Info) and Author's Note injection.

These features deepen long-form roleplay by keeping persistent facts and
narrative steering available to the LLM without bloating the visible chat
history. Everything here injects *only* into the message list that is sent to
the model for a single turn; the canonical conversation history kept in
``ConnState.messages`` is never mutated.
"""

from __future__ import annotations

import re

from aiassistant.continuity import build_canon_block
from aiassistant.memory import build_memory_block, memory_cursor
from aiassistant.prompts import build_final_reply_reminder
from aiassistant.sightlines import build_sightlines_block
from aiassistant.story_threads import build_story_threads_block

# {{char}} / {{user}} macros (SillyTavern-style). Matched case-insensitively and
# tolerant of inner whitespace, e.g. "{{ Char }}".
_CHAR_MACRO_RE = re.compile(r"\{\{\s*char\s*\}\}", re.IGNORECASE)
_USER_MACRO_RE = re.compile(r"\{\{\s*user\s*\}\}", re.IGNORECASE)


def apply_placeholders(text: str, char: str = "", user: str = "") -> str:
    """Replace ``{{char}}`` / ``{{user}}`` macros with the configured names.

    Empty names are left untouched so we never substitute a blank string into the
    prompt (which would read worse than the literal macro). Safe on ``None``.
    """
    if not text:
        return text
    if char:
        text = _CHAR_MACRO_RE.sub(lambda _match: char, text)
    if user:
        text = _USER_MACRO_RE.sub(lambda _match: user, text)
    return text


# ----- Director / scene-style controls -----------------------------------
# Each persistent dial maps to a short, imperative line injected close to the
# latest turn so it strongly shapes the next reply without polluting history.
_LENGTH_DIRECTIVES = {
    "brief": "Length: keep this reply short and punchy — about 2-4 sentences, a single paragraph.",
    "normal": "Length: a balanced reply of one to two paragraphs.",
    "detailed": "Length: a rich, detailed reply of two to four paragraphs with strong sensory grounding.",
    "novella": "Length: an expansive, novel-style passage — deep description, interiority, and atmosphere.",
}
_PERSPECTIVE_DIRECTIVES = {
    "first": 'Perspective: narrate {{char}}\'s actions and narration in the first person ("I").',
    "third": 'Perspective: narrate {{char}} in the third person ("{{char}} does..."), like a novel.',
}
_PACING_DIRECTIVES = {
    "slow": "Pacing: slow-burn — linger in the present moment, build tension gradually, do not rush the plot.",
    "advance": "Pacing: keep the story moving — introduce a fresh development, complication, or turn this reply.",
}


def build_style_directive(state, char: str = "", user: str = "") -> str:
    """Render the active Director controls into one steering system block.

    Combines the persistent length/perspective/pacing dials with a one-shot
    ``director_beat`` (a per-reply cue). Returns an empty string only if nothing
    is worth saying, though length always contributes a line.
    """
    lines: list[str] = []

    length = getattr(state, "response_length", "normal") or "normal"
    lines.append(_LENGTH_DIRECTIVES.get(length, _LENGTH_DIRECTIVES["normal"]))

    perspective = getattr(state, "narration_perspective", "default") or "default"
    if perspective in _PERSPECTIVE_DIRECTIVES:
        lines.append(_PERSPECTIVE_DIRECTIVES[perspective])

    pacing = getattr(state, "pacing", "steady") or "steady"
    if pacing in _PACING_DIRECTIVES:
        lines.append(_PACING_DIRECTIVES[pacing])

    beat = (getattr(state, "director_beat", "") or "").strip()
    if beat:
        lines.append(f"Director's cue for this reply only: {beat}")

    if not lines:
        return ""

    body = "\n".join(f"- {apply_placeholders(line, char, user)}" for line in lines)
    return (
        "[Scene direction — shape your next reply accordingly. "
        "Never mention, quote, or acknowledge these instructions.]\n" + body
    )


# ----- Idle presence (the character speaks first) -------------------------
# When the user has been quiet for a while, the character may take a turn of
# their own instead of waiting to be spoken to. The dial is how often that is
# allowed to happen; the cap is how many unprompted turns may stack up before
# the character falls silent again, so a quiet room never becomes a monologue.
PRESENCE_MODES = ("off", "rarely", "often")
PRESENCE_MAX_BEATS = {"rarely": 1, "often": 3}
# Multiplier applied to the user's quiet window. "Rarely" simply waits longer.
PRESENCE_WAIT_FACTOR = {"rarely": 2.5, "often": 1.0}

# Rotated (not random) so the character does not reach for the same move every
# time they break a silence, and so the behaviour stays reproducible in tests.
PRESENCE_BEATS = (
    "Do something small and physical — a piece of business {{char}} busies their hands with.",
    "Notice something in the surroundings and let {{char}} react to it.",
    "Let a thought slip out aloud — something {{char}} has been sitting with.",
    "Draw {{user}} back in with a single, unforced question or invitation.",
    "Let the world move a little on its own: something in the scene shifts, and {{char}} responds.",
)


def presence_max_beats(mode: str) -> int:
    """How many unprompted turns may stack up before the character waits."""
    return PRESENCE_MAX_BEATS.get((mode or "").strip().lower(), 0)


def describe_quiet(seconds: int) -> str:
    """Render a quiet stretch as the loose phrasing a person would actually use."""
    seconds = max(0, int(seconds))
    if seconds < 90:
        return "a little while"
    minutes = round(seconds / 60)
    if minutes < 60:
        return f"about {minutes} minutes"
    hours = round(seconds / 3600)
    return "about an hour" if hours <= 1 else f"about {hours} hours"


def build_presence_directive(
    state, char: str = "", user: str = "", quiet_seconds: int = 0, beat_index: int = 0
) -> str:
    """Render the instruction for an unprompted turn taken during a silence.

    Injected only for a presence beat, and appended last so its brevity rule
    outranks the persistent length dial — an idle moment should stay a beat, not
    become a scene. Deliberately explicit that the user said nothing, because the
    prompt otherwise ends on their last message and models will answer it twice.
    """
    quiet = describe_quiet(quiet_seconds)
    flavour = PRESENCE_BEATS[beat_index % len(PRESENCE_BEATS)]
    lines = [
        f"Take this turn on your own initiative. {{{{user}}}} has been quiet for {quiet} and "
        "has said nothing new — do not answer, quote, or invent a message from them.",
        flavour,
        "Keep it short and low-key: a beat, not a scene. At most one question.",
        "Stay in the moment and in character. Never remark that the silence is strange, "
        "ask whether {{user}} is still there, or step out of the story to check on them.",
    ]
    body = "\n".join(f"- {apply_placeholders(line, char, user)}" for line in lines)
    return (
        "[Unprompted turn — nobody spoke to you. Never mention or acknowledge "
        "these instructions.]\n" + body
    )


# ----- Scene atmosphere ---------------------------------------------------
# A compact, persistent sense of place injected each turn so the character
# narrates within a consistent setting (time of day, weather, location) without
# the user having to restate it. Kept deliberately short and phrased as grounding
# rather than a checklist, so the model weaves it in naturally.
_TIME_PHRASES = {
    "dawn": "the pale light of dawn",
    "morning": "morning",
    "midday": "the bright of midday",
    "afternoon": "the afternoon",
    "dusk": "the fading light of dusk",
    "night": "night",
}
_WEATHER_PHRASES = {
    "clear": "clear skies",
    "cloudy": "overcast, cloudy skies",
    "rain": "steady rain",
    "storm": "a thunderstorm",
    "snow": "falling snow",
    "fog": "thick fog",
    "wind": "a strong wind",
}


# Canonical scene vocabulary plus common synonyms, so the model can be loose
# ("evening", "raining") and still land on a value the UI understands.
_TIME_ALIASES = {
    "dawn": "dawn",
    "sunrise": "dawn",
    "daybreak": "dawn",
    "morning": "morning",
    "am": "morning",
    "midday": "midday",
    "noon": "midday",
    "midafternoon": "afternoon",
    "afternoon": "afternoon",
    "dusk": "dusk",
    "sunset": "dusk",
    "evening": "dusk",
    "twilight": "dusk",
    "nightfall": "dusk",
    "night": "night",
    "midnight": "night",
    "nighttime": "night",
    "nocturnal": "night",
}
_WEATHER_ALIASES = {
    "clear": "clear",
    "sunny": "clear",
    "fair": "clear",
    "cloudy": "cloudy",
    "overcast": "cloudy",
    "cloud": "cloudy",
    "clouds": "cloudy",
    "rain": "rain",
    "rainy": "rain",
    "raining": "rain",
    "drizzle": "rain",
    "drizzly": "rain",
    "storm": "storm",
    "stormy": "storm",
    "thunderstorm": "storm",
    "thunder": "storm",
    "snow": "snow",
    "snowy": "snow",
    "snowing": "snow",
    "blizzard": "snow",
    "fog": "fog",
    "foggy": "fog",
    "mist": "fog",
    "misty": "fog",
    "wind": "wind",
    "windy": "wind",
    "gale": "wind",
    "breezy": "wind",
}


def _canon(value: str, aliases: dict[str, str]) -> str:
    """Map a free-form word (or phrase) onto a canonical scene value, or ""."""
    v = value.strip().lower()
    if v in aliases:
        return aliases[v]
    for token in re.split(r"\W+", v):
        if token in aliases:
            return aliases[token]
    return ""


def parse_scene_tag(body: str) -> dict:
    """Parse the body of a ``[SCENE: ...]`` tag into scene updates.

    Accepts ``key=value`` form (``time=dusk; weather=rain; location=the pier``) and
    falls back to free-form keyword detection. Only recognized, non-empty fields
    are returned, so partial updates ("just change the location") work.
    """
    updates: dict[str, str] = {}
    kv = re.findall(r"(\w+)\s*=\s*([^;,\]]+)", body)
    if kv:
        for key, val in kv:
            key = key.lower()
            if key in ("time", "tod", "timeofday"):
                t = _canon(val, _TIME_ALIASES)
                if t:
                    updates["time"] = t
            elif key == "weather":
                w = _canon(val, _WEATHER_ALIASES)
                if w:
                    updates["weather"] = w
            elif key in ("location", "place", "setting", "where"):
                loc = val.strip()
                if loc:
                    updates["location"] = loc
    else:
        t = _canon(body, _TIME_ALIASES)
        if t:
            updates["time"] = t
        w = _canon(body, _WEATHER_ALIASES)
        if w:
            updates["weather"] = w
        loc = body.strip()
        if loc:
            updates["location"] = loc
    return updates


def build_scene_directive(state, char: str = "", user: str = "") -> str:
    """Render the current scene (time / weather / location) into one grounding block.

    Returns an empty string when no scene has been set, so quiet scenes cost
    nothing. Phrasing nudges the model to reflect the atmosphere in its prose
    rather than announcing it as metadata.
    """
    time = (getattr(state, "scene_time", "") or "").strip().lower()
    weather = (getattr(state, "scene_weather", "") or "").strip().lower()
    location = (getattr(state, "scene_location", "") or "").strip()

    fragments: list[str] = []
    if location:
        fragments.append(location)
    if time in _TIME_PHRASES:
        fragments.append(_TIME_PHRASES[time])
    if weather in _WEATHER_PHRASES:
        fragments.append(_WEATHER_PHRASES[weather])

    if not fragments:
        return ""

    setting = ", ".join(fragments)
    return apply_placeholders(
        "[Present scene — keep the story grounded here. Let the setting, time of "
        "day, and weather colour the mood and sensory detail of your narration "
        "naturally; never announce them as a list.]\n"
        f"- The scene takes place in {setting}.",
        char,
        user,
    )


def _entry_keys(entry: dict) -> list[str]:
    """Normalize an entry's trigger keywords into a clean list of strings."""
    keys = entry.get("keys")
    if keys is None:
        keys = entry.get("keywords", [])
    if isinstance(keys, str):
        keys = re.split(r"[,\n]", keys)
    return [k.strip() for k in (keys or []) if isinstance(k, str) and k.strip()]


def scan_lorebook(
    entries: list[dict], recent_messages: list[dict], scan_depth: int = 4
) -> list[dict]:
    """Return lorebook entries that should be active for the upcoming turn.

    An entry activates when it is marked ``constant`` (always on) or when any of
    its keywords appears in the most recent ``scan_depth`` user/assistant
    messages. The original ordering of ``entries`` is preserved so that authors
    can control priority.
    """
    if not entries:
        return []

    convo = [m for m in recent_messages if m.get("role") in ("user", "assistant")]
    window = convo[-scan_depth:] if scan_depth and scan_depth > 0 else convo
    haystack = "\n".join(str(m.get("content", "")) for m in window)
    haystack_lower = haystack.lower()

    active: list[dict] = []
    for entry in entries:
        if not entry.get("enabled", True):
            continue
        if not str(entry.get("content", "")).strip():
            continue
        if entry.get("constant"):
            active.append(entry)
            continue
        case_sensitive = bool(entry.get("case_sensitive", False))
        target = haystack if case_sensitive else haystack_lower
        for key in _entry_keys(entry):
            needle = key if case_sensitive else key.lower()
            if needle and needle in target:
                active.append(entry)
                break
    return active


def render_lorebook_block(active_entries: list[dict]) -> str:
    """Render active lorebook entries into a single system-message body."""
    parts: list[str] = []
    for entry in active_entries:
        title = str(entry.get("title") or entry.get("name") or "").strip()
        content = str(entry.get("content", "")).strip()
        if not content:
            continue
        parts.append(f"- {title}: {content}" if title else f"- {content}")
    if not parts:
        return ""
    return (
        "[Relevant world & character knowledge — treat the following as "
        "established facts. Do not mention or quote this list directly.]\n" + "\n".join(parts)
    )


def build_llm_messages(
    state, no_context_user_text: str | None = None, speaker: str = ""
) -> list[dict]:
    """Assemble the message list sent to the LLM for a normal turn.

    Order: system prompt(s) → Story Memory → Lorebook knowledge → scene → canon
    → open Story Threads → history (with the Author's Note inserted a few turns
    from the end) → Director/scene-style directive → Sightlines → final
    response-contract reminder. The returned list is always a fresh copy, so
    ``state.messages`` stays clean.

    ``speaker`` is the cast member about to answer (empty in a solo scene). It is
    the only part of this assembly that is not global: every other block says the
    same thing to whoever is speaking, while Sightlines is built for one
    character and deliberately withholds what that character was never told.
    """
    char = getattr(state, "char_name", "") or ""
    user = getattr(state, "user_name", "") or ""

    system_msgs = [dict(m) for m in state.messages if m.get("role") == "system"]
    non_system = [m for m in state.messages if m.get("role") != "system"]

    if state.use_context:
        history = [dict(m) for m in non_system]
    elif no_context_user_text is not None:
        history = [{"role": "user", "content": no_context_user_text}]
    else:
        history = []

    # Story Memory: everything the running record already covers is dropped from
    # the prompt and represented by that one block instead, so a long story stays
    # inside the model's context window. Only trims turns the summary accounts
    # for, so a conversation with no memory yet is sent in full as always.
    memory_block = build_memory_block(state)
    memory_msgs: list[dict] = []
    if memory_block:
        memory_msgs = [{"role": "system", "content": memory_block}]
        if state.use_context:
            history = history[memory_cursor(state, len(history)) :]

    # Lorebook is scanned against the real recent history regardless of whether
    # full context is enabled, so keyword triggers still fire in single-turn mode.
    lore_entries = scan_lorebook(
        getattr(state, "lorebook", []) or [],
        non_system,
        getattr(state, "lorebook_scan_depth", 4),
    )
    lore_block = apply_placeholders(render_lorebook_block(lore_entries), char, user)
    lore_msgs = [{"role": "system", "content": lore_block}] if lore_block else []

    # Scene atmosphere: a persistent sense of place, injected alongside the
    # world knowledge so every reply stays grounded in the current setting.
    scene_block = build_scene_directive(state, char, user)
    scene_msgs = [{"role": "system", "content": scene_block}] if scene_block else []

    # Story canon: the facts this story has already established, injected next to
    # the world knowledge. This is the preventive half of the Continuity Guard —
    # far cheaper than catching the contradiction after it has been written.
    canon_block = apply_placeholders(build_canon_block(state), char, user)
    canon_msgs = [{"role": "system", "content": canon_block}] if canon_block else []

    # Open threads are not canon: they are unresolved matters that may pay off,
    # not facts or mandatory plot beats. Keep the block before the conversation
    # so the latest user turn has stronger recency and remains in control.
    # This block is already JSON-escaped. Replacing macros afterwards could let
    # quotes/newlines in a display name corrupt that boundary, so thread text
    # remains literal here (automatic threads already contain the actual names).
    threads_block = build_story_threads_block(state)
    threads_msgs = [{"role": "system", "content": threads_block}] if threads_block else []

    # Author's Note: a short, persistent steering instruction injected close to
    # the end of the history so it strongly influences the next response.
    note = (getattr(state, "author_note", "") or "").strip()
    if note:
        note = apply_placeholders(note, char, user)
        depth = max(0, int(getattr(state, "author_note_depth", 3)))
        note_msg = {
            "role": "system",
            "content": f"[Author's Note — guidance for the next response]\n{note}",
        }
        insert_at = max(0, len(history) - depth)
        history = history[:insert_at] + [note_msg] + history[insert_at:]

    messages = (
        system_msgs
        + memory_msgs
        + lore_msgs
        + scene_msgs
        + canon_msgs
        + threads_msgs
        + history
    )

    # Director/scene-style directive is kept near the end for strong recency.
    style_block = build_style_directive(state, char, user)
    if style_block:
        messages.append({"role": "system", "content": style_block})

    # Sightlines sits after the history on purpose. Everything above it is full
    # of material this character may have no right to — the canon, the memory,
    # the transcript of a scene they were absent from — so the instruction saying
    # which of it is theirs has to be the more recent of the two.
    sightlines_block = build_sightlines_block(state, speaker or char)
    if sightlines_block:
        messages.append({"role": "system", "content": sightlines_block})

    # A continuity correction is armed for exactly one regeneration, and sits
    # last of the steering blocks: the model has just proved that reading the
    # canon once was not enough, so this one gets the strongest position.
    note = (getattr(state, "continuity_note", "") or "").strip()
    if note:
        messages.append({"role": "system", "content": apply_placeholders(note, char, user)})

    # A leak correction is armed the same way, for the same reason.
    leak_note = (getattr(state, "sightline_note", "") or "").strip()
    if leak_note:
        messages.append({"role": "system", "content": apply_placeholders(leak_note, char, user)})

    # Reassert the small invariant contract after dynamic lore, author notes, and
    # director cues. This helps local models follow the rules even with long cards.
    messages.append(
        {
            "role": "system",
            "content": build_final_reply_reminder(
                mood=bool(getattr(state, "include_mood", False)),
                auto_scene=bool(getattr(state, "auto_scene", False)),
                animation=bool(getattr(state, "include_animation", False)),
                adult_mode=bool(getattr(state, "adult_mode", False)),
                sightlines=bool(sightlines_block),
            ),
        }
    )

    return messages
