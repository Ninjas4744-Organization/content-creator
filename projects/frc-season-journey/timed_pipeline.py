"""Project-local phrase-aligned captions and smooth render integration."""
from __future__ import annotations
import json
import math
from pathlib import Path
import subprocess
from PIL import Image,ImageDraw
from davinci_creator import video
from davinci_creator.audio import caption_groups
from davinci_creator.common import voice_signature

PROJECT=Path(__file__).resolve().parent
BASE_PLAN=video.plan


def aligned_plan(doc,voices,fps=30,draft=False,seconds=None,model='gemini-3.8-flash-tts'):
    timeline,audio=BASE_PLAN(doc,voices,fps,draft,seconds,model)
    if draft:return timeline,audio
    for scene in timeline['scenes']:
        path=PROJECT/'audio/reviews'/(scene['id']+'.json')
        if not path.is_file():continue
        r=json.loads(path.read_text())
        if r.get('voice_cache_signature')!=voice_signature(scene,doc,model):continue
        phrases=[];last=0
        for item in r.get('phrases',[]):
            begin=max(last,0,float(item['start_seconds']))
            end=min(scene['voice_duration'],float(item['end_seconds']))
            text=item.get('text','').strip()
            if not text or end<=begin:continue
            groups=caption_groups(text,maxwords=8)
            weights=[max(1,len(s.split())) for s in groups];total=sum(weights);elapsed=0
            for words,w in zip(groups,weights):
                phrases.append({'start':begin+(end-begin)*elapsed/total,
                                'end':begin+(end-begin)*(elapsed+w)/total,'text':words})
                elapsed+=w
            last=end
        if phrases:
            scene['caption_timing']=phrases;scene['captions']=[p['text'] for p in phrases]
            scene['caption_timing_source']='Gemini audio phrase timestamps; approximate within phrases'
    return timeline,audio


def scene_render(args):
    index,scene,total,previous,fps,width,out=args
    height=width*9//16;output=out/f'scene-{index:03d}.mp4';partial=out/f'scene-{index:03d}.partial.mp4'
    cmd=[video.ffmpeg(),'-hide_banner','-loglevel','error','-y','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{width}x{height}','-r',str(fps),'-i','-','-an','-c:v','libx264','-threads','2','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(partial)]
    process=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    prior=video.frame(previous,index-1,total,previous['duration']-1/fps) if previous else None
    try:
        for n in range(round(scene['duration']*fps)):
            t=n/fps;local=t-scene['voice_offset'];caption=None
            if scene.get('caption_timing'):
                caption=next((p['text'] for p in scene['caption_timing'] if p['start']<=local<p['end']),None)
            elif scene['captions'] and 0<=local<scene['voice_duration']:
                j=min(len(scene['captions'])-1,int(local/scene['voice_duration']*len(scene['captions'])));caption=scene['captions'][j]
            im=video.frame(scene,index,total,t,caption)
            if prior is not None and t<.38:im=Image.blend(prior,im,t/.38)
            if scene.get('_draft'):ImageDraw.Draw(im).text((12,12),'DRAFT / NO NARRATION',fill='white')
            if width!=1280:im=im.resize((width,height),Image.Resampling.LANCZOS)
            process.stdin.write(im.tobytes())
        process.stdin.close();error=process.stderr.read().decode()
        if process.wait():raise RuntimeError(error[-2000:])
        partial.replace(output)
    except Exception:
        process.kill();process.wait();partial.unlink(missing_ok=True);raise
    print(f"Rendered {index+1}/{total}: {scene['id']}",flush=True)
    return output


def stamp(t,separator=','):
    ms=round(t*1000);return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d}{separator}{ms%1000:03d}'


def write_captions(out):
    timeline=json.loads((out/'timeline.json').read_text());srt=[];vtt=['WEBVTT\n'];counter=1
    for s in timeline['scenes']:
        phrases=s.get('caption_timing',[])
        if not phrases:
            phrases=[{'start':j*s['voice_duration']/len(s['captions']),'end':(j+1)*s['voice_duration']/len(s['captions']),'text':text} for j,text in enumerate(s['captions'])]
        for p in phrases:
            begin=s['start']+s['voice_offset']+p['start'];end=s['start']+s['voice_offset']+p['end']
            srt.append(f"{counter}\n{stamp(begin)} --> {stamp(end)}\n{p['text']}\n")
            vtt.append(f"{stamp(begin,'.')} --> {stamp(end,'.')}\n{p['text']}\n");counter+=1
    (out/'captions.srt').write_text('\n'.join(srt));(out/'interactive/captions.vtt').write_text('\n'.join(vtt))
    # Pronunciation marks help TTS; they must not make plain Hebrew search fail.
    page=out/'interactive/index.html';html=page.read_text()
    html=html.replace('id="checkpoints" type="checkbox" checked','id="checkpoints" type="checkbox"')
    if 'const normalizeSearch=' not in html:
        html=html.replace("function transcript(query=''){", "const normalizeSearch=s=>s.normalize('NFD').replace(/[\\u0591-\\u05BD\\u05BF-\\u05C7]/g,'').toLocaleLowerCase();\nfunction transcript(query=''){")
        html=html.replace("(s.title+' '+(s.narration||'')).toLocaleLowerCase().includes(query.toLocaleLowerCase())",
                          "normalizeSearch(s.title+' '+(s.narration||'')+' '+(s.chapter||'')).includes(normalizeSearch(query))")
    page.write_text(html)


def install():
    video.plan=aligned_plan;video.scene_render=scene_render
