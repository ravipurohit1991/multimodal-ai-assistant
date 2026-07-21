"""Hidden control tags exchanged with the LLM inside otherwise normal prose.

The chat prompt asks the model to embed a few machine-readable tags — mood,
scene progression, image requests, and rig animation — which never reach the
user's screen.  Parsing them lives here rather than in the WebSocket handler so
the logic stays importable (and testable) without booting the model engines.
"""

from __future__ import annotations

import json
import re

from aiassistant.llm import OllamaClient
from aiassistant.prompts import build_animation_planner_messages

# Matches a single mood/emotion tag, e.g. "[mood: flirty]" or "[emotion: sad]"
MOOD_TAG_RE = re.compile(r"\[(?:mood|emotion):\s*([^\]]+)\]", re.IGNORECASE)
# Matches a scene-progression tag, e.g. "[SCENE: time=night; weather=rain]"
SCENE_TAG_RE = re.compile(r"\[SCENE:\s*([^\]]+)\]", re.IGNORECASE)
# Opening of a rig-animation tag. The body may be a JSON object, so the closing
# bracket is found by scanning rather than by the regex itself.
_ANIM_TAG_OPEN_RE = re.compile(r"\[\s*(?:ANIM|POSE|ACTION)\s*:", re.IGNORECASE)
STAGE_BONE_IDS = {
    "root",
    "hips",
    "torso",
    "chest",
    "neck",
    "head",
    "leftUpperArm",
    "leftForearm",
    "leftHand",
    "rightUpperArm",
    "rightForearm",
    "rightHand",
    "leftThigh",
    "leftShin",
    "leftFoot",
    "rightThigh",
    "rightShin",
    "rightFoot",
}
_BONE_LOOKUP = {re.sub(r"[^a-z0-9]", "", b.lower()): b for b in STAGE_BONE_IDS}
_BONE_LOOKUP.update(
    {
        "body": "torso",
        "upperbody": "chest",
        "leftarm": "leftUpperArm",
        "rightarm": "rightUpperArm",
        "leftlowerarm": "leftForearm",
        "rightlowerarm": "rightForearm",
        "lefthand": "leftHand",
        "righthand": "rightHand",
        "leftleg": "leftThigh",
        "rightleg": "rightThigh",
        "leftlowerleg": "leftShin",
        "rightlowerleg": "rightShin",
    }
)


def _clamp_float(value: object, low: float, high: float) -> float | None:
    try:
        n = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if not (low <= n <= high):
        n = max(low, min(high, n))
    return round(n, 3)


def _clean_short_text(value: object, limit: int = 80) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = re.sub(r"[\r\n\t]+", " ", value).strip()
    return cleaned[:limit] if cleaned else None


def _canon_bone_id(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    key = re.sub(r"[^a-z0-9]", "", value.lower())
    return _BONE_LOOKUP.get(key)


def _sanitize_bone_offset(value: object, *, oscillating: bool = False) -> dict | None:
    if not isinstance(value, dict):
        return None

    xy_limit = 28.0 if oscillating else 70.0
    rotation_limit = 45.0 if oscillating else 110.0
    out: dict[str, float] = {}

    x = _clamp_float(value.get("x"), -xy_limit, xy_limit)
    y = _clamp_float(value.get("y"), -xy_limit, xy_limit)
    rotation = _clamp_float(
        value.get("rotation", value.get("rot", value.get("angle"))),
        -rotation_limit,
        rotation_limit,
    )
    if x is not None:
        out["x"] = x
    if y is not None:
        out["y"] = y
    if rotation is not None:
        out["rotation"] = rotation

    if oscillating:
        speed = _clamp_float(value.get("speed"), 0.0, 8.0)
        phase = _clamp_float(value.get("phase"), -6.283, 6.283)
        if speed is not None:
            out["speed"] = speed
        if phase is not None:
            out["phase"] = phase

    return out or None


def _sanitize_bone_map(value: object, *, oscillating: bool = False) -> dict | None:
    if not isinstance(value, dict):
        return None
    out: dict[str, dict] = {}
    for raw_id, raw_offset in value.items():
        bone_id = _canon_bone_id(raw_id)
        if not bone_id:
            continue
        offset = _sanitize_bone_offset(raw_offset, oscillating=oscillating)
        if offset:
            out[bone_id] = offset
    return out or None


def _find_balanced_object(text: str) -> str | None:
    """Return the first balanced JSON object substring in text, if present."""
    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape = False
    for index in range(start, len(text)):
        ch = text[index]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    return None


def _load_animation_json(body: str) -> dict | None:
    candidate = _find_balanced_object(body)
    if not candidate:
        return None
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _sanitize_animation_json(body: str, data: dict) -> dict:
    directive: dict[str, object] = {"raw": body.strip()[:2000]}

    for key in ("emotion", "gesture", "posture", "gaze", "target"):
        text = _clean_short_text(data.get(key))
        if text:
            directive[key] = text

    intensity = _clamp_float(data.get("intensity"), 0.0, 1.0)
    if intensity is not None:
        directive["intensity"] = intensity

    duration = _clamp_float(data.get("duration"), 0.2, 8.0)
    if duration is not None:
        directive["duration"] = duration

    pose_source = (
        data.get("pose") or data.get("bones") or data.get("parts") or data.get("body") or {}
    )
    motion_source = data.get("motion") or data.get("oscillation") or data.get("loop") or {}

    pose = _sanitize_bone_map(pose_source, oscillating=False)
    motion = _sanitize_bone_map(motion_source, oscillating=True)

    # Some models naturally put bone ids at the top level. Accept that shape so
    # the renderer still gets useful movement instead of rejecting the whole tag.
    top_level_pose = _sanitize_bone_map(data, oscillating=False)
    if top_level_pose:
        pose = {**(pose or {}), **top_level_pose}

    if pose:
        directive["pose"] = pose
    if motion:
        directive["motion"] = motion

    if len(directive) == 1:
        text = _clean_short_text(body, 120)
        if text:
            directive["gesture"] = text
    return directive


def parse_animation_tag(body: str) -> dict:
    """Parse a hidden [ANIM: ...] body into validated rig motion controls."""
    json_body = _load_animation_json(body)
    if json_body is not None:
        return _sanitize_animation_json(body, json_body)

    directive: dict[str, object] = {"raw": body.strip()[:2000]}
    for key, value in re.findall(r"([\w_-]+)\s*=\s*([^;,\]]+)", body):
        key = key.strip().lower().replace("-", "_")
        value = value.strip()
        if not value:
            continue
        if key == "intensity":
            intensity = _clamp_float(value, 0.0, 1.0)
            if intensity is not None:
                directive[key] = intensity
        elif key == "duration":
            duration = _clamp_float(value, 0.2, 8.0)
            if duration is not None:
                directive[key] = duration
        elif key in {"emotion", "gesture", "posture", "gaze", "target"}:
            text = _clean_short_text(value)
            if text:
                directive[key] = text
    if len(directive) == 1:
        directive["gesture"] = body.strip()[:80]
    return directive


def _scan_animation_tag(text: str, pos: int = 0) -> tuple[int, str, int] | None:
    """Locate the next ANIM/POSE/ACTION tag at or after ``pos``.

    Returns ``(start, body, end)`` where ``body`` is the raw payload — a balanced
    JSON object when the model emitted one, otherwise the text up to the closing
    bracket — and ``end`` is the index just past the tag.
    """
    match = _ANIM_TAG_OPEN_RE.search(text, pos)
    if not match:
        return None

    body_start = match.end()
    object_start = text.find("{", body_start)
    close_bracket = text.find("]", body_start)

    if object_start != -1 and (close_bracket == -1 or object_start < close_bracket):
        obj = _find_balanced_object(text[object_start:])
        if obj:
            object_end = object_start + len(obj)
            bracket_after = text.find("]", object_end)
            end = bracket_after + 1 if bracket_after != -1 else object_end
            return match.start(), obj, end

    if close_bracket == -1:
        return match.start(), text[body_start:].strip(), len(text)
    return match.start(), text[body_start:close_bracket].strip(), close_bracket + 1


def find_animation_tag_body(text: str) -> str | None:
    """Extract the first ANIM/POSE/ACTION tag body, supporting JSON objects."""
    found = _scan_animation_tag(text)
    return found[1] if found else None


def strip_animation_tags(text: str) -> str:
    """Remove ANIM/POSE/ACTION tags, including object bodies, from full text."""
    parts: list[str] = []
    pos = 0
    while (found := _scan_animation_tag(text, pos)) is not None:
        start, _body, end = found
        parts.append(text[pos:start])
        pos = end
    parts.append(text[pos:])
    return "".join(parts)


class StreamingHiddenTagFilter:
    """Strip hidden control tags from streamed display text without eating [laugh]."""

    _prefix_re = re.compile(
        r"^\[\s*(?:IMAGE|SCENE|ANIM|POSE|ACTION|mood|emotion)\s*:",
        re.IGNORECASE,
    )
    _prefixes = (
        "[image:",
        "[scene:",
        "[anim:",
        "[pose:",
        "[action:",
        "[mood:",
        "[emotion:",
    )

    def __init__(self):
        self.buffer = ""
        self.in_hidden = False
        self.hidden_object_depth = 0
        self.hidden_in_string = False
        self.hidden_escape = False

    def process(self, chunk: str) -> str:
        self.buffer += chunk
        out = ""

        while self.buffer:
            if self.in_hidden:
                remainder = self._consume_hidden(self.buffer)
                if remainder is None:
                    return out
                self.buffer = remainder
                continue

            start = self.buffer.find("[")
            if start == -1:
                out += self.buffer
                self.buffer = ""
                return out

            out += self.buffer[:start]
            candidate = self.buffer[start:]
            if self._prefix_re.match(candidate):
                self._reset_hidden_state()
                remainder = self._consume_hidden(candidate)
                if remainder is None:
                    return out
                self.buffer = remainder
                continue

            if self._could_be_hidden_prefix(candidate):
                self.buffer = candidate
                return out

            out += "["
            self.buffer = candidate[1:]

        return out

    def flush(self) -> str:
        if self.in_hidden:
            self.buffer = ""
            self._reset_hidden_state()
            return ""
        out = self.buffer
        self.buffer = ""
        return out

    def _reset_hidden_state(self):
        self.in_hidden = False
        self.hidden_object_depth = 0
        self.hidden_in_string = False
        self.hidden_escape = False

    def _consume_hidden(self, text: str) -> str | None:
        self.in_hidden = True
        for index, ch in enumerate(text):
            if self.hidden_in_string:
                if self.hidden_escape:
                    self.hidden_escape = False
                elif ch == "\\":
                    self.hidden_escape = True
                elif ch == '"':
                    self.hidden_in_string = False
                continue

            if ch == '"':
                self.hidden_in_string = True
            elif ch == "{":
                self.hidden_object_depth += 1
            elif ch == "}" and self.hidden_object_depth > 0:
                self.hidden_object_depth -= 1
            elif ch == "]" and self.hidden_object_depth == 0:
                self._reset_hidden_state()
                return text[index + 1 :]

        self.buffer = ""
        return None

    def _could_be_hidden_prefix(self, candidate: str) -> bool:
        compact = re.sub(r"\s+", "", candidate.lower())
        # Once the candidate gets long enough to disprove every control tag
        # prefix, release it as normal prose.
        return any(prefix.startswith(compact) for prefix in self._prefixes)


async def generate_animation_directive_from_reply(
    reply_text: str,
    *,
    llm_host: str,
    llm_model: str | None,
    character_name: str = "",
    user_name: str = "",
) -> dict | None:
    """Ask the active LLM for a rig motion JSON when the main reply skipped it."""
    clean_reply = reply_text.strip()
    if not clean_reply or not llm_model:
        return None

    messages = build_animation_planner_messages(clean_reply, character_name, user_name)

    raw = ""
    temp_client = OllamaClient(host=llm_host, default_model=llm_model)
    async for delta in temp_client.stream_chat(messages, model=llm_model):
        raw += delta
        if len(raw) > 2400:
            break

    body = _find_balanced_object(raw) or find_animation_tag_body(raw) or raw
    directive = parse_animation_tag(body)
    useful = any(k in directive for k in ("pose", "motion", "gesture", "posture", "emotion"))
    return directive if useful else None
