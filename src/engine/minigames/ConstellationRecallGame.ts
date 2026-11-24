import { platform } from '../../platform/PlatformAdapter';
import { computeOpticalClarity, setupFullRetinaCanvas } from './canvasUtils';
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

interface SkyNode {
  id: number;
  bx: number;
  by: number;
  parallaxAmp: number;
  parallaxPhase: number;
  isDecoy: boolean;
  flash: number;
  wrongFlash: number;
  size: number;
}

interface RipplePulse {
  x: number;
  y: number;
  age: number;
  color: string;
}

/**
 * CON-02 — Stellar Constellation
 * Dynamic parallax star memory: watch glowing comet pulses link stars in order,
 * then tap them with pointer parallax depth, expanding ripple rings, and asterism glow.
 */
export class ConstellationRecallGame implements IMinigame {
  readonly id = 'constellation_recall';
  readonly title = 'STELLAR CONSTELLATION';
  readonly subtitle = 'Parallax Spatial Memory';
  readonly instrumentCode = 'CON-02';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private nodes: SkyNode[] = [];
  private sequence: number[] = [];
  private recallIndex = 0;
  private mode: 'playback' | 'recall' | 'stage_clear' = 'playback';
  private playbackStep = -1;
  private playbackTimer = 0;
  private playbackInterval = 0.62;
  private stageClearTimer = 0;
  private stageFlash = 0;
  private stageFlashText = '';
  private wrongTapCount = 0;
  private pointerNx = 0;
  private pointerNy = 0;
  private smoothPx = 0;
  private smoothPy = 0;
  private ripples: RipplePulse[] = [];
  private ambientStars = generateAmbientStars(createSeededRng('con-stars'), 54);
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
    const rng = createSeededRng(`${this.ctx.targetId}:con:${this.ctx.state.shift}:${stage}`);

    const totalMain = stage === 1 ? 8 : stage === 2 ? 10 : 12;
    const seqLen = stage === 1 ? 3 : stage === 2 ? 5 : 6;

    const candidates: SkyNode[] = [];
    let guard = 0;
    while (candidates.length < totalMain && guard < 400) {
      guard++;
      const bx = 0.17 + rng() * 0.66;
      const by = 0.24 + rng() * 0.52;
      if (candidates.some((c) => Math.hypot(c.bx - bx, (c.by - by) * 0.72) < 0.13)) continue;
      candidates.push({
        id: candidates.length,
        bx,
        by,
        parallaxAmp: stage >= 2 ? 0.014 + rng() * 0.01 : 0.004,
        parallaxPhase: rng() * Math.PI * 2,
        isDecoy: stage === 3 && candidates.length >= totalMain - 2,
        flash: 0,
        wrongFlash: 0,
        size: 7.5 + rng() * 2.5,
      });
    }
    this.nodes = candidates;

    const validIds = this.nodes.filter((n) => !n.isDecoy).map((n) => n.id);
    for (let i = validIds.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [validIds[i], validIds[j]] = [validIds[j], validIds[i]];
    }
    this.sequence = validIds.slice(0, Math.min(seqLen, validIds.length));
    this.startPlayback();
  }

  private startPlayback(): void {
    this.mode = 'playback';
    this.recallIndex = 0;
    this.playbackStep = -1;
    this.playbackInterval = this.stage === 1 ? 0.62 : 0.52;
    this.playbackTimer = 0.35;
    this.emitHud();
  }

  onHelperAction(actionId: string): void {
    if (actionId === 'replay' && !this.completed && this.mode !== 'stage_clear') {
      this.startPlayback();
    }
  }

  private getNodeScreenPos(node: SkyNode, w: number, h: number): { x: number; y: number } {
    const px = node.parallaxAmp * Math.sin(this.elapsedSec * 0.95 + node.parallaxPhase) + this.smoothPx * 0.012;
    const py = node.parallaxAmp * 0.55 * Math.cos(this.elapsedSec * 0.75 + node.parallaxPhase) + this.smoothPy * 0.01;
    return {
      x: (node.bx + px) * w,
      y: (node.by + py) * h,
    };
  }

  private bindEvents(): void {
    const onResize = () => {
      this.c2d = setupFullRetinaCanvas(this.canvas);
    };

    const onMove = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointerNx = clamp(((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1, -1, 1);
      this.pointerNy = clamp(((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1, -1, 1);
    };

    const onDown = (e: PointerEvent) => {
      if (this.completed || this.mode !== 'recall') return;
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);

      let bestNode: SkyNode | null = null;
      let bestDist = 44;
      for (const n of this.nodes) {
        const p = this.getNodeScreenPos(n, w, h);
        const d = Math.hypot(px - p.x, py - p.y);
        if (d < bestDist) {
          bestDist = d;
          bestNode = n;
        }
      }
      if (!bestNode) return;
      this.handleStarTap(bestNode, w, h);
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onMove);
    this.canvas.addEventListener('pointerdown', onDown);
    this.unbind = () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      this.canvas.removeEventListener('pointerdown', onDown);
    };
  }

  private handleStarTap(node: SkyNode, w: number, h: number): void {
    const expectedId = this.sequence[this.recallIndex];
    const screen = this.getNodeScreenPos(node, w, h);
    const pan = clamp((screen.x / w) * 2 - 1, -0.8, 0.8);
    const palette = getCosmicPalette(this.ctx.state.humanity);

    if (node.id === expectedId) {
      node.flash = 1;
      this.recallIndex += 1;
      this.ripples.push({ x: screen.x, y: screen.y, age: 0, color: palette.lockHex });
      const pitchHz = 360 + this.recallIndex * 65;
      this.ctx.audio?.playStereoSonarEcho(pan, 0.2, pitchHz);
      platform.triggerHaptic('vernierTick', 0.72);

      if (this.recallIndex >= this.sequence.length) {
        this.mode = 'stage_clear';
        this.stageClearTimer = 0.72;
        this.stageFlash = 1;
        this.stageFlashText = `CONSTELLATION ${this.stage}/3 LOCKED`;
        this.ctx.audio?.playPhaseLock?.(this.stage);
        platform.triggerHaptic('phaseSnapLock', 0.95);
      }
      this.emitHud();
    } else {
      node.wrongFlash = 1;
      this.wrongTapCount += 1;
      this.ripples.push({ x: screen.x, y: screen.y, age: 0, color: '#ff8652' });
      this.ctx.audio?.playSolenoidClack(false);
      platform.triggerHaptic('rejectThud', 0.65);
      this.emitHud('Soft amber pulse — check the next star from your last connection, or tap REPLAY PATTERN.');
    }
  }

  private update(dt: number): void {
    if (this.completed) return;
    this.elapsedSec += dt;
    this.stageFlash = Math.max(0, this.stageFlash - dt * 1.45);
    this.smoothPx = lerp(this.smoothPx, this.pointerNx, dt * 4);
    this.smoothPy = lerp(this.smoothPy, this.pointerNy, dt * 4);

    for (const n of this.nodes) {
      n.flash = Math.max(0, n.flash - dt * 1.6);
      n.wrongFlash = Math.max(0, n.wrongFlash - dt * 1.8);
    }
    this.ripples = this.ripples
      .map((r) => ({ ...r, age: r.age + dt * 1.65 }))
      .filter((r) => r.age < 1);

    const totalDone = (this.stage - 1 + this.recallIndex / Math.max(1, this.sequence.length)) / 3;
    this.ctx.showcase?.applyInstrumentPatch({
      progress: totalDone,
      dustPeel: totalDone,
      humanity: this.ctx.state.humanity,
    });

    if (this.mode === 'playback') {
      this.playbackTimer -= dt;
      if (this.playbackTimer <= 0) {
        this.playbackStep += 1;
        if (this.playbackStep >= this.sequence.length) {
          this.mode = 'recall';
          this.emitHud();
        } else {
          const targetNode = this.nodes.find((n) => n.id === this.sequence[this.playbackStep]);
          if (targetNode) {
            targetNode.flash = 1;
            const w = Math.max(1, this.canvas.clientWidth || 1280);
            const h = Math.max(1, this.canvas.clientHeight || 720);
            const pos = this.getNodeScreenPos(targetNode, w, h);
            const palette = getCosmicPalette(this.ctx.state.humanity);
            this.ripples.push({ x: pos.x, y: pos.y, age: 0, color: palette.accentHex });
            const pan = clamp(targetNode.bx * 2 - 1, -0.8, 0.8);
            this.ctx.audio?.playStereoSonarEcho(pan, 0.25, 360 + (this.playbackStep + 1) * 65);
            platform.triggerHaptic('proximityPulse', 0.4);
          }
          this.playbackTimer = this.playbackInterval;
        }
      }
    } else if (this.mode === 'stage_clear') {
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
        `${this.ctx.targetId}_constellation`,
        `Astrometric star baseline recalled across 3 parallax stages on ${this.ctx.targetName}.`,
        `Precision ${(acc * 100).toFixed(0)}% · ${totalSec.toFixed(1)}s`,
        'Astronomical Parallax & Sidereal Baseline Memory'
      )
    );
  }

  private emitHud(overridePrompt?: string): void {
    const labelMap: Record<1 | 2 | 3, string> = {
      1: '1/3 · EASY',
      2: '2/3 · MEDIUM',
      3: '3/3 · HARD',
    };
    const promptText =
      overridePrompt ??
      (this.mode === 'playback'
        ? `Follow the luminous comet pulse linking ${this.sequence.length} stars…`
        : `Tap the ${this.sequence.length} stars in order (${this.recallIndex}/${this.sequence.length} connected).`);

    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: labelMap[this.stage],
      stageProgress: clamp((this.stage - 1 + this.recallIndex / Math.max(1, this.sequence.length)) / 3, 0, 1),
      promptText,
      actionButton: this.mode === 'recall' ? { id: 'replay', label: 'REPLAY PATTERN' } : null,
    });
  }

  private render(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const c2d = this.c2d;
    const palette = getCosmicPalette(this.ctx.state.humanity);
    const clarity = computeOpticalClarity(this.ctx.state.humanity, this.ctx.state.opticalFidelity);
    const overall = clamp((this.stage - 1 + this.recallIndex / Math.max(1, this.sequence.length)) / 3, 0, 1);

    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'smacs',
      blurPx: lerp(7, 0, overall),
      alpha: lerp(0.6, 0.94, overall),
      brightness: lerp(0.84, 1.14, overall),
      scale: lerp(1.06, 1.01, overall),
      tintAlpha: 0.34,
      gridAlpha: palette.mode === 'cold' ? 0.12 : 0.05,
    });

    c2d.save();
    c2d.translate(-this.smoothPx * 6, -this.smoothPy * 4);
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, clarity);
    c2d.restore();

    const activeCount =
      this.mode === 'playback'
        ? Math.max(0, Math.min(this.sequence.length, this.playbackStep + 1))
        : this.mode === 'stage_clear'
        ? this.sequence.length
        : this.recallIndex;

    // Luminous asterism polygon glow when constellation locks
    if (this.mode === 'stage_clear' && activeCount >= 3) {
      c2d.save();
      c2d.beginPath();
      for (let i = 0; i < activeCount; i++) {
        const node = this.nodes.find((n) => n.id === this.sequence[i]);
        if (!node) continue;
        const p = this.getNodeScreenPos(node, w, h);
        if (i === 0) c2d.moveTo(p.x, p.y);
        else c2d.lineTo(p.x, p.y);
      }
      c2d.closePath();
      c2d.fillStyle = `rgba(${palette.lockRgb}, ${(0.16 * this.stageClearTimer).toFixed(2)})`;
      c2d.fill();
      c2d.restore();
    }

    // Draw connected star filaments + traveling comet pulse during playback
    if (activeCount >= 2) {
      c2d.save();
      c2d.strokeStyle = this.mode === 'playback' ? palette.accentHex : palette.lockHex;
      c2d.lineWidth = 2.4;
      c2d.shadowColor = c2d.strokeStyle;
      c2d.shadowBlur = 12;
      c2d.beginPath();
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < activeCount; i++) {
        const node = this.nodes.find((n) => n.id === this.sequence[i]);
        if (!node) continue;
        const p = this.getNodeScreenPos(node, w, h);
        pts.push(p);
        if (i === 0) c2d.moveTo(p.x, p.y);
        else c2d.lineTo(p.x, p.y);
      }
      c2d.stroke();

      // Animated streaking comet traveling along the active link!
      if (this.mode === 'playback' && pts.length >= 2) {
        const pFrom = pts[pts.length - 2];
        const pTo = pts[pts.length - 1];
        const segT = clamp(1 - this.playbackTimer / this.playbackInterval, 0, 1);
        const cx = lerp(pFrom.x, pTo.x, segT);
        const cy = lerp(pFrom.y, pTo.y, segT);
        c2d.fillStyle = '#ffffff';
        c2d.beginPath();
        c2d.arc(cx, cy, 4.2, 0, Math.PI * 2);
        c2d.fill();
      }
      c2d.restore();
    }

    // Expanding circular shockwave ripples
    for (const r of this.ripples) {
      c2d.save();
      c2d.strokeStyle = r.color;
      c2d.globalAlpha = (1 - r.age) * 0.72;
      c2d.lineWidth = 2;
      c2d.beginPath();
      c2d.arc(r.x, r.y, 14 + r.age * 38, 0, Math.PI * 2);
      c2d.stroke();
      c2d.restore();
    }

    for (const node of this.nodes) {
      const pos = this.getNodeScreenPos(node, w, h);
      const seqIdx = this.sequence.indexOf(node.id);
      const alreadyConnected =
        seqIdx !== -1 &&
        ((this.mode === 'recall' && seqIdx < this.recallIndex) ||
          this.mode === 'stage_clear' ||
          (this.mode === 'playback' && seqIdx <= this.playbackStep));

      let color = '#c9def5';
      let rad = node.isDecoy ? node.size * 0.78 : node.size;
      let glow = node.isDecoy ? 0.38 : 0.62;

      if (node.wrongFlash > 0.05) {
        color = '#ff8652';
        glow = 0.85;
      } else if (node.flash > 0.05) {
        color = '#ffffff';
        rad *= 1 + node.flash * 0.48;
        glow = 1.0;
      } else if (alreadyConnected) {
        color = palette.lockHex;
        glow = 0.92;
      }

      drawDiffractionStar(c2d, pos.x, pos.y, rad, color, {
        spikes: 6,
        glowAlpha: glow,
        rotationRad: this.elapsedSec * 0.15,
      });

      if (alreadyConnected || node.flash > 0.25) {
        c2d.save();
        c2d.strokeStyle = color;
        c2d.globalAlpha = 0.75;
        c2d.lineWidth = 1.5;
        c2d.beginPath();
        c2d.arc(pos.x, pos.y, rad * 1.9, 0, Math.PI * 2);
        c2d.stroke();
        c2d.restore();
      }
    }

    drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, palette.lockHex);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Astrometric parallax measures true cosmic distances by comparing background quasar & star positions as Earth orbits the Sun.',
      goalSummary:
        'Watch the streaking comet link stars in order, then tap them across 3 stages (3 → 5 parallax → 6 decoy-filtered stars).',
      controlsDesktop: 'Click stars in order. Move mouse slightly to feel parallax depth; click REPLAY PATTERN anytime.',
      controlsTouch: 'Tap stars in order; wrong taps preserve your existing chain.',
      warmthEffect: 'Warm H% casts golden starlight filaments; Cold H% switches to sharp cyan astrometry reticles.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        this.mode = 'recall';
        this.recallIndex = this.sequence.length;
        if (stage < 3) {
          this.setupStage((stage + 1) as 2 | 3);
        } else {
          this.finishSuccess();
        }
      },
      getDiagnostics: () => ({
        stage: this.stage,
        completed: this.completed,
        stageProgress: this.completed ? 1 : (this.stage - 1 + this.recallIndex / Math.max(1, this.sequence.length)) / 3,
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
