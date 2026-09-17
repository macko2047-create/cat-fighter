class_name P1ProductionMaster
extends Node3D

# CF-3D-03 single reusable production source.  Nose is local -Z; root pivot is (0, 0, 0).

const SILVER := Color("b8c2c7")
const SILVER_DARK := Color("52616c")
const RED := Color("d93632")
const RED_DARK := Color("942724")
const COCKPIT := Color("182b3a")
const ORANGE := Color("e98727")
const TABBY := Color("87401d")
const CREAM := Color("f3c276")
const PAW := Color("f2e8cc")

func _init() -> void:
	name = "P1_Production_Master"
	_build()

func _mat(color: Color, metallic := 0.0, roughness := 0.5, transparent := false) -> StandardMaterial3D:
	var result := StandardMaterial3D.new()
	result.albedo_color = color
	result.metallic = metallic
	result.roughness = roughness
	if transparent:
		result.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		result.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	return result

func _part(part_name: String, mesh: Mesh, position: Vector3, mesh_material: Material, scale := Vector3.ONE, rotation := Vector3.ZERO) -> MeshInstance3D:
	var part := MeshInstance3D.new()
	part.name = part_name
	part.mesh = mesh
	part.material_override = mesh_material
	part.position = position
	part.scale = scale
	part.rotation = rotation
	add_child(part)
	return part

func _sphere(part_name: String, position: Vector3, mesh_material: Material, scale := Vector3.ONE) -> void:
	var mesh := SphereMesh.new()
	mesh.radial_segments = 24
	mesh.rings = 12
	_part(part_name, mesh, position, mesh_material, scale)

func _box(part_name: String, position: Vector3, size: Vector3, mesh_material: Material, rotation := Vector3.ZERO) -> void:
	var mesh := BoxMesh.new()
	mesh.size = size
	_part(part_name, mesh, position, mesh_material, Vector3.ONE, rotation)

func _cylinder(part_name: String, position: Vector3, radius: float, height: float, mesh_material: Material, rotation := Vector3.ZERO, top_radius := -1.0) -> void:
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius if top_radius < 0.0 else top_radius
	mesh.bottom_radius = radius
	mesh.height = height
	mesh.radial_segments = 24
	_part(part_name, mesh, position, mesh_material, Vector3.ONE, rotation)

func _paw_insignia(x: float, wing_y: float, wing_z: float, paw_material: Material) -> void:
	# Deliberately low relief: a legible marking rather than high-frequency wing geometry.
	_sphere("PawPad", Vector3(x, wing_y + 0.08, wing_z), paw_material, Vector3(0.13, 0.025, 0.15))
	for offset in [Vector2(-0.13, -0.08), Vector2(-0.045, -0.16), Vector2(0.045, -0.16), Vector2(0.13, -0.08)]:
		_sphere("PawToe", Vector3(x + offset.x, wing_y + 0.084, wing_z + offset.y), paw_material, Vector3(0.047, 0.018, 0.052))

func _build() -> void:
	var metal := _mat(SILVER, 0.68, 0.31)
	var metal_dark := _mat(SILVER_DARK, 0.58, 0.35)
	var red_metal := _mat(RED, 0.30, 0.34)
	var red_dark := _mat(RED_DARK, 0.25, 0.40)
	var cockpit_mat := _mat(COCKPIT, 0.20, 0.14)
	var orange_mat := _mat(ORANGE, 0.0, 0.60)
	var tabby_mat := _mat(TABBY, 0.0, 0.67)
	var cream_mat := _mat(CREAM, 0.0, 0.66)
	var paw_mat := _mat(PAW, 0.0, 0.47)

	# Fuselage: deliberately broad, rounded volume for a strong Q-style player silhouette.
	_sphere("Fuselage_Main", Vector3(0, 0.0, -0.02), metal, Vector3(0.55, 0.40, 1.82))
	_sphere("Engine_Cowl", Vector3(0, 0.01, -1.48), red_metal, Vector3(0.42, 0.36, 0.56))
	_sphere("Nose_Ring", Vector3(0, 0.01, -1.85), metal_dark, Vector3(0.34, 0.30, 0.22))
	_box("Fuselage_RedBand", Vector3(0, 0.0, -0.92), Vector3(0.88, 0.42, 0.16), red_metal)

	# Thick rounded wing construction: central plane plus soft leading-edge fairings and red tips.
	_box("MainWing_Plane", Vector3(0, -0.01, -0.10), Vector3(3.62, 0.22, 0.66), metal)
	_sphere("WingRoot_Fairing_L", Vector3(-0.60, 0.02, -0.13), metal, Vector3(0.70, 0.18, 0.41))
	_sphere("WingRoot_Fairing_R", Vector3(0.60, 0.02, -0.13), metal, Vector3(0.70, 0.18, 0.41))
	_sphere("WingTip_Red_L", Vector3(-1.73, 0.0, -0.10), red_metal, Vector3(0.24, 0.18, 0.38))
	_sphere("WingTip_Red_R", Vector3(1.73, 0.0, -0.10), red_metal, Vector3(0.24, 0.18, 0.38))
	_box("Aileron_Shadow_L", Vector3(-1.16, 0.12, 0.15), Vector3(0.72, 0.026, 0.05), metal_dark)
	_box("Aileron_Shadow_R", Vector3(1.16, 0.12, 0.15), Vector3(0.72, 0.026, 0.05), metal_dark)
	_paw_insignia(-1.02, 0.10, -0.21, paw_mat)
	_paw_insignia(1.02, 0.10, -0.21, paw_mat)

	# Tail surfaces and vertical fin are separate named components for future production reuse.
	_sphere("TailBoom", Vector3(0, 0.02, 1.18), metal, Vector3(0.31, 0.27, 0.74))
	_box("Tailplane", Vector3(0, 0.02, 1.42), Vector3(1.38, 0.13, 0.38), metal)
	_sphere("TailTip_Red_L", Vector3(-0.58, 0.02, 1.42), red_metal, Vector3(0.18, 0.12, 0.25))
	_sphere("TailTip_Red_R", Vector3(0.58, 0.02, 1.42), red_metal, Vector3(0.18, 0.12, 0.25))
	_sphere("VerticalTail", Vector3(0, 0.37, 1.38), red_metal, Vector3(0.14, 0.64, 0.43))
	_box("VerticalTail_Stripe", Vector3(0, 0.76, 1.39), Vector3(0.10, 0.035, 0.36), cream_mat)

	# Fixed propeller assembly: mechanical hub plus intentionally simple alpha spinning-disc placeholder.
	_cylinder("Propeller_Hub", Vector3(0, 0.0, -2.04), 0.24, 0.34, metal_dark, Vector3(deg_to_rad(90), 0, 0))
	_cylinder("Propeller_Cap", Vector3(0, 0.0, -2.22), 0.14, 0.12, red_dark, Vector3(deg_to_rad(90), 0, 0))
	_cylinder("Propeller_BlurDisc", Vector3(0, 0.0, -2.29), 0.77, 0.018, _mat(Color(0.82, 0.90, 0.96, 0.23), 0.0, 0.1, true), Vector3(deg_to_rad(90), 0, 0))

	# Major weapon mounts only.  Small surface details stay material/colour based.
	for x in [-0.76, 0.76]:
		_cylinder("GunBarrel", Vector3(x, 0.11, -0.67), 0.055, 0.48, metal_dark, Vector3(deg_to_rad(90), 0, 0))

	# Cockpit, visible seat / upper body, then the intentionally oversized orange tabby head.
	_sphere("CockpitCanopy", Vector3(0, 0.28, 0.25), cockpit_mat, Vector3(0.49, 0.24, 0.66))
	_box("Seat", Vector3(0, 0.33, 0.57), Vector3(0.52, 0.34, 0.30), metal_dark, Vector3(deg_to_rad(-18), 0, 0))
	_sphere("Pilot_UpperBody", Vector3(0, 0.52, 0.48), orange_mat, Vector3(0.38, 0.34, 0.34))
	_sphere("Pilot_BigHead", Vector3(0, 0.80, 0.39), orange_mat, Vector3(0.73, 0.50, 0.67))
	# Ears project cleanly at gameplay size; stripes are fixed to the head and not pose assets.
	var ear_mesh := CylinderMesh.new()
	ear_mesh.top_radius = 0.02
	ear_mesh.bottom_radius = 0.23
	ear_mesh.height = 0.52
	ear_mesh.radial_segments = 4
	for x in [-0.43, 0.43]:
		_part("Pilot_Ear", ear_mesh, Vector3(x, 1.19, 0.42), orange_mat, Vector3.ONE, Vector3(0, 0, deg_to_rad(-13.0 if x < 0 else 13.0)))
		_sphere("Ear_Inner", Vector3(x, 1.16, 0.33), cream_mat, Vector3(0.09, 0.035, 0.14))
	for x in [-0.28, 0.0, 0.28]:
		_box("Tabby_HeadStripe", Vector3(x, 1.27, 0.48), Vector3(0.072, 0.022, 0.34), tabby_mat)
	_box("Tabby_NapeStripe", Vector3(0, 1.11, 0.78), Vector3(0.46, 0.02, 0.065), tabby_mat)
	# Approved design includes a visible tail, kept as one simple, readable curved rear accent.
	_sphere("Pilot_Tail_Base", Vector3(0.34, 0.44, 0.92), orange_mat, Vector3(0.13, 0.13, 0.42))
	_sphere("Pilot_Tail_Tip", Vector3(0.51, 0.59, 1.13), tabby_mat, Vector3(0.10, 0.10, 0.20))
