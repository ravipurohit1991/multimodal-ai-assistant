"""
REST API Routes - HTTP endpoints for the TTS/STT pipeline
"""

import glob
import os
from datetime import datetime

from fastapi import Body, File, Form, UploadFile
from fastapi.responses import JSONResponse, Response
from PIL import Image

from aiassistant.config import config
from aiassistant.engine_manager import engine_manager
from aiassistant.llm import OllamaClient
from aiassistant.logger import logger
from aiassistant.utils import image_to_base64


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
    temp_client = OllamaClient(host or config.llm_host, config.llm_model)
    try:
        models = await temp_client.list_models()
        return {"models": models, "host": temp_client.host}
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

        return {"voices": voices, "current": current_voice}
    except Exception as e:
        logger.error(f"Error listing voices: {e}", exc_info=True)
        return {"voices": [], "current": "unknown", "error": str(e)}


async def synthesize_tts(
    text: str = Body(..., embed=True),
    voice: str = Body("en_GB-jenny_dioco-medium", embed=True),
    emotion: str = Body("neutral", embed=True),
):
    """Synthesize text to speech on demand"""
    tts_engine = engine_manager.tts_engine
    assert tts_engine is not None, "TTS engine not initialized"

    try:
        # Load voice if different and if voice exists in current engine
        available_voices = tts_engine.list_voices()
        if voice in available_voices and voice != tts_engine.current_voice_name:
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


async def upload_character_image(
    file: UploadFile = File(...),
    character_type: str = Form(...),
):
    """Upload a character image for user or assistant"""
    try:
        if character_type not in ["user", "assistant"]:
            return JSONResponse(
                content={"error": "character_type must be 'user' or 'assistant'"}, status_code=400
            )

        # Save the uploaded file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(file.filename or "image.png")[1] or ".png"
        filename = f"{character_type}_{timestamp}{file_extension}"
        file_path = os.path.join(config.user_characters_dir, filename)

        # Write file
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        logger.info(f"Character image saved to: {file_path}")

        # Convert to base64 for immediate return
        image = Image.open(file_path)
        img_base64 = image_to_base64(image)

        return JSONResponse(
            content={
                "success": True,
                "character_type": character_type,
                "filename": filename,
                "path": file_path,
                "image": img_base64,
            }
        )

    except Exception as e:
        logger.error(f"Character image upload error: {e}", exc_info=True)
        return JSONResponse(content={"error": str(e)}, status_code=500)


async def generate_character_image(
    character_type: str = Body(..., embed=True),  # "user" or "assistant"
    description: str = Body(..., embed=True),
    width: int = Body(512, embed=True),
    height: int = Body(768, embed=True),
    steps: int = Body(config.imagegen_steps, embed=True),
    guidance: float = Body(config.imagegen_guidance, embed=True),
):
    """Generate a character image from a text description"""
    if engine_manager.image_generator is None:
        return JSONResponse(content={"error": "Image generation not available"}, status_code=503)

    try:
        if character_type not in ["user", "assistant"]:
            return JSONResponse(
                content={"error": "character_type must be 'user' or 'assistant'"}, status_code=400
            )

        # Initialize generator if needed
        if not engine_manager.image_generator._initialized:
            logger.info("Initializing image generator...")
            engine_manager.image_generator.initialize()

        # Generate portrait-style image
        prompt = f"{description}, high quality, detailed"
        logger.info(f"Generating {character_type} character image: {prompt[:100]}...")

        image = await engine_manager.image_generator.generate(
            scene_prompt=prompt,
            include_character=False,  # Don't use existing character description
            num_inference_steps=steps,
            guidance_scale=guidance,
            width=width,
            height=height,
        )

        # Save the generated image
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{character_type}_generated_{timestamp}.png"
        file_path = os.path.join(config.user_characters_dir, filename)
        image.save(file_path)

        logger.info(f"Character image saved to: {file_path}")

        # Convert to base64
        img_base64 = image_to_base64(image)

        # Unload model in low VRAM mode
        if config.low_vram_mode:
            engine_manager.unload_image_generator()

        return JSONResponse(
            content={
                "success": True,
                "character_type": character_type,
                "filename": filename,
                "path": file_path,
                "image": img_base64,
                "description": description,
                "prompt": prompt,
            }
        )

    except Exception as e:
        logger.error(f"Character image generation error: {e}", exc_info=True)
        return JSONResponse(content={"error": str(e)}, status_code=500)


async def get_character_images():
    """Get current character images for user and assistant"""
    try:
        result: dict[str, dict[str, str] | None] = {"user": None, "assistant": None}

        # Find latest images for each character type
        for char_type in ["user", "assistant"]:
            pattern = os.path.join(config.user_characters_dir, f"{char_type}_*.png")
            files = glob.glob(pattern)
            if files:
                # Get the most recent file
                latest_file = max(files, key=os.path.getctime)
                image = Image.open(latest_file)
                img_base64 = image_to_base64(image)
                result[char_type] = {
                    "filename": os.path.basename(latest_file),
                    "path": latest_file,
                    "image": img_base64,
                }

        return JSONResponse(content=result)

    except Exception as e:
        logger.error(f"Error getting character images: {e}", exc_info=True)
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
