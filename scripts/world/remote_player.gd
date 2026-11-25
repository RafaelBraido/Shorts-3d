class_name RemotePlayer
extends Node3D
## Avatar de outro jogador na rede: corpo simples, cabeça, item na mão e nome flutuante.
## A posição recebida é suavizada (interpolação) entre os pacotes.

var peer_id := 0
var _target_pos := Vector3.ZERO
var _target_yaw := 0.0
var _pitch := 0.0
var _crouch := false
var _item := ""
var _first := true
var _body: Node3D
var _head: Node3D
var _hold: Node3D
var _label: Label3D
var _body_mi: MeshInstance3D
var _head_mi: MeshInstance3D
var _hat_mi: MeshInstance3D

func _ready() -> void:
	var hue := fmod(float(peer_id) * 0.37, 1.0)
	var shirt := Color.from_hsv(hue, 0.65, 0.85)
	_body = Node3D.new()
	add_child(_body)
	var cap := CapsuleMesh.new()
	cap.radius = 0.28
	cap.height = 1.2
	_body_mi = Props.mesh_node(_body, cap, Props.mat(shirt), Vector3(0, 0.75, 0))
	_head = Node3D.new()
	_head.position = Vector3(0, 1.5, 0)
	add_child(_head)
	_head_mi = Props.sphere(_head, 0.2, Vector3.ZERO, Color(0.9, 0.7, 0.55))
	_hat_mi = Props.cylinder(_head, 0.24, 0.24, 0.05, Vector3(0, 0.17, 0), Color(0.95, 0.85, 0.2), 14)
	Props.sphere(_head, 0.035, Vector3(-0.08, 0.04, -0.17), Color(0.05, 0.05, 0.05))
	Props.sphere(_head, 0.035, Vector3(0.08, 0.04, -0.17), Color(0.05, 0.05, 0.05))
	_hold = Node3D.new()
	_hold.position = Vector3(0.28, -0.15, -0.35)
	_head.add_child(_hold)
	_label = Label3D.new()
	_label.font_size = 40
	_label.pixel_size = 0.005
	_label.outline_size = 8
	_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_label.no_depth_test = true
	_label.position = Vector3(0, 2.15, 0)
	add_child(_label)
	_set_item("")

func apply_look(skin: Color, shirt: Color, hat: Color) -> void:
	if _body_mi == null:
		call_deferred("apply_look", skin, shirt, hat)
		return
	_body_mi.material_override = Props.mat(shirt)
	_head_mi.material_override = Props.mat(skin)
	_hat_mi.material_override = Props.mat(hat)

func set_display_name(n: String) -> void:
	if _label:
		_label.text = n
	else:
		call_deferred("set_display_name", n)

func apply_state(pos: Vector3, yaw: float, pitch: float, item: String, crouch: bool) -> void:
	_target_pos = pos
	_target_yaw = yaw
	_pitch = pitch
	_crouch = crouch
	if _first:
		_first = false
		global_position = pos
		rotation.y = yaw
	if item != _item:
		_set_item(item)

func _set_item(item: String) -> void:
	_item = item
	if _hold == null:
		return
	for c in _hold.get_children():
		c.queue_free()
	if item == "rifle":
		var r := Props.mesh_node(_hold, BoxMesh.new(), Props.mat(Color(0.85, 0.55, 0.08), 0.3, 0.8), Vector3(0, 0, -0.3))
		(r.mesh as BoxMesh).size = Vector3(0.07, 0.1, 0.8)
		Props.cylinder(_hold, 0.04, 0.04, 0.3, Vector3(0, 0.1, -0.2), Color(0.1, 0.1, 0.1), 10).rotation.x = PI / 2.0
	elif item == "rod":
		var rod := Props.cylinder(_hold, 0.006, 0.02, 1.7, Vector3(0, 0.3, -0.7), Color(0.55, 0.38, 0.18), 6)
		rod.rotation.x = PI / 2.0 + 0.5

func _process(delta: float) -> void:
	var k := clampf(12.0 * delta, 0.0, 1.0)
	global_position = global_position.lerp(_target_pos, k)
	rotation.y = lerp_angle(rotation.y, _target_yaw, k)
	_body.scale.y = lerpf(_body.scale.y, 0.65 if _crouch else 1.0, k)
	_head.position.y = lerpf(_head.position.y, 0.95 if _crouch else 1.5, k)
	_label.position.y = lerpf(_label.position.y, 1.6 if _crouch else 2.15, k)
	_head.rotation.x = lerpf(_head.rotation.x, _pitch, k)
