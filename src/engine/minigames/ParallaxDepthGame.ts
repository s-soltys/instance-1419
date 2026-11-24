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
import { drawVernierStrip, hitVernierStrip, layoutVernierRow, stageLabel, valueFromStripX, VernierStripSpec } from './cosmicGameBase';
import { clamp, createSeededRng, resolveInstrumentPayout } from './tactilePhysics';
import type { IMinigame, InstrumentFieldGuide, MinigameContext, SolvabilityHarness } from './types';

interface ParallaxStar {
  id: number;
  baseNx: number;
  ny: number;
  layer: 'near' | 'mid' | 'deep' | 'rogue';
  isTarget: boolean;
  found: boolean;
  prevX: number;
}

/**
 * PRX-21 — Orbital Parallax Depth Sorter
 * Toggle AUTO-ROCK ORBIT or manually rock ORBITAL BASELINE so NEAR, MID, and DEEP background spiral
 * galaxies trace live stereoscopic 3D velocity streaks; pause rocking in Stage 3 to catch the drifting Rogue!
 */
export class ParallaxDepthGame implements IMinigame {
  readonly id = 'parallax_depth';
  readonly title = 'ORBITAL PARALLAX DEPTH';
  readonly subtitle = 'Baseline Depth-Layer Sorting';
  readonly instrumentCode = 'PRX-21';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private baseline01 = 0.5;
  private autoRock = true;
  private autoPhase = 0;
  private baselineStrip: VernierStripSpec | null = null;
  private dragMode: 'strip' | 'sky' | null = null;
  private dragStartBaseline = 0.5;
  private dragStartX = 0;

  private stars: ParallaxStar[] = [];
  private stageClearTimer = 0;
  private stageFlash = 0;
  private stageFlashText = '';
  private wrongTapCount = 0;
  private ambientStars = generateAmbientStars(createSeededRng('prx-stars'), 40);
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
    this.baseline01 = 0.5;
    this.autoRock = true;
    this.stageClearTimer = 0;
    const rng = createSeededRng(`${this.ctx.targetId}:prx:${this.ctx.state.shift}:${stage}`);

    this.stars = [];
    const addStar = (layer: ParallaxStar['layer'], isTarget: boolean) => {
      const bNx = 0.22 + rng() * 0.56;
      this.stars.push({
        id: this.stars.length,
        baseNx: bNx,
        ny: 0.2 + rng() * 0.48,
        layer,
        isTarget,
        found: false,
        prevX: bNx * 1280,
      });
    };

    if (stage === 1) {
      for (let i = 0; i < 3; i++) addStar('near', true);
      for (let i = 0; i < 7; i++) addStar('deep', false);
    } else if (stage === 2) {
      for (let i = 0; i < 3; i++) addStar('mid', true);
      for (let i = 0; i < 4; i++) addStar('near', false);
      for (let i = 0; i < 6; i++) addStar('deep', false);
    } else {
      addStar('rogue', true);
      for (let i = 0; i < 2; i++) addStar('mid', true);
      for (let i = 0; i < 4; i++) addStar('near', false);
      for (let i = 0; i < 6; i++) addStar('deep', false);
    }
  }

  onHelperAction(actionId: string): void {
    if (actionId === 'toggle_autorock' && !this.completed && this.stageClearTimer <= 0) {
      this.autoRock = !this.autoRock;
      this.ctx.audio?.playSolenoidClack(false);
      platform.triggerHaptic('vernierTick', 0.45);
      this.emitHud();
    }
  }

  private getStarScreenPos(s: ParallaxStar, w: number, h: number): { x: number; y: number } {
    const b = (this.baseline01 - 0.5) * 2;
    const maxShift = w * 0.14;
    let shiftX = 0;
    if (s.layer === 'near') shiftX = b * maxShift;
    else if (s.layer === 'mid') shiftX = b * maxShift * 0.45;
    else if (s.layer === 'deep') shiftX = b * maxShift * 0.05;
    else if (s.layer === 'rogue') {
      const rogueOsc = Math.sin(this.elapsedSec * 0.9) * w * 0.065;
      shiftX = b * maxShift * 0.35 + rogueOsc;
    }
    return { x: s.baseNx * w + shiftX, y: s.ny * h };
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

      if (this.baselineStrip && hitVernierStrip(this.baselineStrip, px, py)) {
        this.canvas.setPointerCapture(e.pointerId);
        this.autoRock = false;
        this.dragMode = 'strip';
        this.baseline01 = valueFromStripX(this.baselineStrip, px, 0.5, 0);
        platform.triggerHaptic('vernierTick', 0.4);
        return;
      }

      for (const s of this.stars) {
        if (s.found) continue;
        const pos = this.getStarScreenPos(s, w, h);
        if (Math.hypot(px - pos.x, py - pos.y) <= 28) {
          if (s.isTarget) {
            s.found = true;
            platform.triggerHaptic('phaseSnapLock', 0.9);
            this.ctx.audio?.playTumblerClick(0.92, true);
            const targs = this.stars.filter((item) => item.isTarget);
            if (targs.every((item) => item.found)) {
              this.stageClearTimer = 0.62;
              this.stageFlash = 1;
              this.stageFlashText = `PARALLAX DEPTH ${this.stage}/3 SORTED`;
              this.ctx.audio?.playPhaseLock?.(this.stage);
            }
          } else {
            this.wrongTapCount++;
            platform.triggerHaptic('rejectThud', 0.65);
            this.ctx.audio?.playSolenoidClack(false);
          }
          this.emitHud();
          return;
        }
      }

      this.canvas.setPointerCapture(e.pointerId);
      this.autoRock = false;
      this.dragMode = 'sky';
      this.dragStartBaseline = this.baseline01;
      this.dragStartX = px;
    };

    const onMove = (e: PointerEvent) => {
      if (!this.dragMode || this.completed) return;
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      if (this.dragMode === 'strip' && this.baselineStrip) {
        this.baseline01 = valueFromStripX(this.baselineStrip, px, 0.5, 0);
      } else if (this.dragMode === 'sky') {
        this.baseline01 = clamp(this.dragStartBaseline + (px - this.dragStartX) / Math.max(120, rect.width * 0.5), 0, 1);
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

    if (this.autoRock && !this.dragMode) {
      this.autoPhase += dt * 1.3;
      this.baseline01 = 0.5 + Math.sin(this.autoPhase) * 0.45;
    }

    if (this.stageClearTimer > 0) {
      this.stageClearTimer -= dt;
      if (this.stageClearTimer <= 0) {
        if (this.stage < 3) {
          this.setupStage((this.stage + 1) as 2 | 3);
        } else {
          this.finishSuccess();
        }
      }
      this.emitHud();
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
        clamp(1 - this.wrongTapCount * 0.05, 0.72, 1),
        `${this.ctx.targetId}_parallax`,
        `3D stellar parallax layers & rogue proper motion isolated on ${this.ctx.targetName}.`,
        `Parallax Sorted · ${totalSec.toFixed(1)}s`,
        'Orbital Baseline Parallax & 3D Depth Discrimination'
      )
    );
  }

  private emitHud(): void {
    const targs = this.stars.filter((item) => item.isTarget);
    const done = targs.filter((item) => item.found).length;
    const prompt =
      this.stage === 1
        ? `Watch the 3D parallax sway (or pause & drag ORBITAL BASELINE) to click the 3 fastest-swinging NEAR stars (${done}/3).`
        : this.stage === 2
        ? `Spot & click the 3 moderate-speed MID-LAYER cluster stars gliding between near & background galaxies (${done}/3).`
        : `Click PAUSE ORBIT ROCK to freeze parallax — spot the 1 ROGUE star still gliding on its own + 2 MID stars (${done}/3).`;

    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: stageLabel(this.stage),
      stageProgress: clamp((this.stage - 1 + done / Math.max(1, targs.length)) / 3, 0, 1),
      promptText: prompt,
      actionButton: { id: 'toggle_autorock', label: this.autoRock ? 'PAUSE ORBIT ROCK' : 'AUTO-ROCK ORBIT', active: this.autoRock },
    });
  }

  private render(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const c2d = this.c2d;
    const palette = getCosmicPalette(this.ctx.state.humanity);
    const compact = h < 450;

    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'smacs',
      blurPx: 4,
      alpha: 0.45,
      brightness: 0.78,
      tintAlpha: 0.46,
      gridAlpha: palette.mode === 'cold' ? 0.14 : 0.05,
    });
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, 0.72);

    for (const s of this.stars) {
      const pos = this.getStarScreenPos(s, w, h);
      const dx = pos.x - s.prevX;
      s.prevX = pos.x;

      // Stereoscopic velocity streak tail proportional to depth swing!
      if (Math.abs(dx) > 0.25) {
        c2d.save();
        c2d.strokeStyle = s.found ? palette.lockHex : s.layer === 'near' ? '#ffd784' : palette.secondaryHex;
        c2d.globalAlpha = 0.45;
        c2d.lineWidth = s.layer === 'near' ? 2.4 : 1.5;
        c2d.beginPath();
        c2d.moveTo(pos.x, pos.y);
        c2d.lineTo(pos.x - clamp(dx * 5.5, -28, 28), pos.y);
        c2d.stroke();
        c2d.restore();
      }

      // Faint elliptical halo on distant DEEP background galaxies
      if (s.layer === 'deep' && !s.found) {
        c2d.save();
        c2d.strokeStyle = 'rgba(170, 200, 235, 0.35)';
        c2d.beginPath();
        c2d.ellipse(pos.x, pos.y, 10, 4.5, 0.4, 0, Math.PI * 2);
        c2d.stroke();
        c2d.restore();
      }

      // When paused on Stage 3, Rogue Star shows a subtle dotted proper-motion trail!
      if (s.layer === 'rogue' && !this.autoRock && !s.found) {
        c2d.save();
        c2d.strokeStyle = 'rgba(255, 205, 115, 0.4)';
        c2d.setLineDash([3, 4]);
        c2d.beginPath();
        c2d.moveTo(pos.x - 24, pos.y);
        c2d.lineTo(pos.x + 24, pos.y);
        c2d.stroke();
        c2d.restore();
      }

      const col = s.found ? palette.lockHex : palette.accentHex;
      const r = s.found ? 9.5 : s.layer === 'near' ? 8.5 : s.layer === 'deep' ? 5.5 : 7.5;
      drawDiffractionStar(c2d, pos.x, pos.y, r, col, { spikes: 4, glowAlpha: s.found ? 0.96 : 0.85 });
      if (s.found) {
        c2d.save();
        c2d.strokeStyle = palette.lockHex;
        c2d.lineWidth = 1.8;
        c2d.beginPath();
        c2d.arc(pos.x, pos.y, 17, 0, Math.PI * 2);
        c2d.stroke();
        c2d.restore();
      }
    }

    const bVal = (this.baseline01 - 0.5) * 2;
    const strip = layoutVernierRow(
      w,
      h,
      [
        {
          key: 'baseline',
          label: 'ORBITAL BASELINE (ROCK L/R)',
          val01: this.baseline01,
          rightText: `${bVal >= 0 ? '+' : ''}${bVal.toFixed(2)} AU`,
        },
      ],
      compact ? h - 108 : h - 134
    )[0];
    this.baselineStrip = strip;
    drawVernierStrip(c2d, strip, palette.accentHex, palette.lockHex);

    drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, palette.lockHex);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'As an observatory orbits its star, foreground stars trace long 3D parallax motion trails while deep galaxies stay nearly anchored; pausing reveals rogue proper-motion stars.',
      goalSummary: 'Observe or rock the Orbital Baseline to sort 3D depth layers and isolate the target stars.',
      controlsDesktop: 'Watch AUTO-ROCK ORBIT or click PAUSE to manually scrub ORBITAL BASELINE; click matching-depth stars.',
      controlsTouch: 'Tap PAUSE ORBIT ROCK to manually slide ORBITAL BASELINE and tap target depth stars.',
      warmthEffect: 'Warm H% gives soft golden parallax trails; Cold H% switches to sharp astrometric depth vectors.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        for (const s of this.stars) if (s.isTarget) s.found = true;
        if (stage < 3) this.setupStage((stage + 1) as 2 | 3);
        else this.finishSuccess();
      },
      getDiagnostics: () => ({
        stage: this.stage,
        completed: this.completed,
        stageProgress: this.completed
          ? 1
          : (this.stage - 1 + this.stars.filter((s) => s.isTarget && s.found).length / Math.max(1, this.stars.filter((s) => s.isTarget).length)) /
            3,
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
