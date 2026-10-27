"""Original shaded robot model based on the user's workshop references.

Dimensions are explanatory proportions, not manufacturing CAD. Two broad foam
rollers, curved aluminium side plates, exposed belt drives, clear hopper walls,
loose diamond netting, Limelight and four swerve modules remain visible.
"""
from __future__ import annotations
import functools,math
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
from davinci_creator.layout import font
from scale_geometry import FUEL_RADIUS

SIZE=(820,580);SS=2;SCALE=4.;CENTER=(350,440);ANCHOR=520


def smooth(v):v=max(0,min(1,v));return v*v*(3-2*v)


def rgb(c):
 c=c.lstrip('#');return np.array([int(c[i:i+2],16) for i in (0,2,4)],float)


class Model:
 def __init__(self,yaw=35,elevation=24,size=SIZE,scale=SCALE,center=CENTER):
  y=math.radians(yaw);e=math.radians(elevation)
  self.right=np.array([math.cos(y),math.sin(y),0.]);self.near=np.array([-math.sin(y),math.cos(y),0.])
  self.up=np.array([0,0,1.]);self.depth=self.near*math.cos(e)+self.up*math.sin(e)
  self.vertical=self.near*math.sin(e)-self.up*math.cos(e)
  self.faces=[];self.lines=[];self.decals=[];self.balls=[]
  self.size=size;self.scale=scale;self.center=center
  self.rotation=np.eye(3);self.translation=np.zeros(3)
 def transform(self,translation=(0,0,0),heading=0):
  c,s=math.cos(heading),math.sin(heading)
  self.rotation=np.array([[c,-s,0],[s,c,0],[0,0,1.]])
  self.translation=np.array(translation,float)
 def world(self,points):return np.array(points,float)@self.rotation.T+self.translation
 def project(self,p):
  p=np.array(p,float);return (self.center[0]+self.scale*np.dot(p,self.right),self.center[1]+self.scale*np.dot(p,self.vertical))
 def face(self,vertices,color,alpha=255,outline=None,background=False):
  a=self.world(vertices)
  n=np.cross(a[1]-a[0],a[2]-a[0]);length=np.linalg.norm(n)
  light=np.array([-.4,.45,.8]);light/=np.linalg.norm(light)
  brightness=.68+.40*abs(float(np.dot(n/max(length,1e-8),light)))
  base=rgb(color);shade=tuple(np.clip(base*brightness,0,255).astype(int))+(alpha,)
  self.faces.append((-1000000 if background else float(np.mean(a@self.depth)),a,shade,outline))
 def line(self,points,color='#9CAEB9',width=1):
  a=self.world(points);self.lines.append((float(np.mean(a@self.depth))+.15,a,color,width))
 def sphere(self,p,r=FUEL_RADIUS,color='#E9CE34'):
  p=self.world(p);self.balls.append((float(p@self.depth),p,r,color))
 def box(self,lo,hi,color,alpha=255,outline=None):
  x,y,z=lo;X,Y,Z=hi
  for vs in [[(x,y,z),(X,y,z),(X,Y,z),(x,Y,z)],[(x,y,Z),(X,y,Z),(X,Y,Z),(x,Y,Z)],
             [(x,y,z),(X,y,z),(X,y,Z),(x,y,Z)],[(x,Y,z),(X,Y,z),(X,Y,Z),(x,Y,Z)],
             [(x,y,z),(x,Y,z),(x,Y,Z),(x,y,Z)],[(X,y,z),(X,Y,z),(X,Y,Z),(X,y,Z)]]:
   self.face(vs,color,alpha,outline)
 def beam(self,p,q,r=.9,color='#A0ADB6'):
  p=np.array(p,float);q=np.array(q,float);v=q-p;v/=max(1e-8,np.linalg.norm(v));ref=np.array([0,0,1.])
  if abs(np.dot(v,ref))>.9:ref=np.array([0,1.,0])
  a=np.cross(v,ref);a/=np.linalg.norm(a);b=np.cross(v,a)
  corners=[a*r+b*r,-a*r+b*r,-a*r-b*r,a*r-b*r]
  self.face([p+c for c in corners],color);self.face([q+c for c in corners],color)
  for k in range(4):self.face([p+corners[k],p+corners[(k+1)%4],q+corners[(k+1)%4],q+corners[k]],color)
 def cylinder_y(self,x,z,y1,y2,r,color='#343A3F',segments=24,phase=0,rings=False):
  pts=[(x+r*math.cos(math.tau*k/segments+phase),z+r*math.sin(math.tau*k/segments+phase)) for k in range(segments)]
  for k in range(segments):
   a,b=pts[k],pts[(k+1)%segments]
   self.face([(a[0],y1,a[1]),(b[0],y1,b[1]),(b[0],y2,b[1]),(a[0],y2,a[1])],color)
  for y in [y1,y2]:self.face([(px,y,pz) for px,pz in pts],'#A9B3BB')
  if rings:
   for y in np.linspace(y1+2,y2-2,11):self.line([(px,y,pz) for px,pz in pts+[pts[0]]],'#252C31',.75)
 def pulley(self,x,z,y,r,phase):
  self.cylinder_y(x,z,y-.8,y+.8,r,'#1C242B',20,phase)
  self.cylinder_y(x,z,y+.85,y+1.1,r*.32,'#8F9CA5',16)
  for k in range(5):
   a=phase+k*math.tau/5
   self.line([(x+r*.42*math.cos(a),y+1.15,z+r*.42*math.sin(a)),(x+r*.82*math.cos(a),y+1.15,z+r*.82*math.sin(a))],'#6D7C87',1.2)
 def decal(self,p,text,size=22,color='#FFFFFF',angle=6):self.decals.append((self.world(p),text,size,color,angle))
 def render(self):
  out=Image.new('RGBA',(self.size[0]*SS,self.size[1]*SS));d=ImageDraw.Draw(out)
  elements=[(z,'face',(a,c,o)) for z,a,c,o in self.faces]+[(z,'line',(a,c,w)) for z,a,c,w in self.lines]
  elements += [(z,'ball',(p,r,c)) for z,p,r,c in self.balls]
  elements.sort(key=lambda e:e[0])
  for _,kind,data in elements:
   if kind=='ball':
    p,r,c=data;x,y=self.project(p);x*=SS;y*=SS;r*=self.scale*SS
    d.ellipse((x-r,y-r,x+r,y+r),fill='#AD8F16')
    d.ellipse((x-r*.94,y-r*.96,x+r*.88,y+r*.83),fill=c)
    d.ellipse((x-r*.66,y-r*.69,x+r*.10,y+r*.06),fill='#FAE76B')
    continue
   a,color,extra=data;pts=[tuple(round(v*SS) for v in self.project(p)) for p in a]
   if kind=='face':
    if color[3]<255:
     # Blend translucent polycarbonate/net faces over geometry already drawn.
     # Drawing RGBA directly would erase the funnel and mechanism behind them.
     x0=max(0,min(p[0] for p in pts));y0=max(0,min(p[1] for p in pts))
     x1=min(out.width,max(p[0] for p in pts)+1);y1=min(out.height,max(p[1] for p in pts)+1)
     if x1>x0 and y1>y0:
      tile=Image.new('RGBA',(x1-x0,y1-y0))
      ImageDraw.Draw(tile).polygon([(x-x0,y-y0) for x,y in pts],fill=color)
      out.alpha_composite(tile,(x0,y0))
    else:d.polygon(pts,fill=color)
    if extra:d.line(pts+[pts[0]],fill=extra,width=SS,joint='curve')
   else:d.line(pts,fill=color,width=max(1,round(extra*SS)),joint='curve')
  for p,txt,size,color,angle in self.decals:
   size=max(5,round(size*self.scale/SCALE))
   xy=self.project(p);f=font(size*SS,True);box=f.getbbox(txt);w=box[2]-box[0]+SS*10;h=size*SS*2
   tile=Image.new('RGBA',(w,h));ImageDraw.Draw(tile).text((w/2,h/2),txt,font=f,fill=color,anchor='mm')
   tile=tile.rotate(angle,resample=Image.Resampling.BICUBIC,expand=True)
   out.alpha_composite(tile,(round(xy[0]*SS-tile.width/2),round(xy[1]*SS-tile.height/2)))
  return out.resize(self.size,Image.Resampling.LANCZOS)


def add_shooter(m,progress,phase):
 dz=28*(1-smooth(progress));upper=(-12,73+dz);lower=(-40,51+dz)
 # Curved aluminium cheeks are open trusses, so the broad foam cylinders show.
 contour=[(-45,23+dz),(-46,50+dz),(-39,59+dz),(-29,59+dz),(-17,78+dz),(-8,79+dz),(-5,59+dz),(1,29+dz),(-10,23+dz)]
 for yy in [-32,32]:
  for a,b in zip(contour,contour[1:]+contour[:1]):m.beam((a[0],yy,a[1]),(b[0],yy,b[1]),.9,'#C6CED4')
  for a,b in [((-44,29),(-16,69)),((-44,29),(-3,30)),((-16,69),(-3,30)),((-37,53),(-10,32))]:
   m.beam((a[0],yy,a[1]+dz),(b[0],yy,b[1]+dz),.65,'#9EABB6')
  for xx,zz in [(-42,32),(-39,53),(-15,73),(-7,36)]:
   m.cylinder_y(xx,zz+dz,yy-.9,yy+.9,1.5,'#798996',12)
 # Matte rubber sleeves are wide and ribbed, with metallic end caps.
 m.cylinder_y(lower[0],lower[1],-29,29,10.7,'#4D5357',28,phase*.06,True)
 m.cylinder_y(upper[0],upper[1],-29,29,7.1,'#4D5357',28,phase*.06,True)
 m.cylinder_y(-39,30+dz,-29,29,4.3,'#2B343B',20,phase*.09,True)
 # Dark curved hood between the foam rollers.
 m.face([(-38,-27,49+dz),(-9,-27,69+dz),(-9,27,69+dz),(-38,27,49+dz)],'#10191F')
 pulleys=[(-40,51+dz,5.7),(-12,73+dz,3.5),(-29,26+dz,5),(-6,24+dz,3.7)]
 for x,z,r in pulleys:m.pulley(x,z,35,r,phase)
 for a,b in [(pulleys[0],pulleys[1]),(pulleys[0],pulleys[2]),(pulleys[2],pulleys[3])]:
  dx=b[0]-a[0];dz2=b[1]-a[1];l=math.hypot(dx,dz2);nx=-dz2/l;nz=dx/l
  for sign in [-1,1]:
   p=(a[0]+sign*nx*a[2],36,a[1]+sign*nz*a[2]);q=(b[0]+sign*nx*b[2],36,b[1]+sign*nz*b[2])
   m.beam(p,q,.65,'#161D23')
   for k in range(13):
    t=(k/13+phase*.007)%1;xx=p[0]+(q[0]-p[0])*t;zz=p[2]+(q[2]-p[2])*t
    m.line([(xx-.35,37,zz-.5),(xx+.35,37,zz+.5)],'#72808B',.7)
 # Visible blue motor casings and two black drive motors behind the mechanism.
 for yy in [-22,22]:
  m.cylinder_y(-3,26+dz,yy-5,yy+5,4.5,'#202B34',18)
  m.box((-7,yy-5,22+dz),(0,yy+5,31+dz),'#315B79')


def add_robot(m,build=1,extension=0,phase=0,color='#C92C39',fill_count=0,cutaway=False):
 p=build;ext=smooth(extension)
 # Four visible, machined swerve modules underneath a square perforated frame.
 for xx in [-33,33]:
  for yy in [-33,33]:
   m.box((xx-6,yy-5,-1),(xx+6,yy+5,9),'#171F28')
   m.box((xx-8,yy-7,8),(xx+8,yy+7,10),'#AEBAC3')
   m.cylinder_y(xx,3,yy-4,yy+4,4.5,'#20282E',18,phase*.08)
   for k in range(6):
    a=k*math.tau/6;m.cylinder_y(xx+4*math.cos(a),10.5,yy-3+4*math.sin(a),yy-2+4*math.sin(a),.7,'#263844',8)
 for yy in [-38,38]:m.box((-45,yy-2,10),(45,yy+2,16),'#A8B6C0')
 for xx in [-45,45]:m.box((xx-2,-38,10),(xx+2,38,16),'#A8B6C0')
 for xx in range(-36,43,9):
  m.box((xx,36,15),(xx+2,40,16),'#243541')
 # Soft, broad red bumper ring preserves the robot's most recognisable silhouette.
 for yy in [-42,42]:m.box((-48,yy-4,4),(48,yy+4,16),color)
 for xx in [-48,48]:m.box((xx-4,-42,4),(xx+4,42,16),color)
 m.decal((7,47,10),'4744',28,angle=9)
 m.decal((-53,0,10),'4744',23,angle=-26)
 if p>.16:
  dz=25*(1-smooth((p-.16)/.3));top=75+dz
  # Clear polycarbonate side walls around the collection bay.
  m.box((1,-33,20+dz),(42,-31,top),'#6A8A9C',80)
  # The rear remains open for the deployable ground intake and inward transfer.
  for yy in [-32,32]:
   for xx in [0,42]:m.beam((xx,yy,18+dz),(xx,yy,top),.75,'#A9B7C1')
  # The reference shows a low, loose diamond net, not a tall wire cage.
  for yy in [-32,32]:m.beam((-14,yy,top),(42,yy,top),1.5,'#141F29')
  for xx in [-14,42]:m.beam((xx,-32,top),(xx,32,top),1.3,'#141F29')
  for k in range(-5,10):
   pts=[]
   for j in range(19):
    xx=-14+j*56/18;yy=k*9+(xx+14)*.7
    if -31<=yy<=31:
     sag=(5-min(fill_count,8)*.20)*math.sin((xx+14)/56*math.pi)*math.cos(yy/64*math.pi)
     pts.append((xx,yy,top-sag))
   if len(pts)>1:m.line(pts,'#111B24',1)
  for k in range(-5,10):
   pts=[]
   for j in range(19):
    xx=-14+j*56/18;yy=k*9-(xx+14)*.7
    if -31<=yy<=31:pts.append((xx,yy,top-(5-min(fill_count,8)*.20)*math.sin((xx+14)/56*math.pi)*math.cos(yy/64*math.pi)))
   if len(pts)>1:m.line(pts,'#111B24',1)
  # Solid near-side shield with white team number; it does not invent sponsor marks.
  m.box((5,32,18+dz),(44,33.2,72+dz),'#111923',70 if cutaway else 255)
  m.decal((25,34,46+dz),'4744',31,angle=9)
  m.decal((25,34,33+dz),'FRC',14,angle=9)
  for xx,zz in [(8,22),(41,22),(8,68),(41,68)]:m.cylinder_y(xx,zz+dz,33.5,34.2,1,'#A8BAC7',10)
  for j in range(min(fill_count,8)):
   m.sphere((5+j%2*17,-18+j//2*16,28+dz))
  for xx in range(-18,40,7):
   m.cylinder_y(xx,19,-29,29,1.25,'#222B31',12,phase*.08)
 if p>.40:add_shooter(m,smooth((p-.40)/.25),phase)
 if p>.68:
  # Rear (+X) carriage translates on the inclined racks shown in the build
  # blog's intake clips. All rack/plate lengths stay fixed while it extends.
  reach=45+38*ext;low=35-24*ext
  for yy in [-34,34]:
   m.beam((6,yy,60),(40,yy,38),2.0,'#687F8F')
   m.beam((reach-64,yy+1,low+40.42),(reach,yy+1,low),1.15,'#CED7DD')
   for k in range(31):
    q=k/30;xx=reach-64+64*q;zz=low+40.42*(1-q)
    m.line([(xx-.5,yy+2,zz-1.3),(xx+.5,yy+2,zz+.3)],'#3D505E',.8)
   m.pulley(38,39,yy+2,3.4,phase)
   m.face([(reach+2,yy,low-3),(reach-10,yy,low+27),(reach-19,yy,low+24),(reach-10,yy,low-3)],'#ABBCC7')
   for xx,zz in [(reach,low),(reach-8,low+26)]:
    m.cylinder_y(xx,zz,yy-.9,yy+.9,2,'#8B9CA7',12)
  m.cylinder_y(reach,low,-33,33,4.8,'#30383D',24,phase*.1,True)
  m.cylinder_y(reach-8,low+26,-33,33,4.5,'#30383D',24,phase*.1,True)
  m.face([(32,-30,20),(reach,-30,low+1),(reach,30,low+1),(32,30,20)],'#172830')
  # Front camera and status lamp visible in the supplied workshop photos.
  m.box((-36,37,20),(-22,42,30),'#0D1720')
  m.box((-37,38,24),(-35,41,27),'#56989A')
  m.box((-21,-34,74),(-16,-29,78),'#C27A22')
  m.beam((-24,34,20),(-6,34,25),.4,'#D4515B')


@functools.lru_cache(160)
def sprite(build_step=100,extension_step=0,phase_step=0,yaw_step=35,color='#C92C39',fill_count=0):
 m=Model(yaw_step)
 add_robot(m,build_step/100,extension_step/100,phase_step/24*math.tau,color,fill_count)
 return m.render()


def draw_robot(im,x,ground,s=1,t=0,build=1,extension=0,fill_count=0,wire=False,color='#C92C39',number='4744',yaw=35):
 scale=.60*s
 image=sprite(round(max(0,min(1,build))*50)*2,round(max(0,min(1,extension))*50)*2,int(t*24)%24,round(yaw*2)/2,color,fill_count)
 image=image.resize((round(SIZE[0]*scale),round(SIZE[1]*scale)),Image.Resampling.LANCZOS)
 im.alpha_composite(image,(round(x-CENTER[0]*scale),round(ground-ANCHOR*scale)))
 return nozzle(x,ground,s,yaw)


def nozzle(x,ground,s=1,yaw=35):
 m=Model(round(yaw*2)/2);px,py=m.project((-43,0,64));scale=.60*s
 return (x+(px-CENTER[0])*scale,ground+(py-ANCHOR)*scale)
