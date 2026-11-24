import { clamp, lerp } from '../tactilePhysics';
import type { SpectralClass, VibeMode } from '../types';

export interface SpectralColorDef {
  cls: SpectralClass;
  hex: string;
  rgb: readonly [number, number, number];
  kelvin: number;
}

export const SPECTRAL_PALETTE: readonly SpectralColorDef[] = [
  { cls: 'O', hex: '#9bb8ff', rgb: [155, 184, 255], kelvin: 30000 },
  { cls: 'B', hex: '#b8d2ff', rgb: [184, 210, 255], kelvin: 15000 },
  { cls: 'A', hex: '#e8f0ff', rgb: [232, 240, 255], kelvin: 9500 },
  { cls: 'F', hex: '#fff6e8', rgb: [255, 246, 232], kelvin: 6800 },
  { cls: 'G', hex: '#ffe6bd', rgb: [255, 230, 189], kelvin: 5800 },
  { cls: 'K', hex: '#ffc482', rgb: [255, 196, 130], kelvin: 4400 },
  { cls: 'M', hex: '#ff9358', rgb: [255, 147, 88], kelvin: 3100 },
  { cls: 'LOCK', hex: '#8be9c0', rgb: [139, 233, 192], kelvin: 7500 },
  { cls: 'ALERT', hex: '#ff7a6b', rgb: [255, 122, 107], kelvin: 3000 },
] as const;

const SPECTRAL_INDEX: Record<SpectralClass, number> = {
  O: 0,
  B: 1,
  A: 2,
  F: 3,
  G: 4,
  K: 5,
  M: 6,
  LOCK: 7,
  ALERT: 8,
};

const ATLAS_WIDTH = 1152; // 9 columns * 128px
const ATLAS_HEIGHT = 320; // Row 0: 64px (unspiked), Row 1: 128px (4-pt Hubble), Row 2: 128px (6-pt JWST)

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16) || 255,
      parseInt(clean[1] + clean[1], 16) || 255,
      parseInt(clean[2] + clean[2], 16) || 255,
    ];
  }
  if (clean.length >= 6) {
    return [
      parseInt(clean.slice(0, 2), 16) || 255,
      parseInt(clean.slice(2, 4), 16) || 255,
      parseInt(clean.slice(4, 6), 16) || 255,
    ];
  }
  return [255, 246, 232];
}

const hexCache = new Map<string, SpectralClass>();

/**
 * Quantizes any arbitrary hex color to the nearest pre-rendered spectral atlas column.
 */
export function quantizeHexToSpectralClass(hex: string): SpectralClass {
  const key = hex.toLowerCase();
  const cached = hexCache.get(key);
  if (cached) return cached;

  const [r, g, b] = parseHexRgb(key);
  let best: SpectralClass = 'F';
  let bestDist = Infinity;
  for (const def of SPECTRAL_PALETTE) {
    const dr = r - def.rgb[0];
    const dg = g - def.rgb[1];
    const db = b - def.rgb[2];
    // Weighted perceptual distance
    const dist = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (dist < bestDist) {
      bestDist = dist;
      best = def.cls;
    }
  }
  hexCache.set(key, best);
  return best;
}

interface SpikeAxis {
  cos: number;
  sin: number;
  weight: number;
}

function makeAxes(anglesDeg: Array<{ deg: number; weight: number }>): SpikeAxis[] {
  return anglesDeg.map(({ deg, weight }) => {
    const rad = (deg * Math.PI) / 180;
    return { cos: Math.cos(rad), sin: Math.sin(rad), weight };
  });
}

const HUBBLE_4_AXES = makeAxes([
  { deg: 15, weight: 1.0 },
  { deg: 105, weight: 1.0 },
]);

const JWST_6_AXES = makeAxes([
  { deg: 0, weight: 1.0 },
  { deg: 60, weight: 1.0 },
  { deg: 120, weight: 1.0 },
  { deg: 90, weight: 0.12 }, // whisper-faint secondary mirror strut
]);

function createOffscreenCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Singleton pre-rendered optical Point Spread Function (PSF) atlas + cached limb-darkened
 * celestial body and dust-puff stamps. Eliminates all per-frame gradients and flat stroke spikes.
 */
class StarPSFAtlasStore {
  private atlasCanvas: HTMLCanvasElement | null = null;
  private atlasBuilt = false;
  private limbStarCache = new Map<SpectralClass, HTMLCanvasElement>();
  private dustPuffCache = new Map<string, HTMLCanvasElement>();

  getAtlas(): HTMLCanvasElement | null {
    if (this.atlasBuilt) return this.atlasCanvas;
    this.atlasBuilt = true;

    const canvas = createOffscreenCanvas(ATLAS_WIDTH, ATLAS_HEIGHT);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.createImageData !== 'function' || typeof ctx.putImageData !== 'function') {
      return null;
    }

    const imgData = ctx.createImageData(ATLAS_WIDTH, ATLAS_HEIGHT);
    const data = imgData.data;

    // Row 0: 64x64 unspiked Moffat/Airy field star
    this.bakeRow(data, 0, 64, null, 1.35);
    // Row 1: 128x128 Hubble-style 4-point spider-vane PSF
    this.bakeRow(data, 64, 128, HUBBLE_4_AXES, 1.55);
    // Row 2: 128x128 JWST 6-point hexagonal PSF + faint 90-deg strut
    this.bakeRow(data, 192, 128, JWST_6_AXES, 1.6);

    ctx.putImageData(imgData, 0, 0);
    this.atlasCanvas = canvas;
    return canvas;
  }

  private bakeRow(
    data: Uint8ClampedArray,
    yOffset: number,
    cellSize: number,
    axes: SpikeAxis[] | null,
    exposure: number
  ): void {
    const half = cellSize * 0.5;
    const invHalf = 1 / half;
    const colStride = 128; // Columns aligned at 128px intervals across 1152px width

    for (let py = 0; py < cellSize; py++) {
      const dy = (py + 0.5) * invHalf - 1;
      for (let px = 0; px < cellSize; px++) {
        const dx = (px + 0.5) * invHalf - 1;
        const r = Math.hypot(dx, dy);
        if (r >= 0.99) continue;

        // Analytic Moffat optical core + 1st Airy diffraction ring
        const coreRatio = r / 0.048;
        const core = Math.pow(1 + coreRatio * coreRatio, -2.6);
        const airyDelta = (r - 0.14) / 0.032;
        const airy1 = 0.055 * Math.exp(-airyDelta * airyDelta);

        // Two-scale mirror scattering halo with edge-free smoothstep window
        const edgeFade = smoothstep(0.98, 0.72, r);
        const halo = (0.28 * Math.exp(-r * 5.2) + 0.09 * Math.exp(-r * 2.1)) * edgeFade;

        // Razor-tapered, chromatically fringed diffraction spikes (zero stroke sticks)
        let spikeR = 0;
        let spikeG = 0;
        let spikeB = 0;
        if (axes) {
          for (let a = 0; a < axes.length; a++) {
            const ax = axes[a];
            const u = dx * ax.cos + dy * ax.sin;
            const v = -dx * ax.sin + dy * ax.cos;
            const absU = Math.abs(u);
            if (absU >= 0.96) continue;
            const sigmaV = 0.0055 + 0.006 * Math.exp(-absU * 9.0);
            const perp = Math.exp(-0.5 * (v / sigmaV) * (v / sigmaV));
            if (perp < 0.001) continue;

            const uR = absU * 0.94;
            const uG = absU;
            const uB = absU * 1.07;

            const envR = Math.exp(-uR * 3.4) * smoothstep(0.95, 0.55, uR) * (0.88 + 0.12 * Math.cos(uR * 28));
            const envG = Math.exp(-uG * 3.4) * smoothstep(0.95, 0.55, uG) * (0.88 + 0.12 * Math.cos(uG * 28));
            const envB = Math.exp(-uB * 3.4) * smoothstep(0.95, 0.55, uB) * (0.88 + 0.12 * Math.cos(uB * 28));

            const w = ax.weight * 0.62 * perp;
            spikeR += w * envR;
            spikeG += w * envG;
            spikeB += w * envB;
          }
        }

        const baseFlux = core + airy1 + halo;
        const spikePeak = Math.max(spikeR, spikeG, spikeB);
        const whiteBlend = clamp((core + spikePeak * 0.55) * 1.15, 0, 1);
        const rowPixelY = yOffset + py;

        for (let c = 0; c < SPECTRAL_PALETTE.length; c++) {
          const rgb = SPECTRAL_PALETTE[c].rgb;
          const sr = rgb[0] / 255;
          const sg = rgb[1] / 255;
          const sb = rgb[2] / 255;

          // Filmic core roll-off: bright cores gently desaturate toward pure starlight white
          const tintR = lerp(sr, 1.0, whiteBlend);
          const tintG = lerp(sg, 1.0, whiteBlend);
          const tintB = lerp(sb, 1.0, whiteBlend);

          const fluxR = (baseFlux + spikeR) * tintR;
          const fluxG = (baseFlux + spikeG) * tintG;
          const fluxB = (baseFlux + spikeB) * tintB;

          const outR = 1 - Math.exp(-fluxR * exposure);
          const outG = 1 - Math.exp(-fluxG * exposure);
          const outB = 1 - Math.exp(-fluxB * exposure);
          const outA = Math.min(1, Math.max(outR, outG, outB) * 1.08);
          if (outA < 0.004) continue;

          const idx = (rowPixelY * ATLAS_WIDTH + c * colStride + px) * 4;
          data[idx] = Math.round(clamp(outR, 0, 1) * 255);
          data[idx + 1] = Math.round(clamp(outG, 0, 1) * 255);
          data[idx + 2] = Math.round(clamp(outB, 0, 1) * 255);
          data[idx + 3] = Math.round(clamp(outA, 0, 1) * 255);
        }
      }
    }
  }

  /**
   * Pre-renders an Eddington limb-darkened stellar photosphere + subtle chromospheric rim
   * (128x128 offscreen sprite) so host stars never read as flat marshmallow circles.
   */
  getLimbDarkenedStar(cls: SpectralClass): HTMLCanvasElement | null {
    const existing = this.limbStarCache.get(cls);
    if (existing) return existing;

    const size = 128;
    const canvas = createOffscreenCanvas(size, size);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.createImageData !== 'function' || typeof ctx.putImageData !== 'function') {
      return null;
    }

    const def = SPECTRAL_PALETTE[SPECTRAL_INDEX[cls] ?? 4];
    const sr = def.rgb[0] / 255;
    const sg = def.rgb[1] / 255;
    const sb = def.rgb[2] / 255;

    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const half = size * 0.5;
    const discR = 0.58; // Leaves generous room for quiet optical corona glow

    for (let y = 0; y < size; y++) {
      const dy = (y + 0.5) / half - 1;
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5) / half - 1;
        const r = Math.hypot(dx, dy);
        if (r >= 0.99) continue;

        let outR = 0;
        let outG = 0;
        let outB = 0;
        let outA = 0;

        if (r <= discR) {
          const rn = r / discR;
          const mu = Math.sqrt(Math.max(0, 1 - rn * rn));
          // Eddington limb darkening: I(mu) = 0.4 + 0.6 * mu
          const limb = 0.36 + 0.64 * mu;
          // Subtle warm-cool solar granulation mottling
          const gran = 1 + 0.045 * Math.sin(dx * 28 + dy * 19) * Math.cos(dx * 17 - dy * 25);
          const hotCenter = Math.pow(mu, 1.8) * 0.42;
          const rimShift = Math.pow(1 - mu, 2.2) * 0.22;

          outR = clamp(lerp(sr, 1.0, hotCenter) * limb * gran + rimShift * 0.35, 0, 1);
          outG = clamp(lerp(sg, 1.0, hotCenter) * limb * gran - rimShift * 0.08, 0, 1);
          outB = clamp(lerp(sb, 1.0, hotCenter) * limb * gran - rimShift * 0.18, 0, 1);
          outA = smoothstep(discR, discR - 0.025, r);
        } else {
          // Soft physical corona falloff beyond photosphere limb
          const d = (r - discR) / (1 - discR);
          const corona = 0.42 * Math.exp(-d * 4.4) * smoothstep(1.0, 0.72, d);
          outR = sr * corona * 1.1;
          outG = sg * corona * 1.05;
          outB = sb * corona;
          outA = clamp(corona * 1.25, 0, 1);
        }

        if (outA < 0.004) continue;
        const idx = (y * size + x) * 4;
        data[idx] = Math.round(clamp(outR, 0, 1) * 255);
        data[idx + 1] = Math.round(clamp(outG, 0, 1) * 255);
        data[idx + 2] = Math.round(clamp(outB, 0, 1) * 255);
        data[idx + 3] = Math.round(clamp(outA, 0, 1) * 255);
      }
    }

    ctx.putImageData(imgData, 0, 0);
    this.limbStarCache.set(cls, canvas);
    return canvas;
  }

  /**
   * Pre-renders a soft mottled cosmic dust puff / nebula occlusion cloud (96x96)
   * to eliminate per-frame dust radial gradients.
   */
  getSoftDustPuff(rgbKey: string): HTMLCanvasElement | null {
    const existing = this.dustPuffCache.get(rgbKey);
    if (existing) return existing;

    const size = 96;
    const canvas = createOffscreenCanvas(size, size);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.createImageData !== 'function' || typeof ctx.putImageData !== 'function') {
      return null;
    }

    const [rCol, gCol, bCol] = parseHexRgb(rgbKey);
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const half = size * 0.5;

    for (let y = 0; y < size; y++) {
      const dy = (y + 0.5) / half - 1;
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5) / half - 1;
        const r = Math.hypot(dx, dy);
        if (r >= 0.99) continue;

        // Organic layered Gaussian + subtle filamentary modulation
        const fbm =
          0.76 +
          0.14 * Math.sin(dx * 5.2 + dy * 3.7) +
          0.1 * Math.cos(dx * 9.1 - dy * 7.4);
        const falloff = Math.exp(-r * r * 3.2) * smoothstep(0.98, 0.6, r);
        const alpha = clamp(falloff * fbm, 0, 1);
        if (alpha < 0.004) continue;

        const idx = (y * size + x) * 4;
        data[idx] = rCol;
        data[idx + 1] = gCol;
        data[idx + 2] = bCol;
        data[idx + 3] = Math.round(alpha * 255);
      }
    }

    ctx.putImageData(imgData, 0, 0);
    if (this.dustPuffCache.size >= 12) {
      const oldest = this.dustPuffCache.keys().next().value;
      if (oldest) this.dustPuffCache.delete(oldest);
    }
    this.dustPuffCache.set(rgbKey, canvas);
    return canvas;
  }
}

export const starPSFAtlas = new StarPSFAtlasStore();

export interface OpticalStarDrawOpts {
  spectralClass?: SpectralClass;
  colorHex?: string;
  spikes?: 0 | 4 | 6;
  alpha?: number;
  rotationRad?: number;
  vibeMode?: VibeMode;
  timeSec?: number;
  scintPhase?: number;
  additive?: boolean;
}

/**
 * Computes restrained incommensurate dual-harmonic deep-space micro-scintillation
 * modulated by H% vibe mode (Warm: 5%, Balanced: 3%, Cold: 1.5%).
 */
export function evalMicroScintillation(
  timeSec: number,
  phase: number,
  vibeMode: VibeMode = 'balanced'
): number {
  const amp = vibeMode === 'warm' ? 0.05 : vibeMode === 'cold' ? 0.015 : 0.03;
  const f1 = 1.15 + (phase % 0.7);
  const f2 = f1 * 1.6180339;
  const wave = 0.65 * Math.sin(timeSec * f1 + phase) + 0.35 * Math.sin(timeSec * f2 + phase * 2.3);
  return 1 - amp + amp * wave;
}

/**
 * Draws a photorealistic, pre-rendered optical PSF star using additive photon compositing.
 * Zero per-frame radial gradients, zero flat stroke sticks, zero shadowBlur.
 */
export function drawOpticalStar(
  c2d: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  opts?: OpticalStarDrawOpts
): void {
  const spikes = opts?.spikes ?? 6;
  const vibeMode = opts?.vibeMode ?? 'balanced';
  const cls: SpectralClass =
    opts?.spectralClass ?? (opts?.colorHex ? quantizeHexToSpectralClass(opts.colorHex) : 'F');
  const baseAlpha = clamp(opts?.alpha ?? 0.92, 0, 1);
  const scint =
    opts?.timeSec !== undefined
      ? evalMicroScintillation(opts.timeSec, opts.scintPhase ?? x * 0.13 + y * 0.07, vibeMode)
      : 1;
  const alpha = clamp(baseAlpha * scint, 0, 1);
  if (alpha <= 0.005 || radius <= 0.1) return;

  // Warm H%: fuller optical halo (1.08x); Cold H%: razor tight PSF (0.86x)
  const vibeScale = vibeMode === 'warm' ? 1.08 : vibeMode === 'cold' ? 0.86 : 1.0;
  const span = Math.max(4, radius * (spikes === 0 ? 4.4 : 6.4) * vibeScale);

  const atlas = starPSFAtlas.getAtlas();
  if (!atlas || typeof c2d.drawImage !== 'function') {
    // Clean jsdom headless fallback
    c2d.save();
    c2d.globalAlpha = alpha;
    c2d.fillStyle = opts?.colorHex ?? SPECTRAL_PALETTE[SPECTRAL_INDEX[cls]].hex;
    c2d.beginPath();
    c2d.arc(x, y, Math.max(1.5, radius * 0.6), 0, Math.PI * 2);
    c2d.fill();
    c2d.restore();
    return;
  }

  const col = SPECTRAL_INDEX[cls] ?? 3;
  const sx = col * 128;
  const sy = spikes === 0 ? 0 : spikes === 4 ? 64 : 192;
  const sSize = spikes === 0 ? 64 : 128;
  const rot = opts?.rotationRad ?? 0;

  c2d.save();
  if (opts?.additive !== false && 'globalCompositeOperation' in c2d) {
    c2d.globalCompositeOperation = 'lighter';
  }
  c2d.globalAlpha = alpha;
  if (Math.abs(rot) > 0.002) {
    c2d.translate(x, y);
    c2d.rotate(rot);
    c2d.drawImage(atlas, sx, sy, sSize, sSize, -span * 0.5, -span * 0.5, span, span);
  } else {
    c2d.drawImage(atlas, sx, sy, sSize, sSize, x - span * 0.5, y - span * 0.5, span, span);
  }
  c2d.restore();
}

/**
 * Draws a pre-rendered Eddington limb-darkened celestial star disc + corona (0 gradients/frame).
 */
export function drawLimbDarkenedStar(
  c2d: CanvasRenderingContext2D,
  x: number,
  y: number,
  photosphereRadius: number,
  spectralClass: SpectralClass = 'G',
  alpha = 1
): void {
  const sprite = starPSFAtlas.getLimbDarkenedStar(spectralClass);
  const fullRadius = photosphereRadius / 0.58;
  if (!sprite || typeof c2d.drawImage !== 'function') {
    c2d.save();
    c2d.globalAlpha = alpha;
    c2d.fillStyle = SPECTRAL_PALETTE[SPECTRAL_INDEX[spectralClass]].hex;
    c2d.beginPath();
    c2d.arc(x, y, photosphereRadius, 0, Math.PI * 2);
    c2d.fill();
    c2d.restore();
    return;
  }
  c2d.save();
  c2d.globalAlpha = clamp(alpha, 0, 1);
  c2d.drawImage(sprite, x - fullRadius, y - fullRadius, fullRadius * 2, fullRadius * 2);
  c2d.restore();
}

/**
 * Draws a crisp Fresnel-lit crescent exoplanet / moon spheroid without per-frame radial gradients.
 */
export function drawCrescentPlanet(
  c2d: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  lightAngleRad: number,
  rimColorHex = '#9ad6ff',
  bodyColorHex = '#070d16'
): void {
  c2d.save();
  c2d.translate(x, y);
  c2d.rotate(lightAngleRad);

  // Dark nightside sphere
  c2d.fillStyle = bodyColorHex;
  c2d.beginPath();
  c2d.arc(0, 0, radius, 0, Math.PI * 2);
  c2d.fill();

  // Illuminated Fresnel atmospheric crescent clipped to planet disc
  c2d.save();
  c2d.beginPath();
  c2d.arc(0, 0, radius, 0, Math.PI * 2);
  c2d.clip?.();

  c2d.fillStyle = rimColorHex;
  c2d.globalAlpha = 0.36;
  c2d.beginPath();
  c2d.arc(radius * 0.28, 0, radius * 0.96, 0, Math.PI * 2);
  c2d.fill();

  c2d.fillStyle = bodyColorHex;
  c2d.globalAlpha = 0.92;
  c2d.beginPath();
  c2d.arc(-radius * 0.22, 0, radius * 0.94, 0, Math.PI * 2);
  c2d.fill();
  c2d.restore();

  // Razor-thin sunlit limb arc
  c2d.strokeStyle = rimColorHex;
  c2d.globalAlpha = 0.85;
  c2d.lineWidth = Math.max(1, radius * 0.08);
  c2d.beginPath();
  c2d.arc(0, 0, radius - 0.5, -Math.PI * 0.42, Math.PI * 0.42);
  c2d.stroke();
  c2d.restore();
}

/**
 * Draws a cached soft interstellar dust puff / nebula occlusion cloud (0 gradients/frame).
 */
export function drawSoftDustPuff(
  c2d: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  colorHex = '#26160e',
  alpha = 0.82
): void {
  const sprite = starPSFAtlas.getSoftDustPuff(colorHex);
  if (!sprite || typeof c2d.drawImage !== 'function') {
    c2d.save();
    c2d.globalAlpha = alpha * 0.7;
    c2d.fillStyle = colorHex;
    c2d.beginPath();
    c2d.arc(x, y, radius, 0, Math.PI * 2);
    c2d.fill();
    c2d.restore();
    return;
  }
  c2d.save();
  c2d.globalAlpha = clamp(alpha, 0, 1);
  c2d.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
  c2d.restore();
}

export interface DepthStarSpec {
  nx: number;
  ny: number;
  layer: 0 | 1 | 2; // 0 = far pinpoint (65%), 1 = mid Moffat (28%), 2 = near anchor PSF (7%)
  radius: number;
  alpha: number;
  phase: number;
  spectralClass: SpectralClass;
}

const AMBIENT_SPECTRAL_POOL: readonly SpectralClass[] = ['B', 'A', 'F', 'F', 'G', 'G', 'K', 'O', 'M'];

/**
 * Generates a realistic 3-depth power-law deep-space ambient starfield:
 * 65% far sub-pixel pinpoints, 28% mid Moffat stars, 7% near anchor stars.
 */
export function generateDepthStarfield(rng: () => number, count = 64): DepthStarSpec[] {
  const stars: DepthStarSpec[] = [];
  for (let i = 0; i < count; i++) {
    const tierRoll = rng();
    const layer: 0 | 1 | 2 = tierRoll < 0.65 ? 0 : tierRoll < 0.93 ? 1 : 2;
    const radius =
      layer === 0
        ? 0.55 + rng() * 0.75
        : layer === 1
        ? 1.2 + rng() * 1.15
        : 2.0 + rng() * 1.4;
    const alpha = clamp(0.12 + Math.pow(rng(), 2.8) * 0.78, 0.12, 0.92);
    const spectralClass = AMBIENT_SPECTRAL_POOL[Math.floor(rng() * AMBIENT_SPECTRAL_POOL.length)];
    stars.push({
      nx: 0.03 + rng() * 0.94,
      ny: 0.06 + rng() * 0.88,
      layer,
      radius,
      alpha,
      phase: rng() * Math.PI * 2,
      spectralClass,
    });
  }
  return stars;
}

export interface DepthStarfieldOpts {
  opacityMul?: number;
  vibeMode?: VibeMode;
  parallaxX?: number; // -1..+1 normalized pointer offset
  parallaxY?: number; // -1..+1 normalized pointer offset
}

const LAYER_PARALLAX_PX = [2, 6, 12] as const;

/**
 * Renders the 3-depth power-law ambient starfield using the pre-rendered PSF atlas
 * and restrained incommensurate scintillation (zero confetti blinking, zero per-star gradients).
 */
export function drawAmbientStarfield3Depth(
  c2d: CanvasRenderingContext2D,
  w: number,
  h: number,
  stars: readonly DepthStarSpec[],
  timeSec: number,
  opts?: DepthStarfieldOpts
): void {
  const opacityMul = opts?.opacityMul ?? 1;
  if (opacityMul <= 0.01 || stars.length === 0) return;

  const vibeMode = opts?.vibeMode ?? 'balanced';
  const px = clamp(opts?.parallaxX ?? 0, -1, 1);
  const py = clamp(opts?.parallaxY ?? 0, -1, 1);
  const atlas = starPSFAtlas.getAtlas();
  const hasAtlas = Boolean(atlas && typeof c2d.drawImage === 'function');

  c2d.save();
  if (hasAtlas && 'globalCompositeOperation' in c2d) {
    c2d.globalCompositeOperation = 'lighter';
  }

  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    const shift = LAYER_PARALLAX_PX[s.layer];
    const sx = s.nx * w + px * shift;
    const sy = s.ny * h + py * shift;
    const scint = evalMicroScintillation(timeSec, s.phase, vibeMode);
    const a = clamp(s.alpha * scint * opacityMul, 0, 1);
    if (a <= 0.015) continue;

    if (s.layer === 0 && !hasAtlas) {
      c2d.globalAlpha = a;
      c2d.fillStyle = SPECTRAL_PALETTE[SPECTRAL_INDEX[s.spectralClass]].hex;
      c2d.fillRect(sx, sy, Math.max(1, s.radius * 1.4), Math.max(1, s.radius * 1.4));
      continue;
    }

    if (hasAtlas && atlas) {
      const col = SPECTRAL_INDEX[s.spectralClass] ?? 3;
      const atlasX = col * 128;
      if (s.layer === 2) {
        // Near anchor star: subtle 4-point Hubble PSF
        const span = s.radius * 5.2;
        c2d.globalAlpha = a * 0.85;
        c2d.drawImage(atlas, atlasX, 64, 128, 128, sx - span * 0.5, sy - span * 0.5, span, span);
      } else {
        // Far / Mid stars: unspiked Moffat Airy disc (zero harsh sticks)
        const span = s.layer === 0 ? Math.max(3.5, s.radius * 4.2) : s.radius * 4.8;
        c2d.globalAlpha = a;
        c2d.drawImage(atlas, atlasX, 0, 64, 64, sx - span * 0.5, sy - span * 0.5, span, span);
      }
    } else {
      c2d.globalAlpha = a;
      c2d.fillStyle = SPECTRAL_PALETTE[SPECTRAL_INDEX[s.spectralClass]].hex;
      c2d.beginPath();
      c2d.arc(sx, sy, s.radius, 0, Math.PI * 2);
      c2d.fill();
    }
  }

  c2d.restore();
}
