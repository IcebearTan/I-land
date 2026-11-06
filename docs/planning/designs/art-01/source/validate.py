"""Static export QA, confined to ART-01. No server, database or browser."""
from pathlib import Path
import json
import hashlib
import sys
import xml.etree.ElementTree as ET
from PIL import Image, ImageChops
sys.dont_write_bytecode = True
import render

ROOT=Path(__file__).resolve().parents[1]
checks=[]


def check(name,condition):
    if not condition: raise AssertionError(name)
    checks.append(name)


for mode in ('day','night'):
    raw=Image.open(ROOT/'previews'/f'{mode}-1x.png').convert('RGBA')
    check(f'{mode}: 320×240 integer tile canvas',raw.size==(320,240))
    layers=sorted((ROOT/'layers'/mode).glob('*.png'))
    check(f'{mode}: twelve semantic layers',len(layers)==12)
    merged=Image.new('RGBA',raw.size)
    for path in layers:
        layer=Image.open(path).convert('RGBA')
        check(f'{mode}: {path.stem} binary alpha',set(layer.getchannel('A').get_flattened_data())<={0,255})
        merged.alpha_composite(layer)
    check(f'{mode}: layer reassembly exact',merged.tobytes()==raw.tobytes())
    enlarged=Image.open(ROOT/'previews'/f'{mode}-4x.png').convert('RGBA')
    check(f'{mode}: 4× nearest pixels exact',enlarged.tobytes()==raw.resize((1280,960),Image.Resampling.NEAREST).tobytes())
    # Independently rasterize SVG rect runs: guarantees editable SVG is not stale.
    svg=ET.parse(ROOT/'source'/f'{mode}-layers.svg').getroot()
    out=render.PixelArt()
    groups=svg.findall('{http://www.w3.org/2000/svg}g')
    check(f'{mode}: twelve SVG groups',len(groups)==12)
    for g in groups:
        for r in g:
            v={k:int(r.attrib[k]) for k in ('x','y','width','height')}
            out.rect(v['x'],v['y'],v['width'],v['height'],r.attrib['fill'])
    check(f'{mode}: SVG raster exact',out.im.tobytes()==raw.tobytes())

for path in sorted((ROOT/'layers/day').glob('*.png')):
    day=Image.open(path).getchannel('A')
    night=Image.open(ROOT/'layers/night'/path.name).getchannel('A')
    check(f'geometry: {path.stem} day/night alpha exact',day.tobytes()==night.tobytes())

atlas=Image.open(ROOT/'assets/atlas-draft.png').convert('RGBA')
meta=json.loads((ROOT/'assets/atlas-draft.json').read_text())
check('atlas: declared size',atlas.size==(meta['meta']['size']['w'],meta['meta']['size']['h']))
rects=[]
for name,entry in meta['frames'].items():
    f=entry['frame']; x,y,w,h=(f[k] for k in ('x','y','w','h'))
    im=Image.open(ROOT/'assets'/f'{name}.png').convert('RGBA')
    check(f'asset: {name} binary alpha',set(im.getchannel('A').get_flattened_data())<={0,255})
    check(f'atlas: {name} exact untrimmed frame',not entry['trimmed'] and not entry['rotated'] and atlas.crop((x,y,x+w,y+h)).tobytes()==im.tobytes())
    check(f'atlas: {name} padded bounds',x>=2 and y>=2 and x+w+2<=atlas.width and y+h+2<=atlas.height)
    rects.append((name,x-2,y-2,x+w+2,y+h+2))
for i,a in enumerate(rects):
    for b in rects[i+1:]:
        check(f'atlas gutters: {a[0]} / {b[0]}',a[3]<=b[1] or b[3]<=a[1] or a[4]<=b[2] or b[4]<=a[2])

heads={}
for kind in ('bear','her'):
    heads[kind]={}
    for back in (False,True):
        h=render.head(kind,back)
        direction='back' if back else 'front'
        bbox=h.getbbox(); heads[kind][direction]={'bbox':bbox,'size':[bbox[2]-bbox[0],bbox[3]-bbox[1]]}
        for pose,hy in [('stand',4),('sit',8)]:
            frame=Image.open(ROOT/'assets'/f'{kind}-{pose}-{direction}.png').convert('RGBA')
            check(f'actor: {kind}/{pose}/{direction} same 32×40 frame',frame.size==(32,40))
            crop=frame.crop((4,hy,28,hy+15))
            diff=ImageChops.difference(crop,h)
            check(f'actor: {kind}/{pose}/{direction} shared head pixels exact',ImageChops.multiply(diff.getchannel('R'),h.getchannel('A')).getbbox() is None and
                  ImageChops.multiply(diff.getchannel('G'),h.getchannel('A')).getbbox() is None and
                  ImageChops.multiply(diff.getchannel('B'),h.getchannel('A')).getbbox() is None)
            bb=frame.getbbox()
            check(f'actor: {kind}/{pose}/{direction} transparent frame border',bb[0]>0 and bb[1]>0 and bb[2]<32 and bb[3]<40)

report={'status':'passed','checks':len(checks),'head_measurements':heads,'atlas_size':list(atlas.size),
        'art_only':True,'runtime_and_device_tests':False,'checks_detail':checks,
        'sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'previews').glob('*.png'))}}
(ROOT/'source/validation-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ('checks_detail','sha256')},ensure_ascii=False))
