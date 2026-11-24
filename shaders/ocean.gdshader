shader_type spatial;
render_mode cull_disabled, specular_schlick_ggx;

// Oceano: ondas por soma de senos, cor por profundidade (lida de uma textura de alturas do terreno),
// espuma na costa e reflexo de Fresnel.

uniform sampler2D height_tex : filter_linear, repeat_disable;
uniform float world_half = 180.0;
uniform float height_min = -8.0;
uniform float height_max = 8.0;
uniform vec4 deep_color : source_color = vec4(0.01, 0.2, 0.38, 1.0);
uniform vec4 shallow_color : source_color = vec4(0.12, 0.72, 0.72, 1.0);
uniform vec4 foam_color : source_color = vec4(0.95, 0.98, 1.0, 1.0);
uniform float wave_amp = 0.2;
uniform float fade_start = 170.0;
uniform float fade_end = 230.0;
uniform float far_min = 0.0;

varying vec3 world_pos;
varying float fade;

float waves(vec2 p, float t) {
	float h = 0.0;
	h += sin(dot(p, vec2(0.9, 0.4)) * 0.35 + t * 1.1) * 1.0;
	h += sin(dot(p, vec2(-0.5, 0.85)) * 0.55 + t * 1.5) * 0.6;
	h += sin(dot(p, vec2(0.2, -1.0)) * 0.9 + t * 2.1) * 0.3;
	h += sin(dot(p, vec2(-0.95, -0.3)) * 1.7 + t * 2.9) * 0.14;
	return h;
}

void vertex() {
	vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec3 cam = INV_VIEW_MATRIX[3].xyz;
	fade = 1.0 - smoothstep(fade_start, fade_end, distance(wp.xz, cam.xz));
	VERTEX.y += waves(wp.xz, TIME) * wave_amp * fade;
	world_pos = wp;
}

void fragment() {
	if (far_min > 0.0 && distance(world_pos.xz, INV_VIEW_MATRIX[3].xz) < far_min) {
		discard;
	}
	vec2 e = vec2(0.15, 0.0);
	float h0 = waves(world_pos.xz, TIME);
	float hx = waves(world_pos.xz + e.xy, TIME);
	float hz = waves(world_pos.xz + e.yx, TIME);
	vec3 n_world = normalize(vec3(-(hx - h0) / e.x * wave_amp * fade, 1.0, -(hz - h0) / e.x * wave_amp * fade));
	// ondulação fina extra
	vec2 q = world_pos.xz * 2.2 + vec2(TIME * 0.4, -TIME * 0.3);
	n_world.xz += vec2(sin(q.x + sin(q.y * 1.3)), cos(q.y - sin(q.x * 1.1))) * 0.025 * fade;
	n_world = normalize(n_world);
	NORMAL = normalize((VIEW_MATRIX * vec4(n_world, 0.0)).xyz);

	vec2 uv = world_pos.xz / (2.0 * world_half) + 0.5;
	float terrain_h = mix(height_min, height_max, texture(height_tex, uv).r);
	float depth = max(-terrain_h, 0.0);
	float shallow = exp(-depth * 0.55);

	vec3 col = mix(deep_color.rgb, shallow_color.rgb, shallow);
	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 4.0);

	// espuma: faixa fina na arrebentação + cristas
	float edge = 1.0 - smoothstep(0.0, 0.5, depth + 0.1 * sin(world_pos.x * 1.7 + TIME * 1.4) + 0.08 * sin(world_pos.z * 2.3 - TIME));
	float ripple = 0.5 + 0.5 * sin(depth * 14.0 - TIME * 2.2);
	float foam = edge * (0.55 + 0.45 * ripple);
	foam += smoothstep(0.82, 1.0, h0 / 2.0 + 0.5) * 0.12 * fade;

	ALBEDO = mix(col, foam_color.rgb, clamp(foam, 0.0, 1.0));
	ALPHA = clamp(mix(0.5, 0.96, 1.0 - shallow) + foam * 0.5, 0.0, 1.0);
	ROUGHNESS = mix(0.04, 0.5, clamp(foam, 0.0, 1.0));
	METALLIC = 0.0;
	SPECULAR = 0.6 + fres * 0.4;
	EMISSION = shallow_color.rgb * shallow * 0.06;
}
