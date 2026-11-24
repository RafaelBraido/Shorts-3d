extends Node
## Mecânicas inspiradas em How to Fish: peixe que se debate e precisa ser morto, gaivota ladra, cassino, motor, preços.
var main: Node
var player: CharacterBody3D
var fails := 0

func ok(c: bool, m: String) -> void:
	print("[MECH] %s  %s" % ["PASS" if c else "FAIL", m])
	if not c:
		fails += 1

func wait(s: float) -> void:
	await get_tree().create_timer(s).timeout

func _ready() -> void:
	GameState.persist = false
	Story.intro_done = true
	main = load("res://scenes/Main.tscn").instantiate()
	add_child(main)
	player = main.get_node("Player")
	await wait(1.0)
	_run()

func _run() -> void:
	var rod: FishingRod = player.rod
	var mgr: FishManager = main.get_node("FishManager")
	# ---- _catch real da vara: o peixe NÃO vai para a mochila
	player._equip("rod")
	var spot: Vector3 = Story.zones["spawn1"]
	player.global_position = spot
	await wait(0.5)
	rod.bobber = Bobber.new()
	main.add_child(rod.bobber)
	rod.bobber.global_position = spot + Vector3(0, 0, 5)
	var f: Fish = mgr._spawn_one("sardinha", spot + Vector3(0, -1, 5))
	f.hook()
	rod.fish = f
	rod.state = FishingRod.S.REELING
	var inv0 := GameState.inventory.size()
	rod._catch()
	await wait(1.5)
	var lf: LandedFish = null
	for n in get_tree().get_nodes_in_group("landed_fish"):
		lf = n
	ok(lf != null, "peixe pescado virou um LandedFish no chão (não foi direto para a mochila)")
	ok(GameState.inventory.size() == inv0, "mochila ainda vazia após a captura")
	ok(not lf.dead, "peixe está vivo e se debatendo")
	var y0 := lf.global_position.y
	var moved := false
	for i in 12:
		await wait(0.25)
		if absf(lf.global_position.y - y0) > 0.15 or lf.linear_velocity.length() > 0.8:
			moved = true
	ok(moved, "peixe se debate (física: pulou/moveu)")
	# ---- socar com E, depois coletar
	var punches := 0
	while not lf.dead and punches < 10:
		lf.interact(player)
		punches += 1
		await wait(0.05)
	ok(lf.dead, "peixe morto a socos (%d)" % punches)
	var xp0 := GameState.xp + GameState.level * 1000
	lf.interact(player)
	await wait(0.2)
	ok(GameState.inventory.size() == inv0 + 1, "peixe morto foi coletado para a mochila")
	# ---- tiro lança o peixe
	var spot2 := spot + Vector3(3, 2, 0)
	var lf2 := LandedFish.spawn(main, "dourado", 5.0, spot2, Vector3.ZERO)
	await wait(1.0)
	lf2.hit(0.1, lf2.global_position - Vector3(0, 0.3, 0))
	ok(lf2.linear_velocity.y > 1.0 or lf2.global_position.y > spot2.y - 1.8, "acertar o peixe o lança no ar")
	lf2.hit(100.0, lf2.global_position)
	ok(lf2.dead, "arma mata o peixe")
	lf2.queue_free()
	# ---- gaivota ladra
	var lf3 := LandedFish.spawn(main, "sardinha", 0.2, spot + Vector3(-3, 2, 0), Vector3.ZERO)
	await wait(0.5)
	Gull.spawn_for(lf3)
	var gull: Gull = null
	for g in get_tree().get_nodes_in_group("gulls"):
		gull = g
	ok(gull != null, "gaivota apareceu para roubar o peixe")
	var stolen := false
	for i in 60:
		await wait(0.25)
		if not is_instance_valid(lf3):
			stolen = true
			break
	ok(stolen, "gaivota roubou o peixe do chão")
	ok(is_instance_valid(gull) and gull.carrying_species == "sardinha", "gaivota está carregando o peixe")
	var n_before := get_tree().get_nodes_in_group("landed_fish").size()
	gull.hit(10.0, gull.global_position)
	await wait(0.5)
	ok(get_tree().get_nodes_in_group("landed_fish").size() == n_before + 1, "abater a gaivota devolve o peixe")
	# ---- cassino
	GameState.coins = 1000
	var wins := 0
	var total := 0
	for i in 60:
		var before := GameState.coins
		var w := GameState.gamble_coins(10)
		total += 1
		wins += 1 if w else 0
		ok_silent(GameState.coins == before + (10 if w else -10))
	ok(wins > 10 and wins < 50, "cara ou coroa paga/perde certo (%d vitórias em %d)" % [wins, total])
	GameState.add_fish("atum", 50.0)
	var val := GameState.inventory[GameState.inventory.size() - 1]["value"]
	var c0 := GameState.coins
	var r := GameState.gamble_fish(GameState.inventory.size() - 1)
	ok(r == 0 or r == val * 3, "apostar peixe: perde (0) ou triplica (%d)" % r)
	ok(GameState.coins == c0 + r, "moedas conferem após apostar peixe")
	# ---- motor do barco
	GameState.coins = 5000
	ok(GameState.engine_speed_mult() == 1.0, "motor comum = 1.0x")
	ok(GameState.buy_engine() and GameState.engine_level == 1 and GameState.engine_speed_mult() > 1.3, "motor reforçado comprado")
	ok(GameState.buy_engine() and GameState.engine_speed_mult() > 1.6, "motores duplos comprados")
	ok(not GameState.buy_engine(), "sem mais upgrades de motor")
	# ---- preços
	ok(WeaponDB.W["pistol"]["price"] == 50 and WeaponDB.W["shotgun"]["price"] == 150 and WeaponDB.W["smg"]["price"] == 650 and WeaponDB.W["sniper"]["price"] == 3800 and WeaponDB.W["ar"]["price"] == 20000 and WeaponDB.DYNAMITE_PRICE == 25, "preços das armas conferem com os guias")
	GameState.coins = 100
	ok(Story.buy_beer() and Story.buy_radar() and GameState.coins == 78, "cerveja $12 + radar $10")
	print("[MECH] RESULTADO: %s (%d falhas)" % ["TUDO OK" if fails == 0 else "COM FALHAS", fails])
	print("[MECH] DONE")
	get_tree().quit()

func ok_silent(c: bool) -> void:
	if not c:
		fails += 1
		print("[MECH] FAIL  aposta inconsistente")
