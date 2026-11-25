import { beforeEach, describe, expect, it } from 'vitest';
import {
  createInitialState,
  INTRO_TARGET_1_ID,
  INTRO_TARGET_2_ID,
  migrateSavedState,
  STARTER_POOL_1,
  STARTER_POOL_2,
  StateStore,
} from '../../src/engine/StateStore';

describe('StateStore invariants & economy', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with valid canon defaults, introStage prologue, starter pools, and schema version 7', () => {
    const store = new StateStore();
    const s = store.getState();
    expect(s.saveSchemaVersion).toBe(7);
    expect(s.introStage).toBe('prologue');
    expect(store.hasSavedProgress()).toBe(false);
    expect(STARTER_POOL_1).toContain(s.introTarget1Minigame);
    expect(STARTER_POOL_2).toContain(s.introTarget2Minigame);
    expect(store.getMinigameIdForTarget(INTRO_TARGET_1_ID, 'fallback_mg')).toBe(s.introTarget1Minigame);
    expect(store.getMinigameIdForTarget(INTRO_TARGET_2_ID, 'fallback_mg')).toBe(s.introTarget2Minigame);
    expect(store.getMinigameIdForTarget('carina_rift_nebula', 'wave_shaper')).toBe('wave_shaper');
    expect(s.humanity).toBeLessThanOrEqual(s.maxHumanity);
    expect(s.proofFragments).toEqual([]);
    expect(s.decodedMinigameTargets).toEqual([]);
    expect(s.decodedGrades).toEqual({});
    expect(s.calibratedInstruments).toEqual([]);
    expect(s.minigameRunCounts).toEqual({});
    expect(s.proofDossier).toEqual([]);
    expect(s.codexUnlocks).toEqual([]);
    expect(s.codexSeenStages).toEqual({});
  });

  it('deterministically seeds starter pools per run and persists introStage transitions', () => {
    const seededA = createInitialState(141901);
    const seededB = createInitialState(141901);
    expect(seededA.introTarget1Minigame).toBe(seededB.introTarget1Minigame);
    expect(seededA.introTarget2Minigame).toBe(seededB.introTarget2Minigame);

    const seenPool1 = new Set<string>();
    const seenPool2 = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const st = createInitialState(seed * 97);
      seenPool1.add(st.introTarget1Minigame);
      seenPool2.add(st.introTarget2Minigame);
    }
    expect(seenPool1.size).toBe(STARTER_POOL_1.length);
    expect(seenPool2.size).toBe(STARTER_POOL_2.length);

    const store = new StateStore();
    expect(store.hasSavedProgress()).toBe(false);
    store.setIntroStage('scan_target_1');
    expect(store.getState().introStage).toBe('scan_target_1');
    expect(store.hasSavedProgress()).toBe(true);

    const reloaded = new StateStore();
    expect(reloaded.getState().introStage).toBe('scan_target_1');
    expect(reloaded.getState().introTarget1Minigame).toBe(store.getState().introTarget1Minigame);
    expect(reloaded.getState().introTarget2Minigame).toBe(store.getState().introTarget2Minigame);
  });

  it('migrates legacy v4/v6 saves (including removed target_inspect mode) seamlessly to v7', () => {
    localStorage.setItem(
      'instance_1419_state_v6',
      JSON.stringify({
        saveSchemaVersion: 6,
        shift: 3,
        mode: 'target_inspect',
        activeTargetId: 'cluster_j1419_a',
        humanity: 62,
        maxHumanity: 78,
        decodedMinigameTargets: ['cluster_j1419_a'],
      })
    );
    const store = new StateStore();
    const s = store.getState();
    expect(s.saveSchemaVersion).toBe(7);
    expect(s.mode).toBe('waking_3d');
    expect(s.introStage).toBe('complete');
    expect(s.shift).toBe(3);
    expect(s.humanity).toBe(62);
    expect(STARTER_POOL_1).toContain(s.introTarget1Minigame);
    expect(STARTER_POOL_2).toContain(s.introTarget2Minigame);
    expect(s.minigameRunCounts).toEqual({});
    expect(s.codexUnlocks).toEqual([]);
    expect(s.codexSeenStages).toEqual({});
    expect(localStorage.getItem('instance_1419_state_v6')).toBeNull();

    // Fresh untouched v6 boot save migrates to introStage 'prologue'
    const freshLegacy = migrateSavedState({ saveSchemaVersion: 6, shift: 1, mode: 'boot' });
    expect(freshLegacy.introStage).toBe('prologue');

    expect(store.getNextIterationIndex('wave_shaper', 4)).toBe(0);
    expect(store.recordMinigameRun('wave_shaper')).toBe(1);
    expect(store.getNextIterationIndex('wave_shaper', 4)).toBe(1);
    expect(store.recordMinigameRun('wave_shaper')).toBe(2);
    expect(store.recordMinigameRun('wave_shaper')).toBe(3);
    expect(store.recordMinigameRun('wave_shaper')).toBe(4);
    expect(store.getNextIterationIndex('wave_shaper', 4)).toBe(0);
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
