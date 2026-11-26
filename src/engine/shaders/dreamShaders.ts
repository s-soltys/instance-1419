export const DREAM_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Full-bleed 2D Expressionist Oil Impasto Degradation Shader.
 * Unfolds gradually across 5 distinct artistic stages from 100% -> 80% -> 65% -> 45% -> 20%:
 *  1. 90-100%: Luminous golden oil bloom, saturated glaze, zero haze/craquelure.
 *  2. 74-89%:  Bloom fades, early facial haze, fine varnish craquelure & split-tone shadow cooling.
 *  3. 52-73%:  Horizontal analog memory-echo ghosting, localized chromatic aberration, flaking margins.
 *  4. 32-51%:  Voronoi stained-glass faceting, selective warm-ember shard memory, 4-tap Sobel contour etching.
 *  5. <32%:    Cryo-cyan schematic wireframe bleed, refractive fracture seams, clinical monochrome drain.
 */
export const DREAM_FRAGMENT = /* glsl */ `
precision highp float;

varying vec2 vUv;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uHumanity;    // 0.0..1.0
uniform float uPruned;      // 0.0..1.0
uniform float uOverseer;    // 0.0..1.0
uniform float uReveal;      // 0.0..1.0 entrance reveal
uniform float uSlicePulse;  // 0.0..1.0 Overseer clinical intercept slice
uniform float uViewAspect;  // viewport width / height
uniform float uTexAspect;   // texture width / height
uniform vec2 uFaceAnchor;   // per-persona normalized face center (0..1)

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// Returns vec3(distToCenter, cellId.x, cellId.y) and edge distance in w via 2-pass metric
vec4 voronoi(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 cellId = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        cellId = n + g;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  float edge = sqrt(d2) - sqrt(d1);
  return vec4(sqrt(d1), cellId, edge);
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
  if (radius <= 0.0004) {
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

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
  float h = clamp(uHumanity, 0.0, 1.0);
  float reveal = clamp(uReveal, 0.0, 1.0);
  float decay = clamp(1.0 - h + uPruned * 0.22, 0.0, 1.0);

  // Gradual layer ramps starting immediately below 100%
  float bloomAmt = smoothstep(0.82, 1.0, h) * (1.0 - uPruned * 0.85);
  float earlyDecay = smoothstep(0.96, 0.68, h);
  float midDrift = smoothstep(0.82, 0.36, h);
  float shardAmt = smoothstep(0.26, 0.86, decay);
  float edgeAmt = smoothstep(0.62, 0.18, h);
  float wireAmt = smoothstep(0.45, 0.92, decay);

  vec2 uv = coverUv(vUv, uViewAspect, uTexAspect);
  if (reveal < 0.999) {
    float zoomScale = mix(1.09, 1.0, reveal);
    uv = clamp((uv - vec2(0.42, 0.5)) / zoomScale + vec2(0.42, 0.5), 0.002, 0.998);
  }

  // Subtle organic impasto warmth breathing at high H%
  float warmFactor = smoothstep(0.42, 0.94, h);
  uv.x += sin(uv.y * 9.0 + uTime * 0.38) * 0.0015 * warmFactor;
  uv.y += cos(uv.x * 8.0 + uTime * 0.30) * 0.0012 * warmFactor;

  // Voronoi stained-glass / cracked-varnish shards (begins gently ~62% H%)
  vec4 vor = vec4(0.0, 0.0, 0.0, 1.0);
  vec2 sampleUv = uv;
  float cellKeep = 0.0;
  if (shardAmt > 0.001) {
    vor = voronoi(uv * mix(7.2, 14.5, shardAmt));
    vec2 cellRnd = hash22(vor.yz);
    cellKeep = cellRnd.x;
    vec2 cellOffset = (cellRnd - 0.5) * 0.048 * pow(shardAmt, 1.15);
    sampleUv = clamp(uv + cellOffset, 0.002, 0.998);
  }

  // Glitch tear bands at deep low H%, Overseer audit, or live slice pulse
  float glitchBand = step(0.974, sin(uv.y * 48.0 + uTime * 1.9)) * (pow(shardAmt, 1.4) * 0.015 + uOverseer * 0.006);
  if (uSlicePulse > 0.005) {
    float sliceRow = sin(uv.y * 92.0 + uSlicePulse * 18.0);
    glitchBand += step(0.72, sliceRow) * (0.022 * uSlicePulse) * sign(cos(uv.y * 37.0));
  }
  sampleUv.x = clamp(sampleUv.x + glitchBand, 0.002, 0.998);

  // Early facial haze starting at 92% H%, scaling smoothly into deeper defocus
  float faceDist = length((sampleUv - uFaceAnchor) * vec2(1.05, 0.85));
  float faceMask = smoothstep(0.30, 0.04, faceDist);
  float earlyFaceBlur = smoothstep(0.93, 0.54, h) * 0.0062 * faceMask;
  float deepBlur = smoothstep(0.56, 0.14, h) * (0.0042 + 0.0145 * faceMask);
  float blurRadius = earlyFaceBlur + deepBlur + (1.0 - reveal) * 0.022;
  vec3 baseCol = sampleBlurred(uTexture, sampleUv, blurRadius);

  // Stage 1: Lightweight 4-tap golden oil highlight bloom at peak 82-100% H%
  if (bloomAmt > 0.005) {
    vec2 bOff = vec2(0.0085, 0.0085 * uViewAspect);
    vec3 bGather = (
      texture2D(uTexture, clamp(sampleUv + vec2( bOff.x,  0.0), 0.002, 0.998)).rgb +
      texture2D(uTexture, clamp(sampleUv + vec2(-bOff.x,  0.0), 0.002, 0.998)).rgb +
      texture2D(uTexture, clamp(sampleUv + vec2( 0.0,  bOff.y), 0.002, 0.998)).rgb +
      texture2D(uTexture, clamp(sampleUv + vec2( 0.0, -bOff.y), 0.002, 0.998)).rgb
    ) * 0.25;
    float hiMask = smoothstep(0.46, 0.88, luma(bGather));
    baseCol += bGather * vec3(1.18, 0.95, 0.62) * hiMask * bloomAmt * 0.30;
  }

  // Stage 3: Analog horizontal memory-echo ghosting (52-82% H% ramp)
  if (midDrift > 0.01) {
    float ghostShift = (0.007 + 0.011 * midDrift) * sin(uTime * 0.55 + sampleUv.y * 4.5);
    vec3 ghostCol = texture2D(uTexture, clamp(sampleUv + vec2(ghostShift, 0.0), 0.002, 0.998)).rgb;
    baseCol = mix(baseCol, ghostCol, midDrift * (0.14 + 0.12 * faceMask));
  }

  // Localized chromatic split ramping smoothly from 82% H% downward
  float chromaAmt = smoothstep(0.82, 0.22, h);
  if (chromaAmt > 0.01 || uSlicePulse > 0.02) {
    float chroma = chromaAmt * (0.0014 + 0.0044 * faceMask) + uSlicePulse * 0.006;
    float rCh = texture2D(uTexture, clamp(sampleUv + vec2(chroma, 0.0), 0.002, 0.998)).r;
    float bCh = texture2D(uTexture, clamp(sampleUv - vec2(chroma, 0.0), 0.002, 0.998)).b;
    float chMix = clamp(0.45 + chromaAmt * 0.40 + uSlicePulse * 0.25, 0.0, 1.0);
    baseCol = vec3(mix(baseCol.r, rCh, chMix), baseCol.g, mix(baseCol.b, bCh, chMix));
  }

  // Continuous saturation & split-tone progression: vibrant warm glaze -> aged split-tone -> cryo silver-cyan
  float lum = luma(baseCol);
  float sat = mix(0.18, 1.18, pow(h, 0.78));
  vec3 satCol = mix(vec3(lum), baseCol, sat);

  // Split-tone cooling in shadows starts early (at 80% H% shadows cool visibly vs 100%)
  float shadowMask = 1.0 - smoothstep(0.14, 0.56, lum);
  vec3 agedCol = mix(satCol, satCol * vec3(0.84, 0.93, 1.08), shadowMask * earlyDecay * 0.58);
  vec3 peakWarm = satCol * vec3(1.06, 1.01, 0.93) + vec3(0.024, 0.011, 0.0) * bloomAmt;
  vec3 warmToAged = mix(peakWarm, agedCol, earlyDecay);

  vec3 coldGrade = mix(vec3(lum), vec3(lum * 0.74, lum * 0.94, lum * 1.15), 0.80) * 0.88;

  // Stage 4: Selective warm-ember shard memory (a few stubborn shards keep warm pigment around 35-60% H%)
  float emberThreshold = mix(0.95, 0.20, smoothstep(0.22, 0.62, h));
  float shardRetention = shardAmt > 0.02
    ? smoothstep(emberThreshold - 0.14, emberThreshold + 0.14, cellKeep) * (1.0 - uPruned) * smoothstep(0.18, 0.34, h)
    : 0.0;
  float coldMix = clamp(smoothstep(0.22, 0.84, decay) * (1.0 - shardRetention * 0.68), 0.0, 1.0);
  vec3 col = mix(warmToAged, coldGrade, coldMix);

  // Stage 2: Fine oil-varnish craquelure web appearing around 74-89% H%
  if (earlyDecay > 0.02 && shardAmt < 0.75) {
    vec4 crackVor = voronoi(uv * 28.0 + vec2(1.7, 3.1));
    float crackLine = 1.0 - smoothstep(0.0, 0.032, crackVor.w);
    float craquelureFade = earlyDecay * (1.0 - smoothstep(0.55, 0.95, shardAmt));
    col = mix(col, col * 0.68 + vec3(0.03, 0.04, 0.055), crackLine * craquelureFade * 0.48);
  }

  // Softly smudge/wash facial region toward cool static as memory erodes
  col = mix(col, vec3(lum * 0.72, lum * 0.86, lum * 1.02), faceMask * smoothstep(0.84, 0.20, h) * 0.28);

  // Stage 4/5: 4-tap Sobel luminance contour etching (painting silhouettes emerge as blueprint lines)
  if (edgeAmt > 0.01) {
    vec2 eStep = vec2(0.0022, 0.0022 * uViewAspect);
    float lR = luma(texture2D(uTexture, clamp(sampleUv + vec2( eStep.x, 0.0), 0.002, 0.998)).rgb);
    float lL = luma(texture2D(uTexture, clamp(sampleUv - vec2( eStep.x, 0.0), 0.002, 0.998)).rgb);
    float lU = luma(texture2D(uTexture, clamp(sampleUv + vec2(0.0,  eStep.y), 0.002, 0.998)).rgb);
    float lD = luma(texture2D(uTexture, clamp(sampleUv - vec2(0.0,  eStep.y), 0.002, 0.998)).rgb);
    float sobel = clamp((abs(lR - lL) + abs(lU - lD)) * 3.2, 0.0, 1.0);
    float contour = smoothstep(0.18, 0.65, sobel);
    col = mix(col, vec3(0.46, 0.82, 0.98), contour * edgeAmt * 0.44);
  }

  // Shard fracture cracks & subtle paint-flaking dropout in margins
  if (shardAmt > 0.001) {
    float crack = (1.0 - smoothstep(0.0, 0.055, vor.w)) * shardAmt;
    col = mix(col, vec3(0.035, 0.07, 0.12), crack * 0.72);
  }

  if (midDrift > 0.05) {
    float edgeDist = smoothstep(0.32, 0.82, length((vUv - vec2(0.42, 0.5)) * vec2(1.1, 1.0)));
    float speckle = step(0.988 - midDrift * 0.018, fract(sin(dot(floor(vUv * 260.0), vec2(12.9898, 78.233))) * 43758.5453));
    col = mix(col, vec3(0.04, 0.06, 0.09), speckle * edgeDist * midDrift * 0.55);
  }

  // Cryo wireframe telemetry grid at low H%
  if (wireAmt > 0.005) {
    vec2 gridUv = abs(fract(vUv * vec2(22.0, 12.0)) - 0.5);
    float wire = (1.0 - smoothstep(0.0, 0.018, min(gridUv.x, gridUv.y))) * wireAmt;
    col += vec3(0.44, 0.80, 0.96) * wire * 0.20;
  }

  // Gradual peripheral memory-edge darkening (subtle at 100%, visibly tighter by 80%)
  float vigOuter = mix(1.16, 0.90, earlyDecay);
  float vigStrength = mix(0.72, 0.44, earlyDecay);
  float vig = smoothstep(vigOuter, 0.30, length((vUv - vec2(0.42, 0.5)) * vec2(1.15, 1.05)));
  col *= mix(vigStrength, 1.0, vig);

  if (reveal < 0.999) {
    vec3 warmVeil = vec3(0.24, 0.14, 0.055);
    vec3 coldVeil = vec3(0.06, 0.14, 0.22);
    vec3 veilCol = mix(coldVeil, warmVeil, smoothstep(0.25, 0.72, h));
    col = mix(veilCol, col, smoothstep(0.0, 0.92, reveal));
  }

  // Overseer Audit interrogation dimming, clinical desaturation & razor-thin telemetry bars
  float overseerFx = max(uOverseer, uSlicePulse * 0.85);
  if (overseerFx > 0.01) {
    float scan = sin(vUv.y * 320.0 + uTime * 2.4) * 0.018 * overseerFx;
    float desat = luma(col);
    col = mix(col, vec3(desat * 0.62, desat * 0.72, desat * 0.82) + scan, overseerFx * 0.68);
    float topLine = smoothstep(0.003, 0.0, abs(vUv.y - 0.935));
    float botLine = smoothstep(0.003, 0.0, abs(vUv.y - 0.065));
    col = mix(col, vec3(0.84, 0.93, 1.0), clamp(topLine + botLine, 0.0, 1.0) * overseerFx * 0.75);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;
