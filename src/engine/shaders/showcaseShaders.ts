export const STAR_PLASMA_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

uniform float uTime;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
        mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
        mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

void main() {
  vPos = position;
  float disp = noise3(position * 1.15 + vec3(uTime * 0.28, -uTime * 0.19, uTime * 0.14)) * 0.14;
  vec3 displaced = position + normal * disp;
  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const STAR_PLASMA_FRAGMENT = /* glsl */ `
precision highp float;

varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

uniform float uTime;
uniform float uWaveBand; // 0=UV, 0.33=Visible, 0.67=Near-IR, 1.0=Mid-IR
uniform vec3 uBaseColor;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
        mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
        mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise3(p);
    p = p * 2.15 + vec3(1.3, 4.7, 2.9);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 p = normalize(vPos) * 2.8;
  float n1 = fbm3(p + vec3(uTime * 0.16, -uTime * 0.11, uTime * 0.08));
  float n2 = fbm3(p * 2.4 - vec3(uTime * 0.24, uTime * 0.19, -uTime * 0.12));
  float plasma = clamp(n1 * 0.68 + n2 * 0.45, 0.0, 1.0);

  float spot = smoothstep(0.28, 0.46, plasma);
  float flare = smoothstep(0.68, 0.94, plasma);

  vec3 uvCore = mix(vec3(0.28, 0.52, 0.96), vec3(0.92, 0.96, 1.0), plasma);
  vec3 visCore = mix(uBaseColor * 0.55, vec3(1.0, 0.95, 0.80), spot) + vec3(1.0, 0.98, 0.88) * flare * 0.35;
  vec3 irCore = mix(vec3(0.26, 0.07, 0.03), vec3(1.0, 0.54, 0.18), flare * 0.9 + spot * 0.35);

  vec3 col = uWaveBand < 0.33
    ? mix(uvCore, visCore, uWaveBand / 0.33)
    : mix(visCore, irCore, (uWaveBand - 0.33) / 0.67);

  float ndotv = clamp(dot(normalize(vWorldNormal), normalize(vViewDir)), 0.0, 1.0);
  float limb = pow(1.0 - ndotv, 2.4);
  vec3 rimTint = mix(vec3(0.62, 0.84, 1.0), vec3(1.0, 0.46, 0.16), uWaveBand);
  col += rimTint * limb * (0.75 + 0.45 * flare);

  gl_FragColor = vec4(col, 1.0);
}
`;

export const CORONA_VERTEX = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vViewDir;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const CORONA_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vWorldNormal;
varying vec3 vViewDir;
uniform float uTime;
uniform float uWaveBand;
uniform vec3 uColor;

void main() {
  float ndotv = abs(dot(normalize(vWorldNormal), normalize(vViewDir)));
  float glow = pow(clamp(1.0 - ndotv, 0.0, 1.0), 3.4);
  float shimmer = 0.88 + 0.12 * sin(uTime * 1.8 + ndotv * 10.0);
  vec3 tint = mix(vec3(0.55, 0.82, 1.0), mix(uColor, vec3(1.0, 0.42, 0.14), smoothstep(0.45, 1.0, uWaveBand)), smoothstep(0.0, 0.4, uWaveBand));
  float strength = mix(1.3, 0.72, uWaveBand);
  gl_FragColor = vec4(tint * glow * shimmer * strength, clamp(glow * 0.85, 0.0, 1.0));
}
`;

export const PLANET_VERTEX = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const PLANET_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec2 vUv;

uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uAtmoColor;
uniform float uHasAtmo;
uniform float uBandFreq;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(-vWorldPos);
  vec3 V = normalize(cameraPosition - vWorldPos);

  float diff = clamp(dot(N, L), 0.0, 1.0);
  float band = 0.5 + 0.5 * sin(vUv.y * uBandFreq + noise2(vUv * 8.0 + vec2(uTime * 0.03, 0.0)) * 2.2);
  vec3 surface = mix(uColorA, uColorB, band);

  vec3 lit = surface * (0.07 + 1.05 * smoothstep(0.0, 0.85, diff));
  float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  float dayRim = smoothstep(-0.15, 0.5, dot(N, L));
  lit += uAtmoColor * fresnel * uHasAtmo * (0.25 + 0.75 * dayRim);

  gl_FragColor = vec4(lit, 1.0);
}
`;

export const RING_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const RING_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r < 0.42 || r > 0.98) discard;
  float bands = 0.55 + 0.45 * sin(r * 68.0) * cos(r * 23.0);
  float edge = smoothstep(0.42, 0.48, r) * (1.0 - smoothstep(0.86, 0.98, r));
  float alpha = edge * (0.18 + 0.42 * bands);
  gl_FragColor = vec4(uColor * (0.7 + 0.4 * bands), alpha);
}
`;

/* ==================== TRUE 3D CLUSTER STAR SPRITES ==================== */
export const CLUSTER_STAR_VERTEX = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aPhase;

varying vec3 vColor;
varying float vSize;
varying float vPhase;

uniform float uPixelRatio;

void main() {
  vColor = aColor;
  vPhase = aPhase;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(6.0, -mv.z);
  float size = (aSize * uPixelRatio * 26.0) / dist;
  vSize = size;
  gl_PointSize = clamp(size, 1.2, 42.0);
  gl_Position = projectionMatrix * mv;
}
`;

export const CLUSTER_STAR_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vSize;
varying float vPhase;
uniform float uTime;
uniform float uWaveBand;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r = length(uv);
  if (r > 1.0) discard;

  float core = exp(-r * r * 20.0);
  float halo = exp(-r * 4.5) * 0.42;

  float spikeMask = smoothstep(6.5, 18.0, vSize);
  float s1 = exp(-abs(uv.y) * 30.0) * exp(-abs(uv.x) * 2.6);
  float s2 = exp(-abs(uv.x * 0.866 + uv.y * 0.5) * 30.0) * exp(-r * 2.6);
  float s3 = exp(-abs(uv.x * 0.866 - uv.y * 0.5) * 30.0) * exp(-r * 2.6);
  float spikes = (s1 + s2 + s3) * 0.48 * spikeMask;

  float twinkle = 0.94 + 0.06 * sin(uTime * 1.5 + vPhase * 6.2831);
  vec3 uvTint = mix(vColor, vec3(0.68, 0.86, 1.0), 0.45);
  vec3 irTint = mix(vColor, vec3(1.0, 0.78, 0.52), 0.42);
  vec3 tint = uWaveBand < 0.33
    ? mix(uvTint, vColor, uWaveBand / 0.33)
    : mix(vColor, irTint, (uWaveBand - 0.33) / 0.67);

  float intensity = (core * 1.35 + halo + spikes) * twinkle;
  gl_FragColor = vec4(tint * intensity, clamp(intensity, 0.0, 1.0));
}
`;

/* ==================== 3D SPHERICAL EINSTEIN GRAVITATIONAL LENSING SHELL ==================== */
export const EINSTEIN_SHELL_VERTEX = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying vec3 vLocalPos;
void main() {
  vLocalPos = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const EINSTEIN_SHELL_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying vec3 vLocalPos;

uniform float uTime;
uniform float uWaveBand;
uniform float uOpticalFidelity;

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(vViewDir);
  float ndotv = abs(dot(N, V));

  // Luminous Einstein ring concentrated at the tangential lensing limb around the 3D cluster
  float ringZone = exp(-pow((ndotv - 0.46) * 8.5, 2.0));
  float outerHalo = pow(clamp(1.0 - ndotv, 0.0, 1.0), 3.0) * 0.45;

  // Tangential azimuth around view vector so arcs break organically into realistic gravitational arcs
  vec3 upRef = abs(V.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(upRef, V));
  vec3 up = cross(V, right);
  float ang = atan(dot(N, up), dot(N, right));

  float arc1 = smoothstep(0.15, 0.85, sin(ang * 3.0 + uTime * 0.12) * 0.5 + 0.5);
  float arc2 = smoothstep(0.35, 0.95, cos(ang * 5.0 - 0.7) * 0.5 + 0.5);
  float arcPattern = 0.32 + 0.68 * max(arc1, arc2 * 0.8);

  vec3 uvCol = vec3(0.54, 0.82, 1.0);
  vec3 visCol = vec3(0.76, 0.88, 1.0);
  vec3 irCol = vec3(1.0, 0.78, 0.46);
  vec3 arcCol = uWaveBand < 0.33
    ? mix(uvCol, visCol, uWaveBand / 0.33)
    : mix(visCol, irCol, (uWaveBand - 0.33) / 0.67);

  float intensity = (ringZone * arcPattern * 0.92 + outerHalo) * (0.65 + 0.45 * uWaveBand);
  gl_FragColor = vec4(arcCol * intensity, clamp(intensity, 0.0, 0.95));
}
`;

/* ==================== OUTER 3D SPHERICAL HORIZON ENCLOSURE SHELL ==================== */
export const HORIZON_SPHERE_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const HORIZON_SPHERE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform float uWaveBand;
uniform float uOpticalFidelity;
uniform float uIsPulsar;

void main() {
  vec3 d = normalize(vDir);
  vec3 pole = normalize(vec3(0.35, 0.65, -0.66));
  float theta = acos(clamp(dot(d, pole), -1.0, 1.0));
  float phi = atan(d.z, d.x);

  float latLine = abs(fract(theta * 4.2) - 0.5);
  float lonLine = abs(fract(phi * 2.864) - 0.5);
  float width = mix(0.014, 0.0045, uOpticalFidelity);
  float seam = max(1.0 - smoothstep(0.0, width, latLine), (1.0 - smoothstep(0.0, width, lonLine)) * 0.75);

  float waveReveal = uIsPulsar > 0.5
    ? max(1.0 - smoothstep(0.0, 0.35, uWaveBand), smoothstep(0.45, 0.95, uWaveBand))
    : smoothstep(0.42, 0.92, uWaveBand);

  float pulse = 0.8 + 0.2 * sin(uTime * 0.8 + theta * 4.0);
  float strength = seam * waveReveal * (0.24 + 0.76 * uOpticalFidelity) * 0.48 * pulse;
  if (strength < 0.01) discard;

  vec3 col = mix(vec3(0.48, 0.84, 1.0), vec3(0.98, 0.76, 0.46), uWaveBand * 0.45);
  gl_FragColor = vec4(col * strength, clamp(strength, 0.0, 0.85));
}
`;

/* ==================== 3D VOLUMETRIC NEBULA CLOUD PUFFS ==================== */
export const NEBULA_PUFF_VERTEX = /* glsl */ `
attribute float aSize;
attribute float aSeed;
attribute float aKind; // 0 = dark-to-glow dust pillar, 1 = additive ionized gas halo

varying float vSeed;
varying float vKind;
varying float vNearFade;

uniform float uPixelRatio;

void main() {
  vSeed = aSeed;
  vKind = aKind;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(1.0, -mv.z);
  // Smoothly part nearby clouds as camera flies deep inside the nebula pillars
  vNearFade = smoothstep(3.2, 10.5, dist);
  gl_PointSize = clamp((aSize * uPixelRatio * 42.0) / max(6.0, dist), 10.0, 220.0);
  gl_Position = projectionMatrix * mv;
}
`;

export const NEBULA_PUFF_FRAGMENT = /* glsl */ `
precision highp float;
varying float vSeed;
varying float vKind;
varying float vNearFade;

uniform float uTime;
uniform float uWaveBand; // 0=UV, 0.33=Visible, 0.67=Near-IR, 1.0=Mid-IR

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm2(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise2(p);
    p = p * 2.06 + vec2(2.3, 1.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  if (vNearFade < 0.02) discard;

  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r = length(uv);
  if (r > 1.0) discard;

  float rot = vSeed * 6.2831 + uTime * 0.025;
  float ca = cos(rot);
  float sa = sin(rot);
  vec2 ruv = vec2(uv.x * ca - uv.y * sa, uv.x * sa + uv.y * ca);

  float n = fbm2(ruv * 2.4 + vec2(vSeed * 13.7, vSeed * 5.1));
  float radial = smoothstep(1.0, 0.12, r);
  float density = radial * smoothstep(0.24, 0.78, n + 0.16);
  if (density < 0.02) discard;

  if (vKind < 0.5) {
    float rim = smoothstep(0.18, 0.55, r) * (1.0 - smoothstep(0.62, 1.0, r));
    vec3 uvCol = mix(vec3(0.05, 0.08, 0.18), vec3(0.42, 0.72, 1.0), rim * 0.9);
    vec3 visCol = mix(vec3(0.06, 0.04, 0.05), vec3(0.68, 0.52, 0.36), rim * 0.75);
    vec3 irCol = mix(vec3(0.42, 0.14, 0.06), vec3(1.0, 0.72, 0.34), n);

    vec3 col = uWaveBand < 0.33
      ? mix(uvCol, visCol, uWaveBand / 0.33)
      : mix(visCol, irCol, (uWaveBand - 0.33) / 0.67);

    float alpha = density * mix(0.68, 0.42, smoothstep(0.35, 1.0, uWaveBand)) * vNearFade;
    gl_FragColor = vec4(col, alpha);
  } else {
    vec3 uvGas = vec3(0.26, 0.58, 1.0);
    vec3 visGas = mix(vec3(0.14, 0.42, 0.58), vec3(0.72, 0.48, 0.28), n);
    vec3 irGas = mix(vec3(0.78, 0.24, 0.10), vec3(1.0, 0.66, 0.26), n);

    vec3 col = uWaveBand < 0.33
      ? mix(uvGas, visGas, uWaveBand / 0.33)
      : mix(visGas, irGas, (uWaveBand - 0.33) / 0.67);

    float alpha = density * mix(0.24, 0.34, uWaveBand) * (0.25 + 0.75 * vNearFade);
    gl_FragColor = vec4(col * alpha, alpha);
  }
}
`;

/* ==================== 3D RELATIVISTIC PULSAR DISK, JETS & SUPERNOVA SHELL ==================== */
export const ACCRETION_DISK_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const ACCRETION_DISK_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uWaveBand;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r < 0.20 || r > 0.98) discard;

  float ang = atan(p.y, p.x);
  float spiral = 0.5 + 0.5 * sin(ang * 3.0 - r * 22.0 + uTime * 3.4);
  float spiral2 = 0.5 + 0.5 * cos(ang * 5.0 - r * 34.0 + uTime * 5.1);
  float heat = exp(-(r - 0.22) * 4.5);
  float edge = smoothstep(0.20, 0.26, r) * (1.0 - smoothstep(0.78, 0.98, r));

  vec3 uvCol = mix(vec3(0.32, 0.68, 1.0), vec3(0.90, 0.96, 1.0), heat);
  vec3 visCol = mix(vec3(0.54, 0.72, 0.96), vec3(1.0, 0.88, 0.66), heat);
  vec3 irCol = mix(vec3(0.74, 0.22, 0.10), vec3(1.0, 0.62, 0.28), heat);

  vec3 col = uWaveBand < 0.33
    ? mix(uvCol, visCol, uWaveBand / 0.33)
    : mix(visCol, irCol, (uWaveBand - 0.33) / 0.67);

  float intensity = edge * (0.35 + 0.65 * mix(spiral, spiral2, 0.4)) * (0.65 + 0.85 * heat);
  gl_FragColor = vec4(col * intensity, clamp(intensity, 0.0, 0.95));
}
`;

export const POLAR_JET_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const POLAR_JET_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;
uniform float uTime;
uniform float uWaveBand;

void main() {
  float axial = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
  float edgeSoft = pow(abs(dot(normalize(vNormal), normalize(vViewDir))), 1.2);
  float knot = 0.65 + 0.35 * sin(vUv.y * 28.0 - uTime * 7.0);

  // Blazes strongest in UV / X-Ray!
  float uvPower = mix(1.45, 0.38, smoothstep(0.0, 0.85, uWaveBand));
  vec3 col = mix(vec3(0.45, 0.80, 1.0), vec3(0.85, 0.56, 1.0), vUv.y);
  float alpha = axial * edgeSoft * knot * 0.65 * uvPower;
  gl_FragColor = vec4(col * alpha * 1.4, clamp(alpha, 0.0, 0.9));
}
`;

export const SHOCK_SHELL_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying vec3 vLocalPos;

uniform float uTime;
uniform float uWaveBand;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
        mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
        mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(vViewDir);
  float rim = pow(1.0 - abs(dot(N, V)), 2.2);

  float fil = noise3(vLocalPos * 4.5 + vec3(uTime * 0.06));
  float fil2 = noise3(vLocalPos * 9.0 - vec3(uTime * 0.09));
  float web = pow(1.0 - abs(fil * 2.0 - 1.0), 2.5) * 0.7 + fil2 * 0.4;

  vec3 uvCol = vec3(0.36, 0.74, 1.0);
  vec3 visCol = vec3(0.32, 0.62, 0.85);
  vec3 irCol = vec3(0.95, 0.46, 0.24);
  vec3 col = uWaveBand < 0.33
    ? mix(uvCol, visCol, uWaveBand / 0.33)
    : mix(visCol, irCol, (uWaveBand - 0.33) / 0.67);

  float strength = (rim * 0.75 + web * 0.45) * mix(0.85, 0.42, uWaveBand * 0.7);
  gl_FragColor = vec4(col * strength, clamp(strength * 0.85, 0.0, 0.82));
}
`;
