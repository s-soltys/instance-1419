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
import { clamp, createSeededRng, lerp, resolveInstrumentPayout } from './tactilePhysics';
import type { IMinigame, InstrumentFieldGuide, MinigameContext, SolvabilityHarness } from './types';

/**
 * INT-18 — Michelson Fringe Interferometer
 * Beam-splitter optical bench with live laser paths & 16 finely spaced breathing Airy interference rings
 * that wash gray at phase mismatch and snap into dazzling high-contrast golden fringes + twin stars when aligned!
 */
export class MichelsonFringeGame implements IMinigame {
  readonly id = 'michelson_fringe';
  readonly title = 'MICHELSON FRINGE TUNER';
  readonly subtitle = 'Optical Delay Phase Interference';
  readonly instrumentCode = 'INT-18';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private targetA = 0.6;
  private targetB = 0.4;
  private delayA = 0.2;
  private delayB = 0.8;

  private strips: VernierStripSpec[] = [];
  private dragMode: 'a' | 'b' | 'railA' | 'railB' | null = null;
  private lockHoldSec = 0;
  private readonly lockHoldTargetSec = 0.55;
  private stageFlash = 0;
  private stageFlashText = '';
  private ambientStars = generateAmbientStars(createSeededRng('int-stars'), 44);
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
    const rng = createSeededRng(`${this.ctx.targetId}:int:${this.ctx.state.shift}:${stage}`);
    this.targetA = 0.24 + rng() * 0.56;
    this.targetB = 0.24 + rng() * 0.56;
    this.delayA = this.targetA > 0.5 ? 0.14 : 0.86;
    this.delayB = stage < 3 ? this.targetB : this.targetB > 0.5 ? 0.14 : 0.86;
  }

  private getEffectiveTargetA(): number {
    if (this.stage === 2) {
      return clamp(this.targetA + Math.sin(this.elapsedSec * 0.6) * 0.055, 0.12, 0.88);
    }
    return this.targetA;
  }

  private computeContrast01(): number {
    const errA = Math.abs(this.delayA - this.getEffectiveTargetA());
    const errB = this.stage === 3 ? Math.abs(this.delayB - this.targetB) : 0;
    const avg = this.stage === 3 ? (errA + errB) * 0.5 : errA;
    const span = this.ctx.state.humanity >= 45 ? 0.34 : 0.27;
    return clamp(1 - avg / span, 0, 1);
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

      for (const s of this.strips) {
        if (hitVernierStrip(s, px, py)) {
          this.canvas.setPointerCapture(e.pointerId);
          this.dragMode = s.key as 'a' | 'b';
          const targ = s.key === 'a' ? this.getEffectiveTargetA() : this.targetB;
          const v = valueFromStripX(s, px, targ);
          if (s.key === 'a') this.delayA = v;
          if (s.key === 'b') this.delayB = v;
          platform.triggerHaptic('vernierTick', 0.45);
          return;
        }
      }

      this.canvas.setPointerCapture(e.pointerId);
      const railTop = h * 0.24;
      const railBot = h * 0.68;
      if (this.stage === 3 && px > w * 0.54) {
        this.dragMode = 'railB';
        this.delayB = clamp((py - railTop) / Math.max(1, railBot - railTop), 0, 1);
      } else {
        this.dragMode = 'railA';
        this.delayA = clamp((py - railTop) / Math.max(1, railBot - railTop), 0, 1);
      }
      platform.triggerHaptic('vernierTick', 0.45);
    };

    const onMove = (e: PointerEvent) => {
      if (!this.dragMode || this.completed) return;
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const h = Math.max(1, rect.height);
      const railTop = h * 0.24;
      const railBot = h * 0.68;

      if (this.dragMode === 'railA') {
        const raw = clamp((py - railTop) / Math.max(1, railBot - railTop), 0, 1);
        const tA = this.getEffectiveTargetA();
        this.delayA = Math.abs(raw - tA) < 0.055 ? lerp(raw, tA, 0.45) : raw;
      } else if (this.dragMode === 'railB') {
        const raw = clamp((py - railTop) / Math.max(1, railBot - railTop), 0, 1);
        this.delayB = Math.abs(raw - this.targetB) < 0.055 ? lerp(raw, this.targetB, 0.45) : raw;
      } else {
        const s = this.strips.find((item) => item.key === this.dragMode);
        if (!s) return;
        const targ = s.key === 'a' ? this.getEffectiveTargetA() : this.targetB;
        const v = valueFromStripX(s, px, targ);
        if (s.key === 'a') this.delayA = v;
        if (s.key === 'b') this.delayB = v;
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

    const contrast = this.computeContrast01();
    const thresh = this.stage === 1 ? 0.85 : 0.88;
    if (contrast >= thresh) {
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        platform.triggerHaptic('phaseSnapLock', 0.95);
        this.ctx.audio?.playPhaseLock?.(this.stage);
        if (this.stage < 3) {
          this.stageFlash = 1;
          this.stageFlashText = `FRINGE LOCK ${this.stage}/3 COHERENT`;
          this.setupStage((this.stage + 1) as 2 | 3);
        } else {
          this.finishSuccess();
        }
      }
    } else {
      this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.6);
    }
    this.emitHud(contrast);
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
        `${this.ctx.targetId}_michelson`,
        `Constructive starlight interference rings locked, splitting the hidden twin star on ${this.ctx.targetName}.`,
        `Fringe Visibility 96% · ${totalSec.toFixed(1)}s`,
        'Michelson Optical Delay Interferometry & Coherent Fringes'
      )
    );
  }

  private emitHud(contrast = this.computeContrast01()): void {
    const prompt =
      this.stage === 1
        ? 'Slide MIRROR DELAY A along the beam-splitter rail until hazy interference snaps into sharp golden Airy rings.'
        : this.stage === 2
        ? 'Track subtle thermal mirror drift on DELAY A to hold sharp interference fringes locked.'
        : 'Align both DELAY A & DELAY B mirror carriages until crossing 2D golden diamond fringes resolve the binary star.';

    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: stageLabel(this.stage),
      stageProgress: clamp((this.stage - 1 + contrast) / 3, 0, 1),
      promptText: prompt,
      actionButton: null,
    });
  }

  private render(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const c2d = this.c2d;
    const palette = getCosmicPalette(this.ctx.state.humanity);
    const contrast = this.computeContrast01();
    const compact = h < 450;

    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'smacs',
      blurPx: lerp(10, 1, contrast),
      alpha: 0.42,
      brightness: lerp(0.7, 1.08, contrast),
      tintAlpha: 0.48,
      gridAlpha: palette.mode === 'cold' ? 0.14 : 0.05,
    });
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, 0.76);

    const cx = w * 0.5;
    const cy = compact ? h * 0.42 : h * 0.45;
    const plateR = Math.min(w, h) * (compact ? 0.25 : 0.27);

    // Circular interferometer plate + 16 finely spaced breathing cosine Airy interference bands!
    c2d.save();
    c2d.beginPath();
    c2d.arc(cx, cy, plateR, 0, Math.PI * 2);
    c2d.fillStyle = 'rgba(4, 8, 16, 0.88)';
    c2d.fill();
    c2d.clip?.();

    const ringCount = 16;
    const phaseShift = (1 - contrast) * 6.0;
    for (let i = 1; i <= ringCount; i++) {
      const frac = i / ringCount;
      const rr = frac * plateR;
      const waveAmp = 0.5 + 0.5 * Math.cos(frac * Math.PI * 6 + phaseShift + this.elapsedSec * (1 - contrast) * 5);
      c2d.strokeStyle = contrast >= 0.85 ? palette.lockHex : contrast > 0.45 ? palette.accentHex : 'rgba(180, 195, 215, 0.35)';
      c2d.globalAlpha = lerp(0.14, 0.9, contrast * waveAmp) * (1 - frac * 0.28);
      c2d.lineWidth = lerp(4.2, 1.8, contrast);
      c2d.beginPath();
      c2d.arc(cx, cy, rr, 0, Math.PI * 2);
      c2d.stroke();

      if (this.stage === 3) {
        c2d.strokeStyle = palette.secondaryHex;
        c2d.globalAlpha = lerp(0.08, 0.58, contrast);
        c2d.beginPath();
        c2d.moveTo(cx - plateR, cy + (frac - 0.5) * plateR * 2 + (this.delayB - this.targetB) * 65);
        c2d.lineTo(cx + plateR, cy + (frac - 0.5) * plateR * 2 - (this.delayB - this.targetB) * 65);
        c2d.stroke();
      }
    }

    // Center star blurs into single hazy glow when misaligned, then splits cleanly into razor binary pair!
    const sep = lerp(1.5, 19, contrast);
    const starColA = contrast >= 0.85 ? palette.lockHex : palette.accentHex;
    drawDiffractionStar(c2d, cx - sep, cy - sep * 0.35, lerp(11, 8.5, contrast), starColA, {
      spikes: 4,
      glowAlpha: lerp(0.32, 0.98, contrast),
    });
    drawDiffractionStar(c2d, cx + sep, cy + sep * 0.35, lerp(11, 8.5, contrast), palette.secondaryHex, {
      spikes: 4,
      glowAlpha: lerp(0.3, 0.96, contrast),
    });
    c2d.restore();

    c2d.save();
    c2d.strokeStyle = contrast >= 0.85 ? palette.lockHex : palette.accentHex;
    c2d.lineWidth = contrast >= 0.85 ? 2.4 : 1.6;
    c2d.beginPath();
    c2d.arc(cx, cy, plateR, 0, Math.PI * 2);
    c2d.stroke();
    c2d.restore();

    // Laser Beam-Splitter Bench & Movable Mirror Carriages
    const railTop = h * 0.24;
    const railBot = h * 0.68;
    const drawRail = (rx: number, bsX: number, val01: number, locked: boolean, label: string, driftTarget?: number) => {
      const py = lerp(railTop, railBot, val01);
      c2d.save();
      c2d.strokeStyle = 'rgba(200, 224, 248, 0.25)';
      c2d.lineWidth = 2;
      c2d.beginPath();
      c2d.moveTo(rx, railTop);
      c2d.lineTo(rx, railBot);
      c2d.stroke();

      // Translucent beam-splitter prism diamond between rail & interferometer plate
      c2d.strokeStyle = palette.secondaryHex;
      c2d.globalAlpha = 0.55;
      c2d.beginPath();
      c2d.moveTo(bsX, cy - 10);
      c2d.lineTo(bsX + 10, cy);
      c2d.lineTo(bsX, cy + 10);
      c2d.lineTo(bsX - 10, cy);
      c2d.closePath();
      c2d.stroke();

      // Laser path beam: beam-splitter -> rail mirror -> plate center
      c2d.strokeStyle = locked ? palette.lockHex : palette.accentHex;
      c2d.globalAlpha = 0.65;
      c2d.setLineDash([4, 4]);
      c2d.beginPath();
      c2d.moveTo(cx + (rx < cx ? -plateR : plateR), cy);
      c2d.lineTo(bsX, cy);
      c2d.lineTo(rx, py);
      c2d.stroke();
      c2d.setLineDash([]);

      if (driftTarget !== undefined) {
        const dy = lerp(railTop, railBot, driftTarget);
        c2d.fillStyle = '#ffb86c';
        c2d.globalAlpha = 0.55;
        c2d.fillRect(rx - 8, dy - 1.5, 16, 3);
      }

      // Movable Mirror Carriage
      c2d.globalAlpha = 1;
      c2d.fillStyle = '#07101c';
      c2d.lineWidth = 2.2;
      c2d.beginPath();
      c2d.arc(rx, py, 10, 0, Math.PI * 2);
      c2d.fill();
      c2d.stroke();

      c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = locked ? palette.lockHex : palette.secondaryHex;
      c2d.textAlign = 'center';
      c2d.fillText(label, rx, railTop - 10);
      c2d.restore();
    };

    const tA = this.getEffectiveTargetA();
    const rxLeft = cx - plateR - (compact ? 48 : 78);
    drawRail(rxLeft, cx - plateR - (compact ? 20 : 34), this.delayA, Math.abs(this.delayA - tA) <= 0.055, 'DELAY A', this.stage === 2 ? tA : undefined);
    if (this.stage === 3) {
      const rxRight = cx + plateR + (compact ? 48 : 78);
      drawRail(rxRight, cx + plateR + (compact ? 20 : 34), this.delayB, Math.abs(this.delayB - this.targetB) <= 0.055, 'DELAY B');
    }

    const items: Array<{ key: string; label: string; val01: number; locked?: boolean }> = [
      { key: 'a', label: 'MIRROR DELAY A', val01: this.delayA, locked: Math.abs(this.delayA - tA) <= 0.055 },
    ];
    if (this.stage === 3) {
      items.push({ key: 'b', label: 'MIRROR DELAY B', val01: this.delayB, locked: Math.abs(this.delayB - this.targetB) <= 0.055 });
    }
    this.strips = layoutVernierRow(w, h, items);
    for (const s of this.strips) drawVernierStrip(c2d, s, palette.accentHex, palette.lockHex);

    if (this.lockHoldSec > 0.02) {
      drawLockResonanceRing(c2d, cx, cy, plateR + 10, this.lockHoldSec / this.lockHoldTargetSec, palette.lockHex);
    }
    drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, palette.lockHex);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'A Michelson optical interferometer bounces starlight through a beam-splitter to movable delay mirrors; equalizing paths turns blurry noise into high-contrast Airy interference rings.',
      goalSummary: 'Slide Optical Delay Mirror carriages until constructive golden interference fringes resolve the twin star.',
      controlsDesktop: 'Drag Delay Mirror carriages on the vertical rails or tune the sliders below.',
      controlsTouch: 'Touch-drag the vertical Delay rails or slide MIRROR DELAY below.',
      warmthEffect: 'Warm H% gives wider coherent fringe capture; Cold H% sharpens micron delay precision.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        this.delayA = this.getEffectiveTargetA();
        this.delayB = this.targetB;
        if (stage < 3) this.setupStage((stage + 1) as 2 | 3);
        else this.finishSuccess();
      },
      getDiagnostics: () => ({
        stage: this.stage,
        completed: this.completed,
        stageProgress: this.completed ? 1 : (this.stage - 1 + this.computeContrast01()) / 3,
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
