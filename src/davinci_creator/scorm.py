"""Self-contained, single-SCO SCORM 1.2 exports for learning platforms."""
from __future__ import annotations

import html
import json
import math
import shutil
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile

from .common import ASSETS, fingerprint, validate
from .deck import html_deck
from .player import vtt

CP = "http://www.imsproject.org/xsd/imscp_rootv1p1p2"
ADL = "http://www.adlnet.org/xsd/adlcp_rootv1p2"


def configuration(doc: dict, mode: str, pass_score: float, coverage: float) -> dict:
    validate(doc)
    if mode not in {"slides", "video"}:
        raise ValueError("SCORM format must be slides or video")
    if not math.isfinite(pass_score) or not 0 <= pass_score <= 1:
        raise ValueError("pass-score must be between 0 and 1")
    if not math.isfinite(coverage) or not 0 < coverage <= 1:
        raise ValueError("coverage must be greater than 0 and at most 1")
    questions = [{"id": s["id"], **s["quiz"]} for s in doc["scenes"] if s.get("quiz")]
    if len(questions) > 250 or any(len(q["options"]) > 36 for q in questions):
        raise ValueError("SCORM 1.2 export supports up to 250 questions and 36 options per question")
    duration = 0
    if mode == "video":
        for scene in doc["scenes"]:
            start, length = scene.get("start"), scene.get("duration")
            if (not isinstance(start, (int, float)) or not isinstance(length, (int, float))
                    or not math.isfinite(start) or not math.isfinite(length) or start < 0 or length <= 0):
                raise ValueError("Video SCORM export needs a rendered timeline with valid start and duration")
            duration = max(duration, start + length)
    config = {
        "key": fingerprint([doc, mode, pass_score, coverage])[:24],
        "title": doc["title"], "mode": mode, "slides": len(doc["scenes"]),
        "duration": round(duration, 3), "passScore": pass_score, "coverage": coverage,
        "bins": 512, "questions": questions,
        "chapters": [{"title": s.get("chapter", s["title"]), "start": s["start"]} for s in doc["scenes"]] if mode == "video" else [],
    }
    # The state contains ASCII indices/bitmaps, never question or answer text.
    largest_state = [1, config["key"], 9999999999.999, "1" * config["slides"],
                     "1" * config["bins"], [35] * len(questions), [100, "passed"]]
    if len(json.dumps(largest_state, separators=(",", ":"))) > 4096:
        raise ValueError("Lesson is too large for SCORM 1.2 resume storage; split it into smaller lessons")
    return config


def manifest(title: str, key: str, files: list[str], pass_score: float) -> bytes:
    ET.register_namespace("", CP)
    ET.register_namespace("adlcp", ADL)
    root = ET.Element(f"{{{CP}}}manifest", {"identifier": f"davinci-{key}", "version": "1.0"})
    metadata = ET.SubElement(root, f"{{{CP}}}metadata")
    ET.SubElement(metadata, f"{{{CP}}}schema").text = "ADL SCORM"
    ET.SubElement(metadata, f"{{{CP}}}schemaversion").text = "1.2"
    organizations = ET.SubElement(root, f"{{{CP}}}organizations", {"default": "course"})
    organization = ET.SubElement(organizations, f"{{{CP}}}organization", {"identifier": "course"})
    ET.SubElement(organization, f"{{{CP}}}title").text = title
    item = ET.SubElement(organization, f"{{{CP}}}item", {"identifier": "lesson", "identifierref": "sco"})
    ET.SubElement(item, f"{{{CP}}}title").text = title
    ET.SubElement(item, f"{{{ADL}}}masteryscore").text = f"{pass_score * 100:g}"
    resources = ET.SubElement(root, f"{{{CP}}}resources")
    resource = ET.SubElement(resources, f"{{{CP}}}resource", {
        "identifier": "sco", "type": "webcontent", f"{{{ADL}}}scormtype": "sco", "href": "index.html",
    })
    for name in files:
        ET.SubElement(resource, f"{{{CP}}}file", {"href": name})
    ET.indent(root)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def build_scorm(doc: dict, out: Path, *, mode: str = "slides", video: Path | None = None,
                pass_score: float = 0.8, coverage: float = 0.9) -> Path:
    config = configuration(doc, mode, pass_score, coverage)
    if mode == "video" and (video is None or not video.is_file()):
        raise ValueError("Video export requires --video pointing to an existing MP4")
    if mode == "slides" and video is not None:
        raise ValueError("Use --format video with --video")
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".scorm-", dir=out) as temporary:
        staging = Path(temporary)
        package = staging / "package"
        media = package / "media"
        media.mkdir(parents=True)
        if mode == "video":
            shutil.copy2(video, media / "video.mp4")
            poster = video.parent / "poster.jpg"
            if poster.is_file():
                shutil.copy2(poster, media / "poster.jpg")
            else:
                from .render import frame
                frame(doc["scenes"][0], 0, len(doc["scenes"])).save(media / "poster.jpg", quality=90)
            (media / "captions.vtt").write_text(vtt(doc), encoding="utf-8")
            media_markup = '''<video id="lessonVideo" controls preload="metadata" playsinline poster="media/poster.jpg" src="media/video.mp4"><track kind="captions" src="media/captions.vtt" srclang="he" label="עברית"></video>
<div class="video-tools"><label>מעבר לפרק <select id="chapter" aria-label="מעבר לפרק"></select></label><label>מהירות <select id="speed"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label></div>'''
        else:
            html_deck(doc, media / "index.html")
            media_html = media / "index.html"
            content = media_html.read_text(encoding="utf-8")
            content = content.replace("<script>", "<script>window.DAVINCI_MANAGED_PROGRESS=true;</script><script>", 1)
            content = content.replace("</html>", '<script src="../learning_bridge.js"></script></html>')
            media_html.write_text(content, encoding="utf-8")
            media_markup = '<iframe id="lesson" title="תוכן ההדרכה" src="media/index.html" allow="fullscreen" allowfullscreen></iframe>'
        sources = Path(__file__).parent
        for name in ["learning_bridge.js", "scorm_runtime.js", "scorm_player.js"]:
            shutil.copy2(sources / name, package / name)
        for name in ["Rubik-Regular.ttf", "Rubik-Bold.ttf", "Rubik-OFL.txt", "logo.png"]:
            shutil.copy2(ASSETS / "brand" / name, package / name)
        data = json.dumps(config, ensure_ascii=False).replace("<", "\\u003c")
        template = (sources / "scorm.html").read_text(encoding="utf-8")
        (package / "index.html").write_text(template.replace("__TITLE__", html.escape(doc["title"]))
                                          .replace("__CONFIG__", data).replace("__MODE__", mode)
                                          .replace("__MEDIA__", media_markup), encoding="utf-8")
        files = sorted(p.relative_to(package).as_posix() for p in package.rglob("*") if p.is_file())
        (package / "imsmanifest.xml").write_bytes(manifest(doc["title"], config["key"], files, pass_score))
        archive = staging / "lesson.zip"
        with ZipFile(archive, "w", compression=ZIP_DEFLATED) as zipped:
            for file in sorted(package.rglob("*")):
                if file.is_file():
                    zipped.write(file, file.relative_to(package).as_posix(),
                                 compress_type=ZIP_STORED if file.suffix == ".mp4" else ZIP_DEFLATED)
        archive.replace(out / "lesson.zip")
    print(f"SCORM 1.2 ({mode}): {out / 'lesson.zip'}")
    return out / "lesson.zip"
