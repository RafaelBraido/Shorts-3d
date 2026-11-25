extends Node
## Teste de multiplayer: roda DOIS processos (--role=host e --role=client) e confere
## conexão, avatar remoto, posição sincronizada, agachar sincronizado, tiro e aviso de captura.
## godot --headless --path . res://tests/NetTest.tscn -- --role=host    (e, em outro terminal) -- --role=client

var role := "host"
var main: Node
var player: CharacterBody3D
var t := 0.0
var got_announce := ""
var stage := 0

func say(m: String) -> void:
	print("[NET-%s] %s" % [role.to_upper(), m])

func _ready() -> void:
	GameState.persist = false
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--role="):
			role = a.substr(7)
	main = load("res://scenes/Main.tscn").instantiate()
	add_child(main)
	player = main.get_node("Player")
	Net.player_name = "Anfitriao" if role == "host" else "Convidado"
	GameState.notify.connect(func(m: String) -> void:
		if "pescou" in m:
			got_announce = m)
	if role == "host":
		say("host() -> %d" % Net.host())
	else:
		await get_tree().create_timer(2.0).timeout
		say("join() -> %d" % Net.join("127.0.0.1"))

func _process(delta: float) -> void:
	t += delta
	var av: RemotePlayer = null
	if not Net.avatars.is_empty():
		av = Net.avatars.values()[0]
	match stage:
		0:
			if role == "client" and av != null and t > 5.0:
				# cliente se posiciona, agacha e atira/avisa
				player.global_position = player.global_position + Vector3(6, 0, 0)
				Input.action_press("crouch")
				say("moved to %s, crouching" % player.global_position)
				stage = 1; t = 0.0
			elif role == "host" and av != null:
				stage = 1; t = 0.0
		1:
			if role == "client" and t > 1.0 and stage == 1:
				player.rifle.equip(true)
				player.rifle._try_fire()
				Net.send_announce("pescou Atum-azul de 42.0 kg!")
				stage = 2; t = 0.0
			elif role == "host" and t > 6.0:
				say("peers=%d avatar name='%s' pos=%s (host player at %s)" % [Net.peer_count(), Net.names.values()[0], av.global_position, player.global_position])
				say("avatar crouch synced=%s item=%s" % [av._crouch, av._item])
				say("announce received='%s'" % got_announce)
				stage = 3; t = 0.0
		2:
			if t > 8.0:
				say("peers=%d, host avatar visible=%s" % [Net.peer_count(), av != null])
				stage = 3; t = 0.0
		3:
			if t > 2.0:
				say("DONE")
				get_tree().quit()
