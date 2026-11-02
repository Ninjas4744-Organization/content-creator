"""Stage application assets for Workers; published lessons are served from R2."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def prepare(library: Path = ROOT / "learning-library", admin_site: Path | None = None) -> None:
    site = library / "output/site"
    if not (site / "index.html").is_file():
        raise ValueError("Build the library first with npm run build in learning-library")
    if admin_site is not None and not (admin_site / "index.html").is_file():
        raise ValueError("Build the admin first with npm run build:production in learning-library/admin")
    entries = list(site.rglob("*")) + (list(admin_site.rglob("*")) if admin_site is not None else [])
    if any(path.is_symlink() for path in entries):
        raise ValueError("Public site must not contain symlinks")
    files = [path for path in entries if path.is_file()]
    if any(path.name.startswith(".env") or path.name.endswith((".local.json", "-secrets.json")) or path.suffix.lower() in {".pem", ".key", ".secret", ".sqlite3", ".db"} for path in files):
        raise ValueError("Public site contains a private configuration or signing file")
    oversized = [str(path.name) for path in files if path.stat().st_size > 25 * 1024 * 1024]
    if oversized:
        raise ValueError("Assets exceed the 25 MiB Workers limit. Configure media storage before deploying: " + ", ".join(oversized))
    if any(not path.resolve().is_relative_to(site.resolve()) and not (admin_site and path.resolve().is_relative_to(admin_site.resolve())) for path in files):
        raise ValueError("Public site contains a symlink outside the build")
    private = library / "output/cloudflare-data"
    shutil.rmtree(private, ignore_errors=True)
    public = library / "output/cloudflare-assets"
    shutil.rmtree(public, ignore_errors=True)
    shutil.copytree(site, public)
    if admin_site is not None:
        shutil.copytree(admin_site, public / "admin")
    (public / "_headers").write_text("/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: frame-ancestors 'self'; base-uri 'self'\n", encoding="utf-8")
    print(f"Cloudflare package ready: {len(files)} application assets; learning content comes from R2")


if __name__ == "__main__":
    try:
        prepare(admin_site=ROOT / "learning-library/admin/output/production")
    except (ValueError, KeyError) as error:
        raise SystemExit(str(error))
