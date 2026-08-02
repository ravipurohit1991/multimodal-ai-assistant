"""Base class for Large Language Model engines"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable
from typing import AsyncGenerator


class LLMEngine(ABC):
    """Abstract base class for LLM engines"""

    @abstractmethod
    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        think: bool | None = None,
        options: dict | None = None,
        on_usage: Callable[[dict], None] | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        Stream chat completions from the LLM.

        Args:
            messages: List of message dictionaries with 'role' and 'content'
            model: Optional model name override
            think: Optional override for a reasoning model's deliberation —
                ``False`` for short structured side-tasks, ``None`` (the default)
                to leave the model's own behaviour alone. Engines that have no
                such notion may ignore it.
            options: Per-call sampling overrides (a token ceiling, stop
                sequences, and the like). Engines merge these over their own
                configured defaults.
            on_usage: Optional callback receiving the request's token accounting
                once the stream ends. Engines that cannot report it never call it.

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
