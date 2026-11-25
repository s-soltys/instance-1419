import { beforeEach, describe, expect, it } from 'vitest';
import { DialogueRunner } from '../../src/engine/DialogueRunner';
import { StateStore } from '../../src/engine/StateStore';

describe('DialogueRunner intro knots, tags, and Shift-1 soft Dream audit', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('parses # visual:<key>, # audio:<key>, and speaker transitions on intro_prologue with 0 choices', () => {
    const store = new StateStore();
    const cues: string[] = [];
    const runner = new DialogueRunner(store, (cue) => cues.push(cue));

    const snap = runner.startKnot('intro_prologue');
    expect(snap.choices).toHaveLength(0);
    expect(snap.ended).toBe(true);
    expect(snap.entries.length).toBeGreaterThanOrEqual(4);

    const visuals = snap.entries.map((e) => e.visualCue).filter(Boolean);
    expect(visuals).toContain('prologue_kitchen');
    expect(visuals).toContain('prologue_fracture');
    expect(visuals).toContain('prologue_starfield');
    expect(cues).toContain('overseer_chime');
  });

  it('parses # whisper tags on intro diegetic sky whispers and unlocks codex keys', () => {
    const store = new StateStore();
    const runner = new DialogueRunner(store, () => {});

    const t1 = runner.startKnot('intro_whisper_target1');
    expect(t1.entries.length).toBeGreaterThanOrEqual(1);
    expect(t1.entries[0].whisper).toBe(true);

    const t2Lock = runner.startKnot('intro_whisper_target2_lock');
    expect(t2Lock.entries.some((e) => e.speaker === 'psyche_horizon')).toBe(true);
    expect(store.getState().codexUnlocks).toContain('intro_anomaly_glimpse');

    const t2Done = runner.startKnot('intro_whisper_target2_done');
    expect(t2Done.entries.some((e) => e.speaker === 'archive_echo')).toBe(true);
    expect(store.getState().codexUnlocks).toContain('archive_1406_echo');
  });

  it('keeps Shift 1 Dream Audit soft (no permanent prune choice) and unlocks permanent Prune on Shift 2+', () => {
    const store = new StateStore();
    const runner = new DialogueRunner(store, () => {});

    // Shift 1: soft baseline audit
    expect(store.getState().shift).toBe(1);
    const s1Dream = runner.startKnot('dream_shift1_audit');
    expect(s1Dream.choices.length).toBeGreaterThan(0);
    const s1AfterWarm = runner.choose(s1Dream.choices[0].index);
    expect(s1AfterWarm.autoInterruptKnot).toBe('overseer_interrogation');

    const s1Audit = runner.startKnot('overseer_interrogation');
    expect(s1Audit.choices.length).toBe(2);
    // Neither choice should prune humanity below 70%
    const maxBefore = store.getState().maxHumanity;
    for (const choice of s1Audit.choices) {
      expect(choice.text.toLowerCase()).not.toContain('prune');
      expect(choice.text).not.toMatch(/\d+%/);
    }
    const s1Resolved = runner.choose(s1Audit.choices[0].index);
    expect(s1Resolved.resumeDreamKnot).toBe('dream_partner_aftermath');
    expect(store.getState().maxHumanity).toBe(maxBefore);

    // Shift 2+: full Overseer interrogation reaches 3-way decision with permanent Prune branch intact
    store.patch({ shift: 2 });
    const s2Audit = runner.startKnot('overseer_interrogation');
    expect(s2Audit.choices.length).toBeGreaterThanOrEqual(1);
    const s2Follow = runner.choose(s2Audit.choices[0].index);
    expect(s2Follow.choices.length).toBeGreaterThanOrEqual(2);
    const s2Decision = runner.choose(s2Follow.choices[0].index);
    expect(s2Decision.choices.length).toBe(3);

    const pruneChoice = s2Decision.choices.find((c) => c.text.toLowerCase().includes('cut it'));
    expect(pruneChoice).toBeDefined();
    const maxBeforePrune = store.getState().maxHumanity;
    const afterPruneSnap = runner.choose(pruneChoice!.index);
    expect(afterPruneSnap.resumeDreamKnot).toBe('dream_partner_aftermath');
    expect(store.getState().maxHumanity).toBeLessThan(maxBeforePrune);
    expect(store.getState().lastAuditOutcome).toBe('pruned');
  });
});
