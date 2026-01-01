# Contributing to Multimodal AI Assistant

First off, thank you for considering contributing to this project! 🎉

This project aims to create a fully-featured, privacy-first AI assistant (more like a personalized character) that runs locally. Whether you're fixing bugs, adding features, or improving documentation, your contributions are welcome!

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)

## Code of Conduct

This project follows a simple code of conduct:
- Be respectful and constructive
- Welcome newcomers
- Focus on what's best for the community
- Show empathy towards others

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected behavior** vs **actual behavior**
- **System information** (OS, Python version, GPU, VRAM)
- **Configuration** (relevant `.env` settings)
- **Logs** (from `src/user_data/logs/`)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- Use a clear and descriptive title
- Provide detailed description of the proposed feature
- Explain why this enhancement would be useful
- List any alternative solutions you've considered

### Pull Requests

- Fill in the pull request template
- Follow the coding standards
- Include tests if applicable
- Update documentation as needed
- Keep commits focused and atomic

## Getting Started

### Prerequisites

- Python 3.12 or higher
- Node.js 16.x or higher
- Git
- (Optional) NVIDIA GPU with CUDA for acceleration

### Setup Development Environment

1. **Fork and clone the repository**

```bash
git clone https://github.com/YOUR_USERNAME/multimodal-ai-assistant.git
cd multimodal-ai-assistant
```

2. **Create a virtual environment**

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux/Mac
python -m venv venv
source venv/bin/activate
```

3. **Install dependencies**

```bash
# Install in editable mode
pip install -e ".[dev]"

# The above pip command should construct the frontend as well.

# if you want to do it manually, the Install frontend dependencies
cd frontend
npm install
cd ..
```

4. **Configure environment**

```bash
# Copy example config
cp src/aiassistant/.env.example src/aiassistant/.env

# Edit .env with your settings
```

5. **Run the application**

```bash
# Terminal 1: Backend
python -m aiassistant.app

# Terminal 2: Frontend (optional, for development)
cd frontend
npm run dev
```

## Development Workflow

### Backend Development

The backend is a FastAPI application with the following structure:

```
src/aiassistant/
├── app.py              # FastAPI application entry point
├── config.py           # Configuration management
├── routes.py           # HTTP API endpoints
├── websocket.py        # WebSocket handlers
├── state.py            # Application state management
├── engine_manager.py   # Model lifecycle management
├── llm/                # Language model providers
├── stt/                # Speech-to-text engines
├── tts/                # Text-to-speech engines
├── imagegen/           # Image generation engines
├── imageexplainer/     # Vision-language models
└── utils/              # Utility functions
```

**Making Changes:**

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Test locally
4. Commit with descriptive messages

### Frontend Development

The frontend is a React + TypeScript + Vite application:

```
frontend/src/
├── App.tsx             # Main application component
├── main.tsx            # Entry point
├── types.ts            # TypeScript types
├── components/         # React components
└── audio/              # Audio handling utilities
```

**Development Server:**

```bash
cd frontend
npm run dev  # Hot reload at http://localhost:5173
```

**Building:**

```bash
npm run build  # Outputs to ../dist/
```

## Project Structure

### Adding a New LLM Provider

1. Create a new file in `src/aiassistant/llm/` (e.g., `anthropic.py`)
2. Inherit from `BaseLLM` in `llm/base.py`
3. Implement required methods:
   - `load()` - Initialize the model
   - `unload()` - Clean up resources
   - `chat()` - Main chat interface
4. Register in `engine_manager.py`

Example:

```python
from aiassistant.llm.base import BaseLLM

class AnthropicLLM(BaseLLM):
    def __init__(self, config):
        super().__init__(config)
        self.client = None

    def load(self):
        # Initialize Anthropic client
        pass

    def unload(self):
        # Cleanup
        pass

    async def chat(self, messages, stream=True):
        # Implement chat logic
        pass
```

### Adding a New TTS Engine

1. Create a new file in `src/aiassistant/tts/` (e.g., `elevenlabs.py`)
2. Inherit from `BaseTTS` in `tts/base.py`
3. Implement required methods:
   - `load()` - Initialize the engine
   - `unload()` - Clean up resources
   - `synthesize()` - Convert text to audio
4. Update `config.py` to handle new engine settings
5. Register in `engine_manager.py`

### Adding a New Image Generation Backend

1. Create a new file in `src/aiassistant/imagegen/` (e.g., `comfyui.py`)
2. Inherit from `BaseImageGenerator` in `imagegen/base.py`
3. Implement required methods:
   - `load()` - Initialize the generator
   - `unload()` - Clean up resources
   - `generate()` - Generate images from prompts
4. Register in `engine_manager.py`

Example for ComfyUI integration:

```python
from aiassistant.imagegen.base import BaseImageGenerator
import requests

class ComfyUIGenerator(BaseImageGenerator):
    def __init__(self, config):
        super().__init__(config)
        self.comfyui_url = config.comfyui_url

    def load(self):
        # Check ComfyUI server availability
        pass

    def unload(self):
        # Nothing to unload for API-based service
        pass

    async def generate(self, prompt: str, **kwargs):
        # Send request to ComfyUI API
        # Return generated image
        pass
```

## Coding Standards

### Python

- Follow PEP 8 style guide
- Use type hints where possible
- Write docstrings for classes and functions
- Use async/await for I/O operations
- Keep functions focused and small

```python
async def process_audio(audio_data: bytes, config: dict) -> str:
    """
    Process audio data and return transcription.

    Args:
        audio_data: Raw audio bytes
        config: Configuration dictionary

    Returns:
        Transcribed text
    """
    # Implementation
    pass
```

### TypeScript/React

- Use TypeScript strict mode
- Follow React best practices
- Use functional components with hooks
- Keep components small and reusable
- Use meaningful variable names

```typescript
interface MessageProps {
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
}

const MessageItem: React.FC<MessageProps> = ({ content, sender, timestamp }) => {
  // Implementation
};
```

### Git Commit Messages

- Use present tense ("Add feature" not "Added feature")
- Use imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit first line to 72 characters
- Reference issues and pull requests liberally

```
Add ComfyUI integration for image generation

- Implement ComfyUIGenerator class
- Add configuration options to .env.example
- Update documentation
- Fixes #123
```

## Testing

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=aiassistant

# Run specific test file
pytest tests/test_llm.py
```

### Writing Tests

- Place tests in `tests/` directory (which is non existent for now, I dont know how the code is working)
- Mirror the source structure
- Use descriptive test names
- Test edge cases and error conditions

```python
def test_whisper_transcription():
    """Test Whisper STT transcription accuracy"""
    whisper = WhisperSTT(config)
    whisper.load()

    # Load test audio
    audio_data = load_test_audio("test_sample.wav")

    # Transcribe
    result = whisper.transcribe(audio_data)

    # Assert
    assert "expected text" in result.lower()

    whisper.unload()
```

## Submitting Changes

### Pull Request Process

1. **Update Documentation**
   - Update README.md if needed
   - Update .env.example if adding configuration
   - Add/update docstrings

2. **Test Your Changes**
   - Run existing tests
   - Add new tests for new features
   - Test manually on your system

3. **Create Pull Request**
   - Use a clear, descriptive title
   - Reference related issues
   - Describe what changes were made and why
   - Include screenshots for UI changes

4. **Code Review**
   - Address review comments
   - Keep discussion constructive
   - Be open to feedback

5. **Merge**
   - Squash commits if requested
   - Maintainers will merge when approved

### PR Template

```markdown
## Description
Brief description of changes

## Related Issue
Fixes #(issue number)

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe testing performed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-reviewed code
- [ ] Commented complex code
- [ ] Updated documentation
- [ ] Added tests
- [ ] All tests pass
- [ ] No new warnings
```

## Areas for Contribution

We especially welcome contributions in these areas:

### High Priority
- **LLM Providers**: OpenAI, Anthropic, Google Gemini, local llama.cpp
- **TTS Engines**: More voice options, voice cloning
- **Image Generation**: ComfyUI integration, more model support
- **Testing**: Unit tests, integration tests
- **Documentation**: Tutorials, examples, translations

### Medium Priority
- **UI/UX**: Improved frontend design, mobile responsiveness
- **Performance**: Optimization, caching, batch processing
- **Features**: Conversation history, character profiles, multi-user
- **Monitoring**: Better logging, error tracking, performance metrics

### Long-term / Experimental
- **3D Avatar**: Live2D/3D character rendering
- **Video Generation**: Integrate video models (possible but requires higher VRAm, lets hope some brave soul will create a Quant soon :))
- **Multi-modal Input**: Video input processing (same as above)
- **Plugin System**: Extensible architecture

## Questions?

- **GitHub Discussions**: For general questions and ideas
- **GitHub Issues**: For bug reports and feature requests
- **Email**: [ravi.purushottamrajpurohit@gmail.com]

## Recognition

Contributors will be:
- Listed in README.md
- Mentioned in release notes
- Given credit in commit history

Thank you for contributing! 🚀
