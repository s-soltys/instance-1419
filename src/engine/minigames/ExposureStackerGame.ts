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

interface HazardTrack {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  telegraphSec: number;
  progress: number;
  speed: number;
  isFlare: boolean;
}

interface SubFrameCard {
  id: number;
  contaminated: boolean;
  rejected: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PhotonKnot {
  rx: number;
  ry: number;
  threshold: number;
  size: number;
  tint: string;
}

/**
 * EXP-13 — Long-Exposure Stacker
 * Toggle/latch the mechanical 8-blade shutter open, leaving your pointer completely free to slide
 * APERTURE IRIS (wide = fast capture, narrow = dodge angled edge streaks!), then reject 1 scarred sub-frame in Stage 3.
 */
export class ExposureStackerGame implements IMinigame {
  readonly id = 'exposure_stacker';
  readonly title = 'LONG-EXPOSURE STACKER';
  readonly subtitle = 'Variable-Iris Deep-Field Integration';
  readonly instrumentCode = 'EXP-13';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private phase: 'expose' | 'inspect' = 'expose';
  private shutterOpen = false;
  private shutterBlade01 = 0; // 0 = closed blades, 1 = open
  private exposure01 = 0;
  private iris01 = 0.72;
  private irisStrip: VernierStripSpec | null = null;
  private dragMode: 'iris' | 'rim' | null = null;

  private hazards: HazardTrack[] = [];
  private hazardCooldown = 1.6;
  private spoilFlash = 0;
  private inspectHintFlash = 0;
  private subFrames: SubFrameCard[] = [];
  private photonKnots: PhotonKnot[] = [];

  private stageClearTimer = 0;
  private stageFlash = 0;
  private stageFlashText = '';
  private rng = createSeededRng('exp-init');
  private ambientStars = generateAmbientStars(createSeededRng('exp-stars'), 48);
  private unbind: (() => void) | null = null;

  mount(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.startedAt = performance.now();
    this.completed = false;
    this.elapsedSec = 0;

    const knotRng = createSeededRng('exp-photon-knots');
    this.photonKnots = Array.from({ length: 82 }, (_, i) => {
      const a = knotRng() * Math.PI * 2;
      const rad = Math.sqrt(knotRng()) * 0.94;
      return {
        rx: Math.cos(a) * rad,
        ry: Math.sin(a) * rad,
        threshold: i / 82,
        size: 1.4 + knotRng() * 2.2,
        tint: i % 3 === 0 ? '#9de6ff' : '#ffd58e',
      };
    });

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
    this.phase = 'expose';
    this.exposure01 = 0;
    this.shutterOpen = false;
    this.shutterBlade01 = 0;
    this.iris01 = stage === 1 ? 0.75 : stage === 2 ? 0.68 : 0.72;
    this.hazards = [];
    this.hazardCooldown = stage === 1 ? 1.5 : 1.05;
    this.stageClearTimer = 0;
    this.inspectHintFlash = 0;
    this.rng = createSeededRng(`${this.ctx.targetId}:exp:${this.ctx.state.shift}:${stage}`);

    const badIdx = Math.floor(this.rng() * 4);
    this.subFrames = Array.from({ length: 4 }, (_, id) => ({
      id,
      contaminated: id === badIdx,
      rejected: false,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    }));
  }

  onHelperAction(actionId: string): void {
    if (actionId === 'toggle_shutter' && this.phase === 'expose' && !this.completed && this.stageClearTimer <= 0) {
      this.setShutter(!this.shutterOpen);
    }
  }

  private setShutter(open: boolean): void {
    if (this.completed || this.stageClearTimer > 0 || this.phase !== 'expose') return;
    if (this.shutterOpen !== open) {
      this.shutterOpen = open;
      this.ctx.audio?.playSolenoidClack(open);
      platform.triggerHaptic('vernierTick', open ? 0.65 : 0.35);
      this.emitHud();
    }
  }

  private getApertureRadiusPx(w: number, h: number): number {
    const scale = Math.min(w, h);
    const maxMul = h < 450 ? 0.22 : 0.26;
    return lerp(scale * 0.1, scale * maxMul, this.iris01);
  }

  private spawnHazard(): void {
    const ang = (this.rng() - 0.5) * 1.45 + (this.rng() > 0.5 ? 0 : Math.PI);
    const dirX = Math.cos(ang);
    const dirY = Math.sin(ang);
    const normX = -dirY;
    const normY = dirX;
    const isCentral = this.rng() < (this.stage === 1 ? 0.32 : 0.42);
    const offset = isCentral ? (this.rng() - 0.5) * 0.08 : (this.rng() > 0.5 ? 1 : -1) * (0.14 + this.rng() * 0.08);
    const span = 0.72;
    this.hazards.push({
      x0: 0.5 + normX * offset - dirX * span,
      y0: 0.43 + normY * offset - dirY * span,
      x1: 0.5 + normX * offset + dirX * span,
      y1: 0.43 + normY * offset + dirY * span,
      telegraphSec: 0.9,
      progress: 0,
      speed: this.stage === 1 ? 0.65 : this.stage === 2 ? 0.85 : 0.96,
      isFlare: isCentral && this.stage >= 2 && this.rng() > 0.45,
    });
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

      if (this.phase === 'inspect') {
        for (const card of this.subFrames) {
          if (px >= card.x && px <= card.x + card.w && py >= card.y && py <= card.y + card.h) {
            if (card.contaminated) {
              card.rejected = true;
              platform.triggerHaptic('phaseSnapLock', 1.0);
              this.ctx.audio?.playTumblerClick(0.95, true);
              this.stageClearTimer = 0.65;
              this.stageFlash = 1;
              this.stageFlashText = 'ARTIFACT REJECTED · CLEAN STACK VERIFIED';
            } else {
              this.inspectHintFlash = 1;
              platform.triggerHaptic('rejectThud', 0.65);
              this.ctx.audio?.playSolenoidClack(false);
            }
            this.emitHud();
            return;
          }
        }
        return;
      }

      if (this.irisStrip && hitVernierStrip(this.irisStrip, px, py)) {
        this.canvas.setPointerCapture(e.pointerId);
        this.dragMode = 'iris';
        this.iris01 = clamp(valueFromStripX(this.irisStrip, px, this.iris01, 0), 0.22, 1);
        platform.triggerHaptic('vernierTick', 0.4);
        return;
      }

      const cx = w * 0.5;
      const cy = h < 450 ? h * 0.39 : h * 0.43;
      const apR = this.getApertureRadiusPx(w, h);
      const dCenter = Math.hypot(px - cx, py - cy);
      if (Math.abs(dCenter - apR) <= 24) {
        this.canvas.setPointerCapture(e.pointerId);
        this.dragMode = 'rim';
        return;
      }

      // Clicking inside aperture / sky toggles latched shutter cleanly so pointer stays free for iris!
      this.setShutter(!this.shutterOpen);
    };

    const onMove = (e: PointerEvent) => {
      if (!this.dragMode || this.completed || this.phase !== 'expose') return;
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (this.dragMode === 'iris' && this.irisStrip) {
        this.iris01 = clamp(valueFromStripX(this.irisStrip, px, this.iris01, 0), 0.22, 1);
      } else if (this.dragMode === 'rim') {
        const w = Math.max(1, rect.width);
        const h = Math.max(1, rect.height);
        const minR = Math.min(w, h) * 0.1;
        const maxR = Math.min(w, h) * (h < 450 ? 0.22 : 0.26);
        const r = Math.hypot(px - w * 0.5, py - (h < 450 ? h * 0.39 : h * 0.43));
        this.iris01 = clamp((r - minR) / Math.max(1, maxR - minR), 0.22, 1);
      }
    };

    const onUp = () => {
      this.dragMode = null;
    };

    const onWheel = (e: WheelEvent) => {
      if (this.completed || this.phase !== 'expose') return;
      e.preventDefault();
      this.iris01 = clamp(this.iris01 - e.deltaY * 0.0008, 0.22, 1);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && this.phase === 'expose') {
        e.preventDefault();
        this.setShutter(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && this.phase === 'expose') {
        e.preventDefault();
        this.setShutter(false);
      }
    };

    window.addEventListener('resize', onResize);
    this.canvas.addEventListener('pointerdown', onDown);
    this.canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    this.unbind = () => {
      window.removeEventListener('resize', onResize);
      this.canvas.removeEventListener('pointerdown', onDown);
      this.canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }

  private update(dt: number): void {
    if (this.completed) return;
    this.elapsedSec += dt;
    this.stageFlash = Math.max(0, this.stageFlash - dt * 1.4);
    this.spoilFlash = Math.max(0, this.spoilFlash - dt * 1.8);
    this.inspectHintFlash = Math.max(0, this.inspectHintFlash - dt * 1.6);
    this.shutterBlade01 = lerp(this.shutterBlade01, this.shutterOpen ? 1 : 0, clamp(dt * 12, 0, 1));

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
      return;
    }

    if (this.phase === 'inspect') {
      this.emitHud();
      return;
    }

    this.hazardCooldown -= dt;
    if (this.hazardCooldown <= 0) {
      this.hazardCooldown = this.stage === 1 ? 1.9 : this.stage === 2 ? 1.35 : 1.15;
      this.spawnHazard();
    }

    const w = Math.max(1, this.canvas.clientWidth || 1280);
    const h = Math.max(1, this.canvas.clientHeight || 720);
    const cx = w * 0.5;
    const cy = h < 450 ? h * 0.39 : h * 0.43;
    const apR = this.getApertureRadiusPx(w, h);

    let hittingOpenSensor = false;
    for (const hz of this.hazards) {
      if (hz.telegraphSec > 0) {
        hz.telegraphSec = Math.max(0, hz.telegraphSec - dt);
      } else {
        hz.progress += hz.speed * dt;
        const headX = lerp(hz.x0, hz.x1, hz.progress) * w;
        const headY = lerp(hz.y0, hz.y1, hz.progress) * h;
        const tailX = lerp(hz.x0, hz.x1, Math.max(0, hz.progress - 0.16)) * w;
        const tailY = lerp(hz.y0, hz.y1, Math.max(0, hz.progress - 0.16)) * h;
        const sx = tailX - headX;
        const sy = tailY - headY;
        const len2 = sx * sx + sy * sy;
        const u = len2 > 0 ? clamp(((cx - headX) * sx + (cy - headY) * sy) / len2, 0, 1) : 0;
        if (Math.hypot(cx - (headX + sx * u), cy - (headY + sy * u)) <= apR + 3) {
          hittingOpenSensor = true;
        }
      }
    }
    this.hazards = this.hazards.filter((hz) => hz.progress <= 1.18);

    if (this.shutterOpen) {
      if (hittingOpenSensor) {
        this.exposure01 = Math.max(0, this.exposure01 - dt * 0.42);
        if (this.spoilFlash <= 0.1) {
          this.spoilFlash = 1;
          platform.triggerHaptic('rejectThud', 0.75);
          this.ctx.audio?.playSolenoidClack(true);
        }
      } else {
        const gatherRate = lerp(0.11, 0.38, this.iris01);
        this.exposure01 = clamp(this.exposure01 + dt * gatherRate, 0, 1);
        if (this.exposure01 >= 1) {
          this.shutterOpen = false;
          platform.triggerHaptic('phaseSnapLock', 0.95);
          this.ctx.audio?.playPhaseLock?.(this.stage);
          if (this.stage === 3) {
            this.phase = 'inspect';
            this.stageFlash = 1;
            this.stageFlashText = '4 SUB-FRAMES CAPTURED · REJECT ARTIFACT';
          } else {
            this.stageClearTimer = 0.62;
            this.stageFlash = 1;
            this.stageFlashText = `EXPOSURE FRAME ${this.stage}/3 STACKED`;
          }
        }
      }
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
        `${this.ctx.targetId}_exposure`,
        `Clean variable-iris frames integrated and verified free of cosmic-ray scars on ${this.ctx.targetName}.`,
        `Clean Integration 100% · ${totalSec.toFixed(1)}s`,
        'Variable-Aperture Long-Exposure Stacking & Cosmic Ray Rejection'
      )
    );
  }

  private emitHud(): void {
    const pct = Math.round(this.exposure01 * 100);
    let prompt = '';
    if (this.phase === 'inspect') {
      prompt =
        this.inspectHintFlash > 0.1
          ? 'That frame is spotless! Click the sub-frame scarred by a white-hot cosmic-ray slash.'
          : 'Inspect all 4 captured Carina sub-frames and click the ONE scarred by a cosmic-ray streak.';
    } else if (this.shutterOpen) {
      prompt = `SHUTTER OPEN (${pct}%) — drag APERTURE IRIS (or wheel) to dodge edge tracks; click aperture/button to shut!`;
    } else {
      prompt = `Click inside the aperture (or SHUTTER button) to latch open (${pct}%). Shrink APERTURE IRIS to dodge edge streaks!`;
    }

    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: stageLabel(this.stage),
      stageProgress: clamp((this.stage - 1 + (this.phase === 'inspect' ? 0.92 : this.exposure01)) / 3, 0, 1),
      promptText: prompt,
      actionButton:
        this.phase === 'expose'
          ? {
              id: 'toggle_shutter',
              label: this.shutterOpen ? 'CLOSE SHUTTER' : 'OPEN SHUTTER (LATCH)',
              active: this.shutterOpen,
            }
          : null,
    });
  }

  private render(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const c2d = this.c2d;
    const palette = getCosmicPalette(this.ctx.state.humanity);

    // Outer viewport dark so hazard beacons pop sharply, while circular aperture develops Carina Nebula inside!
    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'carina',
      blurPx: 14,
      alpha: 0.24,
      brightness: 0.54,
      tintAlpha: 0.65,
      gridAlpha: palette.mode === 'cold' ? 0.12 : 0.04,
    });
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, 0.72);

    if (this.phase === 'inspect') {
      const compact = h < 450;
      const cardW = compact ? Math.min(138, w * 0.19) : Math.min(168, w * 0.18);
      const cardH = cardW * 0.94;
      const gap = compact ? 16 : 26;
      const totalW = cardW * 4 + gap * 3;
      const startX = (w - totalW) * 0.5;
      const cardY = (h - cardH) * 0.47;

      for (let i = 0; i < this.subFrames.length; i++) {
        const card = this.subFrames[i];
        card.x = startX + i * (cardW + gap);
        card.y = cardY;
        card.w = cardW;
        card.h = cardH;

        c2d.save();
        c2d.fillStyle = 'rgba(7, 12, 22, 0.9)';
        c2d.strokeStyle = card.rejected ? palette.lockHex : palette.secondaryHex;
        c2d.lineWidth = card.rejected ? 2.2 : 1.6;
        c2d.fillRect(card.x, card.y, card.w, card.h);
        c2d.strokeRect(card.x, card.y, card.w, card.h);

        c2d.beginPath();
        c2d.rect(card.x + 4, card.y + 4, card.w - 8, card.h - 24);
        c2d.clip?.();

        drawCosmicPlateBackdrop(c2d, w, h, {
          plateId: 'carina',
          blurPx: 0,
          alpha: 0.75,
          brightness: 1.05,
          tintAlpha: 0.16,
          gridAlpha: 0,
        });

        const cxCard = card.x + card.w * 0.5;
        const cyCard = card.y + card.h * 0.44;
        drawDiffractionStar(c2d, cxCard - 22, cyCard - 14, 6.5, '#ffd789', { spikes: 4, glowAlpha: 0.9 });
        drawDiffractionStar(c2d, cxCard + 24, cyCard + 12, 5.5, '#9ce4ff', { spikes: 4, glowAlpha: 0.85 });

        if (card.contaminated && !card.rejected) {
          c2d.strokeStyle = '#ffffff';
          c2d.lineWidth = 2.4;
          c2d.shadowColor = '#ff7d6b';
          c2d.shadowBlur = 10;
          c2d.beginPath();
          c2d.moveTo(cxCard - card.w * 0.28, cyCard - card.h * 0.24);
          c2d.lineTo(cxCard + card.w * 0.26, cyCard + card.h * 0.2);
          c2d.stroke();
          c2d.fillStyle = '#ff6d5e';
          c2d.beginPath();
          c2d.arc(cxCard + 14, cyCard - 16, 3.8, 0, Math.PI * 2);
          c2d.fill();
        }
        c2d.restore();

        c2d.save();
        c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
        c2d.fillStyle = card.rejected ? palette.lockHex : palette.secondaryHex;
        c2d.textAlign = 'center';
        c2d.fillText(card.rejected ? 'ARTIFACT REJECTED' : `SUB-FRAME #0${i + 1}`, card.x + card.w * 0.5, card.y + card.h - 8);
        c2d.restore();
      }
      drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, palette.lockHex);
      return;
    }

    const cx = w * 0.5;
    const cy = h < 450 ? h * 0.39 : h * 0.43;
    const apR = this.getApertureRadiusPx(w, h);

    // Clipped Circular Sensor Plate developing sharp Carina Nebula + Photon Knots + 8 Shutter Blades
    c2d.save();
    c2d.beginPath();
    c2d.arc(cx, cy, apR, 0, Math.PI * 2);
    c2d.clip?.();

    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'carina',
      blurPx: lerp(12, 0, this.exposure01),
      alpha: lerp(0.35, 0.98, this.exposure01),
      brightness: lerp(0.65, 1.24, this.exposure01),
      tintAlpha: lerp(0.55, 0.12, this.exposure01),
      gridAlpha: 0,
    });

    for (const k of this.photonKnots) {
      if (this.exposure01 >= k.threshold * 0.92) {
        c2d.fillStyle = k.tint;
        c2d.globalAlpha = clamp((this.exposure01 - k.threshold * 0.8) * 2.2, 0.12, 0.88);
        c2d.beginPath();
        c2d.arc(cx + k.rx * apR, cy + k.ry * apR, k.size, 0, Math.PI * 2);
        c2d.fill();
      }
    }

    // 8 Mechanical Metallic Shutter Iris Blades animating open/closed
    const bladeCover = 1 - this.shutterBlade01;
    if (bladeCover > 0.03) {
      c2d.globalAlpha = clamp(bladeCover * 0.86, 0, 0.86);
      c2d.fillStyle = '#070c14';
      c2d.strokeStyle = 'rgba(180, 210, 240, 0.25)';
      c2d.lineWidth = 1;
      for (let b = 0; b < 8; b++) {
        const a0 = (b * Math.PI) / 4;
        const a1 = a0 + Math.PI / 4 + 0.16;
        c2d.beginPath();
        c2d.moveTo(cx + Math.cos(a0) * apR * (1 - bladeCover), cy + Math.sin(a0) * apR * (1 - bladeCover));
        c2d.lineTo(cx + Math.cos(a0) * apR * 1.1, cy + Math.sin(a0) * apR * 1.1);
        c2d.lineTo(cx + Math.cos(a1) * apR * 1.1, cy + Math.sin(a1) * apR * 1.1);
        c2d.closePath();
        c2d.fill();
        c2d.stroke();
      }
    }
    c2d.restore();

    // Passing telegraphed diagonal hazards
    for (const hz of this.hazards) {
      const col = hz.isFlare ? '#ff7070' : '#ffb86c';
      c2d.save();
      if (hz.telegraphSec > 0) {
        c2d.strokeStyle = col;
        c2d.globalAlpha = 0.28 + 0.22 * Math.sin(this.elapsedSec * 14);
        c2d.setLineDash([6, 8]);
        c2d.lineWidth = 1.4;
        c2d.beginPath();
        c2d.moveTo(hz.x0 * w, hz.y0 * h);
        c2d.lineTo(hz.x1 * w, hz.y1 * h);
        c2d.stroke();

        const bx = lerp(hz.x0, hz.x1, 0.14) * w;
        const by = lerp(hz.y0, hz.y1, 0.14) * h;
        c2d.setLineDash([]);
        c2d.globalAlpha = 0.88;
        c2d.fillStyle = col;
        c2d.beginPath();
        c2d.arc(bx, by, 4.8, 0, Math.PI * 2);
        c2d.fill();
      } else {
        const hx = lerp(hz.x0, hz.x1, hz.progress) * w;
        const hy = lerp(hz.y0, hz.y1, hz.progress) * h;
        const tx = lerp(hz.x0, hz.x1, Math.max(0, hz.progress - 0.16)) * w;
        const ty = lerp(hz.y0, hz.y1, Math.max(0, hz.progress - 0.16)) * h;
        c2d.strokeStyle = col;
        c2d.lineWidth = hz.isFlare ? 6 : 3.2;
        c2d.shadowColor = col;
        c2d.shadowBlur = 14;
        c2d.beginPath();
        c2d.moveTo(tx, ty);
        c2d.lineTo(hx, hy);
        c2d.stroke();
      }
      c2d.restore();
    }

    // Aperture Iris Ring
    c2d.save();
    c2d.strokeStyle = this.spoilFlash > 0.1 ? '#ff6b6b' : this.shutterOpen ? palette.lockHex : palette.accentHex;
    c2d.lineWidth = this.shutterOpen ? 3 : 1.9;
    c2d.beginPath();
    c2d.arc(cx, cy, apR, 0, Math.PI * 2);
    c2d.stroke();

    if (!this.shutterOpen && this.stageClearTimer <= 0) {
      c2d.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = palette.secondaryHex;
      c2d.textAlign = 'center';
      c2d.fillText('CLICK LENS TO OPEN SHUTTER', cx, cy + 4);
    }
    c2d.restore();

    if (this.exposure01 > 0.01) {
      drawLockResonanceRing(
        c2d,
        cx,
        cy,
        apR + 12,
        this.exposure01,
        this.spoilFlash > 0.1 ? '#ff6b6b' : palette.lockHex,
        `${Math.round(this.exposure01 * 100)}%`
      );
    }

    const irisStrip = layoutVernierRow(
      w,
      h,
      [
        {
          key: 'iris',
          label: 'APERTURE IRIS',
          val01: this.iris01,
          rightText: this.iris01 > 0.65 ? 'WIDE · FAST' : this.iris01 < 0.42 ? 'NARROW · DODGE' : 'BALANCED',
        },
      ],
      h < 450 ? h - 108 : h - 134
    )[0];
    this.irisStrip = irisStrip;
    drawVernierStrip(c2d, irisStrip, palette.accentHex, palette.lockHex);

    drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, palette.lockHex);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Latched deep-sky shutter blades expose the sensor while resizing the iris trades photon gathering speed for dodging angled satellite tracks, followed by sub-frame rejection.',
      goalSummary: 'Latch the shutter open, adjust Aperture Iris size around streaks, and reject the cosmic-ray scarred sub-frame on Stage 3.',
      controlsDesktop: 'Click aperture/button (or hold Space) to open shutter; drag APERTURE IRIS or rim; click scarred frame on Stage 3.',
      controlsTouch: 'Tap aperture/OPEN SHUTTER, slide APERTURE IRIS to dodge edge tracks, and tap scarred frame on Stage 3.',
      warmthEffect: 'Warm H% softly tints stacking glow amber; Cold H% switches to sharp cryo-cyan telemetry.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        this.exposure01 = 1;
        if (stage < 3) {
          this.setupStage((stage + 1) as 2 | 3);
        } else {
          this.phase = 'inspect';
          this.finishSuccess();
        }
      },
      getDiagnostics: () => ({
        stage: this.stage,
        completed: this.completed,
        stageProgress: this.completed ? 1 : (this.stage - 1 + this.exposure01) / 3,
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
