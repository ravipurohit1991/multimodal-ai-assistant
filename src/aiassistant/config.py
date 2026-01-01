"""Configuration module for TTS/STT Pipeline - Singleton pattern"""

import os

from dotenv import load_dotenv


class ConfigManager:
    """
    Singleton configuration manager for the application.
    Loads and manages all configuration from environment variables.
    """

    _instance: "ConfigManager | None" = None
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if ConfigManager._initialized:
            return

        # Load environment variables from .env file
        load_dotenv()

        # Initialize all configuration

        # Low VRAM mode - unload models after use to save memory
        self.low_vram_mode = os.getenv("LOW_VRAM_MODE", "true").lower() == "true"

        self._init_huggingface_config()
        self._init_server_config()
        self._init_llm_config()
        self._init_whisper_config()
        self._init_tts_config()
        self._init_imagegen_config()
        self._init_imageexplainer_config()
        self._init_user_data_config()

        ConfigManager._initialized = True

    def _init_huggingface_config(self):
        """Initialize HuggingFace configuration"""
        pass

    def _init_server_config(self):
        """Initialize server and WebSocket configuration"""
        self.backend_host = os.getenv("BACKEND_HOST", "0.0.0.0")
        self.backend_port = int(os.getenv("BACKEND_PORT", "8000"))
        self.ws_ping_interval = int(os.getenv("WS_PING_INTERVAL", "30"))
        self.ws_ping_timeout = int(os.getenv("WS_PING_TIMEOUT", "60"))
        self.ws_keepalive_timeout = int(os.getenv("WS_KEEPALIVE_TIMEOUT", "300"))

    def _init_llm_config(self):
        """Initialize LLM configuration"""
        self.llm_host = os.getenv("LLM_HOST", "http://localhost:11434")
        # or set cloud api for ollama https://ollama.com for cloud models
        self.llm_model = os.getenv("LLM_MODEL", "glm-4.7:cloud")
        # Ollama can run locally and use GPU/CPU
        self.llm_device = os.getenv("LLM_DEVICE", "auto")
        # auto, cuda, cpu
        # # Set to 0 to unload models immediately after requests (LOW_VRAM_MODE)
        self.llm_keep_alive = os.getenv("LLM_KEEP_ALIVE", "-1" if not self.low_vram_mode else "0")

    def _init_whisper_config(self):
        """Initialize Whisper STT configuration"""
        self.whisper_model = os.getenv("WHISPER_MODEL", "medium.en")
        self.whisper_device = os.getenv("WHISPER_DEVICE", "cuda")
        self.whisper_compute = os.getenv("WHISPER_COMPUTE", "auto")  # auto, float16, int8

    def _init_tts_config(self):
        """Initialize TTS engine configurations"""
        self.tts_engine = os.getenv("TTS_ENGINE", "piper").lower()

        # Piper TTS
        # voices are in two directory up from this config file
        config_file_dir = os.path.dirname(__file__)
        self.voices_dir = os.path.join(
            os.path.dirname(config_file_dir), "models", "voices", "pipertts"
        )
        self.piper_use_cuda = os.getenv("PIPER_USE_CUDA", "true").lower() == "true"

        # ---------- Chatterbox TTS Configuration ----------
        # Model type: "turbo" (350M, fastest, supports tags), "standard" (500M English), or "multilingual" (500M, 23+ languages)
        self.chatterbox_model_type = os.getenv("CHATTERBOX_MODEL_TYPE", "turbo").lower()
        self.chatterbox_device = os.getenv("CHATTERBOX_DEVICE", "cuda")
        self.chatterbox_ref_audio_dir = os.path.join(
            os.path.dirname(config_file_dir), "models", "voices", "chatterbox_refs"
        )
        # Default reference audio for voice cloning (optional - Chatterbox can work without it)
        _default_ref_audio = os.path.join(self.chatterbox_ref_audio_dir, "Goat.wav")
        self.chatterbox_default_ref_audio = os.getenv(
            "CHATTERBOX_DEFAULT_REF_AUDIO",
            _default_ref_audio if os.path.exists(_default_ref_audio) else "",
        )
        # Exaggeration control (0.0-1.0+, default 0.5): higher = more expressive/dramatic speech
        self.chatterbox_exaggeration = float(os.getenv("CHATTERBOX_EXAGGERATION", "0.5"))
        # CFG weight (0.0-1.0, default 0.5): lower = slower, more deliberate pacing
        self.chatterbox_cfg_weight = float(os.getenv("CHATTERBOX_CFG_WEIGHT", "0.5"))

        # ---------- Soprano TTS Configuration ----------
        # Backend: "auto" (default, uses LMDeploy if available), "lmdeploy", or "transformers"
        self.soprano_backend = os.getenv("SOPRANO_BACKEND", "auto").lower()
        self.soprano_device = os.getenv("SOPRANO_DEVICE", "cuda")
        # Local model directory for caching models
        self.soprano_model_dir = os.getenv(
            "SOPRANO_MODEL_DIR",
            os.path.join(os.path.dirname(__file__), "models", "soprano"),
        )
        # Cache size in MB for inference optimization (higher = faster but more VRAM)
        self.soprano_cache_size_mb = int(os.getenv("SOPRANO_CACHE_SIZE_MB", "10"))
        # Decoder batch size (higher = faster but more VRAM)
        self.soprano_decoder_batch_size = int(os.getenv("SOPRANO_DECODER_BATCH_SIZE", "1"))
        # Sampling parameters
        self.soprano_temperature = float(os.getenv("SOPRANO_TEMPERATURE", "0.7"))
        self.soprano_top_p = float(os.getenv("SOPRANO_TOP_P", "0.95"))
        self.soprano_repetition_penalty = float(os.getenv("SOPRANO_REPETITION_PENALTY", "1.0"))

    def _init_user_data_config(self):
        """Initialize user data directory configuration"""
        self.user_data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "user_data")
        self.user_images_dir = os.path.join(self.user_data_dir, "images")
        self.user_logs_dir = os.path.join(self.user_data_dir, "logs")
        self.user_characters_dir = os.path.join(self.user_data_dir, "characters")

        # Create directories if they don't exist
        os.makedirs(self.user_images_dir, exist_ok=True)
        os.makedirs(self.user_logs_dir, exist_ok=True)
        os.makedirs(self.user_characters_dir, exist_ok=True)

    def _init_imagegen_config(self):
        """Initialize image generation configuration"""
        self.imagegen_enabled = os.getenv("IMAGEGEN_ENABLED", "true").lower() == "true"
        self.imagegen_model = os.getenv("IMAGEGEN_MODEL", "prompthero/openjourney")
        self.imagegen_model_type = os.getenv(
            "IMAGEGEN_MODEL_TYPE", "diffusion"
        )  # "diffusion" for now
        self.imagegen_device = os.getenv("IMAGEGEN_DEVICE", "cuda")
        self.imagegen_width = int(os.getenv("IMAGEGEN_WIDTH", "768"))
        self.imagegen_height = int(os.getenv("IMAGEGEN_HEIGHT", "512"))
        self.imagegen_steps = int(os.getenv("IMAGEGEN_STEPS", "30"))
        self.imagegen_guidance = float(os.getenv("IMAGEGEN_GUIDANCE", "7.5"))
        self.imagegen_strength = float(os.getenv("IMAGEGEN_STRENGTH", "0.8"))

        # You can add LoRA Configuration as well on top of your base model
        self.imagegen_lora_enabled = os.getenv("IMAGEGEN_LORA_ENABLED", "false").lower() == "true"
        self.imagegen_lora_path = os.getenv("IMAGEGEN_LORA_PATH", "")
        self.imagegen_lora_weight = float(os.getenv("IMAGEGEN_LORA_WEIGHT", "0.8"))

        # Qwen-specific paths
        self.imagegen_qwen_vae_path = os.getenv("IMAGEGEN_QWEN_VAE_PATH", "")
        self.imagegen_qwen_unet_path = os.getenv("IMAGEGEN_QWEN_UNET_PATH", "")

    def _init_imageexplainer_config(self):
        """Initialize image explainer configuration
        1. better vram use 4B uncensored: "huihui-ai/Huihui-Qwen3-VL-4B-Thinking-abliterated"
                                          "huihui-ai/Huihui-Qwen3-VL-4B-Instruct-uncensored"
        2. lower vram use 2B abliterated: "huihui-ai/Huihui-Qwen3-VL-2B-Thinking-abliterated"
                                          "huihui-ai/Huihui-Qwen3-VL-2B-Instruct-abliterated"
        """
        self.imageexplainer_enabled = os.getenv("IMAGEEXPLAINER_ENABLED", "true").lower() == "true"
        self.imageexplainer_model = os.getenv(
            "IMAGEEXPLAINER_MODEL", "huihui-ai/Huihui-Qwen3-VL-2B-Instruct-abliterated"
        )
        self.imageexplainer_device = os.getenv("IMAGEEXPLAINER_DEVICE", "auto")
        self.imageexplainer_max_tokens = int(os.getenv("IMAGEEXPLAINER_MAX_TOKENS", "256"))


# Global instance
config = ConfigManager()
