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
import { clamp, createSeededRng, lerp, resolveInstrumentPayout } from './tactilePhysics';
import type {
  IMinigame,
  InstrumentFieldGuide,
  MinigameContext,
  SolvabilityHarness,
} from './types';

interface StaticStar {
  nx: number;
  ny: number;
  size: number;
  color: string;
}

interface TrajectoryEpoch {
  nx: number;
  ny: number;
}

/**
 * BLK-06 — Star Trajectory Predictor
 * Stage 1 (Easy): Read visual 3-step cadence (no ruler/numbers) -> click Epoch 4 landing.
 * Stage 2 (Medium): Two crossing stars converging at Epoch 4 -> click their exact conjunction point.
 * Stage 3 (Hard): Gravity-bent star + straight linear decoy star -> click where the gravity-bent star lands!
 */
export class StarfieldBlinkSpotterGame implements IMinigame {
  readonly id = 'blink_spotter';
  readonly title = 'STAR TRAJECTORY PREDICTOR';
  readonly subtitle = 'Proper-Motion & Conjunction Forecast';
  readonly instrumentCode = 'BLK-06';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private staticStars: StaticStar[] = [];
  private primaryEpochs: TrajectoryEpoch[] = []; // [E1, E2, E3, Target E4]
  private secondaryEpochs: TrajectoryEpoch[] = []; // Stage 2 crossing star OR Stage 3 linear decoy
  private lensWell: { nx: number; ny: number } | null = null;

  private activeEpochIdx = 0;
  private cycleTimer = 0;
  private showAllEpochs = false;

  private guessPos: { nx: number; ny: number; ok: boolean; timer: number } | null = null;
  private stageClearTimer = 0;
  private stageFlash = 0;
  private stageFlashText = '';
  private wrongTapCount = 0;
  private ambientStars = generateAmbientStars(createSeededRng('blk-stars'), 48);
  private unbind: (() => void) | null = null;

  mount(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.startedAt = performance.now();
    this.completed = false;
    this.elapsedSec = 0;
    this.wrongTapCount = 0;

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
    this.stageClearTimer = 0;
    this.guessPos = null;
    this.showAllEpochs = false;
    this.activeEpochIdx = 0;
    this.cycleTimer = 0;

    const rng = createSeededRng(`${this.ctx.targetId}:blk-pred:${this.ctx.state.shift}:${stage}`);
    const palettePool = ['#dceeff', '#ffe2bd', '#c7e8ff', '#fff4e3'];
    this.staticStars = [];
    for (let i = 0; i < 18; i++) {
      this.staticStars.push({
        nx: 0.12 + rng() * 0.76,
        ny: 0.2 + rng() * 0.58,
        size: 4.5 + rng() * 2.8,
        color: palettePool[i % palettePool.length],
      });
    }

    if (stage === 1) {
      // Pure visual cadence without ruler lines or step numbers
      this.lensWell = null;
      this.secondaryEpochs = [];
      const dir = rng() > 0.35 ? 1 : -1;
      const x0 = dir > 0 ? 0.24 + rng() * 0.08 : 0.76 - rng() * 0.08;
      const y0 = 0.32 + rng() * 0.28;
      const vx = dir * (0.11 + rng() * 0.03);
      const vy = (rng() - 0.5) * 0.06;
      this.primaryEpochs = [0, 1, 2, 3].map((k) => ({
        nx: clamp(x0 + vx * k, 0.14, 0.86),
        ny: clamp(y0 + vy * k, 0.22, 0.75),
      }));
    } else if (stage === 2) {
      // Crossing Paths Conjunction: both stars arrive at exact intersection (cx, cy) at Epoch 4!
      this.lensWell = null;
      const cx = 0.44 + rng() * 0.18;
      const cy = 0.42 + rng() * 0.16;
      const v1x = 0.095 + rng() * 0.025;
      const v1y = 0.055 + rng() * 0.02;
      const v2x = -(0.09 + rng() * 0.025);
      const v2y = 0.05 + rng() * 0.025;

      this.primaryEpochs = [0, 1, 2, 3].map((k) => ({
        nx: clamp(cx - (3 - k) * v1x, 0.14, 0.86),
        ny: clamp(cy - (3 - k) * v1y, 0.22, 0.75),
      }));
      this.secondaryEpochs = [0, 1, 2, 3].map((k) => ({
        nx: clamp(cx - (3 - k) * v2x, 0.14, 0.86),
        ny: clamp(cy - (3 - k) * v2y, 0.22, 0.75),
      }));
    } else {
      // Gravity-bent star + linear straight decoy star
      const x0 = 0.22 + rng() * 0.08;
      const y0 = 0.34 + rng() * 0.22;
      const curveSign = y0 < 0.46 ? 1 : -1;
      const lensX = clamp(x0 + 0.24, 0.38, 0.62);
      const lensY = clamp(y0 + curveSign * 0.15, 0.26, 0.7);
      this.lensWell = { nx: lensX, ny: lensY };

      const pts: TrajectoryEpoch[] = [{ nx: x0, ny: y0 }];
      let vx = 0.115;
      let vy = -curveSign * 0.032;
      for (let k = 1; k <= 3; k++) {
        const prev = pts[k - 1];
        const dxL = lensX - prev.nx;
        const dyL = lensY - prev.ny;
        const distSq = dxL * dxL + dyL * dyL + 0.024;
        vx += (dxL / distSq) * 0.0029;
        vy += (dyL / distSq) * 0.0029;
        pts.push({
          nx: clamp(prev.nx + vx, 0.14, 0.86),
          ny: clamp(prev.ny + vy, 0.22, 0.75),
        });
      }
      this.primaryEpochs = pts;

      // Decoy star drifting linearly in another direction
      const dx0 = 0.76 - rng() * 0.08;
      const dy0 = curveSign > 0 ? 0.64 : 0.3;
      this.secondaryEpochs = [0, 1, 2, 3].map((k) => ({
        nx: clamp(dx0 - k * 0.105, 0.14, 0.86),
        ny: clamp(dy0 + k * (-curveSign * 0.025), 0.22, 0.75),
      }));
    }
  }

  onHelperAction(actionId: string): void {
    if (actionId === 'toggle_pause' && !this.completed && this.stageClearTimer <= 0) {
      this.showAllEpochs = !this.showAllEpochs;
      this.ctx.audio?.playTumblerClick(0.65, true);
      this.emitHud();
    }
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

      const trueE4 = this.primaryEpochs[3];
      if (!trueE4) return;
      const distPx = Math.hypot(px - trueE4.nx * w, py - trueE4.ny * h);
      const tolPx = this.ctx.state.humanity >= 45 ? 54 : 44;

      if (distPx <= tolPx) {
        this.guessPos = { nx: px / w, ny: py / h, ok: true, timer: 0.78 };
        this.stageClearTimer = 0.78;
        this.stageFlash = 1;
        this.stageFlashText =
          this.stage === 2
            ? 'CONJUNCTION POINT LOCKED (2/3)'
            : `EPOCH 4 TRAJECTORY VERIFIED (${this.stage}/3)`;
        platform.triggerHaptic('phaseSnapLock', 0.95);
        this.ctx.audio?.playPhaseLock?.(this.stage);
        this.emitHud();
      } else {
        this.wrongTapCount += 1;
        this.guessPos = { nx: px / w, ny: py / h, ok: false, timer: 0.85 };
        platform.triggerHaptic('rejectThud', 0.6);
        this.ctx.audio?.playSolenoidClack(false);
        this.emitHud(
          this.stage === 2
            ? 'Trace where BOTH stars cross on step 4 and click that conjunction point.'
            : 'Follow the primary star pulse across Epochs 1 → 2 → 3 and click its Epoch 4 landing.'
        );
      }
    };

    window.addEventListener('resize', onResize);
    this.canvas.addEventListener('pointerdown', onDown);
    this.unbind = () => {
      window.removeEventListener('resize', onResize);
      this.canvas.removeEventListener('pointerdown', onDown);
    };
  }

  private update(dt: number): void {
    if (this.completed) return;
    this.elapsedSec += dt;
    this.stageFlash = Math.max(0, this.stageFlash - dt * 1.4);

    if (this.guessPos && !this.guessPos.ok) {
      this.guessPos.timer -= dt;
      if (this.guessPos.timer <= 0) this.guessPos = null;
    }

    if (!this.showAllEpochs && this.stageClearTimer <= 0) {
      this.cycleTimer += dt;
      if (this.cycleTimer >= 0.76) {
        this.cycleTimer = 0;
        this.activeEpochIdx = (this.activeEpochIdx + 1) % 3;
        this.ctx.audio?.playProximityTick?.(0.35 + this.activeEpochIdx * 0.22);
      }
    }

    const total = clamp((this.stage - 1 + (this.stageClearTimer > 0 ? 1 : 0)) / 3, 0, 1);
    this.ctx.showcase?.applyInstrumentPatch({
      progress: total,
      blinkFlip: this.activeEpochIdx === 2,
      humanity: this.ctx.state.humanity,
    });

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
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.ctx.audio?.stopInstrumentAudio();
    this.ctx.audio?.playCaptureShutter('clean');
    platform.triggerHaptic('shutterCommit', 1.0);

    const acc = clamp(1 - this.wrongTapCount * 0.05, 0.72, 1.0);
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.ctx.onComplete(
      resolveInstrumentPayout(
        'clean',
        totalSec,
        acc,
        `${this.ctx.targetId}_trajectory`,
        `Proper-motion conjunction & gravitational bending forecast cleanly on ${this.ctx.targetName}.`,
        `Forecast Accuracy ${(acc * 100).toFixed(0)}% · ${totalSec.toFixed(1)}s`,
        'Proper-Motion Extrapolation, Stellar Conjunction & Gravity Deflection'
      )
    );
  }

  private emitHud(overridePrompt?: string): void {
    const labelMap: Record<1 | 2 | 3, string> = {
      1: '1/3 · EASY',
      2: '2/3 · MEDIUM',
      3: '3/3 · HARD',
    };
    const defaultPrompt =
      this.stage === 1
        ? 'Read the pulsing star’s 3-step cadence cleanly and click where it lands next.'
        : this.stage === 2
        ? 'Two stars approach from opposite directions — click the exact point where they meet at step 4!'
        : 'Ignore the straight decoy — predict where the gravity-curved golden star lands next.';

    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: labelMap[this.stage],
      stageProgress: clamp((this.stage - 1 + (this.stageClearTimer > 0 ? 1 : 0)) / 3, 0, 1),
      promptText: overridePrompt ?? defaultPrompt,
      actionButton: {
        id: 'toggle_pause',
        label: this.showAllEpochs ? 'RESUME CYCLE' : 'SHOW ALL 3 EPOCHS',
        active: this.showAllEpochs,
      },
    });
  }

  private render(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const c2d = this.c2d;
    const palette = getCosmicPalette(this.ctx.state.humanity);

    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'hudf',
      blurPx: 2,
      alpha: lerp(0.56, 0.84, (this.stage - 1) / 2),
      brightness: 0.94,
      scale: 1.03,
      tintAlpha: 0.36,
      gridAlpha: palette.mode === 'cold' ? 0.14 : 0.05,
    });
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, 0.68);

    for (const s of this.staticStars) {
      drawDiffractionStar(c2d, s.nx * w, s.ny * h, s.size, s.color, { spikes: 6, glowAlpha: 0.55 });
    }

    c2d.save();
    c2d.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = palette.secondaryHex;
    c2d.textAlign = 'left';
    c2d.fillText(
      this.stageClearTimer > 0
        ? '● EPOCH 4 (CONFIRMED)'
        : this.showAllEpochs
        ? '◎ EPOCHS 1–3 OVERLAY'
        : `● EPOCH ${this.activeEpochIdx + 1} OF 3`,
      w * 0.11,
      h < 450 ? 64 : 84
    );
    c2d.restore();

    if (this.lensWell) {
      const lx = this.lensWell.nx * w;
      const ly = this.lensWell.ny * h;
      c2d.save();
      const g = c2d.createRadialGradient(lx, ly, 4, lx, ly, 58);
      g.addColorStop(0, 'rgba(255, 224, 160, 0.85)');
      g.addColorStop(0.45, 'rgba(255, 184, 108, 0.18)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c2d.fillStyle = g;
      c2d.beginPath();
      c2d.arc(lx, ly, 58, 0, Math.PI * 2);
      c2d.fill();
      c2d.strokeStyle = 'rgba(255, 210, 150, 0.32)';
      c2d.setLineDash([4, 4]);
      c2d.beginPath();
      c2d.arc(lx, ly, 36, 0, Math.PI * 2);
      c2d.stroke();
      c2d.restore();
    }

    const drawEpochTrack = (epochs: TrajectoryEpoch[], starColor: string) => {
      for (let i = 0; i < 3; i++) {
        const ep = epochs[i];
        if (!ep) continue;
        const x = ep.nx * w;
        const y = ep.ny * h;
        const isActive = this.showAllEpochs || i === this.activeEpochIdx;

        if (isActive) {
          drawDiffractionStar(c2d, x, y, 10, starColor, { spikes: 6, glowAlpha: 0.96 });
        }
        c2d.save();
        c2d.strokeStyle = isActive ? starColor : `rgba(255, 225, 180, ${0.22 + i * 0.12})`;
        c2d.lineWidth = isActive ? 2 : 1.2;
        c2d.beginPath();
        c2d.arc(x, y, isActive ? 14 : 6 + i * 1.5, 0, Math.PI * 2);
        c2d.stroke();
        c2d.restore();
      }
    };

    drawEpochTrack(this.primaryEpochs, palette.accentHex);
    if (this.secondaryEpochs.length > 0) {
      drawEpochTrack(this.secondaryEpochs, this.stage === 2 ? palette.secondaryHex : '#9ec4e8');
    }

    if (this.guessPos) {
      const gx = this.guessPos.nx * w;
      const gy = this.guessPos.ny * h;
      c2d.save();
      c2d.strokeStyle = this.guessPos.ok ? palette.lockHex : '#ff8b5e';
      c2d.lineWidth = 2.4;
      c2d.beginPath();
      c2d.arc(gx, gy, this.guessPos.ok ? 20 : 16, 0, Math.PI * 2);
      c2d.stroke();
      c2d.restore();

      if (this.guessPos.ok && this.primaryEpochs[3]) {
        drawDiffractionStar(c2d, this.primaryEpochs[3].nx * w, this.primaryEpochs[3].ny * h, 13, palette.lockHex, {
          spikes: 6,
          glowAlpha: 1,
        });
      }
    }

    drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, palette.lockHex);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Tracking astrometric positions across sequential exposures reveals proper motion, stellar conjunctions, and gravitational deflection around massive foreground stars.',
      goalSummary:
        'Read 3 historical exposures across Stage 1 (cadence), Stage 2 (two crossing stars meeting at step 4), and Stage 3 (gravity-bent trajectory + linear decoy).',
      controlsDesktop: 'Click your predicted Epoch 4 landing (or conjunction point); use SHOW ALL 3 EPOCHS to compare all echoes.',
      controlsTouch: 'Tap your predicted Epoch 4 destination.',
      warmthEffect: 'Warm H% gives generous capture circles; Cold H% sharpens pinpoint astrometry.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        if (this.primaryEpochs[3]) {
          this.guessPos = { nx: this.primaryEpochs[3].nx, ny: this.primaryEpochs[3].ny, ok: true, timer: 0.78 };
        }
        if (stage < 3) {
          this.setupStage((stage + 1) as 2 | 3);
        } else {
          this.finishSuccess();
        }
      },
      getDiagnostics: () => ({
        stage: this.stage,
        completed: this.completed,
        stageProgress: this.completed ? 1 : (this.stage - 1 + (this.stageClearTimer > 0 ? 1 : 0)) / 3,
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
