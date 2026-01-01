"""
Image Generation Service - Character-consistent image generation using Diffusion models
"""

import asyncio
import os
import re
from functools import partial
from io import BytesIO

import torch
from diffusers.pipelines.pipeline_utils import DiffusionPipeline
from PIL import Image

from aiassistant.imagegen.base import ImageGeneratorEngine
from aiassistant.utils import get_resource_monitor, logger, resolve_local_model_path


class ImageGenerator(ImageGeneratorEngine):
    """Manages image generation with character consistency"""

    def __init__(
        self,
        model_name: str = "prompthero/openjourney",
        device: str = "cuda",
        dtype=torch.float16,
        character_description: str | None = None,
        lora_path: str | None = None,
        lora_weight: float = 0.8,
    ):
        """
        Initialize the image generator.

        Args:
            model_name: HuggingFace model ID or local path to diffusion model directory
            device: Device to run on (cuda/cpu)
            dtype: Data type for model weights
            character_description: Base character description for consistency
        """
        self.device = device
        self.dtype = dtype
        self.model_name = model_name
        self.pipe = None
        self.character_description = character_description or ""
        self._initialized = False
        self._concise_character_cache = None  # Cached concise character description
        self.lora_path = lora_path
        self.lora_weight = lora_weight
        self._memory_footprint_mb = 0.0

        # Check if model_name is a local path
        self.is_local_path = os.path.exists(model_name) or os.path.isabs(model_name)

    def initialize(self):
        """Load the diffusion model (lazy loading)"""
        if self._initialized:
            return

        monitor = get_resource_monitor()

        # Resolve local path if needed (handle HuggingFace cache structure)
        model_path = self.model_name
        if self.is_local_path:
            model_path = resolve_local_model_path(self.model_name)

        # Check if loading from local path
        if self.is_local_path:
            logger.info(f"Loading image generation model from local path: {model_path}")
        else:
            logger.info(f"Loading image generation model from HuggingFace: {model_path}")

        # Measure memory before loading
        if torch.cuda.is_available():
            gpu_stats_before = monitor.get_gpu_stats(0)
            mem_before = gpu_stats_before.memory_used_mb if gpu_stats_before else 0.0
        else:
            system_stats = monitor.get_system_stats()
            mem_before = system_stats.process_ram_mb

        # Prepare loading parameters
        load_kwargs: dict = {"torch_dtype": self.dtype}
        if self.is_local_path:
            load_kwargs["local_files_only"] = True

        # For FFusion : torch_dtype=torch.float16, use_safetensors=True, variant="fp16"
        if "FFusion" in model_path:
            load_kwargs.update(
                {
                    "use_safetensors": True,
                    "variant": "fp16",
                }
            )

        # Load model
        self.pipe = DiffusionPipeline.from_pretrained(model_path, **load_kwargs)

        # Load LoRA if specified
        if self.lora_path:
            if os.path.exists(self.lora_path):
                logger.info(f"Loading LoRA: {self.lora_path}")
                try:
                    # Get the directory and filename
                    lora_dir = os.path.dirname(self.lora_path)
                    lora_filename = os.path.basename(self.lora_path)

                    # Load LoRA weights
                    self.pipe.load_lora_weights(lora_dir, weight_name=lora_filename)
                    # Set LoRA scale (weight)
                    self.pipe.fuse_lora(lora_scale=self.lora_weight)
                    logger.info(f"LoRA loaded with weight: {self.lora_weight}")
                except Exception as e:
                    logger.warning(f"Failed to load LoRA: {e}")
                    logger.warning("   Continuing without LoRA...")
            else:
                logger.warning(f"LoRA path not found: {self.lora_path}")

        self.pipe.to(self.device)
        self.pipe.safety_checker = None  # lambda images, clip_input: (images, False)
        self.pipe.enable_model_cpu_offload()

        self._initialized = True

        # Measure memory after loading
        if torch.cuda.is_available():
            gpu_stats_after = monitor.get_gpu_stats(0)
            mem_after = gpu_stats_after.memory_used_mb if gpu_stats_after else 0.0
        else:
            system_stats = monitor.get_system_stats()
            mem_after = system_stats.process_ram_mb

        self._memory_footprint_mb = max(0.0, mem_after - mem_before)
        logger.info(
            f"Image generation model loaded on {self.device} ({self._memory_footprint_mb:.1f} MB)"
        )

    def set_character_description(self, description: str):
        """Update the base character description for consistent generation"""
        # Only clear cache if description actually changed
        if description != self.character_description:
            self.character_description = description
            self._concise_character_cache = None  # Clear cache when description changes
            logger.info(f"Character description updated: {description[:100]}...")

    def get_concise_character_description(self) -> str:
        """
        Get a concise version of character description (cached).
        Focuses on: age, gender, ethnicity, key physical attributes.
        Limited to ~30 tokens for CLIP compatibility.

        Returns:
            Concise character description string
        """
        if self._concise_character_cache is not None:
            return self._concise_character_cache

        if not self.character_description:
            self._concise_character_cache = ""
            return ""

        # Extract key physical attributes using simple parsing
        desc = self.character_description.lower()

        # Try to extract key attributes
        attributes = []

        # Age (look for numbers followed by year/years old)
        age_match = re.search(r"(\d+)[\s-]?(?:year|yr)s?[\s-]?old", desc)
        if age_match:
            attributes.append(f"{age_match.group(1)}yo")

        # Gender keywords
        if any(word in desc for word in ["woman", "girl", "female", "she", "her"]):
            if not any(word in desc for word in ["young woman", "18", "teen", "girl"]):
                attributes.append("woman")
            else:
                attributes.append("young woman")
        elif any(word in desc for word in ["man", "boy", "male", "he", "him"]):
            if not any(word in desc for word in ["young man", "18", "teen", "boy"]):
                attributes.append("man")
            else:
                attributes.append("young man")

        # Hair (color + length/style)
        hair_colors = ["blonde", "brown", "black", "red", "white", "gray", "auburn", "dark"]
        hair_lengths = ["long", "short", "medium", "shoulder-length"]
        hair_found = []
        for color in hair_colors:
            if color in desc and "hair" in desc:
                hair_found.append(color)
                break
        for length in hair_lengths:
            if length in desc and "hair" in desc:
                hair_found.append(length)
                break
        if hair_found:
            attributes.append(f"{' '.join(hair_found)} hair")

        # Eye color
        eye_colors = ["blue", "green", "brown", "hazel", "gray", "amber"]
        for color in eye_colors:
            if color in desc and "eye" in desc:
                attributes.append(f"{color} eyes")
                break

        # Skin tone
        skin_tones = ["fair", "pale", "tan", "tanned", "olive", "dark", "brown", "ebony", "light"]
        for tone in skin_tones:
            if tone in desc and ("skin" in desc or "complexion" in desc):
                attributes.append(f"{tone} skin")
                break

        # Build concise description
        if attributes:
            self._concise_character_cache = ", ".join(attributes)
        else:
            # Fallback: take first 50 chars and add ellipsis
            self._concise_character_cache = self.character_description[:50].strip()

        logger.info(f"Cached concise character: {self._concise_character_cache}")
        return self._concise_character_cache

    def _build_full_prompt(self, scene_prompt: str) -> str:
        """
        Build a complete prompt combining character description and scene.
        Optimized to stay within CLIP's 77 token limit (~60 words).

        Args:
            scene_prompt: Description of the scene/action

        Returns:
            Complete prompt with character description (concise)
        """
        concise_char = self.get_concise_character_description()

        if concise_char:
            # Combine: character + scene + quality tags
            # Keep it under 77 tokens (~60 words)
            full_prompt = f"{concise_char}, {scene_prompt}, detailed, high quality"
        else:
            full_prompt = f"{scene_prompt}, detailed, high quality"

        # Truncate if too long (77 tokens ≈ 60 words ≈ 300 chars)
        if len(full_prompt) > 300:
            full_prompt = full_prompt[:300].rsplit(",", 1)[0]  # Cut at last comma

        return full_prompt

    def _generate_sync(
        self,
        prompt: str,
        negative_prompt: str | None = None,
        num_inference_steps: int = 30,
        guidance_scale: float = 7.5,
        width: int = 512,
        height: int = 512,
        seed: int | None = None,
    ) -> Image.Image:
        """
        Synchronous image generation (runs in thread pool).

        Args:
            prompt: Text prompt for image generation
            negative_prompt: Negative prompt to avoid unwanted features
            num_inference_steps: Number of denoising steps (higher = better quality, slower)
            guidance_scale: How closely to follow the prompt (7-9 recommended)
            width: Image width in pixels
            height: Image height in pixels
            seed: Random seed for reproducibility (None = random)

        Returns:
            PIL Image object
        """
        if not self._initialized:
            self.initialize()

        # Set up generator with seed if provided
        generator = None
        if seed is not None:
            generator = torch.Generator(self.device).manual_seed(seed)

        # Default negative prompt if not provided
        if negative_prompt is None:
            negative_prompt = (
                "ugly, deformed, disfigured, poor quality, low resolution, "
                "blurry, distorted, text, watermark, signature, low quality, "
                "worst quality, bad anatomy, extra limbs"
            )

        logger.info(f"Generating image with prompt: {prompt[:100]}...")

        # Generate the image
        result = self.pipe(
            prompt=prompt,
            negative_prompt=negative_prompt,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            width=width,
            height=height,
            generator=generator,
        )  # type: ignore

        image = result.images[0]
        logger.info(f"Image generated: {width}x{height}")

        return image

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
        Generate an image asynchronously.

        Args:
            scene_prompt: Description of the scene (e.g., "taking a selfie in a cafe")
            include_character: Whether to include character description
            input_image: Optional input image for image-to-image editing (not supported by diffusion models, will be ignored)
            num_inference_steps: Number of denoising steps
            guidance_scale: Prompt adherence strength
            strength: Strength of transformation for image editing (0.0-1.0, not used)
            width: Image width
            height: Image height
            seed: Random seed for reproducibility
            negative_prompt: Custom negative prompt

        Returns:
            PIL Image object
        """
        # Note: Traditional diffusion models don't support image editing in this implementation
        # The input_image parameter is included for future extension of API compatibility with QwenImageGenerator
        if input_image is not None:
            logger.warning("Image editing not supported by qwen model, ignoring input_image")

        # Build full prompt with character description if requested
        if include_character:
            full_prompt = self._build_full_prompt(scene_prompt)
        else:
            full_prompt = scene_prompt

        # Run the synchronous generation in a thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        image = await loop.run_in_executor(
            None,
            partial(
                self._generate_sync,
                prompt=full_prompt,
                negative_prompt=negative_prompt,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                width=width,
                height=height,
                seed=seed,
            ),
        )

        return image

    async def generate_image(
        self,
        prompt: str,
        negative_prompt: str | None = None,
        num_inference_steps: int = 30,
        guidance_scale: float = 7.5,
        **kwargs,
    ) -> bytes:
        """
        Generate an image based on text prompt (base class interface).

        Args:
            prompt: Text prompt for image generation
            negative_prompt: Optional negative prompt (things to avoid)
            num_inference_steps: Number of denoising steps
            guidance_scale: Guidance scale for generation
            **kwargs: Additional parameters (width, height, seed, etc.)

        Returns:
            Image data as bytes (PNG format)
        """
        # Use the generate method and convert to bytes
        image = await self.generate(
            scene_prompt=prompt,
            include_character=False,  # Use raw prompt
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            negative_prompt=negative_prompt,
            **kwargs,
        )

        # Convert to PNG bytes
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)
        return buffer.getvalue()

    def get_info(self) -> dict:
        """Get information about the Image Generator engine"""
        return {
            "name": "ImageGenerator",
            "model_name": self.model_name,
            "device": self.device,
            "dtype": str(self.dtype),
            "initialized": self._initialized,
            "has_lora": self.lora_path is not None,
        }

    def cleanup(self) -> None:
        """Cleanup resources and free memory"""
        if self.pipe is not None:
            del self.pipe
            self.pipe = None
            self._initialized = False
            self._memory_footprint_mb = 0.0
            torch.cuda.empty_cache() if torch.cuda.is_available() else None
            logger.info("ImageGenerator model unloaded")

    def unload_model(self) -> None:
        """Alias for cleanup() for consistency with other engines"""
        self.cleanup()

    def get_device_info(self) -> dict:
        """Get device and memory information"""
        device_info = {
            "device": self.device,
            "loaded": self._initialized,
            "memory_allocated_mb": self._memory_footprint_mb if self._initialized else 0,
        }
        return device_info
