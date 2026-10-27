"""Procedural stage artwork. No competition photos or reference media are loaded."""
from __future__ import annotations
import functools,math,random
from PIL import Image,ImageDraw,ImageFilter
from davinci_creator.layout import font
from motion_art import Art
from scale_geometry import *
from field_model import draw_element

GOLD='#FFDA9D';BLUE='#A9D8F6';RED='#D63D49';CYAN='#529FDA';MINT='#91E2BF';DARK='#0D2031'


def shadow(im,x,y,w,h,opacity=90):
 pad=24;layer=Image.new('RGBA',(round(w+pad*2),round(h+pad*2)));d=ImageDraw.Draw(layer)
 d.ellipse((pad,pad,pad+w,pad+h),fill=(0,7,14,opacity))
 layer=layer.filter(ImageFilter.GaussianBlur(7));im.alpha_composite(layer,(round(x-w/2-pad),round(y-h/2-pad)))


def field_scale(w,h):return min(w-20,(h-20)*FIELD_LENGTH/FIELD_WIDTH)/FIELD_LENGTH


@functools.lru_cache(12)
def field_image(w=760,h=370):
 a=Art(w,h);fw=field_scale(w,h)*FIELD_LENGTH;fh=fw*FIELD_WIDTH/FIELD_LENGTH;y0=(h-fh)/2;x0=(w-fw)/2
 def xy(x,y):return (x0+x/16.54*fw,y0+y/8.07*fh)
 def rect(x1,y1,x2,y2,fill,outline=None):
  p=xy(x1,y1);q=xy(x2,y2);a.rounded((*p,*q),fill,outline,r=2)
 rect(0,0,16.54,8.07,'#344C5C','#8BA2B1')
 rect(0,0,4.03,8.07,'#553D4A');rect(12.51,0,16.54,8.07,'#284D6B')
 for x in [HUB_FRONT/100,8.27,16.54-HUB_FRONT/100]:a.line([xy(x,0),xy(x,8.07)],'#8296A5' if x==8.27 else GOLD,1)
 # Two 1.19m hubs; each is centered between coloured bumps and side trenches.
 for x,color in [(HUB_CENTER_X/100,RED),(16.54-HUB_CENTER_X/100,CYAN)]:
  cx,cy=xy(x,4.035);r=fw/16.54*1.19/2
  a.rounded((cx-r,cy-r,cx+r,cy+r),'#CBD8DD','#EBF3F7',r=2,width=1)
  pts=[(cx+r*.82*math.cos(math.tau*k/6),cy+r*.65*math.sin(math.tau*k/6)) for k in range(6)]
  a.poly(pts,'#101E28',color,2)
  for ya,yb in [(1.5839,3.4381),(4.6319,6.4861)]:
   p=xy(x-.56,ya);q=xy(x+.56,yb)
   a.poly([(p[0],p[1]),(q[0],p[1]),(q[0],q[1]),(p[0],q[1])],color,'#9BACB8',1)
   a.line([(cx,p[1]),(cx,q[1])],'#E2EAF0',1)
  for ya,yb in [(0,1.6675),(6.4025,8.07)]:
   p=xy(x-.55,ya);q=xy(x+.55,yb)
   a.rounded((*p,*q),'#253A49','#A8BAC7',r=1)
   a.line([(p[0],p[1]+3),(p[0],q[1]-3)],color,3)
 # Alliance wall towers and human player outposts remain outside the drive paths.
 for x,sign,color in [(.18,1,RED),(16.36,-1,CYAN)]:
  p=xy(x,3.2);q=xy(x+sign*1.0,4.87)
  a.poly([(p[0],p[1]),(q[0],p[1]),(q[0],q[1]),(p[0],q[1])],'#223744','#9BACB8',1)
  for yy in [3.5,4.0,4.5]:a.line([xy(x,yy),xy(x+sign*.8,yy)],color,2)
 for x,y,color in [(0,1.07,RED),(15.854,5.93,CYAN)]:rect(x,y,x+.686,y+1.07,color,'#E2EAF0')
 rng=random.Random(4744)
 for _ in range(38):
  xx=rng.uniform(6.3,10.2);yy=rng.uniform(1.1,7.0);cx,cy=xy(xx,yy)
  r=fuel_radius(fw/FIELD_LENGTH)
  a.ellipse((cx-r,cy-r,cx+r,cy+r),'#E8CF3C')
 return a.finish()


def draw_field(im,box,alpha=1):
 x,y,x2,y2=map(round,box);src=field_image(x2-x,y2-y).copy()
 if alpha<1:src.putalpha(src.getchannel('A').point(lambda a:round(a*alpha)))
 im.alpha_composite(src,(x,y))


@functools.lru_cache(100)
def top_sprite(color=RED,number='4744',angle=0,size=80,extension=0):
 # Canvas represents 180 cm; local front is -X, rear intake is +X.
 a=Art(180,180)
 a.rounded((38,44,142,136),color,'#D8E4EC',r=7,width=2)
 a.rounded((44,50,136,130),'#8B9CA8',r=3)
 a.rounded((73,55,129,125),'#183041','#7896A8',r=2)
 for k in range(6):
  x=76+k*9;a.line([(x,57),(x,123)],'#426478',1)
 for k in range(6):
  yy=57+k*13;a.line([(75,yy),(127,yy)],'#426478',1)
 for xx in [50,70]:a.rounded((xx-6,53,xx+6,127),'#29383E','#D7E2E7',r=5,width=1)
 reach=135+38*extension
 for yy in [55,125]:
  a.line([(96,yy),(130,yy)],'#667D8C',3)
  a.line([(reach-64,yy),(reach,yy)],'#D5E0E7',1.6)
 a.rounded((reach-4,55,reach+2,125),'#29383E','#B9CBD7',r=3,width=1)
 a.text((100,92),number,17,'#FAFCFF',True)
 src=a.finish().resize((size,size),Image.Resampling.LANCZOS)
 return src.rotate(180-angle,resample=Image.Resampling.BICUBIC,expand=True)


def draw_top_robot(im,x,y,heading=0,size=80,color=RED,number='4744',extension=0):
 src=top_sprite(color,number,round(math.degrees(heading)*2)/2,size,round(extension*40)/40)
 shadow(im,x,y+5,size*.65,size*.58,75)
 im.alpha_composite(src,(round(x-src.width/2),round(y-src.height/2)))


def cone(im,x,y,s=1):
 a=Art(80,100)
 a.poly([(13,77),(57,77),(72,89),(26,89)],'#402B25')
 a.poly([(22,75),(35,19),(47,75)],'#DF944B','#F8D0A2',1.2)
 a.poly([(47,75),(35,19),(58,74)],'#A65C30','#E1A574',1)
 a.poly([(27,51),(44,51),(48,63),(25,63)],'#F2E7DB')
 src=a.finish().resize((round(80*s),round(100*s)),Image.Resampling.LANCZOS)
 im.alpha_composite(src,(round(x-37*s),round(y-83*s)))


def controller(im,x,y,vx=0,vy=0,turn=0,s=1):
 a=Art(300,190)
 shape=[(32,55),(80,29),(220,29),(268,55),(288,135),(271,161),(240,157),(209,121),(91,121),(60,157),(29,161),(12,135)]
 a.poly(shape,'#344F64','#B8CEDD',2)
 for cx in [89,207]:a.ellipse((cx-31,66,cx+31,128),'#152B3D','#7CA1BA',2)
 a.ellipse((75+vx*15,83+vy*15,103+vx*15,111+vy*15),'#B2C4D0','#EAF2F6',2)
 a.ellipse((193+turn*12,83,221+turn*12,111),'#B2C4D0','#EAF2F6',2)
 for xx,yy,c in [(245,52,MINT),(259,66,GOLD),(245,80,CYAN),(231,66,RED)]:a.ellipse((xx-5,yy-5,xx+5,yy+5),c)
 a.rounded((37,61,61,72),'#D5E0E7',r=2);a.rounded((44,54,55,79),'#D5E0E7',r=2)
 a.line([(140,62),(160,62)],GOLD,3)
 src=a.finish().resize((round(300*s),round(190*s)),Image.Resampling.LANCZOS)
 im.alpha_composite(src,(round(x-150*s),round(y-95*s)))


def tower(im,x,ground,s=.85):
 return draw_element(im,'tower',x,ground,s)


def rules_book(im,x,y,s=1,progress=1):
 a=Art(220,265)
 a.poly([(34,29),(181,16),(193,242),(47,255)],'#8B9EAC','#C2D4E0',1)
 a.rounded((24,12,181,241),'#E1E8EC','#A7C0D2',r=7,width=2)
 a.rounded((39,29,165,77),'#254B65',r=3);a.text((102,53),'RULES',24,GOLD,True)
 for j in range(3):
  yy=108+j*43;a.line([(56,yy),(150,yy)],'#768D9D',3)
  if progress>(j+1)/4:a.line([(43,yy-1),(48,yy+5),(57,yy-8)],'#3D9274',3)
 src=a.finish().resize((round(220*s),round(265*s)),Image.Resampling.LANCZOS)
 im.alpha_composite(src,(round(x-110*s),round(y-132*s)))


def people_network(im,x,y,t=0,s=1):
 a=Art(280,230)
 nodes=[(140,53),(58,128),(224,128),(140,192)]
 for i,(xx,yy) in enumerate(nodes):
  for j,(qx,qy) in enumerate(nodes):
   if j>i:a.line([(xx,yy),(qx,qy)],'#5A809C',1.2)
  color=[GOLD,CYAN,MINT,'#CF91B0'][i]
  a.ellipse((xx-13,yy-27,xx+13,yy-1),color)
  a.rounded((xx-24,yy+3,xx+24,yy+26),'#2C4F68',color,r=10,width=2)
 src=a.finish().resize((round(280*s),round(230*s)),Image.Resampling.LANCZOS)
 im.alpha_composite(src,(round(x-140*s),round(y-115*s)))
