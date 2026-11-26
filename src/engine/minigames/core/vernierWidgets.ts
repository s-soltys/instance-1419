import { clamp, lerp } from '../tactilePhysics';

export interface VernierStripSpec {
  key: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  val01: number;
  locked?: boolean;
  rightText?: string;
  vertical?: boolean;
}

export interface VernierItemInput {
  key: string;
  label: string;
  val01: number;
  locked?: boolean;
  rightText?: string;
}

export function stageLabel(stage: 1 | 2 | 3): string {
  return stage === 1 ? 'PASS I · COARSE' : stage === 2 ? 'PASS II · FINE' : 'PASS III · LOCK';
}

export function getAspectFieldBox(
  w: number,
  h: number,
  aspect = 1.75,
  topPadDesktop = 62,
  botPadDesktop = 88
): { left: number; top: number; width: number; height: number; scale: number; compact: boolean } {
  const compact = h < 450;
  const topPad = compact ? Math.min(50, topPadDesktop * 0.82) : topPadDesktop;
  const botPad = compact ? Math.min(68, botPadDesktop * 0.78) : botPadDesktop;
  const availH = Math.max(120, h - topPad - botPad);
  const availW = Math.max(200, w * 0.88);
  const width = Math.min(availW, availH * aspect);
  const height = width / aspect;
  return {
    left: (w - width) * 0.5,
    top: topPad + (availH - height) * 0.5,
    width,
    height,
    scale: height,
    compact,
  };
}

/**
 * Zero-allocation mutable vernier row updater: writes directly into a caller-owned
 * `out` array so hot render() loops avoid creating new strip arrays every frame.
 */
export function layoutVernierRowInto(
  out: VernierStripSpec[],
  w: number,
  h: number,
  items: readonly VernierItemInput[],
  yOverride?: number
): VernierStripSpec[] {
  const count = items.length;
  out.length = count;
  if (count === 0) return out;

  const compact = h < 450;
  const totalW = Math.min(w * 0.8, count * 220);
  const gap = compact ? 12 : 16;
  const eachW = (totalW - gap * Math.max(0, count - 1)) / count;
  const startX = (w - totalW) * 0.5;
  const y = yOverride ?? (compact ? h - 72 : h - 96);

  for (let i = 0; i < count; i++) {
    const item = items[i];
    const existing = out[i];
    const x = startX + i * (eachW + gap);
    if (existing) {
      existing.key = item.key;
      existing.label = item.label;
      existing.x = x;
      existing.y = y;
      existing.w = eachW;
      existing.h = 18;
      existing.val01 = item.val01;
      existing.locked = item.locked;
      existing.rightText = item.rightText;
      existing.vertical = false;
    } else {
      out[i] = {
        key: item.key,
        label: item.label,
        x,
        y,
        w: eachW,
        h: 18,
        val01: item.val01,
        locked: item.locked,
        rightText: item.rightText,
        vertical: false,
      };
    }
  }
  return out;
}

export function layoutVernierRow(
  w: number,
  h: number,
  items: readonly VernierItemInput[],
  yOverride?: number
): VernierStripSpec[] {
  return layoutVernierRowInto([], w, h, items, yOverride);
}

/**
 * Vertical Zeiss rack vernier layout for compact landscape mobile viewports (e.g. 844x390)
 * so controls sit cleanly on the left or right flank without squeezing the central optics.
 */
export function layoutVerticalVernierRackInto(
  out: VernierStripSpec[],
  w: number,
  h: number,
  items: readonly VernierItemInput[],
  side: 'left' | 'right' = 'right'
): VernierStripSpec[] {
  const count = items.length;
  out.length = count;
  if (count === 0) return out;

  const compact = h < 450;
  const trackH = clamp(h * (compact ? 0.5 : 0.48), 110, 220);
  const y = (h - trackH) * 0.5 + (compact ? 4 : 0);
  const colSpacing = compact ? 42 : 48;
  const edgeMargin = compact ? 28 : 40;
  const anchorX = side === 'right' ? w - edgeMargin - (count - 1) * colSpacing : edgeMargin;

  for (let i = 0; i < count; i++) {
    const item = items[i];
    const x = anchorX + i * colSpacing;
    const existing = out[i];
    if (existing) {
      existing.key = item.key;
      existing.label = item.label;
      existing.x = x;
      existing.y = y;
      existing.w = 18;
      existing.h = trackH;
      existing.val01 = item.val01;
      existing.locked = item.locked;
      existing.rightText = item.rightText;
      existing.vertical = true;
    } else {
      out[i] = {
        key: item.key,
        label: item.label,
        x,
        y,
        w: 18,
        h: trackH,
        val01: item.val01,
        locked: item.locked,
        rightText: item.rightText,
        vertical: true,
      };
    }
  }
  return out;
}

export function layoutVerticalVernierRack(
  w: number,
  h: number,
  items: readonly VernierItemInput[],
  side: 'left' | 'right' = 'right'
): VernierStripSpec[] {
  return layoutVerticalVernierRackInto([], w, h, items, side);
}

export function hitVernierStrip(strip: VernierStripSpec, px: number, py: number): boolean {
  if (strip.vertical) {
    return (
      px >= strip.x - 20 &&
      px <= strip.x + strip.w + 20 &&
      py >= strip.y - 16 &&
      py <= strip.y + strip.h + 16
    );
  }
  return (
    px >= strip.x - 14 &&
    px <= strip.x + strip.w + 14 &&
    py >= strip.y - 18 &&
    py <= strip.y + strip.h + 18
  );
}

export function valueFromStripX(
  strip: VernierStripSpec,
  px: number,
  target01?: number,
  magnetTol = 0.06
): number {
  const raw = clamp((px - strip.x) / Math.max(1, strip.w), 0, 1);
  if (target01 !== undefined && Math.abs(raw - target01) < magnetTol) {
    return lerp(raw, target01, 0.45);
  }
  return raw;
}

export function valueFromStripPos(
  strip: VernierStripSpec,
  px: number,
  py: number,
  target01?: number,
  magnetTol = 0.06
): number {
  if (!strip.vertical) {
    return valueFromStripX(strip, px, target01, magnetTol);
  }
  // Bottom = 0, Top = 1 (natural optical fader orientation)
  const raw = clamp(1 - (py - strip.y) / Math.max(1, strip.h), 0, 1);
  if (target01 !== undefined && Math.abs(raw - target01) < magnetTol) {
    return lerp(raw, target01, 0.45);
  }
  return raw;
}

export function drawVernierStrip(
  c2d: CanvasRenderingContext2D,
  strip: VernierStripSpec,
  baseColorHex: string,
  lockColorHex = '#8be9c0'
): void {
  const col = strip.locked ? lockColorHex : baseColorHex;
  const v = clamp(strip.val01, 0, 1);

  c2d.save();
  if (strip.vertical) {
    const cx = strip.x + strip.w * 0.5;
    c2d.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = strip.locked ? lockColorHex : 'rgba(220, 236, 250, 0.84)';
    c2d.textAlign = 'center';
    c2d.fillText(strip.label, cx, strip.y - 11);

    // Subtle 8-step Zeiss micrometer ticks
    c2d.strokeStyle = 'rgba(215, 234, 248, 0.16)';
    c2d.lineWidth = 1;
    c2d.beginPath();
    for (let t = 0; t <= 8; t++) {
      const ty = strip.y + (t / 8) * strip.h;
      const half = t % 4 === 0 ? 5.5 : t % 2 === 0 ? 3.5 : 2;
      c2d.moveTo(cx - half, ty);
      c2d.lineTo(cx + half, ty);
    }
    c2d.stroke();

    c2d.fillStyle = 'rgba(255, 255, 255, 0.14)';
    c2d.fillRect(cx - 0.5, strip.y, 1, strip.h);

    const fillH = v * strip.h;
    const knobY = strip.y + strip.h - fillH;
    c2d.globalAlpha = 0.24;
    c2d.fillStyle = col;
    c2d.fillRect(cx - 2.5, knobY, 5, fillH);
    c2d.globalAlpha = 0.94;
    c2d.fillRect(cx - 1, knobY, 2, fillH);

    // Machined Zeiss collar ring + center pip
    c2d.beginPath();
    c2d.arc(cx, knobY, 6.2, 0, Math.PI * 2);
    c2d.fillStyle = 'rgba(5, 10, 18, 0.92)';
    c2d.fill();
    c2d.lineWidth = 1.6;
    c2d.strokeStyle = col;
    c2d.stroke();

    c2d.beginPath();
    c2d.arc(cx, knobY, 1.7, 0, Math.PI * 2);
    c2d.fillStyle = '#ffffff';
    c2d.fill();

    c2d.globalAlpha = 1;
    c2d.fillStyle = col;
    c2d.fillText(strip.rightText ?? `${Math.round(v * 100)}%`, cx, strip.y + strip.h + 15);
    c2d.restore();
    return;
  }

  c2d.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
  c2d.fillStyle = strip.locked ? lockColorHex : 'rgba(220, 236, 250, 0.84)';
  c2d.textAlign = 'left';
  c2d.fillText(strip.label, strip.x, strip.y - 6);

  c2d.textAlign = 'right';
  c2d.fillStyle = col;
  c2d.fillText(strip.rightText ?? `${Math.round(v * 100)}%`, strip.x + strip.w, strip.y - 6);

  const lineY = strip.y + 6;
  // Fine 8-step Zeiss micrometer ticks (batched into 1 draw call)
  c2d.strokeStyle = 'rgba(215, 234, 248, 0.16)';
  c2d.lineWidth = 1;
  c2d.beginPath();
  for (let t = 0; t <= 8; t++) {
    const tx = strip.x + (t / 8) * strip.w;
    const half = t % 4 === 0 ? 5.2 : t % 2 === 0 ? 3.2 : 1.8;
    c2d.moveTo(tx, lineY - half);
    c2d.lineTo(tx, lineY + half);
  }
  c2d.stroke();

  // Hairline glass track
  c2d.fillStyle = 'rgba(255, 255, 255, 0.14)';
  c2d.fillRect(strip.x, lineY - 0.5, strip.w, 1);

  // 2-pass luminous fill (soft halo + razor core)
  const fillW = v * strip.w;
  c2d.globalAlpha = 0.24;
  c2d.fillStyle = col;
  c2d.fillRect(strip.x, lineY - 2.5, fillW, 5);
  c2d.globalAlpha = 0.94;
  c2d.fillRect(strip.x, lineY - 1, fillW, 2);

  // Machined hollow Zeiss indicator ring + center pip
  const knobX = strip.x + fillW;
  c2d.globalAlpha = 1;
  c2d.beginPath();
  c2d.arc(knobX, lineY, 6.2, 0, Math.PI * 2);
  c2d.fillStyle = 'rgba(5, 10, 18, 0.92)';
  c2d.fill();
  c2d.lineWidth = 1.6;
  c2d.strokeStyle = col;
  c2d.stroke();

  c2d.beginPath();
  c2d.arc(knobX, lineY, 1.7, 0, Math.PI * 2);
  c2d.fillStyle = '#ffffff';
  c2d.fill();

  if (strip.locked) {
    c2d.beginPath();
    c2d.arc(knobX, lineY, 9.2, -0.45, 0.45);
    c2d.arc(knobX, lineY, 9.2, Math.PI - 0.45, Math.PI + 0.45);
    c2d.strokeStyle = lockColorHex;
    c2d.lineWidth = 1;
    c2d.globalAlpha = 0.55;
    c2d.stroke();
  }
  c2d.restore();
}
