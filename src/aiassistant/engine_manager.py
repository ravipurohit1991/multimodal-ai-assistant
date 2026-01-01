"""
Engine Manager - Centralized initialization and management of STT, TTS, LLM, Image Explainer, and Image Generation engines
"""

from aiassistant.config import config
from aiassistant.imageexplainer import ImageExplainer
from aiassistant.imagegen import ImageGenerator
from aiassistant.llm import OllamaClient
from aiassistant.stt import WhisperSTT
from aiassistant.tts import ChatterboxTTS, PiperTTS, SopranoTTS
from aiassistant.utils import get_resource_monitor, logger


class EngineManager:
    """Manages STT, TTS, LLM, Image Explainer, and Image Generation engines"""

    def __init__(self):
        self.stt_engine: WhisperSTT | None = None
        self.tts_engine: PiperTTS | ChatterboxTTS | SopranoTTS | None = None
        self.llm_client: OllamaClient | None = None
        self.image_explainer: ImageExplainer | None = None
        self.image_generator: ImageGenerator | None = None

        self._initialize_engines()

    def _initialize_engines(self) -> None:
        """Initialize all engines with configuration"""
        # Initialize STT
        self.stt_engine = WhisperSTT(
            model=config.whisper_model,
            device=config.whisper_device,
            compute_type=config.whisper_compute,
        )
        logger.info(f"Whisper STT initialized: {config.whisper_model} on {config.whisper_device}")

        # Initialize LLM
        self.llm_client = OllamaClient(
            host=config.llm_host,
            default_model=config.llm_model,
            device=config.llm_device,
            keep_alive=config.llm_keep_alive,
        )
        logger.info(
            f"LLM client initialized: {config.llm_model} at {config.llm_host} (device: {config.llm_device}, keep_alive: {config.llm_keep_alive})"
        )

        # Initialize TTS based on config
        self.tts_engine = self._initialize_tts_engine(config.tts_engine)
        if self.tts_engine is None:
            logger.error("Failed to initialize any TTS engine!")

        # Initialize Image Explainer (if enabled)
        if config.imageexplainer_enabled:
            self.image_explainer = ImageExplainer(
                model_id=config.imageexplainer_model,
                device=config.imageexplainer_device,
                max_tokens=config.imageexplainer_max_tokens,
            )
            logger.info(
                f"Image Explainer initialized: {config.imageexplainer_model} on {config.imageexplainer_device}"
            )
        else:
            logger.info("Image Explainer disabled")

        # Initialize Image Generator (if enabled)
        if config.imagegen_enabled:
            # Use traditional diffusion model
            lora_path = config.imagegen_lora_path if config.imagegen_lora_enabled else None
            self.image_generator = ImageGenerator(
                model_name=config.imagegen_model,
                device=config.imagegen_device,
                lora_path=lora_path,
                lora_weight=config.imagegen_lora_weight,
            )
            logger.info(
                f"Image Generator initialized: {config.imagegen_model} on {config.imagegen_device}"
            )
        else:
            logger.info("Image Generator disabled")

    def _initialize_tts_engine(self, engine_type: str):
        """Initialize TTS engine based on type"""
        tts_engine = None

        if engine_type == "chatterbox":
            try:
                tts_engine = ChatterboxTTS(
                    model_type=config.chatterbox_model_type,
                    device=config.chatterbox_device,
                    ref_audio_dir=config.chatterbox_ref_audio_dir,
                    default_ref_audio=config.chatterbox_default_ref_audio or None,
                    exaggeration=config.chatterbox_exaggeration,
                    cfg_weight=config.chatterbox_cfg_weight,
                    target_sample_rate=16000,
                )
                logger.info(
                    f"Chatterbox TTS initialized ({config.chatterbox_model_type}) on {config.chatterbox_device}"
                )
            except Exception as e:
                logger.error(f"Failed to initialize Chatterbox TTS: {e}")
                logger.warning(" Falling back to Piper TTS")

        elif engine_type == "soprano":
            try:
                tts_engine = SopranoTTS(
                    device=config.soprano_device,
                    backend=config.soprano_backend,
                    cache_size_mb=config.soprano_cache_size_mb,
                    decoder_batch_size=config.soprano_decoder_batch_size,
                    target_sample_rate=16000,
                    temperature=config.soprano_temperature,
                    top_p=config.soprano_top_p,
                    repetition_penalty=config.soprano_repetition_penalty,
                    model_dir=config.soprano_model_dir,
                )
                logger.info(
                    f"Soprano TTS initialized (backend: {config.soprano_backend}) on {config.soprano_device}"
                )
            except Exception as e:
                logger.error(f"Failed to initialize Soprano TTS: {e}")
                logger.warning("Falling back to Piper TTS")

        # Default to Piper if nothing else worked or if TTS_ENGINE=piper
        if tts_engine is None:
            tts_engine = PiperTTS(
                voices_dir=config.voices_dir,
                default_voice="en_GB-jenny_dioco-medium",
                use_cuda=config.piper_use_cuda,
            )
            logger.info(f"Piper TTS initialized (CUDA: {config.piper_use_cuda})")

        return tts_engine

    def switch_tts_engine(self, engine_type: str) -> tuple[bool, str]:
        """
        Switch to a different TTS engine at runtime

        Args:
            engine_type: Type of engine to switch to ("piper", "chatterbox", or "soprano")

        Returns:
            Tuple of (success: bool, message: str)
        """
        if engine_type == config.tts_engine and self.tts_engine is not None:
            return True, f"Already using {engine_type} TTS"

        logger.info(f"Switching TTS engine from {config.tts_engine} to {engine_type}...")

        new_engine = self._initialize_tts_engine(engine_type)
        if new_engine:
            # Update config and engine
            old_engine = config.tts_engine
            config.tts_engine = engine_type
            self.tts_engine = new_engine

            logger.info(f"TTS engine switched from {old_engine} to {engine_type}")
            return True, f"Switched to {engine_type} TTS"
        else:
            logger.error(f"Failed to switch to {engine_type} TTS")
            return False, f"Failed to initialize {engine_type} TTS"

    def unload_image_generator(self) -> None:
        """Unload image generator model to free memory (for low VRAM mode)"""
        if self.image_generator is not None and self.image_generator._initialized:
            self.image_generator.unload_model()
            logger.info("Image generator unloaded due to low VRAM mode")

    def unload_image_explainer(self) -> None:
        """Unload image explainer model to free memory (for low VRAM mode)"""
        if self.image_explainer is not None and self.image_explainer.model is not None:
            self.image_explainer.unload_model()
            logger.info("Image explainer unloaded due to low VRAM mode")

    async def get_model_status(self) -> dict:
        """
        Get comprehensive status of all models including device, loaded state, and memory usage.
        Uses pynvml for accurate GPU monitoring.

        Returns:
            Dictionary containing status for all engines and system resources
        """
        import torch

        monitor = get_resource_monitor()
        status = {"low_vram_mode": config.low_vram_mode, "models": {}}

        # STT Engine Status
        if self.stt_engine:
            stt_device_info = self.stt_engine.get_device_info()
            stt_info = {
                "name": "Whisper STT",
                "model": self.stt_engine.model_name,
                "device": stt_device_info["device"],
                "loaded": stt_device_info["loaded"],
                "memory_mb": stt_device_info["memory_allocated_mb"],
            }
            status["models"]["stt"] = stt_info

        # TTS Engine Status
        if self.tts_engine:
            tts_device_info = self.tts_engine.get_device_info()
            # Determine TTS engine name
            tts_name = "Piper TTS"
            if isinstance(self.tts_engine, ChatterboxTTS):
                tts_name = f"Chatterbox TTS ({config.chatterbox_model_type})"
            elif isinstance(self.tts_engine, SopranoTTS):
                tts_name = "Soprano TTS"

            tts_info = {
                "name": tts_name,
                "engine": config.tts_engine,
                "voice": self.tts_engine.current_voice_name,
                "device": tts_device_info["device"],
                "loaded": tts_device_info["loaded"],
                "memory_mb": tts_device_info["memory_allocated_mb"],
            }
            status["models"]["tts"] = tts_info

        # LLM Client Status - fetch real-time info from Ollama ps
        if self.llm_client:
            # Get real-time memory info from Ollama ps API
            await self.llm_client.get_model_info_from_ps()

            llm_device_info = self.llm_client.get_device_info()
            llm_info = {
                "name": "LLM (Ollama)",
                "model": self.llm_client.default_model,
                "host": self.llm_client.host,
                "device": llm_device_info["device"],
                "loaded": llm_device_info["loaded"],
                "memory_mb": llm_device_info["memory_allocated_mb"],
                "is_local": llm_device_info["is_local"],
                "keep_alive": self.llm_client.keep_alive,
            }
            status["models"]["llm"] = llm_info

        # Image Explainer Status
        if self.image_explainer:
            explainer_device_info = self.image_explainer.get_device_info()
            explainer_info = {
                "name": "Image Explainer",
                "model": self.image_explainer.model_id,
                "device": explainer_device_info["device"],
                "loaded": explainer_device_info["loaded"],
                "memory_mb": explainer_device_info["memory_allocated_mb"],
            }
            status["models"]["image_explainer"] = explainer_info

        # Image Generator Status
        if self.image_generator:
            generator_device_info = self.image_generator.get_device_info()
            generator_info = {
                "name": "Image Generator",
                "model": self.image_generator.model_name,
                "device": generator_device_info["device"],
                "loaded": generator_device_info["loaded"],
                "memory_mb": generator_device_info["memory_allocated_mb"],
            }
            if self.image_generator.lora_path:
                generator_info["lora"] = True
            status["models"]["image_generator"] = generator_info

        # Add accurate GPU stats using pynvml (like nvtop)
        gpu_stats = monitor.get_all_gpu_stats()
        if gpu_stats:
            status["gpus"] = []
            for gpu in gpu_stats:
                gpu_info = {
                    "device_id": gpu.device_id,
                    "name": gpu.name,
                    "memory_used_mb": round(gpu.memory_used_mb, 1),
                    "memory_total_mb": round(gpu.memory_total_mb, 1),
                    "memory_percent": round(gpu.memory_percent, 1),
                    "utilization_percent": round(gpu.utilization_percent, 1),
                }
                if gpu.temperature_c is not None:
                    gpu_info["temperature_c"] = round(gpu.temperature_c, 1)
                if gpu.power_usage_w is not None:
                    gpu_info["power_usage_w"] = round(gpu.power_usage_w, 1)
                status["gpus"].append(gpu_info)

        # Add system stats (like btop)
        system_stats = monitor.get_system_stats()
        status["system"] = {
            "cpu_percent": round(system_stats.cpu_percent, 1),
            "ram_used_mb": round(system_stats.ram_used_mb, 1),
            "ram_total_mb": round(system_stats.ram_total_mb, 1),
            "ram_percent": round(system_stats.ram_percent, 1),
            "process_ram_mb": round(system_stats.process_ram_mb, 1),
            "process_cpu_percent": round(system_stats.process_cpu_percent, 1),
        }

        # Add PyTorch CUDA info for reference
        if torch.cuda.is_available():
            status["cuda"] = {
                "available": True,
                "device_count": torch.cuda.device_count(),
                "current_device": torch.cuda.current_device(),
            }
        else:
            status["cuda"] = {"available": False}

        return status


engine_manager = EngineManager()
