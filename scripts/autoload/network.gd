extends Node
## Multiplayer cooperativo (ENet, API de alto nível do Godot 4). Autoload "Net".
## Um jogador hospeda (porta 24565, UDP) e os outros entram pelo IP. O mundo é determinístico (mesma semente),
## então todos veem a mesma ilha. Sincronizados: posição/olhar/item/agachar dos jogadores, tiros (traçante + som),
## nomes e avisos de captura. Não sincronizados (cada jogador tem os seus): peixes, economia e inventário.

signal status(message: String)
signal players_changed

const PORT := 24565
const MAX_PLAYERS := 6
const SEND_INTERVAL := 1.0 / 15.0

var player_name := "Pescador"
var active := false
var is_host := false
var avatars: Dictionary = {}      ## peer_id -> RemotePlayer
var names: Dictionary = {}        ## peer_id -> nome
var _send_t := 0.0

func _ready() -> void:
	player_name = "Pescador%d" % (randi() % 900 + 100)
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	multiplayer.connected_to_server.connect(func() -> void:
		active = true
		status.emit("Conectado! Seu ID: %d" % multiplayer.get_unique_id())
		players_changed.emit())
	multiplayer.connection_failed.connect(func() -> void:
		_reset()
		status.emit("Falha ao conectar. Confira o IP, a porta e se o anfitrião está aberto."))
	multiplayer.server_disconnected.connect(func() -> void:
		_reset()
		status.emit("O anfitrião saiu da partida."))

func host(port: int = PORT) -> Error:
	leave()
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_server(port, MAX_PLAYERS - 1)
	if err != OK:
		status.emit("Não foi possível hospedar na porta %d (erro %d)." % [port, err])
		return err
	multiplayer.multiplayer_peer = peer
	active = true
	is_host = true
	status.emit("Hospedando na porta %d. Passe seu IP aos amigos." % port)
	players_changed.emit()
	return OK

func join(ip: String, port: int = PORT) -> Error:
	leave()
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_client(ip.strip_edges(), port)
	if err != OK:
		status.emit("Endereço inválido (erro %d)." % err)
		return err
	multiplayer.multiplayer_peer = peer
	status.emit("Conectando a %s:%d ..." % [ip, port])
	return OK

func leave() -> void:
	if multiplayer.multiplayer_peer != null and not (multiplayer.multiplayer_peer is OfflineMultiplayerPeer):
		multiplayer.multiplayer_peer.close()
	multiplayer.multiplayer_peer = null
	_reset()

func _reset() -> void:
	active = false
	is_host = false
	for a in avatars.values():
		if is_instance_valid(a):
			a.queue_free()
	avatars.clear()
	names.clear()
	players_changed.emit()

func peer_count() -> int:
	return avatars.size() + 1

func _on_peer_connected(id: int) -> void:
	var scene := get_tree().current_scene
	if scene == null:
		return
	var av := RemotePlayer.new()
	av.peer_id = id
	scene.add_child(av)
	avatars[id] = av
	names[id] = "Jogador %d" % id
	av.set_display_name(names[id])
	set_player_name.rpc_id(id, player_name)
	set_look_rpc.rpc_id(id, GameState.look["skin"], GameState.look["shirt"], GameState.look["hat"])
	status.emit("Jogador %d entrou na ilha." % id)
	players_changed.emit()

func _on_peer_disconnected(id: int) -> void:
	if avatars.has(id):
		avatars[id].queue_free()
		avatars.erase(id)
	var n: String = names.get(id, "Jogador %d" % id)
	names.erase(id)
	status.emit("%s saiu." % n)
	players_changed.emit()

# ------------------------------------------------------------------ envio (chamado pelo Player / armas)

func tick(delta: float, p: Node3D, yaw: float, pitch: float, item: String, crouch: bool) -> void:
	if not active or avatars.is_empty():
		return
	_send_t += delta
	if _send_t >= SEND_INTERVAL:
		_send_t = 0.0
		sync_state.rpc(p.global_position, yaw, pitch, item, crouch)

func send_shot(from: Vector3, to: Vector3) -> void:
	if active and not avatars.is_empty():
		fx_shot.rpc(from, to)

func send_look() -> void:
	if active and not avatars.is_empty():
		set_look_rpc.rpc(GameState.look["skin"], GameState.look["shirt"], GameState.look["hat"])

func send_announce(text: String) -> void:
	if active and not avatars.is_empty():
		announce.rpc(text)

# ------------------------------------------------------------------ RPCs

@rpc("any_peer", "unreliable")
func sync_state(pos: Vector3, yaw: float, pitch: float, item: String, crouch: bool) -> void:
	var av: RemotePlayer = avatars.get(multiplayer.get_remote_sender_id())
	if av:
		av.apply_state(pos, yaw, pitch, item, crouch)

@rpc("any_peer", "reliable")
func set_player_name(n: String) -> void:
	var id := multiplayer.get_remote_sender_id()
	n = n.strip_edges().left(16)
	if n == "":
		n = "Jogador %d" % id
	names[id] = n
	if avatars.has(id):
		avatars[id].set_display_name(n)
	players_changed.emit()

@rpc("any_peer", "reliable")
func set_look_rpc(skin: Color, shirt: Color, hat: Color) -> void:
	var av: RemotePlayer = avatars.get(multiplayer.get_remote_sender_id())
	if av:
		av.apply_look(skin, shirt, hat)

@rpc("any_peer", "unreliable")
func fx_shot(from: Vector3, to: Vector3) -> void:
	var scene := get_tree().current_scene
	Fx.tracer(scene, from, to)
	Sfx.play_at("shot", scene, from, -4.0)

@rpc("any_peer", "reliable")
func announce(text: String) -> void:
	var id := multiplayer.get_remote_sender_id()
	GameState.notify.emit("%s %s" % [names.get(id, "Jogador"), text])
