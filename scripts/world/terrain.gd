class_name Terrain
extends RefCounted
## Terreno procedural: ilhas tropicais sobre o leito do mar.
## Fornece a função de altura (usada pela física, pelos peixes e pela geração de props),
## a malha visual, a colisão (HeightMapShape3D) e a textura de profundidade do oceano.

const WATER_LEVEL := 0.0
const SEABED := -7.0
const HALF := 180.0            ## o mapa vai de -HALF a +HALF em X e Z
const STEP := 1.5              ## espaçamento da grade (m)
const CELLS := 240             ## HALF*2/STEP
const VERTS := CELLS + 1

const ISLANDS: Array[Dictionary] = [
	{"c": Vector2(0, 0), "r": 68.0, "peak": 4.8, "style": "main", "name": "Ilha do Farol"},
	{"c": Vector2(116, -44), "r": 36.0, "peak": 3.6, "style": "forest", "name": "Ilha da Floresta"},
	{"c": Vector2(-104, 66), "r": 36.0, "peak": 2.6, "style": "tropical", "name": "Ilha Tropical"},
	{"c": Vector2(30, 120), "r": 26.0, "peak": 6.5, "style": "cliffs", "name": "Ilha dos Penhascos"},
	{"c": Vector2(-72, -110), "r": 46.0, "peak": 3.4, "style": "volcano", "name": "Ilha do Vulcão"},
]

## Lago da ilha da floresta e vulcão da ilha 5 (usados pela geração e pela história).
const LAKE_CENTER := Vector2(112, -40)
const LAKE_R := 13.0
const VOLCANO_R := 19.0       ## raio do cone
const VOLCANO_TOP := 15.0
const CRATER_FLOOR := 10.5
const CRATER_R := 4.5

static func island_center(i: int) -> Vector2:
	return ISLANDS[i]["c"]

## Índice da ilha mais próxima (relativo ao raio) em (x, z); -1 se longe de todas.
static func island_index_at(x: float, z: float) -> int:
	var best := -1
	var best_d := 1.15
	for i in ISLANDS.size():
		var d := Vector2(x, z).distance_to(ISLANDS[i]["c"]) / float(ISLANDS[i]["r"])
		if d < best_d:
			best_d = d
			best = i
	return best

static var _noise: FastNoiseLite
static var _detail: FastNoiseLite
static var _heights: PackedFloat32Array

static func _init_noise() -> void:
	if _noise != null:
		return
	_noise = FastNoiseLite.new()
	_noise.seed = 7
	_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_noise.frequency = 1.0
	_detail = FastNoiseLite.new()
	_detail.seed = 21
	_detail.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_detail.frequency = 1.0

## Altura "ideal" do terreno em (x, z), calculada diretamente (sem cache).
static func raw_height(x: float, z: float) -> float:
	_init_noise()
	var warp := Vector2(_noise.get_noise_2d(x * 0.02, z * 0.02), _noise.get_noise_2d(x * 0.02 + 100.0, z * 0.02 - 50.0)) * 15.0
	var q := Vector2(x, z) + warp
	var h := SEABED
	for isl in ISLANDS:
		var raw := 1.0 - q.distance_to(isl["c"]) / float(isl["r"])
		if raw <= 0.0:
			continue
		var peak: float = isl["peak"]
		var hh: float
		if raw < 0.35:
			# declive submerso: suave perto da costa (águas rasas largas)
			hh = SEABED * pow(1.0 - raw / 0.35, 1.7)
		else:
			var u := clampf((raw - 0.35) / 0.42, 0.0, 1.0)
			hh = peak * (0.3 * u + 0.7 * smoothstep(0.0, 1.0, u))
			if isl["style"] == "cliffs":
				# penhasco: paredão até um platô plano, com uma rampa voltada para a ilha principal
				var dv := Vector2(x, z) - Vector2(isl["c"])
				var ramp_ang := atan2(-float(isl["c"].y), -float(isl["c"].x))
				var da := absf(angle_difference(atan2(dv.y, dv.x), ramp_ang))
				var rw := smoothstep(0.34, 0.16, da)
				var wall_h := peak * smoothstep(0.35, 0.5, raw)
				var ramp_h := peak * smoothstep(0.30, 0.64, raw)
				hh = lerpf(wall_h, ramp_h, rw)
				h = maxf(h, hh + _detail.get_noise_2d(x * 0.2, z * 0.2) * 0.15 * smoothstep(0.0, 0.6, u))
				continue
			var bump := _detail.get_noise_2d(x * 0.07, z * 0.07) * 0.7 + _noise.get_noise_2d(x * 0.025, z * 0.025) * 1.1
			hh += bump * smoothstep(0.0, 0.6, u)
			hh += peak * 0.35 * smoothstep(0.62, 1.0, raw)
		h = maxf(h, hh)
	# lago na ilha da floresta
	var ld := Vector2(x, z).distance_to(LAKE_CENTER)
	if ld < LAKE_R and h > -3.0:
		h = lerpf(h, -3.2, smoothstep(LAKE_R, LAKE_R * 0.55, ld))
	# vulcão (ilha 5): cone com cratera
	var vd := Vector2(x, z).distance_to(ISLANDS[4]["c"])
	if vd < VOLCANO_R:
		var cone := VOLCANO_TOP * pow(1.0 - vd / VOLCANO_R, 1.15) + 3.0
		if vd < CRATER_R * 2.0:
			var t2 := vd / (CRATER_R * 2.0)
			cone = minf(cone, CRATER_FLOOR + t2 * t2 * (VOLCANO_TOP - CRATER_FLOOR + 2.0))
		h = maxf(h, cone + _detail.get_noise_2d(x * 0.15, z * 0.15) * 0.4)
	return h

static func _ensure_heights() -> void:
	if _heights.size() == VERTS * VERTS:
		return
	_heights.resize(VERTS * VERTS)
	for j in VERTS:
		for i in VERTS:
			_heights[j * VERTS + i] = raw_height(-HALF + i * STEP, -HALF + j * STEP)

## Altura interpolada a partir da grade (é a mesma superfície usada na colisão/visual).
static func height_at(x: float, z: float) -> float:
	_ensure_heights()
	var fx := clampf((x + HALF) / STEP, 0.0, CELLS - 0.001)
	var fz := clampf((z + HALF) / STEP, 0.0, CELLS - 0.001)
	var ix := int(fx)
	var iz := int(fz)
	var tx := fx - ix
	var tz := fz - iz
	var h00 := _heights[iz * VERTS + ix]
	var h10 := _heights[iz * VERTS + ix + 1]
	var h01 := _heights[(iz + 1) * VERTS + ix]
	var h11 := _heights[(iz + 1) * VERTS + ix + 1]
	return lerpf(lerpf(h00, h10, tx), lerpf(h01, h11, tx), tz)

static func depth_at(x: float, z: float) -> float:
	return maxf(WATER_LEVEL - height_at(x, z), 0.0)

static func is_inside_map(p: Vector3, margin: float = 6.0) -> bool:
	return absf(p.x) < HALF - margin and absf(p.z) < HALF - margin

static func _color_for(h: float, slope: float, x: float, z: float) -> Color:
	var n := _detail.get_noise_2d(x * 0.35, z * 0.35) * 0.5
	var idx := island_index_at(x, z)
	var style: String = ISLANDS[idx]["style"] if idx >= 0 else "main"
	if h > 0.4 and style == "volcano":
		var vd := Vector2(x, z).distance_to(ISLANDS[4]["c"])
		var rock := Color(0.2, 0.18, 0.18).lerp(Color(0.32, 0.27, 0.25), clampf(0.5 + n, 0.0, 1.0))
		if vd < CRATER_R * 1.6:
			rock = rock.lerp(Color(0.9, 0.25, 0.05), smoothstep(CRATER_R * 1.6, CRATER_R * 0.9, vd))
		if vd > VOLCANO_R * 0.95 and h < 2.5:
			rock = Color(0.55, 0.5, 0.35)
		return rock
	if h > 1.0 and style == "cliffs":
		return Color(0.5, 0.47, 0.42).lerp(Color(0.38, 0.4, 0.3), clampf(0.5 + n, 0.0, 1.0) * (0.0 if slope > 0.3 else 1.0))
	if h > 0.9 and style == "tropical":
		return Color(0.86, 0.72, 0.42).lerp(Color(0.74, 0.6, 0.34), clampf(0.5 + n, 0.0, 1.0)) if h < 2.0 else Color(0.35, 0.5, 0.2)
	var sand_wet := Color(0.5, 0.42, 0.28)
	var sand := Color(0.78, 0.66, 0.4)
	var grass := Color(0.3, 0.46, 0.2)
	var grass2 := Color(0.4, 0.55, 0.22)
	var rock := Color(0.5, 0.48, 0.44)
	var c: Color
	if h < -1.0:
		c = Color(0.5, 0.52, 0.42).lerp(Color(0.18, 0.3, 0.34), clampf((-h - 1.0) / 5.0, 0.0, 1.0))
	elif h < 0.45:
		c = sand_wet.lerp(sand, smoothstep(-0.2, 0.45, h))
	elif h < 1.5:
		c = sand
		c = c.lerp(grass, smoothstep(1.0 + n, 1.6 + n, h))
	else:
		c = grass.lerp(grass2, clampf(0.5 + n * 2.0, 0.0, 1.0))
	if slope > 0.35 and h > 0.5:
		c = c.lerp(rock, clampf((slope - 0.35) * 2.5, 0.0, 1.0))
	var v := 1.0 + n * 0.12
	return Color(c.r * v, c.g * v, c.b * v)

static func build_mesh() -> ArrayMesh:
	_init_noise()
	_ensure_heights()
	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	var colors := PackedColorArray()
	verts.resize(VERTS * VERTS)
	normals.resize(VERTS * VERTS)
	colors.resize(VERTS * VERTS)
	for j in VERTS:
		for i in VERTS:
			var idx := j * VERTS + i
			var x := -HALF + i * STEP
			var z := -HALF + j * STEP
			var h := _heights[idx]
			var hl := _heights[j * VERTS + maxi(i - 1, 0)]
			var hr := _heights[j * VERTS + mini(i + 1, CELLS)]
			var hu := _heights[maxi(j - 1, 0) * VERTS + i]
			var hd := _heights[mini(j + 1, CELLS) * VERTS + i]
			var n := Vector3(hl - hr, 2.0 * STEP, hu - hd).normalized()
			verts[idx] = Vector3(x, h, z)
			normals[idx] = n
			colors[idx] = _color_for(h, 1.0 - n.y, x, z)
	var indices := PackedInt32Array()
	indices.resize(CELLS * CELLS * 6)
	var k := 0
	for j in CELLS:
		for i in CELLS:
			var a := j * VERTS + i
			var b := a + 1
			var c := a + VERTS
			var d := c + 1
			indices[k] = a; indices[k + 1] = b; indices[k + 2] = c
			indices[k + 3] = b; indices[k + 4] = d; indices[k + 5] = c
			k += 6
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh

## Colisão: HeightMapShape3D tem 1 unidade por célula; o chamador aplica escala STEP em X/Z.
static func build_collision_shape() -> HeightMapShape3D:
	_ensure_heights()
	var shape := HeightMapShape3D.new()
	shape.map_width = VERTS
	shape.map_depth = VERTS
	shape.map_data = _heights.duplicate()
	return shape

const TEX_MIN := -8.0
const TEX_MAX := 8.0
const TEX_SIZE := 256

## Textura de alturas (8 bits, -8..8 m) usada pelo shader do oceano para cor/espuma/transparência.
static func build_height_texture() -> ImageTexture:
	_init_noise()
	var img := Image.create(TEX_SIZE, TEX_SIZE, false, Image.FORMAT_L8)
	for j in TEX_SIZE:
		for i in TEX_SIZE:
			var x := -HALF + (float(i) + 0.5) / TEX_SIZE * HALF * 2.0
			var z := -HALF + (float(j) + 0.5) / TEX_SIZE * HALF * 2.0
			var h := height_at(x, z)
			var v := clampf((h - TEX_MIN) / (TEX_MAX - TEX_MIN), 0.0, 1.0)
			img.set_pixel(i, j, Color(v, v, v, 1.0))
	return ImageTexture.create_from_image(img)

## Procura, a partir de "from" na direção "dir" (XZ), o primeiro ponto em que a altura cai abaixo de "level".
static func find_shore(from: Vector2, dir: Vector2, level: float, max_dist: float = 200.0) -> Vector2:
	var d := dir.normalized()
	var t := 0.0
	var p := from
	while t < max_dist:
		p = from + d * t
		if height_at(p.x, p.y) < level and t > 1.0:
			return p
		t += 0.5
	return p
