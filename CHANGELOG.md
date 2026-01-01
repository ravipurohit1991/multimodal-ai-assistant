# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Nothing yet

### Changed
- Nothing yet

### Fixed
- Nothing yet

## [0.1.0] - 2026-01-01

### Added
- Initial public release
- Voice input using Whisper STT (faster-whisper)
- Voice output with multiple TTS engines:
  - Piper TTS (default, lightweight)
  - Chatterbox TTS (expressive)
  - Soprano TTS (fast)
- Image understanding with Qwen3VL vision-language models
- Image generation with Stable Diffusion
  - Support for diffusion models (SD1.5, SDXL, etc.)
  - Support for Qwen Image Edit models in progress (should work via comfyui eitherway for now)
  - LoRA support for custom styles
- LLM integration via Ollama (local and cloud)
- FastAPI backend with WebSocket support
- React + TypeScript frontend with Vite
- Real-time bidirectional communication (latency depends on user hardware)
- Automatic model downloading from HuggingFace
- Character profile system (basic) -> baby infront of SillyTavern
- Conversation context management -> Not embedding or vector, just dumping all messages for now.

### Documentation
- Comprehensive README.md with full feature overview
- QUICK_SETUP.md for fast installation
- MODEL_DOWNLOAD_GUIDE.md with detailed model information
- BUILD_INSTRUCTIONS.md for development setup
- CONTRIBUTING.md with contribution guidelines
- PRE_PUBLICATION_CHECKLIST.md for maintainers

### Configuration
- Flexible LLM configuration (Ollama local/cloud)
- Whisper model selection (tiny to large-v3)
- Multiple TTS engine options
- Image generation customization
- Image explainer customization
- WebSocket tuning parameters

### Known Issues
- First run requires large model downloads (10-40GB), if one wishes to truely run everythin locally
- High VRAM requirements for full features (12GB recommended: I can run comfortably everything in decent speed with my Nvidia 5070Ti 12GB)
- Piper TTS voices require manual download of voices
- Some models may not work on older GPUs
- Limited browser compatibility (modern browsers only)
- UI is not the best in the world.

### Future Plans
- 3D/Live2D avatar integration (think controlNet, image ot 3D Ai models, etc) : rquires significant effeort to do a POC. Feel free to take it up if it interests you
- More LLM providers (OpenAI, Anthropic, etc.)
- More TTS providers with voice cloning
- ComfyUI integration for image generation
- Video input processing
- Video generation capabilities
- Advanced character profiles
- Conversation history export/import
- Plugin system for custom engines
- Mobile app support
- Multi-user support
- Cloud deployment options

---

## Version History

- **0.1.0** (2026-01-01) - Initial public release

---

## How to Use This Changelog

### For Users
Check this file to see what's new, changed, or fixed in each version.

### For Contributors
When submitting a PR, add your changes to the [Unreleased] section under the appropriate category:
- **Added** for new features
- **Changed** for changes in existing functionality
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features
- **Fixed** for any bug fixes
- **Security** for vulnerability fixes

### Categories

- **Added**: New features, functionality, or documentation
- **Changed**: Changes to existing features or behavior
- **Deprecated**: Features marked for removal in future versions
- **Removed**: Removed features or functionality
- **Fixed**: Bug fixes
- **Security**: Security-related fixes or improvements

### Version Numbers

This project uses [Semantic Versioning](https://semver.org/):
- **MAJOR** version (X.0.0) - Incompatible API changes
- **MINOR** version (0.X.0) - New functionality (backwards-compatible)
- **PATCH** version (0.0.X) - Backwards-compatible bug fixes
