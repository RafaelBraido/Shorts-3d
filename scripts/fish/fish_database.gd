class_name FishDB
extends RefCounted
## Banco de espécies. Cada espécie define aparência (usada por FishModel),
## faixa de peso, valor e comportamento (usado por Fish).

enum Rarity { COMUM, INCOMUM, RARO, EPICO, LENDARIO }

const RARITY_NAMES := ["Comum", "Incomum", "Raro", "Épico", "Lendário"]
const RARITY_COLORS := [Color(0.8, 0.8, 0.8), Color(0.4, 0.9, 0.4), Color(0.35, 0.6, 1.0), Color(0.75, 0.4, 1.0), Color(1.0, 0.75, 0.2)]
## Peso de sorteio base por raridade.
const RARITY_WEIGHT := [100.0, 45.0, 18.0, 6.0, 1.5]

## length: comprimento (m) de um exemplar de peso médio. body_h/body_w: meia altura/largura relativas ao comprimento.
## speed: m/s de cruzeiro. skittish: 0..1 chance de fugir do jogador. school: tamanho do cardume.
## fight: força na briga (afeta o minigame). depth: profundidade preferida (m).
const SPECIES := {
	"sardinha": {"name": "Sardinha", "rarity": 0, "kg": [0.1, 0.4], "price": 40, "xp": 8, "length": 0.22,
		"body_h": 0.13, "body_w": 0.07, "color": Color(0.62, 0.72, 0.8), "belly": Color(0.95, 0.96, 0.98), "fin": Color(0.5, 0.58, 0.66),
		"tail": 0.22, "dorsal": 0.12, "pattern": "none", "speed": 2.4, "skittish": 0.9, "school": 7, "fight": 0.3, "depth": 0.8},
	"palhaco": {"accent": Color(1.0, 1.0, 1.0), "name": "Peixe-palhaço", "rarity": 0, "kg": [0.05, 0.25], "price": 120, "xp": 12, "length": 0.18,
		"body_h": 0.22, "body_w": 0.1, "color": Color(1.0, 0.45, 0.05), "belly": Color(1.0, 0.55, 0.15), "fin": Color(1.0, 0.4, 0.05),
		"tail": 0.2, "dorsal": 0.2, "pattern": "bands", "speed": 1.4, "skittish": 0.5, "school": 2, "fight": 0.25, "depth": 0.7},
	"cirurgiao": {"accent": Color(0.02, 0.02, 0.12), "name": "Cirurgião-azul", "rarity": 1, "kg": [0.3, 1.2], "price": 45, "xp": 20, "length": 0.3,
		"body_h": 0.3, "body_w": 0.08, "color": Color(0.1, 0.35, 0.95), "belly": Color(0.2, 0.5, 1.0), "fin": Color(0.95, 0.85, 0.1),
		"tail": 0.3, "dorsal": 0.22, "pattern": "stripe", "speed": 1.8, "skittish": 0.6, "school": 3, "fight": 0.4, "depth": 1.0},
	"baiacu": {"accent": Color(0.25, 0.18, 0.08), "name": "Baiacu", "rarity": 1, "kg": [0.5, 2.0], "price": 40, "xp": 24, "length": 0.28,
		"body_h": 0.36, "body_w": 0.34, "color": Color(0.7, 0.62, 0.35), "belly": Color(0.97, 0.93, 0.8), "fin": Color(0.75, 0.68, 0.45),
		"tail": 0.12, "dorsal": 0.1, "pattern": "spots", "speed": 1.0, "skittish": 0.3, "school": 1, "fight": 0.5, "depth": 1.2},
	"dourado": {"accent": Color(0.95, 0.9, 0.2), "name": "Dourado", "rarity": 2, "kg": [3.0, 12.0], "price": 24, "xp": 45, "length": 0.9,
		"body_h": 0.17, "body_w": 0.07, "color": Color(0.15, 0.7, 0.45), "belly": Color(1.0, 0.85, 0.2), "fin": Color(0.95, 0.8, 0.15),
		"tail": 0.28, "dorsal": 0.3, "pattern": "stripe", "speed": 3.2, "skittish": 0.4, "school": 2, "fight": 0.65, "depth": 1.8},
	"barracuda": {"name": "Barracuda", "rarity": 2, "kg": [4.0, 15.0], "price": 22, "xp": 55, "length": 1.2,
		"body_h": 0.09, "body_w": 0.07, "color": Color(0.45, 0.5, 0.55), "belly": Color(0.9, 0.92, 0.9), "fin": Color(0.35, 0.4, 0.45),
		"tail": 0.2, "dorsal": 0.1, "pattern": "none", "speed": 3.6, "skittish": 0.2, "school": 1, "fight": 0.75, "depth": 2.0},
	"atum": {"name": "Atum-azul", "rarity": 3, "kg": [30.0, 120.0], "price": 14, "xp": 120, "length": 1.8,
		"body_h": 0.16, "body_w": 0.13, "color": Color(0.05, 0.15, 0.35), "belly": Color(0.85, 0.88, 0.92), "fin": Color(0.1, 0.2, 0.4),
		"tail": 0.3, "dorsal": 0.14, "pattern": "none", "speed": 4.0, "skittish": 0.1, "school": 1, "fight": 0.85, "depth": 3.0},
	"peixe_lua": {"name": "Peixe-lua", "rarity": 3, "kg": [80.0, 250.0], "price": 9, "xp": 150, "length": 2.0,
		"body_h": 0.46, "body_w": 0.08, "color": Color(0.55, 0.6, 0.62), "belly": Color(0.8, 0.82, 0.82), "fin": Color(0.5, 0.55, 0.58),
		"tail": 0.12, "dorsal": 0.5, "pattern": "none", "speed": 1.2, "skittish": 0.0, "school": 1, "fight": 0.6, "depth": 3.0},
	"tubarao": {"accent": Color(0.15, 0.2, 0.24), "name": "Tubarão-tigre", "rarity": 4, "kg": [120.0, 400.0], "price": 12, "xp": 300, "length": 3.0,
		"body_h": 0.13, "body_w": 0.12, "color": Color(0.38, 0.45, 0.5), "belly": Color(0.92, 0.94, 0.94), "fin": Color(0.3, 0.36, 0.4),
		"tail": 0.3, "dorsal": 0.2, "pattern": "stripe", "speed": 3.0, "skittish": 0.0, "school": 1, "fight": 1.0, "depth": 3.0},
	"koi_dourado": {"accent": Color(1.0, 0.97, 0.9), "name": "Carpa Dourada Lendária", "rarity": 4, "kg": [6.0, 20.0], "price": 90, "xp": 350, "length": 0.8,
		"body_h": 0.17, "body_w": 0.11, "color": Color(1.0, 0.78, 0.1), "belly": Color(1.0, 0.92, 0.5), "fin": Color(1.0, 0.65, 0.05),
		"tail": 0.4, "dorsal": 0.22, "pattern": "spots", "speed": 1.6, "skittish": 0.2, "school": 1, "fight": 0.9, "depth": 1.5},
}

static func ids() -> Array:
	return SPECIES.keys()

static func data(id: String) -> Dictionary:
	return SPECIES[id]

static func avg_weight(id: String) -> float:
	var kg: Array = SPECIES[id]["kg"]
	return (float(kg[0]) + float(kg[1])) * 0.5

static func roll_weight(id: String, rng: RandomNumberGenerator = null) -> float:
	var kg: Array = SPECIES[id]["kg"]
	var r := rng.randf() if rng else randf()
	# tende a pesos menores; exemplares grandes são raros
	r = pow(r, 1.8)
	return snappedf(lerpf(float(kg[0]), float(kg[1]), r), 0.01)

## Escala visual do modelo conforme o peso (comprimento ~ raiz cúbica do peso).
static func scale_for(id: String, weight: float) -> float:
	return pow(maxf(weight, 0.01) / avg_weight(id), 1.0 / 3.0)

static func price_for(id: String, weight: float) -> int:
	return maxi(1, int(round(float(SPECIES[id]["price"]) * weight)))

static func xp_for(id: String, weight: float) -> int:
	return int(float(SPECIES[id]["xp"]) * (0.8 + 0.4 * minf(weight / avg_weight(id), 2.0)))

static func rarity_color(id: String) -> Color:
	return RARITY_COLORS[int(SPECIES[id]["rarity"])]

static func rarity_name(id: String) -> String:
	return RARITY_NAMES[int(SPECIES[id]["rarity"])]

## Sorteia uma espécie. luck (0..1+) aumenta o peso das raridades altas.
static func pick_species(luck: float = 0.0, rng: RandomNumberGenerator = null) -> String:
	var total := 0.0
	var weights := {}
	for id in SPECIES:
		var r: int = SPECIES[id]["rarity"]
		var w: float = RARITY_WEIGHT[r] * (1.0 + luck * float(r) * 1.2)
		weights[id] = w
		total += w
	var roll := (rng.randf() if rng else randf()) * total
	for id in weights:
		roll -= weights[id]
		if roll <= 0.0:
			return id
	return "sardinha"
