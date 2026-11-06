"""ART-01 editable pixel master. No game imports, writes only inside art-01.

Uses the project's PixelArt vocabulary (rect / scanline polygon / ellipse),
integer pixels, and nearest-neighbour export. Pillow is already in backend venv.
Run from repository root: backend/.venv/bin/python docs/planning/designs/art-01/source/render.py
"""
from pathlib import Path
import json
import math
import hashlib
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
W, H = 320, 240
P = {
    'ink': '#4a3b55', 'cream': '#f5eee2', 'linen': '#fdf6e9',
    'sand': '#f0d9a8', 'warm': '#ffd98a', 'sea': '#3f6f9e',
    'sky': '#7fb6d9', 'rose': '#e8637c', 'leaf': '#5a944a', 'grass': '#7cb860',
    'wood0': '#554451', 'wood1': '#765346', 'wood2': '#976b4f',
    'wood3': '#b88b60', 'wood4': '#d2ac78', 'wood5': '#e5c897',
    'stone0': '#65545c', 'stone1': '#8e7d77', 'stone2': '#afa08b',
    'stone3': '#cfbea0', 'stone4': '#e3d4b9', 'stone5': '#f5e7cc',
    'cloth0': '#694655', 'cloth1': '#8c5158', 'cloth2': '#ad645d',
    'cloth3': '#c97e69', 'cloth4': '#df9d7d', 'cloth5': '#edb497',
    'teal0': '#294f59', 'teal1': '#326860', 'teal2': '#3f887f',
    'teal3': '#62b2a2', 'teal4': '#a2cdb5',
    'fur0': '#8c999a', 'fur1': '#c5d1ce', 'fur2': '#e6e8e3', 'fur3': '#fffaf2',
    'hair0': '#20222e', 'hair1': '#393946', 'hair2': '#56535b',
    'skin0': '#c58f7d', 'skin1': '#e4b396', 'skin2': '#f0c6a0',
    'pants': '#242333', 'white': '#ffffff',
}


def color(c):
    c = P.get(c, c)
    return tuple(int(c[i:i+2], 16) for i in (1, 3, 5)) + (255,)


class PixelArt:
    """Same scanline raster vocabulary as frontend/src/game/art/island.ts."""
    def __init__(self, w=W, h=H):
        self.im = Image.new('RGBA', (w, h))
        self.d = ImageDraw.Draw(self.im)

    def rect(self, x, y, w, h, c):
        if w > 0 and h > 0:
            self.d.rectangle((x, y, x+w-1, y+h-1), fill=color(c))

    def poly(self, points, c):
        # Match PixelArt.polygon's integer scan conversion, no antialias.
        for y in range(min(p[1] for p in points), max(p[1] for p in points)+1):
            xs = []
            for a, b in zip(points, points[1:]+points[:1]):
                if (a[1] <= y < b[1]) or (b[1] <= y < a[1]):
                    xs.append(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]))
            xs.sort()
            for a, b in zip(xs[::2], xs[1::2]):
                self.rect(math.ceil(a), y, math.floor(b)-math.ceil(a)+1, 1, c)

    def ellipse(self, x, y, rx, ry, c):
        for dy in range(-ry, ry+1):
            half = int(rx * math.sqrt(max(0, 1-dy*dy/(ry*ry))))
            self.rect(x-half, y+dy, half*2+1, 1, c)

    def line(self, points, c, width=1):
        self.d.line(points, fill=color(c), width=width)

    def paste(self, im, x, y):
        self.im.alpha_composite(im, (x, y))


def floor_wall():
    p = PixelArt()
    p.rect(0, 0, W, H, '#282735')
    p.rect(10, 9, 300, 223, 'wood0')
    p.rect(15, 12, 290, 215, 'wood1')
    p.rect(20, 18, 280, 83, '#e4d4b6')
    p.rect(20, 18, 280, 4, '#c4ac8e')
    # Plaster stays quiet. Sparse mineral chips under architecture, no noise.
    for x,y,w in [(25,27,8),(33,30,3),(112,36,5),(205,35,7),(199,40,3),
                  (116,71,7),(121,74,3),(210,83,5),(216,80,2),(31,78,4)]:
        p.rect(x,y,w,1,'#d8c6ab')
    p.rect(20,86,280,14,'wood2')
    p.rect(20,86,280,2,'wood4')
    p.rect(20,88,280,1,'wood1')
    # Shallow wainscot recessed panels, rhythmic but restrained.
    for x in range(26, 299, 24):
        p.rect(x,90,17,6,'wood1'); p.rect(x+1,91,15,4,'wood3')
        p.rect(x+2,91,1,4,'wood4')
    p.rect(20,98,280,4,'wood0')
    p.rect(20,99,280,1,'wood3')
    p.rect(20,102,280,120,'wood1')
    for row in range(10):
        y = 102 + row*12
        for col in range(-1,6):
            x = 20+col*60+(row%3)*20
            left,right = max(20,x),min(300,x+60)
            if left >= right: continue
            shades = ['#b98e65','#c2976c','#b58b66','#c29a72']
            p.rect(left,y,right-left-1,11,shades[(row+col)%4])
            p.rect(left,y,right-left-1,1,'wood4')
            p.rect(left,y+10,right-left-1,1,'#a37a59')
            # Grain is a long broken ribbon; no isotropic speckling.
            if right-left>24:
                gx = left+5+(row*3+col*5)%9
                p.rect(gx,y+4,min(23,right-gx-3),1,'#a7805e')
                p.rect(gx+3,y+5,min(10,right-gx-5),1,'#d0a67a')
                p.rect(left+3,y+8,2,1,'wood1')
                if (row*7+col)%6 == 0:
                    kx = min(gx+15,right-9)
                    p.line([(kx-5,y+7),(kx-2,y+6),(kx+4,y+6),(kx+7,y+7)],'#a7805e')
                    p.rect(kx,y+7,3,1,'wood1')
                    p.rect(kx-1,y+8,5,1,'wood4')
    # Structural framing has distinct end-grain and top plane.
    for x in (14,300):
        p.rect(x,15,6,211,'wood1'); p.rect(x,15,2,211,'wood3')
        p.rect(x+2,22,1,52,'wood2'); p.rect(x+3,122,1,62,'wood2')
    p.rect(16,13,288,5,'wood2'); p.rect(17,13,286,1,'wood5')
    p.rect(16,222,288,7,'wood1'); p.rect(19,222,282,2,'wood4')
    p.rect(20,225,280,1,'wood2')
    return p.im


def ground_light(night=False):
    p=PixelArt()
    # Window projection respects floor plane and mullion gaps, flat clusters.
    c = '#6c8191' if night else '#e5ce9d'
    for a,b,cx,dx in [(240,254,215,237),(258,275,242,268)]:
        p.poly([(a,106),(b,106),(dx,135),(cx,135)],c)
        p.poly([(cx-2,140),(dx-2,140),(dx-16,162),(cx-22,162)],c)
    # A very limited hearth pool is behind contact shadows, not a room filter.
    p.ellipse(76,116,44,14,'#bd9469' if not night else '#a47b60')
    p.ellipse(76,114,32,9,'#d0a371' if not night else '#c39a6c')
    for x,y,w in [(44,110,19),(73,110,30),(55,121,32)]:
        p.rect(x,y,w,1,'#a9805e' if not night else '#9b725b')
    # Light recolours the existing pixels; it cannot erase grain or board seams.
    base=tint(floor_wall(),night,'00-shell-floor')
    out=Image.new('RGBA',(W,H))
    for y in range(102,180):
        for x in range(20,300):
            light=p.im.getpixel((x,y))
            if not light[3]: continue
            old=base.getpixel((x,y))
            amount=.35 if x>180 else .19
            out.putpixel((x,y),tuple(round(old[i]*(1-amount)+light[i]*amount) for i in range(3))+(255,))
    return out


def window_asset(night=False):
    p=PixelArt(78,91)
    p.rect(7,6,64,76,'wood0'); p.rect(9,7,60,73,'wood2')
    p.rect(10,8,58,2,'wood4'); p.rect(12,12,54,63,'wood1')
    p.rect(14,14,50,59,'#354665' if night else 'sky')
    if night:
        p.rect(14,40,50,15,'#435673'); p.rect(14,55,50,18,'#354d67')
        p.ellipse(48,28,5,5,'cream'); p.ellipse(50,26,4,4,'#354665')
        for x,y in [(24,21),(36,31),(57,18),(20,35),(59,43)]: p.rect(x,y,1,1,'#c2ced0')
    else:
        for x,y,w in [(19,24,13),(42,37,17),(49,18,10)]:
            p.rect(x,y,w,2,'linen'); p.rect(x+3,y-2,w-6,2,'linen')
        p.rect(14,48,50,7,'#a3c9ce'); p.rect(14,55,50,18,'sea')
    p.poly([(14,54),(19,49),(23,50),(27,45),(34,49),(37,55)],'#476b64' if night else '#72906f')
    for x,y,w in [(38,59,17),(20,64,9),(40,68,20),(26,71,8)]:
        p.rect(x,y,w,1,'#7396ac' if night else 'sky')
    p.rect(37,12,4,63,'wood1'); p.rect(37,12,2,63,'wood4')
    p.rect(12,41,54,4,'wood1'); p.rect(12,41,54,1,'wood5')
    p.rect(12,43,54,1,'wood3')
    # Soft pinched linen silhouette, an inward fold and shadow underneath.
    for flip in (False,True):
        q=PixelArt(78,91)
        q.poly([(2,5),(18,5),(16,30),(12,52),(14,74),(8,79),(1,77),(4,48)],'#b4a894')
        q.poly([(3,5),(16,5),(14,29),(10,51),(12,73),(7,77),(2,75),(5,48)],'cream')
        q.poly([(7,7),(9,7),(8,34),(6,53),(7,73),(5,74),(4,50)],'linen')
        q.poly([(12,7),(14,7),(12,33),(9,51),(11,70),(9,72),(7,50)],'#cfbea0')
        q.rect(4,51,8,3,'teal2'); q.rect(4,51,7,1,'teal4')
        q.line([(3,70),(6,72),(10,70)],'teal2')
        q.line([(3,73),(6,75),(11,73)],'teal3')
        p.paste(q.im.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if flip else q.im,0,0)
    p.rect(0,3,78,2,'wood0'); p.rect(2,2,74,1,'wood3')
    for x in (2,8,14,64,70,76): p.rect(x,1,1,5,'wood4')
    p.rect(9,79,60,4,'wood0'); p.rect(7,77,64,3,'wood4')
    p.rect(8,77,62,1,'wood5'); p.rect(12,80,53,1,'wood2')
    return p.im


def fireplace_asset():
    p=PixelArt(94,110)
    # Long fireplace plane: irregular stone courses, compressed mortar.
    p.rect(16,14,64,80,'stone0'); p.rect(17,15,61,78,'stone2')
    for row, widths in enumerate([(18,24,19),(27,18,16),(16,22,23),(24,21,16),(18,25,18),(30,15,16)]):
        x=17; y=17+row*12
        for j,bw in enumerate(widths):
            p.poly([(x+1,y),(x+bw-3,y),(x+bw-1,y+2),(x+bw-1,y+9),(x+bw-3,y+10),(x,y+10),(x,y+2)],'stone3' if (j+row)%3 else 'stone4')
            p.line([(x+2,y),(x+bw-4,y),(x+bw-2,y+1)],'stone5')
            p.line([(x+2,y+10),(x+bw-2,y+10),(x+bw-1,y+8)],'stone1')
            if (j+row)%2 == 0:
                p.rect(x+3,y+3,3,1,'stone2'); p.rect(x+bw-6,y+8,2,1,'stone2')
            # Small chipped clusters follow lower edges; most of each stone stays calm.
            if (row+j)%3==1:
                p.poly([(x+3,y+7),(x+7,y+6),(x+8,y+8),(x+5,y+9)],'stone2')
                p.rect(x+4,y+6,2,1,'stone4')
            if row in (1,4): p.rect(x+bw-3,y+2,2,2,'stone1')
            x+=bw
    # Arched recess: radial voussoirs, keystone, dark return and ember brick.
    p.poly([(27,91),(27,61),(30,51),(36,44),(45,40),(54,40),(63,43),(70,50),(73,60),(73,91)],'stone0')
    p.poly([(30,91),(30,61),(33,53),(38,47),(46,44),(54,44),(61,47),(67,54),(70,62),(70,91)],'#372c3b')
    p.poly([(34,88),(34,63),(37,55),(43,50),(54,48),(62,53),(66,61),(66,88)],'#623f41')
    for y in range(55,88,7):
        x0=40 if y<62 else 35
        p.rect(x0,y,65-x0,1,'#47323a')
        for x in range(x0+(y//7%2)*8,65,14): p.rect(x,y,1,6,'#47323a')
    blocks=[([(25,63),(26,53),(32,55),(31,64)],'stone3'),
            ([(26,52),(31,43),(37,48),(33,56)],'stone4'),
            ([(32,42),(41,37),(44,45),(38,49)],'stone3'),
            ([(42,36),(53,35),(54,44),(45,45)],'stone5'),
            ([(54,36),(64,40),(60,48),(55,44)],'stone3'),
            ([(65,41),(73,49),(66,55),(61,49)],'stone4'),
            ([(74,50),(77,62),(70,64),(67,56)],'stone3')]
    for pts,c in blocks:
        p.poly(pts,c); p.line(pts[:2],'stone5')
    for x,y in [(28,51),(35,44),(46,38),(67,46),(74,58)]:
        p.rect(x,y,2,1,'stone2'); p.rect(x+1,y+1,1,1,'stone1')
    for x in (24,71):
        for y in (65,77):
            p.rect(x,y,8,10,'stone3'); p.rect(x,y,7,1,'stone5')
            p.rect(x+7,y+1,1,8,'stone1'); p.rect(x+2,y+7,2,1,'stone2')
    p.rect(11,94,74,7,'stone1'); p.poly([(14,88),(81,88),(87,94),(9,94)],'stone4')
    p.rect(10,94,76,1,'stone5'); p.rect(12,99,72,2,'stone0')
    p.line([(34,89),(32,93),(32,98)],'stone2'); p.line([(62,89),(63,93),(63,98)],'stone2')
    # Deep timber mantel with bevel, woodgrain, and two corbels.
    p.rect(10,27,77,7,'wood0'); p.rect(10,26,76,6,'wood2')
    p.poly([(12,22),(83,22),(88,26),(8,26)],'wood4')
    p.rect(9,26,78,1,'wood5'); p.rect(12,31,73,1,'wood1')
    p.line([(16,28),(30,28),(33,29),(41,29),(44,28),(62,28)],'wood1')
    p.rect(65,29,12,1,'wood3')
    for x in (17,72):
        p.poly([(x,34),(x+7,34),(x+5,42),(x+1,44)],'wood1')
        p.line([(x+1,34),(x+1,40),(x+3,39)],'wood3')
    # Original tiny seascape, no downloaded art.
    p.rect(25,3,26,19,'wood0'); p.rect(26,3,24,17,'wood3')
    p.rect(27,4,22,1,'wood5'); p.rect(28,6,20,12,'sky')
    p.rect(28,12,20,6,'sea'); p.poly([(28,13),(31,8),(35,12),(38,14)],'leaf')
    p.rect(40,8,2,2,'warm'); p.rect(39,15,7,1,'cream')
    # Vase and spare cup on mantel.
    p.ellipse(68,18,4,4,'teal1'); p.rect(65,13,6,7,'teal2')
    p.rect(66,12,4,2,'teal4'); p.rect(66,15,1,4,'teal3')
    p.line([(68,13),(68,7),(64,4)],'leaf'); p.line([(68,9),(73,5)],'leaf')
    p.rect(63,3,3,2,'cream'); p.rect(72,4,3,2,'sand')
    return p.im


def fire_asset():
    p=PixelArt(40,34)
    p.ellipse(20,29,17,3,'#9f5746')
    p.poly([(7,28),(6,21),(11,24),(10,15),(16,19),(18,6),(23,15),(27,10),(28,21),(33,17),(32,27),(27,30)],'#bd6448')
    p.poly([(10,28),(11,22),(15,24),(15,17),(20,20),(21,10),(25,20),(25,25),(29,21),(29,28)],'#e89550')
    p.poly([(15,28),(15,24),(19,26),(21,17),(25,25),(25,29)],'warm')
    p.poly([(19,29),(20,24),(23,27),(23,30)],'linen')
    # Crossed logs, iron grate, a handful of unanimated embers.
    p.line([(7,30),(30,26)],'wood0',3); p.line([(10,27),(32,31)],'wood1',3)
    p.line([(8,28),(27,26)],'#d58851')
    p.rect(6,31,29,1,'hair0')
    for x in (7,15,25,33): p.rect(x,27,1,6,'hair0')
    p.rect(19,4,1,2,'#e89550'); p.rect(27,9,1,1,'warm')
    return p.im


def tv_asset():
    p=PixelArt(80,82)
    p.rect(8,71,5,9,'wood0'); p.rect(65,71,5,9,'wood0')
    p.rect(9,72,3,6,'wood3'); p.rect(66,72,3,6,'wood2')
    p.rect(6,57,66,16,'wood0'); p.rect(7,57,63,15,'wood2')
    p.rect(9,60,28,9,'wood1'); p.rect(41,60,26,9,'wood1')
    p.rect(10,61,26,7,'wood3'); p.rect(42,61,24,7,'wood3')
    for x in (12,22,44,54): p.rect(x,62,1,5,'wood2')
    p.rect(14,67,19,1,'wood4'); p.rect(44,67,19,1,'wood4')
    p.rect(31,62,2,2,'warm'); p.rect(45,62,2,2,'warm')
    p.poly([(7,53),(70,53),(74,57),(3,57)],'wood4')
    p.rect(4,57,69,1,'wood5'); p.rect(8,59,63,1,'wood1')
    p.rect(15,49,4,5,'wood0'); p.rect(58,49,4,5,'wood0')
    # CRT has a top plane and a right case, subtly convex glass corners.
    p.poly([(13,12),(65,12),(70,18),(70,49),(66,52),(11,52),(9,48),(9,18)],'wood0')
    p.poly([(14,12),(64,12),(68,16),(11,16)],'wood4')
    p.rect(11,17,55,32,'wood2'); p.rect(11,17,55,1,'wood5')
    p.rect(66,18,3,30,'wood1')
    p.poly([(16,19),(51,19),(54,22),(54,44),(51,47),(16,47),(13,44),(13,22)],'hair0')
    p.poly([(18,22),(49,22),(51,24),(51,42),(49,44),(17,44),(16,42),(16,24)],'sky')
    p.rect(16,33,36,10,'sea')
    p.poly([(16,35),(20,29),(25,31),(30,36)],'leaf')
    p.rect(36,27,8,1,'linen'); p.rect(39,26,3,1,'linen')
    p.rect(31,37,16,1,'sky'); p.rect(22,41,11,1,'sky')
    p.line([(17,24),(21,23),(24,23)],'#bdd5d6')
    for y in (25,34):
        p.ellipse(60,y,3,3,'wood0'); p.ellipse(60,y-1,2,2,'wood4'); p.rect(60,y-2,1,3,'cream')
    for y in (41,43,45,47): p.rect(57,y,7,1,'wood0')
    p.rect(64,49,1,1,'grass')
    p.line([(31,11),(23,5)],'wood0'); p.line([(32,11),(40,6)],'wood0')
    return p.im


def rug_asset():
    p=PixelArt(160,83)
    p.poly([(7,4),(153,4),(155,78),(4,78)],'wood2')
    p.rect(6,3,148,73,'stone3'); p.rect(8,4,144,70,'sand')
    p.rect(10,6,140,66,'cream'); p.rect(13,9,134,60,'teal1')
    p.rect(14,10,132,58,'teal3'); p.rect(16,12,128,54,'sand')
    p.rect(19,15,122,48,'linen')
    for x in range(9,153,3):
        p.rect(x,0,1,4,'stone3'); p.rect(x+1,1,1,3,'cream')
        p.rect(x,76,1,4+(x%2),'stone3'); p.rect(x+1,76,1,3,'cream')
    # Weave only at borders; central field deliberately untextured.
    for x in range(22,140,8):
        p.rect(x,17,3,1,'sand'); p.rect(x,60,3,1,'sand')
    for y in range(20,60,7):
        p.rect(21,y,1,3,'sand'); p.rect(138,y,1,3,'sand')
    for x,y in [(24,22),(134,22),(24,56),(134,56)]:
        p.poly([(x,y-2),(x+2,y),(x,y+2),(x-2,y)],'cloth3')
    return p.im


def sofa_asset(front=False):
    p=PixelArt(128,65)
    if not front:
        # Shadow has three purposeful stepped extents, no fuzzy filter.
        p.ellipse(64,58,60,6,'stone2'); p.ellipse(64,57,55,4,'stone1')
        for x in (14,108):
            p.rect(x,52,6,9,'wood0'); p.rect(x+1,52,3,7,'wood2')
        p.poly([(11,14),(117,14),(123,20),(123,50),(118,55),(9,55),(5,50),(5,22)],'cloth0')
        p.rect(17,11,95,35,'cloth1')
        # Two depressed cushions, top rims catch the light.
        for x in (21,65):
            p.poly([(x+3,12),(x+38,12),(x+40,15),(x+40,33),(x+36,37),(x+1,36),(x,32),(x,16)],'cloth3')
            p.line([(x+3,12),(x+36,12),(x+39,15)],'cloth5')
            p.line([(x+2,33),(x+12,34),(x+30,33),(x+37,31)],'cloth2')
            p.line([(x+2,16),(x+2,28)],'cloth4')
            p.line([(x+35,17),(x+33,22),(x+34,26)],'cloth2')
        # Low armrests show rolled end caps and a top plane.
        for x in (4,110):
            p.poly([(x+4,8),(x+10,8),(x+15,13),(x+15,43),(x+12,49),(x+3,49),(x,45),(x,15)],'cloth1')
            p.poly([(x+4,7),(x+10,7),(x+13,11),(x+12,34),(x+3,34),(x+1,30),(x+1,13)],'cloth3')
            p.line([(x+3,12),(x+5,9),(x+9,9),(x+11,11)],'cloth5')
            p.line([(x+3,14),(x+3,29),(x+5,32)],'cloth4')
            p.line([(x+12,15),(x+12,30),(x+10,33)],'cloth2')
            p.ellipse(x+7,37,6,8,'cloth2'); p.ellipse(x+7,36,4,6,'cloth3')
            p.line([(x+5,32),(x+7,31),(x+9,33)],'cloth4')
        # A small pillow at left, pressed into its cushion.
        p.poly([(23,14),(34,13),(38,18),(35,25),(24,26),(21,22)],'cloth2')
        p.poly([(24,14),(33,14),(36,18),(34,23),(24,24),(22,21)],'sand')
        p.line([(24,16),(26,18),(25,21)],'cloth4')
    else:
        # Near back is separate so the actor is occluded by furniture, never scaled.
        p.poly([(17,31),(111,31),(115,35),(115,52),(110,56),(18,56),(13,52),(13,36)],'cloth0')
        p.poly([(19,29),(108,29),(112,33),(112,50),(108,53),(19,53),(16,50),(16,34)],'cloth2')
        p.poly([(20,29),(107,29),(111,32),(110,34),(18,34),(17,32)],'cloth4')
        p.line([(21,29),(105,29)],'cloth5')
        p.rect(20,35,87,15,'cloth3')
        p.rect(21,50,85,1,'cloth1'); p.rect(19,36,1,13,'cloth4')
        p.rect(108,35,2,15,'cloth1')
        for x in (43,81):
            p.rect(x,35,1,14,'cloth2'); p.rect(x+1,36,1,12,'cloth4')
        # Short seam tufts, not an all-over pattern.
        for x,y in [(31,42),(64,42),(95,42)]:
            p.rect(x,y,2,2,'cloth1'); p.rect(x-1,y+2,3,1,'cloth4')
        for x,y in [(23,37),(25,38),(37,47),(40,48),(72,37),(75,38),(91,47),(97,48)]:
            p.rect(x,y,2,1,'cloth4')
        p.line([(22,48),(25,49),(29,49)],'cloth2')
        p.line([(99,35),(101,37),(101,39)],'cloth2')
        # Blanket folds from a raised arm down over the foreground face.
        p.poly([(100,16),(111,14),(121,19),(119,40),(115,55),(101,54),(101,35),(98,25)],'teal0')
        p.poly([(101,16),(110,15),(119,19),(117,39),(113,53),(102,52),(103,35),(99,25)],'teal2')
        p.poly([(103,17),(107,16),(106,31),(107,47),(105,52),(103,51),(104,33)],'teal3')
        p.poly([(112,18),(116,19),(113,35),(112,50),(109,52),(109,32)],'teal1')
        p.line([(100,24),(105,26),(112,24),(118,25)],'teal4')
        p.line([(103,44),(107,46),(113,44)],'teal4')
        p.line([(103,47),(107,49),(113,47)],'sand')
        for x,y in [(103,52),(106,54),(109,54),(112,53)]:
            p.rect(x,y,1,4,'teal4'); p.rect(x+1,y,1,3,'teal1')
    return p.im


def head(kind, back=False):
    """One shared head raster per identity/direction. Used unchanged in both poses."""
    p=PixelArt(24,15)
    if kind=='bear':
        p.ellipse(6,3,2,2,'fur0'); p.rect(5,2,2,3,'fur3')
        p.ellipse(17,3,2,2,'fur0'); p.rect(16,2,2,3,'fur3')
        p.poly([(6,3),(17,3),(20,6),(20,12),(18,14),(5,14),(3,12),(3,6)],'fur0')
        p.poly([(6,4),(17,4),(19,6),(19,11),(17,13),(6,13),(4,11),(4,6)],'fur3')
        p.line([(4,10),(5,12),(8,13),(17,13),(19,11)],'fur2')
        if not back:
            p.rect(7,8,1,1,'hair0'); p.rect(15,8,1,1,'hair0')
            p.rect(11,10,2,1,'hair0'); p.rect(11,12,3,1,'fur0')
    else:
        p.poly([(8,1),(15,1),(18,3),(20,7),(19,13),(17,15),(6,15),(4,12),(4,6),(6,3)],'hair0')
        p.poly([(8,2),(15,2),(18,5),(18,10),(16,13),(6,12),(5,7),(6,4)],'hair1')
        p.line([(7,4),(9,3),(14,3)],'hair2')
        if not back:
            p.poly([(9,7),(13,5),(16,7),(17,11),(15,14),(9,14),(7,11),(7,8)],'skin1')
            p.rect(9,8,6,4,'skin2'); p.rect(9,9,1,1,'hair0'); p.rect(14,9,1,1,'hair0')
            p.rect(11,12,2,1,'skin0')
            p.line([(6,5),(7,7),(9,6),(11,5)],'hair0')
        else:
            p.line([(17,6),(17,11),(15,13)],'hair2')
    return p.im


def character(kind, pose, back=False):
    p=PixelArt(32,40)
    sitting = pose=='sit'
    # feet anchor (16,36), head placement is unchanged across these front/back pairs.
    hy=4 if not sitting else 8
    if kind=='bear':
        if sitting:
            p.poly([(10,21),(22,21),(25,27),(25,33),(22,36),(9,36),(7,32),(8,26)],'fur0')
            p.poly([(11,21),(21,21),(23,27),(23,33),(20,35),(10,35),(9,31)],'fur2')
            p.rect(11,22,10,10,'fur3')
            p.ellipse(10,33,3,2,'fur1'); p.ellipse(22,33,3,2,'fur1')
        else:
            p.poly([(10,15),(22,15),(24,20),(25,28),(23,31),(23,35),(18,36),(16,33),(14,36),(8,36),(8,31),(6,28),(7,20)],'fur0')
            p.poly([(10,16),(21,16),(23,21),(23,29),(21,33),(18,34),(16,31),(13,34),(9,34),(9,29),(8,26),(9,20)],'fur2')
            p.rect(11,17,10,13,'fur3'); p.rect(10,33,4,2,'fur3'); p.rect(18,33,4,2,'fur3')
            p.line([(9,22),(10,28)],'fur1'); p.line([(22,22),(21,28)],'fur1')
    else:
        by=22 if sitting else 16
        p.poly([(10,by),(21,by),(24,by+4),(23,by+10),(9,by+10),(7,by+5)],'teal0')
        p.rect(10,by+1,11,9,'teal2'); p.rect(10,by+1,10,1,'teal3')
        p.rect(8,by+3,3,4,'teal3'); p.rect(21,by+3,3,4,'teal2')
        p.rect(8,by+7,2,4,'skin2'); p.rect(22,by+7,2,4,'skin1')
        if not back:
            # Luo Xiaohei chest: two pointed ears + light eyes, only on FRONT.
            p.rect(13,by+3,1,2,'hair0'); p.rect(18,by+3,1,2,'hair0')
            p.rect(13,by+5,6,4,'hair0'); p.rect(14,by+6,1,1,'cream'); p.rect(17,by+6,1,1,'cream')
        if sitting:
            p.rect(9,32,14,3,'pants'); p.rect(7,33,5,3,'hair0'); p.rect(21,33,4,3,'hair0')
        else:
            p.rect(11,27,10,4,'pants'); p.rect(11,30,4,5,'pants'); p.rect(17,30,4,5,'pants')
            p.rect(11,34,4,2,'hair0'); p.rect(18,34,4,2,'hair0')
            p.rect(12,30,1,3,'hair1'); p.rect(18,30,1,3,'hair1')
        if back:
            p.poly([(9,hy+11),(23,hy+11),(22,by+6),(19,by+8),(12,by+7)],'hair0')
            p.rect(11,hy+12,9,by+5-(hy+12),'hair1')
    p.paste(head(kind,back),4,hy)
    return p.im


def details_asset():
    p=PixelArt()
    # Log basket, left of hearth. Decorative, no fuel economy.
    p.ellipse(34,124,12,3,'wood1')
    p.poly([(22,111),(45,111),(43,125),(25,125)],'wood0')
    p.rect(24,114,19,9,'wood2')
    for y in (116,119,122): p.rect(25,y,17,1,'wood4')
    for x,y in [(29,111),(36,108),(40,114)]:
        p.line([(x-5,y-3),(x+2,y)],'wood1',5)
        p.ellipse(x+2,y,3,3,'wood4'); p.ellipse(x+2,y,2,2,'wood2'); p.rect(x+2,y,1,1,'wood5')
    # Small side stool carrying two cups, no added function furniture.
    p.ellipse(91,175,12,4,'wood1')
    for x in (82,96): p.rect(x,165,3,10,'wood1'); p.rect(x,165,1,8,'wood4')
    p.poly([(81,155),(98,155),(103,161),(101,165),(78,165),(77,161)],'wood0')
    p.poly([(82,155),(98,155),(102,160),(99,162),(79,162),(78,160)],'wood4')
    p.line([(82,158),(96,158)],'wood2')
    for x,y,c in [(83,151,'cream'),(93,153,'teal3')]:
        p.rect(x,y,5,6,c); p.rect(x+1,y+1,3,1,'wood1')
        p.rect(x+5,y+2,2,3,c); p.rect(x+5,y+3,1,1,'wood3')
        p.rect(x+1,y+5,3,1,'stone2')
    # Plant by window, leaf clusters with consistent top-left highlights.
    p.ellipse(279,130,13,4,'wood1')
    p.poly([(271,116),(287,116),(285,131),(274,131)],'cloth1')
    p.poly([(272,118),(285,118),(283,129),(275,129)],'cloth3')
    p.rect(271,116,16,3,'cloth4'); p.rect(274,119,1,9,'cloth5')
    p.line([(279,117),(280,94),(275,87)],'teal0',2)
    for x,y,side in [(279,98,-1),(281,103,1),(279,109,-1),(280,93,1)]:
        pts=[(x,y),(x+side*10,y-6),(x+side*13,y-4),(x+side*10,y+1),(x+side*3,y+2)]
        p.poly(pts,'teal1'); p.line([(x+side*3,y),(x+side*10,y-4)],'grass')
        p.rect(x+side*7,y-3,3,1,'leaf')
    return p.im


def contact_shadows():
    p=PixelArt()
    p.ellipse(76,118,45,6,'wood1'); p.ellipse(76,116,40,4,'wood0')
    p.ellipse(167,120,41,5,'wood1'); p.ellipse(169,118,33,3,'wood0')
    return p.im


def tint(im, night, name):
    """Quantized palette remap, no blurred layer or transparent sprite fringes."""
    if not night or name=='06-fire': return im.copy()
    out=im.copy(); pix=out.load()
    for y in range(im.height):
        for x in range(im.width):
            c=pix[x,y]
            if c[3]==0: continue
            if x<20 or x>=300 or y<18 or y>=222: continue
            if name=='03-window':
                glass={color(v) for v in ('#354665','#435673','#354d67','#476b64','#7396ac','#c2ced0')}
                if c in glass or (c==color('cream') and 264<=x<=276 and 40<=y<=54): continue
            # A cool ambient ramp, restrained local warm bounce, cool window rim.
            t=[round(c[i]*(.43,.45,.63)[i]+(12,18,32)[i]) for i in range(3)]
            dist=math.sqrt(((x-77)/80)**2+((y-102)/67)**2)
            warm=round(max(0,1-dist)*12)/12*.48
            t=[round(t[i]*(1-warm)+(255,200,126)[i]*warm) for i in range(3)]
            cool=round(max(0,1-math.hypot((x-260)/50,(y-110)/70))*3)/3*.12
            t=[round(t[i]*(1-cool)+(127,182,217)[i]*cool) for i in range(3)]
            pix[x,y]=tuple(t)+(255,)
    return out


def scene(night=False):
    layers=[]
    def add(name,im,x=0,y=0,remap=True):
        p=PixelArt(); p.paste(im,x,y)
        layers.append((name,tint(p.im,night,name) if remap else p.im))
    add('00-shell-floor',floor_wall())
    add('01-local-floor-light',ground_light(night),remap=False)
    add('02-contact-shadows',contact_shadows())
    add('03-window',window_asset(night),222,19)
    add('04-fireplace',fireplace_asset(),29,16)
    add('05-tv-cabinet',tv_asset(),128,39)
    add('06-fire',fire_asset(),58,72)
    add('07-rug',rug_asset(),93,139)
    add('08-sofa-base',sofa_asset(),108,148)
    p=PixelArt(); p.paste(character('bear','sit',True),139,142); p.paste(character('her','sit',True),178,142)
    add('09-scale-actors-NOT-live',p.im)
    add('10-sofa-foreground',sofa_asset(True),108,148)
    add('11-details',details_asset())
    merged=Image.new('RGBA',(W,H))
    for _,im in layers: merged.alpha_composite(im)
    return merged,layers


def save_svg(layers,path):
    # Lossless scanline runs rather than fractional vector paths: same exact pixel grid.
    lines=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" shape-rendering="crispEdges">',
           '<title>ART-01 — editable layer groups, 320×240 pixel master. Actors are scale studies only.</title>']
    for name,im in layers:
        lines.append(f'<g id="{name}">')
        for y in range(H):
            row=[im.getpixel((x,y)) for x in range(W)]; x=0
            while x<W:
                c=row[x]; end=x+1
                while end<W and row[end]==c: end+=1
                if c[3]: lines.append(f'<rect x="{x}" y="{y}" width="{end-x}" height="1" fill="#{c[0]:02x}{c[1]:02x}{c[2]:02x}"/>')
                x=end
        lines.append('</g>')
    lines.append('</svg>'); path.write_text('\n'.join(lines),encoding='utf-8')


FONT=Path('/System/Library/Fonts/STHeiti Light.ttc')
def font(n):
    return ImageFont.truetype(str(FONT),n)


def label(p,xy,text,size=20,fill='#f5eee2'):
    ImageDraw.Draw(p).text(xy,text,font=font(size),fill=fill)


def board(night=False):
    im,_=scene(night)
    out=Image.new('RGB',(1120,1032),'#242633')
    label(out,(80,33),'I-LAND   /   ART-01                                       01 — HEARTH STUDY',18,'#a2cdb5')
    label(out,(80,76),'窗边有海，炉边有你。',36)
    label(out,(80,131),'夜晚 · 局部暖火 / 冷窗光' if night else '白天 · 暖石 / 橡木 / 陶红织物',20,'#c8c7c7')
    out.paste(im.resize((960,720),Image.Resampling.NEAREST).convert('RGB'),(80,184))
    label(out,(80,936),'320 × 240 px  ·  16 px tile  ·  3× nearest-neighbour',18,'#a2cdb5')
    label(out,(80,975),'两人为比例示意；未接入真实双人室内。',20)
    return out


def ratio_board():
    out=Image.new('RGB',(1280,1190),'#f5eee2'); d=ImageDraw.Draw(out)
    label(out,(48,32),'ART-01  /  尺度与遮挡',32,'#4a3b55')
    label(out,(48,79),'候选 32 px 站姿 · 共用头部数据 · 同一逻辑像素密度',21,'#65545c')
    labels=[('bear','stand',False,'白熊 / 站'),('bear','sit',False,'白熊 / 坐'),
            ('her','stand',False,'岛民 / 站'),('her','sit',False,'岛民 / 坐')]
    for i,(kind,pose,back,title) in enumerate(labels):
        x=52+i*232; y=140
        d.rounded_rectangle((x,y,x+210,y+302),radius=8,fill='#e6ddcb')
        for gy in range(y+16,y+272,16): d.line((x+14,gy,x+196,gy),fill='#d7cfbe')
        im=character(kind,pose,back).resize((192,240),Image.Resampling.NEAREST)
        out.paste(im,(x+9,y+12),im)
        d.line((x+12,y+228,x+196,y+228),fill='#3f887f',width=2)
        label(out,(x+18,y+264),title,20,'#4a3b55')
    label(out,(1002,155),'头部尺寸固定',20,'#4a3b55')
    label(out,(1002,198),'白熊 18 × 13',18,'#65545c')
    label(out,(1002,228),'岛民 17 × 14',18,'#65545c')
    label(out,(1002,280),'画布 32 × 40',18,'#65545c')
    label(out,(1002,312),'脚锚 (16,36)',18,'#65545c')
    label(out,(48,482),'同一个沙发，人物先画，近侧靠背后画',24,'#4a3b55')
    combined=PixelArt(128,65); combined.paste(sofa_asset(),0,0)
    combined.paste(character('bear','sit',True),31,-6); combined.paste(character('her','sit',True),70,-6)
    combined.paste(sofa_asset(True),0,0)
    si=combined.im.resize((640,325),Image.Resampling.NEAREST)
    out.paste(si,(48,540),si)
    label(out,(746,558),'沙发 128 × 65 px',22,'#4a3b55')
    label(out,(746,605),'坐垫有效宽度 2 × 40 px',20,'#65545c')
    label(out,(746,646),'脚底碰撞独立于画布 / 披毯',20,'#65545c')
    label(out,(746,687),'不缩放站姿充当坐姿',20,'#65545c')
    label(out,(746,728),'胸前猫脸仅画在正面短袖',20,'#65545c')
    # Existing sprite data is read-only and shown at native density beside candidate.
    import re
    src=ROOT.parents[3]/'frontend/src/characters.ts'
    text=src.read_text(encoding='utf-8')
    ox=50
    for var,pal in [('bearFront',{'s':'fur0','w':'fur2','W':'fur3','d':'hair0','n':'hair0','m':'fur0'}),
                    ('girlFront',{'h':'hair0','H':'hair1','k':'skin2','d':'hair0','r':'skin0','t':'teal2','T':'teal3','c':'hair0','w':'cream','p':'pants','P':'hair1','s':'ink'})]:
        rows=re.findall(r"'([^']+)'",re.search(r'const '+var+r' = \[(.*?)\]',text,re.S).group(1))
        p=PixelArt(16,16)
        for y,row in enumerate(rows):
            for x,ch in enumerate(row):
                if ch!='.':p.rect(x,y,1,1,pal[ch])
        old=p.im.resize((64,64),Image.Resampling.NEAREST); out.paste(old,(ox,1010),old); ox+=80
    for kind in ('bear','her'):
        new=character(kind,'stand').resize((128,160),Image.Resampling.NEAREST)
        out.paste(new,(ox,930),new); ox+=134
    d.line((48,1074,476,1074),fill='#3f887f',width=2)
    label(out,(540,944),'底行：现有 16px 与候选 32px 均按 4× 显示。',20,'#4a3b55')
    label(out,(540,988),'新旧不混用；候选角色需配套调整相机与家具。',20,'#65545c')
    label(out,(540,1032),'这是候选规格，全场景尺度在 ART-02 再锁定。',20,'#65545c')
    label(out,(48,1130),'人物仅为比例示意；未接入真实双人室内。',20,'#4a3b55')
    return out


def asset_board(assets):
    out=Image.new('RGB',(1280,1000),'#242633')
    label(out,(48,30),'ART-01  /  五件主要资产',32)
    label(out,(48,80),'透明原图另存 assets/；这里统一按 4× 最近邻显示。',20,'#a2cdb5')
    places=[('fireplace',(55,150),'暖石壁炉 · 94×110'),('tv',(477,175),'电视与矮柜 · 80×82'),
            ('window-day',(857,145),'窗 · 78×91'),('rug',(50,620),'地毯 · 160×83'),
            ('sofa-complete',(724,655),'沙发 · 128×65')]
    for key,(x,y),title in places:
        label(out,(x,y-36),title,20)
        im=assets[key].resize((assets[key].width*4,assets[key].height*4),Image.Resampling.NEAREST)
        out.paste(im,(x,y),im)
    return out


def mobile_board(day,night):
    out=Image.new('RGB',(880,920),'#242633')
    label(out,(35,25),'ART-01  /  小屏静态取景',28)
    label(out,(35,73),'固定 2× 像素；裁切取景，家具不移动。非应用或真机验收。',18,'#a2cdb5')
    for x,width,im,title in [(30,320,day,'320 px · 白天'),(420,390,night,'390 px · 夜晚')]:
        label(out,(x,130),title,22)
        # Main corner spans 32..288; use a centre crop, never rescale to thumbnail.
        big=im.resize((640,480),Image.Resampling.NEAREST)
        cx=320
        crop=big.crop((cx-width//2,0,cx+width//2,480))
        out.paste(crop.convert('RGB'),(x,180))
        label(out,(x,693),'44px',16)
        d=ImageDraw.Draw(out); d.rounded_rectangle((x,724,x+width,780),radius=10,fill='#fdf6e9')
        label(out,(x+18,740),'坐下    电视    返回',20,'#4a3b55')
    label(out,(35,830),'裁切图会隐藏角落边缘：正式接入需相机平移或焦点切换。',19)
    label(out,(35,869),'两人为比例示意；未接入真实双人室内。',19)
    return out


def style_board(day,night):
    out=Image.new('RGB',(1280,1030),'#f5eee2'); d=ImageDraw.Draw(out)
    label(out,(48,32),'ART-01  /  材质与光源',32,'#4a3b55')
    label(out,(48,80),'同构图、同像素网格。细节沿结构生长，不以噪点代替材质。',20,'#65545c')
    for i,(title,colors,description) in enumerate([
        ('木 / WOOD',[P[f'wood{j}'] for j in range(6)],'长向断续纹理，错缝与少量节疤'),
        ('石 / STONE',[P[f'stone{j}'] for j in range(6)],'分块亮边，局部缺口与厚炉膛'),
        ('布 / CLOTH',[P[f'cloth{j}'] for j in range(6)],'软轮廓，压线、折痕与坐垫凹陷'),
        ('毯 / TEAL',[P[f'teal{j}'] for j in range(5)],'大折面先行，窄边织纹与流苏')]):
        y=140+i*124
        label(out,(48,y),title,20,'#4a3b55')
        for j,c in enumerate(colors):
            x=230+j*74; d.rectangle((x,y,x+64,y+35),fill=c)
            label(out,(x,y+43),c,12,'#4a3b55')
        label(out,(720,y+13),description,20,'#65545c')
    label(out,(48,648),'核心色保持 DESIGN.md：奶油 / 沙 / 海蓝 / 暖光 / 青绿',20,'#4a3b55')
    for i,key in enumerate(['linen','sand','sea','sky','warm','teal2','teal3','ink']):
        x=48+i*146;d.rectangle((x,692,x+110,724),fill=P[key]);label(out,(x,736),P[key],16,'#4a3b55')
    for x,im,title in [(48,day,'白天：窗光主导，炉火只照近处'),(664,night,'夜晚：冷环境 + 炉口暖反射')]:
        crop=im.crop((30,40,118,127)).resize((176,174),Image.Resampling.NEAREST)
        out.paste(crop.convert('RGB'),(x,810));label(out,(x+196,822),title,18,'#4a3b55')
        label(out,(x+196,862),'16px tile / 1px 最小笔触',18,'#65545c')
        label(out,(x+196,902),'整数放大 / 无抗锯齿',18,'#65545c')
    return out


def pack_atlas(assets):
    """Review-only untrimmed draft atlas; do not install in the game yet."""
    positions={}; x=y=2; rowh=0
    for name,im in assets.items():
        if x+im.width+2>512: x=2; y+=rowh+4; rowh=0
        positions[name]=(x,y); x+=im.width+4; rowh=max(rowh,im.height)
    height=math.ceil((y+rowh+2)/16)*16
    atlas=Image.new('RGBA',(512,height)); frames={}
    for name,im in assets.items():
        x,y=positions[name]; atlas.paste(im,(x,y))
        # One pixel edge extrusion plus a clear guard pixel in each four-pixel gutter.
        for k in range(im.width):
            atlas.putpixel((x+k,y-1),im.getpixel((k,0)))
            atlas.putpixel((x+k,y+im.height),im.getpixel((k,im.height-1)))
        for k in range(im.height):
            atlas.putpixel((x-1,y+k),im.getpixel((0,k)))
            atlas.putpixel((x+im.width,y+k),im.getpixel((im.width-1,k)))
        for dx,dy,sx,sy in [(-1,-1,0,0),(im.width,-1,im.width-1,0),(-1,im.height,0,im.height-1),(im.width,im.height,im.width-1,im.height-1)]:
            atlas.putpixel((x+dx,y+dy),im.getpixel((sx,sy)))
        frames[name]={'frame':{'x':x,'y':y,'w':im.width,'h':im.height},'rotated':False,'trimmed':False,
                      'spriteSourceSize':{'x':0,'y':0,'w':im.width,'h':im.height},'sourceSize':{'w':im.width,'h':im.height}}
    atlas.save(ROOT/'assets'/'atlas-draft.png')
    (ROOT/'assets'/'atlas-draft.json').write_text(json.dumps({'frames':frames,'meta':{'image':'atlas-draft.png','size':{'w':512,'h':height},'scale':'1','status':'ART-01 review-only; not installed','padding':2,'extrude':1}},indent=2)+'\n')
    # Machine-readable proposals use sample coordinates only, not HOME_LAYOUT overrides.
    layout={'status':'proposal-only; ART-03 must map and validate against live HOME_LAYOUT',
            'canvas':{'width':320,'height':240,'tile':16},
            'character':{'frame':[32,40],'foot_anchor':[16,36],'standing_foot_body_candidate':[8,4]},
            'objects':[
                {'id':'fireplace','asset':'fireplace','top_left':[29,16],'footprint':[40,104,76,14],'interact':[77,126],'light':[77,102]},
                {'id':'tv','asset':'tv','top_left':[128,39],'footprint':[134,96,66,23],'interact':[167,130],'screen':[144,61,36,22]},
                {'id':'window','asset':'window-day','top_left':[222,19],'footprint':None,'light':[261,96]},
                {'id':'rug','asset':'rug','top_left':[93,139],'footprint':None},
                {'id':'sofa','asset':'sofa-base','foreground':'sofa-front','top_left':[108,148],
                 'footprint':[113,182,118,26],'seated_foot_anchors':[[155,178],[194,178]],'stand_candidates':[[150,217],[192,217]]},
                {'id':'decor-stool','footprint':[78,161,26,14],'interact':None},
                {'id':'decor-plant','footprint':[270,117,18,17],'interact':None}],
            'never_use_demo_actors_as_presence':True}
    (ROOT/'source'/'integration-proposal.json').write_text(json.dumps(layout,indent=2)+'\n')


def main():
    for sub in ('assets','layers/day','layers/night','previews'): (ROOT/sub).mkdir(parents=True,exist_ok=True)
    day,dl=scene(); night,nl=scene(True)
    assets={'fireplace':fireplace_asset(),'fire':fire_asset(),'tv':tv_asset(),
            'window-day':window_asset(),'window-night':window_asset(True),'rug':rug_asset(),
            'sofa-base':sofa_asset(),'sofa-front':sofa_asset(True)}
    combined=sofa_asset();combined.alpha_composite(sofa_asset(True));assets['sofa-complete']=combined
    for kind in ('bear','her'):
        for pose in ('stand','sit'):
            for back in (False,True): assets[f'{kind}-{pose}-'+('back' if back else 'front')]=character(kind,pose,back)
    for name,im in assets.items(): im.save(ROOT/'assets'/f'{name}.png')
    for mode,im,layers in [('day',day,dl),('night',night,nl)]:
        im.save(ROOT/'previews'/f'{mode}-1x.png')
        im.resize((1280,960),Image.Resampling.NEAREST).save(ROOT/'previews'/f'{mode}-4x.png')
        board(mode=='night').save(ROOT/'previews'/f'{mode}-presentation.png')
        for name,layer in layers: layer.save(ROOT/'layers'/mode/f'{name}.png')
        save_svg(layers,ROOT/'source'/f'{mode}-layers.svg')
    ratio_board().save(ROOT/'previews'/'proportions.png')
    asset_board(assets).save(ROOT/'previews'/'assets-overview.png')
    mobile_board(day,night).save(ROOT/'previews'/'mobile-framing.png')
    style_board(day,night).save(ROOT/'previews'/'style-sheet.png')
    pack_atlas(assets)
    (ROOT/'source'/'palette.json').write_text(json.dumps(P,indent=2)+'\n')
    # Export makes pixel grid and layer identity mechanically reviewable.
    checks={'canvas':[W,H],'tile':16,'layers':[n for n,_ in dl],
            'alpha_values':sorted(set(day.getchannel('A').get_flattened_data())),
            'assets':{},'head_shared_by_poses':True,'actors_are_scale_studies':True}
    for n,im in assets.items():
        checks['assets'][n]={'size':list(im.size),'visible_bbox':im.getbbox(),
                             'alpha_values':sorted(set(im.getchannel('A').get_flattened_data()))}
    checks['sha256']={f'{m}-1x.png':hashlib.sha256((ROOT/'previews'/f'{m}-1x.png').read_bytes()).hexdigest() for m in ('day','night')}
    (ROOT/'source'/'render-checks.json').write_text(json.dumps(checks,indent=2)+'\n')
    print(json.dumps({'rendered':str(ROOT),'canvas':[W,H],'assets':len(assets),'layers_per_mode':len(dl)}))


if __name__=='__main__': main()
