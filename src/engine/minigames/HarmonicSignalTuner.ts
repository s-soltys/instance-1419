import {
  bindCustomVernier,
  computeOpticalClarity,
  setupRetinaCanvas,
  type VernierBinding,
} from './canvasUtils';
import type { IMinigame, MinigameContext } from './types';

interface WaveStage {
  targetFreq: number;
  targetAmp: number;
  targetPhase: number;
}

const STAGES: WaveStage[] = [
  { targetFreq: 0.34, targetAmp: 0.68, targetPhase: 0.28 },
  { targetFreq: 0.64, targetAmp: 0.52, targetPhase: 0.72 },
  { targetFreq: 0.82, targetAmp: 0.78, targetPhase: 0.44 },
];

const LOGICAL_W = 560;
const LOGICAL_H = 240;

/**
 * Minigame 1: Harmonic Signal Tuner.
 * Drag across the optical waveform or custom hairline verniers to lock frequency and phase.
 * Canon H% + opticalFidelity contract: pruned/high-clarity optics suppress thermal shimmer
 * and display crisp ΔF/Δφ telemetry; high warmth feels intuitive and harmonic through shimmer.
 */
export class HarmonicSignalTuner implements IMinigame {
  readonly id = 'harmonic_tuner';
  readonly title = 'Harmonic Signal Tuner';
  readonly tagline = 'Drag across the waveform to align its frequency and phase.';
  readonly warmthNote =
    'High H: warm harmonic glow & atmospheric shimmer · Low H / High Clarity: noiseless cyan ΔF/Δφ lock';

  private ctx!: MinigameContext;
  private humanity = 70;
  private opticalFidelity = 0.55;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private freqVernier!: VernierBinding;
  private phaseVernier!: VernierBinding;
  private hintEl!: HTMLElement;

  private freq = 0.2;
  private phase = 0.8;
  private stageIdx = 0;
  private lockHold = 0;
  private startedAt = 0;
  private lastTime = 0;
  private lastToneAt = 0;
  private rafId = 0;
  private dragging = false;
  private destroyed = false;

  mount(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.humanity = ctx.humanity;
    this.opticalFidelity = ctx.opticalFidelity;
    this.stageIdx = 0;
    this.lockHold = 0;
    this.freq = 0.2;
    this.phase = 0.8;
    this.startedAt = performance.now();
    this.lastTime = this.startedAt;
    this.destroyed = false;

    ctx.container.innerHTML = `
      <div class="mg-shell">
        <div class="mg-head">
          <div>
            <div class="mg-title">${this.title}</div>
            <div class="mg-sub" id="mg-hint">${this.tagline}</div>
          </div>
          <button class="etched-action" id="mg-cancel" type="button">BACK</button>
        </div>
        <div class="mg-canvas-wrap">
          <canvas id="mg-canvas"></canvas>
        </div>
        <div class="mg-controls">
          <div class="mg-vernier-row">
            <span class="mg-vernier-label">FREQUENCY</span>
            <div class="mg-vernier-track" id="mg-freq-track" role="slider" tabindex="0" aria-label="Frequency" aria-valuemin="0" aria-valuemax="100" aria-valuenow="20">
              <div class="mg-vernier-fill" id="mg-freq-fill"></div>
              <div class="mg-vernier-knob" id="mg-freq-knob"></div>
            </div>
            <span class="mg-vernier-val" id="mg-freq-val">20%</span>
          </div>
          <div class="mg-vernier-row">
            <span class="mg-vernier-label">PHASE / PULSE</span>
            <div class="mg-vernier-track" id="mg-phase-track" role="slider" tabindex="0" aria-label="Phase" aria-valuemin="0" aria-valuemax="100" aria-valuenow="80">
              <div class="mg-vernier-fill" id="mg-phase-fill"></div>
              <div class="mg-vernier-knob" id="mg-phase-knob"></div>
            </div>
            <span class="mg-vernier-val" id="mg-phase-val">80%</span>
          </div>
        </div>
      </div>
    `;

    this.canvas = ctx.container.querySelector('#mg-canvas')!;
    this.c2d = this.canvas.getContext('2d')!;
    setupRetinaCanvas(this.canvas, this.c2d, LOGICAL_W, LOGICAL_H);
    this.hintEl = ctx.container.querySelector('#mg-hint')!;

    ctx.container.querySelector('#mg-cancel')?.addEventListener('click', () => ctx.onCancel());

    this.freqVernier = bindCustomVernier(
      ctx.container.querySelector('#mg-freq-track')!,
      ctx.container.querySelector('#mg-freq-fill')!,
      ctx.container.querySelector('#mg-freq-knob')!,
      ctx.container.querySelector('#mg-freq-val')!,
      this.freq,
      (v) => {
        this.freq = v;
      }
    );
    this.phaseVernier = bindCustomVernier(
      ctx.container.querySelector('#mg-phase-track')!,
      ctx.container.querySelector('#mg-phase-fill')!,
      ctx.container.querySelector('#mg-phase-knob')!,
      ctx.container.querySelector('#mg-phase-val')!,
      this.phase,
      (v) => {
        this.phase = v;
      }
    );

    const applyPointer = (clientX: number, clientY: number) => {
      const rect = this.canvas.getBoundingClientRect();
      this.freq = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
      this.phase = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / Math.max(1, rect.height)));
      this.freqVernier.setValue(this.freq);
      this.phaseVernier.setValue(this.phase);
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      applyPointer(e.clientX, e.clientY);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      applyPointer(e.clientX, e.clientY);
    });
    const endDrag = () => {
      this.dragging = false;
    };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);

    this.ctx.onStageUpdate(`Layer 1 of ${STAGES.length}`, 0);
    this.loop();
  }

  setSignalProfile(humanity: number, opticalFidelity: number): void {
    this.humanity = humanity;
    this.opticalFidelity = opticalFidelity;
  }

  destroy(): void {
    this.destroyed = true;
    this.freqVernier?.destroy();
    this.phaseVernier?.destroy();
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  private loop = (): void => {
    if (this.destroyed) return;
    this.rafId = requestAnimationFrame(this.loop);

    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const t = now * 0.001;

    const stage = STAGES[this.stageIdx];
    const clarity = computeOpticalClarity(this.humanity, this.opticalFidelity);
    const isHighClarity = clarity >= 0.62;

    // Canon reward: pruned/high-clarity optics lock cleaner and slightly more decisively without shimmer noise
    const tolerance = 0.08 + clarity * 0.045;
    const lockSpeed = 0.72 + clarity * 0.38;
    const dist = Math.hypot(this.freq - stage.targetFreq, this.phase - stage.targetPhase);
    const match = Math.max(0, 1 - dist / 0.45);

    if (dist < tolerance) {
      this.lockHold = Math.min(1, this.lockHold + dt * lockSpeed);
      if (now - this.lastToneAt > 260) {
        this.lastToneAt = now;
        this.ctx.audio.playHarmonicTone(0.65 + 0.35 * this.lockHold);
      }
      if (this.lockHold >= 1) {
        this.ctx.audio.playRingSnap();
        this.stageIdx++;
        this.lockHold = 0;
        if (this.stageIdx >= STAGES.length) {
          this.ctx.onStageUpdate('Signal Decoded', 1);
          this.ctx.onComplete({
            minigameId: this.id,
            targetId: this.ctx.target.id,
            durationSec: Math.round((now - this.startedAt) / 1000),
          });
          return;
        }
        this.ctx.onStageUpdate(`Layer ${this.stageIdx + 1} of ${STAGES.length}`, this.stageIdx / STAGES.length);
      }
    } else {
      this.lockHold = Math.max(0, this.lockHold - dt * 0.8);
      if (match > 0.5 && now - this.lastToneAt > 400) {
        this.lastToneAt = now;
        this.ctx.audio.playHarmonicTone(match * (0.55 + (1 - clarity) * 0.25));
      }
    }

    const overall = (this.stageIdx + this.lockHold) / STAGES.length;
    this.ctx.onStageUpdate(
      `Layer ${this.stageIdx + 1} of ${STAGES.length} · ${Math.round(match * 100)}% match`,
      overall
    );

    if (isHighClarity) {
      const df = Math.round((this.freq - stage.targetFreq) * 100);
      const dp = Math.round((this.phase - stage.targetPhase) * 100);
      this.hintEl.textContent = `OPTICAL TELEMETRY · ΔF ${df >= 0 ? '+' : ''}${df} · Δφ ${dp >= 0 ? '+' : ''}${dp}`;
    } else {
      this.hintEl.textContent =
        dist < tolerance
          ? 'HOLD STEADY — CARRIER RESONATING…'
          : 'Sweep through the thermal shimmer until both waves sing in unison.';
    }

    this.draw(t, stage, match, clarity, isHighClarity);
  };

  private draw(t: number, stage: WaveStage, match: number, clarity: number, isHighClarity: boolean): void {
    const w = LOGICAL_W;
    const h = LOGICAL_H;
    const c = this.c2d;

    c.clearRect(0, 0, w, h);

    // Subtle calibration grid (sharper at high optical clarity)
    c.strokeStyle = isHighClarity ? 'rgba(126, 200, 232, 0.14)' : 'rgba(235, 176, 98, 0.08)';
    c.lineWidth = 1;
    for (let x = 0; x <= w; x += 40) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, h);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(0, h * 0.5);
    c.lineTo(w, h * 0.5);
    c.stroke();

    const shimmerAmp = (1 - clarity) * 6.5;

    const drawWave = (
      freq: number,
      phase: number,
      amp: number,
      color: string,
      lineW: number,
      dash: number[] = [],
      shimmer = 0
    ) => {
      c.save();
      c.strokeStyle = color;
      c.lineWidth = lineW;
      c.setLineDash(dash);
      c.beginPath();
      const cycles = 2.0 + freq * 7.5;
      for (let x = 0; x <= w; x += 3) {
        const nx = x / w;
        const noise = shimmer > 0.2 ? Math.sin(nx * 41.0 + t * 5.2) * Math.cos(nx * 19.0 - t * 3.1) * shimmer : 0;
        const y =
          h * 0.5 +
          noise +
          Math.sin(nx * Math.PI * 2 * cycles + phase * Math.PI * 2 + t * 2.1) * (h * 0.30 * amp) +
          Math.cos(nx * Math.PI * 4 * cycles - t * 1.4) * (h * 0.06 * amp);
        if (x === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      c.restore();
    };

    drawWave(
      stage.targetFreq,
      stage.targetPhase,
      stage.targetAmp,
      isHighClarity ? 'rgba(190, 232, 255, 0.52)' : 'rgba(255, 224, 172, 0.34)',
      2,
      [6, 5],
      shimmerAmp
    );

    const playerCol =
      this.lockHold > 0.15 ? '#7ad4b6' : isHighClarity ? '#7ec8e8' : '#ebb062';
    drawWave(this.freq, this.phase, stage.targetAmp, playerCol, 2.4 + match * 1.4);

    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fillRect(0, h - 3, w, 3);
    c.fillStyle = playerCol;
    c.fillRect(0, h - 3, w * this.lockHold, 3);
  }
}
