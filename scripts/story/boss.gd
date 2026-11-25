class_name Boss
extends Area3D
## Chefe/inimigo da história. Cada "id" tem modelo, vida e comportamento próprios:
## crab (persegue em terra), piranha/piranha_minion (nadam e saltam), puffer (rola como bola de demolição),
## albatross (voa em círculos, atira e mergulha), whale (patrulha e investe), mutant (cospe lava e pisoteia).
## Entra no grupo "targets" para ser atingido pelos tiros (método hit) e pela dinamite.

signal died(boss: Boss)

const CFG := {
	"crab": {"name": "Caranguejo‑Aranha", "hp": 14.0, "reward": 250, "hit_r": 1.9, "hit_y": 2.4},
	"piranha": {"name": "Piranha Gigante", "hp": 60.0, "reward": 600, "hit_r": 1.7, "hit_y": 0.0},
	"piranha_minion": {"name": "Filhote de Piranha", "hp": 5.0, "reward": 40, "hit_r": 0.7, "hit_y": 0.0},
	"puffer": {"name": "Baiacu Gigante", "hp": 90.0, "reward": 900, "hit_r": 2.8, "hit_y": 0.0},
	"albatross": {"name": "Albatroz Gigante", "hp": 40.0, "reward": 1400, "hit_r": 2.6, "hit_y": 0.0},
	"whale": {"name": "Baleia‑da‑Groenlândia", "hp": 120.0, "reward": 2200, "hit_r": 5.0, "hit_y": 0.0},
	"mutant": {"name": "Baleia Mutante de Magma", "hp": 220.0, "reward": 5000, "hit_r": 7.0, "hit_y": 2.0},
	"blue_shark": {"name": "Tubarão‑Azul", "hp": 70.0, "reward": 400, "hit_r": 2.0, "hit_y": 0.0},
}

var id := "crab"
var display_name := ""
var hp := 10.0
var max_hp := 10.0
var reward := 100
var model: Node3D
var player: Node3D
var home := Vector3.ZERO
var state := "idle"

var _t := 0.0
var _cd := 1.5
var _dead := false
var _active := false
var _flash := 0.0
var _heading := 0.0
var _dir := Vector3.FORWARD
var _hit_done := false
var _leap_from := Vector3.ZERO
var _leap_to := Vector3.ZERO
var _special_cd := 6.0
var _angle := 0.0
var _anim := 0.0
var _hit_y := 0.0

func setup(boss_id: String) -> void:
	id = boss_id
	var c: Dictionary = CFG[id]
	display_name = c["name"]
	hp = c["hp"]
	max_hp = hp
	reward = c["reward"]
	_hit_y = c["hit_y"]
	collision_layer = 8
	collision_mask = 0
	add_to_group("targets")
	var cs := CollisionShape3D.new()
	var sh := SphereShape3D.new()
	sh.radius = c["hit_r"]
	cs.shape = sh
	cs.position.y = _hit_y
	add_child(cs)
	match id:
		"crab": model = BossModels.crab()
		"piranha": model = BossModels.piranha(4.4)
		"piranha_minion": model = BossModels.piranha(1.1)
		"puffer": model = BossModels.puffer()
		"albatross":
			model = BossModels.albatross()
			model.scale = Vector3.ONE * 1.6
		"whale": model = BossModels.whale(false)
		"mutant": model = BossModels.whale(true)
		"blue_shark":
			model = Node3D.new()
			var shark := FishModel.build("tubarao_azul", 0.0, 9.0)
			shark.scale = Vector3.ONE * 3.6
			model.add_child(shark)
	add_child(model)
	_angle = randf() * TAU

func _ready() -> void:
	_cd = randf_range(1.0, 2.5)

func start_fight() -> void:
	player = get_tree().get_first_node_in_group("player")
	_active = true
	home = global_position
	match id:
		"crab":
			_place_on_beach()
			state = "chase"
			_cd = 0.6
		"puffer":
			state = "idle"
			_t = 1.2
		"albatross":
			state = "orbit"
			home = Story.zones.get("altar", global_position)
		"whale", "blue_shark":
			state = "patrol"
			_cd = 2.0
		"mutant":
			state = "idle"
			global_position = Story.zones["lava"] + Vector3(0, -0.5, 0)
			model.scale = Vector3.ONE * 1.8
			model.rotation.x = -0.45
		"piranha":
			state = "swim"
	var hud := get_tree().get_first_node_in_group("hud")
	if hud:
		hud.set_boss_bar(display_name, 1.0)
	Fx.splash(get_tree().current_scene, global_position, 2.0)
	Sfx.play("splash", 0.0, 0.6)

func _place_on_beach() -> void:
	var target := Vector2(Terrain.island_center(0))
	var p := Vector2(global_position.x, global_position.z)
	for i in 160:
		if Terrain.height_at(p.x, p.y) > 0.35:
			break
		p += (target - p).normalized() * 1.0
	global_position = Vector3(p.x, Terrain.height_at(p.x, p.y), p.y)

func drop_position() -> Vector3:
	var p := Vector2(global_position.x, global_position.z)
	if id == "piranha" or id == "piranha_minion":
		var pl := get_tree().get_first_node_in_group("player") as Node3D
		var dirv := (Vector2(pl.global_position.x, pl.global_position.z) - Terrain.LAKE_CENTER).normalized() if pl else Vector2.RIGHT
		var e := Terrain.LAKE_CENTER + dirv * Terrain.LAKE_R * 0.8
		return Vector3(e.x, maxf(Terrain.height_at(e.x, e.y), 0.0) + 0.3, e.y)
	var goal := Vector2(Terrain.island_center(2 if id == "blue_shark" else clampi(Story.chapter - 1, 0, 4)))
	for i in 220:
		if Terrain.height_at(p.x, p.y) > 0.4:
			break
		p += (goal - p).normalized() * 1.0
	return Vector3(p.x, Terrain.height_at(p.x, p.y) + 0.3, p.y)

# ------------------------------------------------------------------ dano

func hit(damage: float, point: Vector3) -> void:
	if _dead:
		return
	if not _active:
		start_fight()
	if id == "crab" and state == "stunned":
		damage *= 1.5        # atordoado: leva mais dano (janela de ataque)
	hp -= damage
	_flash = 0.12
	var hud := get_tree().get_first_node_in_group("hud")
	if hud and id != "piranha_minion":
		hud.set_boss_bar(display_name, maxf(hp, 0.0) / max_hp)
	var scene := get_tree().current_scene
	Fx.spark(scene, point)
	Fx.damage_number(scene, point, damage, Color(1, 1, 1) if state != "stunned" else Color(1.0, 0.85, 0.2))
	if id in ["crab", "puffer", "piranha", "piranha_minion"]:
		Fx.blood(scene, Vector3(point.x, global_position.y, point.z), 2.0 if id == "crab" else 1.0)
	if hp <= 0.0:
		_die()

func _die() -> void:
	_dead = true
	collision_layer = 0
	var hud := get_tree().get_first_node_in_group("hud")
	if hud and id != "piranha_minion":
		hud.set_boss_bar("", -1.0)
	Fx.splash(get_tree().current_scene, global_position, 2.5)
	Sfx.play("splash", 2.0, 0.5)
	Sfx.play("fail", 0.0, 0.5)
	died.emit(self)
	var tw := create_tween()
	tw.tween_property(self, "scale", Vector3.ONE * 0.05, 0.9).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	tw.tween_callback(queue_free)

func _damage_player(amount: float) -> void:
	if player and player.has_method("take_damage"):
		player.take_damage(amount, global_position)

# ------------------------------------------------------------------ IA

func _physics_process(delta: float) -> void:
	if _dead or not _active:
		return
	_t -= delta
	_anim += delta
	_cd -= delta
	if _flash > 0.0:
		_flash -= delta
	if player == null:
		player = get_tree().get_first_node_in_group("player")
		if player == null:
			return
	match id:
		"crab": _ai_crab(delta)
		"piranha", "piranha_minion": _ai_piranha(delta)
		"puffer": _ai_puffer(delta)
		"albatross": _ai_albatross(delta)
		"whale", "blue_shark": _ai_whale(delta)
		"mutant": _ai_mutant(delta)

func _flat_to_player() -> Vector3:
	var d := player.global_position - global_position
	d.y = 0.0
	return d

func _face(dirv: Vector3, rate: float, delta: float) -> void:
	if dirv.length() < 0.01:
		return
	var target := atan2(dirv.x, dirv.z)
	_heading = lerp_angle(_heading, target, clampf(rate * delta, 0.0, 1.0))
	rotation.y = _heading

# --- caranguejo: persegue, arma o ataque, avança numa investida e FICA ATORDOADO (janela para golpear)
func _ai_crab(delta: float) -> void:
	var to_p := _flat_to_player()
	var dist := to_p.length()
	var enraged := hp < max_hp * 0.5
	var speed := 5.6 if enraged else 4.4
	var legs: Array = model.get_meta("legs")
	var claws: Array = model.get_meta("claws")
	match state:
		"chase":
			if dist > 3.0:
				_move_crab(to_p.normalized() * speed * delta, to_p, speed, delta)
				_anim += delta * 6.0
			_face(to_p, 6.0, delta)
			if dist < 8.5 and _cd <= 0.0:
				state = "windup"
				_t = 0.55
				_dir = to_p.normalized()
				_hit_done = false
				Sfx.play_at("gull", get_tree().current_scene, global_position, 0.0, 0.6)
		"windup":
			# levanta as garras e a frente do corpo
			for c in claws:
				c.rotation.x = lerpf(c.rotation.x, -1.0, 0.2)
			model.rotation.x = lerpf(model.rotation.x, -0.25, 0.2)
			_face(to_p, 8.0, delta)
			_dir = to_p.normalized()
			if _t <= 0.0:
				state = "lunge"
				_t = 0.38
		"lunge":
			var np := global_position + _dir * 15.0 * delta
			if Terrain.height_at(np.x, np.z) > -0.1:
				global_position = np
			if not _hit_done and dist < 3.8:
				_hit_done = true
				_damage_player(16.0 if not enraged else 20.0)
			if _t <= 0.0:
				state = "stunned"
				_t = 2.4
				GameState.notify.emit("O caranguejo se atordoou! Ataque agora!")
		"stunned":
			model.rotation.x = lerpf(model.rotation.x, 0.3, 0.15)
			for c in claws:
				c.rotation.x = lerpf(c.rotation.x, 0.5, 0.1)
			if _t <= 0.0:
				state = "chase"
				_cd = 2.2 if not enraged else 1.4
				model.rotation.x = 0.0
				for c in claws:
					c.rotation.x = 0.0
	global_position.y = maxf(Terrain.height_at(global_position.x, global_position.z), -0.2)
	for i in legs.size():
		var l: Node3D = legs[i]
		var amp := 0.3 if state == "chase" else (0.05 if state == "stunned" else 0.12)
		l.rotation.y = sin(_anim * 2.2 + float(i) * 1.7) * amp
		l.rotation.z = sin(_anim * 2.2 + float(i) * 1.7 + 1.5) * 0.08 + (0.25 if state == "stunned" else 0.0) * (1.0 if i % 2 == 0 else -1.0)

func _move_crab(step_dir: Vector3, to_p: Vector3, speed: float, delta: float) -> void:
	var np := global_position + step_dir
	if Terrain.height_at(np.x, np.z) > -0.1:
		global_position = np
	else:
		var side := Vector3(-to_p.z, 0, to_p.x).normalized() * speed * delta
		var np2 := global_position + side
		if Terrain.height_at(np2.x, np2.z) > -0.1:
			global_position = np2

# --- piranha (boss e filhotes)
func _ai_piranha(delta: float) -> void:
	var minion := id == "piranha_minion"
	var speed := 6.5 if minion else 5.2
	if state == "leap":
		var u := clampf(1.0 - _t / 0.95, 0.0, 1.0)
		var p := _leap_from.lerp(_leap_to, u)
		p.y = _leap_from.y + sin(PI * u) * (4.0 if not minion else 2.6)
		var prev := global_position
		global_position = p
		_face(p - prev, 14.0, delta)
		if not _hit_done and u > 0.7 and global_position.distance_to(player.global_position + Vector3(0, 0.8, 0)) < (3.2 if not minion else 2.2):
			_hit_done = true
			_damage_player(8.0 if minion else 18.0)
		if _t <= 0.0:
			state = "swim" if Terrain.depth_at(global_position.x, global_position.z) > 0.6 else "beached"
			_t = 1.6
			Fx.splash(get_tree().current_scene, global_position, 1.2)
			Sfx.play_at("splash", get_tree().current_scene, global_position, -4.0)
		return
	if state == "beached":
		var back := Vector3(Terrain.LAKE_CENTER.x, 0, Terrain.LAKE_CENTER.y) - global_position
		back.y = 0.0
		if _t <= 0.0:
			global_position += back.normalized() * 6.0 * delta
			global_position.y = maxf(Terrain.height_at(global_position.x, global_position.z), -0.8) + 0.2
			if Terrain.depth_at(global_position.x, global_position.z) > 1.0:
				state = "swim"
		model.rotation.z = sin(_anim * 18.0) * 0.5
		return
	model.rotation.z = 0.0
	var lake := Vector3(Terrain.LAKE_CENTER.x, 0, Terrain.LAKE_CENTER.y)
	var to_p := _flat_to_player()
	var near_lake := Vector2(player.global_position.x, player.global_position.z).distance_to(Terrain.LAKE_CENTER) < Terrain.LAKE_R + 8.0
	var steer := Vector3.ZERO
	if near_lake:
		var tgt := player.global_position
		var edge := lake + (tgt - lake).limit_length(Terrain.LAKE_R * 0.6)
		steer = edge - global_position
	else:
		_angle += delta * (0.6 if minion else 0.4)
		steer = lake + Vector3(cos(_angle), 0, sin(_angle)) * 7.0 - global_position
	steer.y = 0.0
	_face(steer, 5.0, delta)
	var fwd := Vector3(sin(_heading), 0, cos(_heading))
	var np := global_position + fwd * speed * delta
	if Terrain.depth_at(np.x, np.z) > 1.2:
		global_position = np
	else:
		_heading += 2.5 * delta
	global_position.y = lerpf(global_position.y, -0.9, 0.1)
	rotation.y = _heading
	if near_lake and _cd <= 0.0 and to_p.length() < 15.0:
		state = "leap"
		_t = 0.95
		_hit_done = false
		_cd = randf_range(3.2, 4.5) if minion else randf_range(2.4, 3.2)
		_leap_from = global_position
		var tgt := player.global_position
		var d2 := (tgt - global_position)
		d2.y = 0.0
		var land := global_position + d2.limit_length(15.0)
		land.y = maxf(Terrain.height_at(land.x, land.z), -0.9)
		_leap_to = land
		Sfx.play_at("splash", get_tree().current_scene, global_position, -2.0, 1.3)

# --- baiacu rolante
func _ai_puffer(delta: float) -> void:
	var roll: Node3D = model.get_node("Roll")
	var to_p := _flat_to_player()
	var radius := 2.4
	match state:
		"idle":
			var s := 1.0 + 0.35 * sin(_anim * 6.0)
			roll.scale = Vector3.ONE * s
			_face(to_p, 4.0, delta)
			if _t <= 0.0:
				state = "roll"
				_t = 1.9
				_dir = to_p.normalized()
				_hit_done = false
				Sfx.play("cast", 0.0, 0.5)
		"roll":
			roll.scale = Vector3.ONE * 1.2
			var np := global_position + _dir * 15.0 * delta
			if Terrain.depth_at(np.x, np.z) > 3.2 or not Terrain.is_inside_map(np, 8.0):
				_dir = (Vector3(Terrain.island_center(2).x, 0, Terrain.island_center(2).y) - global_position).normalized()
				np = global_position + _dir * 15.0 * delta
			global_position = np
			roll.rotate_x(15.0 * delta / radius)
			if not _hit_done and to_p.length() < radius + 1.3:
				_hit_done = true
				_damage_player(20.0)
				Sfx.play("impact", 2.0, 0.6)
			if _t <= 0.0:
				state = "dazed"
				_t = 2.2
		"dazed":
			roll.scale = roll.scale.lerp(Vector3.ONE, 0.1)
			roll.rotation.z = sin(_anim * 10.0) * 0.15
			if _t <= 0.0:
				state = "idle"
				_t = 1.0
	global_position.y = maxf(Terrain.height_at(global_position.x, global_position.z), -1.2) + radius * 0.8

# --- albatroz
func _ai_albatross(delta: float) -> void:
	var wings: Array = model.get_meta("wings")
	var flap := sin(_anim * (6.0 if state != "dive" else 1.5)) * 0.5
	wings[0].rotation.z = flap
	wings[1].rotation.z = -flap
	var ppos := player.global_position
	if state == "orbit":
		_angle += delta * 0.5
		var tgt := home + Vector3(cos(_angle) * 26.0, 0, sin(_angle) * 26.0)
		tgt.y = Terrain.height_at(home.x, home.z) + 17.0
		var prev := global_position
		global_position = global_position.lerp(tgt, clampf(1.5 * delta, 0.0, 1.0))
		_face(global_position - prev, 4.0, delta)
		if _cd <= 0.0 and global_position.distance_to(ppos) < 90.0:
			_cd = 3.0
			_fire_orb()
		_special_cd -= delta
		if _special_cd <= 0.0:
			state = "dive"
			_t = 2.6
			_hit_done = false
			_dir = (ppos + Vector3(0, 1.0, 0) - global_position).normalized()
			Sfx.play("gull", 4.0, 0.4)
	elif state == "dive":
		var aim := (ppos + Vector3(0, 1.0, 0) - global_position).normalized()
		_dir = _dir.lerp(aim, 0.04).normalized()
		global_position += _dir * 30.0 * delta
		rotation.y = atan2(_dir.x, _dir.z)
		model.rotation.x = -asin(clampf(_dir.y, -1.0, 1.0))
		if not _hit_done and global_position.distance_to(ppos + Vector3(0, 1.0, 0)) < 3.0:
			_hit_done = true
			_damage_player(25.0)
		var gh := Terrain.height_at(global_position.x, global_position.z) + 1.0
		if global_position.y < gh:
			global_position.y = gh
			_t = 0.0
		if _t <= 0.0:
			state = "orbit"
			_special_cd = 9.0
			model.rotation.x = 0.0

func _fire_orb() -> void:
	var from := global_position + Vector3(0, 0, 0)
	var pv: Vector3 = player.velocity
	var aim: Vector3 = player.global_position + Vector3(0, 1.0, 0) + pv * 0.6 - from
	var p := BossProjectile.new()
	p.setup(aim.normalized() * 24.0, 0.0, 15.0, 1.2, Color(1.0, 0.95, 0.5), 3.5)
	get_tree().current_scene.add_child(p)
	p.global_position = from
	Sfx.play_at("shot", get_tree().current_scene, from, -2.0, 1.6)

# --- baleia
func _ai_whale(delta: float) -> void:
	var shark := id == "blue_shark"
	var to_p := _flat_to_player()
	var dist := to_p.length()
	_face_dir_whale(delta)
	match state:
		"patrol":
			_angle += delta * 0.2
			if _t <= 0.0:
				_t = randf_range(3.0, 6.0)
				_dir = Vector3(cos(randf() * TAU), 0, sin(randf() * TAU))
			_swim(_dir, 5.0 if shark else 4.0, delta)
			if dist < (60.0 if shark else 45.0) and _cd <= 0.0:
				state = "charge"
				_t = 3.2
				_hit_done = false
				Sfx.play("splash", 3.0, 0.4)
		"charge":
			_dir = to_p.normalized()
			_swim(_dir, 14.0 if shark else 11.0, delta)
			if not _hit_done and dist < (4.5 if shark else 7.0):
				_hit_done = true
				_damage_player(18.0 if shark else 22.0)
				Fx.splash(get_tree().current_scene, player.global_position, 2.0)
			if _t <= 0.0:
				state = "patrol"
				_cd = 3.0 if shark else 4.0
				_t = 0.0
				_spout()
	global_position.y = lerpf(global_position.y, (-0.8 if shark else -1.1) + sin(_anim * 0.9) * 0.3, 0.05)

func _face_dir_whale(delta: float) -> void:
	_face(_dir, 1.6, delta)

func _swim(dirv: Vector3, speed: float, delta: float) -> void:
	var np := global_position + dirv.normalized() * speed * delta
	if Terrain.depth_at(np.x, np.z) > (2.0 if id == "blue_shark" else 3.2) and Terrain.is_inside_map(np, 10.0):
		global_position = np
	else:
		_dir = (Vector3(-global_position.x, 0, -global_position.z)).normalized().rotated(Vector3.UP, randf_range(-1.0, 1.0))
		var away := global_position - Vector3(Terrain.island_center(4).x, 0, Terrain.island_center(4).y)
		away.y = 0.0
		_dir = away.normalized()

func _spout() -> void:
	Fx.splash(get_tree().current_scene, global_position + Vector3(0, 0, 0), 2.2)

# --- baleia mutante
func _ai_mutant(delta: float) -> void:
	var to_p := _flat_to_player()
	_face(to_p, 1.5, delta)
	model.position.y = 5.0 + sin(_anim * 1.3) * 0.3
	var dist := to_p.length()
	if state == "idle":
		_t -= 0.0
		state = "fight"
		_cd = 2.0
		_special_cd = 8.0
	if _cd <= 0.0 and dist < 110.0:
		_cd = 3.0
		for k in 3:
			_fire_lava(k)
	_special_cd -= delta
	if _special_cd <= 0.0:
		_special_cd = 9.0
		var tw := create_tween()
		tw.tween_property(model, "scale", Vector3.ONE * 2.05, 0.8)
		tw.tween_callback(_stomp)
		tw.tween_property(model, "scale", Vector3.ONE * 1.8, 0.3)

func _stomp() -> void:
	if _dead:
		return
	Sfx.play("shot", 3.0, 0.3)
	Fx.puff(get_tree().current_scene, global_position + Vector3(0, 1, 0), Color(0.9, 0.35, 0.1))
	player.add_shake(0.05) if player.has_method("add_shake") else null
	var d := Vector2(player.global_position.x - global_position.x, player.global_position.z - global_position.z).length()
	if d < 13.0 and player.is_on_floor():
		_damage_player(28.0)

func _fire_lava(k: int) -> void:
	var from := global_position + Vector3(0, 6.0, 0)
	var pv: Vector3 = player.velocity
	var target: Vector3 = player.global_position + Vector3(randf_range(-4, 4) * (1 if k > 0 else 0), 0, randf_range(-4, 4) * (1 if k > 0 else 0)) + pv * 0.8
	var g := 9.8
	var flat := Vector2(target.x - from.x, target.z - from.z)
	var tflight := clampf(flat.length() / 22.0, 0.8, 3.0)
	var vel := Vector3(flat.x / tflight, (target.y - from.y + 0.5 * g * tflight * tflight) / tflight, flat.y / tflight)
	var p := BossProjectile.new()
	p.setup(vel, g, 18.0, 3.4, Color(1.0, 0.4, 0.05), 6.0, true)
	get_tree().current_scene.add_child(p)
	p.global_position = from
	Sfx.play_at("shot", get_tree().current_scene, from, 0.0, 0.5)

func _process(_delta: float) -> void:
	if model == null or _dead:
		return
	# piscada de dano
	if _flash > 0.0 and not model.is_queued_for_deletion():
		model.visible = int(_flash * 40.0) % 2 == 0
	else:
		model.visible = true
