import { describe, expect, it } from 'vitest';
import balance from '../../src/content/balance.json';
import {
  computeInstrumentProfile,
  getUnifiedVibeTheme,
  HitstopRecoil,
  resolveInstrumentPayout,
  SpringActuator,
  wrapAngleRad,
} from '../../src/engine/minigames/tactilePhysics';
import type { MinigameStateVector } from '../../src/engine/minigames/types';

function makeVector(overrides: Partial<MinigameStateVector> = {}): MinigameStateVector {
  return {
    humanity: 70,
    opticalFidelity: 0.55,
    chaosDrift: 14,
    shift: 1,
    ...overrides,
  };
}

describe('tactilePhysics Lean 3-Axis contract, springs & clean payouts', () => {
  it('enforces symmetric Warm / Balanced / Cold vibe thresholds', () => {
    expect(getUnifiedVibeTheme(82).mode).toBe('warm');
    expect(getUnifiedVibeTheme(65).mode).toBe('warm');
    expect(getUnifiedVibeTheme(55).mode).toBe('balanced');
    expect(getUnifiedVibeTheme(44).mode).toBe('cold');
    expect(getUnifiedVibeTheme(24).mode).toBe('cold');
  });

  it('computes 3-Axis CognitiveInstrumentProfile (Warmth, Optical Clarity, Horizon Drift)', () => {
    const warmLowFidelity = computeInstrumentProfile(
      makeVector({ humanity: 82, opticalFidelity: 0.4, chaosDrift: 12, shift: 1 })
    );
    const coldHighFidelityLate = computeInstrumentProfile(
      makeVector({ humanity: 28, opticalFidelity: 0.92, chaosDrift: 68, shift: 5 })
    );

    // Axis 1: Warmth
    expect(warmLowFidelity.warmth01).toBeGreaterThan(coldHighFidelityLate.warmth01);
    expect(warmLowFidelity.detentWellScale).toBeGreaterThan(coldHighFidelityLate.detentWellScale);
    expect(warmLowFidelity.harmonicWarmthGain).toBeGreaterThan(coldHighFidelityLate.harmonicWarmthGain);
    expect(warmLowFidelity.showNumericDeltas).toBe(false);
    expect(coldHighFidelityLate.showNumericDeltas).toBe(true);

    // Axis 2: Optical Clarity
    expect(coldHighFidelityLate.clarity01).toBeGreaterThan(warmLowFidelity.clarity01);
    expect(warmLowFidelity.jitterAmplitude).toBeGreaterThan(coldHighFidelityLate.jitterAmplitude);
    expect(warmLowFidelity.ccdNoiseAlpha).toBeGreaterThan(coldHighFidelityLate.ccdNoiseAlpha);
    expect(warmLowFidelity.plateBlurPenaltyPx).toBeGreaterThan(coldHighFidelityLate.plateBlurPenaltyPx);

    // Axis 3: Horizon Drift
    expect(coldHighFidelityLate.drift01).toBeGreaterThan(warmLowFidelity.drift01);
    expect(coldHighFidelityLate.seamBleedAlpha).toBeGreaterThan(warmLowFidelity.seamBleedAlpha);
  });

  it('converges SpringActuator smoothly, handles +-PI wrapping, and reports pseudo-haptic viscosity', () => {
    const spring = new SpringActuator(0);
    spring.target = 0.08;
    let lastRes = spring.stepWithTelemetry(0.016);
    for (let i = 0; i < 60; i++) {
      lastRes = spring.stepWithTelemetry(0.016, {
        detentCenter: 0.0,
        detentRadius: 0.14,
        detentPull: 0.7,
        viscosityCenter: 0.0,
        viscosityRadius: 0.2,
        viscosityDampingMul: 1.6,
      });
    }
    expect(lastRes.value).toBeLessThan(0.04);
    expect(lastRes.inWell).toBe(true);
    expect(lastRes.wellProximity).toBeGreaterThan(0.7);

    const angSpring = new SpringActuator(Math.PI - 0.1);
    angSpring.target = wrapAngleRad(-Math.PI + 0.1);
    for (let i = 0; i < 40; i++) {
      angSpring.step(0.016, { wrapAngle: true });
    }
    expect(Math.abs(angSpring.value)).toBeGreaterThan(2.9);
  });

  it('steps HitstopRecoil freeze and decays micro-shake', () => {
    const recoil = new HitstopRecoil();
    recoil.trigger(40, 5);
    const hit = recoil.step(0.016);
    expect(hit.frozen).toBe(true);
    let settled = hit;
    for (let i = 0; i < 25; i++) settled = recoil.step(0.02);
    expect(settled.frozen).toBe(false);
    expect(Math.hypot(settled.shakeX, settled.shakeY)).toBeLessThan(0.25);
  });

  it('resolves clean and aborted minigame payouts from balance.json', () => {
    const aborted = resolveInstrumentPayout('aborted', 12, 0.2, 'p1', 's', 't');
    expect(aborted.success).toBe(false);
    expect(aborted.anomalyGain).toBe(0);

    const clean = resolveInstrumentPayout('clean', 45, 0.9, 'p1', 's', 't', 'Physics law');
    expect(clean.success).toBe(true);
    expect(clean.grade).toBe('clean');
    expect(clean.anomalyGain).toBe(balance.minigames.payouts.clean.anomalyGain);
    expect(clean.proofFragmentId).toBe('p1');
    expect(clean.physicalPrinciple).toBe('Physics law');
  });
});
