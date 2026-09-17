"""Read-only validation; writes a JSON audit, never modifies image pixels."""
from pathlib import Path
import hashlib
import json
import re
from PIL import Image
import numpy as np

ROOT = Path(__file__).parent
BASE = ROOT.parent / 'CF-3D-05'

def function(source, name):
    return re.search(r'^func '+name+r'\([^\n]*\).*?(?=^func |\Z)',source,re.M|re.S).group(0).strip()

original=(BASE/'p1_production_master.gd').read_bytes()
assert original == (ROOT/'baseline/p1_production_master.gd').read_bytes()
old=(BASE/'render_p1_production.gd').read_text()
new=(ROOT/'render_p1_surface.gd').read_text()
assert function(old,'_add_locked_camera_and_light') == function(new,'_add_locked_camera_and_light')
for pattern in [r'const SIZE := .*',r'const GAMEPLAY_SIZE := .*',r'const POSES := \[.*?\n\]',r'model.scale = .*',r'model.rotation = .*',r'viewport.msaa_3d = .*']:
    assert re.search(pattern,old,re.S if 'POSES' in pattern else 0).group(0) == re.search(pattern,new,re.S if 'POSES' in pattern else 0).group(0)
shader=(ROOT/'materials/surface.gdshader').read_text()
for symbol in ['VERTEX','NORMAL','UV']:
    assert not re.search(r'\b'+symbol+r'\s*=',shader)
assert 'TIME' not in shader and 'SCREEN_UV' not in shader
geometry=json.loads((ROOT/'geometry-verification.json').read_text())
assert len({geometry[k] for k in ['baseline_sha256','before_materials_sha256','after_materials_sha256']}) == 1
uv=json.loads((ROOT/'uv-verification.json').read_text())
assert len(uv) == 5
assert all(x['every_part_to_model_matrix_matches_local_transform'] for x in uv)
records=[]
hashes=[]
for name in ['normal','roll-left','roll-right','pitch-up','pitch-down']:
    path=ROOT/f'p1-{name}.png'
    image=Image.open(path)
    assert image.mode == 'RGBA' and image.size == (1024,1024)
    a=np.asarray(image)
    base=np.asarray(Image.open(BASE/path.name))
    assert a[0,0,3] == 0
    assert not np.any(a[0,:,3]) and not np.any(a[-1,:,3])
    assert not np.any(a[:,0,3]) and not np.any(a[:,-1,3])
    # Below the propeller: coverage must remain identical because all geometry is locked.
    mask_delta=np.abs(a[220:,:,3].astype(int)-base[220:,:,3].astype(int))
    assert int(mask_delta.max()) <= 1, (name,'Opaque silhouette changed',int(mask_delta.max()))
    records.append({'pose':name,'rgba':True,'size':[1024,1024],'no_edge_clipping':True,'opaque_region_alpha_max_difference':int(mask_delta.max()),'changed_rgb_pixels':int(np.count_nonzero(np.any(a[:,:,:3] != base[:,:,:3],axis=2)))})
    hashes.append(hashlib.sha256(path.read_bytes()).hexdigest())
assert len(set(hashes)) == 5
for path in (ROOT/'textures').glob('*.svg'):
    assert path.with_suffix('.png').exists()
assert len(list((ROOT/'textures').glob('*.png'))) == 10
assert Image.open(ROOT/'p1-gameplay-size-preview.png').size == (360,72)
result={'result':'PASS','baseline_source_sha256':hashlib.sha256(original).hexdigest(),'camera_light_rig_function_exact_match':True,'canvas_msaa_pose_rotation_and_scale_exact_match':True,'geometry':geometry,'uv_states_checked':len(uv),'texture_pairs':10,'renders':records}
(ROOT/'surface-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
