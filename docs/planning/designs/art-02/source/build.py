"""ART-02: integer pixel source, no runtime imports or image resampling in assets.
Only preview images use nearest-neighbour enlargement. All writes stay in ART's
three owned directories; READY is written separately, only after QA is complete.
"""
from pathlib import Path
import sys
sys.dont_write_bytecode=True
import math, json
from PIL import Image, ImageDraw, ImageFont
from materials import PixelArt as Art, P, color, floor_wall, character as candidate32

ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[3]
PUBLIC=REPO/'frontend/public/art-v2'
EVAL=REPO/'docs/planning/evaluations/visual-round-02/art'
VERSION='art-v2.1.0'
FONT='/System/Library/Fonts/STHeiti Light.ttc'
FRAME=(32,32)
FOOT=(16,29)


def txt(im,pos,text,size=18,c='#4a3b55'):
    ImageDraw.Draw(im).text(pos,text,font=ImageFont.truetype(FONT,size),fill=c)


def head(kind,direction):
    p=Art(18,12)
    side=direction in ('right','left')
    if kind=='bear':
        if not side:
            p.ellipse(4,2,2,2,'fur0');p.ellipse(13,2,2,2,'fur0')
            p.rect(3,1,2,3,'fur3');p.rect(12,1,2,3,'fur3')
            p.poly([(4,2),(13,2),(15,4),(15,8),(13,10),(4,10),(2,8),(2,4)],'fur0')
            p.poly([(4,3),(13,3),(14,4),(14,8),(12,9),(4,9),(3,8),(3,4)],'fur3')
            p.rect(4,9,9,1,'fur2')
            if direction=='down':
                p.rect(5,5,1,1,'hair0');p.rect(11,5,1,1,'hair0')
                p.rect(8,7,2,1,'hair0');p.rect(8,8,3,1,'fur0')
        else:
            p.ellipse(6,2,2,2,'fur0');p.rect(5,1,2,3,'fur3')
            p.poly([(5,2),(11,2),(14,5),(15,6),(15,8),(12,10),(5,10),(3,7),(3,4)],'fur0')
            p.poly([(5,3),(10,3),(13,5),(14,6),(14,8),(11,9),(5,9),(4,7),(4,4)],'fur3')
            p.rect(11,5,1,1,'hair0');p.rect(14,7,1,1,'hair0');p.rect(10,9,3,1,'fur2')
    else:
        p.poly([(6,0),(11,0),(14,2),(15,5),(14,9),(12,11),(4,11),(2,8),(2,4),(4,1)],'hair0')
        p.poly([(6,1),(10,1),(13,3),(13,7),(11,9),(4,9),(3,7),(3,4),(4,2)],'hair1')
        p.rect(5,2,5,1,'hair2')
        if direction=='down':
            p.poly([(7,4),(9,3),(12,5),(12,8),(10,10),(6,10),(4,8),(4,5)],'skin1')
            p.rect(6,5,5,3,'skin2');p.rect(6,6,1,1,'hair0');p.rect(10,6,1,1,'hair0')
            p.rect(8,9,2,1,'skin0')
        elif side:
            p.poly([(10,4),(12,4),(14,6),(15,7),(14,9),(11,10),(9,8)],'skin2')
            p.rect(12,6,1,1,'hair0');p.rect(12,9,2,1,'skin0')
            p.rect(9,4,2,5,'hair0')
        else:
            p.line([(12,4),(12,7),(10,9)],'hair2')
    return p.im.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if direction=='left' else p.im


def actor(kind,direction='down',pose='idle',phase=0,lean=0):
    """Fixed 32² frame and foot anchor across every scene and pose.
    Head is translated, never scaled/rotated. Lean deforms torso and arm geometry.
    """
    if direction=='left':
        im,info=actor(kind,'right',pose,phase,lean)
        # Mirror around x=16, preserving the exact foot anchor, not around x=15.5.
        mirrored=Art(32,32);mirrored.paste(im.transpose(Image.Transpose.FLIP_LEFT_RIGHT),1,0)
        info=dict(info);info['head_rect']=[32-info['head_rect'][0]-info['head_rect'][2]+1,info['head_rect'][1],18,12]
        return mirrored.im,info
    p=Art(32,32)
    seated=pose in ('sit','lean')
    hy=9 if seated else 5
    hx=7+lean
    side=direction=='right'
    shift=[-1,0,1,0][phase] if pose=='walk' else 0
    lift=[0,1,0,-1][phase] if pose=='walk' else 0
    if kind=='bear':
        if seated:
            p.poly([(10+lean,17),(22+lean,17),(24,23),(23,27),(20,29),(10,29),(7,26),(8,22)],'fur0')
            p.poly([(11+lean,17),(21+lean,17),(22,23),(22,27),(18,28),(11,28),(9,25)],'fur2')
            p.poly([(12+lean,18),(20+lean,18),(21,25),(18,27),(11,27)],'fur3')
            p.ellipse(10,27,3,1,'fur2');p.ellipse(22,27,3,1,'fur2')
            p.rect(8,23,2,3,'fur1');p.rect(22,23,2,3,'fur1')
        elif side:
            p.poly([(12,14),(20,14),(22,18),(22,24),(20,26),(13,26),(10,23),(10,18)],'fur0')
            p.rect(12,15,8,10,'fur3');p.rect(11,18,2,6,'fur2')
            p.rect(13+shift,25,3,3,'fur0');p.rect(18-shift,24+abs(lift),3,4-abs(lift),'fur0')
            p.rect(13+shift,25,3,2,'fur2');p.rect(18-shift,24+abs(lift),3,3-abs(lift),'fur3')
            p.line([(17,18),(18,22+lift)],'fur1',2)
        else:
            p.poly([(10,14),(22,14),(24,18),(24,24),(22,26),(10,26),(8,24),(8,18)],'fur0')
            p.rect(10,15,12,10,'fur2');p.rect(12,15,8,10,'fur3')
            p.rect(9,18+lift,2,5,'fur2');p.rect(22,18-lift,2,5,'fur2')
            p.rect(10+shift,25,5,3,'fur0');p.rect(18-shift,25,5,3,'fur0')
            p.rect(11+shift,25,4,2,'fur3');p.rect(18-shift,25,4,2,'fur2')
            if phase in (1,3) and pose=='walk':
                x=11 if phase==1 else 19;p.rect(x,27,3,2,'fur0')
    else:
        top=18 if seated else 14
        if side and not seated:
            p.poly([(12,top),(20,top),(22,top+3),(21,22),(12,22),(10,18)],'teal0')
            p.rect(12,top+1,8,6,'teal2');p.rect(12,top+1,6,1,'teal3')
            p.rect(16,17+lift,3,4,'teal3');p.rect(17,21+lift,2,3,'skin2')
            p.rect(13+shift,22,3,6,'pants');p.rect(18-shift,22+abs(lift),3,6-abs(lift),'pants')
            p.rect(13+shift,27,4,2,'hair0');p.rect(18-shift,27-abs(lift),4,2,'hair0')
        else:
            p.poly([(11+lean,top),(20+lean,top),(23,top+3),(23,top+6),(9,top+6),(8,top+3)],'teal0')
            p.rect(11+lean,top+1,10,6,'teal2');p.rect(11+lean,top+1,8,1,'teal3')
            p.rect(8,top+2+lift,3,3,'teal3');p.rect(22,top+2-lift,3,3,'teal2')
            p.rect(9,top+5+lift,2,3,'skin2');p.rect(22,top+5-lift,2,3,'skin1')
            if seated:
                p.rect(10,25,13,3,'pants');p.rect(8,27,5,2,'hair0');p.rect(21,27,4,2,'hair0')
            else:
                p.rect(11,22,11,2,'pants')
                p.rect(11+shift,24,4,4,'pants');p.rect(18-shift,24,4,4,'pants')
                p.rect(11+shift,27,4,2,'hair0');p.rect(18-shift,27,4,2,'hair0')
                if pose=='walk' and phase in (1,3):
                    x=11 if phase==1 else 18;p.rect(x,26,4,1,'hair1')
            if direction=='down':
                # 5×4 chest motif; face is never put on the back.
                p.rect(13+lean,top+2,1,2,'hair0');p.rect(17+lean,top+2,1,2,'hair0')
                p.rect(13+lean,top+4,5,3,'hair0');p.rect(14+lean,top+5,1,1,'cream');p.rect(16+lean,top+5,1,1,'cream')
        # Long hair below head, following lean rather than turning into cat ears.
        if direction=='up':
            p.poly([(10+lean,hy+8),(21+lean,hy+8),(21+lean,top+4),(19+lean,top+6),(12+lean,top+5),(10+lean,top+3)],'hair0')
            p.rect(12+lean,hy+9,7,max(1,top+4-(hy+9)),'hair1')
        elif side:
            p.rect(11,hy+8,4,8,'hair0');p.rect(12,hy+9,2,6,'hair1')
    p.paste(head(kind,direction),hx,hy)
    if kind=='bear' and not seated:
        # Both identities stand 24 visible pixels tall; sole ends at foot Y=29.
        if side:
            p.rect(13+shift,28,3,1,'fur0');p.rect(18-shift,28,3,1,'fur0')
        else:
            p.rect(10+shift,28,5,1,'fur0');p.rect(18-shift,28,5,1,'fur0')
    return p.im,{'head_rect':[hx,hy,18,12],'foot_anchor':[16,29],'origin':[.5,29/32]}


def sofa(scale=24,front=False):
    """Two hand-parametrized native grids, no resize of the 24px design."""
    seat=26 if scale==24 else 34; arm=8 if scale==24 else 10
    w=seat*2+arm*2+12; h=48 if scale==24 else 60
    p=Art(w,h); mid=w//2
    back=22 if scale==24 else 28
    if not front:
        p.ellipse(mid,h-5,mid-4,4,'stone2');p.ellipse(mid,h-6,mid-8,3,'stone1')
        for x in (10,w-14):p.rect(x,h-12,4,10,'wood0');p.rect(x+1,h-11,2,7,'wood3')
        p.poly([(8,8),(w-9,8),(w-4,13),(w-4,h-13),(w-9,h-8),(8,h-8),(3,h-13),(3,14)],'cloth0')
        for x in (arm+4,arm+5+seat):
            p.poly([(x+2,8),(x+seat-3,8),(x+seat-1,11),(x+seat-1,back),(x+seat-4,back+3),(x+1,back+2),(x,11)],'cloth3')
            p.line([(x+2,8),(x+seat-4,8),(x+seat-2,10)],'cloth5')
            p.line([(x+2,back),(x+8,back+1),(x+seat-4,back)],'cloth2')
            p.line([(x+seat-5,12),(x+seat-6,15),(x+seat-5,17)],'cloth2')
        for x in (3,w-arm-5):
            p.poly([(x+3,5),(x+arm-3,5),(x+arm,9),(x+arm,back+10),(x+arm-2,back+14),(x+1,back+14),(x-1,back+10),(x-1,10)],'cloth1')
            p.poly([(x+3,5),(x+arm-3,5),(x+arm-1,8),(x+arm-1,back+3),(x+1,back+3),(x,9)],'cloth3')
            p.line([(x+1,10),(x+2,7),(x+arm-4,7)],'cloth5')
            p.line([(x+1,11),(x+1,back+1)],'cloth4')
            p.ellipse(x+arm//2,back+6,arm//2,6,'cloth2')
            p.ellipse(x+arm//2,back+5,max(1,arm//2-2),4,'cloth3')
    else:
        p.poly([(arm+4,back),(w-arm-5,back),(w-arm-2,back+3),(w-arm-2,h-12),(w-arm-6,h-9),(arm+4,h-9),(arm+1,h-12),(arm+1,back+3)],'cloth0')
        p.rect(arm+3,back+2,w-arm*2-6,h-back-14,'cloth3')
        p.rect(arm+4,back,w-arm*2-8,3,'cloth4')
        p.rect(arm+5,back,w-arm*2-10,1,'cloth5')
        p.rect(arm+4,h-13,w-arm*2-8,2,'cloth2')
        p.rect(mid,back+4,1,h-back-18,'cloth2')
        for x in (mid-15,mid+15):
            p.rect(x,back+9,2,1,'cloth1');p.rect(x-1,back+10,2,1,'cloth4')
        # One distinct falling fold rather than a rectangle of teal.
        x=w-21
        p.poly([(x,11),(x+10,9),(x+17,13),(x+15,29),(x+11,h-7),(x+1,h-8),(x+2,28),(x-2,18)],'teal0')
        p.poly([(x,12),(x+10,10),(x+15,13),(x+13,28),(x+10,h-9),(x+2,h-10),(x+3,28),(x-1,18)],'teal2')
        p.line([(x+3,13),(x+4,23),(x+5,31),(x+3,h-10)],'teal3',2)
        p.line([(x+11,14),(x+9,26),(x+10,32),(x+8,h-10)],'teal1',2)
        p.line([(x+1,h-17),(x+5,h-15),(x+11,h-17)],'teal4')
        p.line([(x+1,h-14),(x+5,h-12),(x+10,h-14)],'sand')
        for dx in (2,5,8,10):p.rect(x+dx,h-9,1,4,'teal4')
    return p.im


def fireplace():
    p=Art(76,86)
    p.rect(15,14,48,60,'stone0');p.rect(16,15,46,57,'stone2')
    for row,widths in enumerate([(14,19,13),(21,13,12),(12,17,17),(18,16,12),(16,18,12),(22,12,12)]):
        x=16;y=16+row*9
        for j,w in enumerate(widths):
            p.poly([(x+1,y),(x+w-3,y),(x+w-1,y+2),(x+w-1,y+6),(x+w-2,y+7),(x,y+7),(x,y+1)],'stone3' if (row+j)%3 else 'stone4')
            p.line([(x+1,y),(x+w-3,y)],'stone5')
            p.rect(x+1,y+7,w-2,1,'stone1')
            if (row+j)%2:p.rect(x+3,y+4,2,1,'stone2')
            x+=w
    p.poly([(23,72),(23,47),(27,38),(34,33),(44,33),(52,38),(56,47),(56,72)],'stone0')
    p.poly([(26,72),(26,48),(30,40),(35,37),(43,37),(49,41),(53,48),(53,72)],'#3a2d3b')
    for y in (44,50,56,62,68):
        x=30 if y<50 else 27;p.rect(x,y,52-x,1,'#614042')
        for x in range(x+(y%4)*3,53,10):p.rect(x,y+1,1,5,'#614042')
    for pts in [[(21,47),(24,38),(29,41),(27,48)],[(25,37),(32,31),(35,37),(30,41)],
                [(33,30),(43,30),(43,37),(35,37)],[(44,31),(52,35),(48,41),(44,37)],
                [(53,36),(58,47),(53,49),(49,42)]]:
        p.poly(pts,'stone4');p.line(pts[:2],'stone5')
    for x in (21,53):
        for y in (49,59):p.rect(x,y,6,9,'stone3');p.rect(x,y,5,1,'stone5');p.rect(x+5,y+1,1,7,'stone1')
    p.poly([(12,71),(64,71),(69,76),(8,76)],'stone4');p.rect(9,76,59,5,'stone1')
    p.rect(9,76,59,1,'stone5');p.line([(30,72),(29,76),(29,80)],'stone2')
    p.line([(48,72),(49,76),(49,80)],'stone2')
    p.rect(10,23,58,6,'wood0');p.rect(10,23,57,5,'wood2')
    p.poly([(12,20),(65,20),(69,23),(8,23)],'wood4');p.rect(9,23,59,1,'wood5')
    p.line([(15,25),(28,25),(31,26),(36,26),(39,25),(58,25)],'wood1')
    for x in (16,57):p.poly([(x,29),(x+6,29),(x+3,36),(x,37)],'wood1');p.rect(x+1,30,1,4,'wood3')
    p.rect(22,3,20,17,'wood1');p.rect(23,3,18,1,'wood5');p.rect(25,6,14,11,'sky')
    p.rect(25,12,14,5,'sea');p.poly([(25,13),(28,9),(33,13)],'leaf');p.rect(35,8,2,2,'warm')
    p.ellipse(55,16,3,4,'teal2');p.rect(53,12,4,2,'teal4');p.rect(54,14,1,3,'teal3')
    p.line([(55,12),(55,6),(51,3)],'leaf');p.rect(50,2,3,2,'cream')
    return p.im


def fire(phase=0):
    p=Art(28,28)
    p.ellipse(14,23,11,2,'#914c42')
    wobble=[0,1,-1,0][phase];tip=[6,4,5,7][phase]
    p.poly([(4,23),(4,17),(8,19),(7,11),(12,16),(14+wobble,tip),(19,15),(22,12),(22,22),(18,25),(8,25)],'#c46a46')
    p.poly([(7,23),(8,18),(11,20),(12,13),(16,16),(16+wobble,10),(19,20),(21,18),(20,24)],'#ec9c52')
    p.poly([(11,24),(11,20),(14,21),(15,15),(18,22),(17,25)],'warm')
    p.poly([(14,24),(15,21),(17,24)],'linen')
    p.line([(5,24),(22,21)],'wood0',2);p.line([(7,21),(22,25)],'wood1',2)
    p.line([(6,22),(18,21)],'#c48654')
    p.rect(4,25,21,1,'hair0')
    for x in (5,12,23):p.rect(x,22,1,5,'hair0')
    if phase!=3:p.rect(14+wobble,tip-2,1,1,'warm')
    return p.im


def tv_case():
    p=Art(60,64)
    for x in (9,49):p.rect(x,55,3,8,'wood0');p.rect(x,55,1,6,'wood4')
    p.rect(7,44,47,14,'wood0');p.rect(8,45,44,11,'wood2')
    for x in (10,32):
        p.rect(x,47,19,7,'wood1');p.rect(x+1,48,17,5,'wood3')
        p.rect(x+2,49,1,3,'wood2');p.rect(x+14,49,2,1,'warm')
    p.poly([(8,41),(52,41),(56,45),(4,45)],'wood4');p.rect(5,45,50,1,'wood5')
    p.rect(15,37,3,5,'wood0');p.rect(44,37,3,5,'wood0')
    p.poly([(12,7),(49,7),(53,11),(53,37),(49,40),(10,40),(7,36),(7,12)],'wood0')
    p.poly([(12,7),(48,7),(51,10),(9,10)],'wood4')
    p.rect(9,11,41,26,'wood2');p.rect(9,11,41,1,'wood5');p.rect(50,12,2,24,'wood1')
    p.poly([(14,13),(38,13),(41,16),(41,33),(38,36),(13,36),(11,33),(11,16)],'hair0')
    # Screen hole is alpha, filled by independent channel content behind the bezel.
    p.d.rectangle((13,15,39,34),fill=(0,0,0,0))
    for y in (17,25):p.ellipse(46,y,2,2,'wood0');p.rect(46,y-1,1,2,'wood5')
    for y in (31,33,35):p.rect(43,y,6,1,'wood0')
    p.line([(26,6),(20,2)],'wood0');p.line([(27,6),(33,2)],'wood0')
    return p.im


def screen(enabled=True):
    p=Art(27,20);p.rect(0,0,27,20,'#273440')
    if enabled:
        p.rect(1,1,25,11,'sky');p.rect(1,12,25,7,'sea')
        p.poly([(1,14),(6,8),(9,10),(13,14)],'leaf');p.rect(15,6,7,1,'cream')
        p.rect(11,15,12,1,'sky');p.rect(5,18,8,1,'sky')
    p.line([(2,3),(4,2),(8,2)],'#a0b8c5' if enabled else '#4c6371')
    return p.im


def window_parts(night=False):
    p=Art(60,74)
    p.rect(6,7,49,59,'wood0');p.rect(8,8,45,56,'wood2');p.rect(9,8,43,1,'wood4')
    p.d.rectangle((11,12,49,60),fill=(0,0,0,0))
    p.rect(29,10,3,53,'wood1');p.rect(29,11,1,50,'wood5')
    p.rect(10,35,41,3,'wood1');p.rect(11,35,39,1,'wood5')
    for flip in (False,True):
        q=Art(60,74)
        q.poly([(2,4),(14,4),(12,25),(9,43),(11,61),(6,65),(1,63),(4,42)],'stone2')
        q.poly([(3,4),(12,4),(10,27),(7,43),(9,61),(5,64),(2,61),(5,42)],'cream')
        q.line([(7,7),(6,30),(5,42),(6,60)],'linen')
        q.line([(10,7),(8,32),(6,43),(8,60)],'stone3')
        q.rect(3,43,6,2,'teal2');q.rect(3,43,5,1,'teal4')
        q.line([(3,59),(5,61),(9,59)],'teal2')
        p.paste(q.im.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if flip else q.im,0,0)
    p.rect(0,3,60,2,'wood0');p.rect(2,2,56,1,'wood3')
    for x in (2,7,12,47,52,57):p.rect(x,1,1,5,'wood4')
    p.rect(7,65,47,4,'wood0');p.rect(6,63,49,3,'wood4');p.rect(7,63,47,1,'wood5')
    v=Art(39,49)
    v.rect(0,0,39,49,'#354665' if night else 'sky')
    v.rect(0,27,39,7,'#435673' if night else '#a3c9ce');v.rect(0,34,39,15,'#354d67' if night else 'sea')
    if night:
        v.ellipse(28,10,4,4,'cream');v.ellipse(30,8,3,3,'#354665')
        for x,y in ((4,8),(17,19),(33,24),(10,3)):v.rect(x,y,1,1,'#c2ced0')
    else:
        for x,y,w in ((4,9,10),(20,21,13)):v.rect(x,y,w,2,'linen');v.rect(x+3,y-1,w-5,1,'linen')
    v.poly([(0,33),(4,28),(8,30),(13,26),(18,32),(22,34)],'#476b64' if night else '#72906f')
    for x,y,w in ((20,38,12),(6,42,9),(21,46,14)):v.rect(x,y,w,1,'#7396ac' if night else 'sky')
    return p.im,v.im


def rug():
    p=Art(112,68);p.rect(3,3,106,60,'stone3');p.rect(4,4,104,58,'sand')
    p.rect(6,6,100,54,'cream');p.rect(9,9,94,48,'teal1');p.rect(10,10,92,46,'teal3')
    p.rect(12,12,88,42,'sand');p.rect(15,15,82,36,'linen')
    for x in range(5,108,3):p.rect(x,0,1,4,'stone3');p.rect(x+1,1,1,3,'cream');p.rect(x,63,1,3+x%2,'stone3')
    for x in range(18,95,8):p.rect(x,17,2,1,'sand');p.rect(x,48,2,1,'sand')
    for x,y in ((19,20),(92,20),(19,46),(92,46)):p.poly([(x,y-1),(x+1,y),(x,y+1),(x-1,y)],'cloth3')
    return p.im


def door():
    p=Art(30,40)
    p.rect(2,2,26,36,'wood0');p.rect(3,2,24,2,'wood5')
    p.rect(4,5,22,32,'wood1');p.rect(5,6,20,30,'wood3')
    p.rect(7,8,16,9,'teal1');p.rect(8,9,14,7,'sky');p.rect(14,8,2,9,'wood4')
    p.rect(7,20,16,1,'wood2');p.rect(20,24,2,2,'warm')
    for x in (8,13,18):p.rect(x,23,1,11,'wood2')
    p.rect(1,37,28,3,'stone3');p.rect(1,37,28,1,'stone5')
    return p.im


def smalls():
    items={}
    p=Art(8,8);p.rect(1,2,4,5,'cream');p.rect(2,3,2,1,'wood1');p.rect(5,3,2,3,'cream');p.rect(5,4,1,1,'wood3');p.rect(2,6,2,1,'stone2');items['cup-cream']=p.im
    p=Art(24,25);p.ellipse(12,21,10,3,'wood1')
    for x in (5,18):p.rect(x,13,2,10,'wood1');p.rect(x,14,1,7,'wood4')
    p.poly([(5,5),(19,5),(22,10),(19,14),(3,14),(1,10)],'wood0');p.poly([(5,5),(18,5),(21,9),(18,11),(4,11),(2,9)],'wood4');p.rect(6,8,10,1,'wood2');items['side-table']=p.im
    p=Art(24,38);p.ellipse(12,34,11,3,'wood1');p.poly([(6,23),(20,23),(18,35),(9,35)],'cloth2');p.rect(6,23,14,3,'cloth4');p.rect(9,27,1,6,'cloth5')
    p.line([(13,24),(14,10),(10,4)],'teal0',2)
    for x,y,s in ((14,12,-1),(14,17,1),(13,23,-1),(14,8,1)):
        p.poly([(x,y),(x+s*7,y-5),(x+s*9,y-3),(x+s*6,y+1)],'teal1');p.line([(x+s*2,y-1),(x+s*7,y-4)],'grass')
    items['plant']=p.im
    p=Art(24,19);p.ellipse(12,16,11,2,'wood1');p.rect(3,7,18,10,'wood0');p.rect(4,9,16,7,'wood2')
    for y in (10,13,16):p.rect(4,y,16,1,'wood4')
    for x,y in ((9,6),(16,8),(13,3)):
        p.line([(x-5,y-2),(x+1,y)],'wood1',4);p.ellipse(x+1,y,2,2,'wood4');p.rect(x+1,y,1,1,'wood2')
    items['logs']=p.im
    return items


def shell():
    p=Art();p.paste(floor_wall(),0,0)
    # Local window light preserves every board seam; no flat paint covering grain.
    mask=Art()
    for pts in [[(244,104),(256,104),(238,127),(221,127)],[(260,104),(276,104),(267,127),(244,127)],
                [(217,133),(234,133),(218,153),(196,153)],[(240,133),(264,133),(253,153),(224,153)]]:
        mask.poly(pts,'sand')
    for y in range(102,155):
        for x in range(20,300):
            if mask.im.getpixel((x,y))[3]:
                old=p.im.getpixel((x,y));c=color('sand')
                p.im.putpixel((x,y),tuple(round(old[i]*.74+c[i]*.26) for i in range(3))+(255,))
    # Foreground opening matches current HOME_LAYOUT entry, not a newly moved exit.
    p.rect(252,222,40,8,'wood4');p.rect(254,223,36,4,'wood5');p.rect(254,229,36,3,'stone2')
    return p.im


LAYOUT={
    'shell':[0,0],'fireplace':[34,31],'fire':[59,74],
    'tv-case':[135,55],'tv-screen':[148,70],
    'window-frame':[231,24],'window-view':[242,36],
    'rug':[112,143],'sofa-base':[126,153],'sofa-front':[126,153],
    'plant':[269,91],'logs':[27,108],'side-table':[100,163],'cup-cream':[107,161],
    'fireplace-shadow':[36,108],'tv-shadow':[135,111],
}
SEATS=[[151,179],[178,179]]


def lit(im,xy,night=False,exempt=False):
    if not night or exempt:return im.copy()
    out=im.copy();pix=out.load()
    for y in range(im.height):
        for x in range(im.width):
            c=pix[x,y]
            if not c[3]:continue
            gx=x+xy[0];gy=y+xy[1]
            base=[round(c[i]*(.49,.50,.65)[i]+(10,13,25)[i]) for i in range(3)]
            dist=math.hypot((gx-73)/75,(gy-97)/66)
            t=round(max(0,1-dist)*12)/12*.43
            pix[x,y]=tuple(round(base[i]*(1-t)+(255,200,126)[i]*t) for i in range(3))+(255,)
    return out


def furniture_assets():
    win,view=window_parts();_,viewnight=window_parts(True)
    out={'shell':shell(),'fireplace':fireplace(),'tv-case':tv_case(),'tv-screen':screen(),
         'tv-screen-off':screen(False),'window-frame':win,'window-view':view,'window-view-night':viewnight,
         'rug':rug(),'sofa-base':sofa(),'sofa-front':sofa(front=True),'door':door(),**smalls()}
    for i in range(4):out[f'fire-{i}']=fire(i)
    for name,w,h in [('fireplace-shadow',76,12),('tv-shadow',60,10)]:
        p=Art(w,h);p.ellipse(w//2,h//2,w//2-2,h//2-1,'wood2');p.ellipse(w//2,h//2,w//2-7,h//2-2,'wood1');out[name]=p.im
    return out


def composite(night=False,with_actors=True,stand=False):
    assets=furniture_assets();layers=[]
    order=['shell','fireplace-shadow','tv-shadow','window-view','window-frame','fireplace','tv-screen','tv-case','logs','plant','rug','sofa-base','side-table','cup-cream','fire','sofa-front']
    p=Art()
    for name in order:
        if name=='sofa-front' and with_actors:
            for i,kind in enumerate(('bear','her')):
                im,_=actor(kind,'up','idle' if stand else 'sit');x,y=SEATS[i]
                if stand:x-=18;y+=34
                p.paste(lit(im,(x-16,y-29),night),x-16,y-29)
        key='fire-0' if name=='fire' else 'window-view-night' if name=='window-view' and night else name
        im=assets[key];xy=LAYOUT[name]
        p.paste(lit(im,xy,night, name in ('window-view','fire','tv-screen')), *xy)
    return p.im


def compare():
    # Each column is literally the same 390×568 CSS viewport at 2× logical zoom.
    out=Image.new('RGB',(860,940),'#f5eee2')
    txt(out,(30,25),'ART-02 / 同视口尺度比较',28)
    txt(out,(30,74),'两列均为 390×568 CSS px · 相机 2× · 相同字体与留位',18)
    for i,size in enumerate((24,32)):
        x=25+i*425
        view=Image.new('RGBA',(195,284),color('linen'));a=Art(195,284)
        a.rect(0,0,195,284,'#e4d4b6');a.rect(0,100,195,184,'wood3')
        for y in range(100,284,12):a.rect(0,y,195,1,'wood1')
        old=Art(20,28);old.rect(0,0,20,28,'wood1');old.rect(3,2,14,24,'wood3');old.rect(5,4,10,8,'sky');old.rect(9,4,1,8,'cream');old.rect(13,16,2,2,'warm')
        a.paste(old.im,17,72)
        if size==24:a.paste(door(),65,60)
        if size==32:
            # Candidate 32 requires a correspondingly larger 28×40 door opening.
            d32=Art(38,48);d32.rect(2,2,34,44,'wood0');d32.rect(5,5,28,40,'wood3');d32.rect(5,5,28,1,'wood5');d32.rect(27,28,2,2,'warm');a.paste(d32.im,67,52)
        im,_=actor('bear');im2,_=actor('her')
        if size==32:im=candidate32('bear','stand');im2=candidate32('her','stand')
        a.paste(im,108,69 if size==24 else 62);a.paste(im2,146,69 if size==24 else 62)
        so=sofa(size);sf=sofa(size,True);sx=(195-so.width)//2;sy=160
        a.paste(so,sx,sy)
        for j,k in enumerate(('bear','her')):
            if size==24:
                ac,_=actor(k,'up','sit');ax=sx+25+j*27;ay=sy+26
                a.paste(ac,ax-16,ay-29)
            else:
                ac=candidate32(k,'sit',True);ax=sx+31+j*35;ay=sy+33
                a.paste(ac,ax-16,ay-36)
        a.paste(sf,sx,sy)
        a.paste(smalls()['cup-cream'],145,121)
        out.paste(a.im.resize((390,568),Image.Resampling.NEAREST).convert('RGB'),(x,130))
        txt(out,(x+16,151),f'{size}px 候选',22)
        txt(out,(x+16,663),'坐下     电视     返回',16)
        txt(out,(x,724),'24px / 32×32 帧' if size==24 else '31px / 32×40 帧',20)
        txt(out,(x,762),'坐垫 26px / 肩宽 14–17px' if size==24 else '坐垫 34px / 肩宽 18–20px',16)
        txt(out,(x,795),'左旧门20×28 / 中新门洞22×32' if size==24 else '左旧门 / 中新门洞28×40',16)
    txt(out,(30,863),'选择 24px：保持 16px tile，与原主岛门窗和 2× 小屏关系更协调。',19)
    txt(out,(30,903),'静态真实尺寸取景，不是运行时或双人联机验收。',17)
    return out


def actor_board(actors):
    out=Image.new('RGB',(1280,1130),'#f5eee2')
    txt(out,(40,24),'ART-02 / 统一 24px 人物',30);txt(out,(40,72),'所有帧 32×32 · 脚锚 (16,29) · 全场景复用 · 这里按 5× 最近邻',18)
    for r,kind in enumerate(('bear','her')):
        y=140+r*460
        for j,key in enumerate([f'{kind}-idle-down',f'{kind}-idle-up',f'{kind}-idle-right',f'{kind}-sit-up',f'{kind}-lean-right-1',f'{kind}-lean-left-1']):
            im=actors[key];x=40+j*204
            out.paste(im.resize((160,160),Image.Resampling.NEAREST),(x,y),im.resize((160,160),Image.Resampling.NEAREST))
            txt(out,(x,y+172),['正面','背面','侧面','坐姿','向右靠','向左靠'][j],18)
        for j in range(4):
            im=actors[f'{kind}-walk-down-{j}'];x=40+j*204
            big=im.resize((160,160),Image.Resampling.NEAREST);out.paste(big,(x,y+222),big)
            txt(out,(x,y+384),f'步态 {j}',16)
        txt(out,(880,y+248),'站 / 坐 / 依靠共用头部',20)
        txt(out,(880,y+284),'躯干与四肢分别重画',18)
        txt(out,(880,y+319),'背面不画胸前猫脸',18)
    txt(out,(40,1082),'这是资源姿态表；实际成员与姿势只能来自已确认的房间状态。',18)
    return out


def presentation(night=False):
    im=composite(night)
    out=Image.new('RGB',(1120,1000),'#242633')
    txt(out,(80,30),'I-LAND / ART-02  ·  24px 统一尺度',24,'#a2cdb5')
    txt(out,(80,76),'窗边有海，炉边有你。',36,'#f5eee2')
    txt(out,(80,131),'夜晚 · 冷窗与暖火' if night else '白天 · 两个坐垫与两个人的尺度',20,'#f5eee2')
    out.paste(im.resize((960,720),Image.Resampling.NEAREST).convert('RGB'),(80,180))
    txt(out,(80,932),'人物仅供比例预览；运行资源不含示意人物层。',20,'#f5eee2')
    return out


def mobile():
    out=Image.new('RGB',(850,1000),'#f5eee2');txt(out,(25,24),'ART-02 / 320 与 390px 静态视口',26)
    txt(out,(25,67),'2× 像素 · 14/16px 普通中文 · 44px 操作留位',18)
    im=composite().resize((640,480),Image.Resampling.NEAREST)
    for x,w,cy in ((25,320,135),(405,390,135)):
        # Camera follows sofa centre; furniture coordinates stay fixed.
        crop=im.crop((332-w//2,0,332+w//2,480));out.paste(crop.convert('RGB'),(x,cy+80))
        d=ImageDraw.Draw(out);d.rounded_rectangle((x,cy,x+w,cy+60),8,fill='#fdf6e9')
        txt(out,(x+15,cy+10),'我们的家',22);txt(out,(x+15,cy+40),'壁炉暖着，先坐一会。',14)
        d.rounded_rectangle((x,cy+580,x+w,cy+636),8,fill='#326860');txt(out,(x+20,cy+599),'坐下    电视    返回',16,'#f5eee2')
        txt(out,(x,cy+656),f'{w}px 宽；人物可见约 48px 高',16)
    txt(out,(25,894),'画面保留相机平移需求；不缩小人物或字体来装进整屋。',18)
    txt(out,(25,936),'静态资源比例预览，不是应用浏览器或真机验收。',18)
    return out


def proportions():
    out=Image.new('RGB',(1280,870),'#f5eee2')
    txt(out,(40,24),'ART-02 / 人物—门洞—坐垫—杯子',28)
    txt(out,(40,72),'所有对象均为同一 4× 最近邻，没有单独放大人物或家具。',20)
    p=Art(300,155)
    p.rect(0,0,300,155,'#e6ddcb')
    for y in range(15,155,16):p.rect(0,y,300,1,'#d1c6b2')
    p.paste(door(),12,35)
    for x,kind in [(56,'bear'),(91,'her')]:
        im,_=actor(kind);p.paste(im,x,46)
    # Native cup sits against the existing hand in a measurement-only composition.
    im,_=actor('her');p.paste(im,143,46);p.paste(smalls()['cup-cream'],165,66)
    p.paste(sofa(),198,35)
    for i,kind in enumerate(('bear','her')):
        im,_=actor(kind,'up','sit');p.paste(im,207+i*27,32)
    p.paste(sofa(front=True),198,35)
    p.line([(16,74),(125,74)],'teal2');p.line([(145,74),(178,74)],'teal2')
    p.line([(201,81),(277,81)],'teal2')
    big=p.im.resize((1200,620),Image.Resampling.NEAREST);out.paste(big.convert('RGB'),(40,112))
    txt(out,(84,454),'净门洞 22×32',18);txt(out,(266,454),'站姿高 24',18);txt(out,(590,454),'杯身 4×5 / 手 2×3',18)
    txt(out,(856,454),'坐垫 26 / 肩宽 14–17',18)
    txt(out,(70,558),'头部：站 / 坐 / 依靠同向像素共用',21)
    txt(out,(70,602),'落脚点：所有方向与动作统一 (16,29)',21)
    txt(out,(70,646),'门洞留白：高度 +8px；宽度至少比肩部多 5px',21)
    txt(out,(40,772),'手杯图仅检查物品尺度，不表示已实现递杯功能。',20)
    txt(out,(40,814),'家具占地与坐席为接入建议，最终由整合者验证碰撞与遮挡。',20)
    return out


def seaside_preview():
    out=Image.new('RGB',(1270,730),'#f5eee2')
    txt(out,(30,22),'ART-02 / 海边站、坐、依靠使用同一套头部与帧',28)
    txt(out,(30,65),'三列均 390×568 CSS px、2×；背景仅作姿势取景，人物来自最终资源。',18)
    for i,pose in enumerate(('idle','sit','lean')):
        p=Art(195,284);p.rect(0,0,195,97,'sky');p.rect(0,97,195,70,'sea');p.rect(0,167,195,117,'sand')
        p.rect(0,166,195,2,'cream')
        for y in range(106,165,9):
            x=(y*7)%110;p.rect(x,y,28,1,'sky');p.rect(x+52,y+3,14,1,'sky')
        for x in (85,109):
            p.ellipse(x,204,10,4,'stone3');p.ellipse(x,202,9,3,'teal2');p.rect(x-5,201,10,1,'teal3')
        for seat,kind in enumerate(('bear','her')):
            offset=(-9,9)[seat] if pose=='lean' else (-12,12)[seat]
            footY=218 if pose=='idle' else 204
            im,_=actor(kind,'up',pose,lean=(3 if seat==0 else -3) if pose=='lean' else 0)
            p.paste(im,97+offset-16,footY-29)
        out.paste(p.im.resize((390,568),Image.Resampling.NEAREST).convert('RGB'),(30+i*410,112))
        txt(out,(44+i*410,131),['站立 / 与主岛同帧','坐下 / 与客厅同帧','依靠 / 独立躯干姿势'][i],18)
    txt(out,(30,697),'此图为静态比例演示，不表示确认了在线成员或完成联机。',18)
    return out


def pack(entries,path):
    positions={};x=y=2;rh=0
    for key,im in entries.items():
        if x+im.width+2>1024:x=2;y+=rh+4;rh=0
        positions[key]=(x,y);x+=im.width+4;rh=max(rh,im.height)
    h=math.ceil((y+rh+2)/16)*16;atlas=Image.new('RGBA',(1024,h));frames={}
    for key,im in entries.items():
        x,y=positions[key];atlas.paste(im,(x,y))
        for yy in range(-1,im.height+1):
            for xx in (-1,im.width):atlas.putpixel((x+xx,y+yy),im.getpixel((min(max(xx,0),im.width-1),min(max(yy,0),im.height-1))))
        for xx in range(im.width):
            atlas.putpixel((x+xx,y-1),im.getpixel((xx,0)));atlas.putpixel((x+xx,y+im.height),im.getpixel((xx,im.height-1)))
        frames[key]={'frame':{'x':x,'y':y,'w':im.width,'h':im.height},'rotated':False,'trimmed':False,'spriteSourceSize':{'x':0,'y':0,'w':im.width,'h':im.height},'sourceSize':{'w':im.width,'h':im.height}}
    atlas.save(path.with_suffix('.png'))
    data={'frames':frames,'meta':{'app':'I-land ART-02','version':VERSION,'image':path.with_suffix('.png').name,'format':'RGBA8888','size':{'w':1024,'h':h},'scale':'1','padding':2,'extrude':1}}
    path.with_suffix('.json').write_text(json.dumps(data,indent=2)+'\n');return data


def main():
    for d in (ROOT/'previews',PUBLIC/'characters',PUBLIC/'home',EVAL):d.mkdir(parents=True,exist_ok=True)
    actors={};geometry={};animations={}
    for kind in ('bear','her'):
        for direction in ('down','up','right','left'):
            key=f'{kind}-idle-{direction}';actors[key],geometry[key]=actor(kind,direction)
            frames=[]
            for phase in range(4):
                k=f'{kind}-walk-{direction}-{phase}';actors[k],geometry[k]=actor(kind,direction,'walk',phase);frames.append(k)
            animations[f'{kind}-walk-{direction}']={'frames':frames,'frameRate':7,'repeat':-1,'reducedMotionFrame':key}
            key=f'{kind}-sit-{direction}';actors[key],geometry[key]=actor(kind,direction,'sit')
        for toward,sign in (('left',-1),('right',1)):
            frames=[]
            for phase,displacement in enumerate((1,3)):
                key=f'{kind}-lean-{toward}-{phase}';actors[key],geometry[key]=actor(kind,'up','lean',lean=sign*displacement);frames.append(key)
            animations[f'{kind}-lean-{toward}']={'frames':frames,'frameRate':5,'repeat':0,'reducedMotionFrame':frames[-1]}
    meta={}
    for key,im in actors.items():
        im.save(PUBLIC/'characters'/f'{key}.png')
        meta[key]={'url':f'/art-v2/characters/{key}.png','atlas':'art-v2-characters','frame':key,'size':list(im.size),'visibleBBox':list(im.getbbox()),**geometry[key]}
    pack(actors,PUBLIC/'characters-atlas')
    # Pure data source for existing makeTexture / DOM avatar migration.
    palette={};symbols={};pixelFrames={}
    for key,im in actors.items():
        rows=[]
        for y in range(32):
            row=''
            for x in range(32):
                c=im.getpixel((x,y))
                if not c[3]:row+='.';continue
                h='#'+''.join(f'{v:02x}' for v in c[:3])
                if h not in symbols:
                    symbol=chr(0x100+len(symbols));symbols[h]=symbol;palette[symbol]=h
                row+=symbols[h]
            rows.append(row)
        pixelFrames[key]=rows
    (PUBLIC/'characters-pixels.json').write_text(json.dumps({'width':32,'height':32,'footAnchor':FOOT,'palette':palette,'frames':pixelFrames},ensure_ascii=False,indent=2)+'\n')
    furn=furniture_assets();home={};homeMeta={}
    for name,im in furn.items():
        if name in ('window-view-night',):continue
        pos=LAYOUT.get('fire' if name.startswith('fire-') else 'tv-screen' if name=='tv-screen-off' else name,[0,0])
        for night in (False,True):
            suffix='night' if night else 'day';key=f'{name}-{suffix}'
            src=furn['window-view-night'] if name=='window-view' and night else im
            rendered=lit(src,pos,night,name.startswith('fire-') or name in ('tv-screen','tv-screen-off','window-view'))
            home[key]=rendered;rendered.save(PUBLIC/'home'/f'{key}.png')
            homeMeta[key]={'url':f'/art-v2/home/{key}.png','atlas':'art-v2-home','frame':key,'size':list(im.size),'visibleBBox':list(rendered.getbbox()),'origin':[0,0],'sampleTopLeft':pos}
    pack(home,PUBLIC/'home-atlas')
    obj=[{'id':'fireplace','base':'fireplace','topLeft':LAYOUT['fireplace'],'footprint':[42,103,60,14],'interact':[73,126],'depthY':117},
         {'id':'tv','base':'tv-case','screen':'tv-screen','topLeft':LAYOUT['tv-case'],'screenTopLeft':LAYOUT['tv-screen'],'screenSize':[27,20],'footprint':[142,99,47,19],'interact':[165,130],'depthY':118},
         {'id':'sofa','base':'sofa-base','foreground':'sofa-front','topLeft':LAYOUT['sofa-base'],'footprint':[129,166,73,33],'seats':SEATS,'standPoints':[[151,211],[178,211]],'depthY':199,'foregroundForSeatedOnly':True},
         {'id':'window','base':'window-frame','content':'window-view','topLeft':LAYOUT['window-frame'],'contentTopLeft':LAYOUT['window-view'],'footprint':None},
         {'id':'rug','base':'rug','topLeft':LAYOUT['rug'],'footprint':None},
         {'id':'table','base':'side-table','topLeft':LAYOUT['side-table'],'footprint':[102,172,20,14],'depthY':186},
         {'id':'plant','base':'plant','topLeft':LAYOUT['plant'],'footprint':[275,114,14,12],'depthY':126}]
    manifest={'version':VERSION,'round':'visual-02','status':'assets-prepared-not-runtime-verified',
              'scale':{'tile':16,'characterVisibleHeight':24,'frame':[32,32],'footAnchor':[16,29],'origin':[.5,29/32],'spriteScale':1,'cameraZoom':{'mobile':2,'desktop':'integer 2..4, same across scenes'},'footCollisionCandidate':{'width':8,'height':4,'offsetFromAnchor':[-4,-4],'frameOffset':[12,25]}},
              'atlases':{'art-v2-characters':{'png':'/art-v2/characters-atlas.png','json':'/art-v2/characters-atlas.json'},'art-v2-home':{'png':'/art-v2/home-atlas.png','json':'/art-v2/home-atlas.json'}},
              'characters':meta,'animations':animations,'home':homeMeta,
              'poseBindings':{'islandIdle':'{account}-idle-{direction}','islandWalk':'{account}-walk-{direction}',
                              'interiorSeated':'{account}-sit-up','seasideStanding':'{account}-idle-up','seasideArriving':'{account}-walk-up',
                              'seasideSeated':'{account}-sit-up','seasideLeaningBySeat':{'0':'{account}-lean-right-1','1':'{account}-lean-left-1'},
                              'portrait':'{account}-idle-down','legacyDirections':{'front':'down','back':'up','side':'right'}},
              'seaside':{'seatOffsetsX':[-12,12],'pairedLeaningOffsetsX':[-9,9],'singleLeaningOffsetsX':[-6,6],'standingOffsetY':14,'footAnchorSameAsEverywhere':True,'leanDirectionMeansVisualDirectionNotSeatName':True},
              'homeLayout':{'canvas':[320,240],'walkable':[20,102,280,126],'door':[272,218],'doorOpening':[252,222,40,10],
                            'objects':obj,'fire':{'topLeft':LAYOUT['fire'],'frames':[f'fire-{i}-day' for i in range(4)],'frameRate':5,'reducedMotionFrame':'fire-0-day'},
                            'staticPaintOrder':['shell','fireplace-shadow','tv-shadow','window-view','window-frame','fireplace','tv-screen','tv-case','logs','plant','rug','sofa-base','side-table','cup-cream','fire'],
                            'dynamicPaintOrder':['floor-and-shadows','furniture-and-actors-by-footY','sofa-front-over-seated-actors'],
                            'allFootprintsAreProposals':True,'demoActorsIncluded':False},
              'doorAsset':{'key':'door-day','opening':[4,5,22,32],'note':'For targeted cottage aperture replacement; existing building must be adapted by integrator, not overlaid blindly.'},
              'source':'Original integer pixel drawing, derived from ART-01 palette/material grammar. No third-party downloaded art.'}
    (PUBLIC/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    compare().save(ROOT/'previews/scale-comparison.png')
    actor_board(actors).save(ROOT/'previews/actor-poses.png')
    for night in (False,True):
        name='night' if night else 'day'
        composite(night).save(ROOT/'previews'/f'{name}-1x.png')
        composite(night,False).save(ROOT/'previews'/f'{name}-no-actors.png')
        presentation(night).save(ROOT/'previews'/f'{name}-presentation.png')
    mobile().save(ROOT/'previews/mobile.png')
    proportions().save(ROOT/'previews/proportions.png')
    seaside_preview().save(ROOT/'previews/seaside-poses.png')
    # A small native-scale sprite sheet makes review of every direction easy.
    sheet=Image.new('RGBA',(32*8,32*7))
    for i,im in enumerate(actors.values()):sheet.alpha_composite(im,((i%8)*32,(i//8)*32))
    sheet.save(ROOT/'previews/all-frames-1x.png')
    sheet.resize((1024,896),Image.Resampling.NEAREST).save(ROOT/'previews/all-frames-4x.png')
    print(json.dumps({'version':VERSION,'characters':len(actors),'homeFrames':len(home),'sofaSize':sofa().size,'readyWritten':False}))


if __name__=='__main__':main()
