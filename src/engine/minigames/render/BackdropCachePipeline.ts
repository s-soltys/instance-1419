import hubbleSombreroUrl from '../../../../assets/astro/hubble_sombrero_galaxy.webp';
import hubbleUdfUrl from '../../../../assets/astro/hubble_udf.webp';
import hubbleWhirlpoolUrl from '../../../../assets/astro/hubble_whirlpool_m51.webp';
import jwstCarinaUrl from '../../../../assets/astro/jwst_carina_nebula.webp';
import jwstCartwheelUrl from '../../../../assets/astro/jwst_cartwheel_galaxy.webp';
import jwstCasAUrl from '../../../../assets/astro/jwst_cassiopeia_a.webp';
import jwstCrabUrl from '../../../../assets/astro/jwst_crab_nebula.webp';
import jwstHorseheadUrl from '../../../../assets/astro/jwst_horsehead_nebula.webp';
import jwstPillarsUrl from '../../../../assets/astro/jwst_pillars_of_creation.webp';
import jwstRhoOphiuchiUrl from '../../../../assets/astro/jwst_rho_ophiuchi.webp';
import jwstRingM57Url from '../../../../assets/astro/jwst_ring_nebula.webp';
import jwstSmacsUrl from '../../../../assets/astro/jwst_smacs0723.webp';
import jwstSouthernRingUrl from '../../../../assets/astro/jwst_southern_ring.webp';
import jwstStephansQuintetUrl from '../../../../assets/astro/jwst_stephans_quintet.webp';
import jwstTarantulaUrl from '../../../../assets/astro/jwst_tarantula_nebula.webp';
import { clamp } from '../tactilePhysics';
import type { CosmicPlateId } from '../types';

/**
 * Plate URL catalog covering all 15 verified commercial-safe NASA/ESA JWST & Hubble plates.
 */
const PLATE_URLS: Record<CosmicPlateId, string> = {
  carina: jwstCarinaUrl,
  smacs: jwstSmacsUrl,
  hudf: hubbleUdfUrl,
  pillars: jwstPillarsUrl,
  southern_ring: jwstSouthernRingUrl,
  stephans_quintet: jwstStephansQuintetUrl,
  tarantula: jwstTarantulaUrl,
  crab: jwstCrabUrl,
  ring_m57: jwstRingM57Url,
  cartwheel: jwstCartwheelUrl,
  rho_ophiuchi: jwstRhoOphiuchiUrl,
  cas_a: jwstCasAUrl,
  horsehead: jwstHorseheadUrl,
  sombrero: hubbleSombreroUrl,
  whirlpool: hubbleWhirlpoolUrl,
};

const imageCache = new Map<CosmicPlateId, HTMLImageElement>();

export function getCosmicPlateImage(plateId: CosmicPlateId): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let img = imageCache.get(plateId);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = PLATE_URLS[plateId] ?? PLATE_URLS.smacs;
    imageCache.set(plateId, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export function preloadCosmicPlate(plateId: CosmicPlateId): void {
  getCosmicPlateImage(plateId);
}

/**
 * Preloads & awaits plate readiness up to `timeoutMs` so optical_dive cross-morphs
 * never flash a flat dark rect on frame 1 of a minigame.
 */
export function preloadCosmicPlateReady(plateId: CosmicPlateId, timeoutMs = 320): Promise<void> {
  if (typeof Image === 'undefined') return Promise.resolve();
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) {
    getCosmicPlateImage(plateId);
    return Promise.resolve();
  }
  getCosmicPlateImage(plateId);
  const img = imageCache.get(plateId);
  if (!img || (img.complete && img.naturalWidth > 0)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = typeof window !== 'undefined' ? window.setTimeout(finish, timeoutMs) : null;
    const done = () => {
      if (timer !== null && typeof window !== 'undefined') window.clearTimeout(timer);
      finish();
    };
    if (typeof img.decode === 'function') {
      img.decode().then(done).catch(done);
    } else {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }
  });
}

export interface PlateCanvasPair {
  key: string;
  plateId: CosmicPlateId;
  w: number;
  h: number;
  sharp: HTMLCanvasElement;
  blurred: HTMLCanvasElement;
}

interface OverlayCacheEntry {
  key: string;
  canvas: HTMLCanvasElement;
}

const MAX_PLATE_CACHE_ENTRIES = 6; // Bounded mobile VRAM ceiling (~22 MB RGBA max)
const MAX_OVERLAY_CACHE_ENTRIES = 6;

const plateLru = new Map<string, PlateCanvasPair>();
const vignetteLru = new Map<string, OverlayCacheEntry>();
const gridLru = new Map<string, OverlayCacheEntry>();
let cachedGrainPattern: CanvasPattern | null = null;
let cachedGrainCanvas: HTMLCanvasElement | null = null;

function getCachedGrainCanvas(): HTMLCanvasElement | null {
  if (cachedGrainCanvas) return cachedGrainCanvas;
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = makeOffscreen(size, size);
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx || typeof ctx.createImageData !== 'function' || typeof ctx.putImageData !== 'function') {
    return null;
  }
  const img = ctx.createImageData(size, size);
  const data = img.data;
  let seed = 141908;
  for (let i = 0; i < size * size; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const n = (seed >>> 24) & 0xff;
    const idx = i * 4;
    data[idx] = n;
    data[idx + 1] = n;
    data[idx + 2] = Math.min(255, n + 10);
    data[idx + 3] = 28;
  }
  ctx.putImageData(img, 0, 0);
  cachedGrainCanvas = canvas;
  return canvas;
}

function quantizeDim(n: number): number {
  return Math.max(64, Math.ceil(n / 32) * 32);
}

function touchLru<K, V>(map: Map<K, V>, key: K, val: V, maxEntries: number): void {
  if (map.has(key)) map.delete(key);
  map.set(key, val);
  while (map.size > maxEntries) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
    else break;
  }
}

function makeOffscreen(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/**
 * Retrieves (or lazily bakes ONCE on image decode/resize) a cached sharp + half-res pre-blurred
 * offscreen canvas pair for a plate. Dynamic blur/focus then becomes a 0ms 2-image crossfade
 * with ZERO per-frame `ctx.filter`.
 */
export function getPlateCanvasPair(
  plateId: CosmicPlateId,
  logicalW: number,
  logicalH: number
): PlateCanvasPair | null {
  const img = getCosmicPlateImage(plateId);
  if (!img) return null;

  const qW = Math.min(1440, quantizeDim(logicalW));
  const qH = Math.min(900, quantizeDim(logicalH));
  const key = `${plateId}:${qW}x${qH}`;
  const hit = plateLru.get(key);
  if (hit) {
    touchLru(plateLru, key, hit, MAX_PLATE_CACHE_ENTRIES);
    return hit;
  }

  const sharp = makeOffscreen(qW, qH);
  const bw = Math.max(32, Math.ceil(qW * 0.5));
  const bh = Math.max(32, Math.ceil(qH * 0.5));
  const blurred = makeOffscreen(bw, bh);
  if (!sharp || !blurred) return null;

  const sCtx = sharp.getContext('2d');
  const bCtx = blurred.getContext('2d');
  if (!sCtx || !bCtx || typeof sCtx.drawImage !== 'function') return null;

  const coverScale = Math.max(qW / img.naturalWidth, qH / img.naturalHeight);
  const dw = img.naturalWidth * coverScale;
  const dh = img.naturalHeight * coverScale;
  const dx = (qW - dw) * 0.5;
  const dy = (qH - dh) * 0.5;

  // Bake sharp plate once
  sCtx.drawImage(img, dx, dy, dw, dh);

  // Bake half-res blurred plate once (runs ONCE per plate/viewport, never per-frame!)
  bCtx.save();
  const supportsFilter = typeof (bCtx as { filter?: unknown }).filter === 'string';
  if (supportsFilter) {
    bCtx.filter = 'blur(6px)';
    bCtx.drawImage(sharp, 0, 0, bw, bh);
  } else {
    // Clean downscale-upscale fallback for environments without CanvasRenderingContext2D.filter
    const tiny = makeOffscreen(Math.max(16, Math.ceil(bw * 0.25)), Math.max(16, Math.ceil(bh * 0.25)));
    const tCtx = tiny?.getContext('2d');
    if (tiny && tCtx && typeof tCtx.drawImage === 'function') {
      tCtx.drawImage(sharp, 0, 0, tiny.width, tiny.height);
      bCtx.drawImage(tiny, 0, 0, bw, bh);
    } else {
      bCtx.drawImage(sharp, 0, 0, bw, bh);
    }
  }
  bCtx.restore();

  const pair: PlateCanvasPair = { key, plateId, w: qW, h: qH, sharp, blurred };
  touchLru(plateLru, key, pair, MAX_PLATE_CACHE_ENTRIES);
  return pair;
}

function getCachedVignette(w: number, h: number, vignetteAlpha: number): HTMLCanvasElement | null {
  const qW = Math.min(1440, quantizeDim(w));
  const qH = Math.min(900, quantizeDim(h));
  const qA = Math.round(clamp(vignetteAlpha, 0, 1) * 20) / 20;
  const key = `vig:${qW}x${qH}:${qA.toFixed(2)}`;
  const hit = vignetteLru.get(key);
  if (hit) {
    touchLru(vignetteLru, key, hit, MAX_OVERLAY_CACHE_ENTRIES);
    return hit.canvas;
  }

  const canvas = makeOffscreen(qW, qH);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof ctx.createRadialGradient !== 'function') return null;

  const vig = ctx.createRadialGradient(
    qW * 0.5,
    qH * 0.5,
    Math.min(qW, qH) * 0.28,
    qW * 0.5,
    qH * 0.5,
    Math.max(qW, qH) * 0.72
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, `rgba(2, 5, 10, ${qA.toFixed(2)})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, qW, qH);

  touchLru(vignetteLru, key, { key, canvas }, MAX_OVERLAY_CACHE_ENTRIES);
  return canvas;
}

function getCachedGrid(w: number, h: number, gridAlpha: number): HTMLCanvasElement | null {
  const qW = Math.min(1440, quantizeDim(w));
  const qH = Math.min(900, quantizeDim(h));
  const qA = Math.round(clamp(gridAlpha, 0, 1) * 50) / 50;
  const key = `grid:${qW}x${qH}:${qA.toFixed(2)}`;
  const hit = gridLru.get(key);
  if (hit) {
    touchLru(gridLru, key, hit, MAX_OVERLAY_CACHE_ENTRIES);
    return hit.canvas;
  }

  const canvas = makeOffscreen(qW, qH);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.strokeStyle = `rgba(186, 214, 240, ${qA.toFixed(3)})`;
  ctx.lineWidth = 1;
  const step = 72;
  ctx.beginPath();
  for (let x = (qW * 0.5) % step; x < qW; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, qH);
  }
  for (let y = (qH * 0.5) % step; y < qH; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(qW, y);
  }
  ctx.stroke();

  touchLru(gridLru, key, { key, canvas }, MAX_OVERLAY_CACHE_ENTRIES);
  return canvas;
}

/**
 * Global flag controlled by MinigameHostView / Minigame3DBridge so even legacy
 * un-migrated games calling drawCosmicPlateBackdrop automatically composite
 * translucently when the single-pass 3D backdrop is active behind the 2D canvas.
 */
let active3DBackdropComposite = false;

export function setGlobal3DBackdropComposite(active: boolean): void {
  active3DBackdropComposite = active;
}

export function isGlobal3DBackdropComposite(): boolean {
  return active3DBackdropComposite;
}

export interface BackdropDrawOpts {
  plateId: CosmicPlateId;
  blurPx?: number;
  alpha?: number;
  brightness?: number;
  scale?: number;
  tintHex?: string;
  tintAlpha?: number;
  vignetteAlpha?: number;
  gridAlpha?: number;
  /** Subtle CCD photographic noise grain (0..0.15) cleared as opticalFidelity rises */
  grainAlpha?: number;
  /** Subtle late-shift enclosure horizon edge ticks (0..0.2) from chaosDrift + shift */
  horizonDriftAlpha?: number;
  clipCircle?: { cx: number; cy: number; r: number };
  clipRect?: { x: number; y: number; w: number; h: number };
  /** True = clearRect + translucent plate compositing so live 3D showcase breathes behind it */
  compositeOver3D?: boolean;
  /** Subtle normalized pointer parallax (-1..+1) shifting the plate +-5px */
  parallaxX?: number;
  parallaxY?: number;
}

/**
 * High-performance offscreen-cached astronomy backdrop renderer.
 * - ZERO per-frame `ctx.filter = blur(...)` (uses 0ms sharp/blurred offscreen crossfade)
 * - ZERO per-frame vignette `createRadialGradient`
 * - ZERO per-frame 30-stroke grid loops
 * - Clean translucent compositing over single-pass 3D `TargetShowcaseScene` when active
 */
export function drawCachedCosmicBackdrop(
  c2d: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: BackdropDrawOpts
): void {
  const {
    plateId,
    blurPx = 0,
    alpha = 0.72,
    brightness = 1,
    scale = 1.04,
    tintHex = '#040812',
    tintAlpha = 0.42,
    vignetteAlpha = 0.78,
    gridAlpha = 0,
    grainAlpha = 0,
    horizonDriftAlpha = 0,
    clipCircle,
    clipRect,
    parallaxX = 0,
    parallaxY = 0,
  } = opts;

  const isClipped = Boolean(clipCircle || clipRect);
  const composite3D = opts.compositeOver3D ?? (!isClipped && active3DBackdropComposite);

  if (!isClipped) {
    if (composite3D) {
      c2d.clearRect(0, 0, w, h);
    } else {
      c2d.fillStyle = '#03060c';
      c2d.fillRect(0, 0, w, h);
    }
  }

  const pair = getPlateCanvasPair(plateId, w, h);

  c2d.save();
  if (clipCircle && typeof c2d.clip === 'function') {
    c2d.beginPath();
    c2d.arc(clipCircle.cx, clipCircle.cy, Math.max(1, clipCircle.r), 0, Math.PI * 2);
    c2d.clip();
  } else if (clipRect && typeof c2d.clip === 'function') {
    c2d.beginPath();
    c2d.rect(clipRect.x, clipRect.y, clipRect.w, clipRect.h);
    c2d.clip();
  }

  // Calibrate effective plate alpha when compositing over live 3D starfield/target
  const baseAlpha = clamp(alpha, 0, 1);
  const effectiveAlpha = composite3D ? clamp(baseAlpha * 0.74, 0.22, 0.66) : baseAlpha;

  if (pair && typeof c2d.drawImage === 'function') {
    const dw = w * scale;
    const dh = h * scale;
    const dx = (w - dw) * 0.5 + clamp(parallaxX, -1, 1) * 5;
    const dy = (h - dh) * 0.5 + clamp(parallaxY, -1, 1) * 5;

    // Approximate brightness < 1 by attenuating plate alpha slightly against dark void
    // and brightness > 1 via subtle additive lift — ZERO ctx.filter!
    const darkMul = brightness < 1 ? clamp(brightness, 0.35, 1) : 1;
    const drawAlpha = clamp(effectiveAlpha * darkMul, 0, 1);
    const blurMix = clamp(blurPx / 12, 0, 1);

    if (blurMix <= 0.03) {
      c2d.globalAlpha = drawAlpha;
      c2d.drawImage(pair.sharp, dx, dy, dw, dh);
    } else if (blurMix >= 0.97) {
      c2d.globalAlpha = drawAlpha;
      c2d.drawImage(pair.blurred, dx, dy, dw, dh);
    } else {
      // Smooth 0ms dual-canvas crossfade (no Gaussian blur filter per frame!)
      c2d.globalAlpha = drawAlpha;
      c2d.drawImage(pair.blurred, dx, dy, dw, dh);
      c2d.globalAlpha = drawAlpha * (1 - blurMix);
      c2d.drawImage(pair.sharp, dx, dy, dw, dh);
    }

    if (brightness > 1.04 && 'globalCompositeOperation' in c2d) {
      c2d.save();
      c2d.globalCompositeOperation = 'lighter';
      c2d.globalAlpha = clamp((brightness - 1) * 0.45 * drawAlpha, 0, 0.38);
      c2d.drawImage(blurMix > 0.5 ? pair.blurred : pair.sharp, dx, dy, dw, dh);
      c2d.restore();
    }
  } else {
    // Graceful radial fallback before image decode or in headless jsdom
    if (!composite3D) {
      c2d.fillStyle =
        plateId === 'carina' || plateId === 'pillars' || plateId === 'tarantula' || plateId === 'cas_a'
          ? 'rgba(42, 24, 16, 0.42)'
          : 'rgba(16, 28, 48, 0.42)';
      c2d.fillRect(0, 0, w, h);
    }
  }

  // Atmospheric veil tint (scaled gently in 3D composite mode so stars & 3D rigs remain visible)
  const effectiveTint = composite3D ? tintAlpha * 0.58 : tintAlpha;
  if (effectiveTint > 0.005) {
    c2d.globalAlpha = clamp(effectiveTint, 0, 1);
    c2d.fillStyle = tintHex;
    c2d.fillRect(0, 0, w, h);
  }

  if (gridAlpha > 0.005 && !isClipped) {
    const gridCanvas = getCachedGrid(w, h, gridAlpha);
    if (gridCanvas && typeof c2d.drawImage === 'function') {
      c2d.globalAlpha = 1;
      c2d.drawImage(gridCanvas, 0, 0, w, h);
    }
  }

  if (vignetteAlpha > 0.01 && !isClipped) {
    const vigCanvas = getCachedVignette(w, h, vignetteAlpha);
    if (vigCanvas && typeof c2d.drawImage === 'function') {
      c2d.globalAlpha = 1;
      c2d.drawImage(vigCanvas, 0, 0, w, h);
    }
  }

  if (grainAlpha > 0.005 && !isClipped) {
    const grainCanvas = getCachedGrainCanvas();
    if (grainCanvas) {
      if (!cachedGrainPattern && typeof c2d.createPattern === 'function') {
        cachedGrainPattern = c2d.createPattern(grainCanvas, 'repeat');
      }
      if (cachedGrainPattern) {
        c2d.globalAlpha = clamp(grainAlpha * 4.5, 0, 0.48);
        c2d.fillStyle = cachedGrainPattern;
        c2d.fillRect(0, 0, w, h);
      }
    }
  }

  if (horizonDriftAlpha > 0.01 && !isClipped) {
    const a = clamp(horizonDriftAlpha, 0, 0.18);
    c2d.globalAlpha = a;
    c2d.strokeStyle = '#9ee8ff';
    c2d.lineWidth = 1;
    c2d.beginPath();
    // Subtle outer viewport corner geodesic ticks (zero central clutter)
    const tick = 14;
    const pad = 18;
    c2d.moveTo(pad, pad + tick);
    c2d.lineTo(pad, pad);
    c2d.lineTo(pad + tick, pad);
    c2d.moveTo(w - pad - tick, pad);
    c2d.lineTo(w - pad, pad);
    c2d.lineTo(w - pad, pad + tick);
    c2d.moveTo(pad, h - pad - tick);
    c2d.lineTo(pad, h - pad);
    c2d.lineTo(pad + tick, h - pad);
    c2d.moveTo(w - pad - tick, h - pad);
    c2d.lineTo(w - pad, h - pad);
    c2d.lineTo(w - pad, h - pad - tick);
    c2d.stroke();
  }

  c2d.restore();
}

export function clearBackdropCaches(): void {
  plateLru.clear();
  vignetteLru.clear();
  gridLru.clear();
}

export function getBackdropCacheStats(): { plates: number; vignettes: number; grids: number } {
  return {
    plates: plateLru.size,
    vignettes: vignetteLru.size,
    grids: gridLru.size,
  };
}
