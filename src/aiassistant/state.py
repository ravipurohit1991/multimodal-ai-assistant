"""
Connection State Management - Tracks WebSocket connection state and conversation history
"""

import asyncio
from dataclasses import dataclass, field

from aiassistant.config import config


def get_system_prompt_for_tts_engine(engine_name: str) -> str:
    """Generate basic system prompt - tags will be added by set_system_prompt handler"""
    return "You are a helpful voice assistant. Keep answers conversational and concise."


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
    llm_model: str = config.llm_model  # Current LLM model
    llm_host: str = config.llm_host  # LLM host URL
    output_mode: str = config.output_mode  # Output mode: "voice" or "text"
    tts_engine_type: str = config.tts_engine  # Track which TTS engine is being used
    character_description: str = ""  # Character description for consistent image generation
    # ----- Roleplay enrichment -----
    # Character / user names used to expand {{char}} / {{user}} macros in prompts
    char_name: str = ""
    user_name: str = ""
    # Lorebook / World Info: keyword-triggered facts injected into LLM context
    lorebook: list[dict] = field(default_factory=list)
    lorebook_scan_depth: int = 4  # How many recent messages to scan for keywords
    # Author's Note: persistent steering text injected near the end of history
    author_note: str = ""
    author_note_depth: int = 3
    # Whether the character should emit a [mood: ...] tag each reply
    include_mood: bool = False

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


async def cancel_llm(state: ConnState):
    """Cancel ongoing LLM task"""
    if state.llm_task and not state.llm_task.done():
        state.llm_task.cancel()
        try:
            await state.llm_task
        except asyncio.CancelledError:
            pass
    state.llm_task = None
