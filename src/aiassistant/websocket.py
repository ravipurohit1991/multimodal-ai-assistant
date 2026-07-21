"""
WebSocket Handler - Real-time voice/text interaction via WebSocket
"""

import asyncio
import base64
import json
import os
import re
import time
from datetime import datetime
from urllib.parse import urlparse

from fastapi import WebSocket, WebSocketDisconnect

from aiassistant.config import config
from aiassistant.control_tags import (
    MOOD_TAG_RE,
    SCENE_TAG_RE,
    StreamingHiddenTagFilter,
    find_animation_tag_body,
    generate_animation_directive_from_reply,
    parse_animation_tag,
    strip_animation_tags,
)
from aiassistant.engine_manager import engine_manager
from aiassistant.llm import OllamaClient
from aiassistant.prompts import (
    DEFAULT_ROLEPLAY_PROMPT,
    build_chat_system_prompt,
    build_image_prompt_messages,
    build_impersonation_messages,
    build_reply_suggestion_messages,
    build_speaker_selection_messages,
    select_speaker_candidate,
)
from aiassistant.roleplay import apply_placeholders, build_llm_messages, parse_scene_tag
from aiassistant.state import ConnState, cancel_llm
from aiassistant.utils import (
    image_to_base64,
    logger,
    phrase_chunker,
    save_image_to_disk,
    wipe_user_data,
)
from aiassistant.utils.text_filter import StreamingTextFilter


def _wipe_origin_allowed(origin: str, host: str) -> bool:
    """Whether a browser Origin may invoke destructive actions like wipe_all.

    Browsers always send an Origin header on WebSocket upgrades, so this blocks
    cross-site pages from driving destructive actions; non-browser clients
    (which omit Origin) are unaffected.
    """
    try:
        origin_host = (urlparse(origin).hostname or "").lower()
    except ValueError:
        return False
    if origin_host in ("localhost", "127.0.0.1"):
        return True
    if origin_host and origin_host == host.split(":", 1)[0].lower():
        return True
    return origin in config.cors_allow_origins


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

    async def process_text_message(
        user_text: str,
        image_base64: str | None = None,
        image_explainer_model: str | None = None,
        as_narrator: bool = False,
        speaker_name: str = "",
    ):
        """Process text message with optional image attachment"""
        try:
            await speak_streaming_from_llm(
                user_text,
                image_base64,
                image_explainer_model,
                as_narrator=as_narrator,
                speaker_name=speaker_name,
            )
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

    async def speak_streaming_from_llm(
        user_text: str,
        image_base64: str | None = None,
        image_explainer_model: str | None = None,
        as_narrator: bool = False,
        speaker_name: str = "",
    ):
        """Stream assistant response from LLM and synthesize to audio chunks.

        ``as_narrator`` marks the user turn as omniscient narration (stage
        direction) rather than the user speaking in character. ``speaker_name``,
        when set (group scenes), attributes the stored reply to that character so
        the model can keep multiple characters straight across turns.
        """
        if image_base64:
            logger.info(
                f"User said: {user_text[:50]}... [with image: {len(image_base64[:50])} chars]"
            )
        else:
            logger.info(f"User said: {user_text[:50]}...")

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

                # Lazy load model if needed (only for local model)
                if (
                    not image_explainer_model or not image_explainer_model.startswith("ollama:")
                ) and engine_manager.image_explainer.model is None:
                    logger.info("Loading image explainer model for first use...")
                    engine_manager.image_explainer.load_model()

                # Generate description
                image_description = engine_manager.image_explainer.explain_image(
                    temp_image_path,
                    prompt=user_message_content,
                    model_id=image_explainer_model,
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

        # Prepare messages for LLM. build_llm_messages assembles a fresh copy with
        # Lorebook knowledge, the Author's Note, and the Director/scene-style
        # directive injected, honoring context mode.
        llm_messages = build_llm_messages(state, no_context_user_text=user_message_content)
        # The Director's one-shot beat steers exactly one reply, then is cleared.
        if state.director_beat:
            logger.info(f"Director beat consumed: {state.director_beat[:80]}")
            state.director_beat = ""
            await send_json({"type": "director_beat_consumed"})

        # Narrator turns: tell the model the latest message is omniscient stage
        # direction, not the user speaking, so it reacts rather than replying to it.
        if as_narrator:
            speaker = speaker_name or state.char_name or "your character"
            narrator_user = state.user_name or "the user"
            llm_messages.append(
                {
                    "role": "system",
                    "content": (
                        f"[The most recent message is narration from an omniscient "
                        f"narrator setting the scene — not {narrator_user} speaking in "
                        f"character. Treat it as stage direction and continue the scene "
                        f"in character as {speaker}, reacting to what it establishes. Do "
                        f"not repeat or quote the narration.]"
                    ),
                }
            )

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

        # Initialize text/display filters for streamed output.
        text_filter = StreamingTextFilter()
        display_filter = StreamingHiddenTagFilter()

        # Generation stats for the UI: wall time + a chunk-based token estimate
        # (Ollama streams roughly one token per delta).
        gen_started = time.perf_counter()
        delta_count = 0

        try:
            logger.info("Starting LLM streaming...")
            temp_client = OllamaClient(host=state.llm_host, default_model=state.llm_model)
            async for delta in temp_client.stream_chat(llm_messages, model=state.llm_model):
                full += delta
                delta_count += 1

                # Filter text for TTS - only keep spoken parts (no actions/formatting)
                filtered_delta = text_filter.process(delta)
                buf += filtered_delta

                # Remove hidden IMAGE, SCENE, mood, and animation tags from display
                # across chunk boundaries, while keeping ordinary tags like [laugh].
                display_delta = display_filter.process(delta)

                # Detect if IMAGE tags were present
                if re.search(r"\[IMAGE:\s*[^\]]+\]", delta, re.IGNORECASE):
                    logger.debug(f"IMAGE tag detected in: {delta[:100]}")

                if display_delta:
                    await send_json({"type": "assistant_delta", "delta": display_delta})

                ready, buf = phrase_chunker(buf)
                for phrase in ready:
                    # Remove ALL tags (including [IMAGE:...], [laugh], etc.) before TTS
                    # Redundant now if filter works perfectly, but good as a safety net for other tags
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

            # Flush any delayed display text (for example a normal bracketed tag
            # that looked briefly like a hidden control tag while streaming).
            display_tail = display_filter.flush()
            if display_tail:
                await send_json({"type": "assistant_delta", "delta": display_tail})

            # flush remaining buffer

            # Use filter flush to get any remaining valid text
            final_filtered_chunk = text_filter.flush()
            buf += final_filtered_chunk

            # logger.info(f"LLM complete. Full response: {full}")
            logger.debug(f"Remaining TTS buffer: {buf}")

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
                        optimization_messages = build_image_prompt_messages(img_prompt_raw)

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

            # Auto-scene: apply any [SCENE: ...] tags the character emitted to
            # advance the setting, then tell the UI so the scene bar & ambient
            # backdrop update. Only honored when the toggle is on.
            if state.auto_scene:
                scene_changed = False
                for scene_body in SCENE_TAG_RE.findall(full):
                    updates = parse_scene_tag(scene_body)
                    if not updates:
                        continue
                    if "time" in updates:
                        state.scene_time = updates["time"]
                    if "weather" in updates:
                        state.scene_weather = updates["weather"]
                    if "location" in updates:
                        state.scene_location = updates["location"]
                    scene_changed = True
                if scene_changed:
                    logger.info(
                        f"Auto-scene → time={state.scene_time or '-'}, "
                        f"weather={state.scene_weather or '-'}, "
                        f"location={state.scene_location[:60] or '-'}"
                    )
                    await send_json(
                        {
                            "type": "scene_updated",
                            "time": state.scene_time,
                            "weather": state.scene_weather,
                            "location": state.scene_location,
                        }
                    )

            # Extract the character's current mood (if any) for the UI, then strip
            # the tag so it never lingers in the stored history or display.
            mood_match = MOOD_TAG_RE.search(full)
            if mood_match:
                mood = mood_match.group(1).strip()
                logger.info(f"Character mood: {mood}")
                await send_json({"type": "mood", "mood": mood})

            stored_full = MOOD_TAG_RE.sub("", full)
            stored_full = strip_animation_tags(stored_full)
            stored_full = SCENE_TAG_RE.sub("", stored_full).strip()

            animation_body = find_animation_tag_body(full)
            if state.include_animation and animation_body:
                directive = parse_animation_tag(animation_body)
                if speaker_name:
                    directive["speaker"] = speaker_name
                logger.info(f"Stage animation: {directive}")
                await send_json({"type": "animation_directive", "directive": directive})
            elif state.include_animation:
                logger.info(
                    "Animation mode enabled, but no ANIM/POSE/ACTION tag found; "
                    "asking LLM for a rig motion plan"
                )
                try:
                    directive = await generate_animation_directive_from_reply(
                        stored_full,
                        llm_host=state.llm_host,
                        llm_model=state.llm_model,
                        character_name=speaker_name or state.char_name,
                        user_name=state.user_name,
                    )
                    if directive:
                        if speaker_name:
                            directive["speaker"] = speaker_name
                        logger.info(f"Stage animation fallback: {directive}")
                        await send_json({"type": "animation_directive", "directive": directive})
                    else:
                        logger.info("Animation fallback produced no usable rig motion")
                except Exception as e:
                    logger.warning(f"Animation fallback failed: {e}")

            # In group scenes, keep the reply attributed to its speaker in the
            # backend history so the model can track who said what next turn.
            # (The visible/streamed text stays clean; the UI adds the name badge.)
            content_to_store = f"{speaker_name}: {stored_full}" if speaker_name else stored_full
            state.messages.append({"role": "assistant", "content": content_to_store})
            elapsed_ms = int((time.perf_counter() - gen_started) * 1000)
            await send_json(
                {
                    "type": "assistant_end",
                    "elapsed_ms": elapsed_ms,
                    "approx_tokens": delta_count,
                }
            )
            logger.info(f"Assistant response complete ({delta_count} chunks in {elapsed_ms} ms)")
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

    async def handle_set_system_prompt(data: dict):
        """Handle system prompt update"""
        raw_content = data.get("content", DEFAULT_ROLEPLAY_PROMPT)
        base_content = raw_content if isinstance(raw_content, str) else DEFAULT_ROLEPLAY_PROMPT

        # Capture the character/user names so {{char}} / {{user}} macros (and the
        # Director directives) expand correctly across the whole conversation.
        char_name = str(data.get("char", "") or "").strip()
        user_name = str(data.get("user", "") or "").strip()
        if char_name:
            state.char_name = char_name
        if user_name:
            state.user_name = user_name

        # Let set_system_prompt carry the prompt feature flags too. This keeps
        # frontend visual state and backend prompt instructions in sync even when
        # the app swaps system prompts per speaker.
        if "include_animation" in data:
            state.include_animation = bool(data.get("include_animation"))
        if "include_mood" in data:
            state.include_mood = bool(data.get("include_mood"))
        if "auto_scene" in data:
            state.auto_scene = bool(data.get("auto_scene"))
        if "include_imagegen" in data:
            state.include_imagegen = bool(data.get("include_imagegen"))

        # Extract character description if present (for image generation)
        # Look for ### Character Description section
        char_desc_match = re.search(
            r"### Character Description\s*\n(.+?)(?:\n###|\Z)", base_content, re.DOTALL
        )
        if char_desc_match and engine_manager.image_generator is not None:
            state.character_description = char_desc_match.group(1).strip()
            logger.info(
                f"Character description extracted for image generation: {state.character_description[:100]}..."
            )

        system_content = build_chat_system_prompt(
            base_content,
            image_generation=engine_manager.image_generator is not None and state.include_imagegen,
            auto_scene=state.auto_scene,
            mood=state.include_mood,
            animation=state.include_animation,
        )

        # Expand {{char}} / {{user}} macros now so the stored system prompt (and
        # everything derived from it) reads with real names instead of literals.
        system_content = apply_placeholders(system_content, state.char_name, state.user_name)

        # Ensure we always have exactly one system message at the start
        state.messages = [m for m in state.messages if m["role"] != "system"]
        state.messages.insert(0, {"role": "system", "content": system_content})

        logger.info(
            f"System prompt updated (engine: {state.tts_engine_type}, "
            f"animation={'on' if state.include_animation else 'off'}, "
            f"mood={'on' if state.include_mood else 'off'}, "
            f"auto_scene={'on' if state.auto_scene else 'off'}): "
            f"{system_content[:150]}..."
        )
        await send_json({"type": "ack", "system_prompt_updated": True})

    async def handle_set_tts_engine(data: dict[str, str]):
        """Handle TTS engine switch - supports Piper, Chatterbox, and Soprano"""
        engine = str(data.get("engine", "piper")).lower()
        logger.info(f"Switching TTS engine to: {engine}")

        try:
            # Use the engine manager's switch method
            success, message = engine_manager.switch_tts_engine(engine)

            if success:
                # Note: deliberately leave the system prompt untouched — switching
                # the voice engine must never reset the roleplay context.
                state.tts_engine_type = engine
                logger.info(f"✅ {message}")
                await send_json(
                    {"type": "tts_engine_changed", "tts_engine": engine, "message": message}
                )
            else:
                logger.error(f"❌ {message}")
                await send_json({"type": "error", "message": message})
        except Exception as e:
            logger.error(f"Failed to switch TTS engine: {e}")
            import traceback

            traceback.print_exc()
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

                elif mtype == "wipe_all":
                    # Nuke everything: cancel any work, reset this connection's
                    # conversation + roleplay context, and erase on-disk user data
                    # (images, uploaded characters, and logs) so no trace remains.
                    ws_origin = (ws.headers.get("origin") or "").strip()
                    if ws_origin and not _wipe_origin_allowed(
                        ws_origin, ws.headers.get("host", "")
                    ):
                        logger.warning(f"Rejected wipe_all from disallowed origin: {ws_origin}")
                        await send_json(
                            {"type": "error", "message": "wipe_all rejected: disallowed origin"}
                        )
                    else:
                        logger.info("Wipe-all requested — clearing conversation and on-disk data")
                        await cancel_llm(state)
                        state.speaking = False
                        state.messages = [m for m in state.messages if m["role"] == "system"]
                        state.lorebook = []
                        state.author_note = ""
                        state.scene_time = ""
                        state.scene_weather = ""
                        state.scene_location = ""
                        state.director_beat = ""
                        try:
                            summary = wipe_user_data(clear_logs=True)
                            logger.info(f"Wipe-all complete: {summary}")
                        except Exception as e:
                            logger.error(f"Wipe-all disk cleanup failed: {e}")
                            summary = {"error": str(e)}
                        await send_json({"type": "wiped_all", "summary": summary})

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

                elif mtype == "set_lorebook":
                    entries = data.get("entries", [])
                    if isinstance(entries, list):
                        state.lorebook = entries
                    scan_depth = data.get("scan_depth")
                    if isinstance(scan_depth, int) and scan_depth > 0:
                        state.lorebook_scan_depth = scan_depth
                    enabled_count = sum(1 for e in state.lorebook if e.get("enabled", True))
                    logger.info(
                        f"Lorebook updated: {len(state.lorebook)} entries "
                        f"({enabled_count} enabled), scan depth {state.lorebook_scan_depth}"
                    )
                    await send_json({"type": "ack", "lorebook_entries": len(state.lorebook)})

                elif mtype == "set_author_note":
                    state.author_note = str(data.get("note", "") or "")
                    depth = data.get("depth")
                    if isinstance(depth, int) and depth >= 0:
                        state.author_note_depth = depth
                    logger.info(
                        f"Author's note set ({len(state.author_note)} chars, "
                        f"depth {state.author_note_depth})"
                    )
                    await send_json({"type": "ack", "author_note_set": True})

                elif mtype == "set_mood_mode":
                    state.include_mood = bool(data.get("enabled", False))
                    logger.info(f"Mood mode: {'enabled' if state.include_mood else 'disabled'}")
                    await send_json({"type": "ack", "include_mood": state.include_mood})

                elif mtype == "set_animation_mode":
                    state.include_animation = bool(data.get("enabled", True))
                    logger.info(
                        f"Animation mode: {'enabled' if state.include_animation else 'disabled'}"
                    )
                    await send_json({"type": "ack", "include_animation": state.include_animation})

                elif mtype == "set_style":
                    # Persistent Director dials: response length, prose perspective, pacing.
                    length = str(data.get("response_length", "") or "").strip().lower()
                    if length in {"brief", "normal", "detailed", "novella"}:
                        state.response_length = length
                    perspective = str(data.get("narration_perspective", "") or "").strip().lower()
                    if perspective in {"default", "first", "third"}:
                        state.narration_perspective = perspective
                    pacing = str(data.get("pacing", "") or "").strip().lower()
                    if pacing in {"slow", "steady", "advance"}:
                        state.pacing = pacing
                    logger.info(
                        f"Style set: length={state.response_length}, "
                        f"perspective={state.narration_perspective}, pacing={state.pacing}"
                    )
                    await send_json(
                        {
                            "type": "ack",
                            "response_length": state.response_length,
                            "narration_perspective": state.narration_perspective,
                            "pacing": state.pacing,
                        }
                    )

                elif mtype == "set_director_beat":
                    # One-shot scene cue, applied to the next reply only.
                    state.director_beat = str(data.get("beat", "") or "").strip()
                    logger.info(
                        f"Director beat queued: {state.director_beat[:80]}"
                        if state.director_beat
                        else "Director beat cleared"
                    )
                    await send_json({"type": "ack", "director_beat": state.director_beat})

                elif mtype == "set_autoscene_mode":
                    state.auto_scene = bool(data.get("enabled", False))
                    logger.info(f"Auto-scene mode: {'enabled' if state.auto_scene else 'disabled'}")
                    await send_json({"type": "ack", "auto_scene": state.auto_scene})

                elif mtype == "set_scene":
                    # Persistent scene atmosphere: time of day, weather, and place.
                    # Grounds every reply and drives the UI's ambient theming.
                    state.scene_time = str(data.get("time", "") or "").strip().lower()
                    state.scene_weather = str(data.get("weather", "") or "").strip().lower()
                    state.scene_location = str(data.get("location", "") or "").strip()
                    logger.info(
                        f"Scene set: time={state.scene_time or '-'}, "
                        f"weather={state.scene_weather or '-'}, "
                        f"location={state.scene_location[:60] or '-'}"
                    )
                    await send_json(
                        {
                            "type": "ack",
                            "scene_time": state.scene_time,
                            "scene_weather": state.scene_weather,
                            "scene_location": state.scene_location,
                        }
                    )

                elif mtype == "set_llm_model":
                    state.llm_model = data.get("model", config.llm_model)
                    logger.info(f"LLM model set to: {state.llm_model}")
                    await send_json({"type": "ack", "llm_model": state.llm_model})

                elif mtype == "set_llm_host":
                    state.llm_host = data.get("host", config.llm_host)
                    logger.info(f"LLM host set to: {state.llm_host}")
                    await send_json({"type": "ack", "llm_host": state.llm_host})

                elif mtype == "set_output_mode":
                    state.output_mode = data.get("mode", config.output_mode)
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
                    image_explainer_model = data.get("image_explainer_model")
                    as_narrator = bool(data.get("as_narrator", False))
                    speaker_name = str(data.get("speaker_name", "") or "").strip()
                    if text or image:
                        if image:
                            logger.info(
                                f"Text message received: {text[:50]}... [with image: {len(image[:50])} chars] model={image_explainer_model}"
                            )
                        else:
                            logger.info(
                                f"Text message received: {text[:50]}..."
                                f"{' [narration]' if as_narrator else ''}"
                                f"{f' [speaker: {speaker_name}]' if speaker_name else ''}"
                            )
                        state.llm_task = asyncio.create_task(
                            process_text_message(
                                text if text else "",
                                image,
                                image_explainer_model,
                                as_narrator=as_narrator,
                                speaker_name=speaker_name,
                            )
                        )
                    else:
                        logger.warning("Empty text message and no image")

                elif mtype == "impersonate_user":
                    user_name = data.get("user_name", "User")
                    user_hint = (data.get("user_hint") or "").strip()
                    logger.info(f"Impersonating user: {user_name}")
                    logger.info(f"User hint: {user_hint}")

                    async def impersonate_user_task(
                        user_name: str = user_name, user_hint: str = user_hint
                    ):
                        """Generate a reply as the user using the current conversation context"""
                        try:
                            await send_json({"type": "impersonation_start"})

                            # Build impersonation messages: use conversation history but swap
                            # the final instruction to generate a user-side reply
                            if state.use_context:
                                history = state.messages
                            else:
                                system_msgs = [m for m in state.messages if m["role"] == "system"]
                                history = system_msgs

                            impersonation_messages = build_impersonation_messages(
                                history, user_name, user_hint
                            )

                            full_text = ""
                            temp_client = OllamaClient(
                                host=state.llm_host, default_model=state.llm_model
                            )
                            async for delta in temp_client.stream_chat(
                                impersonation_messages, model=state.llm_model
                            ):
                                full_text += delta
                                await send_json({"type": "assistant_delta", "delta": delta})

                            logger.info(f"Impersonation complete: {full_text[:100]}")
                            await send_json(
                                {"type": "impersonation_end", "text": full_text.strip()}
                            )

                        except asyncio.CancelledError:
                            logger.info("Impersonation cancelled")
                            raise
                        except Exception as e:
                            logger.error(f"Impersonation error: {e}")
                            await send_json({"type": "impersonation_end", "text": ""})
                            await send_json({"type": "error", "message": str(e)})

                    state.llm_task = asyncio.create_task(
                        impersonate_user_task(user_name, user_hint)
                    )

                elif mtype == "choose_speaker":
                    # Auto-cast: in a group scene, let the model direct who
                    # naturally speaks next. Purely advisory — the frontend then
                    # requests the actual reply for the chosen character.
                    candidates = [
                        str(c).strip() for c in (data.get("candidates") or []) if str(c).strip()
                    ]
                    if not candidates:
                        await send_json({"type": "speaker_chosen", "name": ""})
                        continue

                    async def choose_speaker_task(candidates: list[str] = candidates):
                        try:
                            convo = [m for m in state.messages if m.get("role") != "system"][-8:]
                            prompt_messages = build_speaker_selection_messages(candidates, convo)
                            raw = ""
                            temp_client = OllamaClient(
                                host=state.llm_host, default_model=state.llm_model
                            )
                            async for delta in temp_client.stream_chat(
                                prompt_messages, model=state.llm_model
                            ):
                                raw += delta
                                if len(raw) > 200:
                                    break
                            chosen = select_speaker_candidate(raw, candidates)
                            logger.info(f"Auto-cast chose next speaker: {chosen}")
                            await send_json({"type": "speaker_chosen", "name": chosen})
                        except asyncio.CancelledError:
                            raise
                        except Exception as e:
                            logger.error(f"choose_speaker error: {e}")
                            await send_json({"type": "speaker_chosen", "name": candidates[0]})

                    state.llm_task = asyncio.create_task(choose_speaker_task(candidates))

                elif mtype == "suggest_replies":
                    user_name = data.get("user_name", "User")
                    logger.info(f"Generating reply suggestions for {user_name}")

                    async def suggest_replies_task(user_name: str = user_name):
                        """Generate a few short candidate replies the user could send next."""
                        try:
                            system_msgs = [m for m in state.messages if m["role"] == "system"]
                            history = state.messages if state.use_context else system_msgs

                            suggest_messages = build_reply_suggestion_messages(history, user_name)

                            full_text = ""
                            temp_client = OllamaClient(
                                host=state.llm_host, default_model=state.llm_model
                            )
                            async for delta in temp_client.stream_chat(
                                suggest_messages, model=state.llm_model
                            ):
                                full_text += delta

                            # Parse lines into clean suggestions. Prefer lines that
                            # look like list items (so any preamble is skipped), and
                            # only fall back to all lines if no markers were used.
                            marker_re = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+(.*)")
                            marked: list[str] = []
                            others: list[str] = []
                            for line in full_text.splitlines():
                                stripped = line.strip()
                                if not stripped:
                                    continue
                                m = marker_re.match(line)
                                if m:
                                    marked.append(m.group(1).strip().strip('"').strip())
                                else:
                                    others.append(stripped.strip('"').strip())
                            chosen = marked if len(marked) >= 2 else marked + others
                            items = [c for c in chosen if c][:3]

                            logger.info(f"Generated {len(items)} suggestions")
                            await send_json({"type": "suggestions", "items": items})
                        except asyncio.CancelledError:
                            logger.info("Suggestion generation cancelled")
                            raise
                        except Exception as e:
                            logger.error(f"Suggestion error: {e}")
                            await send_json({"type": "suggestions", "items": []})

                    state.llm_task = asyncio.create_task(suggest_replies_task(user_name))

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
