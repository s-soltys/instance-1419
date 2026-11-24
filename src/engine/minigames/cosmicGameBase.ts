import { clamp, lerp } from './tactilePhysics';

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
}

export function stageLabel(stage: 1 | 2 | 3): string {
  return stage === 1 ? '1/3 · EASY' : stage === 2 ? '2/3 · MEDIUM' : '3/3 · HARD';
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

export function layoutVernierRow(
  w: number,
  h: number,
  items: Array<{ key: string; label: string; val01: number; locked?: boolean; rightText?: string }>,
  yOverride?: number
): VernierStripSpec[] {
  const compact = h < 450;
  const totalW = Math.min(w * 0.8, items.length * 220);
  const gap = compact ? 12 : 16;
  const eachW = (totalW - gap * Math.max(0, items.length - 1)) / Math.max(1, items.length);
  const startX = (w - totalW) * 0.5;
  const y = yOverride ?? (compact ? h - 72 : h - 96);
  return items.map((item, idx) => ({
    ...item,
    x: startX + idx * (eachW + gap),
    y,
    w: eachW,
    h: 18,
  }));
}

export function hitVernierStrip(strip: VernierStripSpec, px: number, py: number): boolean {
  return px >= strip.x - 14 && px <= strip.x + strip.w + 14 && py >= strip.y - 18 && py <= strip.y + strip.h + 18;
}

export function valueFromStripX(strip: VernierStripSpec, px: number, target01?: number, magnetTol = 0.06): number {
  const raw = clamp((px - strip.x) / Math.max(1, strip.w), 0, 1);
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
  c2d.save();
  c2d.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
  c2d.fillStyle = strip.locked ? lockColorHex : 'rgba(220, 236, 250, 0.82)';
  c2d.textAlign = 'left';
  c2d.fillText(strip.label, strip.x, strip.y - 6);

  c2d.textAlign = 'right';
  c2d.fillStyle = col;
  c2d.fillText(strip.rightText ?? `${Math.round(strip.val01 * 100)}%`, strip.x + strip.w, strip.y - 6);

  const lineY = strip.y + 6;
  c2d.fillStyle = 'rgba(255, 255, 255, 0.16)';
  c2d.fillRect(strip.x, lineY - 1, strip.w, 2);

  c2d.fillStyle = col;
  c2d.fillRect(strip.x, lineY - 1.5, clamp(strip.val01, 0, 1) * strip.w, 3);

  const knobX = strip.x + clamp(strip.val01, 0, 1) * strip.w;
  c2d.beginPath();
  c2d.arc(knobX, lineY, 6.5, 0, Math.PI * 2);
  c2d.fillStyle = '#07101c';
  c2d.fill();
  c2d.lineWidth = 2;
  c2d.strokeStyle = col;
  c2d.stroke();
  c2d.restore();
}
