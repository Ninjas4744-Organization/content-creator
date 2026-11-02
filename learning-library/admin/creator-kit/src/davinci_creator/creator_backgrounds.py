"""Select a managed background and retain immutable local assets with the project."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import tempfile


def validate_backgrounds(document):
    values = document.get("backgrounds")
    if not isinstance(values, list) or not 1 <= len(values) <= 100:
        raise ValueError("No active background library was returned. Update the site/kit or explicitly select the bundled background with --offline.")
    seen = set()
    for background in values:
        if not isinstance(background, dict) or not isinstance(background.get("id"), str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,119}", background["id"]) or background["id"] in seen:
            raise ValueError("Invalid background ID")
        seen.add(background["id"])
        if background.get("enabled") is not True or any(not isinstance(background.get(key), str) or not background[key].strip() for key in ["name", "description"]):
            raise ValueError("Invalid background metadata")
        for asset in [background.get("image"), background.get("coverImage")]:
            if asset is None and background.get("image") is not None:
                continue
            if not isinstance(asset, dict) or not isinstance(asset.get("file"), str) or not re.fullmatch(r"[a-f0-9]{64}\.(png|jpg)", asset["file"]) or asset.get("sha256") != asset["file"][:64]:
                raise ValueError("Invalid background asset")
            if asset.get("contentType") != ("image/png" if asset["file"].endswith(".png") else "image/jpeg") or type(asset.get("size")) is not int or not 0 < asset["size"] <= 8 * 1024**2 or any(type(asset.get(key)) is not int or not 0 < asset[key] <= 8192 for key in ["width", "height"]) or asset["width"] * asset["height"] > 32_000_000:
                raise ValueError("Invalid background image metadata")
    return values


def select_background(api, root, pid, background_id, reason, *, offline=False):
    root = Path(root).resolve()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,119}", pid) or not isinstance(reason, str) or not reason.strip() or len(reason) > 2000:
        raise ValueError("Choose a project and record why this background fits its content")
    project = root / "projects" / pid
    content = project / "content.json"
    if not content.is_file() or any(path.is_symlink() for path in [project, project.parent, content]):
        raise ValueError("Create or restore the project first; project symlinks are not supported")
    document = json.loads((root / "assets/brand/backgrounds.json").read_text(encoding="utf-8")) if offline else api.request("/creator/source-library")
    background = next((entry for entry in validate_backgrounds(document) if entry["id"] == background_id), None)
    if background is None:
        raise ValueError("Choose a background ID from the current active library")
    assets = [background["image"], background.get("coverImage", background["image"])]
    downloads = {}
    folder = root / "assets/backgrounds"
    if (root / "assets").is_symlink() or folder.is_symlink():
        raise ValueError("Background destinations cannot be symlinks")
    for asset in assets:
        target = folder / asset["file"]
        if target.is_symlink():
            raise ValueError("Background destination cannot be a symlink")
        if target.exists():
            data = target.read_bytes()
        elif offline:
            candidates = [path for path in (root / "assets/brand").glob("*.png") if not path.is_symlink() and path.stat().st_size == asset["size"]]
            data = next((path.read_bytes() for path in candidates if hashlib.sha256(path.read_bytes()).hexdigest() == asset["sha256"]), b"")
        else:
            data = api.request("/creator/background-assets/" + asset["file"], binary=True)
        if len(data) != asset["size"] or hashlib.sha256(data).hexdigest() != asset["sha256"]:
            raise ValueError("Background checksum mismatch; local edits and project selection were preserved")
        if not (data.startswith(b"\x89PNG\r\n\x1a\n") if asset["contentType"] == "image/png" else data.startswith(b"\xff\xd8") and data.endswith(b"\xff\xd9")):
            raise ValueError("Downloaded background is not a PNG or JPEG")
        downloads[target] = data
    selection = {"id": background["id"], "name": background["name"], "description": background["description"], "image": "backgrounds/" + assets[0]["file"], "coverImage": "backgrounds/" + assets[1]["file"], "selectionReason": reason.strip(), "sourceRevision": document.get("revision", "bundled"), "source": "bundled" if offline else "site"}
    current = json.loads(content.read_text(encoding="utf-8"))
    current["background"] = selection
    folder.mkdir(parents=True, exist_ok=True)
    for target, data in downloads.items():
        if not target.exists():
            with target.open("xb") as stream:
                stream.write(data)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=project, delete=False) as temporary:
        json.dump(current, temporary, ensure_ascii=False, indent=2)
        temporary.write("\n")
    os.replace(temporary.name, content)
    return {"project": pid, "background": selection}
