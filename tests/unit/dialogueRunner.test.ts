import { beforeEach, describe, expect, it } from 'vitest';
import { DialogueRunner } from '../../src/engine/DialogueRunner';
import { StateStore } from '../../src/engine/StateStore';

describe('DialogueRunner persistent Ink & tag pipeline', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('parses #mood, #camera, #beat, #vo, and #direction tags into DialogueEntry metadata', () => {
    const store = new StateStore();
    const runner = new DialogueRunner(store, () => {});
    const snap = runner.startKnot('dream_shift1_audit');

    expect(snap.entries.length).toBeGreaterThan(0);
    const first = snap.entries[0];
    expect(first.mood).toBe('warm_amber');
    expect(first.camera).toBe('wide');
    expect(first.direction).toBeTruthy();

    const spouseEntry = snap.entries.find((e) => e.speaker === 'phantom_spouse');
    expect(spouseEntry?.vo).toBe(true);
    expect(spouseEntry?.portrait).toBe('phantom_spouse');
  });

  it('persists Ink state via appendKnot without wiping visit counts and parses Hold-to-Prune choices', () => {
    const store = new StateStore();
    const runner = new DialogueRunner(store, () => {});
    runner.startKnot('sibling_comms_hub');
    const afterTopic = runner.choose(0);
    expect(afterTopic.choices.length).toBe(3);

    // Navigating via appendKnot preserves prior once-only choices / state and saves inkStateJson
    expect(store.getState().inkStateJson).toBeTruthy();

    const auditSnap = runner.startKnot('overseer_interrogation');
    const volley2 = runner.choose(0);
    const holdChoice = volley2.choices.find((c) => c.requiresHoldPrune);
    expect(holdChoice).toBeDefined();
    expect(holdChoice?.text).not.toContain('HOLD TO COMPRESS');
    expect(auditSnap.entries.length).toBeGreaterThan(0);
  });

  it('syncs EXTERNAL mutations immediately back into Ink so aftermath branches accurately', () => {
    const store = new StateStore();
    const runner = new DialogueRunner(store, () => {});
    runner.startKnot('overseer_interrogation');
    const v2 = runner.choose(0);
    const pruneIdx = v2.choices.findIndex((c) => c.requiresHoldPrune);
    expect(pruneIdx).toBeGreaterThanOrEqual(0);

    const afterPrune = runner.choose(pruneIdx);
    expect(afterPrune.resumeDreamKnot).toBe('dream_shift1_aftermath');
    expect(store.getState().maxHumanity).toBe(64);
    expect(store.getState().prunedPersonas).toContain('phantom_spouse');

    const aftermath = runner.appendKnot('dream_shift1_aftermath');
    expect(aftermath.entries.some((e) => e.lineId === 'dream_after_pruned')).toBe(true);
  });
});
