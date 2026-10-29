"""Publish prepared lessons to R2, then atomically merge the public catalog.

Credentials are read only from environment variables. Website builds never run this.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import mimetypes
import os
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
CATALOG = "library/catalog.json"
ALLOWED = {".html", ".css", ".js", ".jpg", ".jpeg", ".png", ".webp", ".svg", ".ttf", ".woff", ".woff2", ".vtt", ".mp4", ".txt", ".pptx", ".zip"}


def validate_catalog(value: object) -> list[dict]:
    if not isinstance(value, list):
        raise ValueError("Catalog must be an array")
    ids = set()
    for item in value:
        if not isinstance(item, dict) or not re.fullmatch(r"[a-zA-Z0-9_-]+", item.get("id", "")):
            raise ValueError("Invalid catalog project ID")
        if item["id"] in ids:
            raise ValueError("Duplicate catalog project ID")
        ids.add(item["id"])
        if not isinstance(item.get("title"), str) or not isinstance(item.get("chapters"), list):
            raise ValueError("Invalid catalog metadata")
    return value


def package_files(directory: Path) -> tuple[list[dict], list[Path]]:
    """Preflight the complete public package before any remote write."""
    if directory.is_symlink():
        raise ValueError("Publication directory must not be a symlink")
    catalog = validate_catalog(json.loads((directory / "catalog.json").read_text(encoding="utf-8")))
    if not catalog:
        raise ValueError("Refusing to publish an empty package")
    files = []
    for path in sorted(directory.rglob("*")):
        relative = path.relative_to(directory)
        if path.is_symlink():
            raise ValueError("Publication package contains a symlink")
        if not path.is_file() or relative.parts[0] == "brand" or relative.as_posix() == "catalog.json":
            continue
        if relative.parts[0] not in {"media", "exports"} or path.suffix.lower() not in ALLOWED or any(part.startswith(".") for part in relative.parts):
            raise ValueError(f"Unsupported publication asset: {relative}")
        files.append(path)
    available = {"library/" + path.relative_to(directory).as_posix() for path in files}
    for item in catalog:
        links = [item.get(name) for name in ("poster", "deck", "powerpoint", "video")]
        links.extend(item.get("scorm", {}).values())
        for link in filter(None, links):
            if not isinstance(link, str) or link not in available:
                raise ValueError(f"Missing catalog asset for {item['id']}")
    return catalog, files


def _read_catalog(client, bucket: str) -> tuple[list[dict], str | None]:
    try:
        result = client.get_object(Bucket=bucket, Key=CATALOG)
    except Exception as error:
        code = getattr(error, "response", {}).get("Error", {}).get("Code")
        if code in {"NoSuchKey", "404"}:
            return [], None
        raise
    try:
        return validate_catalog(json.loads(result["Body"].read())), result["ETag"]
    finally:
        result["Body"].close()


def publish(directory: Path, client, bucket: str, *, workers: int = 4) -> dict:
    catalog, files = package_files(directory)
    previous, etag = _read_catalog(client, bucket)
    release = uuid4().hex
    prefix = f"library/releases/{release}/"

    def upload(path: Path) -> dict:
        key = prefix + path.relative_to(directory).as_posix()
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        expected = digest.hexdigest()
        content_type = {".vtt": "text/vtt", ".js": "text/javascript", ".ttf": "font/ttf"}.get(path.suffix, mimetypes.guess_type(path.name)[0] or "application/octet-stream")
        client.upload_file(str(path), bucket, key, ExtraArgs={
            "ContentType": content_type,
            "CacheControl": "public, max-age=31536000, immutable",
            "Metadata": {"sha256": expected},
        })
        # Verify actual remote bytes, including multipart uploads, before publishing links.
        remote = client.get_object(Bucket=bucket, Key=key)
        actual = hashlib.sha256()
        count = 0
        try:
            for chunk in iter(lambda: remote["Body"].read(1024 * 1024), b""):
                actual.update(chunk)
                count += len(chunk)
        finally:
            remote["Body"].close()
        if actual.hexdigest() != expected or count != path.stat().st_size:
            raise ValueError(f"Remote verification failed: {key}")
        return {"key": key, "sha256": expected, "bytes": count}

    with ThreadPoolExecutor(max_workers=workers) as pool:
        verified = list(pool.map(upload, files))
    updates = copy.deepcopy(catalog)
    for item in updates:
        for name in ("poster", "deck", "powerpoint", "video"):
            if item.get(name):
                item[name] = prefix + item[name].removeprefix("library/")
        item["scorm"] = {name: prefix + link.removeprefix("library/") for name, link in item.get("scorm", {}).items()}
    incoming = {item["id"]: item for item in updates}
    merged = [incoming.pop(item["id"], item) for item in previous] + list(incoming.values())
    # Retain the previous catalog for recovery. Assets are immutable and never deleted here.
    client.put_object(Bucket=bucket, Key=f"library/history/{release}.json",
                      Body=json.dumps(previous, ensure_ascii=False).encode(), ContentType="application/json")
    # A concurrent publisher must not overwrite another publisher's catalog update.
    condition = {"IfMatch": etag} if etag else {"IfNoneMatch": "*"}
    client.put_object(Bucket=bucket, Key=CATALOG,
                      Body=json.dumps(merged, ensure_ascii=False, indent=2).encode(),
                      ContentType="application/json", CacheControl="no-cache", **condition)
    return {"bucket": bucket, "release": release, "projects": [item["id"] for item in updates], "files": verified}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=ROOT / "learning-library/output/content/library")
    parser.add_argument("--bucket", default=os.environ.get("R2_BUCKET", "davinci-learning-library"))
    parser.add_argument("--dry-run", action="store_true", help="Validate and report without credentials or network")
    args = parser.parse_args()
    catalog, files = package_files(args.directory)
    print(f"Publication package: {len(catalog)} lessons, {len(files)} files, {sum(p.stat().st_size for p in files) / 1024**2:.1f} MiB")
    if args.dry_run:
        return
    required = ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise ValueError("Set private environment variables: " + ", ".join(missing))
    import boto3
    from botocore.config import Config
    client = boto3.client("s3", region_name="auto",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"], aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(request_checksum_calculation="when_required", response_checksum_validation="when_required"))
    receipt = publish(args.directory, client, args.bucket)
    receipts = ROOT / "learning-library/output/r2"
    receipts.mkdir(parents=True, exist_ok=True)
    path = receipts / (receipt["release"] + ".json")
    path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(f"Published and verified {len(receipt['files'])} assets. Receipt: {path}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, ImportError) as error:
        raise SystemExit(str(error))
    except Exception as error:
        code = getattr(error, "response", {}).get("Error", {}).get("Code", type(error).__name__)
        raise SystemExit(f"R2 publication did not complete ({code}). Check the remote catalog before retrying.")
