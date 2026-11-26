export const DREAM_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Full-bleed 2D Expressionist Oil Impasto Degradation Shader.
 * Rescaled so uHumanity = 1.0 (100%) starts at the previous ~60% character baseline
 * (warm oil glaze + already-present fine varnish craquelure, subtle echo & haze)
 * and accelerates into rich, diverse multi-scale Voronoi fractures, heat-wave memory
 * warping, dual-axis chromatic aberration, Sobel contours, and cryo wireframe bleed
 * at lower Humanity levels. Also supports organic eyelid/focus wake-up (uWakeProgress).
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
uniform float uWakeProgress;// 0.0..1.0 eyelid/focus wake-up curve
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
  float hRaw = clamp(uHumanity, 0.0, 1.0);
  // Rescaled clarity curve: old ~60% becomes new 100%, ramping faster into diverse distortion below 75%
  float hEff = 0.62 * pow(hRaw, 1.18);
  float reveal = clamp(uReveal, 0.0, 1.0);
  float wake = clamp(uWakeProgress, 0.0, 1.0);
  float wakeFocus = smoothstep(0.10, 0.96, wake);
  float decay = clamp(1.0 - hEff + uPruned * 0.24, 0.0, 1.0);

  // Warm oil glaze remains at high H% while subtle craquelure, haze & echo are already alive at 100%
  float bloomAmt = smoothstep(0.68, 1.0, hRaw) * (1.0 - uPruned * 0.85);
  float earlyDecay = smoothstep(1.05, 0.45, hEff);
  float midDrift = smoothstep(0.78, 0.16, hEff);
  float shardAmt = smoothstep(0.30, 0.92, decay);
  float microShardAmt = smoothstep(0.55, 0.08, hRaw);
  float edgeAmt = smoothstep(0.60, 0.08, hEff);
  float wireAmt = smoothstep(0.52, 0.94, decay);

  vec2 uv = coverUv(vUv, uViewAspect, uTexAspect);
  if (reveal < 0.999) {
    float zoomScale = mix(1.09, 1.0, reveal);
    uv = clamp((uv - vec2(0.42, 0.5)) / zoomScale + vec2(0.42, 0.5), 0.002, 0.998);
  }
  if (wake < 0.999) {
    float wakeZoom = mix(1.07, 1.0, wakeFocus);
    uv = clamp((uv - vec2(0.42, 0.5)) / wakeZoom + vec2(0.42, 0.5), 0.002, 0.998);
  }

  // Organic impasto breathing at high H% vs faster heat/memory wave warp as H% drops
  float warmFactor = smoothstep(0.35, 0.95, hRaw);
  float warpAmp = 0.0014 * warmFactor + (1.0 - hRaw) * 0.0068;
  float warpSpeed = mix(1.65, 0.42, hRaw);
  uv.x += sin(uv.y * mix(16.0, 8.5, hRaw) + uTime * warpSpeed) * warpAmp;
  uv.y += cos(uv.x * mix(14.0, 7.5, hRaw) + uTime * (warpSpeed * 0.82)) * (warpAmp * 0.84);

  // Two-scale Voronoi stained-glass fracture (primary facets + secondary micro-fractures below 55% H%)
  vec4 vor = vec4(0.0, 0.0, 0.0, 1.0);
  vec4 vorMicro = vec4(0.0, 0.0, 0.0, 1.0);
  vec2 sampleUv = uv;
  float cellKeep = 0.0;
  float cellChroma = 0.0;
  if (shardAmt > 0.001) {
    vor = voronoi(uv * mix(7.0, 15.5, shardAmt));
    vec2 cellRnd = hash22(vor.yz);
    cellKeep = cellRnd.x;
    cellChroma = (cellRnd.y - 0.5) * 2.0;

    // Subtle per-shard shear/rotation at low H%
    float shearAng = (cellRnd.y - 0.5) * 0.14 * pow(shardAmt, 1.3);
    float sA = sin(shearAng);
    float cA = cos(shearAng);
    vec2 rel = uv - uFaceAnchor;
    vec2 sheared = uFaceAnchor + vec2(rel.x * cA - rel.y * sA, rel.x * sA + rel.y * cA);

    vec2 cellOffset = (cellRnd - 0.5) * 0.085 * pow(shardAmt, 1.15);
    sampleUv = clamp(mix(uv, sheared, 0.35 * shardAmt) + cellOffset, 0.002, 0.998);
  }
  if (microShardAmt > 0.005) {
    vorMicro = voronoi(uv * 24.0 + vec2(4.2, 1.9));
    vec2 microRnd = hash22(vorMicro.yz + vec2(9.1, 3.7));
    sampleUv = clamp(sampleUv + (microRnd - 0.5) * 0.018 * microShardAmt, 0.002, 0.998);
  }

  // Glitch tear bands ramping up at lower H%, Overseer audit, or slice pulse
  float tearFreq = mix(64.0, 42.0, hRaw);
  float glitchBand = step(0.962 - (1.0 - hRaw) * 0.035, sin(uv.y * tearFreq + uTime * (1.8 + (1.0 - hRaw) * 2.2))) *
    (pow(shardAmt, 1.25) * 0.024 + uOverseer * 0.008);
  if (uSlicePulse > 0.005) {
    float sliceRow = sin(uv.y * 92.0 + uSlicePulse * 18.0);
    glitchBand += step(0.72, sliceRow) * (0.024 * uSlicePulse) * sign(cos(uv.y * 37.0));
  }
  sampleUv.x = clamp(sampleUv.x + glitchBand, 0.002, 0.998);

  // Facial haze + wake-up out-of-focus blur
  float faceDist = length((sampleUv - uFaceAnchor) * vec2(1.05, 0.85));
  float faceMask = smoothstep(0.32, 0.04, faceDist);
  float earlyFaceBlur = smoothstep(0.92, 0.28, hEff) * 0.0072 * faceMask;
  float deepBlur = smoothstep(0.50, 0.05, hEff) * (0.0052 + 0.0165 * faceMask);
  float wakeBlur = (1.0 - wakeFocus) * 0.032;
  float blurRadius = earlyFaceBlur + deepBlur + wakeBlur + (1.0 - reveal) * 0.022;
  vec3 baseCol = sampleBlurred(uTexture, sampleUv, blurRadius);

  // Stage 1: Warm oil highlight bloom at higher H% so 100% stays rich and inviting
  if (bloomAmt > 0.005) {
    vec2 bOff = vec2(0.0085, 0.0085 * uViewAspect);
    vec3 bGather = (
      texture2D(uTexture, clamp(sampleUv + vec2( bOff.x,  0.0), 0.002, 0.998)).rgb +
      texture2D(uTexture, clamp(sampleUv + vec2(-bOff.x,  0.0), 0.002, 0.998)).rgb +
      texture2D(uTexture, clamp(sampleUv + vec2( 0.0,  bOff.y), 0.002, 0.998)).rgb +
      texture2D(uTexture, clamp(sampleUv + vec2( 0.0, -bOff.y), 0.002, 0.998)).rgb
    ) * 0.25;
    float hiMask = smoothstep(0.46, 0.88, luma(bGather));
    baseCol += bGather * vec3(1.18, 0.95, 0.62) * hiMask * bloomAmt * 0.28;
  }

  // Analog horizontal memory-echo ghosting (active subtly at 100%, stronger as H% drops)
  if (midDrift > 0.01) {
    float ghostSpeed = mix(1.35, 0.55, hRaw);
    float ghostShift = (0.006 + 0.015 * midDrift) * sin(uTime * ghostSpeed + sampleUv.y * 5.2);
    vec3 ghostCol = texture2D(uTexture, clamp(sampleUv + vec2(ghostShift, 0.0), 0.002, 0.998)).rgb;
    baseCol = mix(baseCol, ghostCol, midDrift * (0.14 + 0.14 * faceMask));
  }

  // Dual-axis angled chromatic aberration + per-shard refractive dispersion
  float chromaAmt = smoothstep(0.88, 0.06, hEff);
  if (chromaAmt > 0.01 || uSlicePulse > 0.02 || wake < 0.99) {
    float chroma = chromaAmt * (0.0018 + 0.0062 * faceMask) + abs(cellChroma) * shardAmt * 0.0045 + uSlicePulse * 0.006 + (1.0 - wakeFocus) * 0.005;
    vec2 chromaVec = vec2(chroma, chroma * 0.42 * (1.0 - hRaw + 0.2));
    float rCh = texture2D(uTexture, clamp(sampleUv + chromaVec, 0.002, 0.998)).r;
    float bCh = texture2D(uTexture, clamp(sampleUv - chromaVec, 0.002, 0.998)).b;
    float chMix = clamp(0.42 + chromaAmt * 0.48 + uSlicePulse * 0.25, 0.0, 1.0);
    baseCol = vec3(mix(baseCol.r, rCh, chMix), baseCol.g, mix(baseCol.b, bCh, chMix));
  }

  // Continuous saturation & split-tone progression
  float lum = luma(baseCol);
  float sat = mix(0.16, 1.14, pow(hRaw, 0.68));
  vec3 satCol = mix(vec3(lum), baseCol, sat);

  float shadowMask = 1.0 - smoothstep(0.14, 0.56, lum);
  vec3 agedCol = mix(satCol, satCol * vec3(0.84, 0.93, 1.08), shadowMask * earlyDecay * 0.56);
  vec3 peakWarm = satCol * vec3(1.06, 1.01, 0.93) + vec3(0.024, 0.011, 0.0) * bloomAmt;
  vec3 warmToAged = mix(peakWarm, agedCol, earlyDecay);

  vec3 coldGrade = mix(vec3(lum), vec3(lum * 0.72, lum * 0.94, lum * 1.18), 0.84) * 0.86;

  // Selective warm-ember shard retention in mid/low bands
  float emberThreshold = mix(0.95, 0.22, smoothstep(0.14, 0.55, hRaw));
  float shardRetention = shardAmt > 0.02
    ? smoothstep(emberThreshold - 0.14, emberThreshold + 0.14, cellKeep) * (1.0 - uPruned) * smoothstep(0.12, 0.34, hRaw)
    : 0.0;
  float coldMix = clamp(smoothstep(0.32, 0.90, decay) * (1.0 - shardRetention * 0.65), 0.0, 1.0);
  vec3 col = mix(warmToAged, coldGrade, coldMix);

  // Fine oil-varnish craquelure web (already faintly present at 100%, fading into full shard cracks)
  if (earlyDecay > 0.02 && shardAmt < 0.82) {
    vec4 crackVor = voronoi(uv * 28.0 + vec2(1.7, 3.1));
    float crackLine = 1.0 - smoothstep(0.0, 0.032, crackVor.w);
    float craquelureFade = earlyDecay * (1.0 - smoothstep(0.55, 0.95, shardAmt));
    col = mix(col, col * 0.68 + vec3(0.03, 0.04, 0.055), crackLine * craquelureFade * 0.48);
  }

  // Softly smudge facial region toward cool static as memory erodes
  col = mix(col, vec3(lum * 0.70, lum * 0.85, lum * 1.04), faceMask * smoothstep(0.75, 0.10, hEff) * 0.34);

  // 4-tap Sobel luminance contour etching
  if (edgeAmt > 0.01) {
    vec2 eStep = vec2(0.0024, 0.0024 * uViewAspect);
    float lR = luma(texture2D(uTexture, clamp(sampleUv + vec2( eStep.x, 0.0), 0.002, 0.998)).rgb);
    float lL = luma(texture2D(uTexture, clamp(sampleUv - vec2( eStep.x, 0.0), 0.002, 0.998)).rgb);
    float lU = luma(texture2D(uTexture, clamp(sampleUv + vec2(0.0,  eStep.y), 0.002, 0.998)).rgb);
    float lD = luma(texture2D(uTexture, clamp(sampleUv - vec2(0.0,  eStep.y), 0.002, 0.998)).rgb);
    float sobel = clamp((abs(lR - lL) + abs(lU - lD)) * 3.4, 0.0, 1.0);
    float contour = smoothstep(0.16, 0.62, sobel);
    col = mix(col, vec3(0.48, 0.85, 1.0), contour * edgeAmt * 0.52);
  }

  // Primary & micro Voronoi fracture cracks + edge flaking
  if (shardAmt > 0.001) {
    float crack = (1.0 - smoothstep(0.0, 0.055, vor.w)) * shardAmt;
    col = mix(col, vec3(0.03, 0.065, 0.12), crack * 0.78);
  }
  if (microShardAmt > 0.005) {
    float microCrack = (1.0 - smoothstep(0.0, 0.04, vorMicro.w)) * microShardAmt;
    col = mix(col, vec3(0.18, 0.42, 0.56), microCrack * 0.36);
  }

  if (midDrift > 0.05) {
    float edgeDist = smoothstep(0.32, 0.82, length((vUv - vec2(0.42, 0.5)) * vec2(1.1, 1.0)));
    float speckle = step(0.986 - midDrift * 0.022, fract(sin(dot(floor(vUv * 260.0), vec2(12.9898, 78.233))) * 43758.5453));
    col = mix(col, vec3(0.04, 0.06, 0.09), speckle * edgeDist * midDrift * 0.58);
  }

  // Cryo wireframe telemetry grid & subtle concentric calibration rings below ~35% H%
  if (wireAmt > 0.005) {
    vec2 gridUv = abs(fract(vUv * vec2(22.0, 12.0)) - 0.5);
    float wire = (1.0 - smoothstep(0.0, 0.018, min(gridUv.x, gridUv.y))) * wireAmt;
    float ringDist = length((vUv - vec2(0.38, 0.5)) * vec2(uViewAspect, 1.0));
    float ringWave = 1.0 - smoothstep(0.0, 0.012, abs(fract(ringDist * 4.5) - 0.5));
    col += vec3(0.44, 0.82, 0.98) * (wire * 0.22 + ringWave * wireAmt * 0.14);
  }

  // Gradual peripheral memory-edge darkening
  float vigOuter = mix(1.12, 0.86, earlyDecay);
  float vigStrength = mix(0.68, 0.40, earlyDecay);
  float vig = smoothstep(vigOuter, 0.30, length((vUv - vec2(0.42, 0.5)) * vec2(1.15, 1.05)));
  col *= mix(vigStrength, 1.0, vig);

  if (reveal < 0.999) {
    vec3 warmVeil = vec3(0.24, 0.14, 0.055);
    vec3 coldVeil = vec3(0.06, 0.14, 0.22);
    vec3 veilCol = mix(coldVeil, warmVeil, smoothstep(0.25, 0.72, hRaw));
    col = mix(veilCol, col, smoothstep(0.0, 0.92, reveal));
  }

  // Organic curved eyelid / optical-iris wake-up veil (active when uWakeProgress < 1.0)
  if (wake < 0.999) {
    float xCurve = pow(abs(vUv.x - 0.5) * 2.0, 1.75) * 0.14;
    float halfOpen = mix(0.035, 0.68, smoothstep(0.0, 0.94, wake));
    float lidDist = abs(vUv.y - 0.5) + xCurve;
    float lidMask = 1.0 - smoothstep(halfOpen - 0.13, halfOpen + 0.08, lidDist);
    float scanShimmer = sin(vUv.y * 220.0 + uTime * 3.2) * 0.016 * (1.0 - wakeFocus);
    vec3 sleepShadow = vec3(0.02, 0.03, 0.05);
    vec3 warmBleed = vec3(0.22, 0.14, 0.07) * (1.0 - wakeFocus) * 0.45;
    col = mix(sleepShadow, col + warmBleed + scanShimmer, lidMask);
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
