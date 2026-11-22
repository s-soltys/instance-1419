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
uniform float uWavelengthNorm;   // 0.0 = 400nm (optical), 1.0 = 1800nm (mid-IR)
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

  // Tilted galactic plane for Milky Way band
  vec3 galAxis = normalize(vec3(0.28, 0.91, -0.30));
  float planeDist = abs(dot(d, galAxis));
  float band = exp(-planeDist * 5.2);

  float cloud1 = fbm(d * 3.8);
  float cloud2 = fbm(d * 8.5 + vec3(2.1, -1.4, 0.8));
  float dustLane = smoothstep(0.42, 0.72, cloud2) * exp(-planeDist * 11.0);

  // Optical vs Infrared palette shift (dust peels away in IR, revealing warmer deep glow)
  vec3 voidOptical = vec3(0.012, 0.018, 0.036);
  vec3 voidIR      = vec3(0.022, 0.015, 0.024);
  vec3 col = mix(voidOptical, voidIR, uWavelengthNorm);

  vec3 mwOptical = mix(vec3(0.06, 0.10, 0.19), vec3(0.18, 0.15, 0.13), cloud1);
  vec3 mwIR      = mix(vec3(0.16, 0.09, 0.05), vec3(0.32, 0.19, 0.10), cloud1);
  vec3 mwColor   = mix(mwOptical, mwIR, uWavelengthNorm);

  float dustAtten = mix(0.75, 0.15, uWavelengthNorm);
  col += mwColor * band * (0.45 + 0.75 * cloud1) * (1.0 - dustLane * dustAtten);

  // Subtle background unresolved nebula pockets
  float neb = pow(fbm(d * 5.4 + vec3(4.0, 1.2, -3.0)), 3.2);
  vec3 nebCol = mix(vec3(0.09, 0.14, 0.28), vec3(0.26, 0.13, 0.09), uWavelengthNorm);
  col += nebCol * neb * 0.45;

  // Faint impossible 93-billion-light-year spherical horizon seams (only visible in near/mid-IR)
  float irWindow = smoothstep(0.42, 0.88, uWavelengthNorm);
  // Great-circle geodesic-like arcs centered slightly offset toward Sol-Centauri bearing
  vec3 offsetPole = normalize(vec3(0.49, -0.37, 0.78));
  float theta = acos(clamp(dot(d, offsetPole), -1.0, 1.0));
  float phi = atan(d.y, d.x);

  float latLine = abs(fract(theta * 3.82) - 0.5);
  float lonLine = abs(fract(phi * 2.546) - 0.5);
  float lineWidth = mix(0.018, 0.0055, uOpticalFidelity);
  float seamLat = 1.0 - smoothstep(0.0, lineWidth, latLine);
  float seamLon = 1.0 - smoothstep(0.0, lineWidth, lonLine);
  float seam = max(seamLat, seamLon * 0.75);

  float pulse = 0.78 + 0.22 * sin(uTime * 0.65 + theta * 6.0);
  float revealStrength = irWindow * (0.12 + 0.45 * uOpticalFidelity + 0.35 * uAnomalyProgress);
  vec3 seamCol = mix(vec3(0.35, 0.74, 0.96), vec3(0.96, 0.74, 0.42), 0.35);
  col += seamCol * seam * revealStrength * 0.32 * pulse;

  gl_FragColor = vec4(col, 1.0);
}
`;

export const STAR_VERTEX = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aPhase;

varying vec3 vColor;
varying float vSize;
varying float vPhase;

uniform float uFovScale; // increases as player zooms in
uniform float uPixelRatio;

void main() {
  vColor = aColor;
  vPhase = aPhase;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float size = aSize * uPixelRatio * mix(0.95, 1.75, uFovScale);
  vSize = size;
  gl_PointSize = clamp(size, 1.2, 42.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const STAR_FRAGMENT = /* glsl */ `
precision highp float;

varying vec3 vColor;
varying float vSize;
varying float vPhase;

uniform float uTime;
uniform float uWavelengthNorm;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r = length(uv);
  if (r > 1.0) discard;

  // Crisp Airy core + soft halo
  float core = exp(-r * r * 18.0);
  float halo = exp(-r * 4.5) * 0.45;

  // JWST-inspired 6-point hexagonal diffraction spikes for brighter stars
  float spikeMask = smoothstep(5.5, 16.0, vSize);
  float a1 = abs(uv.y);
  float a2 = abs(uv.x * 0.866025 + uv.y * 0.5);
  float a3 = abs(uv.x * 0.866025 - uv.y * 0.5);
  float s1 = exp(-a1 * 28.0) * exp(-abs(uv.x) * 2.4);
  float s2 = exp(-a2 * 28.0) * exp(-r * 2.4);
  float s3 = exp(-a3 * 28.0) * exp(-r * 2.4);
  float spikes = (s1 + s2 + s3) * 0.52 * spikeMask;

  float twinkle = 0.94 + 0.06 * sin(uTime * 1.4 + vPhase * 6.2831);
  vec3 tint = mix(vColor, mix(vColor, vec3(1.0, 0.78, 0.55), 0.38), uWavelengthNorm);
  float intensity = (core * 1.35 + halo + spikes) * twinkle;

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

export const ANOMALY_FRAGMENT = /* glsl */ `
precision highp float;

varying vec2 vUv;
uniform float uTime;
uniform float uKind;            // 0 = Einstein Ring, 1 = Horizon Lattice, 2 = Sol-Centauri Bearing
uniform float uWavelengthMatch; // 0..1 how close current slider is to target optimal nm
uniform float uOpticalFidelity; // 0.3..1.0 (sharper when pruned)
uniform float uZoomFactor;      // 0..1 (higher when zoomed in)

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x),
    mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  float edgeFade = smoothstep(1.0, 0.55, r);
  float sharpness = mix(1.0, 2.35, uOpticalFidelity);
  vec3 col = vec3(0.0);
  float alpha = 0.0;

  if (uKind < 0.5) {
    // KIND 0: Cluster J1419-A — Foreground Elliptical Galaxy + Real-Time Einstein Ring + Impossible Geometric Seam
    float core = exp(-r * r * 38.0);
    vec2 ell = vec2(p.x * 1.15, p.y * 1.55);
    float galHalo = exp(-length(ell) * 6.5) * 0.85;
    col += vec3(1.0, 0.84, 0.56) * (core * 1.3 + galHalo);

    // Lensed Einstein Ring (warped spiral arcs around r ~ 0.42)
    float angle = atan(p.y, p.x);
    float ringRadius = 0.42 + 0.018 * sin(angle * 3.0 + uTime * 0.2);
    float ringDist = abs(r - ringRadius);
    float ringWidth = mix(0.048, 0.016, uOpticalFidelity * 0.65 + uZoomFactor * 0.35);
    float arcBreak = smoothstep(-0.35, 0.45, sin(angle * 2.0 - 0.7)) * 0.65 + 0.35;
    float einstein = exp(-pow(ringDist / ringWidth, 2.0)) * arcBreak;
    col += mix(vec3(0.45, 0.72, 1.0), vec3(0.98, 0.82, 0.52), 0.35) * einstein * (0.75 + 0.75 * uWavelengthMatch);

    // Unnatural delicate geometric seam emerging when wavelength matches (~1340nm)
    float hexAngle = mod(angle + 3.14159, 1.0471975) - 0.5235987;
    float hexR = r * cos(hexAngle);
    float seam = exp(-pow((abs(hexR - 0.54) * 58.0 * sharpness), 2.0));
    float seamFade = 0.55 + 0.45 * sin(angle * 3.0 + 0.8);
    float seamReveal = smoothstep(0.38, 0.95, uWavelengthMatch) * (0.28 + 0.62 * uOpticalFidelity);
    col += vec3(0.52, 0.86, 1.0) * seam * seamFade * seamReveal * 0.68;

    // Tiny surrounding cluster galaxies
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      vec2 gPos = vec2(cos(fi * 1.15 + 0.4), sin(fi * 1.65 - 0.2)) * (0.24 + 0.11 * mod(fi, 3.0));
      float gd = length(p - gPos);
      col += vec3(0.95, 0.76, 0.55) * exp(-gd * 32.0) * 0.65;
    }

    alpha = clamp(length(col) * edgeFade, 0.0, 1.0);
  } else if (uKind < 1.5) {
    // KIND 1: Deep Field S-04 — Spiral Galaxy Field + Repeating Horizon Facet Lattice
    float angle = atan(p.y, p.x);
    float spiral = sin(angle * 2.0 - r * 14.0) * 0.5 + 0.5;
    float disk = exp(-r * 4.2) * (0.45 + 0.55 * spiral) * (0.6 + 0.4 * noise2(p * 8.0));
    col += mix(vec3(0.48, 0.66, 0.98), vec3(0.98, 0.78, 0.58), exp(-r * 6.0)) * disk * 1.1;

    // Repeating impossible horizon facets at ~1560nm
    vec2 g = abs(fract(p * 4.5 + 0.5) - 0.5);
    float grid = exp(-min(g.x, g.y) * 26.0 * sharpness);
    float ringMask = smoothstep(0.85, 0.15, r);
    float reveal = smoothstep(0.32, 0.95, uWavelengthMatch) * (0.3 + 0.7 * uOpticalFidelity);
    col += vec3(0.45, 0.88, 1.0) * grid * ringMask * reveal * 1.15;

    alpha = clamp(length(col) * edgeFade, 0.0, 1.0);
  } else {
    // KIND 2: Sol-Centauri Home Bearing (10.0 LY astern) — Warm Double Pinpoint
    vec2 solPos = vec2(-0.11, 0.04);
    vec2 cenPos = vec2(0.14, -0.06);
    float dSol = length(p - solPos);
    float dCen = length(p - cenPos);

    float sSol = exp(-dSol * 28.0) + exp(-dSol * 8.0) * 0.35;
    float sCen = exp(-dCen * 24.0) + exp(-dCen * 7.0) * 0.35;

    // Delicate 6-point spikes on Sol
    vec2 sp = p - solPos;
    float spk = exp(-abs(sp.y) * 42.0) * exp(-abs(sp.x) * 5.0)
              + exp(-abs(sp.x * 0.866 + sp.y * 0.5) * 42.0) * exp(-dSol * 5.0)
              + exp(-abs(sp.x * 0.866 - sp.y * 0.5) * 42.0) * exp(-dSol * 5.0);

    col += vec3(1.0, 0.88, 0.64) * (sSol * 1.4 + spk * 0.45);
    col += vec3(1.0, 0.76, 0.50) * (sCen * 1.15);

    // Subtle calibration ring
    float refRing = exp(-pow(abs(r - 0.56) * 40.0, 2.0)) * 0.25;
    col += vec3(0.95, 0.78, 0.48) * refRing;
    alpha = clamp(length(col) * edgeFade, 0.0, 1.0);
  }

  gl_FragColor = vec4(col, alpha);
}
`;
