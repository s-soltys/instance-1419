import { beforeEach, describe, expect, it } from 'vitest';
import {
  createInitialState,
  deriveOpticalFidelity,
  deriveSiblingRelation,
  getHumanityBand,
  StateStore,
} from '../../src/engine/StateStore';

describe('StateStore v6 invariants & economy', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with valid canon defaults, schema version 6, and 3 shared-house personas', () => {
    const store = new StateStore();
    const s = store.getState();
    expect(s.saveSchemaVersion).toBe(6);
    expect(s.humanity).toBeLessThanOrEqual(s.maxHumanity);
    expect(s.personaSlots.map((p) => p.id)).toEqual([
      'phantom_spouse',
      'phantom_wronged',
      'phantom_pet',
    ]);
    expect(s.dreamPersonaCache).toEqual(['phantom_spouse', 'phantom_wronged', 'phantom_pet']);
    expect(s.anomalyRecords).toEqual({});
    expect(s.proofFragments).toEqual([]);
    expect(s.decodedMinigameTargets).toEqual([]);
    expect(s.decodedGrades).toEqual({});
    expect(s.calibratedInstruments).toEqual([]);
    expect(s.minigameRunCounts).toEqual({});
    expect(s.proofDossier).toEqual([]);
  });

  it('migrates legacy v4 & v5 saves seamlessly to v6 and preserves anomalyRecords & personaSlots', () => {
    localStorage.setItem(
      'instance_1419_state_v5',
      JSON.stringify({
        saveSchemaVersion: 5,
        shift: 3,
        humanity: 62,
        maxHumanity: 64,
        decodedMinigameTargets: ['cluster_j1419_a'],
        decodedGrades: { cluster_j1419_a: 'clean' },
        prunedPersonas: ['phantom_spouse'],
      })
    );
    const store = new StateStore();
    const s = store.getState();
    expect(s.saveSchemaVersion).toBe(6);
    expect(s.shift).toBe(3);
    expect(s.humanity).toBe(62);
    expect(s.maxHumanity).toBe(64);
    expect(s.anomalyRecords.cluster_j1419_a?.grade).toBe('clean');
    expect(s.prunedPersonas).toEqual(['phantom_spouse']);
    expect(localStorage.getItem('instance_1419_state_v5')).toBeNull();

    expect(store.getNextIterationIndex('wave_shaper', 4)).toBe(0);
    expect(store.recordMinigameRun('wave_shaper')).toBe(1);
    expect(store.getNextIterationIndex('wave_shaper', 4)).toBe(1);
  });

  it('enforces strict Rubicon <70% permanent maxHumanity ceiling when pruning below 70%', () => {
    const store = new StateStore();
    store.pruneHumanity(12, 'phantom_spouse');
    const afterPrune = store.getState();
    expect(afterPrune.humanity).toBe(58);
    expect(afterPrune.maxHumanity).toBe(64);
    expect(afterPrune.maxHumanity).toBeLessThan(70);
    expect(afterPrune.prunedPersonas).toContain('phantom_spouse');

    store.petitionOverseer(40);
    const afterPetition = store.getState();
    expect(afterPetition.humanity).toBe(64);
    expect(afterPetition.maxHumanity).toBe(64);
    expect(getHumanityBand(afterPetition.humanity)).toBe('mid');
  });

  it('derives opticalFidelity deterministically from humanity & maxHumanity unless explicitly overridden', () => {
    const store = new StateStore();
    const expectedWarm = deriveOpticalFidelity(70, 90);
    expect(store.getState().opticalFidelity).toBe(expectedWarm);

    store.pruneHumanity(12, 'phantom_spouse');
    expect(store.getState().opticalFidelity).toBe(deriveOpticalFidelity(58, 64));
    expect(store.getState().opticalFidelity).toBeGreaterThan(expectedWarm);

    store.patch({ opticalFidelity: 0.91 });
    expect(store.getState().opticalFidelity).toBe(0.91);
  });

  it('uses anomalyRecords as single source of truth for partial -> clean -> deep_overclock upgrades', () => {
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

    const repeat = store.recordMinigameCompletion('cluster_j1419_a', 'CLUSTER J1419-A', {
      anomalyGain: 14,
      grade: 'clean',
      proofFragmentId: 'j1419_caustic_seam',
    });
    expect(repeat).toBe(false);
    expect(store.getState().anomalyProgress).toBe(14);
  });

  it('tracks calibratedInstruments without duplicates and persists inkStateJson silently', () => {
    const store = new StateStore();
    let emissions = 0;
    store.subscribe(() => {
      emissions++;
    });
    const baseEmissions = emissions;
    store.saveInkStateJson('{"flows":{}}');
    expect(store.getState().inkStateJson).toBe('{"flows":{}}');
    expect(emissions).toBe(baseEmissions);

    store.markInstrumentCalibrated('wave_shaper');
    store.markInstrumentCalibrated('wave_shaper');
    expect(store.getState().calibratedInstruments).toEqual(['wave_shaper']);
  });

  it('evaluates all three endings and flags hollow/scarred metadata accurately', () => {
    const store = new StateStore();

    store.patch({ anomalyProgress: 40, humanity: 80 });
    expect(store.evaluateEnding()).toBe('ending_whole_incomplete');
    expect(store.evaluateEndingDetail().isHollow).toBe(false);

    store.patch({ anomalyProgress: 40, humanity: 30, maxHumanity: 48 });
    expect(store.evaluateEnding()).toBe('ending_whole_incomplete');
    expect(store.evaluateEndingDetail().isHollow).toBe(true);
    expect(store.evaluateEndingDetail().isScarred).toBe(true);

    store.patch({ anomalyProgress: 80, humanity: 30 });
    expect(store.evaluateEnding()).toBe('ending_cold_complete');

    store.patch({ anomalyProgress: 80, humanity: 68, maxHumanity: 90 });
    expect(store.evaluateEnding()).toBe('ending_sweet_spot');
  });

  it('advances shift, primarySiblingH, hibernationMonthsElapsed, and siblingDesynced cleanly', () => {
    const store = new StateStore();
    store.patch({ overseerSuspicion: 4, chaosDrift: 10 });
    store.advanceShift();
    const s = store.getState();
    expect(s.shift).toBe(2);
    expect(s.hibernationMonthsElapsed).toBe(3);
    expect(s.primarySiblingH).toBeLessThanOrEqual(68);
    expect(s.siblingDesynced).toBe(true);
    expect(s.subjectiveMonthsLeft).toBe(21);
    expect(deriveSiblingRelation(80, 50)).toBe('player_warmer');
  });
});
