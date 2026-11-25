class_name BossModels
extends RefCounted
## Modelos 3D procedurais dos chefes (primitivas + FishModel). A frente de cada modelo aponta para +Z.

static func _m(c: Color, rough: float = 0.6, metal: float = 0.0, emis: float = 0.0) -> StandardMaterial3D:
	return Props.mat(c, rough, metal, emis)

static func _box(s: Vector3) -> BoxMesh:
	var bm := BoxMesh.new()
	bm.size = s
	return bm

## Cilindro afinado entre dois pontos (membros, espinhos).
static func _limb(parent: Node3D, from: Vector3, to: Vector3, r: float, mat: Material) -> void:
	var len := from.distance_to(to)
	var cm := CylinderMesh.new()
	cm.top_radius = r * 0.7
	cm.bottom_radius = r
	cm.height = len
	cm.radial_segments = 6
	cm.rings = 1
	var mi := MeshInstance3D.new()
	mi.mesh = cm
	mi.material_override = mat
	parent.add_child(mi)
	mi.position = (from + to) * 0.5
	var dir := (to - from).normalized()
	var up := Vector3.UP if absf(dir.y) < 0.99 else Vector3.RIGHT
	mi.transform.basis = Basis.looking_at(dir, up) * Basis(Vector3.RIGHT, PI / 2.0)

## Caranguejo‑Aranha: corpo achatado, 8 pernas longas (animáveis), 2 garras, olhos em haste.
static func crab() -> Node3D:
	var root := Node3D.new()
	var shell := _m(Color(0.72, 0.2, 0.1), 0.5)
	var dark := _m(Color(0.45, 0.1, 0.06), 0.6)
	Props.sphere(root, 1.3, Vector3(0, 2.6, 0), Color(0.72, 0.2, 0.1), Vector3(1.2, 0.65, 1.1), 0.5)
	for i in 5:
		Props.sphere(root, 0.18, Vector3(-0.8 + i * 0.4, 3.0, 0.3), Color(0.9, 0.7, 0.5), Vector3(1, 0.6, 1))
	var legs: Array[Node3D] = []
	for side in [-1.0, 1.0]:
		for k in 4:
			var pivot := Node3D.new()
			pivot.position = Vector3(side * 1.4, 2.7, -0.9 + k * 0.6)
			root.add_child(pivot)
			var out := Vector3(side * 1.7, 1.2, (k - 1.5) * 0.35)
			_limb(pivot, Vector3.ZERO, out, 0.12, dark)
			var knee := Node3D.new()
			knee.position = out
			pivot.add_child(knee)
			_limb(knee, Vector3.ZERO, Vector3(side * 1.4, -3.9, (k - 1.5) * 0.5), 0.09, shell)
			legs.append(pivot)
	root.set_meta("legs", legs)
	var claws: Array[Node3D] = []
	for side in [-1.0, 1.0]:
		var arm := Node3D.new()
		arm.position = Vector3(side * 1.0, 2.5, 1.2)
		root.add_child(arm)
		_limb(arm, Vector3.ZERO, Vector3(side * 0.6, 0.2, 1.6), 0.14, shell)
		var hand := Node3D.new()
		hand.position = Vector3(side * 0.6, 0.2, 1.6)
		arm.add_child(hand)
		Props.sphere(hand, 0.45, Vector3(0, 0, 0.3), Color(0.8, 0.22, 0.1), Vector3(0.7, 0.5, 1.3), 0.4)
		Props.sphere(hand, 0.3, Vector3(0, 0.0, 0.8), Color(0.6, 0.12, 0.06), Vector3(0.4, 0.3, 1.0), 0.4)
		claws.append(arm)
	root.set_meta("claws", claws)
	for side in [-1.0, 1.0]:
		_limb(root, Vector3(side * 0.4, 3.0, 1.1), Vector3(side * 0.45, 3.5, 1.3), 0.05, dark)
		Props.sphere(root, 0.14, Vector3(side * 0.45, 3.55, 1.3), Color(0.05, 0.05, 0.05), Vector3.ONE, 0.2)
	return root

## Baiacu Gigante: bola espinhosa que rola (nó "Roll").
static func puffer() -> Node3D:
	var root := Node3D.new()
	var inner := Node3D.new()
	inner.name = "Roll"
	root.add_child(inner)
	Props.sphere(inner, 2.4, Vector3.ZERO, Color(0.78, 0.66, 0.34), Vector3.ONE, 0.6)
	var rng := RandomNumberGenerator.new()
	rng.seed = 5
	for i in 46:
		var d := Vector3(rng.randf() - 0.5, rng.randf() - 0.5, rng.randf() - 0.5).normalized()
		var cm := CylinderMesh.new()
		cm.top_radius = 0.0
		cm.bottom_radius = 0.16
		cm.height = 0.9
		cm.radial_segments = 5
		cm.rings = 1
		var sp := MeshInstance3D.new()
		sp.mesh = cm
		sp.material_override = _m(Color(0.95, 0.9, 0.7), 0.5)
		inner.add_child(sp)
		sp.position = d * 2.4
		sp.transform.basis = Basis.looking_at(d, Vector3.UP if absf(d.y) < 0.99 else Vector3.RIGHT) * Basis(Vector3.RIGHT, PI / 2.0)
	Props.sphere(inner, 1.7, Vector3(0, -1.2, 0.6), Color(0.97, 0.93, 0.8), Vector3(1, 0.8, 1), 0.6)
	for side in [-1.0, 1.0]:
		Props.sphere(inner, 0.45, Vector3(side * 1.0, 0.7, 2.0), Color(1, 1, 1), Vector3.ONE, 0.2)
		Props.sphere(inner, 0.22, Vector3(side * 1.05, 0.7, 2.35), Color(0.02, 0.02, 0.02), Vector3.ONE, 0.2)
	Props.sphere(inner, 0.35, Vector3(0, -0.3, 2.3), Color(0.9, 0.4, 0.4), Vector3(1.4, 0.7, 0.8), 0.4)
	return root

## Piranha: modelo de peixe da espécie escondida "piranha_giant" + dentes.
static func piranha(scale_len: float) -> Node3D:
	var root := Node3D.new()
	var f := FishModel.build("piranha_giant", randf() * TAU, 9.0)
	f.scale = Vector3.ONE * scale_len
	root.add_child(f)
	for i in 6:
		for sgn in [-1.0, 1.0]:
			var cm := CylinderMesh.new()
			cm.top_radius = 0.0
			cm.bottom_radius = 0.012
			cm.height = 0.05
			cm.radial_segments = 4
			cm.rings = 1
			var t := MeshInstance3D.new()
			t.mesh = cm
			t.material_override = _m(Color(1, 1, 0.95), 0.3)
			f.add_child(t)
			t.position = Vector3((i - 2.5) * 0.018, -0.018 * sgn - 0.03, 0.44)
			t.rotation.x = 0.0 if sgn > 0 else PI
	return root

## Albatroz gigante: corpo, cabeça com bico, cauda e duas asas articuladas.
static func albatross() -> Node3D:
	var root := Node3D.new()
	var white := Color(0.95, 0.95, 0.93)
	Props.sphere(root, 1.1, Vector3.ZERO, white, Vector3(0.9, 0.8, 2.0), 0.7)
	Props.sphere(root, 0.55, Vector3(0, 0.35, 2.1), white, Vector3(1, 1, 1.1), 0.7)
	var beak := CylinderMesh.new()
	beak.top_radius = 0.0
	beak.bottom_radius = 0.22
	beak.height = 1.3
	beak.radial_segments = 6
	beak.rings = 1
	Props.mesh_node(root, beak, _m(Color(0.95, 0.75, 0.15), 0.4), Vector3(0, 0.3, 3.0), Vector3(PI / 2.0, 0, 0))
	Props.sphere(root, 0.1, Vector3(-0.28, 0.5, 2.5), Color(0.02, 0.02, 0.02), Vector3.ONE, 0.2)
	Props.sphere(root, 0.1, Vector3(0.28, 0.5, 2.5), Color(0.02, 0.02, 0.02), Vector3.ONE, 0.2)
	Props.mesh_node(root, _box(Vector3(1.2, 0.12, 1.8)), _m(Color(0.85, 0.85, 0.85)), Vector3(0, 0.05, -2.6))
	var wings: Array[Node3D] = []
	for side in [-1.0, 1.0]:
		var pivot := Node3D.new()
		pivot.position = Vector3(side * 0.7, 0.4, 0.2)
		root.add_child(pivot)
		Props.mesh_node(pivot, _box(Vector3(2.8, 0.14, 1.9)), _m(white, 0.7), Vector3(side * 1.4, 0, 0))
		Props.mesh_node(pivot, _box(Vector3(2.6, 0.12, 1.4)), _m(Color(0.88, 0.88, 0.88), 0.7), Vector3(side * 4.0, 0, -0.2))
		Props.mesh_node(pivot, _box(Vector3(1.6, 0.1, 1.0)), _m(Color(0.12, 0.12, 0.14), 0.7), Vector3(side * 6.0, 0, -0.4))
		wings.append(pivot)
	root.set_meta("wings", wings)
	return root

## Baleia: corpo em elipsoide, queixo claro, nadadeiras e cauda. mutant => preta com rachaduras de magma.
static func whale(mutant: bool) -> Node3D:
	var root := Node3D.new()
	var col := Color(0.1, 0.11, 0.16) if not mutant else Color(0.07, 0.05, 0.05)
	var chin := Color(0.85, 0.85, 0.8) if not mutant else Color(0.5, 0.2, 0.08)
	Props.sphere(root, 1.0, Vector3.ZERO, col, Vector3(2.9, 2.6, 8.0), 0.55)
	Props.sphere(root, 1.0, Vector3(0, -1.2, 4.4), chin, Vector3(2.2, 1.2, 3.2), 0.6)
	Props.sphere(root, 1.0, Vector3(0, 0.2, -7.0), col, Vector3(1.6, 1.4, 4.5), 0.55)
	for side in [-1.0, 1.0]:
		Props.mesh_node(root, _box(Vector3(4.2, 0.35, 2.0)), _m(col, 0.6), Vector3(side * 2.4, 0.2, -11.2), Vector3(0, side * -0.4, 0))
		Props.mesh_node(root, _box(Vector3(3.0, 0.3, 1.4)), _m(col, 0.6), Vector3(side * 3.4, -1.0, 2.5), Vector3(0, side * 0.4, side * 0.5))
		Props.sphere(root, 0.28, Vector3(side * 1.6, 0.4, 5.6), Color(0.02, 0.02, 0.02), Vector3.ONE, 0.2)
	if mutant:
		var glow := _m(Color(1.0, 0.4, 0.05), 0.3, 0.0, 3.0)
		var rng := RandomNumberGenerator.new()
		rng.seed = 11
		for i in 22:
			var p := Vector3(rng.randf_range(-1.6, 1.6), rng.randf_range(1.0, 2.6), rng.randf_range(-6.0, 5.0))
			Props.mesh_node(root, _box(Vector3(rng.randf_range(0.15, 0.3), 0.12, rng.randf_range(0.8, 2.0))), glow, p, Vector3(0, rng.randf() * PI, 0))
		for side in [-1.0, 1.0]:
			Props.mesh_node(root, SphereMesh.new(), glow, Vector3(side * 1.5, 0.6, 5.4)).scale = Vector3.ONE * 0.4
		var l := OmniLight3D.new()
		l.light_color = Color(1.0, 0.45, 0.1)
		l.light_energy = 6.0
		l.omni_range = 40.0
		l.position = Vector3(0, 3, 0)
		root.add_child(l)
	return root
