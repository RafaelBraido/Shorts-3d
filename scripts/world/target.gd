extends StaticBody3D
## Alvo de tiro: boia flutuante (kind="buoy") ou garrafa em poste (kind="bottle").
## Ao ser atingido concede moedas/XP e reaparece depois de alguns segundos.

@export var kind: String = "buoy"
@export var reward: int = 8

var _home := Vector3.ZERO
var _alive := true
var _t := randf() * 10.0
var _visual: Node3D

func _ready() -> void:
	add_to_group("targets")
	collision_layer = 8
	collision_mask = 0
	_home = position
	_visual = Node3D.new()
	add_child(_visual)
	var cs := CollisionShape3D.new()
	var sh := SphereShape3D.new()
	sh.radius = 0.45 if kind == "buoy" else 0.25
	cs.shape = sh
	cs.position.y = 0.3
	add_child(cs)
	if kind == "buoy":
		Props.cylinder(_visual, 0.3, 0.38, 0.35, Vector3(0, 0.1, 0), Color(0.9, 0.12, 0.1), 12, 0.5)
		Props.cylinder(_visual, 0.34, 0.3, 0.2, Vector3(0, 0.38, 0), Color(0.95, 0.95, 0.95), 12, 0.5)
		Props.cylinder(_visual, 0.2, 0.3, 0.2, Vector3(0, 0.58, 0), Color(0.9, 0.12, 0.1), 12, 0.5)
		Props.sphere(_visual, 0.09, Vector3(0, 0.78, 0), Color(1.0, 0.85, 0.2))
	else:
		Props.cylinder(_visual, 0.1, 0.1, 0.35, Vector3(0, 0.2, 0), Color(0.2, 0.6, 0.3), 10, 0.1)
		Props.cylinder(_visual, 0.04, 0.1, 0.12, Vector3(0, 0.44, 0), Color(0.2, 0.6, 0.3), 10, 0.1)

func _process(delta: float) -> void:
	if kind == "buoy" and _alive:
		_t += delta
		_visual.position.y = sin(_t * 1.6) * 0.08
		_visual.rotation = Vector3(sin(_t * 1.1) * 0.06, 0, cos(_t * 0.9) * 0.06)

func hit(_damage: float, point: Vector3) -> void:
	if not _alive:
		return
	_alive = false
	GameState.add_coins(reward)
	GameState.add_xp(6)
	GameState.notify.emit("Alvo atingido! +%d moedas" % reward)
	Sfx.play("coin", -8.0)
	set_deferred("collision_layer", 0)
	var tw := create_tween()
	tw.tween_property(_visual, "position:y", -1.0 if kind == "buoy" else -0.3, 0.35)
	tw.parallel().tween_property(_visual, "rotation:z", 1.2, 0.35)
	tw.tween_interval(6.0)
	tw.tween_callback(_respawn)

func _respawn() -> void:
	_visual.rotation = Vector3.ZERO
	_visual.position.y = 0.0
	collision_layer = 8
	_alive = true
