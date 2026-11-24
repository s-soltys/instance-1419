export interface RetinaCanvasMetrics {
  w: number;
  h: number;
  dpr: number;
}

/**
 * Resolves optimal backing DPR: caps coarse/mobile touch devices at 1.5x (matching
 * TargetShowcaseScene) and desktop displays at 2.0x to keep 60fps fill-rate bounded.
 */
export function resolveOptimalDpr(overrideMax?: number): number {
  if (typeof window === 'undefined') return 1;
  const isCoarse = Boolean(window.matchMedia?.('(pointer: coarse)').matches);
  const cap = overrideMax ?? (isCoarse ? 1.5 : 2);
  return Math.min(window.devicePixelRatio || 1, cap);
}

/**
 * Configures a canvas for crisp Retina/HiDPI rendering while preserving
 * logical coordinate dimensions for all drawing and pointer math.
 * Avoids redundant GPU backing-store reallocation when pixel dimensions are unchanged.
 */
export function setupRetinaCanvas(
  canvas: HTMLCanvasElement,
  c2d: CanvasRenderingContext2D,
  logicalW: number,
  logicalH: number,
  maxDpr?: number
): RetinaCanvasMetrics {
  const safeW = Math.max(1, Math.round(logicalW));
  const safeH = Math.max(1, Math.round(logicalH));
  const dpr = resolveOptimalDpr(maxDpr);
  const targetPxW = Math.max(1, Math.round(safeW * dpr));
  const targetPxH = Math.max(1, Math.round(safeH * dpr));

  if (canvas.width !== targetPxW || canvas.height !== targetPxH) {
    canvas.width = targetPxW;
    canvas.height = targetPxH;
  }
  c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: safeW, h: safeH, dpr };
}

export function setupFullRetinaCanvas(
  canvas: HTMLCanvasElement,
  maxDpr?: number
): CanvasRenderingContext2D {
  const c2d = canvas.getContext('2d')!;
  const w = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth);
  const h = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight);
  setupRetinaCanvas(canvas, c2d, w, h, maxDpr);
  return c2d;
}

/**
 * Canon H% -> Optical Clarity contract:
 * Lower Humanity (pruned) + higher opticalFidelity yield sharper, noiseless,
 * higher-contrast telemetry optics. High Humanity preserves warm emotional shimmer
 * and softer optical diffusion, trading mechanical precision for human intuition.
 */
export function computeOpticalClarity(humanity: number, opticalFidelity: number): number {
  const hNorm = Math.max(0, Math.min(1, humanity / 100));
  const fid = Math.max(0.25, Math.min(1, opticalFidelity));
  return Math.max(0.2, Math.min(1.0, fid * 0.65 + (1 - hNorm) * 0.35));
}
