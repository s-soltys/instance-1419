import { setupFullRetinaCanvas } from './canvasUtils';
import {
  bindCanvasPress,
  computeRawGate,
  drawCrosshairMarker,
  drawFloatingDeltaPill,
  drawReticleFrame,
} from './reticleUtils';
import {
  clamp,
  computeInstrumentProfile,
  createSeededRng,
  HitstopRecoil,
  LatchController,
  resolveInstrumentPayout,
  SpringActuator,
  StuckTimeDirector,
} from './tactilePhysics';
import {
  CognitiveInstrumentProfile,
  IMinigame,
  MinigameContext,
  MinigameGrade,
} from './types';

interface BaselineNode {
  id: string;
  nx: number; // -1..1 normalized offset from center
  ny: number;
  isDecoy: boolean;
  revealed: number; // 0..1 visibility from sonar ping
  locked: boolean;
  driftPhase: number;
  baseAngle: number;
}

export class ParallaxTriangulationArray implements IMinigame {
  readonly id = 'parallax_array';
  readonly title = 'PARALLAX TRIANGULATION ARRAY';
  readonly subtitle = 'Sonar Echo Localization · Orbital Baseline Convergence';
  readonly instrumentCode = 'PRX-01';

  private ctx!: MinigameContext;
  private profile!: CognitiveInstrumentProfile;
  private canvas!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private unbindInput: (() => void) | null = null;
  private resizeObs: ResizeObserver | null = null;

  private nodes: BaselineNode[] = [];
  private pingRipples: Array<{ nx: number; ny: number; age: number }> = [];
  private vernierAngle = new SpringActuator(0);
  private targetAngle = 0;
  private isDraggingArc = false;
  private dragOffsetAngle = 0;

  private rawActive = false;
  private latch = new LatchController();
  private director = new StuckTimeDirector();
  private hitstop = new HitstopRecoil();
  private rafId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private finished = false;
  private lastCue = 'Click open sky to ping stations · VISIBLE [2] sharpens echoes';
  private pulsesFired = 0;

  mount(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.profile = computeInstrumentProfile(ctx.state);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minigame-canvas';
    ctx.container.appendChild(this.canvas);
    this.g = setupFullRetinaCanvas(this.canvas);

    this.resizeObs = new ResizeObserver(() => {
      if (this.canvas.isConnected) {
        this.g = setupFullRetinaCanvas(this.canvas);
      }
    });
    this.resizeObs.observe(ctx.container);

    const rand = createSeededRng(`${ctx.targetId}-${ctx.state.shift}`);
    // Place 3 true baseline stations around outer ring + 1..3 pareidolia ghosts
    const sectors = [0.4, 2.5, 4.6];
    this.nodes = sectors.map((ang, i) => {
      const a = ang + (rand() - 0.5) * 0.45;
      const r = 0.52 + rand() * 0.24;
      return {
        id: `ST-${String.fromCharCode(65 + i)}`,
        nx: Math.cos(a) * r * 0.86,
        ny: Math.sin(a) * r * 0.86,
        isDecoy: false,
        revealed: 0.14, // faint hint before sonar sweep
        locked: false,
        driftPhase: rand() * 6.28,
        baseAngle: a,
      };
    });

    const decoyCount = this.profile.pareidoliaChance > 0.34 ? 2 : 1;
    for (let d = 0; d < decoyCount; d++) {
      const a = rand() * Math.PI * 2;
      const r = 0.44 + rand() * 0.32;
      this.nodes.push({
        id: `GH-${d + 1}`,
        nx: Math.cos(a) * r * 0.86,
        ny: Math.sin(a) * r * 0.86,
        isDecoy: true,
        revealed: 0.18,
        locked: false,
        driftPhase: rand() * 6.28,
        baseAngle: a,
      });
    }

    this.targetAngle = 0.32 + rand() * 0.65;
    this.vernierAngle.snap(this.targetAngle - 0.92);

    this.unbindInput = bindCanvasPress(this.canvas, {
      onDown: (x, y, w, h) => this.handlePointerDown(x, y, w, h),
      onMove: (x, y, w, h) => this.handlePointerMove(x, y, w, h),
      onUp: () => {
        this.isDraggingArc = false;
      },
      onWheel: (dy) => {
        this.vernierAngle.target += dy * 0.0018;
      },
    });

    this.lastTime = performance.now();
    this.loop();
  }

  setWaveBand(bandIdx: number): void {
    this.ctx.bandIdx = bandIdx;
    this.refresh3DVectors();
  }

  toggleRawResidual(force?: boolean): void {
    this.rawActive = force !== undefined ? force : !this.rawActive;
    this.ctx.audio?.playSolenoidClack(false);
    this.lastCue = this.rawActive
      ? 'RAW residual filter engaged — proper-motion drift unmasked'
      : 'Overseer smoothing restored';
  }

  triggerCaptureLatch(holding: boolean): void {
    this.latch.setHolding(holding);
  }

  requestPartialCommit(): void {
    const lockedCount = this.nodes.filter((n) => !n.isDecoy && n.locked).length;
    if (lockedCount < 2 || this.finished) return;
    this.commitFinish('partial', 0.65);
  }

  private handlePointerDown(x: number, y: number, w: number, h: number): void {
    if (this.finished) return;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const scale = Math.min(w, h) * 0.41;
    const nx = (x - cx) / scale;
    const ny = (y - cy) / scale;

    // 1. Check click on revealed node
    for (const node of this.nodes) {
      if (node.locked) continue;
      const dist = Math.hypot(nx - node.nx, ny - node.ny);
      const hitRadius = node.revealed > 0.25 ? 0.14 : 0.085;
      if (dist <= hitRadius) {
        if (node.isDecoy) {
          node.revealed = 0;
          this.ctx.audio?.playSolenoidClack(false);
          this.hitstop.trigger(28, 3.5);
          this.lastCue = 'Pareidolia echo rejected — unstable proper motion!';
          return;
        }
        node.locked = true;
        node.revealed = 1;
        this.ctx.audio?.playTumblerClick(0.85, true);
        this.hitstop.trigger(42, 4);
        this.refresh3DVectors();
        const lockedCount = this.nodes.filter((n) => !n.isDecoy && n.locked).length;
        this.lastCue =
          lockedCount >= 3
            ? 'All 3 baseline nodes acquired — drag outer protractor arc to converge rays'
            : `Station ${node.id} locked (${lockedCount}/3)`;
        return;
      }
    }

    // 2. If all 3 stations locked and near outer protractor ring, drag baseline vernier
    const rNorm = Math.hypot(nx, ny);
    const lockedCount = this.nodes.filter((n) => !n.isDecoy && n.locked).length;
    if (lockedCount >= 3 && Math.abs(rNorm - 0.86) < 0.22) {
      this.isDraggingArc = true;
      this.dragOffsetAngle = Math.atan2(ny, nx) - this.vernierAngle.target;
      return;
    }

    // 3. Fire stereo acoustic sonar pulse at sky coordinates!
    this.pulsesFired++;
    this.pingRipples.push({ nx, ny, age: 0 });
    this.ctx.showcase?.trigger3DSonarPulse(nx, ny, this.ctx.bandIdx);

    // Reveal nearest station distance for stereo acoustic return
    let nearestTrue = 2.0;
    for (const node of this.nodes) {
      const d = Math.hypot(nx - node.nx, ny - node.ny);
      if (!node.isDecoy) nearestTrue = Math.min(nearestTrue, d);
      const radius = this.ctx.bandIdx === 1 ? 0.65 : 0.45;
      if (d < radius) {
        node.revealed = Math.min(1, node.revealed + (1 - d / radius) * 0.92);
      }
    }
    const pitch = this.profile.vibe === 'warm' ? 540 + (1 - clamp(nearestTrue, 0, 1)) * 260 : 660;
    this.ctx.audio?.playStereoSonarEcho(clamp(nx, -1, 1), clamp(nearestTrue, 0, 1), pitch);
    this.lastCue =
      nearestTrue < 0.28
        ? 'Strong return echo! Click illuminated station node to lock'
        : 'Sonar ping dispatched — follow brighter echoes';
  }

  private handlePointerMove(x: number, y: number, w: number, h: number): void {
    if (!this.isDraggingArc || this.finished) return;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const a = Math.atan2(y - cy, x - cx);
    this.vernierAngle.target = a - this.dragOffsetAngle;
  }

  private refresh3DVectors(): void {
    if (!this.ctx.showcase) return;
    this.ctx.showcase.clearInstrumentOverlays();
    const locked = this.nodes.filter((n) => !n.isDecoy && n.locked);
    for (const node of locked) {
      this.ctx.showcase.add3DBearingVector(
        node.baseAngle + (this.vernierAngle.value - this.targetAngle),
        0.85,
        this.profile.theme.accentHex
      );
    }
  }

  private loop = (): void => {
    if (this.finished) return;
    this.rafId = requestAnimationFrame(this.loop);

    const now = performance.now();
    const rawDt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.elapsed += rawDt;

    const recoil = this.hitstop.step(rawDt);
    const dt = recoil.frozen ? 0 : rawDt;

    const lockedNodes = this.nodes.filter((n) => !n.isDecoy && n.locked);
    const allLocked = lockedNodes.length >= 3;
    const bandMatch = this.ctx.bandIdx === 1 ? 1.0 : 0.35;

    // Step vernier spring with unified magnetic detent
    const angle = this.vernierAngle.step(dt, {
      stiffness: 170,
      damping: 22,
      detentCenter: this.targetAngle,
      detentRadius: 0.14 * this.profile.detentWellScale,
      detentPull: this.profile.vibe === 'warm' ? 0.68 : 0.42,
    });

    const angleErr = Math.abs(Math.atan2(Math.sin(angle - this.targetAngle), Math.cos(angle - this.targetAngle)));
    const convergence = allLocked ? clamp(1 - angleErr / (0.34 / this.profile.snapPrecisionMul), 0, 1) : 0;
    const beat1Progress = lockedNodes.length / 3;
    const overallProgress = beat1Progress * 0.5 + convergence * 0.5;

    const assistTier = this.director.tick(dt, overallProgress);
    const rawOk = computeRawGate(this.profile, this.rawActive);
    const latchOut = this.latch.tick(dt, convergence * (bandMatch > 0.7 ? 1 : 0.6), rawOk);

    // Stereo beat synth cues alignment audibly!
    if (allLocked) {
      this.ctx.audio?.updateBeatSynth({
        beatHz: angleErr * 16,
        harmonicLock: convergence,
        warmth: this.profile.harmonicWarmthGain,
        strain: latchOut.overclockZone ? clamp((latchOut.lockProgress - 0.85) * 3, 0, 1) : 0,
      });
    } else {
      this.ctx.audio?.stopInstrumentAudio();
    }
    this.ctx.audio?.setWatchdogBed(latchOut.overclockZone ? 0.45 : 0);

    this.ctx.showcase?.applyInstrumentPatch({
      progress: overallProgress,
      unwarpProgress: convergence * 0.35,
      ringTwist: (angle - this.targetAngle) * 0.6,
    });

    // Advance echoes & pareidolia micro-drift
    for (let i = this.pingRipples.length - 1; i >= 0; i--) {
      this.pingRipples[i].age += dt;
      if (this.pingRipples[i].age > 1.1) this.pingRipples.splice(i, 1);
    }
    for (const node of this.nodes) {
      if (!node.locked) {
        node.revealed = Math.max(0.12, node.revealed - dt * 0.055);
      }
    }

    const beatIndex: 1 | 2 | 3 = !allLocked ? 1 : convergence < 0.78 ? 2 : 3;
    const beatLabel =
      beatIndex === 1
        ? `01 ISOLATE (${lockedNodes.length}/3 STATIONS)`
        : beatIndex === 2
        ? '02 EXPOSE (CONVERGE PROTRACTOR)'
        : rawOk
        ? '03 EXTRACT [HOLD SPACE]'
        : '03 OVER-REGULARIZED — PRESS [R]';

    this.ctx.onTelemetry?.({
      beatIndex,
      beatLabel,
      lockMeter: latchOut.lockProgress > 0 ? latchOut.lockProgress : overallProgress,
      overclockZone: latchOut.overclockZone,
      rawResidualActive: this.rawActive,
      canCommitPartial: lockedNodes.length >= 2 && (assistTier >= 3 || overallProgress >= 0.45),
      telemetryReadout: `NODES ${lockedNodes.length}/3 · Δ ${(angleErr * 57.3).toFixed(2)}° · PINGS ${this.pulsesFired}`,
      cueWhisper:
        assistTier >= 2 && !allLocked
          ? 'Guide: Aim pings near the 3 steady amber/cyan crosshairs — reject drifting echoes'
          : this.lastCue,
      assistTier,
    });

    if (latchOut.completedGrade) {
      this.commitFinish(latchOut.completedGrade, clamp(0.7 + convergence * 0.3, 0, 1));
      return;
    }

    this.render(recoil.shakeX, recoil.shakeY, allLocked, angleErr, convergence, assistTier);
  };

  private render(
    shakeX: number,
    shakeY: number,
    allLocked: boolean,
    angleErr: number,
    convergence: number,
    assistTier: number
  ): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const ctx = this.g;
    ctx.clearRect(0, 0, w, h);

    drawReticleFrame(ctx, w, h, this.profile, this.rawActive, this.elapsed, shakeX, shakeY);

    const cx = w * 0.5 + shakeX;
    const cy = h * 0.5 + shakeY;
    const scale = Math.min(w, h) * 0.41;
    const { theme } = this.profile;

    // Ping ripples
    for (const rp of this.pingRipples) {
      const t = rp.age / 1.1;
      ctx.strokeStyle = `rgba(${theme.accentRgb}, ${(1 - t) * 0.55})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx + rp.nx * scale, cy + rp.ny * scale, t * scale * 0.48, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw nodes & parallax rays
    for (const node of this.nodes) {
      const jitter = node.isDecoy
        ? Math.sin(this.elapsed * 3.8 + node.driftPhase) * 0.024
        : Math.sin(this.elapsed * 1.4 + node.driftPhase) * 0.003 * this.profile.jitterAmplitude;
      const sx = cx + (node.nx + jitter) * scale;
      const sy = cy + (node.ny + jitter * 0.7) * scale;

      const vis = assistTier >= 2 && !node.isDecoy ? Math.max(node.revealed, 0.72) : node.revealed;
      if (vis < 0.05) continue;

      ctx.save();
      ctx.globalAlpha = clamp(vis, 0.14, 1);
      if (node.isDecoy && (this.rawActive || this.profile.vibe === 'cold')) {
        ctx.strokeStyle = theme.dangerHex;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(sx, sy, 12, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        drawCrosshairMarker(ctx, sx, sy, node.locked ? 14 : 11, node.locked, this.profile, assistTier);
      }
      ctx.restore();

      if (node.locked) {
        // Projection ray toward central convergence target (rotated by vernier error)
        const err = this.vernierAngle.value - this.targetAngle;
        const rayAngle = Math.atan2(cy - sy, cx - sx) + err * 0.48;
        ctx.save();
        ctx.strokeStyle = `rgba(${theme.accentRgb}, ${0.32 + convergence * 0.55})`;
        ctx.lineWidth = convergence > 0.78 ? 2.0 : 1.2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(rayAngle) * scale * 1.45, sy + Math.sin(rayAngle) * scale * 1.45);
        ctx.stroke();
        ctx.restore();
      }

      if (vis > 0.35) {
        drawFloatingDeltaPill(
          ctx,
          sx,
          sy - 24,
          node.isDecoy ? 'ERRATIC DRIFT' : `${node.id} ${node.locked ? 'LOCKED' : ''}`,
          this.profile,
          node.locked
        );
      }
    }

    // Draggable Protractor Handle on outer ring once Beat 01 completes
    if (allLocked) {
      const handleR = scale * 0.86;
      const hx = cx + Math.cos(this.vernierAngle.value) * handleR;
      const hy = cy + Math.sin(this.vernierAngle.value) * handleR;

      ctx.save();
      ctx.strokeStyle = convergence > 0.78 ? theme.accentHex : `rgba(${theme.secondaryRgb}, 0.45)`;
      ctx.lineWidth = convergence > 0.78 ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, handleR, this.vernierAngle.value - 0.38, this.vernierAngle.value + 0.38);
      ctx.stroke();

      ctx.fillStyle = convergence > 0.78 ? theme.accentHex : theme.secondaryHex;
      ctx.beginPath();
      ctx.arc(hx, hy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      drawFloatingDeltaPill(
        ctx,
        cx,
        cy + 34,
        `BASELINE Δ ${(angleErr * 57.3).toFixed(2)}°`,
        this.profile,
        convergence >= 0.78
      );
    }
  }

  private commitFinish(grade: MinigameGrade, accuracy: number): void {
    if (this.finished) return;
    this.finished = true;
    this.ctx.audio?.playCaptureShutter(grade);
    this.ctx.showcase?.applyInstrumentPatch({ progress: 1 });

    const elapsedSec = Math.round(this.elapsed * 10) / 10;
    const res = resolveInstrumentPayout(
      grade,
      elapsedSec,
      accuracy,
      'sol_parallax_proof',
      'Proper-motion baseline confirms Sol–Centauri light shell curvature points radially inward.',
      `Parallax convergence (${grade}) in ${elapsedSec}s after ${this.pulsesFired} acoustic sweeps.`
    );
    window.setTimeout(() => this.ctx.onComplete(res), 420);
  }

  destroy(): void {
    this.finished = true;
    cancelAnimationFrame(this.rafId);
    this.unbindInput?.();
    this.resizeObs?.disconnect();
    this.ctx.audio?.stopInstrumentAudio();
    this.ctx.showcase?.resetInstrumentState();
    this.canvas.remove();
  }
}
