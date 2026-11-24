class_name Bobber
extends Node3D
## Boia de pesca: voa em arco balístico, pousa na água (ou no chão = lance inválido),
## flutua com ondas, mergulha quando um peixe belisca/morde.

signal landed(in_water: bool)
signal bitten(fish: Fish)
signal missed

enum S { FLYING, FLOATING, GROUND }

var state: S = S.FLYING
var vel := Vector3.ZERO
var dip := 0.0           ## mergulho atual (m)
var dip_target := 0.0
var biting := false
var _t := 0.0
var _vis: Node3D

func _ready() -> void:
	_vis = Node3D.new()
	add_child(_vis)
	Props.sphere(_vis, 0.07, Vector3(0, 0.03, 0), Color(0.95, 0.95, 0.95), Vector3(1, 1.1, 1), 0.4)
	var top := Props.sphere(_vis, 0.065, Vector3(0, 0.1, 0), Color(0.9, 0.1, 0.08), Vector3(1, 0.7, 1), 0.4)
	top.name = "Top"
	Props.cylinder(_vis, 0.008, 0.008, 0.12, Vector3(0, 0.2, 0), Color(0.95, 0.95, 0.2), 6)
	for c in _vis.get_children():
		if c is GeometryInstance3D:
			c.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

func launch(from: Vector3, velocity: Vector3) -> void:
	global_position = from
	vel = velocity
	state = S.FLYING

func _physics_process(delta: float) -> void:
	_t += delta
	match state:
		S.FLYING:
			vel.y -= 9.8 * delta
			var from := global_position
			var to := from + vel * delta
			var q := PhysicsRayQueryParameters3D.create(from, to, 1)
			var hit := get_world_3d().direct_space_state.intersect_ray(q)
			if not hit.is_empty():
				global_position = hit["position"] + Vector3(0, 0.05, 0)
				state = S.GROUND
				landed.emit(false)
				return
			global_position = to
			if to.y <= Terrain.WATER_LEVEL and vel.y < 0.0:
				if Terrain.depth_at(to.x, to.z) > 0.5:
					global_position = Vector3(to.x, 0.0, to.z)
					state = S.FLOATING
					Fx.splash(get_tree().current_scene, global_position, 0.8)
					Sfx.play_at("splash", get_tree().current_scene, global_position, -2.0)
					landed.emit(true)
				else:
					var gh := Terrain.height_at(to.x, to.z)
					global_position = Vector3(to.x, maxf(gh, to.y) + 0.05, to.z)
					state = S.GROUND
					landed.emit(false)
			rotation.y += delta * 6.0
		S.FLOATING:
			dip = lerpf(dip, dip_target, clampf(10.0 * delta, 0.0, 1.0))
			dip_target = lerpf(dip_target, 0.0, clampf(3.0 * delta, 0.0, 1.0)) if not biting else dip_target
			var bob := sin(_t * 2.2) * 0.025 + sin(_t * 3.7) * 0.012
			_vis.position.y = bob - dip
			_vis.rotation.z = sin(_t * 1.7) * 0.12
		S.GROUND:
			pass

func in_water() -> bool:
	return state == S.FLOATING

## Peixe belisca: pequeno mergulho.
func nibble(fish_len: float) -> void:
	if state != S.FLOATING:
		return
	dip = 0.06 + minf(fish_len, 1.0) * 0.06
	dip_target = 0.0
	Fx.splash(get_tree().current_scene, global_position, 0.25)
	Sfx.play_at("splash", get_tree().current_scene, global_position, -16.0, 1.6)

## Peixe morde: mergulho forte e sustentado até fisgar ou perder.
func bite(fish: Fish) -> void:
	if state != S.FLOATING:
		return
	biting = true
	dip_target = 0.28
	Fx.splash(get_tree().current_scene, global_position, 0.7)
	Sfx.play_at("splash", get_tree().current_scene, global_position, -6.0, 1.2)
	bitten.emit(fish)

func bite_missed() -> void:
	biting = false
	dip_target = 0.0
	missed.emit()

func end_bite() -> void:
	biting = false
	dip_target = 0.0
