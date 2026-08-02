"""Turning the story's own cues into NeuTTS emotion tokens.

NeuTTS has no inline paralinguistic tags — nothing like Chatterbox's ``[laugh]``
that gets voiced mid-sentence.  What it has instead is a single *emotion token*
placed between the reference text and the line being spoken, drawn from a fixed
set the backbone was trained on (see ``EMOTIONS``), and only on BPE-format
backbones; the phoneme models reject it outright.  One utterance, one emotion.

So immersion here is a routing problem, not a markup problem: something has to
decide which of the seven tokens a given line is spoken with.  This module is
that something.  It reads the cues the roleplay already produces —

* ``[mood: wistful]`` — the hidden tag the chat prompt asks for, already parsed
  elsewhere for the UI, sticky for the rest of the reply;
* ``[laugh]``, ``[sigh]``, ``[gasp]`` — bare bracket tags a model reaches for on
  its own, which :class:`StreamingHiddenTagFilter` deliberately leaves on screen;
* ``*she snarls, backing away*`` — the asterisk action blocks that carry most of
  the performance in this app,

— and maps them onto the token set.  The mapping is deliberately generous: a
model writing in character reaches for "livid" or "crestfallen" far more often
than it reaches for "angry" or "sad", and a cue that lands on ``None`` is a line
spoken flat.

Nothing here imports the engine, so the routing can be tested without loading a
model.
"""

from __future__ import annotations

import re

# The seven tokens neutts-2e was trained on. Kept as a plain tuple rather than
# read from the model so that tag routing stays importable without a backbone;
# NeuTTSEngine intersects this with whatever the loaded model actually reports.
EMOTIONS: tuple[str, ...] = (
    "angry",
    "disgusted",
    "fearful",
    "happy",
    "neutral",
    "sad",
    "surprised",
)

# Mood/emotion words -> token. The left-hand side is what a character-voiced
# model actually writes; the right-hand side is all the model can say.
_SYNONYMS: dict[str, str] = {}


def _register(emotion: str, *words: str) -> None:
    for word in words:
        _SYNONYMS[word] = emotion


_register(
    "happy",
    "happy",
    "joyful",
    "joy",
    "delighted",
    "delight",
    "cheerful",
    "cheery",
    "amused",
    "amusement",
    "playful",
    "play",
    "flirty",
    "flirtatious",
    "teasing",
    "tease",
    "warm",
    "warmth",
    "excited",
    "excitement",
    "elated",
    "pleased",
    "glad",
    "giddy",
    "affectionate",
    "fond",
    "tender",
    "tenderness",
    "content",
    "contented",
    "proud",
    "pride",
    "hopeful",
    "hope",
    "smug",
    "mischievous",
    "eager",
    "thrilled",
    "relieved",
    "relief",
    "grateful",
    "loving",
    "adoring",
    "bright",
    "sunny",
    "triumphant",
    "confident",
    "buoyant",
)
_register(
    "sad",
    "sad",
    "sadness",
    "sorrow",
    "sorrowful",
    "melancholy",
    "melancholic",
    "wistful",
    "grieving",
    "grief",
    "heartbroken",
    "dejected",
    "forlorn",
    "lonely",
    "loneliness",
    "disappointed",
    "disappointment",
    "regretful",
    "regret",
    "somber",
    "sombre",
    "mournful",
    "crestfallen",
    "hurt",
    "defeated",
    "weary",
    "resigned",
    "hollow",
    "aching",
    "bereft",
    "despondent",
    "morose",
    "gloomy",
    "blue",
    "tearful",
)
_register(
    "angry",
    "angry",
    "anger",
    "furious",
    "fury",
    "irritated",
    "irritation",
    "annoyed",
    "annoyance",
    "enraged",
    "rage",
    "indignant",
    "cross",
    "livid",
    "resentful",
    "bitter",
    "hostile",
    "cold",
    "icy",
    "stern",
    "frustrated",
    "frustration",
    "exasperated",
    "seething",
    "incensed",
    "irate",
    "harsh",
    "sharp",
    "curt",
    "defiant",
    "vengeful",
    "impatient",
)
_register(
    "fearful",
    "fearful",
    "fear",
    "afraid",
    "scared",
    "terrified",
    "terror",
    "anxious",
    "anxiety",
    "nervous",
    "worried",
    "worry",
    "uneasy",
    "apprehensive",
    "panicked",
    "panic",
    "alarmed",
    "timid",
    "dread",
    "frightened",
    "shaken",
    "wary",
    "trembling",
    "hesitant",
    "tense",
    "spooked",
    "vulnerable",
)
_register(
    "surprised",
    "surprised",
    "surprise",
    "shocked",
    "shock",
    "astonished",
    "amazed",
    "amazement",
    "startled",
    "stunned",
    "incredulous",
    "bewildered",
    "awed",
    "awe",
    "astounded",
    "taken aback",
    "speechless",
    "dumbfounded",
    "flustered",
)
_register(
    "disgusted",
    "disgusted",
    "disgust",
    "repulsed",
    "revolted",
    "contemptuous",
    "contempt",
    "sickened",
    "appalled",
    "scornful",
    "scorn",
    "disdainful",
    "disdain",
    "revulsion",
    "queasy",
    "distaste",
    "withering",
)
_register(
    "neutral",
    "neutral",
    "calm",
    "flat",
    "composed",
    "steady",
    "quiet",
    "thoughtful",
    "curious",
    "serious",
    "measured",
    "even",
    "level",
    "detached",
    "matter-of-fact",
    "pensive",
    "focused",
    "guarded",
    "blank",
    "dry",
)

# Bare bracket tags a model emits inline, e.g. "[laugh] You're serious?".
# StreamingHiddenTagFilter keeps these on screen on purpose, so they are a real
# authoring channel rather than an accident.
_TAG_CUES: dict[str, str] = {}


def _register_tag(emotion: str, *words: str) -> None:
    for word in words:
        _TAG_CUES[word] = emotion


_register_tag(
    "happy",
    "laugh",
    "laughs",
    "laughter",
    "chuckle",
    "chuckles",
    "giggle",
    "giggles",
    "grin",
    "grins",
    "smile",
    "smiles",
    "beams",
    "hums",
    "sings",
)
_register_tag(
    "sad",
    "sigh",
    "sighs",
    "sob",
    "sobs",
    "cry",
    "cries",
    "weep",
    "weeps",
    "sniffle",
    "sniffles",
    "whimper",
)
_register_tag("surprised", "gasp", "gasps", "startle", "blink", "blinks")
_register_tag(
    "angry",
    "shout",
    "shouts",
    "yell",
    "yells",
    "scream",
    "screams",
    "snarl",
    "snarls",
    "growl",
    "growls",
    "snaps",
    "hiss",
    "hisses",
    "spits",
)
_register_tag("disgusted", "scoff", "scoffs", "sneer", "sneers", "gag", "gags", "retch")
_register_tag(
    "fearful",
    "tremble",
    "trembles",
    "shiver",
    "shivers",
    "flinch",
    "flinches",
    "stammer",
    "stammers",
    "gulp",
    "swallows",
)
_register_tag(
    "neutral",
    "whisper",
    "whispers",
    "murmur",
    "murmurs",
    "pause",
    "beat",
    "clears throat",
    "breath",
)

# Verbs inside *action blocks*. Narrower than the tag list: these have to survive
# appearing in ordinary prose, so ambiguous words ("snaps", "hums") are left out.
_PROSE_CUES: dict[str, str] = {
    "laughs": "happy",
    "laughing": "happy",
    "chuckles": "happy",
    "giggles": "happy",
    "grins": "happy",
    "smiles": "happy",
    "beams": "happy",
    "smirks": "happy",
    "brightens": "happy",
    "sighs": "sad",
    "sobs": "sad",
    "weeps": "sad",
    "cries": "sad",
    "sniffles": "sad",
    "deflates": "sad",
    "slumps": "sad",
    "gasps": "surprised",
    "startles": "surprised",
    "gapes": "surprised",
    "blinks": "surprised",
    "stares": "surprised",
    "snarls": "angry",
    "growls": "angry",
    "glares": "angry",
    "scowls": "angry",
    "snaps": "angry",
    "seethes": "angry",
    "bristles": "angry",
    "hisses": "angry",
    "scoffs": "disgusted",
    "sneers": "disgusted",
    "recoils": "disgusted",
    "grimaces": "disgusted",
    "gags": "disgusted",
    "trembles": "fearful",
    "shivers": "fearful",
    "flinches": "fearful",
    "whimpers": "fearful",
    "stammers": "fearful",
    "shrinks": "fearful",
    "whispers": "neutral",
    "murmurs": "neutral",
    "mutters": "neutral",
}

# "[mood: x]" / "[emotion: x]" — the hidden tag the chat prompt already asks for.
_MOOD_TAG_RE = re.compile(r"\[(?:mood|emotion|tone|feeling)\s*:\s*([^\]]{1,60})\]", re.IGNORECASE)
# A bare one/two-word bracket tag: "[laugh]", "[clears throat]". Anything longer,
# or carrying a colon, belongs to another tag family (IMAGE/SCENE/ANIM) and is
# left alone here.
_BARE_TAG_RE = re.compile(r"\[\s*([A-Za-z][A-Za-z ]{0,20})\s*\]")
# *action block* — the app's dominant way of writing performance.
_ACTION_RE = re.compile(r"\*([^*]{1,400})\*")
_WORD_RE = re.compile(r"[a-z][a-z'-]*")


def resolve_emotion(word: str | None) -> str | None:
    """Map a free-form mood word onto a supported emotion token.

    Returns ``None`` when nothing matches, which callers read as "speak it
    plainly" rather than as an error.
    """
    if not word:
        return None
    cleaned = re.sub(r"[^a-z\s'-]", " ", str(word).strip().lower()).strip()
    if not cleaned:
        return None
    if cleaned in _SYNONYMS:
        return _SYNONYMS[cleaned]
    # "quietly furious", "a little sad" — take the first word that is known, so a
    # qualifier in front of the real feeling does not throw the whole cue away.
    for token in _WORD_RE.findall(cleaned):
        if token in _SYNONYMS:
            return _SYNONYMS[token]
    return None


def emotion_from_mood_tag(text: str) -> str | None:
    """Read the last ``[mood: ...]`` tag in *text*, if any."""
    matches = _MOOD_TAG_RE.findall(text or "")
    for raw in reversed(matches):
        emotion = resolve_emotion(raw)
        if emotion:
            return emotion
    return None


def emotion_from_bare_tags(text: str) -> str | None:
    """Read the last bare paralinguistic tag — ``[laugh]``, ``[sigh]`` — in *text*."""
    for raw in reversed(_BARE_TAG_RE.findall(text or "")):
        key = " ".join(raw.lower().split())
        if key in _TAG_CUES:
            return _TAG_CUES[key]
        resolved = resolve_emotion(key)
        if resolved:
            return resolved
    return None


def emotion_from_action(text: str) -> str | None:
    """Read performance verbs out of ``*action blocks*`` in *text*."""
    found: str | None = None
    for block in _ACTION_RE.findall(text or ""):
        for token in _WORD_RE.findall(block.lower()):
            if token in _PROSE_CUES:
                found = _PROSE_CUES[token]
    return found


def strip_expression_tags(text: str) -> str:
    """Drop the tags this module reads, leaving text fit to speak.

    Only mood tags and recognised bare cues are removed; a bracket the router did
    not understand is left in place for the caller's own filtering, so this never
    silently eats an ``[IMAGE: ...]`` request.
    """
    without_mood = _MOOD_TAG_RE.sub(" ", text or "")

    def _drop_known(match: re.Match[str]) -> str:
        key = " ".join(match.group(1).lower().split())
        return " " if key in _TAG_CUES else match.group(0)

    cleaned = _BARE_TAG_RE.sub(_drop_known, without_mood)
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def extract_expression(text: str) -> tuple[str, str | None]:
    """Split *text* into (speakable text, emotion token).

    Used by the one-shot synthesis path, where a whole line arrives at once.
    Precedence runs explicit mood tag, then bare cue tag, then action prose.
    """
    emotion = (
        emotion_from_mood_tag(text) or emotion_from_bare_tags(text) or emotion_from_action(text)
    )
    return strip_expression_tags(text), emotion


class StreamingExpressionTracker:
    """Follows the raw reply stream and says how the next phrase should sound.

    The TTS text is filtered long before synthesis — :class:`StreamingTextFilter`
    strips brackets and asterisk blocks so only spoken words are voiced — which
    means the cues have already been discarded by the time a phrase is ready.
    So this reads the *unfiltered* deltas in parallel and keeps a running answer.

    Two levels, because they behave differently: a ``[mood: ...]`` tag is the
    character's standing state and holds for the rest of the reply, while a
    ``*she laughs*`` or ``[gasp]`` colours the line it introduces and then gets
    out of the way.
    """

    # Enough to hold a split-across-deltas tag or action block without letting a
    # never-closed asterisk grow the buffer for the length of a novella.
    _MAX_BUFFER = 600

    def __init__(self, default: str | None = None):
        self.mood: str | None = resolve_emotion(default) if default else None
        self.pending: str | None = None
        self._buffer = ""

    def process(self, delta: str) -> None:
        """Feed one raw stream delta; complete cues update the running state."""
        if not delta:
            return
        self._buffer += delta

        consumed_to = 0
        for match in _MOOD_TAG_RE.finditer(self._buffer):
            emotion = resolve_emotion(match.group(1))
            if emotion:
                self.mood = emotion
                # A fresh standing mood outranks a cue queued before it.
                self.pending = None
            consumed_to = match.end()

        for match in _BARE_TAG_RE.finditer(self._buffer):
            key = " ".join(match.group(1).lower().split())
            if key in _TAG_CUES:
                self.pending = _TAG_CUES[key]
                consumed_to = max(consumed_to, match.end())

        for match in _ACTION_RE.finditer(self._buffer):
            emotion = emotion_from_action(match.group(0))
            if emotion:
                self.pending = emotion
            consumed_to = max(consumed_to, match.end())

        if consumed_to:
            self._buffer = self._buffer[consumed_to:]

        if len(self._buffer) > self._MAX_BUFFER:
            # Keep the tail: an unterminated "*" early on must not pin the buffer.
            self._buffer = self._buffer[-self._MAX_BUFFER :]

    def take(self) -> str | None:
        """Emotion for the phrase about to be synthesized, consuming one-shot cues."""
        if self.pending is not None:
            emotion, self.pending = self.pending, None
            return emotion
        return self.mood

    def peek(self) -> str | None:
        """Current emotion without consuming the one-shot cue."""
        return self.pending if self.pending is not None else self.mood
