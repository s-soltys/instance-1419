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
import { angleDiffRad, clamp, createSeededRng, lerp, resolveInstrumentPayout } from './tactilePhysics';
import type {
  IMinigame,
  InstrumentFieldGuide,
  MinigameContext,
  SolvabilityHarness,
} from './types';

interface StarKnot {
  idx: number;
  angle: number;
  orbitFrac: number;
  pitchHz: number;
  catchFlash: number;
  wrongFlash: number;
}

/**
 * PLS-03 — Pulsar Beacon Timing
 * Orbiting star-knots suspended along a luminous accretion ring around a spinning neutron star.
 * Tap/click or press Space when the rotating pulsar beam sweeps across the glowing star-knot!
 */
export class PulsarEchoGame implements IMinigame {
  readonly id = 'pulsar_echo';
  readonly title = 'PULSAR BEACON TIMING';
  readonly subtitle = 'Accretion Ring & Jet Sync';
  readonly instrumentCode = 'PLS-03';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private knots: StarKnot[] = [];
  private activeKnotIdx = 0;
  private catches = 0;
  private catchesNeeded = 3;
  private beamAngle = -Math.PI * 0.85;
  private sweepDir: 1 | -1 = 1;
  private reversalTelegraph = 0;
  private stageClearTimer = 0;
  private stageFlash = 0;
  private stageFlashText = '';
  private catchShock = 0;
  private wrongTapCount = 0;
  private rng = createSeededRng('pls-init');
  private ambientStars = generateAmbientStars(createSeededRng('pls-stars'), 48);
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
    this.catches = 0;
    this.catchesNeeded = stage === 1 ? 3 : stage === 2 ? 4 : 5;
    this.sweepDir = 1;
    this.reversalTelegraph = 0;
    this.stageClearTimer = 0;
    this.rng = createSeededRng(`${this.ctx.targetId}:pls:${this.ctx.state.shift}:${stage}`);

    const knotCount = stage === 1 ? 4 : stage === 2 ? 5 : 6;
    const basePitches = [261.6, 329.6, 392.0, 440.0, 523.3, 659.3];
    const span = (Math.PI * 2) / knotCount;
    const baseRot = this.rng() * 0.6;

    this.knots = [];
    for (let i = 0; i < knotCount; i++) {
      this.knots.push({
        idx: i,
        angle: -Math.PI / 2 + baseRot + i * span,
        orbitFrac: i % 2 === 0 ? 0.92 : 0.78,
        pitchHz: basePitches[i % basePitches.length],
        catchFlash: 0,
        wrongFlash: 0,
      });
    }

    this.activeKnotIdx = Math.floor(this.rng() * knotCount);
    const targetKnot = this.knots[this.activeKnotIdx];
    this.beamAngle = targetKnot.angle - 1.05;
  }

  private getBeamClosestDiff(knot: StarKnot): number {
    const d1 = Math.abs(angleDiffRad(this.beamAngle, knot.angle));
    if (this.stage === 1) return d1;
    const d2 = Math.abs(angleDiffRad(this.beamAngle + Math.PI, knot.angle));
    return Math.min(d1, d2);
  }

  private isBeamOnKnot(knot: StarKnot): boolean {
    const tol = this.ctx.state.humanity >= 45 ? 0.34 : 0.26;
    return this.getBeamClosestDiff(knot) <= tol;
  }

  private getGeometry(w: number, h: number) {
    const compact = h < 450;
    const orbitR = Math.min(w * 0.3, compact ? h * 0.35 : h * 0.33);
    return {
      cx: w * 0.5,
      cy: compact ? h * 0.48 : h * 0.5,
      orbitR,
    };
  }

  private pickNextTarget(): void {
    const n = this.knots.length;
    if (n <= 1) return;
    let next = Math.floor(this.rng() * n);
    if (next === this.activeKnotIdx) next = (next + 1 + Math.floor(this.rng() * (n - 1))) % n;
    this.activeKnotIdx = next;
  }

  private bindEvents(): void {
    const onResize = () => {
      this.c2d = setupFullRetinaCanvas(this.canvas);
    };

    const triggerCapture = () => {
      if (this.completed || this.stageClearTimer > 0) return;
      const target = this.knots[this.activeKnotIdx];
      if (!target) return;

      if (this.isBeamOnKnot(target)) {
        target.catchFlash = 1;
        this.catchShock = 1;
        this.catches += 1;
        const pan = clamp(Math.cos(target.angle) * 0.7, -0.8, 0.8);
        this.ctx.audio?.playStereoSonarEcho(pan, 0.14, target.pitchHz);
        this.ctx.audio?.playTumblerClick(0.85, true);
        platform.triggerHaptic('vernierTick', 0.82);

        if (this.stage === 3 && this.catches % 2 === 0 && this.catches < this.catchesNeeded) {
          this.reversalTelegraph = 1.0;
          this.ctx.audio?.playSolenoidClack(true);
        }

        if (this.catches >= this.catchesNeeded) {
          this.stageClearTimer = 0.65;
          this.stageFlash = 1;
          this.stageFlashText =
            this.stage === 3 ? 'RELATIVISTIC JETS SYNCHRONIZED' : `BEACON BANK ${this.stage}/3 CAUGHT`;
          this.ctx.audio?.playPhaseLock?.(this.stage);
          platform.triggerHaptic('phaseSnapLock', 0.95);
        } else {
          this.pickNextTarget();
        }
        this.emitHud();
      } else {
        target.wrongFlash = 1;
        this.wrongTapCount += 1;
        this.ctx.audio?.playSolenoidClack(false);
        platform.triggerHaptic('rejectThud', 0.65);
        this.emitHud('Wait until the sweeping starlight beam crosses the glowing star-knot!');
      }
    };

    const onDown = () => triggerCapture();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        triggerCapture();
      }
    };

    window.addEventListener('resize', onResize);
    this.canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKeyDown);
    this.unbind = () => {
      window.removeEventListener('resize', onResize);
      this.canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }

  private update(dt: number): void {
    if (this.completed) return;
    this.elapsedSec += dt;
    this.stageFlash = Math.max(0, this.stageFlash - dt * 1.4);
    this.catchShock = Math.max(0, this.catchShock - dt * 2.2);

    if (this.reversalTelegraph > 0) {
      this.reversalTelegraph -= dt;
      if (this.reversalTelegraph <= 0) {
        this.reversalTelegraph = 0;
        this.sweepDir = this.sweepDir === 1 ? -1 : 1;
      }
    }

    const baseSpeed = this.stage === 1 ? 0.88 : this.stage === 2 ? 1.22 : 1.48;
    const speedFactor = this.reversalTelegraph > 0 ? 0.32 : 1;
    if (this.stageClearTimer <= 0) {
      this.beamAngle += dt * baseSpeed * speedFactor * this.sweepDir;
    }

    for (const k of this.knots) {
      k.catchFlash = Math.max(0, k.catchFlash - dt * 2.0);
      k.wrongFlash = Math.max(0, k.wrongFlash - dt * 2.1);
    }

    const total = clamp((this.stage - 1 + this.catches / Math.max(1, this.catchesNeeded)) / 3, 0, 1);
    this.ctx.showcase?.applyInstrumentPatch({
      progress: total,
      jetResonance: total,
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

    const acc = clamp(1 - this.wrongTapCount * 0.04, 0.72, 1.0);
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.ctx.onComplete(
      resolveInstrumentPayout(
        'clean',
        totalSec,
        acc,
        `${this.ctx.targetId}_pulsar`,
        `Rotational radio beacon synced across 3 accretion banks on ${this.ctx.targetName}. Twin jets ignited.`,
        `Sync Precision ${(acc * 100).toFixed(0)}% · ${totalSec.toFixed(1)}s`,
        'Magnetized Neutron Star Lighthouse & Accretion Knot Timing'
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
        ? `Tap or press Space when the pulsar beam sweeps across the glowing star-knot (${this.catches}/${this.catchesNeeded}).`
        : this.stage === 2
        ? `Catch either opposite lighthouse beam passing through the active star-knot (${this.catches}/${this.catchesNeeded}).`
        : `Watch for amber spin-reversal telegraphs — sync the active star-knots (${this.catches}/${this.catchesNeeded}).`;

    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: labelMap[this.stage],
      stageProgress: clamp((this.stage - 1 + this.catches / Math.max(1, this.catchesNeeded)) / 3, 0, 1),
      promptText: overridePrompt ?? defaultPrompt,
      actionButton: null,
    });
  }

  private render(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const c2d = this.c2d;
    const palette = getCosmicPalette(this.ctx.state.humanity);
    const overall = clamp((this.stage - 1 + this.catches / Math.max(1, this.catchesNeeded)) / 3, 0, 1);

    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'hudf',
      blurPx: lerp(6, 0, overall),
      alpha: lerp(0.55, 0.92, overall),
      brightness: lerp(0.84, 1.14, overall),
      scale: 1.03,
      tintAlpha: 0.38,
      gridAlpha: palette.mode === 'cold' ? 0.14 : 0.05,
    });
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, 0.88);

    const { cx, cy, orbitR } = this.getGeometry(w, h);
    const activeTarget = this.knots[this.activeKnotIdx];
    const inZone = activeTarget ? this.isBeamOnKnot(activeTarget) : false;

    // Luminous nebula accretion ring connecting orbiting knots cleanly (zero boxy pie wedges!)
    c2d.save();
    for (const rMul of [0.78, 0.92]) {
      c2d.strokeStyle = `rgba(${palette.accentRgb}, 0.18)`;
      c2d.lineWidth = rMul === 0.92 ? 2.2 : 1.2;
      c2d.beginPath();
      c2d.arc(cx, cy, orbitR * rMul, 0, Math.PI * 2);
      c2d.stroke();
    }
    c2d.restore();

    // Sweeping light-cones
    c2d.save();
    const coneSpread = this.stage === 3 ? 0.15 : 0.11;
    const coneLen = this.stage === 3 ? Math.max(w, h) * 0.56 : orbitR * 1.25;
    const drawCone = (ang: number) => {
      const g = c2d.createRadialGradient(cx, cy, 8, cx, cy, coneLen);
      g.addColorStop(0, inZone ? `rgba(${palette.lockRgb}, 0.65)` : `rgba(${palette.accentRgb}, 0.36)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c2d.fillStyle = g;
      c2d.beginPath();
      c2d.moveTo(cx, cy);
      c2d.arc(cx, cy, coneLen, ang - coneSpread, ang + coneSpread);
      c2d.closePath();
      c2d.fill();
    };
    drawCone(this.beamAngle);
    if (this.stage >= 2) drawCone(this.beamAngle + Math.PI);
    c2d.restore();

    // Draw orbiting accretion star-knots
    for (const knot of this.knots) {
      const rPx = orbitR * knot.orbitFrac;
      const kx = cx + Math.cos(knot.angle) * rPx;
      const ky = cy + Math.sin(knot.angle) * rPx;
      const isTarget = knot.idx === this.activeKnotIdx && this.stageClearTimer <= 0;

      if (knot.wrongFlash > 0.05) {
        drawDiffractionStar(c2d, kx, ky, 11, '#ff8652', { spikes: 6, glowAlpha: 0.92 });
      } else if (knot.catchFlash > 0.08) {
        drawDiffractionStar(c2d, kx, ky, 15, palette.lockHex, { spikes: 6, glowAlpha: 1 });
      } else if (isTarget) {
        const diff = this.getBeamClosestDiff(knot);
        const closeness = clamp(1 - diff / 1.4, 0, 1);
        const starCol = inZone ? palette.lockHex : palette.accentHex;
        drawDiffractionStar(c2d, kx, ky, inZone ? 14 : 11, starCol, {
          spikes: 6,
          glowAlpha: inZone ? 1 : 0.85,
          rotationRad: this.elapsedSec * 0.6,
        });

        // Shrinking timing halo ring contracting smoothly onto star as beam arrives!
        const shrinkR = lerp(42, 16, closeness);
        c2d.save();
        c2d.strokeStyle = starCol;
        c2d.lineWidth = inZone ? 2.8 : 1.6;
        c2d.globalAlpha = 0.45 + closeness * 0.55;
        c2d.beginPath();
        c2d.arc(kx, ky, shrinkR, 0, Math.PI * 2);
        c2d.stroke();
        c2d.restore();
      } else {
        drawDiffractionStar(c2d, kx, ky, 6.5, '#a8c6e8', { spikes: 4, glowAlpha: 0.45 });
      }
    }

    if (this.catchShock > 0.02) {
      c2d.save();
      c2d.strokeStyle = palette.lockHex;
      c2d.globalAlpha = this.catchShock * 0.7;
      c2d.lineWidth = 2.5;
      c2d.beginPath();
      c2d.arc(cx, cy, orbitR * (0.28 + (1 - this.catchShock) * 0.8), 0, Math.PI * 2);
      c2d.stroke();
      c2d.restore();
    }

    // Central spinning neutron star core & sweeping beam line
    c2d.save();
    const coreGrad = c2d.createRadialGradient(cx, cy, 2, cx, cy, orbitR * 0.34);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.35, inZone ? palette.lockHex : this.reversalTelegraph > 0 ? '#ff986b' : palette.secondaryHex);
    coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
    c2d.fillStyle = coreGrad;
    c2d.beginPath();
    c2d.arc(cx, cy, orbitR * 0.34, 0, Math.PI * 2);
    c2d.fill();

    const drawBeam = (ang: number) => {
      c2d.strokeStyle = inZone ? palette.lockHex : '#ffffff';
      c2d.lineWidth = inZone ? 3.2 : 2.2;
      c2d.shadowColor = c2d.strokeStyle;
      c2d.shadowBlur = 12;
      c2d.beginPath();
      c2d.moveTo(cx, cy);
      c2d.lineTo(cx + Math.cos(ang) * (orbitR * 1.12), cy + Math.sin(ang) * (orbitR * 1.12));
      c2d.stroke();
    };
    drawBeam(this.beamAngle);
    if (this.stage >= 2) drawBeam(this.beamAngle + Math.PI);

    // Clear reversal telegraph ring in Stage 3
    if (this.reversalTelegraph > 0) {
      c2d.shadowBlur = 0;
      c2d.strokeStyle = '#ff986b';
      c2d.lineWidth = 2.4;
      c2d.beginPath();
      c2d.arc(cx, cy, orbitR * 0.42, 0, Math.PI * 2);
      c2d.stroke();
    }
    c2d.restore();

    drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, palette.lockHex);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Magnetized neutron stars sweep lighthouse beams through orbiting accretion knots—resonant surges occur when the beam aligns with a dust-star knot.',
      goalSummary:
        'Tap/click or press Space right as the sweeping beam crosses the glowing star-knot with the contracting timing ring.',
      controlsDesktop: 'Click anywhere or press Space when the beam hits the glowing star-knot.',
      controlsTouch: 'Tap anywhere when the shrinking ring closes around the lit star-knot.',
      warmthEffect: 'Warm H% gives wider amber catch windows; Cold H% demands tighter pulse sync.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        this.catches = this.catchesNeeded;
        if (stage < 3) {
          this.setupStage((stage + 1) as 2 | 3);
        } else {
          this.finishSuccess();
        }
      },
      getDiagnostics: () => ({
        stage: this.stage,
        completed: this.completed,
        stageProgress: this.completed ? 1 : (this.stage - 1 + this.catches / Math.max(1, this.catchesNeeded)) / 3,
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
