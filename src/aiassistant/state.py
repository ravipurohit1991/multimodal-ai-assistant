"""
Connection State Management - Tracks WebSocket connection state and conversation history
"""

import asyncio
from dataclasses import dataclass, field, fields

from aiassistant.config import config
from aiassistant.prompts import DEFAULT_ROLEPLAY_PROMPT, build_chat_system_prompt


def get_system_prompt_for_tts_engine(engine_name: str) -> str:
    """Return a safe initial prompt until the frontend sends character settings."""
    return (
        build_chat_system_prompt(DEFAULT_ROLEPLAY_PROMPT)
        .replace("{{char}}", "Assistant")
        .replace("{{user}}", "User")
    )


@dataclass
class ConnState:
    """WebSocket connection state"""

    messages: list[dict[str, str]] = field(
        default_factory=lambda: [
            {"role": "system", "content": get_system_prompt_for_tts_engine(config.tts_engine)}
        ]
    )
    user_audio: bytearray = field(default_factory=bytearray)
    recording: bool = False
    llm_task: asyncio.Task | None = None
    speaking: bool = False
    use_context: bool = True  # Whether to include previous messages
    include_imagegen: bool = (
        config.imagegen_enabled
    )  # Whether to include image generation in system prompt
    llm_model: str | None = config.llm_model  # Current LLM model (None until chosen)
    llm_host: str = config.llm_host  # LLM host URL
    output_mode: str = config.output_mode  # Output mode: "voice" or "text"
    tts_engine_type: str = config.tts_engine  # Track which TTS engine is being used
    character_description: str = ""  # Character description for consistent image generation
    # ----- Roleplay enrichment -----
    # Character / user names used to expand {{char}} / {{user}} macros in prompts
    char_name: str = "Assistant"
    user_name: str = "User"
    # Lorebook / World Info: keyword-triggered facts injected into LLM context
    lorebook: list[dict] = field(default_factory=list)
    lorebook_scan_depth: int = 4  # How many recent messages to scan for keywords
    # Author's Note: persistent steering text injected near the end of history
    author_note: str = ""
    author_note_depth: int = 3
    # Whether the character should emit a [mood: ...] tag each reply
    include_mood: bool = False
    # Whether the character should emit high-level [ANIM: ...] acting tags
    include_animation: bool = False
    # Adult mode: opt-in content for this session. Off until the UI asks
    # for it, so a fresh connection is always the tamer default.
    adult_mode: bool = False

    # ----- Director / scene-style controls -----
    # Persistent dials shaping every reply (see roleplay.build_style_directive)
    response_length: str = "normal"  # brief | normal | detailed | novella
    narration_perspective: str = "default"  # default | first | third
    pacing: str = "steady"  # slow | steady | advance
    # One-shot steering cue, consumed (cleared) after the next reply is built
    director_beat: str = ""

    # ----- Scene atmosphere (living-world grounding) -----
    # A persistent sense of place the character stays grounded in. Injected into
    # every turn (see roleplay.build_scene_directive) and mirrored in the UI's
    # ambient theming. All optional — an empty scene contributes nothing.
    scene_time: str = ""  # dawn | morning | midday | afternoon | dusk | night
    scene_weather: str = ""  # clear | cloudy | rain | storm | snow | fog | wind
    scene_location: str = ""  # free-form place, e.g. "a candlelit tavern"
    # When on, the character may emit hidden [SCENE: ...] tags to advance the
    # setting itself, and the backend applies them (see roleplay.parse_scene_tag).
    auto_scene: bool = False

    # ----- Idle presence (the character speaks first) -----
    # When the user goes quiet, the character may take a turn unprompted instead
    # of waiting to be spoken to. The UI owns the clock (it can see typing, mic
    # and window focus) and asks; the backend owns whether the ask is granted.
    # Off by default, so nothing ever speaks up uninvited unless asked to.
    presence_mode: str = "off"  # off | rarely | often
    presence_idle_seconds: int = 90  # quiet window before the UI nudges
    presence_beats: int = 0  # unprompted turns taken since the user last spoke
    presence_cursor: int = 0  # rotates the kind of beat, so they do not repeat

    # ----- Story Memory (rolling long-term summary) -----
    # Older turns are folded into an LLM-written "story so far" and replaced in
    # the prompt by that record, so a long roleplay keeps its continuity without
    # resending (or silently losing) the whole transcript. Inert until the first
    # summary exists, so short conversations behave exactly as before.
    memory_enabled: bool = True
    memory_auto: bool = True  # summarize on its own once the backlog is big enough
    memory_summary: str = ""  # the running record, editable from the UI
    memory_covered: int = 0  # how many user/assistant turns the record covers
    memory_keep_recent: int = 12  # recent turns always sent verbatim
    memory_trigger: int = 20  # backlog size that triggers an automatic pass
    memory_task: asyncio.Task | None = None  # in-flight summarization, if any

    # ----- Continuity Guard (the story's canon) -----
    # A ledger of durable facts the story has established. Injected into every
    # turn so contradictions mostly never get written, and checked against each
    # new reply so the ones that slip through are caught while they are still
    # the latest message. Off by default: it costs one extra generation per
    # reply, which on modest hardware is a real price to pay.
    continuity_enabled: bool = False
    continuity_auto: bool = True  # check every reply, rather than only on request
    canon: list[dict] = field(default_factory=list)  # the ledger, editable from the UI
    canon_covered: int = 0  # turns the ledger has been read against
    continuity_alert: dict | None = None  # the unresolved contradiction, if any
    continuity_note: str = ""  # one-shot correction armed for a reroll
    continuity_task: asyncio.Task | None = None  # in-flight check, if any

    # ----- Story Threads (unresolved narrative matters) -----
    # This ledger is deliberately separate from canon: canon says what is true,
    # while threads say what remains dramatically open. The tracker runs after a
    # reply and never delays the visible response.
    story_threads_enabled: bool = True
    story_threads_auto: bool = True
    story_threads: list[dict] = field(default_factory=list)
    story_threads_covered: int = 0
    story_threads_task: asyncio.Task | None = None

    # ----- Sightlines (who knows what) -----
    # Every other ledger here is global, which quietly makes each cast member
    # omniscient. This one is scoped: an entry records something *and* who is in
    # on it, and the reply prompt is assembled for the character about to speak.
    # Enabled by default because the preventive half is pure filtering and an
    # empty ledger changes no prompt at all; the watching half (``auto``) costs a
    # background pass per reply and is opt-in, like the Continuity Guard.
    sightlines_enabled: bool = True
    sightlines_auto: bool = False
    sightlines: list[dict] = field(default_factory=list)
    sightlines_covered: int = 0  # turns the ledger has been read against
    sightline_alert: dict | None = None  # the unresolved leak, if any
    sightline_note: str = ""  # one-shot correction armed for a reroll
    sightlines_task: asyncio.Task | None = None
    # The in-scene cast, as the browser last reported it. The roster itself lives
    # in the frontend; the backend needs only the names, so it can tell who is
    # being kept out of what.
    cast: list[str] = field(default_factory=list)

    # Local models generally serialize work internally and can run out of memory
    # when several auxiliary passes arrive together. WebSocket orchestration uses
    # this per-connection lock to serialize memory, continuity, and thread upkeep
    # without blocking the foreground reply stream.
    auxiliary_lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)


async def cancel_llm(state: ConnState):
    """Cancel ongoing LLM task"""
    if state.llm_task and not state.llm_task.done():
        state.llm_task.cancel()
        try:
            await state.llm_task
        except asyncio.CancelledError:
            pass
    state.llm_task = None


async def cancel_memory(state: ConnState):
    """Cancel an in-flight Story Memory pass.

    Kept separate from ``cancel_llm`` on purpose: interrupting the assistant
    should never throw away a summary that is already halfway written.
    """
    if state.memory_task and not state.memory_task.done():
        state.memory_task.cancel()
        try:
            await state.memory_task
        except asyncio.CancelledError:
            pass
    state.memory_task = None


async def cancel_continuity(state: ConnState):
    """Cancel an in-flight Continuity Guard pass.

    Separate from the other two for the same reason: a user interrupting the
    assistant, or a memory pass finishing, has nothing to do with a check that is
    already reading the previous reply.
    """
    if state.continuity_task and not state.continuity_task.done():
        state.continuity_task.cancel()
        try:
            await state.continuity_task
        except asyncio.CancelledError:
            pass
    state.continuity_task = None


async def cancel_story_threads(state: ConnState):
    """Cancel an in-flight Story Threads pass without touching other work."""
    if state.story_threads_task and not state.story_threads_task.done():
        state.story_threads_task.cancel()
        try:
            await state.story_threads_task
        except asyncio.CancelledError:
            pass
    state.story_threads_task = None


async def cancel_sightlines(state: ConnState):
    """Cancel an in-flight Sightlines pass without touching other work."""
    if state.sightlines_task and not state.sightlines_task.done():
        state.sightlines_task.cancel()
        try:
            await state.sightlines_task
        except asyncio.CancelledError:
            pass
    state.sightlines_task = None


async def wipe_connection_state(state: ConnState) -> None:
    """Return every per-connection field to the same state as a fresh socket.

    Wipe used to maintain a hand-written list of whichever features existed when
    it was added. Newer fields consequently survived until the browser happened
    to reconnect. Replacing every dataclass field from a fresh ``ConnState``
    makes the contract future-proof: adding a field automatically adds it to the
    wipe, while preserving the state object's identity captured by WebSocket
    helper closures.
    """

    await cancel_llm(state)
    await cancel_memory(state)
    await cancel_continuity(state)
    await cancel_story_threads(state)
    await cancel_sightlines(state)

    fresh = ConnState()
    for state_field in fields(ConnState):
        setattr(state, state_field.name, getattr(fresh, state_field.name))
