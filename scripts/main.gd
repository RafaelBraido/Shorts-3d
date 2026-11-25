extends Node3D
## Cena principal: liga mundo, jogador, interface e população de peixes.

@onready var world: Node3D = $World
@onready var player: CharacterBody3D = $Player
@onready var manager: FishManager = $FishManager

func _ready() -> void:
	player.global_position = world.player_spawn
	player.spawn_point = world.player_spawn
	player.rotation.y = world.spawn_yaw
	manager.player = player
	manager.populate_initial(world.dock_end)
	GameState.notify.emit("Bem-vindo! Fale com o Capitão Maré na cabana vermelha.")
	# atalhos de linha de comando: godot -- --host  |  godot -- --join=IP  |  --name=Fulano
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--name="):
			Net.player_name = a.substr(7)
	for a in OS.get_cmdline_user_args():
		if a == "--host":
			Net.host()
		elif a.begins_with("--join="):
			Net.join(a.substr(7))
