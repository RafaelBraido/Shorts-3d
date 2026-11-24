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
