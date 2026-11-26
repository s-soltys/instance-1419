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
      subtitle: 'Broad Amber Detents · Intuitive Acoustic Lock',
      accentHex: '#ffb86c',
      accentRgb: '255, 184, 108',
      secondaryHex: '#ffdf9e',
      secondaryRgb: '255, 223, 158',
      dangerHex: '#ff6b6b',
      bgTintRgba: 'rgba(34, 20, 10, 0.14)',
      gridAlpha: 0.14,
      glowBlurPx: 14,
      reticleStyle: 'organic_amber',
    };
  }
  if (mode === 'cold') {
    return {
      mode: 'cold',
      label: 'SURGICAL COLD',
      subtitle: 'Razor Cryo-Cyan Detents · Numeric Residuals',
      accentHex: '#9ee8ff',
      accentRgb: '158, 232, 255',
      secondaryHex: '#e6f7ff',
      secondaryRgb: '230, 247, 255',
      dangerHex: '#ff5268',
      bgTintRgba: 'rgba(6, 18, 28, 0.22)',
      gridAlpha: 0.34,
      glowBlurPx: 4,
      reticleStyle: 'surgical_cyan',
    };
  }
  return {
    mode: 'balanced',
    label: 'DUAL-LATTICE',
    subtitle: 'Balanced Aperture · Adaptive Detents',
    accentHex: '#d9cc9e',
    accentRgb: '217, 204, 158',
    secondaryHex: '#9cc8ff',
    secondaryRgb: '156, 200, 255',
    dangerHex: '#ff6464',
    bgTintRgba: 'rgba(14, 18, 24, 0.16)',
    gridAlpha: 0.22,
    glowBlurPx: 9,
    reticleStyle: 'hybrid_slate',
  };
}

/**
 * Translates GameState into the lean 3-Axis Cognitive Instrument Profile:
 *  1. Warmth (`humanity`) -> palette, detents, numeric deltas, audio warmth
 *  2. Optical Clarity (`opticalFidelity`) -> plate focus, CCD noise floor, micro-jitter
 *  3. Horizon Drift (`chaosDrift` + `shift`) -> subtle late-shift enclosure seam bleed
 */
export function computeInstrumentProfile(state: MinigameStateVector): CognitiveInstrumentProfile {
  const theme = getUnifiedVibeTheme(state.humanity);
  const warmth01 = clamp((state.humanity - 20) / 70, 0, 1);
  const clarity01 = clamp(state.opticalFidelity, 0.25, 1.0);
  const chaosNorm = clamp(state.chaosDrift / 100, 0, 1);
  const shiftNorm = clamp((state.shift - 1) / 5, 0, 1);
  const drift01 = clamp(chaosNorm * 0.65 + shiftNorm * 0.35, 0, 1);

  const detentWellScale =
    theme.mode === 'warm' ? 1.35 : theme.mode === 'cold' ? 0.72 : 1.0;

  return {
    vibe: theme.mode,
    warmth01,
    theme,
    detentWellScale,
    showNumericDeltas: theme.mode !== 'warm',
    harmonicWarmthGain:
      theme.mode === 'warm' ? 1.0 : theme.mode === 'cold' ? 0.16 : 0.56,

    clarity01,
    jitterAmplitude: (1 - clarity01) * 1.45,
    ccdNoiseAlpha: lerp(0.085, 0.012, clarity01),
    plateBlurPenaltyPx: lerp(2.1, 0, clarity01),

    drift01,
    seamBleedAlpha: clamp((drift01 - 0.18) * 0.22, 0, 0.16),
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
  const table = balance.minigames.payouts.clean;
  return {
    success: true,
    grade: 'clean',
    anomalyGain: table.anomalyGain,
    chaosDelta: table.chaosDelta,
    suspicionDelta: table.suspicionDelta,
    humanityDelta: 0,
    accuracy,
    elapsedSec,
    proofFragmentId,
    physicalPrinciple: physicalPrinciple ?? dossierSnippet,
    dossierSnippet,
    telemetrySummary,
  };
}
