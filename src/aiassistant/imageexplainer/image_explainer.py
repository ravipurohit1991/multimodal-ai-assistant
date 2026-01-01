"""
Image Explainer Module - Vision-Language Model for image description
Uses Qwen3VL-4B abliterated/uncensored model to generate textual descriptions of images

Note: the model will be autodownloaded from HuggingFace upon first use.
"""

from __future__ import annotations

import os

import torch
from transformers import AutoProcessor, Qwen3VLForConditionalGeneration

from aiassistant.imageexplainer.base import ImageExplainerEngine
from aiassistant.logger import logger


class ImageExplainer(ImageExplainerEngine):
    """
    Vision-Language Model wrapper for generating image descriptions.
    Uses Qwen3VL-4B abliterated/uncensored model to explain images sent by users.
    """

    def __init__(
        self,
        model_id: str = "huihui-ai/Huihui-Qwen3-VL-2B-Instruct-abliterated",
        device: str = "auto",
        max_tokens: int = 256,
    ):
        """
        Initialize the image explainer model.

        Args:
            model_id: HuggingFace model ID or local path to model directory
            1. if you have better vram use 4B uncensored: "huihui-ai/Huihui-Qwen3-VL-4B-Thinking-abliterated"
                                                          "huihui-ai/Huihui-Qwen3-VL-4B-Instruct-uncensored"
            2. for lower vram use 2B abliterated: "huihui-ai/Huihui-Qwen3-VL-2B-Thinking-abliterated"
                                                  "huihui-ai/Huihui-Qwen3-VL-2B-Instruct-abliterated"
            3. or provide a local path: "C:\\path\\to\\model\\directory"
            device: Device to run on ('auto', 'cuda', 'cpu')
            max_tokens: Maximum tokens to generate for description
        """
        self.model_id = model_id
        self.device = device
        self.max_tokens = max_tokens
        self.model = None
        self.processor = None
        self._memory_footprint_mb = 0.0

        # Check if model_id is a local path
        self.is_local_path = os.path.exists(model_id) or os.path.isabs(model_id)

        # Configure CPU threads for optimal performance
        cpu_count = os.cpu_count()
        half_cpu_count = cpu_count // 2 if cpu_count and cpu_count > 1 else 1
        os.environ["MKL_NUM_THREADS"] = str(half_cpu_count)
        os.environ["OMP_NUM_THREADS"] = str(half_cpu_count)
        torch.set_num_threads(half_cpu_count)

        logger.info(f"ImageExplainer initialized with {half_cpu_count} CPU threads")

    def _resolve_local_model_path(self, path: str) -> str:
        """
        Resolve HuggingFace cache directory structure to actual model path.
        If path points to models--org--name directory, find the latest snapshot.

        Args:
            path: Path to model directory

        Returns:
            Resolved path to actual model files
        """
        if not os.path.exists(path):
            return path

        # Check if this is a HuggingFace cache directory (contains snapshots/)
        snapshots_dir = os.path.join(path, "snapshots")
        if os.path.exists(snapshots_dir) and os.path.isdir(snapshots_dir):
            # Get all snapshot directories
            snapshots = [
                d
                for d in os.listdir(snapshots_dir)
                if os.path.isdir(os.path.join(snapshots_dir, d))
            ]
            if snapshots:
                # Use the most recent snapshot (by modification time)
                latest_snapshot = max(
                    snapshots, key=lambda d: os.path.getmtime(os.path.join(snapshots_dir, d))
                )
                resolved_path = os.path.join(snapshots_dir, latest_snapshot)
                logger.info(f"Resolved HuggingFace cache path to snapshot: {resolved_path}")
                return resolved_path

        return path

    def load_model(self):
        """
        Lazy load the model and processor.
        This allows the application to start without loading the model immediately.
        """
        if self.model is not None:
            logger.info("ImageExplainer model already loaded")
            return

        from aiassistant.utils import get_resource_monitor

        monitor = get_resource_monitor()

        # Resolve local path if needed (handle HuggingFace cache structure)
        model_path = self.model_id
        if self.is_local_path:
            model_path = self._resolve_local_model_path(self.model_id)

        # Check if loading from local path
        if self.is_local_path:
            logger.info(f"Loading ImageExplainer model from local path: {model_path}")
        else:
            logger.info(f"Loading ImageExplainer model from HuggingFace: {model_path}")

        try:
            # Measure memory before loading
            if torch.cuda.is_available():
                gpu_stats_before = monitor.get_gpu_stats(0)
                mem_before = gpu_stats_before.memory_used_mb if gpu_stats_before else 0.0
            else:
                system_stats = monitor.get_system_stats()
                mem_before = system_stats.process_ram_mb

            # Prepare loading parameters
            load_kwargs = {
                "device_map": self.device,
                "trust_remote_code": True,
                "torch_dtype": torch.bfloat16,
                "low_cpu_mem_usage": True,
            }

            # Add local_files_only if loading from local path
            if self.is_local_path:
                load_kwargs["local_files_only"] = True

            # Load model
            self.model = Qwen3VLForConditionalGeneration.from_pretrained(
                model_path,
                **load_kwargs,
            )
            self.processor = AutoProcessor.from_pretrained(
                model_path,
                trust_remote_code=True,
                local_files_only=self.is_local_path,
            )

            # Measure memory after loading
            if torch.cuda.is_available():
                gpu_stats_after = monitor.get_gpu_stats(0)
                mem_after = gpu_stats_after.memory_used_mb if gpu_stats_after else 0.0
            else:
                system_stats = monitor.get_system_stats()
                mem_after = system_stats.process_ram_mb

            self._memory_footprint_mb = max(0.0, mem_after - mem_before)
            logger.info(
                f"ImageExplainer model loaded successfully on {self.device} ({self._memory_footprint_mb:.1f} MB)"
            )
        except Exception as e:
            logger.error(f"Failed to load ImageExplainer model: {e}")
            raise

    def explain_image(
        self,
        image_path: str,
        prompt: str = "",
    ) -> str:
        """
        Generate a textual description of an image.

        Args:
            image_path: Path to the image file
            prompt: Custom prompt for the model (default: "Describe this image in detail.")

        Returns:
            String description of the image

        Raises:
            FileNotFoundError: If image path doesn't exist
            RuntimeError: If model fails to generate description
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found: {image_path}")

        # Ensure model is loaded
        if self.model is None:
            self.load_model()

        assert self.processor is not None, "Processor not initialized"
        assert self.model is not None, "Model not initialized"

        system_prompt = (
            "The user has sent this image. Describe this image in detail. Focus on physical attributes. The user is interested in your opinion and what sort of feelings it would incite in the viewer.",
        )

        try:
            # Prepare messages in chat format
            messages = [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "image": image_path},
                        {"type": "text", "text": prompt},
                    ],
                },
            ]

            # Prepare input for inference
            inputs = self.processor.apply_chat_template(
                messages,
                tokenize=True,
                add_generation_prompt=True,
                return_dict=True,
                return_tensors="pt",
            ).to(self.model.device)

            # Generate description
            generated_ids = self.model.generate(**inputs, max_new_tokens=self.max_tokens)
            generated_ids_trimmed = [
                out_ids[len(in_ids) :] for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
            ]

            # Decode output
            output_text = self.processor.batch_decode(
                generated_ids_trimmed,
                skip_special_tokens=True,
                clean_up_tokenization_spaces=False,
            )

            # Return the first (and only) result
            description = output_text[0].strip() if output_text else ""
            logger.info(f"Generated image description: {description}")
            return description

        except Exception as e:
            logger.error(f"Failed to explain image: {e}")
            raise RuntimeError(f"Image explanation failed: {e}")

    def unload_model(self) -> None:
        """
        Unload the model from memory to free up resources.
        """
        if self.model is not None:
            del self.model
            del self.processor
            self.model = None
            self.processor = None
            self._memory_footprint_mb = 0.0
            torch.cuda.empty_cache() if torch.cuda.is_available() else None
            logger.info("ImageExplainer model unloaded")

    def get_device_info(self) -> dict:
        """Get device and memory information"""
        device_info = {
            "device": self.device,
            "loaded": self.model is not None,
            "memory_allocated_mb": 0,
            "memory_reserved_mb": 0,
        }

        if self.model is not None and torch.cuda.is_available():
            device_info["memory_allocated_mb"] = torch.cuda.memory_allocated() / (1024**2)
            device_info["memory_reserved_mb"] = torch.cuda.memory_reserved() / (1024**2)

        return device_info

    def get_info(self) -> dict:
        """Get information about the Image Explainer engine"""
        return {
            "name": "ImageExplainer",
            "model_id": self.model_id,
            "device": self.device,
            "max_tokens": self.max_tokens,
            "loaded": self.model is not None,
        }


# Global instance (lazy-loaded)
_global_image_explainer: ImageExplainer | None = None


def get_image_explainer(
    model_id: str = "huihui-ai/Huihui-Qwen3-VL-4B-Instruct-abliterated",
    device: str = "auto",
    max_tokens: int = 256,
) -> ImageExplainer:
    """
    Get or create the global ImageExplainer instance.

    Args:
        model_id: HuggingFace model ID or local path to model directory
        device: Device to run on
        max_tokens: Max tokens for generation

    Returns:
        ImageExplainer instance
    """
    global _global_image_explainer
    if _global_image_explainer is None:
        _global_image_explainer = ImageExplainer(
            model_id=model_id, device=device, max_tokens=max_tokens
        )
    return _global_image_explainer
