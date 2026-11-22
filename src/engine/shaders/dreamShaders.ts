export const DREAM_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * 2D Painterly Dream Degradation Shader driven live by Humanity (uHumanity 0..1),
 * Pruned scar state (uPruned 0..1), and Overseer Audit Interrupt (uOverseer 0..1).
 * High H%: warm impasto oil brushwork & golden amber glow.
 * Mid  H%: muted patina, thinning strokes, faint canvas weave.
 * Low  H%: Voronoi shard fracturing, cold cyan-silver monochrome & telemetry wireframe bleed.
 */
export const DREAM_FRAGMENT = /* glsl */ `
precision highp float;

varying vec2 vUv;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uHumanity;  // 0.0..1.0
uniform float uPruned;    // 0.0..1.0
uniform float uOverseer;  // 0.0..1.0

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// Voronoi cell returns vec3(minDist, cellIdX, cellIdY)
vec3 voronoi(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float md = 8.0;
  vec2 cellId = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md) {
        md = d;
        cellId = n + g;
      }
    }
  }
  return vec3(sqrt(md), cellId);
}

void main() {
  float h = clamp(uHumanity, 0.0, 1.0);
  float decay = clamp(1.0 - h + uPruned * 0.28, 0.0, 1.0);

  vec2 uv = vUv;

  // Warm impasto organic breathing at high H%
  float warmFactor = smoothstep(0.45, 0.85, h);
  uv.x += sin(uv.y * 12.0 + uTime * 0.45) * 0.0022 * warmFactor;
  uv.y += cos(uv.x * 10.0 + uTime * 0.35) * 0.0018 * warmFactor;

  // Voronoi shard dispersion as H% falls below 55%
  float shardAmt = smoothstep(0.40, 0.92, decay);
  vec3 vor = voronoi(uv * mix(8.0, 15.0, shardAmt));
  vec2 cellOffset = (hash22(vor.yz) - 0.5) * 0.065 * shardAmt;
  vec2 sampleUv = clamp(uv + cellOffset, 0.002, 0.998);

  // Subtle horizontal glitch tear during low H% or Overseer interrupt
  float glitchBand = step(0.96, sin(uv.y * 42.0 + uTime * 2.1)) * (shardAmt * 0.018 + uOverseer * 0.008);
  sampleUv.x = clamp(sampleUv.x + glitchBand, 0.002, 0.998);

  vec3 baseCol = texture2D(uTexture, sampleUv).rgb;

  // Painterly canvas grain & brushstroke relief
  float weave = sin(uv.x * 320.0) * sin(uv.y * 320.0) * 0.025 * mix(0.6, 1.4, decay);
  baseCol += weave;

  // Color grading: warm amber oil at high H% -> cool slate -> sterile cold cyan-silver at low H%
  vec3 warmGrade = baseCol * vec3(1.12, 1.02, 0.86) + vec3(0.045, 0.022, 0.0);
  float lum = dot(baseCol, vec3(0.299, 0.587, 0.114));
  vec3 coldGrade = mix(vec3(lum), vec3(lum * 0.78, lum * 0.95, lum * 1.12), 0.75) * 0.92;
  vec3 col = mix(warmGrade, coldGrade, smoothstep(0.15, 0.82, decay));

  // Shard fracture cracks & wireframe telemetry bleed at low H%
  float crack = smoothstep(0.46, 0.62, vor.x) * shardAmt;
  col = mix(col, vec3(0.06, 0.11, 0.17), crack * 0.65);

  vec2 gridUv = abs(fract(uv * vec2(18.0, 11.0)) - 0.5);
  float wire = (1.0 - smoothstep(0.0, 0.025, min(gridUv.x, gridUv.y))) * smoothstep(0.45, 0.95, decay);
  col += vec3(0.42, 0.78, 0.95) * wire * 0.24;

  // Soft vignette (warmer at high H%, tighter clinical frame during Overseer audit)
  float vig = smoothstep(0.95, 0.28, length((vUv - 0.5) * vec2(1.15, 1.05)));
  col *= mix(0.48, 1.0, vig);

  // Overseer clinical slice & scanlines when audit is active
  if (uOverseer > 0.01) {
    float scan = sin(vUv.y * 280.0 + uTime * 3.0) * 0.03 * uOverseer;
    float desat = dot(col, vec3(0.3, 0.59, 0.11));
    col = mix(col, vec3(desat * 0.88, desat * 0.96, desat * 1.04) + scan, uOverseer * 0.52);
    float bar = step(0.91, vUv.y) + step(vUv.y, 0.09);
    col = mix(col, vec3(0.04, 0.06, 0.09), clamp(bar, 0.0, 1.0) * uOverseer * 0.78);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;
