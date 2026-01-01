import base64
import os
import re
from datetime import datetime
from io import BytesIO

from PIL import Image


def save_image_to_disk(image: Image.Image, prompt: str, save_dir: str) -> str:
    """Save generated image to disk with timestamp and sanitized prompt

    Args:
        image: PIL Image object to save
        prompt: Original prompt used (will be sanitized for filename)
        save_dir: Directory to save images in

    Returns:
        Full path to saved image file
    """
    os.makedirs(save_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    # Sanitize prompt for filename (remove newlines, special chars, limit length)
    safe_prompt = prompt.replace("\n", " ").replace("\r", " ").replace("\t", " ")
    safe_prompt = re.sub(r"[^\w\s-]", "", safe_prompt)[:50].strip().replace(" ", "_")
    filename = f"{timestamp}_{safe_prompt}.png"
    filepath = os.path.join(save_dir, filename)

    image.save(filepath, format="PNG")
    return filepath


def image_to_base64(image: Image.Image, format: str = "PNG") -> str:
    """
    Convert PIL Image to base64 string for transmission.

    Args:
        image: PIL Image object
        format: Image format (PNG, JPEG, etc.)

    Returns:
        Base64-encoded image string
    """
    buffer = BytesIO()
    image.save(buffer, format=format)
    buffer.seek(0)
    img_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return img_base64


def extract_image_request(text: str) -> dict | None:
    """
    Extract image generation request from LLM output using special tags.

    Expected format: [IMAGE: description of scene]

    Args:
        text: LLM output text

    Returns:
        Dict with 'prompt' key if image request found, None otherwise
    """
    # Look for [IMAGE: ...] or [GENERATE_IMAGE: ...] tags
    pattern = r"\[(?:IMAGE|GENERATE_IMAGE):\s*([^\]]+)\]"
    match = re.search(pattern, text, re.IGNORECASE)

    if match:
        return {"prompt": match.group(1).strip(), "tag": match.group(0)}
    return None
