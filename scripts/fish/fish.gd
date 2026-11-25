class_name Fish
extends Area3D
## Peixe nadador com comportamento próprio:
##  SWIM: vaga em águas fundas, evita a costa, segue o cardume, foge do jogador.
##  CURIOUS/NIBBLE/BITING: é atraído pela boia, belisca e morde a isca.
##  HOOKED: preso no anzol (controlado pela vara). DEAD: abatido a tiros, flutua para ser coletado.

enum State { SWIM, FLEE, CURIOUS, NIBBLE, BITING, HOOKED, DEAD }

signal died(fish: Fish)

var species_id := "sardinha"
var weight := 1.0
var state: State = State.SWIM
var heading := 0.0
var target_heading := 0.0
var speed := 2.0
var hp := 1.0
var max_hp := 1.0
var leader: Fish = null
var manager: Node = null            ## FishManager
var curiosity := 0.5
var radius := 3.5                   ## usado como Interactable quando morto
var model: Node3D
var length_m := 0.5

var _turn_timer := 0.0
var _state_timer := 0.0
var _depth_pref := 1.0
var _flee_from := Vector3.ZERO
var _bob_t := 0.0
var _pitch := 0.0
var _nibble_timer := 0.0
var _hook_pull := 0.0

func setup(id: String, w: float, pos: Vector3, rng: RandomNumberGenerator = null) -> void:
	species_id = id
	weight = w
	var d := FishDB.data(id)
	heading = (rng.randf() if rng else randf()) * TAU
	target_heading = heading
	curiosity = (rng.randf() if rng else randf()) * 0.6 + 0.4
	var sc := FishDB.scale_for(id, w)
	length_m = float(d["length"]) * sc
	speed = float(d["speed"]) * (0.85 + 0.3 * (rng.randf() if rng else randf()))
	hp = clampf(w * 0.35, 1.0, 6.0)
	max_hp = hp
	_depth_pref = float(d["depth"]) * (0.6 + 0.8 * (rng.randf() if rng else randf()))
	position = pos
	collision_layer = 4
	collision_mask = 0
	if model:
		model.queue_free()
	model = FishModel.build(id, randf() * TAU, 5.0 + speed * 1.6)
	model.scale = Vector3.ONE * length_m
	add_child(model)
	for c in get_children():
		if c is CollisionShape3D:
			c.queue_free()
	var cs := CollisionShape3D.new()
	var sh := SphereShape3D.new()
	sh.radius = maxf(0.25, length_m * 0.4)
	cs.shape = sh
	add_child(cs)
	rotation.y = heading

func _ready() -> void:
	add_to_group("fish")

# ------------------------------------------------------------------ consulta

func is_alive() -> bool:
	return state != State.DEAD

func display_name() -> String:
	return String(FishDB.data(species_id)["name"])

# ------------------------------------------------------------------ física

func _physics_process(delta: float) -> void:
	_bob_t += delta
	match state:
		State.SWIM: _swim(delta)
		State.FLEE: _flee(delta)
		State.CURIOUS: _curious(delta)
		State.NIBBLE: _nibble(delta)
		State.BITING: _biting(delta)
		State.HOOKED: pass
		State.DEAD: _dead(delta)

func _forward() -> Vector3:
	return Vector3(sin(heading), 0.0, cos(heading))

func _apply_motion(delta: float, spd: float, turn_rate: float, target_y: float) -> void:
	heading = lerp_angle(heading, target_heading, clampf(turn_rate * delta, 0.0, 1.0))
	var f := _forward()
	var p := global_position + f * spd * delta
	var prev_y := p.y
	p.y = lerpf(p.y, target_y, clampf(2.0 * delta, 0.0, 1.0))
	_pitch = lerpf(_pitch, clampf((p.y - prev_y) * 3.0, -0.5, 0.5), 0.1)
	global_position = p
	rotation = Vector3(-_pitch, heading, 0.0)
	if model:
		FishModel.set_swim_speed(model, 4.0 + spd * 2.2)

## Devolve a profundidade preferida limitada ao fundo do local (y alvo, negativo).
func _target_y_at(p: Vector3, preferred: float) -> float:
	var depth := Terrain.depth_at(p.x, p.z)
	return -clampf(preferred, 0.35, maxf(depth - 0.6, 0.4))

## Escolhe um rumo livre (água funda) próximo do rumo desejado.
func _safe_heading(desired: float, look: float, min_depth: float) -> float:
	var offs := [0.0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4, PI]
	for o in offs:
		var h: float = desired + o
		var probe := global_position + Vector3(sin(h), 0, cos(h)) * look
		if Terrain.is_inside_map(probe, 8.0) and Terrain.depth_at(probe.x, probe.z) >= min_depth:
			return h
	return desired + PI

func _swim(delta: float) -> void:
	_turn_timer -= delta
	var min_depth := 1.3 + length_m * 0.4
	var look := 3.0 + length_m * 2.0
	if _turn_timer <= 0.0:
		_turn_timer = randf_range(2.0, 5.0)
		target_heading = heading + randf_range(-1.0, 1.0)
	# segue o líder do cardume
	if leader != null and is_instance_valid(leader) and leader.state == State.SWIM:
		var to_l := leader.global_position - global_position
		to_l.y = 0.0
		if to_l.length() > 2.2:
			target_heading = atan2(to_l.x, to_l.z)
		else:
			target_heading = leader.heading
	var probe := global_position + _forward() * look
	if not Terrain.is_inside_map(probe, 8.0) or Terrain.depth_at(probe.x, probe.z) < min_depth:
		target_heading = _safe_heading(heading, look, min_depth)
		_turn_timer = 1.5
	# sustos: jogador próximo
	var pl: Node3D = manager.player if manager else null
	if pl != null and is_instance_valid(pl):
		var dist: float = pl.global_position.distance_to(global_position)
		var skittish: float = FishDB.data(species_id)["skittish"]
		if dist < 6.0 + length_m and skittish > 0.0:
			if randf() < skittish * delta * 2.0:
				start_flee(pl.global_position)
	# atração pela boia
	if manager != null and manager.bait != null and is_instance_valid(manager.bait) and manager.bait_fish == null:
		var bd: float = manager.bait.global_position.distance_to(global_position)
		if bd < manager.bait_interest * curiosity + 4.0 and int(FishDB.data(species_id).get("bait", 0)) <= manager.bait_tier and Terrain.depth_at(manager.bait.global_position.x, manager.bait.global_position.z) >= 0.9:
			manager.bait_fish = self
			state = State.CURIOUS
			_state_timer = 0.0
			return
	var ty := _target_y_at(global_position, _depth_pref)
	_apply_motion(delta, speed, 2.2, ty)

func start_flee(from_pos: Vector3) -> void:
	if state == State.DEAD or state == State.HOOKED:
		return
	if manager != null and manager.bait_fish == self:
		manager.bait_fish = null
	state = State.FLEE
	_state_timer = randf_range(1.8, 3.2)
	_flee_from = from_pos
	var away := global_position - from_pos
	away.y = 0.0
	target_heading = atan2(away.x, away.z) if away.length() > 0.01 else heading + PI

func _flee(delta: float) -> void:
	_state_timer -= delta
	var look := 4.0 + length_m * 2.0
	var probe := global_position + Vector3(sin(target_heading), 0, cos(target_heading)) * look
	if not Terrain.is_inside_map(probe, 8.0) or Terrain.depth_at(probe.x, probe.z) < 1.3:
		target_heading = _safe_heading(target_heading, look, 1.3)
	var ty := _target_y_at(global_position, _depth_pref + 0.8)
	_apply_motion(delta, speed * 2.4, 5.0, ty)
	if _state_timer <= 0.0:
		state = State.SWIM
		_turn_timer = 0.0

func _bait_pos() -> Vector3:
	if manager == null or manager.bait == null or not is_instance_valid(manager.bait):
		return global_position
	return manager.bait.global_position

func _lost_bait() -> bool:
	if manager == null or manager.bait == null or not is_instance_valid(manager.bait) or manager.bait_fish != self:
		state = State.SWIM
		_turn_timer = 0.0
		return true
	return false

func _curious(delta: float) -> void:
	if _lost_bait():
		return
	var bp := _bait_pos()
	var to_b := bp - global_position
	to_b.y = 0.0
	var dist := to_b.length()
	if dist < 1.4 + length_m * 0.5:
		state = State.NIBBLE
		_nibble_timer = randf_range(0.8, 1.6)
		_state_timer = randf_range(2.0, 4.5)
		return
	target_heading = atan2(to_b.x, to_b.z)
	_state_timer += delta
	if _state_timer > 14.0:
		_give_up()
		return
	var ty := _target_y_at(global_position, 0.7)
	_apply_motion(delta, speed * 1.5, 4.0, ty)

func _nibble(delta: float) -> void:
	if _lost_bait():
		return
	var bp := _bait_pos()
	var to_b := bp - global_position
	to_b.y = 0.0
	var dist := to_b.length()
	# circula devagar em volta da boia
	var ang := atan2(to_b.x, to_b.z)
	target_heading = ang + (PI * 0.5 if dist < 1.3 else 0.3)
	if dist > 2.5 + length_m:
		target_heading = ang
	_apply_motion(delta, speed * 0.55, 4.0, _target_y_at(global_position, 0.6))
	_nibble_timer -= delta
	if _nibble_timer <= 0.0:
		_nibble_timer = randf_range(0.7, 1.5)
		manager.bait.call("nibble", length_m)
	_state_timer -= delta
	if _state_timer <= 0.0:
		var bite_chance: float = clampf(0.55 + GameState.rod().get("luck", 0.0) * 0.4, 0.0, 0.9)
		if randf() < bite_chance:
			state = State.BITING
			_state_timer = 1.5
			manager.bait.call("bite", self)
		else:
			_give_up()

func _biting(delta: float) -> void:
	if _lost_bait():
		return
	var bp := _bait_pos()
	var to_b := bp - global_position
	to_b.y = 0.0
	target_heading = atan2(to_b.x, to_b.z)
	_apply_motion(delta, 0.2, 4.0, -0.5)
	_state_timer -= delta
	if _state_timer <= 0.0:
		# jogador demorou: o peixe solta a isca
		manager.bait.call("bite_missed")
		_give_up()

func _give_up() -> void:
	if manager != null and manager.bait_fish == self:
		manager.bait_fish = null
	start_flee(_bait_pos() if manager != null and manager.bait != null else global_position)
	state = State.FLEE
	_state_timer = 3.0

# ------------------------------------------------------------------ fisgado

func hook() -> void:
	state = State.HOOKED
	_hook_pull = 0.0
	if model:
		FishModel.set_swim_speed(model, 22.0)

## Chamado a cada frame pela vara enquanto o peixe está preso; thrash = intensidade da briga (0..1).
func hooked_update(delta: float, anchor: Vector3, away_dir: Vector3, thrash: float) -> void:
	_hook_pull += delta * (6.0 + 12.0 * thrash)
	var side := Vector3(-away_dir.z, 0, away_dir.x)
	var off := side * sin(_hook_pull) * (0.4 + 0.9 * thrash) * length_m
	global_position = anchor + Vector3(0, -0.55 - length_m * 0.15, 0) + off
	var h := atan2(-away_dir.x + side.x * sin(_hook_pull * 0.7) * 0.8, -away_dir.z + side.z * sin(_hook_pull * 0.7) * 0.8)
	heading = lerp_angle(heading, h, 0.2)
	rotation = Vector3(0.3 * sin(_hook_pull * 0.5) * thrash, heading, 0.5 * sin(_hook_pull * 0.9) * thrash)

func release() -> void:
	## Solta o peixe (fuga) de volta à água.
	state = State.SWIM
	rotation = Vector3(0, heading, 0)
	if manager != null and manager.bait_fish == self:
		manager.bait_fish = null
	start_flee(global_position + Vector3(randf_range(-1, 1), 0, randf_range(-1, 1)))

# ------------------------------------------------------------------ tiro

func hit(damage: float, point: Vector3) -> void:
	if state == State.DEAD:
		return
	hp -= damage
	Fx.damage_number(get_tree().current_scene, point, damage)
	manager.on_fish_hit(self, point) if manager else null
	if hp <= 0.0:
		_die()
	else:
		start_flee(point)

func _die() -> void:
	if manager != null and manager.bait_fish == self:
		manager.bait_fish = null
	state = State.DEAD
	collision_layer = 0
	rotation = Vector3(0, heading, PI)
	if model:
		FishModel.set_swim_speed(model, 0.0)
	var p := global_position
	global_position = Vector3(p.x, minf(p.y, -0.1), p.z)
	add_to_group("interactable")
	died.emit(self)

func _dead(delta: float) -> void:
	var p := global_position
	p.y = lerpf(p.y, -0.04 + sin(_bob_t * 1.4) * 0.03, 1.5 * delta)
	global_position = p
	rotation.z = PI + sin(_bob_t * 1.1) * 0.08

# Interface "Interactable" (usada pelo jogador quando o peixe está morto na água)
var prompt: String:
	get: return "Coletar %s (%.1f kg)" % [display_name(), weight]
var enabled := true

func get_prompt() -> String:
	return prompt

func interact(_player: Node) -> void:
	if state != State.DEAD:
		return
	if not GameState.bag_free():
		GameState.notify.emit("Mochila cheia (%d/%d)! Venda na loja ou compre espaço extra." % [GameState.inventory.size(), GameState.bag_capacity()])
		return
	GameState.add_fish(species_id, weight, true)
	Sfx.play("coin", -6.0)
	GameState.notify.emit("Coletou %s (%.1f kg)" % [display_name(), weight])
	manager.remove_fish(self)
