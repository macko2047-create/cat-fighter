"""Run with Blender --background --factory-startup --python render_review.py.

Builds, verifies, saves a neutral model and renders geometry review views.
Only use this helper in a fresh factory scene; use build_head.py for an existing scene.
"""
import bpy
import json
import runpy
from pathlib import Path
from mathutils import Vector

BASE = Path(__file__).resolve().parent
OUT = BASE / 'output'
OUT.mkdir(exist_ok=True)
target = OUT / 'cat-head-separated.blend'
if target.exists():
    raise FileExistsError('Move the existing output before rebuilding: ' + str(target))
ns = runpy.run_path(str(BASE / 'build_head.py'))
scene = bpy.context.scene
for obj in list(scene.objects):
    if obj.name in {'Cube', 'Camera', 'Light'} and obj not in ns['collection'].objects.values():
        bpy.data.objects.remove(obj, do_unlink=True)
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.7, .75, .85, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .5
scene.render.resolution_x = 720
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'

for name, loc, power, size in [('Key', (-3,-4,6), 450, 4),
                               ('Fill', (4,-2,3), 280, 4), ('Rim', (0,4,5), 400, 3)]:
    bpy.ops.object.light_add(type='AREA', location=loc)
    lamp = bpy.context.object
    lamp.name = name
    lamp.data.energy = power
    lamp.data.shape = 'DISK'
    lamp.data.size = size
    lamp.rotation_euler = (Vector((0,0,.95))-lamp.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add()
cam = bpy.context.object
cam.name = 'Review_Orthographic'
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 2.7
scene.camera = cam
views = {'front': (0,-8,.95), 'side': (8,0,.95), 'back': (0,8,.95),
         'three-quarter': (5,-8,3)}

def camera(loc):
    cam.location = loc
    cam.rotation_euler = (Vector((0,0,.95))-cam.location).to_track_quat('-Z','Y').to_euler()

def shot(name, loc):
    camera(loc)
    scene.render.filepath = str(OUT / (name + '.png'))
    bpy.ops.render.render(write_still=True)

camera(views['three-quarter'])
bpy.ops.object.select_all(action='DESELECT')
for obj in [ns['head'], ns['ear_l'], ns['ear_r']]:
    obj.select_set(True)
bpy.context.view_layer.objects.active = ns['ear_l']
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_location = Vector((0,0,.95))
            area.spaces.active.region_3d.view_distance = 3.5
            area.spaces.active.region_3d.view_rotation = cam.rotation_euler.to_quaternion()
            area.spaces.active.shading.color_type = 'MATERIAL'
text = bpy.data.texts.load(str(BASE / 'build_head.py'))
text.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=str(target))
for name, loc in views.items():
    shot(name, loc)
ns['set_ears_hurt'](1)
for name in ['front', 'side']:
    shot('hurt-ears-' + name, views[name])
ns['set_ears_hurt'](0)
for obj in ns['collection'].objects:
    if obj.type in {'MESH', 'CURVE'} and obj not in [ns['ear_l'], ns['ear_r']]:
        obj.hide_render = True
shot('ears-only', views['three-quarter'])

# Reopen the delivered file to verify the saved artifact, not just the build session.
bpy.ops.wm.open_mainfile(filepath=str(target))
assert bpy.data.objects['Ear_L'].rotation_euler.length < 1e-6
assert bpy.data.objects['Ear_R'].rotation_euler.length < 1e-6
assert not bpy.data.objects['Head_Base'].hide_render
assert bpy.data.objects['Ear_L'].data != bpy.data.objects['Head_Base'].data
report = ns['report']
report['metadata']['saved_neutral_verified'] = True
report['metadata']['preview_views'] = list(views) + ['hurt-ears-front', 'hurt-ears-side', 'ears-only']
(OUT / 'validation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print('PASS: independent closed ears, dimensions, head unchanged by ear rotation, saved neutral file.')
