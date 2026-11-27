import { platform } from '../../../platform/PlatformAdapter';
import { BaseCosmicMinigame, type PointerLocalEvent } from '../core/BaseCosmicMinigame';
import { drawOpticalStar } from '../render/StarPSFAtlas';
import { angleDiffRad, clamp } from '../tactilePhysics';
import type {
  CosmicPlateId,
  InstrumentFieldGuide,
  MinigameVariantSpec,
  SpectralClass,
} from '../types';

interface GlarePlane {
  id: number;
  baseAngle: number;
  tintRgb: string;
  clearedAll: boolean;
}

interface PolarKnot {
  id: number;
  planeIdx: number;
  /** Lens-relative polar coordinates (guaranteed 100% inside lensR on EVERY viewport & aspect ratio!). */
  angle: number;
  rFrac: number;
  spectralClass: SpectralClass;
  found: boolean;
}

interface DustNeedle {
  ux: number;
  uy: number;
  len: number;
  planeIdx: number;
}

interface PolarScenarioConfig {
  planeTints: readonly [string, string, string];
  orthogonalStage2: boolean;
  faradayDriftRadSec: number;
  stage3KnotCount: 3 | 4;
  showWhiskers: boolean;
  labelTag: string;
}

const POL_PLATES: readonly [CosmicPlateId, CosmicPlateId, CosmicPlateId] = [
  'horsehead',
  'pillars',
  'carina',
];

const POL_VARIANTS: readonly MinigameVariantSpec[] = [
  { index: 0, id: 'polarization_filter_v1', label: 'Horsehead B-Field Rim', plateId: 'horsehead' },
  { index: 1, id: 'polarization_filter_v2', label: 'Eagle Pillar Alignment', plateId: 'pillars' },
  { index: 2, id: 'polarization_filter_v3', label: 'Carina Dust Polarization', plateId: 'carina' },
  { index: 3, id: 'polarization_filter_v4', label: 'Tri-Vector Crossed Extinction', plateId: 'horsehead' },
];

const SCENARIOS: readonly PolarScenarioConfig[] = [
  {
    planeTints: ['172, 224, 255', '255, 214, 158', '202, 184, 255'],
    orthogonalStage2: false,
    faradayDriftRadSec: 0,
    stage3KnotCount: 3,
    showWhiskers: false,
    labelTag: 'PDR B-FIELD POLARIMETRY',
  },
  {
    planeTints: ['255, 212, 152', '158, 224, 255', '255, 182, 146'],
    orthogonalStage2: true,
    faradayDriftRadSec: 0,
    stage3KnotCount: 3,
    showWhiskers: true,
    labelTag: 'SILICATE GRAIN ALIGNMENT',
  },
  {
    planeTints: ['255, 206, 148', '166, 228, 255', '196, 178, 255'],
    orthogonalStage2: false,
    faradayDriftRadSec: 0.042, // Calm Stage 3 Faraday rotation precession
    stage3KnotCount: 3,
    showWhiskers: false,
    labelTag: 'FARADAY ROTATION VEIL',
  },
  {
    planeTints: ['164, 226, 255', '255, 218, 162', '192, 176, 255'],
    orthogonalStage2: false,
    faradayDriftRadSec: 0,
    stage3KnotCount: 4,
    showWhiskers: true,
    labelTag: 'STOKES Q/U CIRRUS',
  },
];

// Cached soft feathered polarized glare sheen texture (ZERO zebra bars, ZERO per-frame gradients!)
const sheenCache = new Map<string, HTMLCanvasElement>();
function getPolarSheenCanvas(tintRgb: string): HTMLCanvasElement | null {
  const existing = sheenCache.get(tintRgb);
  if (existing) return existing;
  if (typeof document === 'undefined') return null;

  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx || typeof ctx.createImageData !== 'function' || typeof ctx.putImageData !== 'function') {
    return null;
  }

  const parts = tintRgb.split(',').map((s) => Number(s.trim()) || 220);
  const [rCol, gCol, bCol] = parts;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const half = size * 0.5;

  for (let y = 0; y < size; y++) {
    const ny = (y - half) / half;
    // Soft multi-harmonic wispy optical glare bands (no harsh opaque stripes!)
    const band =
      0.5 +
      0.28 * Math.sin(ny * Math.PI * 5.0 + 0.4) +
      0.16 * Math.sin(ny * Math.PI * 11.0 - 0.8) +
      0.08 * Math.cos(ny * Math.PI * 2.0);
    for (let x = 0; x < size; x++) {
      const nx = (x - half) / half;
      const rad = Math.hypot(nx, ny);
      if (rad >= 1) continue;
      const edge = Math.max(0, 1 - rad * rad);
      const streak = 0.72 + 0.28 * Math.sin(nx * 4.2 + ny * 2.1);
      const alpha = clamp(band * streak * edge * 0.72, 0, 1);
      if (alpha < 0.004) continue;
      const idx = (y * size + x) * 4;
      d[idx] = rCol;
      d[idx + 1] = gCol;
      d[idx + 2] = bCol;
      d[idx + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  sheenCache.set(tintRgb, c);
  return c;
}

function modPiDiff(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(2 * (a - b)), Math.cos(2 * (a - b))) * 0.5);
}

/**
 * POL-12 — Cosmic Polarization Filter (Malus's Law I = I₀ sin²(θ - θ₀))
 * Twist the etched 0°–180° polarizing analyzer ring to extinguish polarized interstellar dust
 * glare veils and reveal embedded magnetic filament knots underneath.
 */
export class PolarizationFilterGame extends BaseCosmicMinigame {
  readonly id = 'polarization_filter';
  readonly title = 'COSMIC POLARIZATION FILTER';
  readonly subtitle = 'Malus Law Glare Extinction';
  readonly instrumentCode = 'POL-12';
  readonly platePool = POL_PLATES;
  readonly variants = POL_VARIANTS;

  private scenario: PolarScenarioConfig = SCENARIOS[0];
  private polarizerAngle = 0.2;
  private planes: GlarePlane[] = [];
  private knots: PolarKnot[] = [];
  private dustNeedles: DustNeedle[] = [];

  private draggingLens = false;
  private lastPointerAngle = 0;
  private lastShimmerAt = -10;

  protected override onMount(): void {
    this.scenario = SCENARIOS[this.iterationIndex % SCENARIOS.length];
  }

  protected onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.scenario = SCENARIOS[this.iterationIndex % SCENARIOS.length];
    this.draggingLens = false;

    const baseAng = rng() * Math.PI;
    let rawAngles: number[];
    if (stage === 1) {
      rawAngles = [baseAng];
    } else if (stage === 2) {
      const sep = this.scenario.orthogonalStage2 ? Math.PI * 0.5 : 0.92 + rng() * 0.56;
      rawAngles = [baseAng, (baseAng + sep) % Math.PI];
    } else {
      // Randomized 3-plane angles with guaranteed >= 48 deg (0.84 rad) separation modulo pi!
      const jitter1 = (rng() - 0.5) * 0.16;
      const jitter2 = (rng() - 0.5) * 0.16;
      rawAngles = [
        baseAng % Math.PI,
        (baseAng + Math.PI / 3 + jitter1) % Math.PI,
        (baseAng + (2 * Math.PI) / 3 + jitter2) % Math.PI,
      ];
    }

    this.planes = rawAngles.map((a, id) => ({
      id,
      baseAngle: a,
      tintRgb: this.scenario.planeTints[id % this.scenario.planeTints.length],
      clearedAll: false,
    }));

    // Start polarizer clearly offset from Plane 0 extinction
    this.polarizerAngle = (this.planes[0].baseAngle + 0.88) % Math.PI;

    const knotTotal = stage === 1 ? 2 : stage === 2 ? 4 : this.scenario.stage3KnotCount;
    const spectralChoices: SpectralClass[] = ['G', 'B', 'K', 'A'];
    this.knots = [];
    for (let i = 0; i < knotTotal; i++) {
      const planeIdx = i % this.planes.length;
      const sectorAng = (i * Math.PI * 2) / knotTotal + (rng() - 0.5) * 0.36;
      const rFrac = 0.28 + rng() * 0.44; // Strictly inside [0.28..0.72] of lensR -> ZERO clipping!
      this.knots.push({
        id: i,
        planeIdx,
        angle: sectorAng,
        rFrac,
        spectralClass: spectralChoices[planeIdx % spectralChoices.length],
        found: false,
      });
    }

    // Generate subtle oriented dust needles (pre-allocated once per stage, batched 1 stroke/plane)
    this.dustNeedles = [];
    for (let i = 0; i < 42; i++) {
      const a = rng() * Math.PI * 2;
      const rr = Math.sqrt(rng()) * 0.88;
      this.dustNeedles.push({
        ux: Math.cos(a) * rr,
        uy: Math.sin(a) * rr,
        len: 5 + rng() * 7,
        planeIdx: i % this.planes.length,
      });
    }
  }

  private getLensGeometry(w: number, h: number) {
    const compact = h < 450;
    const lensR = compact
      ? Math.min(w * 0.28, h * 0.32)
      : Math.min(w * 0.31, h * 0.345);
    return {
      cx: w * 0.5,
      cy: compact ? h * 0.475 : h * 0.485,
      lensR,
      compact,
    };
  }

  private getEffectivePlaneAngle(plane: GlarePlane): number {
    if (this.stage === 3 && this.scenario.faradayDriftRadSec > 0) {
      return plane.baseAngle + this.elapsedSec * this.scenario.faradayDriftRadSec;
    }
    return plane.baseAngle;
  }

  private getExtinctionTolRad(): number {
    return this.palette.mode === 'warm' ? 0.24 : this.palette.mode === 'cold' ? 0.155 : 0.20;
  }

  private isKnotCleared(knot: PolarKnot): boolean {
    const plane = this.planes[knot.planeIdx];
    if (!plane) return false;
    return modPiDiff(this.polarizerAngle, this.getEffectivePlaneAngle(plane)) <= this.getExtinctionTolRad();
  }

  private getKnotScreenPos(knot: PolarKnot, cx: number, cy: number, lensR: number): { kx: number; ky: number } {
    return {
      kx: cx + Math.cos(knot.angle) * knot.rFrac * lensR,
      ky: cy + Math.sin(knot.angle) * knot.rFrac * lensR,
    };
  }

  private collectKnot(knot: PolarKnot, kx: number, ky: number): void {
    knot.found = true;
    const plane = this.planes[knot.planeIdx];
    if (plane) {
      plane.clearedAll = this.knots.every((k) => k.planeIdx !== plane.id || k.found);
    }

    platform.triggerHaptic('phaseSnapLock', 0.9);
    this.ctx.audio?.playTumblerClick(0.92, true);
    this.particles.emitLockCausticRing(kx, ky, 14, this.palette.lockHex);
    this.particles.emitPhotonSparks(kx, ky, 4, 26, this.palette.lockHex);

    if (this.knots.every((item) => item.found)) {
      const { cx, cy } = this.getLensGeometry(this.width, this.height);
      this.triggerStageClear(
        `POLARIZATION ${this.stage}/${this.maxStages} EXTINGUISHED`,
        this.stage < 3 ? 0.6 : 0.45,
        cx,
        cy
      );
    } else {
      this.emitHud(true);
    }
  }

  protected override onPointerDown(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;
    const { x: px, y: py } = ev;
    const { cx, cy, lensR } = this.getLensGeometry(this.width, this.height);

    // 1. Check tapping any cleared, exposed magnetic knot first
    for (let i = 0; i < this.knots.length; i++) {
      const knot = this.knots[i];
      if (knot.found || !this.isKnotCleared(knot)) continue;
      const { kx, ky } = this.getKnotScreenPos(knot, cx, cy, lensR);
      if (Math.hypot(px - kx, py - ky) <= 38) {
        this.collectKnot(knot, kx, ky);
        return;
      }
    }

    // 2. Begin rotating analyzer bezel
    this.draggingLens = true;
    this.lastPointerAngle = Math.atan2(py - cy, px - cx);
    platform.triggerHaptic('vernierTick', 0.4);
  }

  protected override onPointerMove(ev: PointerLocalEvent): void {
    if (!this.draggingLens || this.stageClearTimer > 0) return;
    const { cx, cy } = this.getLensGeometry(this.width, this.height);
    // Guard center singularity (r < 22px) so dragging across center never whips 180 deg!
    if (Math.hypot(ev.x - cx, ev.y - cy) < 22) return;

    const ang = Math.atan2(ev.y - cy, ev.x - cx);
    let next = this.polarizerAngle + angleDiffRad(ang, this.lastPointerAngle);
    this.lastPointerAngle = ang;

    // Gentle magnetic null well near any active uncleared extinction angle
    const wellRad = 0.085 * this.profile.detentWellScale;
    for (let i = 0; i < this.planes.length; i++) {
      const p = this.planes[i];
      if (p.clearedAll) continue;
      const eff = this.getEffectivePlaneAngle(p);
      const err = modPiDiff(next, eff);
      if (err < wellRad) {
        const signed = Math.atan2(Math.sin(2 * (eff - next)), Math.cos(2 * (eff - next))) * 0.5;
        next += signed * 0.22;
        break;
      }
    }
    this.polarizerAngle = next;
  }

  protected override onPointerUp(): void {
    this.draggingLens = false;
  }

  protected override onWheel(deltaY: number): boolean {
    if (this.stageClearTimer > 0) return false;
    this.polarizerAngle += deltaY * 0.0018;
    return true;
  }

  protected override onKeyDown(e: KeyboardEvent): void {
    if (this.stageClearTimer > 0) return;
    const step = e.shiftKey ? 0.1 : 0.048;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.polarizerAngle -= step;
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.polarizerAngle += step;
    } else if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      const { cx, cy, lensR } = this.getLensGeometry(this.width, this.height);
      for (let i = 0; i < this.knots.length; i++) {
        const k = this.knots[i];
        if (!k.found && this.isKnotCleared(k)) {
          const { kx, ky } = this.getKnotScreenPos(k, cx, cy, lensR);
          this.collectKnot(k, kx, ky);
          break;
        }
      }
    }
  }

  protected onUpdate(_dt: number): void {
    // Find closest uncleared plane to drive Malus extinction audio notch & shimmer
    let bestExtinction01 = 0;
    for (let i = 0; i < this.planes.length; i++) {
      const p = this.planes[i];
      if (p.clearedAll) continue;
      const eff = this.getEffectivePlaneAngle(p);
      const sinV = Math.sin(this.polarizerAngle - eff);
      const malusGlare = sinV * sinV; // Authentic Malus's Law I = I₀ sin²(Δθ)
      const ext01 = 1 - malusGlare;
      if (ext01 > bestExtinction01) bestExtinction01 = ext01;
    }

    this.ctx.audio?.updateBeatSynth({
      beatHz: (1 - bestExtinction01) * 7.5,
      harmonicLock: bestExtinction01,
      warmth: this.profile.harmonicWarmthGain,
      strain: 0,
    });

    if (bestExtinction01 > 0.9 && this.elapsedSec - this.lastShimmerAt > 0.45) {
      this.lastShimmerAt = this.elapsedSec;
      const { cx, cy } = this.getLensGeometry(this.width, this.height);
      this.particles.emitSpectralShimmer(cx, cy, bestExtinction01, 2);
    }
  }

  protected onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const { cx, cy, lensR, compact } = this.getLensGeometry(w, h);

    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: 4,
      alpha: 0.44,
      brightness: 0.76,
      tintAlpha: 0.48,
      reticleDuck: { cx, cy, r: lensR * 0.85 },
    });

    // Clipped Circular Polarizing Lens Aperture
    c2d.save();
    c2d.beginPath();
    c2d.arc(cx, cy, lensR, 0, Math.PI * 2);
    c2d.clip?.();

    c2d.fillStyle = this.palette.mode === 'cold' ? 'rgba(3, 10, 18, 0.56)' : 'rgba(6, 11, 20, 0.52)';
    c2d.fillRect(cx - lensR, cy - lensR, lensR * 2, lensR * 2);

    // Subtle revealed curved magnetic-field streamlines underneath cleared knots!
    for (let i = 0; i < this.planes.length; i++) {
      const plane = this.planes[i];
      const eff = this.getEffectivePlaneAngle(plane);
      const sinV = Math.sin(this.polarizerAngle - eff);
      const malusGlare = sinV * sinV;
      const reveal01 = plane.clearedAll ? 0.55 : clamp(1 - malusGlare * 2.2, 0, 1);

      if (reveal01 > 0.12) {
        c2d.save();
        c2d.translate(cx, cy);
        // B-field is orthogonal to scattered E-vector polarization plane!
        c2d.rotate(eff + Math.PI * 0.5);
        c2d.strokeStyle = `rgba(${plane.clearedAll ? this.palette.lockRgb : plane.tintRgb}, ${(reveal01 * 0.24).toFixed(3)})`;
        c2d.lineWidth = 1;
        c2d.beginPath();
        for (let k = -2; k <= 2; k++) {
          const yOff = k * lensR * 0.24;
          c2d.moveTo(-lensR, yOff);
          if (typeof c2d.quadraticCurveTo === 'function') {
            c2d.quadraticCurveTo(0, yOff + k * 9, lensR, yOff);
          } else {
            c2d.lineTo(lensR, yOff);
          }
        }
        c2d.stroke();
        c2d.restore();
      }
    }

    // Hidden Magnetic Filament Knots (strictly inside lensR via polar rFrac!)
    for (let i = 0; i < this.knots.length; i++) {
      const knot = this.knots[i];
      const { kx, ky } = this.getKnotScreenPos(knot, cx, cy, lensR);
      const cleared = this.isKnotCleared(knot);
      const visAlpha = knot.found ? 1 : cleared ? 0.96 : 0.16;

      drawOpticalStar(c2d, kx, ky, knot.found ? 9.5 : cleared ? 8.2 : 5.2, {
        spectralClass: knot.found ? 'LOCK' : knot.spectralClass,
        spikes: knot.found ? 6 : 4,
        alpha: visAlpha,
        vibeMode: this.palette.mode,
        timeSec: this.elapsedSec,
        scintPhase: knot.id * 1.9,
      });

      // Clear pulsing target reticle on cleared, tappable knots!
      if (!knot.found && cleared) {
        const pulse = 1 + 0.12 * Math.sin(this.elapsedSec * 5.6 + knot.id);
        const planeTint = this.planes[knot.planeIdx]?.tintRgb ?? this.palette.accentRgb;
        c2d.save();
        c2d.strokeStyle = this.palette.lockHex;
        c2d.lineWidth = 1.6;
        c2d.beginPath();
        c2d.arc(kx, ky, 17 * pulse, 0, Math.PI * 2);
        c2d.stroke();

        c2d.strokeStyle = `rgba(${planeTint}, 0.55)`;
        c2d.lineWidth = 1;
        c2d.beginPath();
        c2d.arc(kx, ky, 22, 0, Math.PI * 2);
        c2d.stroke();
        c2d.restore();
      }
    }

    // Soft Feathered Polarized Dust Glare Veils (Malus's Law I = I₀ sin²(Δθ) — ZERO zebra stripes!)
    for (let i = 0; i < this.planes.length; i++) {
      const plane = this.planes[i];
      const eff = this.getEffectivePlaneAngle(plane);
      const sinV = Math.sin(this.polarizerAngle - eff);
      const malusIntensity = sinV * sinV;
      const activeMul = plane.clearedAll ? 0.2 : 1.0;
      const alpha = malusIntensity * 0.52 * activeMul;

      if (alpha > 0.015) {
        const sheen = getPolarSheenCanvas(plane.tintRgb);
        c2d.save();
        c2d.translate(cx, cy);
        c2d.rotate(eff);
        if (sheen && typeof c2d.drawImage === 'function') {
          c2d.globalAlpha = clamp(alpha, 0, 0.72);
          c2d.drawImage(sheen, -lensR * 1.08, -lensR * 1.08, lensR * 2.16, lensR * 2.16);
        }
        c2d.restore();

        // Batched micro-aligned interstellar dust needles (1 stroke call per plane!)
        c2d.save();
        c2d.strokeStyle = `rgba(${plane.tintRgb}, ${clamp(alpha * 0.9, 0, 0.55).toFixed(3)})`;
        c2d.lineWidth = 1.1;
        const dx = Math.cos(eff);
        const dy = Math.sin(eff);
        c2d.beginPath();
        for (let n = 0; n < this.dustNeedles.length; n++) {
          const nd = this.dustNeedles[n];
          if (nd.planeIdx !== plane.id) continue;
          const nx = cx + nd.ux * lensR;
          const ny = cy + nd.uy * lensR;
          const hl = nd.len * 0.5;
          c2d.moveTo(nx - dx * hl, ny - dy * hl);
          c2d.lineTo(nx + dx * hl, ny + dy * hl);
        }
        c2d.stroke();
        c2d.restore();
      }
    }

    // Optional faint Stokes polarization whiskers (V2 & V4)
    if (this.scenario.showWhiskers) {
      c2d.save();
      c2d.strokeStyle = 'rgba(210, 232, 250, 0.14)';
      c2d.lineWidth = 0.9;
      c2d.beginPath();
      const px = Math.cos(this.polarizerAngle) * 5;
      const py = Math.sin(this.polarizerAngle) * 5;
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        const wx = cx + Math.cos(a) * lensR * 0.84;
        const wy = cy + Math.sin(a) * lensR * 0.84;
        c2d.moveTo(wx - px, wy - py);
        c2d.lineTo(wx + px, wy + py);
      }
      c2d.stroke();
      c2d.restore();
    }

    c2d.restore();

    // Etched Polarizing Analyzer Outer Bezel (0°–180° PA ticks + birefringent rim + knurled grip tabs)
    c2d.save();
    // Subtle birefringent chromatic outer rim
    c2d.strokeStyle = 'rgba(158, 232, 255, 0.24)';
    c2d.lineWidth = 1.2;
    c2d.beginPath();
    c2d.arc(cx, cy, lensR + 3, 0, Math.PI * 2);
    c2d.stroke();

    c2d.strokeStyle = this.palette.accentHex;
    c2d.lineWidth = 2.1;
    c2d.beginPath();
    c2d.arc(cx, cy, lensR, 0, Math.PI * 2);
    c2d.stroke();

    // Batched 15-degree micrometer bezel ticks
    c2d.strokeStyle = this.palette.mode === 'cold' ? 'rgba(158, 232, 255, 0.42)' : 'rgba(220, 236, 252, 0.24)';
    c2d.lineWidth = 1;
    c2d.beginPath();
    for (let deg = 0; deg < 360; deg += 15) {
      const a = (deg * Math.PI) / 180;
      const major = deg % 45 === 0;
      const r0 = lensR + 1;
      const r1 = lensR + (major ? 7 : 4);
      c2d.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c2d.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    }
    c2d.stroke();

    // Cleared extinction-angle notches etched onto outer bezel
    for (let i = 0; i < this.planes.length; i++) {
      const p = this.planes[i];
      if (!p.clearedAll) continue;
      const eff = this.getEffectivePlaneAngle(p);
      c2d.strokeStyle = this.palette.lockHex;
      c2d.lineWidth = 2;
      c2d.beginPath();
      for (let side = 0; side < 2; side++) {
        const a = eff + side * Math.PI;
        c2d.moveTo(cx + Math.cos(a) * (lensR - 3), cy + Math.sin(a) * (lensR - 3));
        c2d.lineTo(cx + Math.cos(a) * (lensR + 10), cy + Math.sin(a) * (lensR + 10));
      }
      c2d.stroke();
    }

    // Polarizer analyzer transmission hairline + knurled grip tabs on opposite ends
    const cosA = Math.cos(this.polarizerAngle);
    const sinA = Math.sin(this.polarizerAngle);
    c2d.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    c2d.lineWidth = 1;
    c2d.setLineDash?.([4, 6]);
    c2d.beginPath();
    c2d.moveTo(cx + cosA * lensR, cy + sinA * lensR);
    c2d.lineTo(cx - cosA * lensR, cy - sinA * lensR);
    c2d.stroke();
    c2d.setLineDash?.([]);

    for (let side = -1; side <= 1; side += 2) {
      const gx = cx + cosA * (lensR + 2) * side;
      const gy = cy + sinA * (lensR + 2) * side;
      c2d.fillStyle = '#07101c';
      c2d.strokeStyle = this.palette.accentHex;
      c2d.lineWidth = 1.8;
      c2d.beginPath();
      c2d.arc(gx, gy, 6.5, 0, Math.PI * 2);
      c2d.fill();
      c2d.stroke();
    }

    // Position Angle (0°–180° modulo pi) + Cold H% Stokes Q/U telemetry readout
    const paDeg = ((((this.polarizerAngle * 180) / Math.PI) % 180) + 180) % 180;
    const stokesQ = Math.cos(2 * this.polarizerAngle);
    const stokesU = Math.sin(2 * this.polarizerAngle);
    c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = 'rgba(208, 228, 246, 0.72)';
    c2d.textAlign = 'center';
    const header = this.profile.showNumericDeltas
      ? `${this.scenario.labelTag} · PA ${paDeg.toFixed(1)}° · Q=${stokesQ.toFixed(2)} U=${stokesU.toFixed(2)}`
      : `${this.scenario.labelTag} · ANALYZER PA ${paDeg.toFixed(0)}°`;
    c2d.fillText(header, cx, compact ? cy - lensR - 12 : cy - lensR - 16);
    c2d.restore();

    this.drawSharedOverlays(c2d, w, h);
  }

  protected getStageProgress01(): number {
    const found = this.knots.filter((k) => k.found).length;
    return clamp((this.stage - 1 + found / Math.max(1, this.knots.length)) / 3, 0, 1);
  }

  protected getPromptText(): string {
    const found = this.knots.filter((k) => k.found).length;
    const total = this.knots.length;
    if (this.stage === 3 && this.scenario.faradayDriftRadSec > 0) {
      return `Track the precessing Faraday dust planes with the polarizing bezel and tap exposed knots (${found}/${total}).`;
    }
    return `Rotate the polarizing bezel ring (or wheel / Arrows) to fade glare sheets, then tap exposed knots (${found}/${total}).`;
  }

  protected solveCurrentStage(stage: 1 | 2 | 3): void {
    void stage;
    if (this.planes.length > 0) {
      this.polarizerAngle = this.getEffectivePlaneAngle(this.planes[0]);
    }
    for (let i = 0; i < this.knots.length; i++) {
      this.knots[i].found = true;
    }
    for (let i = 0; i < this.planes.length; i++) {
      this.planes[i].clearedAll = true;
    }
  }

  protected override verifySolved(_stage: 1 | 2 | 3): boolean {
    return this.knots.length > 0 && this.knots.every((k) => k.found);
  }

  protected onAllStagesCleared(): void {
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.finishSuccess({
      accuracy: 0.96,
      proofFragmentSuffix: 'polar',
      dossierSnippet: `Malus extinction polarimetry (${this.activeVariant?.label ?? 'Analyzer'}) isolated ${this.planes.length} magnetic dust planes on ${this.ctx.targetName}.`,
      telemetrySummary: `Malus Filter Lock 96% · ${this.planes.length} Planes · ${totalSec.toFixed(1)}s`,
      physicalPrinciple: 'Malus’s Law (I = I₀ sin²Δθ), Position Angle (0–180°) & Interstellar Dust Grain Alignment',
    });
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Interstellar dust grains align perpendicular to galactic magnetic fields and scatter polarized glare. By Malus’s Law (I = I₀ sin²Δθ), rotating an analyzer repeats extinction every 180°.',
      goalSummary:
        'Twist the polarizing bezel ring until a dust glare veil melts to zero, revealing pulsed magnetic knots underneath to tap.',
      controlsDesktop:
        'Drag around the polarizing bezel (or wheel / ArrowLeft–Right) to extinguish glare, then click exposed knots (or Space).',
      controlsTouch: 'Rotate around the lens rim to clear each polarized dust veil and tap exposed knots.',
      warmthEffect:
        'Warm H% broadens angular extinction nulls; Cold H% tightens polarization lock and reveals Stokes Q/U telemetry.',
    };
  }
}
