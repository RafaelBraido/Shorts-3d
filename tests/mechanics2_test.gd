extends Node
## Mecânicas vistas nos prints do jogo real: punhos, fome, mochila com capacidade, números de dano, sangue,
## caranguejo que se atordoa, dicas na tela.
var main: Node
var player: CharacterBody3D
var hud: Node
var fails := 0

func ok(c: bool, m: String) -> void:
	print("[M2] %s  %s" % ["PASS" if c else "FAIL", m])
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

func count_numbers() -> int:
	var n := 0
	for c in get_children():
		if c is Label3D and (c as Label3D).text.is_valid_int():
			n += 1
	return n

func _run() -> void:
	var spot: Vector3 = Story.zones["spawn1"]
	player.global_position = spot
	await wait(0.5)
	# ---- punhos ("unequip with X, start punching with LMB")
	var wp0 := GameState.current_weapon
	Input.action_press("hands_toggle")
	await wait(0.15)
	Input.action_release("hands_toggle")
	await wait(0.1)
	ok(player.item == "hands" and player.rifle.weapon_id == "fists", "X guarda o item e equipa as mãos")
	ok(GameState.current_weapon == wp0, "arma escolhida não muda ao usar as mãos")
	player.rotation.y = 0.0
	player.pitch = 0.0
	var fwd: Vector3 = -player.cam.global_transform.basis.z
	var lf := LandedFish.spawn(main, "sardinha", 0.2, player.cam.global_position + fwd * 1.6, Vector3.ZERO)
	await get_tree().physics_frame
	var n0 := count_numbers()
	player.rifle._cooldown = 0.0
	player.rifle._try_fire()
	await wait(0.2)
	ok(lf.dead, "soco com as mãos mata o peixe no chão")
	ok(count_numbers() > n0, "número de dano flutua ao acertar")
	lf.queue_free()
	player._equip("rifle")
	# ---- fome e comer
	player.hunger = 40.0
	player.hp = 50.0
	GameState.inventory.clear()
	GameState.add_fish("sardinha", 0.3)
	player.eat_fish(0)
	ok(player.hunger > 60.0 and player.hp > 55.0 and GameState.inventory.is_empty(), "comer um peixe recupera fome (%.0f) e vida (%.0f)" % [player.hunger, player.hp])
	var h0: float = player.hunger
	await wait(2.0)
	ok(player.hunger < h0, "a fome diminui com o tempo")
	# ---- mochila com capacidade
	Story.chapter = 1
	GameState.bag_extra = 0
	GameState.inventory.clear()
	for i in GameState.bag_capacity():
		GameState.add_fish("sardinha", 0.2)
	var full := LandedFish.spawn(main, "dourado", 4.0, spot + Vector3(2, 1, 0), Vector3.ZERO)
	full.dead = true
	full.interact(player)
	await wait(0.1)
	ok(is_instance_valid(full) and not full.is_queued_for_deletion() and GameState.inventory.size() == GameState.bag_capacity(), "mochila cheia impede coletar")
	GameState.coins = 1000
	ok(GameState.buy_bag_slot() and GameState.bag_capacity() == GameState.BAG_BASE + 1, "espaço extra comprado (+1)")
	ok(GameState.buy_bag_slot() and not GameState.buy_bag_slot(), "ilha 1 permite no máximo 2 espaços extras")
	Story.chapter = 3
	ok(GameState.bag_extra_max() == 6, "ilha 3 libera mais espaços (máx %d)" % GameState.bag_extra_max())
	full.interact(player)
	await wait(0.1)
	ok(GameState.inventory.size() == GameState.bag_capacity() or not is_instance_valid(full) or full.is_queued_for_deletion(), "com espaço extra a coleta funciona")
	GameState.inventory.clear()
	# ---- caranguejo: atordoa e leva mais dano; sangue no chão
	Story.chapter = 1
	Story.step = 4
	player.hp = player.max_hp
	Story.spawn_boss("crab", Story.zones["crab"])
	await wait(0.3)
	var crab: Boss = Story.boss
	player.global_position = crab.global_position + Vector3(0, 1.0, 6.0)
	var saw_stun := false
	for i in 60:
		await wait(0.1)
		player.hp = player.max_hp
		if crab.state == "stunned":
			saw_stun = true
			break
	ok(saw_stun, "o caranguejo se atordoa depois da investida")
	var hp_before := crab.hp
	crab.hit(2.0, crab.global_position + Vector3(0, 1, 0))
	ok(absf((hp_before - crab.hp) - 3.0) < 0.01, "atordoado: dano x1.5 (%.1f)" % (hp_before - crab.hp))
	ok(Fx._blood_list.size() > 0, "mancha de sangue no chão (%d)" % Fx._blood_list.size())
	crab.hit(1000.0, crab.global_position)
	await wait(1.2)
	# ---- dicas e hint
	hud.tip_panel.visible = false
	Story.flags["tips"] = {}
	hud.show_tip("t1", "Como Testar", "texto")
	ok(hud.tip_panel.visible and hud.tip_title.text == "Como Testar", "dica laranja aparece")
	hud.tip_panel.visible = false
	hud.show_tip("t1", "Como Testar", "texto")
	ok(not hud.tip_panel.visible, "a mesma dica não repete")
	hud.set_hint("Lançar linha (segurar 🖱)")
	ok(hud.hint_label.text.begins_with("Lançar"), "aviso de controle contextual")
	hud.set_health(25.0, 100.0)
	hud.set_hunger(10.0)
	ok(hud._hp == 25.0 and hud._hunger == 10.0, "anéis de vida e fome atualizam")
	print("[M2] RESULTADO: %s (%d falhas)" % ["TUDO OK" if fails == 0 else "COM FALHAS", fails])
	print("[M2] DONE")
	get_tree().quit()
