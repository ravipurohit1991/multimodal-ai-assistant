"""LLM integration module"""

from aiassistant.llm.base import LLMEngine
from aiassistant.llm.ollama import OllamaClient

__all__ = ["LLMEngine", "OllamaClient"]
