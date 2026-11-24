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
	set_equipped(1)

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

func _refresh_status() -> void:
	coins_label.text = "$%d" % GameState.coins
	level_label.text = "Nível %d   (%d / %d XP)" % [GameState.level, GameState.xp, GameState.xp_needed()]
	_set_bar(xp_bar, float(GameState.xp) / float(GameState.xp_needed()))
	if ammo_label:
		ammo_label.text = "%d / %d" % [GameState.ammo_mag, GameState.ammo_reserve]

func _build_hotbar() -> void:
	var hb := HBoxContainer.new()
	hb.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	hb.grow_horizontal = Control.GROW_DIRECTION_BOTH
	hb.grow_vertical = Control.GROW_DIRECTION_BEGIN
	hb.position = Vector2(-80, -90)
	hb.add_theme_constant_override("separation", 10)
	hb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(hb)
	var names := ["1  Rifle", "2  Vara"]
	for i in 2:
		var p := PanelContainer.new()
		p.custom_minimum_size = Vector2(88, 64)
		p.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var v := VBoxContainer.new()
		v.alignment = BoxContainer.ALIGNMENT_CENTER
		v.mouse_filter = Control.MOUSE_FILTER_IGNORE
		p.add_child(v)
		var l := _label(names[i], 15)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(l)
		var sub := _label("", 13, Color(0.9, 0.9, 0.9))
		sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(sub)
		if i == 0:
			ammo_label = sub
		else:
			sub.text = "Bambu"
			sub.name = "RodSub"
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

func set_equipped(slot: int) -> void:
	_equipped = slot
	for i in slots.size():
		var on := i == slot - 1
		slots[i].add_theme_stylebox_override("panel", _style(Color(0.95, 0.75, 0.2, 0.35) if on else Color(0, 0, 0, 0.5), 6, GOLD if on else Color(1, 1, 1, 0.25), 2))
	var rs := slots[1].find_child("RodSub", true, false) as Label
	if rs:
		rs.text = String(GameState.rod()["name"]).replace("Vara de ", "").replace("Vara ", "")

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
	menu_title.text = "Loja do Capitão Maré   —   $%d" % GameState.coins if shop else "Mochila   —   $%d   ·   Nível %d" % [GameState.coins, GameState.level]
	# --- peixes
	var fish_tab := _tab("Vender" if shop else "Mochila")
	if GameState.inventory.is_empty():
		fish_tab.add_child(_label("Nenhum peixe na mochila. Lance a vara na água (tecla 2)!", 16, Color(0.85, 0.85, 0.85), 0))
	else:
		if shop:
			var sa := Button.new()
			var total := 0
			for e in GameState.inventory:
				total += int(e["value"])
			sa.text = "Vender tudo  ($%d)" % total
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
			row.add_child(_label("%.2f kg    $%d   " % [e["weight"], e["value"]], 16, Color.WHITE, 0))
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
	# --- registro
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
	# --- varas / munição
	var gear := _tab("Varas e munição" if shop else "Equipamento")
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
				set_equipped(_equipped)
				_refresh_menu())
		else:
			b.text = "Comprar $%d (Nv %d)" % [r["price"], r["level"]]
			b.disabled = not shop or GameState.coins < int(r["price"]) or GameState.level < int(r["level"])
			b.pressed.connect(func() -> void:
				if GameState.buy_rod(tier):
					Sfx.play("coin")
					set_equipped(_equipped)
					_refresh_menu())
		row.add_child(b)
		gear.add_child(row)
	var arow := HBoxContainer.new()
	var ai := _label("Munição do rifle: %d no pente · %d de reserva" % [GameState.ammo_mag, GameState.ammo_reserve], 16, Color.WHITE, 0)
	ai.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	arow.add_child(ai)
	if shop:
		var ab := Button.new()
		ab.text = "Comprar %d balas  $%d" % [GameState.AMMO_PACK, GameState.AMMO_PRICE]
		ab.disabled = GameState.coins < GameState.AMMO_PRICE
		ab.pressed.connect(func() -> void:
			if GameState.buy_ammo():
				Sfx.play("coin")
				_refresh_menu())
		arow.add_child(ab)
	gear.add_child(arow)
	menu_tabs.current_tab = clampi(prev, 0, menu_tabs.get_child_count() - 1)
	_touchify()

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

