class_name Rifle
extends Node3D
## Rifle dourado com luneta. Clique esquerdo dispara (ação por ferrolho), botão direito (segurar) mira,
## R recarrega. O tiro é um raycast real contra terreno, peixes e alvos; balas atravessam a água rasa.

const DAMAGE := 2.0
const FIRE_INTERVAL := 0.75
const RANGE := 400.0
const SCOPE_FOV := 18.0
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

var scoped := false
var reloading := false
var _cooldown := 0.0
var _kick := 0.0
var _kick_rot := 0.0
var _reload_t := 0.0
var _t := 0.0
var _rng := RandomNumberGenerator.new()
var _scope_amount := 0.0

const HIP_POS := Vector3(0.0, 0.0, 0.0)

func setup(p: Node3D, c: Camera3D, h: Node) -> void:
	player = p
	cam = c
	hud = h
	_rng.randomize()
	_build_model()
	visible = false

func _gold(rough: float = 0.22) -> StandardMaterial3D:
	return Props.mat(Color(0.85, 0.55, 0.08), rough, 0.85)

func _dark(rough: float = 0.4) -> StandardMaterial3D:
	return Props.mat(Color(0.08, 0.08, 0.09), rough, 0.6)

func _build_model() -> void:
	model = Node3D.new()
	add_child(model)
	# corpo (receiver) + coronha + guarda-mão
	Props.mesh_node(model, _box_mesh(Vector3(0.075, 0.1, 0.5)), _gold(), Vector3(0, 0, -0.05))
	Props.mesh_node(model, _box_mesh(Vector3(0.07, 0.15, 0.4)), _gold(0.3), Vector3(0, -0.04, 0.42), Vector3(-0.12, 0, 0))
	Props.mesh_node(model, _box_mesh(Vector3(0.06, 0.06, 0.12)), _dark(), Vector3(0, -0.075, 0.2))
	Props.mesh_node(model, _box_mesh(Vector3(0.08, 0.09, 0.55)), _dark(0.6), Vector3(0, -0.01, -0.5))
	# cano e freio de boca
	var barrel := Props.cylinder(model, 0.016, 0.016, 0.7, Vector3(0, 0.015, -0.98), Color(0.12, 0.12, 0.13), 10, 0.3, 0.8)
	barrel.rotation.x = PI / 2.0
	var brake := Props.cylinder(model, 0.026, 0.026, 0.1, Vector3(0, 0.015, -1.35), Color(0.95, 0.68, 0.1), 10, 0.25, 1.0)
	brake.rotation.x = PI / 2.0
	# carregador
	Props.mesh_node(model, _box_mesh(Vector3(0.05, 0.14, 0.09)), _gold(), Vector3(0, -0.12, -0.02))
	# bípode
	for sx in [-1.0, 1.0]:
		var leg := Props.cylinder(model, 0.006, 0.006, 0.22, Vector3(sx * 0.04, -0.12, -0.75), Color(0.1, 0.1, 0.1), 6)
		leg.rotation = Vector3(-0.3, 0, sx * -0.3)
	# luneta grande
	var tube := Props.cylinder(model, 0.036, 0.036, 0.34, Vector3(0, 0.1, -0.12), Color(0.08, 0.08, 0.09), 14, 0.3, 0.7)
	tube.rotation.x = PI / 2.0
	var obj := Props.cylinder(model, 0.05, 0.036, 0.1, Vector3(0, 0.1, -0.32), Color(0.95, 0.68, 0.1), 14, 0.25, 1.0)
	obj.rotation.x = PI / 2.0
	var oc := Props.cylinder(model, 0.046, 0.046, 0.004, Vector3(0, 0.1, -0.375), Color(0.2, 0.4, 0.9), 14, 0.05, 0.3)
	oc.rotation.x = PI / 2.0
	oc.material_override = Props.mat(Color(0.25, 0.45, 0.95), 0.05, 0.3, 0.6)
	var eye := Props.cylinder(model, 0.044, 0.036, 0.08, Vector3(0, 0.1, 0.1), Color(0.95, 0.68, 0.1), 14, 0.25, 1.0)
	eye.rotation.x = PI / 2.0
	for z in [-0.02, -0.22]:
		Props.mesh_node(model, _box_mesh(Vector3(0.03, 0.05, 0.03)), _dark(), Vector3(0, 0.055, z))
	# ferrolho
	bolt = Node3D.new()
	bolt.position = Vector3(0.05, 0.02, 0.05)
	model.add_child(bolt)
	var stem := Props.cylinder(bolt, 0.008, 0.008, 0.07, Vector3(0.035, 0, 0), Color(0.15, 0.15, 0.15), 6, 0.3, 0.8)
	stem.rotation.z = PI / 2.0
	Props.sphere(bolt, 0.016, Vector3(0.08, 0, 0), Color(0.95, 0.68, 0.1), Vector3.ONE, 0.2)
	muzzle = Node3D.new()
	muzzle.position = Vector3(0, 0.015, -1.42)
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
	model.scale = Vector3.ONE * 0.75

func _box_mesh(s: Vector3) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = s
	return b

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
		scoped = Input.is_action_pressed("aim") and not reloading
		if Input.is_action_just_pressed("shoot"):
			_try_fire()
		if Input.is_action_just_pressed("reload") and not reloading:
			_start_reload()
	else:
		scoped = false
	_animate(delta)

func _try_fire() -> void:
	if reloading or _cooldown > 0.0:
		return
	if GameState.ammo_mag <= 0:
		Sfx.play("dry", -4.0)
		if GameState.ammo_reserve > 0:
			_start_reload()
		else:
			hud.toast("Sem munição! Compre na loja.", Color(1.0, 0.6, 0.4))
		return
	GameState.consume_bullet()
	_cooldown = FIRE_INTERVAL
	_kick = 1.0
	Sfx.play("shot", 0.0, _rng.randf_range(0.95, 1.05))
	_flash()
	_shoot_ray()
	player.add_shake(0.02 if not scoped else 0.008)
	player.add_recoil(0.035 if not scoped else 0.02)
	# ferrolho após o disparo
	var tw := create_tween()
	tw.tween_interval(0.25)
	tw.tween_property(bolt, "position:z", 0.17, 0.12)
	tw.tween_property(bolt, "position:z", 0.05, 0.12)
	if GameState.ammo_mag > 0:
		return
	hud.toast("Pente vazio - R para recarregar", Color(1.0, 0.85, 0.5))

func _flash() -> void:
	flash.light_energy = 6.0
	flash_mesh.visible = true
	flash_mesh.rotation.z = _rng.randf() * TAU
	var tw := create_tween()
	tw.tween_interval(0.05)
	tw.tween_callback(func() -> void:
		flash.light_energy = 0.0
		flash_mesh.visible = false)

func _shoot_ray() -> void:
	var space := get_world_3d().direct_space_state
	var origin := cam.global_position
	var basis := cam.global_transform.basis
	var spread := deg_to_rad(0.08 if scoped else 1.4)
	var dir := -basis.z
	dir = (dir + basis.x * _rng.randf_range(-spread, spread) + basis.y * _rng.randf_range(-spread, spread)).normalized()
	var to := origin + dir * RANGE
	var q := PhysicsRayQueryParameters3D.create(origin, to, 1 | 4 | 8)
	q.collide_with_areas = true
	q.exclude = [player.get_rid()]
	var hit := space.intersect_ray(q)
	var scene := get_tree().current_scene
	var t_hit := RANGE
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
			if t_w < t_hit:
				var wp := origin + dir * t_w
				Fx.splash(scene, wp, 0.6)
			col.call("hit", DAMAGE, hit["position"])
			hud.hit_marker()
			if col is Fish:
				hud.show_target_health(col.display_name(), maxf(col.hp, 0.0) / col.max_hp)
			Fx.spark(scene, hit["position"])
		elif t_w < t_hit:
			end = origin + dir * t_w
			Fx.splash(scene, end, 1.0)
			Sfx.play_at("splash", scene, end, -2.0)
		else:
			Fx.puff(scene, hit["position"], Color(0.8, 0.72, 0.5))
			Sfx.play_at("impact", scene, hit["position"], -4.0)
	elif t_w < RANGE:
		end = origin + dir * t_w
		Fx.splash(scene, end, 1.0)
		Sfx.play_at("splash", scene, end, -2.0)
	Fx.tracer(scene, muzzle.global_position, end)

func _start_reload() -> void:
	if reloading or GameState.ammo_mag >= GameState.MAG_SIZE:
		return
	if GameState.ammo_reserve <= 0:
		hud.toast("Sem munição reserva!", Color(1.0, 0.6, 0.4))
		return
	reloading = true
	_reload_t = 0.0
	Sfx.play("reload")
	hud.toast("Recarregando...", Color(0.9, 0.9, 0.9))
	var tw := create_tween()
	tw.tween_interval(1.5)
	tw.tween_callback(_finish_reload)

func _finish_reload() -> void:
	GameState.reload_rifle()
	reloading = false

func _animate(delta: float) -> void:
	_kick = maxf(_kick - delta * 5.0, 0.0)
	var target_scope := 1.0 if scoped else 0.0
	_scope_amount = lerpf(_scope_amount, target_scope, clampf(14.0 * delta, 0.0, 1.0))
	cam.fov = lerpf(NORMAL_FOV, SCOPE_FOV, _scope_amount)
	var overlay := smoothstep(0.7, 0.95, _scope_amount)
	hud.set_scope(overlay if active else 0.0)
	visible = active and overlay < 0.5
	var speed: float = player.velocity.length()
	var sway := Vector3(sin(_t * 1.6) * 0.004, cos(_t * 2.1) * 0.004, 0.0)
	var walk := Vector3(sin(_t * 8.0) * 0.008, absf(cos(_t * 8.0)) * 0.01, 0.0) * clampf(speed / 5.0, 0.0, 1.5) * (1.0 - _scope_amount)
	var reload_dip := 0.0
	if reloading:
		_reload_t += delta
		reload_dip = sin(clampf(_reload_t / 1.5, 0.0, 1.0) * PI)
	var base := Vector3(0.0, -0.01, 0.0).lerp(Vector3(-0.22, 0.08, 0.1), _scope_amount)
	model.position = base + sway + walk + Vector3(0, -0.25 * reload_dip, 0.1 * _kick)
	model.rotation = Vector3(0.05 * _kick + 0.7 * reload_dip, 0.0, -0.25 * reload_dip)
