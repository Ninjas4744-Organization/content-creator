"""Versioned catalog document used by lesson packaging and both publishers."""
from __future__ import annotations
import copy
import re
from urllib.parse import urlsplit

DEFAULT_GALLERIES = [
    {"id": "public", "name": "ספרייה ציבורית", "url": "/"},
    {"id": "team", "name": "ספריית הקבוצה", "url": "/team-library"},
    {"id": "study", "name": "למידה למבחנים", "url": "/study-library"},
    {"id": "none", "name": "בקישור בלבד", "url": "/"},
]

def empty_catalog() -> dict:
    return {"schemaVersion": 1, "galleries": copy.deepcopy(DEFAULT_GALLERIES), "items": []}

def gallery_of(item: dict) -> str:
    return item.get("gallery") if item.get("gallery") is not None else ("team" if item.get("unlisted") else "public")

def normalize_catalog(value: object) -> dict:
    document = {**empty_catalog(), "items": value} if isinstance(value, list) else copy.deepcopy(value)
    if not isinstance(document, dict) or (type(document.get("schemaVersion")) is not int or document.get("schemaVersion") != 1):
        raise ValueError("Unsupported catalog document version")
    galleries, items = document.get("galleries"), document.get("items")
    if not isinstance(galleries, list) or not 2 <= len(galleries) <= 100 or not isinstance(items, list) or len(items) > 1000:
        raise ValueError("Catalog must contain galleries and items")
    ids, names = set(), set()
    for gallery in galleries:
        if not isinstance(gallery, dict) or not isinstance(gallery.get("id"), str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,120}", gallery["id"]) or gallery["id"] in ids or gallery["id"] in {"all", "featured", "history"}:
            raise ValueError("Invalid library ID")
        name, url = gallery.get("name"), gallery.get("url")
        if not isinstance(name, str) or not name.strip() or name != name.strip() or len(name) > 100 or name.lower() in names:
            raise ValueError("Invalid library name")
        if not isinstance(url, str) or not url or len(url) > 2000 or re.search(r"[\x00-\x20\x7f\\]", url) or not ((url.startswith("/") and not url.startswith("//")) or re.match(r"https?://", url, re.I)):
            raise ValueError("Invalid library URL")
        parsed = urlsplit(url)
        if parsed.username or parsed.password or (parsed.scheme and (parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname)):
            raise ValueError("Invalid library URL")
        if "section" in gallery and (
            gallery["section"] not in ("team", "course")
            or gallery["id"] in ("public", "none")
            or not url.startswith("/")
        ):
            raise ValueError("Invalid library section")
        ids.add(gallery["id"]); names.add(name.lower())
    for fixed in [gallery for gallery in DEFAULT_GALLERIES if gallery["id"] in {"public", "none"}]:
        if not any(all(gallery.get(key) == value for key, value in fixed.items()) for gallery in galleries):
            raise ValueError("Fixed libraries cannot change")
    item_ids = set()
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,120}", item["id"]) or item["id"] in item_ids:
            raise ValueError("Invalid or duplicate catalog project ID")
        if not isinstance(item.get("title"), str) or not isinstance(item.get("chapters"), list) or gallery_of(item) not in ids:
            raise ValueError("Invalid catalog metadata or library reference")
        if "topics" in item:
            topics = item["topics"]
            if (
                not isinstance(topics, list) or len(topics) > 20
                or any(not isinstance(topic, str) or not topic or topic != topic.strip()
                       or len(topic) > 200 or "\r" in topic or "\n" in topic for topic in topics)
                or len({topic.lower() for topic in topics}) != len(topics)
            ):
                raise ValueError("Invalid catalog topics")
        item_ids.add(item["id"])
    return document

MEDIA_FIELDS = ("poster", "deck", "powerpoint", "video", "scorm")

def merge_publication(previous: dict | None, incoming: dict) -> dict:
    """Content publication updates media; the current catalog owns editorial metadata."""
    if previous is None:
        return normalize_catalog(incoming)
    existing = {item["id"]: item for item in previous["items"]}
    updates = {}
    for item in incoming["items"]:
        before = existing.get(item["id"])
        if before is None:
            updates[item["id"]] = item
            continue
        updated = {**item, **before, **{key: item[key] for key in MEDIA_FIELDS if key in item}}
        for field in ("topics", "category"):
            if field not in before:
                updated.pop(field, None)
        updates[item["id"]] = updated
    items = [updates.pop(item["id"], item) for item in previous["items"]] + list(updates.values())
    return normalize_catalog({**previous, "items": items})
