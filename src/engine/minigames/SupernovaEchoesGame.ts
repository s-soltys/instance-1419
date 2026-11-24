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

interface DustPatchArc {
  angle: number;
  span: number;
  speedMul: number;
  phaseOffset: number;
  isDecoy: boolean;
  cloudDistNorm: number;
}

/**
 * ECH-16 — Supernova Light-Echoes
 * Vivid dust patches glow cyan-white as expanding echoes pass; continuous golden compass reference circles +
 * TEST PING normal rays reveal true curvature; Stages 2–3 include a true t=0 sweet-spot focus in REWIND EPOCH!
 */
export class SupernovaEchoesGame implements IMinigame {
  readonly id = 'supernova_echoes';
  readonly title = 'SUPERNOVA LIGHT-ECHOES';
  readonly subtitle = 'Light-Echo Triangulation & Blast Rewind';
  readonly instrumentCode = 'ECH-16';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private phase: 'locate' | 'rewind' = 'locate';
  private epicenterNx = 0.5;
  private epicenterNy = 0.5;
  private decoyNx = 0.25;
  private decoyNy = 0.25;
  private compassNx = 0.5;
  private compassNy = 0.5;
  private arcs: DustPatchArc[] = [];

  private pingActive = false;
  private pingProgress01 = 0;
  private normalRayFlash = 0;
  private rewindVal = 1.0; // t = 0.0 sits at 0.26; sliding past 0.26 -> 0 over-collapses/inverts shells!
  private readonly rewindTargetVal = 0.26;
  private rewindStrip: VernierStripSpec | null = null;
  private dragMode: 'compass' | 'rewind' | null = null;

  private lockHoldSec = 0;
  private readonly lockHoldTargetSec = 0.55;
  private stageFlash = 0;
  private stageFlashText = '';
  private ambientStars = generateAmbientStars(createSeededRng('ech-stars'), 46);
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
    this.phase = 'locate';
    this.lockHoldSec = 0;
    this.rewindVal = 1.0;
    this.pingActive = false;
    this.pingProgress01 = 0;
    this.normalRayFlash = 0;
    const rng = createSeededRng(`${this.ctx.targetId}:ech:${this.ctx.state.shift}:${stage}`);

    this.epicenterNx = 0.34 + rng() * 0.32;
    this.epicenterNy = 0.32 + rng() * 0.24;
    this.compassNx = 0.5;
    this.compassNy = 0.5;
    if (Math.hypot(this.compassNx - this.epicenterNx, this.compassNy - this.epicenterNy) < 0.14) {
      this.epicenterNx = 0.33;
      this.epicenterNy = 0.34;
    }

    this.decoyNx = 0.72;
    this.decoyNy = 0.62;

    const realCount = stage === 1 ? 3 : 4;
    this.arcs = [];
    for (let i = 0; i < realCount; i++) {
      this.arcs.push({
        angle: (i * Math.PI * 2) / realCount + rng() * 0.45,
        span: 0.7 - stage * 0.07,
        speedMul: 1,
        phaseOffset: i * 0.18,
        isDecoy: false,
        cloudDistNorm: 0.35 + rng() * 0.42,
      });
    }
    if (stage === 3) {
      this.arcs.push({
        angle: -Math.PI * 0.68,
        span: 0.55,
        speedMul: 0.82,
        phaseOffset: 0.4,
        isDecoy: true,
        cloudDistNorm: 0.48,
      });
    }
  }

  onHelperAction(actionId: string): void {
    if (actionId === 'emit_ping' && !this.completed && this.phase === 'locate') {
      this.triggerPing();
    }
  }

  private triggerPing(): void {
    this.pingActive = true;
    this.pingProgress01 = 0;
    this.normalRayFlash = 1.0;
    this.ctx.audio?.playStereoSonarEcho?.((this.compassNx - 0.5) * 1.4, 0.35, 360);
    platform.triggerHaptic('vernierTick', 0.6);
  }

  private isEpicenterLocked(): boolean {
    const tol = this.ctx.state.humanity >= 45 ? 0.062 : 0.044;
    return Math.hypot(this.compassNx - this.epicenterNx, (this.compassNy - this.epicenterNy) * 0.72) <= tol;
  }

  private isRewindFocused(): boolean {
    return Math.abs(this.rewindVal - this.rewindTargetVal) <= 0.065;
  }

  private bindEvents(): void {
    const onResize = () => {
      this.c2d = setupFullRetinaCanvas(this.canvas);
    };

    const moveCompass = (clientX: number, clientY: number) => {
      const rect = this.canvas.getBoundingClientRect();
      this.compassNx = clamp((clientX - rect.left) / Math.max(1, rect.width), 0.12, 0.88);
      this.compassNy = clamp((clientY - rect.top) / Math.max(1, rect.height), 0.18, 0.8);
    };

    const onDown = (e: PointerEvent) => {
      if (this.completed) return;
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      if (this.phase === 'rewind' && this.rewindStrip && hitVernierStrip(this.rewindStrip, px, py)) {
        this.canvas.setPointerCapture(e.pointerId);
        this.dragMode = 'rewind';
        this.rewindVal = valueFromStripX(this.rewindStrip, px, this.rewindTargetVal, 0.05);
        platform.triggerHaptic('vernierTick', 0.45);
        return;
      }

      if (this.phase === 'locate') {
        this.canvas.setPointerCapture(e.pointerId);
        this.dragMode = 'compass';
        moveCompass(e.clientX, e.clientY);
        this.triggerPing();
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!this.dragMode || this.completed) return;
      const rect = this.canvas.getBoundingClientRect();
      if (this.dragMode === 'rewind' && this.rewindStrip) {
        this.rewindVal = valueFromStripX(this.rewindStrip, e.clientX - rect.left, this.rewindTargetVal, 0.05);
      } else if (this.dragMode === 'compass') {
        moveCompass(e.clientX, e.clientY);
      }
    };

    const onUp = () => {
      if (this.dragMode === 'compass' && this.phase === 'locate') {
        this.triggerPing();
      }
      this.dragMode = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && this.phase === 'locate') {
        e.preventDefault();
        this.triggerPing();
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
    this.normalRayFlash = Math.max(0, this.normalRayFlash - dt * 0.62);

    if (this.pingActive) {
      this.pingProgress01 += dt * 0.72;
      if (this.pingProgress01 >= 1) {
        this.pingActive = false;
        this.pingProgress01 = 0;
      }
    }

    if (this.phase === 'locate') {
      if (this.isEpicenterLocked()) {
        this.lockHoldSec += dt;
        if (this.lockHoldSec >= this.lockHoldTargetSec) {
          platform.triggerHaptic('phaseSnapLock', 0.95);
          this.ctx.audio?.playPhaseLock?.(this.stage);
          if (this.stage === 1) {
            this.stageFlash = 1;
            this.stageFlashText = 'SUPERNOVA ORIGIN 1/3 LOCATED';
            this.setupStage(2);
          } else {
            this.phase = 'rewind';
            this.lockHoldSec = 0;
            this.stageFlash = 1;
            this.stageFlashText = 'ORIGIN LOCKED · FOCUS REWIND AT t = 0';
          }
        }
      } else {
        this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.6);
      }
    } else if (this.phase === 'rewind') {
      if (this.isRewindFocused()) {
        this.lockHoldSec += dt;
        if (this.lockHoldSec >= 0.45) {
          platform.triggerHaptic('phaseSnapLock', 1.0);
          this.ctx.audio?.playPhaseLock?.(this.stage);
          if (this.stage < 3) {
            this.stageFlash = 1;
            this.stageFlashText = 'DETONATION EPOCH t=0 RESTORED';
            this.setupStage(3);
          } else {
            this.finishSuccess();
          }
        }
      } else {
        this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.5);
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
        `${this.ctx.targetId}_echoes`,
        `Concentric dust light-echo origin triangulated & rewound cleanly to detonation t=0 on ${this.ctx.targetName}.`,
        `Detonation Epicenter · ${totalSec.toFixed(1)}s`,
        'Supernova Light-Echo Curvature Ping & Temporal Wavefront Focus'
      )
    );
  }

  private emitHud(): void {
    const d = Math.hypot(this.compassNx - this.epicenterNx, this.compassNy - this.epicenterNy);
    const closeness = clamp(1 - d / 0.35, 0, 1);
    const tEpoch = lerp(-0.35, 1.0, this.rewindVal);
    let prompt = '';
    if (this.phase === 'rewind') {
      prompt =
        tEpoch < -0.08
          ? `OVER-COLLAPSED (t=${tEpoch.toFixed(2)}) — ease right back to the golden detonation t = 0.0 focus!`
          : 'Slide REWIND EPOCH until the shells focus cleanly onto t = 0.0 (avoid over-collapsing past 0!).';
    } else if (this.stage === 3) {
      prompt = 'Drag compass + fire TEST PING rays until reference rings run parallel to the 3 true arcs (ignore decoy).';
    } else {
      prompt = 'Drag Wavefront Compass & fire TEST PING ripples until your concentric rings match all glowing dust arcs.';
    }

    const rewindProg = 1 - clamp(Math.abs(this.rewindVal - this.rewindTargetVal) / 0.74, 0, 1);
    const stageFrac = this.stage === 1 ? closeness : this.phase === 'locate' ? closeness * 0.55 : 0.55 + rewindProg * 0.45;
    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: stageLabel(this.stage),
      stageProgress: clamp((this.stage - 1 + stageFrac) / 3, 0, 1),
      promptText: prompt,
      actionButton:
        this.phase === 'locate'
          ? { id: 'emit_ping', label: 'TEST PING (SPACE)', active: this.pingActive }
          : null,
    });
  }

  private render(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const c2d = this.c2d;
    const palette = getCosmicPalette(this.ctx.state.humanity);
    const locked = this.isEpicenterLocked();
    const maxR = Math.min(w, h) * 0.4;

    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'carina',
      blurPx: 4,
      alpha: 0.45,
      brightness: 0.78,
      tintAlpha: 0.46,
      gridAlpha: palette.mode === 'cold' ? 0.14 : 0.05,
    });
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, 0.76);

    // Vivid Dust Cloud Patches flaring cyan-white as echo waves cross them!
    c2d.save();
    for (const arc of this.arcs) {
      const cx = (arc.isDecoy ? this.decoyNx : this.epicenterNx) * w;
      const cy = (arc.isDecoy ? this.decoyNy : this.epicenterNy) * h;
      const cloudR = 34 + arc.cloudDistNorm * maxR;
      const px = cx + Math.cos(arc.angle) * cloudR;
      const py = cy + Math.sin(arc.angle) * cloudR;

      // Highlight patch glow dynamically with echo wave proximity
      const waveT = (this.elapsedSec * 0.33 * arc.speedMul + arc.phaseOffset) % 1;
      const waveR = 34 + waveT * maxR;
      const hitGlow = clamp(1 - Math.abs(waveR - cloudR) / 55, 0.25, 1);

      const grad = c2d.createRadialGradient(px, py, 2, px, py, 64);
      grad.addColorStop(
        0,
        arc.isDecoy ? `rgba(255, 180, 110, ${0.22 * hitGlow})` : `rgba(140, 215, 255, ${0.34 * hitGlow})`
      );
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c2d.fillStyle = grad;
      c2d.beginPath();
      c2d.arc(px, py, 64, 0, Math.PI * 2);
      c2d.fill();

      // Faint dashed perpendicular normal ray inward during TEST PING flash
      if (this.normalRayFlash > 0.05 && this.phase === 'locate' && !arc.isDecoy) {
        c2d.strokeStyle = 'rgba(255, 217, 138, 0.38)';
        c2d.globalAlpha = this.normalRayFlash * 0.48;
        c2d.setLineDash([4, 6]);
        c2d.beginPath();
        c2d.moveTo(px, py);
        c2d.lineTo(cx, cy);
        c2d.stroke();
        c2d.setLineDash([]);
        c2d.globalAlpha = 1;
      }

      if (this.phase === 'rewind' && !arc.isDecoy) {
        const tEpoch = lerp(-0.35, 1.0, this.rewindVal);
        const overCollapsed = tEpoch < -0.06;
        const r = Math.max(4, Math.abs(tEpoch) * maxR * 0.86);
        const arcAngle = overCollapsed ? arc.angle + Math.PI : arc.angle;
        c2d.strokeStyle = overCollapsed ? '#ff7d6b' : this.isRewindFocused() ? palette.lockHex : palette.accentHex;
        c2d.globalAlpha = 0.9;
        c2d.lineWidth = 3;
        c2d.beginPath();
        c2d.arc(cx, cy, r, arcAngle - arc.span * 0.55, arcAngle + arc.span * 0.55);
        c2d.stroke();
      } else {
        for (let wave = 0; wave < 2; wave++) {
          const t = (this.elapsedSec * 0.33 * arc.speedMul + arc.phaseOffset + wave * 0.5) % 1;
          const r = 34 + t * maxR;
          const distFromCloud = Math.abs(r - cloudR);
          const flash = clamp(1 - distFromCloud / 75, 0.3, 1);
          c2d.strokeStyle = arc.isDecoy ? '#ffb366' : palette.secondaryHex;
          c2d.globalAlpha = (1 - t * 0.6) * flash * (arc.isDecoy ? 0.55 : 0.92);
          c2d.lineWidth = arc.isDecoy ? 1.8 : 2.8 + flash;
          c2d.beginPath();
          c2d.arc(cx, cy, r, arc.angle - arc.span * 0.5, arc.angle + arc.span * 0.5);
          c2d.stroke();
        }
      }
    }
    c2d.restore();

    // Interactive Golden Curvature Test Ping Wavefront
    const ux = this.compassNx * w;
    const uy = this.compassNy * h;
    if (this.pingActive && this.phase === 'locate') {
      const pingR = 24 + this.pingProgress01 * maxR;
      c2d.save();
      c2d.strokeStyle = '#ffd98a';
      c2d.globalAlpha = (1 - this.pingProgress01) * 0.9;
      c2d.lineWidth = 2.4;
      c2d.beginPath();
      c2d.arc(ux, uy, pingR, 0, Math.PI * 2);
      c2d.stroke();
      c2d.restore();
    }

    // Continuous subtle golden curvature guide rings + Compass reticle
    c2d.save();
    c2d.strokeStyle = locked || this.phase === 'rewind' ? palette.lockHex : palette.accentHex;
    c2d.lineWidth = 2;
    c2d.globalAlpha = 0.92;
    c2d.beginPath();
    c2d.arc(ux, uy, 20, 0, Math.PI * 2);
    c2d.stroke();

    if (this.phase === 'locate') {
      c2d.setLineDash([4, 6]);
      for (const refR of [58, 118, 178]) {
        c2d.globalAlpha = 0.22;
        c2d.beginPath();
        c2d.arc(ux, uy, refR, 0, Math.PI * 2);
        c2d.stroke();
      }
    }
    c2d.restore();

    if (locked || this.phase === 'rewind') {
      drawDiffractionStar(c2d, ux, uy, 9.5, palette.lockHex, { spikes: 6, glowAlpha: 0.95 });
    }
    if (this.lockHoldSec > 0.02) {
      drawLockResonanceRing(
        c2d,
        ux,
        uy,
        28,
        this.lockHoldSec / (this.phase === 'locate' ? this.lockHoldTargetSec : 0.45),
        palette.lockHex
      );
    }

    if (this.phase === 'rewind') {
      const tEpoch = lerp(-0.35, 1.0, this.rewindVal);
      const strip = layoutVernierRow(w, h, [
        {
          key: 'rewind',
          label: 'REWIND EPOCH (FOCUS AT t = 0.0)',
          val01: this.rewindVal,
          locked: this.isRewindFocused(),
          rightText: `t = ${tEpoch.toFixed(2)}`,
        },
      ])[0];
      this.rewindStrip = strip;
      drawVernierStrip(c2d, strip, palette.accentHex, palette.lockHex);
    } else {
      this.rewindStrip = null;
    }

    drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, palette.lockHex);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Supernova flashes illuminate scattered dust clouds sequentially as curved light-echo arcs; comparing test-ping circle curvature locates the epicenter so time can be focused at t=0 detonation.',
      goalSummary: 'Use concentric compass rings & TEST PING rays to locate the true epicenter, then focus REWIND EPOCH right at t = 0.0.',
      controlsDesktop: 'Drag compass onto center; Space/button fires TEST PING; focus REWIND EPOCH at t=0 on Stages 2–3.',
      controlsTouch: 'Touch-drag compass and tap TEST PING; focus REWIND EPOCH bar cleanly at t=0 on Stages 2–3.',
      warmthEffect: 'Warm H% widens geometric epicenter snap; Cold H% sharpens forensic wavefront timing.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        this.compassNx = this.epicenterNx;
        this.compassNy = this.epicenterNy;
        this.phase = 'rewind';
        this.rewindVal = this.rewindTargetVal;
        if (stage < 3) this.setupStage((stage + 1) as 2 | 3);
        else this.finishSuccess();
      },
      getDiagnostics: () => ({
        stage: this.stage,
        completed: this.completed,
        stageProgress: this.completed ? 1 : (this.stage - 1 + (this.isEpicenterLocked() ? 1 : 0.2)) / 3,
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
