extends OmniLight3D
## Luz de fogo que pisca de forma orgânica.

var _base := 1.6
var _t := 0.0
var _seed := 0.0

func _ready() -> void:
	_base = 1.6
	_seed = randf() * 100.0
	shadow_enabled = false

func _process(delta: float) -> void:
	_t += delta
	light_energy = _base * (0.75 + 0.25 * sin(_t * 11.0 + _seed) * sin(_t * 7.3 + _seed * 0.7) + 0.1 * sin(_t * 23.0))
