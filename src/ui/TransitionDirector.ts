export type TransitionKind =
  | 'aperture_boot'
  | 'optical_dive'
  | 'optical_pullback'
  | 'dream_submerge'
  | 'dream_wake'
  | 'overseer_slice';

export interface TransitionPlayOptions {
  kind: TransitionKind;
  label: string;
  sublabel?: string;
  tone?: 'warm' | 'cold';
  fromSelector?: string;
  toSelector?: string;
  onMidpoint: () => void;
  onComplete?: () => void;
}

export interface OverlayPulseOptions {
  midpointMs?: number;
  durationMs?: number;
  onComplete?: () => void;
}

interface TransitionTimings {
  switchMs: number;
  durationMs: number;
}

/**
 * Unhurried, meditative GPU-composited timings across major scene seams.
 * Preserves 100% of PR #1 compositor-only performance (zero SVG filters / live-canvas blur).
 */
const TIMINGS: Record<TransitionKind, TransitionTimings> = {
  aperture_boot: { switchMs: 320, durationMs: 2100 },
  optical_dive: { switchMs: 480, durationMs: 1850 },
  optical_pullback: { switchMs: 360, durationMs: 1850 },
  dream_submerge: { switchMs: 420, durationMs: 2350 },
  dream_wake: { switchMs: 380, durationMs: 2350 },
  overseer_slice: { switchMs: 280, durationMs: 1950 },
};

/**
 * Coordinates seamless, slow, meditative two-layer optical/painterly cross-morphing
 * across every major screen seam—zero opaque interstitial HTML curtains.
 */
export class TransitionDirector {
  private readonly root: HTMLElement;
  private timers: number[] = [];
  private arrivalTimer: number | null = null;
  private activeFromEl: HTMLElement | null = null;
  private activeToEl: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  private clearTimers(): void {
    for (const id of this.timers) {
      window.clearTimeout(id);
    }
    this.timers = [];
  }

  private getStageEl(): HTMLElement | null {
    return this.root.querySelector<HTMLElement>('#transition-stage');
  }

  private cleanupInFlightLayers(nextFrom: HTMLElement | null, nextTo: HTMLElement | null): void {
    if (this.activeFromEl) {
      this.activeFromEl.classList.remove('is-leaving');
      delete this.activeFromEl.dataset.leaveKind;
      delete this.activeFromEl.dataset.leaveTone;
      if (this.activeFromEl !== nextFrom && this.activeFromEl !== nextTo) {
        this.activeFromEl.classList.add('hidden');
      }
      this.activeFromEl = null;
    }
    if (this.activeToEl) {
      this.activeToEl.classList.remove('is-arriving', 'is-entering');
      delete this.activeToEl.dataset.arriveKind;
      delete this.activeToEl.dataset.arriveTone;
      this.activeToEl = null;
    }
  }

  play(opts: TransitionPlayOptions): void {
    this.clearTimers();

    const stageEl = this.getStageEl();
    const fromEl = opts.fromSelector ? this.root.querySelector<HTMLElement>(opts.fromSelector) : null;
    const toEl = opts.toSelector ? this.root.querySelector<HTMLElement>(opts.toSelector) : null;

    this.cleanupInFlightLayers(fromEl, toEl);

    if (!stageEl) {
      opts.onMidpoint();
      opts.onComplete?.();
      return;
    }

    const labelEl = stageEl.querySelector<HTMLElement>('#transition-label');
    if (labelEl) labelEl.textContent = opts.label;

    const timing = TIMINGS[opts.kind];
    const tone = opts.tone ?? 'cold';

    if (fromEl && !fromEl.classList.contains('hidden') && fromEl !== toEl) {
      this.activeFromEl = fromEl;
      fromEl.dataset.leaveKind = opts.kind;
      fromEl.dataset.leaveTone = tone;
      const wasLeaving = fromEl.classList.contains('is-leaving');
      if (wasLeaving) {
        fromEl.classList.remove('is-leaving');
        void fromEl.offsetWidth;
      }
      fromEl.classList.add('is-leaving');
    }

    const wasActive = stageEl.classList.contains('is-active') || stageEl.classList.contains('is-pulse');
    stageEl.classList.remove('is-active', 'is-pulse');
    stageEl.dataset.kind = opts.kind;
    stageEl.dataset.tone = tone;
    stageEl.dataset.phase = 'active';
    if (wasActive) {
      void stageEl.offsetWidth;
    }
    stageEl.classList.add('is-active');

    const tSwitch = window.setTimeout(() => {
      opts.onMidpoint();

      if (toEl) {
        this.activeToEl = toEl;
        const wasArriving = toEl.classList.contains('is-arriving') || toEl.classList.contains('is-entering');
        toEl.classList.remove('is-leaving', 'hidden', 'is-arriving', 'is-entering');
        delete toEl.dataset.leaveKind;
        delete toEl.dataset.leaveTone;
        if (wasArriving) {
          void toEl.offsetWidth;
        }
        toEl.dataset.arriveKind = opts.kind;
        toEl.dataset.arriveTone = tone;
        toEl.classList.add('is-arriving', 'is-entering');
      }
    }, timing.switchMs);

    const tDone = window.setTimeout(() => {
      stageEl.classList.remove('is-active', 'is-pulse');
      delete stageEl.dataset.phase;

      if (this.activeFromEl && this.activeFromEl !== this.activeToEl) {
        this.activeFromEl.classList.remove('is-leaving');
        delete this.activeFromEl.dataset.leaveKind;
        delete this.activeFromEl.dataset.leaveTone;
        if (!this.activeFromEl.classList.contains('is-arriving')) {
          this.activeFromEl.classList.add('hidden');
        }
      }
      this.activeFromEl = null;

      if (this.activeToEl) {
        this.activeToEl.classList.remove('is-arriving', 'is-entering');
        delete this.activeToEl.dataset.arriveKind;
        delete this.activeToEl.dataset.arriveTone;
      }
      this.activeToEl = null;

      opts.onComplete?.();
    }, timing.durationMs);

    this.timers.push(tSwitch, tDone);
  }

  playOverlayPulse(
    kind: 'overseer_slice',
    label = 'OVERSEER // LIVE AUDIT',
    onMidpoint?: () => void,
    opts?: OverlayPulseOptions
  ): void {
    this.clearTimers();

    const stageEl = this.getStageEl();
    if (!stageEl) {
      onMidpoint?.();
      opts?.onComplete?.();
      return;
    }

    const labelEl = stageEl.querySelector<HTMLElement>('#transition-label');
    if (labelEl) labelEl.textContent = label;

    const wasActive = stageEl.classList.contains('is-active') || stageEl.classList.contains('is-pulse');
    stageEl.classList.remove('is-active');
    stageEl.dataset.kind = kind;
    stageEl.dataset.tone = 'cold';
    stageEl.dataset.phase = 'active';
    if (wasActive) {
      void stageEl.offsetWidth;
    }
    stageEl.classList.add('is-pulse', 'is-active');

    const midpointMs = opts?.midpointMs ?? 240;
    const durationMs = opts?.durationMs ?? 1150;

    const tMid = window.setTimeout(() => {
      onMidpoint?.();
    }, midpointMs);

    const tDone = window.setTimeout(() => {
      stageEl.classList.remove('is-active', 'is-pulse');
      delete stageEl.dataset.phase;
      opts?.onComplete?.();
    }, durationMs);

    this.timers.push(tMid, tDone);
  }

  triggerLayerArrival(layerSelector: string): void {
    if (this.arrivalTimer !== null) {
      window.clearTimeout(this.arrivalTimer);
      this.arrivalTimer = null;
    }
    this.root.querySelectorAll('.is-entering').forEach((el) => el.classList.remove('is-entering'));

    const layer = this.root.querySelector<HTMLElement>(layerSelector);
    if (!layer) return;

    void layer.offsetWidth;
    layer.classList.add('is-entering');
    this.arrivalTimer = window.setTimeout(() => {
      layer.classList.remove('is-entering');
      this.arrivalTimer = null;
    }, 1500);
  }

  dispose(): void {
    this.clearTimers();
    if (this.arrivalTimer !== null) {
      window.clearTimeout(this.arrivalTimer);
      this.arrivalTimer = null;
    }
    this.cleanupInFlightLayers(null, null);
  }
}
