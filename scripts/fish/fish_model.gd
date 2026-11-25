class_name FishModel
extends RefCounted
## Gera o modelo 3D procedural de uma espécie (corpo em loft, nadadeiras, olhos).
## O modelo tem comprimento 1 em Z (nariz em +Z); o chamador aplica a escala real.

static var _mesh_cache: Dictionary = {}
static var _shader: Shader

static func _get_shader() -> Shader:
	if _shader == null:
		_shader = load("res://shaders/fish.gdshader")
	return _shader

## Cria uma instância visual (Node3D com corpo e olhos). Cada peixe recebe o próprio material.
static func build(id: String, phase: float = 0.0, swim_speed: float = 6.0) -> Node3D:
	var d := FishDB.data(id)
	var root := Node3D.new()
	root.name = "Model"
	var mi := MeshInstance3D.new()
	mi.name = "Body"
	mi.mesh = _get_mesh(id)
	var sm := ShaderMaterial.new()
	sm.shader = _get_shader()
	sm.set_shader_parameter("phase", phase)
	sm.set_shader_parameter("swim_speed", swim_speed)
	sm.set_shader_parameter("amp", 0.05 if id in ["peixe_lua", "baiacu"] else 0.09)
	mi.material_override = sm
	root.add_child(mi)
	root.set_meta("material", sm)
	# olhos
	var bh: float = d["body_h"]
	var bw: float = d["body_w"]
	var t := 0.1
	var p := _profile(t, id)
	var eye_r: float = clampf(bh * 0.22, 0.012, 0.05)
	for sgn in [-1.0, 1.0]:
		var eye := MeshInstance3D.new()
		var sph := SphereMesh.new()
		sph.radius = eye_r
		sph.height = eye_r * 2.0
		sph.radial_segments = 10
		sph.rings = 6
		eye.mesh = sph
		eye.material_override = Props.mat(Color(0.02, 0.02, 0.03), 0.1, 0.0)
		eye.position = Vector3(sgn * bw * p * 0.9, bh * p * 0.28, 0.5 - t)
		root.add_child(eye)
		var hl := MeshInstance3D.new()
		var hs := SphereMesh.new()
		hs.radius = eye_r * 0.35
		hs.height = eye_r * 0.7
		hs.radial_segments = 6
		hs.rings = 4
		hl.mesh = hs
		hl.material_override = Props.mat(Color(1, 1, 1), 0.1, 0.0, 1.0)
		hl.position = Vector3(sgn * eye_r * 0.45, eye_r * 0.45, eye_r * 0.6)
		eye.add_child(hl)
	return root

static func set_swim_speed(model: Node3D, v: float) -> void:
	var m: ShaderMaterial = model.get_meta("material")
	m.set_shader_parameter("swim_speed", v)

## Perfil do corpo (0..1) ao longo de t (0 = nariz, 1 = cauda).
static func _profile(t: float, id: String) -> float:
	var p := pow(maxf(sin(PI * pow(t, 0.62)), 0.0), 0.75)
	if id == "peixe_lua":
		p = pow(maxf(sin(PI * pow(t, 0.55)), 0.0), 0.55)
		return maxf(p, 0.0) * (1.0 - 0.3 * smoothstep(0.7, 1.0, t))
	if id == "baiacu":
		p = pow(maxf(sin(PI * pow(t, 0.7)), 0.0), 0.5)
	if t > 0.8:
		p = maxf(p, 0.1 * (1.0 - t) * 5.0)
	return p

static func _get_mesh(id: String) -> ArrayMesh:
	if _mesh_cache.has(id):
		return _mesh_cache[id]
	var m := _build_mesh(id)
	_mesh_cache[id] = m
	return m

static func _build_mesh(id: String) -> ArrayMesh:
	var d := FishDB.data(id)
	var bh: float = d["body_h"]
	var bw: float = d["body_w"]
	var col: Color = d["color"]
	var belly: Color = d["belly"]
	var fin: Color = d["fin"]
	var accent: Color = d.get("accent", col.darkened(0.4))
	var pattern: String = d["pattern"]
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var rings := 18
	var sides := 14
	for i in rings + 1:
		var t := float(i) / rings
		var z := 0.5 - t
		var p := _profile(t, id)
		var rx := bw * p
		var ry := bh * p
		for k in sides:
			var a := TAU * k / sides
			var s := sin(a)
			var c := col.lerp(belly, 1.0 - smoothstep(-0.45, 0.25, s))
			match pattern:
				"bands":
					var band := (t > 0.2 and t < 0.3) or (t > 0.5 and t < 0.6) or t > 0.86
					var edge := (t > 0.18 and t < 0.2) or (t >= 0.3 and t < 0.32) or (t > 0.48 and t < 0.5) or (t >= 0.6 and t < 0.62)
					if band:
						c = accent
					elif edge:
						c = Color(0.05, 0.03, 0.02)
				"stripe":
					if absf(s) < 0.22 and t > 0.12 and t < 0.92:
						c = accent
				"spots":
					var h := fposmod(sin(float(i) * 12.9898 + float(k) * 78.233) * 43758.5453, 1.0)
					if h > 0.8 and t > 0.1 and t < 0.9:
						c = accent
			st.set_color(c)
			st.add_vertex(Vector3(cos(a) * rx, s * ry, z))
	for i in rings:
		for k in sides:
			var a := i * sides + k
			var b := i * sides + (k + 1) % sides
			var c2 := a + sides
			var d2 := b + sides
			st.add_index(a); st.add_index(b); st.add_index(c2)
			st.add_index(b); st.add_index(d2); st.add_index(c2)
	var base := (rings + 1) * sides
	# ---- cauda (caudal)
	var tail: float = d["tail"]
	var z0 := -0.5 + 0.02
	var tl := tail * 1.0 + 0.05
	var ph := maxf(bh * 0.08, 0.012)
	var up := 1.0
	var down := 1.0
	if id == "tubarao":
		up = 1.5
		down = 0.55
	if id == "peixe_lua":
		tl = 0.1
	var tail_pts: Array[Vector3] = [
		Vector3(0, ph, z0), Vector3(0, tail * up, z0 - tl), Vector3(0, 0, z0 - tl * 0.7),
		Vector3(0, -tail * down, z0 - tl), Vector3(0, -ph, z0)]
	base = _poly(st, tail_pts, fin, base)
	# ---- dorsal
	var dorsal: float = d["dorsal"]
	var t1 := 0.28
	var t2 := 0.58
	if id == "peixe_lua":
		t1 = 0.45
		t2 = 0.95
	var y1 := bh * _profile(t1, id)
	var y2 := bh * _profile(t2, id)
	var dorsal_pts: Array[Vector3] = [
		Vector3(0, y1 * 0.95, 0.5 - t1), Vector3(0, y1 + dorsal, 0.5 - t1 - 0.06 - (0.3 if id == "peixe_lua" else 0.0)),
		Vector3(0, y2 * 0.95, 0.5 - t2)]
	if id == "dourado":
		dorsal_pts = [Vector3(0, y1, 0.5 - 0.18), Vector3(0, y1 + dorsal * 0.9, 0.5 - 0.2), Vector3(0, y2 + dorsal * 0.8, 0.5 - t2 + 0.04), Vector3(0, y2, 0.5 - t2)]
	base = _poly(st, dorsal_pts, fin, base)
	# ---- anal
	var t3 := 0.62 if id != "peixe_lua" else 0.45
	var t4 := 0.8 if id != "peixe_lua" else 0.95
	var anal_h := dorsal * (0.6 if id != "peixe_lua" else 1.0)
	var anal_pts: Array[Vector3] = [
		Vector3(0, -bh * _profile(t3, id) * 0.95, 0.5 - t3), Vector3(0, -bh * _profile(t4, id) - anal_h, 0.5 - t4 - (0.1 if id == "peixe_lua" else 0.0)),
		Vector3(0, -bh * _profile(t4, id) * 0.95, 0.5 - t4)]
	base = _poly(st, anal_pts, fin, base)
	# ---- peitorais
	var tp := 0.27
	var pr := _profile(tp, id)
	var plen := 0.07 + 0.25 * bh
	for sgn in [-1.0, 1.0]:
		var pec: Array[Vector3] = [
			Vector3(sgn * bw * pr * 0.9, -bh * pr * 0.2, 0.5 - tp + 0.02),
			Vector3(sgn * (bw * pr + plen * 1.1), -bh * pr * 0.55 - plen * 0.4, 0.5 - tp - plen * 0.9),
			Vector3(sgn * bw * pr * 0.9, -bh * pr * 0.35, 0.5 - tp - 0.06)]
		base = _poly(st, pec, fin, base)
	st.generate_normals()
	return st.commit()

## Adiciona um polígono (leque de triângulos) com cor uniforme e retorna o novo índice-base.
static func _poly(st: SurfaceTool, pts: Array[Vector3], color: Color, base: int) -> int:
	for p in pts:
		st.set_color(color)
		st.add_vertex(p)
	for i in range(1, pts.size() - 1):
		st.add_index(base)
		st.add_index(base + i)
		st.add_index(base + i + 1)
	return base + pts.size()
