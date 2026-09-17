extends Node3D

var model: Node3D
var camera: Camera3D
var angle := 0.0
var elevation := 1.148

func _ready() -> void:
	model = load("res://p1_master.tscn").instantiate()
	add_child(model)
	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-52,36,0)
	key.light_color = Color("fff1d4")
	key.light_energy = 0.95
	key.shadow_enabled = true
	add_child(key)
	var env := WorldEnvironment.new()
	env.environment = Environment.new()
	env.environment.background_mode = Environment.BG_COLOR
	env.environment.background_color = Color("16202a")
	env.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.environment.ambient_light_color = Color("6f8293")
	env.environment.ambient_light_energy = 0.45
	add_child(env)
	camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 5.7
	add_child(camera)
	_update_camera()
	var ui := Label.new()
	ui.text = "1 Normal | 2 Roll Left | 3 Roll Right | 4 Pitch Up | 5 Pitch Down\nDrag: orbit | Wheel: zoom | R: reset camera"
	ui.position = Vector2(16,16)
	add_child(ui)

func _update_camera() -> void:
	camera.position = Vector3(sin(angle)*cos(elevation),sin(elevation),cos(angle)*cos(elevation))*8.77
	camera.look_at(Vector3.ZERO)

func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		var poses := {KEY_1:Vector3.ZERO,KEY_2:Vector3(0,0,-28),KEY_3:Vector3(0,0,28),KEY_4:Vector3(10,0,0),KEY_5:Vector3(-10,0,0)}
		if poses.has(event.keycode):
			model.rotation_degrees = poses[event.keycode]
		if event.keycode == KEY_R:
			angle = 0.0
			elevation = 1.148
			camera.size = 5.7
			_update_camera()
	if event is InputEventMouseMotion and event.button_mask & MOUSE_BUTTON_MASK_LEFT:
		angle -= event.relative.x*0.008
		elevation = clampf(elevation+event.relative.y*0.008,-1.4,1.5)
		_update_camera()
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			camera.size = maxf(2.0,camera.size-0.3)
		if event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			camera.size = minf(10.0,camera.size+0.3)
