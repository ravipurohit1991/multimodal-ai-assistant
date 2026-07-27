"""LLM integration module"""

from personaparlour.llm.base import LLMEngine
from personaparlour.llm.ollama import OllamaClient

__all__ = ["LLMEngine", "OllamaClient"]
