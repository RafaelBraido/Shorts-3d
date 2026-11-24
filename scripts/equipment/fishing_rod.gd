class_name FishingRod
extends Node3D
## Vara de pesca em primeira pessoa. Máquina de estados:
## IDLE -> CHARGING (segura o clique) -> CASTING -> WAITING (peixes reais se aproximam da boia)
## -> BITE (janela para fisgar) -> REELING (minigame de tensão) -> RESULT.

enum S { IDLE, CHARGING, CASTING, WAITING, BITE, REELING, RESULT }

var state: S = S.IDLE
var active := false
var player: Node3D                ## Player
var cam: Camera3D
var hud: Node
var manager: FishManager

var power := 0.0
var _power_dir := 1.0
var bobber: Bobber
var fish: Fish
var tip: Node3D
var rod_root: Node3D
var reel_knob: Node3D
var line_mesh: ImmediateMesh
var line_node: MeshInstance3D
var trophy: Node3D

var _wait_t := 0.0
var _bite_t := 0.0
var _fallback_done := false
var _swing := 0.0

# minigame
var progress := 0.3
var tension := 0.2
var pulling := false
var _pull_timer := 2.0
var _pull_s := 0.0
var _reel_tick := 0.0
var _start_xz := Vector2.ZERO
var _fight := 0.5
var _result_t := 0.0

func setup(p: Node3D, c: Camera3D, h: Node, m: FishManager) -> void:
	player = p
	cam = c
	hud = h
	manager = m
	_build_model()
	line_mesh = ImmediateMesh.new()
	line_node = MeshInstance3D.new()
	line_node.mesh = line_mesh
	line_node.top_level = true
	line_node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var lm := StandardMaterial3D.new()
	lm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	lm.albedo_color = Color(0.95, 0.95, 1.0, 0.85)
	lm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	lm.vertex_color_use_as_albedo = true
	line_node.material_override = lm
	add_child(line_node)
	line_node.global_transform = Transform3D.IDENTITY
	GameState.rod_changed.connect(_apply_rod_look)
	_apply_rod_look()
	visible = false

func _build_model() -> void:
	rod_root = Node3D.new()
	rod_root.rotation.x = 0.5
	add_child(rod_root)
	var cork := Props.cylinder(rod_root, 0.024, 0.022, 0.34, Vector3.ZERO, Color(0.8, 0.62, 0.38), 10)
	cork.rotation.x = PI / 2.0
	cork.position = Vector3(0, 0, -0.1)
	var blank := Props.cylinder(rod_root, 0.004, 0.014, 1.65, Vector3.ZERO, Color(0.55, 0.38, 0.18), 8, 0.4)
	blank.name = "Blank"
	blank.rotation.x = PI / 2.0
	blank.position = Vector3(0, 0, -1.05)
	var reel := Props.cylinder(rod_root, 0.045, 0.045, 0.05, Vector3.ZERO, Color(0.75, 0.75, 0.8), 14, 0.25, 0.9)
	reel.rotation.z = PI / 2.0
	reel.position = Vector3(0, -0.06, -0.22)
	reel_knob = Props.cylinder(rod_root, 0.01, 0.01, 0.08, Vector3.ZERO, Color(0.1, 0.1, 0.1), 6)
	reel_knob.position = Vector3(0.05, -0.06, -0.22)
	reel_knob.rotation.z = PI / 2.0
	for i in 4:
		var ring := Props.cylinder(rod_root, 0.012, 0.012, 0.004, Vector3.ZERO, Color(0.7, 0.7, 0.75), 8, 0.3, 0.8)
		ring.position = Vector3(0, 0.02, -0.35 - i * 0.38)
	tip = Node3D.new()
	tip.position = Vector3(0, 0, -1.88)
	rod_root.add_child(tip)

func _apply_rod_look() -> void:
	var blank := rod_root.get_node_or_null("Blank") as MeshInstance3D
	if blank:
		blank.material_override = Props.mat(GameState.rod()["color"], 0.35, 0.2)

func equip(on: bool) -> void:
	active = on
	visible = on
	if not on:
		cancel()

func cancel() -> void:
	if state == S.REELING and fish != null and is_instance_valid(fish):
		fish.release()
	_clear_bobber()
	fish = null
	state = S.IDLE
	power = 0.0
	if hud:
		hud.show_cast_power(-1.0)
		hud.show_bite(false)
		hud.show_reel(false, 0, 0, false)

func _clear_bobber() -> void:
	if manager:
		manager.bait = null
		manager.bait_fish = null
	if bobber != null and is_instance_valid(bobber):
		bobber.queue_free()
	bobber = null
	line_mesh.clear_surfaces()

# ------------------------------------------------------------------ loop

func _process(delta: float) -> void:
	_update_line()
	_animate(delta)
	if not active or player.ui_open:
		return
	var pressed := Input.is_action_just_pressed("shoot")
	var held := Input.is_action_pressed("shoot")
	var released := Input.is_action_just_released("shoot")
	match state:
		S.IDLE:
			if pressed:
				state = S.CHARGING
				power = 0.0
				_power_dir = 1.0
		S.CHARGING:
			power += delta * 0.95 * _power_dir
			if power >= 1.0:
				power = 1.0
				_power_dir = -1.0
			elif power <= 0.0:
				power = 0.0
				_power_dir = 1.0
			hud.show_cast_power(power)
			if Input.is_action_just_pressed("cancel"):
				state = S.IDLE
				hud.show_cast_power(-1.0)
			elif released:
				_cast()
		S.CASTING:
			pass
		S.WAITING:
			_wait_t += delta
			if not _fallback_done and _wait_t > 14.0 and manager.bait_fish == null:
				_fallback_done = true
				manager.spawn_near_bait(bobber.global_position, float(GameState.rod().get("luck", 0.0)))
			if pressed or Input.is_action_just_pressed("cancel"):
				reel_in()
		S.BITE:
			_bite_t -= delta
			if pressed:
				_hook()
			elif _bite_t <= 0.0:
				bobber.bite_missed()
		S.REELING:
			_reel(delta, held)
		S.RESULT:
			_result_t -= delta
			if _result_t <= 0.0:
				state = S.IDLE

func _cast() -> void:
	state = S.CASTING
	hud.show_cast_power(-1.0)
	var tw := create_tween()
	tw.tween_property(self, "_swing", 1.0, 0.18)
	tw.tween_callback(_launch)
	tw.tween_property(self, "_swing", 0.0, 0.35)

func _launch() -> void:
	Sfx.play("cast", -4.0)
	var stats := GameState.rod()
	var cast_range: float = float(stats["cast_range"]) * lerpf(0.25, 1.0, power)
	var theta := deg_to_rad(38.0)
	var v := sqrt(cast_range * 9.8 / sin(2.0 * theta))
	var fwd := -cam.global_transform.basis.z
	fwd.y = 0.0
	fwd = fwd.normalized()
	var vel := (fwd * cos(theta) + Vector3.UP * sin(theta)) * v
	bobber = Bobber.new()
	get_tree().current_scene.add_child(bobber)
	bobber.launch(tip.global_position, vel)
	bobber.landed.connect(_on_landed)
	bobber.bitten.connect(_on_bitten)
	bobber.missed.connect(_on_missed)

func _on_landed(in_water: bool) -> void:
	if in_water:
		state = S.WAITING
		_wait_t = 0.0
		_fallback_done = false
		manager.bait = bobber
		manager.bait_interest = 14.0 + float(GameState.rod().get("luck", 0.0)) * 10.0
		hud.toast("Aguardando um peixe morder...", Color(0.8, 0.95, 1.0))
	else:
		hud.toast("Precisa cair na água fundo!", Color(1.0, 0.7, 0.4))
		reel_in()

func _on_bitten(f: Fish) -> void:
	if state != S.WAITING:
		return
	fish = f
	state = S.BITE
	_bite_t = 1.3
	hud.show_bite(true)
	Sfx.play("bite", -2.0)

func _on_missed() -> void:
	if state == S.BITE:
		state = S.WAITING
		_wait_t = 0.0
		_fallback_done = false
		fish = null
		hud.show_bite(false)
		hud.toast("O peixe escapou da isca...", Color(1.0, 0.8, 0.5))

func reel_in() -> void:
	## Recolhe a linha sem peixe.
	_clear_bobber()
	state = S.IDLE
	Sfx.play("reel", -6.0)

func _hook() -> void:
	hud.show_bite(false)
	bobber.end_bite()
	fish.hook()
	state = S.REELING
	progress = 0.3
	tension = 0.25
	pulling = false
	_pull_timer = 1.5
	_pull_s = 0.0
	_start_xz = Vector2(bobber.global_position.x, bobber.global_position.z)
	_fight = float(FishDB.data(fish.species_id)["fight"])
	Sfx.play("splash", -4.0)
	hud.toast("Fisgou! Segure o clique para recolher, solte quando o peixe puxar!", Color(1.0, 0.95, 0.5))

func _reel(delta: float, held: bool) -> void:
	if fish == null or not is_instance_valid(fish):
		cancel()
		return
	var stats := GameState.rod()
	var strength: float = stats["strength"]
	var reel_speed: float = stats["reel"]
	_pull_timer -= delta
	if _pull_timer <= 0.0:
		pulling = not pulling
		_pull_timer = randf_range(0.9, 1.8) if pulling else randf_range(1.2, 2.6) / (0.5 + _fight)
		if pulling:
			Sfx.play("reel", -2.0, 0.7)
	_pull_s = lerpf(_pull_s, 1.0 if pulling else 0.0, clampf(6.0 * delta, 0.0, 1.0))
	if held:
		progress += reel_speed * 0.12 * (1.0 - 0.85 * _pull_s * _fight) * delta
		tension += (0.2 + _pull_s * 0.75 * _fight) / strength * delta
		_reel_tick -= delta
		if _reel_tick <= 0.0:
			_reel_tick = 0.1
			Sfx.play("reel", -10.0, 0.9 + progress * 0.4)
		reel_knob.rotate_x(delta * 20.0)
	else:
		tension -= 0.55 * delta
		progress -= (0.02 + 0.22 * _pull_s * _fight) * delta
	tension = clampf(tension, 0.0, 1.05)
	progress = clampf(progress, -0.01, 1.0)
	# posição da boia/peixe: aproxima-se do jogador conforme o progresso
	var pxz := Vector2(player.global_position.x, player.global_position.z)
	var dirv := (_start_xz - pxz)
	var dist0 := dirv.length()
	var dir_n := dirv.normalized() if dist0 > 0.01 else Vector2.UP
	var target_xz := _start_xz.lerp(pxz + dir_n * 2.5, clampf(progress, 0.0, 1.0))
	bobber.global_position = Vector3(target_xz.x, 0.0, target_xz.y)
	var away := Vector3(dir_n.x, 0, dir_n.y)
	fish.hooked_update(delta, bobber.global_position, away, clampf(_pull_s * _fight + 0.15, 0.0, 1.0))
	if pulling and randf() < delta * 6.0:
		Fx.splash(get_tree().current_scene, bobber.global_position, 0.4)
	if _pull_s > 0.5:
		player.add_shake(0.004 * (0.5 + _fight))
	hud.show_reel(true, tension, clampf(progress, 0.0, 1.0), pulling)
	if tension >= 1.0:
		_fail("A linha arrebentou!")
	elif progress <= 0.0:
		_fail("O peixe escapou!")
	elif progress >= 1.0:
		_catch()

func _fail(msg: String) -> void:
	hud.show_reel(false, 0, 0, false)
	Sfx.play("fail")
	hud.toast(msg, Color(1.0, 0.45, 0.4))
	if fish != null and is_instance_valid(fish):
		fish.release()
	fish = null
	_clear_bobber()
	state = S.RESULT
	_result_t = 0.8

func _catch() -> void:
	hud.show_reel(false, 0, 0, false)
	var f := fish
	var id := f.species_id
	var w := f.weight
	var prev: Dictionary = GameState.codex.get(id, {"count": 0, "best": 0.0})
	var is_new: bool = int(prev["count"]) == 0
	var is_record: bool = w > float(prev["best"]) and not is_new
	var entry := GameState.add_fish(id, w, false)
	Sfx.play("catch")
	Net.send_announce("pescou %s de %.1f kg!" % [FishDB.data(id)["name"], w])
	hud.show_catch(id, w, int(entry["value"]), is_new, is_record)
	_show_trophy(id, f.length_m)
	# o peixe salta até o jogador e some
	var dest := cam.global_position + (-cam.global_transform.basis.z) * 1.0 + Vector3(0, -0.4, 0)
	var tw := f.create_tween()
	tw.tween_property(f, "global_position", dest, 0.4).set_trans(Tween.TRANS_QUAD)
	tw.tween_callback(manager.consume_fish.bind(f))
	fish = null
	_clear_bobber()
	state = S.RESULT
	_result_t = 1.2

func _show_trophy(id: String, length_m: float) -> void:
	if trophy != null and is_instance_valid(trophy):
		trophy.queue_free()
	trophy = Node3D.new()
	var m := FishModel.build(id, 0.0, 0.0)
	var s := clampf(length_m, 0.18, 0.7)
	m.scale = Vector3.ONE * s
	trophy.add_child(m)
	trophy.position = Vector3(0.0, -0.25, -0.85)
	trophy.rotation = Vector3(0.3, PI * 0.5, 0.2)
	cam.add_child(trophy)
	var tw := trophy.create_tween()
	tw.tween_interval(3.0)
	tw.tween_callback(trophy.queue_free)

func _on_death() -> void:
	cancel()

# ------------------------------------------------------------------ visual

func _animate(delta: float) -> void:
	var bend := 0.0
	if state == S.REELING:
		bend = tension * 0.3 + sin(Time.get_ticks_msec() * 0.03) * _pull_s * 0.03
	elif state == S.BITE:
		bend = sin(Time.get_ticks_msec() * 0.05) * 0.05
	var charge := 0.0
	if state == S.CHARGING:
		charge = power * 0.5
	rod_root.rotation.x = lerpf(rod_root.rotation.x, 0.5 + bend - charge + (-1.1 * _swing), clampf(12.0 * delta, 0.0, 1.0))

func _update_line() -> void:
	line_mesh.clear_surfaces()
	if bobber == null or not is_instance_valid(bobber) or not visible:
		return
	var a := tip.global_position
	var b := bobber.global_position + Vector3(0, 0.08, 0)
	var dist := a.distance_to(b)
	var slack := 0.0
	if state == S.WAITING or state == S.BITE or state == S.CASTING:
		slack = clampf(dist * 0.06, 0.1, 1.2)
	elif state == S.REELING:
		slack = 0.0
	else:
		slack = clampf(dist * 0.1, 0.1, 2.0)
	var col := Color(0.95, 0.95, 1.0, 0.85).lerp(Color(1.0, 0.2, 0.15, 1.0), clampf((tension - 0.6) * 2.5, 0.0, 1.0)) if state == S.REELING else Color(0.95, 0.95, 1.0, 0.85)
	line_mesh.surface_begin(Mesh.PRIMITIVE_LINE_STRIP)
	var n := 18
	for i in n + 1:
		var t := float(i) / n
		var p := a.lerp(b, t) - Vector3(0, slack * 4.0 * t * (1.0 - t), 0)
		line_mesh.surface_set_color(col)
		line_mesh.surface_add_vertex(p)
	line_mesh.surface_end()
