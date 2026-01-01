"""Base class for Large Language Model engines"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncGenerator


class LLMEngine(ABC):
    """Abstract base class for LLM engines"""

    @abstractmethod
    async def stream_chat(
        self, messages: list[dict[str, str]], model: str | None = None
    ) -> AsyncGenerator[str, None]:
        """
        Stream chat completions from the LLM.

        Args:
            messages: List of message dictionaries with 'role' and 'content'
            model: Optional model name override

        Yields:
            Text deltas from the model
        """
        pass

    @abstractmethod
    async def list_models(self) -> list[str]:
        """
        List available models.

        Returns:
            List of model names
        """
        pass

    @abstractmethod
    def get_info(self) -> dict:
        """
        Get information about the LLM engine.

        Returns:
            Dictionary with engine info (name, host, default_model, etc.)
        """
        pass
