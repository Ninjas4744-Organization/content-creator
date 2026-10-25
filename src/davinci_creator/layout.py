"""Shared 1280×720 geometry for editable PowerPoint, HTML and animation."""
from __future__ import annotations

import functools
import re
from PIL import ImageFont
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


def image(name, x, y, w, h, delay=0):
    return dict(kind="image", src=name, x=x, y=y, w=w, h=h, delay=delay)


def line(x, y, x2, y2, color=BLUE, delay=0):
    return dict(kind="line", x=x, y=y, x2=x2, y2=y2, color=color, delay=delay)


def elements(scene, index, total):
    layout = scene.get("layout", "cards")
    if layout == "cover":
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
        out.append(image(scene["image"], 95, 216, 525, 350, .3))
        out.append(textbox(scene.get("body", ""), 680, 230, 485, 335, 34, delay=.6))
        if scene.get("subtitle"):
            out.append(textbox(scene["subtitle"], 100, 588, 1060, 50, 25, color=GOLD, delay=1))
    elif layout == "timeline":
        items = scene["items"]
        n = len(items)
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
        cols = n if n <= 3 else (2 if n == 4 else 3)
        rows = (n+cols-1)//cols
        cw, rh = 1080/cols, 440/rows
        for i, item in enumerate(items):
            col, row = i % cols, i // cols
            x, y = 1140-(col+1)*cw, 210+row*rh
            if col:
                out.append(line(x+cw+16, y+4, x+cw+16, y+rh-27, color=BLUE))
            out += [textbox(item["heading"], x+20, y, cw-35, 80 if rows==1 else 72, 39 if rows==1 else 32,
                            True, GOLD, delay=.35+i*.35),
                    textbox(item.get("body", ""), x+20, y+(100 if rows==1 else 82), cw-35,
                            rh-(115 if rows==1 else 95), 31 if rows==1 else 27, delay=.55+i*.35)]
    return out
