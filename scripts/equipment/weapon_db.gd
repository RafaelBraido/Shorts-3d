class_name WeaponDB
extends RefCounted
## Dados de todas as armas. "kind": melee | gun. Dinamite é tratada à parte (item arremessável).

const ORDER := ["knife", "pistol", "shotgun", "smg", "ar", "sniper"]

const W := {
	"fists": {"name": "Mãos", "kind": "melee", "damage": 1.0, "interval": 0.38, "range": 2.4, "mag": 0, "price": 0, "zoom": 75.0},
	"knife": {"name": "Faca", "kind": "melee", "damage": 2.0, "interval": 0.45, "range": 2.8, "mag": 0, "price": 0, "zoom": 75.0},
	"pistol": {"name": "Pistola", "kind": "gun", "damage": 1.2, "interval": 0.28, "pellets": 1, "spread": 0.9, "mag": 12, "auto": false,
		"price": 50, "ammo_price": 15, "ammo_pack": 24, "reload": 1.1, "zoom": 55.0, "scope": false, "start_reserve": 24, "kick": 0.015},
	"shotgun": {"name": "Escopeta", "kind": "gun", "damage": 0.9, "interval": 0.9, "pellets": 8, "spread": 4.5, "mag": 6, "auto": false,
		"price": 150, "ammo_price": 25, "ammo_pack": 12, "reload": 1.9, "zoom": 65.0, "scope": false, "start_reserve": 12, "kick": 0.05},
	"smg": {"name": "Submetralhadora", "kind": "gun", "damage": 0.7, "interval": 0.08, "pellets": 1, "spread": 2.2, "mag": 30, "auto": true,
		"price": 650, "ammo_price": 40, "ammo_pack": 60, "reload": 1.6, "zoom": 60.0, "scope": false, "start_reserve": 60, "kick": 0.008},
	"ar": {"name": "Fuzil de Assalto", "kind": "gun", "damage": 1.4, "interval": 0.11, "pellets": 1, "spread": 1.2, "mag": 30, "auto": true,
		"price": 20000, "ammo_price": 90, "ammo_pack": 60, "reload": 1.9, "zoom": 45.0, "scope": false, "start_reserve": 60, "kick": 0.012},
	"sniper": {"name": "Rifle Dourado (Sniper)", "kind": "gun", "damage": 6.0, "interval": 0.75, "pellets": 1, "spread": 1.4, "mag": 8, "auto": false,
		"price": 3800, "ammo_price": 70, "ammo_pack": 16, "reload": 1.5, "zoom": 18.0, "scope": true, "start_reserve": 16, "kick": 0.035},
}

const DYNAMITE_PRICE := 25
const DYNAMITE_DAMAGE := 28.0
const DYNAMITE_RADIUS := 7.5

static func data(id: String) -> Dictionary:
	return W[id]
