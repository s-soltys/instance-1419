import { clamp, lerp } from '../tactilePhysics';

function createOffscreen(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
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
  return [235, 176, 98];
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

class InstrumentSpriteCache {
  private radioLobeCache = new Map<string, HTMLCanvasElement>();
  private galaxyHaloCache = new Map<string, HTMLCanvasElement>();
  private spectralFanGrating: HTMLCanvasElement | null = null;
  private spectralFanPrism: HTMLCanvasElement | null = null;

  /**
   * Pre-bakes a feathered Gaussian antenna gain lobe (256x128):
   * +X forward axis (0 -> 1), soft lateral angular taper to 0 at top/bottom bounds,
   * zero hard triangular edges.
   */
  getRadioLobeSprite(colorHex: string): HTMLCanvasElement | null {
    const key = colorHex.toLowerCase();
    const cached = this.radioLobeCache.get(key);
    if (cached) return cached;

    const w = 256;
    const h = 128;
    const c = createOffscreen(w, h);
    if (!c) return null;
    const ctx = c.getContext('2d');
    if (!ctx || typeof ctx.createImageData !== 'function' || typeof ctx.putImageData !== 'function') {
      return null;
    }

    const [r, g, b] = parseHexRgb(key);
    const img = ctx.createImageData(w, h);
    const data = img.data;

    for (let py = 0; py < h; py++) {
      const yNorm = (py + 0.5) / h * 2 - 1; // -1..+1 lateral
      for (let px = 0; px < w; px++) {
        const u = (px + 0.5) / w; // 0..1 forward from focal horn
        // Opening beam envelope: gently widens from horn offset so near-horn isn't pinched to a single pixel
        const envelopeHalf = 0.08 + 0.88 * Math.pow(u, 0.78);
        const lat = Math.abs(yNorm) / envelopeHalf;
        if (lat >= 1) continue;

        const latFalloff = Math.pow(Math.cos(lat * Math.PI * 0.5), 2.15);
        const hornFadeIn = smoothstep(0.0, 0.08, u);
        const axialDecay = Math.exp(-u * 1.45) * smoothstep(1.0, 0.74, u);
        const a = clamp(latFalloff * hornFadeIn * axialDecay * 0.82, 0, 1);
        if (a < 0.004) continue;

        const idx = (py * w + px) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = Math.round(a * 255);
      }
    }

    ctx.putImageData(img, 0, 0);
    if (this.radioLobeCache.size >= 16) {
      const oldest = this.radioLobeCache.keys().next().value;
      if (oldest) this.radioLobeCache.delete(oldest);
    }
    this.radioLobeCache.set(key, c);
    return c;
  }

  /**
   * Pre-bakes a continuous feathered rainbow dispersion fan (256x128) for DSP-05.
   */
  getSpectralFanSprite(reversedForGrating: boolean): HTMLCanvasElement | null {
    if (reversedForGrating && this.spectralFanGrating) return this.spectralFanGrating;
    if (!reversedForGrating && this.spectralFanPrism) return this.spectralFanPrism;

    const w = 256;
    const h = 128;
    const c = createOffscreen(w, h);
    if (!c) return null;
    const ctx = c.getContext('2d');
    if (!ctx || typeof ctx.createImageData !== 'function' || typeof ctx.putImageData !== 'function') {
      return null;
    }

    const stops: ReadonlyArray<readonly [number, number, number]> = [
      [255, 112, 112], // IR / red
      [255, 196, 118], // H-alpha / amber
      [255, 232, 145], // VIS / gold
      [126, 212, 255], // B / cyan
      [184, 146, 255], // UV / violet
    ];

    const img = ctx.createImageData(w, h);
    const data = img.data;

    for (let py = 0; py < h; py++) {
      const yNorm = (py + 0.5) / h * 2 - 1;
      for (let px = 0; px < w; px++) {
        const u = (px + 0.5) / w;
        const envHalf = Math.max(0.05, u);
        const lat = yNorm / envHalf;
        if (Math.abs(lat) >= 1) continue;

        const specFrac = clamp((lat + 1) * 0.5, 0, 1);
        const mapped = reversedForGrating ? 1 - specFrac : specFrac;
        const fIdx = mapped * (stops.length - 1);
        const i0 = Math.min(stops.length - 2, Math.floor(fIdx));
        const frac = fIdx - i0;
        const r = Math.round(lerp(stops[i0][0], stops[i0 + 1][0], frac));
        const g = Math.round(lerp(stops[i0][1], stops[i0 + 1][1], frac));
        const b = Math.round(lerp(stops[i0][2], stops[i0 + 1][2], frac));

        const edgeEnv = smoothstep(1.0, 0.72, Math.abs(lat));
        const axialEnv = smoothstep(0.02, 0.14, u) * smoothstep(1.0, 0.65, u) * Math.exp(-u * 0.85);
        const a = clamp(edgeEnv * axialEnv * 0.34, 0, 1);
        if (a < 0.004) continue;

        const idx = (py * w + px) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = Math.round(a * 255);
      }
    }

    ctx.putImageData(img, 0, 0);
    if (reversedForGrating) this.spectralFanGrating = c;
    else this.spectralFanPrism = c;
    return c;
  }

  /**
   * Pre-bakes a soft radial galactic halo/bulge sprite (128x128).
   */
  getGalaxyHaloSprite(tintHex: string): HTMLCanvasElement | null {
    const key = tintHex.toLowerCase();
    const cached = this.galaxyHaloCache.get(key);
    if (cached) return cached;

    const size = 128;
    const c = createOffscreen(size, size);
    if (!c) return null;
    const ctx = c.getContext('2d');
    if (!ctx || typeof ctx.createImageData !== 'function' || typeof ctx.putImageData !== 'function') {
      return null;
    }

    const [r, g, b] = parseHexRgb(key);
    const img = ctx.createImageData(size, size);
    const data = img.data;
    const half = size * 0.5;

    for (let py = 0; py < size; py++) {
      const dy = (py + 0.5) / half - 1;
      for (let px = 0; px < size; px++) {
        const dx = (px + 0.5) / half - 1;
        const dist = Math.hypot(dx, dy);
        if (dist >= 0.99) continue;

        const core = Math.exp(-dist * dist * 18) * 0.68;
        const disk = Math.exp(-dist * 3.8) * 0.42;
        const a = clamp((core + disk) * smoothstep(0.98, 0.58, dist), 0, 1);
        if (a < 0.004) continue;

        const idx = (py * size + px) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = Math.round(a * 255);
      }
    }

    ctx.putImageData(img, 0, 0);
    if (this.galaxyHaloCache.size >= 18) {
      const oldest = this.galaxyHaloCache.keys().next().value;
      if (oldest) this.galaxyHaloCache.delete(oldest);
    }
    this.galaxyHaloCache.set(key, c);
    return c;
  }
}

export const instrumentSprites = new InstrumentSpriteCache();

/**
 * Draws a pre-baked soft Gaussian antenna gain lobe radiating outward from `(x, y)` along `angleRad`.
 */
export function drawFeatheredRadioLobe(
  c2d: CanvasRenderingContext2D,
  x: number,
  y: number,
  angleRad: number,
  length: number,
  halfAngleRad: number,
  colorHex: string,
  alpha = 0.28
): void {
  if (alpha <= 0.005 || length <= 2) return;
  const sprite = instrumentSprites.getRadioLobeSprite(colorHex);
  const fullH = Math.max(8, Math.tan(clamp(halfAngleRad, 0.04, 0.72)) * length * 2.15);

  c2d.save();
  c2d.translate(x, y);
  c2d.rotate(angleRad);
  if ('globalCompositeOperation' in c2d) {
    c2d.globalCompositeOperation = 'lighter';
  }
  c2d.globalAlpha = clamp(alpha, 0, 1);

  if (sprite && typeof c2d.drawImage === 'function') {
    c2d.drawImage(sprite, 0, -fullH * 0.5, length, fullH);
  } else {
    c2d.fillStyle = colorHex;
    c2d.globalAlpha = clamp(alpha * 0.35, 0, 1);
    c2d.beginPath();
    c2d.moveTo(0, 0);
    c2d.arc(0, 0, length, -halfAngleRad, halfAngleRad);
    c2d.closePath();
    c2d.fill();
  }
  c2d.restore();
}

/**
 * Draws 5 concentric outward-projecting radar signal wavefront arcs propagating away
 * from the dish focal horn along `angleRad`, tapering cleanly at angular wings.
 */
export function drawOutwardRadarWavefronts(
  c2d: CanvasRenderingContext2D,
  x: number,
  y: number,
  angleRad: number,
  length: number,
  halfAngleRad: number,
  elapsedSec: number,
  phaseOffset: number,
  colorHex: string,
  closeness: number,
  locked: boolean
): void {
  const pulseCount = 5;
  const speed = lerp(0.36, locked ? 0.72 : 0.62, closeness);
  const spread = clamp(halfAngleRad, 0.06, 0.68);

  c2d.save();
  c2d.translate(x, y);
  c2d.rotate(angleRad);
  c2d.lineCap = 'round';
  if ('globalCompositeOperation' in c2d) {
    c2d.globalCompositeOperation = 'lighter';
  }

  for (let i = 0; i < pulseCount; i++) {
    const u = ((elapsedSec * speed + phaseOffset + i / pulseCount) % 1 + 1) % 1;
    const birth = smoothstep(0.0, 0.14, u);
    const fade = smoothstep(1.0, 0.68, u);
    const env = birth * fade;
    if (env <= 0.02) continue;

    const r = Math.max(10, 12 + u * (length - 12));
    const arcHalf = spread * (0.62 + 0.38 * u);
    const baseAlpha = env * (0.28 + closeness * 0.42 + (locked ? 0.16 : 0));

    // Wide feathered wing arc
    c2d.strokeStyle = colorHex;
    c2d.globalAlpha = clamp(baseAlpha * 0.34, 0, 1);
    c2d.lineWidth = 1.15;
    c2d.beginPath();
    c2d.arc(0, 0, r, -arcHalf * 0.94, arcHalf * 0.94);
    c2d.stroke();

    // Medium wave crest
    c2d.globalAlpha = clamp(baseAlpha * 0.66, 0, 1);
    c2d.lineWidth = locked ? 1.8 : 1.5;
    c2d.beginPath();
    c2d.arc(0, 0, r, -arcHalf * 0.56, arcHalf * 0.56);
    c2d.stroke();

    // Bright central boresight crest
    c2d.globalAlpha = clamp(baseAlpha * 0.95, 0, 1);
    c2d.lineWidth = locked ? 2.4 : 1.9;
    c2d.beginPath();
    c2d.arc(0, 0, r, -arcHalf * 0.24, arcHalf * 0.24);
    c2d.stroke();
  }

  c2d.restore();
}

/**
 * Draws a pre-baked continuous rainbow spectral dispersion fan between `startAngleRad` and `endAngleRad`.
 */
export function drawSpectralPrismFan(
  c2d: CanvasRenderingContext2D,
  x: number,
  y: number,
  startAngleRad: number,
  endAngleRad: number,
  length: number,
  alpha = 0.72,
  reversedForGrating = false
): void {
  const sprite = instrumentSprites.getSpectralFanSprite(reversedForGrating);
  const centerA = (startAngleRad + endAngleRad) * 0.5;
  const halfA = Math.max(0.06, Math.abs(endAngleRad - startAngleRad) * 0.5);
  const fullH = Math.tan(clamp(halfA, 0.06, 0.85)) * length * 2.1;

  c2d.save();
  c2d.translate(x, y);
  c2d.rotate(centerA);
  if ('globalCompositeOperation' in c2d) {
    c2d.globalCompositeOperation = 'lighter';
  }
  c2d.globalAlpha = clamp(alpha, 0, 1);
  if (sprite && typeof c2d.drawImage === 'function') {
    c2d.drawImage(sprite, 0, -fullH * 0.5, length, fullH);
  }
  c2d.restore();
}

/**
 * Draws a cached soft elliptical galactic halo sprite for deep-field miniature galaxies.
 */
export function drawSoftGalaxyHalo(
  c2d: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  tiltRad: number,
  tintHex: string,
  alpha = 0.65
): void {
  const sprite = instrumentSprites.getGalaxyHaloSprite(tintHex);
  c2d.save();
  c2d.translate(x, y);
  c2d.rotate(tiltRad);
  if ('globalCompositeOperation' in c2d) {
    c2d.globalCompositeOperation = 'lighter';
  }
  c2d.globalAlpha = clamp(alpha, 0, 1);
  if (sprite && typeof c2d.drawImage === 'function') {
    c2d.drawImage(sprite, -rx, -ry, rx * 2, ry * 2);
  } else {
    c2d.fillStyle = tintHex;
    c2d.globalAlpha = clamp(alpha * 0.35, 0, 1);
    c2d.beginPath();
    if (typeof c2d.ellipse === 'function') {
      c2d.ellipse(0, 0, rx * 0.6, ry * 0.6, 0, 0, Math.PI * 2);
    } else {
      c2d.arc(0, 0, Math.max(rx, ry) * 0.6, 0, Math.PI * 2);
    }
    c2d.fill();
  }
  c2d.restore();
}
