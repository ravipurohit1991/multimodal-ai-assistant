"""LLM integration module"""

from personaparlour.llm.base import LLMEngine
from personaparlour.llm.ollama import (
    OllamaClient,
    default_chat_options,
    get_chat_client,
    structured_pass_options,
)

__all__ = [
    "LLMEngine",
    "OllamaClient",
    "default_chat_options",
    "get_chat_client",
    "structured_pass_options",
]
