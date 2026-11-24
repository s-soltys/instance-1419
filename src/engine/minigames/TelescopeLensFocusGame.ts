import { platform } from '../../platform/PlatformAdapter';
import { computeOpticalClarity, setupFullRetinaCanvas } from './canvasUtils';
import {
  drawAmbientStars,
  drawCosmicPlateBackdrop,
  drawLockResonanceRing,
  drawStageUnlockPulse,
  generateAmbientStars,
  getCosmicPalette,
  getCosmicPlateImage,
} from './cosmicBackdrop';
import { angleDiffRad, clamp, createSeededRng, lerp, resolveInstrumentPayout } from './tactilePhysics';
import type {
  IMinigame,
  InstrumentFieldGuide,
  MinigameContext,
  SolvabilityHarness,
} from './types';

interface LensRing {
  idx: number;
  angle: number;
  targetAngle: number;
  rInnerFrac: number;
  rOuterFrac: number;
}

/**
 * LNS-04 — Gravitational Lens Focus
 * All 3 concentric optical shells are visible from Stage 1 (Outer -> Middle -> Inner unlock in order).
 * Zero giveaway target ticks: align warped radial galaxy filaments + blur clearing, plus a Focal Depth lever in Stages 2 & 3.
 */
export class TelescopeLensFocusGame implements IMinigame {
  readonly id = 'lens_focus';
  readonly title = 'GRAVITATIONAL LENS FOCUS';
  readonly subtitle = 'Concentric Caustic De-Warping';
  readonly instrumentCode = 'LNS-04';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private rings: LensRing[] = [];
  private focalDepth = 0.5;
  private targetFocalDepth = 0.65;
  private dragMode: 'ring' | 'focal' | null = null;
  private lastPointerAngle = 0;
  private lockHoldSec = 0;
  private readonly lockHoldTargetSec = 0.65;
  private stageFlash = 0;
  private stageFlashText = '';
  private focalBarRect = { x: 0, y: 0, w: 0, h: 0 };
  private ambientStars = generateAmbientStars(createSeededRng('lns-stars'), 48);
  private accSum = 0;
  private accCount = 0;
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

    this.initAllThreeRings();
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
      if (!this.completed) {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    if (typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame(tick);
    }
  }

  private initAllThreeRings(): void {
    const rng = createSeededRng(`${this.ctx.targetId}:lns:${this.ctx.state.shift}`);
    const bands: Array<[number, number]> = [
      [0.70, 0.98], // Outer (Stage 1)
      [0.44, 0.68], // Middle (Stage 2)
      [0.20, 0.42], // Inner (Stage 3)
    ];

    this.rings = bands.map(([rIn, rOut], idx) => {
      const targetAngle = (rng() - 0.5) * 1.1;
      const offset = (idx % 2 === 0 ? 1 : -1) * (0.85 + rng() * 0.65);
      return {
        idx,
        angle: targetAngle + offset,
        targetAngle,
        rInnerFrac: rIn,
        rOuterFrac: rOut,
      };
    });
  }

  private setupStage(stage: 1 | 2 | 3): void {
    this.stage = stage;
    this.lockHoldSec = 0;
    const rng = createSeededRng(`${this.ctx.targetId}:lns-foc:${this.ctx.state.shift}:${stage}`);

    // Lock previously completed shells cleanly
    for (let i = 0; i < this.rings.length; i++) {
      if (i < stage - 1) {
        this.rings[i].angle = this.rings[i].targetAngle;
      }
    }

    if (stage === 1) {
      this.focalDepth = 0.65;
      this.targetFocalDepth = 0.65;
    } else {
      this.targetFocalDepth = 0.25 + rng() * 0.55;
      this.focalDepth = this.targetFocalDepth > 0.5 ? 0.18 : 0.84;
    }
  }

  private getGeometry(w: number, h: number) {
    const compact = h < 450;
    const maxR = Math.min(w * 0.31, compact ? h * 0.32 : h * 0.33);
    return {
      cx: w * 0.5,
      cy: compact ? h * 0.42 : h * 0.45,
      maxR,
    };
  }

  private computeMatch01(): number {
    const clarity = computeOpticalClarity(this.ctx.state.humanity, this.ctx.state.opticalFidelity);
    const activeRing = this.rings[this.stage - 1];
    if (!activeRing) return 0;

    const angDiff = Math.abs(angleDiffRad(activeRing.angle, activeRing.targetAngle));
    const angTol = lerp(1.05, 0.78, 1 - clarity * 0.4);
    const angScore = clamp(1 - angDiff / angTol, 0, 1);

    if (this.stage === 1) return angScore;
    const focalDiff = Math.abs(this.focalDepth - this.targetFocalDepth);
    const focalScore = clamp(1 - focalDiff / 0.48, 0, 1);
    return angScore * 0.65 + focalScore * 0.35;
  }

  private isStageAligned(): boolean {
    const activeRing = this.rings[this.stage - 1];
    if (!activeRing) return false;
    const angTol = this.ctx.state.humanity >= 45 ? 0.19 : 0.14;
    const angOk = Math.abs(angleDiffRad(activeRing.angle, activeRing.targetAngle)) <= angTol;
    if (!angOk) return false;
    if (this.stage === 1) return true;
    const focalTol = this.ctx.state.humanity >= 45 ? 0.115 : 0.085;
    return Math.abs(this.focalDepth - this.targetFocalDepth) <= focalTol;
  }

  private bindEvents(): void {
    const onResize = () => {
      this.c2d = setupFullRetinaCanvas(this.canvas);
    };

    const applyFocalAtX = (px: number) => {
      let nextF = clamp((px - this.focalBarRect.x) / Math.max(1, this.focalBarRect.w), 0, 1);
      if (Math.abs(nextF - this.targetFocalDepth) < 0.08) {
        nextF = lerp(nextF, this.targetFocalDepth, 0.42);
      }
      this.focalDepth = nextF;
    };

    const onDown = (e: PointerEvent) => {
      if (this.completed) return;
      this.canvas.setPointerCapture(e.pointerId);
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      if (
        this.stage >= 2 &&
        px >= this.focalBarRect.x - 16 &&
        px <= this.focalBarRect.x + this.focalBarRect.w + 16 &&
        py >= this.focalBarRect.y - 18 &&
        py <= this.focalBarRect.y + this.focalBarRect.h + 18
      ) {
        this.dragMode = 'focal';
        applyFocalAtX(px);
        platform.triggerHaptic('vernierTick', 0.45);
        return;
      }

      const { cx, cy } = this.getGeometry(Math.max(1, rect.width), Math.max(1, rect.height));
      this.dragMode = 'ring';
      this.lastPointerAngle = Math.atan2(py - cy, px - cx);
      platform.triggerHaptic('vernierTick', 0.45);
    };

    const onMove = (e: PointerEvent) => {
      if (!this.dragMode || this.completed) return;
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      if (this.dragMode === 'focal') {
        applyFocalAtX(px);
        return;
      }

      const { cx, cy } = this.getGeometry(Math.max(1, rect.width), Math.max(1, rect.height));
      const ang = Math.atan2(py - cy, px - cx);
      const delta = angleDiffRad(ang, this.lastPointerAngle);
      this.lastPointerAngle = ang;

      const activeRing = this.rings[this.stage - 1];
      if (!activeRing) return;
      activeRing.angle += delta;

      const diff = angleDiffRad(activeRing.targetAngle, activeRing.angle);
      if (Math.abs(diff) < 0.14) {
        activeRing.angle += diff * 0.16;
      }
    };

    const onUp = () => {
      this.dragMode = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (this.completed) return;
      const activeRing = this.rings[this.stage - 1];
      if (!activeRing) return;
      if (e.key === 'ArrowLeft') activeRing.angle -= 0.08;
      if (e.key === 'ArrowRight') activeRing.angle += 0.08;
      if (this.stage >= 2) {
        if (e.key === 'ArrowUp') this.focalDepth = clamp(this.focalDepth + 0.04, 0, 1);
        if (e.key === 'ArrowDown') this.focalDepth = clamp(this.focalDepth - 0.04, 0, 1);
      }
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

    const match = this.computeMatch01();
    this.accSum += match;
    this.accCount += 1;

    const palette = getCosmicPalette(this.ctx.state.humanity);
    this.ctx.audio?.updateBeatSynth({
      beatHz: (1 - match) * 9,
      harmonicLock: match,
      warmth: palette.mode === 'warm' ? 0.9 : palette.mode === 'cold' ? 0.2 : 0.55,
      strain: 0,
    });

    this.ctx.showcase?.applyInstrumentPatch({
      progress: clamp((this.stage - 1 + match) / 3, 0, 1),
      unwarpProgress: match,
      seamReveal: this.stage === 3 ? match : (this.stage - 1) * 0.3,
      humanity: this.ctx.state.humanity,
    });

    if (this.isStageAligned()) {
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        platform.triggerHaptic('phaseSnapLock', 0.95);
        this.ctx.audio?.playPhaseLock?.(this.stage);
        if (this.stage < 3) {
          this.stageFlash = 1;
          this.stageFlashText = `LENS SHELL ${this.stage}/3 LOCKED`;
          this.setupStage((this.stage + 1) as 2 | 3);
        } else {
          this.finishSuccess();
        }
      }
    } else {
      this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.8);
    }

    this.emitHud();
  }

  private finishSuccess(): void {
    if (this.completed) return;
    this.completed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.ctx.audio?.stopInstrumentAudio();
    this.ctx.audio?.playCaptureShutter('clean');
    platform.triggerHaptic('shutterCommit', 1.0);

    const avgAcc = clamp(this.accCount > 0 ? this.accSum / this.accCount : 0.94, 0.74, 1.0);
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.ctx.onComplete(
      resolveInstrumentPayout(
        'clean',
        totalSec,
        avgAcc,
        `${this.ctx.targetId}_lens`,
        `All 3 concentric gravitational lens shells & focal depth aligned on ${this.ctx.targetName}.`,
        `Optical Clarity ${(avgAcc * 100).toFixed(0)}% · ${totalSec.toFixed(1)}s`,
        'Gravitational Lensing, Caustic Continuity & Focal Depth Calibration'
      )
    );
  }

  private emitHud(): void {
    const labelMap: Record<1 | 2 | 3, string> = {
      1: '1/3 · EASY',
      2: '2/3 · MEDIUM',
      3: '3/3 · HARD',
    };
    const promptMap: Record<1 | 2 | 3, string> = {
      1: 'Twist the outer optical shell until the starlight arcs bridge cleanly and blur clears.',
      2: 'Rotate the middle lens shell AND adjust FOCAL DEPTH below until the field snaps sharp.',
      3: 'Fine-tune the inner lens shell & FOCAL DEPTH to focus the 93-BLY horizon grid.',
    };
    const match = this.computeMatch01();
    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: labelMap[this.stage],
      stageProgress: clamp((this.stage - 1 + match) / 3, 0, 1),
      promptText: promptMap[this.stage],
      actionButton: null,
    });
  }

  private render(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const c2d = this.c2d;
    const palette = getCosmicPalette(this.ctx.state.humanity);
    const match = this.computeMatch01();

    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'smacs',
      blurPx: lerp(10, 1.2, match),
      alpha: 0.45,
      brightness: 0.78,
      scale: 1.04,
      tintAlpha: 0.52,
      gridAlpha: palette.mode === 'cold' ? 0.14 : 0.05,
    });
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, 0.72);

    const { cx, cy, maxR } = this.getGeometry(w, h);
    const plateImg = getCosmicPlateImage('smacs');
    const focalErr = Math.abs(this.focalDepth - this.targetFocalDepth);
    const zoomScale = 1 + (this.focalDepth - this.targetFocalDepth) * 0.28;

    // Render all 3 shells visibly from Stage 1
    for (const ring of this.rings) {
      const rIn = ring.rInnerFrac * maxR;
      const rOut = ring.rOuterFrac * maxR;
      const isSolved = ring.idx < this.stage - 1;
      const isActive = ring.idx === this.stage - 1;
      const err = isSolved ? 0 : angleDiffRad(ring.angle, ring.targetAngle);
      const blurAmt = isSolved
        ? 0
        : isActive
        ? Math.abs(err) * 6.5 + (this.stage >= 2 ? focalErr * 10 : 0)
        : 5.5;

      c2d.save();
      c2d.beginPath();
      c2d.arc(cx, cy, rOut, 0, Math.PI * 2);
      c2d.arc(cx, cy, rIn, 0, Math.PI * 2, true);
      c2d.clip?.();

      c2d.translate(cx, cy);
      c2d.rotate(err * 0.8);
      if (isActive && this.stage >= 2) c2d.scale(zoomScale, zoomScale);
      c2d.translate(-cx, -cy);

      if (plateImg && plateImg.naturalWidth > 0) {
        const s = Math.max((maxR * 2.2) / plateImg.naturalWidth, (maxR * 2.2) / plateImg.naturalHeight);
        const dw = plateImg.naturalWidth * s;
        const dh = plateImg.naturalHeight * s;
        if ('filter' in c2d) {
          c2d.filter = `blur(${blurAmt.toFixed(1)}px) brightness(${isSolved ? '1.14' : isActive ? '1.02' : '0.68'})`;
        }
        c2d.globalAlpha = isSolved || isActive ? 0.96 : 0.45;
        c2d.drawImage(plateImg, cx - dw * 0.5, cy - dh * 0.5, dw, dh);
      } else {
        c2d.fillStyle = isSolved ? 'rgba(60, 140, 118, 0.35)' : isActive ? 'rgba(65, 95, 140, 0.32)' : 'rgba(20, 32, 48, 0.35)';
        c2d.fillRect(cx - rOut, cy - rOut, rOut * 2, rOut * 2);
      }

      // Radial lensed starlight reference streamers anchored across ring edges (NO target white ticks!)
      c2d.globalAlpha = isSolved ? 0.85 : isActive ? 0.72 : 0.22;
      c2d.strokeStyle = isSolved ? palette.lockHex : palette.secondaryHex;
      c2d.lineWidth = isActive ? 2.1 : 1.4;
      for (let ray = 0; ray < 3; ray++) {
        const a = (ray * Math.PI * 2) / 3 + 0.35;
        c2d.beginPath();
        c2d.moveTo(cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn);
        c2d.lineTo(cx + Math.cos(a) * rOut, cy + Math.sin(a) * rOut);
        c2d.stroke();
      }
      c2d.restore();

      // Clean Zeiss bezel outlines
      const ringCol = isSolved
        ? palette.lockHex
        : isActive
        ? this.isStageAligned()
          ? palette.lockHex
          : palette.accentHex
        : 'rgba(186, 214, 240, 0.2)';
      c2d.save();
      c2d.strokeStyle = ringCol;
      c2d.lineWidth = isActive ? 2.4 : isSolved ? 1.8 : 1;
      c2d.beginPath();
      c2d.arc(cx, cy, rOut, 0, Math.PI * 2);
      c2d.stroke();
      c2d.restore();
    }

    // Outer fixed alignment index rays (subtle bezel markers around rim so user aligns the radial filaments)
    c2d.save();
    c2d.strokeStyle = 'rgba(255, 255, 255, 0.24)';
    c2d.lineWidth = 1.5;
    for (let ray = 0; ray < 3; ray++) {
      const a = (ray * Math.PI * 2) / 3 + 0.35;
      c2d.beginPath();
      c2d.moveTo(cx + Math.cos(a) * (maxR * 0.99), cy + Math.sin(a) * (maxR * 0.99));
      c2d.lineTo(cx + Math.cos(a) * (maxR * 1.04), cy + Math.sin(a) * (maxR * 1.04));
      c2d.stroke();
    }
    c2d.restore();

    // Inner aperture calibration grid
    const coreR = (this.rings[2]?.rInnerFrac ?? 0.2) * maxR - 3;
    c2d.save();
    c2d.beginPath();
    c2d.arc(cx, cy, coreR, 0, Math.PI * 2);
    c2d.clip?.();
    c2d.fillStyle = 'rgba(4, 10, 18, 0.72)';
    c2d.fillRect(cx - coreR, cy - coreR, coreR * 2, coreR * 2);
    c2d.strokeStyle = match > 0.85 ? palette.lockHex : palette.secondaryHex;
    c2d.globalAlpha = 0.22 + match * 0.65;
    c2d.lineWidth = 1;
    for (let g = -coreR; g <= coreR; g += Math.max(10, coreR * 0.36)) {
      c2d.beginPath();
      c2d.moveTo(cx + g, cy - coreR);
      c2d.lineTo(cx + g, cy + coreR);
      c2d.moveTo(cx - coreR, cy + g);
      c2d.lineTo(cx + coreR, cy + g);
      c2d.stroke();
    }
    c2d.restore();

    // Focal Depth Hairline Lever in Stage 2 & Stage 3
    if (this.stage >= 2) {
      const compact = h < 450;
      const barW = Math.min(280, w * 0.42);
      const barX = (w - barW) * 0.5;
      const barY = compact ? h - 74 : h - 98;
      this.focalBarRect = { x: barX, y: barY, w: barW, h: 18 };
      const focalCol = Math.abs(this.focalDepth - this.targetFocalDepth) <= 0.115 ? palette.lockHex : palette.accentHex;

      c2d.save();
      c2d.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = 'rgba(220, 236, 250, 0.8)';
      c2d.textAlign = 'left';
      c2d.fillText('FOCAL DEPTH', barX, barY - 6);
      c2d.textAlign = 'right';
      c2d.fillStyle = focalCol;
      c2d.fillText(`${Math.round(this.focalDepth * 100)}%`, barX + barW, barY - 6);

      const lineY = barY + 6;
      c2d.fillStyle = 'rgba(255, 255, 255, 0.16)';
      c2d.fillRect(barX, lineY - 1, barW, 2);
      c2d.fillStyle = focalCol;
      c2d.fillRect(barX, lineY - 1.5, this.focalDepth * barW, 3);

      c2d.beginPath();
      c2d.arc(barX + this.focalDepth * barW, lineY, 6.5, 0, Math.PI * 2);
      c2d.fillStyle = '#07101c';
      c2d.fill();
      c2d.lineWidth = 2;
      c2d.strokeStyle = focalCol;
      c2d.stroke();
      c2d.restore();
    }

    if (this.lockHoldSec > 0.02) {
      drawLockResonanceRing(
        c2d,
        cx,
        cy,
        maxR + 14,
        this.lockHoldSec / this.lockHoldTargetSec,
        palette.lockHex,
        `FOCUSING ${Math.round((this.lockHoldSec / this.lockHoldTargetSec) * 100)}%`
      );
    }

    drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, palette.lockHex);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Massive foreground galaxy clusters bend background starlight along concentric caustic shells—correcting both angular twist and focal zoom sharpens deep structure.',
      goalSummary:
        'All 3 lens shells remain visible from Stage 1: unlock Outer → Middle (+ Focal Depth) → Inner (+ Focal Depth) by aligning the starlight filaments across shells.',
      controlsDesktop: 'Drag radially around the center to rotate the active shell; drag FOCAL DEPTH or press Arrow keys.',
      controlsTouch: 'Twist around the center ring to rotate; slide FOCAL DEPTH below on Stages 2–3.',
      warmthEffect: 'Warm H% gives wider amber alignment tolerances; Cold H% demands finer rotational & focal precision.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        this.rings[stage - 1].angle = this.rings[stage - 1].targetAngle;
        this.focalDepth = this.targetFocalDepth;
        if (stage < 3) {
          this.setupStage((stage + 1) as 2 | 3);
        } else {
          this.finishSuccess();
        }
      },
      getDiagnostics: () => ({
        stage: this.stage,
        completed: this.completed,
        stageProgress: this.completed ? 1 : (this.stage - 1 + this.computeMatch01()) / 3,
      }),
    };
  }

  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.unbind?.();
    this.unbind = null;
    this.ctx.audio?.stopInstrumentAudio();
    this.ctx.container.innerHTML = '';
  }
}
