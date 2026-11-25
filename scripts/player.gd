extends CharacterBody3D
## Jogador em primeira pessoa: andar, correr, pular, nadar, câmera com mira/tremor/recuo,
## troca de equipamento (1 = rifle, 2 = vara), interação (E) e menus.
## Preserva o esquema original (WALK, gravity, pitch, item, cam, held) e adiciona os novos sistemas.

const WALK := 5.0
const RUN := 8.5
const SWIM := 3.4
const JUMP_SPEED := 5.0
const EYE_HEIGHT := 1.55
const CROUCH_EYE := 0.95
const CROUCH_SPEED := 2.4
const STAND_H := 1.8
const CROUCH_H := 1.1

var gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity", 9.8)
var pitch := 0.0
var item := "rifle"
var cam: Camera3D
var held: Node3D
var rifle: Rifle
var rod: FishingRod
var hud: Node
var fish_manager: FishManager
var spawn_point := Vector3(0, 2, 0)

var _menu_open := false
var _block_t := 0.0
var _shake := 0.0
var _recoil := 0.0
var _bob_t := 0.0
var _step_t := 0.0
var _swimming := false
var _prompt_target: Node = null
var _wprompt: Label3D
var touch_mode := false
var crouching := false
var hp := 100.0
var max_hp := 100.0
var vehicle: Node = null           ## barco que o jogador está pilotando
var dead := false
var hunger := 100.0
var _hunger_t := 0.0
var _since_hit := 99.0
var _capsule: CapsuleShape3D
var _col: CollisionShape3D

## Verdadeiro quando o jogador não deve agir (menu aberto, mouse solto ou acabou de recapturar).
var ui_open: bool:
	get: return _menu_open or _block_t > 0.0 or (Input.mouse_mode != Input.MOUSE_MODE_CAPTURED and not touch_mode)

func _ready() -> void:
	add_to_group("player")
	touch_mode = GameState.is_mobile()
	collision_layer = 2
	collision_mask = 1
	floor_snap_length = 0.4
	floor_max_angle = deg_to_rad(52.0)
	spawn_point = global_position
	var col := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.4
	cap.height = 1.8
	col.shape = cap
	col.position.y = 0.9
	add_child(col)
	_capsule = cap
	_col = col
	cam = Camera3D.new()
	cam.position.y = EYE_HEIGHT
	cam.current = true
	cam.fov = 75.0
	cam.near = 0.05
	cam.far = 2500.0
	add_child(cam)
	held = Node3D.new()
	held.position = Vector3(0.35, -0.28, -0.65)
	cam.add_child(held)
	hud = get_tree().get_first_node_in_group("hud")
	_wprompt = Label3D.new()
	_wprompt.top_level = true
	_wprompt.font_size = 44
	_wprompt.pixel_size = 0.0045
	_wprompt.outline_size = 10
	_wprompt.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_wprompt.no_depth_test = true
	_wprompt.visible = false
	add_child(_wprompt)
	fish_manager = get_tree().get_first_node_in_group("fish_manager")
	rifle = Rifle.new()
	rifle.name = "Rifle"
	held.add_child(rifle)
	rifle.setup(self, cam, hud)
	rod = FishingRod.new()
	rod.name = "FishingRod"
	held.add_child(rod)
	rod.setup(self, cam, hud, fish_manager)
	if hud:
		hud.menu_toggled.connect(_on_menu_toggled)
	_equip("rifle")
	if not touch_mode:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _on_menu_toggled(open: bool) -> void:
	_menu_open = open
	if not touch_mode:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if open else Input.MOUSE_MODE_CAPTURED
	_block_t = 0.2

func add_shake(amount: float) -> void:
	_shake = minf(_shake + amount, 0.06)

func add_recoil(amount: float) -> void:
	_recoil += amount

## Gira a câmera (mouse no PC, arrasto de dedo no celular).
func look(rel: Vector2) -> void:
	if _menu_open:
		return
	var sens := (0.0045 if touch_mode else 0.0022) * (cam.fov / 75.0)
	rotate_y(-rel.x * sens)
	pitch = clampf(pitch - rel.y * sens, -1.45, 1.45)

func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED and not _menu_open and not touch_mode:
		look(e.relative)
	if e is InputEventKey and e.pressed and e.keycode == KEY_ESCAPE:
		if _menu_open:
			hud.close_menus()
		else:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	if e is InputEventMouseButton and e.pressed and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED and not _menu_open and not touch_mode:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
		_block_t = 0.2
	if e.is_action_pressed("inventory") and hud:
		hud.toggle_inventory()
	if e.is_action_pressed("multiplayer") and hud:
		hud.open_network()

func _physics_process(d: float) -> void:
	_block_t = maxf(_block_t - d, 0.0)
	if dead:
		return
	_since_hit += d
	hunger = maxf(hunger - 0.12 * d, 0.0)
	_hunger_t += d
	if _hunger_t > 0.25 and hud:
		_hunger_t = 0.0
		hud.set_hunger(hunger)
	if hunger <= 0.0 and hp > 15.0:
		hp -= 1.2 * d      # com fome, a vida cai devagar (não chega a matar)
		if hud:
			hud.set_health(hp, max_hp)
	if hp < max_hp and _since_hit > 6.0 and hunger > 25.0:
		hp = minf(hp + 6.0 * d, max_hp)
		if hud:
			hud.set_health(hp, max_hp)
	var in_menu := _menu_open
	if vehicle != null:
		velocity = Vector3.ZERO
		global_position = vehicle.seat_pos()
		crouching = false
		_update_camera(d, false, false)
		Net.tick(d, self, rotation.y, pitch, item, false)
		if not in_menu:
			_hotbar()
			_interaction()
		return
	var feet := global_position.y
	_swimming = feet < -1.0
	var wading := feet < -0.25 and not _swimming
	var v := Vector2.ZERO if in_menu else Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var dir := (transform.basis * Vector3(v.x, 0, v.y)).normalized()
	_update_crouch(in_menu)
	var running := Input.is_action_pressed("run") and not in_menu and rifle != null and not rifle.scoped and not crouching
	var speed := RUN if running else WALK
	if crouching:
		speed = CROUCH_SPEED
	if Story.carrying != "":
		speed *= 0.55
		running = false
	if wading:
		speed *= 0.65
	if _swimming:
		speed = SWIM
		var target_vy := clampf((-1.05 - feet) * 2.5, -1.5, 2.0)
		if Input.is_action_pressed("jump") and not in_menu:
			target_vy = 2.2
		velocity.y = lerpf(velocity.y, target_vy, clampf(6.0 * d, 0.0, 1.0))
	else:
		if not is_on_floor():
			velocity.y -= gravity * d
		elif Input.is_action_just_pressed("jump") and not in_menu and not crouching and Story.carrying == "":
			velocity.y = JUMP_SPEED
	var accel := clampf(12.0 * d, 0.0, 1.0)
	velocity.x = lerpf(velocity.x, dir.x * speed, accel)
	velocity.z = lerpf(velocity.z, dir.z * speed, accel)
	move_and_slide()
	# limites do mapa e queda fora do mundo
	var lim := Terrain.HALF - 3.0
	global_position.x = clampf(global_position.x, -lim, lim)
	global_position.z = clampf(global_position.z, -lim, lim)
	if global_position.y < -25.0:
		global_position = spawn_point
		velocity = Vector3.ZERO
	_footsteps(d, dir.length() > 0.1, running, wading)
	Net.tick(d, self, rotation.y, pitch, item, crouching)
	_update_camera(d, dir.length() > 0.1, running)
	if not in_menu:
		_hotbar()
		_interaction()

## Agachar: segurar Ctrl/C (PC) ou alternar no botão ABAIXAR (celular). Só levanta se houver espaço livre acima.
func _update_crouch(in_menu: bool) -> void:
	var want := Input.is_action_pressed("crouch") and not in_menu and not _swimming
	if want == crouching:
		return
	if not want and not _can_stand():
		return
	crouching = want
	var h := CROUCH_H if crouching else STAND_H
	_capsule.height = h
	_col.position.y = h * 0.5

func _can_stand() -> bool:
	var q := PhysicsRayQueryParameters3D.create(global_position + Vector3(0, CROUCH_H - 0.1, 0), global_position + Vector3(0, STAND_H + 0.1, 0), 1)
	return get_world_3d().direct_space_state.intersect_ray(q).is_empty()

func _footsteps(d: float, moving: bool, running: bool, wading: bool) -> void:
	if not moving or not (is_on_floor() or wading) or _swimming:
		_step_t = 0.0
		return
	_step_t -= d
	if _step_t <= 0.0:
		_step_t = 0.28 if running else (0.7 if crouching else 0.45)
		if wading:
			Sfx.play("splash", -20.0, randf_range(1.3, 1.6))
		else:
			Sfx.play("step", -14.0, randf_range(0.85, 1.15))

func _update_camera(d: float, moving: bool, running: bool) -> void:
	_recoil = lerpf(_recoil, 0.0, clampf(8.0 * d, 0.0, 1.0))
	_shake = lerpf(_shake, 0.0, clampf(10.0 * d, 0.0, 1.0))
	var bob := 0.0
	if moving and is_on_floor():
		_bob_t += d * (11.0 if running else 8.0)
		bob = sin(_bob_t) * 0.03
	elif _swimming:
		_bob_t += d * 2.0
		bob = sin(_bob_t) * 0.04
	var eye := CROUCH_EYE if crouching else EYE_HEIGHT
	cam.position.y = lerpf(cam.position.y, eye + bob, clampf(10.0 * d, 0.0, 1.0))
	cam.rotation.x = pitch + _recoil
	cam.rotation.z = (randf() - 0.5) * _shake
	cam.rotation.y = (randf() - 0.5) * _shake * 0.6
	if hud:
		hud.set_underwater(cam.global_position.y < -0.05)

func _hotbar() -> void:
	if Input.is_action_just_pressed("weapon_toggle"):
		if item == "rifle":
			_cycle_weapon()
		else:
			_equip("rifle")
	if Input.is_action_just_pressed("fish_toggle"):
		_equip("rod")
	if Input.is_action_just_pressed("hands_toggle"):
		_equip("hands" if item != "hands" else "rifle")
	if Input.is_action_just_pressed("bomb_toggle"):
		if GameState.dynamite > 0:
			_equip("bomb")
		elif hud:
			hud.toast("Você não tem dinamite. Compre na loja.", Color(1.0, 0.7, 0.4))

## Come um peixe da mochila: recupera fome e um pouco de vida.
func eat_fish(index: int) -> void:
	if index < 0 or index >= GameState.inventory.size():
		return
	var e: Dictionary = GameState.inventory[index]
	GameState.inventory.remove_at(index)
	GameState.inventory_changed.emit()
	var cooked: float = float(e.get("cooked", 1.0))
	hunger = minf(100.0, hunger + (20.0 + minf(float(e["weight"]) * 5.0, 40.0)) * cooked)
	hp = minf(max_hp, hp + 12.0 * cooked * cooked)
	Sfx.play("coin", -10.0, 0.6)
	if hud:
		hud.set_health(hp, max_hp)
		hud.set_hunger(hunger)
		hud.toast("Você comeu %s. Fome recuperada!" % FishDB.data(e["species"])["name"], Color(1.0, 0.9, 0.6))

func _cycle_weapon() -> void:
	var list: Array = ["fists"]
	for w in WeaponDB.ORDER:
		if w in GameState.owned_weapons:
			list.append(w)
	if list.size() <= 1:
		hud.toast("Você não tem armas. Compre na loja (soco inglês $24, faca $45).", Color(1.0, 0.8, 0.5)) if hud else null
		return
	var i := list.find(rifle.weapon_id)
	rifle.set_weapon(list[(i + 1) % list.size()])
	Sfx.play("reload", -14.0, 1.4)

func _equip(which: String) -> void:
	item = which
	if which == "hands":
		rifle.set_weapon("fists")
	elif which == "bomb":
		rifle.set_weapon("dynamite")
	elif which == "rifle" and rifle.weapon_id in ["dynamite", "fists"]:
		rifle.set_weapon(GameState.current_weapon)
	rifle.equip(which == "rifle" or which == "bomb" or which == "hands")
	rod.equip(which == "rod")
	if hud:
		hud.set_equipped({"rifle": 1, "rod": 2, "bomb": 3, "hands": 4}[which])

## Carregar a carcaça impede de usar armas.
func vehicle_blocks_fire() -> bool:
	return Story.carrying != ""

func take_damage(amount: float, from: Vector3 = Vector3.ZERO) -> void:
	if dead:
		return
	hp -= amount
	_since_hit = 0.0
	add_shake(0.04)
	Sfx.play("impact", 2.0, 0.6)
	if hud:
		hud.set_health(maxf(hp, 0.0), max_hp)
		hud.flash_damage()
	if hp <= 0.0:
		_die()

func _die() -> void:
	dead = true
	Sfx.play("fail")
	if vehicle != null:
		vehicle.leave(true)
	if rod.state != FishingRod.S.IDLE:
		rod.cancel()
	var lost := int(GameState.coins * 0.1)
	GameState.coins -= lost
	GameState.coins_changed.emit(GameState.coins)
	Story.carrying = ""
	Story.take_item("whale_carcass", Story.count("whale_carcass"))
	if hud:
		hud.show_death(lost)
	await get_tree().create_timer(2.5).timeout
	global_position = Story.respawn_pos()
	velocity = Vector3.ZERO
	hp = max_hp
	_since_hit = 99.0
	dead = false
	if hud:
		hud.set_health(hp, max_hp)
		hud.hide_death()

func _interaction() -> void:
	var best: Node = null
	var best_score := 1.0
	for n in get_tree().get_nodes_in_group("interactable"):
		if not (n is Node3D) or not is_instance_valid(n):
			continue
		if "enabled" in n and not n.enabled:
			continue
		var r: float = n.radius if "radius" in n else 3.0
		var dist := global_position.distance_to(n.global_position)
		var score := dist / r
		if score < best_score:
			best_score = score
			best = n
	_prompt_target = best
	if best != null:
		var verb := String(best.get_prompt()).split(" ")[0]
		_wprompt.text = "%s [E]" % verb
		_wprompt.global_position = best.global_position + Vector3(0, 2.4 if not (best is LandedFish) else 0.9, 0)
		_wprompt.visible = true
	else:
		_wprompt.visible = false
	if Input.is_action_just_pressed("inspect"):
		var near: LandedFish = null
		for n in get_tree().get_nodes_in_group("landed_fish"):
			if near == null or global_position.distance_to(n.global_position) < global_position.distance_to(near.global_position):
				near = n
		if near != null and global_position.distance_to(near.global_position) < 6.0:
			var info: Dictionary = near.inspect_info()
			hud.show_inspect(info["name"], info["value"], info["weight"], info["mult"])
	if hud:
		hud.show_prompt(hud.prompt_prefix + best.get_prompt() if best != null else "")
	if best != null and Input.is_action_just_pressed("interact"):
		best.interact(self)
