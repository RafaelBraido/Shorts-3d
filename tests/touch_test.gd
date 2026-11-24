extends Node
## Teste do modo celular: injeta toques reais (InputEventScreenTouch/Drag) e confere o efeito.
## Rodar: godot --path . res://tests/TouchTest.tscn -- --touch   (resolução 1600x720)

var main: Node
var player: CharacterBody3D
var tc: Node
var step := 0
var frames := 0
var z0 := 0.0
var yaw0 := 0.0
var ammo0 := 0

func say(m: String) -> void:
	print("[TOUCH] ", m)

func shot(nm: String) -> void:
	get_viewport().get_texture().get_image().save_png("/tmp/shots/%s.png" % nm)

func touch(idx: int, pos: Vector2, pressed: bool) -> void:
	var e := InputEventScreenTouch.new()
	e.index = idx
	e.position = pos
	e.pressed = pressed
	Input.parse_input_event(e)

func drag(idx: int, pos: Vector2, rel: Vector2) -> void:
	var e := InputEventScreenDrag.new()
	e.index = idx
	e.position = pos
	e.relative = rel
	Input.parse_input_event(e)

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute("/tmp/shots")
	GameState.persist = false
	main = load("res://scenes/Main.tscn").instantiate()
	add_child(main)
	player = main.get_node("Player")

func _process(_d: float) -> void:
	frames += 1
	tc = get_tree().get_first_node_in_group("touch")
	match step:
		0:
			if frames > 10:
				say("mobile=%s touch_active=%s viewport=%s fish=%d" % [GameState.is_mobile(), tc.active, get_viewport().get_visible_rect().size, main.get_node("FishManager").fishes.size()])
				shot("t01_ui")
				# joystick para frente: toca em (190,550) e arrasta para cima
				z0 = player.global_position.z
				touch(0, Vector2(190, 550), true)
				step += 1; frames = 0
		1:
			drag(0, Vector2(190, 470), Vector2(0, -80))
			if frames > 40:
				say("joystick forward moved player dz=%.2f (esperado != 0)" % (player.global_position.z - z0))
				shot("t02_moving")
				touch(0, Vector2(190, 470), false)
				step += 1; frames = 0
		2:
			if frames > 5:
				yaw0 = player.rotation.y
				touch(1, Vector2(800, 300), true)
				step += 1; frames = 0
		3:
			drag(1, Vector2(900, 300), Vector2(100, 0))
			touch(1, Vector2(900, 300), false)
			step += 1; frames = 0
		4:
			if frames > 3:
				say("look drag yaw delta=%.3f (esperado != 0); ammo untouched by plain touch=%s" % [player.rotation.y - yaw0, GameState.ammo_mag == 8])
				ammo0 = GameState.ammo_mag
				touch(2, tc.btns["fire"].pos, true)
				step += 1; frames = 0
		5:
			if frames > 3:
				touch(2, tc.btns["fire"].pos, false)
				step += 1; frames = 0
		6:
			if frames > 5:
				say("fire button: ammo %d -> %d (esperado -1)" % [ammo0, GameState.ammo_mag])
				touch(3, tc.btns["aim"].pos, true); touch(3, tc.btns["aim"].pos, false)
				step += 1; frames = 0
		7:
			if frames > 12:
				say("aim toggle -> scoped=%s" % player.rifle.scoped)
				shot("t03_scope")
				touch(3, tc.btns["aim"].pos, true); touch(3, tc.btns["aim"].pos, false)
				touch(4, tc.btns["item2"].pos, true); touch(4, tc.btns["item2"].pos, false)
				step += 1; frames = 0
		8:
			if frames > 10:
				say("item2 tap -> item=%s" % player.item)
				shot("t04_rod")
				touch(5, tc.btns["bag"].pos, true); touch(5, tc.btns["bag"].pos, false)
				step += 1; frames = 0
		9:
			if frames > 6:
				say("bag tap -> menu visible=%s, touch ui visible=%s" % [main.get_node("HUD").menu_panel.visible, tc.visible])
				shot("t05_menu")
				step += 1; frames = 0
		10:
			say("DONE")
			get_tree().quit()
