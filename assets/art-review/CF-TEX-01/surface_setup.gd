extends RefCounted

var maps := {}
var assignment_log := []

func texture_map(id: String) -> Texture2D:
	if not maps.has(id):
		var img := Image.new()
		var error := img.load_svg_from_string(FileAccess.get_file_as_string("res://textures/"+id+".svg"))
		assert(error == OK,"Texture rasterization failed")
		assert(img.save_png("res://textures/"+id+".png") == OK)
		img.generate_mipmaps()
		maps[id] = ImageTexture.create_from_image(img)
	return maps[id]

func mapped(n: MeshInstance3D, id: String, rect: Vector4, metallic: float, roughness: float, mirror := false, projection := 0) -> void:
	var m := ShaderMaterial.new()
	m.shader = load("res://materials/surface.gdshader")
	m.set_shader_parameter("surface_map",texture_map(id))
	m.set_shader_parameter("part_to_model",Projection(n.transform))
	m.set_shader_parameter("uv_rect",rect)
	m.set_shader_parameter("mirror_x",mirror)
	m.set_shader_parameter("projection",projection)
	m.set_shader_parameter("metalness",metallic)
	m.set_shader_parameter("roughness_base",roughness)
	m.resource_name = "CF_TEX_01_"+id
	n.material_override = m
	assignment_log.append({"label":n.get_meta("surface_label"),"texture":id,"mapping_rect":[rect.x,rect.y,rect.z,rect.w],"projection":projection,"mirror_x":mirror})

func solid(n: MeshInstance3D, color: String, metallic: float, roughness: float) -> void:
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(color)
	m.metallic = metallic
	m.roughness = roughness
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	n.material_override = m

func apply_to(model: Node3D) -> void:
	for n: MeshInstance3D in model.get_children():
		var label: String = n.get_meta("surface_label")
		match label:
			"MainWing": mapped(n,"wing-metal",Vector4(0,-0.6,2.4,1.5),0.42,0.40,true)
			"ContinuousFuselage": mapped(n,"fuselage-metal",Vector4(-0.65,-2.1,1.3,4.2),0.40,0.41)
			"Tailplane": mapped(n,"tailplane-metal",Vector4(0,1.3,1.15,0.8),0.42,0.43,true)
			"RedEngineCowl": mapped(n,"red-enamel",Vector4(-0.38,-2.3,0.76,0.72),0.23,0.32)
			"RedWingCap": mapped(n,"red-enamel",Vector4(2.1,-0.2,0.25,0.55),0.23,0.34,true)
			"RedTailCap": mapped(n,"red-enamel",Vector4(0.94,1.56,0.19,0.40),0.23,0.34,true)
			"TabbyHead","PaintedCrownStripe","SideTabbyMark": mapped(n,"tabby-head",Vector4(-0.72,-1.1,1.44,1.18),0.0,0.88)
			"TabbyEar": mapped(n,"ear-fur",Vector4(-0.75,-1.13,1.5,0.39),0.0,0.88)
			"StripedTail": mapped(n,"tabby-tail",Vector4(-0.16,0.88,0.32,1.10),0.0,0.88)
			"WingInsigniaRoundel","WingInsigniaPad","WingInsigniaToe":
				var center_x: float = -1.3 if n.position.x < 0 else 1.3
				mapped(n,"paw-roundel",Vector4(center_x-0.24,0.04-0.24,0.48,0.48),0.03,0.68)
			"FuselageInsigniaRoundel","FuselageInsigniaPad","FuselageInsigniaToe": mapped(n,"paw-roundel",Vector4(-0.24,0.34,0.48,0.48),0.03,0.68)
			"WingInsigniaBarBorder": solid(n,"10284c",0.03,0.68)
			"WingInsigniaBarWhite": solid(n,"f7f5ec",0.03,0.68)
			"WingInsigniaBarRed": solid(n,"c91c27",0.08,0.60)
			"RearCockpitGlass": mapped(n,"smoked-glass",Vector4(0,0,1,1),0.20,0.26,false,2)
			"PilotJacket","CockpitLeather": mapped(n,"pilot-leather",Vector4(0,0,1,1),0.0,0.80,false,2)
			"CockpitCoaming","WindscreenFrame": solid(n,"403329",0.18,0.53)
			"CockpitWell": solid(n,"1c2937",0.05,0.75)
			"WingPanelSeam","RearPanelEdge","CowlingPanelRing": solid(n,"667481",0.24,0.56)
			"WingRivet","CowlingRivet","RearRivet": solid(n,"adb7bf",0.30,0.50)
			"GunBarrel","PropellerShaft": solid(n,"34434c",0.55,0.39)
			"GunCollar": solid(n,"ce9d38",0.30,0.43)
			"GunMuzzle": solid(n,"15212a",0.1,0.74)
			"Whisker": solid(n,"ba731d",0.0,0.9)
			"PropellerHub": solid(n,"c0cbd3",0.55,0.34)
			"TransparentPropDisc":
				var m := ShaderMaterial.new()
				m.shader = load("res://materials/propeller.gdshader")
				m.set_shader_parameter("part_to_model",Projection(n.transform))
				n.material_override = m
			"PropellerMotionArc":
				var m := StandardMaterial3D.new()
				m.albedo_color = Color(0.79,0.84,0.87,0.32)
				m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
				m.roughness = 0.6
				n.material_override = m
			_: assert(false,"Unclassified baseline geometry: "+label)
	var f := FileAccess.open("res://material-assignments.json",FileAccess.WRITE)
	f.store_string(JSON.stringify(assignment_log,"  "))
