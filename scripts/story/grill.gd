class_name Grill
extends Node3D
## Grelha (precisa do isqueiro do Tubarão‑Azul) ou cozinha de lava (sempre disponível, nunca queima).
## O valor do peixe sobe de 1x até 1,5x; na grelha, se passar do ponto ele QUEIMA e vale zero. Tire na hora certa!

var lava := false
var radius := 3.2
var enabled := true
var raw: Dictionary = {}
var t := 0.0
var _label: Label3D
var _fish: MeshInstance3D

const PEAK_T := 6.0
const BURN_T := 9.0

static func make(parent: Node, pos: Vector3, is_lava: bool = false) -> Grill:
	var g := Grill.new()
	g.lava = is_lava
	parent.add_child(g)
	g.global_position = pos
	return g

func _ready() -> void:
	add_to_group("interactable")
	if not lava:
		Props.box(self, Vector3(1.4, 0.7, 0.8), Vector3(0, 0.35, 0), Color(0.22, 0.22, 0.25), null, Vector3.ZERO, 0.5)
		Props.box(self, Vector3(1.3, 0.05, 0.7), Vector3(0, 0.72, 0), Color(0.45, 0.45, 0.5), null, Vector3.ZERO, 0.4)
		Props.add_fire(self, Vector3(0, 0.45, 0), 0.4, false)
	_fish = MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.2
	sm.height = 0.4
	sm.radial_segments = 8
	sm.rings = 4
	_fish.mesh = sm
	_fish.scale = Vector3(1.6, 0.6, 0.8)
	_fish.position = Vector3(0, 0.85 if not lava else 0.4, 0)
	_fish.visible = false
	add_child(_fish)
	_label = Label3D.new()
	_label.font_size = 44
	_label.pixel_size = 0.005
	_label.outline_size = 8
	_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_label.no_depth_test = true
	_label.position = Vector3(0, 1.8, 0)
	add_child(_label)

func _mult() -> float:
	var m := lerpf(1.0, 1.5, clampf(t / PEAK_T, 0.0, 1.0))
	if not lava and t > BURN_T:
		return 0.0
	return m

func _process(delta: float) -> void:
	if raw.is_empty():
		_label.text = ""
		_fish.visible = false
		return
	t += delta
	var m := _mult()
	_fish.visible = true
	var col := Color(0.95, 0.85, 0.7).lerp(Color(0.85, 0.55, 0.2), clampf(t / PEAK_T, 0.0, 1.0))
	if m <= 0.0:
		col = Color(0.05, 0.05, 0.05)
	_fish.material_override = Props.mat(col, 0.7)
	if m <= 0.0:
		_label.text = "QUEIMOU!"
		_label.modulate = Color(0.6, 0.6, 0.6)
	else:
		_label.text = "%.1fx" % m
		_label.modulate = Color(0.4, 1.0, 0.4).lerp(Color(1.0, 0.9, 0.2), clampf((t - 3.0) / (PEAK_T - 3.0), 0.0, 1.0))
		if not lava and t > PEAK_T + 1.2:
			_label.modulate = Color(1.0, 0.35, 0.2)

func get_prompt() -> String:
	if not raw.is_empty():
		return "Tirar o peixe da %s (%s)" % ["lava" if lava else "grelha", _label.text]
	if not lava and not Story.flags.get("lighter", false):
		return "Grelha apagada (precisa do isqueiro do Tubarão‑Azul)"
	return "Cozinhar um peixe na %s" % ("lava (sempre 1,5x)" if lava else "grelha")

func interact(_p: Node) -> void:
	if not raw.is_empty():
		var m := _mult()
		if m <= 0.0:
			Sfx.play("fail")
			GameState.notify.emit("O peixe queimou e não vale nada!")
		else:
			raw["cooked"] = m
			raw["value"] = int(int(raw["value"]) * m)
			GameState.inventory.append(raw)
			GameState.inventory_changed.emit()
			Sfx.play("coin")
			GameState.notify.emit("Peixe cozido: %.1fx (vale $%d)" % [m, int(raw["value"])])
		raw = {}
		return
	if not lava and not Story.flags.get("lighter", false):
		GameState.notify.emit("A grelha está apagada. Derrote o Tubarão‑Azul para ganhar o isqueiro.")
		return
	var best := -1
	for i in GameState.inventory.size():
		var e: Dictionary = GameState.inventory[i]
		if float(e.get("cooked", 1.0)) <= 1.0 and (best < 0 or int(e["value"]) > int(GameState.inventory[best]["value"])):
			best = i
	if best < 0:
		GameState.notify.emit("Você não tem peixe cru para cozinhar.")
		return
	raw = GameState.inventory[best]
	GameState.inventory.remove_at(best)
	GameState.inventory_changed.emit()
	t = 0.0
	Sfx.play("splash", -8.0, 1.6)
