import charactersData from '../../content/characters.json';
import type { AudioEngine } from '../../engine/AudioEngine';
import type { DialogueEntry, DialogueRunner, DialogueSnapshot } from '../../engine/DialogueRunner';
import type { StateStore } from '../../engine/StateStore';
import type { TelemetryLogger } from '../../engine/TelemetryLogger';
import type { VoiceEngine, VoiceRequest } from '../../engine/voice/VoiceEngine';
import { renderSpeakerAvatar } from '../SpeakerAvatar';

interface CharacterInfo {
  displayName: string;
  role: string;
  accentColor: string;
}

const CHAR_MAP = charactersData.characters as Record<string, CharacterInfo>;

/**
 * Modular editorial dialogue renderer supporting live 220ms reply pacing,
 * non-blinking history vs. new lines, voice replay via stable lineId,
 * and telemetry choice logging.
 */
export class DialogueFeedView {
  private replyBeatTimer: number | null = null;

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
  }

  speakEntries(entries: DialogueEntry[]): void {
    if (!entries.length) return;
    const reqs: VoiceRequest[] = entries.map((e) => ({
      lineId: e.lineId,
      text: e.text,
      speaker: e.speaker,
      emotion: e.emotion,
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
        typingSpeaker: snap.lastAddedEntries[0].speaker,
      });
      choicesEl.innerHTML = '';

      this.replyBeatTimer = window.setTimeout(() => {
        this.replyBeatTimer = null;
        this.speakEntries(snap.lastAddedEntries);
        onSettled(snap);
      }, 220);
      return;
    }

    this.speakEntries(snap.lastAddedEntries);
    onSettled(snap);
  }

  renderEntriesOnly(
    scrollEl: HTMLElement,
    entries: DialogueEntry[],
    opts?: { animateFromIndex?: number; typingSpeaker?: string }
  ): void {
    const s = this.store.getState();
    const animateFrom = opts?.animateFromIndex ?? 0;

    const entryHtml = entries
      .map((entry, idx) => {
        const ch = CHAR_MAP[entry.speaker] ?? CHAR_MAP.narrator;
        const playerClass = entry.isPlayerChoice ? 'is-player-echo' : '';
        const animClass = idx < animateFrom ? 'is-history' : 'is-new';
        const avH = entry.speaker === 'sibling_primary' ? s.primarySiblingH : s.humanity;
        const canSpeak = !entry.isPlayerChoice && !(entry.text.startsWith('[') && entry.text.endsWith(']'));
        return `
          <div class="dialogue-entry role-${ch.role} ${playerClass} ${animClass}" style="border-left-color:${ch.accentColor};">
            <div class="dialogue-entry-head">
              ${renderSpeakerAvatar(entry.speaker, avH, 24, true)}
              <div class="dialogue-speaker" style="color:${ch.accentColor};">${ch.displayName}</div>
              ${
                canSpeak
                  ? `<button class="voice-replay-btn" data-replay-idx="${idx}" type="button" title="Listen to line">▶</button>`
                  : ''
              }
            </div>
            <div class="dialogue-text">${entry.text}</div>
          </div>
        `;
      })
      .join('');

    let typingHtml = '';
    if (opts?.typingSpeaker) {
      const tch = CHAR_MAP[opts.typingSpeaker] ?? CHAR_MAP.narrator;
      const tavH = opts.typingSpeaker === 'sibling_primary' ? s.primarySiblingH : s.humanity;
      typingHtml = `
        <div class="dialogue-typing" style="border-left-color:${tch.accentColor};">
          ${renderSpeakerAvatar(opts.typingSpeaker, tavH, 20, true)}
          <span class="typing-name" style="color:${tch.accentColor};">${tch.displayName}</span>
          <span class="typing-dots" aria-label="Responding"><i></i><i></i><i></i></span>
        </div>
      `;
    }

    scrollEl.innerHTML = entryHtml + typingHtml;
    scrollEl.scrollTop = scrollEl.scrollHeight;

    scrollEl.querySelectorAll<HTMLButtonElement>('.voice-replay-btn').forEach((btn) => {
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
        .map(
          (c, i) => `
          <button class="choice-line" data-choice-index="${c.index}" type="button">
            <span class="choice-num">${i + 1}.</span>
            <span>${c.text}</span>
          </button>
        `
        )
        .join('');
      choicesEl.querySelectorAll<HTMLButtonElement>('.choice-line').forEach((btn) => {
        btn.addEventListener('mouseenter', () => this.audio.playHoverTick());
        btn.addEventListener('click', () => {
          this.audio.playCue('choice');
          handlers.onChoose(Number(btn.dataset.choiceIndex));
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
