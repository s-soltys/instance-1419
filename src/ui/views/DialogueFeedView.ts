import charactersData from '../../content/characters.json';
import type { AudioEngine } from '../../engine/AudioEngine';
import type { DialogueEntry, DialogueRunner, DialogueSnapshot } from '../../engine/DialogueRunner';
import type { StateStore } from '../../engine/StateStore';
import type { TelemetryLogger } from '../../engine/TelemetryLogger';
import type { VoiceEngine, VoiceRequest } from '../../engine/voice/VoiceEngine';

interface CharacterInfo {
  displayName: string;
  role: string;
  accentColor: string;
}

const CHAR_MAP = charactersData.characters as Record<string, CharacterInfo>;
const HOLD_PRUNE_MS = 750;

/**
 * Editorial dialogue renderer: zero chat-app typing bubbles, inline geometric avatars,
 * or boxed per-line play buttons. Supports Hold-to-Prune pointer choreography and
 * margin-whisper styling for Internal Psyche voices.
 */
export class DialogueFeedView {
  private replyBeatTimer: number | null = null;
  private activeHoldRaf = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly store: StateStore,
    private readonly audio: AudioEngine,
    private readonly voice: VoiceEngine,
    private readonly telemetry: TelemetryLogger
  ) {}

  clearReplyBeatTimer(): void {
    if (this.replyBeatTimer !== null) {
      window.clearTimeout(this.replyBeatTimer);
      this.replyBeatTimer = null;
    }
    if (this.activeHoldRaf) {
      cancelAnimationFrame(this.activeHoldRaf);
      this.activeHoldRaf = 0;
    }
  }

  speakEntries(entries: DialogueEntry[]): void {
    if (!entries.length) return;
    const reqs: VoiceRequest[] = entries.map((e) => ({
      lineId: e.lineId,
      text: e.text,
      speaker: e.speaker,
      emotion: e.emotion,
      vo: e.vo,
    }));
    this.voice.speakQueue(reqs);
  }

  handleChoice(
    scrollSel: string,
    choicesSel: string,
    runner: DialogueRunner,
    idx: number,
    onSettled: (snap: DialogueSnapshot) => void
  ): void {
    this.clearReplyBeatTimer();
    this.voice.stop();

    const snap = runner.choose(idx);
    this.telemetry.record('dialogue_choice', this.store.getState(), {
      knot: snap.knot,
      choiceIndex: idx,
    });

    const scrollEl = this.root.querySelector<HTMLElement>(scrollSel);
    const choicesEl = this.root.querySelector<HTMLElement>(choicesSel);

    if (scrollEl && choicesEl && snap.lastAddedEntries.length > 0) {
      const preReplyCount = Math.max(0, snap.entries.length - snap.lastAddedEntries.length);
      const preReplyEntries = snap.entries.slice(0, preReplyCount);
      this.renderEntriesOnly(scrollEl, preReplyEntries, {
        animateFromIndex: Math.max(0, preReplyCount - 1),
      });
      choicesEl.innerHTML = '';

      this.replyBeatTimer = window.setTimeout(() => {
        this.replyBeatTimer = null;
        this.speakEntries(snap.lastAddedEntries);
        onSettled(snap);
      }, 190);
      return;
    }

    this.speakEntries(snap.lastAddedEntries);
    onSettled(snap);
  }

  renderEntriesOnly(
    scrollEl: HTMLElement,
    entries: DialogueEntry[],
    opts?: { animateFromIndex?: number }
  ): void {
    const animateFrom = opts?.animateFromIndex ?? 0;

    const entryHtml = entries
      .map((entry, idx) => {
        const ch = CHAR_MAP[entry.speaker] ?? CHAR_MAP.narrator;
        const playerClass = entry.isPlayerChoice ? 'is-player-echo' : '';
        const psycheClass = ch.role === 'psyche' ? 'is-psyche' : '';
        const animClass = idx < animateFrom ? 'is-history' : 'is-new';
        const canSpeak = !entry.isPlayerChoice && !(entry.text.startsWith('[') && entry.text.endsWith(']'));
        const speakerLabel = canSpeak
          ? `<button class="dialogue-speaker speaker-replay" data-replay-idx="${idx}" type="button" style="color:${ch.accentColor};" title="Replay line">${ch.displayName}<span class="replay-hint"> ▸</span></button>`
          : `<div class="dialogue-speaker" style="color:${ch.accentColor};">${ch.displayName}</div>`;

        return `
          <div class="dialogue-entry role-${ch.role} ${playerClass} ${psycheClass} ${animClass}" style="border-left-color:${ch.accentColor};">
            <div class="dialogue-entry-head">
              ${speakerLabel}
            </div>
            <div class="dialogue-text">${entry.text}</div>
          </div>
        `;
      })
      .join('');

    scrollEl.innerHTML = entryHtml;
    scrollEl.scrollTop = scrollEl.scrollHeight;
    requestAnimationFrame(() => {
      scrollEl.scrollTop = scrollEl.scrollHeight;
    });

    scrollEl.querySelectorAll<HTMLButtonElement>('.speaker-replay').forEach((btn) => {
      btn.addEventListener('click', () => {
        const entry = entries[Number(btn.dataset.replayIdx)];
        if (entry) {
          this.voice.speakSingle(entry.text, entry.speaker, entry.emotion, entry.lineId);
        }
      });
    });
  }

  renderInto(
    scrollSel: string,
    choicesSel: string,
    snap: DialogueSnapshot,
    handlers: {
      onChoose: (idx: number) => void;
      onPruneHoldProgress?: (progress01: number) => void;
      onResumeDream?: (nextKnot: string) => void;
      onWakeToSky?: () => void;
      onCloseComms?: () => void;
    }
  ): void {
    const scrollEl = this.root.querySelector<HTMLElement>(scrollSel)!;
    const choicesEl = this.root.querySelector<HTMLElement>(choicesSel)!;

    const animateFrom = Math.max(0, snap.entries.length - Math.max(1, snap.lastAddedEntries.length));
    this.renderEntriesOnly(scrollEl, snap.entries, { animateFromIndex: animateFrom });

    if (snap.choices.length > 0) {
      choicesEl.innerHTML = snap.choices
        .map((c, i) => {
          if (c.requiresHoldPrune) {
            return `
              <button class="choice-line hold-prune-choice" data-choice-index="${c.index}" type="button">
                <span class="hold-prune-fill" aria-hidden="true"></span>
                <span class="choice-num">${i + 1}.</span>
                <span class="choice-label-text">${c.text}</span>
                <span class="hold-cue">HOLD TO COMPRESS</span>
              </button>
            `;
          }
          return `
            <button class="choice-line" data-choice-index="${c.index}" type="button">
              <span class="choice-num">${i + 1}.</span>
              <span>${c.text}</span>
            </button>
          `;
        })
        .join('');

      choicesEl.querySelectorAll<HTMLButtonElement>('.choice-line').forEach((btn) => {
        const choiceIdx = Number(btn.dataset.choiceIndex);
        btn.addEventListener('mouseenter', () => this.audio.playHoverTick());

        if (!btn.classList.contains('hold-prune-choice')) {
          btn.addEventListener('click', () => {
            this.audio.playCue('choice');
            handlers.onChoose(choiceIdx);
          });
          return;
        }

        // Hold-to-Prune interaction (live Voronoi preview on hold, release cancels)
        const fillEl = btn.querySelector<HTMLElement>('.hold-prune-fill');
        let holding = false;
        let committed = false;
        let startMs = 0;

        const cancelHold = () => {
          if (!holding) return;
          holding = false;
          if (this.activeHoldRaf) {
            cancelAnimationFrame(this.activeHoldRaf);
            this.activeHoldRaf = 0;
          }
          btn.classList.remove('is-holding');
          if (fillEl) fillEl.style.width = '0%';
          handlers.onPruneHoldProgress?.(0);
        };

        const stepHold = () => {
          if (!holding || committed) return;
          const p = Math.min(1, (performance.now() - startMs) / HOLD_PRUNE_MS);
          if (fillEl) fillEl.style.width = `${(p * 100).toFixed(1)}%`;
          handlers.onPruneHoldProgress?.(p);
          if (p >= 1) {
            committed = true;
            holding = false;
            this.activeHoldRaf = 0;
            btn.classList.remove('is-holding');
            handlers.onPruneHoldProgress?.(0);
            handlers.onChoose(choiceIdx);
            return;
          }
          this.activeHoldRaf = requestAnimationFrame(stepHold);
        };

        btn.addEventListener('pointerdown', (e) => {
          if (e.button !== 0 && e.pointerType === 'mouse') return;
          committed = false;
          holding = true;
          startMs = performance.now();
          btn.classList.add('is-holding');
          this.audio.playCue('tick');
          this.activeHoldRaf = requestAnimationFrame(stepHold);
        });
        btn.addEventListener('pointerup', cancelHold);
        btn.addEventListener('pointercancel', cancelHold);
        btn.addEventListener('pointerleave', cancelHold);
        btn.addEventListener('click', (e) => {
          // Support keyboard Enter/Space or synthetic automated .click() cleanly
          if (e.detail === 0 && !committed) {
            committed = true;
            handlers.onChoose(choiceIdx);
          }
        });
      });
      return;
    }

    if (snap.resumeDreamKnot && handlers.onResumeDream) {
      const nextKnot = snap.resumeDreamKnot;
      choicesEl.innerHTML = `
        <button class="choice-line" id="btn-overseer-return" type="button">
          <span class="choice-num">1.</span>
          <span>Return to the dream</span>
        </button>
      `;
      choicesEl.querySelector('#btn-overseer-return')?.addEventListener('click', () => {
        this.audio.playCue('tick');
        handlers.onResumeDream!(nextKnot);
      });
      return;
    }

    if (scrollSel === '#dream-scroll' && !snap.autoInterruptKnot && handlers.onWakeToSky) {
      choicesEl.innerHTML = `
        <button class="choice-line" id="btn-return-3d" type="button"><span class="choice-num">1.</span><span>Wake up and return to the sky</span></button>
      `;
      choicesEl.querySelector('#btn-return-3d')?.addEventListener('click', () => {
        this.audio.playCue('boot_click');
        this.voice.stop();
        handlers.onWakeToSky!();
      });
    } else if (scrollSel === '#comms-scroll' && handlers.onCloseComms) {
      choicesEl.innerHTML = `<button class="choice-line" id="btn-comms-done" type="button"><span class="choice-num">→</span><span>Close relay</span></button>`;
      choicesEl.querySelector('#btn-comms-done')?.addEventListener('click', () => {
        this.audio.playCue('tick');
        handlers.onCloseComms!();
      });
    }
  }
}
