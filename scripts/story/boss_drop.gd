class_name BossDrop
extends Node3D
## Item deixado por um chefe (carapaça, esqueleto, barbatana, cabeça, carcaça...). Interativo com E.

var item := ""
var radius := 4.5
var enabled := true
var _label: Label3D

static func spawn(parent: Node, pos: Vector3, item_id: String) -> BossDrop:
	var d := BossDrop.new()
	d.item = item_id
	parent.add_child(d)
	d.global_position = pos
	return d

func _ready() -> void:
	add_to_group("interactable")
	var gold := Props.mat(Color(1.0, 0.85, 0.2), 0.3, 0.0, 1.5)
	match item:
		"crab_shell":
			Props.sphere(self, 0.9, Vector3(0, 0.4, 0), Color(0.75, 0.2, 0.1), Vector3(1.3, 0.6, 1.1), 0.5)
		"piranha_skeleton":
			var white := Color(0.95, 0.93, 0.85)
			Props.cylinder(self, 0.06, 0.06, 2.4, Vector3(0, 0.15, 0), white, 6).rotation.x = PI / 2.0
			for i in 6:
				var rib := Props.cylinder(self, 0.04, 0.04, 0.8, Vector3(0, 0.25, -0.9 + i * 0.35), white, 5)
				rib.rotation.z = PI / 2.0
			Props.sphere(self, 0.35, Vector3(0, 0.2, 1.3), white, Vector3(0.7, 0.8, 1.2))
		"puffer_fin":
			var cm := CylinderMesh.new()
			cm.top_radius = 0.0
			cm.bottom_radius = 0.7
			cm.height = 1.5
			cm.radial_segments = 3
			cm.rings = 1
			Props.mesh_node(self, cm, Props.mat(Color(0.95, 0.85, 0.35), 0.5), Vector3(0, 0.75, 0))
		"albatross_head":
			Props.sphere(self, 0.6, Vector3(0, 0.5, 0), Color(0.96, 0.96, 0.94), Vector3(1, 1, 1.1))
			var bk := CylinderMesh.new()
			bk.top_radius = 0.0
			bk.bottom_radius = 0.2
			bk.height = 1.1
			bk.radial_segments = 6
			bk.rings = 1
			Props.mesh_node(self, bk, Props.mat(Color(0.95, 0.75, 0.15), 0.4), Vector3(0, 0.45, 0.9), Vector3(PI / 2.0, 0, 0))
		"whale_carcass":
			Props.sphere(self, 1.0, Vector3(0, 0.6, 0), Color(0.1, 0.11, 0.16), Vector3(1.6, 1.2, 4.5), 0.6)
			Props.sphere(self, 1.0, Vector3(0, 0.1, 1.8), Color(0.85, 0.85, 0.8), Vector3(1.2, 0.5, 1.6), 0.6)
			radius = 6.0
		"shark_fin":
			var cm3 := CylinderMesh.new()
			cm3.top_radius = 0.0
			cm3.bottom_radius = 0.7
			cm3.height = 1.6
			cm3.radial_segments = 3
			cm3.rings = 1
			Props.mesh_node(self, cm3, Props.mat(Color(0.15, 0.3, 0.75), 0.5), Vector3(0, 0.8, 0))
		"mutant_fin":
			var cm2 := CylinderMesh.new()
			cm2.top_radius = 0.0
			cm2.bottom_radius = 0.9
			cm2.height = 2.0
			cm2.radial_segments = 3
			cm2.rings = 1
			Props.mesh_node(self, cm2, Props.mat(Color(1.0, 0.4, 0.05), 0.3, 0.0, 2.5), Vector3(0, 1.0, 0))
			var l := OmniLight3D.new()
			l.light_color = Color(1.0, 0.5, 0.1)
			l.light_energy = 2.0
			l.omni_range = 8.0
			l.position.y = 1.0
			add_child(l)
		_:
			Props.sphere(self, 0.4, Vector3(0, 0.4, 0), Color(1, 0.9, 0.3))
	_label = Label3D.new()
	_label.text = Story.item_name(item)
	_label.font_size = 40
	_label.pixel_size = 0.006
	_label.outline_size = 8
	_label.modulate = Color(1.0, 0.9, 0.5)
	_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_label.no_depth_test = true
	_label.position = Vector3(0, 2.6, 0)
	add_child(_label)
	GameState.notify.emit("Pegue o item: %s" % Story.item_name(item))

func get_prompt() -> String:
	return "Pegar: %s" % Story.item_name(item)

func interact(_player: Node) -> void:
	if item == "whale_carcass":
		Story.pick_up_carcass()
	else:
		Sfx.play("coin")
		Story.add_item(item)
	queue_free()
