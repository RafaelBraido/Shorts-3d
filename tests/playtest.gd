extends Node
## Teste de jogo automatizado (rodar com: godot --path . res://tests/PlayTest.tscn).
## Joga a cena real: tira screenshots, atira, lança a vara, espera um peixe morder, fisga e captura.

var main: Node
var player: CharacterBody3D
var step := 0
var frames := 0
var out_dir := "/tmp/shots"
var gs: Node = null

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(out_dir)
	gs = GameState
	gs.persist = false
	main = load("res://scenes/Main.tscn").instantiate()
	add_child(main)
	player = main.get_node("Player")

func shot(nm: String) -> void:
	get_viewport().get_texture().get_image().save_png("%s/%s.png" % [out_dir, nm])

func say(m: String) -> void:
	print("[TEST] ", m)

func look_at_dir(yaw: float, pitch: float) -> void:
	player.rotation.y = yaw
	player.pitch = pitch

func _process(_d: float) -> void:
	frames += 1
	var rod: FishingRod = player.rod
	var rifle: Rifle = player.rifle
	var mgr: FishManager = main.get_node("FishManager")
	match step:
		0:
			if frames > 8:
				say("fish count: %d  spawn: %s" % [mgr.fishes.size(), player.global_position])
				say("on_floor: %s" % player.is_on_floor())
				shot("01_spawn"); step += 1; frames = 0
		1:
			if frames > 4:
				say("player y after settle: %.2f floor=%s" % [player.global_position.y, player.is_on_floor()])
				var world = main.get_node("World")
				var hp: Vector3 = world.shop_pos
				var dv := Vector2(hp.x - player.global_position.x, hp.z - player.global_position.z)
				look_at_dir(atan2(-dv.x, -dv.y), -0.05)
				step = 101; frames = 0
		101:
			if frames > 6:
				shot("02_shop_view"); step = 2; frames = 0
		2:
			if frames > 3:
				# olhar para o mar e mirar com a luneta
				look_at_dir(main.get_node("World").spawn_yaw, -0.02)
				Input.action_press("aim"); step += 1; frames = 0
		3:
			if frames > 10:
				shot("03_scope")
				var before: int = gs.ammo_mag
				Input.action_press("shoot"); step += 1; frames = 0
				say("ammo before shot %d" % before)
		4:
			Input.action_release("shoot")
			if frames > 3:
				say("ammo after shot %d (cooldown) " % gs.ammo_mag)
				shot("04_shot"); Input.action_release("aim"); step += 1; frames = 0
		5:
			if frames > 12:
				player._equip("rod")
				look_at_dir(main.get_node("World").spawn_yaw, 0.1)
				# vai para o fim da doca
				var e: Vector3 = main.get_node("World").dock_end
				player.global_position = e + Vector3(0, 1.0, 0)
				mgr.populate_initial(e)
				step += 1; frames = 0
		6:
			if frames > 10:
				say("on dock y=%.2f floor=%s" % [player.global_position.y, player.is_on_floor()])
				shot("05_dock_rod")
				rod.power = 0.9
				rod.state = FishingRod.S.CHARGING
				rod._cast()
				step += 1; frames = 0
		7:
			if frames > 40:
				if frames == 41:
					say("rod state %s; bobber state %s pos %s" % [rod.state, rod.bobber.state if rod.bobber else -1, rod.bobber.global_position if rod.bobber else Vector3.ZERO])
					shot("06_cast")
				if frames > 60:
					say("rod state after wait: %d (WAITING=3)" % rod.state)
					step += 1; frames = 0
		8:
			# força um peixe perto da boia para acelerar o teste
			if rod.state == FishingRod.S.WAITING:
				var f := mgr.spawn_near_bait(rod.bobber.global_position, 0.0)
				if f:
					f.global_position = rod.bobber.global_position + Vector3(3, -0.8, 0)
					say("spawned %s for bait" % f.species_id)
					step += 1; frames = 0
			elif frames > 60:
				say("not waiting: state %d" % rod.state); step = 99
		9:
			if rod.state == FishingRod.S.BITE:
				say("BITE detected after %d frames" % frames)
				shot("07_bite")
				Input.action_press("shoot"); step += 1; frames = 0
			elif frames > 600:
				say("no bite in 600 frames; fish state: %s" % (str(mgr.bait_fish.state) if mgr.bait_fish else "none")); step = 99
		10:
			Input.action_release("shoot")
			if frames > 3:
				say("rod state after hook: %d (REELING=5)" % rod.state)
				Input.action_press("shoot"); step += 1; frames = 0
		11:
			# segura/solta o clique de acordo com a tensão (jogador automático)
			if rod.state == FishingRod.S.REELING:
				if rod.pulling or rod.tension > 0.7:
					Input.action_release("shoot")
				else:
					Input.action_press("shoot")
				if frames == 20:
					shot("08_reeling")
			else:
				Input.action_release("shoot")
				say("reel ended: state %d inventory %d coins %d xp %d" % [rod.state, gs.inventory.size(), gs.coins, gs.xp])
				shot("09_after")
				step += 1; frames = 0
		12:
			if frames > 6:
				var hud := main.get_node("HUD")
				hud.open_inventory(); step += 1; frames = 0
		13:
			if frames > 4:
				shot("10_inventory")
				main.get_node("HUD").close_menus()
				main.get_node("HUD").open_shop(); step += 1; frames = 0
		14:
			if frames > 4:
				shot("11_shop")
				step = 99
		99:
			say("DONE")
			get_tree().quit()
