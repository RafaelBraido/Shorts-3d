class_name Gull
extends Area3D
## Gaivota ladra: aparece se um peixe pescado fica muito tempo no chão, mergulha, pega o peixe e foge.
## Pode ser abatida a tiros (derruba o peixe).

var target: LandedFish = null
var state := "approach"
var hp := 1.5
var carrying_species := ""
var carrying_weight := 0.0
var _t := 0.0
var _dir := Vector3.FORWARD
var _wings: Array[Node3D] = []
var _model: Node3D
var _life := 30.0

static func spawn_for(fish: LandedFish) -> void:
	if not is_instance_valid(fish):
		return
	for g in fish.get_tree().get_nodes_in_group("gulls"):
		if g.target == fish:
			return
	var g := Gull.new()
	g.target = fish
	fish.get_tree().current_scene.add_child(g)
	var a := randf() * TAU
	g.global_position = fish.global_position + Vector3(cos(a) * 55.0, 22.0, sin(a) * 55.0)
	GameState.notify.emit("Uma gaivota está de olho no seu peixe! Colete ou atire nela!")

func _ready() -> void:
	add_to_group("gulls")
	add_to_group("targets")
	collision_layer = 8
	collision_mask = 0
	var cs := CollisionShape3D.new()
	var sh := SphereShape3D.new()
	sh.radius = 0.8
	cs.shape = sh
	add_child(cs)
	_model = Node3D.new()
	add_child(_model)
	var white := Color(0.96, 0.96, 0.94)
	Props.sphere(_model, 0.28, Vector3.ZERO, white, Vector3(0.8, 0.7, 1.8), 0.7)
	Props.sphere(_model, 0.16, Vector3(0, 0.12, 0.5), white)
	var bk := CylinderMesh.new()
	bk.top_radius = 0.0
	bk.bottom_radius = 0.06
	bk.height = 0.3
	bk.radial_segments = 5
	bk.rings = 1
	Props.mesh_node(_model, bk, Props.mat(Color(1.0, 0.7, 0.1), 0.4), Vector3(0, 0.1, 0.78), Vector3(PI / 2.0, 0, 0))
	for side in [-1.0, 1.0]:
		var pivot := Node3D.new()
		pivot.position = Vector3(side * 0.2, 0.05, 0.0)
		_model.add_child(pivot)
		var bm := BoxMesh.new()
		bm.size = Vector3(1.0, 0.04, 0.4)
		Props.mesh_node(pivot, bm, Props.mat(Color(0.88, 0.88, 0.9), 0.7), Vector3(side * 0.5, 0, 0))
		_wings.append(pivot)

func hit(damage: float, point: Vector3) -> void:
	hp -= damage
	Fx.puff(get_tree().current_scene, global_position, Color(1, 1, 1))
	Sfx.play_at("gull", get_tree().current_scene, global_position, 0.0, 1.8)
	if hp <= 0.0:
		if carrying_species != "":
			LandedFish.spawn(get_tree().current_scene, carrying_species, carrying_weight, global_position, Vector3.ZERO)
			GameState.notify.emit("Você derrubou a gaivota e recuperou o peixe!")
		GameState.add_coins(15)
		queue_free()

func _physics_process(delta: float) -> void:
	_t += delta
	_life -= delta
	var flap := sin(_t * 12.0) * 0.6
	if _wings.size() == 2:
		_wings[0].rotation.z = flap
		_wings[1].rotation.z = -flap
	match state:
		"approach":
			if target == null or not is_instance_valid(target):
				state = "leave"
				return
			var goal := target.global_position + Vector3(0, 0.4, 0)
			var to := goal - global_position
			_dir = _dir.lerp(to.normalized(), 0.08).normalized()
			global_position += _dir * (13.0 if to.length() > 12.0 else 9.0) * delta
			if to.length() < 1.2:
				carrying_species = target.species_id
				carrying_weight = target.weight
				target.queue_free()
				target = null
				GameState.notify.emit("A gaivota roubou o seu peixe!")
				Sfx.play_at("gull", get_tree().current_scene, global_position, 2.0)
				state = "leave"
				_dir = Vector3(randf_range(-1, 1), 0.6, randf_range(-1, 1)).normalized()
		"leave":
			_dir.y = lerpf(_dir.y, 0.4, 0.05)
			global_position += _dir.normalized() * 12.0 * delta
	_model.look_at(global_position + _dir, Vector3.UP) if _dir.length() > 0.01 and (global_position + _dir).distance_to(global_position) > 0.01 else null
	if _life <= 0.0:
		queue_free()
