import balance from '../../content/balance.json';
import {
  CognitiveInstrumentProfile,
  MinigameGrade,
  MinigameResult,
  MinigameStateVector,
  UnifiedVibeTheme,
  VibeMode,
} from './types';

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

export function wrapAngleRad(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function angleDiffRad(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/**
 * Deterministic seeded PRNG (Mulberry32) so every target produces consistent physical layout
 * per shift/state without feeling random or chaotic.
 */
export function createSeededRng(seedStr: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function resolveVibeMode(humanity: number): VibeMode {
  const th = balance.minigames.vibeThresholds;
  if (humanity >= th.warmMinH) return 'warm';
  if (humanity <= th.coldMaxH) return 'cold';
  return 'balanced';
}

export function getUnifiedVibeTheme(humanity: number): UnifiedVibeTheme {
  const mode = resolveVibeMode(humanity);
  if (mode === 'warm') {
    return {
      mode: 'warm',
      label: 'WARM HARMONIC',
      subtitle: 'Broad Amber Detents · Intuitive Acoustic Lock · High Pareidolia',
      accentHex: '#ffb86c',
      accentRgb: '255, 184, 108',
      secondaryHex: '#ffdf9e',
      secondaryRgb: '255, 223, 158',
      dangerHex: '#ff6b6b',
      bgTintRgba: 'rgba(34, 20, 10, 0.14)',
      gridAlpha: 0.14,
      glowBlurPx: 14,
      reticleStyle: 'organic_amber',
      requiresRawResidual: false,
    };
  }
  if (mode === 'cold') {
    return {
      mode: 'cold',
      label: 'SURGICAL COLD',
      subtitle: 'Razor Millimeter Detents · Numeric Deltas · [R] RAW Residual Required',
      accentHex: '#9ee8ff',
      accentRgb: '158, 232, 255',
      secondaryHex: '#e6f7ff',
      secondaryRgb: '230, 247, 255',
      dangerHex: '#ff5268',
      bgTintRgba: 'rgba(6, 18, 28, 0.22)',
      gridAlpha: 0.34,
      glowBlurPx: 4,
      reticleStyle: 'surgical_cyan',
      requiresRawResidual: true,
    };
  }
  return {
    mode: 'balanced',
    label: 'DUAL-LATTICE',
    subtitle: 'Balanced Aperture · Adaptive Detents · Pareidolia Moderate',
    accentHex: '#d9cc9e',
    accentRgb: '217, 204, 158',
    secondaryHex: '#9cc8ff',
    secondaryRgb: '156, 200, 255',
    dangerHex: '#ff6464',
    bgTintRgba: 'rgba(14, 18, 24, 0.16)',
    gridAlpha: 0.22,
    glowBlurPx: 9,
    reticleStyle: 'hybrid_slate',
    requiresRawResidual: false,
  };
}

/**
 * Translates all 8 live GameState inputs into one unified instrument physics & vibe contract
 * so every minigame degrades and rewards symmetrically as Humanity/Fidelity/Chaos change.
 */
export function computeInstrumentProfile(state: MinigameStateVector): CognitiveInstrumentProfile {
  const theme = getUnifiedVibeTheme(state.humanity);
  const fidelity = clamp(state.opticalFidelity, 0.3, 1.0);
  const chaosNorm = clamp(state.chaosDrift / 100, 0, 1);
  const siblingLowBoost = state.primarySiblingH < 45 ? 0.12 : 0;

  const detentWellScale =
    theme.mode === 'warm' ? 1.35 : theme.mode === 'cold' ? 0.72 : 1.0;
  const snapPrecisionMul =
    theme.mode === 'warm' ? 0.88 : theme.mode === 'cold' ? 1.28 : 1.0;

  const basePareidolia = clamp(chaosNorm * 0.58 + siblingLowBoost, 0.04, 0.65);
  const pareidoliaChance = theme.mode === 'cold' ? basePareidolia * 0.42 : basePareidolia;

  return {
    vibe: theme.mode,
    theme,
    detentWellScale,
    jitterAmplitude: (1 - fidelity) * 1.45,
    snapPrecisionMul,
    pareidoliaChance,
    showNumericDeltas: theme.mode !== 'warm',
    requiresRawResidual: theme.requiresRawResidual,
    overclockRiskMul:
      1 + clamp(state.overseerSuspicion, 0, 10) * 0.1 + clamp(state.shift - 1, 0, 6) * 0.06,
    harmonicWarmthGain:
      theme.mode === 'warm' ? 1.0 : theme.mode === 'cold' ? 0.16 : 0.56,
  };
}

export interface SpringStepOpts {
  stiffness?: number;
  damping?: number;
  detentCenter?: number;
  detentRadius?: number;
  detentPull?: number;
  wrapAngle?: boolean;
  /** Pseudo-haptic drag viscosity well: increases damping subtly near resonance without showing a visual marker. */
  viscosityCenter?: number;
  viscosityRadius?: number;
  viscosityDampingMul?: number;
}

export interface SpringStepResult {
  value: number;
  inWell: boolean;
  wellProximity: number; // 0..1
}

/**
 * Critically damped spring actuator with optional angle-wrapping, magnetic detent well,
 * and pseudo-haptic drag viscosity.
 */
export class SpringActuator {
  value: number;
  target: number;
  velocity = 0;

  constructor(initial = 0) {
    this.value = initial;
    this.target = initial;
  }

  snap(v: number): void {
    this.value = v;
    this.target = v;
    this.velocity = 0;
  }

  step(dt: number, opts?: SpringStepOpts): number {
    return this.stepWithTelemetry(dt, opts).value;
  }

  stepWithTelemetry(dt: number, opts?: SpringStepOpts): SpringStepResult {
    const k = opts?.stiffness ?? 190;
    const baseDamping = opts?.damping ?? 24;
    const wrap = opts?.wrapAngle === true;

    let effectiveTarget = this.target;
    let inWell = false;
    let wellProximity = 0;

    if (opts?.detentCenter !== undefined && opts?.detentRadius) {
      const dist = wrap
        ? Math.abs(angleDiffRad(this.target, opts.detentCenter))
        : Math.abs(this.target - opts.detentCenter);
      if (dist < opts.detentRadius) {
        inWell = true;
        wellProximity = clamp(1 - dist / opts.detentRadius, 0, 1);
        const pull = opts.detentPull ?? 0.65;
        if (wrap) {
          const delta = angleDiffRad(opts.detentCenter, this.target);
          effectiveTarget = this.target + delta * clamp(pull, 0, 1);
        } else {
          effectiveTarget = lerp(this.target, opts.detentCenter, pull);
        }
      }
    }

    let damping = baseDamping;
    if (opts?.viscosityCenter !== undefined && opts?.viscosityRadius) {
      const vDist = wrap
        ? Math.abs(angleDiffRad(this.value, opts.viscosityCenter))
        : Math.abs(this.value - opts.viscosityCenter);
      if (vDist < opts.viscosityRadius) {
        const prox = 1 - vDist / opts.viscosityRadius;
        wellProximity = Math.max(wellProximity, prox);
        inWell = true;
        damping *= lerp(1, opts.viscosityDampingMul ?? 1.55, prox);
      }
    }

    const clampedDt = Math.min(dt, 0.05);
    const error = wrap ? angleDiffRad(effectiveTarget, this.value) : effectiveTarget - this.value;
    const force = error * k - this.velocity * damping;
    this.velocity += force * clampedDt;
    this.value += this.velocity * clampedDt;
    if (wrap) {
      this.value = wrapAngleRad(this.value);
    }

    return { value: this.value, inWell, wellProximity };
  }
}

/**
 * Anti-frustration Stuck-Time Director (0-30s silent -> 30s pulse -> 45s ghost guide -> 75s partial rescue).
 */
export class StuckTimeDirector {
  private lastProgressTime = 0;
  private elapsed = 0;
  private highWaterMark = 0;

  tick(dt: number, currentProgress: number): 0 | 1 | 2 | 3 {
    this.elapsed += dt;
    if (currentProgress > this.highWaterMark + 0.045) {
      this.highWaterMark = currentProgress;
      this.lastProgressTime = this.elapsed;
    }
    const stuckFor = this.elapsed - this.lastProgressTime;
    const sched = balance.minigames.assistScheduleSec;
    if (stuckFor >= sched.softPartialReady) return 3;
    if (stuckFor >= sched.ghostGuide) return 2;
    if (stuckFor >= sched.subtlePulse) return 1;
    return 0;
  }

  getElapsed(): number {
    return this.elapsed;
  }

  resetIdleTimer(): void {
    this.lastProgressTime = this.elapsed;
  }
}

/**
 * Brief mechanical hitstop + micro-shake when tumblers snap or vectors lock.
 */
export class HitstopRecoil {
  private freezeTimer = 0;
  private shakeAmp = 0;

  trigger(freezeMs = 38, shakePx = 4): void {
    this.freezeTimer = Math.max(this.freezeTimer, freezeMs / 1000);
    this.shakeAmp = Math.max(this.shakeAmp, shakePx);
  }

  step(dt: number): { frozen: boolean; shakeX: number; shakeY: number } {
    this.freezeTimer = Math.max(0, this.freezeTimer - dt);
    this.shakeAmp *= Math.exp(-18 * dt);
    if (this.shakeAmp < 0.15) this.shakeAmp = 0;
    const angle = Math.random() * Math.PI * 2;
    return {
      frozen: this.freezeTimer > 0,
      shakeX: Math.cos(angle) * this.shakeAmp,
      shakeY: Math.sin(angle) * this.shakeAmp,
    };
  }
}

export interface LatchTickOutput {
  lockProgress: number;     // 0..1.25 (>0.85 enters Deep Overclock red zone)
  overclockZone: boolean;
  completedGrade: Exclude<MinigameGrade, 'aborted'> | null;
}

/**
 * Manages Beat 03 Capture Latch (`Space` / button hold) with Clean vs Deep Overclock risk-reward release.
 */
export class LatchController {
  holding = false;
  progress = 0;
  private committed: Exclude<MinigameGrade, 'aborted'> | null = null;

  get overclockZone(): boolean {
    return this.progress >= 0.85;
  }

  setHolding(active: boolean): void {
    if (this.committed) return;
    if (!active && this.holding && this.progress >= 0.72) {
      this.committed = this.progress >= 0.96 ? 'deep_overclock' : 'clean';
      this.holding = false;
      return;
    }
    this.holding = active;
  }

  tick(dt: number, alignmentReady: number, rawSatisfied: boolean): LatchTickOutput {
    if (this.committed) {
      return {
        lockProgress: Math.min(1.2, this.progress),
        overclockZone: this.progress >= 0.85,
        completedGrade: this.committed,
      };
    }

    const canCharge = this.holding && alignmentReady >= 0.78 && rawSatisfied;
    if (canCharge) {
      // 0 -> 0.85 takes ~0.75s; pushing deep into Overclock takes ~0.65s more
      const rate = this.progress < 0.85 ? 1.15 : 0.48;
      this.progress = Math.min(1.2, this.progress + dt * rate);
      if (this.progress >= 1.18) {
        this.committed = 'deep_overclock';
        this.holding = false;
      }
    } else if (!this.holding) {
      this.progress = Math.max(0, this.progress - dt * 0.95);
    }

    return {
      lockProgress: this.progress,
      overclockZone: this.progress >= 0.85,
      completedGrade: this.committed,
    };
  }
}

export function resolveInstrumentPayout(
  grade: MinigameGrade,
  elapsedSec: number,
  accuracy: number,
  proofFragmentId: string,
  dossierSnippet: string,
  telemetrySummary: string,
  physicalPrinciple?: string
): MinigameResult {
  if (grade === 'aborted') {
    return {
      success: false,
      grade: 'aborted',
      anomalyGain: 0,
      chaosDelta: 0,
      suspicionDelta: 0,
      humanityDelta: 0,
      accuracy,
      elapsedSec,
      telemetrySummary,
    };
  }
  const table = balance.minigames.payouts[grade];
  return {
    success: true,
    grade,
    anomalyGain: table.anomalyGain,
    chaosDelta: table.chaosDelta,
    suspicionDelta: table.suspicionDelta,
    humanityDelta: 0,
    accuracy,
    elapsedSec,
    proofFragmentId: grade === 'partial' ? undefined : proofFragmentId,
    physicalPrinciple: physicalPrinciple ?? dossierSnippet,
    dossierSnippet,
    telemetrySummary,
  };
}
