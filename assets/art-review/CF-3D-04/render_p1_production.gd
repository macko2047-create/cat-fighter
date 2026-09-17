extends SceneTree

const OUTPUT := "res://"
const SIZE := Vector2i(512, 512)
const GAMEPLAY_SIZE := Vector2i(72, 72)
const MASTER_SCRIPT := preload("res://p1_production_master.gd")

const POSES := [
	{"file": "p1-normal.png", "label": "NORMAL", "roll": 0.0, "pitch": 0.0},
	{"file": "p1-roll-left.png", "label": "ROLL LEFT -28°", "roll": -28.0, "pitch": 0.0},
	{"file": "p1-roll-right.png", "label": "ROLL RIGHT +28°", "roll": 28.0, "pitch": 0.0},
	{"file": "p1-pitch-up.png", "label": "PITCH UP +10°", "roll": 0.0, "pitch": 10.0},
	{"file": "p1-pitch-down.png", "label": "PITCH DOWN -10°", "roll": 0.0, "pitch": -10.0},
]

func _init() -> void:
	call_deferred("_build_and_render")

func _add_locked_camera_and_light(world: Node3D) -> void:
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
	key.name = "Locked_UpperRight_Key"
	key.rotation_degrees = Vector3(-52, 36, 0)
	key.light_color = Color("fff1d4")
	key.light_energy = 2.0
	key.shadow_enabled = true
	world.add_child(key)
	var camera := Camera3D.new()
	camera.name = "Locked_Orthographic_Camera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 5.5
	camera.position = Vector3(0, 6.8, 4.8)
	world.add_child(camera)
	camera.look_at(Vector3.ZERO, Vector3.UP)

func _render_pose(viewport: SubViewport, model: Node3D, pose: Dictionary) -> void:
	# Only longitudinal Z roll and lateral X pitch change. Yaw remains locked at zero.
	model.rotation = Vector3(deg_to_rad(pose.pitch), 0.0, deg_to_rad(pose.roll))
	await process_frame
	await process_frame
	var output_path: String = OUTPUT + pose["file"]
	var error := viewport.get_texture().get_image().save_png(output_path)
	print("capture ", output_path, " error=", error)

func _build_review_sheet() -> void:
	var sheet := Image.create(1536, 1024, false, Image.FORMAT_RGBA8)
	sheet.fill(Color("16202a"))
	for index in range(POSES.size()):
		var image := Image.load_from_file(OUTPUT + POSES[index].file)
		var destination := Vector2i((index % 3) * 512, (index / 3) * 512)
		sheet.blend_rect(image, Rect2i(Vector2i.ZERO, SIZE), destination)
	sheet.save_png(OUTPUT + "p1-production-review.png")

func _build_gameplay_preview() -> void:
	var preview := Image.create(360, 72, false, Image.FORMAT_RGBA8)
	preview.fill(Color("2a627e")) # neutral sea-like contrast check; production assets remain transparent.
	for index in range(POSES.size()):
		var image := Image.load_from_file(OUTPUT + POSES[index].file)
		image.resize(GAMEPLAY_SIZE.x, GAMEPLAY_SIZE.y, Image.INTERPOLATE_LANCZOS)
		preview.blend_rect(image, Rect2i(Vector2i.ZERO, GAMEPLAY_SIZE), Vector2i(index * 72, 0))
	preview.save_png(OUTPUT + "p1-gameplay-size-preview.png")

func _build_and_render() -> void:
	var viewport := SubViewport.new()
	viewport.size = SIZE
	viewport.transparent_bg = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	var world := Node3D.new()
	viewport.add_child(world)
	_add_locked_camera_and_light(world)
	# Exactly one shared production master is built and reused sequentially for every capture.
	var model: Node3D = MASTER_SCRIPT.new()
	world.add_child(model)
	for pose in POSES:
		await _render_pose(viewport, model, pose)
	_build_review_sheet()
	_build_gameplay_preview()
	quit()
