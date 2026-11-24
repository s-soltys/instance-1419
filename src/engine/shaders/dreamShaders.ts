export const DREAM_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Full-bleed 2D Expressionist Oil Impasto Degradation Shader.
 * Supports Ink-driven camera zoom/pan, procedural face-anchored parallax,
 * FBM oil-wash entrance dissolve, sunlit dust motes at high H%,
 * unannounced Overseer scanner-sweep, visceral Hold-to-Prune Voronoi shear,
 * and faint cyan horizon wireframe bleeding into the ceiling at low H%.
 */
export const DREAM_FRAGMENT = /* glsl */ `
precision highp float;

varying vec2 vUv;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uHumanity;     // 0.0..1.0
uniform float uPruned;       // 0.0..1.0
uniform float uOverseer;     // 0.0..1.0
uniform float uViewAspect;   // viewport width / height
uniform float uTexAspect;    // texture width / height
uniform vec2 uFaceAnchor;    // per-persona normalized face center (0..1)
uniform vec2 uParallax;      // subtle pointer/breathing parallax (-0.02..0.02)
uniform float uCamZoom;      // 1.0..1.28
uniform vec2 uCamPan;        // normalized pan offset
uniform float uDissolve;     // 0.0 (dark void) -> 1.0 (full oil painting)
uniform float uAuditSweep;   // 0.0..1.0 vertical scanner sweep progress
uniform float uPruneShock;   // 0.0..1.0 Voronoi fracture & shear envelope
uniform float uMoodWarmth;   // -1.0 (cold) .. +1.0 (warm)
uniform float uMoodDim;      // 0.0..0.6
uniform float uBeatPulse;    // 0.0..1.0 transient face-slip / shudder

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise2d(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
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
  float decay = clamp(1.0 - h + uPruned * 0.26 + uPruneShock * 0.45, 0.0, 1.0);
  float lowH = clamp(smoothstep(0.55, 0.18, h) + uPruned * 0.35 + uPruneShock * 0.55, 0.0, 1.0);

  vec2 baseUv = coverUv(vUv, uViewAspect, uTexAspect);

  // Camera zoom/pan centered cleanly left of the dialogue ribbon
  vec2 camPivot = vec2(0.38, 0.58) + uCamPan;
  vec2 uv = (baseUv - camPivot) / max(0.85, uCamZoom) + camPivot;

  // Depth-approximate parallax around foreground face anchor vs background walls
  float fgWeight = smoothstep(0.52, 0.08, length(uv - uFaceAnchor));
  uv += uParallax * mix(0.35, 1.15, fgWeight);
  uv = clamp(uv, 0.002, 0.998);

  // Subtle organic impasto warmth breathing (freezes during Overseer inspection)
  float freeze = 1.0 - smoothstep(0.1, 0.5, uOverseer);
  float warmFactor = smoothstep(0.42, 0.88, h) * freeze;
  uv.x += sin(uv.y * 9.0 + uTime * 0.38) * 0.0016 * warmFactor;
  uv.y += cos(uv.x * 8.0 + uTime * 0.30) * 0.0012 * warmFactor;

  // Voronoi shard dispersion from low H% or Hold-to-Prune shock
  float shardAmt = clamp(smoothstep(0.42, 0.92, decay) + uPruneShock * 0.72, 0.0, 1.0);
  vec3 vor = voronoi(uv * mix(7.5, 15.0, shardAmt));
  vec2 cellOffset = (hash22(vor.yz) - 0.5) * (0.055 * shardAmt + 0.035 * uPruneShock);
  vec2 sampleUv = clamp(uv + cellOffset, 0.002, 0.998);

  // Glitch tear during low H%, Overseer audit, or beat shudder
  float glitchBand = step(0.968, sin(uv.y * 46.0 + uTime * 1.9)) *
    (shardAmt * 0.014 + uOverseer * 0.006 + uBeatPulse * 0.018);
  sampleUv.x = clamp(sampleUv.x + glitchBand, 0.002, 0.998);

  // Localized facial/figure blur + Beat pulse face-slip
  float faceMask = smoothstep(0.28, 0.04, length((sampleUv - uFaceAnchor) * vec2(1.05, 0.85)));
  float blurRadius = lowH * (0.0045 + 0.0175 * faceMask) + uBeatPulse * (0.016 * faceMask + 0.003);
  vec3 baseCol = sampleBlurred(uTexture, sampleUv, blurRadius);

  if (lowH > 0.05 || uPruneShock > 0.05 || uBeatPulse > 0.05) {
    float chroma = (lowH + uPruneShock * 0.9 + uBeatPulse * 0.8) * (0.0022 + 0.0042 * faceMask);
    float rCh = sampleBlurred(uTexture, clamp(sampleUv + vec2(chroma, 0.0), 0.002, 0.998), blurRadius * 0.65).r;
    float bCh = sampleBlurred(uTexture, clamp(sampleUv - vec2(chroma, 0.0), 0.002, 0.998), blurRadius * 0.65).b;
    baseCol = vec3(mix(baseCol.r, rCh, 0.7), baseCol.g, mix(baseCol.b, bCh, 0.7));
  }

  // Warm impasto enhancement -> cool silver-cyan clinical drain + Ink #mood modulation
  vec3 warmGrade = baseCol * vec3(1.07, 1.01, 0.93) + vec3(0.028, 0.014, 0.0);
  float lum = dot(baseCol, vec3(0.299, 0.587, 0.114));
  vec3 coldGrade = mix(vec3(lum), vec3(lum * 0.76, lum * 0.95, lum * 1.14), 0.78) * 0.88;
  float coldMix = clamp(smoothstep(0.20, 0.84, decay) - uMoodWarmth * 0.18, 0.0, 1.0);
  vec3 col = mix(warmGrade, coldGrade, coldMix);

  if (uMoodWarmth > 0.01) {
    col *= mix(vec3(1.0), vec3(1.08, 1.01, 0.90), uMoodWarmth * 0.45);
  } else if (uMoodWarmth < -0.01) {
    col *= mix(vec3(1.0), vec3(0.86, 0.96, 1.08), -uMoodWarmth * 0.45);
  }

  // Softly smudge facial region toward cool static when heavily blurred or pruned
  col = mix(col, vec3(lum * 0.72, lum * 0.86, lum * 1.02), clamp(faceMask * (lowH * 0.32 + uBeatPulse * 0.25), 0.0, 0.7));

  // Floating sunlit dust motes at high H% (warmth alive in the kitchen air)
  if (h > 0.48 && uOverseer < 0.25) {
    vec2 dustUv = vUv * vec2(18.0, 11.0) + vec2(uTime * 0.04, -uTime * 0.07);
    vec2 dustCell = floor(dustUv);
    vec2 dustFract = fract(dustUv) - 0.5;
    vec2 jitter = (hash22(dustCell) - 0.5) * 0.55;
    float mote = smoothstep(0.09, 0.015, length(dustFract - jitter));
    float twinkle = 0.5 + 0.5 * sin(uTime * 1.3 + hash12(dustCell) * 6.283);
    float dustVis = smoothstep(0.48, 0.82, h) * (1.0 - uOverseer * 2.0) * step(0.68, hash12(dustCell + 7.1));
    col += vec3(0.98, 0.80, 0.52) * mote * twinkle * dustVis * 0.22;
  }

  // Shard fracture edges & faint cyan horizon wireframe bleeding into upper room ceiling
  float crack = smoothstep(0.48, 0.64, vor.x) * shardAmt;
  col = mix(col, vec3(0.04, 0.08, 0.13), crack * 0.65);

  vec2 gridUv = abs(fract(vUv * vec2(22.0, 12.0)) - 0.5);
  float wire = (1.0 - smoothstep(0.0, 0.018, min(gridUv.x, gridUv.y))) * smoothstep(0.42, 0.92, decay);
  float ceilingBleed = mix(0.65, 1.45, smoothstep(0.35, 0.95, vUv.y));
  col += vec3(0.44, 0.80, 0.96) * wire * 0.22 * ceilingBleed;

  // Radial prune shockwave ring centered on uFaceAnchor
  if (uPruneShock > 0.01) {
    float distFace = length((uv - uFaceAnchor) * vec2(uTexAspect, 1.0));
    float ring = smoothstep(0.06, 0.0, abs(distFace - uPruneShock * 1.25));
    col += vec3(0.58, 0.88, 1.0) * ring * (1.0 - uPruneShock * 0.35) * 0.45;
  }

  // Gentle vignette & mood dim
  float vig = smoothstep(1.05, 0.34, length((vUv - vec2(0.42, 0.5)) * vec2(1.15, 1.05)));
  col *= mix(0.56, 1.0, vig) * (1.0 - uMoodDim * 0.42);

  // Overseer Audit scanner sweep + clinical desaturation + razor-thin telemetry hairlines
  if (uOverseer > 0.01 || uAuditSweep > 0.01) {
    float sweepMask = uAuditSweep > 0.01 ? smoothstep(uAuditSweep + 0.02, uAuditSweep - 0.02, vUv.x) : uOverseer;
    float scan = sin(vUv.y * 320.0 + uTime * 2.4) * 0.016 * sweepMask;
    float desat = dot(col, vec3(0.3, 0.59, 0.11));
    col = mix(col, vec3(desat * 0.62, desat * 0.72, desat * 0.82) + scan, sweepMask * 0.72 * max(uOverseer, 0.85));

    if (uAuditSweep > 0.02 && uAuditSweep < 0.98) {
      float beam = smoothstep(0.014, 0.0, abs(vUv.x - uAuditSweep));
      col += vec3(0.75, 0.93, 1.0) * beam * 0.85;
    }

    float topLine = smoothstep(0.003, 0.0, abs(vUv.y - 0.93));
    float botLine = smoothstep(0.003, 0.0, abs(vUv.y - 0.07));
    col = mix(col, vec3(0.84, 0.93, 1.0), clamp(topLine + botLine, 0.0, 1.0) * max(uOverseer, sweepMask) * 0.78);
  }

  // FBM oil-wash entrance dissolve (0 = void, 1 = painted dreamscape)
  if (uDissolve < 0.995) {
    float brushNoise = noise2d(vUv * 6.5) * 0.65 + noise2d(vUv * 15.0) * 0.35;
    float mask = smoothstep(brushNoise * 0.58 - 0.08, brushNoise * 0.58 + 0.18, uDissolve * 1.16);
    vec3 voidCol = vec3(0.015, 0.022, 0.036);
    col = mix(voidCol, col, mask);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;
