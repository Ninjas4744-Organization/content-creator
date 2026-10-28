"""Shared 1280×720 geometry for editable PowerPoint, HTML and animation."""
from __future__ import annotations

import functools
import re
from PIL import Image, ImageFont
from bidi.algorithm import get_display
from .common import ASSETS

W, H = 1280, 720
WHITE, GOLD, BLUE, INK = "FAFCFF", "FFDA9D", "A9D8F6", "102742"


@functools.lru_cache(200)
def font(size, bold=False):
    return ImageFont.truetype(str(ASSETS / "brand" / ("Rubik-Bold.ttf" if bold else "Rubik-Regular.ttf")), int(size))


def width(text, size, bold=False):
    return font(size, bold).getlength(get_display(text))


def wrapped(text, size, max_width, bold=False):
    lines = []
    for paragraph in text.split("\n"):
        line = ""
        for word in paragraph.split():
            candidate = f"{line} {word}".strip()
            if line and width(candidate, size, bold) > max_width:
                lines.append(line)
                line = word
            else:
                line = candidate
        lines.append(line)
    return "\n".join(lines)


def textbox(text, x, y, w, h, size=32, bold=False, color=WHITE, align="right", delay=0):
    while size >= 18:
        content = wrapped(text, size, w - 4, bold)
        if len(content.split("\n")) * size * 1.25 <= h and all(width(line, size, bold) <= w for line in content.split("\n")):
            break
        size -= 1
    if size < 18:
        raise ValueError(f"Too much text for the layout; shorten this text: {text[:90]}")
    return dict(kind="text", text=content, x=x, y=y, w=w, h=h, size=size,
                bold=bold, color=color, align=align, delay=delay,
                rtl=bool(re.search(r"[\u0590-\u05ff]", text)))


def image(name, x, y, w, h, delay=0, crop=None, preview_frame=0):
    if crop:
        with Image.open(ASSETS / name) as source:
            visible_w = source.width * (1-crop.get("left", 0)-crop.get("right", 0))
            visible_h = source.height * (1-crop.get("top", 0)-crop.get("bottom", 0))
        ratio = min(w/visible_w, h/visible_h)
        x, y = x+(w-visible_w*ratio)/2, y+(h-visible_h*ratio)/2
        w, h = visible_w*ratio, visible_h*ratio
    return dict(kind="image", src=name, x=x, y=y, w=w, h=h, delay=delay,
                crop=crop or {}, preview_frame=preview_frame)


def line(x, y, x2, y2, color=BLUE, delay=0):
    return dict(kind="line", x=x, y=y, x2=x2, y2=y2, color=color, delay=delay)


def elements(scene, index, total):
    layout = scene.get("layout", "cards")
    if layout == "video":
        return [textbox(scene["title"], 150, 115, 980, 110, 50, True, align="center", delay=.1),
                dict(kind="play", x=552, y=272, w=176, h=176, color=GOLD, delay=.3),
                textbox("לחצו לניגון הסרטון במסך מלא", 280, 465, 720, 75, 30, color=BLUE, align="center", delay=.5)]
    if layout == "cover":
        if scene.get("brand_as_subtitle"):
            return [image("brand/logo.png", 100, 195, 290, 292, .2),
                    textbox(scene["title"], 450, 180, 730, 115, 66, True, delay=.4),
                    image("brand/wordmark.png", 570, 315, 610, 88, .8)]
        return [image("brand/logo.png", 100, 195, 290, 292, .2),
                textbox(scene["title"], 450, 115, 730, 205, 66, True, delay=.4),
                textbox(scene.get("subtitle", ""), 450, 330, 730, 125, 32, color=GOLD, delay=.8),
                image("brand/wordmark.png", 690, 505, 490, 71, 1)]
    out = [image("brand/logo.png", 47, 39, 54, 55),
           textbox(scene["title"], 145, 52, 1030, 100, 53, True),
           line(105, 163, 1175, 163),
           image("brand/wordmark.png", 44, 666, 215, 31),
           textbox(f"{index+1:02d} / {total:02d}", 1085, 670, 95, 30, 18, color=BLUE, align="left")]
    if layout == "statement":
        out += [textbox(scene.get("subtitle", ""), 180, 230, 920, 185, 60, True, GOLD, "center", .4),
                textbox(scene.get("body", ""), 200, 440, 880, 150, 34, align="center", delay=.8)]
    elif layout == "photo":
        if scene.get("items"):
            media = scene.get("images") or [{"image": scene["image"], "crop": scene.get("image_crop", {}),
                                             "preview_frame": scene.get("image_preview_frame", 0)}]
            slot = 400/len(media)
            for i, entry in enumerate(media):
                out.append(image(entry["image"], 95, 216+i*slot, 440, slot-(16 if len(media)>1 else 0),
                                 .3+i*.15, crop=entry.get("crop"), preview_frame=entry.get("preview_frame", 0)))
            n = len(scene["items"])
            row_height = 435/n
            for i, item in enumerate(scene["items"]):
                y = 210+i*row_height
                out += [textbox(item["heading"], 600, y, 575, 48 if n==3 else 65, 31 if n==3 else 39,
                                True, GOLD, delay=.45+i*.3),
                        textbox(item.get("body", ""), 600, y+(54 if n==3 else 80), 575,
                                row_height-(62 if n==3 else 90), 25 if n==3 else 31, delay=.65+i*.3)]
            return out
        out.append(image(scene["image"], 95, 216, 525, 350, .3,
                         crop=scene.get("image_crop"), preview_frame=scene.get("image_preview_frame", 0)))
        out.append(textbox(scene.get("body", ""), 680, 230, 485, 335, 34, delay=.6))
        if scene.get("subtitle"):
            out.append(textbox(scene["subtitle"], 100, 588, 1060, 50, 25, color=GOLD, delay=1))
    elif layout == "timeline":
        items = scene["items"]
        n = len(items)
        if n > 4:
            for row in range(2):
                group = items[row*4:(row+1)*4]
                top = 205 + row*220
                out.append(line(125, top+45, 1155, top+45, GOLD, .2+row*.4))
                for col, item in enumerate(group):
                    cx = 1085 - col*290
                    delay = .3 + (row*4+col)*.12
                    out += [textbox(item.get("label", ""), cx-125, top, 250, 38, 23, True, GOLD, "center", delay),
                            textbox(item["heading"], cx-125, top+65, 250, 65, 28, True, align="center", delay=delay+.1),
                            textbox(item.get("body", ""), cx-125, top+133, 250, 75, 23, color=BLUE, align="center", delay=delay+.2)]
            return out
        centers = [1140 - (i+.5) * (1000/n) for i in range(n)]
        out.append(line(centers[-1], 286, centers[0], 286, GOLD, .2))
        for i, (item, cx) in enumerate(zip(items, centers)):
            w = 940/n
            out += [textbox(f"{i+1:02d}", cx-40, 240, 80, 65, 42, True, GOLD, "center", .4+i*.35),
                    textbox(item["heading"], cx-w/2, 349, w, 95, 33, True, align="center", delay=.6+i*.35),
                    textbox(item.get("body", ""), cx-w/2, 460, w, 150, 27, color=BLUE, align="center", delay=.8+i*.35)]
    else:
        items = scene["items"]
        n = len(items)
        if scene.get("icon_layout") == "columns":
            if n > 4:
                raise ValueError("Icon columns support up to four items")
            cw = 1080/n
            for i, item in enumerate(items):
                cx = 1180-(i+.5)*cw
                delay = .25+i*.2
                if item.get("image"):
                    out.append(image(item["image"], cx-66, 225, 132, 132, delay))
                out += [textbox(item["heading"], cx-cw/2+12, 385, cw-24, 64, 38,
                                True, GOLD, "center", delay+.15),
                        textbox(item.get("body", ""), cx-cw/2+12, 468, cw-24, 135, 29,
                                align="center", delay=delay+.3)]
            return out
        cols = n if n <= 3 else (2 if n == 4 else 3)
        rows = (n+cols-1)//cols
        cw, rh = 1080/cols, 440/rows
        for i, item in enumerate(items):
            col, row = i % cols, i // cols
            x, y = 1140-(col+1)*cw, 210+row*rh
            if col:
                out.append(line(x+cw+16, y+4, x+cw+16, y+rh-27, color=BLUE))
            heading_width = cw-35
            if item.get("image"):
                icon_size = 66 if rows > 1 else 78
                out.append(image(item["image"], x+cw-icon_size-20, y+2, icon_size, icon_size, .25+i*.35))
                heading_width -= icon_size+15
            out += [textbox(item["heading"], x+20, y, heading_width, 80 if rows==1 else 72, 39 if rows==1 else 32,
                            True, GOLD, delay=.35+i*.35),
                    textbox(item.get("body", ""), x+20, y+(100 if rows==1 else 82), cw-35,
                            rh-(115 if rows==1 else 95), 31 if rows==1 else 27, delay=.55+i*.35)]
    return out
