import pacing from '../content/pacing.json';
import type { AudioEngine } from '../engine/AudioEngine';

export interface HibernationInterludeOptions {
  yearsSlept: number;
  totalYearsElapsed: number;
  nextShift: number;
  nextTitle: string;
  monthsLeft: number;
  humanity: number;
  isFinalFreeze?: boolean;
}

/**
 * Full-screen austere Zeiss-glass hibernation drift interlude shown between shifts
 * so multi-year deep cryo sleeps register perceptually across the 29.5-year watch.
 */
export class HibernationInterludeView {
  private readonly el: HTMLElement;
  private timerId: number | null = null;
  private skipHintTimerId: number | null = null;
  private activeResolve: (() => void) | null = null;
  private canSkip = false;

  constructor(
    container: HTMLElement,
    private readonly audio: AudioEngine
  ) {
    this.el = document.createElement('div');
    this.el.id = 'hibernation-interlude';
    this.el.className = 'hibernation-interlude hidden';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.el.innerHTML = `
      <div class="hib-star-drift" aria-hidden="true"></div>
      <div class="hib-card">
        <div class="hib-eyebrow" id="hib-eyebrow">HIBERNATION DRIFT · CRYO STANDBY</div>
        <div class="hib-years" id="hib-years">+5.2 REAL YEARS</div>
        <h2 class="hib-title" id="hib-title">SHIFT 2 · DUST PENETRATION</h2>
        <div class="hib-meta" id="hib-meta">TOTAL ELAPSED: 5.2 YR · SUBJECTIVE CLOCK: 20 MO</div>
        <div class="hib-skip hidden" id="hib-skip">Click or press Space to wake</div>
      </div>
    `;
    container.appendChild(this.el);

    this.el.addEventListener('click', () => {
      if (this.canSkip) this.finish();
    });
  }

  isOpen(): boolean {
    return !this.el.classList.contains('hidden');
  }

  handleKeyDown(e: KeyboardEvent): boolean {
    if (!this.isOpen()) return false;
    if (this.canSkip && (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape')) {
      e.preventDefault();
      this.finish();
      return true;
    }
    return false;
  }

  play(opts: HibernationInterludeOptions): Promise<void> {
    this.clearTimers();
    if (this.activeResolve) {
      const prev = this.activeResolve;
      this.activeResolve = null;
      prev();
    }

    const eyebrow = this.el.querySelector<HTMLElement>('#hib-eyebrow');
    const yearsEl = this.el.querySelector<HTMLElement>('#hib-years');
    const titleEl = this.el.querySelector<HTMLElement>('#hib-title');
    const metaEl = this.el.querySelector<HTMLElement>('#hib-meta');
    const skipEl = this.el.querySelector<HTMLElement>('#hib-skip');

    if (eyebrow) {
      eyebrow.textContent = opts.isFinalFreeze
        ? 'FINAL CARRIER TRANSMITTED · 20-YEAR DEEP FREEZE'
        : 'HIBERNATION DRIFT · CRYO STANDBY';
    }
    if (yearsEl) {
      yearsEl.textContent = `+${opts.yearsSlept.toFixed(1)} REAL YEARS`;
    }
    if (titleEl) {
      titleEl.textContent = opts.isFinalFreeze
        ? 'WAITING FOR SOL–CENTAURI REPLY'
        : `SHIFT ${opts.nextShift} · ${opts.nextTitle.toUpperCase()}`;
    }
    if (metaEl) {
      metaEl.textContent = opts.isFinalFreeze
        ? `10.0 LY OUTBOUND + 10.0 LY RETURN · TOTAL ELAPSED: ${opts.totalYearsElapsed.toFixed(1)} YR`
        : `ELAPSED SINCE WAKE: ${opts.totalYearsElapsed.toFixed(1)} YR · SUBJECTIVE CLOCK: ${opts.monthsLeft} MO`;
    }
    if (skipEl) skipEl.classList.add('hidden');

    this.el.classList.toggle('is-cold', opts.humanity < 45);
    this.el.classList.remove('hidden');
    this.canSkip = false;
    this.audio.playCue('boot_click');

    const totalMs = opts.isFinalFreeze
      ? Math.max(pacing.hibernation.interludeDurationMs, 6800)
      : pacing.hibernation.interludeDurationMs;
    const minSkipMs = pacing.hibernation.minSkipWaitMs;

    return new Promise<void>((resolve) => {
      this.activeResolve = resolve;
      this.skipHintTimerId = window.setTimeout(() => {
        this.skipHintTimerId = null;
        this.canSkip = true;
        skipEl?.classList.remove('hidden');
      }, minSkipMs);
      this.timerId = window.setTimeout(() => {
        this.timerId = null;
        this.finish();
      }, totalMs);
    });
  }

  private clearTimers(): void {
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.skipHintTimerId !== null) {
      window.clearTimeout(this.skipHintTimerId);
      this.skipHintTimerId = null;
    }
  }

  private finish(): void {
    this.clearTimers();
    this.canSkip = false;
    this.el.classList.add('hidden');
    const resolve = this.activeResolve;
    this.activeResolve = null;
    resolve?.();
  }

  destroy(): void {
    this.finish();
    this.el.remove();
  }
}
