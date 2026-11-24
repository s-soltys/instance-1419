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
import { clamp, createSeededRng, lerp, resolveInstrumentPayout } from './tactilePhysics';
import type { IMinigame, InstrumentFieldGuide, MinigameContext, SolvabilityHarness } from './types';

interface HiddenPlanet {
  id: number;
  orbitR: number;
  ang: number;
  speed: number;
  requiresTightMask: boolean;
  found: boolean;
}

/**
 * COR-11 — Solar Coronagraph Mask
 * Drag the occulting disk onto the host star to engage a calm Auto-Tracking Servo Lock,
 * releasing pointer freely to click orbiting exoplanets without accidentally dropping lock!
 */
export class CoronagraphMaskGame implements IMinigame {
  readonly id = 'coronagraph_mask';
  readonly title = 'SOLAR CORONAGRAPH MASK';
  readonly subtitle = 'Servo-Tracked Exoplanet Spot';
  readonly instrumentCode = 'COR-11';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private maskNx = 0.24;
  private maskNy = 0.46;
  private maskSize01 = 0.48;
  private servoLocked = false;
  private servoHoldSec = 0;
  private servoMaxSec = 8.0;

  private dragging: 'mask' | 'size' | null = null;
  private sizeStrip: VernierStripSpec | null = null;
  private planets: HiddenPlanet[] = [];
  private stageClearTimer = 0;
  private stageFlash = 0;
  private stageFlashText = '';
  private ambientStars = generateAmbientStars(createSeededRng('cor-stars'), 44);
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
    this.maskNx = 0.24;
    this.maskNy = 0.46;
    this.maskSize01 = stage === 1 ? 0.48 : 0.86;
    this.servoLocked = false;
    this.servoHoldSec = 0;
    this.servoMaxSec = stage === 1 ? 8.0 : stage === 2 ? 5.0 : 4.2;
    const rng = createSeededRng(`${this.ctx.targetId}:cor:${this.ctx.state.shift}:${stage}`);

    this.planets = [];
    if (stage === 1) {
      this.planets.push({
        id: 0,
        orbitR: 0.14,
        ang: rng() * Math.PI * 2,
        speed: 0.24,
        requiresTightMask: false,
        found: false,
      });
    } else if (stage === 2) {
      this.planets.push(
        { id: 0, orbitR: 0.115, ang: rng() * Math.PI * 2, speed: 0.28, requiresTightMask: false, found: false },
        { id: 1, orbitR: 0.165, ang: rng() * Math.PI * 2 + 2.4, speed: 0.28, requiresTightMask: false, found: false }
      );
    } else {
      this.planets.push(
        { id: 0, orbitR: 0.105, ang: rng() * Math.PI * 2, speed: 0.32, requiresTightMask: true, found: false },
        { id: 1, orbitR: 0.175, ang: rng() * Math.PI * 2 + 2.6, speed: 0.24, requiresTightMask: false, found: false }
      );
    }
  }

  private getStarPos(): { nx: number; ny: number } {
    if (this.stage === 1) {
      return {
        nx: 0.5 + Math.sin(this.elapsedSec * 0.25) * 0.025,
        ny: 0.46 + Math.cos(this.elapsedSec * 0.2) * 0.02,
      };
    }
    const speed = this.stage === 2 ? 0.34 : 0.44;
    const ampX = this.stage === 2 ? 0.09 : 0.11;
    const ampY = this.stage === 2 ? 0.06 : 0.07;
    return {
      nx: 0.5 + Math.sin(this.elapsedSec * speed) * ampX,
      ny: 0.46 + Math.cos(this.elapsedSec * speed * 0.72) * ampY,
    };
  }

  private getMaskSizeStatus(): 'ok' | 'too_small' | 'too_wide' {
    if (this.stage === 1) return 'ok';
    if (this.maskSize01 < 0.28) return 'too_small';
    const maxAllowed = this.stage === 3 ? 0.64 : 0.76;
    if (this.maskSize01 > maxAllowed) return 'too_wide';
    return 'ok';
  }

  private isMaskSizeValid(tightInnerNeeded = false): boolean {
    if (this.stage === 1) return true;
    const maxAllowed = this.stage === 2 ? 0.76 : tightInnerNeeded ? 0.64 : 0.74;
    return this.maskSize01 >= 0.28 && this.maskSize01 <= maxAllowed;
  }

  private getOccultationQuality(): { masked: boolean; visibility: number } {
    const star = this.getStarPos();
    const d = Math.hypot(this.maskNx - star.nx, (this.maskNy - star.ny) * 0.72);
    const snapTol = this.ctx.state.humanity >= 45 ? 0.08 : 0.062;
    const centered = this.servoLocked || d <= snapTol;
    const sizeOk = this.isMaskSizeValid(false);
    const masked = centered && sizeOk;
    const distVis = this.servoLocked ? 1 : clamp(1 - d / 0.14, 0, 1);
    const vis = clamp(distVis * (sizeOk ? 1 : 0.35), 0, 1);
    return { masked, visibility: vis };
  }

  private engageServoIfClose(): void {
    const star = this.getStarPos();
    const d = Math.hypot(this.maskNx - star.nx, (this.maskNy - star.ny) * 0.72);
    const snapTol = this.ctx.state.humanity >= 45 ? 0.08 : 0.062;
    if (d <= snapTol) {
      if (!this.servoLocked) {
        platform.triggerHaptic('phaseSnapLock', 0.7);
        this.ctx.audio?.playTumblerClick(0.75, true);
      }
      this.servoLocked = true;
      this.servoHoldSec = this.servoMaxSec;
      this.maskNx = star.nx;
      this.maskNy = star.ny;
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

      if (this.sizeStrip && hitVernierStrip(this.sizeStrip, px, py)) {
        this.canvas.setPointerCapture(e.pointerId);
        this.dragging = 'size';
        const targetSize = this.stage === 3 ? 0.46 : 0.52;
        this.maskSize01 = valueFromStripX(this.sizeStrip, px, targetSize, 0.06);
        platform.triggerHaptic('vernierTick', 0.45);
        return;
      }

      // Check clicking revealed exoplanets while visibility >= 0.48
      const { visibility } = this.getOccultationQuality();
      if (visibility >= 0.48) {
        const star = this.getStarPos();
        const scale = Math.min(w, h);
        for (const p of this.planets) {
          if (p.found) continue;
          if (p.requiresTightMask && !this.isMaskSizeValid(true)) continue;
          const pScreenX = star.nx * w + Math.cos(p.ang) * p.orbitR * scale;
          const pScreenY = star.ny * h + Math.sin(p.ang) * p.orbitR * scale;
          if (Math.hypot(px - pScreenX, py - pScreenY) <= 44) {
            p.found = true;
            platform.triggerHaptic('phaseSnapLock', 0.9);
            this.ctx.audio?.playTumblerClick(0.95, true);
            if (this.planets.every((item) => item.found)) {
              this.stageClearTimer = 0.62;
              this.stageFlash = 1;
              this.stageFlashText = `CORONAGRAPH SCAN ${this.stage}/3 COMPLETE`;
              this.ctx.audio?.playPhaseLock?.(this.stage);
            }
            this.emitHud();
            return;
          }
        }
      }

      // Only unlock & drag mask if clicking ON the occulting disk itself OR if not yet servo-locked!
      const mx = this.maskNx * w;
      const my = this.maskNy * h;
      const mr = lerp(18, 72, this.maskSize01);
      const onDisk = Math.hypot(px - mx, py - my) <= mr + 16;
      if (!this.servoLocked || onDisk) {
        this.canvas.setPointerCapture(e.pointerId);
        this.dragging = 'mask';
        this.servoLocked = false;
        this.maskNx = clamp(px / w, 0.1, 0.9);
        this.maskNy = clamp(py / h, 0.16, 0.8);
        this.engageServoIfClose();
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!this.dragging || this.completed) return;
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (this.dragging === 'size' && this.sizeStrip) {
        const targetSize = this.stage === 3 ? 0.46 : 0.52;
        this.maskSize01 = valueFromStripX(this.sizeStrip, px, targetSize, 0.06);
      } else if (this.dragging === 'mask') {
        const nextNx = clamp(px / Math.max(1, rect.width), 0.1, 0.9);
        const nextNy = clamp(py / Math.max(1, rect.height), 0.16, 0.8);
        const star = this.getStarPos();
        const d = Math.hypot(nextNx - star.nx, (nextNy - star.ny) * 0.72);
        const snapTol = this.ctx.state.humanity >= 45 ? 0.08 : 0.062;
        if (d <= snapTol) {
          this.engageServoIfClose();
        } else {
          this.servoLocked = false;
          this.maskNx = nextNx;
          this.maskNy = nextNy;
        }
      }
    };

    const onUp = () => {
      this.dragging = null;
    };

    const onWheel = (e: WheelEvent) => {
      if (this.completed || this.stage < 2) return;
      e.preventDefault();
      this.maskSize01 = clamp(this.maskSize01 - e.deltaY * 0.0008, 0.1, 0.96);
    };

    window.addEventListener('resize', onResize);
    this.canvas.addEventListener('pointerdown', onDown);
    this.canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    this.unbind = () => {
      window.removeEventListener('resize', onResize);
      this.canvas.removeEventListener('pointerdown', onDown);
      this.canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }

  private update(dt: number): void {
    if (this.completed) return;
    this.elapsedSec += dt;
    this.stageFlash = Math.max(0, this.stageFlash - dt * 1.4);

    for (const p of this.planets) {
      p.ang += dt * p.speed;
    }

    if (this.servoLocked) {
      const star = this.getStarPos();
      this.maskNx = lerp(this.maskNx, star.nx, clamp(dt * 14, 0, 1));
      this.maskNy = lerp(this.maskNy, star.ny, clamp(dt * 14, 0, 1));
      this.servoHoldSec -= dt;
      if (this.servoHoldSec <= 0) {
        this.servoLocked = false;
        this.servoHoldSec = 0;
      }
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
        `${this.ctx.targetId}_coronagraph`,
        `Solar glare suppressed cleanly with servo-tracked coronagraph on ${this.ctx.targetName}.`,
        `Contrast Ratio 10^6:1 · ${totalSec.toFixed(1)}s`,
        'Lyot Stellar Coronagraphy & Auto-Tracked Starlight Suppression'
      )
    );
  }

  private emitHud(): void {
    const found = this.planets.filter((p) => p.found).length;
    const total = this.planets.length;
    const sizeStatus = this.getMaskSizeStatus();
    const prompt =
      this.servoLocked && sizeStatus === 'ok'
        ? `SERVO TRACK LOCKED (${this.servoHoldSec.toFixed(1)}s) — Click revealed exoplanets cleanly (${found}/${total}).`
        : sizeStatus === 'too_small'
        ? 'Mask too narrow! Glare leaks past the bezel — widen MASK RADIUS (or scroll up).'
        : sizeStatus === 'too_wide'
        ? 'Mask too wide — swallowing inner orbits! Narrow MASK RADIUS (or scroll down).'
        : `Drag the black mask onto the host star to lock Auto-Track Servo, then click revealed planets (${found}/${total}).`;

    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: stageLabel(this.stage),
      stageProgress: clamp((this.stage - 1 + found / Math.max(1, total)) / 3, 0, 1),
      promptText: prompt,
      actionButton: null,
    });
  }

  private render(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const c2d = this.c2d;
    const palette = getCosmicPalette(this.ctx.state.humanity);
    const { masked, visibility } = this.getOccultationQuality();
    const sizeStatus = this.getMaskSizeStatus();

    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'carina',
      blurPx: 4,
      alpha: 0.48,
      brightness: 0.78,
      tintAlpha: 0.45,
      gridAlpha: palette.mode === 'cold' ? 0.14 : 0.05,
    });
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, 0.8);

    const star = this.getStarPos();
    const sx = star.nx * w;
    const sy = star.ny * h;
    const scale = Math.min(w, h);
    const mr = lerp(18, 72, this.maskSize01);

    // Orbiting planets
    for (const p of this.planets) {
      const px = sx + Math.cos(p.ang) * p.orbitR * scale;
      const py = sy + Math.sin(p.ang) * p.orbitR * scale;
      const validInner = !p.requiresTightMask || this.isMaskSizeValid(true);
      const alpha = p.found ? 1 : validInner ? visibility : visibility * 0.2;

      if (this.servoLocked) {
        c2d.save();
        c2d.strokeStyle = 'rgba(200, 224, 248, 0.16)';
        c2d.setLineDash([4, 6]);
        c2d.beginPath();
        c2d.arc(sx, sy, p.orbitR * scale, 0, Math.PI * 2);
        c2d.stroke();
        c2d.restore();
      }

      if (alpha > 0.18) {
        drawDiffractionStar(c2d, px, py, p.found ? 10 : 8.5, p.found ? palette.lockHex : palette.secondaryHex, {
          spikes: 4,
          glowAlpha: alpha,
        });
        if (!p.found && visibility >= 0.48 && validInner) {
          c2d.save();
          c2d.strokeStyle = this.servoLocked ? palette.lockHex : palette.accentHex;
          c2d.lineWidth = 1.6;
          c2d.beginPath();
          c2d.arc(px, py, 20, 0, Math.PI * 2);
          c2d.stroke();
          c2d.restore();
        }
      }
    }

    // Blinding star glare shrinks when cleanly masked
    const glareR = lerp(128, 30, visibility);
    c2d.save();
    const g = c2d.createRadialGradient(sx, sy, 2, sx, sy, glareR);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.28, '#ffe6a8');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c2d.globalAlpha = lerp(0.94, 0.28, visibility);
    c2d.fillStyle = g;
    c2d.beginPath();
    c2d.arc(sx, sy, glareR, 0, Math.PI * 2);
    c2d.fill();
    c2d.restore();

    if (this.stage === 3) {
      drawDiffractionStar(c2d, sx + 20, sy - 12, 7.5, '#a8d8ff', { spikes: 4, glowAlpha: lerp(0.88, 0.18, visibility) });
    }

    // Black Coronagraph Occulting Disk + Clear Physical Size Feedback
    const mx = this.maskNx * w;
    const my = this.maskNy * h;
    c2d.save();
    if (sizeStatus === 'too_small' && this.servoLocked) {
      // Leaking golden diffraction flare spikes past edge!
      for (let k = 0; k < 6; k++) {
        const ang = this.elapsedSec * 0.4 + (k * Math.PI) / 3;
        c2d.strokeStyle = '#ffd573';
        c2d.lineWidth = 2.4;
        c2d.beginPath();
        c2d.moveTo(mx + Math.cos(ang) * mr, my + Math.sin(ang) * mr);
        c2d.lineTo(mx + Math.cos(ang) * (mr + 44), my + Math.sin(ang) * (mr + 44));
        c2d.stroke();
      }
    }

    c2d.fillStyle = 'rgba(4, 7, 13, 0.96)';
    c2d.strokeStyle =
      sizeStatus !== 'ok' ? '#ff9d5c' : this.servoLocked || masked ? palette.lockHex : palette.accentHex;
    c2d.lineWidth = this.servoLocked ? 2.5 : 1.7;
    c2d.beginPath();
    c2d.arc(mx, my, mr, 0, Math.PI * 2);
    c2d.fill();
    c2d.stroke();

    if (this.servoLocked) {
      const frac = clamp(this.servoHoldSec / this.servoMaxSec, 0, 1);
      c2d.strokeStyle = sizeStatus === 'ok' ? palette.lockHex : '#ff9d5c';
      c2d.lineWidth = 2.4;
      c2d.beginPath();
      c2d.arc(mx, my, mr + 8, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * frac);
      c2d.stroke();

      c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = sizeStatus === 'ok' ? palette.lockHex : '#ff9d5c';
      c2d.textAlign = 'center';
      c2d.fillText('AUTO-TRACK', mx, my + 3);
      if (sizeStatus !== 'ok') {
        c2d.fillText(
          sizeStatus === 'too_small' ? 'GLARE LEAK — WIDEN' : 'TOO WIDE — HIDING INNER ORBIT',
          mx,
          my + mr + 22
        );
      }
    } else if (this.stageClearTimer <= 0) {
      c2d.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      c2d.setLineDash([4, 4]);
      c2d.beginPath();
      c2d.arc(sx, sy, 26, 0, Math.PI * 2);
      c2d.stroke();
    }
    c2d.restore();

    if (this.stage >= 2) {
      const strip = layoutVernierRow(w, h, [
        {
          key: 'size',
          label: 'MASK RADIUS',
          val01: this.maskSize01,
          locked: sizeStatus === 'ok',
        },
      ])[0];
      this.sizeStrip = strip;
      drawVernierStrip(c2d, strip, palette.accentHex, palette.lockHex);
    } else {
      this.sizeStrip = null;
    }

    drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, palette.lockHex);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Space coronagraphs block a host star’s photosphere with a servo-tracked occulting mask; clicking planets leaves the mask locked steadily on the star.',
      goalSummary: 'Snap the mask onto the host star to lock Auto-Track, size Mask Radius cleanly on Stages 2–3, and click revealed exoplanets.',
      controlsDesktop: 'Drag mask onto star glare (locks Auto-Track), tune MASK RADIUS (or scroll wheel), and click planets.',
      controlsTouch: 'Touch-drag the black disk onto the star glare, then tap revealed exoplanets.',
      warmthEffect: 'Warm H% widens servo lock capture; Cold H% sharpens pinpoint occultation tolerances.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        this.maskSize01 = 0.48;
        this.servoLocked = true;
        this.servoHoldSec = this.servoMaxSec;
        for (const p of this.planets) p.found = true;
        if (stage < 3) this.setupStage((stage + 1) as 2 | 3);
        else this.finishSuccess();
      },
      getDiagnostics: () => ({
        stage: this.stage,
        completed: this.completed,
        stageProgress: this.completed
          ? 1
          : (this.stage - 1 + this.planets.filter((p) => p.found).length / Math.max(1, this.planets.length)) / 3,
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
