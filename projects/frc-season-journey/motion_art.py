"""Antialiased original vector primitives and direction-aware plane."""
from __future__ import annotations
import math
from pathlib import Path
from PIL import Image, ImageDraw
from davinci_creator.layout import font

SS=2
INK='#0B1722'; RED='#C92C39'; EDGE='#AFC0CC'; GOLD='#FFDA9D'; BLUE='#A9D8F6'


def smooth(x):
 x=max(0,min(1,x));return x*x*(3-2*x)


class Art:
 def __init__(self,w,h):
  self.im=Image.new('RGBA',(w*SS,h*SS));self.d=ImageDraw.Draw(self.im);self.w=w;self.h=h
 def pts(self,points):return [(round(x*SS),round(y*SS)) for x,y in points]
 def poly(self,points,fill,outline=None,width=1):
  p=self.pts(points);self.d.polygon(p,fill=fill)
  if outline:self.d.line(p+[p[0]],fill=outline,width=max(1,round(width*SS)),joint='curve')
 def line(self,points,color=EDGE,width=2):self.d.line(self.pts(points),fill=color,width=max(1,round(width*SS)),joint='curve')
 def ellipse(self,box,fill,outline=None,width=1):self.d.ellipse(tuple(round(v*SS) for v in box),fill=fill,outline=outline,width=max(1,round(width*SS)))
 def rounded(self,box,fill,outline=None,r=6,width=1):self.d.rounded_rectangle(tuple(round(v*SS) for v in box),r*SS,fill=fill,outline=outline,width=max(1,round(width*SS)))
 def text(self,xy,value,size,color='white',bold=False,angle=0):
  f=font(size*SS,bold);b=f.getbbox(value);w=max(1,b[2]-b[0]+12*SS);h=size*SS*2
  tile=Image.new('RGBA',(w,h));d=ImageDraw.Draw(tile);d.text((w/2,h/2),value,font=f,fill=color,anchor='mm')
  if angle:tile=tile.rotate(angle,resample=Image.Resampling.BICUBIC,expand=True)
  self.im.alpha_composite(tile,(round(xy[0]*SS-tile.width/2),round(xy[1]*SS-tile.height/2)))
 def finish(self):return self.im.resize((self.w,self.h),Image.Resampling.LANCZOS)
















def plane_points(x,y,velocity,s=.6):
 dx,dy=velocity;length=math.hypot(dx,dy)
 fx,fy=dx/length,dy/length;rx,ry=-fy,fx
 local=[(52,0),(5,-8),(-18,-36),(-32,-36),(-16,-7),(-37,-7),(-45,-18),(-52,-18),(-47,0),(-52,18),(-45,18),(-37,7),(-16,7),(-32,36),(-18,36),(5,8)]
 return [(x+s*(fx*a+rx*b),y+s*(fy*a+ry*b)) for a,b in local]


def draw_plane(im,x,y,velocity,s=.6):
 # Geometry is oriented directly along the path derivative. Nose is first point.
 a=Art(180,180);pts=plane_points(90,90,velocity,s)
 a.poly(pts,'#F1F7FB',GOLD,1.3)
 dx,dy=velocity;l=math.hypot(dx,dy)
 a.line([(90+dx/l*33*s,90+dy/l*33*s),(90+dx/l*9*s,90+dy/l*9*s)],'#6095B7',2)
 im.alpha_composite(a.finish(),(round(x-90),round(y-90)))
