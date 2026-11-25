extends Node
## Screenshots do HUD novo (anéis, hotbar, dica, chefe, mãos, vara verde, volante) em /tmp/shots/hud_*.png
var main: Node
var player: CharacterBody3D
var hud: Node

func wait(s: float) -> void:
	await get_tree().create_timer(s).timeout

func snap(nm: String) -> void:
	await wait(1.0)
	get_viewport().get_texture().get_image().save_png("/tmp/shots/hud_%s.png" % nm)
	print("[HUD] ", nm)

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute("/tmp/shots")
	GameState.persist = false
	Story.intro_done = true
	main = load("res://scenes/Main.tscn").instantiate()
	add_child(main)
	player = main.get_node("Player")
	hud = main.get_node("HUD")
	await wait(1.5)
	_go()

func _go() -> void:
	var z := Story.zones
	GameState.coins = 12
	player.global_position = z["spawn1"]
	player.rotation.y = Story.zones.get("spawn1", Vector3.ZERO).x * 0.0 + main.get_node("World").spawn_yaw
	player.hp = 70.0
	hud.set_health(70.0, 100.0)
	player.hunger = 55.0
	hud.set_hunger(55.0)
	hud.show_tip("think", "Como Pensar", "Você pode esquecer quais criaturas já pescou. Tente pensar apertando [Tab].")
	await snap("1_knife")
	player._equip("rod")
	await snap("2_rod")
	player._equip("hands")
	await snap("3_hands")
	# chefe + números + sangue
	player._equip("rifle")
	Story.chapter = 1; Story.step = 4
	Story.spawn_boss("crab", z["crab"])
	await wait(0.4)
	var crab = Story.boss
	var d: Vector3 = crab.global_position - player.global_position
	player.global_position = crab.global_position + Vector3(0, 1.0, 9)
	var dd: Vector3 = crab.global_position + Vector3(0, 1.5, 0) - (player.global_position + Vector3(0, 1.55, 0))
	player.rotation.y = atan2(-dd.x, -dd.z)
	player.pitch = atan2(dd.y, Vector2(dd.x, dd.z).length())
	for i in 3:
		crab.hit(2.0, crab.global_position + Vector3(0, 1.5, 0))
		await wait(0.12)
	await snap("4_boss")
	crab.hit(1000, crab.global_position)
	# barco
	Story.flags["keys_motorboat"] = true
	main.get_node("World").spawn_motorboat()
	await wait(0.5)
	var b: Boat = get_tree().get_nodes_in_group("boats_motor")[0]
	b.board(player)
	await wait(0.3)
	player.pitch = -0.35
	await snap("5_boat")
	# loja
	b.leave(false)
	var shop: Vector3 = z["shop"]
	player.global_position = shop + Vector3(1.0, 0.5, 2.4)
	player.rotation.y = main.get_node("World").spawn_yaw + 0.0
	player.rotation.y = atan2(1.0, 0.0) + 0.0
	player.pitch = 0.0
	await snap("6_shop_wall")
	hud.open_shop()
	await snap("7_shop_ui")
	print("[HUD] DONE")
	get_tree().quit()
