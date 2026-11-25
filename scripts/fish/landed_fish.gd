class_name LandedFish
extends RigidBody3D
## Peixe recém-pescado: como em "How to Fish", ele NÃO vai direto para a mochila. Cai no chão, se debate
## (física real) e precisa ser morto (soco com E, faca ou tiro) antes de ser coletado e vendido.
## Tiros e explosões o lançam no ar. Gaivotas tentam roubá-lo se ficar muito tempo no chão.

var species_id := "sardinha"
var weight := 1.0
var hp := 1.0
var dead := false
var radius := 3.2
var enabled := true
var length_m := 0.5
var _flop_t := 0.5
var _age := 0.0
var _gull_called := false
var _water_t := 0.0
var hits := 0
var air_hits := 0
var kill_mult := 1.0
var kill_lines: Array = []
var _last_head := false
var _last_air := false
var _model: Node3D

static func spawn(parent: Node, id: String, w: float, pos: Vector3, vel: Vector3) -> LandedFish:
	var f := LandedFish.new()
	f.species_id = id
	f.weight = w
	parent.add_child(f)
	f.global_position = pos
	f.linear_velocity = vel
	return f

func _ready() -> void:
	add_to_group("interactable")
	add_to_group("landed_fish")
	add_to_group("targets")
	length_m = float(FishDB.data(species_id)["length"]) * FishDB.scale_for(species_id, weight)
	hp = clampf(weight * 0.25, 1.0, 5.0)
	collision_layer = 4
	collision_mask = 1
	mass = clampf(weight, 0.2, 40.0)
	continuous_cd = true
	var cs := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = maxf(0.07, length_m * 0.14)
	cap.height = maxf(length_m, cap.radius * 2.2)
	cs.shape = cap
	cs.rotation.x = PI / 2.0
	add_child(cs)
	_model = FishModel.build(species_id, randf() * TAU, 20.0)
	_model.scale = Vector3.ONE * length_m
	add_child(_model)
	var pm := PhysicsMaterial.new()
	pm.bounce = 0.35
	pm.friction = 0.6
	physics_material_override = pm
	angular_damp = 1.5

func display_name() -> String:
	return String(FishDB.data(species_id)["name"])

# ------------------------------------------------------------------ comportamento

func _physics_process(delta: float) -> void:
	_age += delta
	var p := global_position
	# caiu na água funda: o peixe escapa nadando
	if p.y < 0.0 and Terrain.depth_at(p.x, p.z) > 0.6:
		_water_t += delta
		if _water_t > 1.2:
			GameState.notify.emit("O %s escapou para a água!" % display_name().to_lower())
			queue_free()
		return
	_water_t = 0.0
	if not dead:
		_flop_t -= delta
		if _flop_t <= 0.0:
			_flop_t = randf_range(0.5, 1.1)
			apply_central_impulse(Vector3(randf_range(-1, 1), randf_range(2.0, 3.5), randf_range(-1, 1)) * mass * 0.9)
			apply_torque_impulse(Vector3(randf_range(-1, 1), randf_range(-2, 2), randf_range(-1, 1)) * mass * 0.3)
			Sfx.play_at("step", get_tree().current_scene, p, -10.0, randf_range(1.4, 1.9))
	if not _gull_called and _age > 7.0:
		_gull_called = true
		Gull.spawn_for(self)
	if dead and _age > 180.0:
		queue_free()

func hit(damage: float, point: Vector3) -> void:
	if dead:
		apply_central_impulse((global_position - point).normalized() * mass * 3.0 + Vector3.UP * mass * 3.5)
		return
	hp -= damage
	hits += 1
	var airborne := global_position.y > Terrain.height_at(global_position.x, global_position.z) + 0.6 and linear_velocity.length() > 1.0
	if airborne:
		air_hits += 1
	_last_head = to_local(point).z > length_m * 0.2
	_last_air = airborne
	Fx.damage_number(get_tree().current_scene, point, damage)
	Fx.blood(get_tree().current_scene, global_position, 0.5)
	var d := (global_position - point)
	apply_central_impulse((d.normalized() if d.length() > 0.01 else Vector3.UP) * mass * 2.0 + Vector3.UP * mass * 4.5)
	if hp <= 0.0:
		_die()

func _compute_killscore() -> void:
	kill_lines.clear()
	kill_mult = 1.0
	var pl := get_tree().get_first_node_in_group("player") as Node3D
	if _last_head and hits >= 1:
		kill_lines.append([1.25, "Tiro na cabeça"])
	if pl != null:
		var wid: String = pl.rifle.weapon_id if "rifle" in pl else ""
		if wid == "sniper" and not pl.rifle.scoped:
			kill_lines.append([1.2, "No Scope"])
		if pl.global_position.distance_to(global_position) > 25.0:
			kill_lines.append([1.3, "Longa distância"])
	if _last_air:
		kill_lines.append([1.25, "No ar"])
	if air_hits >= 2:
		kill_lines.append([1.2, "Trick shot"])
	if hits >= 3:
		kill_lines.append([1.1, "Finalmente"])
	for l in kill_lines:
		kill_mult *= float(l[0])

func inspect_info() -> Dictionary:
	return {"name": display_name(), "value": int(FishDB.price_for(species_id, weight) * kill_mult), "weight": weight, "mult": kill_mult}

func _die() -> void:
	dead = true
	_compute_killscore()
	var hud := get_tree().get_first_node_in_group("hud")
	if hud and not kill_lines.is_empty():
		hud.show_killscore(display_name(), int(FishDB.price_for(species_id, weight) * kill_mult), kill_mult, kill_lines)
	Fx.spark(get_tree().current_scene, global_position)
	Fx.puff(get_tree().current_scene, global_position, Color(0.85, 0.1, 0.1))
	Sfx.play_at("impact", get_tree().current_scene, global_position, -2.0, 1.3)
	GameState.notify.emit("%s abatido! Aperte E para coletar." % display_name())
	FishModel.set_swim_speed(_model, 0.0)

# ------------------------------------------------------------------ interação

func get_prompt() -> String:
	if dead:
		return "Coletar %s (%.1f kg)" % [display_name(), weight]
	return "Socar o %s (ou golpeie/atire)" % display_name().to_lower()

func interact(_player: Node) -> void:
	if not dead:
		hit(1.0, global_position - Vector3(0, 0.5, 0.2))
		Sfx.play("impact", -4.0, 1.5)
		return
	if not GameState.bag_free():
		GameState.notify.emit("Mochila cheia (%d/%d)! Venda na loja ou compre espaço extra." % [GameState.inventory.size(), GameState.bag_capacity()])
		return
	GameState.add_fish(species_id, weight, false, kill_mult)
	Story.on_fish_caught(species_id, global_position)
	Sfx.play("coin", -6.0)
	GameState.notify.emit("Coletou %s (%.1f kg)" % [display_name(), weight])
	queue_free()
