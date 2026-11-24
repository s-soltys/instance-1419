export interface RetinaCanvasMetrics {
  w: number;
  h: number;
  dpr: number;
}

/**
 * Configures a canvas for crisp Retina/HiDPI rendering while preserving
 * logical coordinate dimensions for all drawing and pointer math.
 */
export function setupRetinaCanvas(
  canvas: HTMLCanvasElement,
  c2d: CanvasRenderingContext2D,
  logicalW: number,
  logicalH: number
): RetinaCanvasMetrics {
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
  canvas.width = Math.round(logicalW * dpr);
  canvas.height = Math.round(logicalH * dpr);
  c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: logicalW, h: logicalH, dpr };
}

export function setupFullRetinaCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const c2d = canvas.getContext('2d')!;
  const w = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth);
  const h = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight);
  setupRetinaCanvas(canvas, c2d, w, h);
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

export interface VernierBinding {
  setValue(val01: number): void;
  destroy(): void;
}

/**
 * Binds a custom pointer-draggable diegetic optical vernier element (zero native HTML range sliders).
 */
export function bindCustomVernier(
  trackEl: HTMLElement,
  fillEl: HTMLElement,
  knobEl: HTMLElement,
  valEl: HTMLElement,
  initial01: number,
  onChange: (val01: number) => void
): VernierBinding {
  let dragging = false;

  const render = (v01: number) => {
    const clamped = Math.max(0, Math.min(1, v01));
    const pct = `${(clamped * 100).toFixed(1)}%`;
    fillEl.style.width = pct;
    knobEl.style.left = pct;
    valEl.textContent = `${Math.round(clamped * 100)}%`;
    trackEl.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
  };

  const applyClientX = (clientX: number) => {
    const rect = trackEl.getBoundingClientRect();
    const v01 = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    render(v01);
    onChange(v01);
  };

  const onDown = (e: PointerEvent) => {
    dragging = true;
    trackEl.setPointerCapture(e.pointerId);
    applyClientX(e.clientX);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    applyClientX(e.clientX);
  };
  const onUp = () => {
    dragging = false;
  };
  const onKey = (e: KeyboardEvent) => {
    const current = Number(trackEl.getAttribute('aria-valuenow') ?? '50') / 100;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(0, current - 0.04);
      render(next);
      onChange(next);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(1, current + 0.04);
      render(next);
      onChange(next);
    }
  };

  trackEl.addEventListener('pointerdown', onDown);
  trackEl.addEventListener('pointermove', onMove);
  trackEl.addEventListener('pointerup', onUp);
  trackEl.addEventListener('pointercancel', onUp);
  trackEl.addEventListener('keydown', onKey);

  render(initial01);

  return {
    setValue: render,
    destroy: () => {
      trackEl.removeEventListener('pointerdown', onDown);
      trackEl.removeEventListener('pointermove', onMove);
      trackEl.removeEventListener('pointerup', onUp);
      trackEl.removeEventListener('pointercancel', onUp);
      trackEl.removeEventListener('keydown', onKey);
    },
  };
}
