import bpy
from pathlib import Path
p=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(p/'cat-head.blend'))
o=bpy.data.objects['Head • fused cheeks and ears']
print('KEYS',[(k.name,k.value,min(v.co.z for v in k.data),max(v.co.z for v in k.data)) for k in o.data.shape_keys.key_blocks])
print('BOUNDS',min(v.co.z for v in o.data.vertices),max(v.co.z for v in o.data.vertices),o.show_only_shape_key,o.active_shape_key_index)
