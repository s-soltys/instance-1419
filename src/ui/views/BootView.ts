import prologueAnchorUrl from '../../../assets/characters/dream_spouse_impasto.webp';
import uiCopy from '../../content/ui_copy.json';

/**
 * Manages the Prologue Warm Anchor -> Hard-Cut Cold Boot -> Hexagonal Iris Aperture
 * opening sequence while preserving instant #btn-boot-3d access for automated checks.
 */
export class BootView {
  private timers: number[] = [];

  constructor(private readonly root: HTMLElement) {}

  populate(): void {
    const bgEl = this.root.querySelector<HTMLElement>('#prologue-bg');
    const prologueEye = this.root.querySelector<HTMLElement>('#prologue-eyebrow');
    const prologueLine = this.root.querySelector<HTMLElement>('#prologue-line');
    const prologueBtn = this.root.querySelector<HTMLElement>('#btn-prologue-continue');

    const eyebrow = this.root.querySelector<HTMLElement>('#boot-eyebrow');
    const title = this.root.querySelector<HTMLElement>('#boot-title');
    const lines = this.root.querySelector<HTMLElement>('#boot-lines');
    const btn3d = this.root.querySelector<HTMLElement>('#btn-boot-3d');
    const btnDream = this.root.querySelector<HTMLElement>('#btn-boot-dream');

    if (bgEl) {
      bgEl.style.backgroundImage = `url(${prologueAnchorUrl})`;
    }
    if (prologueEye) prologueEye.textContent = uiCopy.prologue.eyebrow;
    if (prologueLine) prologueLine.textContent = uiCopy.prologue.anchorLine;
    if (prologueBtn) prologueBtn.textContent = uiCopy.prologue.tryNameAction;

    if (eyebrow) eyebrow.textContent = uiCopy.boot.eyebrow;
    if (title) title.textContent = uiCopy.boot.title;
    if (lines) {
      lines.innerHTML = uiCopy.boot.lines
        .map((line, i) => `<div class="boot-line-item" style="--line-idx:${i}">${line}</div>`)
        .join('');
    }
    if (btn3d) btn3d.textContent = uiCopy.boot.actions.enterSky;
    if (btnDream) btnDream.textContent = uiCopy.boot.actions.enterDream;
  }

  private clearTimers(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
  }

  resetToWarmAnchor(): void {
    this.clearTimers();
    const bootEl = this.root.querySelector<HTMLElement>('#boot-screen');
    const warmPhase = this.root.querySelector<HTMLElement>('#prologue-warm-phase');
    const coldPhase = this.root.querySelector<HTMLElement>('#boot-cold-phase');
    const prologueLine = this.root.querySelector<HTMLElement>('#prologue-line');
    const btn3d = this.root.querySelector<HTMLElement>('#btn-boot-3d');

    bootEl?.classList.remove('is-cold-phase', 'is-flashing', 'is-iris-opening');
    warmPhase?.classList.remove('hidden');
    coldPhase?.classList.add('hidden');
    if (prologueLine) prologueLine.textContent = uiCopy.prologue.anchorLine;
    if (btn3d) btn3d.textContent = uiCopy.boot.actions.enterSky;
  }

  triggerHardCutToColdBoot(onSnapAudio: () => void, fastMode = false): void {
    this.clearTimers();
    const bootEl = this.root.querySelector<HTMLElement>('#boot-screen');
    const warmPhase = this.root.querySelector<HTMLElement>('#prologue-warm-phase');
    const coldPhase = this.root.querySelector<HTMLElement>('#boot-cold-phase');
    const prologueLine = this.root.querySelector<HTMLElement>('#prologue-line');

    if (prologueLine) {
      prologueLine.innerHTML = `${uiCopy.prologue.corruptLine} <span class="corrupt-tag">${uiCopy.prologue.corruptTag}</span>`;
    }
    bootEl?.classList.add('is-flashing');
    onSnapAudio();

    const flashDelay = fastMode ? 90 : 520;
    const t1 = window.setTimeout(() => {
      bootEl?.classList.remove('is-flashing');
      bootEl?.classList.add('is-cold-phase');
      warmPhase?.classList.add('hidden');
      coldPhase?.classList.remove('hidden');

      const lineEls = this.root.querySelectorAll<HTMLElement>('.boot-line-item');
      lineEls.forEach((el, idx) => {
        el.classList.remove('revealed');
        const delay = fastMode ? idx * 35 : 220 + idx * 360;
        const lt = window.setTimeout(() => el.classList.add('revealed'), delay);
        this.timers.push(lt);
      });
    }, flashDelay);
    this.timers.push(t1);
  }

  playIrisOpen(onComplete: () => void, fastMode = false): void {
    this.clearTimers();
    const bootEl = this.root.querySelector<HTMLElement>('#boot-screen');
    if (!bootEl) {
      onComplete();
      return;
    }
    bootEl.classList.add('is-iris-opening');
    const dur = fastMode ? 120 : 720;
    const t = window.setTimeout(() => {
      bootEl.classList.remove('is-iris-opening');
      onComplete();
    }, dur);
    this.timers.push(t);
  }

  bindActions(
    onPrologueSnap: () => void,
    onEnterSky: () => void,
    onEnterDream: () => void
  ): void {
    this.root.querySelector('#btn-prologue-continue')?.addEventListener('click', onPrologueSnap);
    this.root.querySelector('#btn-boot-3d')?.addEventListener('click', onEnterSky);
    this.root.querySelector('#btn-boot-skip-3d')?.addEventListener('click', onEnterSky);
    this.root.querySelector('#btn-boot-dream')?.addEventListener('click', onEnterDream);
  }
}
