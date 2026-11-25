extends Node3D
## Ponto de interação genérico. O jogador procura o mais próximo dentro de "radius"
## (grupo "interactable") e dispara "interacted" ao apertar E.

signal interacted(player: Node)

@export var prompt: String = "Interagir"
@export var radius: float = 3.0
var enabled := true

func _ready() -> void:
	add_to_group("interactable")

func get_prompt() -> String:
	return prompt

func interact(player: Node) -> void:
	interacted.emit(player)
