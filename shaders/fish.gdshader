shader_type spatial;
render_mode cull_disabled;

// Peixe: o modelo tem comprimento 1 no eixo Z (nariz em +Z, cauda em -Z).
// O vertex shader faz uma onda lateral que cresce em direção à cauda.

uniform float swim_speed = 6.0;
uniform float phase = 0.0;
uniform float amp = 0.1;
uniform float sheen = 0.45;

void vertex() {
	float k = smoothstep(0.3, -0.5, VERTEX.z);
	VERTEX.x += sin(TIME * swim_speed + phase + VERTEX.z * 7.0) * amp * k * k * 1.6;
	// leve guinada do corpo inteiro
	VERTEX.x += sin(TIME * swim_speed + phase) * amp * 0.12 * (0.5 - VERTEX.z);
}

void fragment() {
	ALBEDO = COLOR.rgb;
	ROUGHNESS = 0.32;
	SPECULAR = sheen;
	METALLIC = 0.15;
	RIM = 0.25;
	RIM_TINT = 0.5;
}
