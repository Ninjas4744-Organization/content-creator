"""Stage the built public site and a separate, private assessment module for Workers."""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "scripts"))
from davinci_creator.common import load
from prepare_gallery import content_sources
from lti_settings import platform_settings
from urllib.parse import urlsplit


def prepare(library: Path = ROOT / "projects/learning-library", source_root: Path = ROOT) -> None:
    site = library / "output/site"
    if not (site / "index.html").is_file():
        raise ValueError("Build the library first with npm run build in projects/learning-library")
    entries = list(site.rglob("*"))
    if any(path.is_symlink() for path in entries):
        raise ValueError("Public site must not contain symlinks")
    files = [path for path in entries if path.is_file()]
    if any(path.name.startswith(".env") or path.name in {"lti.local.json", "lti.platform.local.json", "cloudflare-secrets.json", "platform-secrets.json"} or path.suffix.lower() in {".pem", ".key", ".secret", ".sqlite3", ".db"} for path in files):
        raise ValueError("Public site contains a private configuration or signing file")
    oversized = [str(path.relative_to(site)) for path in files if path.stat().st_size > 25 * 1024 * 1024]
    if oversized:
        raise ValueError("Assets exceed the 25 MiB Workers limit. Configure media storage before deploying: " + ", ".join(oversized))
    if any(not path.resolve().is_relative_to(site.resolve()) for path in files):
        raise ValueError("Public site contains a symlink outside the build")
    catalog = json.loads((site / "library/catalog.json").read_text(encoding="utf-8"))
    sources = content_sources(source_root)
    lessons = {}
    for item in catalog:
        doc = load(sources[item["id"]])
        lessons[item["id"]] = {key: item[key] for key in ("id", "title", "description", "slides", "duration", "deck", "video")}
        lessons[item["id"]]["questions"] = [{"id": scene["id"], **scene["quiz"]} for scene in doc["scenes"] if scene.get("quiz")]
    private = library / "output/cloudflare-data"
    private.mkdir(parents=True, exist_ok=True)
    (private / "lessons.json").write_text(json.dumps(lessons, ensure_ascii=False, indent=2), encoding="utf-8")
    media = {"/" + path.relative_to(site).as_posix(): path.stat().st_size for path in files if path.suffix.lower() == ".mp4"}
    (private / "media.json").write_text(json.dumps(media, indent=2), encoding="utf-8")
    public = library / "output/cloudflare-assets"
    shutil.rmtree(public, ignore_errors=True)
    shutil.copytree(site, public)
    issuer = platform_settings(library)["PLATFORM_ISSUER"]
    parsed = urlsplit(issuer)
    ancestor = f" {parsed.scheme}://{parsed.netloc}" if issuer else ""
    (public / "_headers").write_text(f"/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: frame-ancestors 'self'{ancestor}; base-uri 'self'\n", encoding="utf-8")
    print(f"Cloudflare package ready: {len(lessons)} lessons; private assessments are outside public assets")


if __name__ == "__main__":
    try:
        prepare()
    except (ValueError, KeyError) as error:
        raise SystemExit(str(error))
