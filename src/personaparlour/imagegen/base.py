"""Base class for Image Generator engines"""

from __future__ import annotations

from abc import ABC, abstractmethod

from PIL import Image


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
    async def generate(
        self,
        scene_prompt: str,
        include_character: bool = True,
        input_image: Image.Image | None = None,
        num_inference_steps: int = 30,
        guidance_scale: float = 7.5,
        strength: float = 0.8,
        width: int = 512,
        height: int = 512,
        seed: int | None = None,
        negative_prompt: str | None = None,
    ) -> Image.Image:
        """
        Generate an image and return as a PIL image.

        Args:
            scene_prompt: Scene prompt to generate from
            include_character: Whether to include stored character description
            input_image: Optional input image for image-to-image editing
            num_inference_steps: Number of denoising steps
            guidance_scale: Prompt adherence strength
            strength: Strength for image editing
            width: Target width
            height: Target height
            seed: Optional random seed
            negative_prompt: Optional negative prompt

        Returns:
            Generated PIL image
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
