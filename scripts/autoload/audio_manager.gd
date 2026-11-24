extends Node
## Gerenciador de áudio. Todos os sons são sintetizados em código (AudioStreamWAV),
## então o projeto não depende de arquivos de áudio externos. Autoload "Sfx".

const RATE := 22050

var sounds: Dictionary = {}
var _pool: Array[AudioStreamPlayer] = []
var _ambient_ocean: AudioStreamPlayer
var _ambient_wind: AudioStreamPlayer
var _rng := RandomNumberGenerator.new()
var _bird_timer := 4.0

func _ready() -> void:
	_rng.seed = 1234
	_build_sounds()
	for i in 12:
		var p := AudioStreamPlayer.new()
		p.bus = &"Master"
		add_child(p)
		_pool.append(p)
	_ambient_ocean = _loop_player("ocean", -9.0)
	_ambient_wind = _loop_player("wind", -18.0)

func _loop_player(key: String, db: float) -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	p.stream = sounds[key]
	p.volume_db = db
	add_child(p)
	p.play()
	return p

func _process(delta: float) -> void:
	_bird_timer -= delta
	if _bird_timer <= 0.0:
		_bird_timer = _rng.randf_range(5.0, 14.0)
		play("gull", -16.0, _rng.randf_range(0.85, 1.2))

## Toca um som 2D (UI / arma na mão / ambiente). Retorna o player usado.
func play(key: String, volume_db: float = 0.0, pitch: float = 1.0) -> AudioStreamPlayer:
	if not sounds.has(key):
		push_warning("Som inexistente: " + key)
		return null
	var p: AudioStreamPlayer = null
	for c in _pool:
		if not c.playing:
			p = c
			break
	if p == null:
		p = _pool[0]
	p.stream = sounds[key]
	p.volume_db = volume_db
	p.pitch_scale = pitch
	p.play()
	return p

## Toca um som posicional 3D que se libera sozinho.
func play_at(key: String, parent: Node, pos: Vector3, volume_db: float = 0.0, pitch: float = 1.0) -> void:
	if not sounds.has(key):
		return
	var p := AudioStreamPlayer3D.new()
	p.stream = sounds[key]
	p.volume_db = volume_db
	p.pitch_scale = pitch
	p.unit_size = 6.0
	p.max_distance = 120.0
	parent.add_child(p)
	p.global_position = pos
	p.finished.connect(p.queue_free)
	p.play()

# ---------------------------------------------------------------- síntese

func _make(samples: PackedFloat32Array, loop: bool = false) -> AudioStreamWAV:
	var s := AudioStreamWAV.new()
	s.format = AudioStreamWAV.FORMAT_16_BITS
	s.mix_rate = RATE
	s.stereo = false
	var bytes := PackedByteArray()
	bytes.resize(samples.size() * 2)
	for i in samples.size():
		bytes.encode_s16(i * 2, int(clampf(samples[i], -1.0, 1.0) * 32000.0))
	s.data = bytes
	if loop:
		s.loop_mode = AudioStreamWAV.LOOP_FORWARD
		s.loop_begin = 0
		s.loop_end = samples.size()
	return s

func _buf(seconds: float) -> PackedFloat32Array:
	var a := PackedFloat32Array()
	a.resize(int(seconds * RATE))
	return a

func _noise() -> float:
	return _rng.randf() * 2.0 - 1.0

func _build_sounds() -> void:
	# Tiro de rifle: estalo de ruído + "thump" grave com decaimento rápido.
	var a := _buf(0.7)
	var lp := 0.0
	for i in a.size():
		var t := float(i) / RATE
		lp += (_noise() - lp) * 0.35
		var crack := lp * exp(-t * 28.0)
		var boom := sin(TAU * (90.0 - 40.0 * minf(t * 4.0, 1.0)) * t) * exp(-t * 9.0)
		var tail := _noise() * 0.18 * exp(-t * 6.0)
		a[i] = (crack * 1.1 + boom * 0.9 + tail) * 0.9
	sounds["shot"] = _make(a)

	# Clique do gatilho sem munição.
	a = _buf(0.08)
	for i in a.size():
		var t := float(i) / RATE
		a[i] = _noise() * exp(-t * 90.0) * 0.5
	sounds["dry"] = _make(a)

	# Recarga: dois cliques metálicos.
	a = _buf(0.5)
	for i in a.size():
		var t := float(i) / RATE
		var c1 := _noise() * exp(-t * 70.0)
		var t2 := maxf(t - 0.28, 0.0)
		var c2 := (_noise() * 0.6 + sin(TAU * 1800.0 * t2) * 0.4) * exp(-t2 * 60.0) if t > 0.28 else 0.0
		a[i] = (c1 + c2) * 0.5
	sounds["reload"] = _make(a)

	# Respingo na água.
	a = _buf(0.6)
	lp = 0.0
	for i in a.size():
		var t := float(i) / RATE
		lp += (_noise() - lp) * (0.15 + 0.5 * exp(-t * 8.0))
		a[i] = lp * (1.0 - exp(-t * 90.0)) * exp(-t * 6.5) * 1.4
	sounds["splash"] = _make(a)

	# Lançamento da linha (whoosh).
	a = _buf(0.45)
	lp = 0.0
	for i in a.size():
		var t := float(i) / RATE
		var env := sin(PI * t / 0.45)
		lp += (_noise() - lp) * (0.05 + 0.25 * env)
		a[i] = lp * env * 1.6
	sounds["cast"] = _make(a)

	# Carretilha: clique curto.
	a = _buf(0.05)
	for i in a.size():
		var t := float(i) / RATE
		a[i] = (_noise() * 0.5 + sin(TAU * 900.0 * t) * 0.5) * exp(-t * 110.0) * 0.5
	sounds["reel"] = _make(a)

	# Peixe mordeu: dois "pings".
	a = _buf(0.5)
	for i in a.size():
		var t := float(i) / RATE
		var t2 := maxf(t - 0.18, 0.0)
		var p1 := sin(TAU * 1320.0 * t) * exp(-t * 14.0)
		var p2 := sin(TAU * 1760.0 * t2) * exp(-t2 * 14.0) if t > 0.18 else 0.0
		a[i] = (p1 + p2) * 0.5
	sounds["bite"] = _make(a)

	# Captura: arpejo ascendente.
	a = _buf(1.0)
	var notes := [523.25, 659.25, 783.99, 1046.5]
	for i in a.size():
		var t := float(i) / RATE
		var v := 0.0
		for n in notes.size():
			var tn := t - n * 0.11
			if tn > 0.0:
				v += (sin(TAU * notes[n] * tn) + 0.3 * sin(TAU * notes[n] * 2.0 * tn)) * exp(-tn * 4.5)
		a[i] = v * 0.22
	sounds["catch"] = _make(a)

	# Moedas.
	a = _buf(0.35)
	for i in a.size():
		var t := float(i) / RATE
		var t2 := maxf(t - 0.07, 0.0)
		var v := sin(TAU * 1568.0 * t) * exp(-t * 20.0)
		if t > 0.07:
			v += sin(TAU * 2093.0 * t2) * exp(-t2 * 14.0)
		a[i] = v * 0.4
	sounds["coin"] = _make(a)

	# Linha arrebentou / peixe escapou.
	a = _buf(0.4)
	for i in a.size():
		var t := float(i) / RATE
		a[i] = sin(TAU * (500.0 - 380.0 * t / 0.4) * t) * exp(-t * 6.0) * 0.45 + _noise() * exp(-t * 40.0) * 0.3
	sounds["fail"] = _make(a)

	# Passo na areia.
	a = _buf(0.18)
	lp = 0.0
	for i in a.size():
		var t := float(i) / RATE
		lp += (_noise() - lp) * 0.22
		a[i] = lp * (1.0 - exp(-t * 200.0)) * exp(-t * 22.0) * 0.8
	sounds["step"] = _make(a)

	# Impacto da bala em superfície sólida.
	a = _buf(0.25)
	for i in a.size():
		var t := float(i) / RATE
		a[i] = (_noise() * 0.6 + sin(TAU * 220.0 * t) * 0.4) * exp(-t * 35.0) * 0.7
	sounds["impact"] = _make(a)

	# Gaivota (varredura de frequência com vibrato).
	a = _buf(0.7)
	for i in a.size():
		var t := float(i) / RATE
		var f := 1500.0 + 700.0 * sin(PI * minf(t / 0.3, 1.0)) - 400.0 * maxf(t - 0.3, 0.0)
		var env := sin(PI * minf(t / 0.7, 1.0))
		a[i] = (sin(TAU * f * t) + 0.4 * sin(TAU * f * 2.0 * t)) * env * (0.7 + 0.3 * sin(TAU * 28.0 * t)) * 0.3
	sounds["gull"] = _make(a)

	# Motor de barco (laço de 1 s com ciclos inteiros: 55 Hz + harmônicos + ruído)
	a = _buf(1.0)
	for i in a.size():
		var t := float(i) / RATE
		var saw := fposmod(t * 55.0, 1.0) * 2.0 - 1.0
		a[i] = saw * 0.35 + sin(TAU * 110.0 * t) * 0.25 + sin(TAU * 27.0 * t) * 0.25 + _noise() * 0.06
	sounds["motor"] = _make(a, true)

	# Ondas do oceano (laço contínuo): ruído filtrado modulado, com emenda suave.
	sounds["ocean"] = _make(_loop_noise(6.0, 0.045, 0.5, 0.35), true)
	# Vento (laço contínuo).
	sounds["wind"] = _make(_loop_noise(5.0, 0.02, 0.8, 0.2), true)

## Ruído passa-baixa com envelope lento; o final é misturado ao início para o laço não estalar.
func _loop_noise(seconds: float, cutoff: float, mod_hz: float, depth: float) -> PackedFloat32Array:
	var fade := int(0.5 * RATE)
	var total := int(seconds * RATE)
	var raw := PackedFloat32Array()
	raw.resize(total + fade)
	var lp := 0.0
	for i in raw.size():
		lp += (_noise() - lp) * cutoff
		raw[i] = lp
	var out := PackedFloat32Array()
	out.resize(total)
	for i in total:
		var v := raw[i]
		if i < fade:
			var w := float(i) / fade
			v = raw[i] * w + raw[total + i] * (1.0 - w)
		var t := float(i) / RATE
		# mod_hz é ajustado a um número inteiro de ciclos para fechar o laço
		var cycles := roundf(mod_hz * seconds)
		var env := 1.0 - depth + depth * sin(TAU * cycles * t / seconds)
		out[i] = v * env * 6.0
	return out
