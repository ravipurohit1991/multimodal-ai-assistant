"""
REST API Routes - HTTP endpoints for the TTS/STT pipeline
"""

import os
from datetime import datetime

from fastapi import Body, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse, Response
from PIL import Image

from personaparlour import sessions
from personaparlour.config import config
from personaparlour.engine_manager import engine_manager
from personaparlour.llm import get_chat_client
from personaparlour.utils import image_to_base64, logger, wipe_user_data


async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "TTS/STT Pipeline",
        "endpoints": {
            "websocket": "/ws",
            "health": "/",
            "llm_models": "/api/llm-models",
            "voices": "/api/voices",
            "model_status": "/api/model-status",
        },
    }


async def wipe_data(request: Request):
    """Erase every on-disk store beneath ``user_data``.

    This deliberately includes unknown/new feature directories as well as
    sessions, images, uploaded characters, and logs. It works independently of
    any WebSocket.
    """
    # The custom header forces a CORS preflight for cross-origin callers, so a
    # malicious web page can't fire this destructive request via drive-by CSRF.
    if request.headers.get("x-wipe-confirm") != "yes":
        return JSONResponse(
            content={"success": False, "error": "Missing X-Wipe-Confirm: yes header"},
            status_code=403,
        )
    try:
        summary = wipe_user_data(clear_logs=True)
        logger.info(f"Wipe (HTTP) complete: {summary}")
        return JSONResponse(content={"success": True, "summary": summary})
    except Exception as e:
        logger.error(f"Wipe (HTTP) failed: {e}", exc_info=True)
        return JSONResponse(content={"success": False, "error": str(e)}, status_code=500)


# ---------- Session library (server-side saved conversations) ----------


async def list_sessions_route():
    """List every stored session (lightweight summaries, newest first)."""
    try:
        return JSONResponse(content={"sessions": sessions.list_sessions()})
    except Exception as e:
        logger.error(f"Error listing sessions: {e}", exc_info=True)
        return JSONResponse(content={"error": str(e), "sessions": []}, status_code=500)


async def save_session_route(
    session: dict = Body(..., embed=True),
    name: str = Body("", embed=True),
):
    """Store a session snapshot (history + settings) in the library."""
    try:
        summary = sessions.save_session(session, name)
        return JSONResponse(content={"success": True, "session": summary})
    except Exception as e:
        logger.error(f"Error saving session: {e}", exc_info=True)
        return JSONResponse(content={"success": False, "error": str(e)}, status_code=500)


async def get_session_route(session_id: str):
    """Fetch one stored session, including its full payload."""
    record = sessions.get_session(session_id)
    if record is None:
        return JSONResponse(content={"error": "Session not found"}, status_code=404)
    return JSONResponse(content=record)


async def rename_session_route(session_id: str, name: str = Body(..., embed=True)):
    """Rename a stored session."""
    summary = sessions.rename_session(session_id, name)
    if summary is None:
        return JSONResponse(content={"error": "Session not found"}, status_code=404)
    return JSONResponse(content={"success": True, "session": summary})


async def delete_session_route(session_id: str):
    """Remove a stored session from the library."""
    if not sessions.delete_session(session_id):
        return JSONResponse(content={"error": "Session not found"}, status_code=404)
    return JSONResponse(content={"success": True})


async def get_model_status():
    """Get comprehensive status of all models including device, loaded state, and memory usage"""
    try:
        status = await engine_manager.get_model_status()
        return JSONResponse(content=status)
    except Exception as e:
        logger.error(f"Error getting model status: {e}", exc_info=True)
        return JSONResponse(content={"error": str(e)}, status_code=500)


async def get_llm_models(host: str | None = None):
    """Fetch available models from LLM API"""
    client = get_chat_client(host or config.llm_host, config.llm_model)
    try:
        models = await client.list_models()
        return {"models": models, "host": client.host}
    except Exception as e:
        return {"error": str(e), "models": []}


async def get_voices():
    """List available voices with metadata (engine-specific)"""
    voices = []
    tts_engine = engine_manager.tts_engine
    assert tts_engine is not None, "TTS engine not initialized"

    try:
        voice_names = tts_engine.list_voices()

        # PiperTTS has metadata support
        if hasattr(tts_engine, "get_voice_metadata"):
            for voice_name in voice_names:
                metadata = tts_engine.get_voice_metadata(voice_name)
                voices.append({"name": voice_name, "metadata": metadata})
        else:
            # Just list voice names without metadata
            for voice_name in voice_names:
                voices.append({"name": voice_name, "metadata": None})

        current_voice = getattr(
            tts_engine, "current_voice_name", voice_names[0] if voice_names else "unknown"
        )

        return {
            "voices": voices,
            "current": current_voice,
            "engine": config.tts_engine,
            # Which emotions this engine can actually deliver. Empty means the
            # engine speaks every line the same way, and the UI should say so
            # rather than offer a control that does nothing.
            "supports_emotion": bool(getattr(tts_engine, "supports_emotion", False)),
            "emotions": list(getattr(tts_engine, "supported_emotions", [])),
        }
    except Exception as e:
        logger.error(f"Error listing voices: {e}", exc_info=True)
        return {"voices": [], "current": "unknown", "error": str(e)}


async def synthesize_tts(
    text: str = Body(..., embed=True),
    voice: str = Body("", embed=True),
    emotion: str = Body("neutral", embed=True),
):
    """Synthesize text to speech on demand"""
    tts_engine = engine_manager.tts_engine
    assert tts_engine is not None, "TTS engine not initialized"

    try:
        # Load voice if different and if voice exists in current engine
        available_voices = tts_engine.list_voices()
        if voice and voice in available_voices and voice != tts_engine.current_voice_name:
            tts_engine.load_voice(voice)

        # Synthesize
        audio_result = await tts_engine.synthesize(text, emotion=emotion)

        # Extract audio bytes from TTSAudio object
        if audio_result and hasattr(audio_result, "pcm16le"):
            return Response(
                content=audio_result.pcm16le,
                media_type="audio/pcm",
                headers={"X-Sample-Rate": str(audio_result.sample_rate)},
            )
        else:
            return Response(content=b"", status_code=500)
    except Exception as e:
        logger.error(f"TTS error: {e}", exc_info=True)
        return Response(content=b"", status_code=500)


async def generate_image(
    prompt: str = Body(..., embed=True),
    character_description: str = Body("", embed=True),
    width: int = Body(config.imagegen_width, embed=True),
    height: int = Body(config.imagegen_height, embed=True),
    steps: int = Body(config.imagegen_steps, embed=True),
    guidance: float = Body(config.imagegen_guidance, embed=True),
):
    """Generate an image from a text prompt"""
    if engine_manager.image_generator is None:
        return JSONResponse(content={"error": "Image generation not available"}, status_code=503)

    try:
        # Initialize generator if needed (lazy loading)
        if not engine_manager.image_generator._initialized:
            logger.info("Initializing image generator...")
            engine_manager.image_generator.initialize()

        # Update character description if provided
        if character_description:
            engine_manager.image_generator.set_character_description(character_description)

        # Generate image
        logger.info(f"Generating image: {prompt[:100]}...")
        image = await engine_manager.image_generator.generate(
            scene_prompt=prompt,
            include_character=bool(character_description),
            num_inference_steps=steps,
            guidance_scale=guidance,
            width=width,
            height=height,
        )

        # Convert to base64
        img_base64 = image_to_base64(image)

        # Unload model in low VRAM mode
        if config.low_vram_mode:
            engine_manager.unload_image_generator()

        return JSONResponse(
            content={
                "image": img_base64,
                "format": "png",
                "width": width,
                "height": height,
                "prompt": prompt,
            }
        )
    except Exception as e:
        logger.error(f"Image generation error: {e}", exc_info=True)
        return JSONResponse(content={"error": str(e)}, status_code=500)


async def explain_image(file: UploadFile = File(...)):
    """
    Explain/describe an uploaded image using the VL model.
    This endpoint is for testing the image explainer functionality.
    """
    if engine_manager.image_explainer is None:
        return JSONResponse(content={"error": "Image explainer not available"}, status_code=503)

    try:
        # Save the uploaded file temporarily
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(file.filename or "image.png")[1] or ".png"
        temp_filename = f"temp_{timestamp}{file_extension}"
        temp_path = os.path.join(config.user_images_dir, temp_filename)

        # Write file
        content = await file.read()
        with open(temp_path, "wb") as f:
            f.write(content)

        logger.info(f"Uploaded image saved to: {temp_path}")

        # Lazy load the model if needed
        if engine_manager.image_explainer.model is None:
            logger.info("Loading image explainer model...")
            engine_manager.image_explainer.load_model()

        description = engine_manager.image_explainer.explain_image(temp_path)

        return JSONResponse(
            content={"description": description, "filename": file.filename, "temp_path": temp_path}
        )

    except Exception as e:
        logger.error(f"Image explanation error: {e}", exc_info=True)
        return JSONResponse(content={"error": str(e)}, status_code=500)


async def edit_image(
    file: UploadFile = File(...),
    prompt: str = Form(...),
    steps: int = Form(config.imagegen_steps if hasattr(config, "imagegen_steps") else 4),
    guidance: float = Form(
        config.imagegen_guidance if hasattr(config, "imagegen_guidance") else 1.0
    ),
    strength: float = Form(
        config.imagegen_strength if hasattr(config, "imagegen_strength") else 0.8
    ),
):
    """Edit an uploaded image using text prompt"""
    if engine_manager.image_generator is None:
        return JSONResponse(content={"error": "Image editing not available"}, status_code=503)

    try:
        # Save uploaded file temporarily
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(file.filename or "image.png")[1] or ".png"
        temp_filename = f"temp_{timestamp}{file_extension}"
        temp_path = os.path.join(config.user_images_dir, temp_filename)

        # Write file
        content = await file.read()
        with open(temp_path, "wb") as f:
            f.write(content)

        logger.info(f"Uploaded image for editing saved to: {temp_path}")

        # Load image
        input_image = Image.open(temp_path)

        # Initialize generator if needed
        if not engine_manager.image_generator._initialized:
            logger.info("Initializing image generator...")
            engine_manager.image_generator.initialize()

        # Edit image using generate method with input_image parameter
        logger.info(f"Editing image with prompt: {prompt[:100]}...")
        edited_image = await engine_manager.image_generator.generate(
            scene_prompt=prompt,
            input_image=input_image,  # Pass input image for editing
            include_character=False,
            num_inference_steps=steps,
            guidance_scale=guidance,
            strength=strength,
        )

        # Save edited image
        edited_filename = f"edited_{timestamp}.png"
        edited_path = os.path.join(config.user_images_dir, edited_filename)
        edited_image.save(edited_path)

        logger.info(f"Edited image saved to: {edited_path}")

        # Convert to base64
        img_base64 = image_to_base64(edited_image)

        # Unload model in low VRAM mode
        if config.low_vram_mode:
            engine_manager.unload_image_generator()
        return JSONResponse(
            content={
                "image": img_base64,
                "format": "png",
                "prompt": prompt,
                "original": temp_path,
                "edited": edited_path,
            }
        )

    except Exception as e:
        logger.error(f"Image editing error: {e}", exc_info=True)
        return JSONResponse(content={"error": str(e)}, status_code=500)
