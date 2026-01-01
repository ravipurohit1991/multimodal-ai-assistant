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
    include_imagegen: bool = True  # Whether to include image generation in system prompt
    llm_model: str = config.llm_model  # Current LLM model
    llm_host: str = config.llm_host  # LLM host URL
    output_mode: str = "voice"  # Output mode: "voice" or "text"
    tts_engine_type: str = config.tts_engine  # Track which TTS engine is being used
    character_description: str = ""  # Character description for consistent image generation
    user_character_image: str = ""  # Path to user's character image
    assistant_character_image: str = ""  # Path to assistant's character image


async def cancel_llm(state: ConnState):
    """Cancel ongoing LLM task"""
    if state.llm_task and not state.llm_task.done():
        state.llm_task.cancel()
        try:
            await state.llm_task
        except asyncio.CancelledError:
            pass
    state.llm_task = None
