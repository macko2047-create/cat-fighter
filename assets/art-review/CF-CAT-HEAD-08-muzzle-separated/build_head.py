"""Blender 4+/5: cat head with separate ears, projecting muzzle and nose.

Run in Blender > Scripting > Open > Run Script, or:
blender --background --factory-startup --python build_head.py

100 reference units = HEAD_WIDTH Blender units. Front = -Y, up = Z.
Depth and ear thickness are design estimates, not recovered measurements.
Creates a NEW collection on every run; does not delete existing scene objects.
Optional background export: set CAT_HEAD_OUTPUT to a NEW output directory.
Set CAT_HEAD_RENDER=1 as well to render orthographic QA views.
Standalone: no external files, add-ons or Python packages required.
"""
import bpy
import math
import os
import json
from pathlib import Path
from mathutils import Vector

HEAD_WIDTH = 2.0
MUZZLE_FRONT_Y = -44.0  # Estimated projection; cranial front plane is -40 U.
NOSE_TIP_Y = -46.0
ADD_FACE = True
ADD_WHISKERS = True  # Excluded from the 100 U head width.
S = HEAD_WIDTH / 100.0
scene = bpy.context.scene
collection = bpy.data.collections.new('CatHead_08_Muzzle_SeparatedEars')
scene.collection.children.link(collection)


def material(name, color):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = .7
    return m


orange = material('Cat_Orange', (.95, .43, .075))
pink = material('Cat_InnerEar', (.95, .49, .35))
cream = material('Cat_Cream', (.98, .91, .76))
dark = material('Cat_Cocoa', (.038, .019, .01))
tabby = material('Cat_Tabby', (.65, .24, .035))


def relocate(obj):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection.objects.link(obj)


def mesh_object(name, vertices, faces, pivot=(0, 0, 0)):
    p = Vector(pivot)
    mesh = bpy.data.meshes.new(name + '_Mesh')
    mesh.from_pydata([tuple((Vector(v) - p) * S) for v in vertices], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = p * S
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def sphere(name, location, radii, mat, segments=64, rings=40):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings)
    obj = bpy.context.object
    obj.name = name
    relocate(obj)
    for v in obj.data.vertices:
        v.co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2])) * S
    obj.location = Vector(location) * S
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def spow(value, power):
    return math.copysign(abs(value) ** power, value)


head = sphere('Head_Base', (0, 0, 41.5), (50, 40, 41.5), orange, 192, 128)
for v in head.data.vertices:
    x, y, z = v.co / S
    v.co = Vector((50 * spow(x / 50, .78),
                   40 * spow(y / 40, .90),
                   41.5 * spow(z / 41.5, .78))) * S
head['dimensions_reference_U'] = [100.0, 80.0, 83.0]
head['reference_note'] = 'Width/height approximate image ratios; depth estimated.'
head.data.materials.append(cream)
head.data.materials.append(tabby)
head.data.update()
for p in head.data.polygons:
    # Small underlying color margin; actual muzzle volume is built below.
    x, y, z = p.center / S
    z += 41.5
    if y < 0 and (x / 25.5) ** 2 + ((z - 14) / 14) ** 2 < 1:
        p.material_index = 1
    # Surface color only; the forehead stripes add no geometry or dimensions.
    for stripe_x, bottom, width in [(0, 58, 3.5), (-11, 64, 2.8), (11, 64, 2.8)]:
        if z > bottom and abs(x-stripe_x) < width * min(1.0, ((z-bottom)/6)**.5):
            p.material_index = 2


def rounded_outline():
    # Clockwise when viewed from the front; quadratic corner arcs.
    corners = [Vector(p) for p in [(15.5, 57), (44.5, 57), (44.5, 79), (36, 95), (30, 91)]]
    result = []
    for i, b in enumerate(corners):
        a, c = corners[i - 1], corners[(i + 1) % len(corners)]
        start, end = b.lerp(a, .12), b.lerp(c, .12)
        for j in range(10):
            t = j / 10
            result.append((1-t)**2 * start + 2*(1-t)*t*b + t*t*end)
    # Preserve exact requested bounding dimensions after rounding.
    lo = [min(p[k] for p in result) for k in range(2)]
    hi = [max(p[k] for p in result) for k in range(2)]
    return [(15.5 + (p.x-lo[0])/(hi[0]-lo[0])*29,
             57 + (p.y-lo[1])/(hi[1]-lo[1])*38) for p in result]


def make_ear(side, name):
    outline = rounded_outline()
    n = len(outline)
    vertices, faces, slots = [], [], []
    # Each ring is connected: back cap -> outer wall -> rounded lip -> bowl.
    # Pink is a material region of this SAME closed ear mesh, not a loose insert.
    rings = [(0.92, 1), (1.0, -2), (0.96, -9), (.76, -11), (.59, -8), (.25, -7)]
    cx, cz = 32, 75
    for scale, y in rings:
        for x, z in outline:
            zz = cz+(z-cz)*scale
            taper = 1-.7*max(0.0, min(1.0, (zz-78)/17))
            vertices.append((side*(cx+(x-cx)*scale), -5+(y+5)*taper, zz))
    faces.append(tuple(reversed(range(n))))
    slots.append(0)
    for r in range(len(rings)-1):
        for j in range(n):
            k = (j+1) % n
            faces.append((r*n+j, r*n+k, (r+1)*n+k, (r+1)*n+j))
            slots.append(1 if r >= 3 else 0)
    vertices.append((side*cx, -7, cz))
    center = len(vertices)-1
    for j in range(n):
        faces.append(((len(rings)-1)*n+j, (len(rings)-1)*n+(j+1)%n, center))
        slots.append(1)
    if side < 0:
        faces = [tuple(reversed(f)) for f in faces]
    obj = mesh_object(name, vertices, faces, (side*29, -5, 65))
    obj.data.materials.append(orange)
    obj.data.materials.append(pink)
    for p, slot in zip(obj.data.polygons, slots):
        p.material_index = slot
    # Recalculate closed-volume normals independent of outline winding.
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    obj['pivot_reference_U'] = [side*29, -5, 65]
    obj['dimensions_reference_U'] = [29.0, 12.0, 38.0]
    obj['reference_note'] = 'Independent ear; thickness and cavity are estimated.'
    return obj


ear_l = make_ear(1, 'Ear_L')
ear_r = make_ear(-1, 'Ear_R')


def set_ears_hurt(amount=0.0):
    """Optional illustrative pose, not an angle measured from the reference."""
    amount = max(0.0, min(1.0, amount))
    for ear, side in [(ear_l, 1), (ear_r, -1)]:
        ear.rotation_euler = (math.radians(-20)*amount,
                              side*math.radians(65)*amount, 0)


bpy.context.view_layer.update()


def front_y(x, z):
    origin = head.matrix_world.inverted() @ (Vector((x, -100, z))*S)
    hit, position, normal, index = head.ray_cast(origin, Vector((0, 1, 0)))
    if not hit:
        raise RuntimeError('Face placement missed head surface')
    return (head.matrix_world @ position).y / S


def recalculate_normals(obj):
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()


def make_muzzle():
    # A closed, conforming volume: front bulges out, rear is embedded in the
    # actual curved skull. Fixed -32 U backing would float above the low chin.
    # Consequently the complete depth is adaptive, not the draft 12 U box.
    angular, radial = 128, 40
    samples = [(0.0, 15.0, 0.0)]
    for ring in range(1, radial+1):
        r = ring/radial
        for j in range(angular):
            a = 2*math.pi*j/angular
            samples.append((25*r*math.cos(a), 15+14*r*math.sin(a), r))
    vertices = []
    for back in (False, True):
        for x, z, r in samples:
            skull_y = front_y(x, z)
            if back:
                y = skull_y+2.0
            else:
                t = max(0.0, min(1.0, (r-.55)/.45))
                w = 1-t*t*(3-2*t)
                y = (skull_y+.05)*(1-w)+(MUZZLE_FRONT_Y+3*r*r)*w
            vertices.append((x, y, z))
    n = len(samples)
    cap = [(0, 1+j, 1+(j+1)%angular) for j in range(angular)]
    for ring in range(radial-1):
        a, b = 1+ring*angular, 1+(ring+1)*angular
        for j in range(angular):
            k = (j+1)%angular
            cap.append((a+j, b+j, b+k, a+k))
    faces = cap+[tuple(n+i for i in reversed(f)) for f in cap]
    edge = 1+(radial-1)*angular
    for j in range(angular):
        a, b = edge+j, edge+(j+1)%angular
        faces.append((a, b, n+b, n+a))
    obj = mesh_object('Muzzle_Base', vertices, faces, (0, -38, 15))
    obj.data.materials.append(cream)
    recalculate_normals(obj)
    obj['reference_note'] = 'Real projecting volume; back follows skull. Depth is adaptive, not measured.'
    obj['front_plane_U'] = MUZZLE_FRONT_Y
    return obj


muzzle = make_muzzle()
bpy.context.view_layer.update()


def face_y(x, z):
    ys = [front_y(x, z)]
    origin = muzzle.matrix_world.inverted() @ (Vector((x, -100, z))*S)
    hit, position, _, _ = muzzle.ray_cast(origin, Vector((0, 1, 0)))
    if hit:
        ys.append((muzzle.matrix_world @ position).y/S)
    return min(ys)


# Nose is structural and remains present even if optional eyes/mouth are disabled.
nose_back_y = max(-41.0, face_y(0, 25.5)+1.0)
nose = sphere('Nose', (0, (nose_back_y+NOSE_TIP_Y)/2, 25.5),
              (5, (nose_back_y-NOSE_TIP_Y)/2, 3.5), dark)
for v in nose.data.vertices:
    v.co.x *= .75+.25*(v.co.z/(3.5*S))
nose_half_width = max(abs(v.co.x) for v in nose.data.vertices)
for v in nose.data.vertices:
    v.co.x *= (5*S)/nose_half_width
nose['reference_note'] = 'Width and height from front silhouette; depth estimated, rear embedded in muzzle.'


def surface_curve(name, points, radius=.55):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 12
    curve.bevel_depth = radius*S
    curve.bevel_resolution = 3
    curve.use_fill_caps = True
    spline = curve.splines.new('POLY')
    spline.points.add(len(points)-1)
    for p, co in zip(spline.points, points):
        p.co = (*[v*S for v in co], 1)
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    obj.data.materials.append(dark)
    return obj


if ADD_FACE:
    for side, suffix in [(1, 'L'), (-1, 'R')]:
        x, z = side*21.5, 34
        y = front_y(x, z)
        sphere('Eye_'+suffix, (x, y-.7, z), (6, 2, 7.5), dark)
        sphere('EyeHighlight_'+suffix, (x-1.6, y-2.55, z+2.5), (1.3, .5, 1.7), cream)
    surface_curve('Mouth_Center', [(0, face_y(0, z)-.3, z) for z in [24, 23, 22, 21, 20, 19, 18]])
    for side in [-1, 1]:
        points = []
        for j in range(33):
            t = j/32
            x = side*12*t
            z = 18-4*math.sin(math.pi*t)
            points.append((x, face_y(x, z)-.3, z))
        surface_curve('Mouth_Smile_' + str(side), points)
        if ADD_WHISKERS:
            for i, dz in enumerate([5, 0, -5]):
                points = []
                start_y = front_y(side*43, 21+dz)-.7
                for j in range(25):
                    t = j/24
                    points.append((side*(43+15*t), start_y-3*t,
                                   21+dz+(i-1)*-2*t+1.2*math.sin(math.pi*t)))
                surface_curve('Whisker_' + str(side) + '_' + str(i), points, .42)


# Keep parts together while allowing each ear to rotate around its own origin.
root = bpy.data.objects.new('CatHead_Root', None)
collection.objects.link(root)
root['head_width_blender_units'] = HEAD_WIDTH
root['reference_width_U'] = 100.0
for obj in list(collection.objects):
    if obj != root:
        obj.parent = root


def validate():
    import bmesh
    bpy.context.view_layer.update()
    result = {}
    for obj, expected in [(head, (100, 80, 83)), (ear_l, (29, 12, 38)),
                          (ear_r, (29, 12, 38)), (muzzle, (50, None, 28)),
                          (nose, (10, None, 7))]:
        actual = [v / S for v in obj.dimensions]
        assert all(b is None or abs(a-b) < .01 for a, b in zip(actual, expected)), (obj.name, actual)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        closed = all(e.is_manifold for e in bm.edges)
        volume = bm.calc_volume(signed=True) / S**3
        bm.free()
        assert closed, obj.name + ' is not closed'
        assert volume > 0, obj.name + ' has inverted normals'
        result[obj.name] = {'dimensions_U': actual, 'closed_mesh': closed,
                            'signed_volume_U3': volume,
                            'origin_U': [v/S for v in obj.location],
                            'bounds_U': bounds([obj])}
        if obj in [ear_l, ear_r]:
            result[obj.name]['inner_material_region_bounds_U'] = bounds([obj], material_index=1)
    assert len({o.data.as_pointer() for o in [head, muzzle, nose, ear_l, ear_r]}) == 5
    assert abs(bounds([muzzle])['min'][1]-MUZZLE_FRONT_Y) < .01
    assert abs(bounds([nose])['min'][1]-NOSE_TIP_Y) < .01
    assert nose_back_y > face_y(0, 25.5), 'Nose must intersect muzzle at center'
    assert face_y(0, 15) < front_y(0, 15)-1, 'Muzzle must project beyond skull'
    base_coords = [v.co.copy() for v in head.data.vertices]
    set_ears_hurt(1)
    bpy.context.view_layer.update()
    assert all(a == b.co for a, b in zip(base_coords, head.data.vertices))
    set_ears_hurt(0)
    bpy.context.view_layer.update()
    result['metadata'] = {'blender_version': bpy.app.version_string,
                          'head_width_blender_units': HEAD_WIDTH,
                          'unit_note': 'U is a normalized unit, not measured millimeters.',
                          'depth_and_thickness': 'Estimated from uncalibrated illustration.',
                          'ear_pose_does_not_deform_head': True,
                          'muzzle_is_real_closed_volume': True,
                          'nose_intersects_muzzle_at_center': True,
                          'muzzle_depth_note': 'Adaptive rear surface embedded in curved skull; replaces provisional 12 U depth.',
                          'complete_mesh_bounds_excluding_whiskers_U': bounds(
                              [o for o in collection.objects if o.type == 'MESH'])}
    return result


def bounds(objects, material_index=None):
    points = []
    for obj in objects:
        indices = (range(len(obj.data.vertices)) if material_index is None else
                   {i for p in obj.data.polygons if p.material_index == material_index for i in p.vertices})
        points.extend(obj.matrix_world @ obj.data.vertices[i].co / S for i in indices)
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    return {'min': lo, 'max': hi, 'size': [b-a for a, b in zip(lo, hi)]}


report = validate()
bpy.ops.object.select_all(action='DESELECT')
for obj in [head, muzzle, nose, ear_l, ear_r]:
    obj.select_set(True)
bpy.context.view_layer.objects.active = ear_l
print('CAT_HEAD_VALIDATED', json.dumps(report))

# Optional export is disabled in the Blender Text Editor unless explicitly set.
output = os.environ.get('CAT_HEAD_OUTPUT')
if output:
    out = Path(output).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    target = out / 'cat-head-muzzle-separated.blend'
    reserved = [target, out/'validation.json']
    if os.environ.get('CAT_HEAD_RENDER') == '1':
        reserved += [out/(name+'.png') for name in ['front', 'three-quarter', 'side', 'side-clay', 'ears-posed']]
    for path in reserved:
        if path.exists():
            raise FileExistsError('Refusing to overwrite ' + str(path))
    if os.environ.get('CAT_HEAD_RENDER') == '1':
        preview = bpy.data.scenes.new('CatHead_08_Preview')
        preview.collection.children.link(collection)
        preview.render.engine = 'CYCLES'
        preview.cycles.samples = 24
        preview.render.resolution_x = 800
        preview.render.resolution_y = 800
        preview.render.resolution_percentage = 100
        preview.render.image_settings.file_format = 'PNG'
        preview.world = bpy.data.worlds.new('CatHead_08_World')
        preview.world.use_nodes = True
        preview.world.node_tree.nodes['Background'].inputs[0].default_value = (.16, .18, .22, 1)
        preview.world.node_tree.nodes['Background'].inputs[1].default_value = .6
        preview.view_settings.view_transform = 'AgX'
        cam_data = bpy.data.cameras.new('CatHead_08_Camera')
        cam = bpy.data.objects.new('CatHead_08_Camera', cam_data)
        preview.collection.objects.link(cam)
        preview.camera = cam
        cam_data.type = 'ORTHO'
        cam_data.ortho_scale = 130*S
        for name, pos, energy, size in [('Key', (-100, -150, 180), 450, 120),
                                        ('Fill', (140, -60, 90), 220, 100),
                                        ('Rim', (0, 100, 150), 350, 90)]:
            data = bpy.data.lights.new('CatHead_08_'+name, 'AREA')
            data.energy = energy*(HEAD_WIDTH/2)**2
            data.shape = 'DISK'
            data.size = size*S
            light = bpy.data.objects.new(data.name, data)
            preview.collection.objects.link(light)
            light.location = Vector(pos)*S
            light.rotation_euler = (Vector((0, 0, 45))*S-light.location).to_track_quat('-Z', 'Y').to_euler()
        clay = material('CatHead_08_Clay', (.55, .55, .55))
        for name, pos in [('front', (0, -300, 47.5)),
                          ('three-quarter', (-210, -260, 90)),
                          ('side', (-300, 0, 47.5)),
                          ('side-clay', (-300, 0, 47.5)),
                          ('ears-posed', (0, -300, 47.5))]:
            set_ears_hurt(1 if name == 'ears-posed' else 0)
            preview.view_layers[0].material_override = clay if name == 'side-clay' else None
            cam.location = Vector(pos)*S
            cam.rotation_euler = (Vector((0, 0, 47.5))*S-cam.location).to_track_quat('-Z', 'Y').to_euler()
            preview.render.filepath = str(out/(name+'.png'))
            bpy.ops.render.render(write_still=True, scene=preview.name)
        set_ears_hurt(0)
        cam.location = Vector((-210, -260, 90))*S
        cam.rotation_euler = (Vector((0, 0, 47.5))*S-cam.location).to_track_quat('-Z', 'Y').to_euler()
        if bpy.context.window:
            bpy.context.window.scene = preview
        text_block = bpy.data.texts.new('build_head_08.py')
        if '__file__' in globals():
            text_block.write(Path(__file__).read_text())
    bpy.ops.wm.save_as_mainfile(filepath=str(target))
    (out / 'validation.json').write_text(json.dumps(report, indent=2))
