"""PersonaParlour's FastAPI backend."""

import logging
import mimetypes
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from personaparlour import __version__
from personaparlour.config import config
from personaparlour.routes import (
    delete_session_route,
    edit_image,
    explain_image,
    generate_image,
    get_llm_models,
    get_model_status,
    get_session_route,
    get_voices,
    list_sessions_route,
    rename_session_route,
    root,
    save_session_route,
    synthesize_tts,
    wipe_data,
)
from personaparlour.utils import logger
from personaparlour.websocket import ws_endpoint

_logger = logging.getLogger(__name__)

# ---------- FastAPI Application Setup ----------
app = FastAPI(
    title="PersonaParlour",
    description="Local-first character roleplay and storytelling backend",
    version=__version__,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Sample-Rate"],
)

# Register API routes (root will be overridden by frontend serving)
app.get("/api/health")(root)  # Move health check to /api/health
app.get("/api/llm-models")(get_llm_models)
app.get("/api/voices")(get_voices)
app.get("/api/model-status")(get_model_status)
app.post("/api/tts")(synthesize_tts)
app.post("/api/generate-image")(generate_image)
app.post("/api/explain-image")(explain_image)
app.post("/api/edit-image")(edit_image)
app.post("/api/wipe")(wipe_data)
app.get("/api/sessions")(list_sessions_route)
app.post("/api/sessions")(save_session_route)
app.get("/api/sessions/{session_id}")(get_session_route)
app.post("/api/sessions/{session_id}/rename")(rename_session_route)
app.delete("/api/sessions/{session_id}")(delete_session_route)
app.websocket("/ws")(ws_endpoint)


# ---------- Frontend Serving Setup ----------
def setup_frontend_serving(app: FastAPI) -> None:
    """Setup frontend serving from the built frontend directory.

    Serves static files from the frontend build directory and handles
    SPA routing by serving index.html for all non-API routes.
    """
    _logger.info("Setting up frontend serving...")

    # Determine frontend path
    personaparlour_path = Path(__file__).parent
    frontend_path = personaparlour_path / "frontend"
    frontend_index_path = frontend_path / "index.html"

    # Check if frontend build exists
    if not frontend_path.exists():
        _logger.warning(
            f"Frontend build directory not found at {frontend_path}. "
            "Frontend will not be served. Run 'pip install -e .' to build frontend."
        )
        return

    if not frontend_index_path.exists():
        _logger.warning(
            f"Frontend index.html not found at {frontend_index_path}. Frontend will not be served."
        )
        return

    _logger.info(f"Frontend build directory found at {frontend_path}")

    # Add JavaScript mimetype
    mimetypes.add_type("text/javascript", ".js")

    # Mount static assets directory
    app.mount(
        "/assets",
        StaticFiles(directory=frontend_path / "assets"),
        name="frontend-assets",
    )

    # Serve index.html for root path (non-API routes)
    @app.get("/")
    async def serve_frontend():
        """Serve the index.html file for the root path."""
        return FileResponse(frontend_index_path, media_type="text/html")

    _logger.info("Frontend serving configured successfully")


# Setup frontend serving
setup_frontend_serving(app)


# ---------- Main entry point ----------
if __name__ == "__main__":
    import uvicorn

    logger.info(f"Starting TTS/STT Pipeline Backend on {config.backend_host}:{config.backend_port}")
    logger.info(f"TTS Engine: {config.tts_engine}")
    logger.info(f"LLM Model: {config.llm_model}")
    logger.info(f"WebSocket endpoint: ws://{config.backend_host}:{config.backend_port}/ws")
    logger.info(
        f"WebSocket ping interval: {config.ws_ping_interval}s / timeout: {config.ws_ping_timeout}s"
    )
    logger.info(f"Health check: http://{config.backend_host}:{config.backend_port}/")

    uvicorn.run(
        app,
        host=config.backend_host,
        port=config.backend_port,
        ws_ping_interval=config.ws_ping_interval,
        ws_ping_timeout=config.ws_ping_timeout,
        timeout_keep_alive=config.ws_keepalive_timeout,
    )
