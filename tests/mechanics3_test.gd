extends Node
## Guia da Steam + prints do fim do jogo: sem armas iniciais, iscas por nível, Tubarão‑Azul -> isqueiro, grelha,
## roleta, Reel of Fortune/skins, killscore, inspeção, barco lançado pela dinamite, "Falar [E]".
var main: Node
var player: CharacterBody3D
var hud: Node
var fails := 0

func ok(c: bool, m: String) -> void:
	print("[M3] %s  %s" % ["PASS" if c else "FAIL", m])
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
	hud = main.get_node("HUD")
	await wait(1.0)
	_run()

func _run() -> void:
	var z := Story.zones
	# ---- começa sem armas
	ok(GameState.owned_weapons.is_empty() and GameState.current_weapon == "fists", "começa sem armas (só as mãos)")
	ok(WeaponDB.W["knife"]["price"] == 45 and WeaponDB.W["brass"]["price"] == 24, "faca $45 e soco inglês $24")
	GameState.coins = 500
	ok(GameState.buy_weapon("brass") and GameState.buy_weapon("knife"), "comprou soco inglês e faca")
	player._cycle_weapon()
	ok(player.rifle.weapon_id == "brass", "tecla 1 troca das mãos para a primeira arma comprada")
	player._equip("rifle")
	# ---- iscas por nível
	var rng := RandomNumberGenerator.new()
	rng.seed = 5
	var seen0 := {}
	var seen3 := {}
	for i in 400:
		seen0[FishDB.pick_species(0.0, rng, 0)] = true
		seen3[FishDB.pick_species(0.0, rng, 3)] = true
	ok(not seen0.has("atum") and not seen0.has("baiacu") and seen0.has("sardinha"), "isca iniciante: só criaturas comuns")
	ok(seen3.has("atum") and seen3.has("barracuda"), "isca profissional libera atum e barracuda")
	GameState.coins = 20000
	ok(Story.buy_bait(1) and Story.buy_bait(3) and Story.best_bait_tier() == 3, "comprou iscas; a melhor em uso é a de nível 3")
	Story.take_item("bait_pro")
	ok(Story.best_bait_tier() == 1, "gastou a profissional; sobra a de cachorro-quente")
	# ---- tubarão-azul mini-chefe com a isca padrão -> isqueiro
	ok(Story.buy_bait(2), "comprou isca de chefe padrão ($280)")
	var c3 := Terrain.island_center(2)
	var water := Vector3.INF
	for r in range(20, 70, 3):
		for a in 16:
			var p := c3 + Vector2.from_angle(a * TAU / 16.0) * r
			if Terrain.depth_at(p.x, p.y) > 3.0:
				water = Vector3(p.x, 0, p.y)
				break
		if water != Vector3.INF:
			break
	ok(water != Vector3.INF and Story.lure_cast(water) == "blue_shark", "isca padrão na água da Ilha Tropical chama o Tubarão‑Azul")
	Story.on_lure_success("blue_shark", water)
	await wait(0.3)
	var shark: Boss = Story.boss
	ok(shark != null and shark.id == "blue_shark", "Tubarão‑Azul emergiu")
	player.global_position = shark.global_position + Vector3(0, 2.0, 4.0)
	var hp0: float = player.hp
	await wait(6.0)
	ok(player.hp < hp0, "o tubarão investiu contra o jogador (hp %.0f -> %.0f)" % [hp0, player.hp])
	player.hp = player.max_hp
	shark.hit(1000.0, shark.global_position)
	await wait(1.5)
	var fin: Node = null
	for n in get_tree().get_nodes_in_group("interactable"):
		if n is BossDrop and n.item == "shark_fin":
			fin = n
	ok(fin != null, "barbatana do tubarão caiu")
	fin.interact(player)
	Story.talk("bbq")
	await wait(0.1)
	while hud.dlg_open:
		hud._dlg_next()
	ok(Story.flags.get("lighter", false), "Mestre do Churrasco deu o isqueiro")
	# ---- grelha
	var grill: Grill = null
	for n in get_tree().get_nodes_in_group("interactable"):
		if n is Grill and not n.lava:
			grill = n
			break
	GameState.inventory.clear()
	GameState.add_fish("dourado", 5.0)
	var base: int = GameState.inventory[0]["value"]
	grill.interact(player)
	ok(GameState.inventory.is_empty() and not grill.raw.is_empty(), "peixe cru foi para a grelha")
	grill.t = 6.5
	grill._process(0.0)
	grill.interact(player)
	ok(GameState.inventory.size() == 1 and absf(float(GameState.inventory[0]["cooked"]) - 1.5) < 0.01 and GameState.inventory[0]["value"] == int(base * 1.5), "tirar a 1,5x: valor $%d -> $%d" % [base, GameState.inventory[0]["value"]])
	GameState.inventory.clear()
	GameState.add_fish("sardinha", 1.0)
	grill.interact(player)
	grill.t = 12.0
	grill._process(0.0)
	grill.interact(player)
	ok(GameState.inventory.is_empty(), "deixou passar do ponto: o peixe queimou e some")
	var lava_grill: Grill = null
	for n in get_tree().get_nodes_in_group("interactable"):
		if n is Grill and n.lava:
			lava_grill = n
	GameState.add_fish("sardinha", 1.0)
	lava_grill.interact(player)
	lava_grill.t = 30.0
	lava_grill._process(0.0)
	lava_grill.interact(player)
	ok(GameState.inventory.size() == 1 and float(GameState.inventory[0]["cooked"]) == 1.5, "lava cozinha sempre a 1,5x, sem queimar")
	# ---- roleta
	GameState.coins = 100000
	var wins := 0
	var greens := 0
	var consistent := true
	for i in 300:
		var before := GameState.coins
		var r := GameState.roulette(10, "red")
		if r["win"]:
			wins += 1
			consistent = consistent and GameState.coins == before + 10
		else:
			consistent = consistent and GameState.coins == before - 10
		if r["color"] == "green":
			greens += 1
	ok(consistent and wins > 100 and wins < 200, "roleta vermelho: paga 2x e perde certo (%d vitórias em 300, %d verdes)" % [wins, greens])
	var gb := GameState.coins
	var found_green := false
	for i in 400:
		var r2 := GameState.roulette(10, "green")
		if r2["win"]:
			found_green = true
			ok(r2["payout"] == 360, "verde paga 36x (350 de lucro)")
			break
	ok(found_green, "o verde saiu ao menos uma vez em 400 giros")
	# ---- reel of fortune e skins
	GameState.skins_owned = ["cream"]
	var kinds := {}
	for i in 300:
		GameState.add_fish("sardinha", 1.0)
		var rf := GameState.reel_of_fortune(GameState.inventory.size() - 1)
		kinds[rf["kind"]] = true
	ok(kinds.has("lose") and kinds.has("coins") and kinds.has("skin"), "Reel of Fortune: perde, paga ou dá skin (%s)" % str(kinds.keys()))
	GameState.skins_owned = ["cream", "teal"]
	GameState.equip_skin("teal")
	await wait(0.1)
	var teal_ok := false
	for n in get_tree().root.find_children("*", "MeshInstance3D", true, false):
		if n.is_in_group("hand_mesh") and n.material_override is StandardMaterial3D and (n.material_override as StandardMaterial3D).albedo_color.is_equal_approx(GameState.SKINS["teal"]):
			teal_ok = true
			break
	ok(teal_ok, "skin teal pinta as luvas em primeira pessoa")
	# ---- killscore + inspeção
	GameState.inventory.clear()
	GameState.skins_owned = ["cream"]
	GameState.equip_skin("cream")
	player.global_position = Story.zones["spawn1"]
	await wait(0.5)
	var lf := LandedFish.spawn(main, "atum", 60.0, Story.zones["spawn1"] + Vector3(2, 1.5, 0), Vector3.ZERO)
	await wait(0.4)
	var head: Vector3 = lf.global_position + lf.global_transform.basis.z * lf.length_m * 0.4
	lf.hit(0.1, head)
	lf.hit(0.1, head)
	lf.hit(500.0, head)
	ok(lf.dead and lf.kill_mult >= 1.25 * 1.1 - 0.001, "killscore: cabeça + Finalmente = %.2fx" % lf.kill_mult)
	var expect := int(FishDB.price_for("atum", 60.0) * lf.kill_mult)
	ok(lf.inspect_info()["value"] == expect, "inspeção mostra o valor com killscore ($%d)" % expect)
	lf.interact(player)
	await wait(0.1)
	ok(GameState.inventory.size() == 1 and GameState.inventory[0]["value"] == expect, "coletado vale $%d (com killscore)" % expect)
	hud.show_inspect("Atum-azul", 123, 60.0, 1.5)
	ok(hud._insp_panel != null and hud._insp_panel.visible, "card Inspecionar aparece")
	ok(hud._ks_panel != null, "painel de killscore aparece ao abater")
	# ---- barco lançado pela dinamite
	main.get_node("World").spawn_motorboat()
	await wait(0.3)
	var boat: Boat = get_tree().get_nodes_in_group("boats_motor")[0]
	var y0 := boat.global_position.y
	boat.launch()
	var peak := y0
	for i in 20:
		await wait(0.05)
		peak = maxf(peak, boat.global_position.y)
	ok(peak > y0 + 3.0, "dinamite lança o barco para o ar (%.1f m)" % (peak - y0))
	# ---- "Falar [E]" 3D
	var g: Vector3 = Story.zones["guardian"]
	player.global_position = g + Vector3(0, 0.5, 3.0)
	await wait(0.5)
	ok(player._wprompt.visible and player._wprompt.text.ends_with("[E]"), "aviso 3D \"%s\" sobre o NPC" % player._wprompt.text)
	print("[M3] RESULTADO: %s (%d falhas)" % ["TUDO OK" if fails == 0 else "COM FALHAS", fails])
	print("[M3] DONE")
	get_tree().quit()
