import { platform } from '../../../platform/PlatformAdapter';
import { BaseCosmicMinigame, type PointerLocalEvent } from '../core/BaseCosmicMinigame';
import {
  drawVernierStrip,
  hitVernierStrip,
  layoutVernierRowInto,
  valueFromStripX,
  type VernierItemInput,
  type VernierStripSpec,
} from '../core/vernierWidgets';
import { drawGlowStroke, drawInclinedAstrometryRing } from '../render/OpticalDrawUtils';
import { drawLimbDarkenedStar, drawOpticalStar } from '../render/StarPSFAtlas';
import { clamp, lerp } from '../tactilePhysics';
import type {
  CosmicPlateId,
  InstrumentFieldGuide,
  MinigameVariantSpec,
  SpectralClass,
} from '../types';

type ResolvedTargetKind = 'binary' | 'supergiant' | 'disk_cavity' | 'quasar_step';

interface MichelsonVariantProfile {
  wavelengthNm: number;
  bandLabel: string;
  targetKind: ResolvedTargetKind;
  fringeFreq: number;
  driftAmp: number;
  driftOmega: number;
  starClassA: SpectralClass;
  starClassB: SpectralClass;
}

const MICHELSON_VARIANTS: readonly MinigameVariantSpec[] = [
  { index: 0, id: 'michelson_fringe_v1', label: 'M57 Narrowband Fringe', plateId: 'ring_m57' },
  { index: 1, id: 'michelson_fringe_v2', label: 'Southern Ring Delay', plateId: 'southern_ring' },
  { index: 2, id: 'michelson_fringe_v3', label: 'Cartwheel Wide Baseline', plateId: 'cartwheel' },
  { index: 3, id: 'michelson_fringe_v4', label: 'Thermal Drift Nulling', plateId: 'ring_m57' },
];

const VARIANT_PROFILES: readonly MichelsonVariantProfile[] = [
  {
    wavelengthNm: 550,
    bandLabel: '550 nm V',
    targetKind: 'binary',
    fringeFreq: 6.2,
    driftAmp: 0.115,
    driftOmega: 0.62,
    starClassA: 'G',
    starClassB: 'B',
  },
  {
    wavelengthNm: 1620,
    bandLabel: '1.62 μm H',
    targetKind: 'supergiant',
    fringeFreq: 4.8,
    driftAmp: 0.105,
    driftOmega: 0.56,
    starClassA: 'M',
    starClassB: 'K',
  },
  {
    wavelengthNm: 3400,
    bandLabel: '3.4 μm L',
    targetKind: 'disk_cavity',
    fringeFreq: 5.4,
    driftAmp: 0.11,
    driftOmega: 0.58,
    starClassA: 'F',
    starClassB: 'K',
  },
  {
    wavelengthNm: 420,
    bandLabel: '420 nm UV',
    targetKind: 'quasar_step',
    fringeFreq: 7.4,
    driftAmp: 0.128,
    driftOmega: 0.68,
    starClassA: 'O',
    starClassB: 'A',
  },
];

/**
 * Smooth constant-speed rounded triangle wave in [-1, +1] so thermal mirror drift
 * never pauses long enough at turnaround peaks for stationary camping.
 */
function smoothTriangleWave(phaseRad: number): number {
  return (2 / Math.PI) * Math.asin(0.92 * Math.sin(phaseRad));
}

/**
 * INT-18 — Michelson Fringe Interferometer
 * Real 90° trombone optical delay lines with corner-cube retroreflectors, Gaussian
 * white-light coherence envelope (I(x) = I_0 [1 + V(ΔL) cos(kx+φ)]), decoupled 2D
 * orthogonal visibility in Stage 3, live BeatSynth audio unison, and ZERO per-frame blur.
 */
export class MichelsonFringeGame extends BaseCosmicMinigame {
  readonly id = 'michelson_fringe';
  readonly title = 'MICHELSON FRINGE TUNER';
  readonly subtitle = 'Optical Delay Phase Interference';
  readonly instrumentCode = 'INT-18';
  readonly platePool: readonly CosmicPlateId[] = ['ring_m57', 'southern_ring', 'cartwheel'];
  readonly variants = MICHELSON_VARIANTS;

  private variantProfile: MichelsonVariantProfile = VARIANT_PROFILES[0];
  private targetA = 0.55;
  private targetB = 0.45;
  private delayA = 0.2;
  private delayB = 0.8;
  private driftPhaseOffset = 0;

  private strips: VernierStripSpec[] = [];
  private stripInputs: VernierItemInput[] = [];
  private dragMode: 'a' | 'b' | 'railA' | 'railB' | null = null;
  private lastShowcaseSig = '';

  protected onMount(): void {
    this.variantProfile = VARIANT_PROFILES[this.iterationIndex % VARIANT_PROFILES.length];
    this.lockHoldTargetSec = 0.58;
  }

  private getAxisTol(): number {
    if (this.profile.vibe === 'warm') return 0.044;
    if (this.profile.vibe === 'cold') return 0.028;
    return 0.036;
  }

  private getCoherenceWidth(): number {
    if (this.profile.vibe === 'warm') return 0.19;
    if (this.profile.vibe === 'cold') return 0.135;
    return 0.16;
  }

  protected onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.dragMode = null;
    this.lockHoldTargetSec = stage === 2 ? 0.88 : 0.58;
    this.driftPhaseOffset = rng() * Math.PI * 2;
    this.targetA = 0.28 + rng() * 0.44; // Keeps ±0.12 drift cleanly inside [0.12, 0.88]
    this.targetB = 0.24 + rng() * 0.52;
    this.delayA = this.targetA > 0.5 ? 0.12 : 0.88;
    this.delayB = stage < 3 ? this.targetB : this.targetB > 0.5 ? 0.12 : 0.88;
  }

  private getEffectiveTargetA(): number {
    if (this.stage === 2) {
      const wave = smoothTriangleWave(this.elapsedSec * this.variantProfile.driftOmega + this.driftPhaseOffset);
      return clamp(this.targetA + wave * this.variantProfile.driftAmp, 0.1, 0.9);
    }
    return this.targetA;
  }

  private getDriftVelocitySign(): number {
    if (this.stage !== 2) return 0;
    const c = Math.cos(this.elapsedSec * this.variantProfile.driftOmega + this.driftPhaseOffset);
    return c >= 0 ? 1 : -1;
  }

  private computeAxisVis(err: number): number {
    const lc = this.getCoherenceWidth();
    return clamp(Math.exp(-Math.pow(err / lc, 2)), 0, 1);
  }

  private computeVisibilities(): { visA: number; visB: number; combined: number; errA: number; errB: number } {
    const errA = this.delayA - this.getEffectiveTargetA();
    const errB = this.stage === 3 ? this.delayB - this.targetB : 0;
    const visA = this.computeAxisVis(errA);
    const visB = this.stage === 3 ? this.computeAxisVis(errB) : 1;
    const combined = this.stage === 3 ? Math.sqrt(visA * visB) : visA;
    return { visA, visB, combined, errA, errB };
  }

  private isAxisALocked(): boolean {
    return Math.abs(this.delayA - this.getEffectiveTargetA()) <= this.getAxisTol();
  }

  private isAxisBLocked(): boolean {
    return this.stage < 3 || Math.abs(this.delayB - this.targetB) <= this.getAxisTol();
  }

  private isLockedNow(): boolean {
    return this.isAxisALocked() && this.isAxisBLocked();
  }

  private opdMicrons(val01: number): number {
    return (val01 - 0.5) * 90; // -45.0 μm .. +45.0 μm
  }

  private getBenchGeometry(w: number, h: number): {
    cx: number;
    cy: number;
    plateR: number;
    railTop: number;
    railBot: number;
    rxLeft: number;
    bsLeft: number;
    rxRight: number;
    bsRight: number;
  } {
    const compact = h < 450;
    const cx = w * 0.5;
    const cy = compact ? h * 0.42 : h * 0.44;
    const plateR = Math.min(w, h) * (compact ? 0.24 : 0.26);
    const railTop = compact ? h * 0.2 : h * 0.22;
    const railBot = compact ? h * 0.65 : h * 0.67;
    const railOffset = compact ? 54 : 84;
    const bsOffset = compact ? 22 : 36;
    return {
      cx,
      cy,
      plateR,
      railTop,
      railBot,
      rxLeft: cx - plateR - railOffset,
      bsLeft: cx - plateR - bsOffset,
      rxRight: cx + plateR + railOffset,
      bsRight: cx + plateR + bsOffset,
    };
  }

  protected onPointerDown(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;

    for (let i = 0; i < this.strips.length; i++) {
      const s = this.strips[i];
      if (hitVernierStrip(s, ev.x, ev.y)) {
        this.dragMode = s.key as 'a' | 'b';
        const targ = s.key === 'a' ? this.getEffectiveTargetA() : this.targetB;
        const mag = 0.045 * this.profile.detentWellScale;
        const v = valueFromStripX(s, ev.x, targ, mag);
        if (s.key === 'a') this.delayA = v;
        if (s.key === 'b') this.delayB = v;
        platform.triggerHaptic('vernierTick', 0.45);
        return;
      }
    }

    // Restrict direct rail drag strictly to |px - rx| <= 48px so tapping center plate never teleports mirrors!
    const g = this.getBenchGeometry(this.width, this.height);
    if (ev.y >= g.railTop - 24 && ev.y <= g.railBot + 24) {
      if (Math.abs(ev.x - g.rxLeft) <= 48) {
        this.dragMode = 'railA';
        this.delayA = clamp((ev.y - g.railTop) / Math.max(1, g.railBot - g.railTop), 0, 1);
        platform.triggerHaptic('vernierTick', 0.45);
        return;
      }
      if (this.stage === 3 && Math.abs(ev.x - g.rxRight) <= 48) {
        this.dragMode = 'railB';
        this.delayB = clamp((ev.y - g.railTop) / Math.max(1, g.railBot - g.railTop), 0, 1);
        platform.triggerHaptic('vernierTick', 0.45);
        return;
      }
    }
  }

  protected onPointerMove(ev: PointerLocalEvent): void {
    if (!this.dragMode || this.stageClearTimer > 0) return;
    const g = this.getBenchGeometry(this.width, this.height);
    const mag = 0.045 * this.profile.detentWellScale;

    if (this.dragMode === 'railA') {
      const raw = clamp((ev.y - g.railTop) / Math.max(1, g.railBot - g.railTop), 0, 1);
      const tA = this.getEffectiveTargetA();
      this.delayA = Math.abs(raw - tA) < mag ? lerp(raw, tA, 0.42) : raw;
    } else if (this.dragMode === 'railB') {
      const raw = clamp((ev.y - g.railTop) / Math.max(1, g.railBot - g.railTop), 0, 1);
      this.delayB = Math.abs(raw - this.targetB) < mag ? lerp(raw, this.targetB, 0.42) : raw;
    } else {
      const s = this.strips.find((item) => item.key === this.dragMode);
      if (!s) return;
      const targ = s.key === 'a' ? this.getEffectiveTargetA() : this.targetB;
      const v = valueFromStripX(s, ev.x, targ, mag);
      if (s.key === 'a') this.delayA = v;
      if (s.key === 'b') this.delayB = v;
    }
  }

  protected onPointerUp(): void {
    this.dragMode = null;
  }

  protected onKeyDown(e: KeyboardEvent): void {
    if (this.stageClearTimer > 0) return;
    const step = e.shiftKey ? 0.01 : 0.025;
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.delayA = clamp(this.delayA - step, 0, 1);
    } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
      e.preventDefault();
      this.delayA = clamp(this.delayA + step, 0, 1);
    } else if (this.stage === 3 && (e.key === 'i' || e.key === 'I' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      this.delayB = clamp(this.delayB - step, 0, 1);
    } else if (this.stage === 3 && (e.key === 'k' || e.key === 'K' || e.key === 'ArrowRight')) {
      e.preventDefault();
      this.delayB = clamp(this.delayB + step, 0, 1);
    } else if (this.stage < 3 && e.key === 'ArrowLeft') {
      e.preventDefault();
      this.delayA = clamp(this.delayA - step, 0, 1);
    } else if (this.stage < 3 && e.key === 'ArrowRight') {
      e.preventDefault();
      this.delayA = clamp(this.delayA + step, 0, 1);
    }
  }

  protected onUpdate(dt: number): void {
    const { combined, errA } = this.computeVisibilities();

    // Live harmonic audio beating that resolves into pure unison at coherent lock!
    this.ctx.audio?.updateBeatSynth({
      beatHz: (1 - combined) * 12.5,
      harmonicLock: combined,
      warmth: this.profile.harmonicWarmthGain,
      strain: this.stage === 2 ? 0.25 : 0,
      pan: 0,
    });

    // Subtle 3D showcase coupling
    if (this.ctx.showcase) {
      const sig = `${Math.round(combined * 35)}:${Math.round(errA * 40)}`;
      if (sig !== this.lastShowcaseSig) {
        this.lastShowcaseSig = sig;
        this.ctx.showcase.applyInstrumentPatch({
          progress: this.getStageProgress01(),
          fringeContrast: combined,
          fringePhase: errA * 16,
        });
      }
    }

    if (this.stageClearTimer > 0) return;

    if (this.isLockedNow()) {
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        const g = this.getBenchGeometry(this.width, this.height);
        this.triggerStageClear(`FRINGE LOCK ${this.stage}/3 COHERENT`, 0.56, g.cx, g.cy);
      }
    } else {
      this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.45);
    }
  }

  protected onAllStagesCleared(): void {
    const targetNoun =
      this.variantProfile.targetKind === 'supergiant'
        ? 'red supergiant angular photosphere'
        : this.variantProfile.targetKind === 'disk_cavity'
        ? 'protoplanetary inner disk cavity'
        : this.variantProfile.targetKind === 'quasar_step'
        ? 'anomalous right-angle quasar facet'
        : 'hidden close binary pair';
    this.finishSuccess({
      accuracy: 0.96,
      proofFragmentSuffix: 'michelson',
      dossierSnippet: `Coherent Michelson interference fringes equalized at ${this.variantProfile.bandLabel}, resolving the ${targetNoun} on ${this.ctx.targetName}.`,
      telemetrySummary: `Fringe Visibility 96% · ${this.elapsedSec.toFixed(1)}s`,
      physicalPrinciple: 'Michelson Optical Delay Interferometry & Gaussian White-Light Coherence Envelope',
    });
  }

  protected getStageProgress01(): number {
    if (this.completed) return 1;
    const { combined } = this.computeVisibilities();
    return clamp((this.stage - 1 + combined) / 3, 0, 1);
  }

  protected getPromptText(): string {
    const toneAdj = this.palette.mode === 'cold' ? 'crisp cyan' : 'luminous';
    if (this.stage === 1) {
      return `Slide DELAY A along the trombone rail until the white-light packet snaps into ${toneAdj} coherent Airy fringes.`;
    }
    if (this.stage === 2) {
      return `Actively track thermal mirror drift on DELAY A (watch visibility & audio beat) to hold coherent fringes locked.`;
    }
    return `Equalize both DELAY A (radial) & DELAY B (orthogonal) rails until the 2D interference lattice resolves the target.`;
  }

  private drawResolvedTarget(
    c2d: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    plateR: number,
    contrast: number
  ): void {
    // Eliminates the ugly "||" vertical railroad-track artifact:
    // Below contrast 0.52, render ONE single soft unspiked blurred star core;
    // above 0.52, cleanly resolve into the curated astrophysical target with rotated delicate spikes!
    const resolveT = clamp((contrast - 0.52) / 0.44, 0, 1);
    const kind = this.variantProfile.targetKind;

    if (resolveT <= 0.02) {
      drawOpticalStar(c2d, cx, cy, lerp(14, 10, contrast), {
        spectralClass: this.variantProfile.starClassA,
        spikes: 0,
        alpha: lerp(0.32, 0.72, contrast),
        vibeMode: this.palette.mode,
      });
      return;
    }

    if (kind === 'supergiant') {
      drawLimbDarkenedStar(c2d, cx, cy, lerp(9, plateR * 0.22, resolveT), 'M', 0.45 + resolveT * 0.52);
      drawInclinedAstrometryRing(
        c2d,
        cx,
        cy,
        plateR * 0.38,
        plateR * 0.24,
        0.28,
        '255, 178, 120',
        { backAlpha: 0.08 * resolveT, frontAlpha: 0.28 * resolveT, ticks: 0 }
      );
      drawOpticalStar(c2d, cx, cy, 7.5, {
        spectralClass: contrast > 0.88 ? 'LOCK' : 'K',
        spikes: 4,
        rotationRad: 0.42,
        alpha: resolveT * 0.85,
        vibeMode: this.palette.mode,
      });
    } else if (kind === 'disk_cavity') {
      drawInclinedAstrometryRing(
        c2d,
        cx,
        cy,
        plateR * 0.4,
        plateR * 0.19,
        -0.34,
        contrast > 0.88 ? this.palette.lockRgb : this.palette.accentRgb,
        { backAlpha: 0.18 * resolveT, frontAlpha: 0.65 * resolveT, lineWidth: 2.2, ticks: 0 }
      );
      drawOpticalStar(c2d, cx, cy, 7.2, {
        spectralClass: this.variantProfile.starClassA,
        spikes: 4,
        rotationRad: 0.38,
        alpha: 0.65 + resolveT * 0.35,
        vibeMode: this.palette.mode,
      });
    } else if (kind === 'quasar_step') {
      drawOpticalStar(c2d, cx, cy, 8.5, {
        spectralClass: contrast > 0.88 ? 'LOCK' : 'O',
        spikes: 4,
        rotationRad: 0.4,
        alpha: 0.7 + resolveT * 0.3,
        vibeMode: this.palette.mode,
      });
      // Subtle anomalous right-angle enclosure step revealed inside coherent quasar core
      c2d.save();
      c2d.strokeStyle = contrast > 0.88 ? this.palette.lockHex : '#9ee8ff';
      c2d.globalAlpha = resolveT * 0.78;
      c2d.lineWidth = 1.4;
      const s = plateR * 0.24;
      c2d.beginPath();
      c2d.moveTo(cx - s, cy + s * 0.5);
      c2d.lineTo(cx, cy + s * 0.5);
      c2d.lineTo(cx, cy - s * 0.5);
      c2d.lineTo(cx + s, cy - s * 0.5);
      c2d.stroke();
      c2d.restore();
    } else {
      // Close Binary Pair cleanly separated diagonally with rotated non-colliding spikes
      const sep = lerp(2.5, plateR * 0.22, resolveT);
      const ang = -0.48; // Diagonal axis prevents spike collision
      const dx = Math.cos(ang) * sep;
      const dy = Math.sin(ang) * sep;
      const useSpikes: 0 | 4 = resolveT > 0.45 ? 4 : 0;
      drawOpticalStar(c2d, cx - dx, cy - dy, lerp(10, 7.8, resolveT), {
        spectralClass: this.isLockedNow() ? 'LOCK' : this.variantProfile.starClassA,
        spikes: useSpikes,
        rotationRad: 0.46,
        alpha: 0.62 + resolveT * 0.38,
        vibeMode: this.palette.mode,
      });
      drawOpticalStar(c2d, cx + dx, cy + dy, lerp(8, 6.6, resolveT), {
        spectralClass: this.variantProfile.starClassB,
        spikes: useSpikes,
        rotationRad: 0.46,
        alpha: 0.54 + resolveT * 0.42,
        vibeMode: this.palette.mode,
      });
    }
  }

  private drawTromboneRail(
    c2d: CanvasRenderingContext2D,
    rx: number,
    bsX: number,
    plateEdgeX: number,
    cy: number,
    railTop: number,
    railBot: number,
    val01: number,
    locked: boolean,
    label: string,
    driftDirSign: number
  ): void {
    const py = lerp(railTop, railBot, val01);
    const beamCol = locked ? this.palette.lockHex : this.palette.accentHex;
    const inward = rx < plateEdgeX ? 1 : -1;
    // Folding mirror sits at top of rail so optical path makes a real 90° trombone loop!
    const foldY = cy;
    const railInnerX = rx + inward * 12;

    c2d.save();
    // Graduated micrometer rail spine + ticks (batched)
    c2d.strokeStyle = 'rgba(200, 224, 248, 0.26)';
    c2d.lineWidth = 1.8;
    c2d.beginPath();
    c2d.moveTo(rx, railTop);
    c2d.lineTo(rx, railBot);
    for (let t = 0; t <= 8; t++) {
      const ty = lerp(railTop, railBot, t / 8);
      const tickW = t % 4 === 0 ? 6 : 3;
      c2d.moveTo(rx - tickW, ty);
      c2d.lineTo(rx + tickW, ty);
    }
    c2d.stroke();

    // Beam-splitter glass prism diamond
    c2d.strokeStyle = this.palette.secondaryHex;
    c2d.globalAlpha = 0.65;
    c2d.lineWidth = 1.3;
    c2d.beginPath();
    c2d.moveTo(bsX, cy - 9);
    c2d.lineTo(bsX + 9, cy);
    c2d.lineTo(bsX, cy + 9);
    c2d.lineTo(bsX - 9, cy);
    c2d.closePath();
    c2d.stroke();
    // Diagonal 45° reflective splitter plane
    c2d.beginPath();
    c2d.moveTo(bsX - 6, cy - 6);
    c2d.lineTo(bsX + 6, cy + 6);
    c2d.stroke();

    // Fixed 45° folding mirror at (railInnerX, foldY)
    c2d.strokeStyle = 'rgba(210, 232, 250, 0.55)';
    c2d.beginPath();
    c2d.moveTo(railInnerX - 5 * inward, foldY - 5);
    c2d.lineTo(railInnerX + 5 * inward, foldY + 5);
    c2d.stroke();

    // True 90° Trombone Optical Delay Path (outbound + parallel return beam)
    c2d.strokeStyle = beamCol;
    c2d.globalAlpha = locked ? 0.82 : 0.58;
    c2d.lineWidth = 1.4;
    if (typeof c2d.setLineDash === 'function') c2d.setLineDash([4, 4]);
    c2d.beginPath();
    c2d.moveTo(plateEdgeX, cy);
    c2d.lineTo(bsX, cy);
    c2d.lineTo(railInnerX, foldY);
    c2d.lineTo(railInnerX, py);
    c2d.lineTo(rx, py);
    c2d.stroke();
    if (typeof c2d.setLineDash === 'function') c2d.setLineDash([]);

    // Movable Corner-Cube Retroreflector Carriage
    c2d.globalAlpha = 1;
    c2d.fillStyle = '#07101c';
    c2d.strokeStyle = beamCol;
    c2d.lineWidth = 2;
    c2d.beginPath();
    c2d.moveTo(rx - 9, py - 8);
    c2d.lineTo(rx + 9, py - 8);
    c2d.lineTo(rx + 9, py + 8);
    c2d.lineTo(rx - 9, py + 8);
    c2d.closePath();
    c2d.fill();
    c2d.stroke();
    // Inner V-prism chevron
    c2d.lineWidth = 1.2;
    c2d.beginPath();
    c2d.moveTo(rx - 5, py - 4);
    c2d.lineTo(rx, py + 3);
    c2d.lineTo(rx + 5, py - 4);
    c2d.stroke();

    // Rail label + Stage 2 thermal drift direction indicator ONLY (NO answer tick!)
    c2d.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = locked ? this.palette.lockHex : this.palette.secondaryHex;
    c2d.textAlign = 'center';
    c2d.fillText(label, rx, railTop - 10);
    if (driftDirSign !== 0) {
      c2d.fillStyle = this.palette.accentHex;
      c2d.font = '600 8px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillText(driftDirSign > 0 ? '▼ DRIFT +μm' : '▲ DRIFT -μm', rx, railBot + 14);
    }
    c2d.restore();
  }

  protected onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const compact = this.compact;
    const g = this.getBenchGeometry(w, h);
    const { visA, visB, combined, errA, errB } = this.computeVisibilities();
    const locked = this.isLockedNow();

    // 0ms offscreen plate crossfade (ZERO per-frame ctx.filter Gaussian blur!)
    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: lerp(11, 1, combined),
      alpha: 0.44,
      brightness: lerp(0.72, 1.06, combined),
      tintAlpha: 0.48,
      reticleDuck: { cx: g.cx, cy: g.cy, r: g.plateR + 18 },
    });

    // Circular Interferometer Plate
    c2d.save();
    c2d.beginPath();
    c2d.arc(g.cx, g.cy, g.plateR, 0, Math.PI * 2);
    c2d.fillStyle = 'rgba(4, 9, 17, 0.88)';
    c2d.fill();
    c2d.clip?.();

    // Axis A: Gaussian-enveloped radial Airy interference rings with subtle 1st-order chromatic rim
    const ringCount = 15;
    const phaseA = errA * 22 + this.elapsedSec * (1 - visA) * 3.8;
    const fFreq = this.variantProfile.fringeFreq;
    for (let i = 1; i <= ringCount; i++) {
      const frac = i / ringCount;
      const rr = frac * g.plateR;
      const cosTerm = 0.5 + 0.5 * Math.cos(frac * Math.PI * fFreq + phaseA);
      // True Gaussian white-light fringe visibility modulation: I = 0.25 + V * (cos - 0.5)
      const intensity = clamp(0.18 + visA * cosTerm * 0.82, 0.08, 1);
      const col = this.isAxisALocked()
        ? this.palette.lockHex
        : visA > 0.45
        ? this.palette.accentHex
        : 'rgba(176, 196, 218, 0.45)';
      c2d.strokeStyle = col;
      c2d.globalAlpha = lerp(0.08, 0.86, intensity * visA) * (1 - frac * 0.3);
      c2d.lineWidth = lerp(3.4, 1.5, visA);
      c2d.beginPath();
      c2d.arc(g.cx, g.cy, rr, 0, Math.PI * 2);
      c2d.stroke();

      // Subtle 1st-order white-light spectral dispersion fringe on coherent rings
      if (visA > 0.6 && i <= 5) {
        c2d.strokeStyle = i % 2 === 0 ? '#8ac8ff' : '#ffb07c';
        c2d.globalAlpha = (visA - 0.55) * 0.36;
        c2d.lineWidth = 0.9;
        c2d.beginPath();
        c2d.arc(g.cx, g.cy, rr + (i % 2 === 0 ? -1.4 : 1.4), 0, Math.PI * 2);
        c2d.stroke();
      }
    }

    // Axis B (Stage 3): Decoupled orthogonal linear interference bands forming a 2D diamond lattice!
    if (this.stage === 3) {
      const bandCount = 13;
      const phaseB = errB * 22 + this.elapsedSec * (1 - visB) * 3.6;
      const colB = this.isAxisBLocked() ? this.palette.lockHex : this.palette.secondaryHex;
      for (let j = -6; j <= 6; j++) {
        const frac = j / 6;
        const cosB = 0.5 + 0.5 * Math.cos(frac * Math.PI * 4.5 + phaseB);
        const offset = frac * g.plateR * 0.92;
        c2d.strokeStyle = colB;
        c2d.globalAlpha = lerp(0.05, 0.64, cosB * visB) * (1 - Math.abs(frac) * 0.35);
        c2d.lineWidth = lerp(2.8, 1.3, visB);
        c2d.beginPath();
        c2d.moveTo(g.cx - g.plateR, g.cy + offset - errB * 36);
        c2d.lineTo(g.cx + g.plateR, g.cy + offset + errB * 36);
        c2d.stroke();
      }
      void bandCount;
    }

    // Resolved Astrophysical Target at Plate Center (zero "||" railroad artifact!)
    this.drawResolvedTarget(c2d, g.cx, g.cy, g.plateR, combined);

    // Live etched White-Light Fringe Packet Oscilloscope Trace along lower rim of plate!
    const oscW = g.plateR * 1.18;
    const oscY = g.cy + g.plateR * 0.68;
    const oscAmp = g.plateR * 0.13;
    c2d.save();
    c2d.strokeStyle = locked ? this.palette.lockHex : this.palette.accentHex;
    c2d.globalAlpha = 0.72;
    c2d.lineWidth = 1.25;
    c2d.beginPath();
    const steps = 40;
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const s = (u - 0.5) * 2; // -1..+1
      const env = Math.exp(-s * s * 4.5);
      const yOsc = oscY - env * combined * Math.cos(s * 18 + errA * 24) * oscAmp;
      const xOsc = g.cx + s * (oscW * 0.5);
      if (k === 0) c2d.moveTo(xOsc, yOsc);
      else c2d.lineTo(xOsc, yOsc);
    }
    c2d.stroke();
    c2d.restore();

    c2d.restore(); // end plate clip

    // Plate Bezel Ring
    const bezelCol = locked ? this.palette.lockHex : this.palette.accentHex;
    drawGlowStroke(
      c2d,
      (ctx) => {
        ctx.arc(g.cx, g.cy, g.plateR, 0, Math.PI * 2);
      },
      bezelCol,
      locked ? 2.2 : 1.5,
      { outerAlpha: locked ? 0.28 : 0.15 }
    );

    // Telemetry header above plate (band + live Visibility V in Cold/Balanced)
    c2d.save();
    c2d.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.textAlign = 'center';
    c2d.fillStyle = locked ? this.palette.lockHex : this.palette.secondaryHex;
    const topTag = this.profile.showNumericDeltas
      ? `${this.variantProfile.bandLabel} · V = ${combined.toFixed(2)} · ΔL = ${(errA * 90).toFixed(1)} μm`
      : `${this.variantProfile.bandLabel} · COHERENCE ${Math.round(combined * 100)}%`;
    c2d.fillText(topTag, g.cx, g.cy - g.plateR - 8);
    c2d.restore();

    // 90° Trombone Optical Delay Rails
    this.drawTromboneRail(
      c2d,
      g.rxLeft,
      g.bsLeft,
      g.cx - g.plateR,
      g.cy,
      g.railTop,
      g.railBot,
      this.delayA,
      this.isAxisALocked(),
      'DELAY A',
      this.getDriftVelocitySign()
    );

    if (this.stage === 3) {
      this.drawTromboneRail(
        c2d,
        g.rxRight,
        g.bsRight,
        g.cx + g.plateR,
        g.cy,
        g.railTop,
        g.railBot,
        this.delayB,
        this.isAxisBLocked(),
        'DELAY B',
        0
      );
    }

    // Bottom Verniers with exact synced lock indicators & real μm OPD units
    const opdA = this.opdMicrons(this.delayA);
    this.stripInputs.length = this.stage === 3 ? 2 : 1;
    this.stripInputs[0] = {
      key: 'a',
      label: 'MIRROR DELAY A',
      val01: this.delayA,
      locked: this.isAxisALocked(),
      rightText: `${opdA >= 0 ? '+' : ''}${opdA.toFixed(1)} μm`,
    };
    if (this.stage === 3) {
      const opdB = this.opdMicrons(this.delayB);
      this.stripInputs[1] = {
        key: 'b',
        label: 'MIRROR DELAY B',
        val01: this.delayB,
        locked: this.isAxisBLocked(),
        rightText: `${opdB >= 0 ? '+' : ''}${opdB.toFixed(1)} μm`,
      };
    }
    layoutVernierRowInto(this.strips, w, h, this.stripInputs, compact ? h - 76 : h - 98);
    for (let i = 0; i < this.strips.length; i++) {
      drawVernierStrip(c2d, this.strips[i], this.palette.accentHex, this.palette.lockHex);
    }

    this.drawSharedOverlays(
      c2d,
      w,
      h,
      this.lockHoldSec > 0.02
        ? {
            cx: g.cx,
            cy: g.cy,
            radius: g.plateR + 10,
            progress01: this.lockHoldSec / this.lockHoldTargetSec,
          }
        : undefined
    );
  }

  protected solveCurrentStage(_stage: 1 | 2 | 3): void {
    this.delayA = this.getEffectiveTargetA();
    this.delayB = this.targetB;
    if (!this.isLockedNow()) {
      throw new Error(`INT-18 stage ${this.stage} fringe lock check failed after solve`);
    }
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'A Michelson stellar interferometer routes light down 90° trombone delay mirrors; equalizing optical path difference (ΔL → 0 μm) brings starlight inside the Gaussian coherence envelope to resolve sub-milliarcsecond structure.',
      goalSummary:
        'Slide the Delay Mirror carriages until noisy fringes coalesce into high-visibility interference rings and resolve the central target.',
      controlsDesktop:
        'Drag the vertical Delay rails (or sliders below); use W/S (or ↑/↓) for Delay A and I/K (or ←/→) for Delay B.',
      controlsTouch:
        'Touch-drag the vertical Delay carriages or slide MIRROR DELAY below.',
      warmthEffect:
        'Warm H% broadens the white-light coherence envelope and harmonic unison synth; Cold H% narrows coherence length and displays μm OPD telemetry.',
    };
  }
}
