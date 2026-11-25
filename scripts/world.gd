extends Node3D
## Mundo: ambiente (céu, sol, névoa), terreno com colisão, oceano e todos os props
## (palmeiras, pinheiros, rochas, grama, cabana da loja, doca, farol, alvos).
## Substitui o antigo world.gd mantendo o mesmo visual de base (ilha, cabana, doca, palmeiras, sol, céu),
## agora com colisão real em tudo.

var rng := RandomNumberGenerator.new()
var sun: DirectionalLight3D
var ocean_near: MeshInstance3D
var ocean_cell := 2.0
var player_spawn := Vector3(0, 3, 0)
var spawn_yaw := 0.0
var dock_end := Vector3.ZERO
var shop_pos := Vector3.ZERO
var dock_start := Vector3.ZERO
var dock_dir := Vector2(0, 1)
var volcano_dock_pos := Vector3.ZERO
var volcano_dock_dir := Vector2(0.3, 1.0)
var _keepouts: Array[Dictionary] = []   # {"p": Vector2, "r": float}

func _ready() -> void:
	add_to_group("world")
	rng.seed = 424242
	_build_environment()
	_build_terrain()
	_build_ocean()
	_build_structures()
	StoryWorld.build(self)
	_build_vegetation()
	_build_targets()

func height_at(x: float, z: float) -> float:
	return Terrain.height_at(x, z)

# ------------------------------------------------------------------ ambiente

func _build_environment() -> void:
	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-42, -35, 0)
	sun.light_energy = 1.0
	sun.light_color = Color(1.0, 0.96, 0.88)
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 70.0 if GameState.is_mobile() else 130.0
	if GameState.is_mobile():
		sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.shadow_blur = 1.5
	add_child(sun)
	var sky_mat := ShaderMaterial.new()
	sky_mat.shader = load("res://shaders/sky.gdshader")
	sky_mat.set_shader_parameter("sun_dir", sun.global_transform.basis.z)
	var sky := Sky.new()
	sky.sky_material = sky_mat
	var e := Environment.new()
	e.background_mode = Environment.BG_SKY
	e.sky = sky
	e.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	e.ambient_light_energy = 0.55
	e.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	e.tonemap_exposure = 0.85
	e.glow_enabled = not GameState.is_mobile()
	e.glow_intensity = 0.25
	e.glow_bloom = 0.0
	e.fog_enabled = true
	e.fog_light_color = Color(0.72, 0.86, 0.97)
	e.fog_density = 0.0009
	e.fog_aerial_perspective = 0.6
	if not GameState.is_mobile():
		e.ssao_enabled = true      # só tem efeito no renderizador Forward+ (PC)
		e.ssao_radius = 1.6
		e.ssao_intensity = 1.6
		e.ssil_enabled = false
	e.adjustment_enabled = true
	e.adjustment_saturation = 1.12
	e.adjustment_contrast = 1.05
	var we := WorldEnvironment.new()
	we.environment = e
	add_child(we)

# ------------------------------------------------------------------ terreno e oceano

func _build_terrain() -> void:
	var body := StaticBody3D.new()
	body.name = "Terrain"
	body.collision_layer = 1
	add_child(body)
	var mi := MeshInstance3D.new()
	mi.mesh = Terrain.build_mesh()
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.roughness = 0.95
	mi.material_override = m
	body.add_child(mi)
	var cs := CollisionShape3D.new()
	cs.shape = Terrain.build_collision_shape()
	cs.scale = Vector3(Terrain.STEP, 1.0, Terrain.STEP)
	body.add_child(cs)

func _build_ocean() -> void:
	var shader: Shader = load("res://shaders/ocean.gdshader")
	var tex := Terrain.build_height_texture()
	var near_mat := ShaderMaterial.new()
	near_mat.shader = shader
	near_mat.set_shader_parameter("height_tex", tex)
	near_mat.set_shader_parameter("world_half", Terrain.HALF)
	near_mat.set_shader_parameter("height_min", Terrain.TEX_MIN)
	near_mat.set_shader_parameter("height_max", Terrain.TEX_MAX)
	var pm := PlaneMesh.new()
	pm.size = Vector2(480, 480)
	var cells := 119 if GameState.is_mobile() else 239   # celular: malha de ondas mais leve (4 m por célula)
	ocean_cell = 480.0 / float(cells + 1)
	pm.subdivide_width = cells
	pm.subdivide_depth = cells
	ocean_near = MeshInstance3D.new()
	ocean_near.name = "OceanNear"
	ocean_near.mesh = pm
	ocean_near.material_override = near_mat
	ocean_near.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	ocean_near.extra_cull_margin = 20.0
	add_child(ocean_near)
	var far_mat := near_mat.duplicate() as ShaderMaterial
	far_mat.set_shader_parameter("far_min", 225.0)
	var fm := PlaneMesh.new()
	fm.size = Vector2(12000, 12000)
	var far := MeshInstance3D.new()
	far.name = "OceanFar"
	far.mesh = fm
	far.material_override = far_mat
	far.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	far.extra_cull_margin = 1000.0
	add_child(far)

func _process(_delta: float) -> void:
	var cam := get_viewport().get_camera_3d()
	if cam and ocean_near:
		var p := cam.global_position
		ocean_near.global_position = Vector3(snappedf(p.x, ocean_cell), 0.0, snappedf(p.z, ocean_cell))

# ------------------------------------------------------------------ estruturas

func _flat_height(p: Vector2, r: float) -> float:
	var h := -100.0
	for dx in [-r, 0.0, r]:
		for dz in [-r, 0.0, r]:
			h = maxf(h, Terrain.height_at(p.x + dx, p.y + dz))
	return h

func _build_structures() -> void:
	# doca: sai da praia do lado sul da ilha principal
	dock_dir = Vector2(0.25, 1.0).normalized()
	var shore := Terrain.find_shore(Vector2(0, 0), dock_dir, 0.55)
	var dstart := shore - dock_dir * 1.5
	dock_start = Vector3(dstart.x, 0.6, dstart.y)
	var dock := Props.build_dock(self, dock_start, dock_dir, 22.0)
	dock_end = dock["end"]
	_keepouts.append({"p": dstart + dock_dir * 12.0, "r": 14.0})
	# ponto de nascimento: praia atrás da doca
	var sp := shore - dock_dir * 6.0
	player_spawn = Vector3(sp.x, Terrain.height_at(sp.x, sp.y) + 1.2, sp.y)
	spawn_yaw = atan2(dock_dir.x, dock_dir.y) + PI   # olhando para o mar
	spawn_yaw = atan2(-dock_dir.x, -dock_dir.y)
	_keepouts.append({"p": sp, "r": 7.0})
	# cabana da loja
	var perp := Vector2(-dock_dir.y, dock_dir.x)
	var hp := shore - dock_dir * 8.0 + perp * 20.0
	var guard := 0
	while Terrain.height_at(hp.x, hp.y) < 1.5 and guard < 30:
		hp -= dock_dir * 2.0
		guard += 1
	var base_y := _flat_height(hp, 3.5) - 0.1
	shop_pos = Vector3(hp.x, base_y, hp.y)
	var face := (Vector2(shore.x, shore.y) - hp).normalized()
	var shop := Props.build_shop(self, shop_pos, atan2(face.x, face.y))
	(shop["interact"] as Node).connect("interacted", _on_shop_interacted)
	_keepouts.append({"p": hp, "r": 10.0})
	# fogueira e guarda-sóis na praia
	var fp := shore - dock_dir * 7.0 - perp * 9.0
	Props.add_fire(self, Vector3(fp.x, Terrain.height_at(fp.x, fp.y) + 0.05, fp.y), 1.0)
	_keepouts.append({"p": fp, "r": 4.0})
	for i in 2:
		var up := fp + perp * (4.0 + i * 3.5) - dock_dir * 1.5
		var uy := Terrain.height_at(up.x, up.y)
		Props.cylinder(self, 0.03, 0.03, 2.2, Vector3(up.x, uy + 1.0, up.y), Color(0.9, 0.9, 0.9), 6)
		var um := Props.cylinder(self, 0.0, 1.4, 0.45, Vector3(up.x, uy + 2.1, up.y), [Color(0.9, 0.2, 0.2), Color(0.2, 0.55, 0.9)][i], 10)
		um.rotation.z = 0.0
		_keepouts.append({"p": up, "r": 1.5})
	# tochas ao longo do caminho da cabana
	for i in 3:
		var tp := shore - dock_dir * 7.0 + perp * (6.0 + i * 5.0)
		var ty := Terrain.height_at(tp.x, tp.y)
		Props.cylinder(self, 0.05, 0.07, 1.6, Vector3(tp.x, ty + 0.8, tp.y), Color(0.35, 0.22, 0.12), 6)
		Props.add_fire(self, Vector3(tp.x, ty + 1.65, tp.y), 0.35, false)

func spawn_motorboat() -> void:
	if get_tree().get_nodes_in_group("boats_motor").is_empty():
		var p := Vector2(dock_end.x, dock_end.z) + dock_dir * 5.0
		var b := Boat.spawn(self, Vector3(p.x, 0, p.y), atan2(dock_dir.x, dock_dir.y), "motor")
		b.add_to_group("boats_motor")

func spawn_military_boat() -> void:
	if get_tree().get_nodes_in_group("boats_military").is_empty() and volcano_dock_pos != Vector3.ZERO:
		var p := Vector2(volcano_dock_pos.x, volcano_dock_pos.z) + volcano_dock_dir * 6.0
		var b := Boat.spawn(self, Vector3(p.x, 0, p.y), atan2(volcano_dock_dir.x, volcano_dock_dir.y), "military")
		b.add_to_group("boats_military")

func _on_shop_interacted(_player: Node) -> void:
	var hud := get_tree().get_first_node_in_group("hud")
	if hud:
		hud.open_shop()

func _free_spot(p: Vector2) -> bool:
	for k in _keepouts:
		if p.distance_to(k["p"]) < float(k["r"]):
			return false
	return true

func _slope(x: float, z: float) -> float:
	var dx := Terrain.height_at(x + 1.0, z) - Terrain.height_at(x - 1.0, z)
	var dz := Terrain.height_at(x, z + 1.0) - Terrain.height_at(x, z - 1.0)
	return sqrt(dx * dx + dz * dz) * 0.5

# ------------------------------------------------------------------ vegetação

func _build_vegetation() -> void:
	var palm_meshes: Array[ArrayMesh] = []
	for i in 4:
		palm_meshes.append(Props.build_palm_mesh(100 + i))
	var grass := PackedVector3Array()
	for isl in Terrain.ISLANDS:
		var c: Vector2 = isl["c"]
		var r: float = isl["r"]
		var area_factor := (r / 68.0) * (r / 68.0)
		# palmeiras (praia e borda do gramado)
		var style: String = isl["style"]
		var palms := int(46 * area_factor) + 6
		if style == "cliffs":
			palms = 0
		elif style == "volcano":
			palms = 16
		var placed := 0
		var tries := 0
		while placed < palms and tries < palms * 30:
			tries += 1
			var p := c + Vector2.from_angle(rng.randf() * TAU) * rng.randf() * r * 0.8
			var h := Terrain.height_at(p.x, p.y)
			if h < 0.8 or h > (1.8 if style == "volcano" else 3.6) or _slope(p.x, p.y) > 0.45 or not _free_spot(p):
				continue
			Props.add_palm(self, palm_meshes[rng.randi() % palm_meshes.size()], Vector3(p.x, h, p.y), rng)
			placed += 1
		# pinheiros (interior mais alto)
		var pines := int(34 * area_factor) + 3
		if style in ["cliffs", "volcano", "tropical"]:
			pines = 0
		placed = 0
		tries = 0
		while placed < pines and tries < pines * 40:
			tries += 1
			var p := c + Vector2.from_angle(rng.randf() * TAU) * rng.randf() * r * 0.55
			var h := Terrain.height_at(p.x, p.y)
			if h < 2.4 or _slope(p.x, p.y) > 0.4 or not _free_spot(p):
				continue
			Props.add_pine(self, Vector3(p.x, h, p.y), rng)
			placed += 1
		# arbustos e árvores com flores rosas
		for i in (0 if style in ["volcano", "cliffs"] else int(30 * area_factor) + 4):
			var p := c + Vector2.from_angle(rng.randf() * TAU) * rng.randf() * r * 0.7
			var h := Terrain.height_at(p.x, p.y)
			if h < 1.3 or not _free_spot(p) or _slope(p.x, p.y) > 0.5:
				continue
			if rng.randf() < 0.18:
				var n := Node3D.new()
				n.position = Vector3(p.x, h, p.y)
				add_child(n)
				Props.cylinder(n, 0.1, 0.16, 1.6, Vector3(0, 0.8, 0), Color(0.35, 0.22, 0.14), 6)
				for j in 4:
					Props.sphere(n, rng.randf_range(0.5, 0.8), Vector3(rng.randf_range(-0.5, 0.5), 1.8 + rng.randf() * 0.5, rng.randf_range(-0.5, 0.5)), Color(0.95, 0.4 + rng.randf() * 0.2, 0.65), Vector3(1, 0.8, 1))
			else:
				Props.add_bush(self, Vector3(p.x, h, p.y), rng)
		# rochas
		for i in int(26 * area_factor) + 3:
			var p := c + Vector2.from_angle(rng.randf() * TAU) * rng.randf_range(0.3, 1.05) * r
			var h := Terrain.height_at(p.x, p.y)
			if h < -0.9 or h > 4.5 or not _free_spot(p):
				continue
			Props.add_rock(self, Vector3(p.x, h, p.y), rng.randf_range(0.4, 1.6), rng)
		# grama em lâminas
		var blades := int((3500 if GameState.is_mobile() else 9000) * area_factor) + 400
		if style in ["volcano", "cliffs", "tropical"]:
			blades = 0
		for i in blades:
			var p := c + Vector2.from_angle(rng.randf() * TAU) * sqrt(rng.randf()) * r * 0.75
			var h := Terrain.height_at(p.x, p.y)
			if h < 1.2 or _slope(p.x, p.y) > 0.5 or not _free_spot(p):
				continue
			grass.append(Vector3(p.x, h - 0.02, p.y))
	Props.add_grass(self, grass, rng)

# ------------------------------------------------------------------ alvos de tiro

func _build_targets() -> void:
	var script: GDScript = load("res://scripts/world/target.gd")
	# boias flutuando perto da doca
	var placed := 0
	var tries := 0
	while placed < 6 and tries < 200:
		tries += 1
		var a := rng.randf_range(-0.9, 0.9)
		var dir := dock_dir.rotated(a)
		var p := Vector2(dock_end.x, dock_end.z) + dir * rng.randf_range(14.0, 34.0)
		if Terrain.depth_at(p.x, p.y) < 2.5:
			continue
		var t := StaticBody3D.new()
		t.set_script(script)
		t.set("kind", "buoy")
		t.set("reward", 10)
		t.position = Vector3(p.x, 0.0, p.y)
		add_child(t)
		placed += 1
	# garrafas em postes na praia, ao lado do ponto de nascimento
	var perp := Vector2(-dock_dir.y, dock_dir.x)
	for i in 5:
		var bp := Vector2(player_spawn.x, player_spawn.z) - dock_dir * 4.0 - perp * (4.0 + i * 1.6)
		var by := Terrain.height_at(bp.x, bp.y)
		var post := Props.cylinder(self, 0.05, 0.06, 0.9, Vector3(bp.x, by + 0.4, bp.y), Color(0.4, 0.26, 0.14), 6)
		post.name = "Post"
		var t := StaticBody3D.new()
		t.set_script(script)
		t.set("kind", "bottle")
		t.set("reward", 5)
		t.position = Vector3(bp.x, by + 0.85, bp.y)
		add_child(t)
