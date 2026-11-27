import pacing from '../content/pacing.json';
import type { AudioEngine } from '../engine/AudioEngine';
import type { StatusShiftEvent } from '../engine/StateStore';

/**
 * Displays a brief, serene, non-technical visual beat whenever Humanity,
 * permanent ceiling, or Survey progress shifts meaningfully.
 */
export class StatusShiftOverlay {
  private readonly el: HTMLElement;
  private readonly audio: AudioEngine;
  private hideTimer: number | null = null;
  private animTimer: number | null = null;

  constructor(container: HTMLElement, audio: AudioEngine) {
    this.audio = audio;
    this.el = document.createElement('div');
    this.el.className = 'status-shift-overlay hidden';
    this.el.setAttribute('role', 'status');
    this.el.innerHTML = `
      <div class="status-shift-card">
        <div class="ss-eyebrow" id="ss-eyebrow">CONNECTOME SHIFT</div>
        <h2 class="ss-title" id="ss-title"></h2>
        <div class="ss-meter-wrap">
          <div class="ss-meter-track">
            <div class="ss-meter-fill" id="ss-meter-fill"></div>
            <div class="ss-ceiling-mark" id="ss-ceiling-mark"></div>
          </div>
          <div class="ss-values" id="ss-values"></div>
        </div>
        <p class="ss-detail" id="ss-detail"></p>
        <div class="ss-skip">Click anywhere to continue</div>
      </div>
    `;
    container.appendChild(this.el);

    this.el.addEventListener('click', () => this.dismiss());
  }

  show(ev: StatusShiftEvent): void {
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    if (this.animTimer !== null) window.clearTimeout(this.animTimer);

    this.audio.playStatusShift(ev.tone);

    this.el.classList.remove('hidden', 'tone-warm', 'tone-cold', 'tone-discovery');
    this.el.classList.add(`tone-${ev.tone}`);

    const eyebrow = this.el.querySelector<HTMLElement>('#ss-eyebrow')!;
    const title = this.el.querySelector<HTMLElement>('#ss-title')!;
    const fill = this.el.querySelector<HTMLElement>('#ss-meter-fill')!;
    const ceil = this.el.querySelector<HTMLElement>('#ss-ceiling-mark')!;
    const vals = this.el.querySelector<HTMLElement>('#ss-values')!;
    const detail = this.el.querySelector<HTMLElement>('#ss-detail')!;

    eyebrow.textContent =
      ev.tone === 'cold'
        ? 'MEMORY COMPRESSED'
        : ev.tone === 'warm'
          ? 'WARMTH UNSEALED'
          : 'SURVEY DISCOVERY';
    title.textContent = ev.title;
    detail.textContent = ev.detail;

    const unit = ev.unit ?? '%';
    const prevPct = Math.max(2, Math.min(100, ev.prevValue));
    const nextPct = Math.max(2, Math.min(100, ev.nextValue));

    fill.style.transition = 'none';
    fill.style.width = `${prevPct}%`;

    if (typeof ev.prevMax === 'number' && typeof ev.nextMax === 'number') {
      ceil.style.display = 'block';
      ceil.style.transition = 'none';
      ceil.style.left = `${Math.max(4, Math.min(100, ev.prevMax))}%`;
    } else {
      ceil.style.display = 'none';
    }

    vals.textContent = `${ev.prevValue}${unit}  →  ${ev.nextValue}${unit}`;

    this.animTimer = window.setTimeout(() => {
      fill.style.transition = 'width 0.85s cubic-bezier(0.22, 1, 0.36, 1)';
      fill.style.width = `${nextPct}%`;
      if (typeof ev.nextMax === 'number') {
        ceil.style.transition = 'left 0.85s cubic-bezier(0.22, 1, 0.36, 1)';
        ceil.style.left = `${Math.max(4, Math.min(100, ev.nextMax))}%`;
      }
    }, 90);

    const ceilingDropped =
      typeof ev.prevMax === 'number' && typeof ev.nextMax === 'number' && ev.nextMax < ev.prevMax;
    const stayMs = ceilingDropped
      ? pacing.postScan.statusShiftCeilingDropDurationMs
      : pacing.postScan.statusShiftDurationMs;
    this.hideTimer = window.setTimeout(() => this.dismiss(), stayMs);
  }

  dismiss(): void {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.el.classList.add('hidden');
  }
}
