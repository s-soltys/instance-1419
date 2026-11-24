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
 * BIN-14 — Binary Star Mass Scale
 * Clear unequal-mass Cosmic Seesaw across a central + fulcrum:
 * Stage 1: Direct drag of a 2.0 M☉ cyan companion vs 1.0 M☉ star (r1 = 2*r2, 0 sliders).
 * Stage 2: Known black hole track shown — tune DARK MASS (M2) to match wobble + ghost cadence star.
 * Stage 3: Drag companion DISTANCE + tune DARK MASS against observed wobble & Keplerian cadence.
 */
export class BinaryMassScaleGame implements IMinigame {
  readonly id = 'binary_mass_scale';
  readonly title = 'BINARY STAR MASS SCALE';
  readonly subtitle = 'Cosmic Barycenter Seesaw';
  readonly instrumentCode = 'BIN-14';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private targetDist = 0.55;
  private targetMass = 0.75;
  private userDist = 0.22;
  private userMass = 0.75;

  private phaseUser = 0;
  private phaseTarget = 0;

  private dragMode: 'companion' | 'dist' | 'mass' | null = null;
  private strips: VernierStripSpec[] = [];
  private lockHoldSec = 0;
  private readonly lockHoldTargetSec = 0.5;
  private stageFlash = 0;
  private stageFlashText = '';
  private ambientStars = generateAmbientStars(createSeededRng('bin-stars'), 44);
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
    const rng = createSeededRng(`${this.ctx.targetId}:bin:${this.ctx.state.shift}:${stage}`);

    this.targetDist = stage === 1 ? 0.48 + rng() * 0.26 : 0.34 + rng() * 0.44;
    // Stage 1 uses distinct unequal mass (2.0 M_sun!) so primary wobble radius is visibly 2x companion orbit!
    this.targetMass = stage === 1 ? 0.75 : 0.25 + rng() * 0.58;

    this.userDist = stage === 2 ? this.targetDist : this.targetDist > 0.5 ? 0.16 : 0.86;
    this.userMass = stage === 1 ? 0.75 : this.targetMass > 0.5 ? 0.18 : 0.84;
  }

  private getMassSolar(mass01: number): number {
    return lerp(0.5, 2.5, mass01);
  }

  private computeWobbleRadius(dist01: number, mass01: number): number {
    const m2 = this.getMassSolar(mass01);
    const r2 = lerp(0.08, 0.22, dist01);
    return clamp(m2 * r2 * 0.88, 0.04, 0.29);
  }

  private computeKeplerOmega(dist01: number, mass01: number): number {
    const rTotal = lerp(0.55, 1.35, dist01);
    const mTotal = 1.0 + this.getMassSolar(mass01);
    return clamp(0.85 * Math.sqrt(mTotal / Math.pow(rTotal, 2.2)), 0.55, 3.0);
  }

  private computeMatch01(): number {
    const dErr = this.stage === 2 ? 0 : Math.abs(this.userDist - this.targetDist);
    const mErr = this.stage === 1 ? 0 : Math.abs(this.userMass - this.targetMass);
    const rErr = Math.abs(
      this.computeWobbleRadius(this.userDist, this.userMass) -
        this.computeWobbleRadius(this.targetDist, this.targetMass)
    );
    const count = this.stage === 3 ? 3 : 2;
    const avg = (dErr + mErr + rErr * 2.0) / count;
    return clamp(1 - avg / 0.28, 0, 1);
  }

  private bindEvents(): void {
    const onResize = () => {
      this.c2d = setupFullRetinaCanvas(this.canvas);
    };

    const onDown = (e: PointerEvent) => {
      if (this.completed) return;
      this.canvas.setPointerCapture(e.pointerId);
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      for (const s of this.strips) {
        if (hitVernierStrip(s, px, py)) {
          this.dragMode = s.key as 'dist' | 'mass';
          const targ = s.key === 'dist' ? this.targetDist : this.targetMass;
          const v = valueFromStripX(s, px, targ);
          if (s.key === 'dist') this.userDist = v;
          if (s.key === 'mass') this.userMass = v;
          platform.triggerHaptic('vernierTick', 0.45);
          return;
        }
      }

      if (this.stage !== 2) {
        const w = Math.max(1, rect.width);
        const h = Math.max(1, rect.height);
        const r = Math.hypot(px - w * 0.5, py - h * 0.45) / Math.min(w, h);
        this.dragMode = 'companion';
        this.userDist = clamp((r - 0.08) / 0.14, 0, 1);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!this.dragMode || this.completed) return;
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      if (this.dragMode === 'companion') {
        const r = Math.hypot(px - rect.width * 0.5, py - rect.height * 0.45) / Math.min(rect.width, rect.height);
        let nextD = clamp((r - 0.08) / 0.14, 0, 1);
        if (Math.abs(nextD - this.targetDist) < 0.065) nextD = lerp(nextD, this.targetDist, 0.45);
        this.userDist = nextD;
      } else {
        const s = this.strips.find((item) => item.key === this.dragMode);
        if (!s) return;
        const targ = s.key === 'dist' ? this.targetDist : this.targetMass;
        const v = valueFromStripX(s, px, targ);
        if (s.key === 'dist') this.userDist = v;
        if (s.key === 'mass') this.userMass = v;
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

    this.phaseUser += dt * this.computeKeplerOmega(this.userDist, this.userMass);
    this.phaseTarget += dt * this.computeKeplerOmega(this.targetDist, this.targetMass);

    const match = this.computeMatch01();
    const tol = this.ctx.state.humanity >= 45 ? 0.85 : 0.89;
    if (match >= tol) {
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        platform.triggerHaptic('phaseSnapLock', 0.95);
        this.ctx.audio?.playPhaseLock?.(this.stage);
        if (this.stage < 3) {
          this.stageFlash = 1;
          this.stageFlashText = `BARYCENTER ${this.stage}/3 WEIGHED`;
          this.setupStage((this.stage + 1) as 2 | 3);
        } else {
          this.finishSuccess();
        }
      }
    } else {
      this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.6);
    }

    this.emitHud(match);
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
        `${this.ctx.targetId}_binary`,
        `Dark companion distance & stellar mass balanced on the cosmic seesaw for ${this.ctx.targetName}.`,
        `Mass Balance 96% · ${totalSec.toFixed(1)}s`,
        'Binary Keplerian Seesaw & Invisible Companion Weighing'
      )
    );
  }

  private emitHud(match = this.computeMatch01()): void {
    const prompt =
      this.stage === 1
        ? 'Drag the 2.0 M☉ cyan companion star inward/outward until the 1.0 M☉ star’s wobble hugs the dashed ring.'
        : this.stage === 2
        ? 'Black hole track shown — tune DARK MASS (M₂) until both the wobble ring AND ghost star cadence match.'
        : 'Drag companion DISTANCE onto the faint lensing track & tune DARK MASS (M₂) to sync wobble + ghost cadence.';

    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: stageLabel(this.stage),
      stageProgress: clamp((this.stage - 1 + match) / 3, 0, 1),
      promptText: prompt,
      actionButton: null,
    });
  }

  private render(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const c2d = this.c2d;
    const palette = getCosmicPalette(this.ctx.state.humanity);
    const match = this.computeMatch01();
    const compact = h < 450;

    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'smacs',
      blurPx: 4,
      alpha: 0.45,
      brightness: 0.78,
      tintAlpha: 0.46,
      gridAlpha: palette.mode === 'cold' ? 0.14 : 0.05,
    });
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, 0.76);

    const cx = w * 0.5;
    const cy = compact ? h * 0.42 : h * 0.45;
    const scale = Math.min(w, h);
    const theta = this.phaseUser;

    const rT = this.computeWobbleRadius(this.targetDist, this.targetMass) * scale;
    const rU = this.computeWobbleRadius(this.userDist, this.userMass) * scale;
    const rCompT = lerp(0.08, 0.22, this.targetDist) * scale;
    const rCompU = lerp(0.08, 0.22, this.userDist) * scale;
    const m2Solar = this.getMassSolar(this.userMass);

    if (this.stage >= 2) {
      c2d.save();
      c2d.strokeStyle = 'rgba(164, 144, 255, 0.35)';
      c2d.setLineDash([4, 6]);
      c2d.lineWidth = 1.4;
      c2d.beginPath();
      c2d.arc(cx, cy, rCompT, 0, Math.PI * 2);
      c2d.stroke();
      c2d.restore();
    }

    // Observed star wobble orbit (dashed) + hollow ghost cadence star & arc trail
    c2d.save();
    c2d.strokeStyle = 'rgba(255, 255, 255, 0.46)';
    c2d.setLineDash([5, 5]);
    c2d.lineWidth = 2;
    c2d.beginPath();
    c2d.arc(cx, cy, rT, 0, Math.PI * 2);
    c2d.stroke();

    if (this.stage >= 2) {
      c2d.setLineDash([]);
      c2d.strokeStyle = 'rgba(255, 224, 148, 0.32)';
      c2d.lineWidth = 3;
      c2d.beginPath();
      c2d.arc(cx, cy, rT, this.phaseTarget - 0.5, this.phaseTarget);
      c2d.stroke();

      const gx = cx + Math.cos(this.phaseTarget) * rT;
      const gy = cy + Math.sin(this.phaseTarget) * rT;
      c2d.strokeStyle = 'rgba(255, 232, 165, 0.85)';
      c2d.lineWidth = 1.8;
      c2d.beginPath();
      c2d.arc(gx, gy, 7, 0, Math.PI * 2);
      c2d.stroke();
    }

    // Model wobble orbit
    c2d.setLineDash([]);
    c2d.strokeStyle = match >= 0.85 ? palette.lockHex : palette.accentHex;
    c2d.lineWidth = 2.2;
    c2d.beginPath();
    c2d.arc(cx, cy, rU, 0, Math.PI * 2);
    c2d.stroke();
    c2d.restore();

    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    const starX = cx + ux * rU;
    const starY = cy + uy * rU;
    const compX = cx - ux * rCompU;
    const compY = cy - uy * rCompU;

    // Cosmic Seesaw Lever Arm through central + fulcrum
    c2d.save();
    c2d.strokeStyle = match >= 0.85 ? palette.lockHex : palette.accentHex;
    c2d.globalAlpha = 0.72;
    c2d.lineWidth = 2.4;
    c2d.beginPath();
    c2d.moveTo(starX, starY);
    c2d.lineTo(compX, compY);
    c2d.stroke();

    // Central Fulcrum Triangle + Live Torque Readout
    c2d.globalAlpha = 0.92;
    c2d.fillStyle = palette.secondaryHex;
    c2d.beginPath();
    c2d.moveTo(cx, cy - 6);
    c2d.lineTo(cx - 5, cy + 5);
    c2d.lineTo(cx + 5, cy + 5);
    c2d.closePath();
    c2d.fill();

    // Outward-offset mass labels so text never overlaps star spikes
    c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = palette.secondaryHex;
    c2d.textAlign = 'center';
    c2d.fillText('1.0 M☉', starX + ux * 26, starY + uy * 26 + 3);
    c2d.fillText(`${m2Solar.toFixed(1)} M☉`, compX - ux * 28, compY - uy * 28 + 3);
    c2d.restore();

    drawDiffractionStar(c2d, starX, starY, 10, '#ffd98a', { spikes: 6, glowAlpha: 0.95 });

    // Companion: glowing 2.0 M☉ cyan star in Stage 1, scaled Black Hole + glowing lensing halo in Stages 2–3
    if (this.stage === 1) {
      drawDiffractionStar(c2d, compX, compY, 8.5, '#9ee8ff', { spikes: 4, glowAlpha: 0.92 });
      c2d.save();
      c2d.strokeStyle = 'rgba(158, 232, 255, 0.55)';
      c2d.setLineDash([3, 3]);
      c2d.beginPath();
      c2d.arc(compX, compY, 18, 0, Math.PI * 2);
      c2d.stroke();
      c2d.restore();
    } else {
      const bhR = lerp(8, 21, this.userMass);
      c2d.save();
      const bhGlow = c2d.createRadialGradient(compX, compY, bhR * 0.8, compX, compY, bhR * 2.1);
      bhGlow.addColorStop(0, 'rgba(179, 156, 255, 0.55)');
      bhGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c2d.fillStyle = bhGlow;
      c2d.beginPath();
      c2d.arc(compX, compY, bhR * 2.1, 0, Math.PI * 2);
      c2d.fill();

      c2d.fillStyle = '#04060c';
      c2d.strokeStyle = Math.abs(this.userMass - this.targetMass) <= 0.08 ? palette.lockHex : '#b39cff';
      c2d.lineWidth = 2.2;
      c2d.beginPath();
      c2d.arc(compX, compY, bhR, 0, Math.PI * 2);
      c2d.fill();
      c2d.stroke();
      c2d.restore();
    }

    const items: Array<{ key: string; label: string; val01: number; locked?: boolean; rightText?: string }> = [];
    if (this.stage === 3) {
      items.push({
        key: 'dist',
        label: 'DISTANCE (r₂)',
        val01: this.userDist,
        locked: Math.abs(this.userDist - this.targetDist) <= 0.075,
      });
    }
    if (this.stage >= 2) {
      items.push({
        key: 'mass',
        label: 'DARK MASS (M₂)',
        val01: this.userMass,
        locked: Math.abs(this.userMass - this.targetMass) <= 0.075,
        rightText: `${m2Solar.toFixed(2)} M☉`,
      });
    }
    this.strips = items.length > 0 ? layoutVernierRow(w, h, items) : [];
    for (const s of this.strips) drawVernierStrip(c2d, s, palette.accentHex, palette.lockHex);

    if (this.lockHoldSec > 0.02) {
      drawLockResonanceRing(c2d, cx, cy, 46, this.lockHoldSec / this.lockHoldTargetSec, palette.lockHex);
    }
    drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, palette.lockHex);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'A star and unseen black hole orbit a shared fulcrum (m₁r₁ = m₂r₂) at an orbital tempo governed by Kepler’s 3rd Law; reading the star’s wobble and cadence reveals the dark companion’s mass.',
      goalSummary: 'Balance companion distance and Dark Mass until your star’s wobble orbit and cadence match the dashed observed ring.',
      controlsDesktop: 'Drag companion star radially on Stages 1 & 3; adjust DARK MASS (M₂) below on Stages 2–3.',
      controlsTouch: 'Touch-drag the companion orbit and slide DARK MASS (M₂) below.',
      warmthEffect: 'Warm H% gives generous barycentric snap tolerances; Cold H% sharpens Keplerian precision.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        this.userDist = this.targetDist;
        this.userMass = this.targetMass;
        if (stage < 3) this.setupStage((stage + 1) as 2 | 3);
        else this.finishSuccess();
      },
      getDiagnostics: () => ({
        stage: this.stage,
        completed: this.completed,
        stageProgress: this.completed ? 1 : (this.stage - 1 + this.computeMatch01()) / 3,
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
