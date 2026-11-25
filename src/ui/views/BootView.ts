import charactersData from '../../content/characters.json';
import uiCopy from '../../content/ui_copy.json';
import type { DialogueEntry } from '../../engine/DialogueRunner';
import type { GameState } from '../../engine/StateStore';
import { renderSpeakerAvatar } from '../SpeakerAvatar';

interface CharacterInfo {
  displayName: string;
  role: string;
  accentColor: string;
}

const CHAR_MAP = charactersData.characters as Record<string, CharacterInfo>;

export type BootVisualMode =
  | 'breath'
  | 'prologue_kitchen'
  | 'prologue_fracture'
  | 'prologue_starfield'
  | 'title';

export interface BootViewCallbacks {
  onAdvancePrologue: () => void;
  onPrimaryAction: () => void;
  onConfirmNewRun: () => void;
}

/**
 * Manages the transparent Prologue + Live-Cosmos Integrated Title overlay.
 * Zero opaque static menus and zero mode-picker choices:
 * - Fresh run: Sensory breath (audio unlock) -> 3-beat voiced Prologue -> Live Title (`OPEN APERTURE`)
 * - Returning run: Live Title over drifting 3D cosmos (`CONTINUE SHIFT N` + quiet `New Run` confirm link)
 */
export class BootView {
  private visualMode: BootVisualMode = 'breath';
  private titleReadyAt = 0;
  private confirmingNewRun = false;
  private confirmResetTimer: number | null = null;
  private callbacks: BootViewCallbacks | null = null;

  constructor(private readonly root: HTMLElement) {}

  getVisualMode(): BootVisualMode {
    return this.visualMode;
  }

  populate(): void {
    const breathLine = this.root.querySelector<HTMLElement>('#prologue-breath-line');
    const breathHint = this.root.querySelector<HTMLElement>('#prologue-breath-hint');
    const beatHint = this.root.querySelector<HTMLElement>('#prologue-beat-hint');
    const eyebrow = this.root.querySelector<HTMLElement>('#boot-eyebrow');
    const title = this.root.querySelector<HTMLElement>('#boot-title');
    const newRunBtn = this.root.querySelector<HTMLElement>('#btn-title-new-run');

    if (breathLine) breathLine.textContent = uiCopy.prologue.breathPrompt;
    if (breathHint) breathHint.textContent = uiCopy.prologue.advanceHint;
    if (beatHint) beatHint.textContent = uiCopy.prologue.advanceHint;
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
      this.resetNewRunConfirm();
      this.callbacks?.onPrimaryAction();
    });

    newRunBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
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
      const target = e.target as HTMLElement | null;
      if (target?.closest('button')) return;

      if (this.visualMode === 'title') {
        if (performance.now() >= this.titleReadyAt) {
          this.resetNewRunConfirm();
          this.callbacks?.onPrimaryAction();
        }
        return;
      }

      this.callbacks?.onAdvancePrologue();
    });

    window.addEventListener('keydown', (e) => {
      const bootEl = this.root.querySelector<HTMLElement>('#boot-screen');
      if (!bootEl || bootEl.classList.contains('hidden')) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (this.root.querySelector('#settings-overlay:not(.hidden)')) return;

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
    this.setVisualMode('breath');
    this.root.querySelector('#prologue-breath-panel')?.classList.remove('hidden');
    this.root.querySelector('#prologue-dialogue-stage')?.classList.add('hidden');
    this.root.querySelector('#title-overlay')?.classList.add('hidden');
  }

  showPrologueEntry(entry: DialogueEntry, index: number, total: number, humanity: number): void {
    const cue = entry.visualCue;
    const mode: BootVisualMode =
      cue === 'prologue_fracture'
        ? 'prologue_fracture'
        : cue === 'prologue_starfield'
          ? 'prologue_starfield'
          : 'prologue_kitchen';
    this.setVisualMode(mode);

    this.root.querySelector('#prologue-breath-panel')?.classList.add('hidden');
    this.root.querySelector('#title-overlay')?.classList.add('hidden');
    const stageEl = this.root.querySelector<HTMLElement>('#prologue-dialogue-stage');
    if (stageEl) {
      stageEl.classList.remove('hidden');
      // Subtle re-entrance glide per line
      stageEl.style.animation = 'none';
      void stageEl.offsetWidth;
      stageEl.style.animation = '';
    }

    const ch = CHAR_MAP[entry.speaker] ?? CHAR_MAP.narrator;
    const avatarEl = this.root.querySelector<HTMLElement>('#prologue-speaker-avatar');
    const nameEl = this.root.querySelector<HTMLElement>('#prologue-speaker-name');
    const textEl = this.root.querySelector<HTMLElement>('#prologue-beat-text');
    const dotsEl = this.root.querySelector<HTMLElement>('#prologue-beat-dots');

    if (avatarEl) {
      avatarEl.innerHTML = renderSpeakerAvatar(entry.speaker, humanity, 28, true);
    }
    if (nameEl) {
      nameEl.textContent = ch.displayName;
      nameEl.style.color = ch.accentColor;
    }
    if (textEl) {
      textEl.textContent = entry.text;
    }
    if (dotsEl) {
      dotsEl.innerHTML = Array.from({ length: Math.max(1, total) }, (_, i) => {
        const cls = i < index ? 'done' : i === index ? 'active' : '';
        return `<i class="${cls}"></i>`;
      }).join('');
    }
  }

  showTitle(state: GameState, hasSavedRun: boolean, holdMs = 1100): void {
    const wasTitle = this.visualMode === 'title';
    this.setVisualMode('title');
    if (!wasTitle) {
      this.titleReadyAt = performance.now() + holdMs;
    }
    this.resetNewRunConfirm();

    this.root.querySelector('#prologue-breath-panel')?.classList.add('hidden');
    this.root.querySelector('#prologue-dialogue-stage')?.classList.add('hidden');
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
