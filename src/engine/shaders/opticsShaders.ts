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

  // Authentic pitch-black deep space with delicate Milky Way & molecular dust band
  vec3 galAxis = normalize(vec3(0.28, 0.91, -0.30));
  float planeDist = abs(dot(d, galAxis));
  float band = exp(-planeDist * 5.8);

  float cloud1 = fbm(d * 4.2);
  float cloud2 = fbm(d * 9.0 + vec3(2.1, -1.4, 0.8));
  float dustLane = smoothstep(0.40, 0.72, cloud2) * exp(-planeDist * 12.0);

  // Authentic astrophotography palette: obsidian void, sapphire & warm gold dust
  vec3 voidOptical = vec3(0.006, 0.009, 0.018);
  vec3 voidIR      = vec3(0.012, 0.008, 0.014);
  vec3 col = mix(voidOptical, voidIR, uWavelengthNorm);

  vec3 mwOptical = mix(vec3(0.04, 0.075, 0.145), vec3(0.14, 0.11, 0.09), cloud1);
  vec3 mwIR      = mix(vec3(0.13, 0.075, 0.04), vec3(0.26, 0.15, 0.08), cloud1);
  vec3 mwColor   = mix(mwOptical, mwIR, uWavelengthNorm);

  float dustAtten = mix(0.82, 0.16, uWavelengthNorm);
  col += mwColor * band * (0.4 + 0.72 * cloud1) * (1.0 - dustLane * dustAtten);

  // Subtle distant unresolved dust wisps
  float neb = pow(fbm(d * 5.6 + vec3(4.0, 1.2, -3.0)), 3.6);
  vec3 nebCol = mix(vec3(0.05, 0.09, 0.19), vec3(0.20, 0.10, 0.06), uWavelengthNorm);
  col += nebCol * neb * 0.36;

  // Ultra-delicate 93-billion-light-year spherical horizon seams (ghostly, never neon)
  float irWindow = smoothstep(0.46, 0.90, uWavelengthNorm);
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
  float revealStrength = irWindow * (0.09 + 0.36 * uOpticalFidelity + 0.28 * uAnomalyProgress);
  vec3 seamCol = mix(vec3(0.46, 0.76, 0.92), vec3(0.94, 0.74, 0.48), 0.42);
  col += seamCol * seam * revealStrength * 0.24 * pulse;

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

uniform float uFovScale;
uniform float uPixelRatio;

void main() {
  vColor = aColor;
  vPhase = aPhase;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float size = aSize * uPixelRatio * mix(0.9, 1.7, uFovScale);
  vSize = size;
  gl_PointSize = clamp(size, 1.1, 44.0);
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

  float twinkle = 0.95 + 0.05 * sin(uTime * 1.2 + vPhase * 6.2831);
  vec3 tint = mix(vColor, mix(vColor, vec3(1.0, 0.78, 0.54), 0.32), uWavelengthNorm);
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

/**
 * Renders authentic NASA/STScI JWST & Hubble deep-field astrophotography plates
 * seamlessly feathered into the 3D void, overlaid with spectral-tuned geometric
 * horizon leaks that sharpen as Humanity is pruned.
 */
export const ANOMALY_FRAGMENT = /* glsl */ `
precision highp float;

varying vec2 vUv;
uniform sampler2D uTexture;
uniform float uHasTexture;
uniform float uTime;
uniform float uKind;            // 0 = JWST SMACS 0723 Lens, 1 = Hubble UDF Seam, 2 = Sol-Centauri Bearing
uniform float uWavelengthMatch; // 0..1
uniform float uOpticalFidelity; // 0.3..1.0
uniform float uZoomFactor;      // 0..1

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  // Soft circular feather so the deep-field photo melts invisibly into the 3D starfield
  float feather = smoothstep(1.0, 0.38, r);
  float sharpness = mix(1.0, 2.4, uOpticalFidelity);
  vec3 col = vec3(0.0);
  float alpha = 0.0;

  if (uKind < 0.5) {
    // KIND 0: Real NASA/STScI JWST First Deep Field (SMACS 0723) + Subtle Geometric Horizon Seam
    vec3 photo = uHasTexture > 0.5 ? texture2D(uTexture, vUv).rgb : vec3(0.0);
    // Lift crisp luminous galaxies while keeping black sky background pure additive
    float lum = max(photo.r, max(photo.g, photo.b));
    float blackFloor = smoothstep(0.04, 0.22, lum);
    // Optical vs Near-IR enhancement: tuning near 1340nm brings out warm amber lensing arcs
    vec3 irTint = mix(vec3(0.72, 0.80, 0.96), vec3(1.12, 1.02, 0.90), uWavelengthMatch);
    float exposure = mix(0.68, 1.28, uWavelengthMatch * 0.65 + uZoomFactor * 0.35);
    col = photo * irTint * exposure * blackFloor;

    // Subtle unnatural hexagonal horizon seam hidden inside the gravitational lens at ~1340nm
    float angle = atan(p.y, p.x);
    float hexAngle = mod(angle + 3.14159, 1.0471975) - 0.5235987;
    float hexR = r * cos(hexAngle);
    float seam = exp(-pow((abs(hexR - 0.50) * 64.0 * sharpness), 2.0));
    float seamArc = 0.45 + 0.55 * sin(angle * 3.0 + 0.6);
    float seamReveal = smoothstep(0.45, 0.95, uWavelengthMatch) * (0.22 + 0.68 * uOpticalFidelity);
    col += vec3(0.55, 0.86, 1.0) * seam * seamArc * seamReveal * 0.58;

    alpha = clamp(max(blackFloor, seam * seamReveal) * feather, 0.0, 1.0);
  } else if (uKind < 1.5) {
    // KIND 1: Real NASA/STScI Hubble Ultra Deep Field + Repeating Horizon Facet Interference
    vec3 photo = uHasTexture > 0.5 ? texture2D(uTexture, vUv).rgb : vec3(0.0);
    float lum = max(photo.r, max(photo.g, photo.b));
    float blackFloor = smoothstep(0.05, 0.24, lum);
    vec3 irTint = mix(vec3(0.84, 0.90, 1.05), vec3(1.14, 0.96, 0.82), uWavelengthMatch);
    float exposure = mix(0.65, 1.25, uWavelengthMatch * 0.6 + uZoomFactor * 0.4);
    col = photo * irTint * exposure * blackFloor;

    vec2 g = abs(fract(p * 4.5 + 0.5) - 0.5);
    float grid = exp(-min(g.x, g.y) * 42.0 * sharpness);
    float reveal = smoothstep(0.45, 0.95, uWavelengthMatch) * (0.20 + 0.65 * uOpticalFidelity);
    col += vec3(0.52, 0.84, 0.98) * grid * reveal * 0.52;

    alpha = clamp(max(blackFloor, grid * reveal) * feather, 0.0, 1.0);
  } else {
    // KIND 2: Sol-Centauri Bearing (10.0 LY Astern) — Twin Quiet Golden Pinpoints
    vec2 solPos = vec2(-0.10, 0.04);
    vec2 cenPos = vec2(0.14, -0.05);
    float dSol = length(p - solPos);
    float dCen = length(p - cenPos);

    float sSol = exp(-dSol * 34.0) + exp(-dSol * 9.0) * 0.30;
    float sCen = exp(-dCen * 28.0) + exp(-dCen * 8.0) * 0.28;

    vec2 sp = p - solPos;
    float spk = exp(-abs(sp.y) * 52.0) * exp(-abs(sp.x) * 6.0)
              + exp(-abs(sp.x * 0.866 + sp.y * 0.5) * 52.0) * exp(-dSol * 6.0)
              + exp(-abs(sp.x * 0.866 - sp.y * 0.5) * 52.0) * exp(-dSol * 6.0);

    col += vec3(1.0, 0.90, 0.68) * (sSol * 1.45 + spk * 0.48);
    col += vec3(1.0, 0.78, 0.54) * (sCen * 1.15);
    alpha = clamp(length(col) * feather, 0.0, 1.0);
  }

  gl_FragColor = vec4(col, alpha);
}
`;
