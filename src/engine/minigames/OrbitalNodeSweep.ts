import { computeOpticalClarity, setupRetinaCanvas } from './canvasUtils';
import type { IMinigame, MinigameContext } from './types';

interface HiddenPocket {
  x: number;
  y: number;
  found: boolean;
  revealAlpha: number;
  lockProgress: number;
}

interface SonarRipple {
  x: number;
  y: number;
  r: number;
  alpha: number;
}

const LOGICAL_W = 520;
const LOGICAL_H = 264;

/**
 * Minigame 3: Orbital Node Sweep.
 * Click, tap-and-hold, or drag across the orbital field to emit sonar pulses and lock
 * 4 anomalous pockets. High clarity (low H% / pruned optics) widens detection radius,
 * reveals clean cyan coordinate crosshairs, and accelerates node triangulation.
 */
export class OrbitalNodeSweep implements IMinigame {
  readonly id = 'orbital_sweep';
  readonly title = 'Orbital Node Sweep';
  readonly tagline = 'Click or hold to pulse the orbital field and lock all 4 bright echoes.';
  readonly warmthNote =
    'High H: warm sonar ripples & diffuse scatter · Low H / High Clarity: wide vector sweep & rapid lock';

  private ctx!: MinigameContext;
  private humanity = 70;
  private opticalFidelity = 0.55;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private hintEl!: HTMLElement;

  private pockets: HiddenPocket[] = [];
  private ripples: SonarRipple[] = [];
  private pointerPos: { x: number; y: number } | null = null;
  private isPointerDown = false;
  private startedAt = 0;
  private lastTime = 0;
  private rafId = 0;
  private destroyed = false;

  mount(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.humanity = ctx.humanity;
    this.opticalFidelity = ctx.opticalFidelity;
    this.startedAt = performance.now();
    this.lastTime = this.startedAt;
    this.destroyed = false;
    this.ripples = [];
    this.isPointerDown = false;

    this.pockets = [
      { x: 0.24, y: 0.34, found: false, revealAlpha: 0, lockProgress: 0 },
      { x: 0.72, y: 0.28, found: false, revealAlpha: 0, lockProgress: 0 },
      { x: 0.36, y: 0.74, found: false, revealAlpha: 0, lockProgress: 0 },
      { x: 0.78, y: 0.68, found: false, revealAlpha: 0, lockProgress: 0 },
    ];

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
      </div>
    `;

    this.canvas = ctx.container.querySelector('#mg-canvas')!;
    this.c2d = this.canvas.getContext('2d')!;
    setupRetinaCanvas(this.canvas, this.c2d, LOGICAL_W, LOGICAL_H);
    this.hintEl = ctx.container.querySelector('#mg-hint')!;

    ctx.container.querySelector('#mg-cancel')?.addEventListener('click', () => ctx.onCancel());

    const toNorm = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / Math.max(1, rect.width))),
        y: Math.max(0.05, Math.min(0.95, (e.clientY - rect.top) / Math.max(1, rect.height))),
      };
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      const pos = toNorm(e);
      this.isPointerDown = true;
      this.pointerPos = pos;
      this.emitPulse(pos.x, pos.y);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      this.pointerPos = toNorm(e);
    });
    this.canvas.addEventListener('pointerup', () => {
      this.isPointerDown = false;
    });
    this.canvas.addEventListener('pointerleave', () => {
      if (!this.isPointerDown) {
        this.pointerPos = null;
      }
    });

    this.ctx.onStageUpdate('0 of 4 pockets locked', 0);
    this.loop();
  }

  private emitPulse(nx: number, ny: number): void {
    this.ripples.push({ x: nx, y: ny, r: 0.01, alpha: 0.95 });
    const clarity = computeOpticalClarity(this.humanity, this.opticalFidelity);
    const revealRadius = 0.30 + clarity * 0.14;

    let bestDist = 99;
    for (const p of this.pockets) {
      if (p.found) continue;
      const d = Math.hypot(p.x - nx, p.y - ny);
      if (d < bestDist) bestDist = d;
      if (d < revealRadius) {
        p.revealAlpha = Math.max(p.revealAlpha, 1 - d / (revealRadius + 0.02));
      }
    }
    const proximity = Math.max(0, 1 - bestDist / 0.55);
    this.ctx.audio.playSonarPing(proximity);
  }

  setSignalProfile(humanity: number, opticalFidelity: number): void {
    this.humanity = humanity;
    this.opticalFidelity = opticalFidelity;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  private loop = (): void => {
    if (this.destroyed) return;
    this.rafId = requestAnimationFrame(this.loop);

    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    const clarity = computeOpticalClarity(this.humanity, this.opticalFidelity);
    const isHighClarity = clarity >= 0.62;
    const lockRadius = 0.08 + clarity * 0.03;
    const lockRate = (this.isPointerDown ? 1.35 : 0.95) * (0.85 + clarity * 0.45);

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rip = this.ripples[i];
      rip.r += dt * 0.44;
      rip.alpha -= dt * 0.68;
      if (rip.alpha <= 0) this.ripples.splice(i, 1);
    }

    let foundCount = 0;
    let totalProg = 0;

    for (const p of this.pockets) {
      if (p.found) {
        foundCount++;
        totalProg += 1;
        continue;
      }

      p.revealAlpha = Math.max(0, p.revealAlpha - dt * (0.28 - clarity * 0.12));

      if (this.pointerPos) {
        const d = Math.hypot(p.x - this.pointerPos.x, p.y - this.pointerPos.y);
        if (d < lockRadius) {
          p.revealAlpha = Math.max(p.revealAlpha, 0.9);
          p.lockProgress = Math.min(1, p.lockProgress + dt * lockRate);
          if (p.lockProgress >= 1) {
            p.found = true;
            this.ctx.audio.playRingSnap();
          }
        } else {
          p.lockProgress = Math.max(0, p.lockProgress - dt * 0.45);
        }
      }
      totalProg += p.lockProgress;
    }

    if (foundCount >= this.pockets.length) {
      this.ctx.onStageUpdate('All 4 pockets triangulated', 1);
      this.ctx.onComplete({
        minigameId: this.id,
        targetId: this.ctx.target.id,
        durationSec: Math.round((now - this.startedAt) / 1000),
      });
      return;
    }

    this.ctx.onStageUpdate(`${foundCount} of ${this.pockets.length} pockets locked`, totalProg / this.pockets.length);
    this.hintEl.textContent = isHighClarity
      ? `VECTOR TRIANGULATION · ${foundCount}/${this.pockets.length} LOCKED · CLEAR GLASS`
      : 'Click or hold to pulse the field, then hold over bright echoes to lock them.';

    this.draw(isHighClarity);
  };

  private draw(isHighClarity: boolean): void {
    const w = LOGICAL_W;
    const h = LOGICAL_H;
    const c = this.c2d;

    c.clearRect(0, 0, w, h);

    c.strokeStyle = isHighClarity ? 'rgba(126, 200, 232, 0.14)' : 'rgba(235, 176, 98, 0.1)';
    c.lineWidth = 1;
    if (isHighClarity) {
      for (let x = 0; x <= w; x += 52) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, h);
        c.stroke();
      }
      for (let y = 0; y <= h; y += 54) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(w, y);
        c.stroke();
      }
    } else {
      for (let r = 45; r <= 225; r += 45) {
        c.beginPath();
        c.arc(w * 0.5, h * 0.5, r, 0, Math.PI * 2);
        c.stroke();
      }
    }

    for (const rip of this.ripples) {
      c.strokeStyle = isHighClarity
        ? `rgba(126, 200, 232, ${rip.alpha.toFixed(2)})`
        : `rgba(235, 176, 98, ${rip.alpha.toFixed(2)})`;
      c.lineWidth = 1.6;
      c.beginPath();
      c.arc(rip.x * w, rip.y * h, rip.r * Math.max(w, h), 0, Math.PI * 2);
      c.stroke();
    }

    for (const p of this.pockets) {
      const px = p.x * w;
      const py = p.y * h;
      if (p.found) {
        c.fillStyle = '#7ad4b6';
        c.beginPath();
        c.arc(px, py, 6, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = 'rgba(122, 212, 182, 0.52)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(px, py, 14, 0, Math.PI * 2);
        c.stroke();
      } else if (p.revealAlpha > 0.02) {
        const col = isHighClarity
          ? `rgba(126, 200, 232, ${p.revealAlpha})`
          : `rgba(235, 176, 98, ${p.revealAlpha})`;
        c.strokeStyle = col;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(px, py, 14 + (1 - p.lockProgress) * 10, 0, Math.PI * 2);
        c.stroke();

        if (p.lockProgress > 0.02) {
          c.strokeStyle = '#7ad4b6';
          c.lineWidth = 2.5;
          c.beginPath();
          c.arc(px, py, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.lockProgress);
          c.stroke();
        }
      }
    }

    if (isHighClarity && this.pointerPos) {
      const cx = this.pointerPos.x * w;
      const cy = this.pointerPos.y * h;
      c.strokeStyle = 'rgba(126, 200, 232, 0.28)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(cx - 12, cy);
      c.lineTo(cx + 12, cy);
      c.moveTo(cx, cy - 12);
      c.lineTo(cx, cy + 12);
      c.stroke();
    }
  }
}
