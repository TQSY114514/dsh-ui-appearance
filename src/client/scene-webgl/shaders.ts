/**
 * GLSL Vertex and Fragment Shaders for WebGL 2.0 Scene Engine.
 */

export const BASE_VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texCoord;

uniform mat3 u_matrix;
uniform vec2 u_resolution;

varying vec2 v_texCoord;

void main() {
  vec3 pos = u_matrix * vec3(a_position, 1.0);
  vec2 zeroToOne = pos.xy / u_resolution;
  vec2 clipSpace = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`

export const BASE_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_image;
uniform float u_alpha;
uniform vec3 u_tint;

varying vec2 v_texCoord;

void main() {
  vec4 color = texture2D(u_image, v_texCoord);
  gl_FragColor = vec4(color.rgb * u_tint, color.a * u_alpha);
}
`

export const WATERWAVES_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_image;
uniform float u_time;
uniform float u_strength;
uniform float u_frequency;
uniform float u_alpha;

varying vec2 v_texCoord;

void main() {
  vec2 uv = v_texCoord;
  float wave = sin(uv.y * u_frequency + u_time * 3.0) * (u_strength * 0.015);
  uv.x += wave;
  vec4 color = texture2D(u_image, uv);
  gl_FragColor = vec4(color.rgb, color.a * u_alpha);
}
`

export const PULSE_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_image;
uniform float u_time;
uniform float u_speed;
uniform float u_intensity;
uniform float u_alpha;

varying vec2 v_texCoord;

void main() {
  vec4 color = texture2D(u_image, v_texCoord);
  float pulse = sin(u_time * u_speed) * 0.5 + 0.5;
  vec3 glow = color.rgb * (1.0 + pulse * u_intensity);
  gl_FragColor = vec4(glow, color.a * u_alpha);
}
`

export const FILMGRAIN_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_image;
uniform float u_time;
uniform float u_intensity;
uniform float u_alpha;

varying vec2 v_texCoord;

float random(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec4 color = texture2D(u_image, v_texCoord);
  float noise = (random(v_texCoord + fract(u_time)) - 0.5) * u_intensity;
  gl_FragColor = vec4(color.rgb + noise, color.a * u_alpha);
}
`
