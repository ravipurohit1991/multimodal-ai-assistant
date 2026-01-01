"""Base class for Image Generator engines"""

from __future__ import annotations

from abc import ABC, abstractmethod


class ImageGeneratorEngine(ABC):
    """Abstract base class for Image Generator engines"""

    @abstractmethod
    def initialize(self) -> None:
        """
        Load the image generation model (lazy loading).
        This allows the application to start without loading the model immediately.
        """
        pass

    @abstractmethod
    def set_character_description(self, description: str) -> None:
        """
        Update the base character description for consistent generation.

        Args:
            description: Character description to use for image generation
        """
        pass

    @abstractmethod
    async def generate_image(
        self,
        prompt: str,
        negative_prompt: str | None = None,
        num_inference_steps: int = 30,
        guidance_scale: float = 7.5,
        **kwargs,
    ) -> bytes:
        """
        Generate an image based on text prompt.

        Args:
            prompt: Text prompt for image generation
            negative_prompt: Optional negative prompt (things to avoid)
            num_inference_steps: Number of denoising steps
            guidance_scale: Guidance scale for generation
            **kwargs: Additional engine-specific parameters

        Returns:
            Image data as bytes (PNG format)

        Raises:
            RuntimeError: If image generation fails
        """
        pass

    @abstractmethod
    def get_info(self) -> dict:
        """
        Get information about the Image Generator engine.

        Returns:
            Dictionary with engine info (name, model_name, device, etc.)
        """
        pass

    @abstractmethod
    def cleanup(self) -> None:
        """
        Cleanup resources and free memory.
        Useful when shutting down or switching models.
        """
        pass
