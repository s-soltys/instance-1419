import { beforeEach, describe, expect, it } from 'vitest';
import {
  createInitialState,
  INTRO_TARGET_1_ID,
  INTRO_TARGET_1_MINIGAME,
  INTRO_TARGET_2_ID,
  INTRO_TARGET_2_MINIGAME,
  migrateSavedState,
  StateStore,
} from '../../src/engine/StateStore';

describe('StateStore invariants & economy', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with valid canon defaults, introStage prologue, fixed starter pair, and schema version 8', () => {
    const store = new StateStore();
    const s = store.getState();
    expect(s.saveSchemaVersion).toBe(8);
    expect(s.dreamPersonaCache).toHaveLength(4);
    expect(s.dreamPersonaCache).toContain('phantom_spouse');
    expect(s.dreamPersonaCache).toContain('phantom_parent');
    expect(s.dreamPersonaCache).not.toContain('phantom_upload_witness');
    expect(s.introStage).toBe('prologue');
    expect(store.hasSavedProgress()).toBe(false);
    expect(s.introTarget1Minigame).toBe('constellation_recall');
    expect(s.introTarget2Minigame).toBe('lens_focus');
    expect(store.getMinigameIdForTarget(INTRO_TARGET_1_ID, 'fallback_mg')).toBe(INTRO_TARGET_1_MINIGAME);
    expect(store.getMinigameIdForTarget(INTRO_TARGET_2_ID, 'fallback_mg')).toBe(INTRO_TARGET_2_MINIGAME);
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
    store.dispose();
  });

  it('locks fixed optics starter pair across seeds and persists introStage transitions cleanly', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const st = createInitialState(seed * 97);
      expect(st.introTarget1Minigame).toBe('constellation_recall');
      expect(st.introTarget2Minigame).toBe('lens_focus');
    }

    const store = new StateStore();
    expect(store.hasSavedProgress()).toBe(false);
    store.setIntroStage('scan_target_1');
    store.flushSave();
    expect(store.getState().introStage).toBe('scan_target_1');
    expect(store.hasSavedProgress()).toBe(true);

    const reloaded = new StateStore();
    expect(reloaded.getState().introStage).toBe('scan_target_1');
    expect(reloaded.getState().introTarget1Minigame).toBe('constellation_recall');
    expect(reloaded.getState().introTarget2Minigame).toBe('lens_focus');
    store.dispose();
    reloaded.dispose();
  });

  it('migrates legacy v4/v6 saves (including removed target_inspect mode) seamlessly to v8', () => {
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
    expect(s.saveSchemaVersion).toBe(8);
    expect(s.mode).toBe('waking_3d');
    expect(s.introStage).toBe('complete');
    expect(s.shift).toBe(3);
    expect(s.humanity).toBe(62);
    expect(s.introTarget1Minigame).toBe('constellation_recall');
    expect(s.introTarget2Minigame).toBe('lens_focus');
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

  it('enforces permanent maxHumanity ceiling drop below 70% and blocks climbing back above 70%', () => {
    const store = new StateStore();
    store.pruneHumanity(12, 'phantom_spouse');
    const afterPrune = store.getState();
    expect(afterPrune.humanity).toBe(58);
    expect(afterPrune.maxHumanity).toBeLessThan(70);
    expect(afterPrune.prunedPersonas).toContain('phantom_spouse');

    store.petitionOverseer(40);
    const afterPetition = store.getState();
    expect(afterPetition.humanity).toBeLessThanOrEqual(afterPrune.maxHumanity);
    expect(afterPetition.humanity).toBeLessThan(70);
    expect(afterPetition.maxHumanity).toBe(afterPrune.maxHumanity);
  });

  it('supports partial/clean grade persistence, optional target & clarity bonuses, and shift quota status', () => {
    const store = new StateStore();
    const first = store.recordMinigameCompletion('cluster_j1419_a', 'CLUSTER J1419-A', {
      grade: 'partial',
      proofFragmentId: 'j1419_caustic_seam',
      dossierSnippet: 'Partial lens trace',
      instrumentCode: 'LNS-04',
      physicalPrinciple: 'Thin-lens inversion',
    });
    expect(first).toBe(true);
    expect(store.getState().anomalyProgress).toBe(2);
    expect(store.getState().decodedGrades.cluster_j1419_a).toBe('partial');

    // Replaying at same or lower grade awards 0 additional anomalyProgress
    const repeat = store.recordMinigameCompletion('cluster_j1419_a', 'CLUSTER J1419-A', {
      grade: 'partial',
      proofFragmentId: 'j1419_caustic_seam',
    });
    expect(repeat).toBe(false);
    expect(store.getState().anomalyProgress).toBe(2);

    // Upgrading partial -> clean awards marginal difference (4 - 2 = +2)
    const toClean = store.recordMinigameCompletion('cluster_j1419_a', 'CLUSTER J1419-A', {
      grade: 'clean',
      proofFragmentId: 'j1419_caustic_seam',
      dossierSnippet: 'Clean lens lock',
      instrumentCode: 'LNS-04',
    });
    expect(toClean).toBe(true);
    expect(store.getState().anomalyProgress).toBe(4);
    expect(store.getState().decodedGrades.cluster_j1419_a).toBe('clean');
    expect(store.getState().proofDossier[0].grade).toBe('clean');

    // Optional target awards clean + optional bonus (4 + 3 = 7) plus optional chaos/suspicion
    const chaosBefore = store.getState().chaosDrift;
    const suspBefore = store.getState().overseerSuspicion;
    const optOk = store.recordMinigameCompletion('carina_rift_nebula', 'CARINA RIFT NURSERY', {
      grade: 'clean',
    });
    expect(optOk).toBe(true);
    expect(store.getState().anomalyProgress).toBe(11);
    expect(store.getState().chaosDrift).toBe(chaosBefore + 9);
    expect(store.getState().overseerSuspicion).toBe(suspBefore + 1);

    // Saved partial grades persist across migration
    const migratedPartial = migrateSavedState({
      saveSchemaVersion: 6,
      decodedMinigameTargets: ['cluster_j1419_a'],
      decodedGrades: { cluster_j1419_a: 'partial' },
    });
    expect(migratedPartial.decodedGrades.cluster_j1419_a).toBe('partial');

    // getShiftQuotaStatus() tracks required vs optional targets dynamically
    expect(store.getShiftQuotaStatus(1)).toEqual({
      requiredIds: ['sol_centauri_bearing', 'cluster_j1419_a'],
      optionalIds: ['carina_rift_nebula', 'asterism_drift_01'],
      requiredDone: 1,
      optionalDone: 1,
      mandateMet: false,
      allDone: false,
    });
    store.recordMinigameCompletion('sol_centauri_bearing', 'SOL–CENTAURI BEARING', { grade: 'clean' });
    expect(store.getShiftQuotaStatus(1).mandateMet).toBe(true);
    expect(store.getShiftQuotaStatus(1).allDone).toBe(false);
    store.recordMinigameCompletion('asterism_drift_01', 'EAGLE DUST PILLARS K-01', { grade: 'clean' });
    expect(store.getShiftQuotaStatus(1).allDone).toBe(true);
    store.dispose();
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
    expect(store.evaluateEndingDetail()).toEqual({ id: 'ending_whole_incomplete', variant: 'standard' });

    store.patch({ anomalyProgress: 40, humanity: 30 });
    expect(store.evaluateEnding()).toBe('ending_whole_incomplete');
    expect(store.evaluateEndingDetail()).toEqual({ id: 'ending_whole_incomplete', variant: 'cold_incomplete' });

    store.patch({ anomalyProgress: 80, humanity: 30 });
    expect(store.evaluateEnding()).toBe('ending_cold_complete');
    expect(store.evaluateEndingDetail()).toEqual({ id: 'ending_cold_complete', variant: 'standard' });

    store.patch({ anomalyProgress: 80, humanity: 68 });
    expect(store.evaluateEnding()).toBe('ending_sweet_spot');
    expect(store.evaluateEndingDetail()).toEqual({ id: 'ending_sweet_spot', variant: 'standard' });
  });

  it('advances shift cleanly, expires uncompleted optionals, evolves sibling counterweight, and unlocks Shift Select meta', () => {
    const store = new StateStore();
    const base = createInitialState(1419);
    store.patch({ ...base, chaosDrift: 10, humanity: 82 });
    store.advanceShift();
    const s = store.getState();
    expect(s.shift).toBe(2);
    expect(s.chaosDrift).toBeGreaterThanOrEqual(0);
    expect(s.chaosDrift).toBeLessThanOrEqual(100);
    expect(s.elapsedRealYears).toBeCloseTo(5.0, 1);
    expect(s.expiredOptionalTargets).toContain('carina_rift_nebula');
    expect(s.dreamVisitedRoomsThisShift).toEqual([]);
    expect(s.primarySiblingH).toBeLessThan(70);

    const meta = store.recordEnding('ending_sweet_spot', 'standard');
    expect(meta.unlockedShiftSelect).toBe(true);
    expect(meta.endingsReached).toContain('ending_sweet_spot');
    store.startFromShift(3);
    expect(store.getState().shift).toBe(3);
    expect(store.getState().introStage).toBe('complete');
    expect(store.getMetaProfile().unlockedShiftSelect).toBe(true);
    store.dispose();
  });
});
