class_name QuestBeacon
extends Node3D
## Feixe de luz amarelo no objetivo atual da missão (visível de longe, some quando o jogador chega perto).

var _mesh: MeshInstance3D
var _t := 0.0

func _ready() -> void:
	_mesh = MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 0.5
	cm.bottom_radius = 0.9
	cm.height = 160.0
	cm.radial_segments = 10
	cm.rings = 1
	_mesh.mesh = cm
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = Color(1.0, 0.85, 0.25, 0.28)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	_mesh.material_override = m
	_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_mesh.position.y = 80.0
	add_child(_mesh)
	visible = false

func _process(delta: float) -> void:
	_t -= delta
	if _t > 0.0:
		return
	_t = 0.4
	var pos := Story.objective_pos()
	var player := get_tree().get_first_node_in_group("player") as Node3D
	if pos == Vector3.INF or player == null:
		visible = false
		return
	global_position = Vector3(pos.x, maxf(Terrain.height_at(pos.x, pos.z), 0.0), pos.z)
	var d := Vector2(player.global_position.x - pos.x, player.global_position.z - pos.z).length()
	visible = d > 9.0
