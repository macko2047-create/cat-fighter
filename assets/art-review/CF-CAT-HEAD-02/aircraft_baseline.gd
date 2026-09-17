class_name P1ProductionMaster
extends Node3D

# Dimensions are explicit radii, not implicit Godot primitive defaults.
# Forward = -Z; vertical = +Y. Every visible detail belongs to this one master.
var silver: Material
var dark: Material
var red: Material
var orange: Material
var stripe: Material
var navy: Material
var white: Material

func mat(hex: String, metal := 0.0, rough := 0.65) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(hex)
	m.metallic = metal
	m.roughness = rough
	m.diffuse_mode = BaseMaterial3D.DIFFUSE_BURLEY
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	return m

func part(label: String, mesh: Mesh, material: Material, p := Vector3.ZERO) -> MeshInstance3D:
	var n := MeshInstance3D.new()
	n.name = label
	n.set_meta("part_label",label)
	n.mesh = mesh
	n.material_override = material
	n.position = p
	add_child(n)
	return n

func oval(label: String, p: Vector3, radius: Vector3, material: Material) -> void:
	var s := SphereMesh.new()
	s.radius = 1.0
	s.height = 2.0
	s.radial_segments = 48
	s.rings = 24
	part(label, s, material, p).scale = radius

func tube(label: String, points: Array, radius: float, material: Material) -> void:
	for i in range(points.size()-1):
		var a: Vector3 = points[i]
		var b: Vector3 = points[i+1]
		var c := CylinderMesh.new()
		c.top_radius = radius
		c.bottom_radius = radius
		c.height = a.distance_to(b)
		c.radial_segments = 10
		var n := part(label, c, material, (a+b)/2.0)
		var up := (b-a).normalized()
		var tangent := up.cross(Vector3.RIGHT).normalized()
		if tangent.length() < 0.1:
			tangent = up.cross(Vector3.FORWARD).normalized()
		n.basis = Basis(tangent, up, tangent.cross(up)).orthonormalized()

func surface(label: String, rings: Array, material: Material, flip := false) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var count: int = rings[0].size()
	for i in range(rings.size()-1):
		for j in range(count):
			var k := (j+1)%count
			var indices := [Vector2i(i,j),Vector2i(i+1,j),Vector2i(i+1,k),Vector2i(i,j),Vector2i(i+1,k),Vector2i(i,k)]
			if not flip:
				indices.reverse()
			for index in indices:
				var r: int = index.x
				var q: int = index.y
				var longitudinal: Vector3 = rings[mini(r+1,rings.size()-1)][q]-rings[maxi(r-1,0)][q]
				var radial: Vector3 = rings[r][(q+1)%count]-rings[r][(q-1+count)%count]
				var normal := longitudinal.cross(radial).normalized()
				st.set_normal(-normal if flip else normal)
				st.add_vertex(rings[r][q])
	part(label, st.commit(), material)

# Continuous elliptical cross sections: z, width radius, height radius, y center.
func hull(label: String, sections: Array, material: Material) -> void:
	var rings := []
	for s in sections:
		var ring := []
		for j in range(64):
			var a := TAU*j/64.0
			ring.append(Vector3(cos(a)*s[1], s[3]+sin(a)*s[2], s[0]))
		rings.append(ring)
	surface(label, rings, material, true)

# Swept airfoil sections: span, leading edge, trailing edge, half thickness.
func wing(label: String, side: float, sections: Array, material: Material) -> void:
	var rings := []
	for s in sections:
		var ring := []
		for j in range(48):
			var a := TAU*j/48.0
			ring.append(Vector3(side*s[0], -0.06+sin(a)*s[3], (s[1]+s[2])/2.0+cos(a)*(s[2]-s[1])/2.0))
		rings.append(ring)
	surface(label, rings, material, side < 0)

func badge(label: String, p: Vector3, r: float, bars := false) -> void:
	if bars:
		var b := BoxMesh.new()
		b.size = Vector3(r*4.1, 0.015, r*0.62)
		part(label+"BarBorder", b, navy, p)
		var w := BoxMesh.new()
		w.size = Vector3(r*3.9, 0.018, r*0.48)
		part(label+"BarWhite", w, white, p+Vector3(0,0.009,0))
		var rr := BoxMesh.new()
		rr.size = Vector3(r*3.9,0.019,r*0.16)
		part(label+"BarRed", rr, red, p+Vector3(0,0.02,0))
	oval(label+"Roundel",p+Vector3(0,0.024,0),Vector3(r,0.025,r),navy)
	oval(label+"Pad",p+Vector3(0,0.054,r*0.19),Vector3(r*0.43,0.009,r*0.34),white)
	for d in [Vector2(-0.54,-0.13),Vector2(-0.21,-0.50),Vector2(0.21,-0.50),Vector2(0.54,-0.13)]:
		oval(label+"Toe",p+Vector3(d.x*r,0.054,d.y*r),Vector3(r*0.15,0.009,r*0.22),white)

func ear(side: float) -> void:
	var rings := []
	for s in [[0.0,0.25,0.17],[0.22,0.20,0.12],[0.43,0.11,0.055],[0.53,0.008,0.008]]:
		var ring := []
		for j in range(32):
			var a := TAU*j/32.0
			ring.append(Vector3(side*(0.43+s[0]*0.25)+cos(a)*s[1],1.12+s[0],-0.94+sin(a)*s[2]))
		rings.append(ring)
	surface("TabbyEar",rings,orange)

func _init() -> void:
	name = "P1_Reference_Reconstruction"
	silver = mat("a5adb4",0.35,0.48)
	dark = mat("263443")
	red = mat("cf161f",0.2,0.40)
	orange = mat("f6a024")
	stripe = mat("c05a15")
	navy = mat("102a4c")
	white = mat("f4f3e9")
	var leather := mat("613a29")
	hull("ContinuousFuselage",[[-1.94,0.18,0.17,0.0],[-1.60,0.34,0.31,0.0],[-1.04,0.46,0.37,0.0],[-0.30,0.59,0.39,0.0],[0.35,0.57,0.36,0.0],[0.85,0.43,0.29,0.0],[1.4,0.24,0.19,0.0],[1.94,0.045,0.065,0.0],[2.04,0.001,0.001,0.0]],silver)
	hull("RedEngineCowl",[[-2.28,0.001,0.001,0.0],[-2.17,0.13,0.14,0.0],[-1.95,0.25,0.23,0.0],[-1.73,0.325,0.29,0.0],[-1.60,0.34,0.31,0.0]],red)
	for side in [-1.0,1.0]:
		wing("MainWing",side,[[0.28,-0.54,0.86,0.12],[0.60,-0.53,0.84,0.13],[1.25,-0.39,0.63,0.10],[1.94,-0.24,0.40,0.065],[2.12,-0.18,0.32,0.045]],silver)
		wing("RedWingCap",side,[[2.10,-0.18,0.32,0.047],[2.24,-0.12,0.26,0.04],[2.32,0.015,0.14,0.018],[2.335,0.08,0.085,0.001]],red)
		wing("Tailplane",side,[[0.08,1.36,1.98,0.075],[0.70,1.48,1.99,0.055],[0.96,1.57,1.96,0.04]],silver)
		wing("RedTailCap",side,[[0.94,1.57,1.96,0.042],[1.08,1.63,1.9,0.03],[1.12,1.76,1.77,0.001]],red)
		badge("WingInsignia",Vector3(side*1.30,0.052,0.04),0.24,true)
		for z in [-0.16,0.36]:
			tube("WingPanelSeam",[Vector3(side*0.66,0.071,z),Vector3(side*1.25,0.047,z*0.85),Vector3(side*2.06,-0.01,z*0.64+0.04)],0.009,dark)
		for x in [0.72,1.03,1.34,1.65,1.94]:
			oval("WingRivet",Vector3(side*x,0.058,-0.25+x*0.065),Vector3(0.014,0.01,0.014),dark)
		var gun_x: float = side*0.88
		tube("GunBarrel",[Vector3(gun_x,0.055,-0.39),Vector3(gun_x,0.055,-1.0)],0.067,dark)
		tube("GunCollar",[Vector3(gun_x,0.055,-0.81),Vector3(gun_x,0.055,-0.86)],0.075,mat("d4a52c",0.3))
		oval("GunMuzzle",Vector3(gun_x,0.055,-1.005),Vector3(0.044,0.044,0.006),mat("090d14"))
	# Cockpit coaming, well, seat and curved rear windscreen.
	oval("CockpitCoaming",Vector3(0,0.35,-0.29),Vector3(0.525,0.11,0.68),dark)
	oval("CockpitLeather",Vector3(0,0.42,-0.27),Vector3(0.465,0.075,0.60),leather)
	oval("CockpitWell",Vector3(0,0.465,-0.30),Vector3(0.395,0.028,0.50),dark)
	oval("PilotJacket",Vector3(0,0.61,-0.30),Vector3(0.34,0.27,0.30),leather)
	oval("TabbyHead",Vector3(0,0.96,-0.52),Vector3(0.64,0.42,0.53),orange)
	ear(-1.0)
	ear(1.0)
	# Painted ribbons sample the actual ellipsoid surface; no raised stripe rods.
	for x in [-0.24,0.0,0.24]:
		head_mark(x,-0.86,-0.20,0.060)
	for side in [-1.0,1.0]:
		for z in [-0.48,-0.25]:
			var pts := []
			for j in range(18):
				var x: float = side*(0.33+j*0.015)
				pts.append(head_point(x,z))
			tube("SideTabbyMark",pts,0.013,stripe)
		for i in range(3):
			tube("Whisker",[Vector3(side*0.58,1.0,-0.27+i*0.10),Vector3(side*0.70,1.01,-0.30+i*0.13),Vector3(side*0.78,1.02,-0.29+i*0.15)],0.004,stripe)
	# Engine panel seams follow its elliptical metal collar.
	for z in [-1.59,-1.18]:
		var pts := []
		var rx: float = 0.345 if z < -1.5 else 0.435
		var ry: float = 0.315 if z < -1.5 else 0.365
		for i in range(49):
			var a := PI*i/48.0
			pts.append(Vector3(cos(a)*rx,sin(a)*ry+0.004,z))
		tube("CowlingPanelRing",pts,0.010,dark)
		for i in range(1,12):
			var a := PI*i/12.0
			oval("CowlingRivet",Vector3(cos(a)*rx,sin(a)*ry+0.008,z+0.03),Vector3(0.012,0.012,0.012),dark)
	for side in [-1.0,1.0]:
		tube("RearPanelEdge",[Vector3(side*0.45,0.235,0.36),Vector3(side*0.33,0.207,0.87),Vector3(side*0.16,0.155,1.4),Vector3(side*0.045,0.074,1.82)],0.009,dark)
		for i in range(9):
			var t := i/8.0
			oval("RearRivet",Vector3(side*lerpf(0.43,0.06,t),lerpf(0.249,0.097,t),lerpf(0.4,1.75,t)),Vector3(0.012,0.009,0.012),dark)
	var glass := mat("33495b",0.35,0.19)
	oval("RearCockpitGlass",Vector3(0,0.52,0.12),Vector3(0.33,0.17,0.19),glass)
	var frame := []
	for i in range(33):
		var a := PI*i/32.0
		frame.append(Vector3(cos(a)*0.335,0.52+sin(a)*0.172,0.14))
	tube("WindscreenFrame",frame,0.019,leather)
	# Tail follows rear fuselage; alternating ring materials remain attached in every pose.
	var tail_rings := []
	for i in range(41):
		var t := i/40.0
		var ring := []
		var radius: float = 0.145*pow(sin(PI*clampf(t,0.002,0.998)),0.32)
		for j in range(32):
			var a := TAU*j/32.0
			ring.append(Vector3(cos(a)*radius,0.36-0.19*t+sin(a)*radius,0.88+t*1.10))
		tail_rings.append(ring)
	for i in range(40):
		surface("StripedTail",[tail_rings[i],tail_rings[i+1]],stripe if i%9 < 3 else orange, true)
	badge("FuselageInsignia",Vector3(0,0.348,0.58),0.24)
	tube("PropellerShaft",[Vector3(0,0,-2.22),Vector3(0,0,-2.40)],0.055,dark)
	oval("PropellerHub",Vector3(0,0,-2.38),Vector3(0.09,0.09,0.08),silver)
	var blur := mat("d5e2eb")
	blur.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	blur.albedo_color.a = 0.16
	blur.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	var disc := CylinderMesh.new()
	disc.top_radius = 0.83
	disc.bottom_radius = 0.83
	disc.height = 0.006
	disc.radial_segments = 96
	part("TransparentPropDisc",disc,blur,Vector3(0,0,-2.37)).rotation.x = PI/2.0
	for start in [0.1,2.7,4.4]:
		var points := []
		for j in range(32):
			var a: float = start+j*0.044
			points.append(Vector3(cos(a)*0.80,sin(a)*0.80,-2.38))
		tube("PropellerMotionArc",points,0.009,white)

func head_point(x: float, z: float) -> Vector3:
	return Vector3(x,0.96+0.42*sqrt(maxf(0.0,1.0-pow(x/0.64,2)-pow((z+0.52)/0.53,2)))+0.002,z)

func head_mark(x: float, z0: float, z1: float, width: float) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in range(31):
		var t0 := i/31.0
		var t1 := (i+1)/31.0
		var w0: float = width*pow(sin(PI*clampf(t0,0.001,0.999)),0.35)
		var w1: float = width*pow(sin(PI*clampf(t1,0.001,0.999)),0.35)
		var a := head_point(x-w0,lerpf(z0,z1,t0))
		var b := head_point(x+w0,lerpf(z0,z1,t0))
		var c := head_point(x-w1,lerpf(z0,z1,t1))
		var d := head_point(x+w1,lerpf(z0,z1,t1))
		for v in [a,b,c,b,d,c]:
			st.set_normal(Vector3(v.x/0.4096,(v.y-0.96)/0.1764,(v.z+0.52)/0.2809).normalized())
			st.add_vertex(v)
	part("PaintedCrownStripe",st.commit(),stripe)
