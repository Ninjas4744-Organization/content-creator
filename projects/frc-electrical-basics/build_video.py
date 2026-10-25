"""Project-specific animated component illustrations, using the repository video pipeline.

Run from repository root. No credentials are read here. All geometry is conceptual.
"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw
from bidi.algorithm import get_display
from davinci_creator import render as shared_render, video
from davinci_creator.common import load
from davinci_creator.layout import font, wrapped

PROJECT=Path(__file__).resolve().parent
BASE_FRAME=shared_render.frame
WHITE='#FAFCFF'; GOLD='#FFDA9D'; BLUE='#A9D8F6'; MINT='#8FE4C4'; INK='#102742'


def text(d,xy,content,size=28,color=WHITE,bold=False,anchor='mm'):
    d.text(xy,get_display(content),font=font(size,bold),fill=color,anchor=anchor)


def label(d,x,y,content,size=27,color=WHITE):
    for i,line in enumerate(content.split('\n')):
        text(d,(x,y+i*size*1.3),line,size,color)


def wire(d,points,t,color=GOLD,width=5,flow=True):
    d.line(points,fill=color,width=width,joint='curve')
    if not flow:return
    lengths=[math.dist(a,b) for a,b in zip(points,points[1:])]
    length=sum(lengths)
    if not length:return
    for j in range(max(1,int(length/85))):
        distance=(j*85+t*65)%length
        for a,b,n in zip(points,points[1:],lengths):
            if distance<=n:
                u=distance/n if n else 0
                x=a[0]+(b[0]-a[0])*u;y=a[1]+(b[1]-a[1])*u
                d.ellipse((x-5,y-5,x+5,y+5),fill=WHITE)
                break
            distance-=n


def icon(d,kind,x,y,scale=1,t=0):
    # Every icon uses a local 200 x 180 canvas centered on (x,y).
    layer=Image.new('RGBA',(240,220))
    q=ImageDraw.Draw(layer)
    if kind=='battery':
        q.rounded_rectangle((34,48,206,178),18,fill='#20344B',outline=BLUE,width=4)
        q.rectangle((52,31,80,49),fill='#F08175');q.rectangle((160,31,188,49),fill=BLUE)
        text(q,(66,23),'+',22,GOLD,True);text(q,(174,23),'−',22,BLUE,True)
        q.polygon([(127,67),(94,116),(116,116),(106,158),(151,103),(128,103)],fill=GOLD)
        text(q,(120,194),'12V',24,WHITE,True)
    elif kind=='breaker':
        q.rounded_rectangle((53,31,187,184),16,fill='#263C54',outline=BLUE,width=4)
        q.ellipse((67,44,85,62),fill=GOLD);q.ellipse((155,151,173,169),fill=GOLD)
        q.rounded_rectangle((89,59,151,145),12,fill='#09172B',outline=WHITE,width=2)
        q.rounded_rectangle((97,68,143,109),6,fill='#EF826E')
        text(q,(120,163),'ON / OFF',16,WHITE,True)
    elif kind=='panel':
        q.rounded_rectangle((37,30,203,185),15,fill='#192E47',outline=BLUE,width=4)
        for side in [42,175]:
            for yy in range(47,161,22):
                q.rectangle((side,yy,side+22,yy+13),fill='#314B66',outline=GOLD,width=2)
        q.rounded_rectangle((82,78,159,134),9,fill='#294B6E')
        text(q,(120,104),'PD',31,GOLD,True)
        for xx in [96,143]:q.ellipse((xx,152,xx+12,164),fill=GOLD)
    elif kind=='controller':
        q.rounded_rectangle((47,49,193,170),14,fill='#192F48',outline=GOLD,width=4)
        for xx in range(65,180,16):q.line((xx,71,xx,125),fill='#476785',width=5)
        q.ellipse((67,142,77,152),fill=MINT)
        q.rectangle((90,163,150,178),fill=BLUE)
    elif kind=='encoder':
        q.rounded_rectangle((43,56,180,171),15,fill='#1F4659',outline=BLUE,width=3)
        q.ellipse((69,63,171,165),fill='#152A44',outline=WHITE,width=3)
        q.ellipse((101,95,139,133),fill=BLUE,outline=GOLD,width=3)
        for k in range(12):
            a=k*math.tau/12+t*.8
            q.line((120+34*math.cos(a),114+34*math.sin(a),120+44*math.cos(a),114+44*math.sin(a)),fill=GOLD,width=3)
        q.line((120,114,160,114),fill=WHITE,width=7)
        for yy in [85,115,145]:q.line((180,yy,215,yy),fill=BLUE,width=3)
    elif kind=='motor':
        q.rounded_rectangle((38,62,171,163),15,fill='#3C5670',outline=BLUE,width=4)
        q.ellipse((120,62,199,163),fill='#253B53',outline=WHITE,width=3)
        q.rectangle((159,101,224,124),fill=BLUE)
        q.ellipse((141,86,178,139),fill='#152A44',outline=GOLD,width=3)
        a=t*2.5 if kind=='motor' else t*1.4
        for k in range(3):
            angle=a+k*math.tau/3
            q.line((160,112,160+27*math.cos(angle),112+36*math.sin(angle)),fill=GOLD,width=5)
        if kind=='encoder':
            for k in range(12):
                a=k*math.tau/12
                q.ellipse((72+34*math.cos(a),110+34*math.sin(a),76+34*math.cos(a),114+34*math.sin(a)),fill=GOLD)
    elif kind=='computer':
        q.rounded_rectangle((32,31,208,184),14,fill='#1F4659',outline=BLUE,width=4)
        for xx in range(53,190,20):
            q.rectangle((xx,41,xx+10,58),fill=GOLD)
            q.rectangle((xx,157,xx+10,174),fill=GOLD)
        q.rectangle((82,72,157,146),fill='#09172B',outline=WHITE,width=3)
        for xx in range(90,151,14):
            q.line((xx,62,xx,70),fill=BLUE,width=3)
            q.line((xx,147,xx,155),fill=BLUE,width=3)
        text(q,(120,109),'CPU',27,GOLD,True)
        q.ellipse((178,132,190,144),fill=MINT)
    elif kind=='radio':
        q.rounded_rectangle((41,85,199,167),14,fill='#1D354F',outline=BLUE,width=4)
        q.line((60,87,45,37),fill=BLUE,width=7);q.line((180,87,195,37),fill=BLUE,width=7)
        for xx in [65,94,123,152]:q.rounded_rectangle((xx,130,xx+20,149),3,fill='#09172B',outline=GOLD,width=2)
        for k in range(3):
            radius=18+k*16
            q.arc((120-radius,80-radius,120+radius,80+radius),215,325,fill=GOLD,width=4)
    elif kind=='laptop':
        q.rounded_rectangle((42,38,198,143),9,fill='#162E49',outline=BLUE,width=4)
        q.rectangle((54,50,186,129),fill='#355679')
        for k,w in enumerate([65,95,48]):q.line((69,69+k*18,69+w,69+k*18),fill=GOLD,width=4)
        q.polygon([(42,143),(198,143),(219,175),(21,175)],fill='#496580',outline=BLUE,width=3)
    elif kind=='switch':
        q.rounded_rectangle((51,109,170,170),9,fill='#263F58',outline=BLUE,width=3)
        q.ellipse((144,112,162,130),fill=GOLD)
        angle=-.6+.15*math.sin(t)
        end=(153+65*math.cos(angle),121+65*math.sin(angle))
        q.line((153,121,*end),fill=WHITE,width=7)
        q.ellipse((end[0]-7,end[1]-7,end[0]+7,end[1]+7),fill=GOLD)
        q.line((69,111,69,97),fill=GOLD,width=5)
    elif kind=='camera':
        q.rounded_rectangle((33,65,187,165),13,fill='#263F58',outline=BLUE,width=3)
        q.polygon([(187,90),(222,70),(222,159),(187,140)],fill='#263F58',outline=BLUE)
        q.ellipse((75,77,162,153),fill='#09172B',outline=GOLD,width=4)
        q.ellipse((96,93,142,137),fill='#487F9B',outline=BLUE,width=3)
        q.ellipse((106,98,115,107),fill=WHITE)
    elif kind=='lamp':
        glow=1 if int(t*2)%2==0 else .35
        q.ellipse((44,23,196,172),fill=(255,218,157,round(25*glow)))
        q.rounded_rectangle((77,52,163,150),33,fill=(255,182,65,round(240*glow)),outline=GOLD,width=3)
        q.rectangle((73,145,167,168),fill='#42566B',outline=BLUE,width=2)
        for yy in range(68,137,17):q.line((86,yy,154,yy),fill=(255,246,220,180),width=2)
    elif kind=='pneumatic':
        q.rounded_rectangle((34,65,145,167),12,fill='#203D59',outline=BLUE,width=3)
        text(q,(90,111),'PH',30,GOLD,True)
        q.line((145,112,179,112,179,63),fill=MINT,width=5)
        q.rounded_rectangle((163,41,210,86),5,fill='#607B8F',outline=WHITE,width=2)
        q.line((209,63,231,63),fill=WHITE,width=6)
    if scale!=1:layer=layer.resize((round(240*scale),round(220*scale)),Image.Resampling.LANCZOS)
    return layer,(round(x-layer.width/2),round(y-layer.height/2))


def place(im,kind,x,y,s=1,t=0):
    obj,pos=icon(None,kind,x,y,s,t);im.alpha_composite(obj,pos)


def info(d,items):
    n=len(items);step=120 if n>1 else 0
    for i,item in enumerate(items):
        y=260+i*step if n>1 else 300
        text(d,(1160,y),item['heading'],34,GOLD,True,'rt')
        lines=wrapped(item['body'],30,340).split('\n')
        for j,line in enumerate(lines):text(d,(1160,y+53+j*39),line,30,WHITE,False,'rt')


def component_frame(scene,index,total,t=None,caption=None):
    if not scene.get('diagram'):
        return BASE_FRAME(scene,index,total,t,caption)
    clock=4 if t is None else t
    base={**scene,'layout':'statement','subtitle':'','body':''}
    im=BASE_FRAME(base,index,total,t,None).convert('RGBA')
    content=Image.new('RGBA',im.size);d=ImageDraw.Draw(content)
    d.rounded_rectangle((88,193,788,591),radius=24,fill=(10,29,51,220),outline=(169,216,246,85),width=2)
    kind=scene['diagram'];items=scene.get('items',[])
    if kind=='battery':
        place(content,'battery',438,369,1.75,clock)
        label(d,438,550,'מקור האנרגיה',29,GOLD)
    elif kind=='main-breaker':
        wire(d,[(158,390),(322,390)],clock)
        place(content,'battery',184,362,.65,clock)
        place(content,'breaker',461,365,1.55,clock)
        wire(d,[(571,390),(704,390)],clock)
        label(d,460,548,'הדלקה · כיבוי · הגנה',28,GOLD)
    elif kind=='power-distribution':
        wire(d,[(365,385),(606,385),(606,270),(672,270)],clock)
        wire(d,[(365,385),(672,385)],clock)
        wire(d,[(365,385),(606,385),(606,500),(672,500)],clock)
        place(content,'panel',358,370,1.55,clock)
        for icon_kind,yy in [('motor',265),('computer',380),('radio',495)]:place(content,icon_kind,688,yy,.5,clock)
        label(d,230,550,'יציאות לרכיבים',26,GOLD)
    elif kind=='motor-controller':
        wire(d,[(308,363),(545,363)],clock)
        place(content,'controller',258,359,1.1,clock)
        place(content,'motor',602,359,1.1,clock)
        label(d,258,508,'בקר',30,GOLD);label(d,602,508,'מנוע',30,GOLD)
    elif kind=='robot-brain':
        place(content,'computer',438,350,1.6,clock)
        label(d,438,533,'roboRIO / Systemcore',30,GOLD)
    elif kind=='radio-link':
        place(content,'laptop',223,385,.92,clock)
        place(content,'radio',644,385,.95,clock)
        for k in range(3):
            xx=354+k*62
            d.arc((xx-34,310,xx+34,421),285,75,fill=GOLD,width=4)
            if (clock*.6)%1>(k/3):d.ellipse((xx-3,359,xx+3,365),fill=WHITE)
        label(d,223,513,'מחשב הנהגים',27,GOLD);label(d,644,513,'הרדיו ברובוט',27,GOLD)
    elif kind=='sensors-feedback':
        for icon_kind,xx,yy,word in [('encoder',275,310,'אנקודר'),('switch',591,310,'מפסק גבול'),('camera',438,479,'מצלמה')]:
            place(content,icon_kind,xx,yy,.75,clock);label(d,xx,yy+82,word,25,GOLD)
    elif kind=='pneumatics-status':
        place(content,'lamp',258,365,1.1,clock);place(content,'pneumatic',602,365,1.1,clock)
        label(d,258,520,'נורת מצב',27,GOLD);label(d,602,520,'בקר פנאומטיקה',27,GOLD)
    elif kind in ['question-one','question-two']:
        # Full-width question replaces the split component layout.
        d.rounded_rectangle((88,193,1190,594),24,fill=(10,29,51,255),outline=(169,216,246,90),width=2)
        text(d,(640,250),scene['subtitle'],40,GOLD,True)
        icon_names=['battery','radio','camera'] if kind=='question-one' else ['motor','panel','radio']
        for j,(name,option) in enumerate(zip(icon_names,scene['quiz']['options'])):
            x=985-j*345
            place(content,name,x,390,.83,clock)
            label(d,x,510,option,27,WHITE)
        text(d,(640,563),'בחרו תשובה בנגן האינטראקטיבי',23,BLUE)
    elif kind=='closing':
        for j,(name,word) in enumerate([('battery','אנרגיה'),('motor','פעולה'),('radio','מידע')]):
            xx=650-j*210
            place(content,name,xx,365,.8,clock)
            label(d,xx,496,word,27,GOLD)
    if not kind.startswith('question'):info(d,items)
    # The whole diagram enters smoothly, while each component keeps moving.
    if t is not None:
        progress=shared_render.ease((t-.3)/.7)
        if progress<1:content.putalpha(content.getchannel('A').point(lambda a:round(a*progress)))
    im.alpha_composite(content)
    d=ImageDraw.Draw(im)
    text(d,(640,686),'מבוסס על FRCElectrical.org',16,BLUE)
    if caption:
        lines=wrapped(caption,24,1100).split('\n');y=720-38-len(lines)*31
        d.rounded_rectangle((55,y-12,1225,702),radius=12,fill=(9,23,43,245))
        for j,line in enumerate(lines):text(d,(640,y+j*31),line,24,WHITE,False,'mt')
    return im.convert('RGB')

# Patches are installed at import time so spawned rendering workers share them.
shared_render.frame=component_frame
video.frame=component_frame


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--draft',action='store_true')
    parser.add_argument('--preview',action='store_true')
    parser.add_argument('--width',type=int,default=1280)
    parser.add_argument('--fps',type=int,default=24)
    parser.add_argument('--out',type=Path)
    args=parser.parse_args();doc=load(PROJECT/'content.json')
    out=args.out or PROJECT/'output'/('draft' if args.draft else 'video')
    if args.preview:
        shared_render.storyboard(doc,out/'previews')
        print(out/'previews/storyboard.jpg');return
    video.render(doc,out,PROJECT/'audio/voices',fps=args.fps,width=args.width,workers=2,draft=args.draft,seconds=4 if args.draft else None)
    # Native video controls already handle Space; avoid toggling playback twice.
    player=out/'interactive/index.html'
    player.write_text(player.read_text().replace("['INPUT','SELECT','BUTTON','TEXTAREA']","['INPUT','SELECT','BUTTON','TEXTAREA','VIDEO']"))

if __name__=='__main__':main()
