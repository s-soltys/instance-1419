import { CognitiveInstrumentProfile } from './types';

export function computeRawGate(profile: CognitiveInstrumentProfile, rawActive: boolean): boolean {
  return !profile.requiresRawResidual || rawActive;
}

/**
 * Draws the shared circular optical reticle, perimeter grid, and unified Warm/Cold frame
 * around an unobstructed center viewport so the 3D WebGL target shines behind it.
 */
export function drawReticleFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  profile: CognitiveInstrumentProfile,
  rawActive: boolean,
  time: number,
  shakeX = 0,
  shakeY = 0
): void {
  const { theme } = profile;
  const cx = w * 0.5 + shakeX;
  const cy = h * 0.5 + shakeY;
  const outerR = Math.min(w, h) * 0.41;

  // Subtle ambient vignette around screen edges (center remains pure transparent!)
  const vig = ctx.createRadialGradient(cx, cy, outerR * 0.65, cx, cy, Math.max(w, h) * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, theme.bgTintRgba);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(cx, cy);

  // Outer calibrated azimuth ring
  ctx.strokeStyle = `rgba(${theme.accentRgb}, ${theme.mode === 'cold' ? 0.34 : 0.24})`;
  ctx.lineWidth = theme.mode === 'cold' ? 1.15 : 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, outerR, 0, Math.PI * 2);
  ctx.stroke();

  // Secondary inner vernier arc
  ctx.strokeStyle = `rgba(${theme.secondaryRgb}, 0.16)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, outerR * 0.78, 0, Math.PI * 2);
  ctx.stroke();

  // Degree ticks around perimeter
  const tickCount = theme.mode === 'cold' ? 72 : 36;
  ctx.font = '600 9px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < tickCount; i++) {
    const a = (i / tickCount) * Math.PI * 2 - Math.PI / 2;
    const major = i % (theme.mode === 'cold' ? 6 : 3) === 0;
    const r0 = outerR + (major ? 2 : 5);
    const r1 = outerR + (major ? 11 : 8);
    ctx.strokeStyle = major
      ? `rgba(${theme.accentRgb}, ${theme.mode === 'cold' ? 0.55 : 0.38})`
      : `rgba(${theme.accentRgb}, 0.18)`;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.stroke();

    if (major && profile.showNumericDeltas && i % 12 === 0) {
      const deg = Math.round((i / tickCount) * 360);
      ctx.fillStyle = `rgba(${theme.secondaryRgb}, 0.55)`;
      ctx.fillText(`${deg}°`, Math.cos(a) * (outerR + 22), Math.sin(a) * (outerR + 22));
    }
  }

  // Cold H% Over-Regularization Warning Border when [R] RAW Residual is off
  if (profile.requiresRawResidual && !rawActive) {
    const pulse = 0.25 + 0.2 * Math.sin(time * 5.2);
    ctx.strokeStyle = `rgba(255, 82, 104, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, outerR + 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (rawActive) {
    ctx.strokeStyle = `rgba(158, 232, 255, 0.38)`;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, outerR + 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

export function drawFloatingDeltaPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  profile: CognitiveInstrumentProfile,
  highlight = false
): void {
  if (!profile.showNumericDeltas && !highlight) return;
  const { theme } = profile;
  ctx.save();
  ctx.font = '600 10px "JetBrains Mono", monospace';
  const metrics = ctx.measureText(text);
  const padX = 7;
  const bw = metrics.width + padX * 2;
  const bh = 18;
  ctx.fillStyle = 'rgba(7, 11, 18, 0.82)';
  ctx.strokeStyle = highlight
    ? `rgba(${theme.accentRgb}, 0.78)`
    : `rgba(${theme.secondaryRgb}, 0.36)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x - bw * 0.5, y - bh * 0.5, bw, bh, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = highlight ? theme.accentHex : theme.secondaryHex;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}

export function drawCrosshairMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  locked: boolean,
  profile: CognitiveInstrumentProfile,
  pulse = 0
): void {
  const { theme } = profile;
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = locked ? theme.accentHex : 'transparent';
  ctx.shadowBlur = locked ? theme.glowBlurPx : 0;

  ctx.strokeStyle = locked
    ? theme.accentHex
    : `rgba(${theme.secondaryRgb}, ${0.52 + pulse * 0.3})`;
  ctx.lineWidth = locked ? 2 : 1.3;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  const arm = radius + 6;
  ctx.beginPath();
  ctx.moveTo(-arm, 0);
  ctx.lineTo(-radius * 0.55, 0);
  ctx.moveTo(radius * 0.55, 0);
  ctx.lineTo(arm, 0);
  ctx.moveTo(0, -arm);
  ctx.lineTo(0, -radius * 0.55);
  ctx.moveTo(0, radius * 0.55);
  ctx.lineTo(0, arm);
  ctx.stroke();
  ctx.restore();
}

export function bindCanvasPress(
  canvas: HTMLCanvasElement,
  handlers: {
    onDown: (x: number, y: number, w: number, h: number, button: number) => void;
    onMove?: (x: number, y: number, w: number, h: number) => void;
    onUp?: (x: number, y: number, w: number, h: number) => void;
    onWheel?: (deltaY: number) => void;
  }
): () => void {
  const toLocal = (e: PointerEvent | WheelEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      w: Math.max(1, rect.width),
      h: Math.max(1, rect.height),
    };
  };
  const down = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    const p = toLocal(e);
    handlers.onDown(p.x, p.y, p.w, p.h, e.button);
  };
  const move = (e: PointerEvent) => {
    if (!handlers.onMove) return;
    const p = toLocal(e);
    handlers.onMove(p.x, p.y, p.w, p.h);
  };
  const up = (e: PointerEvent) => {
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    if (!handlers.onUp) return;
    const p = toLocal(e);
    handlers.onUp(p.x, p.y, p.w, p.h);
  };
  const wheel = (e: WheelEvent) => {
    if (!handlers.onWheel) return;
    e.preventDefault();
    handlers.onWheel(e.deltaY);
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });

  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('wheel', wheel);
  };
}
