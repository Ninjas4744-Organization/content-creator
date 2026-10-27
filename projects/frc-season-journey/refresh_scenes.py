"""Refresh selected visuals and their following crossfades in an existing render.

Narration, timeline and mix must already match the current content. No voice or
timing changes are permitted by this narrow project-local repair command.
"""
from __future__ import annotations
import argparse
import concurrent.futures
import json
from pathlib import Path
import subprocess
import build_video as b
from davinci_creator.player import build_player


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--ids',nargs='+',required=True)
    args=parser.parse_args();out=args.out.resolve()
    old=json.loads((out/'timeline.json').read_text())
    doc=json.loads((b.PROJECT/'content.json').read_text())
    current,_=b.video.plan(doc,b.PROJECT/'audio/voices',old['fps'])
    assert len(old['scenes'])==len(current['scenes'])
    for a,c in zip(old['scenes'],current['scenes']):
        for key in ['id','narration','speaker','start','duration','voice_duration']:
            assert a[key]==c[key],f'Timeline/audio changed: {a["id"]} {key}'
    selected={i for i,s in enumerate(current['scenes']) if s['id'] in args.ids}
    assert len(selected)==len(args.ids),'Unknown or repeated scene id'
    selected|={i+1 for i in selected if i+1<len(current['scenes'])}
    jobs=[(i,current['scenes'][i],len(current['scenes']),current['scenes'][i-1] if i else None,
           old['fps'],1920,out/'build') for i in sorted(selected)]
    with concurrent.futures.ProcessPoolExecutor(max_workers=2) as pool:
        list(pool.map(b.video.scene_render,jobs))
    (out/'timeline.json').write_text(json.dumps(current,ensure_ascii=False,indent=2)+'\n')
    ff=b.video.ffmpeg();visual=out/'build/visuals.mp4'
    subprocess.run([ff,'-hide_banner','-loglevel','error','-y','-f','concat','-safe','0',
                    '-i',str(out/'build/concat.txt'),'-c','copy',str(visual)],check=True)
    final=out/'video.mp4'
    subprocess.run([ff,'-hide_banner','-loglevel','error','-y','-i',str(visual),
                    '-i',str(out/'audio/mix.wav'),'-map','0:v:0','-map','1:a:0',
                    '-c:v','copy','-af','loudnorm=I=-16:TP=-1.5:LRA=11','-c:a','aac',
                    '-b:a','192k','-ar','48000','-shortest','-movflags','+faststart',str(final)],check=True)
    b.shared_render.storyboard(current,out/'previews')
    build_player(current,final,out/'interactive')
    page=out/'interactive/index.html'
    page.write_text(page.read_text().replace("['INPUT','SELECT','BUTTON','TEXTAREA']",
                                            "['INPUT','SELECT','BUTTON','TEXTAREA','VIDEO']"))
    b.write_captions(out)
    print('Refreshed visuals with matching audio and timeline',flush=True)


if __name__=='__main__':main()
