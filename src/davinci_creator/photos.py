"""Import link-shared Google Photos albums without an account or API key.

This adapter reads the public album page's embedded JSON and pagination request.
Google's page format is undocumented; fail explicitly if it changes. Never execute
page scripts, read browser cookies, or export contributor/profile metadata.
"""
from __future__ import annotations

import base64
import hashlib
import html
import io
import json
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from PIL import Image, ImageDraw, ImageOps, UnidentifiedImageError

from .common import ASSETS, ROOT, write_json

PAGE_LIMIT = 16 * 1024 * 1024
IMAGE_LIMIT = 40 * 1024 * 1024
FORMAT_ERROR = "Google Photos album format changed or the link is unavailable. Check sharing or download photos manually."


def _allowed_url(url: str, media: bool = False) -> str:
    parts = urlsplit(url)
    host = parts.hostname or ""
    allowed = bool(re.fullmatch(r"lh[0-9]+\.googleusercontent\.com", host)) if media else host in {"photos.app.goo.gl", "photos.google.com"}
    if parts.scheme != "https" or not allowed or parts.username or parts.password or parts.port not in (None, 443):
        raise ValueError("Expected an HTTPS Google Photos album link or Google photo image URL")
    return url


class _Redirects(HTTPRedirectHandler):
    def __init__(self, media: bool):
        self.media = media

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _allowed_url(newurl, self.media)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _fetch(url: str, *, body: bytes | None = None, media: bool = False) -> tuple[bytes, str]:
    _allowed_url(url, media)
    headers = {"User-Agent": "Mozilla/5.0 (compatible; DaVinci4744PhotoImporter/1.0)"}
    if body is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8"
    limit = IMAGE_LIMIT if media else PAGE_LIMIT
    try:
        with build_opener(_Redirects(media)).open(Request(url, data=body, headers=headers), timeout=30) as response:
            _allowed_url(response.url, media)
            content = response.read(limit + 1)
            if len(content) > limit:
                raise ValueError("Google Photos response exceeds the download size limit")
            return content, response.url
    except HTTPError as error:
        raise ValueError(f"Google Photos returned HTTP {error.code}. Check that the shared link opens without signing in.") from None
    except (URLError, TimeoutError, OSError):
        raise ValueError("Could not reach Google Photos. Check your connection and retry.") from None


def albums() -> list[dict]:
    data = json.loads((ASSETS / "photo-albums.json").read_text(encoding="utf-8"))
    entries = data.get("albums")
    if data.get("version") != 1 or not isinstance(entries, list):
        raise ValueError("Expected a version: 1 photo-albums.json registry")
    seen = set()
    for entry in entries:
        if not isinstance(entry, dict) or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", entry.get("id", "")) or entry["id"] in seen:
            raise ValueError("Album ids must be unique lowercase names with hyphens")
        _allowed_url(entry["url"])
        seen.add(entry["id"])
    return entries


def source(name: str) -> tuple[str, str]:
    for album in albums():
        if name == album["id"]:
            return name, album["url"]
    _allowed_url(name)
    return "shared-" + hashlib.sha256(name.encode()).hexdigest()[:16], name


def _initial(page: str) -> tuple[list, str, list]:
    """Match the album callback to its own request instead of assuming ds:1."""
    for match in re.finditer(r"AF_initDataCallback\(\{key:\s*'([^']+)'[^\n]*?\bdata:\s*", page):
        try:
            data, _ = json.JSONDecoder().raw_decode(page, match.end())
            if not isinstance(data, list) or len(data) < 4 or not isinstance(data[3], list):
                continue
            request = re.search(re.escape("'" + match[1] + "'") + r"\s*:\s*\{id:\s*'([^']+)'[^}]*?request:\s*", page)
            if request:
                args, _ = json.JSONDecoder().raw_decode(page, request.end())
                if isinstance(args, list) and len(args) == 4:
                    return data, request[1], args
        except (ValueError, IndexError):
            continue
    raise ValueError(FORMAT_ERROR)


def _rpc_page(payload: str, rpc: str) -> list:
    # batchexecute uses an XSSI prefix and optional length lines around JSON frames.
    for line in payload.splitlines():
        if not line.startswith("["):
            continue
        try:
            for row in json.loads(line):
                if isinstance(row, list) and len(row) > 2 and row[:2] == ["wrb.fr", rpc] and isinstance(row[2], str):
                    return json.loads(row[2])
        except (ValueError, TypeError):
            continue
    raise ValueError("Could not read the next Google Photos page; the album was not fully imported.")


def catalog(name: str) -> dict:
    slug, url = source(name)
    raw, resolved = _fetch(url)
    parts = urlsplit(resolved)
    if parts.hostname != "photos.google.com" or not re.fullmatch(r"/share/[A-Za-z0-9_-]+/?", parts.path):
        raise ValueError("Use a link-shared album that opens without signing in")
    data, rpc, args = _initial(raw.decode("utf-8"))
    if not re.fullmatch(r"[A-Za-z0-9]+", rpc):
        raise ValueError(FORMAT_ERROR)
    if len(data[3]) < 2:
        raise ValueError(FORMAT_ERROR)
    title = data[3][1]
    total = data[3][21] if len(data[3]) > 21 else None
    if not isinstance(title, str) or args[0] != parts.path.rstrip("/").split("/")[-1]:
        raise ValueError(FORMAT_ERROR)
    key = parse_qs(parts.query).get("key", [None])[0]
    if not key or args[3] != key:
        raise ValueError(FORMAT_ERROR)
    entries, seen, tokens = [], set(), set()
    videos = 0
    for _ in range(1000):
        if not isinstance(data, list) or len(data) < 4 or not isinstance(data[1], (list, type(None))):
            raise ValueError(FORMAT_ERROR)
        for row in data[1] or []:
            try:
                photo_id, media = row[:2]
                base, width, height = media[:3]
                if not isinstance(photo_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", photo_id):
                    raise ValueError(FORMAT_ERROR)
                if photo_id in seen:
                    continue
                seen.add(photo_id)
                _allowed_url(base, media=True)
                if type(width) is not int or type(height) is not int or min(width, height) <= 0:
                    raise ValueError(FORMAT_ERROR)
                metadata = row[9] if len(row) > 9 and isinstance(row[9], dict) else {}
                if metadata.get("76647426") is not None or (len(media) > 7 and media[7] is not None):
                    videos += 1
                    continue
                photo_url = urlunsplit((parts.scheme, parts.netloc, parts.path.rstrip("/") + "/photo/" + photo_id, parts.query, ""))
                entries.append({"id": photo_id, "width": width, "height": height,
                                "base_url": base, "source_url": photo_url})
            except (TypeError, IndexError, AttributeError):
                raise ValueError(FORMAT_ERROR) from None
        token = data[2]
        if not token:
            break
        if not isinstance(token, str) or token in tokens:
            raise ValueError("Google Photos repeated a page token; the album was not fully imported.")
        tokens.add(token)
        args[1] = token
        body = urlencode({"f.req": json.dumps([[[rpc, json.dumps(args), None, "generic"]]])}).encode()
        payload, _ = _fetch("https://photos.google.com/_/PhotosUi/data/batchexecute?" + urlencode({"rpcids": rpc}), body=body)
        data = _rpc_page(payload.decode("utf-8"), rpc)
    else:
        raise ValueError("Google Photos pagination limit exceeded; the album was not fully imported.")
    warnings = []
    if type(total) is int and len(seen) != total:
        warnings.append(f"Google reports {total} items but returned {len(seen)} unique items across all pages. The catalog includes only the returned items.")
    return {"version": 1, "id": slug, "title": title, "source_url": url,
            "reported_item_count": total, "received_item_count": len(seen), "warnings": warnings,
            "photo_count": len(entries), "skipped_videos": videos, "photos": entries}


def gallery(album: dict, out: Path, *, local: bool = False) -> Path:
    """Write a selection gallery. Catalog thumbnails are remote; imports are local."""
    out.mkdir(parents=True, exist_ok=True)
    cards = []
    for photo in album["photos"]:
        if local:
            with Image.open(ASSETS / photo["image"]) as original:
                thumb = ImageOps.contain(original, (640, 480))
                buffer = io.BytesIO()
                thumb.save(buffer, "JPEG", quality=82)
            image = "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
        else:
            image = photo["base_url"] + "=w480-h360"
        label = photo.get("image", photo["id"])
        cards.append(f'<figure><a href="{html.escape(photo["source_url"], quote=True)}"><img loading="lazy" src="{html.escape(image, quote=True)}" alt=""></a>'
                     f'<figcaption><bdi>{html.escape(label)}</bdi><br><bdi dir="ltr">{photo["width"]} × {photo["height"]}</bdi><br>'
                     f'<code dir="ltr">--photo-id {html.escape(photo["id"])}</code></figcaption></figure>')
    note = "התמונות שמורות מקומית ומוכנות לשימוש." if local else "תצוגה מקוונת לבחירה; תמונות ממוזערות דורשות אינטרנט. ייבאו לפי מזהה התמונה."
    notices = "".join('<p dir="ltr">' + html.escape(warning) + '</p>' for warning in album.get("warnings", []))
    content = ('<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
               '<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex"><title>' + html.escape(album["title"]) + '</title>'
               '<style>body{background:#102742;color:white;font:16px system-ui;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}'
               'figure{margin:0;background:#183b5e;padding:12px;border-radius:8px}img{width:100%;height:220px;object-fit:contain}figcaption{overflow-wrap:anywhere}code{font-size:12px}</style>'
               '<h1>' + html.escape(album["title"]) + '</h1><p>' + note + '</p>' + notices + '<main>' + "".join(cards) + '</main></html>')
    (out / "index.html").write_text(content, encoding="utf-8")
    write_json(out / ("manifest.json" if local else "catalog.json"), album)
    return out / "index.html"


def import_photos(album: dict, out: Path, *, limit: int = 12, offset: int = 0,
                  photo_ids: list[str] | None = None, size: int = 2400) -> dict:
    if limit < 0 or offset < 0 or not 320 <= size <= 8000:
        raise ValueError("Use limit/offset >= 0 and size between 320 and 8000 pixels")
    selected = album["photos"]
    if photo_ids:
        wanted = set(photo_ids)
        selected = [photo for photo in selected if photo["id"] in wanted]
        if len(selected) != len(wanted):
            raise ValueError("One or more requested photo ids are absent from this album")
    else:
        selected = selected[offset:offset + limit] if limit else selected[offset:]
    if not selected:
        raise ValueError("No photos selected; check the album, offset and photo ids")
    folder = (ASSETS / "photos/albums" / album["id"]).resolve()
    if not folder.is_relative_to(ASSETS.resolve()):
        raise ValueError("Photo destination escapes assets")
    folder.mkdir(parents=True, exist_ok=True)
    manifest_path = folder / "manifest.json"
    if manifest_path.is_symlink():
        raise ValueError("Photo manifest must not be a symbolic link")
    previous = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"photos": []}
    if previous.get("source_url", album["source_url"]) != album["source_url"]:
        raise ValueError("Photo destination already belongs to a different album")
    cached = {photo["image"]: photo for photo in previous["photos"]}
    imported = []
    for photo in selected:
        digest = hashlib.sha256(photo["id"].encode()).hexdigest()[:24]
        path = folder / f"{digest}-{size}.jpg"
        image_path = path.relative_to(ASSETS.resolve()).as_posix()
        entry = cached.get(image_path)
        if path.is_symlink():
            raise ValueError("Photo destination must not be a symbolic link")
        if entry and path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == entry["sha256"]:
            imported.append(entry)
            continue
        if path.exists():
            raise ValueError(f"Existing photo differs from its cache record: {image_path}. Move it before retrying.")
        raw, _ = _fetch(photo["base_url"] + f"=w{size}-h{size}", media=True)
        try:
            with Image.open(io.BytesIO(raw)) as original:
                image = ImageOps.exif_transpose(original).convert("RGB")
                image.thumbnail((size, size), Image.Resampling.LANCZOS)
                # Re-encode for consistent PowerPoint support and remove EXIF/GPS.
                buffer = io.BytesIO()
                image.save(buffer, "JPEG", quality=92)
                width, height = image.size
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
            raise ValueError("Google Photos did not return a supported photo image") from None
        path.write_bytes(buffer.getvalue())
        entry = {"id": photo["id"], "image": image_path, "width": width, "height": height,
                 "source_url": photo["source_url"], "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
        imported.append(entry)
        cached[image_path] = entry
        # Checkpoint each photo so interrupted downloads can resume.
        write_json(manifest_path, {"version": 1, "source_url": album["source_url"], "photos": list(cached.values())})
    result = {key: value for key, value in album.items() if key != "photos"}
    result["photos"] = imported
    gallery(result, out, local=True)
    preview = imported[:48]
    columns = min(4, len(preview))
    sheet = Image.new("RGB", (columns * 320, ((len(preview) + columns - 1) // columns) * 220), "#102742")
    draw = ImageDraw.Draw(sheet)
    for index, photo in enumerate(preview):
        with Image.open(ASSETS / photo["image"]) as image:
            thumb = ImageOps.contain(image, (310, 190))
            x, y = (index % columns) * 320, (index // columns) * 220
            sheet.paste(thumb, (x + (320 - thumb.width) // 2, y))
            draw.text((x + 8, y + 195), f'{index + 1}: {Path(photo["image"]).name}', fill="white")
    sheet.save(out / "storyboard.jpg", quality=88)
    return result


def run(args) -> None:
    if args.photos_command == "albums":
        for album in albums():
            print(f'{album["id"]}: {album["title"]}\n  {album["url"]}')
        return
    album = catalog(args.album)
    for warning in album["warnings"]:
        print("Warning: " + warning)
    out = args.out or ROOT / "outputs/photo-albums" / album["id"]
    if args.photos_command == "catalog":
        gallery(album, out)
        print(f'{album["photo_count"]} photos; {album["skipped_videos"]} videos skipped. Selection gallery: {out / "index.html"}')
    else:
        result = import_photos(album, out, limit=args.limit, offset=args.offset, photo_ids=args.photo_id, size=args.size)
        print(f'Imported {len(result["photos"])} photos. Preview: {out / "index.html"}')
        for photo in result["photos"]:
            print(photo["image"])
