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
import { angleDiffRad, clamp, createSeededRng, lerp, resolveInstrumentPayout } from './tactilePhysics';
import type {
  IMinigame,
  InstrumentFieldGuide,
  MinigameContext,
  SolvabilityHarness,
} from './types';

interface RadioDish {
  id: number;
  rimAngle: number;
  aimAngle: number;
}

/**
 * TRI-10 — Radio Dish Array (Iteration 2)
 * Randomized varied dish positions per stage/seed, Stage 1 ghost decoy (cross-check with 2nd dish),
 * balanced slow orbital drift in Stage 2 (0.20 rad/s), and rhythmic beacon ping + slow drift in Stage 3.
 */
export class RadioTriangulationGame implements IMinigame {
  readonly id = 'radio_triangulation';
  readonly title = 'RADIO DISH ARRAY';
  readonly subtitle = 'Interferometric Triangulation';
  readonly instrumentCode = 'TRI-10';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private dishes: RadioDish[] = [];
  private sourceBase = { sx: 0.18, sy: -0.14 };
  private ghostDecoy: { sx: number; sy: number } | null = null;
  private activeDishId: number | null = null;
  private selectedDishId = 0;
  private lockHoldSec = 0;
  private readonly lockHoldTargetSec = 0.65;
  private stageFlash = 0;
  private stageFlashText = '';
  private lastTickAt = 0;
  private ambientStars = generateAmbientStars(createSeededRng('tri-stars'), 46);
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
      if (!this.completed) {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    if (typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame(tick);
    }
  }

  private setupStage(stage: 1 | 2 | 3): void {
    this.stage = stage;
    this.lockHoldSec = 0;
    this.selectedDishId = 0;
    const rng = createSeededRng(`${this.ctx.targetId}:tri:${this.ctx.state.shift}:${stage}`);

    this.sourceBase = {
      sx: (rng() - 0.5) * 0.68,
      sy: (rng() - 0.5) * 0.64,
    };

    // Stage 1: false ghost echo separated away from true source
    if (stage === 1) {
      this.ghostDecoy = {
        sx: clamp(-this.sourceBase.sx * 0.9 + (rng() - 0.5) * 0.25, -0.58, 0.58),
        sy: clamp(-this.sourceBase.sy * 0.9 + (rng() - 0.5) * 0.25, -0.56, 0.56),
      };
    } else {
      this.ghostDecoy = null;
    }

    // Varied perimeter dish placements rotated & asymmetrically offset per seed/stage
    const baseRot = rng() * Math.PI * 2;
    const rimSlots =
      stage === 1
        ? [baseRot, baseRot + 1.45 + rng() * 0.7]
        : [baseRot, baseRot + 2.0 + rng() * 0.45, baseRot + 4.15 + rng() * 0.5];

    this.dishes = rimSlots.map((rimAng, id) => {
      const dx = this.sourceBase.sx - Math.cos(rimAng);
      const dy = this.sourceBase.sy - Math.sin(rimAng);
      const trueAim = Math.atan2(dy, dx);
      return {
        id,
        rimAngle: rimAng,
        aimAngle: trueAim + (id % 2 === 0 ? 0.58 : -0.6),
      };
    });
  }

  private getGeometry(w: number, h: number) {
    const compact = h < 450;
    const radius = Math.min(w * 0.34, compact ? h * 0.35 : h * 0.34);
    return {
      cx: w * 0.5,
      cy: compact ? h * 0.47 : h * 0.49,
      radius,
    };
  }

  private getCurrentSourceUnit(): { sx: number; sy: number } {
    if (this.stage === 1) return this.sourceBase;
    const speed = this.stage === 2 ? 0.2 : 0.24; // Calm, readable orbital drift!
    return {
      sx: clamp(this.sourceBase.sx + Math.sin(this.elapsedSec * speed) * 0.15, -0.56, 0.56),
      sy: clamp(this.sourceBase.sy + Math.cos(this.elapsedSec * speed * 0.85) * 0.14, -0.54, 0.54),
    };
  }

  private computeDishCloseness(dish: RadioDish): number {
    const src = this.getCurrentSourceUnit();
    const dx = src.sx - Math.cos(dish.rimAngle);
    const dy = src.sy - Math.sin(dish.rimAngle);
    const trueAim = Math.atan2(dy, dx);
    const err = Math.abs(angleDiffRad(dish.aimAngle, trueAim));
    const tol = this.stage === 1 ? 0.17 : 0.14;
    return clamp(1 - err / (tol * 3.6), 0, 1);
  }

  private isDishLocked(dish: RadioDish): boolean {
    const src = this.getCurrentSourceUnit();
    const dx = src.sx - Math.cos(dish.rimAngle);
    const dy = src.sy - Math.sin(dish.rimAngle);
    const trueAim = Math.atan2(dy, dx);
    const baseTol = this.stage === 1 ? 0.16 : 0.135;
    const tol = this.ctx.state.humanity >= 45 ? baseTol : baseTol * 0.82;
    return Math.abs(angleDiffRad(dish.aimAngle, trueAim)) <= tol;
  }

  private bindEvents(): void {
    const onResize = () => {
      this.c2d = setupFullRetinaCanvas(this.canvas);
    };

    const aimDishToward = (dish: RadioDish, px: number, py: number, cx: number, cy: number, radius: number) => {
      const dxPx = Math.cos(dish.rimAngle) * radius + cx;
      const dyPx = Math.sin(dish.rimAngle) * radius + cy;
      if (Math.hypot(px - dxPx, py - dyPx) < 12) return;
      let nextAim = Math.atan2(py - dyPx, px - dxPx);

      const src = this.getCurrentSourceUnit();
      const trueAim = Math.atan2(src.sy - Math.sin(dish.rimAngle), src.sx - Math.cos(dish.rimAngle));
      const diff = angleDiffRad(trueAim, nextAim);
      if (Math.abs(diff) < 0.085) nextAim += diff * 0.38;
      dish.aimAngle = nextAim;
    };

    const onDown = (e: PointerEvent) => {
      if (this.completed) return;
      this.canvas.setPointerCapture(e.pointerId);
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const { cx, cy, radius } = this.getGeometry(Math.max(1, rect.width), Math.max(1, rect.height));

      let bestDish: RadioDish | null = null;
      let bestDist = Infinity;
      for (const dish of this.dishes) {
        const dx = cx + Math.cos(dish.rimAngle) * radius;
        const dy = cy + Math.sin(dish.rimAngle) * radius;
        const d = Math.hypot(px - dx, py - dy);
        if (d < bestDist) {
          bestDist = d;
          bestDish = dish;
        }
      }
      if (!bestDish) return;

      this.activeDishId = bestDish.id;
      this.selectedDishId = bestDish.id;
      aimDishToward(bestDish, px, py, cx, cy, radius);
      platform.triggerHaptic('vernierTick', 0.45);
    };

    const onMove = (e: PointerEvent) => {
      if (this.activeDishId === null || this.completed) return;
      const dish = this.dishes.find((d) => d.id === this.activeDishId);
      if (!dish) return;
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const { cx, cy, radius } = this.getGeometry(Math.max(1, rect.width), Math.max(1, rect.height));
      aimDishToward(dish, px, py, cx, cy, radius);
    };

    const onUp = () => {
      this.activeDishId = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (this.completed || this.dishes.length === 0) return;
      const dish = this.dishes[this.selectedDishId] ?? this.dishes[0];
      if (e.key === 'ArrowLeft') dish.aimAngle -= 0.06;
      if (e.key === 'ArrowRight') dish.aimAngle += 0.06;
      if (e.key === 'Tab') {
        e.preventDefault();
        this.selectedDishId = (this.selectedDishId + 1) % this.dishes.length;
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

    const avgClose =
      this.dishes.length > 0
        ? this.dishes.reduce((acc, d) => acc + this.computeDishCloseness(d), 0) / this.dishes.length
        : 0;
    const allLocked = this.dishes.length > 0 && this.dishes.every((d) => this.isDishLocked(d));

    if (avgClose > 0.72 && this.elapsedSec - this.lastTickAt > 0.22) {
      this.lastTickAt = this.elapsedSec;
      this.ctx.audio?.playProximityTick?.(avgClose);
    }

    if (allLocked) {
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        platform.triggerHaptic('phaseSnapLock', 0.95);
        this.ctx.audio?.playPhaseLock?.(this.stage);
        if (this.stage < 3) {
          this.stageFlash = 1;
          this.stageFlashText = `RADIO SOURCE ${this.stage}/3 TRIANGULATED`;
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
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.ctx.audio?.stopInstrumentAudio();
    this.ctx.audio?.playCaptureShutter('clean');
    platform.triggerHaptic('shutterCommit', 1.0);

    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.ctx.onComplete(
      resolveInstrumentPayout(
        'clean',
        totalSec,
        0.94,
        `${this.ctx.targetId}_triangulation`,
        `Sub-arcsecond radio baseline converged across 3 orbital configurations on ${this.ctx.targetName}.`,
        `VLBI Convergence 94% · ${totalSec.toFixed(1)}s`,
        'Very Long Baseline Interferometry (VLBI) & Ghost Echo Rejection'
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
      1: 'Aim both perimeter dishes to reject the faint ghost echo and lock the true radio beacon.',
      2: 'Follow the gently orbiting radio anomaly with all 3 asymmetrical dishes until triangulation locks.',
      3: 'The drifting beacon pings rhythmically every 1.8s — converge all 3 dishes ahead of its calm drift!',
    };
    const avgClose =
      this.dishes.length > 0
        ? this.dishes.reduce((acc, d) => acc + this.computeDishCloseness(d), 0) / this.dishes.length
        : 0;
    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: labelMap[this.stage],
      stageProgress: clamp((this.stage - 1 + avgClose) / 3, 0, 1),
      promptText: promptMap[this.stage],
      actionButton: null,
    });
  }

  private render(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const c2d = this.c2d;
    const palette = getCosmicPalette(this.ctx.state.humanity);

    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'smacs',
      blurPx: 5,
      alpha: 0.44,
      brightness: 0.74,
      scale: 1.03,
      tintAlpha: 0.5,
      gridAlpha: palette.mode === 'cold' ? 0.14 : 0.05,
    });
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, 0.72);

    const { cx, cy, radius } = this.getGeometry(w, h);
    const src = this.getCurrentSourceUnit();
    const srcPx = { x: cx + src.sx * radius, y: cy + src.sy * radius };

    c2d.save();
    c2d.strokeStyle = 'rgba(186, 214, 240, 0.22)';
    c2d.lineWidth = 1.4;
    c2d.beginPath();
    c2d.arc(cx, cy, radius, 0, Math.PI * 2);
    c2d.stroke();
    c2d.restore();

    const avgClose =
      this.dishes.length > 0
        ? this.dishes.reduce((acc, d) => acc + this.computeDishCloseness(d), 0) / this.dishes.length
        : 0;

    // Stage 1 Ghost Decoy (glows weakly if only 1 dish aims near it, suppressed once cross-checked)
    if (this.ghostDecoy) {
      const gx = cx + this.ghostDecoy.sx * radius;
      const gy = cy + this.ghostDecoy.sy * radius;
      const ghostFade = clamp(1 - avgClose, 0.1, 0.5);
      drawDiffractionStar(c2d, gx, gy, 5.5, '#ffb366', { spikes: 4, glowAlpha: ghostFade });
    }

    // Stage 3 pulsing beacon ping ring
    let pingBoost = 0;
    if (this.stage === 3) {
      const pingFrac = (this.elapsedSec / 1.8) % 1;
      pingBoost = Math.pow(1 - pingFrac, 2.2) * 0.65;
      c2d.save();
      c2d.strokeStyle = palette.secondaryHex;
      c2d.globalAlpha = (1 - pingFrac) * 0.48;
      c2d.lineWidth = 1.6;
      c2d.beginPath();
      c2d.arc(srcPx.x, srcPx.y, 10 + pingFrac * 34, 0, Math.PI * 2);
      c2d.stroke();
      c2d.restore();
    }

    const revealAlpha = clamp((avgClose - 0.5) / 0.42 + pingBoost * 0.55, 0.08, 1);
    drawDiffractionStar(c2d, srcPx.x, srcPx.y, 8 + revealAlpha * 6, palette.lockHex, {
      spikes: 6,
      glowAlpha: revealAlpha,
    });

    for (const dish of this.dishes) {
      const dx = cx + Math.cos(dish.rimAngle) * radius;
      const dy = cy + Math.sin(dish.rimAngle) * radius;
      const closeness = this.computeDishCloseness(dish);
      const locked = this.isDishLocked(dish);
      const col = locked ? palette.lockHex : closeness > 0.72 ? palette.secondaryHex : palette.accentHex;
      const rgb = locked ? palette.lockRgb : palette.accentRgb;
      const halfCone = lerp(0.32, 0.08, closeness);
      const beamLen = radius * 1.9;

      c2d.save();
      const grad = c2d.createRadialGradient(dx, dy, 4, dx, dy, beamLen);
      grad.addColorStop(0, `rgba(${rgb}, ${(0.22 + closeness * 0.28).toFixed(2)})`);
      grad.addColorStop(0.7, `rgba(${rgb}, 0.05)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      c2d.fillStyle = grad;
      c2d.beginPath();
      c2d.moveTo(dx, dy);
      c2d.arc(dx, dy, beamLen, dish.aimAngle - halfCone, dish.aimAngle + halfCone);
      c2d.closePath();
      c2d.fill();

      c2d.strokeStyle = col;
      c2d.globalAlpha = 0.35 + closeness * 0.55;
      c2d.lineWidth = locked ? 2.2 : 1.3;
      c2d.beginPath();
      c2d.moveTo(dx, dy);
      c2d.lineTo(dx + Math.cos(dish.aimAngle) * beamLen * 0.9, dy + Math.sin(dish.aimAngle) * beamLen * 0.9);
      c2d.stroke();

      const pulseR = ((this.elapsedSec * 0.9 + dish.id * 0.33) % 1) * beamLen * 0.75;
      c2d.beginPath();
      c2d.arc(dx, dy, 16 + pulseR, dish.aimAngle - halfCone, dish.aimAngle + halfCone);
      c2d.stroke();
      c2d.restore();

      c2d.save();
      c2d.translate(dx, dy);
      c2d.rotate(dish.aimAngle);
      c2d.strokeStyle = col;
      c2d.fillStyle = '#07101c';
      c2d.lineWidth = 2.4;
      c2d.beginPath();
      c2d.arc(0, 0, 14, -Math.PI * 0.45, Math.PI * 0.45);
      c2d.stroke();
      c2d.beginPath();
      c2d.arc(0, 0, 5.5, 0, Math.PI * 2);
      c2d.fill();
      c2d.stroke();
      c2d.restore();
    }

    if (this.lockHoldSec > 0.02) {
      drawLockResonanceRing(
        c2d,
        srcPx.x,
        srcPx.y,
        26,
        this.lockHoldSec / this.lockHoldTargetSec,
        palette.lockHex,
        `LOCKED ${Math.round((this.lockHoldSec / this.lockHoldTargetSec) * 100)}%`
      );
    }

    drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, palette.lockHex);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Radio interferometers link dishes at varied orbital angles to cancel ghost reflections and lock calmly drifting cosmic beacons.',
      goalSummary:
        'Aim perimeter dishes to eliminate ghost echoes and converge cleanly on stationary and gently drifting radio sources across 3 stages.',
      controlsDesktop: 'Drag from each perimeter dish toward your target; ArrowLeft/Right + Tab also steers.',
      controlsTouch: 'Touch near any rim dish and drag into the sky circle.',
      warmthEffect: 'Warm H% gives wider amber triangulation pockets; Cold H% narrows interferometric cones.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        const src = this.getCurrentSourceUnit();
        for (const d of this.dishes) {
          d.aimAngle = Math.atan2(src.sy - Math.sin(d.rimAngle), src.sx - Math.cos(d.rimAngle));
        }
        if (stage < 3) {
          this.setupStage((stage + 1) as 2 | 3);
        } else {
          this.finishSuccess();
        }
      },
      getDiagnostics: () => {
        const avgClose =
          this.dishes.length > 0
            ? this.dishes.reduce((acc, d) => acc + this.computeDishCloseness(d), 0) / this.dishes.length
            : 0;
        return {
          stage: this.stage,
          completed: this.completed,
          stageProgress: this.completed ? 1 : (this.stage - 1 + avgClose) / 3,
        };
      },
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
