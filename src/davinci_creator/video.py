from __future__ import annotations

import concurrent.futures
import json
import math
import os
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image
from .common import write_json
from .tts import cached_voice,DEFAULT_MODEL
from .audio import SR,wav_read,caption_groups,score
from .render import frame,storyboard
from .layout import W,H


def ffmpeg():
    override=os.environ.get("FFMPEG_PATH")
    if override:
        return override
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def plan(doc,voices:Path,fps=30,draft=False,seconds=None,model=DEFAULT_MODEL):
    scenes=[];audio=[];elapsed=0
    for i,scene in enumerate(doc["scenes"]):
        if draft or not scene.get("narration"):
            samples=np.zeros(0,dtype=np.float32)
        else:
            path=cached_voice(scene,doc,voices,model)
            if path is None:
                raise ValueError(f"Missing/stale narration for {scene['id']}. Run tts, or use --draft for a clearly marked silent draft.")
            samples=wav_read(path)
        voice_duration=len(samples)/SR
        duration=(seconds or scene.get("duration",8)) if draft or not len(samples) else .85+voice_duration+1.0
        duration=math.ceil(duration*fps)/fps
        scenes.append({**scene,"index":i,"start":elapsed,"duration":duration,"voice_offset":.85,
                       "voice_duration":voice_duration,"captions":caption_groups(scene.get("narration","")) if len(samples) else []})
        audio.append(samples);elapsed+=duration
    return {**doc,"scenes":scenes,"duration":elapsed,"fps":fps,"draft":draft},audio


def scene_render(args):
    index,scene,total,previous,fps,width,out=args
    height=width*9//16
    if height%2:
        raise ValueError("Video dimensions must be even; use width 640, 1280 or 1920")
    output=out/f"scene-{index:03d}.mp4"
    temporary=out/f"scene-{index:03d}.partial.mp4"
    prior=frame(previous,index-1,total) if previous else None
    cmd=[ffmpeg(),"-hide_banner","-loglevel","error","-y","-f","rawvideo","-vcodec","rawvideo",
         "-pix_fmt","rgb24","-s",f"{width}x{height}","-r",str(fps),"-i","-","-an","-c:v","libx264",
         "-threads","2","-preset","fast","-crf","19","-pix_fmt","yuv420p","-movflags","+faststart",str(temporary)]
    process=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        for n in range(round(scene["duration"]*fps)):
            t=n/fps;caption=None
            local=t-scene["voice_offset"]
            if scene["captions"] and 0<=local<scene["voice_duration"]:
                j=min(len(scene["captions"])-1,int(local/scene["voice_duration"]*len(scene["captions"])))
                caption=scene["captions"][j]
            im=frame(scene,index,total,t,caption)
            if prior is not None and t<.5:
                # A crossfade plus moving gold edge connects scenes.
                im=Image.blend(prior,im,min(1,t/.5))
                from PIL import ImageDraw
                x=round(W*t/.5)
                ImageDraw.Draw(im).line((x,0,x,H),fill="#FFDA9D",width=3)
            if scene.get("_draft"):
                from PIL import ImageDraw
                ImageDraw.Draw(im).text((12,12),"DRAFT / NO NARRATION",fill="white")
            if width!=W:
                im=im.resize((width,height),Image.Resampling.LANCZOS)
            process.stdin.write(im.tobytes())
        process.stdin.close()
        error=process.stderr.read().decode()
        if process.wait():
            raise RuntimeError(error[-2000:])
        temporary.replace(output)
    except Exception:
        process.kill();process.wait();temporary.unlink(missing_ok=True)
        raise
    print(f"Rendered {index+1}/{total}: {scene['id']}",flush=True)
    return output


def render(doc,out:Path,voices:Path,*,fps=30,width=1280,workers=2,draft=False,seconds=None,limit=None,model=DEFAULT_MODEL):
    if width<320 or width%32 or not 1<=fps<=60 or not 1<=workers<=8:
        raise ValueError("Use width >=320 divisible by 32, fps 1–60, workers 1–8")
    if seconds is not None and not 1<=seconds<=600:
        raise ValueError("Draft seconds must be 1–600")
    if seconds is not None and not draft:
        raise ValueError("--seconds is only valid with --draft")
    if limit is not None:
        if limit<1:raise ValueError("--limit must be positive")
        doc={**doc,"scenes":doc["scenes"][:limit]}
    timeline,voices_audio=plan(doc,voices,fps,draft,seconds,model)
    out.mkdir(parents=True,exist_ok=True)
    work=out/"build";work.mkdir(exist_ok=True)
    if draft:
        for scene in timeline["scenes"]:scene["_draft"]=True
    write_json(out/"timeline.json",timeline)
    score(timeline,voices_audio,out/"audio")
    storyboard(doc,out/"previews")
    jobs=[(i,s,len(timeline["scenes"]),timeline["scenes"][i-1] if i else None,fps,width,work) for i,s in enumerate(timeline["scenes"])]
    # Always render fresh. A changed title or previous scene cannot reuse stale frames.
    with concurrent.futures.ProcessPoolExecutor(max_workers=workers) as pool:
        files=list(pool.map(scene_render,jobs))
    listing=work/"concat.txt"
    listing.write_text("".join(f"file '{path.name}'\n" for path in files))
    visual=work/"visuals.mp4"
    subprocess.run([ffmpeg(),"-hide_banner","-loglevel","error","-y","-f","concat","-safe","0","-i",str(listing),"-c","copy",str(visual)],check=True)
    final=out/("draft.mp4" if draft else "video.mp4")
    subprocess.run([ffmpeg(),"-hide_banner","-loglevel","error","-y","-i",str(visual),"-i",str(out/"audio/mix.wav"),
                    "-map","0:v:0","-map","1:a:0","-c:v","copy","-af","loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a","aac","-b:a","192k","-ar","48000","-shortest","-movflags","+faststart",str(final)],check=True)
    from .player import build_player
    build_player(timeline,final,out/"interactive")
    print(f"Created video and interactive player: {out}")
    return final
