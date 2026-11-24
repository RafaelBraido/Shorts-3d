shader_type sky;

// Céu tropical: gradiente, disco solar e nuvens por ruído fractal.

uniform vec3 top_color : source_color = vec3(0.12, 0.38, 0.82);
uniform vec3 horizon_color : source_color = vec3(0.72, 0.87, 0.97);
uniform vec3 ground_color : source_color = vec3(0.35, 0.5, 0.6);
uniform vec3 sun_dir = vec3(0.4, 0.7, 0.5);
uniform vec3 sun_color : source_color = vec3(1.0, 0.95, 0.8);
uniform float cloud_cover = 0.5;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float fbm(vec2 p) {
	float a = 0.5;
	float s = 0.0;
	for (int i = 0; i < 5; i++) {
		s += a * vnoise(p);
		p *= 2.03;
		a *= 0.5;
	}
	return s;
}

void sky() {
	vec3 d = normalize(EYEDIR);
	vec3 col;
	if (d.y >= 0.0) {
		col = mix(horizon_color, top_color, pow(d.y, 0.55));
		float sd = max(dot(d, normalize(sun_dir)), 0.0);
		col += sun_color * (pow(sd, 600.0) * 3.0 + pow(sd, 12.0) * 0.18);
		vec2 p = d.xz / (d.y + 0.12) * 0.7 + vec2(TIME * 0.008, 0.0);
		float c = fbm(p * 1.3);
		float cloud = smoothstep(1.0 - cloud_cover, 1.0 - cloud_cover + 0.28, c);
		cloud *= smoothstep(0.0, 0.18, d.y);
		vec3 cloud_col = mix(vec3(0.82, 0.86, 0.92), vec3(1.0), smoothstep(0.3, 0.8, c));
		col = mix(col, cloud_col, cloud * 0.92);
	} else {
		col = mix(horizon_color, ground_color, smoothstep(0.0, 0.3, -d.y));
	}
	COLOR = col;
}
