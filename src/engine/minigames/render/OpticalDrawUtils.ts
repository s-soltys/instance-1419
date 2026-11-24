import { clamp } from '../tactilePhysics';

export interface GlowStrokeOpts {
  outerWidthMul?: number;
  outerAlpha?: number;
  coreAlpha?: number;
  lineCap?: CanvasLineCap;
  lineJoin?: CanvasLineJoin;
  additive?: boolean;
}

/**
 * 2-pass optical glow stroke (wide translucent outer bloom + razor-sharp core).
 * Replaces expensive Canvas2D `shadowBlur` with a faster, crisper Zeiss-optical bloom.
 */
export function drawGlowStroke(
  c2d: CanvasRenderingContext2D,
  tracePath: (ctx: CanvasRenderingContext2D) => void,
  colorHex: string,
  coreWidth: number,
  opts?: GlowStrokeOpts
): void {
  const outerMul = opts?.outerWidthMul ?? 2.9;
  const outerAlpha = clamp(opts?.outerAlpha ?? 0.24, 0, 1);
  const coreAlpha = clamp(opts?.coreAlpha ?? 0.96, 0, 1);

  c2d.save();
  if (opts?.lineCap) c2d.lineCap = opts.lineCap;
  if (opts?.lineJoin) c2d.lineJoin = opts.lineJoin;

  // Pass 1: Wide optical bloom halo (no shadowBlur!)
  if (outerAlpha > 0.01) {
    if (opts?.additive !== false && 'globalCompositeOperation' in c2d) {
      c2d.globalCompositeOperation = 'lighter';
    }
    c2d.strokeStyle = colorHex;
    c2d.lineWidth = Math.max(coreWidth + 2, coreWidth * outerMul);
    c2d.globalAlpha = outerAlpha;
    c2d.beginPath();
    tracePath(c2d);
    c2d.stroke();
  }

  // Pass 2: Crisp instrument core hairline
  if ('globalCompositeOperation' in c2d) {
    c2d.globalCompositeOperation = 'source-over';
  }
  c2d.strokeStyle = colorHex;
  c2d.lineWidth = coreWidth;
  c2d.globalAlpha = coreAlpha;
  c2d.beginPath();
  tracePath(c2d);
  c2d.stroke();
  c2d.restore();
}

/**
 * Zero-allocation 2-pass glow polyline renderer backed by flat Float32Array [x0, y0, x1, y1, ...].
 */
export function drawGlowPolylineXY(
  c2d: CanvasRenderingContext2D,
  xyBuffer: Float32Array,
  pointCount: number,
  colorHex: string,
  coreWidth: number,
  opts?: GlowStrokeOpts
): void {
  if (pointCount < 2) return;
  drawGlowStroke(
    c2d,
    (ctx) => {
      ctx.moveTo(xyBuffer[0], xyBuffer[1]);
      for (let i = 1; i < pointCount; i++) {
        ctx.lineTo(xyBuffer[i * 2], xyBuffer[i * 2 + 1]);
      }
    },
    colorHex,
    coreWidth,
    opts
  );
}

export interface InclinedRingOpts {
  backAlpha?: number;
  frontAlpha?: number;
  lineWidth?: number;
  ticks?: number;
  dashBack?: number[];
}

/**
 * Draws an inclined 2.5D Zeiss equatorial astrometry ring with front/back z-depth fade
 * (back hemisphere recedes cleanly behind celestial targets, front hemisphere stays crisp).
 */
export function drawInclinedAstrometryRing(
  c2d: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  tiltRad: number,
  colorRgb: string,
  opts?: InclinedRingOpts
): void {
  if (rx <= 1 || ry <= 1) return;
  const backAlpha = opts?.backAlpha ?? 0.08;
  const frontAlpha = opts?.frontAlpha ?? 0.2;
  const lineWidth = opts?.lineWidth ?? 0.9;
  const ticks = opts?.ticks ?? 4;

  c2d.save();
  c2d.translate(cx, cy);
  c2d.rotate(tiltRad);
  c2d.lineWidth = lineWidth;

  const drawHalfArc = (startRad: number, endRad: number, alpha: number, dash?: number[]) => {
    c2d.strokeStyle = `rgba(${colorRgb}, ${alpha.toFixed(3)})`;
    if (dash && typeof c2d.setLineDash === 'function') c2d.setLineDash(dash);
    c2d.beginPath();
    if (typeof c2d.ellipse === 'function') {
      c2d.ellipse(0, 0, rx, ry, 0, startRad, endRad);
    } else {
      // jsdom fallback using scaled arc
      const steps = 28;
      for (let i = 0; i <= steps; i++) {
        const a = startRad + ((endRad - startRad) * i) / steps;
        const px = Math.cos(a) * rx;
        const py = Math.sin(a) * ry;
        if (i === 0) c2d.moveTo(px, py);
        else c2d.lineTo(px, py);
      }
    }
    c2d.stroke();
    if (dash && typeof c2d.setLineDash === 'function') c2d.setLineDash([]);
  };

  // Back hemisphere (PI..2PI, top/receding half)
  drawHalfArc(Math.PI, Math.PI * 2, backAlpha, opts?.dashBack);
  // Front hemisphere (0..PI, near half)
  drawHalfArc(0, Math.PI, frontAlpha);

  // Subtle batched cardinal calibration ticks
  if (ticks > 0) {
    c2d.strokeStyle = `rgba(${colorRgb}, ${(frontAlpha * 1.35).toFixed(3)})`;
    c2d.beginPath();
    for (let i = 0; i < ticks; i++) {
      const a = (i / ticks) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      c2d.moveTo(ca * (rx - 4), sa * (ry - 2.5));
      c2d.lineTo(ca * (rx + 4), sa * (ry + 2.5));
    }
    c2d.stroke();
  }

  c2d.restore();
}

/**
 * Shared optical lock resonance ring rendered via 2-pass bloom stroke (ZERO shadowBlur).
 */
export function drawLockResonanceRing(
  c2d: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  progress01: number,
  colorHex: string,
  label?: string
): void {
  if (progress01 <= 0.01) return;
  const p = clamp(progress01, 0, 1);
  const startA = -Math.PI * 0.5;
  const endA = startA + Math.PI * 2 * p;

  c2d.save();
  // Quiet bezel track
  c2d.strokeStyle = 'rgba(255, 255, 255, 0.13)';
  c2d.lineWidth = 2;
  c2d.beginPath();
  c2d.arc(cx, cy, radius, 0, Math.PI * 2);
  c2d.stroke();

  // 2-pass bloom progress arc (replaces shadowBlur=12)
  drawGlowStroke(
    c2d,
    (ctx) => {
      ctx.arc(cx, cy, radius, startA, endA);
    },
    colorHex,
    2.6,
    { outerWidthMul: 3.1, outerAlpha: 0.26, coreAlpha: 0.96, lineCap: 'round' }
  );

  // Delicate leading vernier bead
  const tipX = cx + Math.cos(endA) * radius;
  const tipY = cy + Math.sin(endA) * radius;
  c2d.fillStyle = '#ffffff';
  c2d.beginPath();
  c2d.arc(tipX, tipY, 2.2, 0, Math.PI * 2);
  c2d.fill();

  if (label) {
    c2d.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = colorHex;
    c2d.textAlign = 'center';
    c2d.fillText(label, cx, cy + radius + 16);
  }
  c2d.restore();
}

/**
 * Restrained dual-hairline caustic ring + monospace confirmation pulse on stage unlock.
 */
export function drawStageUnlockPulse(
  c2d: CanvasRenderingContext2D,
  w: number,
  h: number,
  flash01: number,
  bannerText: string,
  accentHex: string
): void {
  if (flash01 <= 0.01) return;
  const t = 1 - clamp(flash01, 0, 1);
  const easeOut = 1 - Math.pow(1 - t, 4);
  const baseR = Math.min(w, h) * (0.12 + easeOut * 0.32);

  c2d.save();
  // Primary caustic hairline
  c2d.strokeStyle = accentHex;
  c2d.globalAlpha = flash01 * 0.68;
  c2d.lineWidth = 1.4;
  c2d.beginPath();
  c2d.arc(w * 0.5, h * 0.5, baseR, 0, Math.PI * 2);
  c2d.stroke();

  // Faint chromatic echo hairline (+3px)
  c2d.strokeStyle = '#9ee8ff';
  c2d.globalAlpha = flash01 * 0.34;
  c2d.lineWidth = 1;
  c2d.beginPath();
  c2d.arc(w * 0.5, h * 0.5, baseR + 3.5, 0, Math.PI * 2);
  c2d.stroke();

  if (bannerText) {
    c2d.globalAlpha = Math.min(1, flash01 * 1.45);
    c2d.font = '600 11.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = '#e8fff5';
    c2d.textAlign = 'center';
    c2d.fillText(bannerText, w * 0.5, h < 450 ? h * 0.22 : h * 0.19);
  }
  c2d.restore();
}
