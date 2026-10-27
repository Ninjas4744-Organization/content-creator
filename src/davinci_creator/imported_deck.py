"""Preserve an imported PowerPoint and its reviewed slide renders for web playback."""
from __future__ import annotations

import base64
import html
import math
import mimetypes
import re
from pathlib import Path
from urllib.parse import urlsplit

from PIL import Image

from .common import ROOT, local_file


def data_url(name: str) -> str:
    path = local_file(ROOT, name)
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def validate_source(doc: dict) -> None:
    source = doc.get("source_deck")
    if source is None:
        return
    if not isinstance(source, dict):
        raise ValueError("source_deck must be an object")
    powerpoint = source.get("powerpoint")
    if not isinstance(powerpoint, str) or local_file(ROOT, powerpoint).suffix.lower() != ".pptx":
        raise ValueError("source_deck.powerpoint must name a local PPTX")
    slides = source.get("slides")
    if not isinstance(slides, list) or len(slides) != len(doc["scenes"]):
        raise ValueError("source_deck needs one rendered slide per scene")
    for slide in slides:
        if not isinstance(slide, dict) or not isinstance(slide.get("image"), str):
            raise ValueError("Each imported slide needs an image")
        if local_file(ROOT, slide["image"]).suffix.lower() not in {".png", ".jpg", ".jpeg"}:
            raise ValueError("Imported slide renders must be PNG or JPEG")
        youtube = slide.get("youtube")
        if youtube is not None and (not isinstance(youtube, str) or not re.fullmatch(r"[A-Za-z0-9_-]{11}", youtube)):
            raise ValueError("Invalid YouTube video ID")
        for field in ("links", "overlays"):
            entries = slide.get(field, [])
            if not isinstance(entries, list):
                raise ValueError(f"Imported slide {field} must be a list")
            for entry in entries:
                if not isinstance(entry, dict):
                    raise ValueError("Imported slide overlays must be objects")
                values = [entry.get(key) for key in ("x", "y", "w", "h")]
                if any(type(v) not in (int, float) or not math.isfinite(v) for v in values):
                    raise ValueError("Imported slide overlays need finite geometry")
                x, y, w, h = values
                if min(x, y) < 0 or min(w, h) <= 0 or x + w > 1280.01 or y + h > 720.01:
                    raise ValueError("Imported slide overlay is outside the slide")
                if field == "links":
                    parsed = urlsplit(entry.get("href", ""))
                    if parsed.scheme != "https" or not parsed.netloc:
                        raise ValueError("Imported slide links must use HTTPS")
                elif not isinstance(entry.get("image"), str) or local_file(ROOT, entry["image"]).suffix.lower() not in {".png", ".jpg", ".jpeg", ".gif"}:
                    raise ValueError("Unsupported imported slide overlay image")
                crop = entry.get("crop", {})
                if not isinstance(crop, dict) or any(type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value < 1 for value in crop.values()):
                    raise ValueError("Imported slide crop must contain fractions between zero and one")
                if crop.get("left", 0) + crop.get("right", 0) >= 1 or crop.get("top", 0) + crop.get("bottom", 0) >= 1:
                    raise ValueError("Imported slide crop removes the entire image")
                if type(entry.get("preview_frame", 0)) is not int or entry.get("preview_frame", 0) < 0:
                    raise ValueError("Imported overlay preview_frame must be a nonnegative integer")


def slide_markup(source: dict, scene: dict) -> str:
    title = html.escape(scene["title"], quote=True)
    parts = [f'<img class="source-snapshot" alt="{title}" src="{data_url(source["image"])}">']
    for overlay in source.get("overlays", []):
        style = ";".join(f"{key}:{overlay[value]}px" for key, value in (("left", "x"), ("top", "y"), ("width", "w"), ("height", "h")))
        crop = overlay.get("crop", {})
        width = 100 / (1 - crop.get("left", 0) - crop.get("right", 0))
        height = 100 / (1 - crop.get("top", 0) - crop.get("bottom", 0))
        image_style = f'position:absolute;width:{width}%;height:{height}%;left:{-crop.get("left", 0) * width}%;top:{-crop.get("top", 0) * height}%'
        parts.append(f'<div class="source-overlay" style="{style};overflow:hidden"><img alt="" style="{image_style}" src="{data_url(overlay["image"])}"></div>')
    for link in source.get("links", []):
        style = ";".join(f"{key}:{link[value]}px" for key, value in (("left", "x"), ("top", "y"), ("width", "w"), ("height", "h")))
        href = html.escape(link["href"], quote=True)
        label = html.escape(link.get("label", scene["title"]), quote=True)
        parts.append(f'<a class="source-link" style="{style}" href="{href}" target="_blank" rel="noopener noreferrer" aria-label="{label}"></a>')
    if source.get("youtube"):
        video = source["youtube"]
        parts.append(f'<div class="source-video" data-youtube="{video}" data-title="{title}"><button class="youtube-play" aria-label="ניגון {title}"><span class="play-icon" aria-hidden="true">▶</span><span>ניגון הסרטון</span></button></div><a class="youtube-external" dir="rtl" href="https://www.youtube.com/watch?v={video}" target="_blank" rel="noopener noreferrer">פתיחה ב־<bdi dir="ltr">YouTube</bdi> ↗</a>')
    return "".join(parts)


def storyboard(doc: dict, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    slides = doc["source_deck"]["slides"]
    contact = Image.new("RGB", (1280, 180 * math.ceil(len(slides) / 4)), "#102742")
    for index, slide in enumerate(slides):
        with Image.open(local_file(ROOT, slide["image"])) as image:
            frame = image.convert("RGB").resize((1280, 720), Image.Resampling.LANCZOS)
        for overlay in slide.get("overlays", []):
            with Image.open(local_file(ROOT, overlay["image"])) as image:
                image.seek(min(overlay.get("preview_frame", 0), getattr(image, "n_frames", 1) - 1))
                layer = image.convert("RGBA")
            crop = overlay.get("crop", {})
            layer = layer.crop((round(layer.width * crop.get("left", 0)), round(layer.height * crop.get("top", 0)), round(layer.width * (1 - crop.get("right", 0))), round(layer.height * (1 - crop.get("bottom", 0)))))
            layer = layer.resize((round(overlay["w"]), round(overlay["h"])), Image.Resampling.LANCZOS)
            frame.paste(layer, (round(overlay["x"]), round(overlay["y"])), layer)
        frame.save(out / f"slide-{index + 1:02d}.png")
        contact.paste(frame.resize((320, 180)), ((index % 4) * 320, (index // 4) * 180))
    contact.save(out / "storyboard.jpg", quality=92)
