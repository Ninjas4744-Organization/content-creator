from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets"
LAYOUTS = {"cover", "cards", "timeline", "photo", "statement", "video"}


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def fingerprint(value) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def local_file(base: Path, name: str) -> Path:
    """Keep content-file media references inside their declared directory."""
    path = (base / name).resolve()
    if not path.is_relative_to(base.resolve()):
        raise ValueError(f"Media reference escapes its directory: {name}")
    if not path.is_file():
        raise ValueError(f"Missing media file: {path}")
    return path


def validate(doc):
    if not isinstance(doc, dict) or doc.get("version") != 1:
        raise ValueError("Expected a version: 1 content document")
    if not isinstance(doc.get("title"), str) or not doc["title"].strip():
        raise ValueError("A non-empty title is required")
    voices = doc.get("voices", {"female": "Kore", "male": "Puck"})
    if not isinstance(voices, dict) or any(not isinstance(voices.get(k), str) or not voices[k].strip() for k in ["female", "male"]):
        raise ValueError("voices must define non-empty female and male voice names")
    if not isinstance(doc.get("voice_style", ""), str):
        raise ValueError("voice_style must be text")
    scenes = doc.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        raise ValueError("At least one scene is required")
    seen = set()
    for index, scene in enumerate(scenes):
        label = f"Scene {index + 1}"
        if not isinstance(scene, dict):
            raise ValueError(f"{label}: expected an object")
        sid = scene.get("id", "")
        if not isinstance(sid, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", sid) or sid in seen:
            raise ValueError(f"{label}: use a unique lowercase id with optional hyphens")
        seen.add(sid)
        if not isinstance(scene.get("title"), str) or not scene["title"].strip():
            raise ValueError(f"{label}: title is required")
        for field in ["subtitle", "body", "notes", "chapter"]:
            if not isinstance(scene.get(field, ""), str):
                raise ValueError(f"{label}: {field} must be text")
        scene.setdefault("speaker", "female")
        scene.setdefault("narration", "")
        layout = scene.get("layout", "cards")
        if layout not in LAYOUTS:
            raise ValueError(f"{label}: unsupported layout {layout}")
        if scene.get("speaker", "female") not in {"female", "male"}:
            raise ValueError(f"{label}: speaker must be female or male")
        if not isinstance(scene.get("narration", ""), str):
            raise ValueError(f"{label}: narration must be text")
        items = scene.get("items", [])
        if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
            raise ValueError(f"{label}: items must be a list of objects")
        if layout in {"cards", "timeline"} and not 1 <= len(items) <= (8 if layout == "timeline" else 6):
            raise ValueError(f"{label}: {layout} requires 1–{8 if layout == 'timeline' else 6} items")
        for item in items:
            if not isinstance(item.get("heading", ""), str) or not isinstance(item.get("body", ""), str):
                raise ValueError(f"{label}: item heading and body must be strings")
            if not isinstance(item.get("label", ""), str):
                raise ValueError(f"{label}: item label must be text")
            if item.get("image"):
                local_file(ASSETS, item["image"])
        if layout == "photo":
            local_file(ASSETS, scene.get("image", ""))
        if layout == "video" and (not isinstance(scene.get("youtube"), str) or not re.fullmatch(r"[A-Za-z0-9_-]{11}", scene["youtube"])):
            raise ValueError(f"{label}: video needs a YouTube video ID")
        quiz = scene.get("quiz")
        if quiz is not None:
            options = quiz.get("options", []) if isinstance(quiz, dict) else []
            correct = quiz.get("correct") if isinstance(quiz, dict) else None
            if (not isinstance(quiz, dict) or not isinstance(quiz.get("question"), str)
                or not isinstance(options, list) or not 2 <= len(options) <= 5
                or any(not isinstance(o, str) for o in options)
                or type(correct) is not int or not 0 <= correct < len(options)):
                raise ValueError(f"{label}: invalid quiz question/options/correct index")
        duration = scene.get("duration", 8)
        if not isinstance(duration, (int, float)) or not 1 <= duration <= 600:
            raise ValueError(f"{label}: duration must be 1–600 seconds")
    from .imported_deck import validate_source
    validate_source(doc)
    return doc


def load(path: Path):
    return validate(json.loads(path.read_text(encoding="utf-8")))


def voice_signature(scene, doc, model):
    return fingerprint({"text": scene["narration"], "speaker": scene["speaker"],
                        "voice": doc.get("voices", {"female": "Kore", "male": "Puck"})[scene["speaker"]],
                        "model": model, "style": doc.get("voice_style", "Native Israeli Hebrew; warm, clear, energetic; exact transcript only.")})
