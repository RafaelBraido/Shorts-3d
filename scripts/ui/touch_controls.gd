extends CanvasLayer
## Controles de toque para celular (paisagem): joystick flutuante à esquerda, olhar por arrasto,
## botões de ação à direita. Injeta as MESMAS ações de entrada usadas no PC (move_*, shoot, aim, jump...),
## então todo o resto do jogo funciona igual. Só fica ativo em celular ou com o argumento de usuário "--touch".

class Btn:
	var id := ""
	var pos := Vector2.ZERO
	var r := 50.0
	var label := ""
	var kind := "hold"        ## hold | toggle | tap
	var action := ""
	var visible := true
	var down := false
	var drag_look := false

const STICK_R := 95.0

var active := false
var player: Node
var hud: Node
var btns: Dictionary = {}
var fingers: Dictionary = {}
var canvas: Control
var stick_origin := Vector2.ZERO
var stick_default := Vector2(190, 540)
var stick_vec := Vector2.ZERO
var stick_finger := -1
var _size := Vector2(1280, 720)

func _ready() -> void:
	active = GameState.is_mobile()
	add_to_group("touch")
	layer = 20
	process_priority = 100
	if not active:
		visible = false
		set_process(false)
		set_process_input(false)
		return
	# no celular o mouse emulado pelo toque não pode disparar/mirar
	for a in ["shoot", "aim"]:
		for ev in InputMap.action_get_events(a):
			if ev is InputEventMouseButton:
				InputMap.action_erase_event(a, ev)
	canvas = Control.new()
	canvas.set_anchors_preset(Control.PRESET_FULL_RECT)
	canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE
	canvas.draw.connect(_draw_all)
	add_child(canvas)
	_add("fire", "ATIRAR", "hold", "shoot", 78.0, true)
	_add("aim", "MIRA", "toggle", "aim", 52.0)
	_add("jump", "PULAR", "hold", "jump", 46.0)
	_add("run", "CORRER", "toggle", "run", 42.0)
	_add("reload", "RECARGA", "tap", "reload", 44.0)
	_add("crouch", "ABAIXAR", "toggle", "crouch", 40.0)
	_add("net", "REDE", "tap", "__net", 32.0)
	_add("use", "USAR", "tap", "interact", 54.0)
	_add("item1", "1 RIFLE", "tap", "weapon_toggle", 32.0)
	_add("item2", "2 VARA", "tap", "fish_toggle", 32.0)
	_add("item3", "3 BOMBA", "tap", "bomb_toggle", 32.0)
	_add("item4", "4 MÃOS", "tap", "hands_toggle", 32.0)
	_add("bag", "MOCHILA", "tap", "__bag", 32.0)
	get_viewport().size_changed.connect(_layout)
	_layout()
	await get_tree().process_frame
	hud = get_tree().get_first_node_in_group("hud")
	if hud:
		hud.menu_toggled.connect(_on_menu_toggled)

func _add(id: String, label: String, kind: String, action: String, r: float, drag_look: bool = false) -> void:
	var b := Btn.new()
	b.id = id
	b.label = label
	b.kind = kind
	b.action = action
	b.r = r
	b.drag_look = drag_look
	btns[id] = b

func _layout() -> void:
	_size = get_viewport().get_visible_rect().size
	var s := _size
	stick_default = Vector2(190, s.y - 170)
	btns["fire"].pos = Vector2(s.x - 150, s.y - 170)
	btns["aim"].pos = Vector2(s.x - 300, s.y - 95)
	btns["jump"].pos = Vector2(s.x - 100, s.y - 340)
	btns["run"].pos = Vector2(s.x - 270, s.y - 250)
	btns["reload"].pos = Vector2(s.x - 400, s.y - 190)
	btns["crouch"].pos = Vector2(s.x - 410, s.y - 75)
	btns["use"].pos = Vector2(s.x - 250, s.y - 400)
	btns["item1"].pos = Vector2(s.x - 410, 48)
	btns["item2"].pos = Vector2(s.x - 340, 48)
	btns["item3"].pos = Vector2(s.x - 270, 48)
	btns["item4"].pos = Vector2(s.x - 200, 48)
	btns["bag"].pos = Vector2(s.x - 130, 48)
	btns["net"].pos = Vector2(s.x - 60, 48)

func _on_menu_toggled(open: bool) -> void:
	visible = not open
	set_process_input(not open)
	if open:
		_release_all()

func _release_all() -> void:
	fingers.clear()
	stick_finger = -1
	stick_vec = Vector2.ZERO
	for a in ["move_left", "move_right", "move_forward", "move_back", "shoot", "aim", "jump", "run"]:
		Input.action_release(a)
	for b in btns.values():
		b.down = false

# ------------------------------------------------------------------ entrada

func _hit(p: Vector2) -> Btn:
	for b in btns.values():
		if b.visible and p.distance_to(b.pos) <= b.r * 1.2:
			return b
	return null

func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed:
			var b := _hit(event.position)
			if b != null:
				fingers[event.index] = {"kind": "btn", "btn": b}
				_btn_down(b)
			elif event.position.x < _size.x * 0.45 and event.position.y > _size.y * 0.25 and stick_finger == -1:
				stick_finger = event.index
				stick_origin = Vector2(clampf(event.position.x, STICK_R + 10.0, _size.x), clampf(event.position.y, 0.0, _size.y - STICK_R - 10.0))
				stick_vec = Vector2.ZERO
				fingers[event.index] = {"kind": "stick"}
			else:
				fingers[event.index] = {"kind": "look"}
		else:
			var f: Variant = fingers.get(event.index)
			if f != null:
				if f["kind"] == "stick":
					stick_finger = -1
					stick_vec = Vector2.ZERO
				elif f["kind"] == "btn":
					_btn_up(f["btn"])
				fingers.erase(event.index)
		get_viewport().set_input_as_handled()
	elif event is InputEventScreenDrag:
		var f: Variant = fingers.get(event.index)
		if f == null:
			return
		match f["kind"]:
			"stick":
				stick_vec = ((event.position - stick_origin) / STICK_R).limit_length(1.0)
			"look":
				_look(event.relative)
			"btn":
				if f["btn"].drag_look:
					_look(event.relative)
		get_viewport().set_input_as_handled()

func _look(rel: Vector2) -> void:
	if player != null and player.has_method("look"):
		player.look(rel)

func _btn_down(b: Btn) -> void:
	match b.kind:
		"hold":
			b.down = true
			Input.action_press(b.action)
		"toggle":
			b.down = not b.down
			if b.down:
				Input.action_press(b.action)
			else:
				Input.action_release(b.action)
		"tap":
			if b.action == "__bag":
				if hud:
					hud.toggle_inventory()
			elif b.action == "__net":
				if hud:
					hud.open_network()
			else:
				Input.action_press(b.action)
				get_tree().create_timer(0.1).timeout.connect(func() -> void: Input.action_release(b.action))

func _btn_up(b: Btn) -> void:
	if b.kind == "hold":
		b.down = false
		Input.action_release(b.action)

# ------------------------------------------------------------------ quadro

func _process(_delta: float) -> void:
	if not active:
		return
	if player == null:
		player = get_tree().get_first_node_in_group("player")
	var rifle: bool = player != null and player.item == "rifle"
	var gun: bool = rifle and player.rifle.is_gun()
	var it: String = player.item if player != null else "rifle"
	rifle = rifle or it == "hands"
	btns["fire"].label = "PESCAR" if it == "rod" else ("JOGAR" if it == "bomb" else ("ATIRAR" if gun else ("SOCAR" if it == "hands" else "GOLPEAR")))
	btns["aim"].visible = gun
	btns["reload"].visible = gun
	btns["use"].visible = hud != null and hud.prompt_label.text != ""
	# joystick -> ações de movimento (com zona morta)
	var v := stick_vec
	if v.length() < 0.12:
		v = Vector2.ZERO
	_axis("move_left", "move_right", v.x)
	_axis("move_forward", "move_back", v.y)
	if v.length() > 0.97:
		Input.action_press("run")
	elif not btns["run"].down:
		Input.action_release("run")
	canvas.queue_redraw()

func _axis(neg: String, pos: String, v: float) -> void:
	if v > 0.0:
		Input.action_press(pos, v)
		Input.action_release(neg)
	elif v < 0.0:
		Input.action_press(neg, -v)
		Input.action_release(pos)
	else:
		Input.action_release(neg)
		Input.action_release(pos)

func _draw_all() -> void:
	var o := stick_origin if stick_finger != -1 else stick_default
	canvas.draw_circle(o, STICK_R, Color(1, 1, 1, 0.10))
	canvas.draw_arc(o, STICK_R, 0.0, TAU, 48, Color(1, 1, 1, 0.45), 3.0)
	canvas.draw_circle(o + stick_vec * STICK_R * 0.75, 38.0, Color(1, 1, 1, 0.35 if stick_finger != -1 else 0.2))
	var font := ThemeDB.fallback_font
	for b in btns.values():
		if not b.visible:
			continue
		var fill := Color(1.0, 0.8, 0.25, 0.5) if b.down else Color(0, 0, 0, 0.32)
		canvas.draw_circle(b.pos, b.r, fill)
		canvas.draw_arc(b.pos, b.r, 0.0, TAU, 40, Color(1, 1, 1, 0.65), 3.0)
		var fs := 18 if b.r > 40.0 else 12
		canvas.draw_string(font, b.pos + Vector2(-b.r, fs * 0.35), b.label, HORIZONTAL_ALIGNMENT_CENTER, b.r * 2.0, fs, Color(1, 1, 1, 0.95))
