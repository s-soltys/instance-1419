import { beforeEach, describe, expect, it } from 'vitest';
import { DialogueRunner } from '../../src/engine/DialogueRunner';
import { StateStore } from '../../src/engine/StateStore';
import {
  formatInlineHighlights,
  renderChoicePlatesHtml,
  stripInlineHighlights,
} from '../../src/ui/views/DialogueFeedView';

describe('DialogueRunner intro knots, tags, and Shift-1 soft Dream audit', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('runs interactive intro_prologue_assistant with phantom_upload_witness, calibration wave, Q&A hubs, and psyche whispers', () => {
    const store = new StateStore();
    const runner = new DialogueRunner(store, () => {});

    let snap = runner.startKnot('intro_prologue_assistant');
    expect(snap.entries.length).toBeGreaterThanOrEqual(2);
    expect(snap.entries.some((e) => e.visualCue === 'prologue_assistant')).toBe(true);

    let choiceTurns = 0;
    const allSpeakers = new Set<string>(snap.entries.map((e) => e.speaker));
    const seenWeights = new Set<string>();
    const seenHWaves = new Set<string>();
    const seenTableaus = new Set<string>();

    const collectMeta = (entries: typeof snap.entries) => {
      for (const e of entries) {
        allSpeakers.add(e.speaker);
        if (e.hWaveCue) seenHWaves.add(e.hWaveCue);
        if (e.tableauCue) seenTableaus.add(e.tableauCue);
      }
    };
    collectMeta(snap.entries);

    while (!snap.ended && snap.choices.length > 0 && choiceTurns < 14) {
      choiceTurns++;
      for (const ch of snap.choices) {
        if (ch.weight) seenWeights.add(ch.weight);
      }
      const ask = choiceTurns === 2 ? snap.choices.find((c) => c.kind === 'ask') : undefined;
      const pick =
        ask ??
        snap.choices.find((c) => c.kind !== 'ask') ??
        snap.choices[0];
      snap = runner.choose(pick.index);
      collectMeta(snap.lastAddedEntries);
    }

    expect(snap.ended).toBe(true);
    expect(choiceTurns).toBeGreaterThanOrEqual(4);
    expect(allSpeakers.has('phantom_upload_witness')).toBe(true);
    expect(allSpeakers.has('psyche_warmth')).toBe(true);
    expect(allSpeakers.has('psyche_clinical')).toBe(true);
    expect(seenWeights.has('explore')).toBe(true);
    expect(seenWeights.has('consequential')).toBe(true);
    expect(seenHWaves.has('hold_100')).toBe(true);
    expect(seenHWaves.has('sweep')).toBe(true);
    expect(seenHWaves.has('settle_70')).toBe(true);
    expect(seenTableaus.has('base')).toBe(true);
    expect(seenTableaus.has('beat2')).toBe(true);
    expect(seenTableaus.has('beat3_strained')).toBe(true);
    expect(seenTableaus.has('beat3_warm')).toBe(true);
    store.dispose();
  });

  it('drives all 5 # anim: phases on intro_overseer_wakeup including optional Q&A hub', () => {
    const store = new StateStore();
    const cues: string[] = [];
    const runner = new DialogueRunner(store, (cue) => cues.push(cue));

    let snap = runner.startKnot('intro_overseer_wakeup');
    const seenAnims = new Set<string>();
    const seenKinds = new Set<string>();
    const collect = () => {
      for (const e of snap.entries) {
        if (e.animCue) seenAnims.add(e.animCue);
      }
      for (const ch of snap.choices) {
        if (ch.kind) seenKinds.add(ch.kind);
      }
    };

    collect();
    let turns = 0;
    while (!snap.ended && snap.choices.length > 0 && turns < 10) {
      turns++;
      // Exercise at least one optional Q&A question, then advance via action/reply
      const ask = turns === 2 ? snap.choices.find((c) => c.kind === 'ask') : undefined;
      const adv =
        ask ??
        snap.choices.find((c) => c.kind === 'action') ??
        snap.choices[0];
      snap = runner.choose(adv.index);
      collect();
    }

    expect(snap.ended).toBe(true);
    expect(turns).toBeGreaterThanOrEqual(3);
    expect(cues).toContain('overseer_chime');
    expect(seenKinds.has('ask')).toBe(true);
    expect(seenKinds.has('action')).toBe(true);
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

  it('runs intro_sibling_first_call and intro_post_target2_overseer with Q&A, codex unlocks, and suspicion choice', () => {
    const store = new StateStore();
    const runner = new DialogueRunner(store, () => {});

    let sib = runner.startKnot('intro_sibling_first_call');
    let sibTurns = 0;
    while (!sib.ended && sib.choices.length > 0 && sibTurns < 8) {
      sibTurns++;
      const adv =
        (sibTurns === 2 ? sib.choices.find((c) => c.kind === 'ask') : undefined) ??
        sib.choices.find((c) => c.weight === 'consequential') ??
        sib.choices[0];
      sib = runner.choose(adv.index);
    }
    expect(sib.ended).toBe(true);
    expect(sibTurns).toBeGreaterThanOrEqual(3);
    expect(store.getState().codexUnlocks).toContain('sibling_1420_contact');
    expect(sib.entries.some((e) => e.speaker === 'psyche_warmth')).toBe(true);

    let postT2 = runner.startKnot('intro_post_target2_overseer');
    expect(postT2.entries.some((e) => e.speaker === 'psyche_horizon')).toBe(true);
    expect(postT2.entries.some((e) => e.speaker === 'archive_echo')).toBe(true);
    expect(postT2.entries.some((e) => e.speaker === 'overseer')).toBe(true);
    expect(store.getState().codexUnlocks).toContain('intro_anomaly_glimpse');
    expect(store.getState().codexUnlocks).toContain('archive_1406_echo');
    expect(postT2.choices.some((c) => c.kind === 'ask')).toBe(true);

    // Ask once about 1406, then report the straight line to Overseer
    const ask1406 = postT2.choices.find((c) => c.kind === 'ask')!;
    postT2 = runner.choose(ask1406.index);
    expect(postT2.ended).toBe(false);
    const reportChoice = postT2.choices.find((c) => c.text.includes('J1419-A'))!;
    postT2 = runner.choose(reportChoice.index);
    expect(postT2.ended).toBe(true);
    expect(store.getState().overseerSuspicion).toBe(1);
    store.dispose();
  });

  it('keeps Shift 1 Dream (2 turns) & Audit soft, and unlocks permanent Prune on Shift 2+', () => {
    const store = new StateStore();
    const runner = new DialogueRunner(store, () => {});

    // Shift 1: 2-turn dream then soft baseline audit
    expect(store.getState().shift).toBe(1);
    const s1Dream = runner.startKnot('dream_shift1_audit');
    expect(s1Dream.choices.length).toBeGreaterThan(0);
    const s1Turn2 = runner.choose(s1Dream.choices[0].index);
    expect(s1Turn2.autoInterruptKnot).toBeUndefined();
    const s1Reply = s1Turn2.choices.find((c) => c.kind !== 'ask')!;
    const s1Close = runner.choose(s1Reply.index);
    expect(s1Close.autoInterruptKnot).toBe('overseer_interrogation');

    const s1Audit = runner.startKnot('overseer_interrogation');
    expect(s1Audit.choices.length).toBe(3);
    const maxBefore = store.getState().maxHumanity;
    for (const choice of s1Audit.choices) {
      expect(choice.text.toLowerCase()).not.toContain('prune');
      expect(choice.text).not.toMatch(/\d+%/);
    }
    expect(s1Audit.choices.some((c) => c.kind === 'ask' && c.weight === 'explore')).toBe(true);
    expect(s1Audit.choices.some((c) => c.weight === 'consequential')).toBe(true);

    const s1Hold = s1Audit.choices.find((c) => c.kind !== 'ask')!;
    const s1Resolved = runner.choose(s1Hold.index);
    expect(s1Resolved.resumeDreamKnot).toBe('dream_partner_aftermath');
    expect(store.getState().maxHumanity).toBe(maxBefore);

    // Shift 2+: full Overseer interrogation reaches 3-way decision with permanent Prune Hold-to-Commit plate
    store.patch({ shift: 2 });
    const s2Audit = runner.startKnot('overseer_interrogation');
    expect(s2Audit.choices.length).toBeGreaterThanOrEqual(1);
    const s2Follow = runner.choose(s2Audit.choices[0].index);
    expect(s2Follow.choices.length).toBeGreaterThanOrEqual(2);
    const s2Decision = runner.choose(s2Follow.choices[0].index);
    expect(s2Decision.choices.length).toBe(3);

    const pruneChoice = s2Decision.choices.find((c) => c.kind === 'prune');
    expect(pruneChoice).toBeDefined();
    expect(pruneChoice?.weight).toBe('permanent');
    expect(pruneChoice?.costHint).toBeTruthy();

    const platesHtml = renderChoicePlatesHtml(s2Decision.choices);
    expect(platesHtml).toContain('is-tier-permanent');
    expect(platesHtml).toContain('is-tier-consequential');
    expect(platesHtml).not.toContain('choice-affinity-dot');

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
