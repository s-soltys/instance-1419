export const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_FRAGMENT = /* glsl */ `
precision highp float;

varying vec3 vDir;
uniform float uTime;
uniform float uWavelengthNorm;   // 0.0 = 200nm (UV/X-ray), 0.225 = Visible, 0.61 = Near-IR, 1.0 = 1800nm (Mid-IR)
uniform float uOpticalFidelity;  // 0.3..1.0 (higher when pruned)
uniform float uAnomalyProgress;  // 0.0..1.0

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.04 + vec3(1.7, 9.2, 4.3);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);

  // Physical regime weights across 200nm -> 1800nm
  float uvWeight     = 1.0 - smoothstep(0.05, 0.24, uWavelengthNorm);
  float visWeight    = smoothstep(0.10, 0.22, uWavelengthNorm) * (1.0 - smoothstep(0.36, 0.54, uWavelengthNorm));
  float nearIrWeight = smoothstep(0.35, 0.56, uWavelengthNorm) * (1.0 - smoothstep(0.74, 0.90, uWavelengthNorm));
  float midIrWeight  = smoothstep(0.66, 0.92, uWavelengthNorm);

  vec3 galAxis = normalize(vec3(0.28, 0.91, -0.30));
  float planeDist = abs(dot(d, galAxis));
  float band = exp(-planeDist * 5.2);
  float bulge = exp(-length(d - normalize(vec3(0.32, -0.18, -0.93))) * 3.8);

  float cloud1 = fbm(d * 4.2);
  float cloud2 = fbm(d * 9.5 + vec3(2.1, -1.4, 0.8));
  float filament = pow(1.0 - abs(fbm(d * 6.8 + vec3(-1.3, 3.1, 2.2)) * 2.0 - 1.0), 3.0);

  // Dark dust lane blocks Visible light, turns transparent in Near-IR, and GLOWS in Mid-IR!
  float dustLane = smoothstep(0.38, 0.72, cloud2) * exp(-planeDist * 11.0);

  vec3 voidUV     = vec3(0.005, 0.006, 0.019);
  vec3 voidVis    = vec3(0.005, 0.008, 0.015);
  vec3 voidNearIR = vec3(0.010, 0.008, 0.011);
  vec3 voidMidIR  = vec3(0.016, 0.007, 0.009);
  vec3 col = voidUV * uvWeight + voidVis * visWeight + voidNearIR * nearIrWeight + voidMidIR * midIrWeight;

  // 1. UV / X-RAY: Violent sapphire-violet pulsar shocks & hot ionized knots
  vec3 pulsarDir = normalize(vec3(-0.63, -0.31, -0.71));
  float dPulsar = length(d - pulsarDir);
  float shockRing = exp(-pow(abs(dPulsar - 0.12) * 34.0, 2.0)) * 0.55 + exp(-dPulsar * 18.0) * 0.45;
  float uvKnots = pow(fbm(d * 7.2 + vec3(0.5, 2.4, -1.1)), 3.2);
  col += vec3(0.26, 0.52, 0.98) * uvKnots * uvWeight * 0.52;
  col += vec3(0.48, 0.72, 1.0) * shockRing * uvWeight * 0.55;

  // 2. VISIBLE: Rich sapphire-gold Milky Way with OPAQUE dark dust lanes
  vec3 mwVis = mix(vec3(0.05, 0.09, 0.17), vec3(0.17, 0.14, 0.11), cloud1);
  col += mwVis * band * (0.45 + 0.75 * cloud1) * visWeight * (1.0 - dustLane * 0.88);

  // 3. NEAR-IR: Dust turns transparent, unveiling dense golden galactic bulge
  vec3 mwNear = mix(vec3(0.18, 0.10, 0.05), vec3(0.34, 0.21, 0.10), cloud1);
  col += mwNear * (band * 0.8 + bulge * 1.15) * (0.5 + 0.65 * cloud1) * nearIrWeight * (1.0 - dustLane * 0.12);

  // 4. MID-IR: Glowing crimson-amber molecular dust filaments & warm clouds
  vec3 dustGlowCol = mix(vec3(0.36, 0.09, 0.06), vec3(0.62, 0.26, 0.09), filament);
  col += dustGlowCol * (filament * band * 1.15 + dustLane * 0.72) * midIrWeight;

  // Subtle distant unresolved dust wisps
  float neb = pow(fbm(d * 5.6 + vec3(4.0, 1.2, -3.0)), 3.6);
  vec3 nebTint = mix(vec3(0.08, 0.16, 0.34), vec3(0.28, 0.11, 0.07), uWavelengthNorm);
  col += nebTint * neb * 0.32;

  // 93-billion-light-year spherical horizon seams (emerge in Near/Mid-IR, sharpen with pruning)
  float irWindow = smoothstep(0.52, 0.92, uWavelengthNorm);
  vec3 offsetPole = normalize(vec3(0.49, -0.37, 0.78));
  float theta = acos(clamp(dot(d, offsetPole), -1.0, 1.0));
  float phi = atan(d.y, d.x);

  float latLine = abs(fract(theta * 3.82) - 0.5);
  float lonLine = abs(fract(phi * 2.546) - 0.5);
  float lineWidth = mix(0.012, 0.0038, uOpticalFidelity);
  float seamLat = 1.0 - smoothstep(0.0, lineWidth, latLine);
  float seamLon = 1.0 - smoothstep(0.0, lineWidth, lonLine);
  float seam = max(seamLat, seamLon * 0.65);

  float pulse = 0.82 + 0.18 * sin(uTime * 0.55 + theta * 5.0);
  float revealStrength = irWindow * (0.10 + 0.38 * uOpticalFidelity + 0.28 * uAnomalyProgress);
  vec3 seamCol = mix(vec3(0.46, 0.76, 0.92), vec3(0.94, 0.74, 0.48), 0.42);
  col += seamCol * seam * revealStrength * 0.26 * pulse;

  gl_FragColor = vec4(col, 1.0);
}
`;

export const STAR_VERTEX = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aPhase;
attribute float aBand; // 0=UV/X-ray, 1=Visible, 2=Near-IR shrouded, 3=Mid-IR cool dust star

varying vec3 vColor;
varying float vSize;
varying float vPhase;
varying float vBandVis;

uniform float uFovScale;
uniform float uPixelRatio;
uniform float uWavelengthNorm;

void main() {
  vColor = aColor;
  vPhase = aPhase;

  // Compute physical visibility of each stellar population across 200nm -> 1800nm
  float bandVis = 0.0;
  if (aBand < 0.5) {
    // Hot UV / X-ray sources: bright below 520nm, vanish in IR
    bandVis = 1.0 - smoothstep(0.06, 0.30, uWavelengthNorm);
  } else if (aBand < 1.5) {
    // Visible optical stars: peak around 450-800nm, dim at extremes
    bandVis = 0.25 + 0.85 * smoothstep(0.06, 0.20, uWavelengthNorm) * (1.0 - 0.65 * smoothstep(0.55, 0.92, uWavelengthNorm));
  } else if (aBand < 2.5) {
    // Dust-shrouded Near-IR cluster stars: hidden in optical, reveal past 800nm!
    bandVis = smoothstep(0.32, 0.62, uWavelengthNorm);
  } else {
    // Cool Mid-IR protostars & giants: emerge in Near/Mid-IR
    bandVis = smoothstep(0.58, 0.88, uWavelengthNorm);
  }
  vBandVis = bandVis;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float size = aSize * uPixelRatio * mix(0.9, 1.75, uFovScale) * (0.45 + 0.65 * bandVis);
  vSize = size;
  gl_PointSize = bandVis < 0.02 ? 0.0 : clamp(size, 1.1, 44.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const STAR_FRAGMENT = /* glsl */ `
precision highp float;

varying vec3 vColor;
varying float vSize;
varying float vPhase;
varying float vBandVis;

uniform float uTime;
uniform float uWavelengthNorm;

void main() {
  if (vBandVis < 0.02) discard;

  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r = length(uv);
  if (r > 1.0) discard;

  float core = exp(-r * r * 22.0);
  float halo = exp(-r * 5.0) * 0.38;

  // Authentic JWST 6-point hexagonal diffraction spikes on bright stars
  float spikeMask = smoothstep(5.5, 16.0, vSize);
  float a1 = abs(uv.y);
  float a2 = abs(uv.x * 0.866025 + uv.y * 0.5);
  float a3 = abs(uv.x * 0.866025 - uv.y * 0.5);
  float s1 = exp(-a1 * 34.0) * exp(-abs(uv.x) * 2.6);
  float s2 = exp(-a2 * 34.0) * exp(-r * 2.6);
  float s3 = exp(-a3 * 34.0) * exp(-r * 2.6);
  float spikes = (s1 + s2 + s3) * 0.54 * spikeMask;

  float twinkle = 0.94 + 0.06 * sin(uTime * 1.4 + vPhase * 6.2831);
  vec3 tint = mix(vColor, mix(vColor, vec3(1.0, 0.74, 0.48), 0.35), smoothstep(0.45, 1.0, uWavelengthNorm));
  float intensity = (core * 1.35 + halo + spikes) * twinkle * vBandVis;

  gl_FragColor = vec4(tint * intensity, clamp(intensity, 0.0, 1.0));
}
`;

export const ANOMALY_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Renders authentic NASA/STScI JWST & Hubble deep-field/nebula plates
 * feathered seamlessly into the 3D sky, reacting to wavelength band & pruning.
 */
export const ANOMALY_FRAGMENT = /* glsl */ `
precision highp float;

varying vec2 vUv;
uniform sampler2D uTexture;
uniform float uHasTexture;
uniform float uTime;
uniform float uKind;            // 0 = SMACS 0723 Lens, 1 = Pulsar/UDF Seam, 2 = Sol-Centauri, 3 = Carina Nebula
uniform float uWavelengthMatch; // 0..1
uniform float uOpticalFidelity; // 0.3..1.0
uniform float uZoomFactor;      // 0..1

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  float feather = smoothstep(1.0, 0.36, r);
  float sharpness = mix(1.0, 2.4, uOpticalFidelity);
  vec3 col = vec3(0.0);
  float alpha = 0.0;

  if (uKind < 0.5) {
    // KIND 0: JWST SMACS 0723 Gravitational Lens + Hexagonal Horizon Seam
    vec3 photo = uHasTexture > 0.5 ? texture2D(uTexture, vUv).rgb : vec3(0.0);
    float lum = max(photo.r, max(photo.g, photo.b));
    float blackFloor = smoothstep(0.04, 0.22, lum);
    vec3 irTint = mix(vec3(0.72, 0.80, 0.96), vec3(1.12, 1.02, 0.90), uWavelengthMatch);
    float exposure = mix(0.45, 1.32, uWavelengthMatch * 0.65 + uZoomFactor * 0.35);
    col = photo * irTint * exposure * blackFloor;

    float angle = atan(p.y, p.x);
    float hexAngle = mod(angle + 3.14159, 1.0471975) - 0.5235987;
    float hexR = r * cos(hexAngle);
    float seam = exp(-pow((abs(hexR - 0.50) * 64.0 * sharpness), 2.0));
    float seamArc = 0.45 + 0.55 * sin(angle * 3.0 + 0.6);
    float seamReveal = smoothstep(0.42, 0.95, uWavelengthMatch) * (0.22 + 0.68 * uOpticalFidelity);
    col += vec3(0.55, 0.86, 1.0) * seam * seamArc * seamReveal * 0.62;

    alpha = clamp(max(blackFloor * (0.4 + 0.6 * uWavelengthMatch), seam * seamReveal) * feather, 0.0, 1.0);
  } else if (uKind < 1.5) {
    // KIND 1: Pulsar Rift / Hubble Deep Field in UV-X-ray + Lattice Seam
    vec3 photo = uHasTexture > 0.5 ? texture2D(uTexture, vUv).rgb : vec3(0.0);
    float lum = max(photo.r, max(photo.g, photo.b));
    float blackFloor = smoothstep(0.05, 0.24, lum);
    vec3 uvTint = mix(vec3(0.84, 0.88, 1.02), vec3(0.74, 0.92, 1.32), uWavelengthMatch);
    float exposure = mix(0.35, 1.28, uWavelengthMatch * 0.65 + uZoomFactor * 0.35);
    col = photo * uvTint * exposure * blackFloor;

    // High-energy pulsar jet core visible in UV/X-Ray
    float jet = exp(-abs(p.y - p.x * 0.45) * 26.0) * exp(-r * 3.2) * uWavelengthMatch;
    col += vec3(0.55, 0.78, 1.0) * jet * 0.85;

    vec2 g = abs(fract(p * 4.5 + 0.5) - 0.5);
    float grid = exp(-min(g.x, g.y) * 42.0 * sharpness);
    float reveal = smoothstep(0.45, 0.95, uWavelengthMatch) * (0.20 + 0.65 * uOpticalFidelity);
    col += vec3(0.56, 0.86, 1.0) * grid * reveal * 0.54;

    alpha = clamp(max(blackFloor * (0.3 + 0.7 * uWavelengthMatch), max(jet, grid * reveal)) * feather, 0.0, 1.0);
  } else if (uKind < 2.5) {
    // KIND 2: Sol-Centauri Bearing (Twin Golden Pinpoints in Visible light)
    vec2 solPos = vec2(-0.10, 0.04);
    vec2 cenPos = vec2(0.14, -0.05);
    float dSol = length(p - solPos);
    float dCen = length(p - cenPos);

    float sSol = exp(-dSol * 34.0) + exp(-dSol * 9.0) * 0.32;
    float sCen = exp(-dCen * 28.0) + exp(-dCen * 8.0) * 0.28;

    vec2 sp = p - solPos;
    float spk = exp(-abs(sp.y) * 52.0) * exp(-abs(sp.x) * 6.0)
              + exp(-abs(sp.x * 0.866 + sp.y * 0.5) * 52.0) * exp(-dSol * 6.0)
              + exp(-abs(sp.x * 0.866 - sp.y * 0.5) * 52.0) * exp(-dSol * 6.0);

    float visBoost = 0.35 + 0.75 * uWavelengthMatch;
    col += vec3(1.0, 0.90, 0.68) * (sSol * 1.45 + spk * 0.48) * visBoost;
    col += vec3(1.0, 0.78, 0.54) * (sCen * 1.15) * visBoost;
    alpha = clamp(length(col) * feather, 0.0, 1.0);
  } else {
    // KIND 3: Carina Rift Nursery (Dark veiled dust in Visible, radiant JWST Cosmic Cliffs in Mid-IR!)
    vec3 photo = uHasTexture > 0.5 ? texture2D(uTexture, vUv).rgb : vec3(0.0);
    float lum = max(photo.r, max(photo.g, photo.b));
    float blackFloor = smoothstep(0.05, 0.25, lum);
    float reveal = smoothstep(0.12, 0.95, uWavelengthMatch);
    vec3 irColor = mix(vec3(0.32, 0.24, 0.30), vec3(1.25, 0.95, 0.82), uWavelengthMatch);
    float exposure = mix(0.22, 1.32, reveal * 0.75 + uZoomFactor * 0.25);
    col = photo * irColor * exposure * blackFloor;
    alpha = clamp(blackFloor * (0.2 + 0.8 * reveal) * feather, 0.0, 1.0);
  }

  gl_FragColor = vec4(col, alpha);
}
`;
