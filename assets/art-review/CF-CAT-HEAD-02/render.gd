extends SceneTree
func _init() -> void:
	call_deferred("run")
func run() -> void:
	var vp := SubViewport.new()
	vp.size = Vector2i(640,640)
	vp.transparent_bg = true
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	vp.msaa_3d = Viewport.MSAA_4X
	root.add_child(vp)
	var world := Node3D.new()
	vp.add_child(world)
	var env := WorldEnvironment.new()
	env.environment = Environment.new()
	env.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.environment.ambient_light_color = Color("c9d3df")
	env.environment.ambient_light_energy = 0.65
	world.add_child(env)
	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-35,-35,0)
	key.light_energy = 0.85
	world.add_child(key)
	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-25,145,0)
	fill.light_energy = 0.75
	world.add_child(fill)
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 2.15
	world.add_child(camera)
	var head: Node3D = load("res://head.gd").new()
	head.build()
	world.add_child(head)
	head.save_scene("res://head-neutral.tscn")
	var poses := {"front":Vector3(0,0,-4),"three-quarter":Vector3(3,0.4,-4),"side":Vector3(4,0,0),"back":Vector3(0,0,4),"top-back":Vector3(0,4,2)}
	for label in poses:
		camera.position = poses[label]+Vector3(0,0.12,0)
		camera.look_at(Vector3(0,0.12,0))
		await capture(vp,label)
	head.queue_free()
	await process_frame
	head = load("res://head.gd").new()
	head.build(true)
	world.add_child(head)
	head.save_scene("res://head-hurt.tscn")
	for label in ["front","side","back"]:
		camera.position = poses[label]+Vector3(0,0.12,0)
		camera.look_at(Vector3(0,0.12,0))
		await capture(vp,"hurt-"+label)
	head.queue_free()
	await process_frame
	var plane: Node3D = load("res://aircraft_baseline.gd").new()
	world.add_child(plane)
	for child in plane.get_children():
		if str(child.get_meta("part_label","")).begins_with("Tabby") or str(child.get_meta("part_label","")).begins_with("PaintedCrown") or str(child.get_meta("part_label","")).begins_with("SideTabby") or str(child.get_meta("part_label","")).begins_with("Whisker"):
			child.queue_free()
	head = load("res://head.gd").new()
	head.build()
	head.position = Vector3(0,1.02,-0.52)
	head.scale = Vector3(0.94,0.85,1.10)
	plane.add_child(head)
	plane.scale = Vector3(1,1,1.12)
	camera.size = 5.7
	camera.position = Vector3(0,8,3.6)
	camera.look_at(Vector3.ZERO)
	await capture(vp,"cockpit-fit")
	quit()
func capture(vp: SubViewport, label: String) -> void:
	await process_frame
	await process_frame
	await RenderingServer.frame_post_draw
	var img := vp.get_texture().get_image()
	assert(img.save_png("res://"+label+".png") == OK)
	var bounds := img.get_used_rect()
	assert(bounds.position.x > 0 and bounds.position.y > 0 and bounds.end.x < 640 and bounds.end.y < 640)
	print("PASS ",label," ",bounds)
