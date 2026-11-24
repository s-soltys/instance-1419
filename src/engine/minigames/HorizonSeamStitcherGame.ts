import { platform } from '../../platform/PlatformAdapter';
import { setupFullRetinaCanvas } from './canvasUtils';
import {
  drawAmbientStars,
  drawCosmicPlateBackdrop,
  drawDiffractionStar,
  drawLockResonanceRing,
  drawStageUnlockPulse,
  generateAmbientStars,
  getCosmicPalette,
} from './cosmicBackdrop';
import { drawVernierStrip, hitVernierStrip, layoutVernierRow, stageLabel, valueFromStripX, VernierStripSpec } from './cosmicGameBase';
import { angleDiffRad, clamp, createSeededRng, lerp, resolveInstrumentPayout } from './tactilePhysics';
import type { IMinigame, InstrumentFieldGuide, MinigameContext, SolvabilityHarness } from './types';

interface HorizonGalaxy {
  rx: number; // local offset relative to patch center (-0.18..0.18 of min(w,h))
  ry: number;
  color: string;
  size: number;
}

/**
 * SEM-17 — Horizon Seam Stitcher (Lore Signature Instrument)
 * Slide (X/Y), rotate (Stages 2-3), and mirror-flip (Stage 3) a translucent patch of the
 * Southern deep sky directly over the Northern horizon until distant galaxies overlap 1:1—
 * exposing the synthetic 93-billion-light-year sky enclosure seam!
 */
export class HorizonSeamStitcherGame implements IMinigame {
  readonly id = 'horizon_seam_stitcher';
  readonly title = 'HORIZON SEAM STITCHER';
  readonly subtitle = 'Antipodal 93-BLY Sky Overlap';
  readonly instrumentCode = 'SEM-17';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private galaxies: HorizonGalaxy[] = [];
  private northNx = 0.5;
  private northNy = 0.45;
  private patchNx = 0.3;
  private patchNy = 0.5;
  private patchRot = 0;
  private patchFlipped = false;
  private targetFlipped = false;

  private dragMode: 'patch' | 'rot' | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private rotStrip: VernierStripSpec | null = null;
  private lockHoldSec = 0;
  private readonly lockHoldTargetSec = 0.6;
  private stageFlash = 0;
  private stageFlashText = '';
  private ambientStars = generateAmbientStars(createSeededRng('sem-stars'), 48);
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
    this.lockHoldSec = 0;
    const rng = createSeededRng(`${this.ctx.targetId}:sem:${this.ctx.state.shift}:${stage}`);

    this.northNx = 0.54 + (rng() - 0.5) * 0.1;
    this.northNy = 0.44 + (rng() - 0.5) * 0.08;
    this.patchNx = 0.28 + rng() * 0.08;
    this.patchNy = 0.52 + (rng() - 0.5) * 0.1;
    this.patchRot = stage === 1 ? 0 : (rng() > 0.5 ? 1 : -1) * (0.45 + rng() * 0.35);
    this.targetFlipped = stage === 3;
    this.patchFlipped = false;

    const palettePool = ['#ff986b', '#8ad4ff', '#ffd98a', '#8be9c0', '#b892ff', '#ffffff'];
    const count = stage === 1 ? 4 : stage === 2 ? 5 : 6;
    this.galaxies = [];
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count + rng() * 0.4;
      const r = 0.055 + rng() * 0.11;
      this.galaxies.push({
        rx: Math.cos(a) * r,
        ry: Math.sin(a) * r,
        color: palettePool[i % palettePool.length],
        size: 6 + (i % 3) * 2,
      });
    }
  }

  onHelperAction(actionId: string): void {
    if (actionId === 'mirror_flip' && this.stage === 3 && !this.completed) {
      this.patchFlipped = !this.patchFlipped;
      this.ctx.audio?.playSolenoidClack(true);
      platform.triggerHaptic('vernierTick', 0.72);
      this.emitHud();
    }
  }

  private isAlignedNow(): boolean {
    if (this.patchFlipped !== this.targetFlipped) return false;
    const posTol = this.ctx.state.humanity >= 45 ? 0.036 : 0.026;
    const rotTol = this.ctx.state.humanity >= 45 ? 0.14 : 0.1;
    const posOk = Math.hypot(this.patchNx - this.northNx, (this.patchNy - this.northNy) * 0.72) <= posTol;
    const rotOk = Math.abs(angleDiffRad(this.patchRot, 0)) <= rotTol;
    return posOk && rotOk;
  }

  private bindEvents(): void {
    const onResize = () => {
      this.c2d = setupFullRetinaCanvas(this.canvas);
    };

    const onDown = (e: PointerEvent) => {
      if (this.completed) return;
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);

      if (this.rotStrip && hitVernierStrip(this.rotStrip, px, py)) {
        this.canvas.setPointerCapture(e.pointerId);
        this.dragMode = 'rot';
        const val01 = valueFromStripX(this.rotStrip, px, 0.5);
        this.patchRot = lerp(-Math.PI * 0.5, Math.PI * 0.5, val01);
        platform.triggerHaptic('vernierTick', 0.45);
        return;
      }

      this.canvas.setPointerCapture(e.pointerId);
      this.dragMode = 'patch';
      this.dragOffsetX = px / w - this.patchNx;
      this.dragOffsetY = py / h - this.patchNy;
    };

    const onMove = (e: PointerEvent) => {
      if (!this.dragMode || this.completed) return;
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);

      if (this.dragMode === 'rot' && this.rotStrip) {
        const val01 = valueFromStripX(this.rotStrip, px, 0.5);
        this.patchRot = lerp(-Math.PI * 0.5, Math.PI * 0.5, val01);
      } else if (this.dragMode === 'patch') {
        let nx = clamp(px / w - this.dragOffsetX, 0.14, 0.86);
        let ny = clamp(py / h - this.dragOffsetY, 0.2, 0.78);
        if (Math.hypot(nx - this.northNx, ny - this.northNy) < 0.025) {
          nx = lerp(nx, this.northNx, 0.42);
          ny = lerp(ny, this.northNy, 0.42);
        }
        this.patchNx = nx;
        this.patchNy = ny;
      }
    };

    const onUp = () => {
      this.dragMode = null;
    };

    window.addEventListener('resize', onResize);
    this.canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    this.unbind = () => {
      window.removeEventListener('resize', onResize);
      this.canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }

  private update(dt: number): void {
    if (this.completed) return;
    this.elapsedSec += dt;
    this.stageFlash = Math.max(0, this.stageFlash - dt * 1.4);

    if (this.isAlignedNow()) {
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        platform.triggerHaptic('phaseSnapLock', 0.95);
        this.ctx.audio?.playPhaseLock?.(this.stage);
        if (this.stage < 3) {
          this.stageFlash = 1;
          this.stageFlashText = `ANTIPODAL SEAM ${this.stage}/3 PROVEN`;
          this.setupStage((this.stage + 1) as 2 | 3);
        } else {
          this.finishSuccess();
        }
      }
    } else {
      this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.6);
    }

    this.emitHud();
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
        0.96,
        `${this.ctx.targetId}_horizonseam`,
        `Identical 1:1 mirrored antipodal galaxies overlapped across the 93-billion-light-year wall on ${this.ctx.targetName}.`,
        `Seam Correlation 96% · ${totalSec.toFixed(1)}s`,
        'Antipodal Spherical Enclosure Projection Symmetry'
      )
    );
  }

  private emitHud(): void {
    const prompt =
      this.stage === 1
        ? 'Drag the translucent South-Sky frame onto the North Horizon galaxies until every star overlaps identically.'
        : this.stage === 2
        ? 'Drag the South-Sky frame AND tune PATCH ROTATION below to match North and South constellations.'
        : 'Click MIRROR FLIP below, rotate & drag the frame until all 6 antipodal galaxies lock 1:1 on the seam!';

    const dist = Math.hypot(this.patchNx - this.northNx, this.patchNy - this.northNy);
    const close = clamp(1 - dist / 0.35, 0, 1);

    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: stageLabel(this.stage),
      stageProgress: clamp((this.stage - 1 + close) / 3, 0, 1),
      promptText: prompt,
      actionButton:
        this.stage === 3
          ? { id: 'mirror_flip', label: this.patchFlipped ? 'MIRROR FLIPPED ✓' : 'MIRROR FLIP', active: this.patchFlipped }
          : null,
    });
  }

  private render(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const c2d = this.c2d;
    const palette = getCosmicPalette(this.ctx.state.humanity);
    const aligned = this.isAlignedNow();
    const scale = Math.min(w, h);

    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'smacs',
      blurPx: 3,
      alpha: 0.46,
      brightness: 0.78,
      tintAlpha: 0.46,
      gridAlpha: aligned ? 0.24 : 0.06,
    });
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, 0.76);

    // Fixed North Horizon Galaxy Template
    const nCx = this.northNx * w;
    const nCy = this.northNy * h;
    for (const g of this.galaxies) {
      drawDiffractionStar(c2d, nCx + g.rx * scale, nCy + g.ry * scale, g.size, g.color, {
        spikes: 6,
        glowAlpha: 0.9,
      });
    }

    // Draggable Translucent South Horizon Patch!
    const pCx = this.patchNx * w;
    const pCy = this.patchNy * h;
    const patchR = scale * 0.2;

    c2d.save();
    c2d.translate(pCx, pCy);
    c2d.fillStyle = aligned ? `rgba(${palette.lockRgb}, 0.14)` : 'rgba(12, 22, 38, 0.34)';
    c2d.strokeStyle = aligned ? palette.lockHex : palette.accentHex;
    c2d.lineWidth = aligned ? 2.4 : 1.6;
    c2d.setLineDash([5, 4]);
    c2d.beginPath();
    c2d.arc(0, 0, patchR, 0, Math.PI * 2);
    c2d.fill();
    c2d.stroke();
    c2d.setLineDash([]);

    for (const g of this.galaxies) {
      // Transform galaxy point cleanly matching rotation and horizontal mirror flag!
      const lx = (this.patchFlipped === this.targetFlipped ? g.rx : -g.rx) * scale;
      const ly = g.ry * scale;
      const rx = lx * Math.cos(this.patchRot) - ly * Math.sin(this.patchRot);
      const ry = lx * Math.sin(this.patchRot) + ly * Math.cos(this.patchRot);
      c2d.strokeStyle = g.color;
      c2d.lineWidth = 1.8;
      c2d.beginPath();
      c2d.arc(rx, ry, g.size + 4, 0, Math.PI * 2);
      c2d.stroke();
    }
    c2d.restore();

    if (this.stage >= 2) {
      const val01 = clamp((this.patchRot + Math.PI * 0.5) / Math.PI, 0, 1);
      const strip = layoutVernierRow(w, h, [
        {
          key: 'rot',
          label: 'PATCH ROTATION',
          val01,
          locked: Math.abs(angleDiffRad(this.patchRot, 0)) <= 0.14,
          rightText: `${Math.round((this.patchRot * 180) / Math.PI)}°`,
        },
      ])[0];
      this.rotStrip = strip;
      drawVernierStrip(c2d, strip, palette.accentHex, palette.lockHex);
    } else {
      this.rotStrip = null;
    }

    if (this.lockHoldSec > 0.02) {
      drawLockResonanceRing(c2d, nCx, nCy, patchR + 8, this.lockHoldSec / this.lockHoldTargetSec, palette.lockHex);
    }

    drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, palette.lockHex);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'At the 93-billion-light-year boundary, opposite sky hemispheres display mirrored duplicate star clusters—revealing an artificial projection enclosure.',
      goalSummary: 'Align, rotate, and mirror-flip the South-Sky overlay patch until all distant galaxies overlap 1:1.',
      controlsDesktop: 'Drag the circular frame over the galaxies; adjust PATCH ROTATION & MIRROR FLIP below.',
      controlsTouch: 'Slide the translucent galaxy patch, twist PATCH ROTATION, and tap MIRROR FLIP.',
      warmthEffect: 'Warm H% gives wider overlap capture rings; Cold H% sharpens coordinate seam lines.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        this.patchNx = this.northNx;
        this.patchNy = this.northNy;
        this.patchRot = 0;
        this.patchFlipped = this.targetFlipped;
        if (stage < 3) this.setupStage((stage + 1) as 2 | 3);
        else this.finishSuccess();
      },
      getDiagnostics: () => ({
        stage: this.stage,
        completed: this.completed,
        stageProgress: this.completed ? 1 : (this.stage - 1 + (this.isAlignedNow() ? 1 : 0.25)) / 3,
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
