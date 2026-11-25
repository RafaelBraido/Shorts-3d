extends Node
## Modo história de Fish It: 5 ilhas, 5 chefes e o final. Autoload "Story".
##
## Estrutura: "chapter" (1..5 = ilha atual da missão, 6 = história concluída) e "step" (passo dentro do capítulo).
## Os NPCs chamam talk(npc_id); eventos do jogo (pesca, itens, chefes) chamam on_*() e check_progress()
## avança os passos. Os pontos do mundo (NPCs, zonas) são registrados em "zones" por StoryWorld.

signal changed
signal dialogue_requested(speaker: String, lines: Array, after: Callable)
signal pages_requested(lines: Array, after: Callable)
signal ending_started

const CHAPTER_NAMES := ["", "Capítulo 1 — O Farol", "Capítulo 2 — A Floresta", "Capítulo 3 — Ilha Tropical", "Capítulo 4 — Os Penhascos", "Capítulo 5 — O Vulcão", "Epílogo"]

const INTRO_PAGES := [
	"Tudo começou do jeito mais irresponsável possível: você e a turma passeando de barco, bebendo, rindo alto... e ninguém segurando o leme.",
	"O barco bateu nas pedras. O mar engoliu tudo — o motor, as armas, o dinheiro e a bebida (que dó).",
	"Você acorda numa praia de uma ilha minúscula, sem recursos, sem armas e sem barco.",
	"Há cinco ilhas neste arquipélago. Em cada uma, gente esquisita pede favores e um monstro colossal manda em tudo.",
	"O plano: aprender a pescar, vender o que pegar, comprar armas e explosivos, derrotar o monstro de cada ilha e trazer um pedaço dele como prova.",
	"Só assim o radar mostrará o caminho até a próxima ilha — e, no fim, de volta para casa, no continente.",
]

var chapter := 1
var step := 0
var flags: Dictionary = {}
var items: Dictionary = {}
var intro_done := false
var ended := false
var volcano_fish := 0
var carrying := ""                  ## "whale_carcass" enquanto o jogador carrega a carcaça
var zones: Dictionary = {}          ## nome -> Vector3 (registrado por StoryWorld)
var world: Node = null
var talk_target: Node3D = null
var boss: Node = null               ## chefe ativo
var lures_used: Dictionary = {}

func _ready() -> void:
	from_dict(GameState.pending_story)

# ------------------------------------------------------------------ persistência

func to_dict() -> Dictionary:
	return {"chapter": chapter, "step": step, "flags": flags, "items": items, "intro_done": intro_done,
		"ended": ended, "volcano_fish": volcano_fish, "carrying": carrying}

func from_dict(d: Dictionary) -> void:
	if d.is_empty():
		return
	chapter = clampi(int(d.get("chapter", 1)), 1, 6)
	step = int(d.get("step", 0))
	flags = d.get("flags", {})
	items = d.get("items", {})
	intro_done = bool(d.get("intro_done", false))
	ended = bool(d.get("ended", false))
	volcano_fish = int(d.get("volcano_fish", 0))
	carrying = String(d.get("carrying", ""))

# ------------------------------------------------------------------ itens

func count(id: String) -> int:
	return int(items.get(id, 0))

func has(id: String) -> bool:
	return count(id) > 0

func add_item(id: String, n: int = 1) -> void:
	items[id] = count(id) + n
	GameState.notify.emit("Item obtido: %s%s" % [item_name(id), " x%d" % n if n > 1 else ""])
	check_progress()
	changed.emit()
	GameState.save_game()

func take_item(id: String, n: int = 1) -> void:
	items[id] = maxi(count(id) - n, 0)
	changed.emit()

func item_name(id: String) -> String:
	return {"beer": "Lata de cerveja", "empty_can": "Lata vazia (isca)", "crab_shell": "Carapaça do Caranguejo‑Aranha",
		"leech": "Sanguessuga", "leech_bait": "Isca especial de sanguessuga", "piranha_skeleton": "Esqueleto da Piranha Gigante",
		"carrot": "Cenoura (isca)", "puffer_fin": "Barbatana do Baiacu Gigante", "albatross_head": "Cabeça do Albatroz Gigante",
		"fish_bucket": "Balde de Peixes (isca)", "whale_carcass": "Carcaça da Baleia", "mutant_fin": "Barbatana da Baleia Mutante",
		"bait_hot": "Isca de cachorro-quente", "bait_std": "Isca de chefe padrão", "bait_pro": "Isca de chefe profissional", "bait_sci": "Isca científica", "shark_fin": "Barbatana do Tubarão‑Azul"}.get(id, id)

func is_fish_in_bag(species: String) -> bool:
	for e in GameState.inventory:
		if e["species"] == species:
			return true
	return false

func remove_fish_from_bag(species: String) -> void:
	for i in GameState.inventory.size():
		if GameState.inventory[i]["species"] == species:
			GameState.inventory.remove_at(i)
			GameState.inventory_changed.emit()
			return

# ------------------------------------------------------------------ objetivo e guia

func chapter_name() -> String:
	return CHAPTER_NAMES[clampi(chapter, 1, 6)]

func objective() -> String:
	if ended:
		return "História concluída! Continue pescando e complete o registro de peixes."
	match chapter:
		1:
			return ["Fale com o Guardião do Farol (no banco, perto do farol).",
				"Pesque 3 peixes com a vara (tecla 2): lance em água funda, fisgue e recolha. Venda na loja.",
				"Volte ao Guardião do Farol.",
				"Compre uma lata de cerveja ($12) na loja do Capitão Maré e entregue ao Guardião.",
				"Compre uma arma branca na loja (soco inglês $24 ou faca $45). Lance a lata vazia na Baía do Caranguejo e fisgue o Caranguejo‑Aranha. Deixe-o se atordoar e golpeie!",
				"Entregue a carapaça ao Guardião.",
				"Compre o Radar ($10) na loja do Capitão Maré."][step]
		2:
			return ["Navegue com o barco até a Ilha da Floresta e fale com Marina, à beira do lago.",
				"Colete 3 sanguessugas espalhadas pela ilha (%d/3)." % count("leech"),
				"Entregue as sanguessugas a Marina.",
				"Compre armas na loja (escopeta, dinamite). Lance a isca no lago e derrote a Piranha Gigante!",
				"Entregue o esqueleto da piranha a Marina."][step]
		3:
			return ["Vá à Ilha Tropical e fale com o Turista (debaixo da árvore). Opcional: o Mestre do Churrasco.",
				"Pesque um Cavalo‑Marinho (espécie ameaçada) perto da ilha.",
				"Entregue o Cavalo‑Marinho ao Turista.",
				"Lance a cenoura na água perto da ilha e derrote o Baiacu Gigante (use a submetralhadora!).",
				"Entregue a barbatana do Baiacu ao Turista."][step]
		4:
			return ["Vá à Ilha dos Penhascos e fale com o Vendedor (dentro da loja).",
				"Pesque um Atum‑azul (precisa da isca de chefe profissional da loja, $1.200).",
				"Deixe o atum como oferenda no centro da ilha (marcador) e derrote o Albatroz Gigante com o sniper!",
				"Entregue a cabeça do Albatroz ao Vendedor."][step]
		5:
			return ["Vá à Ilha do Vulcão e fale com o Cientista (acampamento militar).",
				"Pesque 5 peixes nas águas ao redor do vulcão (%d/5)." % volcano_fish,
				"Entregue os 5 peixes ao Cientista.",
				"Lance o Balde de Peixes no mar e derrote a Baleia‑da‑Groenlândia.",
				"Pegue a carcaça (E), carregue até o topo do vulcão e jogue na lava.",
				"Derrote a Baleia Mutante de Magma (use o fuzil e dinamite)!",
				"Entregue a barbatana da Baleia Mutante ao Cientista.",
				"Embarque na lancha militar preta (cais do vulcão) e navegue de volta ao continente."][step]
	return ""

## Posição do objetivo atual (para a seta do radar); Vector3.INF se não houver.
func objective_pos() -> Vector3:
	var z := zones
	var key := ""
	match chapter:
		1: key = ["guardian", "dock", "guardian", "shop", "crab", "guardian", "shop"][step]
		2: key = ["marina", "island2", "marina", "lake", "marina"][step]
		3: key = ["tourist", "island3", "tourist", "island3", "tourist"][step]
		4: key = ["vendor", "dock", "altar", "vendor"][step]
		5: key = ["scientist", "island5", "scientist", "island5", "lava", "lava", "scientist", "volcano_dock"][step]
	if ended or key == "" or not z.has(key):
		return Vector3.INF
	return z[key]

func has_radar() -> bool:
	return flags.get("radar", false)

func island_name_for_target() -> String:
	return Terrain.ISLANDS[clampi(chapter - 1, 0, 4)]["name"]

func advance(new_step: int, toast_msg: String = "") -> void:
	step = new_step
	if toast_msg != "":
		GameState.notify.emit(toast_msg)
	GameState.notify.emit("Nova missão: " + objective())
	changed.emit()
	GameState.save_game()

func next_chapter(msg: String) -> void:
	chapter += 1
	step = 0
	GameState.notify.emit(msg)
	if chapter <= 5:
		GameState.notify.emit("%s — a nova ilha apareceu no radar!" % chapter_name())
	changed.emit()
	GameState.save_game()

# ------------------------------------------------------------------ progresso automático

func check_progress() -> void:
	if ended:
		return
	match [chapter, step]:
		[1, 1]:
			if GameState.total_caught >= 3:
				advance(2, "Você pescou o bastante! Volte ao Guardião.")
		[1, 4]:
			if has("crab_shell"):
				advance(5)
		[1, 6]:
			if has_radar():
				next_chapter("Radar instalado! Próximo destino: Ilha da Floresta.")
		[2, 1]:
			if count("leech") >= 3:
				advance(2, "Sanguessugas suficientes! Volte a Marina.")
		[2, 3]:
			if has("piranha_skeleton"):
				advance(4)
		[3, 1]:
			if is_fish_in_bag("cavalo_marinho"):
				advance(2, "Você pescou um Cavalo‑Marinho!")
		[3, 3]:
			if has("puffer_fin"):
				advance(4)
		[4, 1]:
			if is_fish_in_bag("atum"):
				advance(2, "Você pescou um Atum!")
		[4, 2]:
			if has("albatross_head"):
				advance(3)
		[5, 1]:
			if volcano_fish >= 5:
				advance(2, "Cinco peixes do vulcão! Leve ao Cientista.")
		[5, 3]:
			if has("whale_carcass"):
				advance(4)
		[5, 5]:
			if has("mutant_fin"):
				advance(6)

# ------------------------------------------------------------------ eventos do jogo

func on_fish_caught(species: String, pos: Vector3) -> void:
	if chapter == 5 and step == 1 and zones.has("island5") and Vector2(pos.x, pos.z).distance_to(Vector2(zones["island5"].x, zones["island5"].z)) < 80.0:
		volcano_fish += 1
		GameState.notify.emit("Peixe do vulcão %d/5" % volcano_fish)
	check_progress()
	changed.emit()

func wants_seahorse(pos: Vector3) -> bool:
	return chapter == 3 and step == 1 and zones.has("island3") and Vector2(pos.x, pos.z).distance_to(Vector2(zones["island3"].x, zones["island3"].z)) < 75.0

## Chamado quando a boia pousa na água: devolve o id do chefe-isca se as condições da missão forem atendidas.
func lure_cast(pos: Vector3) -> String:
	if boss != null and is_instance_valid(boss):
		return ""
	var p2 := Vector2(pos.x, pos.z)
	match [chapter, step]:
		[1, 4]:
			if has("empty_can") and zones.has("crab") and p2.distance_to(Vector2(zones["crab"].x, zones["crab"].z)) < 30.0:
				return "crab"
		[2, 3]:
			if has("leech_bait") and p2.distance_to(Terrain.LAKE_CENTER) < Terrain.LAKE_R:
				return "piranha"
		[3, 3]:
			if has("carrot") and p2.distance_to(Terrain.island_center(2)) < 70.0:
				return "puffer"
		[5, 3]:
			if has("fish_bucket") and p2.distance_to(Terrain.island_center(4)) < 85.0:
				return "whale"
	# mini-chefe opcional: Tubarão‑Azul (isca de chefe padrão, na Ilha Tropical) -> isqueiro
	if has("bait_std") and not flags.get("lighter", false) and p2.distance_to(Terrain.island_center(2)) < 75.0 and Terrain.depth_at(pos.x, pos.z) > 2.5:
		return "blue_shark"
	return ""

func lure_item(boss_id: String) -> String:
	return {"crab": "empty_can", "piranha": "leech_bait", "puffer": "carrot", "whale": "fish_bucket", "blue_shark": "bait_std"}.get(boss_id, "")

## A isca foi fisgada com sucesso (minigame vencido): o chefe emerge.
func on_lure_success(boss_id: String, water_pos: Vector3) -> void:
	take_item(lure_item(boss_id))
	GameState.notify.emit("A criatura emergiu!")
	spawn_boss(boss_id, water_pos)

func spawn_boss(boss_id: String, pos: Vector3) -> void:
	if world == null:
		return
	if boss_id == "piranha":
		for i in 4:
			var m := Boss.new()
			m.setup("piranha_minion")
			world.add_child(m)
			m.global_position = Vector3(pos.x + randf_range(-3, 3), -1.2, pos.z + randf_range(-3, 3))
			m.died.connect(_on_boss_died)
	var b := Boss.new()
	b.setup(boss_id)
	world.add_child(b)
	b.global_position = pos
	b.died.connect(_on_boss_died)
	b.start_fight()
	boss = b

func _on_boss_died(b: Node) -> void:
	if b.id == "piranha_minion":
		return
	if boss == b:
		boss = null
	GameState.add_coins(int(b.reward))
	GameState.add_xp(int(b.reward / 2))
	GameState.notify.emit("%s derrotado! +$%d" % [b.display_name, int(b.reward)])
	Sfx.play("catch")
	var drop_item: String = {"crab": "crab_shell", "piranha": "piranha_skeleton", "puffer": "puffer_fin", "albatross": "albatross_head",
		"whale": "whale_carcass", "mutant": "mutant_fin", "blue_shark": "shark_fin"}.get(b.id, "")
	if b.id == "piranha":
		for m in get_tree().get_nodes_in_group("targets"):
			if m is Boss and m.id == "piranha_minion":
				m.queue_free()
	if drop_item != "":
		BossDrop.spawn(world, b.drop_position(), drop_item)

func offer_tuna() -> void:
	## Oferenda no centro da Ilha dos Penhascos: consome o atum e chama o Albatroz.
	if chapter == 4 and step == 2 and is_fish_in_bag("atum") and (boss == null or not is_instance_valid(boss)):
		remove_fish_from_bag("atum")
		GameState.notify.emit("O cheiro de atum se espalha pelo vento...")
		spawn_boss("albatross", zones["altar"] + Vector3(0, 22, 0))
	elif chapter == 4 and step == 2:
		GameState.notify.emit("Você precisa de um atum na mochila para a oferenda.")

func throw_carcass_into_lava() -> void:
	if carrying == "whale_carcass" and chapter == 5 and step == 4:
		carrying = ""
		take_item("whale_carcass")
		GameState.notify.emit("A carcaça cai na lava... o magma ferve!")
		advance(5)
		spawn_boss("mutant", zones["lava"] + Vector3(0, 0.5, 0))
	else:
		GameState.notify.emit("Você precisa carregar a carcaça da baleia até aqui.")

func pick_up_carcass() -> void:
	carrying = "whale_carcass"
	add_item("whale_carcass")
	GameState.notify.emit("Carregando a carcaça (você anda devagar). Leve ao topo do vulcão!")

func respawn_pos() -> Vector3:
	var k := "spawn%d" % clampi(chapter, 1, 5)
	if zones.has(k) and (chapter == 1 or has_radar()):
		return zones[k]
	return zones.get("spawn1", Vector3(0, 3, 0))

# ------------------------------------------------------------------ compras especiais (loja)

func buy_beer() -> bool:
	if GameState.coins < 12:
		return false
	GameState.coins -= 12
	GameState.coins_changed.emit(GameState.coins)
	add_item("beer")
	return true

func buy_radar() -> bool:
	if has_radar() or GameState.coins < 10:
		return false
	GameState.coins -= 10
	GameState.coins_changed.emit(GameState.coins)
	flags["radar"] = true
	GameState.notify.emit("Radar comprado!")
	check_progress()
	changed.emit()
	GameState.save_game()
	return true

const BAITS := [
	{"id": "bait_hot", "tier": 1, "name": "Isca de cachorro-quente", "price": 15, "desc": "Atrai criaturas mais valiosas (baiacu, dourado)."},
	{"id": "bait_std", "tier": 2, "name": "Isca de chefe padrão", "price": 280, "desc": "Barracudas e o mini-chefe Tubarão‑Azul (Ilha Tropical)."},
	{"id": "bait_pro", "tier": 3, "name": "Isca de chefe profissional", "price": 1200, "desc": "Atum e peixe-lua (necessária para o atum do Albatroz)."},
	{"id": "bait_sci", "tier": 4, "name": "Isca científica", "price": 5800, "desc": "Criaturas lendárias."},
]

func buy_bait(tier: int) -> bool:
	for b in BAITS:
		if int(b["tier"]) == tier:
			if GameState.coins < int(b["price"]):
				return false
			GameState.coins -= int(b["price"])
			GameState.coins_changed.emit(GameState.coins)
			add_item(String(b["id"]))
			return true
	return false

## Maior tier de isca disponível (0 = isca iniciante, de graça).
func best_bait_tier() -> int:
	var best := 0
	for b in BAITS:
		if has(String(b["id"])):
			best = maxi(best, int(b["tier"]))
	return best

func bait_id_for_tier(tier: int) -> String:
	for b in BAITS:
		if int(b["tier"]) == tier:
			return String(b["id"])
	return ""

# ------------------------------------------------------------------ diálogos

func start_intro(after: Callable) -> void:
	intro_done = true
	pages_requested.emit(INTRO_PAGES, after)

func talk(npc_id: String) -> void:
	var d := _dialogue(npc_id)
	dialogue_requested.emit(d["speaker"], d["lines"], d.get("after", Callable()))

func _d(speaker: String, lines: Array, after: Callable = Callable()) -> Dictionary:
	return {"speaker": speaker, "lines": lines, "after": after}

func _dialogue(npc: String) -> Dictionary:
	match npc:
		"guardian": return _talk_guardian()
		"marina": return _talk_marina()
		"tourist": return _talk_tourist()
		"bbq": return _talk_bbq()
		"vendor": return _talk_vendor()
		"scientist": return _talk_scientist()
	return _d("???", ["..."])

func _talk_guardian() -> Dictionary:
	var who := "Guardião do Farol"
	if chapter > 1:
		return _d(who, ["Você já passou por maus bocados e voltou. Cuide do meu barco... ou melhor, do seu!", "O mar lá fora é perigoso. Boa pesca, forasteiro."])
	match step:
		0: return _d(who, ["Ei, acordou! O mar jogou você na minha praia. Barco, bebida e zero juízo, né?",
				"Sou o Guardião do Farol. Sem dinheiro, sem armas e sem barco, só existe um jeito de sobreviver aqui: pescar.",
				"Equipe a vara (tecla 2), segure o clique para lançar na água funda e espere. Quando a boia afundar, clique para fisgar; depois segure para recolher e SOLTE quando o peixe puxar.",
				"Pesque 3 peixes e venda na loja do Capitão Maré. Também ajuda matar a fome com os crustáceos da praia. Depois, conversamos."],
				func() -> void: advance(1))
		1: return _d(who, ["Ainda não pescou 3 peixes (%d/3). Lance a vara na água funda, perto do fim da doca!" % mini(GameState.total_caught, 3)])
		2: return _d(who, ["Três peixes! Já parece pescador.",
				"Agora, um favor: uma criatura de pernas longas, o Caranguejo‑Aranha, vem atormentando a ilha. Ninguém pesca em paz.",
				"Resolva isso e eu lhe entrego as chaves do meu barco a motor.",
				"Mas conversa de barriga seca... traga uma lata de cerveja gelada da loja do Capitão Maré ($12). Aí eu conto o segredo."],
				func() -> void: advance(3))
		3:
			if has("beer"):
				return _d(who, ["Aaah, gelada! Que saudade...", "O segredo: o bicho é maluco por lata vazia — o cheiro de alumínio com cevada o enlouquece.",
					"Use a lata vazia como isca e lance na Baía do Caranguejo (marcador na praia). Fisgue, arraste para a areia e termine o serviço a facadas!"],
					func() -> void:
						take_item("beer")
						add_item("empty_can")
						advance(4))
			return _d(who, ["Sem a cerveja não tem conversa. A loja do Capitão Maré vende por $12."])
		4: return _d(who, ["Lance a lata vazia na Baía do Caranguejo, com a vara equipada (tecla 2). Fisgou? Segure firme e mate o bicho a facadas (tecla 1)."])
		5:
			if has("crab_shell"):
				return _d(who, ["A carapaça do bicho! Você é louco... e eu gosto disso.",
					"As chaves do barco a motor estão com você. Ele está no cais. E leve uns trocados pela coragem.",
					"Para navegar pelo oceano vai precisar de um radar. O Capitão Maré vende. Siga para as outras ilhas!"],
					func() -> void:
						take_item("crab_shell")
						flags["keys_motorboat"] = true
						GameState.add_coins(300)
						if world and world.has_method("spawn_motorboat"):
							world.spawn_motorboat()
						advance(6, "Você ganhou as chaves do barco a motor! (+$300)"))
			return _d(who, ["Traga a carapaça do Caranguejo‑Aranha. Ela deve estar na praia onde ele caiu."])
		6: return _d(who, ["Compre o radar na loja do Capitão Maré e siga para a Ilha da Floresta. O barco está no cais."])
	return _d(who, ["..."])

func _talk_marina() -> Dictionary:
	var who := "Marina"
	if chapter < 2:
		return _d(who, ["Ah, um forasteiro! Volte quando tiver um radar..."])
	if chapter > 2:
		return _d(who, ["Meu pai amou o jantar! Obrigada por tudo. Boa viagem!"])
	match step:
		0: return _d(who, ["Um barco? Faz tempo que ninguém aparece. Sou Marina.",
				"O aniversário do meu pai está chegando e quero preparar o prato favorito dele: Piranha Gigante assada. Mas a lagoa é perigosa demais sem poder de fogo.",
				"Para atrair a bicha preciso de uma isca especial, feita de sanguessugas. Espalhei algumas pela ilha — pode coletar 3 delas?"],
				func() -> void: advance(1))
		1: return _d(who, ["Ainda faltam sanguessugas (%d/3). Procure perto da água e dos arbustos." % count("leech")])
		2: return _d(who, ["Três sanguessugas! Deixa comigo... pronto, isca especial feita!",
				"Lance na lagoa (marcador), mas vá ARMADO: pistola, escopeta, dinamite... a loja do Capitão Maré tem de tudo.",
				"Ela não vem sozinha: os filhotes vêm junto. Boa sorte!"],
				func() -> void:
					take_item("leech", 3)
					add_item("leech_bait")
					advance(3))
		3: return _d(who, ["Lance a isca especial no lago, com a vara (tecla 2). Quando ela aparecer, atire com tudo!"])
		4:
			if has("piranha_skeleton"):
				return _d(who, ["O esqueleto da Piranha Gigante! Papai vai amar!",
					"Prometi: aqui está a posição da próxima ilha. Atualizei seu radar — a Ilha Tropical, ao sudoeste. Cuidado com o monstro marinho de lá!"],
					func() -> void:
						take_item("piranha_skeleton")
						GameState.add_coins(500)
						next_chapter("Radar atualizado: Ilha Tropical! (+$500)"))
			return _d(who, ["Traga o esqueleto da piranha. Ele deve ter ficado na margem da lagoa."])
	return _d(who, ["..."])

func _talk_tourist() -> Dictionary:
	var who := "Turista"
	if chapter < 3:
		return _d(who, ["Nem pense em me levar para a água! Tem um monstro lá!"])
	if chapter > 3:
		return _d(who, ["Ainda estou tremendo, mas agora tenho fotos lindas! Obrigado!"])
	match step:
		0: return _d(who, ["Nem pense em me levar para a água! Tem um monstro marinho lá fora!",
				"Eu só saio daqui se alguém me trouxer uma espécie ameaçada de extinção, para eu fotografar: um cavalo‑marinho! Eles vivem pertinho desta ilha.",
				"Pesque um e traga para o turista aqui debaixo da árvore."],
				func() -> void: advance(1))
		1: return _d(who, ["Cavalo‑marinho! Pesque um perto da ilha. Eles são pequenos e tímidos."])
		2:
			return _d(who, ["Um cavalo‑marinho de verdade! Lindo demais!",
				"Em agradecimento, tome esta cenoura. Cenoura? É o que tenho! Mas dizem que o Baiacu Gigante é louco por isso.",
				"Cuidado: ele rola como bola de demolição. Use uma submetralhadora!"],
				func() -> void:
					remove_fish_from_bag("cavalo_marinho")
					add_item("carrot")
					advance(3))
		3: return _d(who, ["Lance a cenoura na água perto da ilha. E leve uma SMG, por favor!"])
		4:
			if has("puffer_fin"):
				return _d(who, ["Você derrotou aquela coisa?! Impossível! Posso até sair da sombra!",
					"Tome a posição da Ilha dos Penhascos. Dizem que uma ave enorme manda lá."],
					func() -> void:
						take_item("puffer_fin")
						GameState.add_coins(800)
						next_chapter("Radar atualizado: Ilha dos Penhascos! (+$800)"))
			return _d(who, ["Traga a barbatana do Baiacu, ela deve estar na praia."])
	return _d(who, ["..."])

func _talk_bbq() -> Dictionary:
	var who := "Mestre do Churrasco"
	if flags.get("lighter", false):
		return _d(who, ["Com o isqueiro a grelha está acesa! Cozinhe o peixe: o valor sobe até 1,5x, mas CUIDADO: se passar do ponto, ele queima e vale zero. Tire na hora certa!"])
	if has("shark_fin"):
		return _d(who, ["A barbatana do Tubarão‑Azul! Fez o impossível, parceiro!", "Aqui está meu isqueiro. Acenda a grelha ao lado e cozinhe seus peixes: até 1,5x o valor — mas não deixe queimar!"],
			func() -> void:
				take_item("shark_fin")
				flags["lighter"] = true
				GameState.notify.emit("Isqueiro obtido: as grelhas estão liberadas!")
				changed.emit())
	return _d(who, ["Sou o Mestre do Churrasco. Derrote o Tubarão‑Azul e te dou o isqueiro para acender a grelha. Compre uma isca de chefe padrão ($280) na loja e lance na água funda aqui perto."])

func _talk_vendor() -> Dictionary:
	var who := "Vendedor Assustado"
	if chapter < 4:
		return _d(who, ["Fecha a porta! ...Ah, desculpe, achei que fosse a ave."])
	if chapter > 4:
		return _d(who, ["Nunca mais vou temer o céu. Obrigado, herói!"], func() -> void: _open_shop())
	match step:
		0: return _d(who, ["Psiu! Entre, rápido! Fecha a porta!",
				"Uma ave gigante domina o céu da ilha: o Albatroz. Ele só desce quando sente cheiro de atum.",
				"Pesque um atum, deixe no meio da ilha como oferenda e atire com um rifle de precisão. Tenho isca profissional na loja ($60)."],
				func() -> void:
					advance(1)
					_open_shop())
		1: return _d(who, ["Precisa de um atum-azul. A isca profissional ajuda — veja a loja."], func() -> void: _open_shop())
		2: return _d(who, ["O atum deve ser deixado no centro da ilha (marcador). Depois, mire alto! Sniper é a melhor aposta."], func() -> void: _open_shop())
		3:
			if has("albatross_head"):
				return _d(who, ["A cabeça do Albatroz!! Você é um monstro... no bom sentido.",
					"Tome as coordenadas finais: a Ilha do Vulcão. Lá há um cientista maluco que sabe como voltar ao continente."],
					func() -> void:
						take_item("albatross_head")
						GameState.add_coins(1200)
						next_chapter("Radar atualizado: Ilha do Vulcão! (+$1200)"))
			return _d(who, ["Traga a cabeça da ave. Ela deve ter caído onde ela morreu."])
	return _d(who, ["..."])

func _open_shop() -> void:
	var hud := get_tree().get_first_node_in_group("hud")
	if hud:
		hud.open_shop()

func _talk_scientist() -> Dictionary:
	var who := "Cientista"
	if chapter < 5:
		return _d(who, ["Resultados preliminares... não me interrompa."])
	if ended:
		return _d(who, ["Missão cumprida. Boa viagem, pescador!"])
	match step:
		0: return _d(who, ["Mais um sobrevivente? Sou o cientista. Pesquiso como a lava muda a vida marinha.",
				"Preciso de cinco peixes nativos das águas do vulcão para preparar um 'Balde de Peixes' como isca.",
				"Pesque 5 peixes ao redor desta ilha e traga aqui."],
				func() -> void: advance(1))
		1: return _d(who, ["Peixes do vulcão: %d/5. Pesque perto da ilha." % volcano_fish])
		2: return _d(who, ["Cinco peixes. Perfeito! Balde de Peixes pronto.",
				"Lance no mar: a Baleia‑da‑Groenlândia virá. Derrote‑a e traga a carcaça ao topo do vulcão — a parte importante da pesquisa começa ali."],
				func() -> void:
					volcano_fish = 0
					add_item("fish_bucket")
					advance(3))
		3: return _d(who, ["Lance o balde no mar, perto da ilha, e prepare as armas pesadas."])
		4: return _d(who, ["A carcaça fica na praia (E para carregar). Suba o vulcão e jogue na cratera de lava."])
		5: return _d(who, ["A baleia mutante está na cratera! Fuzil e dinamite, rápido!"])
		6:
			if has("mutant_fin"):
				return _d(who, ["A Baleia Mutante de Magma... a pesquisa está completa! Fantástico!",
					"Satisfeito, entrego as chaves da lancha militar preta, no cais do vulcão. Vá para casa, pescador."],
					func() -> void:
						take_item("mutant_fin")
						flags["keys_military"] = true
						GameState.add_coins(2000)
						if world and world.has_method("spawn_military_boat"):
							world.spawn_military_boat()
						advance(7, "Chaves da lancha militar! (+$2000)"))
			return _d(who, ["Traga a barbatana da Baleia Mutante."])
		7: return _d(who, ["A lancha preta está no cais do vulcão. Navegue para longe daqui — o continente fica além do mapa."])
	return _d(who, ["..."])

# ------------------------------------------------------------------ final

func boat_reached_mainland() -> void:
	if ended:
		return
	ended = true
	GameState.save_game()
	changed.emit()
	ending_started.emit()

func finish_game() -> void:
	## Fim dos créditos: o jogo continua no mesmo save.
	chapter = 6
	step = 0
	GameState.save_game()
	changed.emit()
