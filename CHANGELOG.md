# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Idle presence** — the character can speak first. When the room goes quiet, they may
  take a turn of their own: a small piece of business, something noticed in the scene, a
  thought said aloud, or a question back to you. A Presence dial in the Director bar
  (off / rarely / often, plus the length of quiet to wait out) controls it, and it is off
  by default. The browser holds the clock — it can see typing, the mic, an open modal, and
  whether the window is even in front of you — while the backend decides whether the ask is
  granted, counting beats so a silence never becomes a monologue. Unprompted turns are
  marked "spoke first" in the transcript, the beat varies rather than repeating itself, and
  the setting travels with a saved story.
- **Story memory** — a rolling, model-written record of everything that scrolls out of the
  context window. Older turns are folded into a "story so far" block (`src/aiassistant/memory.py`)
  and replaced in the prompt, while recent exchanges still go out verbatim, so a long
  roleplay keeps its continuity without resending the whole transcript. Runs itself in the
  background after a reply, or on demand; the record is readable and editable from a new
  Story memory modal, travels with saved stories, and survives a reconnect. Off-switch and
  window/threshold dials included; a conversation with no memory yet is prompted exactly
  as before.
- **Story library** — save whole sessions (chat, cast, lorebook, settings) server-side under
  `user_data/sessions` and reopen them later from a new "Story library" modal
  (`GET/POST/DELETE /api/sessions`). File-based save/load still works.
- **Auto-cast** — in group scenes, a new "Auto" toggle lets the model direct turn-taking:
  the backend (`choose_speaker`) picks which character naturally answers each message.
- **Living stage** — the conversation backdrop now renders the scene: rain, storm with
  lightning, snow, fog, wind, stars at night, and fireflies at dusk (canvas particles,
  reduced-motion aware, toggleable from the Scene bar).
- **Scene ambience** — synthesized soundscapes (rain, thunder rolls, wind, snow hush,
  night crickets) generated locally with WebAudio; volume slider in the Scene bar.
- **Export as story** — download the conversation as a formatted Markdown story.
- **Generation stats** — each reply shows generation time and tokens/second, reported by
  the backend in `assistant_end`.

### Changed
- **Complete UI redesign** ("ink & limelight"): dark-first theme with an amber accent,
  bundled fonts (IBM Plex Sans for UI, Literata for story prose, Plex Mono for data),
  a consistent SVG icon set replacing emoji buttons, quiet hover-revealed message
  actions, a framed composer console, slimmer bars, and restyled modals/panels.
  Global design tokens live in `frontend/src/theme.ts` + `frontend/src/styles.css`.
- Right-side status panels are now fully theme-aware (previously hardcoded light styles).

### Fixed
- Switching the TTS engine no longer resets the roleplay system prompt mid-conversation.
- "Wipe everything" now also clears the server-side session library.

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
