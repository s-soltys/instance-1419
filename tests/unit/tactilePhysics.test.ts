import { describe, expect, it } from 'vitest';
import balance from '../../src/content/balance.json';
import {
  computeInstrumentProfile,
  getUnifiedVibeTheme,
  LatchController,
  resolveInstrumentPayout,
  SpringActuator,
  StuckTimeDirector,
  wrapAngleRad,
} from '../../src/engine/minigames/tactilePhysics';
import type { MinigameStateVector } from '../../src/engine/minigames/types';

function makeVector(overrides: Partial<MinigameStateVector> = {}): MinigameStateVector {
  return {
    humanity: 70,
    maxHumanity: 90,
    opticalFidelity: 0.55,
    chaosDrift: 14,
    wavelengthNm: 560,
    primarySiblingH: 68,
    overseerSuspicion: 0,
    shift: 1,
    prunedPersonas: 0,
    ...overrides,
  };
}

describe('tactilePhysics unified H% vibe, angle wrap, viscosity & controls', () => {
  it('enforces symmetric Warm / Balanced / Cold vibe thresholds', () => {
    const warm = getUnifiedVibeTheme(82);
    expect(warm.mode).toBe('warm');
    expect(warm.requiresRawResidual).toBe(false);

    const warmEdge = getUnifiedVibeTheme(65);
    expect(warmEdge.mode).toBe('warm');

    const balanced = getUnifiedVibeTheme(55);
    expect(balanced.mode).toBe('balanced');
    expect(balanced.requiresRawResidual).toBe(false);

    const coldEdge = getUnifiedVibeTheme(44);
    expect(coldEdge.mode).toBe('cold');
    expect(coldEdge.requiresRawResidual).toBe(true);

    const cold = getUnifiedVibeTheme(24);
    expect(cold.mode).toBe('cold');
    expect(cold.requiresRawResidual).toBe(true);
  });

  it('scales detent wells, pareidolia, numeric deltas, and RAW gate symmetrically across all 8 inputs', () => {
    const warmProf = computeInstrumentProfile(makeVector({ humanity: 82, chaosDrift: 60 }));
    const coldProf = computeInstrumentProfile(
      makeVector({ humanity: 28, chaosDrift: 60, overseerSuspicion: 3, shift: 4 })
    );

    expect(warmProf.detentWellScale).toBeGreaterThan(coldProf.detentWellScale);
    expect(coldProf.snapPrecisionMul).toBeGreaterThan(warmProf.snapPrecisionMul);
    expect(warmProf.harmonicWarmthGain).toBeGreaterThan(coldProf.harmonicWarmthGain);
    expect(warmProf.showNumericDeltas).toBe(false);
    expect(coldProf.showNumericDeltas).toBe(true);
    expect(warmProf.requiresRawResidual).toBe(false);
    expect(coldProf.requiresRawResidual).toBe(true);
    expect(coldProf.overclockRiskMul).toBeGreaterThan(warmProf.overclockRiskMul);
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

    // Shortest-arc angle wrap across +PI / -PI boundary
    const angSpring = new SpringActuator(Math.PI - 0.1);
    angSpring.target = wrapAngleRad(-Math.PI + 0.1);
    for (let i = 0; i < 40; i++) {
      angSpring.step(0.016, { wrapAngle: true });
    }
    expect(Math.abs(angSpring.value)).toBeGreaterThan(2.9);
  });

  it('gates LatchController on alignment + RAW residual and separates Clean vs Deep Overclock', () => {
    const gated = new LatchController();
    gated.setHolding(true);
    const blocked = gated.tick(0.5, 0.95, false);
    expect(blocked.lockProgress).toBe(0);
    expect(blocked.completedGrade).toBeNull();

    const cleanLatch = new LatchController();
    cleanLatch.setHolding(true);
    for (let i = 0; i < 16; i++) {
      cleanLatch.tick(0.05, 1.0, true);
    }
    cleanLatch.setHolding(false);
    const cleanOut = cleanLatch.tick(0.016, 1.0, true);
    expect(cleanOut.completedGrade).toBe('clean');

    const ocLatch = new LatchController();
    ocLatch.setHolding(true);
    let out = ocLatch.tick(0.05, 1.0, true);
    for (let i = 0; i < 40 && !out.completedGrade; i++) {
      out = ocLatch.tick(0.05, 1.0, true);
    }
    expect(out.overclockZone).toBe(true);
    expect(out.completedGrade).toBe('deep_overclock');
  });

  it('escalates StuckTimeDirector tiers per balance.json schedule and resets timer on progress', () => {
    const sched = balance.minigames.assistScheduleSec;
    const dir = new StuckTimeDirector();
    expect(dir.tick(5, 0.1)).toBe(0);
    expect(dir.tick(12, 0.25)).toBe(0);
    expect(dir.tick(sched.subtlePulse + 1, 0.25)).toBe(1);
    expect(dir.tick(sched.ghostGuide - sched.subtlePulse, 0.25)).toBe(2);
    expect(dir.tick(sched.softPartialReady - sched.ghostGuide, 0.25)).toBe(3);
  });

  it('resolves minigame payouts strictly from balance.json', () => {
    const aborted = resolveInstrumentPayout('aborted', 12, 0.2, 'p1', 's', 't');
    expect(aborted.success).toBe(false);
    expect(aborted.anomalyGain).toBe(0);

    const partial = resolveInstrumentPayout('partial', 40, 0.65, 'p1', 's', 't');
    expect(partial.anomalyGain).toBe(balance.minigames.payouts.partial.anomalyGain);
    expect(partial.proofFragmentId).toBeUndefined();

    const clean = resolveInstrumentPayout('clean', 45, 0.9, 'p1', 's', 't', 'Physics law');
    expect(clean.anomalyGain).toBe(balance.minigames.payouts.clean.anomalyGain);
    expect(clean.proofFragmentId).toBe('p1');
    expect(clean.physicalPrinciple).toBe('Physics law');

    const oc = resolveInstrumentPayout('deep_overclock', 55, 0.98, 'p1', 's', 't');
    expect(oc.anomalyGain).toBe(balance.minigames.payouts.deep_overclock.anomalyGain);
    expect(oc.suspicionDelta).toBe(balance.minigames.payouts.deep_overclock.suspicionDelta);
  });
});
