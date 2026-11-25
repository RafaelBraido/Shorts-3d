extends Node
## Estado global do jogo: moedas, XP, nível, inventário, varas, munição e registro de peixes.
## Autoload "GameState".

signal coins_changed(coins: int)
signal xp_changed(xp: int, xp_needed: int, level: int)
signal level_up(new_level: int)
signal inventory_changed
signal rod_changed
signal ammo_changed
signal notify(message: String)

const SAVE_PATH := "user://fishit_save.json"

## Varas disponíveis: estatísticas usadas pelo FishingRod.
const RODS: Array[Dictionary] = [
	{"name": "Vara de Bambu", "price": 0, "level": 1, "cast_range": 20.0, "strength": 1.0, "reel": 1.0, "luck": 0.0, "color": Color(0.3, 0.82, 0.22)},
	{"name": "Vara de Fibra", "price": 250, "level": 3, "cast_range": 28.0, "strength": 1.3, "reel": 1.25, "luck": 0.15, "color": Color(0.2, 0.45, 0.25)},
	{"name": "Vara de Carbono", "price": 900, "level": 6, "cast_range": 36.0, "strength": 1.7, "reel": 1.55, "luck": 0.35, "color": Color(0.1, 0.1, 0.12)},
	{"name": "Vara Dourada", "price": 3000, "level": 10, "cast_range": 46.0, "strength": 2.2, "reel": 1.9, "luck": 0.6, "color": Color(0.95, 0.7, 0.12)},
]

static var _mobile := -1

## Verdadeiro em celular/tablet (ou com o argumento de usuário --touch para testar no PC).
static func is_mobile() -> bool:
	if _mobile < 0:
		_mobile = 1 if (OS.has_feature("mobile") or OS.has_feature("web_android") or OS.has_feature("web_ios") or "--touch" in OS.get_cmdline_user_args()) else 0
	return _mobile == 1

var persist := true
var coins := 50
var xp := 0
var level := 1
var rod_tier := 0
var owned_rods: Array[int] = [0]
var owned_weapons: Array[String] = []     ## começa sem armas: só as mãos ("fists")
var current_weapon := "fists"
var ammo: Dictionary = {}               ## weapon_id -> {"mag": int, "reserve": int}
var dynamite := 0
const SKINS := {"cream": Color(0.93, 0.8, 0.56), "teal": Color(0.15, 0.85, 0.8), "blue": Color(0.2, 0.25, 0.95), "pink": Color(0.95, 0.5, 0.7), "gold": Color(0.95, 0.78, 0.2)}
const LOOK_DEFAULT := {"skin": Color(0.93, 0.8, 0.56), "shirt": Color(0.2, 0.45, 0.85), "hat": Color(0.95, 0.8, 0.2)}
var look: Dictionary = LOOK_DEFAULT.duplicate()
var skins_owned: Array[String] = ["cream"]
var skin := "cream"
var bag_extra := 0                      ## espaços extras de mochila comprados
var engine_level := 0                   ## 0 = motor comum, 1 = reforçado, 2 = motores duplos
var pending_story: Dictionary = {}      ## dados do save entregues ao autoload Story
var inventory: Array[Dictionary] = []  ## {species, weight, value, dead}
var codex: Dictionary = {}              ## species_id -> {count, best}
var total_caught := 0

func _ready() -> void:
	load_game()

func xp_needed(lvl: int = level) -> int:
	return int(60.0 * pow(float(lvl), 1.45))

func rod() -> Dictionary:
	return RODS[rod_tier]

func add_coins(amount: int) -> void:
	coins += amount
	coins_changed.emit(coins)

func add_xp(amount: int) -> void:
	xp += amount
	while xp >= xp_needed():
		xp -= xp_needed()
		level += 1
		add_coins(25 * level)
		level_up.emit(level)
		notify.emit("Nível %d! (+%d moedas)" % [level, 25 * level])
	xp_changed.emit(xp, xp_needed(), level)

func add_fish(species_id: String, weight: float, dead: bool = false, value_mult: float = 1.0) -> Dictionary:
	var value := int(FishDB.price_for(species_id, weight) * value_mult)
	if dead:
		value = int(value * 0.6)
	var entry := {"species": species_id, "weight": weight, "value": value, "dead": dead, "cooked": 1.0}
	inventory.append(entry)
	var c: Dictionary = codex.get(species_id, {"count": 0, "best": 0.0})
	c["count"] = int(c["count"]) + 1
	c["best"] = maxf(float(c["best"]), weight)
	codex[species_id] = c
	total_caught += 1
	inventory_changed.emit()
	add_xp(FishDB.xp_for(species_id, weight))
	if has_node("/root/Story"):
		get_node("/root/Story").check_progress()
	save_game()
	return entry

func _mult() -> float:
	return 1.0

func sell_fish(index: int) -> int:
	if index < 0 or index >= inventory.size():
		return 0
	var value: int = int(inventory[index]["value"] * _mult())
	inventory.remove_at(index)
	add_coins(value)
	inventory_changed.emit()
	save_game()
	return value

func sell_all() -> int:
	var total := 0
	for e in inventory:
		total += int(e["value"] * _mult())
	inventory.clear()
	if total > 0:
		add_coins(total)
	inventory_changed.emit()
	save_game()
	return total

func buy_rod(tier: int) -> bool:
	if tier < 0 or tier >= RODS.size() or tier in owned_rods:
		return false
	var r: Dictionary = RODS[tier]
	if level < int(r["level"]) or coins < int(r["price"]):
		return false
	coins -= int(r["price"])
	owned_rods.append(tier)
	rod_tier = tier
	coins_changed.emit(coins)
	rod_changed.emit()
	notify.emit("Comprou: %s" % r["name"])
	save_game()
	return true

func equip_rod(tier: int) -> void:
	if tier in owned_rods:
		rod_tier = tier
		rod_changed.emit()
		save_game()

func ammo_mag(id: String) -> int:
	return int(ammo.get(id, {}).get("mag", 0))

func ammo_reserve(id: String) -> int:
	return int(ammo.get(id, {}).get("reserve", 0))

func buy_weapon(id: String) -> bool:
	if id in owned_weapons or not WeaponDB.W.has(id):
		return false
	var w: Dictionary = WeaponDB.W[id]
	if coins < int(w["price"]):
		return false
	coins -= int(w["price"])
	owned_weapons.append(id)
	ammo[id] = {"mag": int(w["mag"]), "reserve": int(w.get("start_reserve", 0))}
	coins_changed.emit(coins)
	ammo_changed.emit()
	notify.emit("Comprou: %s" % w["name"])
	save_game()
	return true

func buy_ammo(id: String) -> bool:
	if not (id in owned_weapons) or not WeaponDB.W[id].has("ammo_price"):
		return false
	var w: Dictionary = WeaponDB.W[id]
	if coins < int(w["ammo_price"]):
		return false
	coins -= int(w["ammo_price"])
	ammo[id]["reserve"] = int(ammo[id]["reserve"]) + int(w["ammo_pack"])
	coins_changed.emit(coins)
	ammo_changed.emit()
	save_game()
	return true

func buy_dynamite() -> bool:
	if coins < WeaponDB.DYNAMITE_PRICE:
		return false
	coins -= WeaponDB.DYNAMITE_PRICE
	dynamite += 1
	coins_changed.emit(coins)
	ammo_changed.emit()
	save_game()
	return true

const BAG_BASE := 6

func bag_capacity() -> int:
	return BAG_BASE + bag_extra

func bag_free() -> bool:
	return inventory.size() < bag_capacity()

## Cada ilha libera 2 espaços extras a mais (ilha 1 = 2, ilha 2 = 4 ...).
func bag_extra_max() -> int:
	return clampi(get_node("/root/Story").chapter, 1, 5) * 2

func bag_extra_price() -> int:
	return 20 * (bag_extra + 1)

func buy_bag_slot() -> bool:
	if bag_extra >= bag_extra_max() or coins < bag_extra_price():
		return false
	coins -= bag_extra_price()
	bag_extra += 1
	coins_changed.emit(coins)
	inventory_changed.emit()
	notify.emit("Espaço extra na mochila: %d/%d" % [inventory.size(), bag_capacity()])
	save_game()
	return true

const ENGINES := [{"name": "Motor reforçado", "price": 230, "speed": 1.35}, {"name": "Motores duplos", "price": 860, "speed": 1.7}]

func buy_engine() -> bool:
	if engine_level >= ENGINES.size():
		return false
	var e: Dictionary = ENGINES[engine_level]
	if coins < int(e["price"]):
		return false
	coins -= int(e["price"])
	engine_level += 1
	coins_changed.emit(coins)
	notify.emit("Barco melhorado: %s" % e["name"])
	save_game()
	return true

func engine_speed_mult() -> float:
	return 1.0 if engine_level == 0 else float(ENGINES[engine_level - 1]["speed"])

## Cassino: cara ou coroa com ~47% de chance (paga o dobro).
func gamble_coins(bet: int) -> bool:
	if bet <= 0 or coins < bet:
		return false
	var win := randf() < 0.47
	coins += bet if win else -bet
	coins_changed.emit(coins)
	save_game()
	return win

## Aposta um peixe da mochila: 50% de render o TRIPLO do valor, 50% de perdê-lo.
func gamble_fish(index: int) -> int:
	if index < 0 or index >= inventory.size():
		return -1
	var value: int = int(inventory[index]["value"] * _mult())
	inventory.remove_at(index)
	inventory_changed.emit()
	var win := randf() < 0.5
	if win:
		add_coins(value * 3)
	save_game()
	return value * 3 if win else 0

func skin_color() -> Color:
	return look["skin"] if skin == "cream" else SKINS[skin]

## Muda uma cor do personagem ("skin" | "shirt" | "hat") e atualiza luvas e avatar de rede.
func set_look(part: String, c: Color) -> void:
	look[part] = c
	_refresh_hands()
	save_game()
	var net := get_node_or_null("/root/Net")
	if net:
		net.send_look()

func reset_look() -> void:
	look = LOOK_DEFAULT.duplicate()
	_refresh_hands()
	save_game()
	var net := get_node_or_null("/root/Net")
	if net:
		net.send_look()

func randomize_look() -> void:
	for k in ["skin", "shirt", "hat"]:
		look[k] = Color.from_hsv(randf(), randf_range(0.35, 0.85), randf_range(0.6, 1.0)) if k != "skin" else Color.from_hsv(randf_range(0.02, 0.1), randf_range(0.2, 0.55), randf_range(0.45, 0.95))
	_refresh_hands()
	save_game()
	var net := get_node_or_null("/root/Net")
	if net:
		net.send_look()

func _refresh_hands() -> void:
	for n in Engine.get_main_loop().root.find_children("*", "MeshInstance3D", true, false):
		if n.is_in_group("hand_mesh"):
			n.material_override = Props.mat(skin_color(), 0.9)

func equip_skin(id: String) -> void:
	if id in skins_owned:
		skin = id
		_refresh_hands()
		save_game()

## Roleta (37 casas): vermelho/preto pagam 2x, verde (0) paga 36x (35x de lucro).
func roulette(bet: int, color: String) -> Dictionary:
	if bet <= 0 or coins < bet:
		return {"ok": false}
	var n := randi() % 37
	var res := "green" if n == 0 else ("red" if n % 2 == 1 else "black")
	var win := res == color
	var payout := 0
	if win:
		payout = bet * (36 if color == "green" else 2)
	coins += payout - bet
	coins_changed.emit(coins)
	save_game()
	return {"ok": true, "n": n, "color": res, "win": win, "payout": payout}

## Reel of Fortune: joga um peixe na máquina; pode render dinheiro ou uma skin de luva.
func reel_of_fortune(index: int) -> Dictionary:
	if index < 0 or index >= inventory.size():
		return {"ok": false}
	var value: int = int(inventory[index]["value"])
	inventory.remove_at(index)
	inventory_changed.emit()
	var r := randf()
	var out := {"ok": true, "kind": "lose", "amount": 0, "skin": ""}
	if r < 0.08:
		var locked: Array = []
		for k in SKINS:
			if not (k in skins_owned):
				locked.append(k)
		if locked.is_empty():
			add_coins(value * 8)
			out = {"ok": true, "kind": "coins", "amount": value * 8, "skin": ""}
		else:
			var pick: String = locked[randi() % locked.size()]
			skins_owned.append(pick)
			out = {"ok": true, "kind": "skin", "amount": 0, "skin": pick}
	elif r < 0.20:
		add_coins(value * 5)
		out = {"ok": true, "kind": "coins", "amount": value * 5, "skin": ""}
	elif r < 0.45:
		add_coins(value * 2)
		out = {"ok": true, "kind": "coins", "amount": value * 2, "skin": ""}
	save_game()
	return out

func use_dynamite() -> bool:
	if dynamite <= 0:
		return false
	dynamite -= 1
	ammo_changed.emit()
	return true

func reload_weapon(id: String) -> bool:
	if not ammo.has(id):
		return false
	var mag_size: int = int(WeaponDB.W[id]["mag"])
	var a: Dictionary = ammo[id]
	if int(a["mag"]) >= mag_size or int(a["reserve"]) <= 0:
		return false
	var take := mini(mag_size - int(a["mag"]), int(a["reserve"]))
	a["mag"] = int(a["mag"]) + take
	a["reserve"] = int(a["reserve"]) - take
	ammo_changed.emit()
	return true

func consume_bullet(id: String) -> bool:
	if int(ammo.get(id, {}).get("mag", 0)) <= 0:
		return false
	ammo[id]["mag"] = int(ammo[id]["mag"]) - 1
	ammo_changed.emit()
	return true

func save_game() -> void:
	if not persist:
		return
	var data := {
		"coins": coins, "xp": xp, "level": level, "rod_tier": rod_tier,
		"owned_rods": owned_rods, "owned_weapons": owned_weapons, "ammo": ammo, "dynamite": dynamite, "engine_level": engine_level, "bag_extra": bag_extra, "skins_owned": skins_owned, "skin": skin, "look": {"skin": look["skin"].to_html(), "shirt": look["shirt"].to_html(), "hat": look["hat"].to_html()},
		"story": get_node("/root/Story").to_dict() if has_node("/root/Story") else pending_story,
		"inventory": inventory, "codex": codex, "total_caught": total_caught,
	}
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(data))

func load_game() -> void:
	if not persist or not FileAccess.file_exists(SAVE_PATH):
		return
	var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if f == null:
		return
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var d: Dictionary = parsed
	coins = int(d.get("coins", coins))
	xp = int(d.get("xp", xp))
	level = maxi(1, int(d.get("level", level)))
	rod_tier = clampi(int(d.get("rod_tier", 0)), 0, RODS.size() - 1)
	owned_rods.clear()
	for t in d.get("owned_rods", [0]):
		owned_rods.append(int(t))
	if not (rod_tier in owned_rods):
		owned_rods.append(rod_tier)
	owned_weapons.clear()
	for w in d.get("owned_weapons", ["knife"]):
		if WeaponDB.W.has(String(w)):
			owned_weapons.append(String(w))
	ammo = d.get("ammo", {})
	dynamite = int(d.get("dynamite", 0))
	engine_level = clampi(int(d.get("engine_level", 0)), 0, 2)
	bag_extra = maxi(int(d.get("bag_extra", 0)), 0)
	skins_owned.clear()
	for sk in d.get("skins_owned", ["cream"]):
		if SKINS.has(String(sk)):
			skins_owned.append(String(sk))
	if skins_owned.is_empty():
		skins_owned.append("cream")
	var lk: Dictionary = d.get("look", {})
	for k in ["skin", "shirt", "hat"]:
		if lk.has(k):
			look[k] = Color.html(String(lk[k]))
	skin = String(d.get("skin", "cream")) if String(d.get("skin", "cream")) in skins_owned else "cream"
	pending_story = d.get("story", {})
	inventory.clear()
	for e in d.get("inventory", []):
		if typeof(e) == TYPE_DICTIONARY and FishDB.SPECIES.has(String(e.get("species", ""))):
			inventory.append({"species": String(e["species"]), "weight": float(e["weight"]),
				"value": int(e["value"]), "dead": bool(e.get("dead", false)), "cooked": float(e.get("cooked", 1.0))})
	codex = d.get("codex", {})
	total_caught = int(d.get("total_caught", 0))
