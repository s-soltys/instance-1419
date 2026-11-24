import {
  drawCachedCosmicBackdrop,
  getCosmicPlateImage,
  preloadCosmicPlate,
  type BackdropDrawOpts,
} from './render/BackdropCachePipeline';
import { drawLockResonanceRing, drawStageUnlockPulse } from './render/OpticalDrawUtils';
import {
  drawAmbientStarfield3Depth,
  drawOpticalStar,
  generateDepthStarfield,
  quantizeHexToSpectralClass,
  type DepthStarSpec,
} from './render/StarPSFAtlas';
import { getUnifiedVibeTheme } from './tactilePhysics';
import type { CosmicPlateId, VibeMode } from './types';

export type { BackdropDrawOpts, CosmicPlateId };
export { getCosmicPlateImage, preloadCosmicPlate, drawLockResonanceRing, drawStageUnlockPulse };

export interface CosmicPalette {
  mode: VibeMode;
  accentHex: string;
  accentRgb: string;
  secondaryHex: string;
  secondaryRgb: string;
  lockHex: string;
  lockRgb: string;
  warnHex: string;
  voidBg: string;
  glassBg: string;
}

export function getCosmicPalette(humanity: number): CosmicPalette {
  const vibe = getUnifiedVibeTheme(humanity);
  return {
    mode: vibe.mode,
    accentHex: vibe.accentHex,
    accentRgb: vibe.accentRgb,
    secondaryHex: vibe.secondaryHex,
    secondaryRgb: vibe.secondaryRgb,
    lockHex: '#8be9c0',
    lockRgb: '139, 233, 192',
    warnHex: '#ffb366',
    voidBg: vibe.mode === 'cold' ? '#02060c' : '#05070e',
    glassBg: vibe.mode === 'cold' ? 'rgba(6, 16, 26, 0.72)' : 'rgba(8, 12, 20, 0.72)',
  };
}

/**
 * Backwards-compatible shim delegating to BackdropCachePipeline (ZERO per-frame ctx.filter,
 * ZERO per-frame vignette gradients, ZERO per-frame grid stroke loops, translucent 3D support).
 */
export function drawCosmicPlateBackdrop(
  c2d: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: BackdropDrawOpts
): void {
  drawCachedCosmicBackdrop(c2d, w, h, opts);
}

export interface BackgroundStarSpec {
  nx: number;
  ny: number;
  size: number;
  alpha: number;
  phase: number;
  tint: string;
  /** Optional 3-depth metadata attached by upgraded generator */
  _depthSpec?: DepthStarSpec;
}

export function generateAmbientStars(rng: () => number, count = 48): BackgroundStarSpec[] {
  const depthList = generateDepthStarfield(rng, count);
  return depthList.map((d) => ({
    nx: d.nx,
    ny: d.ny,
    size: d.radius,
    alpha: d.alpha,
    phase: d.phase,
    tint: d.spectralClass === 'O' || d.spectralClass === 'B' ? '#dceeff' : d.spectralClass === 'K' || d.spectralClass === 'M' ? '#ffe5c4' : '#ffffff',
    _depthSpec: d,
  }));
}

const legacyDepthCache = new WeakMap<BackgroundStarSpec[], DepthStarSpec[]>();

export function drawAmbientStars(
  c2d: CanvasRenderingContext2D,
  w: number,
  h: number,
  stars: BackgroundStarSpec[],
  timeSec: number,
  opacityMul = 1
): void {
  let depthStars = legacyDepthCache.get(stars);
  if (!depthStars || depthStars.length !== stars.length) {
    depthStars = stars.map((s, idx) =>
      s._depthSpec ?? {
        nx: s.nx,
        ny: s.ny,
        layer: idx % 14 === 0 ? 2 : idx % 3 === 0 ? 1 : 0,
        radius: s.size,
        alpha: s.alpha,
        phase: s.phase,
        spectralClass: quantizeHexToSpectralClass(s.tint),
      }
    );
    legacyDepthCache.set(stars, depthStars);
  }
  drawAmbientStarfield3Depth(c2d, w, h, depthStars, timeSec, { opacityMul });
}

/**
 * Backwards-compatible shim upgraded onto StarPSFAtlas: replaces flat uniform stroke sticks,
 * double-drawn spike diameters, and per-frame radial gradients with pre-rendered optical PSF stamps.
 */
export function drawDiffractionStar(
  c2d: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  colorHex: string,
  opts?: {
    spikes?: 4 | 6;
    glowAlpha?: number;
    coreColor?: string;
    rotationRad?: number;
  }
): void {
  drawOpticalStar(c2d, x, y, radius, {
    colorHex,
    spikes: opts?.spikes ?? 6,
    alpha: opts?.glowAlpha ?? 0.92,
    rotationRad: opts?.rotationRad ?? 0,
    additive: true,
  });
}
