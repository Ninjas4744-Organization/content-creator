"""Create, publish and update through the creator's personal site login. No Git/R2 keys."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import uuid4
from zipfile import ZipFile
from creator_auth import credentials, disconnect, forget

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://knowledge.davinci4744.com"
CHUNK = 8 * 1024 * 1024
MAX_KIT = 25 * 1024 * 1024


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Api:
    def __init__(self):
        self.token = credentials(SITE)
        self.opener = build_opener(NoRedirect())

    def request(self, path, method="GET", data=None, revision=None, binary=False):
        if not path.startswith("/") or ".." in path or path.startswith("//"):
            raise ValueError("Invalid admin API path")
        headers = {"Authorization": "Bearer " + self.token, "Origin": SITE}
        if data is not None:
            headers["Content-Type"] = "application/octet-stream" if isinstance(data, bytes) else "application/json"
            if not isinstance(data, bytes):
                data = json.dumps(data, ensure_ascii=False).encode()
        if revision is not None:
            headers["If-Match"] = str(revision)
        request = Request(SITE + "/admin/api" + path, data=data, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=120) as response:
                if binary:
                    limit = MAX_KIT if path == "/creator/kit" else 1024**3
                    value = response.read(limit + 1)
                    if len(value) > limit:
                        raise ValueError("Download exceeds the supported size")
                    return value
                if "application/json" not in response.headers.get("Content-Type", ""):
                    raise ValueError("Admin authentication expired; reconnect and retry.")
                return json.load(response)
        except HTTPError as error:
            if error.code == 401:
                forget()
            if error.code in {301, 302, 303, 307, 308, 401, 403}:
                raise ValueError("Admin login expired or access denied. Sign in again; never share the login token.") from None
            if error.code == 409:
                raise ValueError("Catalog changed or upload is incomplete. Refresh the catalog and review changes before a new publication; no catalog was overwritten.") from None
            raise ValueError(f"Admin request failed (HTTP {error.code}); local work is retained.") from None


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def file_hashes(path):
    with path.open("rb") as stream:
        return [hashlib.sha256(chunk).hexdigest() for chunk in iter(lambda: stream.read(CHUNK), b"")]


def safe_relative(name):
    path = PurePosixPath(name)
    if not isinstance(name, str) or not name or path.as_posix() != name or path.is_absolute() or "\\" in name or ":" in name or any(p in {".", ".."} for p in path.parts):
        raise ValueError("Unsafe archive path")
    return path


def publish(api, pid, gallery=None, video=None):
    sys.path[:0] = [str(ROOT / "src"), str(ROOT / "scripts")]
    from davinci_creator.project_store import pack, project_id
    from prepare_gallery import prepare, publish_video
    project_id(pid)
    current = api.request("/catalog")
    existing = next((item for item in current["items"] if item["id"] == pid), None)
    marker = ROOT / "projects" / pid / ".creator-source.json"
    if existing:
        known = json.loads(marker.read_text(encoding="utf-8")) if marker.is_file() else {}
        if known.get("poster") != existing["poster"]:
            raise ValueError("Remote sources changed or this local copy has no publication base. Pull into a separate kit folder and merge your edits before publishing.")
    settings = ROOT / "projects" / pid / "publication.json"
    metadata = json.loads(settings.read_text(encoding="utf-8")) if settings.exists() else {}
    if gallery:
        if existing and gallery != existing.get("gallery", "team" if existing.get("unlisted") else "public"):
            raise ValueError("Change an existing item's library in the admin before republishing.")
        metadata["gallery"] = gallery
    if not existing and not metadata.get("gallery"):
        raise ValueError("Choose a saved library with --gallery <id> (use none for direct-link access).")
    if metadata.get("gallery") and metadata["gallery"] not in {g["id"] for g in current["galleries"]}:
        raise ValueError("Unknown library. Load the catalog to choose a saved library ID.")
    if gallery:
        save_json(settings, metadata)
    sources = pack(ROOT, pid)  # Existing source packer excludes caches, outputs and secrets.
    stage = ROOT / "outputs" / "creator-uploads" / uuid4().hex
    stage.mkdir(parents=True)
    save_json(stage / "base-catalog.json", {k: v for k, v in current.items() if k not in {"revision", "mode", "updatedAt"}})
    if video:
        publish_video(pid, Path(video).resolve())
    package = prepare([pid], stage / "base-catalog.json")
    files = []
    for file in sorted(package.rglob("*")):
        if not file.is_file() or file.relative_to(package).parts[0] not in {"media", "exports"}:
            continue
        if file.is_symlink() or not file.resolve().is_relative_to(package.resolve()):
            raise ValueError("Publication contains a symlink")
        target = stage / file.relative_to(package)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(file, target)
        files.append({"path": target.relative_to(stage).as_posix(), "size": target.stat().st_size, "hashes": file_hashes(target)})
    source = stage / "sources" / (pid + ".zip")
    source.parent.mkdir()
    source.write_bytes(sources)
    files.append({"path": "sources/" + source.name, "size": len(sources), "hashes": file_hashes(source)})
    catalog = json.loads((package / "catalog.json").read_text(encoding="utf-8"))
    session = api.request("/creator/uploads", "POST", {"catalog": catalog, "files": files}, current["revision"])
    receipt = {"id": session["id"], "files": files, "parts": {}}
    save_json(stage / "upload.json", receipt)
    print(f"Upload recovery directory: {stage}", file=sys.stderr)
    return resume(api, stage)


def resume(api, stage):
    stage = Path(stage).resolve()
    receipt = json.loads((stage / "upload.json").read_text(encoding="utf-8"))
    if not re.fullmatch(r"[a-f0-9]{32}", receipt["id"]):
        raise ValueError("Invalid upload receipt")
    for file in receipt["files"]:
        path = stage / safe_relative(file["path"])
        if path.is_symlink() or not path.resolve().is_relative_to(stage) or path.stat().st_size != file["size"] or file_hashes(path) != file["hashes"]:
            raise ValueError("Local upload files changed. Prepare a new publication.")
    for index, file in enumerate(receipt["files"]):
        endpoint = f"/creator/uploads/{receipt['id']}/files/{index}"
        if api.request(endpoint, "POST").get("complete"):
            continue
        parts = receipt["parts"].setdefault(str(index), [])
        with (stage / file["path"]).open("rb") as stream:
            for number in range(1, len(file["hashes"]) + 1):
                data = stream.read(CHUNK)
                if number <= len(parts):
                    continue
                result = api.request(endpoint + f"/parts/{number}", "PUT", data)
                if result.get("complete"):
                    break
                parts.append(result)
                save_json(stage / "upload.json", receipt)
        api.request(endpoint + "/complete", "POST", {"parts": parts})
    result = api.request(f"/creator/uploads/{receipt['id']}/publish", "POST")
    current = api.request("/catalog")
    for pid in result["ids"]:
        item = next(item for item in current["items"] if item["id"] == pid)
        if not item["poster"].startswith(f"library/releases/{receipt['id']}/"):
            raise ValueError("A subsequent publication replaced this release; inspect the admin.")
        if (ROOT / "projects" / pid).is_dir():
            save_json(ROOT / "projects" / pid / ".creator-source.json", {"poster": item["poster"]})
    save_json(stage / "published.json", result)
    return result


def managed_path(name):
    safe_relative(name)
    if name in {"AGENTS.md", "START-HERE.md", "pyproject.toml", "templates/starter.json", "templates/brief.md"}:
        return True
    return name.startswith((".agents/skills/", ".claude/skills/", "src/davinci_creator/", "docs/", "assets/brand/", "assets/photos/", "assets/reference/", "examples/community/")) or name in {"assets/README.md", "assets/manifest.json", "assets/photo-albums.json", "scripts/setup.py", "scripts/prepare_gallery.py", "scripts/catalog_model.py", "scripts/creator_agent.py", "scripts/creator_auth.py"}


def install_update(data, root=ROOT):
    root = root.resolve()
    if root.is_symlink():
        raise ValueError("Kit root cannot be a symlink")
    with ZipFile(io.BytesIO(data)) as archive:
        infos = archive.infolist()
        if len(infos) > 2000 or sum(info.file_size for info in infos) > 100 * 1024**2:
            raise ValueError("Kit archive is too large")
        names = [info.filename for info in infos]
        if len(names) != len(set(name.casefold() for name in names)) or "davinci-creator/creator-kit-files.json" not in names:
            raise ValueError("Invalid or duplicate kit paths")
        manifest = json.loads(archive.read("davinci-creator/creator-kit-files.json"))
        expected = manifest.get("files", {})
        if manifest.get("schemaVersion") != 1 or not expected or set(names) != {"davinci-creator/" + name for name in [*expected, "creator-kit-files.json"]}:
            raise ValueError("Kit manifest does not match archive")
        previous_file = root / "creator-kit-files.json"
        if previous_file.is_symlink():
            raise ValueError("Kit manifest cannot be a symlink")
        previous = json.loads(previous_file.read_text(encoding="utf-8"))["files"] if previous_file.exists() else {}
        changes = {}
        for name in set(expected) | set(previous):
            if not managed_path(name):
                raise ValueError("Kit update contains an unmanaged path")
            target = root / name
            if target.is_symlink() or any(p.is_symlink() for p in target.parents if p != root.parent) or not target.resolve().is_relative_to(root):
                raise ValueError("Kit destination contains a symlink")
            old = target.read_bytes() if target.exists() else None
            if name in expected:
                info = archive.getinfo("davinci-creator/" + name)
                if stat.S_IFMT(info.external_attr >> 16) not in {0, stat.S_IFREG}:
                    raise ValueError("Unsupported kit entry")
                content = archive.read(info)
                if hashlib.sha256(content).hexdigest() != expected[name]:
                    raise ValueError("Kit file checksum mismatch")
            else:
                content = None
            if old == content:
                continue
            if old is not None and hashlib.sha256(old).hexdigest() != previous.get(name):
                raise ValueError(f"Local edits preserved; managed file differs: {name}")
            changes[name] = (old, content)
        changes["creator-kit-files.json"] = (previous_file.read_bytes() if previous_file.exists() else None, json.dumps(manifest, ensure_ascii=False, indent=2).encode() + b"\n")
        applied = []
        try:
            for name, (old, content) in changes.items():
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                if content is None:
                    target.unlink(missing_ok=True)
                else:
                    with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as temporary:
                        temporary.write(content)
                    os.replace(temporary.name, target)
                applied.append(name)
        except BaseException:
            for name in reversed(applied):
                old = changes[name][0]
                target = root / name
                if old is None:
                    target.unlink(missing_ok=True)
                else:
                    target.write_bytes(old)
            raise
    return manifest["version"]


def update(api):
    info = api.request("/creator/kit-manifest")
    if info.get("schemaVersion") != 1 or not isinstance(info.get("size"), int) or not 0 < info["size"] <= MAX_KIT:
        raise ValueError("Invalid kit metadata")
    data = api.request("/creator/kit", binary=True)
    if len(data) != info["size"] or hashlib.sha256(data).hexdigest() != info.get("sha256"):
        raise ValueError("Kit download checksum mismatch; nothing was changed")
    return {"version": install_update(data), "updated": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("connect")
    commands.add_parser("disconnect")
    catalog = commands.add_parser("catalog")
    catalog.add_argument("--out", type=Path, default=ROOT / "outputs/current-catalog.json")
    publication = commands.add_parser("publish")
    publication.add_argument("project")
    publication.add_argument("--gallery")
    publication.add_argument("--video", type=Path, help="Rendered interactive/ directory")
    recovery = commands.add_parser("resume")
    recovery.add_argument("directory", type=Path)
    pull = commands.add_parser("pull")
    pull.add_argument("project")
    commands.add_parser("update")
    args = parser.parse_args()
    if args.command == "disconnect":
        print(json.dumps(disconnect(SITE)))
        return
    api = Api()
    if args.command == "connect":
        current = api.request("/catalog")
        result = {"connected": True, "mode": current["mode"]}
    elif args.command == "catalog":
        current = api.request("/catalog")
        save_json(args.out, {k: v for k, v in current.items() if k not in {"revision", "updatedAt", "mode"}})
        result = {"catalog": str(args.out), "galleries": current["galleries"]}
    elif args.command == "publish":
        result = publish(api, args.project, args.gallery, args.video)
    elif args.command == "resume":
        result = resume(api, args.directory)
    elif args.command == "pull":
        sys.path.insert(0, str(ROOT / "src"))
        from davinci_creator.project_store import unpack, project_id
        pid = project_id(args.project)
        current = api.request("/catalog")
        item = next((item for item in current["items"] if item["id"] == pid), None)
        if not item:
            raise ValueError("Project not found in the current catalog")
        unpack(api.request("/creator/sources/" + pid, binary=True), ROOT, pid)
        save_json(ROOT / "projects" / pid / ".creator-source.json", {"poster": item["poster"]})
        result = {"project": pid, "restored": True}
    else:
        result = update(api)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        # Never echo subprocess output, request objects or authentication headers.
        print(str(error) if not isinstance(error, subprocess.CalledProcessError) else "The local command failed; local work is retained.", file=sys.stderr)
        raise SystemExit(1)
