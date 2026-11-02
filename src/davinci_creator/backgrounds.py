"""Background selection shared by HTML, PowerPoint, previews and video."""
from __future__ import annotations

import functools
import re
from PIL import Image, ImageStat
from .common import ASSETS, local_file


def validate_background(doc):
    # Older source documents retain their original supplied space backgrounds.
    if "background" not in doc:
        return
    value = doc["background"]
    if not isinstance(value, dict) or not isinstance(value.get("id"), str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,119}", value["id"]):
        raise ValueError("Choose a background before rendering: creator_agent.py background <id> --project <project> --reason <why> (or select one in content.json).")
    if not isinstance(value.get("selectionReason"), str) or not value["selectionReason"].strip() or len(value["selectionReason"]) > 2000:
        raise ValueError("Record why the selected background fits the content in background.selectionReason")
    for field in ["image", "coverImage"]:
        name = value.get(field)
        if field == "coverImage" and name is None:
            continue
        if not isinstance(name, str) or not name or not name.lower().endswith((".png", ".jpg", ".jpeg")):
            raise ValueError("A background must reference a local PNG or JPEG asset")
        path = local_file(ASSETS, name)
        with Image.open(path) as image:
            if image.format not in {"PNG", "JPEG"} or image.width * image.height > 32_000_000:
                raise ValueError("Invalid background image")
            image.verify()


def background_name(selection=None, hero=False):
    if selection:
        return selection.get("coverImage", selection["image"]) if hero else selection["image"]
    return "brand/space-hero.png" if hero else "brand/space-content.png"


@functools.lru_cache(32)
def palette(name):
    with Image.open(local_file(ASSETS, name)) as source:
        image = source.convert("RGB")
        image = image.crop((image.width // 5, image.height // 5, image.width * 4 // 5, image.height * 4 // 5))
        average = ImageStat.Stat(image.resize((32, 32))).mean
    light = sum(value * weight for value, weight in zip(average, [.2126, .7152, .0722])) > 155
    return {"FAFCFF": "17333A", "FFDA9D": "715322", "A9D8F6": "42616C"} if light else {}


def themed_elements(scene, index, total, selection=None):
    from .layout import elements
    result = elements(scene, index, total)
    if not selection or scene.get("layout") == "video":
        return result
    colors = palette(background_name(selection, scene.get("layout") == "cover"))
    return [{**item, "color": colors.get(item.get("color"), item.get("color"))} if "color" in item else item for item in result]
