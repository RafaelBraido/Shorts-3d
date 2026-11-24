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
const MAG_SIZE := 8

## Varas disponíveis: estatísticas usadas pelo FishingRod.
const RODS: Array[Dictionary] = [
	{"name": "Vara de Bambu", "price": 0, "level": 1, "cast_range": 20.0, "strength": 1.0, "reel": 1.0, "luck": 0.0, "color": Color(0.55, 0.38, 0.18)},
	{"name": "Vara de Fibra", "price": 250, "level": 3, "cast_range": 28.0, "strength": 1.3, "reel": 1.25, "luck": 0.15, "color": Color(0.2, 0.45, 0.25)},
	{"name": "Vara de Carbono", "price": 900, "level": 6, "cast_range": 36.0, "strength": 1.7, "reel": 1.55, "luck": 0.35, "color": Color(0.1, 0.1, 0.12)},
	{"name": "Vara Dourada", "price": 3000, "level": 10, "cast_range": 46.0, "strength": 2.2, "reel": 1.9, "luck": 0.6, "color": Color(0.95, 0.7, 0.12)},
]
const AMMO_PACK := 20
const AMMO_PRICE := 40

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
var ammo_mag := MAG_SIZE
var ammo_reserve := 40
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

func add_fish(species_id: String, weight: float, dead: bool = false) -> Dictionary:
	var value := FishDB.price_for(species_id, weight)
	if dead:
		value = int(value * 0.6)
	var entry := {"species": species_id, "weight": weight, "value": value, "dead": dead}
	inventory.append(entry)
	var c: Dictionary = codex.get(species_id, {"count": 0, "best": 0.0})
	c["count"] = int(c["count"]) + 1
	c["best"] = maxf(float(c["best"]), weight)
	codex[species_id] = c
	total_caught += 1
	inventory_changed.emit()
	add_xp(FishDB.xp_for(species_id, weight))
	save_game()
	return entry

func sell_fish(index: int) -> int:
	if index < 0 or index >= inventory.size():
		return 0
	var value: int = inventory[index]["value"]
	inventory.remove_at(index)
	add_coins(value)
	inventory_changed.emit()
	save_game()
	return value

func sell_all() -> int:
	var total := 0
	for e in inventory:
		total += int(e["value"])
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

func buy_ammo() -> bool:
	if coins < AMMO_PRICE:
		return false
	coins -= AMMO_PRICE
	ammo_reserve += AMMO_PACK
	coins_changed.emit(coins)
	ammo_changed.emit()
	save_game()
	return true

func reload_rifle() -> bool:
	if ammo_mag >= MAG_SIZE or ammo_reserve <= 0:
		return false
	var need := MAG_SIZE - ammo_mag
	var take := mini(need, ammo_reserve)
	ammo_mag += take
	ammo_reserve -= take
	ammo_changed.emit()
	return true

func consume_bullet() -> bool:
	if ammo_mag <= 0:
		return false
	ammo_mag -= 1
	ammo_changed.emit()
	return true

func save_game() -> void:
	if not persist:
		return
	var data := {
		"coins": coins, "xp": xp, "level": level, "rod_tier": rod_tier,
		"owned_rods": owned_rods, "ammo_mag": ammo_mag, "ammo_reserve": ammo_reserve,
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
	ammo_mag = clampi(int(d.get("ammo_mag", MAG_SIZE)), 0, MAG_SIZE)
	ammo_reserve = int(d.get("ammo_reserve", ammo_reserve))
	inventory.clear()
	for e in d.get("inventory", []):
		if typeof(e) == TYPE_DICTIONARY and FishDB.SPECIES.has(String(e.get("species", ""))):
			inventory.append({"species": String(e["species"]), "weight": float(e["weight"]),
				"value": int(e["value"]), "dead": bool(e.get("dead", false))})
	codex = d.get("codex", {})
	total_caught = int(d.get("total_caught", 0))
