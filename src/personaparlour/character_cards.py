"""
Character forge — invent a whole character card with the model.

Two jobs, one path. Given a guiding line ("a tired night nurse who used to sing
professionally") it writes that character. Given nothing at all it invents one
outright.

The second job is the hard one, and not for the reason it looks like. A model
asked for "a random character" is not random in any useful sense: it returns
Elara or Kaelen, an elf or a ranger, with striking emerald eyes and a mysterious
past, essentially every time. Ask twice and you get the same person twice. The
temperature dial does not fix it either — that shuffles wording, not the shape of
the idea underneath.

So the randomness is made here, in Python, and handed to the model as
constraints it has to satisfy: a setting, a trade, an age, a temperament, a
speech register, a habit, something they want, something they are hiding, and a
naming tradition to draw the name from. The model's job stops being "invent
someone" — which it does badly, by reaching for the median of everything it has
read — and becomes "write the person these constraints describe", which it does
well. The overused names are also named explicitly and forbidden, because that
one failure is stubborn enough to deserve its own rule.

When a guiding line *is* supplied it outranks everything: only the dimensions the
guidance leaves silent are seeded, and any seed that argues with it is dropped
rather than blended. A user who asks for a blacksmith should never be handed a
blacksmith on a generation ship because the dice said so.
"""

from __future__ import annotations

import json
import random
import re

from personaparlour.llm import OllamaClient
from personaparlour.prompts import build_character_card_messages
from personaparlour.utils import logger

# Field ceilings. A card is a page, not a novella: an enormous description is
# mostly filler, and it crowds the actual conversation out of the context window.
MAX_NAME_CHARS = 48
MAX_DESCRIPTION_CHARS = 1400
MAX_PERSONALITY_CHARS = 400
MAX_FIRST_MESSAGE_CHARS = 900

GENERATE_TIMEOUT_SECONDS = 240
MAX_GENERATE_CHARS = 6000

RETRY_REMINDER = (
    "Your previous answer was not valid JSON. Answer again with the JSON object "
    "alone — no explanation, no markdown fence, no text before or after it. The "
    'shape is {"name":"","description":"","personality":"","first_message":""}.'
)


# ----- The dice -----------------------------------------------------------
# Deliberately mundane and specific. "Warrior", "mage" and "assassin" are the
# answers a model reaches for unprompted, so they are exactly what these lists
# leave out: a character is interesting because of a trade and a friction, not
# because of a class.

SETTINGS = (
    "a rust-belt town whose factory closed a decade ago",
    "a generation ship eleven years from anywhere",
    "an Edo-period coastal fishing village",
    "a late-Soviet apartment block with one working lift",
    "an offshore drilling rig in bad weather",
    "a hill monastery in the third year of a drought",
    "a floating night market built across moored barges",
    "a provincial university department with no money",
    "a mining colony under a sky that is never dark",
    "a seaside hotel out of season",
    "a walled city where it has rained for a month",
    "a long-haul freight train crossing a continent",
    "a field hospital behind a stalled front line",
    "a family vineyard being sold against everyone's wishes",
    "a lighthouse the automation crews are coming to decommission",
    "a border town where two languages are spoken badly",
    "an archive beneath a building scheduled for demolition",
    "a desert waystation on a road nobody takes anymore",
)

TRADES = (
    "locksmith", "night nurse", "tax assessor", "ferry pilot", "choir director",
    "court translator", "large-animal vet", "watch repairer", "prison chaplain",
    "seed librarian", "bridge inspector", "funeral photographer", "sommelier",
    "radio operator", "midwife", "cartographer", "piano tuner", "arson investigator",
    "beekeeper", "stage manager", "hydrologist", "tailor", "harbour master",
    "puppeteer", "epidemiologist", "bell founder", "sign painter", "diver",
)

AGES = (
    "barely twenty and pretending otherwise",
    "in their late twenties",
    "in their thirties",
    "in their forties",
    "in their fifties",
    "old enough to have outlived most of the people in this story",
)

TEMPERAMENTS = (
    "relentlessly cheerful in a way that is clearly load-bearing",
    "patient to the point of being unnerving",
    "quick-tempered and quicker to apologise",
    "gentle with strangers and merciless with intimates",
    "incurably curious about other people's business",
    "self-deprecating as a defensive weapon",
    "formal, and warmer than the formality suggests",
    "tired in a way that sleep does not fix",
    "competitive about things that do not matter",
    "unbothered by almost everything, which is itself a tell",
    "hungry to be taken seriously",
    "kind in deeds and graceless in words",
)

REGISTERS = (
    "clipped — rarely finishes a sentence somebody else could finish",
    "digressive, always arriving by the long way round",
    "dry, and funniest when apparently serious",
    "formal and old-fashioned, even when swearing",
    "plain and concrete, allergic to abstraction",
    "questioning — answers by asking something back",
    "voluble, then abruptly silent when it matters",
    "precise, correcting small inaccuracies out of reflex",
    "warm and overfamiliar within a minute of meeting anyone",
    "profane, cheerfully and inventively",
)

HABITS = (
    "cannot be in a room without straightening something",
    "eats while working and never sits to do it",
    "quotes their own mother, always disapprovingly",
    "keeps a running tally of favours owed in both directions",
    "hums when concentrating and denies it",
    "touches doorframes on the way through",
    "refuses to be photographed",
    "answers difficult questions while walking away",
    "takes notes on conversations, in front of the person",
    "always has food to give someone",
    "sits where they can see the exit",
    "makes tea instead of answering",
)

WANTS = (
    "to be forgiven by someone who will not discuss it",
    "to finish a piece of work nobody has asked for",
    "to get one specific person out of this place",
    "to be believed about something they cannot prove",
    "to stop being the reliable one",
    "to buy back something their family sold",
    "to see whether they are still any good at it",
    "to keep a promise they made to a dead person",
    "to be chosen, for once, first",
    "to leave, and be asked to stay",
)

SECRETS = (
    "they are the reason it happened, and nobody has worked that out",
    "they are far more afraid than they let anyone see",
    "they have been sending money somewhere for years",
    "they cannot do the thing everyone believes they are best at, not anymore",
    "they read something they were not meant to read",
    "they are not who their papers say they are",
    "they have already decided to go",
    "they are in love with entirely the wrong person",
    "they lied at the beginning and have been maintaining it since",
    "they are dying, slowly, and telling nobody",
)

NAME_TRADITIONS = (
    "Brazilian Portuguese", "Yoruba", "Finnish", "Punjabi", "Greek", "Vietnamese",
    "Scottish", "Amharic", "Hungarian", "Tamil", "Quebecois French", "Farsi",
    "Polish", "Māori", "Icelandic", "Egyptian Arabic", "Korean", "Basque",
    "Ukrainian", "Bengali", "Dutch", "Turkish", "Mexican Spanish", "Filipino",
)

# The names a model hands back when it is asked to invent one. Naming them in the
# prompt is inelegant and it works, which in this case is the whole argument.
OVERUSED_NAMES = (
    "Elara", "Kaelen", "Lyra", "Seraphina", "Aria", "Zephyr", "Thorne", "Ravenna",
    "Isolde", "Caspian", "Lucian", "Rowan", "Sylvara", "Eldrin", "Nyx", "Kai",
    "Aeloria", "Vesper", "Orion", "Amara", "Silas", "Wren", "Lilith", "Draven",
)

# What a guiding line is allowed to be seeded with. Setting, trade and age are
# the dimensions a user's own line most often fixes itself, so seeding them is how
# you end up overriding the very request you were given.
GUIDED_DIMENSIONS = ("temperament", "register", "habit", "want", "secret")


def roll_seed(guided: bool = False, rng: random.Random | None = None) -> dict[str, str]:
    """Roll the constraints the model has to satisfy.

    ``guided`` narrows the roll to the dimensions a user's own description rarely
    pins down, so the dice fill gaps instead of contradicting the request.
    """
    dice = rng or random.SystemRandom()
    seed = {
        "setting": dice.choice(SETTINGS),
        "trade": dice.choice(TRADES),
        "age": dice.choice(AGES),
        "temperament": dice.choice(TEMPERAMENTS),
        "register": dice.choice(REGISTERS),
        "habit": dice.choice(HABITS),
        "want": dice.choice(WANTS),
        "secret": dice.choice(SECRETS),
        "name_tradition": dice.choice(NAME_TRADITIONS),
    }
    if guided:
        return {key: value for key, value in seed.items() if key in GUIDED_DIMENSIONS}
    return seed


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


def _one_line(value: object, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value).strip()[:limit]


def _truncate(text: str, limit: int) -> str:
    """Cut to the limit at a sentence end, or failing that a word boundary.

    A hard slice leaves a card ending "he has been quietly s", which reads as a
    bug in the app rather than a long-winded model — and the user has to fix it by
    hand before the character is usable.
    """
    if len(text) <= limit:
        return text
    clipped = text[:limit]
    sentence_end = max(clipped.rfind(". "), clipped.rfind(".\n"), clipped.rfind("? "))
    if sentence_end >= limit // 2:
        return clipped[: sentence_end + 1].strip()
    # No sentence to end on, so break on a word and mark the cut. The ellipsis is
    # part of the budget: a stated ceiling that the ceiling itself exceeds is not
    # one, and every caller here is guarding a real prompt-size limit.
    room = text[: limit - 1]
    space = room.rfind(" ")
    return (room[:space] if space >= limit // 2 else room).strip() + "…"


def _prose(value: object, limit: int) -> str:
    """Keep paragraph breaks, drop the markdown a model decorates them with."""
    if not isinstance(value, str):
        return ""
    text = value.replace("\r\n", "\n")
    text = re.sub(r"^\s*#{1,6}\s*", "", text, flags=re.MULTILINE)  # headings
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)  # bold, which is never wanted here
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return _truncate(text.strip(), limit)


def _clean_name(value: object) -> str:
    """A name, without the label or quotation a model wraps it in."""
    name = _one_line(value, MAX_NAME_CHARS * 2)
    name = re.sub(r"^(?:name|character)\s*[:\-]\s*", "", name, flags=re.IGNORECASE)
    name = name.strip("\"'“”‘’*_ ")
    # A model that ignores the schema sometimes answers with a whole sentence.
    return name[:MAX_NAME_CHARS].strip()


def unique_name(name: str, taken: list[str]) -> str:
    """Keep a generated name distinct from the roster.

    Not cosmetic: a Character Study is keyed by character name, so two cast
    members sharing one would quietly share a sheet — and be written as each other.
    """
    existing = {re.sub(r"\s+", " ", str(n or "")).strip().casefold() for n in taken}
    if not name:
        return name
    if name.casefold() not in existing:
        return name
    for suffix in range(2, 100):
        candidate = f"{name} {suffix}"
        if candidate.casefold() not in existing:
            return candidate
    return name


def parse_card(payload: dict, taken: list[str] | None = None) -> dict | None:
    """Turn the model's answer into a character card, or ``None`` if unusable.

    A card with no name or nothing to say about who they are is not a card, and
    handing the roster a blank entry is worse than reporting the failure.
    """
    if not isinstance(payload, dict):
        return None
    name = unique_name(_clean_name(payload.get("name")), taken or [])
    description = _prose(payload.get("description"), MAX_DESCRIPTION_CHARS)
    if not name or not description:
        logger.warning("Character card rejected: no usable name or description")
        return None
    return {
        "name": name,
        "description": description,
        "personality": _prose(
            payload.get("personality") or payload.get("traits"), MAX_PERSONALITY_CHARS
        ),
        "first_message": _prose(
            payload.get("first_message") or payload.get("greeting"), MAX_FIRST_MESSAGE_CHARS
        ),
    }


# ----- The pass -----------------------------------------------------------


async def _generate(state, messages: list[dict]) -> str:
    """One generation, with deliberation off — this asks for JSON, not thought."""
    raw = ""
    client = OllamaClient(host=state.llm_host, default_model=state.llm_model)
    async for delta in client.stream_chat(messages, model=state.llm_model, think=False):
        raw += delta
        if len(raw) > MAX_GENERATE_CHARS:
            break
    return raw


async def generate_card(
    state,
    guidance: str = "",
    rng: random.Random | None = None,
) -> dict | None:
    """Invent one character card, guided or from nothing.

    Returns the card fields for the roster, or ``None`` when there is no model or
    the answer could not be read twice running.
    """
    if not state.llm_model:
        logger.warning("Character generation skipped: no LLM model selected")
        return None

    guide = (guidance or "").strip()[:600]
    seed = roll_seed(guided=bool(guide), rng=rng)
    cast = [
        str(name).strip()
        for name in (getattr(state, "cast", []) or [])
        if str(name).strip()
    ]
    scene = " ".join(
        part
        for part in (
            getattr(state, "scene_location", "") or "",
            getattr(state, "scene_time", "") or "",
            getattr(state, "scene_weather", "") or "",
        )
        if part
    ).strip()

    messages = build_character_card_messages(
        guide,
        seed,
        cast=cast,
        scene=scene,
        user_name=getattr(state, "user_name", "") or "",
        avoid_names=list(OVERUSED_NAMES),
    )
    raw = await _generate(state, messages)
    payload = _parse_json_object(raw)
    if payload is None:
        # Small models drop the contract every so often and answer in prose. One
        # more try costs a few seconds; giving up costs the user the feature.
        logger.info("Character generation answered in prose; asking once more")
        raw = await _generate(state, [*messages, {"role": "system", "content": RETRY_REMINDER}])
        payload = _parse_json_object(raw)
    if payload is None:
        logger.warning("Character generation returned nothing parseable")
        return None

    card = parse_card(payload, cast)
    if card:
        logger.info(
            f"Character invented: {card['name']} "
            f"({'guided' if guide else 'from the dice'}, "
            f"{len(card['description'])} chars of description)"
        )
    return card
