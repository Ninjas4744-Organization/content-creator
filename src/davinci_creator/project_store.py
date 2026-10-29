"""Versioned editable project sources in R2; projects/ is a local workspace."""
from __future__ import annotations

import argparse
import ast
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import tempfile
from typing import Protocol
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from .common import ROOT

PREFIX = "project-sources/"
INDEX = PREFIX + "catalog.json"
EXCLUDED = {"output", "outputs", "audio", "build", "dist", "node_modules", "__pycache__", ".venv"}
MAX_FILES = 20000
MAX_BYTES = 2 * 1024**3
CREDENTIAL_FIELDS = {"private_key", "client_secret", "refresh_token", "access_token", "api_key", "gemini_api_key", "openai_api_key"}


class Storage(Protocol):
    def read(self, key: str) -> bytes | None: ...
    def write(self, key: str, data: bytes, content_type: str) -> None: ...


class WranglerStorage:
    """Use the existing Wrangler login; never export or inspect its credentials."""
    def __init__(self, bucket: str = "davinci-learning-library"):
        self.bucket = bucket
        self.cwd = ROOT / "learning-library/cloudflare"
        self.command = self.cwd / "node_modules/wrangler/bin/wrangler.js"
        if not self.command.is_file():
            raise ValueError("Install Cloudflare tools: npm --prefix learning-library/cloudflare ci")

    def _run(self, operation: str, key: str, file: Path, content_type: str = "") -> bool:
        if not key.startswith(PREFIX) or any(p in {".", ".."} for p in key.split("/")):
            raise ValueError("Invalid source storage key")
        logs = ROOT / "outputs/r2"
        logs.mkdir(parents=True, exist_ok=True)
        environment = {**os.environ, "WRANGLER_SEND_METRICS": "false", "WRANGLER_LOG_PATH": str(logs / "sources.log")}
        args = ["node", str(self.command), "r2", "object", operation, f"{self.bucket}/{key}", "--remote", "--file", str(file)]
        if operation == "put":
            args += ["--content-type", content_type, "--cache-control", "no-cache"]
        result = subprocess.run(args, cwd=self.cwd, env=environment, capture_output=True, text=True)
        if not result.returncode:
            return True
        if operation == "get" and "the specified key does not exist" in result.stderr.lower():
            return False
        raise RuntimeError(f"R2 {operation} failed. Check Wrangler login and bucket permissions; see outputs/r2/sources.log.")

    def read(self, key: str) -> bytes | None:
        with tempfile.TemporaryDirectory(prefix="davinci-sources-") as temp:
            path = Path(temp) / "object"
            return path.read_bytes() if self._run("get", key, path) else None

    def write(self, key: str, data: bytes, content_type: str) -> None:
        with tempfile.TemporaryDirectory(prefix="davinci-sources-") as temp:
            path = Path(temp) / "object"
            path.write_bytes(data)
            self._run("put", key, path, content_type)


def project_id(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", value):
        raise ValueError("Use a lowercase project ID with hyphens")
    return value


def excluded(name: str) -> bool:
    parts = PurePosixPath(name).parts
    lower = parts[-1].lower() if parts else ""
    return (any(p.startswith(".") or p in EXCLUDED for p in parts)
            or lower.endswith((".pem", ".key", ".secret", ".sqlite3", ".db", ".pyc", ".local.json", "-key.txt", "-token.json"))
            or bool(re.match(r"(?:credentials|secrets?|service[-_]account)(?:[._-]|$)", lower)))


def safe_name(name: str, pid: str) -> str:
    path = PurePosixPath(name)
    if (not isinstance(name, str) or path.is_absolute() or path.as_posix() != name
            or "\\" in name or ":" in name or any(ord(c) < 32 for c in name)
            or any(part in {".", ".."} for part in path.parts) or excluded(name)):
        raise ValueError("Unsafe source archive path")
    if not (name.startswith(f"projects/{pid}/") or (name.startswith("assets/") and not name.casefold().startswith("assets/brand/"))):
        raise ValueError("Source archive may only contain this project and its non-brand assets")
    return name


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)


def has_credentials(value) -> bool:
    if isinstance(value, dict):
        return any((str(k).lower() in CREDENTIAL_FIELDS and isinstance(v, str) and v.strip()) or has_credentials(v) for k, v in value.items())
    if isinstance(value, list):
        return any(has_credentials(v) for v in value)
    return False


def source_files(root: Path, pid: str) -> list[Path]:
    root = root.resolve()
    folder = root / "projects" / project_id(pid)
    if not folder.is_dir() or folder.is_symlink():
        raise ValueError(f"Local project not found: {pid}")
    files: set[Path] = set()
    references: set[str] = set()

    def add(path: Path):
        relative = path.relative_to(root).as_posix()
        if excluded(relative):
            return
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise ValueError("Source packages do not support symlinks")
        if path.is_dir():
            for child in sorted(path.iterdir()):
                add(child)
        elif path.is_file():
            safe_name(relative, pid)
            files.add(path)
            if path.suffix == ".json":
                data = json.loads(path.read_text(encoding="utf-8"))
                if has_credentials(data):
                    raise ValueError(f"Move credentials out of source file: {relative}")
                references.update(strings(data))
            elif path.suffix == ".py":
                try:
                    tree = ast.parse(path.read_text(encoding="utf-8"))
                    for node in ast.walk(tree):
                        if isinstance(node, (ast.Assign, ast.AnnAssign)) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str) and node.value.value.strip():
                            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                            if any(isinstance(target, ast.Name) and target.id.lower() in CREDENTIAL_FIELDS for target in targets):
                                raise ValueError(f"Move credentials out of source file: {relative}")
                    nodes = ast.walk(tree)
                    references.update(node.value for node in nodes if isinstance(node, ast.Constant) and isinstance(node.value, str))
                except SyntaxError:
                    pass
    add(folder)
    # Content references use paths relative to assets/. Explicit source_assets may name folders.
    settings = folder / "publication.json"
    explicit = json.loads(settings.read_text(encoding="utf-8")).get("source_assets", []) if settings.is_file() else []
    if not isinstance(explicit, list) or not all(isinstance(v, str) for v in explicit):
        raise ValueError("publication.json source_assets must be an array of asset paths")
    for name in sorted(references | set(explicit)):
        if name not in explicit and (len(name.encode()) > 1000 or any(len(p.encode()) > 240 for p in name.split("/")) or any(c in name for c in "\n\r<>*?|") or "://" in name):
            continue
        normalized = name if name.startswith("assets/") else "assets/" + name
        if "\n" in name or not normalized.startswith("assets/") or normalized.startswith("assets/brand/"):
            continue
        candidate = root / normalized
        if candidate.is_file() or name in explicit:
            safe_name(normalized, pid)
            if not candidate.exists():
                raise ValueError(f"Missing project source asset: {normalized}")
            add(candidate)
    if not files:
        raise ValueError(f"No editable sources in project: {pid}")
    return sorted(files)


def pack(root: Path, pid: str) -> bytes:
    root = root.resolve()
    files = source_files(root, pid)
    if len(files) > MAX_FILES or sum(p.stat().st_size for p in files) > MAX_BYTES:
        raise ValueError("Source package exceeds supported file count or expanded size")
    entries = {}
    data = {}
    for path in files:
        name = path.relative_to(root).as_posix()
        data[name] = path.read_bytes()
        entries[name] = {"sha256": hashlib.sha256(data[name]).hexdigest(), "bytes": len(data[name])}
    manifest = {"version": 1, "project": pid, "files": entries}
    data["manifest.json"] = json.dumps(manifest, ensure_ascii=False, sort_keys=True).encode()
    output = io.BytesIO()
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for name, body in sorted(data.items()):
            info = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            archive.writestr(info, body)
    return output.getvalue()


def unpack(data: bytes, root: Path, pid: str) -> dict:
    """Validate every byte and destination before installing any source file."""
    root = root.resolve()
    with ZipFile(io.BytesIO(data)) as archive, tempfile.TemporaryDirectory(prefix="davinci-source-restore-") as temp:
        infos = archive.infolist()
        names = [entry.filename for entry in infos]
        if len(names) != len(set(n.casefold() for n in names)) or len(names) > MAX_FILES + 1:
            raise ValueError("Duplicate paths or too many files in source package")
        if "manifest.json" not in names:
            raise ValueError("Missing source manifest")
        if sum(entry.file_size for entry in infos) > MAX_BYTES or archive.getinfo("manifest.json").file_size > 8 * 1024**2:
            raise ValueError("Source package exceeds supported expanded size")
        manifest = json.loads(archive.read("manifest.json"))
        entries = manifest.get("files") if isinstance(manifest, dict) else None
        if not isinstance(manifest, dict) or manifest.get("version") != 1 or manifest.get("project") != project_id(pid) or not isinstance(entries, dict) or not entries:
            raise ValueError("Invalid source manifest")
        if set(names) != {*entries, "manifest.json"}:
            raise ValueError("Source archive files do not match its manifest")
        staged = []
        for name, expected in entries.items():
            safe_name(name, pid)
            info = archive.getinfo(name)
            mode = stat.S_IFMT(info.external_attr >> 16)
            if mode not in {0, stat.S_IFREG} or not isinstance(expected, dict) or expected.get("bytes") != info.file_size:
                raise ValueError("Invalid source file metadata")
            target = root / name
            if target.is_symlink() or any(p.is_symlink() for p in target.parents if p != root.parent) or not target.resolve().is_relative_to(root):
                raise ValueError("Source destination contains a symlink or escapes the workspace")
            content = archive.read(name)
            if hashlib.sha256(content).hexdigest() != expected.get("sha256"):
                raise ValueError(f"Source checksum mismatch: {name}")
            if target.exists():
                if not target.is_file() or target.read_bytes() != content:
                    raise ValueError(f"Local edits preserved; source destination already differs: {name}")
                continue
            temporary = Path(temp) / str(len(staged))
            temporary.write_bytes(content)
            staged.append((temporary, target))
        installed = []
        try:
            for temporary, target in staged:
                target.parent.mkdir(parents=True, exist_ok=True)
                # Exclusive creation prevents overwriting a file created after preflight.
                with target.open("xb") as stream:
                    installed.append(target)
                    with temporary.open("rb") as source:
                        shutil.copyfileobj(source, stream)
        except Exception:
            for target in reversed(installed):
                target.unlink(missing_ok=True)
            raise
        return manifest


def read_index(store: Storage) -> tuple[dict, bytes | None]:
    original = store.read(INDEX)
    value = json.loads(original) if original is not None else {"version": 1, "projects": {}}
    if not isinstance(value, dict) or value.get("version") != 1 or not isinstance(value.get("projects"), dict):
        raise ValueError("Invalid R2 project source catalog")
    for pid, entry in value["projects"].items():
        project_id(pid)
        version = entry.get("sha256", "") if isinstance(entry, dict) else ""
        if not re.fullmatch(r"[a-f0-9]{64}", version) or entry.get("key") != f"{PREFIX}{pid}/{version}.zip":
            raise ValueError("Invalid R2 source catalog entry")
        versions = entry.get("versions")
        if not isinstance(versions, list) or version not in versions or any(not isinstance(v, str) or not re.fullmatch(r"[a-f0-9]{64}", v) for v in versions):
            raise ValueError("Invalid R2 source version history")
    return value, original


def push(root: Path, pid: str, store: Storage) -> dict:
    pid = project_id(pid)
    data = pack(root, pid)
    digest = hashlib.sha256(data).hexdigest()
    catalog, before = read_index(store)
    previous = catalog["projects"].get(pid)
    marker = root / "projects" / pid / ".r2-source.json"
    if previous and previous["sha256"] != digest:
        known = json.loads(marker.read_text()) if marker.is_file() else {}
        if known.get("sha256") != previous["sha256"]:
            raise ValueError("Remote sources have changed; pull the current version into a separate workspace and merge your edits first")
    key = f"{PREFIX}{pid}/{digest}.zip"
    store.write(key, data, "application/zip")
    remote = store.read(key)
    if remote is None or hashlib.sha256(remote).hexdigest() != digest:
        raise ValueError("R2 source archive verification failed; catalog was not updated")
    # Exercise the same restoration path used by a fresh checkout before promoting a version.
    with tempfile.TemporaryDirectory(prefix="davinci-source-roundtrip-") as temp:
        manifest = unpack(remote, Path(temp), pid)
    content = root / "projects" / pid / "content.json"
    title = json.loads(content.read_text(encoding="utf-8")).get("title", pid) if content.is_file() else pid
    versions = list((previous or {}).get("versions", []))
    if digest not in versions:
        versions.append(digest)
    entry = {"sha256": digest, "key": key, "title": title, "files": len(manifest["files"]), "versions": versions,
             "updated_at": datetime.now(timezone.utc).isoformat()}
    if store.read(INDEX) != before:
        raise ValueError("Source catalog changed during upload; retry without overwriting another publisher")
    if before is not None:
        store.write(f"{PREFIX}history/{uuid4().hex}.json", before, "application/json")
    catalog["projects"][pid] = entry
    store.write(INDEX, json.dumps(catalog, ensure_ascii=False, indent=2).encode(), "application/json")
    confirmed, _ = read_index(store)
    if confirmed["projects"].get(pid) != entry:
        raise ValueError("R2 source catalog verification failed")
    marker.write_text(json.dumps({"sha256": digest}) + "\n", encoding="utf-8")
    return entry


def pull(root: Path, pid: str, store: Storage, version: str | None = None) -> dict:
    pid = project_id(pid)
    catalog, _ = read_index(store)
    entry = catalog["projects"].get(pid)
    if not entry:
        raise ValueError(f"Project not found in R2: {pid}")
    version = version or entry["sha256"]
    if not re.fullmatch(r"[a-f0-9]{64}", version) or version not in entry["versions"]:
        raise ValueError("Unknown source version")
    data = store.read(f"{PREFIX}{pid}/{version}.zip")
    if data is None or hashlib.sha256(data).hexdigest() != version:
        raise ValueError("R2 source archive checksum mismatch")
    manifest = unpack(data, root, pid)
    (root / "projects" / pid / ".r2-source.json").write_text(json.dumps({"sha256": version}) + "\n", encoding="utf-8")
    return manifest


def configure_parser(parser):
    parser.add_argument("--workspace", type=Path, default=ROOT, help="Workspace root; defaults to this checkout")
    parser.add_argument("--bucket", default=os.environ.get("R2_BUCKET", "davinci-learning-library"))
    commands = parser.add_subparsers(dest="operation", required=True)
    listing = commands.add_parser("list", help="List editable projects in R2")
    listing.add_argument("--versions", action="store_true")
    for name in ["push", "pull"]:
        command = commands.add_parser(name)
        command.add_argument("project")
        if name == "pull":
            command.add_argument("--version", help="Restore a previous SHA-256 version")
    return parser


def run(args):
    store = WranglerStorage(args.bucket)
    if args.operation == "list":
        catalog, _ = read_index(store)
        for pid, entry in sorted(catalog["projects"].items()):
            print(f"{pid}\t{entry['title']}\t{entry['sha256']}")
            if args.versions:
                for version in entry["versions"]:
                    print(f"  {version}")
    elif args.operation == "push":
        entry = push(args.workspace.resolve(), args.project, store)
        print(f"Saved and restored successfully: {args.project}, {entry['files']} files, version {entry['sha256']}")
    else:
        manifest = pull(args.workspace.resolve(), args.project, store, args.version)
        print(f"Ready to edit: {args.workspace.resolve() / 'projects' / args.project} ({len(manifest['files'])} files)")


def main(argv=None):
    run(configure_parser(argparse.ArgumentParser(description=__doc__)).parse_args(argv))
