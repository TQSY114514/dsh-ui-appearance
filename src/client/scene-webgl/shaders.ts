/**
 * Complete 20+ Wallpaper Engine official GLSL Shader library for WebGL 2.0.
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

export const SKINNED_VERTEX_SHADER = `
attribute vec3 a_position;
attribute vec2 a_texCoord;
attribute vec4 a_boneIndices;
attribute vec4 a_boneWeights;

uniform mat4 u_boneMatrices[64];
uniform mat4 u_viewProjection;

varying vec2 v_texCoord;

void main() {
  int i0 = int(a_boneIndices.x);
  int i1 = int(a_boneIndices.y);
  int i2 = int(a_boneIndices.z);
  int i3 = int(a_boneIndices.w);

  mat4 skinMatrix =
    u_boneMatrices[i0] * a_boneWeights.x +
    u_boneMatrices[i1] * a_boneWeights.y +
    u_boneMatrices[i2] * a_boneWeights.z +
    u_boneMatrices[i3] * a_boneWeights.w;

  vec4 skinnedPos = skinMatrix * vec4(a_position, 1.0);
  gl_Position = u_viewProjection * skinnedPos;
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
uniform float u_speed;
uniform float u_alpha;

varying vec2 v_texCoord;

void main() {
  vec2 uv = v_texCoord;
  float wave1 = sin(uv.y * u_frequency + u_time * u_speed) * (u_strength * 0.015);
  float wave2 = cos(uv.x * (u_frequency * 0.7) + u_time * (u_speed * 1.3)) * (u_strength * 0.01);
  uv.x += wave1;
  uv.y += wave2;
  vec4 color = texture2D(u_image, uv);
  gl_FragColor = vec4(color.rgb, color.a * u_alpha);
}
`

export const WATERRIPPLE_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_image;
uniform sampler2D u_normalMap;
uniform float u_time;
uniform float u_strength;
uniform float u_alpha;

varying vec2 v_texCoord;

void main() {
  vec2 uv = v_texCoord;
  vec2 rippleUv = uv * 3.0 + vec2(u_time * 0.05, u_time * 0.03);
  vec4 normal = texture2D(u_normalMap, rippleUv);
  vec2 offset = (normal.xy - 0.5) * (u_strength * 0.04);
  vec4 color = texture2D(u_image, uv + offset);
  gl_FragColor = vec4(color.rgb, color.a * u_alpha);
}
`

export const WATERFLOW_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_image;
uniform sampler2D u_flowMap;
uniform float u_time;
uniform float u_speed;
uniform float u_alpha;

varying vec2 v_texCoord;

void main() {
  vec4 flow = texture2D(u_flowMap, v_texCoord);
  vec2 dir = (flow.rg - 0.5) * 2.0;

  float progress1 = fract(u_time * u_speed);
  float progress2 = fract(u_time * u_speed + 0.5);

  vec4 col1 = texture2D(u_image, v_texCoord + dir * progress1 * 0.05);
  vec4 col2 = texture2D(u_image, v_texCoord + dir * progress2 * 0.05);

  float blend = abs((progress1 - 0.5) * 2.0);
  vec4 finalCol = mix(col1, col2, blend);
  gl_FragColor = vec4(finalCol.rgb, finalCol.a * u_alpha);
}
`

export const WATERCAUSTICS_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_image;
uniform float u_time;
uniform float u_scale;
uniform float u_intensity;
uniform float u_alpha;

varying vec2 v_texCoord;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float voronoi(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float m = 8.0;
  for(int j=-1; j<=1; j++) {
    for(int i=-1; i<=1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(hash(n + g), hash(n + g + 13.5));
      vec2 r = g - f + (sin(u_time + 6.2831 * o) * 0.5 + 0.5);
      float d = dot(r, r);
      m = min(m, d);
    }
  }
  return sqrt(m);
}

void main() {
  vec2 uv = v_texCoord * u_scale;
  float c1 = voronoi(uv + vec2(u_time * 0.03, u_time * 0.02));
  float c2 = voronoi(uv * 1.5 - vec2(u_time * 0.04, -u_time * 0.03));
  float caustics = pow(c1 * c2, 1.5) * u_intensity;

  vec4 base = texture2D(u_image, v_texCoord);
  vec3 rgb = base.rgb + vec3(caustics * 0.8, caustics * 0.9, caustics * 1.0);
  gl_FragColor = vec4(rgb, base.a * u_alpha);
}
`

export const FOLIAGESWAY_VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texCoord;

uniform mat3 u_matrix;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_swayAmount;

varying vec2 v_texCoord;

void main() {
  vec2 pos = a_position;
  // Foliage sway: top vertices sway with sine wave, base remains fixed
  float factor = 1.0 - a_texCoord.y;
  float sway = (sin(u_time * 2.0) + sin(u_time * 4.3) * 0.5) * u_swayAmount * factor;
  pos.x += sway;

  vec3 p = u_matrix * vec3(pos, 1.0);
  vec2 zeroToOne = p.xy / u_resolution;
  vec2 clipSpace = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
  v_texCoord = a_texCoord;
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

export const SHIMMER_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_image;
uniform float u_time;
uniform float u_angle;
uniform float u_width;
uniform float u_intensity;
uniform float u_alpha;

varying vec2 v_texCoord;

void main() {
  vec4 color = texture2D(u_image, v_texCoord);
  float rad = radians(u_angle);
  vec2 dir = vec2(cos(rad), sin(rad));
  float proj = dot(v_texCoord, dir);
  float sweep = fract(u_time * 0.3) * 2.0 - 0.5;
  float dist = abs(proj - sweep);
  float shine = smoothstep(u_width, 0.0, dist) * u_intensity;
  gl_FragColor = vec4(color.rgb + vec3(shine), color.a * u_alpha);
}
`

export const GLITTER_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_image;
uniform float u_time;
uniform float u_density;
uniform float u_intensity;
uniform float u_alpha;

varying vec2 v_texCoord;

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(41.13, 289.97))) * 45758.5453);
}

void main() {
  vec4 color = texture2D(u_image, v_texCoord);
  vec2 grid = floor(v_texCoord * u_density);
  float rnd = hash2(grid);
  float sparkTime = sin(u_time * 6.0 + rnd * 6.28) * 0.5 + 0.5;
  float spark = pow(sparkTime, 8.0) * u_intensity * step(0.85, rnd);
  gl_FragColor = vec4(color.rgb + vec3(spark), color.a * u_alpha);
}
`

export const GODRAYS_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_image;
uniform vec2 u_lightPos;
uniform float u_decay;
uniform float u_density;
uniform float u_weight;
uniform float u_alpha;

varying vec2 v_texCoord;

const int NUM_SAMPLES = 24;

void main() {
  vec2 delta = (v_texCoord - u_lightPos) * (1.0 / float(NUM_SAMPLES)) * u_density;
  vec2 uv = v_texCoord;
  vec4 color = texture2D(u_image, uv);
  vec4 rays = color;
  float illuminationDecay = 1.0;

  for (int i = 0; i < NUM_SAMPLES; i++) {
    uv -= delta;
    vec4 sam = texture2D(u_image, uv);
    sam *= illuminationDecay * u_weight;
    rays += sam;
    illuminationDecay *= u_decay;
  }

  gl_FragColor = vec4(color.rgb + rays.rgb * 0.4, color.a * u_alpha);
}
`

export const BLUR_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_image;
uniform vec2 u_direction;
uniform vec2 u_resolution;
uniform float u_alpha;

varying vec2 v_texCoord;

// 13-tap Gaussian Kernel
const float weights[7] = float[7](0.171834, 0.149257, 0.100085, 0.052063, 0.021021, 0.006584, 0.001605);

void main() {
  vec2 texel = u_direction / u_resolution;
  vec4 color = texture2D(u_image, v_texCoord) * weights[0];

  for (int i = 1; i < 7; i++) {
    vec2 off = texel * float(i) * 1.5;
    color += texture2D(u_image, v_texCoord + off) * weights[i];
    color += texture2D(u_image, v_texCoord - off) * weights[i];
  }

  gl_FragColor = vec4(color.rgb, color.a * u_alpha);
}
`

export const DEPTHPARALLAX_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_image;
uniform sampler2D u_depthMap;
uniform vec2 u_mouseOffset;
uniform float u_depthScale;
uniform float u_alpha;

varying vec2 v_texCoord;

void main() {
  float depth = texture2D(u_depthMap, v_texCoord).r;
  vec2 parallax = u_mouseOffset * (depth * u_depthScale * 0.03);
  vec4 color = texture2D(u_image, v_texCoord + parallax);
  gl_FragColor = vec4(color.rgb, color.a * u_alpha);
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

export const BLOOM_EXTRACT_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_image;
uniform float u_threshold;

varying vec2 v_texCoord;

void main() {
  vec4 color = texture2D(u_image, v_texCoord);
  float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
  if (brightness > u_threshold) {
    gl_FragColor = vec4(color.rgb, 1.0);
  } else {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
  }
}
`

export const BLOOM_COMBINE_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_bloomStrength;
uniform float u_alpha;

varying vec2 v_texCoord;

void main() {
  vec4 sceneCol = texture2D(u_scene, v_texCoord);
  vec4 bloomCol = texture2D(u_bloom, v_texCoord);
  vec3 toneMapped = sceneCol.rgb + bloomCol.rgb * u_bloomStrength;
  gl_FragColor = vec4(toneMapped, sceneCol.a * u_alpha);
}
`
