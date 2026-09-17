import bpy,json,numpy as np
from pathlib import Path
p=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(p/'cat-head.blend'))
o=bpy.data.objects['Head • fused cheeks and ears']
assert o.data.shape_keys.key_blocks['Hurt • ears back'].value==0
records={}
for name in ['front','three-quarter','side','back','top-back','hurt-front','hurt-side','hurt-back']:
    im=bpy.data.images.load(str(p/(name+'.png')),check_existing=False)
    assert tuple(im.size)==(720,720)
    pixels=np.empty(720*720*4,dtype=np.float32);im.pixels.foreach_get(pixels)
    alpha=pixels.reshape((720,720,4))[:,:,3]
    ys,xs=np.where(alpha>.01)
    assert len(xs)>0 and xs.min()>0 and xs.max()<719 and ys.min()>0 and ys.max()<719
    records[name]={'size':[720,720],'bounds':[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())],'transparent_corners':bool(alpha[0,0]==0 and alpha[-1,-1]==0)}
q=json.loads((p/'validation.json').read_text());q['saved_neutral_verified']=True;q['image_checks']=records
(p/'validation.json').write_text(json.dumps(q,indent=2))
print('PASS: saved neutral shape key, eight transparent 720px renders, no clipping')
