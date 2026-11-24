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
import { drawGlowPolylineXY } from '../render/OpticalDrawUtils';
import { drawOpticalStar } from '../render/StarPSFAtlas';
import { clamp, lerp } from '../tactilePhysics';
import type { CosmicPlateId, InstrumentFieldGuide, MinigameVariantSpec } from '../types';

type WaveParamKey = 'phase' | 'freq' | 'amp' | 'harm';

interface WaveVariantProfile {
  harmOrder: 2 | 3;
  harmPhaseOffset: number;
  freqRange: readonly [number, number];
  baseWaveNm: number;
  lineLabel: string;
  travelSpeed: number;
  envelopeDepth: number;
}

const WAVE_STEPS = 112;

function wrap01(v: number): number {
  const m = v % 1;
  return m < 0 ? m + 1 : m;
}

function circularDist01(a: number, b: number): number {
  const d = Math.abs(wrap01(a) - wrap01(b));
  return Math.min(d, 1 - d);
}

function circularLerp01(from: number, to: number, t: number): number {
  let delta = wrap01(to) - wrap01(from);
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  return wrap01(from + delta * t);
}

const VARIANT_PROFILES: readonly WaveVariantProfile[] = [
  {
    harmOrder: 2,
    harmPhaseOffset: 0,
    freqRange: [1.4, 4.2],
    baseWaveNm: 656.3,
    lineLabel: 'H-α 656nm',
    travelSpeed: 2.0,
    envelopeDepth: 0,
  },
  {
    harmOrder: 3,
    harmPhaseOffset: 0,
    freqRange: [1.3, 3.8],
    baseWaveNm: 500.7,
    lineLabel: '[O III] 501nm',
    travelSpeed: 1.85,
    envelopeDepth: 0.26,
  },
  {
    harmOrder: 2,
    harmPhaseOffset: Math.PI * 0.5,
    freqRange: [1.8, 4.6],
    baseWaveNm: 1282,
    lineLabel: 'Pa-β 1282nm',
    travelSpeed: 2.15,
    envelopeDepth: 0.14,
  },
  {
    harmOrder: 2,
    harmPhaseOffset: Math.PI * 0.25,
    freqRange: [2.0, 4.9],
    baseWaveNm: 1644,
    lineLabel: '[Fe II] 1644nm',
    travelSpeed: 2.5,
    envelopeDepth: 0.2,
  },
];

/**
 * WAV-01 — Carina Wave Tuner
 * Nondispersive Fourier waveform superposition matching across 4 curated nebular scenarios.
 * Zero per-frame ctx.filter, zero shadowBlur, zero per-frame polyline GC allocations.
 */
export class WaveShaperGame extends BaseCosmicMinigame {
  readonly id = 'wave_shaper';
  readonly title = 'CARINA WAVE TUNER';
  readonly subtitle = 'Harmonic Waveform Shaping';
  readonly instrumentCode = 'WAV-01';

  readonly platePool: readonly CosmicPlateId[] = ['carina', 'tarantula', 'rho_ophiuchi'];
  readonly variants: readonly MinigameVariantSpec[] = [
    { index: 0, id: 'wave_shaper_v1', label: 'Carina H-Alpha Cliff', plateId: 'carina', scenarioTag: 'h_alpha' },
    { index: 1, id: 'wave_shaper_v2', label: 'Tarantula O-III Ridge', plateId: 'tarantula', scenarioTag: 'o_iii' },
    { index: 2, id: 'wave_shaper_v3', label: 'Rho Ophiuchi Dust Echo', plateId: 'rho_ophiuchi', scenarioTag: 'dust_echo' },
    { index: 3, id: 'wave_shaper_v4', label: 'Deep Harmonic Cavity', plateId: 'carina', scenarioTag: 'cavity_beat' },
  ];

  private variantCfg: WaveVariantProfile = VARIANT_PROFILES[0];

  private userPhase = 0.2;
  private userFreq = 0.25;
  private userAmp = 0.64;
  private userHarm = 0;

  private targetPhase = 0.68;
  private targetFreq = 0.58;
  private targetAmp = 0.64;
  private targetHarm = 0;

  private activeDrag: 'wave' | WaveParamKey | null = null;
  private selectedStripIdx = -1; // -1 = direct arrows (L/R Phase, U/D Freq); >=0 = selected strip
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartPhase = 0;
  private dragStartFreq = 0;
  private lastDragBadgeAlpha = 0;

  private readonly activeStrips: VernierStripSpec[] = [];
  private readonly stripInputs: VernierItemInput[] = [];
  private readonly targetXY = new Float32Array((WAVE_STEPS + 1) * 2);
  private readonly userXY = new Float32Array((WAVE_STEPS + 1) * 2);
  private readonly ghostXY = new Float32Array((WAVE_STEPS + 1) * 2);

  private currentMatch = 0;
  private prevMatch01 = 0;
  private lastTickAt = 0;
  private shimmerCooldown = 0;
  private accSum = 0;
  private accCount = 0;

  protected override onMount(): void {
    this.lockHoldTargetSec = 0.5;
    this.variantCfg = VARIANT_PROFILES[this.iterationIndex % VARIANT_PROFILES.length];
    this.accSum = 0;
    this.accCount = 0;
    this.lastTickAt = 0;
    this.prevMatch01 = 0;
    this.selectedStripIdx = -1;
  }

  protected override onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.activeDrag = null;
    this.selectedStripIdx = -1;
    this.shimmerCooldown = 0;

    this.targetPhase = 0.16 + rng() * 0.68;
    this.targetFreq = 0.24 + rng() * 0.54;
    this.targetAmp = stage === 1 ? 0.64 : 0.34 + rng() * 0.48;
    this.targetHarm = stage < 3 ? 0 : 0.38 + rng() * 0.46;

    // Guarantee meaningful initial offset so no stage starts near-solved
    const phaseShift = 0.34 + rng() * 0.18;
    this.userPhase = wrap01(this.targetPhase + (rng() > 0.5 ? phaseShift : -phaseShift));
    this.userFreq = clamp(
      this.targetFreq > 0.5 ? this.targetFreq - (0.3 + rng() * 0.12) : this.targetFreq + (0.3 + rng() * 0.12),
      0.08,
      0.92
    );
    this.userAmp =
      stage === 1
        ? this.targetAmp
        : this.targetAmp > 0.56
        ? 0.22 + rng() * 0.12
        : 0.78 + rng() * 0.1;
    this.userHarm = stage < 3 ? 0 : this.targetHarm > 0.56 ? 0.12 : 0.88;

    this.currentMatch = this.computeMatch01();
    this.prevMatch01 = this.currentMatch;
  }

  /**
   * Nondispersive Fourier waveform evaluation.
   * `evalForScore = true` omits time-varying visual breath/wobble so match scoring never jitters.
   */
  private sampleWave(
    u: number,
    phase01: number,
    freq01: number,
    amp01: number,
    harm01: number,
    travelOffset: number,
    wobbleStrength: number,
    evalForScore: boolean
  ): number {
    const cfg = this.variantCfg;
    const cycles = lerp(cfg.freqRange[0], cfg.freqRange[1], freq01);
    const phi = wrap01(phase01) * Math.PI * 2 - Math.PI;
    const baseArg = u * Math.PI * 2 * cycles - travelOffset + phi;

    // Optional soft Gaussian wave-packet envelope for ridge/cavity variants
    let env = 1;
    if (cfg.envelopeDepth > 0) {
      const centered = (u - 0.5) * 2;
      env = 1 - cfg.envelopeDepth * centered * centered;
    }

    const breath = evalForScore ? 1 : 1 + 0.025 * Math.sin(this.elapsedSec * 1.7 + u * 2.1);
    const amp = lerp(0.28, 0.92, amp01) * env * breath;
    let val = amp * Math.sin(baseArg);

    if (this.stage >= 3 && harm01 > 0.001) {
      const hAmp = harm01 * 0.45 * env;
      // Nondispersive harmonic: baseArg * harmOrder keeps phase velocity identical to fundamental
      val += hAmp * Math.sin(baseArg * cfg.harmOrder + cfg.harmPhaseOffset);
    }

    if (!evalForScore && wobbleStrength > 0.005) {
      val +=
        wobbleStrength *
        (0.095 * Math.sin(u * 26 + this.elapsedSec * 9.2) +
          0.05 * Math.cos(u * 41 - this.elapsedSec * 12.6));
    }
    return clamp(val, -1.25, 1.25);
  }

  private getLockThreshold(): number {
    const base = this.stage === 1 ? 0.82 : this.stage === 2 ? 0.8 : 0.78;
    if (this.profile.vibe === 'warm') return base - 0.02;
    if (this.profile.vibe === 'cold') return base + 0.02;
    return base;
  }

  private getRmsTolerance(): number {
    // Warm H% = generous amber resonance margin; Cold H% = tighter surgical tolerance
    const vibeTol =
      this.profile.vibe === 'warm' ? 0.62 : this.profile.vibe === 'cold' ? 0.48 : 0.55;
    // Slight fidelity grace without inverting H%
    return vibeTol + (1 - this.ctx.state.opticalFidelity) * 0.03;
  }

  private computeMatch01(): number {
    const samples = 48;
    let errSq = 0;
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const yT = this.sampleWave(u, this.targetPhase, this.targetFreq, this.targetAmp, this.targetHarm, 0, 0, true);
      const yU = this.sampleWave(u, this.userPhase, this.userFreq, this.userAmp, this.userHarm, 0, 0, true);
      const d = yT - yU;
      errSq += d * d;
    }
    const rms = Math.sqrt(errSq / (samples + 1));
    return clamp(1 - rms / this.getRmsTolerance(), 0, 1);
  }

  private getStripKeys(): WaveParamKey[] {
    if (this.stage === 1) return ['phase', 'freq'];
    if (this.stage === 2) return ['phase', 'freq', 'amp'];
    return ['phase', 'freq', 'amp', 'harm'];
  }

  private isParamLocked(key: WaveParamKey): boolean {
    const mode = this.profile.vibe;
    if (key === 'phase') {
      const tol = mode === 'warm' ? 0.034 : mode === 'cold' ? 0.02 : 0.026;
      return circularDist01(this.userPhase, this.targetPhase) <= tol;
    }
    if (key === 'freq') {
      const tol = mode === 'warm' ? 0.038 : mode === 'cold' ? 0.022 : 0.03;
      return Math.abs(this.userFreq - this.targetFreq) <= tol;
    }
    if (key === 'amp') {
      const tol = mode === 'warm' ? 0.055 : mode === 'cold' ? 0.034 : 0.044;
      return Math.abs(this.userAmp - this.targetAmp) <= tol;
    }
    const tol = mode === 'warm' ? 0.065 : mode === 'cold' ? 0.04 : 0.052;
    return Math.abs(this.userHarm - this.targetHarm) <= tol;
  }

  private applyStripValue(strip: VernierStripSpec, px: number): void {
    const magnetTol = 0.055 * this.profile.detentWellScale;
    const key = strip.key as WaveParamKey;
    if (key === 'phase') {
      const raw = clamp((px - strip.x) / Math.max(1, strip.w), 0, 1);
      const d = circularDist01(raw, this.targetPhase);
      this.userPhase = d < magnetTol ? circularLerp01(raw, this.targetPhase, 0.45) : wrap01(raw);
    } else if (key === 'freq') {
      this.userFreq = valueFromStripX(strip, px, this.targetFreq, magnetTol);
    } else if (key === 'amp') {
      this.userAmp = valueFromStripX(strip, px, this.targetAmp, magnetTol);
    } else if (key === 'harm') {
      this.userHarm = valueFromStripX(strip, px, this.targetHarm, magnetTol);
    }
  }

  protected override onPointerDown(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;
    for (let i = 0; i < this.activeStrips.length; i++) {
      const s = this.activeStrips[i];
      if (hitVernierStrip(s, ev.x, ev.y)) {
        this.activeDrag = s.key as WaveParamKey;
        this.selectedStripIdx = i;
        this.applyStripValue(s, ev.x);
        platform.triggerHaptic('vernierTick', 0.45);
        return;
      }
    }

    this.activeDrag = 'wave';
    this.dragStartX = ev.x;
    this.dragStartY = ev.y;
    this.dragStartPhase = this.userPhase;
    this.dragStartFreq = this.userFreq;
    this.lastDragBadgeAlpha = 1;
  }

  protected override onPointerMove(ev: PointerLocalEvent): void {
    if (!this.activeDrag || this.stageClearTimer > 0) return;
    if (this.activeDrag !== 'wave') {
      for (let i = 0; i < this.activeStrips.length; i++) {
        if (this.activeStrips[i].key === this.activeDrag) {
          this.applyStripValue(this.activeStrips[i], ev.x);
          return;
        }
      }
      return;
    }

    this.lastDragBadgeAlpha = 1;
    const dx = (ev.x - this.dragStartX) / Math.max(170, ev.w * 0.46);
    const dy = (this.dragStartY - ev.y) / Math.max(130, ev.h * 0.4);
    const magnetTol = 0.055 * this.profile.detentWellScale;

    let nextPhase = wrap01(this.dragStartPhase + dx);
    if (circularDist01(nextPhase, this.targetPhase) < magnetTol) {
      nextPhase = circularLerp01(nextPhase, this.targetPhase, 0.38);
    }
    this.userPhase = nextPhase;

    let nextFreq = clamp(this.dragStartFreq + dy, 0, 1);
    if (Math.abs(nextFreq - this.targetFreq) < magnetTol) {
      nextFreq = lerp(nextFreq, this.targetFreq, 0.38);
    }
    this.userFreq = nextFreq;
  }

  protected override onPointerUp(): void {
    this.activeDrag = null;
  }

  protected override onKeyDown(e: KeyboardEvent): void {
    if (this.stageClearTimer > 0) return;
    const keys = this.getStripKeys();

    if (e.key === 'Tab') {
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      this.selectedStripIdx = (this.selectedStripIdx + dir + keys.length) % keys.length;
      platform.triggerHaptic('vernierTick', 0.35);
      return;
    }
    if (e.key >= '1' && e.key <= '4') {
      const idx = Number(e.key) - 1;
      if (idx < keys.length) {
        this.selectedStripIdx = idx;
        platform.triggerHaptic('vernierTick', 0.35);
      }
      return;
    }

    const step = e.shiftKey ? 0.012 : 0.03;
    const adjustParam = (param: WaveParamKey, delta: number) => {
      if (param === 'phase') this.userPhase = wrap01(this.userPhase + delta);
      else if (param === 'freq') this.userFreq = clamp(this.userFreq + delta, 0, 1);
      else if (param === 'amp') this.userAmp = clamp(this.userAmp + delta, 0, 1);
      else if (param === 'harm') this.userHarm = clamp(this.userHarm + delta, 0, 1);
    };

    if (this.selectedStripIdx >= 0 && this.selectedStripIdx < keys.length) {
      const param = keys[this.selectedStripIdx];
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        adjustParam(param, -step);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        adjustParam(param, step);
      }
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      adjustParam('phase', -step);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      adjustParam('phase', step);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      adjustParam('freq', step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      adjustParam('freq', -step);
    }
  }

  protected override onUpdate(dt: number): void {
    this.lastDragBadgeAlpha = Math.max(0, this.lastDragBadgeAlpha - dt * 1.8);
    this.shimmerCooldown = Math.max(0, this.shimmerCooldown - dt);

    const match = this.computeMatch01();
    this.currentMatch = match;
    this.accSum += match;
    this.accCount += 1;

    if (match > 0.76 && this.elapsedSec - this.lastTickAt > 0.16 && Math.abs(match - this.prevMatch01) > 0.012) {
      this.lastTickAt = this.elapsedSec;
      this.ctx.audio?.playProximityTick?.(match);
      platform.triggerHaptic('proximityPulse', match * 0.55);
    }
    this.prevMatch01 = match;

    const beatHz = (1 - match) * 10.2;
    this.ctx.audio?.updateBeatSynth({
      beatHz,
      harmonicLock: match,
      warmth: this.profile.harmonicWarmthGain,
      strain: 0,
    });

    this.ctx.showcase?.applyInstrumentPatch({
      progress: (this.stage - 1 + match) / 3,
      dustPeel: match,
      jetResonance: match,
      humanity: this.ctx.state.humanity,
    });

    // Restrained spectral shimmer particles along the wave as resonance builds
    if (this.shimmerCooldown <= 0 && match > 0.55) {
      this.shimmerCooldown = 0.24;
      const waveLeft = this.width * 0.11;
      const waveW = this.width * 0.78;
      const waveCy = this.compact ? this.height * 0.38 : this.height * 0.44;
      const u = (this.elapsedSec * 0.37) % 1;
      const y =
        waveCy -
        this.sampleWave(u, this.userPhase, this.userFreq, this.userAmp, this.userHarm, this.elapsedSec * this.variantCfg.travelSpeed, 0, false) *
          (this.compact ? this.height * 0.145 : this.height * 0.185);
      this.particles.emitSpectralShimmer(waveLeft + u * waveW, y, match, 1);
    }

    if (this.stageClearTimer > 0) return;

    const lockThreshold = this.getLockThreshold();
    if (match >= lockThreshold) {
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        const waveCy = this.compact ? this.height * 0.38 : this.height * 0.44;
        this.particles.emitPhotonSparks(this.width * 0.5, waveCy, 5, 52, this.palette.lockHex);
        this.triggerStageClear(
          this.stage === 3 ? 'HARMONIC SPECTRUM LOCKED' : `STAGE ${this.stage}/3 HARMONIC LOCKED`,
          this.stage === 3 ? 0 : 0.42,
          this.width * 0.5,
          waveCy
        );
      }
    } else {
      this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.6);
    }
  }

  protected override onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const match = this.currentMatch;
    const overallClr = clamp((this.stage - 1) * 0.22 + match * 0.78, 0, 1);
    const waveCy = this.compact ? h * 0.38 : h * 0.44;
    const waveAmpPx = this.compact ? h * 0.145 : h * 0.185;
    const waveLeft = w * 0.11;
    const waveRight = w * 0.89;
    const waveW = waveRight - waveLeft;

    const reactivePulse = 0.012 * match * Math.sin(this.elapsedSec * 2.1);
    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: lerp(11, 0, overallClr),
      alpha: lerp(0.54, 0.94, overallClr),
      brightness: lerp(0.68, 1.15, overallClr) + match * 0.05 * Math.sin(this.elapsedSec * 2.4),
      scale: lerp(1.08, 1.02, overallClr) + reactivePulse,
      tintAlpha: lerp(0.46, 0.18, overallClr),
      starOpacity: 0.72 + match * 0.26,
      reticleDuck: { cx: w * 0.5, cy: waveCy, r: waveAmpPx * 1.25 },
    });

    const travel = this.elapsedSec * this.variantCfg.travelSpeed;
    const fidelityJitter = this.profile.jitterAmplitude * 0.035;
    const wobble = clamp((1 - match) * 1.1 + fidelityJitter, 0, 1.1);

    for (let i = 0; i <= WAVE_STEPS; i++) {
      const u = i / WAVE_STEPS;
      const x = waveLeft + u * waveW;
      const yt =
        waveCy -
        this.sampleWave(u, this.targetPhase, this.targetFreq, this.targetAmp, this.targetHarm, travel, 0, false) *
          waveAmpPx;
      const yu =
        waveCy -
        this.sampleWave(u, this.userPhase, this.userFreq, this.userAmp, this.userHarm, travel, wobble, false) *
          waveAmpPx;
      const idx = i * 2;
      this.targetXY[idx] = x;
      this.targetXY[idx + 1] = yt;
      this.userXY[idx] = x;
      this.userXY[idx + 1] = yu;
      this.ghostXY[idx] = x;
      this.ghostXY[idx + 1] = yu + Math.sin(u * 20 - this.elapsedSec * 6.5) * 6.5 * wobble;
    }

    // Optical baseline axis + subtle spectral line badge
    c2d.save();
    c2d.strokeStyle =
      this.palette.mode === 'cold' ? 'rgba(158, 232, 255, 0.24)' : 'rgba(200, 224, 248, 0.18)';
    c2d.lineWidth = 1;
    c2d.setLineDash([4, 6]);
    c2d.beginPath();
    c2d.moveTo(waveLeft, waveCy);
    c2d.lineTo(waveRight, waveCy);
    c2d.stroke();
    c2d.setLineDash([]);

    // Vertical oscilloscope phase graticule ticks in Cold mode or when near lock
    if (this.palette.mode === 'cold' || match > 0.72) {
      const tickAlpha = this.palette.mode === 'cold' ? 0.18 : (match - 0.72) * 0.55;
      c2d.strokeStyle = `rgba(${this.palette.accentRgb}, ${tickAlpha.toFixed(3)})`;
      c2d.beginPath();
      const divs = 8;
      for (let d = 0; d <= divs; d++) {
        const tx = waveLeft + (d / divs) * waveW;
        const half = d % 2 === 0 ? 7 : 4;
        c2d.moveTo(tx, waveCy - half);
        c2d.lineTo(tx, waveCy + half);
      }
      c2d.stroke();
    }

    // Subtle astrophysical emission line tag + numeric residual in Cold/Balanced mode
    c2d.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = `rgba(${this.palette.secondaryRgb}, 0.78)`;
    c2d.textAlign = 'left';
    c2d.fillText(
      `FTS · ${this.variantCfg.lineLabel}`,
      waveLeft,
      waveCy - waveAmpPx - (this.compact ? 8 : 14)
    );
    if (this.profile.showNumericDeltas) {
      const dPhiDeg = Math.round(circularDist01(this.userPhase, this.targetPhase) * 360);
      const dNu = Math.abs(this.userFreq - this.targetFreq) * (this.variantCfg.freqRange[1] - this.variantCfg.freqRange[0]);
      c2d.textAlign = 'right';
      c2d.fillStyle = match >= this.getLockThreshold() ? this.palette.lockHex : this.palette.accentHex;
      c2d.fillText(
        `Δφ ${dPhiDeg}° · Δk ${dNu.toFixed(2)}`,
        waveRight,
        waveCy - waveAmpPx - (this.compact ? 8 : 14)
      );
    }
    c2d.restore();

    // Translucent interference ribbon between mismatched waves
    if (match < 0.92) {
      c2d.save();
      c2d.beginPath();
      c2d.moveTo(this.targetXY[0], this.targetXY[1]);
      for (let i = 1; i <= WAVE_STEPS; i++) {
        c2d.lineTo(this.targetXY[i * 2], this.targetXY[i * 2 + 1]);
      }
      for (let i = WAVE_STEPS; i >= 0; i--) {
        c2d.lineTo(this.userXY[i * 2], this.userXY[i * 2 + 1]);
      }
      c2d.closePath();
      c2d.fillStyle = `rgba(${this.palette.accentRgb}, ${(0.11 * (1 - match)).toFixed(3)})`;
      c2d.fill();
      c2d.restore();
    }

    // Target traveling wave (dashed luminous reference)
    c2d.save();
    c2d.strokeStyle = `rgba(255, 255, 255, ${(0.42 + match * 0.24).toFixed(2)})`;
    c2d.lineWidth = 2;
    c2d.setLineDash([7, 6]);
    c2d.beginPath();
    c2d.moveTo(this.targetXY[0], this.targetXY[1]);
    for (let i = 1; i <= WAVE_STEPS; i++) {
      c2d.lineTo(this.targetXY[i * 2], this.targetXY[i * 2 + 1]);
    }
    c2d.stroke();
    c2d.restore();

    // Chromatic ghost echo when misaligned
    if (wobble > 0.14) {
      c2d.save();
      c2d.strokeStyle = `rgba(255, 118, 92, ${(0.24 * Math.min(1, wobble)).toFixed(2)})`;
      c2d.lineWidth = 1.4;
      c2d.beginPath();
      c2d.moveTo(this.ghostXY[0], this.ghostXY[1]);
      for (let i = 1; i <= WAVE_STEPS; i++) {
        c2d.lineTo(this.ghostXY[i * 2], this.ghostXY[i * 2 + 1]);
      }
      c2d.stroke();
      c2d.restore();
    }

    // Player live wave via 2-pass optical bloom (ZERO shadowBlur!)
    const waveColor = match >= this.getLockThreshold() ? this.palette.lockHex : this.palette.accentHex;
    drawGlowPolylineXY(c2d, this.userXY, WAVE_STEPS + 1, waveColor, 2.7, {
      outerWidthMul: lerp(2.6, 3.6, match),
      outerAlpha: lerp(0.18, 0.34, match),
      coreAlpha: 0.96,
    });

    // Flowing photon wave-packets along curve using pre-rendered PSF sprite (zero gradients)
    const moteCount = 6;
    for (let m = 0; m < moteCount; m++) {
      const u = (this.elapsedSec * (0.26 + match * 0.22) + m / moteCount) % 1;
      const idx = Math.min(WAVE_STEPS, Math.floor(u * WAVE_STEPS)) * 2;
      drawOpticalStar(c2d, this.userXY[idx], this.userXY[idx + 1], 2.2 + match * 1.4, {
        colorHex: match >= 0.84 ? this.palette.lockHex : waveColor,
        spikes: 0,
        alpha: 0.55 + match * 0.4,
        vibeMode: this.palette.mode,
      });
    }

    // Subtle canvas-drag Δφ/Δν affordance badge
    if (this.lastDragBadgeAlpha > 0.02) {
      c2d.save();
      c2d.globalAlpha = this.lastDragBadgeAlpha * 0.8;
      c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = this.palette.secondaryHex;
      c2d.textAlign = 'center';
      c2d.fillText('← PHASE φ →   ↑ WAVENUMBER k ↓', w * 0.5, waveCy + waveAmpPx + (this.compact ? 14 : 20));
      c2d.restore();
    }

    // Build hairline FTS vernier controls into reusable arrays (0 per-frame allocations)
    const phaseDeg = Math.round(this.userPhase * 360 - 180);
    const freqVal = lerp(this.variantCfg.freqRange[0], this.variantCfg.freqRange[1], this.userFreq);
    const fluxMjy = Math.round(lerp(18, 96, this.userAmp));
    const harmLabel = `${this.variantCfg.harmOrder}X OVERTONE`;

    let count = 2;
    this.setStripInput(0, 'phase', 'PHASE φ', this.userPhase, `${phaseDeg >= 0 ? '+' : ''}${phaseDeg}°`);
    this.setStripInput(1, 'freq', 'WAVENUMBER k', this.userFreq, `${freqVal.toFixed(1)}×`);
    if (this.stage >= 2) {
      this.setStripInput(2, 'amp', 'FLUX AMP', this.userAmp, `${fluxMjy} mJy`);
      count = 3;
    }
    if (this.stage >= 3) {
      this.setStripInput(3, 'harm', harmLabel, this.userHarm, `c${this.variantCfg.harmOrder} ${(this.userHarm * 0.45).toFixed(2)}`);
      count = 4;
    }
    this.stripInputs.length = count;

    // Safe vertical position well above bottom console on 844x390
    const stripY = this.compact ? h - 94 : h - 104;
    layoutVernierRowInto(this.activeStrips, w, h, this.stripInputs, stripY);

    for (let i = 0; i < this.activeStrips.length; i++) {
      const s = this.activeStrips[i];
      drawVernierStrip(c2d, s, waveColor, this.palette.lockHex);
      if (i === this.selectedStripIdx) {
        c2d.save();
        c2d.strokeStyle = this.palette.secondaryHex;
        c2d.globalAlpha = 0.55;
        c2d.lineWidth = 1;
        c2d.strokeRect(s.x - 5, s.y - 17, s.w + 10, 32);
        c2d.restore();
      }
    }

    this.drawSharedOverlays(
      c2d,
      w,
      h,
      this.lockHoldSec > 0.02
        ? {
            cx: w * 0.5,
            cy: waveCy,
            radius: this.compact ? 36 : 50,
            progress01: this.lockHoldSec / this.lockHoldTargetSec,
            label: `LOCKING ${Math.round((this.lockHoldSec / this.lockHoldTargetSec) * 100)}%`,
          }
        : undefined
    );
  }

  private setStripInput(
    idx: number,
    key: WaveParamKey,
    label: string,
    val01: number,
    rightText: string
  ): void {
    const locked = this.isParamLocked(key);
    const existing = this.stripInputs[idx];
    if (existing) {
      existing.key = key;
      existing.label = label;
      existing.val01 = val01;
      existing.locked = locked;
      existing.rightText = rightText;
    } else {
      this.stripInputs[idx] = { key, label, val01, locked, rightText };
    }
  }

  protected override getStageProgress01(): number {
    return clamp((this.stage - 1 + this.currentMatch) / 3, 0, 1);
  }

  protected override getPromptText(): string {
    if (this.stage === 1) {
      return `Match ${this.variantCfg.lineLabel} phase & wavenumber — calm interference wobble to clarify the nebula.`;
    }
    if (this.stage === 2) {
      return 'Tune Flux Amplitude together with Phase & Wavenumber until the lock ring completes.';
    }
    return `Dial in the ${this.variantCfg.harmOrder}× Fourier overtone with Phase, Wavenumber & Flux to lock resonance.`;
  }

  protected override solveCurrentStage(_stage: 1 | 2 | 3): void {
    this.userPhase = this.targetPhase;
    this.userFreq = this.targetFreq;
    this.userAmp = this.targetAmp;
    this.userHarm = this.targetHarm;
    this.currentMatch = this.computeMatch01();
  }

  protected override verifySolved(): boolean {
    return this.currentMatch >= this.getLockThreshold();
  }

  protected override onAllStagesCleared(): void {
    const avgAcc = clamp(this.accCount > 0 ? this.accSum / this.accCount : 0.94, 0.74, 1.0);
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.finishSuccess({
      accuracy: avgAcc,
      proofFragmentSuffix: 'wave',
      dossierSnippet: `Resonant ${this.variantCfg.lineLabel} emission waveform locked across 3 stages on ${this.ctx.targetName}.`,
      telemetrySummary: `${this.activeVariant?.label ?? 'Wave'} · Match ${(avgAcc * 100).toFixed(0)}% · ${totalSec.toFixed(1)}s`,
      physicalPrinciple: 'Fourier Transform Spectroscopy & Nondispersive Harmonic Wave Superposition',
    });
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Fourier-transform spectroscopy decomposes nebular emission into coherent wave modes: wavenumber k sets spatial frequency, φ aligns interference phase, and higher harmonics shape ionized ridges.',
      goalSummary:
        'Match the dashed emission reference across 3 stages (Phase+Wavenumber → +Flux Amplitude → +Harmonic Overtone) until resonance locks.',
      controlsDesktop: 'Drag directly on the wave (X=Phase, Y=Wavenumber) or drag strips below; Tab/1–4 + Arrows fine-tune every strip.',
      controlsTouch: 'Touch and drag directly on the wave or hairline vernier strips below.',
      warmthEffect: 'Warm H% widens amber resonance wells; Cold H% tightens tolerances and reveals live Δφ/Δk residuals.',
    };
  }
}
