"""Only Cocoa-03 asset QA. No hash generation, full suite, server or browser."""
from pathlib import Path
import sys,json
sys.dont_write_bytecode=True
from PIL import Image,ImageChops
import build

P=build.PUBLIC;E=build.EVAL;m=json.loads((P/'manifest.json').read_text());checks=[]
def check(name,ok,detail=None):
    if not ok:raise AssertionError(name)
    checks.append({'name':name,'passed':True,'detail':detail})

check('compatible accepted base dimensions and foot anchor',build.BASE_META['version']=='art-v2.1.0' and m['scale']['frame']==[32,32] and m['scale']['footAnchor']==[16,29] and m['scale']['visibleStandingHeight']==24)
images={k:Image.open(P/'frames'/f'{k}.png').convert('RGBA') for k in m['frames']}
check('all frames match declared size and visible bbox',all(list(im.size)==m['frames'][k]['size'] and (list(im.getbbox()) if im.getbbox() else None)==m['frames'][k]['visibleBBox'] for k,im in images.items()))
check('all exported pixels have binary alpha',all(set(im.getchannel('A').get_flattened_data())<={0,255} for im in images.values()))
check('62 actions / two identities / required roles',len(m['actions'])==62 and all(any(a['identity']==kind and a['action']==name for a in m['actions'].values()) for kind in ('bear','her') for name in ('heat','stir','hold','offer','receive','clink')))
check('all action layers are 32x32 with the accepted origin',all(images[a[layer]].size==(32,32) and m['frames'][a[layer]]['origin']==[.5,29/32] for a in m['actions'].values() for layer in ('body','hands','pose')))
heads=True;soles=True;layerExact=True;headCupClear=True;attachBounds=True
for key,a in m['actions'].items():
    base=build.baseline(a['identity'],a['direction']);ref=build.BASE_META['characters'][a['headBaseline']];x,y,w,h=ref['head_rect']
    body=images[a['body']];hands=images[a['hands']];pose=images[a['pose']]
    heads &= pose.crop((x,y,x+w,y+h)).tobytes()==base.crop((x,y,x+w,y+h)).tobytes()
    soles &= body.crop((0,25,32,29)).tobytes()==base.crop((0,25,32,29)).tobytes()
    merged=body.copy();merged.alpha_composite(hands);layerExact &= merged.tobytes()==pose.tobytes()
    if a['cup']:
        for kind in ('cream','teal'):
            for topping in ('marshmallow','cocoa','cinnamon'):
                cu=build.cup(kind,topping)
                if a['cup']['flipX']:cu=cu.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                hx,hy=a['hand'];gx,gy=a['cup']['grip'];bb=cu.getbbox();px=hx-gx;py=hy-gy
                attachBounds &= px+bb[0]>=0 and py+bb[1]>=0 and px+bb[2]<=32 and py+bb[3]<=32
                rendered=build.with_cup(body,hands,a,kind,topping)
                # Compare only opaque head pixels; transparent bounding corners can hold a cup.
                rb=rendered.crop((x,y,x+w,y+h));hb=base.crop((x,y,x+w,y+h));mask=hb.getchannel('A')
                for channel in ('R','G','B'):headCupClear &= ImageChops.multiply(ImageChops.difference(rb,hb).getchannel(channel),mask).getbbox() is None
check('all action heads exactly match accepted heads',heads)
check('body foot and sole pixels remain unchanged',soles)
check('body plus hands exactly reconstructs full pose',layerExact)
check('every cup type/topping fits attachment frame without clipping',attachBounds)
check('held cups do not cover opaque accepted head pixels',headCupClear)
check('receive action never includes a cup before confirmation',all(a['cup'] is None for a in m['actions'].values() if a['action']=='receive'))
check('animations and reduced-motion action references exist',all(all(k in m['actions'] for k in a['actions']) and a['reducedMotionAction'] in m['actions'] for a in m['animations'].values()))
check('work loops have distinct hand keyframes',all(len({images[m['actions'][k]['hands']].tobytes() for k in a['actions']})==len(a['actions']) for k,a in m['animations'].items() if '-heat-' in k or '-stir-' in k))
check('day/night props retain identical alpha geometry',all(images[k].getchannel('A').tobytes()==images[k[:-4]+'-night'].getchannel('A').tobytes() for k in images if k.endswith('-day')))
check('six finished cup variants per lighting mode exist',all(f'cup-{kind}-{topping}-{light}' in images for kind in ('cream','teal') for topping in ('marshmallow','cocoa','cinnamon') for light in ('day','night')))
check('steam frames are distinct and steady alpha',len({images[f'steam-{i}-day'].tobytes() for i in range(4)})==4 and m['effects']['steam']['opacity']>=.7 and m['effects']['steam']['alphaPulsing'] is False)
check('no absolute room placement or participant baking',m['counter']['absolutePlacement'] is None and all('bear' not in k and 'her' not in k for k,f in m['frames'].items() if f['role']=='prop'))

atlas=Image.open(P/'atlas.png').convert('RGBA');aj=json.loads((P/'atlas.json').read_text());exact=True;extrude=True;rects=[]
for key,entry in aj['frames'].items():
    f=entry['frame'];x,y,w,h=[f[k] for k in ('x','y','w','h')];im=images[key]
    exact &= atlas.crop((x,y,x+w,y+h)).tobytes()==im.tobytes() and not entry['trimmed'] and not entry['rotated']
    for yy in range(h):extrude &= atlas.getpixel((x-1,y+yy))==im.getpixel((0,yy)) and atlas.getpixel((x+w,y+yy))==im.getpixel((w-1,yy))
    for xx in range(w):extrude &= atlas.getpixel((x+xx,y-1))==im.getpixel((xx,0)) and atlas.getpixel((x+xx,y+h))==im.getpixel((xx,h-1))
    rects.append((x-2,y-2,x+w+2,y+h+2))
check('atlas declares exactly all individual frames',set(aj['frames'])==set(images))
check('atlas crops equal untrimmed unrotated source PNGs',exact)
check('one-pixel extrusion matches source borders',extrude)
check('two-pixel guards are bounded and non-overlapping',all(a[0]>=0 and a[1]>=0 and a[2]<=atlas.width and a[3]<=atlas.height for a in rects) and all(a[2]<=b[0] or b[2]<=a[0] or a[3]<=b[1] or b[3]<=a[1] for i,a in enumerate(rects) for b in rects[i+1:]))

# New hand/tool anchoring checks independent of animation timing or server rules.
stirTips=[]
for key,a in m['actions'].items():
    if a['action']=='stir':
        foot=m['counter']['workstations']['stir']['foot'];tip=a['spoonTip'];stirTips.append([foot[0]-16+tip[0],foot[1]-29+tip[1]])
check('stirring spoon tips land inside the cocoa mouth',all(43<=x<=57 and 19<=y<=25 for x,y in stirTips),stirTips[:4])
check('work feet are outside proposed solid footprint',all(s['foot'][1]<m['counter']['footprint'][1] for s in m['counter']['workstations'].values()))

report={'round':'warm-drink-03','version':build.VERSION,'status':'passed','categories':len(checks),'frames':len(images),'actions':len(m['actions']),'atlasSize':list(atlas.size),'checks':checks,
        'limits':['Only new art assets and their direct base-dimension dependency checked.','No actual game, collision/pathfinding, multiplayer or device validation.','No checksums generated and no full regression/build invoked.']}
(E/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ('checks','limits')},ensure_ascii=False))
