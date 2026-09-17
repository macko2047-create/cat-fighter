extends SceneTree

const OUTPUT := "res://"
const SIZE := Vector2i(512, 512)

var silver := Color("b9c0c5")
var dark_silver := Color("59636a")
var red := Color("d92c2c")
var orange := Color("ea8a22")
var stripe := Color("8d421b")
var navy := Color("183d70")

func _init() -> void:
	call_deferred("_build_and_render")

func material(color: Color, metallic := 0.0, roughness := 0.5, transparent := false) -> StandardMaterial3D:
	var result := StandardMaterial3D.new()
	result.albedo_color = color
	result.metallic = metallic
	result.roughness = roughness
	if transparent:
		result.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		result.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	return result

func mesh_part(parent: Node3D, mesh: Mesh, position: Vector3, mesh_material: Material, scale := Vector3.ONE, rotation := Vector3.ZERO) -> MeshInstance3D:
	var part := MeshInstance3D.new()
	part.mesh = mesh
	part.material_override = mesh_material
	part.position = position
	part.scale = scale
	part.rotation = rotation
	parent.add_child(part)
	return part

func sphere(parent: Node3D, position: Vector3, mesh_material: Material, scale := Vector3.ONE) -> void:
	mesh_part(parent, SphereMesh.new(), position, mesh_material, scale)

func box(parent: Node3D, position: Vector3, size: Vector3, mesh_material: Material) -> void:
	var geometry := BoxMesh.new()
	geometry.size = size
	mesh_part(parent, geometry, position, mesh_material)

func cylinder(parent: Node3D, position: Vector3, radius: float, height: float, mesh_material: Material, rotation := Vector3.ZERO) -> void:
	var geometry := CylinderMesh.new()
	geometry.top_radius = radius
	geometry.bottom_radius = radius
	geometry.height = height
	geometry.radial_segments = 32
	mesh_part(parent, geometry, position, mesh_material, Vector3.ONE, rotation)

func make_paw(parent: Node3D, x: float) -> void:
	# Raised, fixed blue paw insignia on each silver wing.
	sphere(parent, Vector3(x, 0.23, -0.12), material(navy, 0.05, 0.4), Vector3(0.13, 0.035, 0.16))
	for offset in [Vector2(-0.14, -0.02), Vector2(-0.05, -0.13), Vector2(0.05, -0.13), Vector2(0.14, -0.02)]:
		sphere(parent, Vector3(x + offset.x, 0.235, -0.12 + offset.y), material(navy, 0.05, 0.4), Vector3(0.052, 0.022, 0.052))

func make_p1() -> Node3D:
	var root := Node3D.new()
	root.name = "P1_Master_Geometry"
	var metal := material(silver, 0.72, 0.28)
	var dark_metal := material(dark_silver, 0.75, 0.32)
	var red_metal := material(red, 0.4, 0.32)
	# Longitudinal axis: Z. The nose points to -Z (screen-up); roll only rotates this root around Z.
	sphere(root, Vector3(0, 0, -0.18), metal, Vector3(0.48, 0.34, 1.75))
	sphere(root, Vector3(0, 0.02, -1.47), metal, Vector3(0.30, 0.28, 0.50))
	box(root, Vector3(0, 0.0, -0.20), Vector3(3.55, 0.18, 0.52), metal)
	box(root, Vector3(-1.72, 0.0, -0.20), Vector3(0.38, 0.22, 0.58), red_metal)
	box(root, Vector3(1.72, 0.0, -0.20), Vector3(0.38, 0.22, 0.58), red_metal)
	box(root, Vector3(0, 0.02, 1.20), Vector3(1.30, 0.12, 0.34), metal)
	box(root, Vector3(0, 0.26, 1.24), Vector3(0.12, 0.60, 0.42), dark_metal)
	# Propeller hub and placeholder rotational disc share the same fixed nose origin.
	cylinder(root, Vector3(0, 0, -2.0), 0.23, 0.30, dark_metal, Vector3(deg_to_rad(90), 0, 0))
	cylinder(root, Vector3(0, 0, -2.16), 0.74, 0.018, material(Color(0.8, 0.88, 0.95, 0.22), 0.0, 0.1, true), Vector3(deg_to_rad(90), 0, 0))
	# Cockpit and simplified big orange tabby pilot, top/rear view.
	sphere(root, Vector3(0, 0.32, 0.25), material(Color("253647"), 0.25, 0.16), Vector3(0.42, 0.22, 0.56))
	sphere(root, Vector3(0, 0.66, 0.36), material(orange, 0.0, 0.62), Vector3(0.68, 0.46, 0.58))
	var ear_mesh := CylinderMesh.new()
	ear_mesh.top_radius = 0.02
	ear_mesh.bottom_radius = 0.22
	ear_mesh.height = 0.48
	for x in [-0.42, 0.42]:
		mesh_part(root, ear_mesh, Vector3(x, 1.05, 0.43), material(orange, 0.0, 0.62), Vector3.ONE, Vector3(0, 0, deg_to_rad(-10.0 if x < 0 else 10.0)))
	# Three rear-facing tabby stripes, deliberately part of the same reusable model.
	for x in [-0.25, 0.0, 0.25]:
		box(root, Vector3(x, 1.115, 0.52), Vector3(0.07, 0.018, 0.36), material(stripe, 0.0, 0.65))
	make_paw(root, -0.93)
	make_paw(root, 0.93)
	return root

func add_light_and_camera(world: Node3D) -> Camera3D:
	var environment := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0, 0, 0, 0)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("6f8293")
	env.ambient_light_energy = 0.45
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.environment = env
	world.add_child(environment)
	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-52, 36, 0) # fixed upper-right key, shared by every pose
	key.light_color = Color("fff1d4")
	key.light_energy = 2.0
	key.shadow_enabled = true
	world.add_child(key)
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 5.5
	camera.position = Vector3(0, 6.8, 4.8)
	world.add_child(camera)
	camera.look_at(Vector3(0, 0, 0), Vector3(0, 1, 0))
	return camera

func render_pose(viewport: SubViewport, model: Node3D, filename: String, roll_degrees: float) -> void:
	model.rotation = Vector3(0, 0, deg_to_rad(roll_degrees))
	await process_frame
	await process_frame
	var image := viewport.get_texture().get_image()
	image.save_png(OUTPUT + filename)

func build_review_sheet() -> void:
	# A neutral-background side-by-side inspection surface; source deliverables remain transparent.
	var review := Image.create(1536, 512, false, Image.FORMAT_RGBA8)
	review.fill(Color("16202a"))
	for index in range(3):
		var filename: String = ["p1-normal.png", "p1-roll-left.png", "p1-roll-right.png"][index]
		var pose := Image.load_from_file(OUTPUT + filename)
		review.blend_rect(pose, Rect2i(Vector2i.ZERO, SIZE), Vector2i(index * 512, 0))
	review.save_png(OUTPUT + "p1-motion-review.png")

func _build_and_render() -> void:
	var viewport := SubViewport.new()
	viewport.size = SIZE
	viewport.transparent_bg = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	var world := Node3D.new()
	viewport.add_child(world)
	add_light_and_camera(world)
	var model := make_p1()
	world.add_child(model)
	await render_pose(viewport, model, "p1-normal.png", 0.0)
	await render_pose(viewport, model, "p1-roll-left.png", -42.0)
	await render_pose(viewport, model, "p1-roll-right.png", 42.0)
	build_review_sheet()
	quit()
