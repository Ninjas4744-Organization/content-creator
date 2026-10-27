"""Original centimetre-based 3D REBUILT field and mechanism demonstrations."""
from __future__ import annotations

import functools
import math
import random
from PIL import Image
from robot_model import Model, add_robot, smooth
from scale_geometry import *

RED = '#C92C39'
BLUE = '#438FC9'
STEEL = '#A6B8C4'


def add_hub(m, color=RED, details=False):
    """Local -X face points into the alliance zone; net is at +X."""
    a = HUB_SIDE / 2
    m.box((-a, -a, 0), (a, a, 143), '#233D4B')
    for x in [-a, a]:
        for y in [-a, a]:
            m.beam((x, y, 0), (x, y, 147), 1.6, STEEL)
    for z in [3, 143]:
        for y in [-a, a]:m.beam((-a,y,z),(a,y,z),1.6,STEEL)
    # Six sloping transparent panels lead into the actual 1.06 m opening.
    r = HUB_OPENING / math.sqrt(3)
    ring = [(r*math.cos(math.tau*k/6),r*math.sin(math.tau*k/6),HUB_RIM_HEIGHT) for k in range(6)]
    inner = [(x*.61,y*.61,148) for x,y,z in ring]
    m.face(inner, '#071720')
    for k in range(6):
        j=(k+1)%6
        m.face([inner[k],inner[j],ring[j],ring[k]],'#B6CCD6',100)
        m.beam(ring[k],ring[j],1.2,color)
    # Triangular side profiles and a vertical rear safety net, not a flat halo.
    for y in [-a,a]:
        m.beam((-a,y,151),(a,y,286),1.25,STEEL)
        m.beam((a,y,147),(a,y,286),1.25,STEEL)
        m.face([(-a,y,151),(a,y,286),(a,y,147)],'#14252C',20)
        for j in range(1,9):
            q=j/9;x=-a+2*a*q
            m.line([(x,y,148),(x,y,151+135*q)],'#556873',.5)
    m.face([(a,-a,147),(a,a,147),(a,a,286),(a,-a,286)],'#13232C',35)
    for z in range(153,286,12):m.line([(a,-a,z),(a,a,z)],'#52646F',.5)
    for y in range(-50,60,12):m.line([(a,y,147),(a,y,286)],'#52646F',.5)
    m.beam((a,-a,286),(a,a,286),1.3,STEEL)
    # Base exits face the neutral zone.
    for y in [-40,-13,13,40]:m.box((a-.7,y-8,2),(a+1,y+8,18),'#08141C')
    # Registration panels convey vision targets without inventing working tags.
    for y in [-28,26]:
        m.face([(-a-1,y-10,102),(-a-1,y+10,102),(-a-1,y+10,122),(-a-1,y-10,122)],'#E9F2F5')
        m.face([(-a-1.2,y-7,105),(-a-1.2,y+7,105),(-a-1.2,y+7,119),(-a-1.2,y-7,119)],'#15252D')
    if details:
        m.decal((-a-2,0,76),'REBUILT',17,angle=3)
        m.decal((-a-2,0,54),'2026',13,angle=3)


def add_bump(m, color=RED):
    a,b=BUMP_DEPTH/2,BUMP_WIDTH/2
    m.face([(-a,-b,0),(0,-b,BUMP_HEIGHT),(0,b,BUMP_HEIGHT),(-a,b,0)],color)
    m.face([(0,-b,BUMP_HEIGHT),(a,-b,0),(a,b,0),(0,b,BUMP_HEIGHT)],color)
    for y in [-b,b]:m.face([(-a,y,0),(a,y,0),(0,y,BUMP_HEIGHT)],'#692B38')
    m.line([(0,-b,BUMP_HEIGHT),(0,b,BUMP_HEIGHT)],'#E8B9BD',1)


def add_trench(m, color=RED):
    a,b=TRENCH_DEPTH/2,TRENCH_WIDTH/2
    # Broad horizontal arm is a low passage; the taller side pod is at the rail.
    m.box((-a,-b,TRENCH_CLEARANCE),(a,b,TRENCH_CLEARANCE+8),color)
    m.box((-a,-b,0),(a,-b+20,TRENCH_HEIGHT),color)
    m.box((-a,b-20,0),(a,b,TRENCH_CLEARANCE),'#263E4D')
    m.box((-15,-b+3,TRENCH_HEIGHT),(15,-b+20,TRENCH_HEIGHT+20),'#D9E5E9')


def add_tower(m, color=RED):
    """Wall at -X; upright pair and all three round rungs extend into field."""
    m.box((0,-TOWER_WIDTH/2,0),(TOWER_DEPTH,TOWER_WIDTH/2,1),'#283A46')
    m.box((-4,-70,0),(0,70,TOWER_HEIGHT),'#344D5E')
    for y in [-43,43]:
        m.box((95,y-2,0),(104,y+2,183.1),color)
        m.beam((0,y,100),(99,y,75),1.8,STEEL)
    for z in RUNG_HEIGHTS:m.cylinder_y(100,z,-60,60,2.108,color,16)


def add_field(m, reveal=1, fuel=True):
    """All field components share centimetres with 4744 and FUEL."""
    L,W=FIELD_LENGTH,FIELD_WIDTH
    # Large ground polygons must be drawn before objects on both field halves.
    # Sorting their average depth with robots would incorrectly hide far robots.
    m.face([(-L/2,-W/2,0),(L/2,-W/2,0),(L/2,W/2,0),(-L/2,W/2,0)],'#344A58',background=True)
    for x1,x2,color in [(-L/2,-L/2+HUB_FRONT,'#533E4B'),(L/2-HUB_FRONT,L/2,'#284A63')]:
        m.face([(x1,-W/2,.1),(x2,-W/2,.1),(x2,W/2,.1),(x1,W/2,.1)],color,background=True)
    m.line([(0,-W/2,.4),(0,W/2,.4)],'#C0D1DA',1.1)
    for y in [-W/2,W/2]:
        m.beam((-L/2,y,50.8),(L/2,y,50.8),1.4,STEEL)
        for x in range(-800,801,100):m.beam((x,y,0),(x,y,50.8),1,STEEL)
    for side,color in [(-1,RED),(1,BLUE)]:
        hx=side*(L/2-HUB_CENTER_X)
        # The two zones are mirrors under a 180-degree rotation.
        angle=0 if side==-1 else math.pi
        z=(1-smooth(reveal))*180
        m.transform((hx,0,z),angle);add_hub(m,color)
        for y in [-HUB_SIDE/2-BUMP_WIDTH/2,HUB_SIDE/2+BUMP_WIDTH/2]:
            m.transform((hx,y,z*.35));add_bump(m,color)
        for y in [-W/2+TRENCH_WIDTH/2,W/2-TRENCH_WIDTH/2]:
            m.transform((hx,y,z*.45));add_trench(m,color)
        m.transform((side*L/2,0,z),0 if side==-1 else math.pi);add_tower(m,color)
        # Small depot, open toward the field, at the opposite corner to outpost.
        depot_y=-260 if side==-1 else 260
        for yy in [-53.5,53.5]:
            m.transform((side*(L/2-34),depot_y+yy,0));m.box((-34,-3,0),(34,3,2.86),color)
        m.transform()
        for y in [-290,-100,220]:
            m.box((side*L/2-3,y-70,0),(side*L/2+3,y+70,107),'#638092',65)
    m.transform()
    if fuel:
        rng=random.Random(4744)
        for _ in range(90):m.sphere((rng.uniform(-190,190),rng.uniform(-300,300),FUEL_RADIUS))


def field_screen(t, reveal=1, size=(704,310)):
    # A slow physical camera orbit makes the kickoff reveal genuinely 3D.
    yaw=-18+7*math.sin(t*.16)
    m=Model(yaw,34,size,.32,(size[0]/2,size[1]*.64))
    add_field(m,reveal)
    if reveal>.9:
        for side,color in [(-1,RED),(1,BLUE)]:
            for j,y in enumerate([-240,20,240]):
                x=side*(640-18*math.sin(t*.7+j))
                m.transform((x,y,0),math.pi if side==-1 else 0)
                m.box((-52,-46,3),(52,46,16),color)
                m.box((-28,-32,18),(37,32,58),'#2D3B45')
                for z,xoff in [(46,-42),(64,-14)]:m.cylinder_y(xoff,z,-31,31,7,'#71828D',12)
        m.transform()
        f=(t*.42)%1
        # A single scaled FUEL arcs from the alliance zone into its own HUB.
        if f<.75:
            q=f/.75
            m.sphere((-585+220*q,20*(1-q),62+(HUB_RIM_HEIGHT+FUEL_RADIUS-62)*q+4*80*q*(1-q)))
    return m.render()


def mechanism_state(t):
    """One ball: rear ground -> intake -> indexer -> front shooter -> HUB."""
    q=(t%7.4)/7.4
    extension=smooth(q/.15)
    if q<.15:return q,extension,'deploy',(124,0,FUEL_RADIUS)
    if q<.36:
        f=smooth((q-.15)/.21)
        return q,extension,'collect',(124+(65-124)*f,0,FUEL_RADIUS)
    if q<.53:
        f=smooth((q-.36)/.17)
        return q,extension,'transfer',(65+(-34-65)*f,0,FUEL_RADIUS+(33-FUEL_RADIUS)*f)
    if q<.61:
        f=smooth((q-.53)/.08)
        return q,extension,'transfer',(-34-9*f,0,33+29*f)
    if q<.86:
        f=(q-.61)/.25
        start=(122,0,62);end=(-235,0,HUB_RIM_HEIGHT+FUEL_RADIUS)
        return q,extension,'shoot',tuple(start[i]+(end[i]-start[i])*f+(4*90*f*(1-f) if i==2 else 0) for i in range(3))
    f=smooth((q-.86)/.14)
    return q,extension,'scored',(-235,0,HUB_RIM_HEIGHT+FUEL_RADIUS-45*f)


def mechanism_screen(t,size=(770,399)):
    q,extension,phase,p=mechanism_state(t)
    zoom=smooth((q-.40)/.20)
    scale=2.35+(.94-2.35)*zoom
    focus=165*(1-zoom)
    yaw=-18
    # Start with a useful close-up of the intake, then pull back before firing.
    x_offset=focus*math.cos(math.radians(yaw))*scale
    y_offset=focus*(-math.sin(math.radians(yaw)))*math.sin(math.radians(20))*scale
    m=Model(yaw,20,size,scale,(size[0]*.50-x_offset,342+16*zoom-y_offset))
    m.face([(-370,-155,-2),(330,-155,-2),(330,155,-2),(-370,155,-2)],'#233E50',background=True)
    m.transform((-235,0,0),math.pi);add_hub(m,RED,True)
    m.transform((165,0,0));add_robot(m,extension=extension,phase=t*math.tau,fill_count=0,cutaway=phase=='transfer')
    if p and phase in {'deploy','collect','transfer'}:
        # Collection coordinates are local to the robot; positive X is its rear.
        m.sphere(p)
        # A transparent path helps explain internal indexer flow, not a second ball.
        if phase=='transfer':m.line([(65,0,18),(22,0,24),(-28,0,30)],'#8FE4C4',1.4)
    m.transform()
    if p and phase in {'shoot','scored'}:m.sphere(p)
    m.transform((165,0,0));rear=m.project(m.world((77,0,12)));front=m.project(m.world((-43,0,62)))
    return m.render(),phase,rear,front


@functools.lru_cache(24)
def element_sprite(kind,color=RED):
    m=Model(30,20,(320,430),1.20,(175,386))
    if kind=='hub':add_hub(m,color,True)
    else:add_tower(m,color)
    return m.render()


def draw_element(im,kind,x,ground,s=1,color=RED):
    src=element_sprite(kind,color)
    src=src.resize((round(src.width*s),round(src.height*s)),Image.Resampling.LANCZOS)
    im.alpha_composite(src,(round(x-175*s),round(ground-386*s)))
    return (x,ground-HUB_RIM_HEIGHT*1.20*s)
