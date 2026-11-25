class_name InteractSpot
extends Node3D
## Ponto de interação genérico da história (altar, poça de lava...). Chama um Callable ao apertar E.

var prompt := "Interagir"
var radius := 4.0
var enabled := true
var action: Callable
var condition: Callable

static func make(parent: Node, pos: Vector3, text: String, r: float, cb: Callable) -> InteractSpot:
	var s := InteractSpot.new()
	s.prompt = text
	s.radius = r
	s.action = cb
	parent.add_child(s)
	s.global_position = pos
	return s

func _ready() -> void:
	add_to_group("interactable")

func _process(_d: float) -> void:
	if condition.is_valid():
		enabled = condition.call()

func get_prompt() -> String:
	return prompt

func interact(_p: Node) -> void:
	if action.is_valid():
		action.call()
