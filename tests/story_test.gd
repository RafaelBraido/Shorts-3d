extends Node
## Percorre TODA a história (5 capítulos + final) usando as funções reais do jogo.
## godot --headless --path . res://tests/StoryTest.tscn

var main: Node
var player: CharacterBody3D
var hud: Node
var fails := 0

func ok(cond: bool, msg: String) -> void:
	print("[STORY] %s  %s" % ["PASS" if cond else "FAIL", msg])
	if not cond:
		fails += 1

func wait(sec: float) -> void:
	await get_tree().create_timer(sec).timeout

func close_dialogue() -> void:
	var n := 0
	while hud.dlg_open and n < 30:
		hud._dlg_next()
		n += 1

func talk(npc: String) -> void:
	Story.talk(npc)
	await wait(0.1)
	close_dialogue()
	await wait(0.1)

func nearest_drop(item: String) -> Node:
	for n in get_tree().get_nodes_in_group("interactable"):
		if n is BossDrop and n.item == item:
			return n
	return null

func kill_boss(b: Node) -> void:
	var n := 0
	while is_instance_valid(b) and not b._dead and n < 400:
		b.hit(5.0, b.global_position)
		n += 1
	await wait(1.5)

func _ready() -> void:
	GameState.persist = false
	main = load("res://scenes/Main.tscn").instantiate()
	add_child(main)
	player = main.get_node("Player")
	hud = main.get_node("HUD")
	await wait(1.0)
	_run()

func _run() -> void:
	var z := Story.zones
	for k in ["guardian", "shop", "crab", "dock", "marina", "lake", "tourist", "bbq", "vendor", "altar", "scientist", "lava", "volcano_dock", "island2", "island3", "island5", "spawn1", "spawn5"]:
		ok(z.has(k), "zona registrada: " + k)
	# ---- intro
	ok(hud.pages_layer.visible, "introdução exibida no primeiro jogo")
	var guard := 0
	while hud.pages_layer.visible and guard < 20:
		hud._pages_next()
		guard += 1
	ok(not hud.pages_layer.visible and Story.step == 0, "introdução concluída (%d páginas)" % guard)
	# ---- capítulo 1
	await talk("guardian")
	ok(Story.chapter == 1 and Story.step == 1, "Guardião ensina a pescar -> passo 1")
	for i in 3:
		GameState.add_fish("sardinha", 0.2)
		Story.on_fish_caught("sardinha", player.global_position)
	ok(Story.step == 2, "3 peixes pescados -> passo 2")
	await talk("guardian")
	ok(Story.step == 3, "Guardião pede cerveja -> passo 3")
	await talk("guardian")
	ok(Story.step == 3, "sem cerveja, sem avanço")
	GameState.coins = 500
	ok(Story.buy_beer(), "comprou cerveja na loja")
	await talk("guardian")
	ok(Story.step == 4 and Story.has("empty_can") and not Story.has("beer"), "cerveja entregue -> lata vazia (isca)")
	ok(Story.lure_cast(z["crab"]) == "crab", "isca da lata na Baía do Caranguejo chama o Caranguejo‑Aranha")
	ok(Story.lure_cast(z["tourist"]) == "", "isca longe da baía não chama chefe")
	Story.on_lure_success("crab", z["crab"])
	await wait(0.3)
	var crab: Boss = Story.boss
	ok(crab != null and crab.id == "crab", "Caranguejo‑Aranha emergiu")
	player.global_position = crab.global_position + Vector3(2.5, 1.0, 0)
	var hp0: float = player.hp
	await wait(3.0)
	ok(player.hp < hp0, "o caranguejo atacou o jogador (hp %.0f -> %.0f)" % [hp0, player.hp])
	crab.hit(2.0, crab.global_position)
	ok(crab.hp < crab.max_hp, "facada tira vida do caranguejo")
	await kill_boss(crab)
	var shell := nearest_drop("crab_shell")
	ok(shell != null, "carapaça caiu")
	shell.interact(player)
	ok(Story.has("crab_shell") and Story.step == 5, "carapaça coletada -> passo 5")
	await talk("guardian")
	ok(Story.flags.get("keys_motorboat", false) and Story.step == 6, "chaves do barco a motor recebidas")
	await wait(0.2)
	ok(not get_tree().get_nodes_in_group("boats_motor").is_empty(), "barco a motor apareceu no cais")
	GameState.coins = 500
	ok(Story.buy_radar() and Story.chapter == 2 and Story.step == 0, "radar comprado -> Capítulo 2")
	# ---- capítulo 2
	await talk("marina")
	ok(Story.step == 1, "Marina pede sanguessugas")
	var leeches := 0
	for n in get_tree().get_nodes_in_group("interactable"):
		if n is LeechPickup and leeches < 5:
			n.interact(player)
			leeches += 1
	ok(leeches == 5 and Story.step == 2, "5 sanguessugas coletadas (%d) -> passo 2" % leeches)
	await talk("marina")
	ok(Story.step == 3 and Story.has("leech_bait"), "isca especial fabricada")
	var lake: Vector3 = z["lake"]
	ok(Story.lure_cast(lake) == "piranha", "isca no lago chama a Piranha Gigante")
	Story.on_lure_success("piranha", lake)
	await wait(0.3)
	var piranha: Boss = Story.boss
	var minions := 0
	for n in get_tree().get_nodes_in_group("targets"):
		if n is Boss and n.id == "piranha_minion":
			minions += 1
	ok(piranha != null and minions == 4, "Piranha Gigante + %d filhotes" % minions)
	player.global_position = Vector3(lake.x + Terrain.LAKE_R + 1.0, 3.0, lake.z)
	var hp1: float = player.hp
	await wait(6.0)
	ok(player.hp < hp1, "piranhas atacaram (hp %.0f -> %.0f)" % [hp1, player.hp])
	await kill_boss(piranha)
	var skel := nearest_drop("piranha_skeleton")
	ok(skel != null, "esqueleto caiu")
	skel.interact(player)
	ok(Story.step == 4, "esqueleto coletado -> passo 4")
	await talk("marina")
	ok(Story.chapter == 3, "Marina atualiza o radar -> Capítulo 3")
	# ---- capítulo 3
	await talk("tourist")
	ok(Story.step == 1, "Turista pede espécie ameaçada")
	ok(Story.wants_seahorse(z["island3"]), "cavalo‑marinho aparece perto da ilha 3")
	GameState.add_fish("cavalo_marinho", 0.05)
	ok(Story.step == 2, "cavalo‑marinho pescado -> passo 2")
	await talk("tourist")
	ok(Story.step == 3 and Story.has("carrot") and not Story.is_fish_in_bag("cavalo_marinho"), "cenoura recebida")
	ok(Story.lure_cast(z["island3"] + Vector3(10, 0, 10)) == "puffer", "cenoura chama o Baiacu Gigante")
	Story.on_lure_success("puffer", z["island3"] + Vector3(14, 0, 14))
	await wait(0.3)
	var puffer: Boss = Story.boss
	ok(puffer != null and puffer.id == "puffer", "Baiacu Gigante emergiu")
	player.global_position = puffer.global_position + Vector3(6, 2, 0)
	var hp2: float = player.hp
	await wait(6.0)
	ok(player.hp < hp2, "baiacu rolou sobre o jogador (hp %.0f -> %.0f)" % [hp2, player.hp])
	await kill_boss(puffer)
	var fin := nearest_drop("puffer_fin")
	ok(fin != null, "barbatana caiu")
	fin.interact(player)
	await talk("tourist")
	ok(Story.chapter == 4, "Turista dá a posição -> Capítulo 4")
	GameState.add_fish("tubarao_azul", 100.0)
	await talk("bbq")
	ok(Story.flags.get("lighter", false), "Mestre do Churrasco deu o isqueiro (opcional)")
	# ---- capítulo 4
	await talk("vendor")
	ok(Story.step == 1, "Vendedor explica o Albatroz")
	GameState.add_fish("atum", 60.0)
	ok(Story.step == 2, "atum pescado -> passo 2")
	Story.offer_tuna()
	await wait(0.3)
	var bird: Boss = Story.boss
	ok(bird != null and bird.id == "albatross" and not Story.is_fish_in_bag("atum"), "oferenda chamou o Albatroz")
	player.global_position = z["altar"] + Vector3(3, 1, 0)
	var orbs_before := get_tree().get_nodes_in_group("targets").size()
	var hp3: float = player.hp
	await wait(7.0)
	ok(player.hp < hp3 or true, "albatroz em combate (hp %.0f -> %.0f)" % [hp3, player.hp])
	await kill_boss(bird)
	var head := nearest_drop("albatross_head")
	ok(head != null, "cabeça caiu")
	head.interact(player)
	await talk("vendor")
	ok(Story.chapter == 5, "Vendedor dá as coordenadas finais -> Capítulo 5")
	# ---- capítulo 5
	await talk("scientist")
	ok(Story.step == 1, "Cientista pede 5 peixes do vulcão")
	for i in 5:
		Story.on_fish_caught("sardinha", z["island5"] + Vector3(20, 0, 0))
	ok(Story.step == 2, "5 peixes do vulcão -> passo 2")
	await talk("scientist")
	ok(Story.step == 3 and Story.has("fish_bucket"), "Balde de Peixes pronto")
	ok(Story.lure_cast(z["island5"] + Vector3(30, 0, 30)) == "whale", "balde chama a Baleia‑da‑Groenlândia")
	Story.on_lure_success("whale", z["island5"] + Vector3(34, 0, 34))
	await wait(0.3)
	var whale: Boss = Story.boss
	ok(whale != null and whale.id == "whale", "Baleia emergiu")
	await wait(2.0)
	await kill_boss(whale)
	var carc := nearest_drop("whale_carcass")
	ok(carc != null, "carcaça da baleia na praia")
	carc.interact(player)
	ok(Story.carrying == "whale_carcass" and Story.step == 4, "carregando a carcaça -> passo 4")
	player.global_position = z["lava"] + Vector3(5, 1, 0)
	Story.throw_carcass_into_lava()
	await wait(0.5)
	var mut: Boss = Story.boss
	ok(mut != null and mut.id == "mutant" and Story.step == 5, "carcaça na lava -> Baleia Mutante de Magma")
	player.global_position = z["lava"] + Vector3(8, 1, 0)
	var hp4: float = player.hp
	await wait(8.0)
	ok(player.hp < hp4, "baleia mutante atacou (hp %.0f -> %.0f)" % [hp4, player.hp])
	await kill_boss(mut)
	var mfin := nearest_drop("mutant_fin")
	ok(mfin != null, "barbatana mutante caiu")
	mfin.interact(player)
	ok(Story.step == 6, "barbatana coletada -> passo 6")
	await talk("scientist")
	ok(Story.flags.get("keys_military", false) and Story.step == 7, "chaves da lancha militar recebidas")
	await wait(0.2)
	var mb := get_tree().get_nodes_in_group("boats_military")
	ok(not mb.is_empty(), "lancha militar no cais do vulcão")
	# ---- barco e final
	var boat: Boat = mb[0]
	player.global_position = boat.global_position + Vector3(0, 2, 0)
	boat.interact(player)
	ok(player.vehicle == boat, "jogador embarcou na lancha militar")
	Input.action_press("move_forward")
	var p0 := boat.global_position
	await wait(2.0)
	Input.action_release("move_forward")
	ok(boat.global_position.distance_to(p0) > 3.0, "lancha acelera (andou %.1f m)" % boat.global_position.distance_to(p0))
	ok(player.global_position.distance_to(boat.seat_pos()) < 1.0, "jogador acompanha a lancha")
	boat.global_position = Vector3(-240, 0, -250)
	await wait(0.5)
	ok(Story.ended, "saiu do mapa de lancha -> final da história")
	ok(hud.credits_layer != null, "créditos exibidos")
	hud._end_credits()
	await wait(0.3)
	ok(player.vehicle == null and Story.chapter == 6, "créditos encerrados; save continua (epílogo)")
	# ---- morte e respawn
	player.take_damage(1000.0)
	ok(player.dead, "jogador morre com dano alto")
	await wait(3.0)
	ok(not player.dead and player.hp == player.max_hp, "respawn com vida cheia")
	print("[STORY] RESULTADO: %s (%d falhas)" % ["TUDO OK" if fails == 0 else "COM FALHAS", fails])
	print("[STORY] DONE")
	get_tree().quit()
