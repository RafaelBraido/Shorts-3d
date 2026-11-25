class_name StoryWorld
extends RefCounted
## Constrói o conteúdo da história em cada ilha: NPCs, lago, altar, acampamento militar, lava, marcadores e barcos.
## Registra as posições importantes em Story.zones (usadas pelo radar/objetivos e pela lógica das missões).

static func _surf(x: float, z: float, dy: float = 0.0) -> Vector3:
	return Vector3(x, Terrain.height_at(x, z) + dy, z)

static func _slope(x: float, z: float) -> float:
	var dx := Terrain.height_at(x + 1.0, z) - Terrain.height_at(x - 1.0, z)
	var dz := Terrain.height_at(x, z + 1.0) - Terrain.height_at(x, z - 1.0)
	return sqrt(dx * dx + dz * dz) * 0.5

## Procura um ponto "firme" (altura mínima e pouca inclinação) perto de "want", afastando-se se necessário.
static func _firm(want: Vector2, toward: Vector2, min_h: float) -> Vector2:
	var p := want
	for i in 60:
		if Terrain.height_at(p.x, p.y) >= min_h and _slope(p.x, p.y) < 0.35:
			return p
		p += (toward - p).normalized() * 1.5
	return p

static func _flat_y(p: Vector2, r: float) -> float:
	var h := -100.0
	for dx in [-r, 0.0, r]:
		for dz in [-r, 0.0, r]:
			h = maxf(h, Terrain.height_at(p.x + dx, p.y + dz))
	return h

static func _keepout(w: Node, p: Vector2, r: float) -> void:
	w._keepouts.append({"p": p, "r": r})

static func build(w: Node3D) -> void:
	Story.world = w
	var z := Story.zones
	var rng := RandomNumberGenerator.new()
	rng.seed = 77
	_island1(w, z)
	_island2(w, z, rng)
	_island3(w, z, rng)
	_island4(w, z)
	_island5(w, z)
	z["mainland"] = Vector3(-330, 0, -250)
	var beacon := QuestBeacon.new()
	w.add_child(beacon)
	# barcos já conquistados (save carregado)
	if Story.flags.get("keys_motorboat", false):
		w.spawn_motorboat()
	if Story.flags.get("keys_military", false):
		w.spawn_military_boat()

# ------------------------------------------------------------------ Ilha 1 — o Farol

static func _island1(w: Node3D, z: Dictionary) -> void:
	var dir: Vector2 = w.dock_dir
	var perp := Vector2(-dir.y, dir.x)
	var spawn := Vector2(w.player_spawn.x, w.player_spawn.z)
	var shore := spawn + dir * 6.0
	z["spawn1"] = w.player_spawn
	z["island1"] = _surf(0, 0)
	z["dock"] = w.dock_end
	z["shop"] = Vector3(w.shop_pos.x, w.shop_pos.y + 1.0, w.shop_pos.z)
	# farol, no lado oposto da loja
	var lh := _firm(shore - dir * 12.0 - perp * 24.0, Vector2.ZERO, 1.6)
	var lh_y := _flat_y(lh, 2.5)
	Props.build_lighthouse(w, Vector3(lh.x, lh_y - 0.2, lh.y))
	_keepout(w, lh, 8.0)
	# banco com o Guardião do Farol
	var bench_p := lh + Vector2(5.5, 0.0)
	bench_p = _firm(bench_p, lh, 1.0)
	var by := _flat_y(bench_p, 0.8)
	Props.box(w, Vector3(2.0, 0.12, 0.6), Vector3(bench_p.x, by + 0.5, bench_p.y), Color(0.55, 0.38, 0.2))
	Props.box(w, Vector3(2.0, 0.55, 0.08), Vector3(bench_p.x, by + 0.85, bench_p.y - 0.3), Color(0.5, 0.34, 0.18))
	Props.box(w, Vector3(0.1, 0.5, 0.5), Vector3(bench_p.x - 0.9, by + 0.25, bench_p.y), Color(0.4, 0.28, 0.15))
	Props.box(w, Vector3(0.1, 0.5, 0.5), Vector3(bench_p.x + 0.9, by + 0.25, bench_p.y), Color(0.4, 0.28, 0.15))
	var face := (spawn - bench_p).normalized()
	StoryNpc.make(w, "guardian", "Guardião do Farol", Vector3(bench_p.x, by + 0.55, bench_p.y), atan2(face.x, face.y), "guardian", true)
	z["guardian"] = Vector3(bench_p.x, by + 1.0, bench_p.y)
	_keepout(w, bench_p, 4.0)
	# o barco da introdução, naufragado e em chamas na praia
	var wp := shore - dir * 4.0 + perp * 14.0
	Props.build_wreck(w, Vector3(wp.x, Terrain.height_at(wp.x, wp.y) - 0.2, wp.y), atan2(dir.x, dir.y) + 0.5)
	_keepout(w, wp, 6.0)
	# Reel of Fortune: máquina neon de cassino ao lado da loja
	var sp2 := Vector2(w.shop_pos.x, w.shop_pos.z)
	var sface := (shore - sp2).normalized()
	var sside := Vector2(-sface.y, sface.x)
	var mp := sp2 + sface * 6.0 + sside * 4.5
	_reel_machine(w, Vector3(mp.x, Terrain.height_at(mp.x, mp.y), mp.y), atan2(sface.x, sface.y))
	# Baía do Caranguejo: praia a leste
	var cd := Vector2(1.0, -0.55).normalized()
	var cshore := Terrain.find_shore(Vector2.ZERO, cd, 0.0)
	z["crab"] = Vector3(cshore.x + cd.x * 12.0, 0.0, cshore.y + cd.y * 12.0)
	var sign_p := cshore - cd * 3.0
	Props.cylinder(w, 0.07, 0.09, 2.4, Vector3(sign_p.x, Terrain.height_at(sign_p.x, sign_p.y) + 1.1, sign_p.y), Color(0.4, 0.26, 0.14), 6)
	var lbl := Label3D.new()
	lbl.text = "Baía do Caranguejo"
	lbl.font_size = 56
	lbl.pixel_size = 0.006
	lbl.outline_size = 10
	lbl.modulate = Color(1.0, 0.85, 0.4)
	lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lbl.position = Vector3(sign_p.x, Terrain.height_at(sign_p.x, sign_p.y) + 2.9, sign_p.y)
	w.add_child(lbl)
	_keepout(w, cshore, 6.0)
	# grelha da praia (perto da fogueira)
	var gp := shore - dir * 7.0 - perp * 6.5
	Grill.make(w, Vector3(gp.x, Terrain.height_at(gp.x, gp.y), gp.y))

# ------------------------------------------------------------------ Ilha 2 — a Floresta

static func _reel_machine(w: Node3D, pos: Vector3, yaw: float) -> void:
	var root := Node3D.new()
	root.position = pos
	root.rotation.y = yaw
	w.add_child(root)
	var body := StaticBody3D.new()
	root.add_child(body)
	var dark := Color(0.12, 0.13, 0.18)
	Props.box(root, Vector3(1.4, 2.3, 1.0), Vector3(0, 1.15, 0), dark, body, Vector3.ZERO, 0.5)
	var neon := Props.mat(Color(0.25, 0.65, 1.0), 0.3, 0.0, 3.0)
	var orange := Props.mat(Color(1.0, 0.6, 0.1), 0.3, 0.0, 3.0)
	for sx in [-0.68, 0.68]:
		Props.mesh_node(root, BoxMesh.new(), neon, Vector3(sx, 0.95, 0.52)).scale = Vector3(0.06, 1.7, 0.06)
	Props.mesh_node(root, BoxMesh.new(), neon, Vector3(0, 1.82, 0.52)).scale = Vector3(1.4, 0.06, 0.06)
	Props.mesh_node(root, BoxMesh.new(), neon, Vector3(0, 0.12, 0.52)).scale = Vector3(1.4, 0.06, 0.06)
	# funil por onde o peixe entra
	Props.box(root, Vector3(1.0, 0.35, 0.8), Vector3(0, 2.4, 0.0), Color(0.2, 0.25, 0.35))
	# visor com 5 rolos
	var cols := [Color(0.3, 0.9, 0.2), Color(0.95, 0.35, 0.75), Color(0.3, 0.9, 0.2), Color(0.9, 0.2, 0.2), Color(0.3, 0.9, 0.2)]
	for i in 5:
		Props.mesh_node(root, BoxMesh.new(), Props.mat(cols[i], 0.4, 0.0, 1.2), Vector3(-0.5 + i * 0.25, 0.75, 0.52)).scale = Vector3(0.2, 0.3, 0.05)
	var lbl := Label3D.new()
	lbl.text = "Reel of Fortune"
	lbl.font_size = 60
	lbl.pixel_size = 0.0055
	lbl.outline_size = 10
	lbl.modulate = Color(1.0, 0.7, 0.15)
	lbl.position = Vector3(0, 1.4, 0.56)
	root.add_child(lbl)
	var l := OmniLight3D.new()
	l.light_color = Color(0.4, 0.7, 1.0)
	l.light_energy = 1.2
	l.omni_range = 7.0
	l.position = Vector3(0, 1.5, 1.2)
	root.add_child(l)
	var spot := InteractSpot.make(w, pos + Vector3(0, 1.0, 0), "Jogar um peixe no Reel of Fortune (skins de luva!)", 3.5, func() -> void:
		var hud := w.get_tree().get_first_node_in_group("hud")
		if hud:
			hud.open_shop("Cassino"))

static func _island2(w: Node3D, z: Dictionary, rng: RandomNumberGenerator) -> void:
	var c := Terrain.island_center(1)
	var lake := Terrain.LAKE_CENTER
	z["island2"] = _surf(c.x, c.y)
	z["lake"] = Vector3(lake.x, 0.0, lake.y)
	# Marina à beira do lago
	var mp := Vector2.ZERO
	var found := false
	for i in 24:
		var a := i * 0.27
		var p := lake + Vector2(cos(a), sin(a)) * (Terrain.LAKE_R + 2.5)
		if Terrain.height_at(p.x, p.y) > 1.0 and _slope(p.x, p.y) < 0.3:
			mp = p
			found = true
			break
	if not found:
		mp = lake + Vector2(Terrain.LAKE_R + 3.0, 0)
	var face := (lake - mp).normalized()
	StoryNpc.make(w, "marina", "Marina", _surf(mp.x, mp.y, 0.0), atan2(face.x, face.y), "marina")
	z["marina"] = _surf(mp.x, mp.y, 1.0)
	z["spawn2"] = _surf(mp.x + 2.0, mp.y + 2.0, 1.2)
	_keepout(w, mp, 5.0)
	# um píer curto para dentro do lago
	var pier_dir := face
	var pier := Props.build_dock(w, Vector3(mp.x + face.x * 1.5, maxf(Terrain.height_at(mp.x, mp.y), 0.6) + 0.05, mp.y + face.y * 1.5), pier_dir, 7.0, 1.6)
	# sanguessugas (apenas enquanto a missão precisa delas)
	if Story.chapter < 2 or (Story.chapter == 2 and Story.step <= 1):
		var placed := 0
		var tries := 0
		while placed < 8 and tries < 200:
			tries += 1
			var a := rng.randf() * TAU
			var r := Terrain.LAKE_R + rng.randf_range(0.5, 9.0)
			var p := lake + Vector2(cos(a), sin(a)) * r
			var h := Terrain.height_at(p.x, p.y)
			if h < 0.4 or h > 3.5 or p.distance_to(mp) < 3.0:
				continue
			var lp := LeechPickup.new()
			w.add_child(lp)
			lp.global_position = Vector3(p.x, h, p.y)
			placed += 1

# ------------------------------------------------------------------ Ilha 3 — Tropical

static func _island3(w: Node3D, z: Dictionary, rng: RandomNumberGenerator) -> void:
	var c := Terrain.island_center(2)
	z["island3"] = _surf(c.x, c.y)
	var tp := _firm(c + Vector2(8, -3), c, 1.2)
	var ty := _flat_y(tp, 0.5)
	# palmeira grande ao lado do Turista
	var palm := Props.build_palm_mesh(900)
	Props.add_palm(w, palm, Vector3(tp.x + 1.6, ty, tp.y + 1.2), rng)
	var tface := Vector2(-1, 0.5).normalized()
	StoryNpc.make(w, "tourist", "Turista", Vector3(tp.x, ty, tp.y), atan2(tface.x, tface.y), "tourist", true)
	z["tourist"] = Vector3(tp.x, ty + 1.0, tp.y)
	z["spawn3"] = Vector3(tp.x - 2.0, ty + 1.2, tp.y - 2.0)
	_keepout(w, tp, 5.0)
	# Mestre do Churrasco com grelha
	var bp := _firm(c + Vector2(-9, 5), c, 1.2)
	var by := _flat_y(bp, 0.5)
	StoryNpc.make(w, "bbq", "Mestre do Churrasco", Vector3(bp.x, by, bp.y), 0.6, "bbq")
	z["bbq"] = Vector3(bp.x, by + 1.0, bp.y)
	Grill.make(w, Vector3(bp.x + 1.6, by, bp.y + 0.6))
	_keepout(w, bp, 4.0)
	# cactos
	for i in 14:
		var p := c + Vector2.from_angle(rng.randf() * TAU) * rng.randf_range(6.0, 22.0)
		var h := Terrain.height_at(p.x, p.y)
		if h < 1.0 or p.distance_to(tp) < 4.0 or p.distance_to(bp) < 4.0:
			continue
		_cactus(w, Vector3(p.x, h, p.y), rng)

static func _cactus(w: Node3D, pos: Vector3, rng: RandomNumberGenerator) -> void:
	var g := Color(0.25, 0.5, 0.25)
	var body := StaticBody3D.new()
	body.position = pos
	w.add_child(body)
	var hgt := rng.randf_range(1.4, 2.6)
	Props.cylinder(body, 0.22, 0.26, hgt, Vector3(0, hgt / 2.0, 0), g, 8)
	var arm := Props.cylinder(body, 0.12, 0.12, 0.7, Vector3(0.4, hgt * 0.6, 0), g, 8)
	arm.rotation.z = 0.0
	Props.cylinder(body, 0.12, 0.12, 0.5, Vector3(0.28, hgt * 0.5, 0), g, 8).rotation.z = PI / 2.0
	var cs := CollisionShape3D.new()
	var sh := CylinderShape3D.new()
	sh.radius = 0.28
	sh.height = hgt
	cs.shape = sh
	cs.position.y = hgt / 2.0
	body.add_child(cs)

# ------------------------------------------------------------------ Ilha 4 — Penhascos

static func _island4(w: Node3D, z: Dictionary) -> void:
	var c := Terrain.island_center(3)
	var top := Terrain.height_at(c.x, c.y)
	z["island4"] = Vector3(c.x, top, c.y)
	# altar no centro do platô
	var altar := Vector3(c.x, top + 0.3, c.y)
	z["altar"] = altar
	Props.box(w, Vector3(2.6, 0.4, 2.6), Vector3(c.x, top + 0.15, c.y), Color(0.55, 0.53, 0.5), null, Vector3(0, 0.4, 0), 0.9)
	var rng := RandomNumberGenerator.new()
	rng.seed = 5
	for i in 8:
		var a := TAU * i / 8.0
		Props.add_rock(w, Vector3(c.x + cos(a) * 4.0, top, c.y + sin(a) * 4.0), 0.9, rng)
	var lbl := Label3D.new()
	lbl.text = "Altar do Albatroz"
	lbl.font_size = 48
	lbl.pixel_size = 0.006
	lbl.outline_size = 10
	lbl.modulate = Color(1.0, 0.85, 0.4)
	lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lbl.position = altar + Vector3(0, 2.2, 0)
	w.add_child(lbl)
	var spot := InteractSpot.make(w, altar, "Deixar o atum como oferenda", 5.0, Story.offer_tuna)
	spot.condition = func() -> bool: return Story.chapter == 4 and Story.step == 2
	# loja do Vendedor Assustado
	var hp := Vector2(c.x + 8.0, c.y - 1.0)
	var hy := _flat_y(hp, 3.0)
	var face := (c - hp).normalized()
	var shop := Props.build_shop(w, Vector3(hp.x, hy - 0.1, hp.y), atan2(face.x, face.y), "Vendedor Assustado", "LOJA DO PENHASCO")
	(shop["interact"] as Node).connect("interacted", func(_p: Node) -> void: Story.talk("vendor"))
	z["vendor"] = Vector3(hp.x, hy + 1.5, hp.y)
	z["spawn4"] = Vector3(c.x - 3.0, top + 1.2, c.y + 3.0)
	_keepout(w, c, 14.0)

# ------------------------------------------------------------------ Ilha 5 — Vulcão e acampamento

static func _island5(w: Node3D, z: Dictionary) -> void:
	var c := Terrain.island_center(4)
	z["island5"] = _surf(c.x, c.y)
	var rng := RandomNumberGenerator.new()
	rng.seed = 31
	# lava na cratera
	var lava_c := Vector3(c.x, Terrain.CRATER_FLOOR, c.y)
	z["lava"] = lava_c + Vector3(0, 0.3, 0)
	var disc := CylinderMesh.new()
	disc.top_radius = Terrain.CRATER_R * 1.25
	disc.bottom_radius = Terrain.CRATER_R * 1.25
	disc.height = 0.2
	disc.radial_segments = 20
	disc.rings = 1
	var lava_mat := Props.mat(Color(0.85, 0.18, 0.02), 0.4, 0.0, 1.4)
	Props.mesh_node(w, disc, lava_mat, lava_c + Vector3(0, 0.15, 0)).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var glow := OmniLight3D.new()
	glow.light_color = Color(1.0, 0.4, 0.1)
	glow.light_energy = 4.0
	glow.omni_range = 36.0
	glow.position = lava_c + Vector3(0, 3.0, 0)
	w.add_child(glow)
	var smoke := CPUParticles3D.new()
	smoke.amount = 30
	smoke.lifetime = 4.0
	smoke.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	smoke.emission_sphere_radius = 3.0
	smoke.direction = Vector3.UP
	smoke.spread = 12.0
	smoke.gravity = Vector3(0, 1.0, 0)
	smoke.initial_velocity_min = 3.0
	smoke.initial_velocity_max = 6.0
	smoke.scale_amount_min = 1.0
	smoke.scale_amount_max = 2.5
	var sm := SphereMesh.new()
	sm.radius = 1.0
	sm.height = 2.0
	sm.radial_segments = 6
	sm.rings = 3
	smoke.mesh = sm
	var smat := StandardMaterial3D.new()
	smat.albedo_color = Color(0.25, 0.22, 0.22, 0.45)
	smat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	smat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	smoke.material_override = smat
	smoke.position = lava_c + Vector3(0, 1.0, 0)
	w.add_child(smoke)
	# rios de lava descendo a encosta
	for ang in [0.7, 2.5, 4.3]:
		var r := Terrain.CRATER_R * 1.8
		while r < Terrain.VOLCANO_R - 2.0:
			var p := c + Vector2.from_angle(ang + sin(r * 0.5) * 0.12) * r
			var bm := Props.box(w, Vector3(1.3, 0.08, 2.6), Vector3(p.x, Terrain.height_at(p.x, p.y) + 0.06, p.y), Color(0.85, 0.18, 0.02), null, Vector3(0, -ang, 0))
			bm.material_override = lava_mat
			bm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			r += 2.2
	Grill.make(w, z["lava"] + Vector3(-7.0, -0.7, 0.0), true)
	var lspot := InteractSpot.make(w, z["lava"], "Jogar a carcaça na lava", 11.0, Story.throw_carcass_into_lava)
	lspot.condition = func() -> bool: return Story.carrying != "" and Story.chapter == 5
	# acampamento militar ao sul
	var cp := c + Vector2(0.0, 23.0)
	cp = _firm(cp, c, 0.8)
	var cy := _flat_y(cp, 3.0)
	var olive := Color(0.3, 0.34, 0.2)
	for i in 3:
		var tp := cp + Vector2(-7.0 + i * 7.0, 0.0)
		var ty := _flat_y(tp, 1.5)
		var prism := PrismMesh.new()
		prism.size = Vector3(4.2, 2.4, 4.6)
		var tent := Props.mesh_node(w, prism, Props.mat(olive, 0.9), Vector3(tp.x, ty + 1.2, tp.y), Vector3(0, 0.3 * (i - 1), 0))
		Props.box(w, Vector3(0.6, 0.5, 0.6), Vector3(tp.x + 3.0, ty + 0.25, tp.y + 1.5), Color(0.4, 0.34, 0.2))
	for i in 7:
		var sp := cp + Vector2(-8.0 + i * 2.6, 6.0)
		Props.box(w, Vector3(2.0, 0.6, 0.8), Vector3(sp.x, _flat_y(sp, 0.5) + 0.3, sp.y), Color(0.7, 0.62, 0.4), null, Vector3(0, 0, 0), 0.95)
	Props.add_fire(w, Vector3(cp.x + 2.0, cy + 0.05, cp.y + 4.0), 0.9)
	var sface := Vector2(0, 1)
	var sc := StoryNpc.make(w, "scientist", "Cientista", Vector3(cp.x, cy, cp.y + 3.0), 0.0, "scientist")
	z["scientist"] = Vector3(cp.x, cy + 1.0, cp.y + 3.0)
	z["spawn5"] = Vector3(cp.x - 3.0, cy + 1.2, cp.y + 4.0)
	_keepout(w, cp, 14.0)
	# cais militar
	var ddir := Vector2(0.3, 1.0).normalized()
	var dshore := Terrain.find_shore(c, ddir, 0.55)
	var dstart := dshore - ddir * 1.5
	var dock := Props.build_dock(w, Vector3(dstart.x, 0.6, dstart.y), ddir, 14.0, 2.6)
	var dend: Vector3 = dock["end"]
	z["volcano_dock"] = dend
	w.volcano_dock_pos = dend
	w.volcano_dock_dir = ddir
	_keepout(w, dstart + ddir * 8.0, 10.0)
