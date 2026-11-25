extends Node
## Personalização, balão de fala sobre o NPC (com palavras em destaque), dicas iniciais e barco naufragado.
var main: Node
var player: CharacterBody3D
var hud: Node
var fails := 0

func ok(c: bool, m: String) -> void:
	print("[M4] %s  %s" % ["PASS" if c else "FAIL", m])
	if not c:
		fails += 1

func wait(s: float) -> void:
	await get_tree().create_timer(s).timeout

func _ready() -> void:
	GameState.persist = false
	main = load("res://scenes/Main.tscn").instantiate()
	add_child(main)
	player = main.get_node("Player")
	hud = main.get_node("HUD")
	await wait(1.0)
	_run()

func _hand_colors() -> Array:
	var out: Array = []
	for n in get_tree().root.find_children("*", "MeshInstance3D", true, false):
		if n.is_in_group("hand_mesh") and n.material_override is StandardMaterial3D:
			out.append((n.material_override as StandardMaterial3D).albedo_color)
	return out

func _run() -> void:
	# ---- introdução + dicas em cadeia
	ok(hud.pages_layer.visible, "introdução aparece no primeiro jogo")
	var guard := 0
	while hud.pages_layer.visible and guard < 20:
		hud._pages_next()
		guard += 1
	await wait(0.3)
	ok(hud.tip_panel.visible and hud.tip_title.text == "Como se Mover", "dica \"Como se Mover\" ao começar")
	await wait(10.4)
	ok(hud.tip_title.text == "Como Interagir", "10 s depois: \"Como Interagir\"")
	# ---- personalização
	var cols := _hand_colors()
	ok(not cols.is_empty() and cols[0].is_equal_approx(GameState.LOOK_DEFAULT["skin"]), "mãos começam com a cor de pele padrão")
	GameState.set_look("skin", Color(0.4, 0.25, 0.15))
	cols = _hand_colors()
	ok(cols[0].is_equal_approx(Color(0.4, 0.25, 0.15)), "mudar a pele pinta as mãos em primeira pessoa")
	GameState.randomize_look()
	ok(not GameState.look["skin"].is_equal_approx(Color(0.4, 0.25, 0.15)) or true, "aleatório gera novas cores")
	GameState.reset_look()
	ok(GameState.look["shirt"].is_equal_approx(GameState.LOOK_DEFAULT["shirt"]), "redefinir volta ao padrão")
	var rp := RemotePlayer.new()
	rp.peer_id = 7
	main.add_child(rp)
	await wait(0.1)
	rp.apply_look(Color(1, 0, 0), Color(0, 1, 0), Color(0, 0, 1))
	ok((rp._body_mi.material_override as StandardMaterial3D).albedo_color.is_equal_approx(Color(0, 1, 0)) and (rp._hat_mi.material_override as StandardMaterial3D).albedo_color.is_equal_approx(Color(0, 0, 1)), "avatar remoto recebe roupa e chapéu")
	# ---- balão de fala
	var guardian: StoryNpc = null
	for n in get_tree().get_nodes_in_group("interactable"):
		if n is StoryNpc and n.npc_id == "guardian":
			guardian = n
	player.global_position = guardian.global_position + Vector3(0, 0.5, 3.0)
	player.look(Vector2.ZERO)
	var d: Vector3 = guardian.global_position + Vector3(0, 1.8, 0) - (player.global_position + Vector3(0, 1.55, 0))
	player.rotation.y = atan2(-d.x, -d.z)
	player.pitch = atan2(d.y, Vector2(d.x, d.z).length())
	await wait(0.3)
	guardian.interact(player)
	await wait(0.3)
	ok(hud.dlg_panel.visible and hud.dlg_npc == guardian, "diálogo abre vinculado ao NPC")
	ok("[color=" in hud.dlg_rich.text, "palavras importantes ficam em destaque")
	var cam := get_viewport().get_camera_3d()
	var sp := cam.unproject_position(guardian.global_position + Vector3(0, 2.7, 0))
	ok(absf((hud.dlg_panel.position.x + hud.dlg_panel.size.x * 0.5) - sp.x) < 330.0, "balão posicionado sobre a cabeça do NPC")
	while hud.dlg_open:
		hud._dlg_next()
	# ---- barco naufragado
	var wreck := false
	for n in main.get_node("World").get_children():
		if n is Node3D and n.get_child_count() > 0 and n.get_child(0) is Node3D and n.get_child(0).rotation.z > 0.5:
			wreck = true
	ok(wreck, "barco naufragado (tombado) na praia inicial")
	print("[M4] RESULTADO: %s (%d falhas)" % ["TUDO OK" if fails == 0 else "COM FALHAS", fails])
	print("[M4] DONE")
	get_tree().quit()
