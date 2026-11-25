extends Node
## Screenshots de qualidade em /tmp/shots/q_*.png
var main: Node
var player: CharacterBody3D
var hud: Node

func wait(s: float) -> void:
	await get_tree().create_timer(s).timeout

func snap(nm: String) -> void:
	await wait(1.0)
	get_viewport().get_texture().get_image().save_png("/tmp/shots/q_%s.png" % nm)
	print("[Q] ", nm)

func look(from: Vector3, at: Vector3) -> void:
	player.global_position = from
	var d: Vector3 = at - (from + Vector3(0, 1.55, 0))
	player.rotation.y = atan2(-d.x, -d.z)
	player.pitch = atan2(d.y, Vector2(d.x, d.z).length())

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
	Story.flags["radar"] = true
	GameState.coins = 4321
	var grill: Grill = null
	var machine := Vector3.ZERO
	for n in get_tree().get_nodes_in_group("interactable"):
		if n is Grill and not n.lava and grill == null:
			grill = n
		if n is InteractSpot and "Reel" in n.prompt:
			machine = n.global_position
	look(z["spawn1"], z["spawn1"] + Vector3(0, 0, 40))
	await snap("1_spawn")
	look(machine + Vector3(-5, 0.6, 5), machine + Vector3(0, 1.0, 0))
	await snap("2_reel_machine")
	look(grill.global_position + Vector3(3, 0.5, 3), grill.global_position + Vector3(0, 0.8, 0))
	GameState.inventory.clear()
	Story.flags["lighter"] = true
	GameState.add_fish("dourado", 5.0)
	grill.interact(player)
	await wait(4.0)
	await snap("3_grill")
	# killscore
	player.global_position = z["spawn1"]
	player.rotation.y = 0.0
	player.pitch = -0.3
	var lf := LandedFish.spawn(main, "atum", 60.0, z["spawn1"] + Vector3(0, 0.6, -2.4), Vector3.ZERO)
	await wait(0.6)
	var head: Vector3 = lf.global_position + lf.global_transform.basis.z * lf.length_m * 0.4
	lf.hit(0.1, head)
	lf.hit(0.1, head)
	lf.hit(500.0, head)
	await snap("4_killscore")
	hud.show_inspect("Atum-azul", lf.inspect_info()["value"], 60.0, lf.kill_mult)
	await snap("5_inspect")
	GameState.inventory.clear()
	for i in 4:
		GameState.add_fish(["dourado", "atum", "sardinha", "palhaco"][i], 3.0)
	hud.open_shop("Cassino")
	await snap("6_casino_ui")
	hud.close_menus()
	var c: Vector3 = z["lava"]
	look(c + Vector3(-12, 5, 2), c)
	await snap("7_crater_lava_grill")
	var s: Vector3 = z["scientist"]
	look(s + Vector3(-8, 2, 12), s)
	await snap("8_camp")
	print("[Q] DONE")
	get_tree().quit()
