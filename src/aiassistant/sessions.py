"""
Session library — server-side storage for saved conversations.

Sessions are the same JSON snapshots the frontend can already export to a
file (history + roleplay settings), stored under ``user_data/sessions`` so a
whole story can be parked and resumed later without hunting for downloads.
Everything stays on disk, local to the machine, in keeping with the app's
privacy-first design.
"""

from __future__ import annotations

import json
import os
import re
import time
import uuid
from typing import Any

from aiassistant.config import config
from aiassistant.utils import logger

_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,80}$")


def _sessions_dir() -> str:
    path = os.path.join(config.user_data_dir, "sessions")
    os.makedirs(path, exist_ok=True)
    return path


def _path_for(session_id: str) -> str | None:
    """Resolve a session id to its file path, rejecting anything unsafe."""
    if not _ID_RE.match(session_id or ""):
        return None
    return os.path.join(_sessions_dir(), f"{session_id}.json")


def _summarize(record: dict[str, Any]) -> dict[str, Any]:
    """The lightweight listing entry for one stored session."""
    session = record.get("session") or {}
    history = session.get("conversationHistory") or []
    settings = session.get("settings") or {}
    preview = ""
    for msg in reversed(history):
        content = str(msg.get("content", "")).strip()
        if content:
            preview = content[:140]
            break
    return {
        "id": record.get("id", ""),
        "name": record.get("name", "Untitled"),
        "saved_at": record.get("saved_at", ""),
        "message_count": len(history),
        "character": settings.get("assistantName", ""),
        "preview": preview,
    }


def list_sessions() -> list[dict[str, Any]]:
    """All stored sessions, newest first."""
    items: list[dict[str, Any]] = []
    for entry in os.listdir(_sessions_dir()):
        if not entry.endswith(".json"):
            continue
        full = os.path.join(_sessions_dir(), entry)
        try:
            with open(full, encoding="utf-8") as f:
                record = json.load(f)
            items.append(_summarize(record))
        except Exception as e:
            logger.warning(f"Skipping unreadable session file {entry}: {e}")
    items.sort(key=lambda s: s.get("saved_at", ""), reverse=True)
    return items


def save_session(session: dict[str, Any], name: str = "") -> dict[str, Any]:
    """Store a session snapshot; returns its listing entry."""
    session_id = f"{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    settings = session.get("settings") or {}
    clean_name = (name or "").strip()[:120]
    if not clean_name:
        character = str(settings.get("assistantName", "") or "").strip()
        clean_name = f"Story with {character}" if character else "Untitled story"
    record = {
        "id": session_id,
        "name": clean_name,
        "saved_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "session": session,
    }
    path = _path_for(session_id)
    assert path is not None  # generated ids always match _ID_RE
    with open(path, "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False)
    logger.info(f"Session saved: {session_id} ({clean_name!r})")
    return _summarize(record)


def get_session(session_id: str) -> dict[str, Any] | None:
    """Full stored record (including the session payload), or None."""
    path = _path_for(session_id)
    if not path or not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def rename_session(session_id: str, name: str) -> dict[str, Any] | None:
    """Rename a stored session; returns the updated listing entry."""
    path = _path_for(session_id)
    if not path or not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        record = json.load(f)
    record["name"] = (name or "").strip()[:120] or record.get("name", "Untitled")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False)
    return _summarize(record)


def delete_session(session_id: str) -> bool:
    path = _path_for(session_id)
    if not path or not os.path.isfile(path):
        return False
    os.remove(path)
    logger.info(f"Session deleted: {session_id}")
    return True
