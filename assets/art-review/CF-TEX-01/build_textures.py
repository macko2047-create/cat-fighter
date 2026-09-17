"""Author object-space albedo maps. No baseline image resampling or geometry edits."""
from pathlib import Path
import random

OUT = Path(__file__).parent / "textures"
random.seed(101)

def svg(name, width, height, content):
    (OUT / (name + '.svg')).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">{content}</svg>')

def line(x1,y1,x2,y2,color='#52616c',w=2,opacity=1):
    return f'<path d="M{x1},{y1} L{x2},{y2}" stroke="{color}" stroke-width="{w}" opacity="{opacity}" fill="none"/>'

def rivets(x1,y1,x2,y2,count):
    out=''
    for i in range(count):
        t=(i+.5)/count;x=x1+(x2-x1)*t;y=y1+(y2-y1)*t
        out+=f'<circle cx="{x}" cy="{y}" r="2.4" fill="#697784"/><circle cx="{x-.5}" cy="{y-.7}" r="1.15" fill="#e1e5e6"/>'
    return out

# Map spans abs(model.x) 0..2.4 and model.z -0.6..0.9.
s='<rect width="1024" height="1024" fill="#b9c4cf"/>'
s+='<path d="M0 0H1024V310L0 155Z" fill="#d4dbe0"/><path d="M0 760L1024 560V1024H0Z" fill="#a7b5c1"/>'
s+='<path d="M245 158L535 210V668L245 724Z" fill="#c7d0d7"/><path d="M540 210L850 277V606L540 669Z" fill="#becad2"/>'
for x in [260,535,850]:
    s+=line(x,150+x*.14,x,760-x*.17,w=2.4)
    s+=rivets(x+9,180+x*.14,x+9,730-x*.17,8)
for x1,y1,x2,y2 in [(120,190,930,340),(100,740,930,584)]:
    s+=line(x1,y1,x2,y2,w=3)
    s+=line(x1,y1+3,x2,y2+3,'#e8ecee',1.2,.65)
    s+=rivets(x1,y1+12,x2,y2+12,18)
svg('wing-metal',1024,1024,s)

# Fuselage mapping model.x -0.65..0.65 and model.z -2.1..2.1.
s='<rect width="512" height="1024" fill="#bdc8d1"/>'
s+='<path d="M0 0H125L178 1024H0Z" fill="#a3b0be"/><path d="M374 0H512V1024H323Z" fill="#cfd7de"/>'
for y in [133,236,640,768,880]:
    s+=f'<path d="M20 {y} Q256 {y+35} 492 {y}" fill="none" stroke="#536575" stroke-width="2.2"/>'
    s+=rivets(40,y+11,472,y+11,14)
for side in [-1,1]:
    pts=[(256+side*190,595),(256+side*139,760),(256+side*58,941)]
    s+=f'<polyline points="{" ".join(f"{x},{y}" for x,y in pts)}" fill="none" stroke="#5c6b78" stroke-width="2"/>'
svg('fuselage-metal',512,1024,s)

s='<rect width="512" height="512" fill="#bec9d2"/><path d="M0 260L512 315V512H0Z" fill="#a5b4c0"/>'
s+=line(15,260,500,315,w=2.5)+rivets(25,272,490,327,15)
for x in [165,350]:
    s+=line(x,40,x,480,w=2)+rivets(x+8,70,x+8,465,10)
svg('tailplane-metal',512,512,s)

# Pigment-only fur: no directional illumination baked into the texture.
s='<rect width="1024" height="1024" fill="#ed951f"/>'
s+='<path d="M0 570Q230 485 510 585T1024 560V1024H0Z" fill="#f2a329"/>'
for cx,top,bottom in [(342,154,766),(512,130,820),(682,154,766)]:
    s+=f'<path d="M{cx-40} {top} Q{cx-57} {top+210} {cx-23} {bottom-90} Q{cx} {bottom+55} {cx+19} {bottom-45} Q{cx+46} {top+190} {cx+37} {top}Z" fill="#ba5a16"/>'
for side in [0,1]:
    transform='translate(1024 0) scale(-1 1)' if side else ''
    s+=f'<g transform="{transform}"><path d="M55 445Q146 450 247 524Q162 520 52 485Z" fill="#c46518"/><path d="M58 688Q151 640 250 661Q163 679 67 731Z" fill="#c46518"/></g>'
for i in range(2600):
    x=random.uniform(5,1019);y=random.uniform(5,1019)
    dx=(x-512)*.015+random.uniform(-3,3);dy=random.uniform(4,13)
    s+=line(round(x,2),round(y,2),round(x+dx,2),round(y+dy,2),'#ffe0a0' if i%3 else '#914710',random.uniform(.6,1.4),.16 if i%3 else .10)
svg('tabby-head',1024,1024,s)

s='<rect width="256" height="1024" fill="#ec9829"/>'
for i in range(5):
    y=i*205
    s+=f'<path d="M0 {y}Q128 {y+35} 256 {y+6}V{y+83}Q128 {y+109} 0 {y+77}Z" fill="#b95d18"/>'
for i in range(750):
    x=random.uniform(0,256);y=random.uniform(0,1024)
    s+=line(x,y,x+random.uniform(-2,2),y+random.uniform(5,14),'#ffd884',.7,.14)
svg('tabby-tail',256,1024,s)

s='<rect width="512" height="512" fill="#ec9827"/>'
for i in range(850):
    x=random.uniform(0,512);y=random.uniform(0,512)
    s+=line(x,y,x+random.uniform(-4,4),y+random.uniform(4,10),'#ffda90',.8,.2)
svg('ear-fur',512,512,s)

# Flat painted graphic: the existing roundel, pad and toes all sample this same map.
s='<rect width="512" height="512" fill="#10284c"/><circle cx="256" cy="256" r="252" fill="#142f53" stroke="#d2d9df" stroke-width="4"/>'
s+='<path d="M166 310C160 277 194 252 210 232C234 197 271 203 297 237C315 258 353 280 347 313C342 349 310 360 281 348C261 340 247 340 228 349C196 362 164 347 166 310Z" fill="#fbf9ee"/>'
for cx,cy,rx,ry,angle in [(124,194,29,42,-24),(211,126,29,44,-8),(301,126,29,44,8),(391,194,29,42,24)]:
    s+=f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" transform="rotate({angle} {cx} {cy})" fill="#fbf9ee"/>'
svg('paw-roundel',512,512,s)

s='<rect width="512" height="512" fill="#a81720"/><path d="M0 0H200L290 512H0Z" fill="#c51d27"/><path d="M202 0H330L415 512H292Z" fill="#cf242b"/>'
svg('red-enamel',512,512,s)

s='<rect width="512" height="512" fill="#273b50"/><path d="M0 310Q210 230 512 290V512H0Z" fill="#334859"/><path d="M55 78Q240 22 463 95L440 124Q239 66 72 109Z" fill="#8295a2" opacity=".25"/><path d="M75 116Q245 65 437 132" fill="none" stroke="#a3b0b6" opacity=".16" stroke-width="4"/>'
svg('smoked-glass',512,512,s)

s='<rect width="512" height="512" fill="#583d30"/>'
for y in [110,390]:
    s+=line(0,y,512,y,'#352920',5)
    for x in range(8,510,20):s+=line(x,y+8,x+8,y+8,'#b59464',2,.5)
svg('pilot-leather',512,512,s)
print('Authored 10 SVG surface maps; Godot build saves the sampled PNG equivalents.')
