class_name Props
extends RefCounted
## Construtores estáticos de props: palmeiras, rochas, cabana da loja, doca, fogueira, farol, etc.
## Tudo é gerado por código com malhas primitivas/ArrayMesh e materiais compartilhados.

static var _mats: Dictionary = {}

static func mat(c: Color, rough: float = 0.85, metal: float = 0.0, emissive: float = 0.0) -> StandardMaterial3D:
	var key := "%s_%s_%s_%s" % [c.to_html(), rough, metal, emissive]
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = rough
	m.metallic = metal
	if emissive > 0.0:
		m.emission_enabled = true
		m.emission = c
		m.emission_energy_multiplier = emissive
	_mats[key] = m
	return m

static func vcol_mat(double_sided: bool = false) -> StandardMaterial3D:
	var key := "vcol_%s" % double_sided
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.roughness = 0.85
	if double_sided:
		m.cull_mode = BaseMaterial3D.CULL_DISABLED
	_mats[key] = m
	return m

# ------------------------------------------------------------------ helpers

static func mesh_node(parent: Node, mesh: Mesh, material: Material, pos: Vector3 = Vector3.ZERO, rot: Vector3 = Vector3.ZERO, nm: String = "") -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = material
	mi.position = pos
	mi.rotation = rot
	if nm != "":
		mi.name = nm
	parent.add_child(mi)
	return mi

## Caixa com malha e (opcionalmente) colisão no StaticBody informado.
static func box(parent: Node, size: Vector3, pos: Vector3, color: Color, body: StaticBody3D = null, rot: Vector3 = Vector3.ZERO, rough: float = 0.85) -> MeshInstance3D:
	var bm := BoxMesh.new()
	bm.size = size
	var mi := mesh_node(parent, bm, mat(color, rough), pos, rot)
	if body != null:
		var cs := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = size
		cs.shape = bs
		cs.transform = Transform3D(Basis.from_euler(rot), pos)
		body.add_child(cs)
	return mi

static func cylinder(parent: Node, radius_top: float, radius_bottom: float, height: float, pos: Vector3, color: Color, sides: int = 12, rough: float = 0.85, metal: float = 0.0) -> MeshInstance3D:
	var cm := CylinderMesh.new()
	cm.top_radius = radius_top
	cm.bottom_radius = radius_bottom
	cm.height = height
	cm.radial_segments = sides
	cm.rings = 1
	return mesh_node(parent, cm, mat(color, rough, metal), pos)

static func sphere(parent: Node, radius: float, pos: Vector3, color: Color, scale_v: Vector3 = Vector3.ONE, rough: float = 0.85) -> MeshInstance3D:
	var sm := SphereMesh.new()
	sm.radius = radius
	sm.height = radius * 2.0
	sm.radial_segments = 14
	sm.rings = 8
	var mi := mesh_node(parent, sm, mat(color, rough), pos)
	mi.scale = scale_v
	return mi

# ------------------------------------------------------------------ palmeira

static func build_palm_mesh(seed_v: int) -> ArrayMesh:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var height := rng.randf_range(5.2, 7.4)
	var lean := Vector2.from_angle(rng.randf() * TAU) * rng.randf_range(0.5, 1.9)
	var segs := 9
	var sides := 7
	var base := 0
	for s in segs + 1:
		var t := float(s) / segs
		var c := Vector3(lean.x * t * t, height * t, lean.y * t * t)
		var r := lerpf(0.27, 0.15, t) * (1.0 + 0.18 * float(s % 2))
		var col := Color(0.42, 0.3, 0.18) if s % 2 == 0 else Color(0.34, 0.23, 0.13)
		for k in sides:
			var a := TAU * k / sides
			st.set_color(col)
			st.add_vertex(c + Vector3(cos(a) * r, 0, sin(a) * r))
	for s in segs:
		for k in sides:
			var a := base + s * sides + k
			var b := base + s * sides + (k + 1) % sides
			var c := a + sides
			var d := b + sides
			st.add_index(a); st.add_index(c); st.add_index(b)
			st.add_index(b); st.add_index(c); st.add_index(d)
	base = (segs + 1) * sides
	var top := Vector3(lean.x, height, lean.y)
	# coqueiros
	for n in 3:
		var a := TAU * n / 3.0 + 0.5
		var cc := top + Vector3(cos(a) * 0.25, -0.25, sin(a) * 0.25)
		_add_blob(st, cc, 0.17, Color(0.3, 0.2, 0.08), base)
		base += 7 * 5
	# folhas
	var fronds := 9
	for f in fronds:
		var yaw := TAU * f / fronds + rng.randf_range(-0.2, 0.2)
		var dirv := Vector3(cos(yaw), 0, sin(yaw))
		var perp := Vector3(-sin(yaw), 0, cos(yaw))
		var length := rng.randf_range(2.8, 3.8)
		var rise := rng.randf_range(0.7, 1.4)
		var droop := rng.randf_range(1.4, 2.2)
		var rows := 8
		var g := rng.randf_range(0.0, 0.08)
		for i in rows + 1:
			var s := float(i) / rows
			var pos := top + dirv * (s * length) + Vector3(0, sin(s * PI * 0.75) * rise - s * s * droop, 0)
			var w := 0.62 * pow(sin(PI * (0.08 + 0.92 * s)), 0.8) + 0.03
			var col := Color(0.1 + g, 0.36 + g, 0.12).lerp(Color(0.25 + g, 0.55 + g, 0.18), s)
			st.set_color(col)
			st.add_vertex(pos + perp * w + Vector3(0, -w * 0.45, 0))
			st.set_color(col.lightened(0.12))
			st.add_vertex(pos + Vector3(0, 0.06, 0))
			st.set_color(col)
			st.add_vertex(pos - perp * w + Vector3(0, -w * 0.45, 0))
		for i in rows:
			var l0 := base + i * 3
			var m0 := l0 + 1
			var r0 := l0 + 2
			var l1 := l0 + 3
			var m1 := l1 + 1
			var r1 := l1 + 2
			st.add_index(l0); st.add_index(m0); st.add_index(l1)
			st.add_index(m0); st.add_index(m1); st.add_index(l1)
			st.add_index(m0); st.add_index(r0); st.add_index(m1)
			st.add_index(r0); st.add_index(r1); st.add_index(m1)
		base += (rows + 1) * 3
	st.generate_normals()
	return st.commit()

static func _add_blob(st: SurfaceTool, c: Vector3, r: float, col: Color, base: int) -> void:
	# esfera simples: 7 divisões x 5 anéis
	var seg := 7
	var rings := 5
	for j in rings:
		var phi := PI * (float(j) / (rings - 1))
		for k in seg:
			var th := TAU * k / seg
			st.set_color(col)
			st.add_vertex(c + Vector3(sin(phi) * cos(th), cos(phi), sin(phi) * sin(th)) * r)
	for j in rings - 1:
		for k in seg:
			var a := base + j * seg + k
			var b := base + j * seg + (k + 1) % seg
			var cc := a + seg
			var d := b + seg
			st.add_index(a); st.add_index(b); st.add_index(cc)
			st.add_index(b); st.add_index(d); st.add_index(cc)

static func add_palm(parent: Node, palm_mesh: ArrayMesh, pos: Vector3, rng: RandomNumberGenerator) -> void:
	var holder := StaticBody3D.new()
	holder.position = pos - Vector3(0, 0.3, 0)
	holder.rotation.y = rng.randf() * TAU
	holder.scale = Vector3.ONE * rng.randf_range(0.85, 1.25)
	parent.add_child(holder)
	var mi := MeshInstance3D.new()
	mi.mesh = palm_mesh
	mi.material_override = vcol_mat(true)
	holder.add_child(mi)
	var cs := CollisionShape3D.new()
	var shape := CylinderShape3D.new()
	shape.radius = 0.25
	shape.height = 3.0
	cs.shape = shape
	cs.position.y = 1.5
	holder.add_child(cs)

static func add_rock(parent: Node, pos: Vector3, size: float, rng: RandomNumberGenerator) -> void:
	var body := StaticBody3D.new()
	body.position = pos
	body.rotation.y = rng.randf() * TAU
	parent.add_child(body)
	var shade := rng.randf_range(0.35, 0.55)
	var mi := sphere(body, size, Vector3(0, size * 0.25, 0), Color(shade, shade * 0.97, shade * 0.92), Vector3(1.0, rng.randf_range(0.55, 0.85), rng.randf_range(0.8, 1.2)), 0.95)
	mi.rotation = Vector3(rng.randf_range(-0.3, 0.3), 0, rng.randf_range(-0.3, 0.3))
	var cs := CollisionShape3D.new()
	var sh := SphereShape3D.new()
	sh.radius = size * 0.8
	cs.shape = sh
	cs.position.y = size * 0.2
	body.add_child(cs)

static func add_bush(parent: Node, pos: Vector3, rng: RandomNumberGenerator) -> void:
	var n := Node3D.new()
	n.position = pos
	parent.add_child(n)
	for i in 3:
		var r := rng.randf_range(0.5, 0.9)
		var gcol := Color(0.15 + rng.randf() * 0.1, 0.42 + rng.randf() * 0.15, 0.14)
		sphere(n, r, Vector3(rng.randf_range(-0.6, 0.6), r * 0.55, rng.randf_range(-0.6, 0.6)), gcol, Vector3(1, 0.7, 1))

# ------------------------------------------------------------------ fogo

static func add_fire(parent: Node, pos: Vector3, size: float = 1.0, with_logs: bool = true) -> Node3D:
	var n := Node3D.new()
	n.position = pos
	parent.add_child(n)
	if with_logs:
		for i in 5:
			var a := TAU * i / 5.0
			var log_mi := cylinder(n, 0.07, 0.07, 0.9, Vector3(cos(a) * 0.28, 0.08, sin(a) * 0.28), Color(0.28, 0.17, 0.09), 6)
			log_mi.rotation = Vector3(PI / 2.0, 0, -a + PI / 2.0)
		for i in 6:
			var a := TAU * i / 6.0
			sphere(n, 0.1, Vector3(cos(a) * 0.7, 0.05, sin(a) * 0.7), Color(0.45, 0.44, 0.42), Vector3(1, 0.7, 1), 0.95)
	var p := CPUParticles3D.new()
	p.amount = 28
	p.lifetime = 0.9
	p.local_coords = false
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 0.12 * size
	p.direction = Vector3.UP
	p.spread = 14.0
	p.gravity = Vector3(0, 1.4, 0)
	p.initial_velocity_min = 0.5 * size
	p.initial_velocity_max = 1.1 * size
	p.scale_amount_min = 0.5 * size
	p.scale_amount_max = 1.0 * size
	var sc := Curve.new()
	sc.add_point(Vector2(0, 1))
	sc.add_point(Vector2(1, 0.1))
	p.scale_amount_curve = sc
	var grad := Gradient.new()
	grad.set_color(0, Color(1.0, 0.85, 0.2, 0.95))
	grad.set_color(1, Color(1.0, 0.15, 0.0, 0.0))
	grad.add_point(0.4, Color(1.0, 0.5, 0.08, 0.8))
	p.color_ramp = grad
	var sm := SphereMesh.new()
	sm.radius = 0.12
	sm.height = 0.24
	sm.radial_segments = 6
	sm.rings = 3
	p.mesh = sm
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.vertex_color_use_as_albedo = true
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	p.material_override = m
	p.position.y = 0.2
	n.add_child(p)
	var l := OmniLight3D.new()
	l.set_script(load("res://scripts/world/flicker_light.gd"))
	l.light_color = Color(1.0, 0.6, 0.25)
	l.omni_range = 9.0 * size
	l.position.y = 0.8
	n.add_child(l)
	return n

# ------------------------------------------------------------------ cabana da loja

## Cria a cabana. A origem é o centro do terreno sob a cabana; "front" aponta para +Z local.
## Retorna {"root": Node3D, "counter": Node3D (ponto de interação)}.
static func build_shop(parent: Node, pos: Vector3, yaw: float, keeper: String = "Capitão Maré", sign_text: String = "LOJA DO PESCADOR") -> Dictionary:
	var root := Node3D.new()
	root.name = "ShopHut"
	root.position = pos
	root.rotation.y = yaw
	parent.add_child(root)
	var body := StaticBody3D.new()
	root.add_child(body)
	var wood := Color(0.66, 0.17, 0.13)   # parede vermelha (cabana do vídeo de referência)
	var wood_dark := Color(0.34, 0.21, 0.1)
	var fl := 0.5          # altura do piso
	var W := 7.0
	var D := 6.0
	var H := 2.7
	# palafitas
	for x in [-W / 2.0 + 0.3, W / 2.0 - 0.3]:
		for z in [-D / 2.0 + 0.3, D / 2.0 - 0.3]:
			cylinder(root, 0.16, 0.16, 3.5, Vector3(x, fl - 1.6, z), wood_dark, 8)
	# piso
	box(root, Vector3(W, 0.2, D), Vector3(0, fl - 0.1, 0), wood_dark, body)
	box(root, Vector3(W - 0.2, 0.04, D - 0.2), Vector3(0, fl + 0.01, 0), Color(0.62, 0.42, 0.22), null)
	# paredes
	var wy := fl + H / 2.0
	box(root, Vector3(W, H, 0.15), Vector3(0, wy, -D / 2.0), wood, body)
	box(root, Vector3(0.15, H, D), Vector3(-W / 2.0, wy, 0), wood, body)
	box(root, Vector3(0.15, H, D), Vector3(W / 2.0, wy, 0), wood, body)
	var seg := (W - 2.2) / 2.0
	box(root, Vector3(seg, H, 0.15), Vector3(-(1.1 + seg / 2.0), wy, D / 2.0), wood, body)
	box(root, Vector3(seg, H, 0.15), Vector3(1.1 + seg / 2.0, wy, D / 2.0), wood, body)
	box(root, Vector3(2.2, 0.5, 0.15), Vector3(0, fl + H - 0.25, D / 2.0), wood, body)
	# tábuas horizontais (detalhe)
	for i in 5:
		var yy := fl + 0.45 + i * 0.5
		box(root, Vector3(W + 0.06, 0.05, 0.19), Vector3(0, yy, -D / 2.0), wood_dark)
	# telhado de palha em duas águas
	var roof_col := Color(0.62, 0.48, 0.22)
	var ang := deg_to_rad(32.0)
	var slab_len := (W / 2.0 + 0.7) / cos(ang)
	for sgn in [-1.0, 1.0]:
		var rs := box(root, Vector3(slab_len, 0.18, D + 1.2), Vector3(sgn * (W / 4.0 + 0.2), fl + H + 0.85, 0), roof_col, null, Vector3(0, 0, -sgn * ang), 1.0)
		rs.name = "Roof"
	box(root, Vector3(0.25, 0.25, D + 1.3), Vector3(0, fl + H + 1.5, 0), wood_dark)
	# rampa de entrada
	var ramp_len := 2.0
	var ramp_ang := atan2(fl, ramp_len)
	var rl := sqrt(fl * fl + ramp_len * ramp_len)
	box(root, Vector3(2.2, 0.15, rl), Vector3(0, fl / 2.0 - 0.02, D / 2.0 + ramp_len / 2.0), Color(0.58, 0.4, 0.22), body, Vector3(ramp_ang, 0, 0))
	# balcão
	box(root, Vector3(3.6, 1.05, 0.9), Vector3(0, fl + 0.52, -1.0), Color(0.45, 0.28, 0.14), body)
	box(root, Vector3(3.8, 0.1, 1.1), Vector3(0, fl + 1.07, -1.0), Color(0.7, 0.5, 0.28))
	# prateleira com itens
	box(root, Vector3(4.6, 0.08, 0.5), Vector3(0, fl + 1.7, -D / 2.0 + 0.35), wood_dark)
	for i in 5:
		var cx := -1.8 + i * 0.9
		box(root, Vector3(0.4, 0.35, 0.35), Vector3(cx, fl + 1.92, -D / 2.0 + 0.35), [Color(0.8, 0.3, 0.2), Color(0.2, 0.5, 0.7), Color(0.85, 0.7, 0.2), Color(0.3, 0.6, 0.3), Color(0.6, 0.3, 0.6)][i])
	# caixotes e barris
	box(root, Vector3(0.8, 0.8, 0.8), Vector3(-2.7, fl + 0.4, 1.9), Color(0.6, 0.45, 0.25), body)
	box(root, Vector3(0.7, 0.7, 0.7), Vector3(-2.65, fl + 1.15, 1.95), Color(0.55, 0.4, 0.22), null, Vector3(0, 0.3, 0))
	var barrel := cylinder(root, 0.38, 0.38, 0.9, Vector3(2.7, fl + 0.45, 1.9), Color(0.4, 0.26, 0.14), 12)
	barrel.name = "Barrel"
	var bc := CollisionShape3D.new()
	var bsh := CylinderShape3D.new()
	bsh.radius = 0.38
	bsh.height = 0.9
	bc.shape = bsh
	bc.position = Vector3(2.7, fl + 0.45, 1.9)
	body.add_child(bc)
	# NPC lojista
	var npc := _build_npc(root, keeper)
	npc.position = Vector3(0, fl, -2.05)
	# placa
	var sign_board := box(root, Vector3(3.4, 0.7, 0.12), Vector3(0, fl + H + 0.1, D / 2.0 + 0.15), Color(0.3, 0.18, 0.09))
	var lbl := Label3D.new()
	lbl.text = sign_text
	lbl.font_size = 56
	lbl.pixel_size = 0.0045
	lbl.modulate = Color(1.0, 0.9, 0.55)
	lbl.outline_size = 8
	lbl.position = Vector3(0, 0, 0.08)
	sign_board.add_child(lbl)
	# lanterna interna
	var lamp := OmniLight3D.new()
	lamp.light_color = Color(1.0, 0.8, 0.5)
	lamp.light_energy = 1.4
	lamp.omni_range = 9.0
	lamp.position = Vector3(0, fl + H - 0.3, 0)
	root.add_child(lamp)
	sphere(root, 0.12, Vector3(0, fl + H - 0.3, 0), Color(1.0, 0.85, 0.5))
	# ponto de interação
	var it := Node3D.new()
	it.set_script(load("res://scripts/world/interactable.gd"))
	it.set("prompt", "Falar com %s (Loja)" % keeper)
	it.set("radius", 4.2)
	root.add_child(it)
	it.position = Vector3(0, fl + 1.0, 0.2)
	return {"root": root, "interact": it, "floor_y": pos.y + fl}

static func _build_npc(parent: Node, keeper: String = "Capitão Maré") -> Node3D:
	var n := Node3D.new()
	n.name = "ShopKeeper"
	parent.add_child(n)
	var body := CapsuleMesh.new()
	body.radius = 0.28
	body.height = 1.3
	mesh_node(n, body, mat(Color(0.15, 0.35, 0.65)), Vector3(0, 0.75, 0))
	sphere(n, 0.2, Vector3(0, 1.62, 0), Color(0.85, 0.62, 0.45))
	sphere(n, 0.17, Vector3(0, 1.5, 0.1), Color(0.92, 0.92, 0.9), Vector3(1.0, 0.9, 0.8))
	cylinder(n, 0.24, 0.24, 0.05, Vector3(0, 1.8, 0), Color(0.95, 0.8, 0.15), 14)
	cylinder(n, 0.14, 0.18, 0.18, Vector3(0, 1.88, 0), Color(0.95, 0.8, 0.15), 14)
	sphere(n, 0.035, Vector3(-0.08, 1.67, 0.17), Color(0.05, 0.05, 0.05))
	sphere(n, 0.035, Vector3(0.08, 1.67, 0.17), Color(0.05, 0.05, 0.05))
	var l := Label3D.new()
	l.text = keeper
	l.font_size = 40
	l.pixel_size = 0.004
	l.outline_size = 8
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.position = Vector3(0, 2.25, 0)
	n.add_child(l)
	return n

# ------------------------------------------------------------------ doca

## Constrói uma doca a partir de "start" (centro da cabeceira) na direção "dir" (unitário XZ).
static func build_dock(parent: Node, start: Vector3, dir: Vector2, length: float = 20.0, width: float = 2.6) -> Dictionary:
	var root := Node3D.new()
	root.name = "Dock"
	root.position = start
	root.rotation.y = atan2(-dir.x, -dir.y)   # -Z local aponta para "dir"
	parent.add_child(root)
	var body := StaticBody3D.new()
	root.add_child(body)
	var wood := Color(0.5, 0.34, 0.2)
	var wood2 := Color(0.42, 0.28, 0.16)
	# convenção: o comprimento corre ao longo de -Z local
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = Vector3(width, 0.3, length)
	cs.shape = bs
	cs.position = Vector3(0, -0.15, -length / 2.0)
	body.add_child(cs)
	var planks := int(length / 0.34)
	for i in planks:
		var shade := 0.0 if i % 2 == 0 else 0.04
		box(root, Vector3(width, 0.08, 0.31), Vector3(0, -0.04, -0.17 - i * 0.34), Color(wood.r - shade, wood.g - shade, wood.b - shade))
	for sx in [-width / 2.0 + 0.12, width / 2.0 - 0.12]:
		box(root, Vector3(0.1, 0.16, length), Vector3(sx, -0.2, -length / 2.0), wood2)
	var post_i := 0
	var z := -0.5
	while z > -length:
		for sx in [-width / 2.0 + 0.05, width / 2.0 - 0.05]:
			cylinder(root, 0.1, 0.1, 3.8, Vector3(sx, 0.2 - 1.9 + 0.4, z), wood2, 8)
		post_i += 1
		z -= 3.0
	# plataforma do final
	var plat_w := 5.0
	var plat_len := 4.5
	var pcs := CollisionShape3D.new()
	var pbs := BoxShape3D.new()
	pbs.size = Vector3(plat_w, 0.3, plat_len)
	pcs.shape = pbs
	pcs.position = Vector3(0, -0.15, -length - plat_len / 2.0 + 0.4)
	body.add_child(pcs)
	for i in int(plat_len / 0.34):
		box(root, Vector3(plat_w, 0.08, 0.31), Vector3(0, -0.04, -length + 0.2 - i * 0.34), Color(wood.r - (0.04 if i % 2 else 0.0), wood.g - (0.04 if i % 2 else 0.0), wood.b))
	for sx in [-plat_w / 2.0 + 0.2, plat_w / 2.0 - 0.2]:
		for sz in [-length + 0.2, -length - plat_len + 0.6]:
			cylinder(root, 0.12, 0.12, 4.0, Vector3(sx, -1.4, sz), wood2, 8)
	# poste de luz
	cylinder(root, 0.06, 0.06, 2.2, Vector3(plat_w / 2.0 - 0.3, 1.0, -length - 1.0), wood2, 8)
	sphere(root, 0.16, Vector3(plat_w / 2.0 - 0.3, 2.15, -length - 1.0), Color(1.0, 0.85, 0.5))
	var lamp := OmniLight3D.new()
	lamp.light_color = Color(1.0, 0.8, 0.5)
	lamp.light_energy = 1.2
	lamp.omni_range = 10.0
	lamp.position = Vector3(plat_w / 2.0 - 0.3, 2.1, -length - 1.0)
	root.add_child(lamp)
	# banco
	box(root, Vector3(1.6, 0.1, 0.5), Vector3(-plat_w / 2.0 + 0.9, 0.5, -length - 2.2), Color(0.55, 0.38, 0.2), body)
	box(root, Vector3(0.1, 0.5, 0.4), Vector3(-plat_w / 2.0 + 0.2, 0.25, -length - 2.2), wood2)
	box(root, Vector3(0.1, 0.5, 0.4), Vector3(-plat_w / 2.0 + 1.6, 0.25, -length - 2.2), wood2)
	# local do fim da doca em coordenadas globais
	var end_local := Vector3(0, 0, -length - 1.5)
	return {"root": root, "end": root.to_global(end_local)}

# ------------------------------------------------------------------ farol

static func build_lighthouse(parent: Node, pos: Vector3) -> Node3D:
	var root := StaticBody3D.new()
	root.name = "Lighthouse"
	root.position = pos
	parent.add_child(root)
	var bands := 6
	for i in bands:
		var r0 := lerpf(2.1, 1.3, float(i) / bands)
		var r1 := lerpf(2.1, 1.3, float(i + 1) / bands)
		var col := Color(0.9, 0.12, 0.1) if i % 2 == 0 else Color(0.95, 0.95, 0.95)
		cylinder(root, r1, r0, 2.4, Vector3(0, 1.2 + i * 2.4, 0), col, 16, 0.6)
	cylinder(root, 2.0, 2.0, 0.25, Vector3(0, bands * 2.4 + 0.12, 0), Color(0.15, 0.15, 0.17), 16)
	var cs := CollisionShape3D.new()
	var sh := CylinderShape3D.new()
	sh.radius = 1.9
	sh.height = bands * 2.4
	cs.shape = sh
	cs.position.y = bands * 1.2
	root.add_child(cs)
	var top := bands * 2.4 + 0.25
	cylinder(root, 0.85, 0.85, 1.3, Vector3(0, top + 0.65, 0), Color(1.0, 0.92, 0.6), 12, 0.2).material_override = mat(Color(1.0, 0.92, 0.6), 0.2, 0.0, 2.0)
	cylinder(root, 0.0, 1.2, 0.7, Vector3(0, top + 1.65, 0), Color(0.15, 0.15, 0.17), 16)
	var l := OmniLight3D.new()
	l.light_color = Color(1.0, 0.9, 0.6)
	l.light_energy = 3.0
	l.omni_range = 60.0
	l.position.y = top + 0.65
	root.add_child(l)
	return root

# ------------------------------------------------------------------ pinheiro e grama

static func add_pine(parent: Node, pos: Vector3, rng: RandomNumberGenerator) -> void:
	var body := StaticBody3D.new()
	body.position = pos - Vector3(0, 0.2, 0)
	var sc := rng.randf_range(0.8, 1.5)
	body.scale = Vector3.ONE * sc
	parent.add_child(body)
	cylinder(body, 0.14, 0.24, 2.2, Vector3(0, 1.1, 0), Color(0.36, 0.24, 0.14), 6)
	var g := rng.randf_range(0.0, 0.06)
	for i in 4:
		var r := 1.55 - i * 0.32
		cylinder(body, 0.0, r, 1.5, Vector3(0, 2.0 + i * 0.85, 0), Color(0.1 + g, 0.36 + g, 0.17 + g * 0.5), 7, 0.9)
	var cs := CollisionShape3D.new()
	var sh := CylinderShape3D.new()
	sh.radius = 0.25
	sh.height = 3.0
	cs.shape = sh
	cs.position.y = 1.5
	body.add_child(cs)

static func build_grass_mesh() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var base := 0
	for k in 2:
		var a := k * PI / 2.0
		var dx := cos(a) * 0.09
		var dz := sin(a) * 0.09
		st.set_color(Color(0.16, 0.38, 0.12))
		st.add_vertex(Vector3(-dx, 0, -dz))
		st.set_color(Color(0.16, 0.38, 0.12))
		st.add_vertex(Vector3(dx, 0, dz))
		st.set_color(Color(0.45, 0.72, 0.25))
		st.add_vertex(Vector3(dx * 0.1, 0.55, dz * 0.1 + 0.05))
		st.add_index(base); st.add_index(base + 1); st.add_index(base + 2)
		base += 3
	st.generate_normals()
	return st.commit()

static func add_grass(parent: Node, positions: PackedVector3Array, rng: RandomNumberGenerator) -> void:
	if positions.is_empty():
		return
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = build_grass_mesh()
	mm.instance_count = positions.size()
	for i in positions.size():
		var s := rng.randf_range(0.45, 1.0)
		var b := Basis.from_euler(Vector3(0, rng.randf() * TAU, 0)).scaled(Vector3(s, s, s))
		mm.set_instance_transform(i, Transform3D(b, positions[i]))
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = vcol_mat(true)
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mmi)
