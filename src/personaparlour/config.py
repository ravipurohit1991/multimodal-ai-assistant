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
        # Browser origins allowed to call the API cross-origin (CORS), comma-separated.
        # Same-origin requests (the frontend served by this backend) never need CORS;
        # this list only matters for cross-origin pages like the Vite dev server.
        default_cors_origins = (
            "http://localhost:5173,http://127.0.0.1:5173,"
            "http://localhost:8000,http://127.0.0.1:8000"
        )
        self.cors_allow_origins = [
            origin.strip()
            for origin in os.getenv("CORS_ALLOW_ORIGINS", default_cors_origins).split(",")
            if origin.strip()
        ]
        self.ws_ping_interval = int(os.getenv("WS_PING_INTERVAL", "30"))
        self.ws_ping_timeout = int(os.getenv("WS_PING_TIMEOUT", "60"))
        self.ws_keepalive_timeout = int(os.getenv("WS_KEEPALIVE_TIMEOUT", "300"))

    def _init_llm_config(self):
        """Initialize LLM configuration"""
        self.llm_host = os.getenv("LLM_HOST", "http://localhost:11434")
        # or set cloud api for ollama https://ollama.com for cloud models
        # No default: the user picks a model in the UI, and an unset value keeps
        # the backend from silently pinning a model that may not be installed.
        self.llm_model = os.getenv("LLM_MODEL") or None
        # Ollama can run locally and use GPU/CPU
        self.llm_device = os.getenv("LLM_DEVICE", "auto")
        # auto, cuda, cpu
        # # Set to 0 to unload models immediately after requests (LOW_VRAM_MODE)
        self.llm_keep_alive = os.getenv("LLM_KEEP_ALIVE", "-1" if not self.low_vram_mode else "0")
        self.output_mode = os.getenv("OUTPUT_MODE", "text").strip().lower()
        if self.output_mode not in {"text", "voice"}:
            self.output_mode = "text"

        # Context window. Ollama applies its own server default (4096 unless
        # OLLAMA_CONTEXT_LENGTH says otherwise) when a request names no num_ctx,
        # and silently discards whatever does not fit — which, with the standing
        # system block sent first, is the conversation. A mid-story turn in this
        # app runs to roughly six thousand tokens, so the default here is set
        # above that rather than at the server's figure.
        self.llm_num_ctx = max(1024, int(os.getenv("LLM_NUM_CTX", "16384")))
        # Hard ceiling on one reply. 0 means "let the Director's length dial
        # decide", which is the sane default; a number here overrides the dial
        # for users on hardware where a long generation is genuinely painful.
        self.llm_max_tokens = max(0, int(os.getenv("LLM_MAX_TOKENS", "0")))
        # Sampling. Left at Ollama's own defaults unless the user says otherwise,
        # so this change does not quietly alter how anyone's model already reads.
        self.llm_temperature = self._optional_float("LLM_TEMPERATURE")
        self.llm_top_p = self._optional_float("LLM_TOP_P")
        self.llm_repeat_penalty = self._optional_float("LLM_REPEAT_PENALTY")

    @staticmethod
    def _optional_float(name: str) -> float | None:
        """Read a tuning knob that is only sent when the user actually set it."""
        raw = os.getenv(name, "").strip()
        if not raw:
            return None
        try:
            return float(raw)
        except ValueError:
            return None

    def _init_whisper_config(self):
        """Initialize Whisper STT configuration"""
        self.whisper_model = os.getenv("WHISPER_MODEL", "medium.en")
        self.whisper_device = os.getenv("WHISPER_DEVICE", "cuda")
        self.whisper_compute = os.getenv("WHISPER_COMPUTE", "auto")  # auto, float16, int8

    def _init_tts_config(self):
        """Initialize TTS engine configurations"""
        self.tts_engine = os.getenv("TTS_ENGINE", "neutts").lower()

        # Piper TTS
        # voices are in two directory up from this config file
        config_file_dir = os.path.dirname(__file__)
        self.voices_dir = os.path.join(
            os.path.dirname(config_file_dir), "models", "voices", "pipertts"
        )
        self.piper_use_cuda = os.getenv("PIPER_USE_CUDA", "true").lower() == "true"

        # ---------- Chatterbox TTS Configuration ----------
        # Model type: "turbo" (350M, fastest, supports tags), "standard" (500M English), or "multilingual" (500M, 23+ languages)
        # Default to turbo for best compatibility across CPU-only environments.
        self.chatterbox_model_type = os.getenv("CHATTERBOX_MODEL_TYPE", "turbo").lower()
        self.chatterbox_device = os.getenv("CHATTERBOX_DEVICE", "cpu")
        self.chatterbox_ref_audio_dir = os.path.join(
            os.path.dirname(config_file_dir), "models", "voices", "chatterbox_refs"
        )
        # Default reference audio for voice cloning (optional - Chatterbox can work without it)
        _default_ref_audio = os.path.join(self.chatterbox_ref_audio_dir, "Brittney.mp3")
        self.chatterbox_default_ref_audio = os.getenv(
            "CHATTERBOX_DEFAULT_REF_AUDIO",
            _default_ref_audio if os.path.exists(_default_ref_audio) else "",
        )
        # Exaggeration control (0.0-1.0+, default 0.5): higher = more expressive/dramatic speech
        self.chatterbox_exaggeration = float(os.getenv("CHATTERBOX_EXAGGERATION", "0.5"))
        # CFG weight (0.0-1.0, default 0.5): lower = slower, more deliberate pacing
        self.chatterbox_cfg_weight = float(os.getenv("CHATTERBOX_CFG_WEIGHT", "0.5"))

        # ---------- NeuTTS Configuration ----------
        # Backbone. "auto" picks the neutts-2e family either way — the only one
        # that takes an emotion token, which is what lets a line be delivered
        # angry or wistful instead of uniformly flat — preferring the quantized
        # build when llama-cpp-python is installed, since that runs about four
        # times faster on CPU. Name a repo to override. The phoneme models
        # ("neutts-air", "neutts-nano" and its -french/-german/-spanish
        # siblings) read plain prose well but refuse emotion entirely.
        self.neutts_backbone = os.getenv("NEUTTS_BACKBONE", "auto")
        self.neutts_device = os.getenv("NEUTTS_DEVICE", "cpu")
        # "neuphonic/neucodec" (full), "neuphonic/distill-neucodec" (lighter), or
        # "neuphonic/neucodec-onnx-decoder" (CPU decode only — cannot clone new
        # voices, since encoding a reference clip needs the full codec).
        self.neutts_codec = os.getenv("NEUTTS_CODEC", "neuphonic/neucodec")
        self.neutts_codec_device = os.getenv("NEUTTS_CODEC_DEVICE", self.neutts_device)
        # Custom cloned voices: a reference clip (3-15s, mono, clean) plus a
        # "<name>.txt" transcript. Missing transcripts are filled in with Whisper.
        self.neutts_ref_audio_dir = os.getenv(
            "NEUTTS_REF_AUDIO_DIR",
            os.path.join(os.path.dirname(config_file_dir), "models", "voices", "neutts_refs"),
        )
        self.neutts_default_voice = os.getenv("NEUTTS_DEFAULT_VOICE", "emily")
        # NeuTTS is native 24 kHz and the browser resamples on playback, so the
        # default keeps the full band rather than throwing half of it away.
        self.neutts_sample_rate = int(os.getenv("NEUTTS_SAMPLE_RATE", "24000"))
        self.neutts_temperature = float(os.getenv("NEUTTS_TEMPERATURE", "1.0"))
        self.neutts_top_k = int(os.getenv("NEUTTS_TOP_K", "50"))
        # Fixed seed makes a line reproducible take to take; unset varies it.
        _neutts_seed = os.getenv("NEUTTS_SEED", "").strip()
        self.neutts_seed = int(_neutts_seed) if _neutts_seed else None
        # eSpeak language code, only needed for a phoneme backbone the library
        # does not recognise by repo name.
        self.neutts_language = os.getenv("NEUTTS_LANGUAGE", "").strip() or None
        # Let the story's own cues ([mood: ...], [laugh], *she snarls*) pick the
        # emotion each line is spoken with.
        self.neutts_expressive = os.getenv("NEUTTS_EXPRESSIVE", "true").lower() == "true"

        # ---------- Soprano TTS Configuration ----------
        # Backend: "auto" (default, uses LMDeploy if available), "lmdeploy", or "transformers"
        self.soprano_backend = os.getenv("SOPRANO_BACKEND", "auto").lower()
        self.soprano_device = os.getenv("SOPRANO_DEVICE", "cpu")
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
        self.imagegen_enabled = os.getenv("IMAGEGEN_ENABLED", "false").lower() == "true"
        self.imagegen_model = os.getenv("IMAGEGEN_MODEL", "prompthero/openjourney")
        self.imagegen_model_type = os.getenv(
            "IMAGEGEN_MODEL_TYPE", "perchance"
        )  # "diffusion" or "perchance"
        self.imagegen_device = os.getenv("IMAGEGEN_DEVICE", "cpu")
        self.imagegen_width = int(os.getenv("IMAGEGEN_WIDTH", "768"))
        self.imagegen_height = int(os.getenv("IMAGEGEN_HEIGHT", "512"))
        self.imagegen_steps = int(os.getenv("IMAGEGEN_STEPS", "30"))
        self.imagegen_guidance = float(os.getenv("IMAGEGEN_GUIDANCE", "7.5"))
        self.imagegen_strength = float(os.getenv("IMAGEGEN_STRENGTH", "0.8"))

        # Perchance image generation configuration
        self.imagegen_perchance_generator = os.getenv(
            "IMAGEGEN_PERCHANCE_GENERATOR", "ai-text-to-image-generator"
        )
        self.imagegen_perchance_api_url = os.getenv(
            "IMAGEGEN_PERCHANCE_API_URL", "https://perchance.org/api/generateList.php"
        )
        self.imagegen_perchance_prompt_key = os.getenv("IMAGEGEN_PERCHANCE_PROMPT_KEY", "prompt")
        self.imagegen_perchance_timeout_seconds = float(
            os.getenv("IMAGEGEN_PERCHANCE_TIMEOUT_SECONDS", "60")
        )
        self.imagegen_perchance_extra_params = os.getenv("IMAGEGEN_PERCHANCE_EXTRA_PARAMS", "")

        # You can add LoRA Configuration as well on top of your base model
        self.imagegen_lora_enabled = os.getenv("IMAGEGEN_LORA_ENABLED", "false").lower() == "true"
        self.imagegen_lora_path = os.getenv("IMAGEGEN_LORA_PATH", "")
        self.imagegen_lora_weight = float(os.getenv("IMAGEGEN_LORA_WEIGHT", "0.8"))

        # Qwen-specific paths
        self.imagegen_qwen_vae_path = os.getenv("IMAGEGEN_QWEN_VAE_PATH", "")
        self.imagegen_qwen_unet_path = os.getenv("IMAGEGEN_QWEN_UNET_PATH", "")

    def _init_imageexplainer_config(self):
        """Initialize image explainer configuration
        1. if you have more vram, use the 4B model: "Qwen/Qwen3-VL-4B-Instruct"
        2. for lower vram, use the 2B model: "Qwen/Qwen3-VL-2B-Instruct"
        """
        self.imageexplainer_enabled = os.getenv("IMAGEEXPLAINER_ENABLED", "true").lower() == "true"
        self.imageexplainer_model = os.getenv("IMAGEEXPLAINER_MODEL", "Qwen/Qwen3-VL-2B-Instruct")
        self.imageexplainer_device = os.getenv("IMAGEEXPLAINER_DEVICE", "auto")
        self.imageexplainer_max_tokens = int(os.getenv("IMAGEEXPLAINER_MAX_TOKENS", "256"))


# Global instance
config = ConfigManager()
