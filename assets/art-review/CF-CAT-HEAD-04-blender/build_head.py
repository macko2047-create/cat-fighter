"""Reproducible Blender cat-head form study. Front -Y, up Z. No painted textures."""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parent
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def mat(name,color,rough=.72):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough
    return m
orange=mat('Clay • warm orange',(.94,.52,.16)); cream=mat('Face fur • cream',(.95,.85,.66)); dark=mat('Features • cocoa',(.045,.025,.015)); pink=mat('Ear recess • warm peach',(.80,.43,.40)); blue=mat('Sweat • pale blue',(.23,.64,.82),.3)
def active(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o

def smooth(o):
    if o.type=='MESH':
        for p in o.data.polygons: p.use_smooth=True

def sphere(name,loc,scale,material=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64,ring_count=40,location=loc)
    o=bpy.context.object; o.name=name; o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if material:o.data.materials.append(material)
    smooth(o); return o
head=sphere('Head • fused cheeks and ears',(0,0,0),(.67,.42,.48),orange)
# Rounded squarish face, broad lower cheeks, flatter crown and chin.
for v in head.data.vertices:
    x,y,z=v.co
    v.co.x=math.copysign((abs(x)/.67)**.84*.67,x)*(1+.060*math.exp(-((z+.13)/.20)**2))
    v.co.z=math.copysign((abs(z)/.48)**.88*.48,z)

def ear(side):
    verts=[]; faces=[]; rings=25; seg=48
    for i in range(rings):
        t=i/(rings-1)
        # Broad submerged root, slightly outward tip, rounded taper.
        width=.235*(1-t)**.58+.008
        depth=.145*(1-t)**.60+.004
        for j in range(seg):
            a=2*math.pi*j/seg
            # Wide base, gently rounded point and less height than the previous study.
            verts.append((side*(.385+.105*t)+width*math.cos(a),-.045+depth*math.sin(a),.13+.56*t))
    for i in range(rings-1):
        for j in range(seg):
            k=(j+1)%seg; faces.append((i*seg+j,i*seg+k,(i+1)*seg+k,(i+1)*seg+j))
    faces.append(tuple(reversed(range(seg))));faces.append(tuple((rings-1)*seg+j for j in range(seg)))
    mesh=bpy.data.meshes.new('Ear volume');mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new('Ear union volume',mesh);bpy.context.collection.objects.link(o)
    return o
parts=[head,ear(-1),ear(1)]
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=head;bpy.ops.object.join()
rem=head.modifiers.new('Continuous ear roots • voxel union','REMESH');rem.mode='VOXEL';rem.voxel_size=.008
bpy.ops.object.modifier_apply(modifier=rem.name)
sm=head.modifiers.new('Soften root transitions','SMOOTH');sm.factor=1.0;sm.iterations=5
bpy.ops.object.modifier_apply(modifier=sm.name)
# True carved ear bowls, with a material on cut surfaces.
head.data.materials.append(pink)
for side in [-1,1]:
    cut=sphere('Temporary ear bowl cutter',(side*.47,-.175,.49),(.14,.12,.18))
    cut.rotation_euler[1]=side*math.radians(10)
    cut.data.materials.append(orange);cut.data.materials.append(pink)
    for p in cut.data.polygons:p.material_index=1
    active(head);mod=head.modifiers.new('Carved inner ear','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cut
    bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)
smooth(head)
# Assign the cream marking directly to existing head polygons: zero added volume,
# zero seam in profile. Pink remains material slot 1 on the carved ear bowls.
head.data.materials.append(cream)
cream_index=len(head.data.materials)-1
for polygon in head.data.polygons:
    x,y,z=polygon.center
    inside=(x/.34)**2+((z+.13)/.27)**2 < 1.0
    if y < -.27 and inside:
        polygon.material_index=cream_index
# Smooth normals with real geometry, no per-view images.
bevel=head.modifiers.new('Soft cavity lip','BEVEL');bevel.width=.004;bevel.segments=2
head.shape_key_add(name='Basis');hurt=head.shape_key_add(name='Hurt • ears back');hurt.value=0.0
def smoothstep(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
for v in hurt.data:
    x,y,z=v.co
    w=smoothstep(.24,.55,z)*smoothstep(.22,.42,abs(x))
    angle=-math.radians(72)*w
    dy=y+.04; dz=z-.30
    v.co.y=-.04+dy*math.cos(angle)-dz*math.sin(angle)
    v.co.z=.30+dy*math.sin(angle)+dz*math.cos(angle)
nose=sphere('Nose',(0,-.443,-.075),(.045,.020,.028),pink)
# Taper the nose toward its lower point.
for v in nose.data.vertices:v.co.x*=.65+.35*(v.co.z/.03+1)/2
normal_eyes=[];hurt_eyes=[];sweats=[]
def curve(name,pts,r,material):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=20;c.bevel_depth=r;c.bevel_resolution=3
    spl=c.splines.new('BEZIER');spl.bezier_points.add(len(pts)-1)
    for p,co in zip(spl.bezier_points,pts):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.data.materials.append(material);return o
for side in [-1,1]:
    normal_eyes.append(sphere('Open eye '+str(side),(side*.245,-.437,.055),(.043,.016,.065),dark))
    pts=[(side*.29,-.442,.070),(side*.24,-.449,.045),(side*.285,-.443,.020)]
    hurt_eyes.append(curve('Squeezed eye '+str(side),pts,.009,dark))
    normal_eyes.append(curve('Smile '+str(side),[(0,-.455,-.102),(side*.04,-.457,-.16),(side*.095,-.453,-.135)],.008,dark))
    hurt_eyes.append(curve('Pained mouth '+str(side),[(0,-.455,-.102),(side*.035,-.457,-.15),(side*.075,-.452,-.18)],.007,dark))
    drop=sphere('Sweat drop '+str(side),(side*.425,-.343,.125),(.025,.018,.064),blue)
    for v in drop.data.vertices:
        taper=1-.78*max(0,v.co.z/.064);v.co.x*=taper;v.co.y*=taper
    sweats.append(drop)
    # Fine white whiskers emerge from the cream cheek area.
    for row,dz in enumerate([.045,-.025,-.095]):
        curve('Whisker '+str(side)+' '+str(row),[(side*.25,-.444,-.06+dz),(side*.43,-.405,-.035+dz),(side*.60,-.32,-.025+dz)],.005,cream)
for o in hurt_eyes+sweats:o.hide_render=True;o.hide_set(True)
scene=bpy.context.scene
engines=scene.render.bl_rna.properties['engine'].enum_items.keys()
scene.render.engine='CYCLES' if 'CYCLES' in engines else 'BLENDER_EEVEE'
if scene.render.engine=='CYCLES':scene.cycles.samples=32
scene.render.resolution_x=720;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
scene.world.color=(.25,.25,.25)
scene.view_settings.view_transform='Standard'
def area(name,loc,power,size):
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,.15))-o.location).to_track_quat('-Z','Y').to_euler()
area('Key softbox',(-3,-4,5),350,4);area('Fill softbox',(3,-2,2),180,3);area('Back rim',(0,3,4),250,3)
bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='Orthographic review';cam.data.type='ORTHO';cam.data.ortho_scale=1.95;scene.camera=cam
views={'front':(0,-4,.12),'three-quarter':(3,-4,1),'side':(4,0,.12),'back':(0,4,.12),'top-back':(0,3,5)}
def shot(name,loc):
    cam.location=loc;cam.rotation_euler=(Vector((0,0,.12))-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
# Save a clean neutral editable file, with a second expression available as shape key.
cam.location=views['three-quarter'];cam.rotation_euler=(Vector((0,0,.12))-cam.location).to_track_quat('-Z','Y').to_euler()
active(head)
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D':ar.spaces.active.region_3d.view_distance=3;ar.spaces.active.region_3d.view_location=Vector((0,0,.12))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'cat-head.blend'))
for name,loc in views.items():shot(name,loc)
hurt.value=1
for o in normal_eyes:o.hide_render=True
for o in hurt_eyes+sweats:o.hide_render=False;o.hide_set(False)
for name in ['front','side','back']:shot('hurt-'+name,views[name])
(OUT/'validation.json').write_text(json.dumps({'blender':bpy.app.version_string,'engine':scene.render.engine,'head_vertices':len(head.data.vertices),'head_faces':len(head.data.polygons),'shape_keys':[k.name for k in head.data.shape_keys.key_blocks],'views':list(views)+['hurt-front','hurt-side','hurt-back'],'textures':False,'game_integrated':False},indent=2))
print('CAT_HEAD_COMPLETE')
