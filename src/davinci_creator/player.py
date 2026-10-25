"""Offline interactive player: chapters, searchable transcript, checkpoints, VTT."""
from __future__ import annotations

import html
import json
import os
import shutil
from pathlib import Path
from .common import ASSETS


def vtt(timeline):
    def stamp(t):
        ms=round(t*1000)
        return f"{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d}.{ms%1000:03d}"
    entries=["WEBVTT\n"]
    for s in timeline["scenes"]:
        captions=s.get("captions",[])
        for i,caption in enumerate(captions):
            start=s["start"]+s.get("voice_offset",0)+i*s["voice_duration"]/len(captions)
            end=s["start"]+s.get("voice_offset",0)+(i+1)*s["voice_duration"]/len(captions)
            entries.append(f"{stamp(start)} --> {stamp(end)}\n{caption.replace('-->','→')}\n")
    return "\n".join(entries)


def build_player(timeline,video:Path,out:Path,*,link_video=False):
    if not video.is_file():
        raise ValueError(f"Video not found: {video}")
    scenes=timeline["scenes"]
    if any(not isinstance(s.get("start"),(int,float)) or not isinstance(s.get("duration"),(int,float)) for s in scenes):
        raise ValueError("Player requires a rendered timeline with scene start and duration")
    out.mkdir(parents=True,exist_ok=True)
    if not link_video and video.resolve()!=(out/"video.mp4").resolve():
        shutil.copy2(video,out/"video.mp4")
    media=os.path.relpath(video.resolve(),out.resolve()).replace(os.sep,"/") if link_video else "video.mp4"
    if (video.parent/"poster.jpg").is_file():
        shutil.copy2(video.parent/"poster.jpg",out/"poster.jpg")
    else:
        from .render import frame
        frame(scenes[0],0,len(scenes)).save(out/"poster.jpg",quality=90)
    shutil.copy2(ASSETS/"brand/Rubik-Regular.ttf",out/"Rubik-Regular.ttf")
    shutil.copy2(ASSETS/"brand/Rubik-Bold.ttf",out/"Rubik-Bold.ttf")
    (out/"captions.vtt").write_text(vtt(timeline),encoding="utf-8")
    data=json.dumps({"title":timeline["title"],"scenes":scenes},ensure_ascii=False).replace("<","\\u003c")
    template=Path(__file__).with_name("player.html").read_text(encoding="utf-8")
    (out/"index.html").write_text(template.replace("__TITLE__",html.escape(timeline["title"])).replace("__DATA__",data).replace("__VIDEO__",html.escape(media,quote=True)),encoding="utf-8")
    print(f"Interactive player: {out/'index.html'}")
