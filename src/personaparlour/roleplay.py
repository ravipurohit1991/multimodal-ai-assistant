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

from personaparlour.character_study import build_study_block
from personaparlour.config import config
from personaparlour.continuity import build_canon_block
from personaparlour.memory import build_memory_block, memory_cursor
from personaparlour.prompts import build_final_reply_reminder
from personaparlour.sightlines import build_sightlines_block
from personaparlour.story_threads import build_story_threads_block
from personaparlour.utils import logger

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


def build_active_character_directive(character: str) -> str:
    """Name the character responsible for this specific reply.

    Character cards can use a custom system prompt that never mentions
    ``{{char}}``. More importantly, the browser can switch the only character in
    a scene after another card was active. Giving every request an explicit,
    nearby identity keeps either case unambiguous for the model.
    """
    name = re.sub(r"[\r\n\t]+", " ", str(character or "")).strip()[:80]
    if not name:
        return ""
    # Said once. The previous wording asserted the override three separate times
    # — as a heading, as a sentence, and again as a closing clause — which is a
    # hundred-odd tokens on every single turn to make one unambiguous point that
    # was already unambiguous the first time.
    return (
        "[Active character for this reply]\n"
        f"Your name is {name}. Reply only as {name}, from {name}'s card, voice, "
        f"knowledge, and point of view. If asked your name, the answer is {name}."
    )


# ----- Director / scene-style controls -----------------------------------
# Each persistent dial maps to a short, imperative line injected close to the
# latest turn so it strongly shapes the next reply without polluting history.
# Phrased as a target the moment may stretch or compress, not a quota. The base
# character prompt asks for length to match the beat — "concise for quick dialogue,
# richer for important beats" — and a flat "two to four paragraphs" contradicts it
# outright. A capable model tries to satisfy both and pads a one-line exchange into
# four paragraphs of scenery to make the number.
_LENGTH_DIRECTIVES = {
    "brief": "Length: aim short and punchy — a single paragraph, a few sentences.",
    "normal": "Length: aim for one or two paragraphs, as the moment needs.",
    "detailed": "Length: aim rich and detailed, around two to four paragraphs, with strong sensory grounding.",
    "novella": "Length: aim expansive and novel-like — deep description, interiority, and atmosphere.",
}
_PERSPECTIVE_DIRECTIVES = {
    "first": 'Perspective: narrate {{char}}\'s actions and narration in the first person ("I").',
    "third": 'Perspective: narrate {{char}} in the third person ("{{char}} does..."), like a novel.',
}
_PACING_DIRECTIVES = {
    "slow": "Pacing: slow-burn — linger in the present moment, build tension gradually, do not rush the plot.",
    "advance": "Pacing: keep the story moving — introduce a fresh development, complication, or turn this reply.",
}


# Ceilings, not targets. The prose directives above decide how long a reply
# should be; these only stop a model that has forgotten to finish, which is where
# the worst of the token waste lives — a "novella" dial with no ceiling will
# happily generate until the context window is full. Set well above what each
# dial actually asks for, so a legitimate reply is never cut mid-sentence.
_LENGTH_TOKEN_CEILINGS = {
    "brief": 400,
    "normal": 800,
    "detailed": 1500,
    "novella": 3000,
}


def reply_token_ceiling(state) -> int:
    """The ``num_predict`` for one in-character reply."""
    override = int(getattr(config, "llm_max_tokens", 0) or 0)
    if override > 0:
        return override
    length = getattr(state, "response_length", "normal") or "normal"
    return _LENGTH_TOKEN_CEILINGS.get(length, _LENGTH_TOKEN_CEILINGS["normal"])


# The most turns that may be sent verbatim, whatever else is or is not switched
# on. Comfortably above the Story Memory window (12 recent + a 20-turn backlog),
# so on default settings this never fires and memory keeps doing the job properly
# — it is a backstop for the configurations where memory cannot.
DEFAULT_HISTORY_LIMIT = 40
MIN_HISTORY_LIMIT = 4


def history_limit(state) -> int:
    """How many recent turns may reach the model. 0 disables the cap."""
    value = int(getattr(state, "max_history_messages", DEFAULT_HISTORY_LIMIT) or 0)
    if value <= 0:
        return 0
    return max(MIN_HISTORY_LIMIT, value)


def build_stop_sequences(state, speaker: str = "") -> list[str]:
    """Stop the model before it writes somebody else's turn.

    The app already strips a speaker label off the front of a reply, but nothing
    stopped a model that finished its own turn and carried straight on into
    "Alex:" and a line of the user's dialogue. Those tokens are paid for, thrown
    away by the reader, and — because they are stored in history — teach the next
    turn the same habit.

    Only a label at the start of a line counts, so the speaker's own name is safe
    to include for everyone *except* whoever is talking: a leading label on the
    reply itself is not preceded by a newline, and the prefix filter handles it.

    Verified honoured by a local Ollama model. Models proxied through ollama.com
    ignore ``stop`` — they were observed running to the ``num_predict`` ceiling
    and writing the user's turn anyway — so on a cloud model the token ceiling is
    the only guard, and the speaker-prefix filter remains the thing that keeps a
    stray label out of the transcript.
    """
    names = [getattr(state, "user_name", "") or "", *(getattr(state, "cast", []) or [])]
    active = _clean_name(speaker or getattr(state, "char_name", "") or "")
    stops: list[str] = []
    for name in names:
        cleaned = _clean_name(name)
        if not cleaned or cleaned.casefold() == active.casefold():
            continue
        stop = f"\n{cleaned}:"
        if stop not in stops:
            stops.append(stop)
    return stops[:8]


def _clean_name(value: object) -> str:
    """A display name reduced to something usable as a stop sequence."""
    return re.sub(r"[\r\n\t]+", " ", str(value or "")).strip()[:60]


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
    return "[Scene direction — shape your next reply accordingly.]\n" + body


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


def _key_matches(key: str, haystack: str, case_sensitive: bool) -> bool:
    """Whether a lorebook keyword occurs in the text as a word of its own.

    This used to be a bare substring test, which meant a key of "art" fired on
    "start", "party", and "particular" — injecting an unrelated block of world
    knowledge into the standing context. That is the same bug twice over: tokens
    spent on lore nobody asked for, and a reply steered by it.

    The boundary is only applied at ends that are actually word characters, so
    multi-word keys and keys with punctuation ("Blackwood Manor", "K-7") still
    match the way an author would expect.
    """
    if not key:
        return False
    left = r"(?<!\w)" if key[0].isalnum() or key[0] == "_" else ""
    right = r"(?!\w)" if key[-1].isalnum() or key[-1] == "_" else ""
    flags = 0 if case_sensitive else re.IGNORECASE
    return re.search(left + re.escape(key) + right, haystack, flags) is not None


def scan_lorebook(
    entries: list[dict], recent_messages: list[dict], scan_depth: int = 4
) -> list[dict]:
    """Return lorebook entries that should be active for the upcoming turn.

    An entry activates when it is marked ``constant`` (always on) or when any of
    its keywords appears as a whole word in the most recent ``scan_depth``
    user/assistant messages. The original ordering of ``entries`` is preserved so
    that authors can control priority.
    """
    if not entries:
        return []

    convo = [m for m in recent_messages if m.get("role") in ("user", "assistant")]
    window = convo[-scan_depth:] if scan_depth and scan_depth > 0 else convo
    haystack = "\n".join(str(m.get("content", "")) for m in window)

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
        for key in _entry_keys(entry):
            if _key_matches(key, haystack, case_sensitive):
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
        "established facts.]\n" + "\n".join(parts)
    )


def trimmed_side_task_history(state) -> list[dict]:
    """The conversation as a side task should see it: system prompt, recent turns.

    "Write my next message for me" and "suggest three replies" both used to send
    ``state.messages`` raw — every turn of the story, with no memory substitution
    and no window at all. On a long story that made either button the single most
    expensive request in the app, for a task that only needs the last few
    exchanges plus who everyone is. This applies the same two trims a reply gets:
    the story-so-far record stands in for what it covers, and the rest is capped.
    """
    system_msgs = [dict(m) for m in state.messages if m.get("role") == "system"]
    history = [dict(m) for m in state.messages if m.get("role") != "system"]

    memory_block = build_memory_block(state)
    if memory_block:
        history = history[memory_cursor(state, len(history)) :]
        system_msgs.append({"role": "system", "content": memory_block})

    limit = history_limit(state)
    if limit and len(history) > limit:
        history = history[-limit:]
    return system_msgs + history


def build_llm_messages(
    state, no_context_user_text: str | None = None, speaker: str = ""
) -> list[dict]:
    """Assemble the message list sent to the LLM for a normal turn.

    Exactly three kinds of message go out, in this order:

    1. **One** system message holding all the standing context — the response
       contract and character card, the Story Memory, triggered Lorebook entries,
       the scene, the canon, and the open Story Threads.
    2. The conversation itself, in unbroken user/assistant alternation.
    3. **One** steering message for this reply — the Director's dials, the
       Character Study, Sightlines, the Author's Note, any armed correction, and
       the closing reply check — inserted immediately *before* the user's latest
       message, so their words remain the last thing the model reads.

    Each feature was added with its own block and its own placement, and the
    result was ten system messages per request with four of them stacked *after*
    the user's turn. Two things went wrong with that. Chat templates expect a
    single leading system turn, and a trailing or repeated one is rendered
    differently by every model family — some drop it. Worse, a local model weights
    recency heavily, so the last thing it read was two thousand characters of
    instructions rather than the question it was being asked, and it answered
    accordingly: generic prose, drifting register, and the occasional aside about
    its own directions. Merging the blocks costs nothing (the same text goes out,
    joined by blank lines) and puts the user's words back where they belong.

    ``speaker`` is the cast member about to answer (empty in a solo scene). Two
    parts of the steering are built for them rather than for the room: the
    Character Study, which is who this particular character has become, and
    Sightlines, which withholds what they were never told. Everything else says
    the same thing to whoever happens to be speaking.

    The returned list is always a fresh copy, so ``state.messages`` stays clean.
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
    if memory_block and state.use_context:
        history = history[memory_cursor(state, len(history)) :]

    # And a floor under it, for the cases the memory cursor cannot cover: memory
    # switched off, or simply not summarized yet — the first fold only happens
    # once thirty-odd turns have piled up. Until then the trim above does nothing
    # and the whole transcript was going out every turn, growing without limit.
    # This drops the oldest turns instead, which is the same bargain the memory
    # cursor makes, minus the summary.
    limit = history_limit(state)
    if limit and len(history) > limit:
        logger.debug(
            f"Prompt history capped at {limit} of {len(history)} turns "
            f"({'memory has not folded them yet' if state.memory_enabled else 'story memory is off'})"
        )
        history = history[-limit:]

    # Lorebook is scanned against the real recent history regardless of whether
    # full context is enabled, so keyword triggers still fire in single-turn mode.
    lore_entries = scan_lorebook(
        getattr(state, "lorebook", []) or [],
        non_system,
        getattr(state, "lorebook_scan_depth", 4),
    )
    lore_block = apply_placeholders(render_lorebook_block(lore_entries), char, user)

    # Scene atmosphere: a persistent sense of place, injected alongside the
    # world knowledge so every reply stays grounded in the current setting.
    scene_block = build_scene_directive(state, char, user)

    # Story canon: the facts this story has already established, injected next to
    # the world knowledge. This is the preventive half of the Continuity Guard —
    # far cheaper than catching the contradiction after it has been written.
    canon_block = apply_placeholders(build_canon_block(state), char, user)

    # Open threads are not canon: they are unresolved matters that may pay off,
    # not facts or mandatory plot beats — which is why they ride with the standing
    # context rather than the steering, well away from the user's latest turn.
    # This block is already JSON-escaped. Replacing macros afterwards could let
    # quotes/newlines in a display name corrupt that boundary, so thread text
    # remains literal here (automatic threads already contain the actual names).
    threads_block = build_story_threads_block(state)

    # ----- One standing-context message ----------------------------------
    # Everything that is true regardless of who speaks next, in the order a reader
    # would want it: the contract and card, what has happened, what the world
    # contains, where we are, what is established, what is still open.
    standing = [
        block
        for block in (
            "\n\n".join(m.get("content", "") for m in system_msgs).strip(),
            memory_block,
            lore_block,
            scene_block,
            canon_block,
            threads_block,
        )
        if block and block.strip()
    ]
    messages: list[dict] = []
    if standing:
        messages.append({"role": "system", "content": "\n\n".join(standing)})

    # ----- One steering message for this reply ---------------------------
    # The Director's dials, who this character has become, what they are allowed
    # to know, the Author's Note, any armed correction, and the closing check.
    # Ordered weakest to strongest claim on the reply, so the most specific
    # instruction is the last one read.
    active_character = speaker or char
    study_block = build_study_block(state, active_character)
    sightlines_block = build_sightlines_block(state, active_character)

    # The Author's Note keeps its depth dial, because a reader who set it to 8 meant
    # something by it. Anything at depth 0 or 1 is already where the steering block
    # goes, so it simply rides along; deeper than that it is placed on its own, and
    # snapped to sit before a *user* turn. Landing between a user message and the
    # assistant's answer to it would split a matched pair, which some chat templates
    # refuse to render and none render well.
    note = (getattr(state, "author_note", "") or "").strip()
    note_block = (
        f"[Author's Note — guidance for the next response]\n{apply_placeholders(note, char, user)}"
        if note
        else ""
    )
    note_depth = max(0, int(getattr(state, "author_note_depth", 3) or 0))
    detached_note_at: int | None = None
    if note_block and note_depth >= 2:
        wanted = max(0, len(history) - note_depth)
        for index in range(wanted, len(history)):
            if history[index]["role"] == "user":
                detached_note_at = index
                break

    steering = [
        block
        for block in (
            build_style_directive(state, char, user),
            # The study has to outrank the character card far above it: the card is
            # who this character was written to be, this is who the story made them.
            study_block,
            # And Sightlines outranks everything above it, because all of it is full
            # of material this character may have no right to — the canon, the
            # memory, a scene they were absent from.
            sightlines_block,
            "" if detached_note_at is not None else note_block,
            # A correction is armed for exactly one regeneration. The model has just
            # demonstrated that reading the record once was not enough, so these
            # come after the records they refer to.
            apply_placeholders((getattr(state, "continuity_note", "") or "").strip(), char, user),
            apply_placeholders((getattr(state, "sightline_note", "") or "").strip(), char, user),
            apply_placeholders((getattr(state, "study_note", "") or "").strip(), char, user),
            # The selected identity is repeated close to the user's turn. A custom
            # card may omit {{char}}, and an older character may still be named in
            # history; neither should make "what is your name?" ambiguous.
            build_active_character_directive(active_character),
            build_final_reply_reminder(
                mood=bool(getattr(state, "include_mood", False)),
                auto_scene=bool(getattr(state, "auto_scene", False)),
                animation=bool(getattr(state, "include_animation", False)),
                adult_mode=bool(getattr(state, "adult_mode", False)),
            ),
        )
        if block and block.strip()
    ]

    # The steering goes immediately before the user's latest message, never after
    # it. One turn back is close enough to be obeyed, and it leaves the thing the
    # model is supposed to be answering as the most recent thing it has read.
    steering_msgs = [{"role": "system", "content": "\n\n".join(steering)}] if steering else []
    # Only when the user has just spoken is there anything to keep last. A group
    # scene handing off to the next speaker, or a character breaking a silence of
    # their own, ends on an assistant turn — and there the steering *is* the most
    # recent instruction, so it goes at the end where it belongs.
    last_user = len(history) - 1 if history and history[-1]["role"] == "user" else None
    # A deep Author's Note that lands on (or past) the steering slot has nowhere of
    # its own to go, so it joins the steering instead of producing two adjacent
    # system turns saying different things.
    if detached_note_at is not None and last_user is not None and detached_note_at >= last_user:
        detached_note_at = None
        existing = steering_msgs[0]["content"] if steering_msgs else ""
        steering_msgs = [
            {
                "role": "system",
                "content": f"{existing}\n\n{note_block}".strip() if existing else note_block,
            }
        ]

    for index, message in enumerate(history):
        if index == detached_note_at:
            messages.append({"role": "system", "content": note_block})
        if index == last_user:
            messages.extend(steering_msgs)
        messages.append(message)
    if last_user is None:
        if detached_note_at is None and note_block and note_depth >= 2:
            # The note wanted its own slot but every candidate position was behind
            # an assistant turn, so it rides with the steering rather than vanish.
            steering_msgs = steering_msgs or [{"role": "system", "content": ""}]
            joined = f"{steering_msgs[0]['content']}\n\n{note_block}".strip()
            steering_msgs = [{"role": "system", "content": joined}]
        messages.extend(steering_msgs)

    return messages
