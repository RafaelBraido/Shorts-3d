class_name LeechPickup
extends Node3D
## Sanguessuga coletável (capítulo 2).

var radius := 2.6
var enabled := true

func _ready() -> void:
	add_to_group("interactable")
	for i in 5:
		Props.sphere(self, 0.07, Vector3(0.1 * (i - 2), 0.06, sin(i) * 0.05), Color(0.12, 0.07, 0.05), Vector3(1.4, 0.7, 0.9), 0.3)
	Props.sphere(self, 0.28, Vector3(0, 0.08, 0), Color(0.1, 0.3, 0.1, 1.0), Vector3(1.6, 0.25, 1.2), 0.9)
	var l := Label3D.new()
	l.text = "Sanguessuga"
	l.font_size = 30
	l.pixel_size = 0.005
	l.outline_size = 6
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.no_depth_test = true
	l.position = Vector3(0, 0.9, 0)
	add_child(l)

func get_prompt() -> String:
	return "Coletar sanguessuga"

func interact(_p: Node) -> void:
	Sfx.play("coin", -6.0, 1.4)
	Story.add_item("leech")
	queue_free()
