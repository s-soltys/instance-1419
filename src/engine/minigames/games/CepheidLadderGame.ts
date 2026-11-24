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
import { drawLimbDarkenedStar, drawOpticalStar, drawSoftDustPuff } from '../render/StarPSFAtlas';
import { clamp, lerp } from '../tactilePhysics';
import type {
  CosmicPlateId,
  InstrumentFieldGuide,
  MinigameVariantSpec,
  SpectralClass,
} from '../types';

interface ReferenceCepheid {
  idx: number;
  periodDays: number;
  freqHz: number;
  phaseOffset: number;
  pitchHz: number;
  baseRadius: number;
  absMagV: number;
  isOvertone: boolean;
  label: string;
  x: number;
  y: number;
  lastCycle: number;
}

interface PulseRingSlot {
  active: boolean;
  x: number;
  y: number;
  age: number;
  color: string;
}

interface CepheidVariantProfile {
  minMpc: number;
  maxMpc: number;
  periods3: readonly [number, number, number];
  periods4: readonly [number, number, number, number];
  dustRange: readonly [number, number];
  hasOvertoneDecoy: boolean;
  galaxyLabel: string;
}

const CEPHEID_VARIANTS: readonly MinigameVariantSpec[] = [
  { index: 0, id: 'cepheid_ladder_v1', label: 'Local Group Rung', plateId: 'whirlpool' },
  { index: 1, id: 'cepheid_ladder_v2', label: 'Virgo / M51 Core', plateId: 'stephans_quintet' },
  { index: 2, id: 'cepheid_ladder_v3', label: 'Dust-Veiled Starburst', plateId: 'cartwheel' },
  { index: 3, id: 'cepheid_ladder_v4', label: 'Overtone Decoy Rung', plateId: 'whirlpool' },
];

const VARIANT_PROFILES: readonly CepheidVariantProfile[] = [
  {
    minMpc: 0.5,
    maxMpc: 6.5,
    periods3: [3.2, 7.8, 18.5],
    periods4: [3.2, 6.1, 11.4, 21.0],
    dustRange: [0.22, 0.55],
    hasOvertoneDecoy: false,
    galaxyLabel: 'M31 / M33',
  },
  {
    minMpc: 4.0,
    maxMpc: 28.0,
    periods3: [5.4, 12.6, 28.0],
    periods4: [5.0, 9.8, 18.4, 34.0],
    dustRange: [0.28, 0.68],
    hasOvertoneDecoy: false,
    galaxyLabel: 'VIRGO / M100',
  },
  {
    minMpc: 10.0,
    maxMpc: 50.0,
    periods3: [8.5, 19.2, 42.0],
    periods4: [7.4, 14.5, 26.8, 46.5],
    dustRange: [0.42, 0.82],
    hasOvertoneDecoy: false,
    galaxyLabel: 'NGC 1309',
  },
  {
    minMpc: 1.2,
    maxMpc: 36.0,
    periods3: [4.2, 10.5, 24.0],
    periods4: [4.0, 8.6, 15.2, 29.0],
    dustRange: [0.3, 0.7],
    hasOvertoneDecoy: true,
    galaxyLabel: 'HORIZON RUNG',
  },
];

const PULSE_POOL_SIZE = 18;
const R_V = 3.1;

/**
 * Asymmetric kappa-mechanism classical Cepheid light curve (fast rise ~26%, slow decline ~74%),
 * contrasted with symmetric sinusoidal 1st-overtone pulsators in Variant 4.
 * Returns normalized flux in [0, 1].
 */
function evalCepheidWave(cycles: number, isOvertone: boolean): number {
  const theta = cycles * Math.PI * 2;
  if (isOvertone) {
    return 0.5 + 0.5 * Math.sin(theta);
  }
  // Fast-rise sawtooth Fourier series calibrated to peak ~1.0, trough ~0.0
  const raw =
    0.58 * Math.sin(theta) +
    0.27 * Math.sin(2 * theta - 0.55) +
    0.11 * Math.sin(3 * theta - 1.15);
  return clamp((raw + 0.82) / 1.66, 0, 1);
}

/**
 * CEP-15 — Cepheid Distance Ladder
 * Match asymmetric kappa-mechanism Cepheid heartbeat sparklines & pulse cadence across
 * curated megaparsec rungs, then flush-match the Split-Mirror Photometer via inverse-square
 * logarithmic distance (Mpc) & signed R_V=3.1 IR de-reddening.
 */
export class CepheidLadderGame extends BaseCosmicMinigame {
  readonly id = 'cepheid_ladder';
  readonly title = 'CEPHEID DISTANCE LADDER';
  readonly subtitle = 'Heartbeat Photometer & Distance Ruler';
  readonly instrumentCode = 'CEP-15';
  readonly platePool: readonly CosmicPlateId[] = ['whirlpool', 'stephans_quintet', 'cartwheel'];
  readonly variants = CEPHEID_VARIANTS;

  private variantProfile: CepheidVariantProfile = VARIANT_PROFILES[0];
  private refs: ReferenceCepheid[] = [];
  private targetRefIdx = 0;
  private selectedRefIdx: number | null = null;
  private hoveredRefIdx: number | null = null;
  private targetDist = 0.62;
  private userDist = 0.22;
  private targetRedden = 0;
  private userRedden = 0;
  private targetLastCycle = -1;
  private pulsePool: PulseRingSlot[] = [];
  private pulseCursor = 0;

  private strips: VernierStripSpec[] = [];
  private stripInputs: VernierItemInput[] = [];
  private activeStripKey: string | null = null;
  private keyboardFocusStrip: 'dist' | 'dust' = 'dist';
  private lastShowcaseSig = '';

  protected onMount(): void {
    this.lockHoldTargetSec = 0.55;
    this.variantProfile = VARIANT_PROFILES[this.iterationIndex % VARIANT_PROFILES.length];
    this.pulsePool = Array.from({ length: PULSE_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      age: 0,
      color: '#ffe6bd',
    }));
  }

  private getActiveTol(): number {
    if (this.profile.vibe === 'warm') return 0.088;
    if (this.profile.vibe === 'cold') return 0.056;
    return 0.072;
  }

  private distMpcFrom01(u: number): number {
    const { minMpc, maxMpc } = this.variantProfile;
    return minMpc * Math.pow(maxMpc / minMpc, clamp(u, 0, 1));
  }

  private ebvFrom01(u: number): number {
    // E(B-V) reddening color excess in magnitudes (0.00 .. 0.90 mag)
    return clamp(u, 0, 1) * 0.9;
  }

  private spawnPulseRing(x: number, y: number, color: string): void {
    const slot = this.pulsePool[this.pulseCursor];
    this.pulseCursor = (this.pulseCursor + 1) % PULSE_POOL_SIZE;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.age = 0;
    slot.color = color;
  }

  protected onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.selectedRefIdx = null;
    this.hoveredRefIdx = null;
    this.activeStripKey = null;
    this.keyboardFocusStrip = 'dist';
    this.targetLastCycle = -1;
    for (let i = 0; i < this.pulsePool.length; i++) {
      this.pulsePool[i].active = false;
    }

    const periods = stage === 1 ? this.variantProfile.periods3 : this.variantProfile.periods4;
    const count = periods.length;
    const minP = periods[0];
    const maxP = periods[count - 1];

    this.refs = periods.map((pDays, idx) => {
      // Logarithmic period-to-visual-frequency mapping: shorter period pulses briskly, longer slowly
      const logFrac =
        Math.log(pDays / minP) / Math.max(0.01, Math.log(maxP / minP));
      const freqHz = lerp(2.15, 0.58, logFrac);
      const pitchHz = lerp(495, 235, logFrac);
      // Leavitt Period-Luminosity Law: M_V = -2.81 * log10(P) - 1.43
      const absMagV = -2.81 * Math.log10(pDays) - 1.43;
      const baseRadius = lerp(9.5, 15.5, logFrac);
      return {
        idx,
        periodDays: pDays,
        freqHz,
        phaseOffset: stage === 1 ? 0 : idx * 0.37 + rng() * 0.42,
        pitchHz,
        baseRadius,
        absMagV,
        isOvertone: false,
        label: `${pDays.toFixed(pDays < 10 ? 1 : 0)}d CEPHEID`,
        x: 0,
        y: 0,
        lastCycle: -1,
      };
    });

    this.targetRefIdx = Math.floor(rng() * this.refs.length);

    // Variant 4 (Overtone Decoy Rung): on Stages 2–3 convert one non-target into a close-period sinusoidal overtone
    if (this.variantProfile.hasOvertoneDecoy && stage >= 2) {
      const decoyIdx = (this.targetRefIdx + 1) % this.refs.length;
      const targetRef = this.refs[this.targetRefIdx];
      const decoy = this.refs[decoyIdx];
      decoy.isOvertone = true;
      decoy.freqHz = clamp(targetRef.freqHz * (rng() > 0.5 ? 1.1 : 0.91), 0.52, 2.35);
      decoy.label = `${decoy.periodDays.toFixed(1)}d 1ST-OVT`;
    }

    this.targetDist = 0.24 + rng() * 0.58;
    this.userDist = this.targetDist > 0.52 ? 0.14 : 0.86;

    if (stage === 3) {
      const [lo, hi] = this.variantProfile.dustRange;
      this.targetRedden = lo + rng() * (hi - lo);
      this.userRedden = this.targetRedden > 0.5 ? 0.08 : 0.9;
    } else {
      this.targetRedden = 0;
      this.userRedden = 0;
    }

    this.syncShowcaseCoupling(true);
  }

  private isDistMatched(): boolean {
    return Math.abs(this.userDist - this.targetDist) <= this.getActiveTol();
  }

  private isReddenMatched(): boolean {
    return this.stage < 3 || Math.abs(this.userRedden - this.targetRedden) <= this.getActiveTol();
  }

  private isMatchNow(): boolean {
    return this.selectedRefIdx === this.targetRefIdx && this.isDistMatched() && this.isReddenMatched();
  }

  private selectReference(idx: number): void {
    if (idx < 0 || idx >= this.refs.length || this.stageClearTimer > 0) return;
    const r = this.refs[idx];
    this.selectedRefIdx = r.idx;
    const ok = r.idx === this.targetRefIdx;
    this.ctx.audio?.playTumblerClick(0.85, ok);
    this.ctx.audio?.playStereoSonarEcho?.((r.x / Math.max(1, this.width)) * 2 - 1, 0.35, r.pitchHz);
    platform.triggerHaptic(ok ? 'phaseSnapLock' : 'rejectThud', ok ? 0.8 : 0.55);
    if (ok) {
      this.particles.emitPhotonSparks(r.x, r.y, 4, 34, this.palette.lockHex);
      this.particles.emitLockCausticRing(r.x, r.y, 18, this.palette.lockHex);
    }
    this.emitHud(true);
  }

  private applyStripValue(strip: VernierStripSpec, px: number): void {
    const targ = strip.key === 'dist' ? this.targetDist : this.targetRedden;
    const magnetTol = 0.055 * this.profile.detentWellScale;
    const v = valueFromStripX(strip, px, targ, magnetTol);
    if (strip.key === 'dist') {
      this.userDist = v;
      this.keyboardFocusStrip = 'dist';
    } else if (strip.key === 'dust') {
      this.userRedden = v;
      this.keyboardFocusStrip = 'dust';
    }
    this.syncShowcaseCoupling(false);
  }

  protected onPointerDown(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;

    for (let i = 0; i < this.strips.length; i++) {
      const s = this.strips[i];
      if (hitVernierStrip(s, ev.x, ev.y)) {
        this.activeStripKey = s.key;
        this.applyStripValue(s, ev.x);
        platform.triggerHaptic('vernierTick', 0.45);
        return;
      }
    }

    let bestRef: ReferenceCepheid | null = null;
    let bestDist = this.compact ? 44 : 50;
    for (let i = 0; i < this.refs.length; i++) {
      const r = this.refs[i];
      const d = Math.hypot(ev.x - r.x, ev.y - r.y);
      if (d < bestDist) {
        bestDist = d;
        bestRef = r;
      }
    }
    if (bestRef) {
      this.selectReference(bestRef.idx);
    }
  }

  protected onPointerMove(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;
    if (this.activeStripKey) {
      const s = this.strips.find((item) => item.key === this.activeStripKey);
      if (s) this.applyStripValue(s, ev.x);
      return;
    }
    // Track subtle hover reticle on reference Cepheids
    let hovered: number | null = null;
    let best = 46;
    for (let i = 0; i < this.refs.length; i++) {
      const d = Math.hypot(ev.x - this.refs[i].x, ev.y - this.refs[i].y);
      if (d < best) {
        best = d;
        hovered = this.refs[i].idx;
      }
    }
    this.hoveredRefIdx = hovered;
  }

  protected onPointerUp(): void {
    this.activeStripKey = null;
  }

  protected onKeyDown(e: KeyboardEvent): void {
    if (this.stageClearTimer > 0) return;

    if (e.key >= '1' && e.key <= '4') {
      const idx = Number(e.key) - 1;
      if (idx < this.refs.length) {
        e.preventDefault();
        this.selectReference(idx);
      }
      return;
    }

    if (this.selectedRefIdx !== this.targetRefIdx) return;

    if (e.key === 'Tab' && this.stage === 3) {
      e.preventDefault();
      this.keyboardFocusStrip = this.keyboardFocusStrip === 'dist' ? 'dust' : 'dist';
      return;
    }

    const step = e.shiftKey ? 0.012 : 0.032;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      if (this.keyboardFocusStrip === 'dust' && this.stage === 3) {
        this.userRedden = clamp(this.userRedden - step, 0, 1);
      } else {
        this.userDist = clamp(this.userDist - step, 0, 1);
      }
      this.syncShowcaseCoupling(false);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      if (this.keyboardFocusStrip === 'dust' && this.stage === 3) {
        this.userRedden = clamp(this.userRedden + step, 0, 1);
      } else {
        this.userDist = clamp(this.userDist + step, 0, 1);
      }
      this.syncShowcaseCoupling(false);
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && this.stage === 3) {
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? 1 : -1;
      this.userRedden = clamp(this.userRedden + dir * step, 0, 1);
      this.keyboardFocusStrip = 'dust';
      this.syncShowcaseCoupling(false);
    }
  }

  private syncShowcaseCoupling(force: boolean): void {
    if (!this.ctx.showcase) return;
    const progress = this.getStageProgress01();
    const dollyDelta = (this.userDist - 0.5) * 0.9;
    const dustPeel = this.stage === 3 ? clamp(this.userRedden / Math.max(0.05, this.targetRedden), 0, 1) : 1;
    const sig = `${Math.round(progress * 40)}:${Math.round(dollyDelta * 40)}:${Math.round(dustPeel * 20)}`;
    if (!force && sig === this.lastShowcaseSig) return;
    this.lastShowcaseSig = sig;
    this.ctx.showcase.applyInstrumentPatch({
      progress,
      dollyDelta,
      dustPeel,
      jetResonance: this.selectedRefIdx === this.targetRefIdx ? 0.65 : 0.25,
    });
  }

  protected onUpdate(dt: number): void {
    const tempoMatched = this.selectedRefIdx === this.targetRefIdx;

    // Update reference & target heartbeat pulse rings (mute noisy target ping during Phase B photometry!)
    for (let i = 0; i < this.refs.length; i++) {
      const r = this.refs[i];
      const cyc = Math.floor(this.elapsedSec * r.freqHz + r.phaseOffset);
      if (cyc > r.lastCycle) {
        r.lastCycle = cyc;
        if (r.x > 0) {
          this.spawnPulseRing(r.x, r.y, this.palette.secondaryHex);
          if (!tempoMatched && this.selectedRefIdx === r.idx) {
            this.ctx.audio?.playStereoSonarEcho?.((r.x / Math.max(1, this.width)) * 2 - 1, 0.42, r.pitchHz);
          }
        }
      }
    }

    const targ = this.refs[this.targetRefIdx];
    const tCyc = Math.floor(this.elapsedSec * targ.freqHz);
    if (tCyc > this.targetLastCycle) {
      this.targetLastCycle = tCyc;
      if (!tempoMatched) {
        this.spawnPulseRing(
          this.width * 0.5,
          this.compact ? this.height * 0.51 : this.height * 0.52,
          this.palette.accentHex
        );
        this.ctx.audio?.playStereoSonarEcho?.(0, 0.52, targ.pitchHz);
      }
    }

    for (let i = 0; i < this.pulsePool.length; i++) {
      const p = this.pulsePool[i];
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= 1.0) p.active = false;
    }

    if (this.stageClearTimer > 0) return;

    if (this.isMatchNow()) {
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        const cx = this.width * 0.5;
        const cy = this.compact ? this.height * 0.51 : this.height * 0.52;
        const dMpc = this.distMpcFrom01(this.targetDist).toFixed(1);
        this.triggerStageClear(
          `CEPHEID RUNG ${this.stage}/3 · ${dMpc} Mpc LOCKED`,
          0.55,
          cx,
          cy
        );
      }
    } else {
      this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.6);
    }
  }

  protected onAllStagesCleared(): void {
    const dMpc = this.distMpcFrom01(this.targetDist).toFixed(1);
    this.finishSuccess({
      accuracy: 0.96,
      proofFragmentSuffix: 'cepheid',
      dossierSnippet: `Period-Luminosity standard candles calibrated (${this.variantProfile.galaxyLabel}, ${dMpc} Mpc) on the Split-Mirror Photometer for ${this.ctx.targetName}.`,
      telemetrySummary: `Distance Rung ${dMpc} Mpc · ${this.elapsedSec.toFixed(1)}s`,
      physicalPrinciple: 'Leavitt Period-Luminosity Law, Kappa-Mechanism Pulsation & Inverse-Square Photometry',
    });
  }

  protected getStageProgress01(): number {
    if (this.completed) return 1;
    const tempoOk = this.selectedRefIdx === this.targetRefIdx;
    const dScore = clamp(1 - Math.abs(this.userDist - this.targetDist) / 0.5, 0, 1);
    const rScore = this.stage === 3 ? clamp(1 - Math.abs(this.userRedden - this.targetRedden) / 0.5, 0, 1) : 1;
    const sub = tempoOk ? 0.45 + (dScore * 0.5 + rScore * 0.5) * 0.55 : 0.12;
    return clamp((this.stage - 1 + sub) / 3, 0, 1);
  }

  protected getPromptText(): string {
    if (this.selectedRefIdx !== this.targetRefIdx) {
      return this.variantProfile.hasOvertoneDecoy && this.stage >= 2
        ? 'Compare sawtooth sparkline shape & beat cadence (avoid smooth sinusoidal overtone) to select the matching Cepheid.'
        : 'Compare the asymmetric Cepheid light-curve sparklines & beat cadence to select the matching Standard Candle above.';
    }
    if (this.stage === 3) {
      return 'Split-Mirror active! Tune DISTANCE (Mpc) & IR DE-REDDENING until Target matches Reference flush in brightness & hue.';
    }
    return 'Split-Mirror active! Slide DISTANCE (Mpc) until the Target half-disk matches the Reference Standard Candle flush.';
  }

  private drawSparkline(
    c2d: CanvasRenderingContext2D,
    cx: number,
    yTop: number,
    freqHz: number,
    phaseOffset: number,
    isOvertone: boolean,
    color: string,
    wSpark: number,
    hSpark: number
  ): void {
    const x0 = cx - wSpark * 0.5;
    c2d.save();
    // Subtle baseline rail
    c2d.strokeStyle = 'rgba(200, 224, 248, 0.14)';
    c2d.lineWidth = 0.8;
    c2d.beginPath();
    c2d.moveTo(x0, yTop + hSpark * 0.5);
    c2d.lineTo(x0 + wSpark, yTop + hSpark * 0.5);
    c2d.stroke();

    c2d.strokeStyle = color;
    c2d.globalAlpha = 0.84;
    c2d.lineWidth = this.compact ? 1.2 : 1.45;
    c2d.beginPath();
    const steps = 26;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const t = this.elapsedSec - (1 - u) * 1.45;
      const val = evalCepheidWave(t * freqHz + phaseOffset, isOvertone);
      const px = x0 + u * wSpark;
      const py = yTop + hSpark - val * hSpark;
      if (i === 0) c2d.moveTo(px, py);
      else c2d.lineTo(px, py);
    }
    c2d.stroke();
    c2d.restore();
  }

  private drawDistanceLadderRail(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    if (w < 600) return;
    const x = this.compact ? 26 : 38;
    const topY = this.compact ? h * 0.34 : h * 0.32;
    const botY = this.compact ? h * 0.68 : h * 0.68;
    const span = botY - topY;
    const curY = lerp(botY, topY, this.userDist);

    c2d.save();
    c2d.strokeStyle = 'rgba(200, 224, 248, 0.22)';
    c2d.lineWidth = 1;
    c2d.beginPath();
    c2d.moveTo(x, topY);
    c2d.lineTo(x, botY);
    for (let i = 0; i <= 4; i++) {
      const ty = lerp(botY, topY, i / 4);
      c2d.moveTo(x - 4, ty);
      c2d.lineTo(x + 4, ty);
    }
    c2d.stroke();

    // Live distance marker bead
    const col = this.isDistMatched() ? this.palette.lockHex : this.palette.accentHex;
    c2d.fillStyle = col;
    c2d.beginPath();
    c2d.arc(x, curY, 3.4, 0, Math.PI * 2);
    c2d.fill();

    c2d.font = '600 8px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.textAlign = 'left';
    c2d.fillStyle = 'rgba(200, 224, 248, 0.56)';
    c2d.fillText(`${this.variantProfile.maxMpc.toFixed(0)} Mpc`, x + 8, topY + 3);
    c2d.fillText(`${this.variantProfile.minMpc.toFixed(1)} Mpc`, x + 8, botY + 3);
    c2d.fillStyle = col;
    c2d.fillText(`${this.distMpcFrom01(this.userDist).toFixed(1)}`, x + 8, clamp(curY + 3, topY + 13, botY - 10));
    void span;
    c2d.restore();
  }

  protected onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const compact = this.compact;
    const cx = w * 0.5;
    const cy = compact ? h * 0.51 : h * 0.52;
    const lensR = compact ? 40 : 62;

    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: 4,
      alpha: 0.44,
      brightness: 0.8,
      tintAlpha: 0.46,
      reticleDuck: { cx, cy, r: lensR + 28 },
    });

    // Expanding pooled pulse rings
    c2d.save();
    for (let i = 0; i < this.pulsePool.length; i++) {
      const pr = this.pulsePool[i];
      if (!pr.active) continue;
      c2d.strokeStyle = pr.color;
      c2d.globalAlpha = clamp((1 - pr.age) * 0.46, 0, 0.5);
      c2d.lineWidth = 1.25;
      c2d.beginPath();
      c2d.arc(pr.x, pr.y, 11 + pr.age * (compact ? 32 : 46), 0, Math.PI * 2);
      c2d.stroke();
    }
    c2d.restore();

    // Top Row: Reference Standard-Candle Cepheids + ALWAYS-VISIBLE Sparklines (including 844x390!)
    const refY = compact ? Math.max(72, h * 0.19) : h * 0.2;
    const spanW = Math.min(w * 0.78, this.refs.length * (compact ? 156 : 184));
    const startX = (w - spanW) * 0.5 + spanW / (this.refs.length * 2);
    const stepX = spanW / this.refs.length;
    const sparkW = compact ? 38 : 58;
    const sparkH = compact ? 10 : 14;

    for (let i = 0; i < this.refs.length; i++) {
      const r = this.refs[i];
      r.x = startX + i * stepX;
      r.y = refY;
      const wave = evalCepheidWave(this.elapsedSec * r.freqHz + r.phaseOffset, r.isOvertone);
      const pulseScale = 0.72 + 0.34 * wave;
      const selected = this.selectedRefIdx === r.idx;
      const hovered = this.hoveredRefIdx === r.idx;
      const isCorrect = r.idx === this.targetRefIdx;
      const col = selected ? (isCorrect ? this.palette.lockHex : '#ff8b5e') : this.palette.secondaryHex;

      // Subtle clickable bracket ring so player immediately sees refs are interactive
      c2d.save();
      c2d.strokeStyle = selected ? col : hovered ? this.palette.accentHex : 'rgba(200, 224, 248, 0.2)';
      c2d.lineWidth = selected ? 1.8 : 1;
      if (!selected && typeof c2d.setLineDash === 'function') c2d.setLineDash([4, 5]);
      c2d.beginPath();
      c2d.arc(r.x, r.y, compact ? 17 : 22, 0, Math.PI * 2);
      c2d.stroke();
      if (typeof c2d.setLineDash === 'function') c2d.setLineDash([]);
      c2d.restore();

      // Photorealistic PSF Cepheid shifting hotter (F) at peak and warmer (K) at trough!
      const starR = clamp(r.baseRadius * (compact ? 0.44 : 0.58) * pulseScale, 3.8, compact ? 8.5 : 11.5);
      const peakCls: SpectralClass = selected ? (isCorrect ? 'LOCK' : 'ALERT') : wave > 0.55 ? 'F' : 'K';
      drawOpticalStar(c2d, r.x, r.y, starR, {
        spectralClass: peakCls,
        spikes: 6,
        alpha: 0.68 + wave * 0.32,
        vibeMode: this.palette.mode,
      });

      // Text label positioned cleanly BELOW spike envelope (zero PSF spike intersection!)
      const labelY = r.y + (compact ? 25 : 33);
      c2d.save();
      c2d.font = compact
        ? '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace'
        : '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = col;
      c2d.textAlign = 'center';
      c2d.fillText(`${i + 1}·${r.label}`, r.x, labelY);
      if (!compact && this.profile.showNumericDeltas) {
        c2d.font = '500 8px ui-monospace, SFMono-Regular, Menlo, monospace';
        c2d.fillStyle = 'rgba(186, 214, 240, 0.62)';
        c2d.fillText(`M=${r.absMagV.toFixed(1)}`, r.x, labelY + 10);
      }
      c2d.restore();

      const sparkTop = labelY + (compact ? 4 : this.profile.showNumericDeltas ? 14 : 6);
      this.drawSparkline(c2d, r.x, sparkTop, r.freqHz, r.phaseOffset, r.isOvertone, col, sparkW, sparkH);
    }

    // Center: Unknown Distant Cepheid -> Split-Mirror Photometer Comparator
    const targ = this.refs[this.targetRefIdx];
    const tWave = evalCepheidWave(this.elapsedSec * targ.freqHz, false);
    const tPulse = 0.72 + 0.34 * tWave;
    const tempoMatched = this.selectedRefIdx === this.targetRefIdx;

    if (tempoMatched) {
      this.drawDistanceLadderRail(c2d, w, h);

      // True inverse-square distance luminosity scaling + signed R_V=3.1 IR de-reddening!
      // Derived luminosity L_derived / L_true = (d_user / d_target)^2 * 10^(-0.4 * R_V * deltaEbv)
      // Visual photosphere radius scales as flux^0.32 -> EXACTLY 1.000 at exact match!
      const dUser = this.distMpcFrom01(this.userDist);
      const dTarg = this.distMpcFrom01(this.targetDist);
      const distFluxRatio = Math.pow(dUser / Math.max(0.05, dTarg), 2);
      const deltaEbv = this.stage === 3 ? this.ebvFrom01(this.targetRedden) - this.ebvFrom01(this.userRedden) : 0;
      // deltaEbv > 0: under-corrected (still reddened & dimmed); deltaEbv < 0: over-corrected (too blue & bright!)
      const dustFluxMul = Math.pow(10, -0.4 * R_V * deltaEbv);
      const combinedScale = clamp(Math.pow(distFluxRatio * dustFluxMul, 0.24), 0.42, 1.58);

      const refDiscR = lensR * (0.44 + 0.12 * tPulse);
      const targDiscR = clamp(refDiscR * combinedScale, 12, lensR * 0.96);

      // Subtle inclined astrometry frame behind split-mirror lens
      drawInclinedAstrometryRing(
        c2d,
        cx,
        cy,
        lensR * 1.24,
        lensR * 0.52,
        -0.18,
        this.palette.accentRgb,
        { backAlpha: 0.08, frontAlpha: 0.18, ticks: 8 }
      );

      // Dark optical comparator interior
      c2d.save();
      c2d.fillStyle = 'rgba(4, 9, 17, 0.84)';
      c2d.beginPath();
      c2d.arc(cx, cy, lensR, 0, Math.PI * 2);
      c2d.fill();
      c2d.restore();

      // LEFT HALF: Reference Standard Candle (intrinsic luminosity)
      c2d.save();
      c2d.beginPath();
      c2d.arc(cx, cy, lensR - 1, Math.PI * 0.5, Math.PI * 1.5);
      c2d.closePath();
      c2d.clip?.();
      drawLimbDarkenedStar(c2d, cx, cy, refDiscR, tWave > 0.55 ? 'F' : 'G', 0.96);
      drawOpticalStar(c2d, cx, cy, refDiscR * 0.42, {
        spectralClass: 'F',
        spikes: 0,
        alpha: 0.42,
        vibeMode: this.palette.mode,
      });
      c2d.restore();

      // RIGHT HALF: Target Galaxy Cepheid reconstructed @ userDist & IR de-reddening
      c2d.save();
      c2d.beginPath();
      c2d.arc(cx, cy, lensR - 1, -Math.PI * 0.5, Math.PI * 0.5);
      c2d.closePath();
      c2d.clip?.();

      // Subtle mottled host-galaxy spiral silhouette scaling inversely with dUser
      const galScale = clamp(lerp(1.05, 0.34, this.userDist), 0.32, 1.1);
      c2d.strokeStyle = 'rgba(188, 220, 248, 0.18)';
      c2d.lineWidth = 1;
      if (typeof c2d.ellipse === 'function') {
        c2d.beginPath();
        c2d.ellipse(cx + 12 * galScale, cy, lensR * 0.72 * galScale, lensR * 0.34 * galScale, 0.35, 0, Math.PI * 2);
        c2d.stroke();
      }

      // Signed spectral tint: under-corrected dust -> warm red/M, flush -> F/G, over-corrected -> cool blue B/O!
      let rightClass: SpectralClass = tWave > 0.55 ? 'F' : 'G';
      if (deltaEbv > 0.08) rightClass = deltaEbv > 0.24 ? 'M' : 'K';
      else if (deltaEbv < -0.08) rightClass = deltaEbv < -0.24 ? 'O' : 'B';

      drawLimbDarkenedStar(c2d, cx, cy, targDiscR, rightClass, 0.96);
      drawOpticalStar(c2d, cx, cy, targDiscR * 0.42, {
        spectralClass: rightClass,
        spikes: 0,
        alpha: 0.42,
        vibeMode: this.palette.mode,
      });

      // Pre-baked translucent dust veil in Stage 3 that thins as under-correction clears
      if (this.stage === 3 && deltaEbv > 0.03) {
        drawSoftDustPuff(c2d, cx + lensR * 0.25, cy, lensR * 0.92, '#4a2114', clamp(deltaEbv * 1.15, 0, 0.68));
      }
      c2d.restore();

      // Machined Zeiss split-prism bezel + degree ticks
      const synced = this.isMatchNow();
      const bezelCol = synced ? this.palette.lockHex : this.palette.accentHex;
      drawGlowStroke(
        c2d,
        (ctx) => {
          ctx.arc(cx, cy, lensR, 0, Math.PI * 2);
        },
        bezelCol,
        synced ? 2.2 : 1.5,
        { outerAlpha: synced ? 0.28 : 0.16 }
      );

      c2d.save();
      // Precision bezel ticks (batched)
      c2d.strokeStyle = 'rgba(220, 236, 250, 0.28)';
      c2d.lineWidth = 1;
      c2d.beginPath();
      for (let t = 0; t < 12; t++) {
        const a = (t / 12) * Math.PI * 2;
        const inner = lensR - (t % 3 === 0 ? 5 : 3);
        c2d.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        c2d.lineTo(cx + Math.cos(a) * lensR, cy + Math.sin(a) * lensR);
      }
      c2d.stroke();

      // Center optical split hairline
      c2d.strokeStyle = synced ? this.palette.lockHex : 'rgba(232, 244, 255, 0.58)';
      if (typeof c2d.setLineDash === 'function') c2d.setLineDash([4, 4]);
      c2d.lineWidth = 1.25;
      c2d.beginPath();
      c2d.moveTo(cx, cy - lensR - 7);
      c2d.lineTo(cx, cy + lensR + 7);
      c2d.stroke();
      if (typeof c2d.setLineDash === 'function') c2d.setLineDash([]);

      c2d.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = this.palette.secondaryHex;
      c2d.textAlign = 'right';
      c2d.fillText('REF CANDLE', cx - 10, cy - lensR - 8);
      c2d.textAlign = 'left';
      c2d.fillText(this.variantProfile.galaxyLabel, cx + 10, cy - lensR - 8);

      // Diagnostic guide synced to EXACT getActiveTol() (eliminates Cold H% green-lock trap!)
      const tol = this.getActiveTol();
      let diagMsg = 'PHOTOMETRIC FLUSH MATCH';
      let diagCol = this.palette.lockHex;
      if (this.stage === 3 && Math.abs(this.userRedden - this.targetRedden) > tol) {
        if (this.userRedden < this.targetRedden - tol) {
          diagMsg = 'DUST REDDENED — INCREASE IR DE-REDDENING';
          diagCol = '#ff9875';
        } else {
          diagMsg = 'OVER-CORRECTED BLUE — EASE IR DE-REDDENING';
          diagCol = '#8ad4ff';
        }
      } else if (this.userDist < this.targetDist - tol) {
        diagMsg = 'DERIVED FLUX TOO DIM — SLIDE FARTHER (+Mpc)';
        diagCol = this.palette.accentHex;
      } else if (this.userDist > this.targetDist + tol) {
        diagMsg = 'DERIVED FLUX TOO BRIGHT — SLIDE CLOSER (-Mpc)';
        diagCol = this.palette.accentHex;
      }

      c2d.textAlign = 'center';
      c2d.fillStyle = diagCol;
      c2d.fillText(diagMsg, cx, cy + lensR + (compact ? 16 : 20));

      // Cold/Balanced numeric distance modulus readout
      if (this.profile.showNumericDeltas && !compact) {
        const mu = 5 * Math.log10(dUser * 1e6) - 5;
        const ebv = this.ebvFrom01(this.userRedden);
        const read =
          this.stage === 3
            ? `μ = ${mu.toFixed(2)} mag · E(B-V) = ${ebv.toFixed(2)} · A_V = ${(ebv * R_V).toFixed(2)}`
            : `μ = m - M = ${mu.toFixed(2)} mag`;
        c2d.fillStyle = 'rgba(186, 224, 248, 0.72)';
        c2d.font = '500 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
        c2d.fillText(read, cx, cy + lensR + 34);
      }
      c2d.restore();
    } else {
      // Phase A: Unknown Distant Cepheid pulsing at center + sparkline safely below PSF spikes
      const targetR = clamp(targ.baseRadius * (compact ? 0.56 : 0.72) * tPulse, 5, compact ? 11 : 14);
      drawOpticalStar(c2d, cx, cy, targetR, {
        spectralClass: tWave > 0.55 ? 'F' : 'K',
        spikes: 6,
        alpha: 0.78 + tWave * 0.22,
        vibeMode: this.palette.mode,
      });

      const labelY = cy + (compact ? 28 : 36);
      c2d.save();
      c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = this.palette.accentHex;
      c2d.textAlign = 'center';
      c2d.fillText(`UNKNOWN CEPHEID · ${this.variantProfile.galaxyLabel}`, cx, labelY);
      c2d.restore();
      this.drawSparkline(c2d, cx, labelY + 6, targ.freqHz, 0, false, this.palette.accentHex, compact ? 52 : 76, compact ? 12 : 16);
    }

    // Bottom Verniers (zero-alloc layoutVernierRowInto, synced exact tolerance!)
    if (tempoMatched) {
      const distMpc = this.distMpcFrom01(this.userDist);
      this.stripInputs.length = this.stage === 3 ? 2 : 1;
      this.stripInputs[0] = {
        key: 'dist',
        label: 'DISTANCE (Mpc)',
        val01: this.userDist,
        locked: this.isDistMatched(),
        rightText: `${distMpc.toFixed(distMpc < 10 ? 2 : 1)} Mpc`,
      };
      if (this.stage === 3) {
        const ebv = this.ebvFrom01(this.userRedden);
        this.stripInputs[1] = {
          key: 'dust',
          label: 'IR DE-REDDENING',
          val01: this.userRedden,
          locked: this.isReddenMatched(),
          rightText: `E(B-V) ${ebv.toFixed(2)}`,
        };
      }
      layoutVernierRowInto(this.strips, w, h, this.stripInputs, compact ? h - 76 : h - 98);
      for (let i = 0; i < this.strips.length; i++) {
        drawVernierStrip(c2d, this.strips[i], this.palette.accentHex, this.palette.lockHex);
      }
    } else {
      this.strips.length = 0;
    }

    this.drawSharedOverlays(
      c2d,
      w,
      h,
      this.lockHoldSec > 0.02
        ? {
            cx,
            cy,
            radius: lensR + 10,
            progress01: this.lockHoldSec / this.lockHoldTargetSec,
          }
        : undefined
    );
  }

  protected solveCurrentStage(_stage: 1 | 2 | 3): void {
    this.selectedRefIdx = this.targetRefIdx;
    this.userDist = this.targetDist;
    this.userRedden = this.targetRedden;
    if (!this.isMatchNow()) {
      throw new Error(`CEP-15 stage ${this.stage} failed match check after solve`);
    }
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Classical Cepheid variables obey Leavitt’s Period–Luminosity Law with sharp fast-rise sawtooth pulsations; matching apparent flux via 1/d² distance scaling & R_V=3.1 IR de-reddening calibrates extragalactic distances.',
      goalSummary:
        'Select the Reference Cepheid sharing the target’s asymmetric heartbeat cadence, then flush-match the Split-Mirror Comparator using Distance (Mpc) and IR De-Reddening.',
      controlsDesktop:
        'Click (or press 1–4) the matching Reference Cepheid above, then drag DISTANCE / IR DE-REDDENING or use Arrow keys.',
      controlsTouch:
        'Tap the matching Cepheid above, then slide DISTANCE (Mpc) and IR DE-REDDENING below.',
      warmthEffect:
        'Warm H% provides wider photometric lock margins and softer pulsation cues; Cold H% tightens megaparsec precision and reveals distance modulus μ.',
    };
  }
}
