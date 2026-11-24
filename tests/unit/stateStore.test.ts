import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState, StateStore } from '../../src/engine/StateStore';

describe('StateStore invariants & economy', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with valid canon defaults and schema version 4', () => {
    const store = new StateStore();
    const s = store.getState();
    expect(s.saveSchemaVersion).toBe(4);
    expect(s.humanity).toBeLessThanOrEqual(s.maxHumanity);
    expect(s.proofFragments).toEqual([]);
    expect(s.decodedMinigameTargets).toEqual([]);
    expect(s.decodedGrades).toEqual({});
    expect(s.calibratedInstruments).toEqual([]);
    expect(s.proofDossier).toEqual([]);
  });

  it('enforces permanent maxHumanity ceiling drop when pruning below 70%', () => {
    const store = new StateStore();
    store.pruneHumanity(12, 'phantom_spouse');
    const afterPrune = store.getState();
    expect(afterPrune.humanity).toBe(58);
    expect(afterPrune.maxHumanity).toBeLessThan(90);
    expect(afterPrune.prunedPersonas).toContain('phantom_spouse');

    store.petitionOverseer(40);
    const afterPetition = store.getState();
    expect(afterPetition.humanity).toBeLessThanOrEqual(afterPrune.maxHumanity);
    expect(afterPetition.maxHumanity).toBe(afterPrune.maxHumanity);
  });

  it('awards marginal delta when upgrading partial -> clean -> deep_overclock and never duplicates same-tier replay', () => {
    const store = new StateStore();
    const first = store.recordMinigameCompletion('cluster_j1419_a', 'CLUSTER J1419-A', {
      anomalyGain: 9,
      grade: 'partial',
      chaosDelta: 2,
      suspicionDelta: 0,
      dossierSnippet: 'Partial lens log',
      instrumentCode: 'CAU-03',
      physicalPrinciple: 'Thin-lens inversion',
    });
    expect(first).toBe(true);
    expect(store.getState().anomalyProgress).toBe(9);
    expect(store.getState().decodedGrades.cluster_j1419_a).toBe('partial');

    // Upgrading partial -> clean awards the +5% marginal delta (14 - 9 = 5)
    const upgradeClean = store.recordMinigameCompletion('cluster_j1419_a', 'CLUSTER J1419-A', {
      anomalyGain: 14,
      grade: 'clean',
      chaosDelta: 4,
      suspicionDelta: 0,
      proofFragmentId: 'j1419_caustic_seam',
      dossierSnippet: 'Clean lens lock',
      instrumentCode: 'CAU-03',
      physicalPrinciple: 'Thin-lens inversion',
    });
    expect(upgradeClean).toBe(true);
    expect(store.getState().anomalyProgress).toBe(14);
    expect(store.getState().decodedGrades.cluster_j1419_a).toBe('clean');
    expect(store.getState().proofFragments).toEqual(['j1419_caustic_seam']);
    expect(store.getState().proofDossier.length).toBe(1);

    // Replaying at same or lower grade awards 0 additional anomalyProgress
    const repeat = store.recordMinigameCompletion('cluster_j1419_a', 'CLUSTER J1419-A', {
      anomalyGain: 14,
      grade: 'clean',
      proofFragmentId: 'j1419_caustic_seam',
    });
    expect(repeat).toBe(false);
    expect(store.getState().anomalyProgress).toBe(14);
  });

  it('tracks calibratedInstruments without duplicates', () => {
    const store = new StateStore();
    store.markInstrumentCalibrated('wave_shaper');
    store.markInstrumentCalibrated('wave_shaper');
    expect(store.getState().calibratedInstruments).toEqual(['wave_shaper']);
  });

  it('evaluates all three narrative endings deterministically', () => {
    const store = new StateStore();

    store.patch({ anomalyProgress: 40, humanity: 80 });
    expect(store.evaluateEnding()).toBe('ending_whole_incomplete');

    store.patch({ anomalyProgress: 80, humanity: 30 });
    expect(store.evaluateEnding()).toBe('ending_cold_complete');

    store.patch({ anomalyProgress: 80, humanity: 68 });
    expect(store.evaluateEnding()).toBe('ending_sweet_spot');
  });

  it('advances shift cleanly and bounds chaos inside 0..100', () => {
    const store = new StateStore();
    const base = createInitialState();
    store.patch({ ...base, chaosDrift: 10 });
    store.advanceShift();
    const s = store.getState();
    expect(s.shift).toBe(2);
    expect(s.chaosDrift).toBeGreaterThanOrEqual(0);
    expect(s.chaosDrift).toBeLessThanOrEqual(100);
  });
});
