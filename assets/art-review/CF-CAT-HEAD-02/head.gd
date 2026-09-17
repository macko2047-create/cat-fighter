extends Node3D
# One continuous skull/ear mesh. Forward -Z; centimetre-independent local units.
var hurt := false
var skin: StandardMaterial3D
func material(color: String) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(color)
	m.roughness = 0.88
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	return m
func oval(label: String, p: Vector3, s: Vector3, mat: Material) -> void:
	var n := MeshInstance3D.new()
	n.name = label
	var mesh := SphereMesh.new()
	mesh.radial_segments = 64
	mesh.rings = 32
	mesh.radius = 1.0
	mesh.height = 2.0
	n.mesh = mesh
	n.material_override = mat
	n.position = p
	n.scale = s
	add_child(n)
func point(lat: float, a: float) -> Vector3:
	var depth := sin(lat)
	var cross_section := pow(maxf(cos(lat),0.0),0.72)
	var cx := cos(a)
	var sy := sin(a)
	var x := 0.69*signf(cx)*pow(absf(cx),0.78)*cross_section
	var y := 0.47*signf(sy)*pow(absf(sy),0.82)*cross_section
	# Broader lower cheeks and flattened crown; ears grow out of the crown.
	x *= 1.0+0.055*exp(-pow((sy+0.3)/0.45,2.0))
	var ear := exp(-pow((a-0.83)/0.20,2.0))+exp(-pow((a-2.31)/0.20,2.0))
	var ear_depth := exp(-pow((depth+0.40)/0.40,4.0))
	var w := ear*ear_depth
	y += 0.36*w
	var z := depth*0.43
	if hurt:
		y -= 0.32*w
		z += 0.35*w
		x += signf(x)*0.095*w
	return Vector3(x,y,z)
func build(is_hurt := false) -> void:
	hurt = is_hurt
	skin = material("edaa42")
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var rows := 80
	var cols := 160
	for i in range(rows):
		for j in range(cols):
			var a := point(-PI/2.0+PI*i/rows,TAU*j/cols)
			var b := point(-PI/2.0+PI*(i+1)/rows,TAU*j/cols)
			var c := point(-PI/2.0+PI*(i+1)/rows,TAU*(j+1)/cols)
			var d := point(-PI/2.0+PI*i/rows,TAU*(j+1)/cols)
			for v in [a,b,c,a,c,d]:
				st.add_vertex(v)
	st.index()
	st.generate_normals()
	var n := MeshInstance3D.new()
	n.name = "ContinuousSkullAndEars"
	n.mesh = st.commit()
	n.material_override = skin
	add_child(n)
	var cream := material("f4dfb2")
	var black := material("302a25")
	# Short muzzle, never a long snout. Plain material blocking only.
	oval("MuzzleLeft",Vector3(-0.115,-0.17,-0.395),Vector3(0.18,0.115,0.095),cream)
	oval("MuzzleRight",Vector3(0.115,-0.17,-0.395),Vector3(0.18,0.115,0.095),cream)
	oval("Chin",Vector3(0,-0.25,-0.37),Vector3(0.19,0.095,0.075),cream)
	oval("Nose",Vector3(0,-0.105,-0.49),Vector3(0.053,0.034,0.027),black)
	for side in [-1.0,1.0]:
		oval("Eye",Vector3(side*0.265,0.015,-0.398),Vector3(0.047,0.012 if hurt else 0.061,0.023),black)
		if hurt:
			oval("Sweat",Vector3(side*0.43,0.11,-0.355),Vector3(0.025,0.063,0.015),material("a9dce9"))
func save_scene(path: String) -> void:
	for child in get_children():
		child.owner = self
	var scene := PackedScene.new()
	assert(scene.pack(self) == OK)
	assert(ResourceSaver.save(scene,path) == OK)
