import {
  bindCustomVernier,
  computeOpticalClarity,
  setupRetinaCanvas,
  type VernierBinding,
} from './canvasUtils';
import type { IMinigame, MinigameContext } from './types';

interface LensPass {
  rings: number[];
  targets: number[];
  focus: number;
  shear: number;
  coupled: boolean;
}

const PASSES: LensPass[] = [
  { rings: [1.35, -1.05, 0.0], targets: [0.45, -0.55, 0.0], focus: 0.62, shear: 0.5, coupled: false },
  { rings: [-1.45, 1.15, -0.95], targets: [-0.35, 0.85, -1.25], focus: 0.74, shear: 0.5, coupled: true },
  { rings: [1.85, -1.55, 1.25], targets: [0.95, -0.75, 0.25], focus: 0.82, shear: 0.28, coupled: true },
];

const LOGICAL_W = 440;
const LOGICAL_H = 264;

/**
 * Minigame 2: Gravitational Lens Unwarper.
 * Drag concentric rings until split star-caustics bridge together and dial the
 * custom optical verniers. High clarity (low H% / pruned optics) eliminates ring
 * drift shimmer, tightens aberration glow, and exposes precision bridge gauges.
 */
export class GravitationalLensUnwarper implements IMinigame {
  readonly id = 'lens_unwarper';
  readonly title = 'Gravitational Lens Unwarper';
  readonly tagline = 'Rotate each ring until its split star-caustics bridge cleanly across.';
  readonly warmthNote =
    'High H: warm caustic halo & gentle ring drift · Low H / High Clarity: crisp bridge vectors & zero sway';

  private ctx!: MinigameContext;
  private humanity = 70;
  private opticalFidelity = 0.55;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private focusVernier!: VernierBinding;
  private shearVernier!: VernierBinding;
  private shearRow!: HTMLElement;
  private hintEl!: HTMLElement;

  private ringAngles = [0, 0, 0];
  private targetAngles = [0, 0, 0];
  private focusVal = 0.28;
  private shearVal = 0.68;
  private targetFocus = 0.62;
  private targetShear = 0.5;
  private coupled = false;

  private passIdx = 0;
  private lockHold = 0;
  private activeRing = -1;
  private lastPointerAngle = 0;
  private startedAt = 0;
  private lastTime = 0;
  private lastToneAt = 0;
  private rafId = 0;
  private destroyed = false;

  mount(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.humanity = ctx.humanity;
    this.opticalFidelity = ctx.opticalFidelity;
    this.passIdx = 0;
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
            <span class="mg-vernier-label">FOCAL DEPTH</span>
            <div class="mg-vernier-track" id="mg-focus-track" role="slider" tabindex="0" aria-label="Focal Depth" aria-valuemin="0" aria-valuemax="100" aria-valuenow="28">
              <div class="mg-vernier-fill" id="mg-focus-fill"></div>
              <div class="mg-vernier-knob" id="mg-focus-knob"></div>
            </div>
            <span class="mg-vernier-val" id="mg-focus-val">28%</span>
          </div>
          <div class="mg-vernier-row hidden" id="mg-shear-row">
            <span class="mg-vernier-label">OPTICAL SHEAR</span>
            <div class="mg-vernier-track" id="mg-shear-track" role="slider" tabindex="0" aria-label="Optical Shear" aria-valuemin="0" aria-valuemax="100" aria-valuenow="68">
              <div class="mg-vernier-fill" id="mg-shear-fill"></div>
              <div class="mg-vernier-knob" id="mg-shear-knob"></div>
            </div>
            <span class="mg-vernier-val" id="mg-shear-val">68%</span>
          </div>
        </div>
      </div>
    `;

    this.canvas = ctx.container.querySelector('#mg-canvas')!;
    this.c2d = this.canvas.getContext('2d')!;
    setupRetinaCanvas(this.canvas, this.c2d, LOGICAL_W, LOGICAL_H);
    this.shearRow = ctx.container.querySelector('#mg-shear-row')!;
    this.hintEl = ctx.container.querySelector('#mg-hint')!;

    this.focusVernier = bindCustomVernier(
      ctx.container.querySelector('#mg-focus-track')!,
      ctx.container.querySelector('#mg-focus-fill')!,
      ctx.container.querySelector('#mg-focus-knob')!,
      ctx.container.querySelector('#mg-focus-val')!,
      this.focusVal,
      (v) => {
        this.focusVal = v;
      }
    );
    this.shearVernier = bindCustomVernier(
      ctx.container.querySelector('#mg-shear-track')!,
      ctx.container.querySelector('#mg-shear-fill')!,
      ctx.container.querySelector('#mg-shear-knob')!,
      ctx.container.querySelector('#mg-shear-val')!,
      this.shearVal,
      (v) => {
        this.shearVal = v;
      }
    );

    this.setupPass(0);

    ctx.container.querySelector('#mg-cancel')?.addEventListener('click', () => ctx.onCancel());

    const getCanvasPos = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) * (LOGICAL_W / Math.max(1, rect.width));
      const cy = (e.clientY - rect.top) * (LOGICAL_H / Math.max(1, rect.height));
      return { cx: cx - LOGICAL_W * 0.5, cy: cy - LOGICAL_H * 0.5 };
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      const { cx, cy } = getCanvasPos(e);
      const r = Math.hypot(cx, cy);
      const maxRings = this.passIdx === 0 ? 2 : 3;
      if (r < 48) this.activeRing = 0;
      else if (r < 84) this.activeRing = 1;
      else if (r < 126 && maxRings >= 3) this.activeRing = 2;
      else this.activeRing = -1;

      if (this.activeRing !== -1) {
        this.canvas.setPointerCapture(e.pointerId);
        this.lastPointerAngle = Math.atan2(cy, cx);
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.activeRing === -1) return;
      const { cx, cy } = getCanvasPos(e);
      const a = Math.atan2(cy, cx);
      let delta = a - this.lastPointerAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      this.lastPointerAngle = a;

      this.ringAngles[this.activeRing] += delta;
      if (this.coupled && this.activeRing === 1) {
        this.ringAngles[0] -= delta * 0.42;
      }
    });

    const up = () => {
      this.activeRing = -1;
    };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);

    this.ctx.onStageUpdate(`Pass 1 of ${PASSES.length}`, 0);
    this.loop();
  }

  private setupPass(idx: number): void {
    const p = PASSES[idx % PASSES.length];
    this.ringAngles = [...p.rings];
    this.targetAngles = [...p.targets];
    this.targetFocus = p.focus;
    this.targetShear = p.shear;
    this.coupled = p.coupled;
    this.lockHold = 0;

    this.focusVal = idx === 0 ? 0.28 : 0.22;
    this.shearVal = 0.68;
    this.focusVernier.setValue(this.focusVal);
    this.shearVernier.setValue(this.shearVal);
    this.shearRow.classList.toggle('hidden', idx < 2);
  }

  setSignalProfile(humanity: number, opticalFidelity: number): void {
    this.humanity = humanity;
    this.opticalFidelity = opticalFidelity;
  }

  destroy(): void {
    this.destroyed = true;
    this.focusVernier?.destroy();
    this.shearVernier?.destroy();
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  private angleDiff(a: number, b: number): number {
    let d = ((a - b + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  }

  private loop = (): void => {
    if (this.destroyed) return;
    this.rafId = requestAnimationFrame(this.loop);

    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    const clarity = computeOpticalClarity(this.humanity, this.opticalFidelity);
    const isHighClarity = clarity >= 0.62;

    // High H / soft optics introduce gentle refractive sway; pruned/high-clarity holds rock-steady
    const swayAmt = (1 - clarity) * 0.0007;
    if (swayAmt > 0.0001 && this.activeRing === -1) {
      this.ringAngles[0] += Math.sin(now * 0.0012) * swayAmt;
    }

    const tolAngle = 0.13 + clarity * 0.075;
    const lockSpeed = 0.78 + clarity * 0.34;
    const activeCount = this.passIdx === 0 ? 2 : 3;

    let alignedCount = 0;
    let avgMatch = 0;
    for (let i = 0; i < activeCount; i++) {
      const diff = this.angleDiff(this.ringAngles[i], this.targetAngles[i]);
      const m = Math.max(0, 1 - diff / 1.4);
      avgMatch += m;
      if (diff < tolAngle) alignedCount++;
    }
    avgMatch /= activeCount;

    const focusErr = Math.abs(this.focusVal - this.targetFocus);
    const shearErr = this.passIdx < 2 ? 0 : Math.abs(this.shearVal - this.targetShear);
    const focusOk = focusErr < 0.11;
    const shearOk = shearErr < 0.12;
    const allAligned = alignedCount === activeCount && focusOk && shearOk;

    if (allAligned) {
      this.lockHold = Math.min(1, this.lockHold + dt * lockSpeed);
      if (now - this.lastToneAt > 280) {
        this.lastToneAt = now;
        this.ctx.audio.playHarmonicTone(0.75 + 0.25 * this.lockHold);
      }
      if (this.lockHold >= 1) {
        this.ctx.audio.playRingSnap();
        this.passIdx++;
        if (this.passIdx >= PASSES.length) {
          this.ctx.onStageUpdate('Lens Unwarped', 1);
          this.ctx.onComplete({
            minigameId: this.id,
            targetId: this.ctx.target.id,
            durationSec: Math.round((now - this.startedAt) / 1000),
          });
          return;
        }
        this.setupPass(this.passIdx);
        this.ctx.onStageUpdate(`Pass ${this.passIdx + 1} of ${PASSES.length}`, this.passIdx / PASSES.length);
      }
    } else {
      this.lockHold = Math.max(0, this.lockHold - dt * 0.75);
      if (avgMatch > 0.65 && now - this.lastToneAt > 520) {
        this.lastToneAt = now;
        this.ctx.audio.playHarmonicTone(avgMatch * 0.55);
      }
    }

    if (allAligned) {
      this.hintEl.textContent = 'CAUSTIC BRIDGE LOCKED — RESOLVING HORIZON SEAM…';
    } else if (this.coupled) {
      this.hintEl.textContent =
        this.passIdx === 2
          ? 'Coupled rings + Shear: tune Focal Depth & Shear, then bridge all 3 caustics.'
          : 'Coupled optics: middle ring shifts the inner ring. Align middle first, then inner & outer.';
    } else {
      this.hintEl.textContent = 'Watch each ring’s bright caustic glow—bridge them and dial Focal Depth.';
    }

    this.ctx.onStageUpdate(
      `Pass ${this.passIdx + 1} of ${PASSES.length} · ${alignedCount}/${activeCount} bridged`,
      (this.passIdx + this.lockHold) / PASSES.length
    );

    this.draw(isHighClarity, clarity, activeCount, tolAngle, focusErr, shearErr);
  };

  private draw(
    isHighClarity: boolean,
    clarity: number,
    activeCount: number,
    tolAngle: number,
    focusErr: number,
    shearErr: number
  ): void {
    const w = LOGICAL_W;
    const h = LOGICAL_H;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const c = this.c2d;

    c.clearRect(0, 0, w, h);

    const radii = [34, 66, 98];

    let totalAlign = 0;
    for (let i = 0; i < activeCount; i++) {
      totalAlign += Math.max(0, 1 - this.angleDiff(this.ringAngles[i], this.targetAngles[i]) / 1.2);
    }
    totalAlign /= activeCount;

    if (totalAlign > 0.35) {
      const seamAlpha = (totalAlign - 0.35) * (0.45 + clarity * 0.35);
      c.strokeStyle = isHighClarity
        ? `rgba(126, 200, 232, ${seamAlpha.toFixed(2)})`
        : `rgba(235, 176, 98, ${seamAlpha.toFixed(2)})`;
      c.lineWidth = 1.2;
      c.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i * Math.PI) / 3 + 0.2;
        const x = cx + Math.cos(a) * 114;
        const y = cy + Math.sin(a) * 114;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }

    for (let i = 0; i < activeCount; i++) {
      const r = radii[i];
      const ang = this.ringAngles[i];
      const diff = this.angleDiff(ang, this.targetAngles[i]);
      const match = Math.max(0, 1 - diff / 1.35);
      const ok = diff < tolAngle;
      const col = ok ? '#7ad4b6' : isHighClarity ? '#7ec8e8' : '#ebb062';

      c.strokeStyle = 'rgba(255,255,255,0.12)';
      c.lineWidth = 1.8;
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.stroke();

      const splitOffset = (1 - match) * (0.95 - clarity * 0.2) + shearErr * 0.7;
      c.strokeStyle = isHighClarity ? 'rgba(126, 200, 232, 0.28)' : 'rgba(235, 176, 98, 0.24)';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(cx, cy, r, ang + splitOffset - 0.35, ang + splitOffset + 0.35);
      c.stroke();

      c.strokeStyle = col;
      c.lineWidth = (this.activeRing === i ? 5 : 3) + match * 2.0;
      c.beginPath();
      c.arc(cx, cy, r, ang - (0.35 + match * 0.4), ang + (0.35 + match * 0.4));
      c.stroke();

      c.fillStyle = ok ? '#7ad4b6' : '#ffffff';
      c.beginPath();
      c.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 4.4, 0, Math.PI * 2);
      c.fill();

      if (match > 0.62) {
        const rayA = this.targetAngles[i];
        c.strokeStyle = `rgba(122, 212, 182, ${((match - 0.62) * 1.4).toFixed(2)})`;
        c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(cx + Math.cos(rayA) * (r - 11), cy + Math.sin(rayA) * (r - 11));
        c.lineTo(cx + Math.cos(rayA) * (r + 11), cy + Math.sin(rayA) * (r + 11));
        c.stroke();
      }
    }

    const blurR = 4.5 + focusErr * (24 + (1 - clarity) * 10) + shearErr * 16;
    const focusOk = focusErr < 0.11 && shearErr < 0.12;
    c.fillStyle = focusOk
      ? 'rgba(122, 212, 182, 0.92)'
      : isHighClarity
        ? 'rgba(126, 200, 232, 0.36)'
        : 'rgba(235, 176, 98, 0.4)';
    c.beginPath();
    c.arc(cx, cy, blurR, 0, Math.PI * 2);
    c.fill();

    if (isHighClarity) {
      for (let i = 0; i < activeCount; i++) {
        const diff = this.angleDiff(this.ringAngles[i], this.targetAngles[i]);
        const m = Math.max(0, 1 - diff / 1.35);
        c.fillStyle = 'rgba(255,255,255,0.08)';
        c.fillRect(14, 16 + i * 11, 52, 4);
        c.fillStyle = diff < tolAngle ? '#7ad4b6' : '#7ec8e8';
        c.fillRect(14, 16 + i * 11, 52 * m, 4);
      }
    }
  }
}
