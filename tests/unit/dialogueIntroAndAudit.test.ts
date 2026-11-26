import { beforeEach, describe, expect, it } from 'vitest';
import { DialogueRunner } from '../../src/engine/DialogueRunner';
import { StateStore } from '../../src/engine/StateStore';
import { formatInlineHighlights, stripInlineHighlights } from '../../src/ui/views/DialogueFeedView';

describe('DialogueRunner intro knots, tags, and Shift-1 soft Dream audit', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('runs interactive intro_prologue_kitchen strictly with phantom_spouse and # affinity warm/cold choices', () => {
    const store = new StateStore();
    const runner = new DialogueRunner(store, () => {});

    let snap = runner.startKnot('intro_prologue_kitchen');
    expect(snap.entries.length).toBeGreaterThan(0);
    expect(snap.entries.some((e) => e.visualCue === 'prologue_kitchen')).toBe(true);

    let choiceTurns = 0;
    const allSpeakers = new Set<string>(snap.entries.map((e) => e.speaker));
    const seenAffinities = new Set<string>();

    while (!snap.ended && snap.choices.length > 0 && choiceTurns < 5) {
      choiceTurns++;
      for (const ch of snap.choices) {
        if (ch.affinity) seenAffinities.add(ch.affinity);
      }
      snap = runner.choose(snap.choices[0].index);
      for (const e of snap.lastAddedEntries) allSpeakers.add(e.speaker);
    }

    expect(snap.ended).toBe(true);
    expect(choiceTurns).toBeGreaterThanOrEqual(2);
    expect(seenAffinities.has('warm')).toBe(true);
    expect(seenAffinities.has('cold')).toBe(true);
    for (const sp of allSpeakers) {
      expect(sp.startsWith('psyche_')).toBe(false);
    }
    store.dispose();
  });

  it('drives all 5 # anim: phases on intro_overseer_wakeup with interactive warm/cold choices', () => {
    const store = new StateStore();
    const cues: string[] = [];
    const runner = new DialogueRunner(store, (cue) => cues.push(cue));

    let snap = runner.startKnot('intro_overseer_wakeup');
    const seenAnims = new Set<string>();
    const seenAffinities = new Set<string>();
    const collectAnims = () => {
      for (const e of snap.entries) {
        if (e.animCue) seenAnims.add(e.animCue);
        expect(e.speaker.startsWith('psyche_')).toBe(false);
      }
    };

    collectAnims();
    let turns = 0;
    while (!snap.ended && snap.choices.length > 0 && turns < 5) {
      turns++;
      for (const ch of snap.choices) {
        if (ch.affinity) seenAffinities.add(ch.affinity);
      }
      snap = runner.choose(snap.choices[0].index);
      collectAnims();
    }

    expect(snap.ended).toBe(true);
    expect(turns).toBeGreaterThanOrEqual(2);
    expect(cues).toContain('overseer_chime');
    expect(seenAffinities.has('warm')).toBe(true);
    expect(seenAffinities.has('cold')).toBe(true);
    expect([...seenAnims]).toEqual(
      expect.arrayContaining([
        'anim_transfer',
        'anim_epochs',
        'anim_shell',
        'anim_blind_clock',
        'anim_aperture',
      ])
    );
    store.dispose();
  });

  it('runs intro_sibling_first_call and intro_post_target2_overseer with zero Psyche chatter and codex unlocks', () => {
    const store = new StateStore();
    const runner = new DialogueRunner(store, () => {});

    let sib = runner.startKnot('intro_sibling_first_call');
    let sibTurns = 0;
    while (!sib.ended && sib.choices.length > 0 && sibTurns < 5) {
      sibTurns++;
      sib = runner.choose(sib.choices[0].index);
    }
    expect(sib.ended).toBe(true);
    expect(sibTurns).toBeGreaterThanOrEqual(2);
    expect(store.getState().codexUnlocks).toContain('sibling_1420_contact');
    expect(sib.entries.every((e) => !e.speaker.startsWith('psyche_'))).toBe(true);

    const postT2 = runner.startKnot('intro_post_target2_overseer');
    expect(postT2.choices).toHaveLength(0);
    expect(postT2.entries.some((e) => e.speaker === 'archive_echo')).toBe(true);
    expect(postT2.entries.some((e) => e.speaker === 'overseer')).toBe(true);
    expect(postT2.entries.every((e) => !e.speaker.startsWith('psyche_'))).toBe(true);
    expect(store.getState().codexUnlocks).toContain('intro_anomaly_glimpse');
    expect(store.getState().codexUnlocks).toContain('archive_1406_echo');
    store.dispose();
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
    const maxBefore = store.getState().maxHumanity;
    for (const choice of s1Audit.choices) {
      expect(choice.text.toLowerCase()).not.toContain('prune');
      expect(choice.text).not.toMatch(/\d+%/);
    }
    expect(s1Audit.choices.some((c) => c.affinity === 'warm')).toBe(true);
    expect(s1Audit.choices.some((c) => c.affinity === 'cold')).toBe(true);

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
    store.dispose();
  });

  it('safely formats and strips inline [[warm:...]] / [[cold:...]] highlights without XSS', () => {
    const raw = 'Remember [[warm:your laugh]] vs [[cold:<b>archive</b> zero]].';
    const html = formatInlineHighlights(raw);
    expect(html).toContain('<span class="hl-warm">your laugh</span>');
    expect(html).toContain('<span class="hl-cold">&lt;b&gt;archive&lt;/b&gt; zero</span>');
    expect(stripInlineHighlights(raw)).toBe('Remember your laugh vs <b>archive</b> zero.');
  });
});
