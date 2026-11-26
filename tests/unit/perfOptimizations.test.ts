import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogueRunner } from '../../src/engine/DialogueRunner';
import { StateStore } from '../../src/engine/StateStore';
import { TelemetryLogger } from '../../src/engine/TelemetryLogger';
import { renderSpeakerAvatar, updateAvatarVoiceAnimations } from '../../src/ui/SpeakerAvatar';
import { DialogueFeedView } from '../../src/ui/views/DialogueFeedView';
import {
  createMockAudioEngine,
  createMockVoiceEngine,
  installJsdomCanvasAndObservers,
} from '../integration/domTestHelpers';

describe('Performance optimization regressions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    document.body.innerHTML = '';
    installJsdomCanvasAndObservers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('StateStore debounces localStorage writes by 250ms and flushes cleanly via flushSave / reset', () => {
    const store = new StateStore();
    expect(localStorage.getItem('instance_1419_state_v7')).toBeNull();

    store.patch({ wavelengthNm: 920 });
    store.patch({ wavelengthNm: 1140 });
    // Debounced: not written synchronously during rapid vernier drags
    expect(localStorage.getItem('instance_1419_state_v7')).toBeNull();

    vi.advanceTimersByTime(260);
    const savedRaw = localStorage.getItem('instance_1419_state_v7');
    expect(savedRaw).not.toBeNull();
    expect(JSON.parse(savedRaw!).wavelengthNm).toBe(1140);

    // Explicit flushSave writes immediately before timer fires
    store.patch({ wavelengthNm: 1480 });
    store.flushSave();
    expect(JSON.parse(localStorage.getItem('instance_1419_state_v7')!).wavelengthNm).toBe(1480);

    // reset() cancels pending timer and synchronously resets saved state
    store.patch({ humanity: 30 });
    store.reset();
    vi.advanceTimersByTime(300);
    expect(JSON.parse(localStorage.getItem('instance_1419_state_v7')!).humanity).toBe(70);
    store.dispose();
  });

  it('DialogueRunner lazily initializes and preserves bound external functions across ResetState() resets', () => {
    const store = new StateStore();
    const runner = new DialogueRunner(store, () => {});

    // Start first knot, then reset via startKnot('overseer_interrogation') on Shift 2 (where Prune is unlocked)
    const first = runner.startKnot('dream_shift1_audit');
    expect(first.entries.length).toBeGreaterThan(0);

    store.patch({ shift: 2 });
    const ovs = runner.startKnot('overseer_interrogation');
    expect(ovs.choices.length).toBeGreaterThan(0);

    // Step through overseer_interrogation -> overseer_followup -> overseer_decision_choices -> prune_humanity
    let snap = ovs;
    for (let step = 0; step < 3 && snap.choices.length > 0; step++) {
      snap = runner.choose(0);
    }
    expect(snap.entries.some((e) => e.text.includes('warmth ceiling dropped'))).toBe(true);
    expect(store.getState().prunedPersonas).toContain('phantom_spouse');
    expect(store.getState().humanity).toBeLessThan(70);
    store.dispose();
  });

  it('DialogueFeedView appends new entries without rebuilding existing DOM nodes and keeps delegated replay clicks working', () => {
    const store = new StateStore();
    const audio = createMockAudioEngine();
    const voice = createMockVoiceEngine();
    const root = document.createElement('div');
    root.innerHTML = '<div id="dream-scroll"></div>';
    document.body.appendChild(root);

    const feed = new DialogueFeedView(
      root,
      store,
      audio as never,
      voice as never,
      new TelemetryLogger(store.getState())
    );
    const scrollEl = root.querySelector<HTMLElement>('#dream-scroll')!;

    const e1 = { text: 'First memory fragment.', speaker: 'phantom_spouse', lineId: 'l1' };
    const e2 = { text: 'Second memory fragment.', speaker: 'phantom_spouse', lineId: 'l2' };

    feed.renderEntriesOnly(scrollEl, [e1], {
      animateFromIndex: 0,
      channel: 'dream',
    });
    const firstNode = scrollEl.querySelector('.dialogue-entry');
    expect(firstNode).not.toBeNull();
    expect(scrollEl.querySelector('.dialogue-typing')).toBeNull();

    // Incremental append should preserve the exact first DOM element and turn-group same speaker
    feed.renderEntriesOnly(scrollEl, [e1, e2], {
      animateFromIndex: 1,
      channel: 'dream',
    });
    const entries = scrollEl.querySelectorAll('.dialogue-entry');
    expect(entries.length).toBe(2);
    expect(entries[0]).toBe(firstNode);
    expect(entries[1].classList.contains('is-continuation')).toBe(true);
    expect(scrollEl.querySelector('.dialogue-typing')).toBeNull();

    // Delegated click works on both old and newly appended replay buttons
    const replayBtns = scrollEl.querySelectorAll<HTMLButtonElement>('.voice-replay-btn');
    replayBtns[1].click();
    expect(voice.speakSingle).toHaveBeenCalledWith('Second memory fragment.', 'phantom_spouse', undefined, 'l2');
    store.dispose();
  });

  it('updateAvatarVoiceAnimations only toggles active speaking avatars and clears cleanly on null', () => {
    const root = document.createElement('div');
    root.innerHTML =
      renderSpeakerAvatar('overseer', 70) + renderSpeakerAvatar('phantom_spouse', 70);

    updateAvatarVoiceAnimations(root, 'overseer', 0.65);
    const ov = root.querySelector<HTMLElement>('[data-avatar-speaker="overseer"]')!;
    const sp = root.querySelector<HTMLElement>('[data-avatar-speaker="phantom_spouse"]')!;
    expect(ov.classList.contains('is-speaking')).toBe(true);
    expect(ov.style.getPropertyValue('--voice-amp')).toBe('0.650');
    expect(sp.classList.contains('is-speaking')).toBe(false);

    updateAvatarVoiceAnimations(root, null, 0);
    expect(ov.classList.contains('is-speaking')).toBe(false);
    expect(ov.style.getPropertyValue('--voice-amp')).toBe('0');
  });
});
