extends Node
## Tour visual: teleporta o jogador por NPCs/ilhas e chefes e tira screenshots em /tmp/shots/tour_*.png
var main: Node
var player: CharacterBody3D
var hud: Node
var shots: Array = []

func wait(s: float) -> void:
	await get_tree().create_timer(s).timeout

func snap(nm: String) -> void:
	await wait(1.2)
	get_viewport().get_texture().get_image().save_png("/tmp/shots/tour_%s.png" % nm)
	print("[TOUR] ", nm)

func look(from: Vector3, at: Vector3) -> void:
	player.global_position = from
	var d := at - (from + Vector3(0, 1.55, 0))
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
	# Ilha 1: farol e Guardião
	var g: Vector3 = z["guardian"]
	look(g + Vector3(-6, 1, 6), g + Vector3(0, 1.2, 0))
	await snap("1_guardian")
	hud.show_dialogue("Guardião do Farol", ["Ei, acordou! O mar jogou você na minha praia."], Callable())
	await snap("1b_dialogue")
	hud._dlg_next()
	# Marina e o lago
	var m: Vector3 = z["marina"]
	look(m + Vector3(5, 2, 5), m + Vector3(-3, 0, 0))
	await snap("2_marina_lake")
	# Turista
	var t: Vector3 = z["tourist"]
	look(t + Vector3(-5, 1.5, 5), t)
	await snap("3_tourist")
	# Penhasco: altar e loja
	var a: Vector3 = z["altar"]
	look(a + Vector3(-6, 1.5, 0), a + Vector3(6, 2, 0))
	await snap("4_cliffs")
	# Vulcão e acampamento
	var s: Vector3 = z["scientist"]
	look(s + Vector3(0, 2, 10), s)
	await snap("5_camp")
	var l: Vector3 = z["lava"]
	look(l + Vector3(-9, 4, 0), l)
	await snap("5b_crater")
	# Chefes
	Story.chapter = 1; Story.step = 4
	Story.spawn_boss("crab", z["crab"])
	await wait(0.5)
	var crab = Story.boss
	look(crab.global_position + Vector3(0, 3, 14), crab.global_position + Vector3(0, 2, 0))
	await snap("boss_crab")
	crab.hit(100, crab.global_position)
	await wait(1.5)
	var lake: Vector3 = z["lake"]
	Story.spawn_boss("piranha", lake)
	await wait(2.5)
	look(lake + Vector3(Terrain.LAKE_R + 2, 3, 2), lake)
	await snap("boss_piranha")
	for n in get_tree().get_nodes_in_group("targets"):
		if n is Boss:
			n.hit(1000, n.global_position)
	await wait(1.5)
	Story.spawn_boss("puffer", z["island3"] + Vector3(14, 0, 14))
	await wait(0.5)
	var pf = Story.boss
	look(pf.global_position + Vector3(10, 3, 12), pf.global_position)
	await snap("boss_puffer")
	pf.hit(1000, pf.global_position)
	await wait(1.5)
	Story.chapter = 4; Story.step = 2
	Story.spawn_boss("albatross", a + Vector3(0, 22, 0))
	await wait(1.5)
	var bird = Story.boss
	look(a + Vector3(-5, 1.5, -5), bird.global_position)
	await snap("boss_albatross")
	bird.hit(1000, bird.global_position)
	await wait(1.5)
	var wp: Vector3 = z["island5"] + Vector3(40, 0, 40)
	Story.spawn_boss("whale", wp)
	await wait(0.5)
	var wh = Story.boss
	look(wh.global_position + Vector3(14, 6, 18), wh.global_position)
	await snap("boss_whale")
	wh.hit(1000, wh.global_position)
	await wait(1.5)
	Story.chapter = 5; Story.step = 4
	Story.carrying = "whale_carcass"
	Story.throw_carcass_into_lava()
	await wait(1.0)
	var mu = Story.boss
	look(l + Vector3(-22, 14, 0), mu.global_position)
	await snap("boss_mutant")
	# barco
	Story.flags["keys_motorboat"] = true
	main.get_node("World").spawn_motorboat()
	await wait(0.5)
	var b: Boat = get_tree().get_nodes_in_group("boats_motor")[0]
	look(b.global_position + Vector3(-7, 3, -8), b.global_position)
	await snap("boat")
	print("[TOUR] DONE")
	get_tree().quit()
