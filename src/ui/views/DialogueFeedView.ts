import charactersData from '../../content/characters.json';
import type { AudioEngine } from '../../engine/AudioEngine';
import type {
  DialogueChoice,
  DialogueEntry,
  DialogueRunner,
  DialogueSnapshot,
} from '../../engine/DialogueRunner';
import type { StateStore } from '../../engine/StateStore';
import type { TelemetryLogger } from '../../engine/TelemetryLogger';
import type { VoiceEngine, VoiceRequest } from '../../engine/voice/VoiceEngine';

interface CharacterInfo {
  displayName: string;
  whisperLabel?: string;
  role: string;
  accentColor: string;
}

const CHAR_MAP = charactersData.characters as Record<string, CharacterInfo>;

export type DialogueChannel = 'dream' | 'comms' | 'overseer' | 'future' | 'prologue';

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Safely converts inline [[warm:...]] and [[cold:...]] literary temperature cues
 * into styled spans while HTML-escaping all surrounding text.
 */
export function formatInlineHighlights(raw: string): string {
  return escapeHtml(raw).replace(
    /\[\[(warm|cold):([^\]]+)\]\]/g,
    (_match, tone: string, inner: string) => `<span class="hl-${tone}">${inner}</span>`
  );
}

/**
 * Strips inline [[warm:...]] / [[cold:...]] markers to plain prose for TTS playback.
 */
export function stripInlineHighlights(raw: string): string {
  return raw.replace(/\[\[(?:warm|cold):([^\]]+)\]\]/g, '$1');
}

function inferChannel(scrollSel: string): DialogueChannel {
  if (scrollSel.includes('comms')) return 'comms';
  if (scrollSel.includes('overseer')) return 'overseer';
  if (scrollSel.includes('future')) return 'future';
  if (scrollSel.includes('prologue')) return 'prologue';
  return 'dream';
}

function getChoiceTierMeta(c: DialogueChoice, replyOrd: number): {
  tierClass: string;
  glyph: string;
  isPermanent: boolean;
  isAsk: boolean;
} {
  const isAsk = c.kind === 'ask';
  const isAction = c.kind === 'action';
  const isPermanent = c.kind === 'prune' || c.weight === 'permanent';

  if (isPermanent) {
    return { tierClass: 'is-tier-permanent', glyph: '◈', isPermanent: true, isAsk: false };
  }
  if (isAsk) {
    return { tierClass: 'is-tier-explore', glyph: '◇', isPermanent: false, isAsk: true };
  }
  if (isAction) {
    const weightCls = c.weight === 'explore' ? 'is-tier-explore' : 'is-tier-consequential';
    return {
      tierClass: `is-tier-action ${weightCls}`,
      glyph: '→',
      isPermanent: false,
      isAsk: false,
    };
  }
  const tierClass = c.weight === 'explore' ? 'is-tier-explore' : 'is-tier-consequential';
  return {
    tierClass,
    glyph: `${String(replyOrd).padStart(2, '0')}.`,
    isPermanent: false,
    isAsk: false,
  };
}

/**
 * Renders color-coded Style 1 + 4 tactile choice plates:
 * - Non-consequential / optional exploration (`◇` / `weight:explore`) in calm neutral-slate
 * - Consequential replies (`weight:consequential`) in luminous warm-amber
 * - Irreversible pruning (`kind:prune` / `weight:permanent`) as Hold-to-Commit plates
 */
export function renderChoicePlatesHtml(choices: DialogueChoice[]): string {
  const askChoices = choices.filter((c) => c.kind === 'ask');
  const mainChoices = choices.filter((c) => c.kind !== 'ask');

  let animIdx = 0;
  let replyOrd = 0;

  const renderOne = (c: DialogueChoice): string => {
    const idx = animIdx++;
    const ord = c.kind === 'ask' || c.kind === 'action' ? 0 : ++replyOrd;
    const { tierClass, glyph, isPermanent, isAsk } = getChoiceTierMeta(c, ord);
    const kindAttr = c.kind ?? (isPermanent ? 'prune' : 'reply');
    const weightAttr = c.weight ?? (isPermanent ? 'permanent' : 'consequential');
    const hintHtml = isPermanent
      ? `<span class="choice-cost-hint">${escapeHtml(c.costHint ?? 'Permanent · clears optics, lowers warmth ceiling')}</span>`
      : '';
    const holdHtml = isPermanent
      ? `<span class="choice-hold-fill" aria-hidden="true"></span>`
      : '';
    const tagHtml = isPermanent
      ? `<span class="choice-hold-tag">HOLD OR CLICK TWICE</span>`
      : isAsk
        ? `<span class="choice-tier-tag">ASK</span>`
        : '';

    return `
      <button class="choice-line choice-enter ${tierClass}"
        data-choice-index="${c.index}"
        data-choice-kind="${kindAttr}"
        data-choice-weight="${weightAttr}"
        style="--choice-idx:${idx}"
        type="button">
        ${holdHtml}
        <span class="choice-num">${glyph}</span>
        <span class="choice-body"><span class="choice-main-text">${formatInlineHighlights(c.text)}</span>${hintHtml}</span>
        ${tagHtml}
      </button>
    `;
  };

  const parts: string[] = [];
  for (const c of askChoices) parts.push(renderOne(c));
  if (askChoices.length > 0 && mainChoices.length > 0) {
    parts.push('<div class="choice-group-divider" aria-hidden="true"></div>');
  }
  for (const c of mainChoices) parts.push(renderOne(c));
  return parts.join('');
}

/**
 * Binds hover ticks, standard selection, and Hold-to-Commit (650ms hold OR
 * click-to-arm + click-to-confirm) behavior on rendered `.choice-line` plates.
 */
export function bindChoicePlates(
  choicesEl: HTMLElement,
  opts: {
    onHover?: () => void;
    onSelect: (choiceIndex: number, btn: HTMLButtonElement) => void;
    playArmCue?: () => void;
  }
): void {
  const buttons = choicesEl.querySelectorAll<HTMLButtonElement>('.choice-line');
  buttons.forEach((btn) => {
    btn.addEventListener('mouseenter', () => {
      choicesEl.querySelectorAll('.choice-line.is-kbd-focus').forEach((b) => b.classList.remove('is-kbd-focus'));
      opts.onHover?.();
    });

    const isPermanent = btn.classList.contains('is-tier-permanent');
    if (!isPermanent) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onSelect(Number(btn.dataset.choiceIndex), btn);
      });
      return;
    }

    let holdRaf = 0;
    let holdStart = 0;
    let committedByHold = false;
    const HOLD_MS = 650;

    const resetHold = () => {
      if (holdRaf) {
        cancelAnimationFrame(holdRaf);
        holdRaf = 0;
      }
      btn.classList.remove('is-holding');
      btn.style.setProperty('--hold-progress', '0');
    };

    const commit = () => {
      resetHold();
      opts.onSelect(Number(btn.dataset.choiceIndex), btn);
    };

    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      committedByHold = false;
      holdStart = performance.now();
      btn.classList.add('is-holding');
      const step = () => {
        const p = Math.min(1, (performance.now() - holdStart) / HOLD_MS);
        btn.style.setProperty('--hold-progress', p.toFixed(3));
        if (p >= 1) {
          committedByHold = true;
          commit();
          return;
        }
        holdRaf = requestAnimationFrame(step);
      };
      holdRaf = requestAnimationFrame(step);
    });

    btn.addEventListener('pointerup', resetHold);
    btn.addEventListener('pointerleave', resetHold);
    btn.addEventListener('pointercancel', resetHold);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (committedByHold) {
        committedByHold = false;
        return;
      }
      if (!btn.classList.contains('is-armed')) {
        btn.classList.add('is-armed');
        const tag = btn.querySelector('.choice-hold-tag');
        if (tag) tag.textContent = 'CONFIRM CUT';
        opts.playArmCue?.();
        return;
      }
      commit();
    });
  });
}

/**
 * Handles `1–6`, `ArrowUp`, `ArrowDown`, and `Enter` keyboard navigation on a
 * visible `.dialogue-choices` container. Returns true if the event was handled.
 */
export function handleChoiceKeyboardNav(
  e: KeyboardEvent,
  choicesEl: HTMLElement | null
): boolean {
  if (!choicesEl || choicesEl.classList.contains('is-locked')) return false;
  const buttons = Array.from(choicesEl.querySelectorAll<HTMLButtonElement>('.choice-line'));
  if (buttons.length === 0) return false;

  const num = Number(e.key);
  if (num >= 1 && num <= 6) {
    const btn = buttons[num - 1];
    if (btn) {
      e.preventDefault();
      btn.click();
      return true;
    }
  }

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const curIdx = buttons.findIndex(
      (b) => b === document.activeElement || b.classList.contains('is-kbd-focus')
    );
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    const nextIdx =
      curIdx === -1
        ? delta > 0
          ? 0
          : buttons.length - 1
        : (curIdx + delta + buttons.length) % buttons.length;
    buttons.forEach((b, i) => b.classList.toggle('is-kbd-focus', i === nextIdx));
    buttons[nextIdx]?.focus();
    return true;
  }

  if (e.key === 'Enter') {
    const focused = buttons.find(
      (b) => b === document.activeElement || b.classList.contains('is-kbd-focus')
    );
    if (focused) {
      e.preventDefault();
      focused.click();
      return true;
    }
  }

  return false;
}

interface ScrollFeedCache {
  entries: DialogueEntry[];
  renderedCount: number;
  channel: DialogueChannel;
  boundClick: boolean;
  boundScrollIntent: boolean;
  userScrolledUp: boolean;
  scrollRafId: number;
  scrollRaf2Id: number;
  scrollSettleTimer: number | null;
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
 * Modular editorial dialogue renderer supporting bottom-anchored Layout A flow,
 * speaker turn-grouping, softly styled internal Psyche marginalia, color-coded
 * choice plates, hover-only voice replay, and telemetry logging.
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
      text: stripInlineHighlights(e.text),
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
      }, 260);
      return;
    }

    this.speakEntries(snap.lastAddedEntries);
    onSettled(snap);
  }

  private renderEntryHtml(
    entry: DialogueEntry,
    idx: number,
    prevEntry: DialogueEntry | undefined,
    animateFrom: number,
    channel: DialogueChannel
  ): string {
    const ch = CHAR_MAP[entry.speaker] ?? CHAR_MAP.narrator;
    const isNew = idx >= animateFrom;
    const animClass = isNew ? 'is-new' : 'is-history';
    const delayMs = isNew ? Math.min(4, Math.max(0, idx - animateFrom)) * 70 : 0;

    if (ch.role === 'psyche') {
      const cueLabel = ch.whisperLabel ?? ch.displayName.toLowerCase();
      return `
        <div class="dialogue-entry role-psyche is-psyche-whisper ${animClass}" data-channel="${channel}" style="border-left-color:${ch.accentColor};--entry-delay:${delayMs}ms;">
          <span class="psyche-cue" style="color:${ch.accentColor};">· ${escapeHtml(cueLabel)}</span>
          <div class="dialogue-text">${formatInlineHighlights(entry.text)}</div>
        </div>
      `;
    }

    const playerClass = entry.isPlayerChoice ? 'is-player-echo' : '';
    const isContinuation = Boolean(
      prevEntry &&
        prevEntry.speaker === entry.speaker &&
        !entry.isPlayerChoice &&
        !prevEntry.isPlayerChoice
    );
    const contClass = isContinuation ? 'is-continuation' : '';
    const plain = stripInlineHighlights(entry.text);
    const canSpeak = !entry.isPlayerChoice && !(plain.startsWith('[') && plain.endsWith(']'));
    const replayBtn = canSpeak
      ? `<button class="voice-replay-btn" data-replay-idx="${idx}" type="button" title="Listen to line" aria-label="Listen to line">▶</button>`
      : '';

    const displayName =
      channel === 'prologue' && entry.speaker === 'phantom_upload_witness'
        ? 'INTAKE ASSISTANT'
        : ch.displayName;
    const headHtml = isContinuation
      ? replayBtn
      : `
        <div class="dialogue-entry-head">
          <span class="voice-live-dot" data-voice-dot-speaker="${escapeHtml(entry.speaker)}" style="background:${ch.accentColor};"></span>
          <div class="dialogue-speaker" style="color:${ch.accentColor};">${escapeHtml(displayName)}</div>
          ${replayBtn}
        </div>
      `;

    return `
      <div class="dialogue-entry role-${ch.role} ${playerClass} ${contClass} ${animClass}" data-channel="${channel}" style="border-left-color:${ch.accentColor};--entry-delay:${delayMs}ms;">
        ${headHtml}
        <div class="dialogue-text">${formatInlineHighlights(entry.text)}</div>
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
        boundClick: false,
        boundScrollIntent: false,
        userScrolledUp: false,
        scrollRafId: 0,
        scrollRaf2Id: 0,
        scrollSettleTimer: null,
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
          this.voice.speakSingle(
            stripInlineHighlights(entry.text),
            entry.speaker,
            entry.emotion,
            entry.lineId
          );
        }
      });
    }
    if (!cache.boundScrollIntent) {
      cache.boundScrollIntent = true;
      const markManualScroll = () => {
        const cur = this.feedCache.get(scrollEl);
        if (!cur) return;
        cur.userScrolledUp = true;
        if (cur.scrollSettleTimer !== null) {
          window.clearTimeout(cur.scrollSettleTimer);
          cur.scrollSettleTimer = null;
        }
      };
      scrollEl.addEventListener('wheel', markManualScroll, { passive: true });
      scrollEl.addEventListener('touchstart', markManualScroll, { passive: true });
    }
    return cache;
  }

  /**
   * Pins a dialogue scroll container to its newest bottom entry after flex/choice
   * layout updates settle, so new sentences never clip behind the choices bay
   * or stall mid-scroll during rapid advances.
   */
  scrollToLatest(scrollEl: HTMLElement | null, opts?: { instant?: boolean }): void {
    if (!scrollEl) return;
    const cache = this.ensureDelegatedReplay(scrollEl);

    if (cache.scrollRafId) {
      cancelAnimationFrame(cache.scrollRafId);
      cache.scrollRafId = 0;
    }
    if (cache.scrollRaf2Id) {
      cancelAnimationFrame(cache.scrollRaf2Id);
      cache.scrollRaf2Id = 0;
    }
    if (cache.scrollSettleTimer !== null) {
      window.clearTimeout(cache.scrollSettleTimer);
      cache.scrollSettleTimer = null;
    }

    cache.userScrolledUp = false;

    const pinNow = () => {
      if (typeof scrollEl.scrollTo === 'function') {
        scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'auto' });
      }
      scrollEl.scrollTop = scrollEl.scrollHeight;
    };

    if (opts?.instant || this.instantPacing || typeof requestAnimationFrame !== 'function') {
      pinNow();
    }

    if (typeof requestAnimationFrame === 'function') {
      cache.scrollRafId = requestAnimationFrame(() => {
        cache.scrollRafId = 0;
        if (cache.userScrolledUp) return;
        pinNow();

        cache.scrollRaf2Id = requestAnimationFrame(() => {
          cache.scrollRaf2Id = 0;
          if (cache.userScrolledUp) return;
          pinNow();
        });
      });
    }

    cache.scrollSettleTimer = window.setTimeout(() => {
      cache.scrollSettleTimer = null;
      if (cache.userScrolledUp) return;
      const remaining = scrollEl.scrollHeight - scrollEl.clientHeight - scrollEl.scrollTop;
      if (remaining > 2) {
        pinNow();
      }
    }, 180);
  }

  renderEntriesOnly(
    scrollEl: HTMLElement,
    entries: DialogueEntry[],
    opts?: { animateFromIndex?: number; channel?: DialogueChannel; deferScroll?: boolean }
  ): void {
    const animateFrom = opts?.animateFromIndex ?? 0;
    const channel = opts?.channel ?? inferChannel(`#${scrollEl.id}`);
    const cache = this.ensureDelegatedReplay(scrollEl);

    const canAppend =
      cache.renderedCount > 0 &&
      cache.renderedCount <= entries.length &&
      cache.channel === channel &&
      prefixMatches(cache.entries, entries, cache.renderedCount);

    if (canAppend) {
      if (animateFrom >= cache.renderedCount) {
        scrollEl.querySelectorAll('.dialogue-entry.is-new').forEach((el) => {
          el.classList.remove('is-new');
          el.classList.add('is-history');
        });
      }
      let deltaHtml = '';
      for (let i = cache.renderedCount; i < entries.length; i++) {
        deltaHtml += this.renderEntryHtml(entries[i], i, entries[i - 1], animateFrom, channel);
      }
      if (deltaHtml) {
        scrollEl.insertAdjacentHTML('beforeend', deltaHtml);
      }
    } else {
      const entryHtml = entries
        .map((entry, idx) => this.renderEntryHtml(entry, idx, entries[idx - 1], animateFrom, channel))
        .join('');
      scrollEl.innerHTML = entryHtml;
    }

    cache.entries = entries.slice();
    cache.renderedCount = entries.length;
    cache.channel = channel;

    if (!opts?.deferScroll) {
      this.scrollToLatest(scrollEl, { instant: !canAppend });
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
      closeCommsLabel?: string;
    }
  ): void {
    const scrollEl = this.root.querySelector<HTMLElement>(scrollSel)!;
    const choicesEl = this.root.querySelector<HTMLElement>(choicesSel)!;
    const channel = inferChannel(scrollSel);

    const animateFrom = Math.max(0, snap.entries.length - Math.max(1, snap.lastAddedEntries.length));
    this.renderEntriesOnly(scrollEl, snap.entries, {
      animateFromIndex: animateFrom,
      channel,
      deferScroll: true,
    });

    choicesEl.classList.remove('is-locked');

    if (snap.choices.length > 0) {
      choicesEl.innerHTML = renderChoicePlatesHtml(snap.choices);
      bindChoicePlates(choicesEl, {
        onHover: () => this.audio.playHoverTick(),
        playArmCue: () => this.audio.playCue('tick'),
        onSelect: (choiceIdx) => {
          this.audio.playCue('choice');
          handlers.onChoose(choiceIdx);
        },
      });
    } else if (snap.resumeDreamKnot && handlers.onResumeDream) {
      const nextKnot = snap.resumeDreamKnot;
      choicesEl.innerHTML = `
        <button class="choice-line choice-enter is-tier-action is-tier-consequential" id="btn-overseer-return" style="--choice-idx:0" type="button">
          <span class="choice-num">→</span>
          <span class="choice-body">Return to the dream</span>
        </button>
      `;
      choicesEl.querySelector('#btn-overseer-return')?.addEventListener('click', () => {
        this.audio.playCue('tick');
        handlers.onResumeDream!(nextKnot);
      });
    } else if (scrollSel === '#dream-scroll' && !snap.autoInterruptKnot && handlers.onWakeToSky) {
      choicesEl.innerHTML = `
        <button class="choice-line choice-enter is-tier-action is-tier-consequential" id="btn-return-3d" style="--choice-idx:0" type="button">
          <span class="choice-num">→</span>
          <span class="choice-body">Wake up and return to the sky</span>
        </button>
      `;
      choicesEl.querySelector('#btn-return-3d')?.addEventListener('click', () => {
        this.audio.playCue('boot_click');
        this.voice.stop();
        handlers.onWakeToSky!();
      });
    } else if (scrollSel === '#comms-scroll' && handlers.onCloseComms) {
      const label = handlers.closeCommsLabel ?? 'Close relay';
      choicesEl.innerHTML = `
        <button class="choice-line choice-enter is-tier-action is-tier-consequential" id="btn-comms-done" style="--choice-idx:0" type="button">
          <span class="choice-num">→</span>
          <span class="choice-body">${escapeHtml(label)}</span>
        </button>
      `;
      choicesEl.querySelector('#btn-comms-done')?.addEventListener('click', () => {
        this.audio.playCue('tick');
        handlers.onCloseComms!();
      });
    } else {
      choicesEl.innerHTML = '';
    }

    // Scroll only after choicesEl has updated so flex-shrink never clips the latest line
    this.scrollToLatest(scrollEl);
  }
}
