# Multimodal AI Assistant

> A fully-featured AI companion that sees, speaks, and creates—all running locally.

## What is This?

Ever wanted an AI assistant that truly understands you? One that you can **talk to naturally**, **show images**, and have it **generate visuals** in response? This multimodal AI assistant brings together the best of modern AI capabilities into one seamless experience.

**Note**: This project is being vibe coded—built organically and iteratively as ideas flow.

## Key Features

### **Natural Conversations**
- Speak naturally using your microphone—no typing required
- Multiple input modes: voice, text, or text + images
- Real-time voice responses with customizable TTS engines

### **Visual Understanding**
- Show it an image and describe what you want
- Powered by local vision-language models for privacy
- Understands context from both your words and images

### **Image Generation**
- Creates images based on conversation context
- The AI can autonomously decide when to generate visuals
- Uses local Stable Diffusion for complete privacy

### **Privacy-First**
- Everything runs locally—no cloud dependencies required
- Your conversations and images never leave your machine
- Optional cloud LLM support for those who does not have powerful PC (OLLAMA and HF should do it)

## How It Works

1. **Input** → Talk, type, or share images with the assistant
2. **Understanding** → Vision models describe images, speech is transcribed
3. **Thinking** → Your chosen LLM processes everything as natural conversation
4. **Response** → Get spoken responses and generated images in real-time

## Tech Stack

- **Speech-to-Text**: Whisper
- **Vision Understanding**: Qwen3VL-4B (uncensored)
- **Language Model**: Ollama (local or cloud)
- **Image Generation**: Stable Diffusion
- **Text-to-Speech**: Multiple engines (Piper, F5-TTS, Chatterbox, Soprano)

## Perfect For

- Developers building multimodal AI applications
- Privacy-conscious users wanting local AI assistants
- Researchers exploring vision-language-generation pipelines
- Anyone who wants a truly interactive AI companion

## Future Vision

**3D Avatar Integration** (Long-term goal, not current priority)

The ultimate vision is to have an animated 3D model of your choice that reacts and interacts during conversations, something similar to VTuber. Using technologies like Qwen ControlNet, image editing pipelines, PyGame, Wan, and all other opensource video/image generation models it should be possible to create a fully animated avatar that:
- Lip-syncs to generated speech
- Shows expressions and reactions based on conversation context
- Responds with gestures and body language (essentially a more advanced version of microsfot CLIPPY, yes I am OLD)

This feature is resource-intensive and not a top priority, but represents the eventual direction for a truly immersive AI companion experience.

---

*More documentation and setup instructions coming soon...*
