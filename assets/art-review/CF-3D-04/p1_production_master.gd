class_name P1ProductionMaster
extends Node3D

# CF-3D-04 visual-fidelity source. Nose is local -Z; root pivot remains (0, 0, 0).

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
	var metal := _mat(SILVER, 0.55, 0.36)
	var metal_dark := _mat(SILVER_DARK, 0.48, 0.39)
	var red_metal := _mat(RED, 0.20, 0.37)
	var red_dark := _mat(RED_DARK, 0.18, 0.43)
	var cockpit_mat := _mat(COCKPIT, 0.36, 0.11)
	var orange_mat := _mat(ORANGE, 0.0, 0.60)
	var tabby_mat := _mat(TABBY, 0.0, 0.67)
	var cream_mat := _mat(CREAM, 0.0, 0.66)
	var paw_mat := _mat(PAW, 0.0, 0.47)

	# Layered ellipsoids create a compact, nose-to-tail tapered WWII fuselage rather than a blockout.
	_sphere("Fuselage_Core", Vector3(0, 0.02, 0.02), metal, Vector3(0.58, 0.46, 1.52))
	_sphere("Fuselage_ForwardBlend", Vector3(0, 0.00, -0.78), metal, Vector3(0.52, 0.41, 0.82))
	_sphere("Engine_Cowl", Vector3(0, 0.00, -1.46), red_metal, Vector3(0.48, 0.42, 0.52))
	_sphere("Cowling_Ring", Vector3(0, 0.00, -1.77), metal_dark, Vector3(0.38, 0.34, 0.19))
	_sphere("Nose_Cone", Vector3(0, 0.00, -1.96), red_dark, Vector3(0.20, 0.18, 0.15))
	_sphere("Fuselage_RedBand", Vector3(0, 0.02, -0.86), red_metal, Vector3(0.57, 0.43, 0.14))

	# Broad swept, rounded wing halves: thick ellipses taper into the body and avoid rectangular planforms.
	_sphere("MainWing_L", Vector3(-0.92, 0.00, -0.05), metal, Vector3(1.16, 0.19, 0.43))
	_sphere("MainWing_R", Vector3(0.92, 0.00, -0.05), metal, Vector3(1.16, 0.19, 0.43))
	_sphere("WingRootBlend_L", Vector3(-0.36, 0.05, -0.01), metal, Vector3(0.56, 0.28, 0.48))
	_sphere("WingRootBlend_R", Vector3(0.36, 0.05, -0.01), metal, Vector3(0.56, 0.28, 0.48))
	# Overset into the silver wing halves so red tips read as painted caps, not detached spheres.
	_sphere("WingTip_Red_L", Vector3(-1.22, 0.0, -0.05), red_metal, Vector3(0.46, 0.19, 0.32))
	_sphere("WingTip_Red_R", Vector3(1.22, 0.0, -0.05), red_metal, Vector3(0.46, 0.19, 0.32))
	_box("Aileron_Line_L", Vector3(-1.12, 0.185, 0.09), Vector3(0.66, 0.020, 0.045), metal_dark)
	_box("Aileron_Line_R", Vector3(1.12, 0.185, 0.09), Vector3(0.66, 0.020, 0.045), metal_dark)
	_paw_insignia(-1.04, 0.16, -0.18, paw_mat)
	_paw_insignia(1.04, 0.16, -0.18, paw_mat)

	# A tapered rear boom, elliptical tailplane and rounded fin replace the previous flat tail blocks.
	_sphere("TailBoom", Vector3(0, 0.03, 1.19), metal, Vector3(0.34, 0.30, 0.83))
	_sphere("Tailplane", Vector3(0, 0.03, 1.45), metal, Vector3(1.12, 0.14, 0.30))
	_sphere("Tailplane_RedRoot", Vector3(0, 0.08, 1.45), red_metal, Vector3(0.26, 0.12, 0.25))
	_sphere("VerticalTail", Vector3(0, 0.40, 1.37), red_metal, Vector3(0.16, 0.64, 0.41))
	_box("VerticalTail_Stripe", Vector3(0, 0.78, 1.37), Vector3(0.09, 0.026, 0.31), cream_mat)

	# The propeller is visually nested into the cowling: small restrained blur disc, hub and cap share one nose axis.
	_cylinder("Propeller_Hub", Vector3(0, 0.0, -2.08), 0.20, 0.26, metal_dark, Vector3(deg_to_rad(90), 0, 0))
	_cylinder("Propeller_Cap", Vector3(0, 0.0, -2.23), 0.12, 0.11, red_dark, Vector3(deg_to_rad(90), 0, 0))
	_cylinder("Propeller_BlurDisc", Vector3(0, 0.0, -2.28), 0.64, 0.016, _mat(Color(0.82, 0.90, 0.96, 0.18), 0.0, 0.1, true), Vector3(deg_to_rad(90), 0, 0))

	# Integrated, deliberately secondary wing-root weapon mounts.
	for x in [-0.72, 0.72]:
		_sphere("GunFairing", Vector3(x, 0.08, -0.50), metal_dark, Vector3(0.11, 0.09, 0.20))
		_cylinder("GunBarrel", Vector3(x, 0.09, -0.72), 0.042, 0.32, metal_dark, Vector3(deg_to_rad(90), 0, 0))

	# Recessed cockpit rim and seat visibly cradle the pilot rather than leaving the cat on a flat surface.
	_sphere("Cockpit_Rim", Vector3(0, 0.30, 0.31), metal_dark, Vector3(0.56, 0.20, 0.67))
	_sphere("Cockpit_Interior", Vector3(0, 0.39, 0.34), cockpit_mat, Vector3(0.47, 0.17, 0.56))
	_sphere("Seat_Back", Vector3(0, 0.48, 0.63), metal_dark, Vector3(0.34, 0.33, 0.34))
	_sphere("Pilot_UpperBody", Vector3(0, 0.61, 0.46), orange_mat, Vector3(0.36, 0.31, 0.32))
	_sphere("Pilot_Scarf", Vector3(0, 0.78, 0.57), cream_mat, Vector3(0.43, 0.07, 0.12))
	_sphere("Pilot_BigHead", Vector3(0, 0.91, 0.39), orange_mat, Vector3(0.76, 0.54, 0.69))
	# Ears project cleanly at gameplay size; tabby stripes are fixed material-like markings on the rear head.
	var ear_mesh := CylinderMesh.new()
	ear_mesh.top_radius = 0.02
	ear_mesh.bottom_radius = 0.23
	ear_mesh.height = 0.52
	ear_mesh.radial_segments = 4
	for x in [-0.43, 0.43]:
		_part("Pilot_Ear", ear_mesh, Vector3(x, 1.34, 0.42), orange_mat, Vector3.ONE, Vector3(0, 0, deg_to_rad(-13.0 if x < 0 else 13.0)))
		_sphere("Ear_Inner", Vector3(x, 1.29, 0.32), cream_mat, Vector3(0.09, 0.035, 0.14))
	for x in [-0.28, 0.0, 0.28]:
		_box("Tabby_HeadStripe", Vector3(x, 1.40, 0.47), Vector3(0.072, 0.022, 0.34), tabby_mat)
	_box("Tabby_NapeStripe", Vector3(0, 1.20, 0.80), Vector3(0.48, 0.02, 0.065), tabby_mat)
	# Approved design includes a visible tail, kept as one simple, readable curved rear accent.
	_sphere("Pilot_Tail_Base", Vector3(0.35, 0.48, 0.93), orange_mat, Vector3(0.12, 0.12, 0.39))
	_sphere("Pilot_Tail_Tip", Vector3(0.50, 0.60, 1.12), tabby_mat, Vector3(0.09, 0.09, 0.18))
