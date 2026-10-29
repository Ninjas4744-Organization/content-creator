"""Publish selected library packages with an existing Wrangler login.

No credentials are exported. Run one catalog publisher at a time: the CLI can
detect a changed catalog but does not expose an atomic conditional object put.
Use publish_library.py with S3 credentials for concurrent publishers.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import re
import subprocess
import tempfile
from uuid import uuid4

from publish_library import CATALOG, ROOT, package_files, validate_catalog


class WranglerLibrary:
    def __init__(self, bucket: str):
        self.bucket = bucket
        self.cwd = ROOT / "learning-library/cloudflare"
        self.command = self.cwd / "node_modules/wrangler/bin/wrangler.js"
        if not self.command.is_file():
            raise ValueError("Install Cloudflare tools: npm --prefix learning-library/cloudflare ci")

    def _run(self, operation: str, key: str, path: Path, content_type: str = "") -> bool:
        if not re.fullmatch(r"library/(?:catalog\.json|(?:releases|history)/[a-f0-9]{32}(?:\.json|/[A-Za-z0-9_./-]+))", key) or any(p in {".", ".."} for p in key.split("/")):
            raise ValueError("Invalid library storage key")
        logs = ROOT / "outputs/r2"
        logs.mkdir(parents=True, exist_ok=True)
        environment = {**os.environ, "WRANGLER_SEND_METRICS": "false", "WRANGLER_LOG_PATH": str(logs / "library-publication.log")}
        args = ["node", str(self.command), "r2", "object", operation, f"{self.bucket}/{key}", "--remote", "--file", str(path)]
        if operation == "put":
            cache = "public, max-age=31536000, immutable" if key.startswith("library/releases/") else "no-cache"
            args += ["--content-type", content_type, "--cache-control", cache]
        result = subprocess.run(args, cwd=self.cwd, env=environment, capture_output=True, text=True)
        if not result.returncode:
            return True
        if operation == "get" and "the specified key does not exist" in result.stderr.lower():
            return False
        raise RuntimeError(f"R2 {operation} failed. Check Wrangler login and bucket permissions.")

    def read(self, key: str) -> bytes | None:
        with tempfile.TemporaryDirectory(prefix="davinci-library-read-") as temporary:
            path = Path(temporary) / "object"
            return path.read_bytes() if self._run("get", key, path) else None

    def write(self, key: str, data: bytes, content_type: str) -> None:
        with tempfile.TemporaryDirectory(prefix="davinci-library-write-") as temporary:
            path = Path(temporary) / "object"
            path.write_bytes(data)
            self._run("put", key, path, content_type)


def publish(directory: Path, storage) -> dict:
    selected, files = package_files(directory)
    before = storage.read(CATALOG)
    previous = validate_catalog(json.loads(before)) if before is not None else []
    release = uuid4().hex
    prefix = f"library/releases/{release}/"
    verified = []
    for path in files:
        key = prefix + path.relative_to(directory).as_posix()
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        storage.write(key, data, mimetypes.guess_type(path.name)[0] or "application/octet-stream")
        remote = storage.read(key)
        if remote is None or len(remote) != len(data) or hashlib.sha256(remote).hexdigest() != digest:
            raise ValueError(f"Remote verification failed: {key}")
        verified.append({"key": key, "sha256": digest, "bytes": len(data)})
    updates = json.loads(json.dumps(selected))
    for item in updates:
        for name in ("poster", "deck", "powerpoint", "video"):
            if item.get(name):
                item[name] = prefix + item[name].removeprefix("library/")
        item["scorm"] = {name: prefix + link.removeprefix("library/") for name, link in item.get("scorm", {}).items()}
    incoming = {item["id"]: item for item in updates}
    merged = [incoming.pop(item["id"], item) for item in previous] + list(incoming.values())
    if storage.read(CATALOG) != before:
        raise ValueError("Catalog changed during publication; existing lessons were not overwritten")
    storage.write(f"library/history/{release}.json", json.dumps(previous, ensure_ascii=False).encode(), "application/json")
    if storage.read(CATALOG) != before:
        raise ValueError("Catalog changed before promotion; existing lessons were not overwritten")
    promoted = json.dumps(merged, ensure_ascii=False, indent=2).encode()
    storage.write(CATALOG, promoted, "application/json")
    if storage.read(CATALOG) != promoted:
        raise ValueError("Catalog verification failed; inspect the remote catalog before retrying")
    return {"release": release, "projects": [i["id"] for i in updates], "files": verified, "transport": "wrangler"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=ROOT / "learning-library/output/content/library")
    parser.add_argument("--bucket", default=os.environ.get("R2_BUCKET", "davinci-learning-library"))
    args = parser.parse_args()
    receipt = publish(args.directory, WranglerLibrary(args.bucket))
    receipts = ROOT / "learning-library/output/r2"
    receipts.mkdir(parents=True, exist_ok=True)
    path = receipts / f"{receipt['release']}.json"
    path.write_text(json.dumps({"bucket": args.bucket, **receipt}, indent=2) + "\n")
    print(f"Published and verified {len(receipt['files'])} assets. Receipt: {path}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError) as error:
        raise SystemExit(str(error))
