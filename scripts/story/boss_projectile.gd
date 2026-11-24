class_name BossProjectile
extends Node3D
## Projétil de chefe: orbe reto (albatroz) ou bola de lava em arco (baleia mutante).

var vel := Vector3.ZERO
var grav := 0.0
var damage := 10.0
var hit_radius := 1.0
var life := 6.0
var aoe := false
var _color := Color.WHITE

func setup(velocity: Vector3, gravity: float, dmg: float, radius: float, color: Color, size: float, area: bool = false) -> void:
	vel = velocity
	grav = gravity
	damage = dmg
	hit_radius = radius
	aoe = area
	_color = color
	var s := SphereMesh.new()
	s.radius = 0.4 if not area else 0.9
	s.height = s.radius * 2.0
	s.radial_segments = 10
	s.rings = 6
	var mi := MeshInstance3D.new()
	mi.mesh = s
	mi.material_override = Props.mat(color, 0.3, 0.0, 3.0)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	var l := OmniLight3D.new()
	l.light_color = color
	l.light_energy = 2.5
	l.omni_range = size * 2.0
	add_child(l)

func _physics_process(delta: float) -> void:
	life -= delta
	vel.y -= grav * delta
	global_position += vel * delta
	var player := get_tree().get_first_node_in_group("player") as Node3D
	if player != null and global_position.distance_to(player.global_position + Vector3(0, 1.0, 0)) < hit_radius + (0.0 if not aoe else 0.0) and not aoe:
		player.take_damage(damage, global_position)
		queue_free()
		return
	var gh := Terrain.height_at(global_position.x, global_position.z)
	if global_position.y <= maxf(gh, 0.0) or life <= 0.0:
		_land(player)
		queue_free()

func _land(player: Node3D) -> void:
	var scene := get_tree().current_scene
	if aoe:
		Fx.puff(scene, global_position, Color(1.0, 0.45, 0.1))
		Fx.spark(scene, global_position)
		Sfx.play_at("impact", scene, global_position, 2.0, 0.5)
		if player != null and global_position.distance_to(player.global_position) < hit_radius:
			player.take_damage(damage, global_position)
	elif global_position.y <= 0.0:
		Fx.splash(scene, global_position, 0.8)
