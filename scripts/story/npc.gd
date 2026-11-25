class_name StoryNpc
extends Node3D
## NPC da história: humanoide procedural + ponto de interação. Ao apertar E chama Story.talk(id).

var npc_id := ""
var display_name := ""
var prompt := ""
var radius := 4.0
var enabled := true
var style := "guardian"
var seated := false

static func make(parent: Node, id: String, nm: String, pos: Vector3, yaw: float, st: String, sit: bool = false) -> StoryNpc:
	var n := StoryNpc.new()
	n.npc_id = id
	n.display_name = nm
	n.style = st
	n.seated = sit
	n.prompt = "Falar com %s" % nm
	parent.add_child(n)
	n.global_position = pos
	n.rotation.y = yaw
	return n

func _ready() -> void:
	add_to_group("interactable")
	_build()

func get_prompt() -> String:
	return prompt

func interact(_player: Node) -> void:
	Story.talk_target = self
	Story.talk(npc_id)
	# vira para o jogador
	var pl := get_tree().get_first_node_in_group("player") as Node3D
	if pl:
		var d := pl.global_position - global_position
		rotation.y = atan2(d.x, d.z)

func _build() -> void:
	var skin := Color(0.88, 0.68, 0.52)
	var shirt := Color(0.3, 0.5, 0.7)
	var pants := Color(0.25, 0.25, 0.3)
	match style:
		"guardian": shirt = Color(0.75, 0.2, 0.15); pants = Color(0.2, 0.25, 0.35)
		"marina": shirt = Color(0.2, 0.65, 0.55); pants = Color(0.9, 0.85, 0.6); skin = Color(0.8, 0.6, 0.45)
		"tourist": shirt = Color(0.95, 0.5, 0.2); pants = Color(0.9, 0.9, 0.8)
		"bbq": shirt = Color(0.95, 0.95, 0.95); pants = Color(0.15, 0.15, 0.2)
		"vendor": shirt = Color(0.25, 0.55, 0.3); pants = Color(0.35, 0.28, 0.2)
		"scientist": shirt = Color(0.95, 0.85, 0.1); pants = Color(0.95, 0.85, 0.1); skin = Color(0.3, 0.32, 0.36)
	var y0 := 0.0
	if seated:
		y0 = -0.45
	# tronco e pernas
	var torso := CapsuleMesh.new()
	torso.radius = 0.27
	torso.height = 0.95
	Props.mesh_node(self, torso, Props.mat(shirt), Vector3(0, y0 + 1.15, 0))
	if seated:
		for sx in [-0.15, 0.15]:
			Props.cylinder(self, 0.1, 0.1, 0.55, Vector3(sx, y0 + 0.75, 0.3), pants, 8).rotation.x = PI / 2.0
			Props.cylinder(self, 0.09, 0.09, 0.55, Vector3(sx, y0 + 0.5, 0.55), pants, 8)
	else:
		for sx in [-0.14, 0.14]:
			Props.cylinder(self, 0.1, 0.09, 0.85, Vector3(sx, 0.43, 0), pants, 8)
	# braços
	for sx in [-0.36, 0.36]:
		var arm := Props.cylinder(self, 0.07, 0.06, 0.6, Vector3(sx, y0 + 1.15, 0.05), shirt if style != "scientist" else shirt, 8)
		arm.rotation.z = 0.15 * sign(sx)
	# cabeça
	Props.sphere(self, 0.21, Vector3(0, y0 + 1.88, 0), skin)
	for sx in [-0.08, 0.08]:
		Props.sphere(self, 0.03, Vector3(sx, y0 + 1.92, 0.18), Color(0.05, 0.05, 0.05))
	# acessórios por estilo
	match style:
		"guardian":
			Props.sphere(self, 0.17, Vector3(0, y0 + 1.75, 0.1), Color(0.95, 0.95, 0.95), Vector3(1.0, 1.0, 0.8))
			Props.cylinder(self, 0.24, 0.24, 0.05, Vector3(0, y0 + 2.06, 0), Color(0.15, 0.2, 0.4), 12)
			Props.cylinder(self, 0.16, 0.2, 0.16, Vector3(0, y0 + 2.14, 0), Color(0.15, 0.2, 0.4), 12)
		"marina":
			Props.sphere(self, 0.24, Vector3(0, y0 + 1.9, -0.06), Color(0.35, 0.2, 0.1), Vector3(1, 1.0, 1.0))
			Props.cylinder(self, 0.18, 0.12, 0.5, Vector3(0, y0 + 1.6, -0.12), Color(0.35, 0.2, 0.1), 8)
		"tourist":
			Props.cylinder(self, 0.4, 0.4, 0.04, Vector3(0, y0 + 2.07, 0), Color(0.9, 0.8, 0.45), 14)
			Props.cylinder(self, 0.18, 0.2, 0.15, Vector3(0, y0 + 2.14, 0), Color(0.9, 0.8, 0.45), 12)
			Props.mesh_node(self, _bx(Vector3(0.36, 0.07, 0.04)), Props.mat(Color(0.02, 0.02, 0.02), 0.2), Vector3(0, y0 + 1.93, 0.19))
		"bbq":
			Props.cylinder(self, 0.19, 0.17, 0.35, Vector3(0, y0 + 2.2, 0), Color(1, 1, 1), 12)
			Props.sphere(self, 0.22, Vector3(0, y0 + 2.4, 0), Color(1, 1, 1))
			Props.mesh_node(self, _bx(Vector3(0.5, 0.6, 0.05)), Props.mat(Color(0.8, 0.15, 0.1)), Vector3(0, y0 + 1.1, 0.27))
		"vendor":
			Props.cylinder(self, 0.23, 0.23, 0.06, Vector3(0, y0 + 2.05, 0), Color(0.2, 0.2, 0.2), 12)
		"scientist":
			# traje hazmat: capuz amarelo, visor e tanque
			Props.sphere(self, 0.27, Vector3(0, y0 + 1.88, 0), Color(0.95, 0.85, 0.1))
			Props.mesh_node(self, _bx(Vector3(0.32, 0.16, 0.06)), Props.mat(Color(0.15, 0.2, 0.25), 0.1, 0.4), Vector3(0, y0 + 1.9, 0.24))
			Props.cylinder(self, 0.12, 0.12, 0.5, Vector3(0, y0 + 1.25, -0.32), Color(0.55, 0.58, 0.6), 10, 0.4, 0.6)
	var l := Label3D.new()
	l.text = display_name
	l.font_size = 40
	l.pixel_size = 0.004
	l.outline_size = 8
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.position = Vector3(0, y0 + 2.7, 0)
	add_child(l)

func _bx(s: Vector3) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = s
	return b
