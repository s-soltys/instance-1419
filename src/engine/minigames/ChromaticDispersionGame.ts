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

interface WavelengthBand {
  key: 'UV' | 'VIS' | 'IR';
  label: string;
  color: string;
  rgb: string;
  offsetSign: number; // -1 (UV bends higher), 0 (VIS), +1 (IR bends lower)
  piercesDust: boolean;
  targetTx: number;
  targetTy: number;
  hit: boolean;
  proximity01: number;
}

/**
 * DSP-05 — Chromatic Light Disperser
 * Rotate a refractive crystal prism and tune spectral dispersion spread to split white starlight
 * into UV (280nm), Visible (550nm), and Dust-Penetrating Infrared (1400nm) collectors.
 */
export class ChromaticDispersionGame implements IMinigame {
  readonly id = 'light_dispersion';
  readonly title = 'CHROMATIC LIGHT DISPERSER';
  readonly subtitle = 'Wavelength Refraction & Dust Penetration';
  readonly instrumentCode = 'DSP-05';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private emitter = { tx: 0.22, ty: 0.5 };
  private prism = { tx: 0.62, ty: 0.5 };
  private detRadius = 0.68;

  private baseAngle = 0.42;
  private targetBaseAngle = 0;
  private spread = 0.36;
  private targetSpread = 0.36;

  private bands: WavelengthBand[] = [];
  private dustPatch: { tx: number; ty: number; radius: number } | null = null;
  private dragMode: 'prism' | 'spread' | null = null;
  private spreadRect = { x: 0, y: 0, w: 0, h: 0 };
  private lockHoldSec = 0;
  private readonly lockHoldTargetSec = 0.62;
  private stageFlash = 0;
  private stageFlashText = '';
  private lastProximityTickAt = 0;
  private ambientStars = generateAmbientStars(createSeededRng('dsp-stars'), 46);
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
    const rng = createSeededRng(`${this.ctx.targetId}:dsp:${this.ctx.state.shift}:${stage}`);

    this.targetBaseAngle = stage === 1 ? (rng() - 0.5) * 0.16 : (rng() - 0.5) * 0.24;
    this.targetSpread = stage === 1 ? 0.36 : stage === 2 ? 0.30 + rng() * 0.16 : 0.40 + rng() * 0.1;

    this.baseAngle = this.targetBaseAngle + (rng() > 0.5 ? 0.48 : -0.48);
    this.spread = stage === 1 ? this.targetSpread : this.targetSpread > 0.38 ? 0.2 : 0.54;

    const specs: Array<Pick<WavelengthBand, 'key' | 'label' | 'color' | 'rgb' | 'offsetSign' | 'piercesDust'>> = [
      { key: 'UV', label: '280nm UV', color: '#b892ff', rgb: '184, 146, 255', offsetSign: -1, piercesDust: false },
      ...(stage >= 2
        ? [{ key: 'VIS' as const, label: '550nm VIS', color: '#ffd97d', rgb: '255, 217, 125', offsetSign: 0, piercesDust: false }]
        : []),
      { key: 'IR', label: '1400nm IR', color: '#ff7070', rgb: '255, 112, 112', offsetSign: 1, piercesDust: true },
    ];

    this.bands = specs.map((sp) => {
      const ang = this.targetBaseAngle + sp.offsetSign * this.targetSpread;
      return {
        ...sp,
        targetTx: this.prism.tx + Math.cos(ang) * this.detRadius,
        targetTy: this.prism.ty + Math.sin(ang) * this.detRadius,
        hit: false,
        proximity01: 0,
      };
    });

    if (stage === 3) {
      const irAng = this.targetBaseAngle + this.targetSpread;
      this.dustPatch = {
        tx: this.prism.tx + Math.cos(irAng) * 0.38,
        ty: this.prism.ty + Math.sin(irAng) * 0.38,
        radius: 0.115,
      };
    } else {
      this.dustPatch = null;
    }

    this.traceDispersion();
  }

  private getFieldBox(w: number, h: number) {
    const topPad = h < 450 ? 50 : 62;
    const botPad = h < 450 ? 74 : 98;
    const availH = Math.max(120, h - topPad - botPad);
    const availW = Math.max(200, w * 0.88);
    const boxW = Math.min(availW, availH * 1.75);
    const boxH = boxW / 1.75;
    return {
      left: (w - boxW) * 0.5,
      top: topPad + (availH - boxH) * 0.5,
      scale: boxH,
    };
  }

  private rayCircleT(rx: number, ry: number, dx: number, dy: number, cx: number, cy: number, r: number): number | null {
    const fx = rx - cx;
    const fy = ry - cy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) * 0.5;
    return t > 0.02 ? t : null;
  }

  private traceDispersion(): void {
    for (const band of this.bands) {
      const rayAng = this.baseAngle + band.offsetSign * this.spread;
      const dx = Math.cos(rayAng);
      const dy = Math.sin(rayAng);

      // Check dust blocking for short wavelengths (UV & Visible)
      let blockedDist = 1.25;
      let blockedByDust = false;
      if (this.dustPatch && !band.piercesDust) {
        const dtDust = this.rayCircleT(
          this.prism.tx,
          this.prism.ty,
          dx,
          dy,
          this.dustPatch.tx,
          this.dustPatch.ty,
          this.dustPatch.radius
        );
        if (dtDust !== null && dtDust < blockedDist) {
          blockedDist = dtDust;
          blockedByDust = true;
        }
      }

      const targetAng = Math.atan2(band.targetTy - this.prism.ty, band.targetTx - this.prism.tx);
      const angErr = Math.abs(angleDiffRad(rayAng, targetAng));
      const tol = this.ctx.state.humanity >= 45 ? 0.095 : 0.072;
      band.hit = !blockedByDust && angErr <= tol;
      band.proximity01 = blockedByDust ? 0 : clamp(1 - angErr / 0.35, 0, 1);

      // Store distance for drawing ray segment cleanly
      (band as WavelengthBand & { _drawDist?: number })._drawDist = band.hit ? this.detRadius : blockedDist;
    }
  }

  private bindEvents(): void {
    const onResize = () => {
      this.c2d = setupFullRetinaCanvas(this.canvas);
    };

    const applySpreadAtX = (px: number) => {
      const frac = clamp((px - this.spreadRect.x) / Math.max(1, this.spreadRect.w), 0, 1);
      this.spread = lerp(0.16, 0.58, frac);
      this.traceDispersion();
    };

    const aimPrismFromPointer = (clientX: number, clientY: number) => {
      const rect = this.canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const box = this.getFieldBox(Math.max(1, rect.width), Math.max(1, rect.height));
      const tx = (px - box.left) / box.scale;
      const ty = (py - box.top) / box.scale;
      if (Math.hypot(tx - this.prism.tx, ty - this.prism.ty) < 0.04) return;
      let nextAng = Math.atan2(ty - this.prism.ty, tx - this.prism.tx);
      const diff = angleDiffRad(this.targetBaseAngle, nextAng);
      if (Math.abs(diff) < 0.065) nextAng += diff * 0.42;
      this.baseAngle = clamp(nextAng, -0.75, 0.75);
      this.traceDispersion();

      const maxProx = Math.max(0, ...this.bands.map((b) => b.proximity01));
      if (maxProx > 0.65 && this.elapsedSec - this.lastProximityTickAt > 0.2) {
        this.lastProximityTickAt = this.elapsedSec;
        this.ctx.audio?.playProximityTick?.(maxProx);
      }
    };

    const onDown = (e: PointerEvent) => {
      if (this.completed) return;
      this.canvas.setPointerCapture(e.pointerId);
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      if (
        this.stage >= 2 &&
        px >= this.spreadRect.x - 16 &&
        px <= this.spreadRect.x + this.spreadRect.w + 16 &&
        py >= this.spreadRect.y - 18 &&
        py <= this.spreadRect.y + this.spreadRect.h + 18
      ) {
        this.dragMode = 'spread';
        applySpreadAtX(px);
        platform.triggerHaptic('vernierTick', 0.45);
        return;
      }

      this.dragMode = 'prism';
      aimPrismFromPointer(e.clientX, e.clientY);
      platform.triggerHaptic('vernierTick', 0.45);
    };

    const onMove = (e: PointerEvent) => {
      if (!this.dragMode || this.completed) return;
      if (this.dragMode === 'spread') {
        const rect = this.canvas.getBoundingClientRect();
        applySpreadAtX(e.clientX - rect.left);
      } else {
        aimPrismFromPointer(e.clientX, e.clientY);
      }
    };

    const onUp = () => {
      this.dragMode = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (this.completed) return;
      if (e.key === 'ArrowLeft') this.baseAngle = clamp(this.baseAngle - 0.04, -0.75, 0.75);
      if (e.key === 'ArrowRight') this.baseAngle = clamp(this.baseAngle + 0.04, -0.75, 0.75);
      if (this.stage >= 2) {
        if (e.key === 'ArrowUp') this.spread = clamp(this.spread + 0.02, 0.16, 0.58);
        if (e.key === 'ArrowDown') this.spread = clamp(this.spread - 0.02, 0.16, 0.58);
      }
      this.traceDispersion();
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

    const hitCount = this.bands.filter((b) => b.hit).length;
    const allHit = hitCount === this.bands.length && this.bands.length > 0;

    if (allHit) {
      if (this.lockHoldSec === 0) {
        this.ctx.audio?.playTumblerClick(0.95, true);
        platform.triggerHaptic('proximityPulse', 0.65);
      }
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        platform.triggerHaptic('phaseSnapLock', 0.95);
        this.ctx.audio?.playPhaseLock?.(this.stage);
        if (this.stage < 3) {
          this.stageFlash = 1;
          this.stageFlashText = `SPECTRUM SPLIT ${this.stage}/3 CALIBRATED`;
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

    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.ctx.onComplete(
      resolveInstrumentPayout(
        'clean',
        totalSec,
        0.95,
        `${this.ctx.targetId}_dispersion`,
        `Full-spectrum chromatic dispersion (UV, Visible, Dust-Piercing IR) locked on ${this.ctx.targetName}.`,
        `3-Band Lock · ${totalSec.toFixed(1)}s`,
        'Chromatic Refraction & Infrared Interstellar Dust Penetration'
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
      1: 'Drag on the sky right of the prism to aim both UV & Infrared rays onto their wavelength rings.',
      2: 'Aim the crystal prism AND slide DISPERSION SPREAD below to hit UV, Visible, and Infrared rings together.',
      3: 'Infrared pierces dark dust while UV/Visible scatter — route IR through the dust into the hidden ring!',
    };
    const hitFrac =
      this.bands.length > 0 ? this.bands.reduce((acc, b) => acc + (b.hit ? 1 : b.proximity01 * 0.5), 0) / this.bands.length : 0;
    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: labelMap[this.stage],
      stageProgress: clamp((this.stage - 1 + hitFrac) / 3, 0, 1),
      promptText: promptMap[this.stage],
      actionButton: null,
    });
  }

  private render(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const c2d = this.c2d;
    const palette = getCosmicPalette(this.ctx.state.humanity);
    const compact = h < 450;

    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'carina',
      blurPx: 4,
      alpha: 0.46,
      brightness: 0.78,
      scale: 1.03,
      tintAlpha: 0.46,
      gridAlpha: palette.mode === 'cold' ? 0.14 : 0.05,
    });
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, 0.76);

    const box = this.getFieldBox(w, h);
    const toPx = (tx: number, ty: number) => ({
      x: box.left + tx * box.scale,
      y: box.top + ty * box.scale,
    });

    const emPx = toPx(this.emitter.tx, this.emitter.ty);
    const prPx = toPx(this.prism.tx, this.prism.ty);

    // Stage 3 Dust Nebula Cloud (blocks UV/Visible, Infrared pierces right through!)
    if (this.dustPatch) {
      const dp = toPx(this.dustPatch.tx, this.dustPatch.ty);
      const rPx = this.dustPatch.radius * box.scale;
      c2d.save();
      const grad = c2d.createRadialGradient(dp.x, dp.y, 4, dp.x, dp.y, rPx);
      grad.addColorStop(0, 'rgba(28, 16, 12, 0.94)');
      grad.addColorStop(0.75, 'rgba(20, 12, 10, 0.7)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      c2d.fillStyle = grad;
      c2d.beginPath();
      c2d.arc(dp.x, dp.y, rPx * 1.15, 0, Math.PI * 2);
      c2d.fill();
      c2d.strokeStyle = 'rgba(255, 162, 102, 0.25)';
      c2d.setLineDash([4, 4]);
      c2d.beginPath();
      c2d.arc(dp.x, dp.y, rPx, 0, Math.PI * 2);
      c2d.stroke();
      c2d.restore();
    }

    // Incoming polychromatic white beam from source star to crystal prism
    c2d.save();
    c2d.strokeStyle = '#f8fbff';
    c2d.lineWidth = 3.2;
    c2d.shadowColor = '#ffffff';
    c2d.shadowBlur = 14;
    c2d.beginPath();
    c2d.moveTo(emPx.x, emPx.y);
    c2d.lineTo(prPx.x, prPx.y);
    c2d.stroke();
    c2d.restore();

    drawDiffractionStar(c2d, emPx.x, emPx.y, 11, '#ffffff', { spikes: 6, glowAlpha: 0.95 });

    // Dispersed chromatic rays + flowing wavelength photon pulses
    for (const band of this.bands) {
      const drawDist = (band as WavelengthBand & { _drawDist?: number })._drawDist ?? 1.05;
      const ang = this.baseAngle + band.offsetSign * this.spread;
      const endPx = toPx(this.prism.tx + Math.cos(ang) * drawDist, this.prism.ty + Math.sin(ang) * drawDist);

      c2d.save();
      c2d.strokeStyle = band.hit ? palette.lockHex : band.color;
      c2d.lineWidth = band.hit ? 3.2 : 2.3;
      c2d.shadowColor = c2d.strokeStyle;
      c2d.shadowBlur = band.hit ? 18 : 10;
      c2d.beginPath();
      c2d.moveTo(prPx.x, prPx.y);
      c2d.lineTo(endPx.x, endPx.y);
      c2d.stroke();

      for (let pkt = 0; pkt < 3; pkt++) {
        const t = (this.elapsedSec * 0.9 + pkt / 3) % 1;
        c2d.fillStyle = '#ffffff';
        c2d.beginPath();
        c2d.arc(lerp(prPx.x, endPx.x, t), lerp(prPx.y, endPx.y, t), 2.5, 0, Math.PI * 2);
        c2d.fill();
      }
      c2d.restore();

      // Detector ring + wavelength label
      const detPx = toPx(band.targetTx, band.targetTy);
      c2d.save();
      c2d.strokeStyle = band.hit ? palette.lockHex : band.color;
      c2d.fillStyle = band.hit ? `rgba(${palette.lockRgb}, 0.28)` : 'rgba(10, 16, 28, 0.65)';
      c2d.lineWidth = band.hit ? 3 : 1.8;
      c2d.beginPath();
      c2d.arc(detPx.x, detPx.y, 18, 0, Math.PI * 2);
      c2d.fill();
      c2d.stroke();

      c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = band.hit ? palette.lockHex : band.color;
      c2d.textAlign = 'center';
      c2d.fillText(band.label, detPx.x, detPx.y + 30);
      c2d.restore();
    }

    // Central faceted triangular crystal prism
    c2d.save();
    c2d.translate(prPx.x, prPx.y);
    c2d.rotate(this.baseAngle);
    const prSize = 26;
    c2d.beginPath();
    c2d.moveTo(-prSize * 0.85, -prSize * 0.9);
    c2d.lineTo(prSize, 0);
    c2d.lineTo(-prSize * 0.85, prSize * 0.9);
    c2d.closePath();
    c2d.fillStyle = 'rgba(180, 226, 255, 0.22)';
    c2d.strokeStyle = '#dff4ff';
    c2d.lineWidth = 2;
    c2d.fill();
    c2d.stroke();
    c2d.restore();

    // Dispersion Spread slider on Stages 2 & 3
    if (this.stage >= 2) {
      const sW = Math.min(300, w * 0.46);
      const sX = (w - sW) * 0.5;
      const sY = compact ? h - 74 : h - 98;
      this.spreadRect = { x: sX, y: sY, w: sW, h: 18 };
      const frac = clamp((this.spread - 0.16) / (0.58 - 0.16), 0, 1);
      const spreadOk = Math.abs(this.spread - this.targetSpread) <= 0.045;
      const col = spreadOk ? palette.lockHex : palette.accentHex;

      c2d.save();
      c2d.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = 'rgba(220, 236, 250, 0.8)';
      c2d.textAlign = 'left';
      c2d.fillText('DISPERSION SPREAD', sX, sY - 6);
      c2d.textAlign = 'right';
      c2d.fillStyle = col;
      c2d.fillText(`${Math.round(frac * 100)}%`, sX + sW, sY - 6);

      const lineY = sY + 6;
      c2d.fillStyle = 'rgba(255, 255, 255, 0.16)';
      c2d.fillRect(sX, lineY - 1, sW, 2);
      c2d.fillStyle = col;
      c2d.fillRect(sX, lineY - 1.5, frac * sW, 3);
      c2d.beginPath();
      c2d.arc(sX + frac * sW, lineY, 6.5, 0, Math.PI * 2);
      c2d.fillStyle = '#07101c';
      c2d.fill();
      c2d.lineWidth = 2;
      c2d.strokeStyle = col;
      c2d.stroke();
      c2d.restore();
    }

    if (this.lockHoldSec > 0.02) {
      drawLockResonanceRing(
        c2d,
        prPx.x,
        prPx.y,
        42,
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
        'A prism refracts starlight into distinct wavelengths: ultraviolet bends sharply, visible sits center, and longer infrared waves penetrate straight through cold cosmic dust.',
      goalSummary:
        'Rotate the crystal prism and tune DISPERSION SPREAD across 3 stages so UV, Visible, and Infrared collectors illuminate together.',
      controlsDesktop: 'Drag on the optical field to tilt the prism; drag DISPERSION SPREAD below on Stages 2–3 (or Arrow keys).',
      controlsTouch: 'Drag right of the prism to aim the refracted beams and slide DISPERSION SPREAD below.',
      warmthEffect: 'Warm H% gives generous angular detector pockets; Cold H% sharpens spectral dispersion alignment.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        this.baseAngle = this.targetBaseAngle;
        this.spread = this.targetSpread;
        this.traceDispersion();
        if (stage < 3) {
          this.setupStage((stage + 1) as 2 | 3);
        } else {
          this.finishSuccess();
        }
      },
      getDiagnostics: () => ({
        stage: this.stage,
        completed: this.completed,
        stageProgress:
          this.completed
            ? 1
            : (this.stage - 1 + (this.bands.length > 0 ? this.bands.filter((b) => b.hit).length / this.bands.length : 0)) / 3,
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
