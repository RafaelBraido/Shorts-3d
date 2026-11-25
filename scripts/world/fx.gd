class_name Fx
extends RefCounted
## Efeitos visuais rápidos (partículas de respingo, poeira, faíscas) que se liberam sozinhos.

static func _particles(parent: Node, pos: Vector3, color: Color, amount: int, speed: float, size: float, lifetime: float, spread: float = 50.0, gravity: float = 9.8) -> void:
	var p := CPUParticles3D.new()
	p.one_shot = true
	p.amount = amount
	p.lifetime = lifetime
	p.explosiveness = 1.0
	p.direction = Vector3.UP
	p.spread = spread
	p.initial_velocity_min = speed * 0.5
	p.initial_velocity_max = speed
	p.gravity = Vector3(0, -gravity, 0)
	var sm := SphereMesh.new()
	sm.radius = size
	sm.height = size * 2.0
	sm.radial_segments = 6
	sm.rings = 3
	p.mesh = sm
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = 0.4
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA if color.a < 1.0 else BaseMaterial3D.TRANSPARENCY_DISABLED
	p.material_override = m
	parent.add_child(p)
	p.global_position = pos
	p.emitting = true
	var timer := p.get_tree().create_timer(lifetime + 0.3)
	timer.timeout.connect(p.queue_free)

static func splash(parent: Node, pos: Vector3, power: float = 1.0) -> void:
	_particles(parent, Vector3(pos.x, 0.05, pos.z), Color(0.85, 0.95, 1.0, 0.85), int(18 * power) + 6, 4.0 * power + 1.5, 0.06 * power + 0.03, 0.9, 35.0)

static func puff(parent: Node, pos: Vector3, color: Color) -> void:
	_particles(parent, pos, color, 10, 2.5, 0.05, 0.6, 80.0, 6.0)

static func spark(parent: Node, pos: Vector3) -> void:
	_particles(parent, pos, Color(1.0, 0.85, 0.3), 8, 4.0, 0.025, 0.35, 90.0)

static func tracer(parent: Node, from: Vector3, to: Vector3) -> void:
	var len := from.distance_to(to)
	if len < 0.5:
		return
	var holder := Node3D.new()
	parent.add_child(holder)
	holder.look_at_from_position(from, to, Vector3.UP)
	var cm := CylinderMesh.new()
	cm.top_radius = 0.012
	cm.bottom_radius = 0.012
	cm.height = len
	cm.radial_segments = 4
	cm.rings = 1
	var mi := MeshInstance3D.new()
	mi.mesh = cm
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = Color(1.0, 0.9, 0.5, 0.9)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mi.material_override = m
	mi.rotation.x = PI / 2.0
	mi.position.z = -len / 2.0
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	holder.add_child(mi)
	var tw := holder.create_tween()
	tw.tween_property(m, "albedo_color:a", 0.0, 0.12)
	tw.tween_callback(holder.queue_free)

# ---- números de dano e sangue (como no jogo real) ----

static var _blood_list: Array = []

## Número flutuante que sobe e some ("16" ao acertar com a faca: dano x8).
static func damage_number(parent: Node, pos: Vector3, amount: float, color: Color = Color(1, 1, 1)) -> void:
	var l := Label3D.new()
	l.text = str(int(round(amount * 8.0)))
	l.font_size = 72
	l.pixel_size = 0.0075
	l.outline_size = 14
	l.modulate = color
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.no_depth_test = true
	parent.add_child(l)
	l.global_position = pos + Vector3(randf_range(-0.4, 0.4), 0.4, randf_range(-0.4, 0.4))
	var tw := l.create_tween()
	tw.set_parallel(true)
	tw.tween_property(l, "position:y", l.position.y + 1.4, 0.8)
	tw.tween_property(l, "modulate:a", 0.0, 0.8).set_delay(0.3)
	tw.chain().tween_callback(l.queue_free)

## Mancha de sangue achatada no chão sob "pos" (limita a 70 manchas).
static func blood(parent: Node, pos: Vector3, size: float = 1.0) -> void:
	var space := parent.get_viewport().world_3d.direct_space_state
	var q := PhysicsRayQueryParameters3D.create(pos + Vector3(0, 2.0, 0), pos + Vector3(0, -8.0, 0), 1)
	var hit := space.intersect_ray(q)
	if hit.is_empty():
		return
	var p: Vector3 = hit["position"]
	if p.y < 0.15 and Terrain.depth_at(p.x, p.z) > 0.3:
		return
	var root := Node3D.new()
	parent.add_child(root)
	root.global_position = p + (hit["normal"] as Vector3) * 0.03
	root.rotate_y(randf() * TAU)
	for i in 4:
		var cm := CylinderMesh.new()
		cm.top_radius = size * randf_range(0.35, 0.9) * (1.0 if i == 0 else 0.55)
		cm.bottom_radius = cm.top_radius
		cm.height = 0.02
		cm.radial_segments = 7
		cm.rings = 1
		var blob := MeshInstance3D.new()
		blob.mesh = cm
		blob.material_override = Props.mat(Color(0.62, 0.03, 0.03), 0.35)
		blob.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		root.add_child(blob)
		blob.position = Vector3(randf_range(-0.7, 0.7) * size * (0.0 if i == 0 else 1.0), 0.0, randf_range(-0.7, 0.7) * size * (0.0 if i == 0 else 1.0))
		blob.scale = Vector3(randf_range(0.8, 1.7), 1.0, randf_range(0.8, 1.5))
	var mi := root
	_blood_list.append(mi)
	while _blood_list.size() > 45:
		var old = _blood_list.pop_front()
		if is_instance_valid(old):
			old.queue_free()
