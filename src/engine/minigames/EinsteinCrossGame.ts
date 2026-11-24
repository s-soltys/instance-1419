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
import { stageLabel } from './cosmicGameBase';
import { clamp, createSeededRng, lerp, resolveInstrumentPayout } from './tactilePhysics';
import type { IMinigame, InstrumentFieldGuide, MinigameContext, SolvabilityHarness } from './types';

interface MirageStar {
  id: number;
  nx: number;
  ny: number;
  isMirage: boolean;
  delaySec: number;
  strobeRate: number;
  selected: boolean;
}

/**
 * MIR-20 — Einstein Cross Mirage Collapser
 * Central luminous lensing galaxy splits 1 flickering quasar into mirrored ghost copies!
 * Mini scrolling cadence trace bars under every star show exact double-beat rhythm ("| |  | |"),
 * while tagged mirage stars visibly glide inward along curved geodesics when collapsed!
 */
export class EinsteinCrossGame implements IMinigame {
  readonly id = 'einstein_cross';
  readonly title = 'EINSTEIN CROSS MIRAGE';
  readonly subtitle = 'Time-Delayed Quasar Cadence';
  readonly instrumentCode = 'MIR-20';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private stars: MirageStar[] = [];
  private stageClearTimer = 0;
  private stageFlash = 0;
  private stageFlashText = '';
  private wrongTapCount = 0;
  private ambientStars = generateAmbientStars(createSeededRng('mir-stars'), 44);
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
    const rng = createSeededRng(`${this.ctx.targetId}:mir:${this.ctx.state.shift}:${stage}`);

    const total = stage === 1 ? 5 : stage === 2 ? 7 : 8;
    const mirageCount = stage === 1 ? 2 : 4;
    const cx = 0.5;
    const cy = 0.46;

    this.stars = [];
    for (let i = 0; i < total; i++) {
      const isMirage = i < mirageCount;
      const ang = isMirage
        ? (i * Math.PI * 2) / mirageCount + 0.35 + rng() * 0.25
        : rng() * Math.PI * 2;
      const rx = isMirage ? 0.16 : 0.25 + rng() * 0.12;
      const ry = isMirage ? 0.2 : 0.28 + rng() * 0.12;

      this.stars.push({
        id: i,
        nx: clamp(cx + Math.cos(ang) * rx, 0.16, 0.84),
        ny: clamp(cy + Math.sin(ang) * ry, 0.2, 0.72),
        isMirage,
        delaySec: isMirage ? i * 0.35 : rng() * 2.0,
        strobeRate: isMirage ? 1 : stage === 1 ? 0 : i % 2 === 0 ? 2.4 : 0.45,
        selected: false,
      });
    }
  }

  private evalPulseAt(s: MirageStar, timeSec: number): number {
    if (s.strobeRate === 0) return 0.28;
    const t = ((timeSec - s.delaySec) * s.strobeRate) % 2.4;
    const phase = t < 0 ? t + 2.4 : t;
    if (s.isMirage) {
      const p1 = Math.exp(-Math.pow((phase - 0.35) / 0.12, 2));
      const p2 = Math.exp(-Math.pow((phase - 0.82) / 0.12, 2));
      return clamp(0.2 + Math.max(p1, p2) * 0.85, 0.2, 1.05);
    }
    return 0.22 + 0.55 * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2));
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

      let clicked: MirageStar | null = null;
      let bestDist = 42;
      for (const s of this.stars) {
        if (s.selected) continue;
        const d = Math.hypot(px - s.nx * w, py - s.ny * h);
        if (d < bestDist) {
          bestDist = d;
          clicked = s;
        }
      }
      if (!clicked) return;

      if (clicked.isMirage) {
        clicked.selected = true;
        platform.triggerHaptic('phaseSnapLock', 0.9);
        this.ctx.audio?.playTumblerClick(0.92, true);
        this.ctx.audio?.playStereoSonarEcho?.((clicked.nx - 0.5) * 1.6, 0.4, 420);
        const mirages = this.stars.filter((s) => s.isMirage);
        if (mirages.every((s) => s.selected)) {
          this.stageClearTimer = 0.7;
          this.stageFlash = 1;
          this.stageFlashText = `EINSTEIN CROSS ${this.stage}/3 COLLAPSED`;
          this.ctx.audio?.playPhaseLock?.(this.stage);
        }
      } else {
        this.wrongTapCount++;
        platform.triggerHaptic('rejectThud', 0.65);
        this.ctx.audio?.playSolenoidClack(false);
      }
      this.emitHud();
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
        `${this.ctx.targetId}_einstein`,
        `Time-delayed Einstein Cross quasar echoes linked and collapsed back into one galaxy on ${this.ctx.targetName}.`,
        `Mirage Collapsed · ${totalSec.toFixed(1)}s`,
        'Gravitational Time-Delay Splitting & Einstein Cross Quasars'
      )
    );
  }

  private emitHud(): void {
    const mirages = this.stars.filter((s) => s.isMirage);
    const done = mirages.filter((s) => s.selected).length;
    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: stageLabel(this.stage),
      stageProgress: clamp((this.stage - 1 + done / Math.max(1, mirages.length)) / 3, 0, 1),
      promptText: `Compare the scrolling cadence bars under stars & click the ${mirages.length} images sharing the DOUBLE-TAP ("| |  | |") beat (${done}/${mirages.length}).`,
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
      plateId: 'smacs',
      blurPx: 4,
      alpha: 0.45,
      brightness: 0.78,
      tintAlpha: 0.46,
      gridAlpha: palette.mode === 'cold' ? 0.14 : 0.05,
    });
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, 0.76);

    const cx = w * 0.5;
    const cy = h * 0.46;
    const collapseFrac = this.stageClearTimer > 0 ? clamp(1 - this.stageClearTimer / 0.7, 0, 1) : 0;

    // Central Elliptical Lensing Galaxy Core + Bent Einstein Caustic Arcs
    c2d.save();
    const galGrad = c2d.createRadialGradient(cx, cy, 4, cx, cy, 34);
    galGrad.addColorStop(0, 'rgba(255, 224, 170, 0.75)');
    galGrad.addColorStop(0.6, 'rgba(180, 145, 110, 0.22)');
    galGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c2d.fillStyle = galGrad;
    c2d.beginPath();
    c2d.ellipse(cx, cy, 38, 22, 0.2, 0, Math.PI * 2);
    c2d.fill();

    c2d.strokeStyle = 'rgba(200, 224, 248, 0.2)';
    c2d.setLineDash([4, 6]);
    c2d.beginPath();
    c2d.ellipse(cx, cy, w * 0.16, h * 0.2, 0, 0, Math.PI * 2);
    c2d.stroke();
    c2d.setLineDash([]);

    // Curved Geodesic Links + Collapsing Animation
    for (const s of this.stars) {
      if (!s.selected) continue;
      const sx = s.nx * w;
      const sy = s.ny * h;
      c2d.strokeStyle = palette.lockHex;
      c2d.globalAlpha = 0.72;
      c2d.lineWidth = 1.9;
      c2d.beginPath();
      c2d.moveTo(cx, cy);
      c2d.quadraticCurveTo((cx + sx) * 0.5 + 18, (cy + sy) * 0.5 - 16, sx, sy);
      c2d.stroke();
    }
    c2d.restore();

    for (const s of this.stars) {
      const targetDrawX = s.selected && collapseFrac > 0 ? lerp(s.nx * w, cx, collapseFrac) : s.nx * w;
      const targetDrawY = s.selected && collapseFrac > 0 ? lerp(s.ny * h, cy, collapseFrac) : s.ny * h;
      const amp = this.evalPulseAt(s, this.elapsedSec);
      const col = s.selected ? palette.lockHex : s.isMirage ? palette.accentHex : palette.secondaryHex;

      if (amp > 0.75) {
        c2d.save();
        c2d.strokeStyle = col;
        c2d.globalAlpha = (amp - 0.7) * 2.2;
        c2d.lineWidth = 1.6;
        c2d.beginPath();
        c2d.arc(targetDrawX, targetDrawY, 14 + (amp - 0.7) * 24, 0, Math.PI * 2);
        c2d.stroke();
        c2d.restore();
      }
      drawDiffractionStar(c2d, targetDrawX, targetDrawY, 6.5 + amp * 6.5, col, { spikes: 4, glowAlpha: 0.45 + amp * 0.55 });

      // Live scrolling cadence bar directly under every star so rhythm patterns read cleanly!
      if (collapseFrac === 0 && !compact) {
        const barW = 36;
        const bx = targetDrawX - barW * 0.5;
        const by = targetDrawY + 19;
        c2d.save();
        c2d.strokeStyle = col;
        c2d.globalAlpha = 0.68;
        c2d.lineWidth = 1.3;
        c2d.beginPath();
        for (let k = 0; k <= 16; k++) {
          const u = k / 16;
          const v = this.evalPulseAt(s, this.elapsedSec - (1 - u) * 2.1);
          const xPt = bx + u * barW;
          const yPt = by + 7 - v * 7;
          if (k === 0) c2d.moveTo(xPt, yPt);
          else c2d.lineTo(xPt, yPt);
        }
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
        'A foreground lensing galaxy splits one flickering quasar into mirrored ghost arcs arriving at staggered time delays; matching pulse cadence bars collapses the mirage back to one source.',
      goalSummary: 'Watch the scrolling cadence bars below each star and click all mirage images sharing the double-tap beat.',
      controlsDesktop: 'Inspect the double-beat pulse cadence bars ("| |  | |") and click every lensed mirage star.',
      controlsTouch: 'Tap every mirage image sharing the double-tap flash rhythm.',
      warmthEffect: 'Warm H% softens mirage pulse glow; Cold H% tightens timing cadence contrast.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        for (const s of this.stars) if (s.isMirage) s.selected = true;
        if (stage < 3) this.setupStage((stage + 1) as 2 | 3);
        else this.finishSuccess();
      },
      getDiagnostics: () => ({
        stage: this.stage,
        completed: this.completed,
        stageProgress: this.completed
          ? 1
          : (this.stage - 1 + this.stars.filter((s) => s.isMirage && s.selected).length / Math.max(1, this.stars.filter((s) => s.isMirage).length)) /
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
