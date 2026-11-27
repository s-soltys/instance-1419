export const DREAM_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Full-bleed 2D Expressionist Oil Impasto Degradation Shader.
 * Variant A ("Protected Core, Cohesive Silhouette") rescaled so ~78% maps to the new 100%:
 * - 100% (hA = 0.78): warm oil glaze with subtle varnish craquelure & light outer rim aging.
 * - 70%  (hA = 0.546): richer peripheral stained-glass fracture & dream haze around the room
 *   while `faceProtect` keeps the face recognizable and warm-toned.
 * - 45%  (hA = 0.351): protection fades, cooling shadows & fractures cross shoulders/face.
 * - 20–30% (hA <= 0.23): wide 2-ring facial obliteration melts eyes/nose/mouth away while
 *   cohesive small-displacement shards & outer contours preserve the general figure silhouette.
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
uniform float uHeadTilt;    // subtle drowsy head-tilt angle in radians
uniform float uSlicePulse;  // 0.0..1.0 Overseer clinical intercept slice
uniform float uViewAspect;  // viewport width / height
uniform float uTexAspect;   // texture width / height
uniform vec2 uFaceAnchor;   // per-persona normalized face center (0..1)
uniform float uAnomalyProgress; // 0.0..1.0 global anomaly discovery progress
uniform float uFractalStage;    // 1.0..6.0 current fractal shell stage
uniform float uDreamCrackBleed; // 0.0..1.0 shifts.json anomalyPhase.dreamCrackBleed

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// Returns vec4(distToCenter, cellId.x, cellId.y, edgeDistance)
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

vec3 sampleBlurred(sampler2D tex, vec2 uv, float radius, float aspect) {
  if (radius <= 0.0004) {
    return texture2D(tex, uv).rgb;
  }
  if (radius <= 0.008) {
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
  vec2 scale = vec2(1.0, aspect * 0.78);
  vec2 r1 = radius * 0.46 * scale;
  vec2 r2 = radius * scale;
  vec3 acc = texture2D(tex, uv).rgb * 0.16;
  // Inner ring (0.48 total)
  acc += texture2D(tex, clamp(uv + vec2( r1.x,  0.0 ), 0.002, 0.998)).rgb * 0.065;
  acc += texture2D(tex, clamp(uv + vec2(-r1.x,  0.0 ), 0.002, 0.998)).rgb * 0.065;
  acc += texture2D(tex, clamp(uv + vec2( 0.0,   r1.y), 0.002, 0.998)).rgb * 0.065;
  acc += texture2D(tex, clamp(uv + vec2( 0.0,  -r1.y), 0.002, 0.998)).rgb * 0.065;
  acc += texture2D(tex, clamp(uv + vec2( r1.x,  r1.y) * 0.707, 0.002, 0.998)).rgb * 0.055;
  acc += texture2D(tex, clamp(uv + vec2(-r1.x,  r1.y) * 0.707, 0.002, 0.998)).rgb * 0.055;
  acc += texture2D(tex, clamp(uv + vec2( r1.x, -r1.y) * 0.707, 0.002, 0.998)).rgb * 0.055;
  acc += texture2D(tex, clamp(uv + vec2(-r1.x, -r1.y) * 0.707, 0.002, 0.998)).rgb * 0.055;
  // Outer ring (0.36 total)
  acc += texture2D(tex, clamp(uv + vec2( r2.x,  0.0 ), 0.002, 0.998)).rgb * 0.050;
  acc += texture2D(tex, clamp(uv + vec2(-r2.x,  0.0 ), 0.002, 0.998)).rgb * 0.050;
  acc += texture2D(tex, clamp(uv + vec2( 0.0,   r2.y), 0.002, 0.998)).rgb * 0.050;
  acc += texture2D(tex, clamp(uv + vec2( 0.0,  -r2.y), 0.002, 0.998)).rgb * 0.050;
  acc += texture2D(tex, clamp(uv + vec2( r2.x,  r2.y) * 0.707, 0.002, 0.998)).rgb * 0.040;
  acc += texture2D(tex, clamp(uv + vec2(-r2.x,  r2.y) * 0.707, 0.002, 0.998)).rgb * 0.040;
  acc += texture2D(tex, clamp(uv + vec2( r2.x, -r2.y) * 0.707, 0.002, 0.998)).rgb * 0.040;
  acc += texture2D(tex, clamp(uv + vec2(-r2.x, -r2.y) * 0.707, 0.002, 0.998)).rgb * 0.040;
  return acc;
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
  float hRaw = clamp(uHumanity, 0.0, 1.0);
  // Rescaled Variant A curve: ~78% clarity becomes the new 100% baseline
  float hA = clamp(hRaw * 0.78 - uPruned * 0.12, 0.0, 1.0);
  float reveal = clamp(uReveal, 0.0, 1.0);
  float wake = clamp(uWakeProgress, 0.0, 1.0);
  float wakeFocus = smoothstep(0.10, 0.96, wake);

  float bloomAmt = smoothstep(0.46, 0.80, hA) * (1.0 - uPruned * 0.85);
  float patinaAmt = smoothstep(0.92, 0.28, hA);
  float midDrift = smoothstep(0.76, 0.14, hA);
  float shardBase = smoothstep(0.92, 0.14, hA);
  float microShardAmt = smoothstep(0.38, 0.10, hA);
  float obliterateFace = pow(smoothstep(0.46, 0.16, hA), 1.25);
  float edgeAmt = smoothstep(0.42, 0.14, hA);
  float wireAmt = smoothstep(0.32, 0.12, hA);

  vec2 uv = coverUv(vUv, uViewAspect, uTexAspect);
  if (reveal < 0.999) {
    float zoomScale = mix(1.09, 1.0, reveal);
    uv = clamp((uv - vec2(0.42, 0.5)) / zoomScale + vec2(0.42, 0.5), 0.002, 0.998);
  }
  if (wake < 0.999) {
    float wakeZoom = mix(1.07, 1.0, wakeFocus);
    uv = clamp((uv - vec2(0.42, 0.5)) / wakeZoom + vec2(0.42, 0.5), 0.002, 0.998);
  }
  if (abs(uHeadTilt) > 0.0001) {
    float cT = cos(uHeadTilt);
    float sT = sin(uHeadTilt);
    vec2 p = uv - vec2(0.42, 0.5);
    uv = clamp(vec2(0.42, 0.5) + vec2(p.x * cT - p.y * sT, p.x * sT + p.y * cT), 0.002, 0.998);
  }

  // Face region measured prior to Voronoi displacement so outer fractures stay off the face core at >= 65%
  float rawFaceDist = length((uv - uFaceAnchor) * vec2(1.08, 0.80));
  float rawFaceMask = smoothstep(0.29, 0.06, rawFaceDist);
  float faceProtect = rawFaceMask * smoothstep(0.32, 0.58, hA);

  // Organic impasto breathing at high H% vs faster drift at low H%
  float warpAmp = 0.0012 * smoothstep(0.32, 0.80, hA) + pow(1.0 - hA, 1.7) * 0.0045;
  warpAmp *= (1.0 - faceProtect * 0.70);
  float warpSpeed = mix(1.45, 0.42, hRaw);
  uv.x += sin(uv.y * mix(14.0, 8.5, hRaw) + uTime * warpSpeed) * warpAmp;
  uv.y += cos(uv.x * mix(12.0, 7.5, hRaw) + uTime * (warpSpeed * 0.82)) * (warpAmp * 0.84);

  // Cohesive Voronoi stained-glass fracture (outer margins first; max 0.032 offset preserves general silhouette at 20-30%)
  float shardFaceScale = 1.0 - faceProtect * 0.88;
  float anomalyBleed = clamp(max(uDreamCrackBleed, uAnomalyProgress * smoothstep(1.0, 6.0, uFractalStage)), 0.0, 1.0);
  vec4 vor = vec4(0.0, 0.0, 0.0, 1.0);
  vec4 vorMicro = vec4(0.0, 0.0, 0.0, 1.0);
  vec2 sampleUv = uv;
  float cellKeep = 0.0;
  float cellChroma = 0.0;

  if (shardBase > 0.002 || anomalyBleed > 0.01) {
    vor = voronoi(uv * mix(7.2, 13.5, max(shardBase, anomalyBleed * 0.65)));
    vec2 cellRnd = hash22(vor.yz);
    cellKeep = cellRnd.x;
    cellChroma = (cellRnd.y - 0.5) * 2.0;

    if (shardBase > 0.002) {
      float shearAng = (cellRnd.y - 0.5) * 0.055 * pow(shardBase, 1.25) * shardFaceScale;
      float sA = sin(shearAng);
      float cA = cos(shearAng);
      vec2 rel = uv - uFaceAnchor;
      vec2 sheared = uFaceAnchor + vec2(rel.x * cA - rel.y * sA, rel.x * sA + rel.y * cA);
      vec2 cellOffset = (cellRnd - 0.5) * 0.032 * pow(shardBase, 1.15) * shardFaceScale;
      sampleUv = clamp(mix(uv, sheared, 0.25 * shardBase * shardFaceScale) + cellOffset, 0.002, 0.998);
    }
  }
  if (microShardAmt > 0.005) {
    vorMicro = voronoi(uv * 22.0 + vec2(4.2, 1.9));
    vec2 microRnd = hash22(vorMicro.yz + vec2(9.1, 3.7));
    sampleUv = clamp(sampleUv + (microRnd - 0.5) * 0.008 * microShardAmt, 0.002, 0.998);
  }

  // Glitch tear bands + Overseer clinical slice pulse
  float tearFreq = mix(58.0, 42.0, hRaw);
  float glitchBand = step(0.968 - (1.0 - hRaw) * 0.026, sin(uv.y * tearFreq + uTime * (1.6 + (1.0 - hRaw) * 1.8))) *
    (pow(shardBase, 1.35) * 0.013 * shardFaceScale + uOverseer * 0.008);
  if (uSlicePulse > 0.005) {
    float sliceRow = sin(uv.y * 92.0 + uSlicePulse * 18.0);
    glitchBand += step(0.72, sliceRow) * (0.024 * uSlicePulse) * sign(cos(uv.y * 37.0));
  }
  sampleUv.x = clamp(sampleUv.x + glitchBand, 0.002, 0.998);

  // Subtle haze on face at 70%, deep smooth defocus melt below ~45% plus wake/reveal focus
  float gentleFaceHaze = smoothstep(0.86, 0.36, hA) * 0.0034 * rawFaceMask;
  float bodyBlur = obliterateFace * 0.011;
  float faceObliterationBlur = obliterateFace * 0.056 * rawFaceMask;
  float wakeBlur = (1.0 - wakeFocus) * 0.032;
  float blurRadius = gentleFaceHaze + bodyBlur + faceObliterationBlur + wakeBlur + (1.0 - reveal) * 0.022;
  vec3 baseCol = sampleBlurred(uTexture, sampleUv, blurRadius, uViewAspect);

  // Extra wide silhouette smear inside face zone at 20-35% so eyes/nose/mouth vanish cleanly
  if (obliterateFace > 0.02 && rawFaceMask > 0.01) {
    vec3 wideMelt = sampleBlurred(uTexture, sampleUv, 0.082 * obliterateFace, uViewAspect);
    baseCol = mix(baseCol, wideMelt, rawFaceMask * obliterateFace * 0.90);
  }

  // Stage 1: Warm oil highlight bloom
  if (bloomAmt > 0.005) {
    vec2 bOff = vec2(0.008, 0.008 * uViewAspect);
    vec3 bGather = (
      texture2D(uTexture, clamp(sampleUv + vec2( bOff.x,  0.0), 0.002, 0.998)).rgb +
      texture2D(uTexture, clamp(sampleUv + vec2(-bOff.x,  0.0), 0.002, 0.998)).rgb +
      texture2D(uTexture, clamp(sampleUv + vec2( 0.0,  bOff.y), 0.002, 0.998)).rgb +
      texture2D(uTexture, clamp(sampleUv + vec2( 0.0, -bOff.y), 0.002, 0.998)).rgb
    ) * 0.25;
    float hiMask = smoothstep(0.46, 0.88, luma(bGather));
    baseCol += bGather * vec3(1.18, 0.94, 0.60) * hiMask * bloomAmt * 0.24;
  }

  // Analog horizontal memory-echo ghosting
  if (midDrift > 0.01) {
    float ghostSpeed = mix(1.35, 0.55, hRaw);
    float ghostShift = (0.004 + 0.012 * midDrift) * sin(uTime * ghostSpeed + sampleUv.y * 5.2);
    vec3 ghostCol = sampleBlurred(uTexture, clamp(sampleUv + vec2(ghostShift, 0.0), 0.002, 0.998), 0.006 * midDrift, uViewAspect);
    float ghostWeight = midDrift * (0.14 * (1.0 - faceProtect * 0.65) + 0.16 * obliterateFace * rawFaceMask);
    baseCol = mix(baseCol, ghostCol, ghostWeight);
  }

  // Dual-axis chromatic aberration + wake/slice shimmer
  float chromaAmt = smoothstep(0.78, 0.10, hA);
  if (chromaAmt > 0.01 || uSlicePulse > 0.02 || wake < 0.99) {
    float chroma = chromaAmt * (0.0016 + 0.0042 * (1.0 - faceProtect * 0.72)) +
      abs(cellChroma) * shardBase * 0.0028 * shardFaceScale +
      uSlicePulse * 0.006 +
      (1.0 - wakeFocus) * 0.005;
    vec2 chromaVec = vec2(chroma, chroma * 0.40 * (1.0 - hRaw + 0.2));
    float rCh = texture2D(uTexture, clamp(sampleUv + chromaVec, 0.002, 0.998)).r;
    float bCh = texture2D(uTexture, clamp(sampleUv - chromaVec, 0.002, 0.998)).b;
    float chMix = clamp(0.35 + chromaAmt * 0.50 + uSlicePulse * 0.25, 0.0, 1.0);
    baseCol = vec3(mix(baseCol.r, rCh, chMix), baseCol.g, mix(baseCol.b, bCh, chMix));
  }

  // Warmth preserved across 70-100%, draining below 55%
  float lum = luma(baseCol);
  float sat = mix(0.18, 1.12, pow(smoothstep(0.08, 0.78, hA), 0.55));
  vec3 satCol = mix(vec3(lum), baseCol, sat);

  float warmWash = smoothstep(0.38, 0.78, hA);
  vec3 peakWarm = satCol * mix(vec3(1.0), vec3(1.07, 1.01, 0.91), warmWash) + vec3(0.020, 0.010, 0.0) * bloomAmt;
  float shadowMask = 1.0 - smoothstep(0.14, 0.56, lum);
  vec3 agedCol = mix(peakWarm, peakWarm * vec3(0.88, 0.94, 1.05), shadowMask * patinaAmt * 0.36);

  vec3 coldGrade = mix(vec3(lum), vec3(lum * 0.72, lum * 0.94, lum * 1.18), 0.84) * 0.88;
  float emberThreshold = mix(0.95, 0.28, smoothstep(0.14, 0.48, hA));
  float shardRetention = shardBase > 0.05
    ? smoothstep(emberThreshold - 0.14, emberThreshold + 0.14, cellKeep) * (1.0 - uPruned) * smoothstep(0.12, 0.34, hA)
    : 0.0;
  float coldMix = clamp(smoothstep(0.58, 0.16, hA) * (1.0 - faceProtect * 0.52) * (1.0 - shardRetention * 0.55), 0.0, 1.0);
  vec3 col = mix(agedCol, coldGrade, coldMix);

  // Fine oil-varnish craquelure web (subdued over face core)
  if (patinaAmt > 0.02 && shardBase < 0.82) {
    vec4 crackVor = voronoi(uv * 28.0 + vec2(1.7, 3.1));
    float crackLine = 1.0 - smoothstep(0.0, 0.032, crackVor.w);
    float craqFade = patinaAmt * (1.0 - smoothstep(0.55, 0.95, shardBase)) * (1.0 - rawFaceMask * 0.55);
    col = mix(col, col * 0.66 + vec3(0.025, 0.032, 0.045), crackLine * craqFade * 0.48);
  }

  // Facial silhouette cool-wash below ~45% (erases facial contrast, leaves head posture mass)
  if (obliterateFace > 0.01) {
    float meltLum = mix(lum, luma(sampleBlurred(uTexture, sampleUv, 0.068, uViewAspect)), 0.85);
    vec3 silTone = vec3(meltLum * 0.66, meltLum * 0.84, meltLum * 1.04);
    col = mix(col, silTone, rawFaceMask * obliterateFace * 0.82);
  }

  // Outer-weighted Sobel contour etching (traces head/shoulder silhouette while leaving melted face uncluttered)
  if (edgeAmt > 0.01) {
    vec2 eStep = vec2(0.0032, 0.0032 * uViewAspect);
    float blurProbe = 0.006 + obliterateFace * 0.010 * rawFaceMask;
    float lR = luma(sampleBlurred(uTexture, clamp(sampleUv + vec2( eStep.x, 0.0), 0.002, 0.998), blurProbe, uViewAspect));
    float lL = luma(sampleBlurred(uTexture, clamp(sampleUv - vec2( eStep.x, 0.0), 0.002, 0.998), blurProbe, uViewAspect));
    float lU = luma(sampleBlurred(uTexture, clamp(sampleUv + vec2(0.0,  eStep.y), 0.002, 0.998), blurProbe, uViewAspect));
    float lD = luma(sampleBlurred(uTexture, clamp(sampleUv - vec2(0.0,  eStep.y), 0.002, 0.998), blurProbe, uViewAspect));
    float sobel = clamp((abs(lR - lL) + abs(lU - lD)) * 3.8, 0.0, 1.0);
    float contour = smoothstep(0.14, 0.52, sobel) * (1.0 - rawFaceMask * 0.72 * obliterateFace);
    col = mix(col, vec3(0.52, 0.86, 1.0), contour * edgeAmt * 0.50);
  }

  // Primary & micro Voronoi fracture cracks
  if (shardBase > 0.002) {
    float crack = (1.0 - smoothstep(0.0, 0.045, vor.w)) * shardBase * shardFaceScale;
    col = mix(col, vec3(0.04, 0.08, 0.14), crack * 0.62);
  }
  if (microShardAmt > 0.005) {
    float microCrack = (1.0 - smoothstep(0.0, 0.032, vorMicro.w)) * microShardAmt;
    col = mix(col, vec3(0.18, 0.42, 0.56), microCrack * 0.28);
  }
  // Recursive geometric anomaly fracture bleed along Voronoi borders (grows with anomalyProgress * fractalStage)
  if (anomalyBleed > 0.01) {
    float borderGlow = 1.0 - smoothstep(0.0, mix(0.026, 0.011, anomalyBleed), vor.w);
    float recFold = abs(fract(vor.w * 28.0 - length(uv - uFaceAnchor) * 6.0 + uTime * 0.18) - 0.5);
    float recLine = 1.0 - smoothstep(0.0, 0.085, recFold);
    float bleedMask = borderGlow * (0.45 + 0.55 * recLine) * anomalyBleed * (1.0 - faceProtect * 0.72);
    vec3 fracCol = mix(vec3(0.46, 0.82, 0.98), vec3(0.96, 0.78, 0.48), 0.35 + 0.35 * sin(uTime * 0.5 + vor.y * 2.1));
    col = mix(col, fracCol, clamp(bleedMask * 0.62, 0.0, 0.78));
  }

  if (midDrift > 0.05) {
    float edgeDist = smoothstep(0.32, 0.82, length((vUv - vec2(0.42, 0.5)) * vec2(1.1, 1.0)));
    float speckle = step(0.986 - midDrift * 0.022, fract(sin(dot(floor(vUv * 260.0), vec2(12.9898, 78.233))) * 43758.5453));
    col = mix(col, vec3(0.04, 0.06, 0.09), speckle * edgeDist * midDrift * 0.50);
  }

  // Cryo wireframe telemetry grid & concentric calibration rings below ~35% H%
  if (wireAmt > 0.005) {
    vec2 gridUv = abs(fract(vUv * vec2(22.0, 12.0)) - 0.5);
    float wire = (1.0 - smoothstep(0.0, 0.015, min(gridUv.x, gridUv.y))) * wireAmt;
    float ringDist = length((vUv - vec2(0.38, 0.5)) * vec2(uViewAspect, 1.0));
    float ringWave = 1.0 - smoothstep(0.0, 0.012, abs(fract(ringDist * 4.5) - 0.5));
    col += vec3(0.44, 0.82, 0.98) * (wire * 0.14 + ringWave * wireAmt * 0.09);
  }

  // Gradual peripheral memory-edge darkening
  float vigOuter = mix(1.12, 0.86, patinaAmt);
  float vigStrength = mix(0.68, 0.40, patinaAmt);
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
