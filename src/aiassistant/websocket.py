"""
WebSocket Handler - Real-time voice/text interaction via WebSocket
"""

import asyncio
import base64
import json
import os
import re
from datetime import datetime

from fastapi import WebSocket, WebSocketDisconnect

from aiassistant.config import config
from aiassistant.engine_manager import engine_manager
from aiassistant.llm import OllamaClient
from aiassistant.logger import logger
from aiassistant.state import ConnState, cancel_llm, get_system_prompt_for_tts_engine
from aiassistant.tts import PiperTTS
from aiassistant.utils import image_to_base64, phrase_chunker, save_image_to_disk


async def ws_endpoint(ws: WebSocket):
    """Main WebSocket endpoint for real-time voice/text interaction"""
    await ws.accept()
    state = ConnState()

    logger.info("WebSocket client connected")
    logger.debug(f"System prompt preview: {state.messages[0]['content'][:200]}...")

    async def send_json(obj: dict):
        """Helper to send JSON messages with error handling"""
        try:
            await ws.send_text(json.dumps(obj))
        except Exception as e:
            # Connection already closed, silently fail
            if "disconnect" in str(e).lower() or "closed" in str(e).lower():
                logger.warning(
                    f"WebSocket already disconnected, skipping message: {obj.get('type', 'unknown')}"
                )
            else:
                raise

    # Send initial configuration to client
    await send_json(
        {
            "type": "config",
            "tts_engine": config.tts_engine,
            "llm_model": config.llm_model,
            "output_mode": state.output_mode,
        }
    )

    async def process_text_message(user_text: str, image_base64: str | None = None):
        """Process text message with optional image attachment"""
        try:
            await speak_streaming_from_llm(user_text, image_base64)
        except asyncio.CancelledError:
            logger.info("Text message processing cancelled")
            raise
        except WebSocketDisconnect:
            logger.warning("WebSocket disconnected during processing")
            # Don't re-raise, just stop gracefully
        except Exception as e:
            if "disconnect" in str(e).lower() or "closed" in str(e).lower():
                logger.warning("WebSocket disconnected during processing")
            else:
                logger.error(f"Text message error: {e}")
                import traceback

                traceback.print_exc()

    async def speak_streaming_from_llm(user_text: str, image_base64: str | None = None):
        """Stream assistant response from LLM and synthesize to audio chunks"""
        if image_base64:
            logger.info(f"User said: {user_text} [with image: {len(image_base64)} chars]")
        else:
            logger.info(f"User said: {user_text}")

        # Build user message content
        user_message_content = user_text if user_text else "What do you see in this image?"

        # Handle image attachment: use image explainer to describe it
        if image_base64 and engine_manager.image_explainer is not None:
            try:
                logger.info("Processing image with vision model...")

                # Extract base64 data (remove data:image/...;base64, prefix if present)
                if "," in image_base64:
                    image_data = image_base64.split(",", 1)[1]
                else:
                    image_data = image_base64

                # Decode and save image temporarily
                image_bytes = base64.b64decode(image_data)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                temp_image_path = os.path.join(config.user_images_dir, f"temp_{timestamp}.png")

                with open(temp_image_path, "wb") as f:
                    f.write(image_bytes)

                logger.info(f"Saved temporary image: {temp_image_path}")

                # Lazy load model if needed
                if engine_manager.image_explainer.model is None:
                    logger.info("Loading image explainer model for first use...")
                    engine_manager.image_explainer.load_model()

                # Generate description
                image_description = engine_manager.image_explainer.explain_image(
                    temp_image_path, prompt=user_message_content
                )

                # Unload model in low VRAM mode
                if config.low_vram_mode:
                    engine_manager.unload_image_explainer()

                # Append description to user text
                if user_message_content:
                    user_message_content = f"{user_message_content}\n\n[The user attached an image with the following description: {image_description}]"
                else:
                    user_message_content = f"[The user attached an image with the following description: {image_description}]"

                # Send notification to client
                await send_json({"type": "image_described", "description": image_description})

            except Exception as e:
                logger.error(f"Failed to process image: {e}")
                import traceback

                traceback.print_exc()
                # Continue without image description
                if not user_message_content:
                    user_message_content = "I sent you an image, but it couldn't be processed."

        elif image_base64 and engine_manager.image_explainer is None:
            logger.warning("Image received but image explainer is not available")
            # Inform the user
            if user_message_content:
                user_message_content = f"{user_message_content}\n\n[Note: An image was attached but image explanation is not available]"
            else:
                user_message_content = (
                    "[An image was attached but image explanation is not available]"
                )

        # Create text-only user message (never send images to LLM)
        user_message = {"role": "user", "content": user_message_content}

        # Only add user message if it's not already the last message in history
        if (
            not state.messages
            or state.messages[-1].get("content") != user_message_content
            or state.messages[-1].get("role") != "user"
        ):
            state.messages.append(user_message)

        await send_json({"type": "assistant_start"})

        # Prepare messages for LLM - either full context or just system + latest
        if state.use_context:
            llm_messages = state.messages
        else:
            # Only system prompt + current user message
            system_msgs = [m for m in state.messages if m["role"] == "system"]
            llm_messages = system_msgs + [{"role": "user", "content": user_text}]

        # Send the JSON payload that will be sent to LLM
        llm_payload = {
            "model": state.llm_model,
            "messages": llm_messages,
            "stream": True,
        }
        await send_json({"type": "llm_payload", "payload": llm_payload})

        full = ""
        buf = ""
        tts_engine = engine_manager.tts_engine
        assert tts_engine is not None, "TTS engine not initialized"

        try:
            logger.info("Starting LLM streaming...")
            temp_client = OllamaClient(host=state.llm_host, default_model=state.llm_model)
            async for delta in temp_client.stream_chat(llm_messages, model=state.llm_model):
                full += delta
                buf += delta

                # Remove IMAGE tags from display (but keep other tags like [laugh], [gasp])
                display_delta = re.sub(r"\[IMAGE:\s*[^\]]+\]", "", delta, flags=re.IGNORECASE)

                # Detect if IMAGE tags were present
                if re.search(r"\[IMAGE:\s*[^\]]+\]", delta, re.IGNORECASE):
                    logger.debug(f"IMAGE tag detected in: {delta[:100]}")

                await send_json({"type": "assistant_delta", "delta": display_delta})

                ready, buf = phrase_chunker(buf)
                for phrase in ready:
                    # Remove ALL tags (including [IMAGE:...], [laugh], etc.) before TTS
                    phrase_for_tts = re.sub(r"\[[^\]]+\]", "", phrase, flags=re.IGNORECASE)
                    clean_phrase = phrase_for_tts.strip()

                    if not clean_phrase:
                        continue

                    # Only synthesize audio if output mode is "voice"
                    if state.output_mode == "voice":
                        logger.info(f"Synthesizing: {clean_phrase}")

                        state.speaking = True
                        audio = await tts_engine.synthesize(clean_phrase)
                        logger.info(
                            f"Generated {len(audio.pcm16le)} bytes of audio at {audio.sample_rate}Hz"
                        )
                        await send_json(
                            {
                                "type": "audio_start",
                                "sample_rate": audio.sample_rate,
                                "format": "pcm16le",
                            }
                        )
                        await ws.send_bytes(audio.pcm16le)
                        await send_json({"type": "audio_end"})
                        state.speaking = False

            # flush remaining buffer
            logger.info(f"LLM complete. Full response: {full}")
            logger.debug(f"Remaining buffer: {buf}")
            if buf.strip():
                # Remove ALL tags (including [IMAGE:...], [laugh], etc.) before TTS
                buf_for_tts = re.sub(r"\[[^\]]+\]", "", buf, flags=re.IGNORECASE)
                clean_buf = buf_for_tts.strip()

                if clean_buf:
                    # Only synthesize audio if output mode is "voice"
                    if state.output_mode == "voice":
                        logger.info(f"Synthesizing final phrase: {clean_buf}")
                        state.speaking = True
                        audio = await tts_engine.synthesize(clean_buf)
                        logger.info(
                            f"Generated {len(audio.pcm16le)} bytes of audio at {audio.sample_rate}Hz"
                        )
                        await send_json(
                            {
                                "type": "audio_start",
                                "sample_rate": audio.sample_rate,
                                "format": "pcm16le",
                            }
                        )
                        await ws.send_bytes(audio.pcm16le)
                        await send_json({"type": "audio_end"})
                        state.speaking = False

            # Check for image generation requests in the full response
            if engine_manager.image_generator is not None:
                image_requests = re.findall(r"\[IMAGE:\s*([^\]]+)\]", full, re.IGNORECASE)

                if image_requests:
                    # Initialize image generator if not already done (lazy loading)
                    if not engine_manager.image_generator._initialized:
                        logger.info("Initializing image generator...")
                        engine_manager.image_generator.initialize()

                    # Update character description if provided
                    if state.character_description:
                        engine_manager.image_generator.set_character_description(
                            state.character_description
                        )

                    # Generate images for each request
                    for img_prompt_raw in image_requests:
                        # Use LLM to optimize the prompt to be concise (under 40 words)
                        logger.info("Optimizing image prompt...")
                        optimization_messages = [
                            {
                                "role": "system",
                                "content": "You are a concise image prompt optimizer. Convert descriptions into short, focused image prompts using comma-separated keywords. Focus on: pose, action, clothing, setting, lighting. Maximum 40 words. No full sentences.",
                            },
                            {
                                "role": "user",
                                "content": f"Optimize this image description into a concise prompt:\n{img_prompt_raw.strip()}",
                            },
                        ]

                        optimized_prompt = ""
                        temp_client = OllamaClient(
                            host=state.llm_host, default_model=state.llm_model
                        )
                        async for delta in temp_client.stream_chat(
                            optimization_messages, model=state.llm_model
                        ):
                            optimized_prompt += delta

                        img_prompt = optimized_prompt.strip()
                        logger.info(f"Optimized: {img_prompt_raw[:50]}... -> {img_prompt}")

                        await send_json({"type": "image_generating", "prompt": img_prompt})

                        try:
                            # Generate the image
                            image = await engine_manager.image_generator.generate(
                                scene_prompt=img_prompt.strip(),
                                include_character=bool(state.character_description),
                                num_inference_steps=config.imagegen_steps,
                                guidance_scale=config.imagegen_guidance,
                                width=config.imagegen_width,
                                height=config.imagegen_height,
                            )

                            # Save image to user_data/images directory
                            save_image_to_disk(image, img_prompt.strip(), config.user_images_dir)

                            # Convert to base64 for transmission
                            img_base64 = image_to_base64(image)

                            # Send the image to frontend
                            await send_json(
                                {
                                    "type": "image_generated",
                                    "image": img_base64,
                                    "prompt": img_prompt.strip(),
                                    "format": "png",
                                }
                            )
                            logger.info(f"Image sent to client ({len(img_base64)} bytes)")

                            # Unload model in low VRAM mode
                            if config.low_vram_mode:
                                engine_manager.unload_image_generator()

                        except Exception as e:
                            logger.error(f"Image generation failed: {e}")
                            import traceback

                            traceback.print_exc()
                            await send_json(
                                {
                                    "type": "image_error",
                                    "error": str(e),
                                    "prompt": img_prompt.strip(),
                                }
                            )

            state.messages.append({"role": "assistant", "content": full})
            await send_json({"type": "assistant_end"})
            logger.info("Assistant response complete")
        except asyncio.CancelledError:
            logger.info("LLM streaming cancelled by user")
            state.speaking = False
            try:
                await send_json({"type": "assistant_cancelled"})
            except Exception:
                pass  # Connection likely closed
            raise
        except WebSocketDisconnect:
            logger.warning("WebSocket disconnected during LLM streaming")
            state.speaking = False
            # Don't re-raise, connection is gone
        except Exception as e:
            if "disconnect" in str(e).lower() or "closed" in str(e).lower():
                logger.warning("WebSocket disconnected during LLM streaming")
                state.speaking = False
            else:
                logger.error(f"Error in speak_streaming_from_llm: {e}")
                import traceback

                traceback.print_exc()
                state.speaking = False
                try:
                    await send_json({"type": "error", "message": str(e)})
                except Exception:
                    pass  # Connection likely already closed

    async def handle_set_system_prompt(data: dict[str, str]):
        """Handle system prompt update"""
        base_content = str(data.get("content", "You are a helpful voice assistant."))

        # Extract character description if present (for image generation)
        # Look for ### Character Description section
        import re

        char_desc_match = re.search(
            r"### Character Description\s*\n(.+?)(?:\n###|\Z)", base_content, re.DOTALL
        )
        if char_desc_match and engine_manager.image_generator is not None:
            state.character_description = char_desc_match.group(1).strip()
            logger.info(
                f"Character description extracted for image generation: {state.character_description[:100]}..."
            )

        # Use base content as system content (no special TTS tags)
        system_content = base_content

        # Add image generation instructions if available AND enabled
        if engine_manager.image_generator is not None and state.include_imagegen:
            system_content += """

IMAGE GENERATION:
You can generate images during conversation using the [IMAGE: description] tag.
When the user asks for a selfie, photo, or picture, or when you want to show them something visually, use this tag.

Examples:
- User: "Send me a selfie!" → Response: "Sure! Here's a selfie for you. [IMAGE: taking a selfie, smiling at camera, casual pose]"
- User: "Show me what you're wearing" → Response: "Let me show you! [IMAGE: full body shot, standing pose, showing outfit]"
- During conversation you can proactively send images: "The sunset here is beautiful! [IMAGE: looking at sunset, golden hour lighting, scenic background]"

The image will be generated with your character description automatically. Keep the IMAGE tag description focused on the scene, pose, and context."""

        # Ensure we always have exactly one system message at the start
        state.messages = [m for m in state.messages if m["role"] != "system"]
        state.messages.insert(0, {"role": "system", "content": system_content})

        logger.info(
            f"System prompt updated (engine: {state.tts_engine_type}): {system_content[:150]}..."
        )
        await send_json({"type": "ack", "system_prompt_updated": True})

    async def handle_set_tts_engine(data: dict[str, str]):
        """Handle TTS engine switch - only Piper is supported"""
        engine = str(data.get("engine", "piper")).lower()
        logger.info(f"Switching TTS engine to: {engine}")

        try:
            # Only Piper TTS is supported
            new_engine = PiperTTS(
                voices_dir=config.voices_dir,
                default_voice="en_GB-jenny_dioco-medium",
            )
            engine_manager.tts_engine = new_engine
            logger.info("Switched to Piper TTS")
            state.tts_engine_type = "piper"
            state.messages[0] = {
                "role": "system",
                "content": get_system_prompt_for_tts_engine("piper"),
            }
            logger.info("Updated system prompt for Piper")
            await send_json({"type": "tts_engine_changed", "tts_engine": "piper"})
        except Exception as e:
            logger.error(f"Failed to switch TTS engine: {e}")
            await send_json({"type": "error", "message": f"Failed to switch TTS: {str(e)}"})

    try:
        stt_engine = engine_manager.stt_engine
        tts_engine = engine_manager.tts_engine

        assert stt_engine is not None, "STT engine not initialized"
        assert tts_engine is not None, "TTS engine not initialized"

        while True:
            msg = await ws.receive()
            if "text" in msg and msg["text"]:
                data = json.loads(msg["text"])
                mtype = data.get("type")

                if mtype == "set_system_prompt":
                    await handle_set_system_prompt(data)

                elif mtype == "clear_chat":
                    system_msgs = [m for m in state.messages if m["role"] == "system"]
                    state.messages = system_msgs
                    logger.info("Chat history cleared")
                    await send_json({"type": "chat_cleared"})

                elif mtype == "sync_history":
                    history = data.get("history", [])
                    system_msgs = [m for m in state.messages if m["role"] == "system"]
                    state.messages = system_msgs + history
                    logger.info(f"History synced: {len(history)} messages")
                    await send_json({"type": "ack", "history_synced": True})

                elif mtype == "set_context_mode":
                    state.use_context = data.get("enabled", True)
                    logger.info(f"Context mode: {'enabled' if state.use_context else 'disabled'}")
                    await send_json({"type": "ack", "use_context": state.use_context})

                elif mtype == "set_imagegen_mode":
                    state.include_imagegen = data.get("enabled", True)
                    logger.info(
                        f"ImageGen mode: {'enabled' if state.include_imagegen else 'disabled'}"
                    )
                    await send_json({"type": "ack", "include_imagegen": state.include_imagegen})

                elif mtype == "set_character_image":
                    char_type = data.get("character_type")  # "user" or "assistant"
                    image_path = data.get("image_path", "")
                    if char_type == "user":
                        state.user_character_image = image_path
                        logger.info(f"User character image set to: {image_path}")
                    elif char_type == "assistant":
                        state.assistant_character_image = image_path
                        logger.info(f"Assistant character image set to: {image_path}")
                    await send_json({"type": "ack", "character_image_set": True})

                elif mtype == "set_llm_model":
                    state.llm_model = data.get("model", config.llm_model)
                    logger.info(f"LLM model set to: {state.llm_model}")
                    await send_json({"type": "ack", "llm_model": state.llm_model})

                elif mtype == "set_llm_host":
                    state.llm_host = data.get("host", config.llm_host)
                    logger.info(f"LLM host set to: {state.llm_host}")
                    await send_json({"type": "ack", "llm_host": state.llm_host})

                elif mtype == "set_output_mode":
                    state.output_mode = data.get("mode", "voice")
                    logger.info(f"Output mode set to: {state.output_mode}")
                    await send_json({"type": "ack", "output_mode": state.output_mode})

                elif mtype == "set_tts_engine":
                    await handle_set_tts_engine(data)

                elif mtype == "set_voice":
                    voice_name = data.get("voice")
                    if voice_name and tts_engine.load_voice(voice_name):
                        await send_json({"type": "ack", "voice": voice_name})
                    else:
                        await send_json({"type": "error", "message": "Voice not found"})

                elif mtype == "get_available_voices":
                    voices = tts_engine.list_voices()
                    await send_json(
                        {
                            "type": "available_voices",
                            "voices": voices,
                            "current": tts_engine.current_voice_name,
                        }
                    )

                elif mtype == "interrupt":
                    logger.info("User interrupted - cancelling LLM and stopping audio")
                    await cancel_llm(state)
                    state.speaking = False
                    await send_json({"type": "interrupted"})

                elif mtype == "stop_audio":
                    logger.info("Stop audio requested - cancelling TTS generation")
                    await cancel_llm(state)
                    state.speaking = False
                    await send_json({"type": "audio_stopped"})

                elif mtype == "user_audio_start":
                    logger.info("User started speaking - interrupting assistant")
                    await cancel_llm(state)
                    state.speaking = False
                    await send_json({"type": "interrupted"})
                    state.user_audio = bytearray()
                    state.recording = True
                    await send_json({"type": "ack_recording", "recording": True})

                elif mtype == "text_message":
                    text = data.get("text", "").strip()
                    image = data.get("image")  # Base64 encoded image or None
                    if text or image:
                        if image:
                            logger.info(
                                f"Text message received: {text} [with image: {len(image)} chars]"
                            )
                        else:
                            logger.info(f"Text message received: {text}")
                        state.llm_task = asyncio.create_task(
                            process_text_message(text if text else "", image)
                        )
                    else:
                        logger.warning("Empty text message and no image")

                elif mtype == "user_audio_end":
                    state.recording = False
                    await send_json({"type": "ack_recording", "recording": False})

                    pcm = bytes(state.user_audio)
                    logger.info(f"Received {len(pcm)} bytes of audio")

                    if len(pcm) < 3200:  # ~0.1s at 16kHz int16
                        logger.warning("Audio too short, ignoring")
                        await send_json({"type": "transcript", "text": ""})
                        continue

                    # STT
                    logger.info("Transcribing audio...")
                    try:
                        text = stt_engine.transcribe_audio(pcm, sample_rate=16000)
                        logger.info(f"Transcript: {text}")
                        await send_json({"type": "transcript", "text": text})

                        if text.strip():
                            state.llm_task = asyncio.create_task(speak_streaming_from_llm(text))
                        else:
                            logger.warning("Empty transcript")
                    except Exception as e:
                        logger.error(f"Transcription error: {e}")
                        import traceback

                        traceback.print_exc()
                        await send_json({"type": "transcript", "text": "[Error transcribing]"})

            elif "bytes" in msg and msg["bytes"]:
                if state.recording:
                    state.user_audio.extend(msg["bytes"])
                    # Log progress every 50KB
                    if len(state.user_audio) % 50000 < 4096:
                        logger.debug(f"Recording... {len(state.user_audio)} bytes")

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
        await cancel_llm(state)
        return
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        import traceback

        traceback.print_exc()
        await cancel_llm(state)
        return
