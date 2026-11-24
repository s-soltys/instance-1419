import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState, StateStore } from '../../src/engine/StateStore';

describe('StateStore invariants & economy', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with valid canon defaults and schema version 3', () => {
    const store = new StateStore();
    const s = store.getState();
    expect(s.saveSchemaVersion).toBe(3);
    expect(s.humanity).toBeLessThanOrEqual(s.maxHumanity);
    expect(s.proofFragments).toEqual([]);
    expect(s.decodedMinigameTargets).toEqual([]);
  });

  it('enforces permanent maxHumanity ceiling drop when pruning below 70%', () => {
    const store = new StateStore();
    // Start at H=70, maxH=90; pruning by 12 brings H=58 (<70) -> lowers maxHumanity permanently!
    store.pruneHumanity(12, 'phantom_spouse');
    const afterPrune = store.getState();
    expect(afterPrune.humanity).toBe(58);
    expect(afterPrune.maxHumanity).toBeLessThan(90);
    expect(afterPrune.prunedPersonas).toContain('phantom_spouse');

    // Petitioning upward can never restore Humanity above the permanently lowered ceiling
    store.petitionOverseer(40);
    const afterPetition = store.getState();
    expect(afterPetition.humanity).toBeLessThanOrEqual(afterPrune.maxHumanity);
    expect(afterPetition.maxHumanity).toBe(afterPrune.maxHumanity);
  });

  it('records graded minigame payouts without duplicating anomalyGain on replay', () => {
    const store = new StateStore();
    const first = store.recordMinigameCompletion('cluster_j1419_a', 'CLUSTER J1419-A', {
      anomalyGain: 20,
      grade: 'deep_overclock',
      chaosDelta: 8,
      suspicionDelta: 1,
      proofFragmentId: 'j1419_caustic_seam',
      dossierSnippet: 'Overclock proof logged',
    });
    expect(first).toBe(true);
    expect(store.getState().anomalyProgress).toBe(20);
    expect(store.getState().chaosDrift).toBe(22); // 14 + 8
    expect(store.getState().overseerSuspicion).toBe(1);
    expect(store.getState().proofFragments).toEqual(['j1419_caustic_seam']);

    // Replay same target should NOT double-award anomalyProgress or duplicate proofFragment
    const replay = store.recordMinigameCompletion('cluster_j1419_a', 'CLUSTER J1419-A', {
      anomalyGain: 16,
      grade: 'clean',
      proofFragmentId: 'j1419_caustic_seam',
    });
    expect(replay).toBe(false);
    expect(store.getState().anomalyProgress).toBe(20);
    expect(store.getState().proofFragments).toEqual(['j1419_caustic_seam']);
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
