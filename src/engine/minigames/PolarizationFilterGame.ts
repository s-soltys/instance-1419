import { platform } from '../../platform/PlatformAdapter';
import { setupFullRetinaCanvas } from './canvasUtils';
import {
  drawAmbientStars,
  drawCosmicPlateBackdrop,
  drawDiffractionStar,
  drawStageUnlockPulse,
  generateAmbientStars,
  getCosmicPalette,
} from './cosmicBackdrop';
import { stageLabel } from './cosmicGameBase';
import { angleDiffRad, clamp, createSeededRng, resolveInstrumentPayout } from './tactilePhysics';
import type { IMinigame, InstrumentFieldGuide, MinigameContext, SolvabilityHarness } from './types';

interface PolarKnot {
  id: number;
  nx: number;
  ny: number;
  polarAngle: number; // angle at which its overlying glare clears cleanly
  found: boolean;
}

/**
 * POL-12 — Cosmic Polarization Filter
 * Rotate a translucent polarizing lens ring so reflected diagonal dust glare fades to zero,
 * exposing hidden magnetic filament knots underneath to click.
 */
export class PolarizationFilterGame implements IMinigame {
  readonly id = 'polarization_filter';
  readonly title = 'COSMIC POLARIZATION FILTER';
  readonly subtitle = 'Malus Law Glare Extinction';
  readonly instrumentCode = 'POL-12';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private polarizerAngle = 0.2;
  private glareAngles: number[] = [];
  private knots: PolarKnot[] = [];
  private draggingLens = false;
  private lastPointerAngle = 0;
  private stageClearTimer = 0;
  private stageFlash = 0;
  private stageFlashText = '';
  private ambientStars = generateAmbientStars(createSeededRng('pol-stars'), 44);
  private unbind: (() => void) | null = null;

  mount(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.startedAt = performance.now();
    this.completed = false;
    this.elapsedSec = 0;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minigame-canvas';
    ctx.container.innerHTML = '';
    ctx.container.appendChild(this.canvas);
    this.c2d = setupFullRetinaCanvas(this.canvas);

    this.setupStage(1);
    this.bindEvents();
    this.emitHud();
    ctx.onCalibrationComplete?.();

    this.lastTs = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTs) / 1000));
      this.lastTs = now;
      this.update(dt);
      this.render();
      if (!this.completed) this.rafId = requestAnimationFrame(tick);
    };
    if (typeof requestAnimationFrame !== 'undefined') this.rafId = requestAnimationFrame(tick);
  }

  private setupStage(stage: 1 | 2 | 3): void {
    this.stage = stage;
    this.stageClearTimer = 0;
    const rng = createSeededRng(`${this.ctx.targetId}:pol:${this.ctx.state.shift}:${stage}`);

    this.glareAngles =
      stage === 1
        ? [0.6 + rng() * 0.5]
        : stage === 2
        ? [0.35 + rng() * 0.3, 1.55 + rng() * 0.3]
        : [0.25, 1.15, 2.05];
    this.polarizerAngle = this.glareAngles[0] + 0.85;

    const knotsPerAngle = stage === 1 ? 2 : stage === 2 ? 2 : 1;
    this.knots = [];
    this.glareAngles.forEach((ga, gIdx) => {
      for (let k = 0; k < knotsPerAngle; k++) {
        const idx = gIdx * knotsPerAngle + k;
        const a = (idx * Math.PI * 2) / (this.glareAngles.length * knotsPerAngle) + rng() * 0.35;
        const r = 0.09 + rng() * 0.08;
        this.knots.push({
          id: idx,
          nx: 0.5 + Math.cos(a) * r,
          ny: 0.48 + Math.sin(a) * r * 0.85,
          polarAngle: ga,
          found: false,
        });
      }
    });
  }

  private isKnotCleared(knot: PolarKnot): boolean {
    // Polarization filters extinguish glare modulo pi (180 deg)
    const modDiff = Math.abs(Math.atan2(Math.sin(2 * (this.polarizerAngle - knot.polarAngle)), Math.cos(2 * (this.polarizerAngle - knot.polarAngle))) * 0.5);
    const tol = this.ctx.state.humanity >= 45 ? 0.24 : 0.17;
    return modDiff <= tol;
  }

  private bindEvents(): void {
    const onResize = () => {
      this.c2d = setupFullRetinaCanvas(this.canvas);
    };

    const onDown = (e: PointerEvent) => {
      if (this.completed || this.stageClearTimer > 0) return;
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);

      // Check clicking exposed magnetic knot first
      for (const knot of this.knots) {
        if (knot.found || !this.isKnotCleared(knot)) continue;
        if (Math.hypot(px - knot.nx * w, py - knot.ny * h) <= 34) {
          knot.found = true;
          platform.triggerHaptic('phaseSnapLock', 0.9);
          this.ctx.audio?.playTumblerClick(0.92, true);
          if (this.knots.every((item) => item.found)) {
            this.stageClearTimer = 0.62;
            this.stageFlash = 1;
            this.stageFlashText = `POLARIZATION ${this.stage}/3 EXTINGUISHED`;
            this.ctx.audio?.playPhaseLock?.(this.stage);
          }
          this.emitHud();
          return;
        }
      }

      this.canvas.setPointerCapture(e.pointerId);
      this.draggingLens = true;
      this.lastPointerAngle = Math.atan2(py - h * 0.48, px - w * 0.5);
      platform.triggerHaptic('vernierTick', 0.4);
    };

    const onMove = (e: PointerEvent) => {
      if (!this.draggingLens || this.completed) return;
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const ang = Math.atan2(py - rect.height * 0.48, px - rect.width * 0.5);
      this.polarizerAngle += angleDiffRad(ang, this.lastPointerAngle);
      this.lastPointerAngle = ang;
    };

    const onUp = () => {
      this.draggingLens = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (this.completed) return;
      if (e.key === 'ArrowLeft') this.polarizerAngle -= 0.08;
      if (e.key === 'ArrowRight') this.polarizerAngle += 0.08;
    };

    window.addEventListener('resize', onResize);
    this.canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKeyDown);
    this.unbind = () => {
      window.removeEventListener('resize', onResize);
      this.canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }

  private update(dt: number): void {
    if (this.completed) return;
    this.elapsedSec += dt;
    this.stageFlash = Math.max(0, this.stageFlash - dt * 1.4);

    if (this.stageClearTimer > 0) {
      this.stageClearTimer -= dt;
      if (this.stageClearTimer <= 0) {
        if (this.stage < 3) {
          this.setupStage((this.stage + 1) as 2 | 3);
          this.emitHud();
        } else {
          this.finishSuccess();
        }
      }
    }
  }

  private finishSuccess(): void {
    if (this.completed) return;
    this.completed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.ctx.audio?.stopInstrumentAudio();
    this.ctx.audio?.playCaptureShutter('clean');
    platform.triggerHaptic('shutterCommit', 1.0);
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.ctx.onComplete(
      resolveInstrumentPayout(
        'clean',
        totalSec,
        0.95,
        `${this.ctx.targetId}_polar`,
        `Polarized dust sheets extinguished across ${this.glareAngles.length} optical vectors on ${this.ctx.targetName}.`,
        `Malus Filter Lock · ${totalSec.toFixed(1)}s`,
        'Malus’s Law & Interstellar Dust Grain Polarization'
      )
    );
  }

  private emitHud(): void {
    const found = this.knots.filter((k) => k.found).length;
    const total = this.knots.length;
    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: stageLabel(this.stage),
      stageProgress: clamp((this.stage - 1 + found / Math.max(1, total)) / 3, 0, 1),
      promptText: `Twist the polarizing lens bezel to fade dust glare sheets, then tap exposed magnetic knots (${found}/${total}).`,
      actionButton: null,
    });
  }

  private render(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const c2d = this.c2d;
    const palette = getCosmicPalette(this.ctx.state.humanity);

    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'carina',
      blurPx: 4,
      alpha: 0.45,
      brightness: 0.78,
      tintAlpha: 0.48,
      gridAlpha: palette.mode === 'cold' ? 0.14 : 0.05,
    });
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, 0.78);

    const cx = w * 0.5;
    const cy = h * 0.48;
    const lensR = Math.min(w * 0.32, h * 0.35);

    // Draw lens aperture & glare polarization sheets
    c2d.save();
    c2d.beginPath();
    c2d.arc(cx, cy, lensR, 0, Math.PI * 2);
    c2d.clip?.();
    c2d.fillStyle = 'rgba(6, 12, 22, 0.58)';
    c2d.fillRect(cx - lensR, cy - lensR, lensR * 2, lensR * 2);

    // Magnetic knots underneath glare
    for (const knot of this.knots) {
      const kx = knot.nx * w;
      const ky = knot.ny * h;
      const cleared = this.isKnotCleared(knot);
      const visAlpha = knot.found ? 1 : cleared ? 0.96 : 0.18;
      drawDiffractionStar(c2d, kx, ky, knot.found ? 11 : 9, knot.found ? palette.lockHex : palette.accentHex, {
        spikes: 6,
        glowAlpha: visAlpha,
      });
    }

    // Translucent glare stripe layers rotating cleanly with angle difference!
    for (const ga of this.glareAngles) {
      const sinErr = Math.abs(Math.sin(this.polarizerAngle - ga));
      if (sinErr > 0.08) {
        c2d.save();
        c2d.translate(cx, cy);
        c2d.rotate(ga);
        c2d.strokeStyle = `rgba(255, 226, 178, ${(sinErr * 0.42).toFixed(2)})`;
        c2d.lineWidth = 10;
        for (let y = -lensR; y <= lensR; y += 26) {
          c2d.beginPath();
          c2d.moveTo(-lensR, y);
          c2d.lineTo(lensR, y);
          c2d.stroke();
        }
        c2d.restore();
      }
    }
    c2d.restore();

    // Polarizing rotatable outer bezel ring & optic grid indicator
    c2d.save();
    c2d.strokeStyle = palette.accentHex;
    c2d.lineWidth = 2.4;
    c2d.beginPath();
    c2d.arc(cx, cy, lensR, 0, Math.PI * 2);
    c2d.stroke();

    c2d.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    c2d.lineWidth = 1;
    c2d.beginPath();
    c2d.moveTo(cx + Math.cos(this.polarizerAngle) * lensR, cy + Math.sin(this.polarizerAngle) * lensR);
    c2d.lineTo(cx - Math.cos(this.polarizerAngle) * lensR, cy - Math.sin(this.polarizerAngle) * lensR);
    c2d.stroke();
    c2d.restore();

    drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, palette.lockHex);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Aligned interstellar dust scatters polarized light along specific planes; rotating an analyzer crystal blocks that glare to reveal hidden magnetic structures.',
      goalSummary: 'Rotate the polarizing lens ring until dust glare fades clear, then tap each exposed knot.',
      controlsDesktop: 'Drag around the circular lens ring (or ArrowLeft/Right) to rotate polarization, then click exposed knots.',
      controlsTouch: 'Twist around the lens rim to dim glare layers and tap revealed knots.',
      warmthEffect: 'Warm H% gives wider angular extinction pockets; Cold H% tightens polarization alignment.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        for (const k of this.knots) k.found = true;
        if (stage < 3) this.setupStage((stage + 1) as 2 | 3);
        else this.finishSuccess();
      },
      getDiagnostics: () => ({
        stage: this.stage,
        completed: this.completed,
        stageProgress: this.completed
          ? 1
          : (this.stage - 1 + this.knots.filter((k) => k.found).length / Math.max(1, this.knots.length)) / 3,
      }),
    };
  }

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.unbind?.();
    this.ctx.audio?.stopInstrumentAudio();
    this.ctx.container.innerHTML = '';
  }
}
