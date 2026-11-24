import jwstSmacsUrl from '../../../assets/astro/jwst_smacs0723.webp';
import hubbleUdfUrl from '../../../assets/astro/hubble_udf.webp';
import jwstCarinaUrl from '../../../assets/astro/jwst_carina_nebula.webp';
import { getUnifiedVibeTheme } from './tactilePhysics';
import type { VibeMode } from './types';

export type CosmicPlateId = 'carina' | 'smacs' | 'hudf';

const PLATE_URLS: Record<CosmicPlateId, string> = {
  carina: jwstCarinaUrl,
  smacs: jwstSmacsUrl,
  hudf: hubbleUdfUrl,
};

const imageCache = new Map<CosmicPlateId, HTMLImageElement>();

export function getCosmicPlateImage(plateId: CosmicPlateId): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let img = imageCache.get(plateId);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = PLATE_URLS[plateId];
    imageCache.set(plateId, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

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
  clipCircle?: { cx: number; cy: number; r: number };
}

export function drawCosmicPlateBackdrop(
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
    gridAlpha = 0.08,
    clipCircle,
  } = opts;

  if (!clipCircle) {
    c2d.fillStyle = '#03060c';
    c2d.fillRect(0, 0, w, h);
  }

  const img = getCosmicPlateImage(plateId);

  c2d.save();
  if (clipCircle && typeof c2d.clip === 'function') {
    c2d.beginPath();
    c2d.arc(clipCircle.cx, clipCircle.cy, Math.max(1, clipCircle.r), 0, Math.PI * 2);
    c2d.clip();
  }

  if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
    const coverScale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * scale;
    const dw = img.naturalWidth * coverScale;
    const dh = img.naturalHeight * coverScale;
    const dx = (w - dw) * 0.5;
    const dy = (h - dh) * 0.5;

    c2d.save();
    c2d.globalAlpha = Math.max(0, Math.min(1, alpha));
    if ('filter' in c2d && (blurPx > 0.2 || Math.abs(brightness - 1) > 0.02)) {
      c2d.filter = `blur(${blurPx.toFixed(1)}px) brightness(${brightness.toFixed(2)})`;
    }
    c2d.drawImage(img, dx, dy, dw, dh);
    c2d.restore();
  } else {
    // Graceful radial nebula fallback before image decode or in headless jsdom tests
    const grad = c2d.createRadialGradient(w * 0.5, h * 0.46, 12, w * 0.5, h * 0.5, Math.max(w, h) * 0.65);
    grad.addColorStop(0, plateId === 'carina' ? 'rgba(195, 118, 62, 0.34)' : 'rgba(92, 168, 224, 0.28)');
    grad.addColorStop(0.55, 'rgba(16, 28, 48, 0.25)');
    grad.addColorStop(1, 'rgba(3, 6, 12, 0.96)');
    c2d.fillStyle = grad;
    c2d.fillRect(0, 0, w, h);
  }

  if (tintAlpha > 0) {
    c2d.save();
    c2d.globalAlpha = tintAlpha;
    c2d.fillStyle = tintHex;
    c2d.fillRect(0, 0, w, h);
    c2d.restore();
  }

  if (gridAlpha > 0.005) {
    c2d.save();
    c2d.strokeStyle = `rgba(186, 214, 240, ${gridAlpha.toFixed(3)})`;
    c2d.lineWidth = 1;
    const step = 72;
    for (let x = (w * 0.5) % step; x < w; x += step) {
      c2d.beginPath();
      c2d.moveTo(x, 0);
      c2d.lineTo(x, h);
      c2d.stroke();
    }
    for (let y = (h * 0.5) % step; y < h; y += step) {
      c2d.beginPath();
      c2d.moveTo(0, y);
      c2d.lineTo(w, y);
      c2d.stroke();
    }
    c2d.restore();
  }

  if (vignetteAlpha > 0.01 && !clipCircle) {
    const vig = c2d.createRadialGradient(
      w * 0.5,
      h * 0.5,
      Math.min(w, h) * 0.28,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.72
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(2, 5, 10, ${vignetteAlpha.toFixed(2)})`);
    c2d.fillStyle = vig;
    c2d.fillRect(0, 0, w, h);
  }

  c2d.restore();
}

export interface BackgroundStarSpec {
  nx: number;
  ny: number;
  size: number;
  alpha: number;
  phase: number;
  tint: string;
}

export function generateAmbientStars(rng: () => number, count = 48): BackgroundStarSpec[] {
  const tints = ['#ffffff', '#dceeff', '#ffe5c4', '#c9e9ff'];
  const stars: BackgroundStarSpec[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      nx: 0.05 + rng() * 0.9,
      ny: 0.1 + rng() * 0.8,
      size: 0.7 + rng() * 1.9,
      alpha: 0.25 + rng() * 0.6,
      phase: rng() * Math.PI * 2,
      tint: tints[i % tints.length],
    });
  }
  return stars;
}

export function drawAmbientStars(
  c2d: CanvasRenderingContext2D,
  w: number,
  h: number,
  stars: BackgroundStarSpec[],
  timeSec: number,
  opacityMul = 1
): void {
  c2d.save();
  for (const s of stars) {
    const twinkle = 0.65 + 0.35 * Math.sin(timeSec * 1.7 + s.phase);
    c2d.globalAlpha = s.alpha * twinkle * opacityMul;
    c2d.fillStyle = s.tint;
    c2d.beginPath();
    c2d.arc(s.nx * w, s.ny * h, s.size, 0, Math.PI * 2);
    c2d.fill();
  }
  c2d.restore();
}

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
  const spikes = opts?.spikes ?? 6;
  const glowAlpha = opts?.glowAlpha ?? 0.68;
  const coreColor = opts?.coreColor ?? '#ffffff';
  const rot = opts?.rotationRad ?? 0;

  c2d.save();
  const halo = c2d.createRadialGradient(x, y, 0, x, y, radius * 3.1);
  halo.addColorStop(0, coreColor);
  halo.addColorStop(0.24, colorHex);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  c2d.globalAlpha = glowAlpha;
  c2d.fillStyle = halo;
  c2d.beginPath();
  c2d.arc(x, y, radius * 3.1, 0, Math.PI * 2);
  c2d.fill();

  // Sharp tapered diffraction spikes
  c2d.globalAlpha = Math.min(1, glowAlpha * 0.85);
  c2d.strokeStyle = colorHex;
  c2d.lineWidth = Math.max(1, radius * 0.14);
  const spikeLen = radius * (spikes === 6 ? 2.55 : 2.2);
  for (let i = 0; i < spikes; i++) {
    const ang = rot + (i * Math.PI) / (spikes / 2);
    c2d.beginPath();
    c2d.moveTo(x - Math.cos(ang) * spikeLen, y - Math.sin(ang) * spikeLen);
    c2d.lineTo(x + Math.cos(ang) * spikeLen, y + Math.sin(ang) * spikeLen);
    c2d.stroke();
  }

  c2d.globalAlpha = 1;
  c2d.fillStyle = coreColor;
  c2d.beginPath();
  c2d.arc(x, y, Math.max(2, radius * 0.42), 0, Math.PI * 2);
  c2d.fill();
  c2d.restore();
}

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
  const p = Math.max(0, Math.min(1, progress01));
  c2d.save();
  c2d.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  c2d.lineWidth = 2.5;
  c2d.beginPath();
  c2d.arc(cx, cy, radius, 0, Math.PI * 2);
  c2d.stroke();

  c2d.strokeStyle = colorHex;
  c2d.lineWidth = 3;
  c2d.lineCap = 'round';
  c2d.shadowColor = colorHex;
  c2d.shadowBlur = 12;
  c2d.beginPath();
  c2d.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
  c2d.stroke();

  if (label) {
    c2d.shadowBlur = 0;
    c2d.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = colorHex;
    c2d.textAlign = 'center';
    c2d.fillText(label, cx, cy + radius + 16);
  }
  c2d.restore();
}

export function drawStageUnlockPulse(
  c2d: CanvasRenderingContext2D,
  w: number,
  h: number,
  flash01: number,
  bannerText: string,
  accentHex: string
): void {
  if (flash01 <= 0.01) return;
  c2d.save();
  const radius = Math.min(w, h) * (0.12 + (1 - flash01) * 0.34);
  c2d.strokeStyle = accentHex;
  c2d.globalAlpha = flash01 * 0.72;
  c2d.lineWidth = 2;
  c2d.beginPath();
  c2d.arc(w * 0.5, h * 0.5, radius, 0, Math.PI * 2);
  c2d.stroke();

  if (bannerText) {
    c2d.globalAlpha = Math.min(1, flash01 * 1.4);
    c2d.font = '600 12px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = '#e8fff5';
    c2d.textAlign = 'center';
    c2d.fillText(bannerText, w * 0.5, h * 0.2);
  }
  c2d.restore();
}
