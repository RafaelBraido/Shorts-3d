class_name FishManager
extends Node3D
## Mantém uma população de peixes ao redor do jogador, reciclando os que ficam distantes,
## coordena qual peixe interage com a boia e cria efeitos quando peixes são atingidos.

const SPAWN_MIN := 14.0
const SPAWN_MAX := 52.0
const DESPAWN_DIST := 72.0

var player: Node3D
var bait: Node3D = null            ## boia atual na água (definida pela vara)
var bait_fish: Fish = null         ## peixe que está interagindo com a boia
var bait_interest := 16.0          ## alcance de atração da isca
var fishes: Array[Fish] = []
var target_count := 46
var _rng := RandomNumberGenerator.new()
var _check_index := 0

func _ready() -> void:
	add_to_group("fish_manager")
	_rng.randomize()
	if GameState.is_mobile():
		target_count = 28

func populate_initial(center: Vector3) -> void:
	var tries := 0
	while fishes.size() < target_count and tries < 600:
		tries += 1
		_spawn_group(_random_water_point(center, 8.0, 60.0))

func _random_water_point(center: Vector3, rmin: float, rmax: float, min_depth: float = 1.8) -> Vector3:
	for i in 24:
		var a := _rng.randf() * TAU
		var r := _rng.randf_range(rmin, rmax)
		var p := center + Vector3(cos(a) * r, 0, sin(a) * r)
		if Terrain.is_inside_map(p, 10.0) and Terrain.depth_at(p.x, p.z) >= min_depth:
			p.y = -minf(Terrain.depth_at(p.x, p.z) * 0.5, 1.5)
			return p
	return Vector3.INF

func _pick_species_for(p: Vector3, luck: float = 0.0) -> String:
	var depth := Terrain.depth_at(p.x, p.z)
	for i in 8:
		var id := FishDB.pick_species(luck, _rng)
		if float(FishDB.data(id)["depth"]) <= depth - 0.5 or i == 7:
			return id
	return "sardinha"

func _spawn_group(p: Vector3, luck: float = 0.0, species: String = "") -> Fish:
	if p == Vector3.INF:
		return null
	var id := species if species != "" else _pick_species_for(p, luck)
	var d := FishDB.data(id)
	var n: int = int(d["school"])
	var lead: Fish = null
	for i in n:
		var off := Vector3(_rng.randf_range(-2, 2), 0, _rng.randf_range(-2, 2)) if i > 0 else Vector3.ZERO
		var f := _spawn_one(id, p + off)
		if f == null:
			continue
		if lead == null:
			lead = f
		else:
			f.leader = lead
			f.heading = lead.heading
			f.target_heading = lead.heading
	return lead

func _spawn_one(id: String, p: Vector3) -> Fish:
	var f := Fish.new()
	f.manager = self
	add_child(f)
	f.setup(id, FishDB.roll_weight(id, _rng), p, _rng)
	fishes.append(f)
	return f

func remove_fish(f: Fish) -> void:
	fishes.erase(f)
	if bait_fish == f:
		bait_fish = null
	if is_instance_valid(f):
		f.queue_free()

## Garante que o peixe pesca-do é removido da população normal (a vara o consome).
func consume_fish(f: Fish) -> void:
	remove_fish(f)

func spawn_near_bait(pos: Vector3, luck: float) -> Fish:
	var p := _random_water_point(pos, 6.0, 11.0, 1.2)
	if p == Vector3.INF:
		return null
	var id := _pick_species_for(p, luck)
	var f := _spawn_one(id, p)
	if f != null:
		f.leader = null
	return f

func _physics_process(_delta: float) -> void:
	if player == null:
		return
	# recicla alguns peixes por quadro (distantes do jogador)
	for n in 4:
		if fishes.is_empty():
			break
		_check_index = (_check_index + 1) % fishes.size()
		var f := fishes[_check_index]
		if not is_instance_valid(f):
			fishes.remove_at(_check_index)
			continue
		if f.state == Fish.State.HOOKED or f.state == Fish.State.DEAD or f == bait_fish:
			continue
		var d := f.global_position.distance_to(player.global_position)
		if d > DESPAWN_DIST:
			remove_fish(f)
	if fishes.size() < target_count and _rng.randf() < 0.1:
		_spawn_group(_random_water_point(player.global_position, SPAWN_MIN, SPAWN_MAX))

func on_fish_hit(f: Fish, point: Vector3) -> void:
	_burst(point, Color(0.9, 0.1, 0.1), 10, 0.05)

func _burst(point: Vector3, color: Color, amount: int, size: float) -> void:
	var p := CPUParticles3D.new()
	p.one_shot = true
	p.emitting = true
	p.amount = amount
	p.lifetime = 0.7
	p.explosiveness = 1.0
	p.direction = Vector3.UP
	p.spread = 60.0
	p.initial_velocity_min = 1.0
	p.initial_velocity_max = 3.0
	p.gravity = Vector3(0, -9.8, 0)
	var sm := SphereMesh.new()
	sm.radius = size
	sm.height = size * 2.0
	sm.radial_segments = 6
	sm.rings = 3
	p.mesh = sm
	p.material_override = Props.mat(color, 0.4)
	add_child(p)
	p.global_position = point
	get_tree().create_timer(1.2).timeout.connect(p.queue_free)
