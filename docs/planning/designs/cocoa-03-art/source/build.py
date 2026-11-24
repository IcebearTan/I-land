"""Cocoa-03 original native-grid add-on. Reads accepted art-v2.1.0; never writes it.
No hashes, game imports, database, browser or shared build output.
"""
from pathlib import Path
import sys,json,math
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1];REPO=ROOT.parents[3]
PUBLIC=REPO/'frontend/public/art-v2/cocoa';BASE=PUBLIC.parent
EVAL=REPO/'docs/planning/evaluations/warm-drink-03/art'
sys.path.insert(0,str(ROOT.parent/'art-02/source'))
from materials import PixelArt as Art, color, P
from PIL import Image,ImageDraw,ImageFont
VERSION='cocoa-art-1.0.0'
BASE_META=json.loads((BASE/'manifest.json').read_text())
FONT='/System/Library/Fonts/STHeiti Light.ttc'


def text(im,xy,s,size=18,c='#4a3b55'):
    ImageDraw.Draw(im).text(xy,s,font=ImageFont.truetype(FONT,size),fill=c)


def baseline(kind,direction):
    return Image.open(BASE/'characters'/f'{kind}-idle-{direction}.png').convert('RGBA')


def shade(im,night=False):
    if not night:return im.copy()
    out=im.copy()
    for y in range(im.height):
        for x in range(im.width):
            c=im.getpixel((x,y))
            if c[3]:out.putpixel((x,y),tuple(round(c[i]*(.57,.57,.68)[i]+(18,20,29)[i]) for i in range(3))+(255,))
    return out


def counter(front=False):
    p=Art(72,52)
    if not front:
        p.ellipse(36,47,34,4,'stone2');p.ellipse(36,46,29,3,'wood1')
        for x in (7,61):
            p.rect(x,34,4,14,'wood0');p.rect(x+1,35,2,11,'wood3')
        p.rect(7,36,58,8,'wood1')
        p.rect(10,39,52,3,'wood2');p.rect(11,39,50,1,'wood4')
        p.poly([(7,20),(65,20),(70,32),(68,36),(3,36),(1,32)],'wood0')
        p.poly([(7,19),(64,19),(69,31),(66,33),(4,33),(2,31)],'wood4')
        p.line([(7,19),(63,19),(67,27)],'wood5')
        p.rect(6,32,59,1,'wood5')
        for x,y,w in ((10,24,13),(26,28,9),(51,23,9),(15,30,10)):
            p.rect(x,y,w,1,'wood3')
        p.line([(25,20),(28,26),(30,32)],'wood2')
        # Small enamel tile protects the hot plate; other surface remains oak.
        p.poly([(36,22),(59,22),(63,31),(37,31)],'stone3')
        p.line([(38,23),(58,23),(61,30)],'cream')
    else:
        p.rect(4,34,63,5,'wood2');p.rect(5,34,61,1,'wood5');p.rect(6,38,59,1,'wood0')
        p.rect(11,36,18,1,'wood1');p.rect(48,36,12,1,'wood1')
        p.poly([(29,34),(42,34),(42,42),(39,46),(30,45)],'teal0')
        p.poly([(30,34),(41,34),(40,42),(38,45),(31,44)],'teal2')
        p.rect(32,34,2,9,'teal3');p.rect(37,35,1,8,'teal1')
        p.line([(31,41),(35,42),(40,41)],'sand')
        for x in (31,34,37,39):p.rect(x,45,1,3,'teal4')
    return p.im


def burner(level):
    p=Art(26,10);p.ellipse(13,5,12,4,'wood0');p.ellipse(13,4,10,3,'ink')
    if level:
        p.ellipse(13,4,8,2,'cloth3' if level==1 else '#d69a62')
        p.ellipse(13,4,6,1,'wood1')
    else:p.ellipse(13,4,8,2,'hair1')
    p.rect(2,5,3,2,'stone1');p.rect(21,5,3,2,'stone1')
    return p.im


def pot():
    p=Art(26,19)
    p.ellipse(13,14,10,3,'stone0')
    p.poly([(3,5),(23,5),(22,13),(20,16),(6,16),(4,13)],'stone1')
    p.poly([(4,6),(22,6),(21,12),(19,14),(7,14),(5,12)],'cream')
    p.rect(6,8,2,4,'linen');p.rect(19,8,2,5,'stone3')
    p.ellipse(13,5,10,4,'stone2');p.ellipse(13,4,9,3,'linen')
    p.ellipse(13,5,7,2,'wood0');p.ellipse(13,5,6,1,'#8f5a46')
    p.rect(8,4,4,1,'#b47b55');p.rect(15,5,3,1,'#6f4642')
    p.rect(0,6,4,3,'stone0');p.rect(1,6,3,1,'stone3')
    p.rect(22,6,4,3,'stone0');p.rect(23,6,2,1,'stone3')
    p.line([(7,12),(9,13),(17,13)],'stone3')
    return p.im


def knob(frame=0):
    p=Art(14,10);p.poly([(1,2),(11,2),(13,7),(0,7)],'wood1')
    p.ellipse(7,5,3,3,'ink');p.ellipse(7,4,2,2,'stone3')
    points=[[(6,4),(7,3)],[(7,3),(8,4)],[(8,4),(8,5)]]
    p.line(points[frame],'cream')
    p.rect(2,4,1,1,'warm');p.rect(10,5,1,1,'wood5')
    return p.im


def steam(frame=0):
    p=Art(24,24)
    drift=[0,1,0,-1][frame]
    ys=[1,0,2,1][frame]
    p.line([(2,22),(5+drift,19),(9+drift,16),(12+drift,13)],'stone4')
    p.line([(12+drift,11),(15+drift,8),(14+drift,5+ys),(17+drift,2+ys)],'cream')
    p.line([(6,22),(9-drift,20),(13-drift,18),(15-drift,15+ys)],'stone3')
    # Sparse two-tone curls, no alpha pulsing and no angry boiling/explosion cue.
    p.rect(20-drift,6+ys,1,2,'stone4')
    return p.im


def cup(kind='cream',topping='plain'):
    p=Art(12,12)
    base='cream' if kind=='cream' else 'teal3'
    shadow='stone2' if kind=='cream' else 'teal1'
    shine='linen' if kind=='cream' else 'teal4'
    p.rect(3,5,4,5,shadow);p.rect(3,5,3,4,base)
    p.rect(3,5,4,1,shine);p.rect(4,6,3,1,'wood1')
    p.rect(3,7,1,2,shine);p.rect(7,6,3,3,base);p.rect(7,7,2,1,shadow)
    if kind=='teal':p.rect(4,9,2,1,'teal2')
    if topping=='marshmallow':
        p.rect(3,3,2,2,'cream');p.rect(4,3,1,1,'linen');p.rect(5,4,2,2,'sand')
    elif topping=='cocoa':
        p.rect(4,5,1,1,'wood0');p.rect(6,5,1,1,'wood2');p.rect(5,6,1,1,'wood0')
    elif topping=='cinnamon':
        p.line([(5,5),(7,2)],'wood1');p.line([(6,4),(7,2)],'wood4')
        p.rect(4,5,1,1,'wood2')
    return p.im


def ingredient(kind):
    p=Art(20,20)
    if kind=='marshmallow':
        p.ellipse(10,15,8,3,'stone2');p.ellipse(10,12,8,3,'teal1')
        p.poly([(3,12),(17,12),(15,17),(6,17)],'teal2');p.line([(4,13),(7,15),(14,15)],'teal3')
        for x,y in ((4,9),(9,7),(12,10)):
            p.rect(x,y,4,4,'stone3');p.rect(x,y,3,3,'cream');p.rect(x,y,3,1,'linen')
    elif kind=='cocoa':
        p.rect(4,5,12,12,'wood0');p.rect(5,6,10,10,'cloth2');p.rect(5,6,1,10,'cloth4')
        p.rect(4,3,12,3,'wood2');p.rect(4,3,12,1,'wood5')
        p.rect(7,8,6,6,'sand');p.ellipse(10,11,2,1,'wood1');p.rect(9,12,2,1,'wood2')
    else:
        p.ellipse(10,16,8,2,'stone2');p.ellipse(10,14,8,2,'cream')
        for x,y in ((5,7),(9,6),(12,9)):
            p.line([(x,y),(x+3,y+7)],'wood1',3);p.line([(x,y),(x+3,y+7)],'wood4')
            p.rect(x-1,y,2,1,'wood0')
    return p.im


def effect():
    p=Art(10,10);p.rect(4,1,1,2,'warm');p.rect(1,4,2,1,'cream');p.rect(7,3,2,1,'cream');p.rect(5,6,1,2,'sand');return p.im


def empty_arms(kind,direction):
    im=baseline(kind,direction);p=Art(32,32);p.paste(im,0,0)
    if direction in ('down','up'):
        if kind=='bear':
            p.d.rectangle((7,17,9,24),fill=(0,0,0,0));p.d.rectangle((22,17,26,24),fill=(0,0,0,0))
            p.rect(9,17,1,8,'fur0');p.rect(22,17,1,8,'fur0')
        else:
            p.d.rectangle((7,17,10,21),fill=(0,0,0,0));p.d.rectangle((22,17,26,21),fill=(0,0,0,0))
            p.rect(10,17,1,5,'teal0');p.rect(21,17,1,5,'teal0')
            if direction=='up':
                for y in range(17,22):
                    for x in range(7,27):
                        if im.getpixel((x,y)) in [color('hair0'),color('hair1'),color('hair2')]:p.im.putpixel((x,y),im.getpixel((x,y)))
    else:
        if kind=='bear':p.rect(16,17,4,7,'fur3')
        else:
            p.d.rectangle((16,17,19,24),fill=(0,0,0,0));p.rect(16,17,4,4,'teal2');p.rect(16,21,4,1,'teal0');p.rect(18,22,2,3,'pants')
    # Exact accepted head rectangle, including its original edges and clear pixels.
    rect=BASE_META['characters'][f'{kind}-idle-{direction}']['head_rect']
    x,y,w,h=rect;p.im.paste(im.crop((x,y,x+w,y+h)),(x,y))
    return p.im


def limb(p,kind,points):
    outline='fur0' if kind=='bear' else 'teal0'
    sleeve='fur2' if kind=='bear' else 'teal3'
    skin='fur3' if kind=='bear' else 'skin2'
    p.line(points,outline,3);p.line(points,sleeve,2)
    x,y=points[-1];p.rect(x-1,y,2,2,skin)


def action(kind,name,direction,phase):
    if direction=='left':
        body,hands,info=action(kind,name,'right',phase)
        def mirror(im):
            q=Art(32,32);q.paste(im.transpose(Image.Transpose.FLIP_LEFT_RIGHT),1,0);return q.im
        info=dict(info)
        if info.get('hand'):info['hand']=[32-info['hand'][0],info['hand'][1]]
        if info.get('cup'):
            info['cup']=dict(info['cup']);info['cup']['flipX']=not info['cup']['flipX'];info['cup']['grip']=[11-info['cup']['grip'][0],8]
        return mirror(body),mirror(hands),info
    body=empty_arms(kind,direction);hands=Art(32,32);info={'hand':None,'cup':None}
    if name=='heat':
        hand=[(20,24),(21,25),(20,26)][phase]
        limb(hands,kind,[(22,17),(24,21),hand]);limb(hands,kind,[(10,17),(9,20),(11,22)])
        info['hand']=list(hand)
    elif name=='stir':
        hand=[(20,24),(21,24),(20,25),(19,24)][phase]
        tip=[(15,20),(16,21),(17,20),(16,19)][phase]
        hands.line([(hand[0]+2,hand[1]+1),tip],'wood1',2);hands.line([(hand[0]+2,hand[1]+1),tip],'wood4')
        hands.ellipse(tip[0],tip[1],1,1,'wood2')
        limb(hands,kind,[(22,17),(24,20),hand]);limb(hands,kind,[(10,17),(10,21),(12,23)])
        info['hand']=list(hand);info['spoonTip']=list(tip)
    elif name=='hold':
        hand=(26,23) if direction=='up' else (25,23) if direction=='down' else (22,20)
        if direction in ('down','up'):
            limb(hands,kind,[(22,17),(24,18),hand]);limb(hands,kind,[(10,17),(10,20),(10,22)])
        else:limb(hands,kind,[(17,18),(21,21),hand])
        info['hand']=list(hand);info['cup']={'grip':[3,8] if direction=='right' else [8,8],'flipX':direction=='right','layer':'after-body-before-hand-tip'}
    else:
        xs={'offer':[22,24,25],'receive':[25,28,29],'clink':[22,23,23,22]}[name]
        ys={'offer':[21,20,20],'receive':[21,20,20],'clink':[21,19,19,21]}[name]
        hand=(xs[phase],ys[phase])
        limb(hands,kind,[(17,18),(21,20),hand])
        info['hand']=list(hand)
        if name!='receive':info['cup']={'grip':[3,8],'flipX':True,'layer':'after-body-before-hand-tip'}
    # A 3px shoulder stroke can extend one pixel upward; keep the accepted head
    # rectangle untouched in the overlay, including at the neck boundary.
    hx,hy,hw,hh=BASE_META['characters'][f'{kind}-idle-{direction}']['head_rect']
    hands.d.rectangle((hx,hy,hx+hw-1,hy+hh-1),fill=(0,0,0,0))
    return body,hands.im,info


def with_cup(body,hands,info,kind='cream',topping='marshmallow'):
    p=Art(32,32);p.paste(body,0,0);p.paste(hands,0,0)
    if info.get('cup'):
        cu=cup(kind,topping);grip=info['cup']['grip'];hand=info['hand']
        if info['cup']['flipX']:cu=cu.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        p.paste(cu,hand[0]-grip[0],hand[1]-grip[1])
        # Hand-tip foreground is provided independently, same skin as this actor.
        for y in range(hand[1],min(32,hand[1]+2)):
            for x in range(max(0,hand[0]-1),min(32,hand[0]+1)):
                c=hands.getpixel((x,y))
                if c[3]:p.im.putpixel((x,y),c)
    return p.im


COUNTER={'size':[72,52],'footprint':[4,35,64,14],
         'workstations':{'heat':{'foot':[18,32],'direction':'down'},'stir':{'foot':[50,32],'direction':'down'}},
         'standCandidates':[[18,62],[50,62]],'interaction':[36,62],
         'parts':{'base':[0,0],'front':[0,0],'burner':[37,29],'pot':[37,17],'knob':[15,25],'steamAnchor':[50,20]},
         'absolutePlacement':None,'allPlacementIsProposal':True}


def workstation(night=False,frame=0):
    p=Art(160,112)
    p.rect(0,0,160,112,'wood3')
    for y in range(8,112,12):
        p.rect(0,y,160,1,'wood1');p.rect(0,y+1,160,1,'wood4')
        for x in range((y//12%2)*24,160,48):p.rect(x,y,1,12,'wood2')
    x,y=43,30
    bodies=[]
    for kind,name in [('bear','heat'),('her','stir')]:
        foot=COUNTER['workstations'][name]['foot'];body,hands,info=action(kind,name,'down',frame%(3 if name=='heat' else 4))
        bx=x+foot[0]-16;by=y+foot[1]-29;p.paste(body,bx,by);bodies.append((hands,bx,by))
    p.paste(counter(),x,y);p.paste(burner(1),x+37,y+29);p.paste(pot(),x+37,y+17);p.paste(knob(frame%3),x+15,y+25)
    p.paste(counter(True),x,y)
    for hands,bx,by in bodies:p.paste(hands,bx,by)
    p.paste(steam(frame%4),x+48,y-4)
    # Two final cups and ingredient packages are samples, not fabricated result data.
    p.paste(ingredient('marshmallow'),10,75);p.paste(ingredient('cocoa'),31,75);p.paste(ingredient('cinnamon'),52,75)
    p.paste(cup('cream','marshmallow'),114,83);p.paste(cup('teal','cinnamon'),129,83)
    return shade(p.im,night)


def hero(night=False):
    out=Image.new('RGB',(1120,950),'#242633')
    text(out,(80,30),'I-LAND / COCOA-03',22,'#a2cdb5');text(out,(80,78),'一起把可可搅得温暖。',36,'#f5eee2')
    text(out,(80,132),'夜晚 · 同一套人物、同一个小料理台' if night else '白天 · 控温与搅拌，两个工位的距离刚刚好',20,'#f5eee2')
    out.paste(workstation(night,1).resize((960,672),Image.Resampling.NEAREST).convert('RGB'),(80,184))
    text(out,(80,886),'24px 人物 / 32×32 帧 / 脚锚 (16,29)；示意人物不代表真实联机。',18,'#f5eee2')
    return out


def social_board():
    out=Image.new('RGB',(1200,780),'#f5eee2');text(out,(35,25),'COCOA-03 / 拿杯、递杯、碰杯',30)
    text(out,(35,73),'与既有人物、沙发同一像素尺度；所有人物按 6× 最近邻显示。',19)
    for row,kind in enumerate(('bear','her')):
        for col,(name,phase) in enumerate([('hold',0),('offer',0),('offer',2),('receive',2),('clink',1)]):
            b,h,info=action(kind,name,'right',phase);im=with_cup(b,h,info,'cream' if kind=='bear' else 'teal','marshmallow' if kind=='bear' else 'cinnamon')
            big=im.resize((192,192),Image.Resampling.NEAREST);x=30+col*232;y=128+row*270
            out.paste(big,(x,y),big);text(out,(x+22,y+200),{'hold':'持杯','offer':'递出' if phase else '准备递杯','receive':'伸手接杯','clink':'碰杯接触帧'}[name],19)
    text(out,(35,700),'接杯帧没有预先画杯子；接受确认后，才把原杯对象换到接收者握持点。',18)
    text(out,(35,739),'杯子可换颜色/配料，不改人物帧；减少动态直接使用指定静帧。',18)
    return out


def ingredient_board():
    out=Image.new('RGB',(1080,740),'#f5eee2');text(out,(40,28),'COCOA-03 / 两只杯子，三种点缀',30)
    text(out,(40,78),'杯身保持 4×5px，和原客厅装饰杯同级；图上统一 10× 检查细节。',19)
    for j,topping in enumerate(('marshmallow','cocoa','cinnamon')):
        x=60+j*340;im=ingredient(topping).resize((160,160),Image.Resampling.NEAREST);out.paste(im,(x+50,130),im)
        text(out,(x+70,305),{'marshmallow':'棉花糖','cocoa':'可可粉','cinnamon':'肉桂'}[topping],22)
        for row,kind in enumerate(('cream','teal')):
            ImageDraw.Draw(out).rounded_rectangle((x+40,360+row*150,x+220,495+row*150),radius=10,fill='#dfd4be')
            im=cup(kind,topping).resize((120,120),Image.Resampling.NEAREST);out.paste(im,(x+70,360+row*150),im)
    text(out,(40,680),'上排奶油杯，下排青绿杯；每种成品均有独立原生像素与日夜帧。',19)
    return out


def scale_board():
    p=Art(240,144);p.rect(0,0,240,144,'#e4d4b6');p.rect(0,52,240,92,'wood3')
    for y in range(52,144,12):p.rect(0,y,240,1,'wood1')
    # Furniture reference only; this is not a proposed room rearrangement.
    sb=Image.open(BASE/'home/sofa-base-day.png').convert('RGBA');sf=Image.open(BASE/'home/sofa-front-day.png').convert('RGBA')
    p.paste(sb,146,68);p.paste(sf,146,68)
    x,y=25,39
    overlays=[]
    for kind,name in [('bear','heat'),('her','stir')]:
        b,h,_=action(kind,name,'down',1);foot=COUNTER['workstations'][name]['foot'];bx=x+foot[0]-16;by=y+foot[1]-29
        p.paste(b,bx,by);overlays.append((h,bx,by))
    p.paste(counter(),x,y);p.paste(burner(1),x+37,y+29);p.paste(pot(),x+37,y+17);p.paste(knob(1),x+15,y+25);p.paste(counter(True),x,y)
    for h,bx,by in overlays:p.paste(h,bx,by)
    p.paste(steam(1),x+48,y-4)
    out=Image.new('RGB',(1120,880),'#f5eee2');text(out,(80,30),'COCOA-03 / 与已验收沙发同画面对照',28)
    text(out,(80,78),'人物、料理台、杯子、沙发均为原生 1×，此图整体按 4× 展示。',19)
    out.paste(p.im.resize((960,576),Image.Resampling.NEAREST).convert('RGB'),(80,140))
    text(out,(80,752),'料理台 72×52 / 占地候选64×14 / 工位脚点相距32px',21)
    text(out,(80,796),'仅展示相对尺度，没有改客厅地图；绝对摆放与可达性由整合者验证。',19)
    return out


def pair_board():
    out=Image.new('RGB',(1160,650),'#f5eee2');text(out,(40,25),'COCOA-03 / 交接与碰杯接触检查',28)
    text(out,(40,74),'杯柄朝手、杯身朝前；同一只杯子只绑定一个已确认的持有人。',19)
    for col,stage in enumerate(('offer','accept','clink')):
        p=Art(80,78);p.rect(0,0,80,78,'#e0d3b8');p.rect(0,60,80,1,'wood2')
        for seat,kind in enumerate(('bear','her')):
            direction='right' if seat==0 else 'left';footX=(28,52)[seat] if stage=='clink' else (26,54)[seat]
            if stage=='accept' and seat==0:im=baseline(kind,direction)
            else:
                name=('offer' if seat==0 else 'receive') if stage=='offer' else 'hold' if stage=='accept' else 'clink'
                b,h,info=action(kind,name,direction,2 if stage=='offer' else 1 if stage=='clink' else 0)
                im=with_cup(b,h,info,'cream' if stage=='clink' and seat==0 else 'teal','marshmallow')
            p.paste(im,footX-16,60-29)
        if stage=='clink':p.paste(effect(),35,42)
        big=p.im.resize((320,312),Image.Resampling.NEAREST);x=40+col*380
        out.paste(big.convert('RGB'),(x,145));text(out,(x,482),['递出：对方伸手，杯仍属于原持有人','接受后：原杯换到接收者握持点','碰杯：杯沿接触，杯身不相互穿透'][col],16)
    text(out,(40,556),'所有动作图仅用于素材接触与比例检查；不能作为真实共处、领取或接受的证据。',18)
    text(out,(40,600),'整合时以服务端确认事件绑定杯对象，不用播放到某一帧来决定物品归属。',18)
    return out


def work_strip():
    out=Image.new('RGB',(1150,610),'#f5eee2');text(out,(35,24),'COCOA-03 / 控温与搅拌关键帧',28)
    text(out,(35,69),'身体、手臂和勺子保持同一脚锚；头部与原人物逐像素一致。',19)
    columns=[('heat',i) for i in range(3)]+[('stir',i) for i in range(4)]
    for row,kind in enumerate(('bear','her')):
        for col,(name,phase) in enumerate(columns):
            b,h,_=action(kind,name,'down',phase);b.alpha_composite(h);big=b.resize((128,128),Image.Resampling.NEAREST)
            x=35+col*157;y=135+row*214;out.paste(big,(x,y),big);text(out,(x+15,y+143),('控温' if name=='heat' else '搅拌')+f' {phase}',16)
    text(out,(35,566),'减少动态：控温/搅拌直接取第1帧，蒸汽取静帧；不做透明度闪烁。',18)
    return out


def mobile_board():
    out=Image.new('RGB',(850,590),'#f5eee2');text(out,(30,25),'COCOA-03 / 2× 小屏素材取景',28)
    text(out,(30,73),'左320px，右390px；人物站高仍为48 CSS px，字号不随素材缩小。',18)
    for x,width,night in [(30,320,False),(410,390,True)]:
        im=workstation(night,1).resize((320,224),Image.Resampling.NEAREST)
        ImageDraw.Draw(out).rectangle((x,130,x+width-1,409),fill='#e0d3b8' if not night else '#51495c')
        out.paste(im.convert('RGB'),(x+(width-320)//2,158))
        text(out,(x,436),'双工位同屏 · 固定2×像素',18)
    text(out,(30,509),'只检查素材占用和辨认；真实操作UI、遮挡和手机流程由整合者验收。',18)
    text(out,(30,548),'图中人物均为比例示意，不表示已有真实双人制作或成品。',18)
    return out


def pack(entries):
    positions={};x=y=2;rh=0
    for k,im in entries.items():
        if x+im.width+2>1024:x=2;y+=rh+4;rh=0
        positions[k]=(x,y);x+=im.width+4;rh=max(rh,im.height)
    height=math.ceil((y+rh+2)/16)*16;a=Image.new('RGBA',(1024,height));frames={}
    for k,im in entries.items():
        x,y=positions[k];a.paste(im,(x,y))
        for dy in range(-1,im.height+1):
            for dx in (-1,im.width):a.putpixel((x+dx,y+dy),im.getpixel((min(max(dx,0),im.width-1),min(max(dy,0),im.height-1))))
        for dx in range(im.width):a.putpixel((x+dx,y-1),im.getpixel((dx,0)));a.putpixel((x+dx,y+im.height),im.getpixel((dx,im.height-1)))
        frames[k]={'frame':{'x':x,'y':y,'w':im.width,'h':im.height},'rotated':False,'trimmed':False,'spriteSourceSize':{'x':0,'y':0,'w':im.width,'h':im.height},'sourceSize':{'w':im.width,'h':im.height}}
    a.save(PUBLIC/'atlas.png');(PUBLIC/'atlas.json').write_text(json.dumps({'frames':frames,'meta':{'image':'atlas.png','size':{'w':1024,'h':height},'format':'RGBA8888','scale':'1','version':VERSION,'padding':2,'extrude':1}},indent=2)+'\n')


def main():
    for d in (PUBLIC/'frames',ROOT/'previews',EVAL):d.mkdir(parents=True,exist_ok=True)
    entries={};frameMeta={};actions={};animations={}
    def save(key,im,role,extra=None):
        entries[key]=im;im.save(PUBLIC/'frames'/f'{key}.png')
        frameMeta[key]={'url':f'/art-v2/cocoa/frames/{key}.png','atlas':'cocoa-art','frame':key,'size':list(im.size),'visibleBBox':list(im.getbbox()) if im.getbbox() else None,'role':role,**(extra or {})}
    props={'counter-base':counter(),'counter-front':counter(True),'pot':pot(),'clink-glint':effect()}
    props.update({f'burner-{i}':burner(i) for i in range(3)});props.update({f'knob-{i}':knob(i) for i in range(3)})
    props.update({f'steam-{i}':steam(i) for i in range(4)})
    for topping in ('marshmallow','cocoa','cinnamon'):props[f'ingredient-{topping}']=ingredient(topping)
    for kind in ('cream','teal'):
        for topping in ('plain','marshmallow','cocoa','cinnamon'):props[f'cup-{kind}-{topping}']=cup(kind,topping)
    for k,im in props.items():
        for night in (False,True):
            extra={'origin':[0,0],'lighting':'prebaked-night' if night else 'base-day'}
            if k.startswith('cup-'):extra.update({'grip':[8,8],'gripWhenFlipped':[3,8],'floorAnchor':[6,10]})
            if k.startswith('steam-'):extra.update({'origin':[2/24,1],'emissionAnchor':[2,24],'recommendedOpacity':.8})
            save(k+('-night' if night else '-day'),shade(im,night),'prop',extra)
    counts={'heat':3,'stir':4,'hold':1,'offer':3,'receive':3,'clink':4}
    for kind in ('bear','her'):
        for name,n in counts.items():
            dirs=('down','up','right','left') if name=='hold' else ('down',) if name in ('heat','stir') else ('right','left')
            for direction in dirs:
                keys=[]
                for phase in range(n):
                    key=f'{kind}-{name}-{direction}-{phase}';body,hands,info=action(kind,name,direction,phase)
                    pose=body.copy();pose.alpha_composite(hands)
                    for suffix,im in [('body',body),('hands',hands),('pose',pose)]:
                        save(key+'-'+suffix,im,'actor-layer',{'footAnchor':[16,29],'origin':[.5,29/32],'lighting':'neutral-follow-existing-actor-lighting'})
                    actions[key]={'body':key+'-body','hands':key+'-hands','pose':key+'-pose','identity':kind,'direction':direction,'action':name,'phase':phase,
                                  'footAnchor':[16,29],'origin':[.5,29/32],'headBaseline':f'{kind}-idle-{direction}',**info}
                    keys.append(key)
                anim=f'{kind}-{name}-{direction}'
                animations[anim]={'actions':keys,'frameRate':4 if name=='heat' else 5,'repeat':-1 if name in ('heat','stir') else 0,
                                  'reducedMotionAction':keys[1 if name in ('heat','stir','clink') else -1],'stateChangeRequiresServerConfirmation':True}
    pack(entries)
    manifest={'version':VERSION,'round':'warm-drink-03','requiresBase':'art-v2.1.0','atlas':{'key':'cocoa-art','png':'/art-v2/cocoa/atlas.png','json':'/art-v2/cocoa/atlas.json'},
              'scale':{'frame':[32,32],'visibleStandingHeight':24,'footAnchor':[16,29],'origin':[.5,29/32],'spriteScale':1,'tile':16},
              'frames':frameMeta,'actions':actions,'animations':animations,'counter':COUNTER,
              'workstationLayerOrder':['actor-body-behind-counter','counter-base','burner','pot','knob','counter-front','actor-hands','steam'],
              'cupBinding':{'frameTemplate':'cup-{cupType}-{topping}-{dayOrNight}','cupTypes':['cream','teal'],'toppings':['marshmallow','cocoa','cinnamon'],
                            'drawOrder':['actor-body','actor-hands','cup-attached-by-grip','hand-tip-foreground'],'tipRectangleRelativeToHand':[-1,0,2,2],
                            'receiveHasCupBeforeAccept':False,'transferOnlyAfterConfirmedAccept':True,'oneCupObjectPerConfirmedCupId':True},
              'socialGeometry':{'offerFootOffsets':[[0,0],[28,0]],'clinkFootOffsets':[[-12,0],[12,0]],'leftActorDirection':'right','rightActorDirection':'left','clinkGlintRelativeToMidpoint':[0,-13],'allPositionsAreProposals':True},
              'effects':{'steam':{'day':[f'steam-{i}-day' for i in range(4)],'night':[f'steam-{i}-night' for i in range(4)],'frameRate':3,'reducedMotion':'steam-1-{dayOrNight}','opacity':.8,'alphaPulsing':False},
                         'clinkGlint':{'key':'clink-glint-{dayOrNight}','origin':[.5,.5],'durationMs':300,'reducedMotion':'omit'}},
              'integrationNotes':['Never infer participants, completion, ownership or acceptance from these pixels.','Workstation actors are stationary confirmed participants; do not animate fake remote walking.','No absolute counter placement and no existing room assets were changed.','Props offer day/night palettes; actor layers use existing shared actor lighting without changing identity or scale.','The tabletop occludes lower bodies, but hand overlays draw above the pot/controls.']}
    (PUBLIC/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    for night in (False,True):
        suffix='night' if night else 'day';hero(night).save(ROOT/'previews'/f'{suffix}.png');workstation(night,1).save(ROOT/'previews'/f'workstation-{suffix}-1x.png')
    social_board().save(ROOT/'previews/social-actions.png');ingredient_board().save(ROOT/'previews/cups-and-toppings.png');scale_board().save(ROOT/'previews/scale-comparison.png')
    pair_board().save(ROOT/'previews/pair-contact.png')
    work_strip().save(ROOT/'previews/work-motion.png');mobile_board().save(ROOT/'previews/mobile.png')
    print(json.dumps({'version':VERSION,'frames':len(entries),'actions':len(actions),'animations':len(animations),'readyWritten':False}))


if __name__=='__main__':main()
