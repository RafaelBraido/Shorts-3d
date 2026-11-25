class_name Dynamite
extends Node3D
## Dinamite arremessada: voa em arco, quica ao tocar o chão e explode após o pavio, ferindo alvos, peixes, chefes
## e (de leve) o próprio jogador se estiver perto demais.

var vel := Vector3.ZERO
var fuse := 2.2
var _landed := false
var _blink := 0.0

func _ready() -> void:
	var red := Props.mat(Color(0.8, 0.1, 0.08), 0.6)
	for i in 3:
		var cm := CylinderMesh.new()
		cm.top_radius = 0.05
		cm.bottom_radius = 0.05
		cm.height = 0.34
		cm.radial_segments = 8
		cm.rings = 1
		var mi := Props.mesh_node(self, cm, red, Vector3((i - 1) * 0.1, 0, 0))
		mi.rotation.z = PI / 2.0 * 0.0
	var spark := Props.sphere(self, 0.04, Vector3(0, 0.22, 0), Color(1.0, 0.7, 0.1))
	spark.material_override = Props.mat(Color(1.0, 0.6, 0.1), 0.3, 0.0, 4.0)
	var l := OmniLight3D.new()
	l.light_color = Color(1.0, 0.5, 0.1)
	l.light_energy = 1.5
	l.omni_range = 4.0
	l.position.y = 0.22
	add_child(l)

func _physics_process(delta: float) -> void:
	fuse -= delta
	_blink += delta
	if not _landed:
		vel.y -= 9.8 * delta
		var from := global_position
		var to := from + vel * delta
		var q := PhysicsRayQueryParameters3D.create(from, to, 1)
		var hit := get_world_3d().direct_space_state.intersect_ray(q)
		if not hit.is_empty():
			global_position = hit["position"] + Vector3(0, 0.1, 0)
			vel = vel.bounce(hit["normal"]) * 0.35
			if vel.length() < 1.5:
				_landed = true
		else:
			global_position = to
			if to.y <= Terrain.WATER_LEVEL and Terrain.depth_at(to.x, to.z) > 0.3:
				global_position = Vector3(to.x, 0.0, to.z)
				_landed = true
				Fx.splash(get_tree().current_scene, global_position, 0.6)
		rotate_x(delta * 9.0)
	if fuse <= 0.0:
		_explode()

func _explode() -> void:
	var scene := get_tree().current_scene
	var pos := global_position
	Fx.puff(scene, pos, Color(1.0, 0.55, 0.1))
	Fx.puff(scene, pos + Vector3(0, 1, 0), Color(0.25, 0.22, 0.2))
	Fx.spark(scene, pos)
	if pos.y <= 0.3 and Terrain.depth_at(pos.x, pos.z) > 0.3:
		Fx.splash(scene, pos, 3.0)
	Sfx.play_at("shot", scene, pos, 4.0, 0.35)
	Sfx.play_at("impact", scene, pos, 4.0, 0.4)
	var radius := WeaponDB.DYNAMITE_RADIUS
	for group in ["targets", "fish"]:
		for n in get_tree().get_nodes_in_group(group):
			if n is Node3D and is_instance_valid(n) and n.has_method("hit"):
				var d := pos.distance_to(n.global_position)
				if d < radius + (4.0 if n is Boss else 0.0):
					n.call("hit", WeaponDB.DYNAMITE_DAMAGE * (1.0 - clampf(d / (radius + 6.0), 0.0, 0.6)), n.global_position)
	for bt in get_tree().get_nodes_in_group("boats"):
		if bt.global_position.distance_to(pos) < 8.0:
			bt.launch()
	var player := get_tree().get_first_node_in_group("player") as Node3D
	if player != null and player.global_position.distance_to(pos) < 4.0 and player.vehicle == null:
		player.take_damage(15.0, pos)
	var hud := get_tree().get_first_node_in_group("hud")
	if hud:
		hud.hit_marker()
	queue_free()
