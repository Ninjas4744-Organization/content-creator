from __future__ import annotations

import functools
import math
import random
from pathlib import Path
from PIL import Image, ImageDraw
from bidi.algorithm import get_display
from .common import ASSETS, local_file
from .layout import W, H, WHITE, GOLD, BLUE, font, elements, wrapped


@functools.lru_cache(64)
def picture(name):
    with Image.open(local_file(ASSETS, name)) as src:
        return src.convert("RGBA")


@functools.lru_cache(2)
def background(hero=False):
    return picture("brand/space-hero.png" if hero else "brand/space-content.png").resize((W, H))


def ease(value):
    return 1-(1-max(0, min(1, value)))**3


def draw_element(im, item, progress=1):
    if progress <= 0:
        return
    layer = Image.new("RGBA", im.size)
    d = ImageDraw.Draw(layer)
    dy = 22*(1-progress)
    if item["kind"] == "line":
        d.line((item["x"], item["y"], item["x"]+(item["x2"]-item["x"])*progress,
                item["y"]+(item["y2"]-item["y"])*progress), fill="#"+item["color"], width=1)
    elif item["kind"] == "play":
        x, y, w, h = item["x"], item["y"]+dy, item["w"], item["h"]
        d.ellipse((x, y, x+w, y+h), outline="#"+item["color"], width=3)
        d.polygon([(x+w*.4, y+h*.28), (x+w*.4, y+h*.72), (x+w*.73, y+h*.5)], fill="#"+item["color"])
    elif item["kind"] == "image":
        src = picture(item["src"])
        ratio = min(item["w"]/src.width, item["h"]/src.height)
        src = src.resize((round(src.width*ratio), round(src.height*ratio)), Image.Resampling.LANCZOS)
        x = item["x"]+(item["w"]-src.width)/2
        y = item["y"]+(item["h"]-src.height)/2+dy
        layer.alpha_composite(src, (round(x), round(y)))
    else:
        f = font(item["size"], item["bold"])
        for i, text in enumerate(item["text"].split("\n")):
            visual = get_display(text)
            length = f.getlength(visual)
            x = item["x"] + (item["w"]-length if item["align"]=="right" else (item["w"]-length)/2 if item["align"]=="center" else 0)
            y = item["y"]+i*item["size"]*1.25+dy
            d.text((x, y), visual, font=f, fill="#"+item["color"], anchor="lt")
    if progress < 1:
        layer.putalpha(layer.getchannel("A").point(lambda a: round(a*progress)))
    im.alpha_composite(layer)


_rng = random.Random(4744)
STARS = [(_rng.uniform(0,W), _rng.uniform(0,H), _rng.uniform(.5,1.5), _rng.random()*6.28) for _ in range(65)]


def frame(scene, index, total, t=None, caption=None):
    im = Image.new("RGBA", (W, H), "#000000") if scene.get("layout") == "video" else background(scene.get("layout")=="cover").copy()
    if t is not None:
        layer = Image.new("RGBA", im.size)
        d = ImageDraw.Draw(layer)
        for x,y,r,phase in STARS:
            x = (x+t*(3+r)) % W
            y += math.sin(t*.6+phase)*6
            d.ellipse((x-r,y-r,x+r,y+r), fill=(255,255,255,round(50+40*math.sin(t+phase))))
        # Slow orbit and moving gold point remain outside the text area.
        a = t*.16
        d.arc((-100,-140,370,320), 0, 320, fill=(169,216,246,40), width=1)
        x,y = 135+235*math.cos(a),90+230*math.sin(a)
        d.ellipse((x-4,y-4,x+4,y+4), fill=(255,218,157,170))
        im.alpha_composite(layer)
    for item in elements(scene,index,total):
        draw_element(im,item,1 if t is None else ease((t-item["delay"])/.65))
    if caption:
        d = ImageDraw.Draw(im)
        lines = wrapped(caption,24,1100).split("\n")
        y = H-38-len(lines)*31
        d.rounded_rectangle((55,y-12,W-55,H-18),radius=12,fill=(9,23,43,240))
        for i,line in enumerate(lines):
            d.text((W/2,y+i*31),get_display(line),font=font(24),anchor="mt",fill="#"+WHITE)
    return im.convert("RGB")


def storyboard(doc, out: Path):
    out.mkdir(parents=True,exist_ok=True)
    scenes=doc["scenes"]
    contact=Image.new("RGB",(1280,180*math.ceil(len(scenes)/4)),"#102742")
    for i,s in enumerate(scenes):
        im=frame(s,i,len(scenes))
        im.save(out/f"slide-{i+1:02d}.png")
        contact.paste(im.resize((320,180)),((i%4)*320,(i//4)*180))
    contact.save(out/"storyboard.jpg",quality=92)
