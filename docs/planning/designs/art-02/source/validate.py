"""Validate native asset package and interface, never touch runtime data."""
from pathlib import Path
import sys,json
sys.dont_write_bytecode=True
from PIL import Image,ImageChops
import build

P=build.PUBLIC;R=build.ROOT;E=build.EVAL
m=json.loads((P/'manifest.json').read_text())
checks=[]
def check(name,ok,detail=None):
    if not ok:raise AssertionError(name)
    checks.append({'name':name,'passed':True,'detail':detail})

check('56 complete character frames',len(m['characters'])==56)
check('one 32×32 frame / fixed origin for every scene',all(f['size']==[32,32] and f['foot_anchor']==[16,29] and f['origin']==[.5,29/32] for f in m['characters'].values()))
for table,folder in [('characters','characters'),('home','home')]:
    exact=True;binary=True;borders=True
    for key,entry in m[table].items():
        im=Image.open(P/folder/f'{key}.png').convert('RGBA');bb=list(im.getbbox())
        exact &= im.size==tuple(entry['size']) and bb==entry['visibleBBox']
        binary &= set(im.getchannel('A').get_flattened_data()) <= {0,255}
        if table=='characters':borders &= bb[0]>0 and bb[1]>0 and bb[2]<32 and bb[3]<32
    check(f'{table}: declared dimensions and visible bbox',exact)
    check(f'{table}: binary alpha / no antialias fringes',binary)
    if table=='characters':check('all character frames have clear border',borders)

heights={};headConsistency=True;uniqueWalk=True;measures={}
for kind in ('bear','her'):
    heights[kind]={}
    for direction in ('down','up','right','left'):
        idle=m['characters'][f'{kind}-idle-{direction}']['visibleBBox']
        heights[kind][direction]=idle[3]-idle[1]
        keys=[f'{kind}-idle-{direction}',f'{kind}-sit-{direction}']+[f'{kind}-walk-{direction}-{i}' for i in range(4)]
        h=build.head(kind,direction)
        measures[kind+'-'+direction]=list(h.getbbox())
        for key in keys:
            frame=Image.open(P/'characters'/f'{key}.png').convert('RGBA')
            x,y,w,hh=m['characters'][key]['head_rect'];crop=frame.crop((x,y,x+w,y+hh))
            for channel in ('R','G','B','A'):
                diff=ImageChops.difference(crop,h).getchannel(channel)
                headConsistency &= ImageChops.multiply(diff,h.getchannel('A')).getbbox() is None
        frameBytes=[Image.open(P/'characters'/f'{kind}-walk-{direction}-{i}.png').tobytes() for i in range(4)]
        uniqueWalk &= len(set(frameBytes))==4
    for direction in ('left','right'):
        for phase in (0,1):
            key=f'{kind}-lean-{direction}-{phase}';frame=Image.open(P/'characters'/f'{key}.png').convert('RGBA')
            x,y,w,hh=m['characters'][key]['head_rect'];h=build.head(kind,'up');crop=frame.crop((x,y,x+w,y+hh))
            for channel in ('R','G','B','A'):
                diff=ImageChops.difference(crop,h).getchannel(channel)
                headConsistency &= ImageChops.multiply(diff,h.getchannel('A')).getbbox() is None
check('all four standing directions are 24 visible pixels',all(v==24 for dirs in heights.values() for v in dirs.values()),heights)
check('standing/sitting/walking/leaning share exact same-direction head pixels',headConsistency,measures)
check('four distinct walk frames for both identities and four directions',uniqueWalk)
check('animation frame references and reduced-motion states exist',all(all(k in m['characters'] for k in a['frames']) and a['reducedMotionFrame'] in m['characters'] for a in m['animations'].values()))
check('front-only cat eyes are absent from her back and leaning frames',all(build.color('cream') not in set(Image.open(P/'characters'/f'{k}.png').get_flattened_data()) for k in m['characters'] if k.startswith('her-') and ('-up' in k or '-lean-' in k)))

atlasSizes={}
for name,table,folder in [('characters',m['characters'],'characters'),('home',m['home'],'home')]:
    a=Image.open(P/f'{name}-atlas.png').convert('RGBA');j=json.loads((P/f'{name}-atlas.json').read_text());rects=[];exact=True;extrude=True;clear=True
    atlasSizes[name]=list(a.size)
    for key,entry in j['frames'].items():
        f=entry['frame'];x,y,w,h=[f[k] for k in ('x','y','w','h')];im=Image.open(P/folder/f'{key}.png').convert('RGBA')
        exact &= not entry['trimmed'] and not entry['rotated'] and a.crop((x,y,x+w,y+h)).tobytes()==im.tobytes()
        clear &= x>=2 and y>=2 and x+w+2<=a.width and y+h+2<=a.height
        for yy in range(h):
            extrude &= a.getpixel((x-1,y+yy))==im.getpixel((0,yy)) and a.getpixel((x+w,y+yy))==im.getpixel((w-1,yy))
        for xx in range(w):
            extrude &= a.getpixel((x+xx,y-1))==im.getpixel((xx,0)) and a.getpixel((x+xx,y+h))==im.getpixel((xx,h-1))
        rects.append((x-2,y-2,x+w+2,y+h+2))
    noOverlap=all(a[2]<=b[0] or b[2]<=a[0] or a[3]<=b[1] or b[3]<=a[1] for i,a in enumerate(rects) for b in rects[i+1:])
    check(f'{name} atlas: exactly declared frame set',set(j['frames'])==set(table))
    check(f'{name} atlas: untrimmed unrotated crops equal individual PNGs',exact)
    check(f'{name} atlas: 1px edge extrusion exact',extrude)
    check(f'{name} atlas: 2px guards within bounds and non-overlapping',clear and noOverlap)

data=json.loads((P/'characters-pixels.json').read_text());pixelExact=True
for key,rows in data['frames'].items():
    im=Image.new('RGBA',(32,32))
    for y,row in enumerate(rows):
        for x,ch in enumerate(row):
            if ch!='.':im.putpixel((x,y),build.color(data['palette'][ch]))
    pixelExact &= im.tobytes()==Image.open(P/'characters'/f'{key}.png').convert('RGBA').tobytes()
check('makeTexture / DOM pure-data frames reconstruct PNGs exactly',pixelExact)
check('day/night furniture geometry stays identical',all(Image.open(P/'home'/f'{k}.png').getchannel('A').tobytes()==Image.open(P/'home'/f'{k[:-4]}-night.png').getchannel('A').tobytes() for k in m['home'] if k.endswith('-day')))
check('CRT screen and window view are genuine separate alpha holes',Image.open(P/'home/tv-case-day.png').getpixel((20,20))[3]==0 and Image.open(P/'home/window-frame-day.png').getpixel((20,20))[3]==0)
check('all four fire keyframes are distinct',len({Image.open(P/'home'/f'fire-{i}-day.png').tobytes() for i in range(4)})==4)
check('no runtime preview or demo actor layer exists',m['homeLayout']['demoActorsIncluded'] is False and all(not any(s in k for s in ('actor','scale','demo')) for k in m['home']) and not any('preview' in str(p) for p in P.rglob('*')))
check('layout exit preserves current room doorway',m['homeLayout']['door']==[272,218])
check('original ART-01 master is not a write target',str(build.ROOT).endswith('/art-02'))
report={'version':build.VERSION,'round':'visual-02','status':'passed','categories':len(checks),'characterFrames':len(m['characters']),'homeFrames':len(m['home']),
        'atlasSizes':atlasSizes,'checks':checks,'limits':['Static assets only; no browser, device, actual room-member or collision validation.','Door/camera/screen/native-channel integration must be completed by HOME-02.']}
(E/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ('checks','limits')},ensure_ascii=False))
