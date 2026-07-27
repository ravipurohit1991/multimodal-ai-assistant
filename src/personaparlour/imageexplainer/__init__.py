"""
Image Explainer Module - Vision-Language Model for image description
"""

from personaparlour.imageexplainer.base import ImageExplainerEngine
from personaparlour.imageexplainer.image_explainer import ImageExplainer, get_image_explainer

__all__ = ["ImageExplainerEngine", "ImageExplainer", "get_image_explainer"]
