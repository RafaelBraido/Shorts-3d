class_name Boat
extends Node3D
## Barco pilotável (lancha a motor e lancha militar). E para embarcar/sair; WASD/joystick acelera e vira.
## A lancha militar leva ao final: ao sair do mapa o jogador volta ao continente.

var kind := "motor"
var driver: Node3D = null
var speed := 0.0
var heading := 0.0
var radius := 6.0
var enabled := true
var max_speed := 16.0

var _t := randf() * 10.0
var _snd: AudioStreamPlayer3D
var _roll := 0.0
var _hands: Node3D
var _wheel: Node3D

static func spawn(parent: Node, pos: Vector3, yaw: float, boat_kind: String) -> Boat:
	var b := Boat.new()
	b.kind = boat_kind
	b.heading = yaw
	parent.add_child(b)
	b.global_position = Vector3(pos.x, 0.0, pos.z)
	return b

func _ready() -> void:
	add_to_group("interactable")
	max_speed = 24.0 if kind == "military" else 16.0
	_build()
	_snd = AudioStreamPlayer3D.new()
	_snd.stream = Sfx.sounds["motor"]
	_snd.unit_size = 10.0
	_snd.volume_db = -6.0
	add_child(_snd)
	rotation.y = heading

func _build() -> void:
	var hull_c := Color(0.5, 0.34, 0.2) if kind == "motor" else Color(0.07, 0.07, 0.08)
	var trim := Color(0.42, 0.28, 0.16) if kind == "motor" else Color(0.25, 0.27, 0.22)
	Props.mesh_node(self, _box(Vector3(2.4, 0.5, 6.0)), Props.mat(hull_c, 0.5, 0.2), Vector3(0, 0.0, 0))
	Props.mesh_node(self, _box(Vector3(2.6, 0.3, 5.6)), Props.mat(trim, 0.6), Vector3(0, 0.38, 0))
	var bow := PrismMesh.new()
	bow.size = Vector3(2.4, 0.5, 2.2)
	var bm := Props.mesh_node(self, bow, Props.mat(hull_c, 0.5, 0.2), Vector3(0, 0.0, 4.0), Vector3(0, PI, 0))
	bm.rotation.x = 0.0
	Props.mesh_node(self, _box(Vector3(2.0, 0.08, 5.2)), Props.mat(Color(0.55, 0.4, 0.25), 0.8), Vector3(0, 0.55, 0))
	Props.mesh_node(self, _box(Vector3(1.8, 0.7, 0.4)), Props.mat(trim, 0.6), Vector3(0, 0.95, 0.8))      # painel
	var glass := Props.mesh_node(self, _box(Vector3(1.8, 0.6, 0.06)), Props.mat(Color(0.5, 0.75, 0.9, 1.0), 0.1, 0.3), Vector3(0, 1.4, 1.0), Vector3(-0.35, 0, 0))
	Props.mesh_node(self, _box(Vector3(1.4, 0.35, 0.5)), Props.mat(Color(0.15, 0.15, 0.18), 0.8), Vector3(0, 0.8, -0.4))  # banco
	# volante octogonal azul e alavanca de aceleração (como no jogo real)
	_wheel = Node3D.new()
	_wheel.position = Vector3(0, 1.3, 0.78)
	_wheel.rotation.x = -0.5
	add_child(_wheel)
	var wcol := Props.mat(Color(0.3, 0.45, 0.72), 0.5, 0.2)
	for i in 8:
		var a := TAU * i / 8.0
		var seg := Props.mesh_node(_wheel, _box(Vector3(0.06, 0.06, 0.25)), wcol, Vector3(cos(a), sin(a), 0) * 0.3)
		seg.rotation.z = a + PI / 2.0
		seg.rotation.x = 0.0
		seg.scale = Vector3(1, 1, 1)
		seg.mesh = _box(Vector3(0.25, 0.06, 0.06))
	Props.mesh_node(_wheel, _box(Vector3(0.6, 0.05, 0.05)), wcol)
	Props.mesh_node(_wheel, _box(Vector3(0.05, 0.6, 0.05)), wcol)
	Props.sphere(_wheel, 0.07, Vector3.ZERO, Color(0.25, 0.4, 0.65))
	var lever := Props.mesh_node(self, _box(Vector3(0.06, 0.34, 0.06)), Props.mat(Color(0.35, 0.38, 0.45), 0.5, 0.4), Vector3(0.55, 1.0, 0.72), Vector3(-0.4, 0, 0))
	Props.sphere(self, 0.06, Vector3(0.55, 1.17, 0.66), Color(0.9, 0.2, 0.15))
	_hands = Node3D.new()
	add_child(_hands)
	Props.hand(_hands, Vector3(-0.28, 1.12, 0.62), Vector3(-0.5, 0, 0.3))
	Props.hand(_hands, Vector3(0.55, 1.12, 0.62), Vector3(-0.5, 0, 0), -1.0)
	_hands.visible = false
	Props.mesh_node(self, _box(Vector3(0.5, 0.6, 0.5)), Props.mat(Color(0.12, 0.12, 0.14), 0.4, 0.6), Vector3(0, 0.6, -3.2))  # motor
	if kind == "military":
		Props.mesh_node(self, _box(Vector3(2.2, 0.08, 2.0)), Props.mat(Color(0.2, 0.22, 0.17), 0.9), Vector3(0, 1.8, -0.2))
		Props.mesh_node(self, _box(Vector3(0.1, 1.0, 0.1)), Props.mat(Color(0.1, 0.1, 0.1), 0.5), Vector3(-1.0, 1.3, 0.8))
		Props.mesh_node(self, _box(Vector3(0.1, 1.0, 0.1)), Props.mat(Color(0.1, 0.1, 0.1), 0.5), Vector3(1.0, 1.3, 0.8))
	var lbl := Label3D.new()
	lbl.text = "Lancha a motor" if kind == "motor" else "Lancha militar"
	lbl.font_size = 40
	lbl.pixel_size = 0.006
	lbl.outline_size = 8
	lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lbl.position = Vector3(0, 3.0, 0)
	add_child(lbl)

func _box(s: Vector3) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = s
	return b

func seat_pos() -> Vector3:
	return global_position + global_transform.basis * Vector3(0, 0.95, -0.3)

func get_prompt() -> String:
	return "Sair do barco" if driver != null else "Pilotar a %s" % ("lancha militar" if kind == "military" else "lancha a motor")

func interact(player: Node) -> void:
	if driver == null:
		board(player)
	else:
		leave(false)

func board(player: Node) -> void:
	driver = player as Node3D
	player.vehicle = self
	player.rotation.y = heading
	player.set_collision_layer(0)
	if player.hud:
		player.hud.toast("W/S acelera, A/D vira. E para sair.", Color(0.8, 0.95, 1.0))
	_snd.play()
	_hands.visible = true

func leave(forced: bool) -> void:
	if driver == null:
		return
	var p := driver
	driver = null
	p.vehicle = null
	p.set_collision_layer(2)
	_snd.stop()
	_hands.visible = false
	speed = 0.0
	var side := global_transform.basis * Vector3(2.6, 0, 0.5)
	p.global_position = global_position + side + Vector3(0, 0.6, 0)
	p.velocity = Vector3.ZERO

func _physics_process(delta: float) -> void:
	_t += delta
	max_speed = (24.0 if kind == "military" else 16.0) * GameState.engine_speed_mult()
	if driver != null:
		var v := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
		var throttle := -v.y
		var target := throttle * max_speed if throttle > 0.0 else throttle * 5.0
		speed = move_toward(speed, target, (9.0 if throttle != 0.0 else 4.0) * delta)
		var turn := -v.x * 0.9 * clampf(absf(speed) / 5.0, 0.0, 1.0) * (1.0 if speed >= 0.0 else -1.0)
		heading += turn * delta
		_roll = lerpf(_roll, v.x * 0.12 * clampf(absf(speed) / max_speed, 0.0, 1.0), 0.1)
		_snd.pitch_scale = 0.7 + absf(speed) / max_speed * 1.1
		if kind == "military" and (absf(global_position.x) > 235.0 or absf(global_position.z) > 235.0):
			Story.boat_reached_mainland()
	var fwd := Vector3(sin(heading), 0, cos(heading))
	if absf(speed) > 0.05:
		var np := global_position + fwd * speed * delta
		var blocked := Terrain.depth_at(np.x, np.z) < 1.0 and Terrain.is_inside_map(np, -40.0)
		if kind == "motor" and not Terrain.is_inside_map(np, 4.0):
			blocked = true
		if blocked:
			speed = -speed * 0.2
			if driver != null and absf(speed) > 0.5:
				Sfx.play("impact", -6.0, 0.6)
		else:
			global_position = Vector3(np.x, 0.0, np.z)
	var bob := sin(_t * 1.6) * 0.07
	global_position.y = bob
	rotation = Vector3(-clampf(speed / max_speed, 0.0, 1.0) * 0.06 + sin(_t * 1.1) * 0.015, heading, _roll + sin(_t * 1.3) * 0.02)
	if driver != null and speed > 4.0 and randf() < 0.3:
		Fx.splash(get_tree().current_scene, global_position - fwd * 3.2, 0.25)
