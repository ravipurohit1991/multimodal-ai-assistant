"""Ollama LLM client"""

from __future__ import annotations

import asyncio
import json
import re
from typing import AsyncGenerator

import httpx

from aiassistant.llm.base import LLMEngine
from aiassistant.utils import logger


class OllamaClient(LLMEngine):
    """Client for Ollama LLM API"""

    def __init__(
        self,
        host: str,
        default_model: str | None = None,
        device: str = "auto",
        keep_alive: str = "5m",
    ):
        """
        Initialize Ollama client.

        Args:
            host: Ollama API host URL
            default_model: Default model to use
            device: Device preference for local models ('auto', 'cuda', 'cpu')
            keep_alive: How long to keep models loaded (e.g., '5m', '1h', '0' for immediate unload)
        """
        self.host = host.rstrip("/")
        self.default_model = default_model
        self.device = device
        self.keep_alive = keep_alive
        self._is_local = self._check_if_local()
        self._memory_footprint_mb = 0.0
        self._last_model_info = {}

    async def stream_chat(
        self, messages: list[dict[str, str]], model: str | None = None, think: bool | None = None
    ) -> AsyncGenerator[str, None]:
        """
        Stream chat completions from Ollama API.

        Args:
            messages: List of message dictionaries with 'role' and 'content'
            model: Model name (uses default if not specified)
            think: Override the model's reasoning. ``False`` turns thinking off,
                which matters for short structured side-tasks (JSON answers for
                continuity checks and the like): a reasoning model can spend
                minutes deliberating over a question worth a few tokens, and none
                of that reasoning reaches the caller anyway. ``None`` leaves the
                model's own default alone, which is what conversation wants.

        Yields:
            Text deltas from the model
        """
        if model is None and self.default_model is None:
            raise ValueError("No model specified and no default model set")

        url = f"{self.host}/api/chat"
        headers = {}
        requested_model = model or self.default_model
        attempted_models: set[str] = set()
        candidate_models = [requested_model]
        think_option = think

        while candidate_models:
            current_model = candidate_models.pop(0)
            if current_model in attempted_models:
                continue
            attempted_models.add(current_model)

            payload = {
                "model": current_model,
                "messages": messages,
                "stream": True,
                "keep_alive": self.keep_alive,
            }
            if think_option is not None:
                payload["think"] = think_option

            try:
                async with httpx.AsyncClient(timeout=None) as client:
                    async with client.stream("POST", url, headers=headers, json=payload) as r:
                        if r.is_error:
                            error_text = await self._extract_error_text(r)

                            # A model with no reasoning to switch off rejects the
                            # option outright. Nothing was asked for that it cannot
                            # already do, so drop it and ask again.
                            if think_option is not None and self._is_thinking_unsupported_error(
                                r.status_code, error_text
                            ):
                                logger.debug(
                                    f"LLM model '{current_model}' does not take a thinking "
                                    f"option; retrying without it."
                                )
                                think_option = None
                                attempted_models.discard(current_model)
                                candidate_models.insert(0, current_model)
                                continue

                            model_missing = self._is_model_not_found_error(
                                r.status_code, error_text
                            )

                            if model_missing:
                                fallback_model = await self._pick_fallback_model(current_model)
                                if fallback_model and fallback_model not in attempted_models:
                                    logger.warning(
                                        f"LLM model '{current_model}' not found on {self.host}. "
                                        f"Retrying with '{fallback_model}'."
                                    )
                                    candidate_models.append(fallback_model)
                                    continue

                            detail = f"{r.status_code} for {url}"
                            if error_text:
                                detail = f"{detail}: {error_text}"
                            raise RuntimeError(f"LLM request failed ({current_model}) - {detail}")

                        async for line in r.aiter_lines():
                            if not line:
                                continue
                            try:
                                obj = json.loads(line)
                            except json.JSONDecodeError:
                                continue

                            # Ollama chat streaming returns partial message content
                            if obj.get("message") and obj["message"].get("content"):
                                yield obj["message"]["content"]

                            if obj.get("done"):
                                break

                # Successful completion; do not try more candidates.
                return

            except Exception:
                # Preserve original traceback for non-HTTP errors.
                raise

    async def _extract_error_text(self, response: httpx.Response | None) -> str:
        """Extract readable error text from Ollama/OpenAI-compatible error payloads."""
        if response is None:
            return ""

        try:
            raw_content = await response.aread()
        except Exception:
            return ""

        if not raw_content:
            return ""

        try:
            data = json.loads(raw_content)
            if isinstance(data, dict):
                if isinstance(data.get("error"), str):
                    return data["error"]
                if isinstance(data.get("error"), dict):
                    return str(data["error"].get("message", ""))
            return raw_content.decode("utf-8", errors="replace").strip()
        except Exception:
            return raw_content.decode("utf-8", errors="replace").strip()

    def _is_thinking_unsupported_error(self, status_code: int, error_text: str) -> bool:
        """Return True when the server rejected the request over the thinking option."""
        if status_code not in (400, 422):
            return False
        return "think" in (error_text or "").lower()

    def _is_model_not_found_error(self, status_code: int, error_text: str) -> bool:
        """Return True when response indicates requested model does not exist."""
        if status_code != 404:
            return False
        err = (error_text or "").lower()
        return "model" in err and "not found" in err

    async def _pick_fallback_model(self, requested_model: str) -> str | None:
        """Pick a sensible fallback model from available Ollama tags."""
        available_models = await self.list_models()
        if not available_models:
            return None

        requested_lower = requested_model.lower()

        # Prefer newer cloud GLM models when a cloud GLM model was requested.
        if "glm" in requested_lower and ":cloud" in requested_lower:
            cloud_glm = [
                m for m in available_models if "glm" in m.lower() and ":cloud" in m.lower()
            ]
            if cloud_glm:
                cloud_glm.sort(key=lambda name: self._model_sort_key(name), reverse=True)
                return cloud_glm[0]

        # Prefer same family/tag prefix if possible.
        prefix = requested_model.split(":", 1)[0].strip().lower()
        same_family = [m for m in available_models if m.split(":", 1)[0].strip().lower() == prefix]
        if same_family:
            same_family.sort(key=lambda name: self._model_sort_key(name), reverse=True)
            return same_family[0]

        return available_models[0]

    def _model_sort_key(self, model_name: str) -> tuple[int, ...]:
        """Build a sortable numeric key from a model name (e.g. glm-4.7:cloud)."""
        nums = [int(n) for n in re.findall(r"\d+", model_name)]
        return tuple(nums) if nums else (0,)

    async def list_models(self) -> list[str]:
        """
        List available models from Ollama API.

        Returns:
            List of model names
        """
        url = f"{self.host}/api/tags"
        headers = {}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                data = response.json()
                return [model["name"] for model in data.get("models", [])]
        except Exception as e:
            logger.error(f"Error listing models: {e}")
            return []

    def _check_if_local(self) -> bool:
        """Check if Ollama is running locally"""
        try:
            # Local hosts
            local_indicators = ["localhost", "127.0.0.1", "0.0.0.0", "::1"]
            host_lower = self.host.lower()
            return any(indicator in host_lower for indicator in local_indicators)
        except Exception:
            return False

    async def get_model_info_from_ps(self) -> dict:
        """
        Get model info from Ollama ps API (for local instances).
        Returns dict with size_gb, processor_info, etc.
        """
        if not self._is_local:
            return {}
        if not self.default_model:
            return {}

        try:
            # Use the correct Ollama API endpoint
            url = f"{self.host}/api/ps"
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()

                # Find our model in running models
                for model_info in data.get("models", []):
                    model_name = model_info.get("name", "")
                    # Match model name (handle tags)
                    if model_name.split(":")[0] == self.default_model.split(":")[0]:
                        # Parse size (comes as string like "74 GB")
                        size_str = model_info.get("size_vram", model_info.get("size", "0"))
                        size_mb = self._parse_size_to_mb(size_str)

                        self._memory_footprint_mb = size_mb
                        self._last_model_info = model_info
                        return model_info

                return {}
        except Exception as e:
            logger.debug(f"Could not get Ollama ps info: {e}")
            return {}

    def _parse_size_to_mb(self, size_str: str) -> float:
        """Parse size string like '74 GB' or '1.2 GB' to MB"""
        try:
            if isinstance(size_str, (int, float)):
                # Already in bytes
                return size_str / (1024**2)

            size_str = str(size_str).strip().upper()

            # Extract number and unit
            parts = size_str.split()
            if len(parts) >= 2:
                value = float(parts[0])
                unit = parts[1]

                if unit == "GB":
                    return value * 1024
                elif unit == "MB":
                    return value
                elif unit == "KB":
                    return value / 1024
                elif unit == "B":
                    return value / (1024**2)

            return 0.0
        except Exception:
            return 0.0

    def get_device_info(self) -> dict:
        """Get device and memory information for Ollama"""
        device = "remote"
        if self._is_local:
            # For local Ollama, we can specify device preference
            device = self.device

        device_info = {
            "device": device,
            "loaded": self._is_local,  # Assume loaded if local
            "memory_allocated_mb": self._memory_footprint_mb,
            "is_local": self._is_local,
        }
        return device_info

    async def unload_model(self) -> None:
        """
        Request Ollama to unload the model immediately using 'ollama stop' command.
        Only works for local Ollama instances.
        """
        if not self._is_local:
            logger.debug("Ollama is remote, cannot control unload")
            return

        try:
            # Get the currently running model from ps
            model_info = await self.get_model_info_from_ps()
            if not model_info:
                logger.debug("No model currently running in ollama ps")
                return

            model_name = model_info.get("name", "")
            if not model_name:
                logger.warning("Could not determine model name to stop")
                return

            # Execute 'ollama stop <model_name>' command
            process = await asyncio.create_subprocess_exec(
                "ollama",
                "stop",
                model_name,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await process.communicate()

            logger.info(f"Stopped Ollama model: {model_name}")
            self._memory_footprint_mb = 0.0
            self._last_model_info = {}

        except Exception as e:
            logger.error(f"Error stopping Ollama model: {e}", exc_info=True)

    def get_info(self) -> dict:
        """Get information about the Ollama client"""
        return {"name": "Ollama", "host": self.host, "default_model": self.default_model}
