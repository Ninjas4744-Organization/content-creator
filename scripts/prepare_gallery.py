"""Build the static learning catalog and retain selected, portable video packages.

Uses only local content and an explicit asset allowlist; never reads credentials.
Run with the repository venv, or from npm with the installed project environment.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
LIBRARY = ROOT / "projects/learning-library"
PUBLISHED = LIBRARY / "output/published"
ALLOWED = {".html", ".css", ".js", ".jpg", ".jpeg", ".png", ".webp", ".svg", ".ttf", ".woff", ".woff2", ".vtt", ".mp4", ".txt"}


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []
        self.video = None

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag in {"video", "source"} and values.get("src"):
            self.video = values["src"]
        for name in ("src", "href", "poster"):
            if values.get(name):
                self.paths.append(values[name])


def safe_file(base, name, boundary=ROOT):
    path = (base / unquote(name)).resolve()
    if not path.is_relative_to(boundary.resolve()) or not path.is_file():
        raise ValueError(f"Missing or out-of-bounds gallery asset: {name}")
    return path


def package_player(source, destination, *, boundary=ROOT):
    """Follow referenced media, including ../video.mp4, without copying build/cache files."""
    source = safe_file(source, "index.html", boundary)
    content = source.read_text(encoding="utf-8")
    references = References()
    references.feed(content)
    if not references.video:
        raise ValueError(f"No video source in {source}")
    if urlsplit(references.video).scheme or references.video.startswith("//"):
        raise ValueError("Published players require a local video file")
    video = safe_file(source.parent, urlsplit(references.video).path, boundary)
    if video.suffix.lower() != ".mp4":
        raise ValueError("Published video must be an MP4")
    # Normalize the external video link before resolving the remaining package paths.
    content = content.replace(references.video, "video.mp4")
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copy2(video, destination / "video.mp4")
    (destination / "index.html").write_text(content, encoding="utf-8")
    pending = [(source, content)]
    copied = {source}
    while pending:
        original, text = pending.pop()
        refs = References()
        refs.feed(text)
        names = refs.paths + re.findall(r"url\(\s*['\"]?([^)'\"\s]+)", text)
        for name in names:
            parsed = urlsplit(name)
            if parsed.scheme or parsed.netloc or not parsed.path or name.startswith("#"):
                continue
            if original == source and parsed.path == "video.mp4":
                continue
            path = safe_file(original.parent, parsed.path, boundary)
            if not path.is_relative_to(source.parent) or path.suffix.lower() not in ALLOWED:
                raise ValueError(f"Unsupported player resource: {name}")
            if path in copied:
                continue
            copied.add(path)
            target = destination / path.relative_to(source.parent)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
            if path.suffix.lower() in {".html", ".css"}:
                pending.append((path, path.read_text(encoding="utf-8")))


def content_sources(root=ROOT):
    sources = {}
    for folder in (root / "examples", root / "projects"):
        for content in sorted(folder.glob("*/content.json")):
            if content.parent.name in sources:
                raise ValueError(f"Duplicate gallery project ID: {content.parent.name}")
            safe_file(content.parent, content.name, root)
            sources[content.parent.name] = content
    return sources


def publish_video(project_id, source):
    if project_id not in content_sources():
        raise ValueError(f"Unknown project: {project_id}")
    # Stage completely before replacing a previously published package.
    staging = LIBRARY / "output/publish-staging" / project_id
    shutil.rmtree(staging, ignore_errors=True)
    try:
        package_player(source, staging)
        target = PUBLISHED / project_id / "interactive"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.rmtree(target, ignore_errors=True)
        shutil.move(str(staging), target)
        print(f"Retained public video package: {target.relative_to(ROOT)}")
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def prepare():
    from davinci_creator.common import load
    from davinci_creator.deck import build
    from davinci_creator.scorm import build_scorm

    settings = json.loads((LIBRARY / "library.json").read_text(encoding="utf-8"))
    target = LIBRARY / "public/library"
    shutil.rmtree(target, ignore_errors=True)
    target.mkdir(parents=True)
    shutil.copy2(ROOT / "src/davinci_creator/learning_bridge.js", target / "learning-bridge.js")
    brand = target / "brand"
    brand.mkdir()
    for name in ("logo.png", "wordmark.png", "space-hero.png", "Rubik-Regular.ttf", "Rubik-Bold.ttf", "Rubik-OFL.txt"):
        shutil.copy2(ROOT / "assets/brand" / name, brand / name)
    catalog = []
    for project_id, content in content_sources().items():
        doc = load(content)
        metadata = settings.get(project_id, {})
        gallery = metadata.get("gallery", "team" if metadata.get("unlisted") else "public")
        if gallery not in {"public", "team", "study"}:
            raise ValueError(f"Unknown gallery for {project_id}: {gallery}")
        output = target / "media" / project_id
        output.mkdir(parents=True)
        deck = LIBRARY / "output/decks" / project_id
        build(doc, deck)
        for name in ("presentation.html", "presentation.pptx"):
            shutil.copy2(deck / name, output / name)
        instrument_media(output / "presentation.html", "../../learning-bridge.js")
        previews = sorted((deck / "previews").glob("*.png"))
        if not previews:
            raise ValueError(f"No poster generated for {project_id}")
        from PIL import Image
        Image.open(previews[0]).convert("RGB").save(output / "poster.jpg", quality=85)
        player = PUBLISHED / project_id / "interactive"
        if not (player / "index.html").is_file() and content.parent.parent.name == "examples":
            player = content.parent / "interactive"
        has_video = (player / "index.html").is_file()
        duration = None
        if has_video:
            package_player(player, output / "interactive")
            instrument_media(output / "interactive/index.html", "../../../learning-bridge.js")
            shutil.copy2(player / "poster.jpg", output / "poster.jpg")
            parser = re.search(r'<script[^>]*id="content"[^>]*>(.*?)</script>', (player / "index.html").read_text(encoding="utf-8"), re.S)
            if not parser:
                raise ValueError(f"No rendered timeline found for {project_id}")
            timeline = json.loads(parser.group(1))
            duration = max((s.get("start", 0) + s.get("duration", 0) for s in timeline["scenes"]), default=0)
        prefix = f"library/media/{project_id}"
        exports = target / "exports" / project_id
        archive = build_scorm(doc, exports / "staging", mode="slides")
        archive.replace(exports / "slides.zip")
        scorm = {"deck": f"library/exports/{project_id}/slides.zip"}
        if has_video:
            timeline = scorm_timeline(doc, timeline)
            archive = build_scorm(timeline, exports / "staging", mode="video", video=output / "interactive/video.mp4")
            archive.replace(exports / "video.zip")
            scorm["video"] = f"library/exports/{project_id}/video.zip"
        shutil.rmtree(exports / "staging")
        catalog.append({
            "id": project_id, "title": metadata.get("title", doc["title"]),
            "description": metadata.get("description", doc["scenes"][0].get("subtitle", "מצגת מבית דה וינצ׳י 4744")),
            "category": metadata.get("category", "עוד מהקבוצה"), "featured": metadata.get("featured", False),
            "unlisted": metadata.get("unlisted", False),
            "gallery": gallery,
            "poster": f"{prefix}/poster.jpg", "slides": len(doc["scenes"]), "duration": duration,
            "checkpoints": sum(bool(s.get("quiz")) for s in doc["scenes"]),
            "chapters": [s.get("chapter", s["title"]) for s in doc["scenes"]],
            "deck": f"{prefix}/presentation.html", "powerpoint": f"{prefix}/presentation.pptx",
            "video": f"{prefix}/interactive/index.html" if has_video else None,
            "scorm": scorm,
        })
    (target / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (LIBRARY / "public/.nojekyll").touch()
    print(f"Gallery ready: {len(catalog)} topics, {sum(bool(i['video']) for i in catalog)} videos")


def scorm_timeline(doc: dict, rendered: dict) -> dict:
    """Use retained video timing with the current source's single final question set."""
    timings = {scene["id"]: scene for scene in rendered["scenes"]}
    if set(timings) != {scene["id"] for scene in doc["scenes"]}:
        raise ValueError("Video scene IDs do not match the source document; render it again before exporting")
    fields = {"start", "duration", "voice_offset", "voice_duration", "captions"}
    return {**doc, "scenes": [{**scene, **{key: value for key, value in timings[scene["id"]].items() if key in fields}} for scene in doc["scenes"]]}


def instrument_media(path: Path, bridge: str) -> None:
    """Add library-only progress events without changing retained/offline originals."""
    content = path.read_text(encoding="utf-8")
    script = f'<script src="{bridge}"></script>'
    content = content.replace("</body>", script + "</body>") if "</body>" in content else content + script
    path.write_text(content, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--publish-video", metavar="PROJECT_ID")
    parser.add_argument("--from", dest="player", type=Path, help="Rendered interactive/ directory")
    parser.add_argument("--publish-only", action="store_true")
    args = parser.parse_args()
    if args.publish_video:
        if not args.player:
            parser.error("--publish-video requires --from <interactive-directory>")
        publish_video(args.publish_video, args.player.resolve())
    if not args.publish_only:
        prepare()


if __name__ == "__main__":
    main()
