"""Original physics diagrams and time-based animation, using the shared video pipeline."""
from __future__ import annotations

import argparse
import functools
import json
import math
from pathlib import Path
import re

from bidi.algorithm import get_display
from PIL import Image, ImageDraw

from davinci_creator import render as shared_render, video
from davinci_creator.common import ASSETS, load
from davinci_creator.layout import font, wrapped

PROJECT = Path(__file__).resolve().parent
BASE_FRAME = shared_render.frame
WHITE = '#FAFCFF'
GOLD = '#FFDA9D'
BLUE = '#A9D8F6'
GREEN = '#8FE4C4'
RED = '#FF9C9B'
MUTED = '#8BA6BF'
PANEL = '#0C2034'
BORDER = '#38516A'


def supported_text(value):
    # Rubik supplies the math operators and micro sign, but not these Greek/arrow glyphs.
    return str(value).translate(str.maketrans({'μ':'µ', 'Σ':'∑', 'Δ':'∆', '→':'->'}))


def text(draw, xy, value, size=25, color=WHITE, bold=False, anchor='mm'):
    value = supported_text(value)
    visual = get_display(str(value)) if re.search(r'[\u0590-\u05ff]', str(value)) else str(value)
    draw.text(xy, visual, font=font(size, bold), fill=color, anchor=anchor)


def paragraph(draw, xy, value, size=26, width=335, color=WHITE, bold=False):
    value = supported_text(value)
    for i, line in enumerate(wrapped(value, size, width, bold).split('\n')):
        text(draw, (xy[0], xy[1] + i * size * 1.35), line, size, color, bold, 'rt')


def arrow(draw, start, end, color=GOLD, label='', offset=(0,-22), width=5, size=23):
    x, y = start; xx, yy = end
    if math.dist(start, end) > 4:
        draw.line((x, y, xx, yy), fill=color, width=width)
        angle = math.atan2(yy-y, xx-x)
        points = [(xx, yy)] + [(xx-13*math.cos(angle+side*.46), yy-13*math.sin(angle+side*.46)) for side in [-1,1]]
        draw.polygon(points, fill=color)
    if label:
        text(draw, ((x+xx)/2+offset[0], (y+yy)/2+offset[1]), label, size, color, True)


def dashed(draw, start, end, color=MUTED, width=2, step=13):
    length = math.dist(start,end)
    for i in range(0, int(length), step):
        a=i/max(1,length); b=min(i+step*.55,length)/max(1,length)
        draw.line((start[0]+(end[0]-start[0])*a,start[1]+(end[1]-start[1])*a,
                   start[0]+(end[0]-start[0])*b,start[1]+(end[1]-start[1])*b),fill=color,width=width)


def block(draw, x, y, label='גוף', w=100, h=64, color=BLUE):
    draw.rounded_rectangle((x-w/2,y-h/2,x+w/2,y+h/2),12,fill='#233F5B',outline=color,width=3)
    if label: text(draw,(x,y),label,25,color,True)


def ground(draw, x1=70, x2=630, y=268):
    draw.line((x1,y,x2,y),fill=BLUE,width=3)
    for x in range(x1,x2,18):draw.line((x,y+3,x-9,y+14),fill=BORDER,width=2)


def spring(draw,x,top,bottom,color=GOLD):
    points=[(x,top),(x,top+10)]
    for i in range(31):points.append((x+(-15 if i%2==0 else 15),top+15+(bottom-top-30)*i/30))
    points.extend([(x,bottom-6),(x,bottom)])
    draw.line(points,fill=color,width=4,joint='curve')


def ceiling(draw,x,y=62):
    draw.line((x-65,y,x+65,y),fill=BLUE,width=5)
    for xx in range(x-60,x+60,15):draw.line((xx,y,xx+10,y-12),fill=BORDER,width=2)


def plot(draw, origin=(350,295), top=(635,70), xmax=0.06, ymax=3, xlabel='x (m)', ylabel='F (N)', progress=1, friction=False):
    ox,oy=origin; ex,ey=top
    arrow(draw,(ox,oy),(ex+15,oy),BLUE,width=3)
    arrow(draw,(ox,oy),(ox,ey-14),BLUE,width=3)
    text(draw,(ox-12,ey-36),ylabel,22,BLUE)
    text(draw,(ex-8,oy+37),xlabel,22,BLUE)
    for j in range(1,4):
        x=ox+(ex-ox)*j/3;y=oy-(oy-ey)*j/3
        draw.line((x,oy,x,oy+6),fill=BLUE,width=2)
        draw.line((ox-6,y,ox,y),fill=BLUE,width=2)
        text(draw,(x,oy+17),str(round(xmax*j/3,2)).removesuffix('.0'),18,MUTED)
        text(draw,(ox-16,y),str(round(ymax*j/3,2)).removesuffix('.0'),18,MUTED)
        dashed(draw,(ox,y),(x,y),BORDER,1)
    draw.line((ox,oy,ox+(ex-ox)*progress,oy-(oy-ey)*progress),fill=GREEN,width=4)
    for j in range(1,4):
        if progress+.005>=j/3:
            x=ox+(ex-ox)*j/3;y=oy-(oy-ey)*j/3
            draw.ellipse((x-6,y-6,x+6,y+6),fill=GOLD)
    text(draw,(160 if friction else 175,340),'נתונים לדוגמה',20,MUTED)


def forces_box(draw,solution=False):
    ground(draw,y=265)
    block(draw,350,230,'2 kg')
    arrow(draw,(350,230),(350,130),GREEN,'N = 20 N' if solution else 'N',(-70,0))
    arrow(draw,(350,230),(350,330),RED,'F_g = 20 N' if solution else 'F_g',(86,0))
    arrow(draw,(350,230),(494,230),GOLD,'4 N',(0,-30))
    arrow(draw,(350,230),(206,230),GREEN,'4 N' if solution else 'f_s = ?',(-2,-30))


def diagram(scene, progress=1):
    im=Image.new('RGBA',(700,400))
    draw=ImageDraw.Draw(im)
    draw.rounded_rectangle((1,1,699,399),20,fill=PANEL,outline=BORDER,width=2)
    p=max(0,min(1,progress)); kind=scene['diagram']
    if kind=='big-question':
        text(draw,(350,47),'איך מושכים — והקופסה נשארת במקום?',30,GOLD,True)
        ground(draw,y=266)
        block(draw,350,230,'קופסה')
        length=80+60*p
        arrow(draw,(350,230),(350+length,230),GOLD,'משיכה',(0,-43))
        arrow(draw,(350,230),(350-length,230),GREEN,'חיכוך',(0,-43))
        text(draw,(350,325),'אותו גוף · חצים מנוגדים · סכום אפס',26,BLUE)
    elif kind=='force-arrow':
        text(draw,(350,43),'אותו כיוון, כוחות בגדלים שונים',27,GOLD,True)
        arrow(draw,(130,140),(310,140),GOLD,'3 N',(0,-30))
        arrow(draw,(130,255),(490,255),GREEN,'6 N',(0,-30))
        for yy in [140,255]:draw.ellipse((123,yy-7,137,yy+7),fill=WHITE)
        text(draw,(350,330),'חץ כפול באורכו = כוח כפול בגודלו',25,BLUE)
    elif kind=='hooke-law':
        ceiling(draw,245)
        natural=180;end=natural+75*(.1+.9*p)
        spring(draw,245,70,end)
        block(draw,245,end+26,'',w=78,h=52)
        dashed(draw,(150,natural),(410,natural))
        text(draw,(462,natural),'האורך הטבעי',23,MUTED)
        arrow(draw,(360,natural),(360,end),GREEN,'x',(30,0),width=3)
        text(draw,(490,93),'יותר כוח',29,GOLD,True)
        text(draw,(490,135),'יותר התארכות',27,WHITE)
        text(draw,(490,240),'x הוא ההפרש',27,GREEN,True)
        text(draw,(490,277),'לא האורך כולו',25,WHITE)
        text(draw,(160,338),'בתחום הליניארי בלבד',22,MUTED)
    elif kind=='hooke-experiment':
        ceiling(draw,140,70)
        end=155+115*p;spring(draw,140,78,end)
        block(draw,140,end+22,'',70,45)
        draw.line((225,95,225,300),fill=BLUE,width=2)
        for y in range(95,301,17):draw.line((225,y,235,y),fill=BLUE,width=2)
        text(draw,(140,38),'משקולות וקפיץ',23,GOLD,True)
        plot(draw,progress=p)
    elif kind=='weight-gravity':
        text(draw,(350,38),'במנוחה: גודל המשקל שווה לגודל כוח הכובד',24,GOLD,True)
        block(draw,270,175,'2 kg',100,85)
        draw.rounded_rectangle((185,225,355,280),9,fill='#274661',outline=BLUE,width=3)
        text(draw,(270,260),'20 N',26,BLUE,True)
        arrow(draw,(250,175),(250,270),RED,'F_g',(-48,2))
        arrow(draw,(290,175),(290,80),GREEN,'N',(40,0))
        arrow(draw,(465,235),(465,315),GOLD,'w',(45,0))
        text(draw,(520,205),'כוח הגוף',23,GOLD)
        text(draw,(520,235),'על המאזניים',23,GOLD)
        text(draw,(350,340),'כוחות על גופים שונים; לא מחליפים מושגים',23,MUTED)
    elif kind=='falling-scale':
        draw.line((350,58,350,336),fill=BORDER,width=2)
        for x,fall in [(175,False),(525,True)]:
            dy=50*p if fall else 0
            text(draw,(x,39),'נפילה חופשית' if fall else 'מנוחה',27,GOLD,True)
            block(draw,x,158+dy,'גוף',84,60)
            draw.rounded_rectangle((x-65,190+dy,x+65,235+dy),8,fill='#274661',outline=BLUE,width=2)
            text(draw,(x,217+dy),'0 N' if fall else '20 N',25,BLUE,True)
            arrow(draw,(x-12,158+dy),(x-12,238+dy),RED,'F_g',(-54,0))
            if not fall:arrow(draw,(x+14,158),(x+14,78),GREEN,'N',(34,0))
            else:
                for xx in [x-95,x+95]:arrow(draw,(xx,100+dy),(xx,145+dy),MUTED,width=2)
            text(draw,(x,337),'כבידה עדיין פועלת' if fall else 'יש כוח מגע',23,GREEN if fall else BLUE)
    elif kind=='vector-sum':
        text(draw,(350,34),'מחברים ראש לזנב',27,GOLD,True)
        arrow(draw,(110,105),(430,105),GOLD,'8 N',(0,-26))
        arrow(draw,(430,138),(310,138),GREEN,'3 N',(0,24))
        arrow(draw,(110,193),(310,193),WHITE,'5 N ימינה',(0,26),width=6)
        arrow(draw,(450,315),(555,315),GOLD,'3',(0,22))
        arrow(draw,(555,315),(555,175),GREEN,'4',(25,0))
        arrow(draw,(450,315),(555,175),WHITE,'5',(-24,-5),width=4)
        text(draw,(190,283),'3 ו־4 מאונכים',25,BLUE)
        text(draw,(190,321),'השקול: 5 באלכסון',25,BLUE)
    elif kind=='inertia':
        text(draw,(350,38),'אותו שקול אפס — שני מצבים אפשריים',26,GOLD,True)
        block(draw,170,133,'מנוחה')
        text(draw,(480,133),'v = 0',34,WHITE,True)
        dashed(draw,(80,198),(625,198),BORDER)
        xx=170+310*p
        for j in range(5):draw.ellipse((140+j*90,284,146+j*90,290),fill=MUTED)
        block(draw,xx,250,'נע')
        arrow(draw,(xx-35,205),(xx+60,205),BLUE,'v',(0,-19),width=3)
        text(draw,(350,331),'מהירות קבועה: גודל וכיוון נשמרים',25,GREEN)
    elif kind=='moving-earth':
        shift=105*p;left=80+shift
        ground(draw,50,650,310)
        draw.rounded_rectangle((left,150,left+365,283),18,fill='#1B3550',outline=BLUE,width=3)
        for x in [left+65,left+300]:draw.ellipse((x-23,270,x+23,316),fill='#102337',outline=BLUE,width=3)
        for a in [i/32 for i in range(33) if i/32<=p]:
            xx=80+105*a+185;yy=210-122*math.sin(math.pi*a)
            draw.ellipse((xx-2,yy-2,xx+2,yy+2),fill=MUTED)
        bx=left+185;by=210-122*math.sin(math.pi*p)
        draw.ellipse((bx-13,by-13,bx+13,by+13),fill=GOLD)
        arrow(draw,(left+220,252),(left+320,252),BLUE,'v',(0,-18),width=3)
        text(draw,(350,37),'הכדור מתקדם עם הרכבת גם בזמן התעופה',25,GOLD,True)
        text(draw,(350,345),'קפיצה אינה מוחקת מהירות אופקית',25,GREEN)
    elif kind=='third-law':
        text(draw,(350,39),'שני כוחות — שני גופים',30,GOLD,True)
        block(draw,220,215,'A',100,100);block(draw,480,215,'B',100,100)
        draw.line((270,200,350,178,430,200),fill=MUTED,width=5)
        arrow(draw,(220,215),(85,215),GREEN,'B על A',(0,76))
        arrow(draw,(480,215),(615,215),GOLD,'A על B',(0,76))
        text(draw,(350,337),'אותו גודל, הפוך בכיוון, בו־זמנית',25,BLUE)
    elif kind=='tension':
        ceiling(draw,210,65)
        draw.line((210,65,210,227),fill=WHITE,width=4)
        block(draw,210,250,'גוף',86,66)
        arrow(draw,(210,250),(210,162),GREEN,'T',(-40,0))
        arrow(draw,(210,250),(210,338),RED,'F_g',(42,0))
        text(draw,(510,41),'מפגש חוטים',25,GOLD,True)
        knot=(520,200)
        for end in [(440,80),(600,80)]:draw.line((*knot,*end),fill=MUTED,width=3)
        arrow(draw,knot,(470,125),GREEN,'T₁',(-21,0),width=4)
        arrow(draw,knot,(570,125),GOLD,'T₂',(27,0),width=4)
        arrow(draw,knot,(520,350),RED,'F',(28,0),width=4)
        draw.ellipse((514,194,526,206),fill=WHITE)
        text(draw,(360,334),'לאורך החוט',24,BLUE)
    elif kind=='two-bodies':
        text(draw,(350,35),'מחברים את משוואות A ו־B',27,GOLD,True)
        for a,b in [((145,92),(545,92)),((145,92),(145,304)),((545,92),(545,304)),((145,304),(545,304))]:dashed(draw,a,b,BLUE)
        block(draw,215,202,'A',80,85);block(draw,475,202,'B',80,85)
        internal=GREEN if p<.55 else '#476976'
        arrow(draw,(215,202),(355,202),internal,'פנימי',(0,55))
        arrow(draw,(475,202),(335,202),internal,'פנימי',(0,55))
        arrow(draw,(215,202),(75,202),GOLD,'6 N',(0,-62))
        arrow(draw,(475,202),(615,202),GOLD,'6 N',(0,-62))
        text(draw,(350,334),'רק הכוחות החיצוניים נשארים בסכום',24,BLUE)
    elif kind=='normal-force':
        text(draw,(205,36),'מוסיפים לחיצה מטה',25,GOLD,True)
        ground(draw,60,345,266);block(draw,205,234,'2 kg',86,64)
        arrow(draw,(190,230),(190,95),GREEN,'N = 25 N',(-47,0),size=22)
        arrow(draw,(210,230),(210,338),RED,'20 N',(45,0),size=22)
        arrow(draw,(280,205),(280,232),GOLD,'5 N',(39,0),size=22)
        text(draw,(510,36),'ניצב גם בשיפוע',25,GOLD,True)
        draw.line((395,300,635,200),fill=BLUE,width=5)
        draw.polygon([(468,270),(541,239),(516,180),(443,211)],fill='#233F5B',outline=BLUE,width=3)
        arrow(draw,(492,226),(445,113),GREEN,'N',(-26,-2))
        arrow(draw,(492,226),(492,330),RED,'F_g',(35,0))
        text(draw,(530,341),'מאונך למגע',23,BLUE)
    elif kind=='static-friction':
        text(draw,(350,36),'הגוף נשאר במקום; גודל החיכוך משתנה',25,GOLD,True)
        ground(draw,y=244);block(draw,350,209,'גוף',100,70)
        length=160*p
        arrow(draw,(350,209),(350+length,209),GOLD,f'{6*p:.1f} N',(0,-50))
        arrow(draw,(350,209),(350-length,209),GREEN,f'{6*p:.1f} N',(0,60))
        draw.rounded_rectangle((95,312,605,326),6,outline=BORDER,width=2)
        if p>.01:draw.rounded_rectangle((98,315,98+504*p,323),4,fill=GREEN)
        draw.line((605,300,605,340),fill=RED,width=4)
        text(draw,(110,341),'0',21,MUTED)
        text(draw,(562,341),'גבול: 6 N',23,RED,True)
    elif kind=='friction-experiment':
        text(draw,(175,36),'מודדים עד הסף בלבד',25,GOLD,True)
        ground(draw,40,295,259);block(draw,130,230,'גוף',80,58)
        draw.line((170,230,205,230),fill=WHITE,width=3)
        draw.rounded_rectangle((205,215,285,245),7,outline=BLUE,width=3)
        spring(draw,245,218,242)
        arrow(draw,(285,230),(335,230),GOLD,width=4)
        text(draw,(180,302),'משיכה אופקית ואיטית',23,BLUE)
        plot(draw,origin=(400,295),top=(630,78),xmax=30,ymax=9,xlabel='N (N)',ylabel='f_s,max (N)',progress=p,friction=True)
    elif kind in {'practice-question','practice-solution'}:
        text(draw,(350,38),'על שולחן אופקי, ללא כוחות אנכיים נוספים',23,GOLD,True)
        forces_box(draw,kind=='practice-solution')
        if kind=='practice-question':text(draw,(350,63),'g ≈ 10 N/kg  |  μ_s = 0.30',22,MUTED)
        else:text(draw,(350,365),'f_s = 4 N  <  f_s,max = 6 N',26,BLUE,True)
    elif kind=='remember':
        for j,(word,color) in enumerate([('גוף',GOLD),('חצים',GREEN),('סכום',BLUE)]):
            x=125+j*220
            draw.ellipse((x-38,62,x+38,138),outline=color,width=3)
            text(draw,(x,100),str(j+1),35,color,True)
            text(draw,(x,181),word,33,color,True)
            if j<2:arrow(draw,(x+65,100),(x+150,100),MUTED,width=3)
        text(draw,(350,261),'F(x)  →  k',31,GOLD,True)
        text(draw,(350,318),'f_s,max(N)  →  μ_s',29,GREEN,True)
    if scene.get('formula') and kind not in {'practice-solution','hooke-experiment','friction-experiment'}:
        draw.rounded_rectangle((70,355,630,390),9,fill='#19334B')
        text(draw,(350,372),scene['formula'],26,GOLD,True)
    if kind in {'hooke-experiment','friction-experiment'}:
        text(draw,(450,370),scene['formula'],23,GOLD,True)
    return im


@functools.lru_cache(36)
def base(scene_title,index,total):
    return BASE_FRAME({'title':scene_title,'layout':'statement','subtitle':'','body':''},index,total,None,None).convert('RGBA')


def physics_frame(scene,index,total,t=None,caption=None):
    if not scene.get('diagram'):return BASE_FRAME(scene,index,total,t,caption)
    im=base(scene['title'],index,total).copy()
    duration=scene.get('voice_duration',0)
    if t is None:p=1
    elif duration:p=(t-scene.get('voice_offset',.85))/max(1,duration*.9)
    else:p=(t-.4)/2.9
    p=max(0,min(1,p))
    pane=diagram(scene,p)
    if t is not None:
        fade=shared_render.ease((t-.18)/.55)
        if fade<1:pane.putalpha(pane.getchannel('A').point(lambda a:round(a*fade)))
    im.alpha_composite(pane,(85,195))
    draw=ImageDraw.Draw(im)
    for j,item in enumerate(scene.get('items',[])):
        yy=224+j*123
        if t is None or t>.30+j*.4:
            paragraph(draw,(1180,yy),item['heading'],29,350,GOLD,True)
            paragraph(draw,(1180,yy+45),item.get('body',''),26,350)
    if scene.get('_draft'):
        draw.rounded_rectangle((84,610,784,645),8,fill='#172B40')
        text(draw,(434,627),'טיוטת אנימציה · ללא קריינות',23,GOLD,True)
    if caption:
        lines=wrapped(caption,25,1120).split('\n')
        yy=720-39-len(lines)*33
        draw.rounded_rectangle((50,yy-12,1230,704),12,fill='#09172B')
        for j,line in enumerate(lines):text(draw,(640,yy+j*33),line,25,WHITE,False,'mt')
    return im.convert('RGB')


shared_render.frame=physics_frame
video.frame=physics_frame


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--assets',action='store_true')
    parser.add_argument('--preview',action='store_true')
    parser.add_argument('--draft',action='store_true')
    parser.add_argument('--width',type=int,default=1280)
    parser.add_argument('--fps',type=int,default=24)
    parser.add_argument('--workers',type=int,default=2)
    args=parser.parse_args()
    raw=json.loads((PROJECT/'content.json').read_text())
    if args.assets:
        for scene in raw['scenes']:
            target=ASSETS/scene['image'];target.parent.mkdir(parents=True,exist_ok=True)
            diagram(scene).convert('RGB').save(target)
        print('Created 18 original physics diagram assets.')
    doc=load(PROJECT/'content.json')
    out=PROJECT/'output'/('draft' if args.draft else 'video')
    if args.preview:
        shared_render.storyboard(doc,PROJECT/'output/storyboard')
        return
    video.render(doc,out,PROJECT/'audio/voices',fps=12 if args.draft else args.fps,width=640 if args.draft else args.width,
                 workers=args.workers,draft=args.draft,seconds=4 if args.draft else None)
    # Native video controls own Space while focused; avoid handling it twice.
    player=out/'interactive/index.html'
    player.write_text(player.read_text().replace("['INPUT','SELECT','BUTTON','TEXTAREA']", "['INPUT','SELECT','BUTTON','TEXTAREA','VIDEO']"))
    import shutil
    shutil.copy2(ASSETS/'brand/Rubik-OFL.txt',out/'interactive/Rubik-OFL.txt')


if __name__=='__main__':main()
