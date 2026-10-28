"""Animation-only FRC season explainer, revision 5.

Reference photos/videos guide the original robot geometry and never enter frames.
"""
from __future__ import annotations
import argparse,functools,math
from pathlib import Path
from PIL import Image,ImageDraw,ImageChops
from bidi.algorithm import get_display
from davinci_creator import render as shared_render,video
from davinci_creator.common import ASSETS,load
from davinci_creator.layout import font,wrapped
from motion_art import draw_plane,smooth
from robot_model import draw_robot as robot
from animation_elements import draw_field,draw_top_robot,shadow,controller,cone,tower,rules_book,people_network,field_scale
from field_model import field_screen,mechanism_screen,mechanism_state,draw_element
from scale_geometry import fuel_radius,TOP_CANVAS_CM,PRACTICE_ROBOT_SIZE

PROJECT=Path(__file__).resolve().parent
WHITE='#FAFCFF';GOLD='#FFDA9D';BLUE='#A9D8F6';MINT='#8FE4C4'
RED='#D63D49';CYAN='#529FDA';DARK='#0D2031';STEEL='#8AA5B8';YELLOW='#F1CF38'


def clamp(x): return max(0., min(1., x))


def ease(x): return 1-(1-clamp(x))**3


def text(d,xy,value,size=30,color=WHITE,bold=False,anchor='mm',width=None):
    if width:
        while size>18 and font(size,bold).getlength(get_display(value))>width: size-=1
    d.text(xy,get_display(value),font=font(size,bold),fill=color,anchor=anchor)


def para(d,x,y,value,size=36,width=350,color=WHITE,bold=False):
    for j,line in enumerate(wrapped(value,size,width,bold).split('\n')):
        text(d,(x,y+j*size*1.24),line,size,color,bold,'rt')


def tag(d,box,value,color=GOLD,fill=DARK,size=21):
    d.rounded_rectangle(box,12,fill=fill,outline=color,width=2)
    text(d,((box[0]+box[2])/2,(box[1]+box[3])/2),value,size,color,True,width=box[2]-box[0]-16)


def side(d,heading,lines,active=0):
    para(d,1195,218,heading,42,335,GOLD,True)
    for j,line in enumerate(lines):
        yy=365+j*63
        d.ellipse((1173,yy-7,1187,yy+7),fill=GOLD if j==active else '#426078')
        text(d,(1153,yy),line,27,WHITE if j==active else BLUE,j==active,'rm',width=300)


def arrow(d,a,b,color=GOLD,width=4):
    d.line((*a,*b),fill=color,width=width)
    angle=math.atan2(b[1]-a[1],b[0]-a[0])
    d.line((b[0]-14*math.cos(angle-.5),b[1]-14*math.sin(angle-.5),*b,b[0]-14*math.cos(angle+.5),b[1]-14*math.sin(angle+.5)),fill=color,width=width)


def check(d,x,y,size=1,color=MINT):
    d.line((x-14*size,y,x-2*size,y+12*size,x+23*size,y-20*size),fill=color,width=max(2,round(6*size)))


def ball(im,x,y,r,alpha=1):
    r=max(.5,r);ss=3;n=math.ceil(r*2+6)
    layer=Image.new('RGBA',(n*ss,n*ss));d=ImageDraw.Draw(layer)
    d.ellipse(tuple(v*ss for v in (3,3,2*r+3,2*r+3)),fill=YELLOW,outline='#B89413',width=ss)
    d.ellipse(tuple(v*ss for v in (r*.43+3,r*.3+3,r*1.1+3,r*.88+3)),fill='#FFF29B')
    layer=layer.resize((n,n),Image.Resampling.LANCZOS)
    if alpha<1:layer.putalpha(layer.getchannel('A').point(lambda a:round(a*alpha)))
    im.alpha_composite(layer,(round(x-r-3),round(y-r-3)))


def trophy(im,x,y,s=1):
    layer=Image.new('RGBA',(230,230));d=ImageDraw.Draw(layer)
    d.polygon([(60,35),(170,35),(157,114),(132,143),(98,143),(73,114)],fill='#D6A34C',outline=GOLD,width=4)
    d.polygon([(63,38),(83,111),(102,133),(95,40)],fill='#FCE0A1')
    d.arc((25,42,94,120),80,280,fill=GOLD,width=9);d.arc((136,42,205,120),260,100,fill=GOLD,width=9)
    d.rectangle((103,142,127,183),fill='#D6A34C')
    d.rounded_rectangle((70,183,160,206),5,fill='#A37633',outline=GOLD,width=3)
    check(d,115,87,1,GOLD)
    if s!=1:layer=layer.resize((round(230*s),round(230*s)),Image.Resampling.LANCZOS)
    im.alpha_composite(layer,(round(x-115*s),round(y-115*s)))


def boarding(im,box,alpha=1):
    x,y,x2,y2=box
    layer=Image.new('RGBA',im.size);d=ImageDraw.Draw(layer)
    d.rounded_rectangle(box,18,fill='#EEDCC0',outline=GOLD,width=3)
    d.line((x+80,y+14,x+80,y2-14),fill='#9C8A74',width=2)
    text(d,((x+x2+80)/2,y+38),'HOUSTON',30,DARK,True,width=x2-x-98)
    text(d,((x+x2+80)/2,y+81),'FIRST CHAMPIONSHIP',18,'#32485B',True,width=x2-x-98)
    check(d,x+40,(y+y2)/2,.7,'#346D58')
    if alpha<1:layer.putalpha(layer.getchannel('A').point(lambda a:round(a*alpha)))
    im.alpha_composite(layer)


def route_point(points,p):
    lengths=[math.dist(a,b) for a,b in zip(points,points[1:])]
    remaining=clamp(p)*sum(lengths)
    for a,b,length in zip(points,points[1:],lengths):
        if remaining<=length:
            q=remaining/max(.001,length);return (a[0]+(b[0]-a[0])*q,a[1]+(b[1]-a[1])*q)
        remaining-=length
    return points[-1]


def recap(im,t,u):
    d=ImageDraw.Draw(im)
    nodes=[(1090,270),(640,270),(190,270),(190,485),(640,485),(1090,485)]
    roads=[[(1090,177),(640,177)],[(640,177),(190,177)],
           [(190,177),(44,177),(44,392),(190,392)],[(190,392),(640,392)],[(640,392),(1090,392)]]
    names=['קיקאוף','בחירת כיוון','בנייה ואימון','דיסטריקטים','אליפות ישראל','יוסטון']
    icons=['reveal','strategy','build','districts','qualify','departure']
    stops=[.08,.24,.40,.56,.70,.84]
    step=max([j for j,v in enumerate(stops) if u>=v] or [0])
    fraction=clamp((u-stops[step])/max(.01,(stops[step+1]-stops[step]))) if step<5 else 1
    dot=(1090,177)
    for j,road in enumerate(roads):
        d.line(road,fill='#38566F',width=6,joint='curve')
        if j<step:d.line(road,fill=GOLD,width=6,joint='curve')
        elif j==step:
            end=smooth(fraction)
            path=[route_point(road,end*k/40) for k in range(41)]
            d.line(path,fill=GOLD,width=6,joint='curve');dot=path[-1]
    if step==5:dot=(1090,392)
    for j,((xx,yy),name,kind) in enumerate(zip(nodes,names,icons)):
        active=j<=step
        d.line((xx,yy-93,xx,yy-78),fill=GOLD if active else '#38566F',width=3)
        d.rounded_rectangle((xx-123,yy-78,xx+123,yy+81),17,fill='#102C43',outline=GOLD if active else '#42637D',width=3 if j==step else 1)
        mini_icon(im,kind,xx,yy-9)
        d=ImageDraw.Draw(im);text(d,(xx,yy+58),name,25,GOLD if active else BLUE,True)
        d.ellipse((xx+96,yy-89,xx+124,yy-61),fill=GOLD if active else '#2B4B65')
        text(d,(xx+110,yy-75),str(j+1),17,DARK if active else BLUE,True)
    xx,yy=dot;d.ellipse((xx-9,yy-9,xx+9,yy+9),fill=WHITE,outline=GOLD,width=3)


@functools.lru_cache(8)
def brand_image(name):
    if name not in {'logo.png','wordmark.png','space-content.png','space-hero.png'}:
        raise ValueError('Only supplied branding raster assets are allowed in this animation')
    return Image.open(ASSETS/'brand'/name).convert('RGBA')


def stage(im,box=(61,181,831,580)):
    d=ImageDraw.Draw(im);d.rounded_rectangle(box,21,fill='#19344B',outline='#355C77',width=1)
    for yy in range(267,571,61):d.line((box[0]+20,yy,box[2]-20,yy),fill='#203D52',width=1)
    for xx in range(110,820,94):d.line((xx,box[1]+24,xx,box[3]-12),fill='#203D52',width=1)


def focus_step(d,x,y,label,active=True):
    d.ellipse((x-8,y-8,x+8,y+8),fill=GOLD if active else '#3A5B74')
    text(d,(x-23,y),label,25,WHITE if active else BLUE,active,'rm',width=285)


def opening(im,t,u):
    stage(im);shadow(im,441,557,550,70,120)
    x=472-31*smooth(t/1.5)
    robot(im,x-20,565,1.22,t,extension=.5+.5*math.sin(t*.7),fill_count=0,yaw=28+5*math.sin(t*.24))
    d=ImageDraw.Draw(im);tag(d,(83,196,397,237),'4744 · הדגם של עונת 2026',size=22)
    side(d,'משחק חדש. מסע של עונה.',['מגלים את האתגר','בונים רובוט','יוצאים לתחרויות'],min(2,int(u*3)))
    if u>.55:
        tag(d,(560,498,803,538),'קולט מאחור · יורה מלפנים',MINT,size=18)


def countdown_reveal(im,t,u):
    stage(im)
    d=ImageDraw.Draw(im)
    if t<2.1:
        text(d,(444,352),str(3-int(t/.7)),126,GOLD,True)
        text(d,(444,493),'עוד רגע מגלים את המשחק',28,WHITE)
    else:
        enter=smooth((t-2.1)/1.0)
        d.rounded_rectangle((80,214,813,550),12,fill='#091722',outline='#8DA6BA',width=3)
        field=field_screen(t,enter)
        if enter<1:field.putalpha(field.getchannel('A').point(lambda a:round(a*enter)))
        im.alpha_composite(field,(94,224))
        d=ImageDraw.Draw(im)
        d.rectangle((424,550,469,563),fill='#8A9EAD')
        d.rounded_rectangle((369,562,523,572),4,fill='#527087')
        tag(ImageDraw.Draw(im),(88,196,389,236),'2026 · חושפים את האתגר',size=21)
        if u>.60:
            rules_book(im,739,466,.42,smooth((u-.6)/.2))
            tag(ImageDraw.Draw(im),(102,502,427,537),'משימות · מגבלות · ניקוד',size=23)
    side(ImageDraw.Draw(im),'זה רגע החשיפה',['צופים בשידור','מכירים את הזירה','פותחים את החוקים'],min(2,int(u*3)))


def shooter_scene(im,t,repeat=True):
    stage(im)
    src,phase,rear,front=mechanism_screen(t)
    mask=Image.new('L',src.size);ImageDraw.Draw(mask).rounded_rectangle((0,0,769,398),21,fill=255)
    src.putalpha(ImageChops.multiply(src.getchannel('A'),mask))
    im.alpha_composite(src,(61,181))
    d=ImageDraw.Draw(im)
    labels={'deploy':'הקולט האחורי נפתח','collect':'הכדור נכנס מאחור','transfer':'ההזנה מעבירה קדימה','shoot':'הכדור נזרק מלפנים','scored':'אל הפתח העליון של המטרה'}
    tag(d,(436,195,808,237),labels[phase],MINT,size=18)
    if phase in {'deploy','collect'}:
        x,y=rear;right=min(799,x+100+61);left=min(right-35,x+22+61)
        arrow(d,(right,y+181),(left,y+181),MINT,3)
        text(d,((right+left)/2,y+152),'אחורי',19,MINT,True)
    elif phase=='shoot':
        x,y=front;arrow(d,(x-7+61,y+181),(x-66+61,y+156),GOLD,3)


def strategy(im,t,u):
    stage(im);d=ImageDraw.Draw(im)
    if u<.43:
        shadow(im,260,553,230,26);draw_element(im,'hub',250,550,.96)
        shadow(im,648,553,225,26);tower(im,648,550,.86)
        tag(d,(110,537,420,578),'איסוף וזריקה',size=23)
        tag(d,(488,537,782,578),'טיפוס',BLUE,size=23)
        if u>.22:
            d.rounded_rectangle((95,197,430,578),17,outline=GOLD,width=3);check(d,396,233,.8)
        side(d,'בוחרים יכולות',['מכירים את המשימות','בודקים רעיונות','בוחרים כיוון'],min(2,int(u/.43*3)))
    else:
        shooter_scene(im,clamp((u-.43)/.57)*7.39)
        tag(ImageDraw.Draw(im),(83,195,414,238),'הבחירה שלנו: איסוף וזריקה',size=21)
        side(ImageDraw.Draw(im),'הרובוט שלנו ב־2026',['קולט אחורי נפתח','הזנה בתוך הרובוט','זריקה מהחזית'],min(2,int((u-.43)/.57*3)))


def build_scene(im,t,u):
    stage(im);shadow(im,438,557,575,65,115)
    progress=smooth(clamp(u/.58))
    robot(im,419,565,1.22,t,build=progress,extension=smooth((u-.54)/.25),fill_count=0)
    d=ImageDraw.Draw(im)
    names=['מכניקה','חשמל','תוכנה'];active=min(2,int(u/.72*3))
    for j,(word,xx) in enumerate(zip(names,[235,445,655])):
        tag(d,(xx-88,196,xx+88,234),word,GOLD if j<=active else BLUE,size=23)
    if u>.47:
        q=smooth((u-.47)/.17)
        points=[(752,440),(715,440),(715,489),(639,489)]
        d.line(points,fill=BLUE,width=3)
        dot=route_point(points,(t*.6)%1);d.ellipse((dot[0]-5,dot[1]-5,dot[0]+5,dot[1]+5),fill=MINT)
        tag(d,(630,391,803,432),'קוד מפעיל מנגנון',MINT,size=18)
    if u<.72:side(d,'מהתכנון לרובוט',['מתכננים ומרכיבים','מחברים חשמל','מפעילים ובודקים'],active)
    else:
        people_network(im,1040,394,t,.86)
        text(ImageDraw.Draw(im),(1191,235),'כולם חלק מהתהליך',35,GOLD,True,'rm',width=335)
        text(ImageDraw.Draw(im),(1045,553),'ניהול · קהילה · פרסים',25,BLUE,True)


def slalom(q):
    return (150+600*q,390-112*math.sin(3*math.pi*q))


def angle_lerp(a,b,p):return a+((b-a+math.pi)%(2*math.pi)-math.pi)*smooth(p)


def bezier(p0,p1,p2,p3,q):
    return tuple((1-q)**3*p0[i]+3*(1-q)**2*q*p1[i]+3*(1-q)*q*q*p2[i]+q**3*p3[i] for i in range(2))


def practice_state(u):
    target=(215,263);finish=(580,470)
    aim=math.atan2(target[1]-finish[1],target[0]-finish[0]);initial=math.atan2(-80,170)
    if u<.57:
        q=smooth(clamp((u-.03)/.54));x,y=slalom(q);heading=math.atan2(-112*3*math.pi*math.cos(3*math.pi*q),600)
        return x,y,heading,0,q
    if u<.77:
        q=clamp((u-.57)/.20);f=smooth(clamp((q-.20)/.80));x,y=750-170*f,390+80*f
        h0=math.atan2(112*3*math.pi,600)
        return x,y,angle_lerp(h0,initial,clamp(q/.20)),1,q
    if u<.90:
        q=clamp((u-.77)/.13);return *finish,angle_lerp(initial,aim,q),2,q
    return *finish,aim,3,clamp((u-.90)/.10)


def practice_scene(im,t,u):
    stage(im)
    ppcm=PRACTICE_ROBOT_SIZE/TOP_CANVAS_CM
    d=ImageDraw.Draw(im)
    tag(d,(86,190,397,228),'אימון: מסלול, איסוף ודיוק',size=20)
    planned=[slalom(j/120) for j in range(121)]
    for j in range(0,119,4):d.line(planned[j:j+3],fill='#50748F',width=2)
    for x in [250,450,650]:cone(im,x,390,.55)
    x,y,h,phase,q=practice_state(u)
    if phase==0:
        n=max(2,int(q*120));d.line(planned[:n],fill=GOLD,width=4,joint='curve')
    else:
        d.line(planned,fill='#567E99',width=2,joint='curve')
        pickup=[(750-170*j/70,390+80*j/70) for j in range(71)]
        if phase==1:d.line(pickup[:max(2,int(smooth(clamp((q-.20)/.80))*70))],fill=GOLD,width=4,joint='curve')
    if phase<2:
        for j,f in enumerate([.50,.82]):
            bx,by=750-170*f,390+80*f
            travelled=math.hypot(x-750,y-390)
            distance=math.hypot(170,80)*f
            entry=83*ppcm
            if phase==0 or travelled<distance-entry+10:
                if phase==1 and travelled>distance-entry:
                    a=clamp((travelled-(distance-entry))/10)
                    rear=(x-83*ppcm*math.cos(h),y-83*ppcm*math.sin(h))
                    bx=bx+(rear[0]-bx)*a;by=by+(rear[1]-by)*a
                ball(im,bx,by,fuel_radius(ppcm))
    if phase>=2:
        cx,cy=(215,263)
        hexagon=[(cx+31*math.cos(k*math.tau/6),cy+22*math.sin(k*math.tau/6)) for k in range(6)]
        d.polygon(hexagon,fill='#152B3C',outline=MINT if phase==3 or q>.85 else BLUE,width=3)
        d.ellipse((cx-11,cy-11,cx+11,cy+11),outline=MINT,width=2)
        front=(x+43*ppcm*math.cos(h),y+43*ppcm*math.sin(h))
        if phase==2:
            length=340
            for bound,coord,v in [(806,front[0],math.cos(h)),(86,front[0],math.cos(h)),(530,front[1],math.sin(h)),(243,front[1],math.sin(h))]:
                if abs(v)>.001 and (bound-coord)/v>0:length=min(length,(bound-coord)/v)
            end=(front[0]+length*math.cos(h),front[1]+length*math.sin(h))
            for k in range(0,24,2):
                a=k/24;b=(k+1)/24;d.line((front[0]+(end[0]-front[0])*a,front[1]+(end[1]-front[1])*a,front[0]+(end[0]-front[0])*b,front[1]+(end[1]-front[1])*b),fill=MINT if q>.85 else BLUE,width=2)
        else:
            for j in range(2):
                f=(q-j*.23)/.5
                if 0<=f<=1:ball(im,front[0]+(cx-front[0])*f,front[1]+(cy-front[1])*f,fuel_radius(ppcm))
            check(d,cx+43,cy,.65)
    draw_top_robot(im,x,y,h,PRACTICE_ROBOT_SIZE,number='4744',extension=smooth((u-.55)/.04))
    d=ImageDraw.Draw(im)
    text(d,(1192,225),'מתרגלים שליטה',40,GOLD,True,'rm',width=340)
    for j,word in enumerate(['פניות במסלול','איסוף בתנועה','יישור למטרה']):focus_step(d,1180,294+j*48,word,j==min(2,phase))
    drive=1 if phase==0 else -1 if phase==1 and q>.2 else 0
    vx,vy=math.cos(h)*drive,math.sin(h)*drive
    controller(im,1035,493,vx,vy,math.sin(h) if phase==0 else 0,.85)
    for j,cx in enumerate([287,445,602]):
        complete=(phase>0 or q>[.28,.62,.95][j])
        d.ellipse((cx-13,550,cx+13,576),fill=MINT if complete else '#34546D')
        if complete:check(d,cx,563,.38,'#153A32')
        else:text(d,(cx,563),str(j+1),16,BLUE,True)


def top_robot(im,x,y,color,num,t=0,size=71):
    draw_top_robot(im,x,y,-math.pi/2 if color==RED else math.pi/2,size,color,'4744' if num=='A' else num)


def event_scene(im,t,u):
    stage(im)
    if u<.58:
        draw_field(im,(78,222,815,567))
        positions=[(163,305),(198,399),(165,501),(733,305),(699,399),(737,501)]
        ends=[(187,325),(178,407),(185,486),(715,325),(717,407),(715,486)]
        game=1 if u<.29 else 2;progress=smooth((u if game==1 else u-.29)/.22)
        ids=['A','B','C','D','E','F'] if game==1 else ['A','E','F','D','B','C']
        for j,((x,y),(qx,qy)) in enumerate(zip(positions,ends)):
            top_robot(im,x+(qx-x)*progress,y+(qy-y)*progress,RED if j<3 else CYAN,ids[j],t,round(field_scale(737,345)*TOP_CANVAS_CM))
        d=ImageDraw.Draw(im)
        tag(d,(90,192,332,231),'ברית אדומה · 3',RED,size=22)
        tag(d,(556,192,803,231),'ברית כחולה · 3',CYAN,size=22)
        tag(d,(347,193,544,230),f'משחק דירוג {game}',BLUE,size=19)
        side(d,'שתי בריתות',['שלושה רובוטים בצד','השותפים מתחלפים','מתאמים משימות'],min(2,int(u/.58*3)))
    else:
        d=ImageDraw.Draw(im);text(d,(445,238),'בוחרים ברית קבועה למשחקי הגמר',30,GOLD,True,width=690)
        q=smooth((u-.58)/.16)
        for j in range(3):
            cx=240+j*205;cy=411-40*q
            d.rounded_rectangle((cx-85,290,cx+85,486),17,fill='#203F57',outline=GOLD,width=2)
            top_robot(im,cx,cy,CYAN,'ABC'[j],t)
            if j<2:d.line((cx+88,383,cx+116,383),fill=GOLD,width=4)
        side(d,'ממשיכים יחד',['בחירת בריתות','משחקי גמר','תיקונים ושיתוף פעולה'],min(2,int((u-.58)/.42*3)))


def districts(im,t,u):
    stage(im);d=ImageDraw.Draw(im);centers=[708,445,182]
    for j,cx in enumerate(centers):
        if j<2:draw_field(im,(cx-106,254,cx+106,361))
        else:trophy(im,cx,310,.7)
        tag(ImageDraw.Draw(im),(cx-106,389,cx+106,436),['דיסטריקט ראשון','דיסטריקט נוסף','אליפות ישראל'][j],GOLD if u>[.08,.38,.73][j] else BLUE,size=21)
    d=ImageDraw.Draw(im)
    for j in range(2):arrow(d,(centers[j]-110,322),(centers[j+1]+112,322),GOLD if u>[.3,.7][j] else '#486A83',3)
    for j,at in enumerate([.18,.43]):
        q=clamp((u-at)/.22)
        if 0<q<1:
            x=centers[j]+(558-centers[j])*smooth(q);y=369+131*q-70*math.sin(q*math.pi)
            d.ellipse((x-17,y-17,x+17,y+17),fill=GOLD,outline='#B48747',width=2);text(d,(x,y),'+',24,DARK,True)
    d.rounded_rectangle((106,489,806,521),9,fill='#254A65',outline='#527C99',width=1)
    fill=.43*smooth((u-.25)/.15)+.48*smooth((u-.51)/.17)
    if fill>0:d.rounded_rectangle((806-700*fill,489,806,521),9,fill=GOLD)
    text(d,(457,552),'ביצועים ופרסים מצטברים לדירוג העונתי',23,BLUE,True)
    side(d,'הנקודות מצטברות',['תוצאות המשחקים','בחירת בריתות','פרסים'],min(2,int(u*3)))


def qualify(im,t,u):
    d=ImageDraw.Draw(im)
    d.rounded_rectangle((61,182,1220,580),21,fill='#19344B',outline='#355C77',width=1)
    # Two generic eligibility routes merge into one checkpoint, not a fictitious win.
    for y,label in [(285,'דירוג עונתי'),(474,'מסלול מזכה')]:
        tag(d,(934,y-35,1184,y+35),label,size=27)
        path=[(933,y),(820,y),(727,378)]
        d.line(path,fill='#5C809A',width=4,joint='curve')
        q=clamp((u-(.15 if y==285 else .32))/.35)
        if 0<q<1:
            x,yy=route_point(path,smooth(q));d.ellipse((x-8,yy-8,x+8,yy+8),fill=GOLD)
    trophy(im,1057,372,.48)
    d.ellipse((616,321,730,435),fill='#294D63',outline=GOLD,width=3)
    if u>.47:check(d,673,378,1.15)
    else:text(d,(673,378),'?',56,GOLD,True)
    text(d,(673,289),'לפי כללי ההעפלה',24,BLUE,True)
    arrow(d,(608,378),(493,378),GOLD if u>.5 else BLUE,4)
    robot(im,670,574,.48,t,fill_count=0)
    boarding(im,(92,299,486,442),ease((u-.40)/.19))
    text(d,(290,490),'מקום לאליפות העולם',27,GOLD,True)
    text(d,(290,552),'מספר המקומות מוגבל',22,BLUE,True)
    text(d,(1025,552),'ההעפלה אינה אוטומטית',22,BLUE,True)


def departure(im,t,u):
    stage(im);d=ImageDraw.Draw(im)
    start=(748,341);end=(156,341)
    points=[(start[0]+(end[0]-start[0])*j/90,341-106*math.sin(j/90*math.pi)) for j in range(91)]
    d.line(points,fill='#537A96',width=3)
    q=smooth(clamp((u-.06)/.76));path=points[:max(2,round(q*90))];d.line(path,fill=GOLD,width=4)
    for x,label in [(748,'ישראל'),(156,'יוסטון, ארה״ב')]:
        d.ellipse((x-7,334,x+7,348),fill=GOLD);text(d,(x,373),label,24,WHITE,True)
    x=start[0]+(end[0]-start[0])*q;y=341-106*math.sin(q*math.pi)
    draw_plane(im,x,y,(-592,-106*math.pi*math.cos(q*math.pi)),.72)
    boarding(im,(247,434,754,568))
    if u<.58:side(ImageDraw.Draw(im),'היעד העולמי',['הקבוצות שהעפילו','יוסטון, ארצות הברית','מפגש עם קבוצות מהעולם'],min(2,int(u/.58*3)))
    else:
        people_network(im,1035,398,t,.96)
        text(ImageDraw.Draw(im),(1191,234),'פוגשים את העולם',38,GOLD,True,'rm',width=338)
        text(ImageDraw.Draw(im),(1038,563),'קבוצות · רעיונות · שיתוף',24,BLUE,True)


def mini_icon(im,kind,cx,cy):
    d=ImageDraw.Draw(im)
    if kind=='reveal':draw_field(im,(cx-79,cy-41,cx+79,cy+39))
    elif kind=='strategy':
        draw_element(im,'hub',cx-22,cy+45,.25)
        for j in range(3):ball(im,cx+22+j*17,cy-17-j*11,fuel_radius(1.2*.25))
    elif kind=='build':robot(im,cx,cy+55,.45,fill_count=0)
    elif kind=='districts':
        for j,h in enumerate([27,45,66]):d.rounded_rectangle((cx-51+j*37,cy+32-h,cx-28+j*37,cy+32),3,fill=GOLD if j==2 else '#5B88A7')
    elif kind=='qualify':trophy(im,cx,cy,.55)
    elif kind=='departure':draw_plane(im,cx,cy,(1,0),.66)


@functools.lru_cache(2)
def background():
    im=brand_image('space-content.png').resize((1280,720),Image.Resampling.LANCZOS).copy()
    im.alpha_composite(Image.new('RGBA',im.size,(3,13,25,170)))
    return im


def diagram_frame(scene,index,total,t=None,caption=None):
    duration=scene.get('duration',14)
    if t is None:
        moments={'opening':.58,'reveal':.49,'strategy':.68,'build':.68,'practice':.43,'alliances':.31,'districts':.84,'qualify':.76,'departure':.57,'recap':.94}
        t=duration*moments.get(scene['diagram'],.5)
    u=clamp(t/max(1,duration-.5));im=background().copy();d=ImageDraw.Draw(im)
    logo=brand_image('logo.png').copy();logo.thumbnail((58,58));im.alpha_composite(logo,(48,43))
    text(d,(1195,67),scene['title'],48,WHITE,True,'rm',width=1000)
    text(d,(1195,123),scene.get('chapter',''),23,BLUE,False,'rm')
    d.line((62,153,1196,153),fill='#5E8099',width=1)
    funcs={'opening':opening,'reveal':countdown_reveal,'strategy':strategy,'build':build_scene,'practice':practice_scene,'alliances':event_scene,'districts':districts,'qualify':qualify,'departure':departure,'recap':recap}
    funcs[scene['diagram']](im,t,u)
    d=ImageDraw.Draw(im);text(d,(640,607),scene['subtitle'],28,GOLD,True,width=1140)
    for j in range(total):
        x=1194-j*(1128/total);d.line((x-1128/total+8,638,x,638),fill=GOLD if j<=index else '#31516A',width=4)
    word=brand_image('wordmark.png').copy();word.thumbnail((194,28));im.alpha_composite(word,(47,675))
    text(d,(1197,685),f'{index+1:02d} / {total:02d}',18,BLUE,False,'rm')
    text(d,(640,684),'2026 להמחשה · מועדים וכללי העפלה לפי תקנון העונה',15,BLUE)
    if scene.get('_draft'):tag(d,(48,7,360,32),'טיוטה חזותית · ללא קריינות',GOLD,size=15)
    if caption:
        lines=wrapped(caption,25,1110).split('\n');y=720-35-len(lines)*32
        d.rounded_rectangle((45,y-12,1235,708),12,fill=(5,17,30,248))
        for j,line in enumerate(lines):text(d,(640,y+j*32),line,25,WHITE,False,'mt')
    return im.convert('RGB')


shared_render.frame=diagram_frame
video.frame=diagram_frame
from timed_pipeline import install,write_captions
install()


def main():
    p=argparse.ArgumentParser();p.add_argument('--draft',action='store_true');p.add_argument('--preview',action='store_true')
    p.add_argument('--seconds',type=float);p.add_argument('--width',type=int,default=1920);p.add_argument('--fps',type=int,default=30);p.add_argument('--out',type=Path)
    args=p.parse_args();doc=load(PROJECT/'content.json')
    out=args.out or PROJECT/'output'/('revision-5-draft' if args.draft else 'revision-5')
    if args.preview:
        shared_render.storyboard(doc,out/'previews');print(out/'previews/storyboard.jpg');return
    video.render(doc,out,PROJECT/'audio/voices',fps=args.fps,width=args.width,workers=2,draft=args.draft,seconds=args.seconds)
    page=out/'interactive/index.html';s=page.read_text().replace("['INPUT','SELECT','BUTTON','TEXTAREA']","['INPUT','SELECT','BUTTON','TEXTAREA','VIDEO']")
    if args.draft:s=s.replace('<h1>','<p style="color:#ffda9d">טיוטה חזותית — ללא קריינות</p><h1>',1)
    page.write_text(s);write_captions(out)


if __name__=='__main__':main()
