extends CanvasLayer
## Interface do jogo, construída por código: mira, luneta, hotbar, moedas/XP, notificações,
## barras do minigame de pesca, barra de vida do alvo, cartão de captura, mochila/registro e loja.

signal menu_toggled(open: bool)

const GOLD := Color(1.0, 0.82, 0.25)
const PANEL := Color(0.05, 0.08, 0.12, 0.88)

var root: Control
var crosshair: Control
var scope: ColorRect
var scope_lines: Control
var underwater: ColorRect
var coins_label: Label
var level_label: Label
var xp_bar: Dictionary
var ammo_label: Label
var slots: Array[PanelContainer] = []
var prompt_label: Label
var toasts: VBoxContainer
var power_bar: Dictionary
var bite_label: Label
var reel_panel: PanelContainer
var tension_bar: Dictionary
var progress_bar: Dictionary
var reel_label: Label
var target_panel: PanelContainer
var target_name: Label
var target_bar: Dictionary
var catch_panel: PanelContainer
var catch_title: Label
var catch_name: Label
var catch_info: Label
var catch_flag: Label
var menu_panel: PanelContainer
var menu_tabs: TabContainer
var menu_title: Label
var menu_mode := "inv"
var touch_mode := false
var prompt_prefix := "[E] "
var _net_ip := "127.0.0.1"
var hp_bar: Dictionary
var hp_label: Label
var obj_panel: PanelContainer
var obj_chapter: Label
var obj_text: Label
var radar: Control
var boss_panel: PanelContainer
var boss_name: Label
var boss_bar: Dictionary
var dlg_panel: PanelContainer
var dlg_name: Label
var dlg_text: Label
var dlg_btn: Button
var dlg_lines: Array = []
var dlg_index := 0
var dlg_after: Callable
var dlg_open := false
var pages_layer: ColorRect
var pages_label: Label
var credits_layer: ColorRect
var death_layer: ColorRect
var death_label: Label
var damage_flash: ColorRect
var _player: Node3D = null

var _hit_t := 0.0
var _target_t := 0.0
var _catch_t := 0.0
var _bite_pulse := 0.0
var _scope_amount := 0.0
var _equipped := 1

func _ready() -> void:
	add_to_group("hud")
	touch_mode = GameState.is_mobile()
	if touch_mode:
		prompt_prefix = "Toque em USAR:  "
	layer = 10
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	_build_underwater()
	_build_scope()
	_build_crosshair()
	_build_status()
	_build_hotbar()
	_build_fishing_ui()
	_build_target_bar()
	_build_catch_card()
	_build_toasts()
	_build_menu()
	_build_help()
	_build_story_ui()
	Story.dialogue_requested.connect(show_dialogue)
	Story.pages_requested.connect(show_pages)
	Story.ending_started.connect(show_credits)
	Story.changed.connect(_refresh_story)
	GameState.coins_changed.connect(func(_c: int) -> void: _refresh_status())
	GameState.xp_changed.connect(func(_x: int, _n: int, _l: int) -> void: _refresh_status())
	GameState.ammo_changed.connect(_refresh_status)
	GameState.rod_changed.connect(_refresh_status)
	GameState.notify.connect(func(m: String) -> void: toast(m, GOLD))
	GameState.inventory_changed.connect(_refresh_menu_if_open)
	Net.status.connect(func(m: String) -> void: toast(m, Color(0.6, 0.9, 1.0)))
	Net.players_changed.connect(_refresh_menu_if_open)
	GameState.coins_changed.connect(func(_c: int) -> void: _refresh_menu_if_open())
	_refresh_status()
	_refresh_story()
	set_equipped(1)
	refresh_hotbar()
	if not Story.intro_done:
		call_deferred("_start_intro")

# ------------------------------------------------------------------ helpers

func _style(color: Color, radius: int = 8, border: Color = Color(0, 0, 0, 0), bw: int = 0) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = color
	s.set_corner_radius_all(radius)
	s.border_color = border
	s.set_border_width_all(bw)
	s.content_margin_left = 10
	s.content_margin_right = 10
	s.content_margin_top = 6
	s.content_margin_bottom = 6
	return s

func _label(text: String, size: int = 16, color: Color = Color.WHITE, outline: int = 4) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	l.add_theme_constant_override("outline_size", outline)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l

func _bar(size: Vector2, fill_color: Color) -> Dictionary:
	var bg := ColorRect.new()
	bg.color = Color(0, 0, 0, 0.6)
	bg.custom_minimum_size = size
	bg.size = size
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var fill := ColorRect.new()
	fill.color = fill_color
	fill.position = Vector2(2, 2)
	fill.size = Vector2(size.x - 4, size.y - 4)
	fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bg.add_child(fill)
	return {"bg": bg, "fill": fill, "w": size.x - 4, "h": size.y - 4}

func _set_bar(b: Dictionary, v: float, color: Color = Color(-1, 0, 0)) -> void:
	var fill: ColorRect = b["fill"]
	fill.size.x = float(b["w"]) * clampf(v, 0.0, 1.0)
	if color.r >= 0.0:
		fill.color = color

# ------------------------------------------------------------------ construção

func _build_underwater() -> void:
	underwater = ColorRect.new()
	underwater.color = Color(0.05, 0.35, 0.5, 0.45)
	underwater.set_anchors_preset(Control.PRESET_FULL_RECT)
	underwater.mouse_filter = Control.MOUSE_FILTER_IGNORE
	underwater.visible = false
	root.add_child(underwater)

func _build_scope() -> void:
	scope = ColorRect.new()
	scope.set_anchors_preset(Control.PRESET_FULL_RECT)
	scope.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sh := Shader.new()
	sh.code = """
shader_type canvas_item;
uniform float aspect = 1.7778;
uniform float radius = 0.46;
void fragment() {
	vec2 p = (UV - vec2(0.5)) * vec2(aspect, 1.0);
	float d = length(p);
	float edge = smoothstep(radius, radius + 0.004, d);
	float vig = smoothstep(radius * 0.7, radius, d) * 0.35;
	COLOR = vec4(0.0, 0.0, 0.0, max(edge, vig));
}
"""
	var m := ShaderMaterial.new()
	m.shader = sh
	scope.material = m
	scope.visible = false
	root.add_child(scope)
	scope_lines = Control.new()
	scope_lines.set_anchors_preset(Control.PRESET_FULL_RECT)
	scope_lines.mouse_filter = Control.MOUSE_FILTER_IGNORE
	scope_lines.draw.connect(_draw_scope_lines)
	scope.add_child(scope_lines)
	root.resized.connect(func() -> void:
		(scope.material as ShaderMaterial).set_shader_parameter("aspect", root.size.x / maxf(root.size.y, 1.0))
		scope_lines.queue_redraw())

func _draw_scope_lines() -> void:
	var c := scope_lines.size * 0.5
	var r := scope_lines.size.y * 0.46
	var col := Color(0, 0, 0, 0.9)
	scope_lines.draw_line(Vector2(c.x - r, c.y), Vector2(c.x - 14, c.y), col, 2.0)
	scope_lines.draw_line(Vector2(c.x + 14, c.y), Vector2(c.x + r, c.y), col, 2.0)
	scope_lines.draw_line(Vector2(c.x, c.y - r), Vector2(c.x, c.y - 14), col, 2.0)
	scope_lines.draw_line(Vector2(c.x, c.y + 14), Vector2(c.x, c.y + r), col, 2.0)
	for i in range(1, 6):
		scope_lines.draw_circle(Vector2(c.x + i * 34, c.y), 2.0, col)
		scope_lines.draw_circle(Vector2(c.x - i * 34, c.y), 2.0, col)
		scope_lines.draw_circle(Vector2(c.x, c.y + i * 34), 2.0, col)
	scope_lines.draw_circle(c, 2.5, Color(1, 0.1, 0.1, 0.95))

func _build_crosshair() -> void:
	crosshair = Control.new()
	crosshair.set_anchors_preset(Control.PRESET_FULL_RECT)
	crosshair.mouse_filter = Control.MOUSE_FILTER_IGNORE
	crosshair.draw.connect(_draw_crosshair)
	root.add_child(crosshair)

func _draw_crosshair() -> void:
	var c := crosshair.size * 0.5
	crosshair.draw_circle(c, 2.5, Color(1, 1, 1, 0.95))
	crosshair.draw_arc(c, 9.0, 0.0, TAU, 24, Color(1, 1, 1, 0.55), 1.5)
	if _hit_t > 0.0:
		var a := _hit_t / 0.2
		var col := Color(1.0, 0.3, 0.25, a)
		for s in [Vector2(1, 1), Vector2(-1, 1), Vector2(1, -1), Vector2(-1, -1)]:
			crosshair.draw_line(c + s * 8.0, c + s * 17.0, col, 3.0)

func _build_status() -> void:
	# moedas (canto inferior esquerdo, como no jogo de referência)
	var box := PanelContainer.new()
	box.add_theme_stylebox_override("panel", _style(Color(0, 0, 0, 0.55), 6))
	if touch_mode:
		box.set_anchors_preset(Control.PRESET_TOP_LEFT)
		box.position = Vector2(16, 12)
	else:
		box.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
		box.position = Vector2(16, -62)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(box)
	var vb := VBoxContainer.new()
	vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(vb)
	coins_label = _label("$0", 22, GOLD)
	vb.add_child(coins_label)
	level_label = _label("Nv 1", 14)
	vb.add_child(level_label)
	xp_bar = _bar(Vector2(140, 10), Color(0.35, 0.8, 1.0))
	vb.add_child(xp_bar["bg"])
	hp_label = _label("♥ 100", 14, Color(1.0, 0.45, 0.45))
	vb.add_child(hp_label)
	hp_bar = _bar(Vector2(140, 10), Color(0.9, 0.2, 0.2))
	vb.add_child(hp_bar["bg"])

func _refresh_status() -> void:
	coins_label.text = "$%d" % GameState.coins
	level_label.text = "Nível %d   (%d / %d XP)" % [GameState.level, GameState.xp, GameState.xp_needed()]
	_set_bar(xp_bar, float(GameState.xp) / float(GameState.xp_needed()))
	refresh_hotbar()

func _build_hotbar() -> void:
	var hb := HBoxContainer.new()
	hb.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	hb.grow_horizontal = Control.GROW_DIRECTION_BOTH
	hb.grow_vertical = Control.GROW_DIRECTION_BEGIN
	hb.position = Vector2(-140, -90)
	hb.add_theme_constant_override("separation", 10)
	hb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(hb)
	for i in 3:
		var p := PanelContainer.new()
		p.custom_minimum_size = Vector2(96, 64)
		p.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var v := VBoxContainer.new()
		v.alignment = BoxContainer.ALIGNMENT_CENTER
		v.mouse_filter = Control.MOUSE_FILTER_IGNORE
		p.add_child(v)
		var l := _label("", 14)
		l.name = "Title"
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(l)
		var sub := _label("", 13, Color(0.9, 0.9, 0.9))
		sub.name = "Sub"
		sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(sub)
		hb.add_child(p)
		slots.append(p)
	prompt_label = _label("", 20, Color(1, 1, 1))
	prompt_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	prompt_label.grow_horizontal = Control.GROW_DIRECTION_BOTH
	prompt_label.position = Vector2(0, -150)
	prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prompt_label.custom_minimum_size = Vector2(600, 0)
	prompt_label.position.x = -300
	root.add_child(prompt_label)

func _slot_set(i: int, title: String, sub: String) -> void:
	if i >= slots.size():
		return
	(slots[i].find_child("Title", true, false) as Label).text = title
	(slots[i].find_child("Sub", true, false) as Label).text = sub

func refresh_hotbar() -> void:
	if slots.size() < 3:
		return
	var wid := GameState.current_weapon
	var w: Dictionary = WeaponDB.data(wid)
	var sub := "∞"
	if w["kind"] == "gun":
		sub = "%d / %d" % [GameState.ammo_mag(wid), GameState.ammo_reserve(wid)]
	_slot_set(0, "1  " + String(w["name"]).split(" ")[0], sub)
	_slot_set(1, "2  Vara", String(GameState.rod()["name"]).replace("Vara de ", "").replace("Vara ", ""))
	_slot_set(2, "3  Dinamite", "x%d" % GameState.dynamite)

func set_equipped(slot: int) -> void:
	_equipped = slot
	for i in slots.size():
		var on := i == slot - 1
		slots[i].add_theme_stylebox_override("panel", _style(Color(0.95, 0.75, 0.2, 0.35) if on else Color(0, 0, 0, 0.5), 6, GOLD if on else Color(1, 1, 1, 0.25), 2))
	refresh_hotbar()

func _build_fishing_ui() -> void:
	power_bar = _bar(Vector2(260, 18), Color(1.0, 0.8, 0.2))
	var pb: ColorRect = power_bar["bg"]
	pb.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	pb.position = Vector2(-130, -190)
	pb.visible = false
	root.add_child(pb)
	bite_label = _label("! FISGUE ! (clique)", 42, Color(1.0, 0.9, 0.2), 8)
	bite_label.set_anchors_preset(Control.PRESET_CENTER)
	bite_label.grow_horizontal = Control.GROW_DIRECTION_BOTH
	bite_label.position = Vector2(-190, -170)
	bite_label.visible = false
	root.add_child(bite_label)
	reel_panel = PanelContainer.new()
	reel_panel.add_theme_stylebox_override("panel", _style(Color(0, 0, 0, 0.55), 8))
	reel_panel.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	reel_panel.position = Vector2(-170, -380)
	reel_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	reel_panel.visible = false
	root.add_child(reel_panel)
	var vb := VBoxContainer.new()
	vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	reel_panel.add_child(vb)
	reel_label = _label("Segure o clique para recolher", 16)
	reel_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(reel_label)
	vb.add_child(_label("Tensão da linha", 13, Color(0.9, 0.9, 0.9)))
	tension_bar = _bar(Vector2(320, 18), Color(0.3, 0.9, 0.3))
	vb.add_child(tension_bar["bg"])
	vb.add_child(_label("Progresso", 13, Color(0.9, 0.9, 0.9)))
	progress_bar = _bar(Vector2(320, 18), Color(0.3, 0.7, 1.0))
	vb.add_child(progress_bar["bg"])

func _build_target_bar() -> void:
	target_panel = PanelContainer.new()
	target_panel.add_theme_stylebox_override("panel", _style(Color(0, 0, 0, 0.35), 4))
	target_panel.set_anchors_preset(Control.PRESET_CENTER_TOP)
	target_panel.position = Vector2(-200, 16)
	target_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	target_panel.visible = false
	root.add_child(target_panel)
	var vb := VBoxContainer.new()
	vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	target_panel.add_child(vb)
	target_name = _label("Alvo", 15)
	vb.add_child(target_name)
	target_bar = _bar(Vector2(400, 14), Color(0.85, 0.15, 0.15))
	vb.add_child(target_bar["bg"])

func show_target_health(nm: String, frac: float) -> void:
	target_name.text = nm
	_set_bar(target_bar, frac)
	target_panel.visible = true
	_target_t = 2.5

func _build_catch_card() -> void:
	catch_panel = PanelContainer.new()
	catch_panel.add_theme_stylebox_override("panel", _style(PANEL, 12, GOLD, 2))
	catch_panel.set_anchors_preset(Control.PRESET_CENTER_RIGHT)
	catch_panel.position = Vector2(-330, -80)
	catch_panel.custom_minimum_size = Vector2(300, 0)
	catch_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	catch_panel.visible = false
	root.add_child(catch_panel)
	var vb := VBoxContainer.new()
	vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	catch_panel.add_child(vb)
	catch_title = _label("Peixe capturado!", 16, GOLD)
	vb.add_child(catch_title)
	catch_name = _label("", 26)
	vb.add_child(catch_name)
	catch_info = _label("", 16, Color(0.9, 0.95, 1.0))
	vb.add_child(catch_info)
	catch_flag = _label("", 16, Color(0.5, 1.0, 0.6))
	vb.add_child(catch_flag)

func _build_toasts() -> void:
	toasts = VBoxContainer.new()
	toasts.set_anchors_preset(Control.PRESET_CENTER_LEFT)
	toasts.position = Vector2(20, -60)
	toasts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(toasts)

func _build_help() -> void:
	var l := _label("WASD mover | Shift correr | Espaço pular/nadar | 1 rifle | 2 vara | Botão direito mira | Clique pesca/atira | R recarrega | E interage | Tab mochila", 13, Color(1, 1, 1, 0.75), 3)
	l.position = Vector2(14, 10)
	l.visible = not touch_mode
	root.add_child(l)

# ------------------------------------------------------------------ API pública

func show_prompt(text: String) -> void:
	prompt_label.text = text

func toast(text: String, color: Color = Color.WHITE) -> void:
	var l := _label(text, 18, color)
	toasts.add_child(l)
	while toasts.get_child_count() > 5:
		toasts.get_child(0).queue_free()
		toasts.remove_child(toasts.get_child(0))
	var tw := l.create_tween()
	tw.tween_interval(3.0)
	tw.tween_property(l, "modulate:a", 0.0, 0.8)
	tw.tween_callback(l.queue_free)

func hit_marker() -> void:
	_hit_t = 0.2

func set_scope(amount: float) -> void:
	_scope_amount = amount
	(scope.material as ShaderMaterial).set_shader_parameter("aspect", root.size.x / maxf(root.size.y, 1.0))
	scope.visible = amount > 0.01
	scope.modulate.a = amount
	crosshair.visible = amount < 0.5
	for s in slots:
		s.visible = amount < 0.5
	prompt_label.visible = amount < 0.5

func set_underwater(on: bool) -> void:
	underwater.visible = on

func show_cast_power(v: float) -> void:
	var pb: ColorRect = power_bar["bg"]
	pb.visible = v >= 0.0
	if v >= 0.0:
		_set_bar(power_bar, v, Color(0.3, 1.0, 0.3).lerp(Color(1.0, 0.3, 0.2), v))

func show_bite(on: bool) -> void:
	bite_label.visible = on
	_bite_pulse = 0.0

func show_reel(on: bool, tension: float, progress: float, pulling: bool) -> void:
	reel_panel.visible = on
	if not on:
		return
	_set_bar(tension_bar, tension, Color(0.3, 0.9, 0.3).lerp(Color(1.0, 0.15, 0.1), clampf((tension - 0.45) * 2.0, 0.0, 1.0)))
	_set_bar(progress_bar, progress)
	reel_label.text = "PUXÃO! Solte o clique!" if pulling else "Segure o clique para recolher"
	reel_label.add_theme_color_override("font_color", Color(1.0, 0.4, 0.3) if pulling else Color.WHITE)

func show_catch(id: String, weight: float, value: int, is_new: bool, is_record: bool) -> void:
	var d := FishDB.data(id)
	catch_name.text = String(d["name"])
	catch_name.add_theme_color_override("font_color", FishDB.rarity_color(id))
	catch_info.text = "%.2f kg  ·  %s  ·  $%d" % [weight, FishDB.rarity_name(id), value]
	catch_flag.text = "NOVA ESPÉCIE no registro!" if is_new else ("NOVO RECORDE!" if is_record else "")
	catch_panel.visible = true
	_catch_t = 4.5

func _process(delta: float) -> void:
	if radar != null:
		radar.queue_redraw()
	if _hit_t > 0.0:
		_hit_t = maxf(_hit_t - delta, 0.0)
		crosshair.queue_redraw()
	if _target_t > 0.0:
		_target_t -= delta
		if _target_t <= 0.0:
			target_panel.visible = false
	if _catch_t > 0.0:
		_catch_t -= delta
		if _catch_t <= 0.0:
			catch_panel.visible = false
	if bite_label.visible:
		_bite_pulse += delta * 14.0
		bite_label.scale = Vector2.ONE * (1.0 + 0.08 * sin(_bite_pulse))
		bite_label.pivot_offset = bite_label.size * 0.5

# ------------------------------------------------------------------ menus

func _build_menu() -> void:
	menu_panel = PanelContainer.new()
	menu_panel.add_theme_stylebox_override("panel", _style(PANEL, 14, Color(1, 1, 1, 0.2), 2))
	menu_panel.set_anchors_preset(Control.PRESET_CENTER)
	menu_panel.custom_minimum_size = Vector2(760, 500)
	menu_panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	menu_panel.grow_vertical = Control.GROW_DIRECTION_BOTH
	menu_panel.visible = false
	root.add_child(menu_panel)
	var vb := VBoxContainer.new()
	menu_panel.add_child(vb)
	var top := HBoxContainer.new()
	vb.add_child(top)
	menu_title = _label("Mochila", 24, GOLD)
	menu_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(menu_title)
	var close := Button.new()
	close.text = "Fechar (Tab/Esc)"
	close.pressed.connect(close_menus)
	top.add_child(close)
	menu_tabs = TabContainer.new()
	menu_tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	vb.add_child(menu_tabs)

func toggle_inventory() -> void:
	if menu_panel.visible:
		close_menus()
	else:
		_open("inv")

func open_inventory() -> void:
	_open("inv")

func open_network() -> void:
	_open("net")

func open_shop() -> void:
	_open("shop")

func _open(mode: String) -> void:
	menu_mode = mode
	menu_panel.visible = true
	_refresh_menu()
	menu_toggled.emit(true)

func close_menus() -> void:
	if menu_panel.visible:
		menu_panel.visible = false
		menu_toggled.emit(false)

func _refresh_menu_if_open() -> void:
	if menu_panel != null and menu_panel.visible:
		_refresh_menu()

func _tab(title: String) -> VBoxContainer:
	var sc := ScrollContainer.new()
	sc.name = title
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var vb := VBoxContainer.new()
	vb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vb.add_theme_constant_override("separation", 6)
	sc.add_child(vb)
	menu_tabs.add_child(sc)
	return vb

func _refresh_menu() -> void:
	var prev := menu_tabs.current_tab
	for c in menu_tabs.get_children():
		menu_tabs.remove_child(c)
		c.queue_free()
	if menu_mode == "net":
		_build_net_tab()
		_touchify()
		return
	var shop := menu_mode == "shop"
	menu_title.text = "Loja   —   $%d" % GameState.coins if shop else "Mochila   —   $%d   ·   Nível %d" % [GameState.coins, GameState.level]
	_tab_fish(shop)
	if shop:
		_tab_weapons(true)
		_tab_items(true)
		_tab_rods(true)
		_tab_casino()
	else:
		_tab_diary()
		_tab_registry()
		_tab_weapons(false)
		_tab_rods(false)
	menu_tabs.current_tab = clampi(prev, 0, menu_tabs.get_child_count() - 1)
	_touchify()

func _sale_mult() -> float:
	return 1.4 if Story.flags.get("lighter", false) else 1.0

func _tab_fish(shop: bool) -> void:
	var fish_tab := _tab("Vender" if shop else "Peixes")
	if GameState.inventory.is_empty():
		fish_tab.add_child(_label("Nenhum peixe na mochila. Lance a vara na água (tecla 2)!", 16, Color(0.85, 0.85, 0.85), 0))
		return
	if shop:
		var sa := Button.new()
		var total := 0
		for e in GameState.inventory:
			total += int(e["value"] * _sale_mult())
		sa.text = "Vender tudo  ($%d)%s" % [total, "  — assados +40%!" if _sale_mult() > 1.0 else ""]
		sa.pressed.connect(func() -> void:
			var got := GameState.sell_all()
			Sfx.play("coin")
			toast("Vendeu tudo por $%d" % got, GOLD))
		fish_tab.add_child(sa)
	for i in GameState.inventory.size():
		var e: Dictionary = GameState.inventory[i]
		var row := HBoxContainer.new()
		var nm := _label("%s%s" % [FishDB.data(e["species"])["name"], " (abatido)" if e["dead"] else ""], 17, FishDB.rarity_color(e["species"]), 0)
		nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(nm)
		row.add_child(_label("%.2f kg    $%d   " % [e["weight"], int(e["value"] * _sale_mult())], 16, Color.WHITE, 0))
		if shop:
			var b := Button.new()
			b.text = "Vender"
			var idx := i
			b.pressed.connect(func() -> void:
				var got := GameState.sell_fish(idx)
				Sfx.play("coin")
				toast("+$%d" % got, GOLD))
			row.add_child(b)
		fish_tab.add_child(row)

func _tab_registry() -> void:
	var reg := _tab("Registro")
	var found := 0
	for id in FishDB.ids():
		if GameState.codex.has(id):
			found += 1
	reg.add_child(_label("Espécies descobertas: %d / %d    ·    Total capturado: %d" % [found, FishDB.ids().size(), GameState.total_caught], 16, GOLD, 0))
	for id in FishDB.ids():
		var d := FishDB.data(id)
		var row := HBoxContainer.new()
		var c: Dictionary = GameState.codex.get(id, {})
		var known := not c.is_empty()
		var nm := _label(String(d["name"]) if known else "???", 17, FishDB.rarity_color(id) if known else Color(0.5, 0.5, 0.5), 0)
		nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(nm)
		row.add_child(_label("%s    %s" % [FishDB.rarity_name(id), ("recorde %.2f kg  ·  x%d" % [c["best"], c["count"]]) if known else "não capturado"], 15, Color(0.9, 0.9, 0.9), 0))
		reg.add_child(row)

func _tab_diary() -> void:
	var d := _tab("Diário")
	d.add_child(_label(Story.chapter_name(), 20, GOLD, 0))
	var o := _label("Objetivo: " + Story.objective(), 16, Color.WHITE, 0)
	o.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	o.custom_minimum_size = Vector2(640, 0)
	d.add_child(o)
	d.add_child(_label("Itens-chave:", 16, Color(0.8, 0.9, 1.0), 0))
	var any := false
	for id in Story.items:
		if Story.count(id) > 0:
			any = true
			d.add_child(_label("  • %s x%d" % [Story.item_name(id), Story.count(id)], 15, Color.WHITE, 0))
	if not any:
		d.add_child(_label("  (nenhum)", 15, Color(0.6, 0.6, 0.6), 0))
	if Story.has_radar():
		d.add_child(_label("Radar: instalado (seta no canto da tela)", 15, Color(0.6, 1.0, 0.7), 0))
	if Story.flags.get("lighter", false):
		d.add_child(_label("Isqueiro dourado: peixes vendem +40%", 15, Color(1.0, 0.8, 0.4), 0))
	if Story.flags.get("keys_motorboat", false):
		d.add_child(_label("Chaves da lancha a motor ✓", 15, Color(0.6, 1.0, 0.7), 0))
	if Story.flags.get("keys_military", false):
		d.add_child(_label("Chaves da lancha militar ✓", 15, Color(0.6, 1.0, 0.7), 0))

func _player_node() -> Node3D:
	if _player == null or not is_instance_valid(_player):
		_player = get_tree().get_first_node_in_group("player")
	return _player

func _tab_weapons(shop: bool) -> void:
	var t := _tab("Armas" if shop else "Armas")
	for wid in WeaponDB.ORDER:
		var w: Dictionary = WeaponDB.data(wid)
		var row := HBoxContainer.new()
		var info_txt := String(w["name"])
		if w["kind"] == "gun":
			info_txt += "\nDano %.1f%s · pente %d · %s" % [w["damage"], " x%d" % w["pellets"] if int(w["pellets"]) > 1 else "", w["mag"], "automática" if w.get("auto", false) else "semi-automática"]
			if wid in GameState.owned_weapons:
				info_txt += "\nMunição: %d no pente · %d de reserva" % [GameState.ammo_mag(wid), GameState.ammo_reserve(wid)]
		else:
			info_txt += "\nCorpo a corpo · dano %.1f" % w["damage"]
		var info := _label(info_txt, 15, Color(1.0, 0.9, 0.6) if wid in GameState.owned_weapons else Color(0.8, 0.8, 0.8), 0)
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(info)
		var id: String = wid
		if wid in GameState.owned_weapons:
			if w["kind"] == "gun" and shop:
				var ab := Button.new()
				ab.text = "+%d balas $%d" % [w["ammo_pack"], w["ammo_price"]]
				ab.disabled = GameState.coins < int(w["ammo_price"])
				ab.pressed.connect(func() -> void:
					if GameState.buy_ammo(id):
						Sfx.play("coin")
						_refresh_menu())
				row.add_child(ab)
			var eb := Button.new()
			eb.text = "Equipada" if GameState.current_weapon == wid else "Equipar"
			eb.disabled = GameState.current_weapon == wid
			eb.pressed.connect(func() -> void:
				var p := _player_node()
				if p:
					p.rifle.set_weapon(id)
					p._equip("rifle")
				_refresh_menu())
			row.add_child(eb)
		else:
			var bb := Button.new()
			bb.text = "Comprar $%d" % w["price"]
			bb.disabled = not shop or GameState.coins < int(w["price"])
			bb.pressed.connect(func() -> void:
				if GameState.buy_weapon(id):
					Sfx.play("coin")
					_refresh_menu())
			row.add_child(bb)
		t.add_child(row)
	var drow := HBoxContainer.new()
	var dl := _label("Dinamite (explosivo, dano em área) — você tem %d" % GameState.dynamite, 15, Color(1.0, 0.7, 0.5), 0)
	dl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	drow.add_child(dl)
	if shop:
		var db := Button.new()
		db.text = "Comprar $%d" % WeaponDB.DYNAMITE_PRICE
		db.disabled = GameState.coins < WeaponDB.DYNAMITE_PRICE
		db.pressed.connect(func() -> void:
			if GameState.buy_dynamite():
				Sfx.play("coin")
				_refresh_menu())
		drow.add_child(db)
	t.add_child(drow)

func _tab_items(shop: bool) -> void:
	var t := _tab("Itens")
	var rows := [
		["Lata de cerveja gelada", 12, "Para o Guardião do Farol.", func() -> bool: return Story.buy_beer(), false],
		["Radar", 10, "Mostra a direção das ilhas (seta no canto da tela).", func() -> bool: return Story.buy_radar(), Story.has_radar()],
		["Isca profissional", 60, "Aumenta a sorte do próximo lance (ajuda a pescar atum).", func() -> bool: return Story.buy_pro_bait(), false],
	]
	if GameState.engine_level < GameState.ENGINES.size():
		var eng: Dictionary = GameState.ENGINES[GameState.engine_level]
		rows.append([eng["name"] + " (barco)", int(eng["price"]), "Aumenta a velocidade dos seus barcos.", func() -> bool: return GameState.buy_engine(), false])
	for r in rows:
		var row := HBoxContainer.new()
		var info := _label("%s\n%s" % [r[0], r[2]], 15, Color.WHITE, 0)
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(info)
		var b := Button.new()
		b.text = "Comprado" if r[4] else "Comprar $%d" % r[1]
		b.disabled = r[4] or GameState.coins < int(r[1])
		var cb: Callable = r[3]
		b.pressed.connect(func() -> void:
			if cb.call():
				Sfx.play("coin")
				_refresh_menu())
		row.add_child(b)
		t.add_child(row)
	t.add_child(_label("Você tem: %d cerveja(s), %d isca(s) profissional(is)." % [Story.count("beer"), Story.count("pro_bait")], 14, Color(0.8, 0.8, 0.8), 0))

func _tab_casino() -> void:
	var t := _tab("Cassino")
	t.add_child(_label("Aposte à vontade (sem dinheiro de verdade, só moedas do jogo)!", 15, Color(1.0, 0.85, 0.5), 0))
	t.add_child(_label("Cara ou coroa: 47% de chance de DOBRAR a aposta.", 15, Color.WHITE, 0))
	var row := HBoxContainer.new()
	for bet in [10, 50, 100, 500]:
		var b := Button.new()
		b.text = "Apostar $%d" % bet
		b.disabled = GameState.coins < bet
		var amount: int = bet
		b.pressed.connect(func() -> void:
			var win := GameState.gamble_coins(amount)
			Sfx.play("coin" if win else "fail")
			toast(("Ganhou +$%d!" % amount) if win else ("Perdeu $%d..." % amount), GOLD if win else Color(1.0, 0.5, 0.5))
			_refresh_menu())
		row.add_child(b)
	t.add_child(row)
	t.add_child(_label("Aposte um peixe da mochila: 50% de render o TRIPLO do valor, 50% de perdê-lo.", 15, Color.WHITE, 0))
	if GameState.inventory.is_empty():
		t.add_child(_label("(mochila vazia)", 14, Color(0.6, 0.6, 0.6), 0))
	for i in GameState.inventory.size():
		var e: Dictionary = GameState.inventory[i]
		var fr := HBoxContainer.new()
		var nm := _label("%s  %.2f kg  ($%d)" % [FishDB.data(e["species"])["name"], e["weight"], int(e["value"] * _sale_mult())], 15, FishDB.rarity_color(e["species"]), 0)
		nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		fr.add_child(nm)
		var fb := Button.new()
		fb.text = "Apostar peixe"
		var idx := i
		fb.pressed.connect(func() -> void:
			var got := GameState.gamble_fish(idx)
			Sfx.play("coin" if got > 0 else "fail")
			toast(("O peixe rendeu $%d!" % got) if got > 0 else "Você perdeu o peixe...", GOLD if got > 0 else Color(1.0, 0.5, 0.5))
			_refresh_menu())
		fr.add_child(fb)
		t.add_child(fr)

func _tab_rods(shop: bool) -> void:
	var gear := _tab("Varas" if shop else "Varas")
	for t in GameState.RODS.size():
		var r: Dictionary = GameState.RODS[t]
		var row := HBoxContainer.new()
		var info := _label("%s\nAlcance %dm · Resistência %.1f · Recolhimento %.2f · Sorte +%d%%" % [r["name"], int(r["cast_range"]), r["strength"], r["reel"], int(float(r["luck"]) * 100)], 15, r["color"].lightened(0.35), 0)
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(info)
		var b := Button.new()
		var tier := t
		if t in GameState.owned_rods:
			b.text = "Equipada" if t == GameState.rod_tier else "Equipar"
			b.disabled = t == GameState.rod_tier
			b.pressed.connect(func() -> void:
				GameState.equip_rod(tier)
				refresh_hotbar()
				_refresh_menu())
		else:
			b.text = "Comprar $%d (Nv %d)" % [r["price"], r["level"]]
			b.disabled = not shop or GameState.coins < int(r["price"]) or GameState.level < int(r["level"])
			b.pressed.connect(func() -> void:
				if GameState.buy_rod(tier):
					Sfx.play("coin")
					refresh_hotbar()
					_refresh_menu())
		row.add_child(b)
		gear.add_child(row)

func _touchify() -> void:
	if not touch_mode:
		return
	for b in menu_panel.find_children("*", "Button", true, false):
		(b as Button).custom_minimum_size = Vector2(0, 54)
		(b as Button).add_theme_font_size_override("font_size", 20)
	for e in menu_panel.find_children("*", "LineEdit", true, false):
		(e as LineEdit).custom_minimum_size = Vector2(0, 54)
		(e as LineEdit).add_theme_font_size_override("font_size", 20)

func _local_ips() -> String:
	var out: PackedStringArray = []
	for a in IP.get_local_addresses():
		if a.count(".") == 3 and not a.begins_with("127.") and not a.begins_with("169.254."):
			out.append(a)
	return ", ".join(out) if not out.is_empty() else "(não encontrado)"

func _build_net_tab() -> void:
	menu_title.text = "Multijogador cooperativo"
	var vb := _tab("Multijogador")
	vb.add_child(_label("Seu nome:", 16, Color.WHITE, 0))
	var name_e := LineEdit.new()
	name_e.text = Net.player_name
	name_e.max_length = 16
	name_e.editable = not Net.active
	name_e.text_changed.connect(func(t: String) -> void: Net.player_name = t)
	vb.add_child(name_e)
	if Net.active:
		var st := "Você é o ANFITRIÃO (porta %d)." % Net.PORT if Net.is_host else "Conectado à partida."
		vb.add_child(_label(st, 17, GOLD, 0))
		if Net.is_host:
			vb.add_child(_label("IP para os amigos (mesma rede Wi-Fi/LAN): " + _local_ips(), 15, Color(0.85, 0.95, 1.0), 0))
			vb.add_child(_label("Pela internet: libere a porta UDP %d no roteador (ou use uma VPN, como Tailscale/ZeroTier)." % Net.PORT, 14, Color(0.8, 0.8, 0.8), 0))
		vb.add_child(_label("Jogadores na ilha: %d" % Net.peer_count(), 16, Color.WHITE, 0))
		vb.add_child(_label("  • %s (você)" % Net.player_name, 15, Color(0.7, 1.0, 0.7), 0))
		for id in Net.names:
			vb.add_child(_label("  • %s" % Net.names[id], 15, Color.WHITE, 0))
		var leave := Button.new()
		leave.text = "Desconectar"
		leave.pressed.connect(func() -> void: Net.leave())
		vb.add_child(leave)
	else:
		var host_b := Button.new()
		host_b.text = "Hospedar partida (porta %d)" % Net.PORT
		host_b.pressed.connect(func() -> void: Net.host())
		vb.add_child(host_b)
		vb.add_child(_label("Ou entre na partida de um amigo:", 16, Color.WHITE, 0))
		var ip_e := LineEdit.new()
		ip_e.text = _net_ip
		ip_e.placeholder_text = "IP do anfitrião, ex.: 192.168.0.10"
		ip_e.text_changed.connect(func(t: String) -> void: _net_ip = t)
		vb.add_child(ip_e)
		var join_b := Button.new()
		join_b.text = "Entrar"
		join_b.pressed.connect(func() -> void: Net.join(_net_ip))
		vb.add_child(join_b)
	vb.add_child(_label("Em cooperativo todos veem a mesma ilha, os outros jogadores, os tiros e os avisos de captura. Peixes, dinheiro e mochila são individuais.", 13, Color(0.75, 0.75, 0.75), 0))


# ------------------------------------------------------------------ história: interface

func _build_story_ui() -> void:
	# objetivo atual (canto superior esquerdo)
	obj_panel = PanelContainer.new()
	obj_panel.add_theme_stylebox_override("panel", _style(Color(0, 0, 0, 0.5), 8))
	obj_panel.position = Vector2(14, 150 if touch_mode else 38)
	obj_panel.custom_minimum_size = Vector2(330, 0)
	obj_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(obj_panel)
	var ov := VBoxContainer.new()
	ov.mouse_filter = Control.MOUSE_FILTER_IGNORE
	obj_panel.add_child(ov)
	obj_chapter = _label("", 14, GOLD, 3)
	ov.add_child(obj_chapter)
	obj_text = _label("", 14, Color.WHITE, 3)
	obj_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	obj_text.custom_minimum_size = Vector2(310, 0)
	ov.add_child(obj_text)
	# radar / guia do objetivo (canto superior direito)
	radar = Control.new()
	radar.custom_minimum_size = Vector2(120, 130)
	radar.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	radar.position = Vector2(-140, 100 if touch_mode else 64)
	radar.size = Vector2(120, 130)
	radar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	radar.draw.connect(_draw_radar)
	root.add_child(radar)
	# barra do chefe (topo central)
	boss_panel = PanelContainer.new()
	boss_panel.add_theme_stylebox_override("panel", _style(Color(0, 0, 0, 0.55), 6))
	boss_panel.set_anchors_preset(Control.PRESET_CENTER_TOP)
	boss_panel.position = Vector2(-280, 14)
	boss_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	boss_panel.visible = false
	root.add_child(boss_panel)
	var bv := VBoxContainer.new()
	bv.mouse_filter = Control.MOUSE_FILTER_IGNORE
	boss_panel.add_child(bv)
	boss_name = _label("", 18, Color(1.0, 0.5, 0.4))
	boss_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	bv.add_child(boss_name)
	boss_bar = _bar(Vector2(560, 18), Color(0.85, 0.12, 0.12))
	bv.add_child(boss_bar["bg"])
	# flash de dano e tela de morte
	damage_flash = ColorRect.new()
	damage_flash.color = Color(0.8, 0.0, 0.0, 0.0)
	damage_flash.set_anchors_preset(Control.PRESET_FULL_RECT)
	damage_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(damage_flash)
	death_layer = ColorRect.new()
	death_layer.color = Color(0.35, 0.0, 0.0, 0.7)
	death_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	death_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	death_layer.visible = false
	root.add_child(death_layer)
	death_label = _label("VOCÊ MORREU", 48, Color(1, 0.8, 0.8), 8)
	death_label.set_anchors_preset(Control.PRESET_CENTER)
	death_label.grow_horizontal = Control.GROW_DIRECTION_BOTH
	death_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	death_label.position = Vector2(-300, -40)
	death_label.custom_minimum_size = Vector2(600, 0)
	death_layer.add_child(death_label)
	_build_dialogue()
	_build_pages()

func _build_dialogue() -> void:
	dlg_panel = PanelContainer.new()
	dlg_panel.add_theme_stylebox_override("panel", _style(Color(0.04, 0.06, 0.1, 0.94), 14, GOLD, 2))
	dlg_panel.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	dlg_panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	dlg_panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	dlg_panel.position = Vector2(-380, -30)
	dlg_panel.custom_minimum_size = Vector2(760, 0)
	dlg_panel.visible = false
	root.add_child(dlg_panel)
	var v := VBoxContainer.new()
	dlg_panel.add_child(v)
	dlg_name = _label("", 20, GOLD, 0)
	v.add_child(dlg_name)
	dlg_text = _label("", 19, Color.WHITE, 0)
	dlg_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	dlg_text.custom_minimum_size = Vector2(730, 80)
	v.add_child(dlg_text)
	dlg_btn = Button.new()
	dlg_btn.text = "Continuar  ▶"
	dlg_btn.custom_minimum_size = Vector2(0, 52 if touch_mode else 36)
	dlg_btn.pressed.connect(_dlg_next)
	v.add_child(dlg_btn)

func _build_pages() -> void:
	pages_layer = ColorRect.new()
	pages_layer.color = Color(0.02, 0.03, 0.06, 1.0)
	pages_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	pages_layer.visible = false
	root.add_child(pages_layer)
	var v := VBoxContainer.new()
	v.set_anchors_preset(Control.PRESET_CENTER)
	v.grow_horizontal = Control.GROW_DIRECTION_BOTH
	v.grow_vertical = Control.GROW_DIRECTION_BOTH
	v.custom_minimum_size = Vector2(900, 0)
	v.position = Vector2(-450, -100)
	pages_layer.add_child(v)
	pages_label = _label("", 26, Color(0.95, 0.95, 1.0), 0)
	pages_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	pages_label.custom_minimum_size = Vector2(880, 160)
	pages_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(pages_label)
	var b := Button.new()
	b.text = "Continuar  ▶"
	b.custom_minimum_size = Vector2(0, 56)
	b.pressed.connect(_pages_next)
	v.add_child(b)

func _start_intro() -> void:
	Story.start_intro(func() -> void:
		Story.advance(0))

func _refresh_story() -> void:
	if obj_text == null:
		return
	obj_chapter.text = Story.chapter_name()
	obj_text.text = Story.objective()
	obj_panel.visible = true

func set_health(hp: float, max_hp: float) -> void:
	_set_bar(hp_bar, hp / max_hp)
	hp_label.text = "♥ %d" % int(ceilf(hp))

func flash_damage() -> void:
	damage_flash.color = Color(0.85, 0.0, 0.0, 0.45)
	var tw := damage_flash.create_tween()
	tw.tween_property(damage_flash, "color:a", 0.0, 0.5)

func show_death(lost: int) -> void:
	death_label.text = "VOCÊ MORREU\n(-$%d)" % lost
	death_layer.visible = true

func hide_death() -> void:
	death_layer.visible = false

func set_boss_bar(nm: String, frac: float) -> void:
	if frac < 0.0:
		boss_panel.visible = false
		return
	boss_name.text = nm
	_set_bar(boss_bar, frac)
	boss_panel.visible = true

# --- diálogo
func show_dialogue(speaker: String, lines: Array, after: Callable) -> void:
	dlg_name.text = speaker
	dlg_lines = lines
	dlg_index = 0
	dlg_after = after
	dlg_text.text = String(lines[0])
	dlg_btn.text = "Continuar  ▶" if lines.size() > 1 else "Fechar"
	dlg_panel.visible = true
	dlg_open = true
	menu_toggled.emit(true)
	Sfx.play("reel", -8.0, 1.4)

func _dlg_next() -> void:
	dlg_index += 1
	if dlg_index < dlg_lines.size():
		dlg_text.text = String(dlg_lines[dlg_index])
		dlg_btn.text = "Continuar  ▶" if dlg_index < dlg_lines.size() - 1 else "Fechar"
		return
	dlg_panel.visible = false
	dlg_open = false
	menu_toggled.emit(false)
	if dlg_after.is_valid():
		dlg_after.call()

# --- páginas da introdução
var _pages: Array = []
var _page_i := 0
var _pages_after: Callable

func show_pages(lines: Array, after: Callable) -> void:
	_pages = lines
	_page_i = 0
	_pages_after = after
	pages_label.text = String(lines[0])
	pages_layer.visible = true
	menu_toggled.emit(true)

func _pages_next() -> void:
	_page_i += 1
	if _page_i < _pages.size():
		pages_label.text = String(_pages[_page_i])
		return
	pages_layer.visible = false
	menu_toggled.emit(false)
	if _pages_after.is_valid():
		_pages_after.call()

# --- créditos
func show_credits() -> void:
	if credits_layer != null:
		credits_layer.queue_free()
	credits_layer = ColorRect.new()
	credits_layer.color = Color(0.0, 0.02, 0.06, 1.0)
	credits_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(credits_layer)
	menu_toggled.emit(true)
	Sfx.play("catch")
	var box := VBoxContainer.new()
	box.custom_minimum_size = Vector2(900, 0)
	box.add_theme_constant_override("separation", 22)
	credits_layer.add_child(box)
	var lines := [
		["FISH IT", 56, GOLD],
		["Você deixou o arquipélago caótico para trás", 24, Color.WHITE],
		["e navegou, finalmente, de volta ao continente.", 24, Color.WHITE],
		["", 20, Color.WHITE],
		["Ilha 1 — o Farol: Caranguejo‑Aranha", 22, Color(0.8, 0.9, 1.0)],
		["Ilha 2 — a Floresta: Piranha Gigante", 22, Color(0.8, 0.9, 1.0)],
		["Ilha 3 — Tropical: Baiacu Gigante", 22, Color(0.8, 0.9, 1.0)],
		["Ilha 4 — os Penhascos: Albatroz Gigante", 22, Color(0.8, 0.9, 1.0)],
		["Ilha 5 — o Vulcão: Baleia‑da‑Groenlândia e Baleia Mutante de Magma", 22, Color(0.8, 0.9, 1.0)],
		["", 20, Color.WHITE],
		["Peixes capturados: %d" % GameState.total_caught, 24, Color(0.6, 1.0, 0.7)],
		["Dinheiro: $%d" % GameState.coins, 24, Color(0.6, 1.0, 0.7)],
		["", 20, Color.WHITE],
		["Obrigado por jogar!", 34, GOLD],
		["Você pode continuar no mesmo save para completar o registro de peixes.", 20, Color(0.85, 0.85, 0.85)],
	]
	for l in lines:
		var lab := _label(String(l[0]), int(l[1]), l[2], 0)
		lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		lab.custom_minimum_size = Vector2(900, 0)
		box.add_child(lab)
	var btn := Button.new()
	btn.text = "Continuar jogando"
	btn.custom_minimum_size = Vector2(0, 56)
	btn.pressed.connect(_end_credits)
	box.add_child(btn)
	var vp := root.size
	box.position = Vector2((vp.x - 900.0) * 0.5, vp.y)
	var tw := box.create_tween()
	tw.tween_property(box, "position:y", vp.y * 0.12, 9.0).set_trans(Tween.TRANS_SINE)

func _end_credits() -> void:
	if credits_layer:
		credits_layer.queue_free()
		credits_layer = null
	Story.finish_game()
	var p := _player_node()
	if p:
		if p.vehicle != null:
			p.vehicle.leave(true)
		p.global_position = Story.zones.get("spawn1", Vector3(0, 3, 0))
	menu_toggled.emit(false)

# --- radar / guia
func _draw_radar() -> void:
	var player := _player_node()
	var cam := get_viewport().get_camera_3d()
	var target := Story.objective_pos()
	var c := Vector2(60, 58)
	radar.draw_circle(c, 46.0, Color(0, 0, 0, 0.45))
	radar.draw_arc(c, 46.0, 0.0, TAU, 40, Color(1, 1, 1, 0.5), 2.0)
	var font := ThemeDB.fallback_font
	radar.draw_string(font, Vector2(0, 124), "RADAR" if Story.has_radar() else "GUIA", HORIZONTAL_ALIGNMENT_CENTER, 120.0, 13, Color(0.7, 1.0, 0.8))
	if player == null or cam == null or target == Vector3.INF:
		radar.draw_string(font, Vector2(0, 62), "—", HORIZONTAL_ALIGNMENT_CENTER, 120.0, 20, Color(1, 1, 1, 0.6))
		return
	var d := target - player.global_position
	d.y = 0.0
	var b := cam.global_transform.basis
	var fwd := Vector3(-b.z.x, 0, -b.z.z).normalized()
	var right := Vector3(b.x.x, 0, b.x.z).normalized()
	var rel := atan2(d.dot(right), d.dot(fwd))
	var tip := c + Vector2(sin(rel), -cos(rel)) * 36.0
	var left := c + Vector2(sin(rel - 2.5), -cos(rel - 2.5)) * 16.0
	var rgt := c + Vector2(sin(rel + 2.5), -cos(rel + 2.5)) * 16.0
	radar.draw_colored_polygon(PackedVector2Array([tip, left, c, rgt]), Color(1.0, 0.85, 0.25, 0.95))
	radar.draw_string(font, Vector2(0, 112), "%d m" % int(d.length()), HORIZONTAL_ALIGNMENT_CENTER, 120.0, 14, Color.WHITE)
