"""Editable pixel primitives/material inheritance from ART-01 (25e1cd8), copied read-only. No entry point or writes."""

import math

from PIL import Image, ImageDraw

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
