class_name Rifle
extends Node3D
## Sistema de armas em primeira pessoa (faca, pistola, escopeta, SMG, fuzil, sniper dourado e dinamite).
## Todas usam raycast real contra terreno, peixes, alvos e chefes; balas atravessam a água rasa.
## Dados de cada arma em WeaponDB. Botão direito (segurar) aproxima/mira; a sniper usa a luneta.

const RANGE := 400.0
const NORMAL_FOV := 75.0

var active := false
var player: Node3D
var cam: Camera3D
var hud: Node
var model: Node3D
var muzzle: Node3D
var bolt: Node3D
var flash: OmniLight3D
var flash_mesh: MeshInstance3D

var weapon_id := "knife"
var data: Dictionary = {}
var scoped := false
var reloading := false
var _cooldown := 0.0
var _kick := 0.0
var _reload_t := 0.0
var _t := 0.0
var _rng := RandomNumberGenerator.new()
var _scope_amount := 0.0
var _swing := 0.0

func setup(p: Node3D, c: Camera3D, h: Node) -> void:
	player = p
	cam = c
	hud = h
	_rng.randomize()
	set_weapon(GameState.current_weapon if GameState.current_weapon in GameState.owned_weapons else "knife")
	visible = false

func set_weapon(id: String) -> void:
	weapon_id = id
	reloading = false
	if id == "dynamite":
		data = {"name": "Dinamite", "kind": "bomb", "interval": 0.8, "zoom": 70.0, "scope": false}
	else:
		data = WeaponDB.data(id)
		if id != "fists":
			GameState.current_weapon = id
	_build_model()
	scoped = false
	if hud:
		hud.refresh_hotbar()

func is_gun() -> bool:
	return data.get("kind", "") == "gun"

# ------------------------------------------------------------------ modelos

func _gold(rough: float = 0.22) -> StandardMaterial3D:
	return Props.mat(Color(0.85, 0.55, 0.08), rough, 0.85)

func _dark(rough: float = 0.4) -> StandardMaterial3D:
	return Props.mat(Color(0.08, 0.08, 0.09), rough, 0.6)

func _steel(rough: float = 0.35) -> StandardMaterial3D:
	return Props.mat(Color(0.66, 0.68, 0.74), rough, 0.45)

func _bx(s: Vector3) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = s
	return b

func _cyl(parent: Node3D, r: float, h: float, pos: Vector3, mat: Material) -> MeshInstance3D:
	var cm := CylinderMesh.new()
	cm.top_radius = r
	cm.bottom_radius = r
	cm.height = h
	cm.radial_segments = 10
	cm.rings = 1
	var mi := Props.mesh_node(parent, cm, mat, pos)
	mi.rotation.x = PI / 2.0
	return mi

func _build_model() -> void:
	if model:
		model.queue_free()
	model = Node3D.new()
	add_child(model)
	bolt = null
	var muz_z := -0.9
	match weapon_id:
		"knife":
			Props.mesh_node(model, _bx(Vector3(0.025, 0.09, 0.55)), Props.mat(Color(0.82, 0.84, 0.9), 0.15, 0.3), Vector3(0, 0, -0.38))
			for i in 7:
				Props.mesh_node(model, _bx(Vector3(0.02, 0.03, 0.04)), Props.mat(Color(0.7, 0.72, 0.78), 0.2, 0.3), Vector3(0, -0.055, -0.15 - i * 0.07))
			Props.mesh_node(model, _bx(Vector3(0.04, 0.05, 0.16)), _dark(0.8), Vector3(0, 0, -0.02))
			Props.mesh_node(model, _bx(Vector3(0.07, 0.02, 0.03)), _steel(), Vector3(0, 0, -0.1))
			model.rotation = Vector3(0.2, 0.0, 0.0)
			muz_z = -0.7
		"pistol":
			Props.mesh_node(model, _bx(Vector3(0.05, 0.07, 0.3)), _steel(), Vector3(0, 0.03, -0.12))
			Props.mesh_node(model, _bx(Vector3(0.045, 0.14, 0.07)), _dark(0.7), Vector3(0, -0.07, 0.0), Vector3(0.15, 0, 0))
			_cyl(model, 0.012, 0.1, Vector3(0, 0.03, -0.32), _dark())
			muz_z = -0.38
		"shotgun":
			_cyl(model, 0.022, 0.85, Vector3(0, 0.03, -0.55), _steel())
			_cyl(model, 0.018, 0.55, Vector3(0, -0.03, -0.4), _steel())
			Props.mesh_node(model, _bx(Vector3(0.07, 0.1, 0.3)), _dark(0.7), Vector3(0, 0, 0.05))
			Props.mesh_node(model, _bx(Vector3(0.06, 0.12, 0.42)), Props.mat(Color(0.45, 0.28, 0.12), 0.7), Vector3(0, -0.05, 0.4), Vector3(-0.15, 0, 0))
			Props.mesh_node(model, _bx(Vector3(0.07, 0.07, 0.2)), Props.mat(Color(0.45, 0.28, 0.12), 0.7), Vector3(0, -0.06, -0.35))
			muz_z = -1.0
		"smg":
			Props.mesh_node(model, _bx(Vector3(0.07, 0.1, 0.5)), _dark(0.5), Vector3(0, 0, -0.1))
			_cyl(model, 0.015, 0.25, Vector3(0, 0.02, -0.45), _steel())
			Props.mesh_node(model, _bx(Vector3(0.045, 0.22, 0.07)), _dark(0.5), Vector3(0, -0.15, -0.05))
			Props.mesh_node(model, _bx(Vector3(0.05, 0.12, 0.07)), _dark(0.7), Vector3(0, -0.09, 0.15), Vector3(0.25, 0, 0))
			Props.mesh_node(model, _bx(Vector3(0.04, 0.05, 0.3)), _steel(), Vector3(0, 0.0, 0.35))
			muz_z = -0.6
		"ar":
			Props.mesh_node(model, _bx(Vector3(0.07, 0.11, 0.6)), Props.mat(Color(0.18, 0.2, 0.16), 0.5, 0.5), Vector3(0, 0, -0.1))
			_cyl(model, 0.016, 0.55, Vector3(0, 0.02, -0.7), _steel())
			Props.mesh_node(model, _bx(Vector3(0.05, 0.2, 0.07)), _dark(0.5), Vector3(0, -0.14, -0.04), Vector3(-0.2, 0, 0))
			Props.mesh_node(model, _bx(Vector3(0.06, 0.12, 0.4)), Props.mat(Color(0.18, 0.2, 0.16), 0.6), Vector3(0, -0.02, 0.4), Vector3(-0.1, 0, 0))
			Props.mesh_node(model, _bx(Vector3(0.04, 0.05, 0.12)), _dark(), Vector3(0, 0.1, -0.05))
			muz_z = -1.0
		"sniper":
			_build_sniper()
			muz_z = -1.42
		"fists":
			muz_z = -0.5
		"dynamite":
			var red := Props.mat(Color(0.8, 0.1, 0.08), 0.6)
			for i in 3:
				_cyl(model, 0.03, 0.26, Vector3((i - 1) * 0.065, 0, -0.15), red)
			_cyl(model, 0.008, 0.18, Vector3(0, 0.05, -0.34), Props.mat(Color(0.2, 0.15, 0.1), 0.9))
			Props.sphere(model, 0.018, Vector3(0, 0.05, -0.44), Color(1.0, 0.6, 0.1)).material_override = Props.mat(Color(1.0, 0.6, 0.1), 0.3, 0.0, 3.0)
			muz_z = -0.4
	_add_hands()
	muzzle = Node3D.new()
	muzzle.position = Vector3(0, 0.015, muz_z)
	model.add_child(muzzle)
	flash = OmniLight3D.new()
	flash.light_color = Color(1.0, 0.8, 0.4)
	flash.light_energy = 0.0
	flash.omni_range = 8.0
	muzzle.add_child(flash)
	flash_mesh = MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.09
	sm.height = 0.18
	sm.radial_segments = 8
	sm.rings = 4
	flash_mesh.mesh = sm
	var fm := StandardMaterial3D.new()
	fm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	fm.albedo_color = Color(1.0, 0.85, 0.4)
	flash_mesh.material_override = fm
	flash_mesh.visible = false
	flash_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	muzzle.add_child(flash_mesh)
	model.scale = Vector3.ONE * (0.75 if weapon_id == "sniper" else 1.0)

func _add_hands() -> void:
	match weapon_id:
		"knife": Props.hand(model, Vector3(0.0, -0.03, 0.0), Vector3(0.1, 0, 0))
		"pistol":
			Props.hand(model, Vector3(0.0, -0.1, 0.02), Vector3(0.3, 0, 0))
			Props.hand(model, Vector3(0.03, -0.1, 0.04), Vector3(0.3, 0, 0), -1.0)
		"shotgun", "smg", "ar":
			Props.hand(model, Vector3(0.0, -0.1, 0.12))
			Props.hand(model, Vector3(0.0, -0.08, -0.42), Vector3.ZERO, -1.0)
		"sniper":
			Props.hand(model, Vector3(0.0, -0.13, 0.28))
			Props.hand(model, Vector3(0.0, -0.1, -0.5), Vector3.ZERO, -1.0)
		"dynamite": Props.hand(model, Vector3(0.0, -0.1, -0.15), Vector3(0.2, 0, 0))
		"fists":
			Props.hand(model, Vector3(-0.2, -0.12, -0.3), Vector3(0.2, 0.2, 0), 1.0)
			Props.hand(model, Vector3(0.2, -0.12, -0.3), Vector3(0.2, -0.2, 0), -1.0)

func _build_sniper() -> void:
	Props.mesh_node(model, _bx(Vector3(0.075, 0.1, 0.5)), _gold(), Vector3(0, 0, -0.05))
	Props.mesh_node(model, _bx(Vector3(0.07, 0.15, 0.4)), _gold(0.3), Vector3(0, -0.04, 0.42), Vector3(-0.12, 0, 0))
	Props.mesh_node(model, _bx(Vector3(0.06, 0.06, 0.12)), _dark(), Vector3(0, -0.075, 0.2))
	Props.mesh_node(model, _bx(Vector3(0.08, 0.09, 0.55)), _dark(0.6), Vector3(0, -0.01, -0.5))
	_cyl(model, 0.016, 0.7, Vector3(0, 0.015, -0.98), Props.mat(Color(0.12, 0.12, 0.13), 0.3, 0.8))
	_cyl(model, 0.026, 0.1, Vector3(0, 0.015, -1.35), _gold(0.25))
	Props.mesh_node(model, _bx(Vector3(0.05, 0.14, 0.09)), _gold(), Vector3(0, -0.12, -0.02))
	for sx in [-1.0, 1.0]:
		var leg := Props.cylinder(model, 0.006, 0.006, 0.22, Vector3(sx * 0.04, -0.12, -0.75), Color(0.1, 0.1, 0.1), 6)
		leg.rotation = Vector3(-0.3, 0, sx * -0.3)
	_cyl(model, 0.036, 0.34, Vector3(0, 0.1, -0.12), Props.mat(Color(0.08, 0.08, 0.09), 0.3, 0.7))
	_cyl(model, 0.05, 0.1, Vector3(0, 0.1, -0.32), _gold(0.25))
	var oc := _cyl(model, 0.046, 0.004, Vector3(0, 0.1, -0.375), Props.mat(Color(0.25, 0.45, 0.95), 0.05, 0.3, 0.6))
	oc.rotation.x = PI / 2.0
	_cyl(model, 0.04, 0.08, Vector3(0, 0.1, 0.1), _gold(0.25))
	for z in [-0.02, -0.22]:
		Props.mesh_node(model, _bx(Vector3(0.03, 0.05, 0.03)), _dark(), Vector3(0, 0.055, z))
	bolt = Node3D.new()
	bolt.position = Vector3(0.05, 0.02, 0.05)
	model.add_child(bolt)
	_cyl(bolt, 0.008, 0.07, Vector3(0.035, 0, 0), Props.mat(Color(0.15, 0.15, 0.15), 0.3, 0.8)).rotation = Vector3(0, 0, PI / 2.0)
	Props.sphere(bolt, 0.016, Vector3(0.08, 0, 0), Color(0.85, 0.55, 0.08), Vector3.ONE, 0.2)

func equip(on: bool) -> void:
	active = on
	visible = on
	if not on:
		scoped = false
		reloading = false
		_scope_amount = 0.0
		cam.fov = NORMAL_FOV
		hud.set_scope(0.0)

# ------------------------------------------------------------------ loop

func _process(delta: float) -> void:
	_t += delta
	_cooldown = maxf(_cooldown - delta, 0.0)
	if active and not player.ui_open:
		scoped = Input.is_action_pressed("aim") and not reloading and weapon_id != "knife"
		var auto: bool = data.get("auto", false)
		if Input.is_action_just_pressed("shoot") or (auto and Input.is_action_pressed("shoot")):
			_try_fire()
		if Input.is_action_just_pressed("reload") and not reloading and is_gun():
			_start_reload()
	else:
		scoped = false
	_animate(delta)

func _try_fire() -> void:
	if reloading or _cooldown > 0.0 or player.vehicle_blocks_fire():
		return
	var kind: String = data.get("kind", "gun")
	if kind == "melee":
		_cooldown = float(data["interval"])
		_swing = 1.0
		Sfx.play("cast", -6.0, 1.6)
		_ray_attack(1, 0.0, float(data["damage"]), float(data["range"]))
		return
	if kind == "bomb":
		if not GameState.use_dynamite():
			hud.toast("Sem dinamite! Compre na loja.", Color(1.0, 0.6, 0.4))
			return
		_cooldown = float(data["interval"])
		_throw_bomb()
		if GameState.dynamite <= 0:
			player.call_deferred("_equip", "rifle")
		return
	if GameState.ammo_mag(weapon_id) <= 0:
		Sfx.play("dry", -4.0)
		if GameState.ammo_reserve(weapon_id) > 0:
			_start_reload()
		else:
			hud.toast("Sem munição! Compre na loja.", Color(1.0, 0.6, 0.4))
		return
	GameState.consume_bullet(weapon_id)
	_cooldown = float(data["interval"])
	_kick = 1.0
	var pitch := 1.0 + (0.9 if weapon_id == "pistol" else 0.0) - (0.25 if weapon_id == "shotgun" else 0.0)
	Sfx.play("shot", -2.0 if data.get("auto", false) else 0.0, _rng.randf_range(0.95, 1.05) * clampf(pitch, 0.7, 1.9))
	_flash()
	var spread := float(data["spread"]) * (0.1 if scoped and weapon_id == "sniper" else (0.55 if scoped else 1.0))
	_ray_attack(int(data["pellets"]), spread, float(data["damage"]), RANGE)
	player.add_shake(0.02 if not scoped else 0.008)
	player.add_recoil(float(data.get("kick", 0.02)) * (0.6 if scoped else 1.0))
	if bolt:
		var tw := create_tween()
		tw.tween_interval(0.25)
		tw.tween_property(bolt, "position:z", 0.17, 0.12)
		tw.tween_property(bolt, "position:z", 0.05, 0.12)
	if GameState.ammo_mag(weapon_id) <= 0 and GameState.ammo_reserve(weapon_id) > 0:
		hud.toast("Pente vazio - R para recarregar", Color(1.0, 0.85, 0.5))

func _flash() -> void:
	flash.light_energy = 6.0
	flash_mesh.visible = true
	flash_mesh.rotation.z = _rng.randf() * TAU
	var tw := create_tween()
	tw.tween_interval(0.05)
	tw.tween_callback(func() -> void:
		if is_instance_valid(flash):
			flash.light_energy = 0.0
			flash_mesh.visible = false)

func _throw_bomb() -> void:
	Sfx.play("cast", -2.0, 0.7)
	_swing = 1.0
	var fwd := -cam.global_transform.basis.z
	var d := Dynamite.new()
	get_tree().current_scene.add_child(d)
	d.global_position = cam.global_position + fwd * 0.6 + Vector3(0, -0.2, 0)
	d.vel = (fwd + Vector3(0, 0.28, 0)).normalized() * 19.0 + player.velocity * 0.5

## Dispara "pellets" raios com dispersão (graus); usa o mesmo caminho para tiro e golpe de faca.
func _ray_attack(pellets: int, spread_deg: float, damage: float, max_range: float) -> void:
	var space := get_world_3d().direct_space_state
	var origin := cam.global_position
	var basis := cam.global_transform.basis
	var scene := get_tree().current_scene
	var hit_marker := false
	for n in pellets:
		var spread := deg_to_rad(spread_deg)
		var dir := -basis.z
		dir = (dir + basis.x * _rng.randf_range(-spread, spread) + basis.y * _rng.randf_range(-spread, spread)).normalized()
		var to := origin + dir * max_range
		var q := PhysicsRayQueryParameters3D.create(origin, to, 1 | 4 | 8)
		q.collide_with_areas = true
		q.exclude = [player.get_rid()]
		var hit := space.intersect_ray(q)
		var t_hit := max_range
		if not hit.is_empty():
			t_hit = origin.distance_to(hit["position"])
		var t_w := INF
		if dir.y < -0.0001 and origin.y > Terrain.WATER_LEVEL:
			t_w = (Terrain.WATER_LEVEL - origin.y) / dir.y
		var end := origin + dir * t_hit
		if not hit.is_empty():
			var col: Object = hit["collider"]
			var is_creature: bool = col is Fish or (col is Node and col.is_in_group("targets"))
			if is_creature:
				if t_w < t_hit and max_range > 10.0:
					Fx.splash(scene, origin + dir * t_w, 0.6)
				col.call("hit", damage, hit["position"])
				hit_marker = true
				if col is Fish:
					hud.show_target_health(col.display_name(), maxf(col.hp, 0.0) / col.max_hp)
				Fx.spark(scene, hit["position"])
			elif t_w < t_hit:
				end = origin + dir * t_w
				if max_range > 10.0:
					Fx.splash(scene, end, 1.0)
					Sfx.play_at("splash", scene, end, -2.0)
			else:
				Fx.puff(scene, hit["position"], Color(0.8, 0.72, 0.5))
				Sfx.play_at("impact", scene, hit["position"], -4.0)
		elif t_w < max_range and max_range > 10.0:
			end = origin + dir * t_w
			Fx.splash(scene, end, 1.0)
			Sfx.play_at("splash", scene, end, -2.0)
		if max_range > 10.0 and n < 3:
			Fx.tracer(scene, muzzle.global_position, end)
			if n == 0:
				Net.send_shot(muzzle.global_position, end)
	if hit_marker:
		hud.hit_marker()

func _start_reload() -> void:
	if reloading or not is_gun():
		return
	if GameState.ammo_mag(weapon_id) >= int(data["mag"]):
		return
	if GameState.ammo_reserve(weapon_id) <= 0:
		hud.toast("Sem munição reserva!", Color(1.0, 0.6, 0.4))
		return
	reloading = true
	_reload_t = 0.0
	Sfx.play("reload")
	hud.toast("Recarregando...", Color(0.9, 0.9, 0.9))
	var wid := weapon_id
	var tw := create_tween()
	tw.tween_interval(float(data["reload"]))
	tw.tween_callback(func() -> void:
		GameState.reload_weapon(wid)
		if weapon_id == wid:
			reloading = false)

func _animate(delta: float) -> void:
	_kick = maxf(_kick - delta * 5.0, 0.0)
	_swing = maxf(_swing - delta * 4.0, 0.0)
	var zoom: float = data.get("zoom", 70.0)
	var target_scope := 1.0 if scoped else 0.0
	_scope_amount = lerpf(_scope_amount, target_scope, clampf(14.0 * delta, 0.0, 1.0))
	cam.fov = lerpf(NORMAL_FOV, zoom, _scope_amount) if active else NORMAL_FOV
	var has_overlay: bool = data.get("scope", false)
	var overlay := smoothstep(0.7, 0.95, _scope_amount) if has_overlay else 0.0
	hud.set_scope(overlay if active else 0.0)
	visible = active and overlay < 0.5
	var speed: float = player.velocity.length()
	var sway := Vector3(sin(_t * 1.6) * 0.004, cos(_t * 2.1) * 0.004, 0.0)
	var walk := Vector3(sin(_t * 8.0) * 0.008, absf(cos(_t * 8.0)) * 0.01, 0.0) * clampf(speed / 5.0, 0.0, 1.5) * (1.0 - _scope_amount)
	var reload_dip := 0.0
	if reloading:
		_reload_t += delta
		reload_dip = sin(clampf(_reload_t / maxf(float(data.get("reload", 1.5)), 0.1), 0.0, 1.0) * PI)
	var ads := Vector3(-0.22, 0.08, 0.1) if weapon_id == "sniper" else Vector3(-0.3, 0.06, 0.12)
	var base := Vector3(0.0, -0.01, 0.0).lerp(ads, _scope_amount)
	model.position = base + sway + walk + Vector3(0, -0.25 * reload_dip, 0.1 * _kick) + Vector3(0, -0.05 * _swing, -0.35 * _swing)
	var rot_base := Vector3(0.2, 0.0, 0.0) if weapon_id == "knife" else Vector3.ZERO
	model.rotation = rot_base + Vector3(0.05 * _kick + 0.7 * reload_dip - 0.9 * _swing, 0.0, -0.25 * reload_dip)
