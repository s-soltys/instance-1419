export const DREAM_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Full-bleed 2D Expressionist Oil Impasto Degradation Shader.
 * Aspect-corrects the 16:9 oil painting cleanly across any desktop or mobile viewport,
 * preserving rich impasto warmth at high H% and fracturing into localized face-blur,
 * chromatic aberration, Voronoi glass shards, and clinical cyan wireframe telemetry
 * as Humanity is pruned.
 */
export const DREAM_FRAGMENT = /* glsl */ `
precision highp float;

varying vec2 vUv;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uHumanity;    // 0.0..1.0
uniform float uPruned;      // 0.0..1.0
uniform float uOverseer;    // 0.0..1.0
uniform float uViewAspect;  // viewport width / height
uniform float uTexAspect;   // texture width / height
uniform vec2 uFaceAnchor;   // per-persona normalized face center (0..1)

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

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

vec2 coverUv(vec2 uv, float viewAspect, float texAspect) {
  vec2 outUv = uv;
  if (viewAspect > texAspect) {
    float scale = texAspect / viewAspect;
    outUv.y = (uv.y - 0.5) * scale + 0.5;
  } else {
    float scale = viewAspect / texAspect;
    // Anchor slightly left-of-center so the painting's figures stay clearly framed left of the dialogue ribbon
    outUv.x = (uv.x - 0.36) * scale + 0.36;
  }
  return clamp(outUv, 0.002, 0.998);
}

vec3 sampleBlurred(sampler2D tex, vec2 uv, float radius) {
  if (radius <= 0.0005) {
    return texture2D(tex, uv).rgb;
  }
  vec3 acc = texture2D(tex, uv).rgb * 0.20;
  acc += texture2D(tex, clamp(uv + vec2( radius,  0.0), 0.002, 0.998)).rgb * 0.12;
  acc += texture2D(tex, clamp(uv + vec2(-radius,  0.0), 0.002, 0.998)).rgb * 0.12;
  acc += texture2D(tex, clamp(uv + vec2( 0.0,  radius), 0.002, 0.998)).rgb * 0.12;
  acc += texture2D(tex, clamp(uv + vec2( 0.0, -radius), 0.002, 0.998)).rgb * 0.12;
  acc += texture2D(tex, clamp(uv + vec2( radius,  radius) * 0.72, 0.002, 0.998)).rgb * 0.08;
  acc += texture2D(tex, clamp(uv + vec2(-radius,  radius) * 0.72, 0.002, 0.998)).rgb * 0.08;
  acc += texture2D(tex, clamp(uv + vec2( radius, -radius) * 0.72, 0.002, 0.998)).rgb * 0.08;
  acc += texture2D(tex, clamp(uv + vec2(-radius, -radius) * 0.72, 0.002, 0.998)).rgb * 0.08;
  return acc;
}

void main() {
  float h = clamp(uHumanity, 0.0, 1.0);
  float decay = clamp(1.0 - h + uPruned * 0.26, 0.0, 1.0);
  float lowH = clamp(smoothstep(0.55, 0.18, h) + uPruned * 0.35, 0.0, 1.0);

  vec2 uv = coverUv(vUv, uViewAspect, uTexAspect);

  // Subtle organic impasto warmth breathing at high H%
  float warmFactor = smoothstep(0.48, 0.88, h);
  uv.x += sin(uv.y * 9.0 + uTime * 0.38) * 0.0014 * warmFactor;
  uv.y += cos(uv.x * 8.0 + uTime * 0.30) * 0.0011 * warmFactor;

  // Voronoi shard dispersion as H% falls
  float shardAmt = smoothstep(0.42, 0.92, decay);
  vec3 vor = voronoi(uv * mix(7.5, 14.0, shardAmt));
  vec2 cellOffset = (hash22(vor.yz) - 0.5) * 0.055 * shardAmt;
  vec2 sampleUv = clamp(uv + cellOffset, 0.002, 0.998);

  // Subtle glitch tear during low H% or Overseer audit
  float glitchBand = step(0.972, sin(uv.y * 46.0 + uTime * 1.9)) * (shardAmt * 0.014 + uOverseer * 0.006);
  sampleUv.x = clamp(sampleUv.x + glitchBand, 0.002, 0.998);

  // Localized facial/figure blur + mild full-frame defocus + chromatic split at low H%
  float faceMask = smoothstep(0.28, 0.04, length((sampleUv - uFaceAnchor) * vec2(1.05, 0.85)));
  float blurRadius = lowH * (0.0045 + 0.0175 * faceMask);
  vec3 baseCol = sampleBlurred(uTexture, sampleUv, blurRadius);

  if (lowH > 0.05) {
    float chroma = lowH * (0.0022 + 0.0038 * faceMask);
    float rCh = sampleBlurred(uTexture, clamp(sampleUv + vec2(chroma, 0.0), 0.002, 0.998), blurRadius * 0.65).r;
    float bCh = sampleBlurred(uTexture, clamp(sampleUv - vec2(chroma, 0.0), 0.002, 0.998), blurRadius * 0.65).b;
    baseCol = vec3(mix(baseCol.r, rCh, 0.68), baseCol.g, mix(baseCol.b, bCh, 0.68));
  }

  // Warm impasto enhancement at high H% -> cool silver-cyan clinical drain at low H%
  vec3 warmGrade = baseCol * vec3(1.06, 1.01, 0.94) + vec3(0.025, 0.012, 0.0);
  float lum = dot(baseCol, vec3(0.299, 0.587, 0.114));
  vec3 coldGrade = mix(vec3(lum), vec3(lum * 0.76, lum * 0.95, lum * 1.14), 0.78) * 0.88;
  vec3 col = mix(warmGrade, coldGrade, smoothstep(0.20, 0.84, decay));

  // Softly smudge/wash facial region toward cool static when heavily blurred
  col = mix(col, vec3(lum * 0.72, lum * 0.86, lum * 1.02), faceMask * lowH * 0.28);

  // Shard fracture edges & subtle geometric wireframe telemetry at low H%
  float crack = smoothstep(0.48, 0.64, vor.x) * shardAmt;
  col = mix(col, vec3(0.04, 0.08, 0.13), crack * 0.62);

  vec2 gridUv = abs(fract(vUv * vec2(22.0, 12.0)) - 0.5);
  float wire = (1.0 - smoothstep(0.0, 0.018, min(gridUv.x, gridUv.y))) * smoothstep(0.48, 0.95, decay);
  col += vec3(0.44, 0.80, 0.96) * wire * 0.20;

  // Gentle vignette keeping the painting grounded and readable under floating typography
  float vig = smoothstep(1.05, 0.34, length((vUv - vec2(0.42, 0.5)) * vec2(1.15, 1.05)));
  col *= mix(0.56, 1.0, vig);

  // Overseer Audit interrogation dimming, clinical desaturation & razor-thin telemetry bars
  if (uOverseer > 0.01) {
    float scan = sin(vUv.y * 320.0 + uTime * 2.4) * 0.018 * uOverseer;
    float desat = dot(col, vec3(0.3, 0.59, 0.11));
    col = mix(col, vec3(desat * 0.62, desat * 0.72, desat * 0.82) + scan, uOverseer * 0.68);
    float topLine = smoothstep(0.003, 0.0, abs(vUv.y - 0.935));
    float botLine = smoothstep(0.003, 0.0, abs(vUv.y - 0.065));
    col = mix(col, vec3(0.84, 0.93, 1.0), clamp(topLine + botLine, 0.0, 1.0) * uOverseer * 0.75);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;
