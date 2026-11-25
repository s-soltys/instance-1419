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

export type DialogueChannel = 'dream' | 'comms' | 'overseer' | 'future' | 'prologue';

function inferChannel(scrollSel: string): DialogueChannel {
  if (scrollSel.includes('comms')) return 'comms';
  if (scrollSel.includes('overseer')) return 'overseer';
  if (scrollSel.includes('future')) return 'future';
  if (scrollSel.includes('prologue')) return 'prologue';
  return 'dream';
}

interface ScrollFeedCache {
  entries: DialogueEntry[];
  renderedCount: number;
  channel: DialogueChannel;
  humanityBucket: number;
  siblingBucket: number;
  boundClick: boolean;
}

function humanityAvatarBucket(h: number): number {
  return h < 45 ? 0 : h < 70 ? 1 : 2;
}

function prefixMatches(prev: DialogueEntry[], next: DialogueEntry[], count: number): boolean {
  for (let i = 0; i < count; i++) {
    const a = prev[i];
    const b = next[i];
    if (a === b) continue;
    if (
      !a ||
      !b ||
      a.text !== b.text ||
      a.speaker !== b.speaker ||
      Boolean(a.isPlayerChoice) !== Boolean(b.isPlayerChoice)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Modular editorial dialogue renderer supporting live 220ms reply pacing,
 * non-blinking history vs. voice-matched kinetic entrances, staggered choices
 * with selection pulse, voice replay via stable lineId, and telemetry logging.
 */
export class DialogueFeedView {
  private replyBeatTimer: number | null = null;
  private instantPacing = false;
  private readonly feedCache = new WeakMap<HTMLElement, ScrollFeedCache>();

  constructor(
    private readonly root: HTMLElement,
    private readonly store: StateStore,
    private readonly audio: AudioEngine,
    private readonly voice: VoiceEngine,
    private readonly telemetry: TelemetryLogger
  ) {}

  setInstantPacing(instant: boolean): void {
    this.instantPacing = instant;
  }

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
    const channel = inferChannel(scrollSel);

    if (!this.instantPacing && scrollEl && choicesEl && snap.lastAddedEntries.length > 0) {
      const preReplyCount = Math.max(0, snap.entries.length - snap.lastAddedEntries.length);
      const preReplyEntries = snap.entries.slice(0, preReplyCount);
      this.renderEntriesOnly(scrollEl, preReplyEntries, {
        animateFromIndex: Math.max(0, preReplyCount - 1),
        typingSpeaker: snap.lastAddedEntries[0].speaker,
        channel,
      });

      choicesEl.classList.add('is-locked');
      choicesEl.querySelectorAll<HTMLButtonElement>('.choice-line').forEach((btn) => {
        const isPicked = Number(btn.dataset.choiceIndex) === idx;
        btn.classList.toggle('is-selected', isPicked);
        btn.classList.toggle('is-dismissed', !isPicked);
      });

      this.replyBeatTimer = window.setTimeout(() => {
        this.replyBeatTimer = null;
        this.speakEntries(snap.lastAddedEntries);
        onSettled(snap);
      }, 280);
      return;
    }

    this.speakEntries(snap.lastAddedEntries);
    onSettled(snap);
  }

  private renderEntryHtml(
    entry: DialogueEntry,
    idx: number,
    animateFrom: number,
    channel: DialogueChannel,
    humanity: number,
    siblingH: number
  ): string {
    const ch = CHAR_MAP[entry.speaker] ?? CHAR_MAP.narrator;
    const playerClass = entry.isPlayerChoice ? 'is-player-echo' : '';
    const isNew = idx >= animateFrom;
    const animClass = isNew ? 'is-new' : 'is-history';
    const delayMs = isNew ? Math.min(4, Math.max(0, idx - animateFrom)) * 70 : 0;
    const avH = entry.speaker === 'sibling_primary' ? siblingH : humanity;
    const canSpeak =
      !entry.isPlayerChoice && !(entry.text.startsWith('[') && entry.text.endsWith(']'));
    return `
      <div class="dialogue-entry role-${ch.role} ${playerClass} ${animClass}" data-channel="${channel}" style="border-left-color:${ch.accentColor};--entry-delay:${delayMs}ms;">
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
  }

  private renderTypingHtml(
    typingSpeaker: string | undefined,
    channel: DialogueChannel,
    humanity: number,
    siblingH: number
  ): string {
    if (!typingSpeaker) return '';
    const tch = CHAR_MAP[typingSpeaker] ?? CHAR_MAP.narrator;
    const tavH = typingSpeaker === 'sibling_primary' ? siblingH : humanity;
    const indicator =
      channel === 'overseer'
        ? `<span class="typing-status">EVALUATING</span><span class="typing-cursor" aria-label="Evaluating"></span>`
        : channel === 'comms'
          ? `<span class="typing-status">RELAY PACKET</span><span class="typing-dots" aria-label="Receiving"><i></i><i></i><i></i></span>`
          : `<span class="typing-dots" aria-label="Responding"><i></i><i></i><i></i></span>`;
    return `
      <div class="dialogue-typing" data-channel="${channel}" style="border-left-color:${tch.accentColor};">
        ${renderSpeakerAvatar(typingSpeaker, tavH, 20, true)}
        <span class="typing-name" style="color:${tch.accentColor};">${tch.displayName}</span>
        ${indicator}
      </div>
    `;
  }

  private ensureDelegatedReplay(scrollEl: HTMLElement): ScrollFeedCache {
    let cache = this.feedCache.get(scrollEl);
    if (!cache) {
      cache = {
        entries: [],
        renderedCount: 0,
        channel: inferChannel(`#${scrollEl.id}`),
        humanityBucket: -1,
        siblingBucket: -1,
        boundClick: false,
      };
      this.feedCache.set(scrollEl, cache);
    }
    if (!cache.boundClick) {
      cache.boundClick = true;
      scrollEl.addEventListener('click', (e) => {
        const target = e.target as Element | null;
        const btn = target?.closest<HTMLButtonElement>('.voice-replay-btn');
        if (!btn) return;
        const current = this.feedCache.get(scrollEl);
        const entry = current?.entries[Number(btn.dataset.replayIdx)];
        if (entry) {
          this.voice.speakSingle(entry.text, entry.speaker, entry.emotion, entry.lineId);
        }
      });
    }
    return cache;
  }

  renderEntriesOnly(
    scrollEl: HTMLElement,
    entries: DialogueEntry[],
    opts?: { animateFromIndex?: number; typingSpeaker?: string; channel?: DialogueChannel }
  ): void {
    const s = this.store.getState();
    const animateFrom = opts?.animateFromIndex ?? 0;
    const channel = opts?.channel ?? inferChannel(`#${scrollEl.id}`);
    const hBucket = humanityAvatarBucket(s.humanity);
    const sBucket = humanityAvatarBucket(s.primarySiblingH);
    const cache = this.ensureDelegatedReplay(scrollEl);
    const typingHtml = this.renderTypingHtml(opts?.typingSpeaker, channel, s.humanity, s.primarySiblingH);

    const canAppend =
      cache.renderedCount > 0 &&
      cache.renderedCount <= entries.length &&
      cache.channel === channel &&
      cache.humanityBucket === hBucket &&
      cache.siblingBucket === sBucket &&
      prefixMatches(cache.entries, entries, cache.renderedCount);

    if (canAppend) {
      scrollEl.querySelector('.dialogue-typing')?.remove();
      if (animateFrom >= cache.renderedCount) {
        scrollEl.querySelectorAll('.dialogue-entry.is-new').forEach((el) => {
          el.classList.remove('is-new');
          el.classList.add('is-history');
        });
      }
      let deltaHtml = '';
      for (let i = cache.renderedCount; i < entries.length; i++) {
        deltaHtml += this.renderEntryHtml(
          entries[i],
          i,
          animateFrom,
          channel,
          s.humanity,
          s.primarySiblingH
        );
      }
      if (deltaHtml || typingHtml) {
        scrollEl.insertAdjacentHTML('beforeend', deltaHtml + typingHtml);
      }
    } else {
      const entryHtml = entries
        .map((entry, idx) =>
          this.renderEntryHtml(entry, idx, animateFrom, channel, s.humanity, s.primarySiblingH)
        )
        .join('');
      scrollEl.innerHTML = entryHtml + typingHtml;
    }

    cache.entries = entries.slice();
    cache.renderedCount = entries.length;
    cache.channel = channel;
    cache.humanityBucket = hBucket;
    cache.siblingBucket = sBucket;

    if (typeof scrollEl.scrollTo === 'function') {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
    } else {
      scrollEl.scrollTop = scrollEl.scrollHeight;
    }
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
    const channel = inferChannel(scrollSel);

    const animateFrom = Math.max(0, snap.entries.length - Math.max(1, snap.lastAddedEntries.length));
    this.renderEntriesOnly(scrollEl, snap.entries, { animateFromIndex: animateFrom, channel });

    choicesEl.classList.remove('is-locked');

    if (snap.choices.length > 0) {
      choicesEl.innerHTML = snap.choices
        .map(
          (c, i) => `
          <button class="choice-line choice-enter" data-choice-index="${c.index}" style="--choice-idx:${i}" type="button">
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
        <button class="choice-line choice-enter" id="btn-overseer-return" style="--choice-idx:0" type="button">
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
        <button class="choice-line choice-enter" id="btn-return-3d" style="--choice-idx:0" type="button"><span class="choice-num">1.</span><span>Wake up and return to the sky</span></button>
      `;
      choicesEl.querySelector('#btn-return-3d')?.addEventListener('click', () => {
        this.audio.playCue('boot_click');
        this.voice.stop();
        handlers.onWakeToSky!();
      });
    } else if (scrollSel === '#comms-scroll' && handlers.onCloseComms) {
      choicesEl.innerHTML = `<button class="choice-line choice-enter" id="btn-comms-done" style="--choice-idx:0" type="button"><span class="choice-num">→</span><span>Close relay</span></button>`;
      choicesEl.querySelector('#btn-comms-done')?.addEventListener('click', () => {
        this.audio.playCue('tick');
        handlers.onCloseComms!();
      });
    } else {
      choicesEl.innerHTML = '';
    }
  }
}
