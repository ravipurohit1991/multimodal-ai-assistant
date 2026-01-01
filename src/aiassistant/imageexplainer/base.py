"""Base class for Image Explainer engines"""

from __future__ import annotations

from abc import ABC, abstractmethod


class ImageExplainerEngine(ABC):
    """Abstract base class for Image Explainer engines"""

    @abstractmethod
    def load_model(self) -> None:
        """
        Lazy load the model and processor.
        This allows the application to start without loading the model immediately.
        """
        pass

    @abstractmethod
    def explain_image(self, image_path: str, prompt: str | None = None) -> str:
        """
        Generate a textual description of an image.

        Args:
            image_path: Path to the image file
            prompt: Optional custom prompt for the model

        Returns:
            String description of the image

        Raises:
            FileNotFoundError: If image path doesn't exist
            RuntimeError: If model fails to generate description
        """
        pass

    @abstractmethod
    def get_info(self) -> dict:
        """
        Get information about the Image Explainer engine.

        Returns:
            Dictionary with engine info (name, model_id, device, etc.)
        """
        pass

    @abstractmethod
    def unload_model(self) -> None:
        """
        Unload the model from memory.
        Useful for freeing up resources when not in use.
        """
        pass
