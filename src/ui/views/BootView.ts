import charactersData from '../../content/characters.json';
import uiCopy from '../../content/ui_copy.json';
import type { DialogueChoice } from '../../engine/DialogueRunner';
import type { GameState } from '../../engine/StateStore';
import { renderSpeakerAvatar } from '../SpeakerAvatar';
import {
  bindChoicePlates,
  escapeHtml,
  handleChoiceKeyboardNav,
  renderChoicePlatesHtml,
} from './DialogueFeedView';

interface CharacterInfo {
  displayName: string;
  role: string;
  accentColor: string;
  roomTitle?: string;
}

const CHAR_MAP = charactersData.characters as Record<string, CharacterInfo>;

export type BootVisualMode = 'breath' | 'prologue_kitchen' | 'prologue_wakeup' | 'title';

export interface BootViewCallbacks {
  onAdvancePrologue: () => void;
  onChoosePrologue: (choiceIndex: number) => void;
  onPrimaryAction: () => void;
  onConfirmNewRun: () => void;
}

/**
 * Manages the transparent Interactive Prologue + Live-Cosmos Integrated Title overlay:
 * - Frame 0 (`breath`): Sensory audio-unlock breath over softly veiled live kitchen canvas
 * - Beat A (`prologue_kitchen`): Interactive Sunday kitchen conversation with [RELATION:SPOUSE_01]
 * - Beat B (`prologue_wakeup`): 5-phase WakeupBriefingCanvas schematic + interactive Overseer Q&A
 * - Beat C (`title`): Monumental title over live drifting 3D OpticsScene cosmos
 */
export class BootView {
  private visualMode: BootVisualMode = 'breath';
  private titleReadyAt = 0;
  private confirmingNewRun = false;
  private confirmResetTimer: number | null = null;
  private hasActiveChoices = false;
  private inputLocked = false;
  private callbacks: BootViewCallbacks | null = null;

  constructor(private readonly root: HTMLElement) {}

  getVisualMode(): BootVisualMode {
    return this.visualMode;
  }

  setInputLocked(locked: boolean): void {
    this.inputLocked = locked;
  }

  populate(): void {
    const breathLine = this.root.querySelector<HTMLElement>('#prologue-breath-line');
    const breathHint = this.root.querySelector<HTMLElement>('#prologue-breath-hint');
    const eyebrow = this.root.querySelector<HTMLElement>('#boot-eyebrow');
    const title = this.root.querySelector<HTMLElement>('#boot-title');
    const newRunBtn = this.root.querySelector<HTMLElement>('#btn-title-new-run');

    if (breathLine) breathLine.textContent = uiCopy.prologue.breathPrompt;
    if (breathHint) breathHint.textContent = uiCopy.prologue.advanceHint;
    if (eyebrow) eyebrow.textContent = uiCopy.title.eyebrow;
    if (title) title.textContent = uiCopy.title.heading;
    if (newRunBtn) newRunBtn.textContent = uiCopy.title.newRun;
  }

  bindActions(callbacks: BootViewCallbacks): void {
    this.callbacks = callbacks;

    const screen = this.root.querySelector<HTMLElement>('#boot-screen');
    const primaryBtn = this.root.querySelector<HTMLButtonElement>('#btn-title-primary');
    const newRunBtn = this.root.querySelector<HTMLButtonElement>('#btn-title-new-run');

    primaryBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.inputLocked) return;
      this.resetNewRunConfirm();
      this.callbacks?.onPrimaryAction();
    });

    newRunBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.inputLocked) return;
      if (!this.confirmingNewRun) {
        this.confirmingNewRun = true;
        newRunBtn.textContent = uiCopy.title.newRunConfirm;
        newRunBtn.classList.add('confirming');
        if (this.confirmResetTimer !== null) window.clearTimeout(this.confirmResetTimer);
        this.confirmResetTimer = window.setTimeout(() => this.resetNewRunConfirm(), 4500);
        return;
      }
      this.resetNewRunConfirm();
      this.callbacks?.onConfirmNewRun();
    });

    screen?.addEventListener('click', (e) => {
      if (this.inputLocked) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('button')) return;

      if (this.visualMode === 'title') {
        if (performance.now() >= this.titleReadyAt) {
          this.resetNewRunConfirm();
          this.callbacks?.onPrimaryAction();
        }
        return;
      }

      if (this.hasActiveChoices) return;
      this.callbacks?.onAdvancePrologue();
    });

    window.addEventListener('keydown', (e) => {
      const bootEl = this.root.querySelector<HTMLElement>('#boot-screen');
      if (!bootEl || bootEl.classList.contains('hidden')) return;
      if (this.inputLocked) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (this.root.querySelector('#settings-overlay:not(.hidden)')) return;

      if (this.hasActiveChoices) {
        handleChoiceKeyboardNav(e, this.root.querySelector('#prologue-choices'));
        return;
      }

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (this.visualMode === 'title') {
          if (performance.now() >= this.titleReadyAt) {
            this.resetNewRunConfirm();
            this.callbacks?.onPrimaryAction();
          }
        } else {
          this.callbacks?.onAdvancePrologue();
        }
      }
    });
  }

  showBreath(): void {
    this.hasActiveChoices = false;
    this.inputLocked = false;
    this.setVisualMode('breath');
    this.root.querySelector('#wakeup-canvas-mount')?.classList.add('hidden');
    this.root.querySelector('#prologue-breath-panel')?.classList.remove('hidden');
    this.root.querySelector('#prologue-convo-ribbon')?.classList.add('hidden');
    this.root.querySelector('#title-overlay')?.classList.add('hidden');
  }

  showPrologueConversation(
    mode: 'prologue_kitchen' | 'prologue_wakeup',
    headerSpeakerId: string,
    headerSubtitle: string,
    humanity: number,
    displayNameOverride?: string,
    hideAvatar = false
  ): void {
    this.setVisualMode(mode);
    this.root.querySelector('#prologue-breath-panel')?.classList.add('hidden');
    this.root.querySelector('#title-overlay')?.classList.add('hidden');
    this.root.querySelector('#wakeup-canvas-mount')?.classList.toggle('hidden', mode !== 'prologue_wakeup');

    const ribbon = this.root.querySelector<HTMLElement>('#prologue-convo-ribbon');
    ribbon?.classList.remove('hidden', 'is-dissolving');

    const bayEl = this.root.querySelector<HTMLElement>('#prologue-speaker-bay');
    if (bayEl) {
      const ch = CHAR_MAP[headerSpeakerId] ?? CHAR_MAP.narrator;
      const titleText = displayNameOverride ?? ch.displayName;
      const avatarHtml = hideAvatar ? '' : renderSpeakerAvatar(headerSpeakerId, humanity, 42);
      bayEl.innerHTML = `
        <div class="avatar-card compact ${hideAvatar ? 'no-avatar' : ''}">
          ${avatarHtml}
          <div class="avatar-meta">
            <strong>${escapeHtml(titleText)}</strong>
            <span>${escapeHtml(headerSubtitle)}</span>
          </div>
        </div>
      `;
    }
  }

  renderPrologueControls(opts: {
    choices?: DialogueChoice[];
    continueLabel?: string;
    onHover?: () => void;
    onAdvance?: () => void;
  }): void {
    const choicesEl = this.root.querySelector<HTMLElement>('#prologue-choices');
    if (!choicesEl) return;

    choicesEl.classList.remove('is-locked');
    const choices = opts.choices ?? [];

    if (choices.length > 0) {
      this.hasActiveChoices = true;
      choicesEl.innerHTML = renderChoicePlatesHtml(choices);
      bindChoicePlates(choicesEl, {
        onHover: opts.onHover,
        onSelect: (idx, btn) => {
          if (this.inputLocked) return;
          choicesEl.classList.add('is-locked');
          choicesEl.querySelectorAll<HTMLButtonElement>('.choice-line').forEach((b) => {
            const picked = b === btn;
            b.classList.toggle('is-selected', picked);
            b.classList.toggle('is-dismissed', !picked);
          });
          this.hasActiveChoices = false;
          this.callbacks?.onChoosePrologue(idx);
        },
      });
      return;
    }

    this.hasActiveChoices = false;
    const label = opts.continueLabel ?? 'Continue';
    choicesEl.innerHTML = `
      <button class="prologue-continue-bar choice-enter" id="btn-prologue-continue" style="--choice-idx:0" type="button">
        <span class="prologue-continue-glyph">▾</span>
        <span class="prologue-continue-label">${escapeHtml(label)}</span>
        <span class="prologue-key-hint">${escapeHtml(uiCopy.prologue.advanceHint)}</span>
      </button>
    `;
    const btn = choicesEl.querySelector<HTMLButtonElement>('#btn-prologue-continue');
    btn?.addEventListener('mouseenter', () => opts.onHover?.());
    btn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.inputLocked) return;
      btn.blur();
      (opts.onAdvance ?? this.callbacks?.onAdvancePrologue)?.();
    });
  }

  dissolvePrologueRibbon(): void {
    this.hasActiveChoices = false;
    this.root.querySelector('#prologue-convo-ribbon')?.classList.add('is-dissolving');
  }

  showTitle(state: GameState, hasSavedRun: boolean, holdMs = 1100): void {
    const wasTitle = this.visualMode === 'title';
    this.hasActiveChoices = false;
    this.inputLocked = false;
    this.setVisualMode('title');
    if (!wasTitle) {
      this.titleReadyAt = performance.now() + holdMs;
    }
    this.resetNewRunConfirm();

    this.root.querySelector('#wakeup-canvas-mount')?.classList.add('hidden');
    this.root.querySelector('#prologue-breath-panel')?.classList.add('hidden');
    this.root.querySelector('#prologue-convo-ribbon')?.classList.add('hidden');
    this.root.querySelector('#title-overlay')?.classList.remove('hidden');

    const primaryBtn = this.root.querySelector<HTMLButtonElement>('#btn-title-primary');
    const newRunBtn = this.root.querySelector<HTMLButtonElement>('#btn-title-new-run');

    const isReturningProgress =
      hasSavedRun &&
      !(
        state.introStage === 'title' &&
        state.decodedMinigameTargets.length === 0 &&
        state.scannedAnomalyIds.length === 0 &&
        state.shift === 1
      );

    if (primaryBtn) {
      primaryBtn.textContent = isReturningProgress
        ? uiCopy.title.primaryContinue.replace('{shift}', String(state.shift))
        : uiCopy.title.primaryNew;
    }
    if (newRunBtn) {
      newRunBtn.classList.toggle('hidden', !isReturningProgress);
    }
  }

  private setVisualMode(mode: BootVisualMode): void {
    this.visualMode = mode;
    const bootEl = this.root.querySelector<HTMLElement>('#boot-screen');
    const stageEl = this.root.querySelector<HTMLElement>('.stage');
    if (bootEl) bootEl.dataset.bootVisual = mode;
    if (stageEl) stageEl.dataset.bootVisual = mode;
  }

  private resetNewRunConfirm(): void {
    this.confirmingNewRun = false;
    if (this.confirmResetTimer !== null) {
      window.clearTimeout(this.confirmResetTimer);
      this.confirmResetTimer = null;
    }
    const newRunBtn = this.root.querySelector<HTMLButtonElement>('#btn-title-new-run');
    if (newRunBtn) {
      newRunBtn.textContent = uiCopy.title.newRun;
      newRunBtn.classList.remove('confirming');
    }
  }
}
