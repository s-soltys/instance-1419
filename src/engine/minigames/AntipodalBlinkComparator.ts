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

interface BlinkStar {
  id: number;
  nx: number;
  ny: number;
  isAnomaly: boolean;
  jumpDx: number;
  jumpDy: number;
  tagged: boolean;
}

export class AntipodalBlinkComparator implements IMinigame {
  readonly id = 'blink_comparator';
  readonly title = 'ANTIPODAL BLINK COMPARATOR';
  readonly subtitle = 'Dual-Epoch Registration · Superluminal Outlier Tagging';
  readonly instrumentCode = 'BLK-05';

  private ctx!: MinigameContext;
  private profile!: CognitiveInstrumentProfile;
  private canvas!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private unbindInput: (() => void) | null = null;
  private resizeObs: ResizeObserver | null = null;

  private stars: BlinkStar[] = [];
  private offsetX = new SpringActuator(0.08);
  private offsetY = new SpringActuator(-0.07);
  private targetOffX = 0;
  private targetOffY = 0;
  private draggingReg = false;
  private lastPx = 0;
  private lastPy = 0;

  private epochB = false;
  private blinkTimer = 0;

  private rawActive = false;
  private latch = new LatchController();
  private director = new StuckTimeDirector();
  private hitstop = new HitstopRecoil();
  private rafId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private finished = false;

  mount(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.profile = computeInstrumentProfile(ctx.state);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minigame-canvas';
    ctx.container.appendChild(this.canvas);
    this.g = setupFullRetinaCanvas(this.canvas);

    this.resizeObs = new ResizeObserver(() => {
      if (this.canvas.isConnected) this.g = setupFullRetinaCanvas(this.canvas);
    });
    this.resizeObs.observe(ctx.container);

    const rand = createSeededRng(`blk-${ctx.targetId}-${ctx.state.shift}`);
    this.stars = [];
    // 14 normal field stars + 3 anomalous superluminal jumpers
    for (let i = 0; i < 17; i++) {
      const a = rand() * Math.PI * 2;
      const r = 0.22 + rand() * 0.56;
      const isAnom = i < 3;
      this.stars.push({
        id: i,
        nx: Math.cos(a) * r,
        ny: Math.sin(a) * r,
        isAnomaly: isAnom,
        jumpDx: isAnom ? (rand() > 0.5 ? 0.048 : -0.048) : 0,
        jumpDy: isAnom ? (rand() > 0.5 ? 0.036 : -0.036) : 0,
        tagged: false,
      });
    }

    this.unbindInput = bindCanvasPress(this.canvas, {
      onDown: (x, y, w, h) => this.handleDown(x, y, w, h),
      onMove: (x, y, w, h) => this.handleMove(x, y, w, h),
      onUp: () => {
        this.draggingReg = false;
      },
    });

    this.lastTime = performance.now();
    this.loop();
  }

  setWaveBand(bandIdx: number): void {
    this.ctx.bandIdx = bandIdx;
  }

  toggleRawResidual(force?: boolean): void {
    this.rawActive = force !== undefined ? force : !this.rawActive;
    this.ctx.audio?.playSolenoidClack(false);
  }

  triggerCaptureLatch(holding: boolean): void {
    this.latch.setHolding(holding);
  }

  requestPartialCommit(): void {
    const tagged = this.stars.filter((s) => s.isAnomaly && s.tagged).length;
    if (tagged < 2 || this.finished) return;
    this.commitFinish('partial', 0.65);
  }

  private handleDown(x: number, y: number, w: number, h: number): void {
    if (this.finished) return;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const scale = Math.min(w, h) * 0.41;

    // Check if clicking one of the anomaly stars once plate registration is stable
    const regScore = this.computeRegScore();
    if (regScore >= 0.72) {
      for (const st of this.stars) {
        if (st.tagged) continue;
        const sx = cx + st.nx * scale;
        const sy = cy + st.ny * scale;
        if (Math.hypot(x - sx, y - sy) < 22) {
          if (st.isAnomaly) {
            st.tagged = true;
            this.hitstop.trigger(38, 4);
            this.ctx.audio?.playTumblerClick(0.9, true);
            return;
          } else {
            this.ctx.audio?.playSolenoidClack(false);
            return;
          }
        }
      }
    }

    this.draggingReg = true;
    this.lastPx = x;
    this.lastPy = y;
  }

  private handleMove(x: number, y: number, w: number, h: number): void {
    if (!this.draggingReg || this.finished) return;
    const scale = Math.min(w, h) * 0.41;
    const dx = (x - this.lastPx) / scale;
    const dy = (y - this.lastPy) / scale;
    this.lastPx = x;
    this.lastPy = y;
    this.offsetX.target = clamp(this.offsetX.target + dx * 0.65, -0.22, 0.22);
    this.offsetY.target = clamp(this.offsetY.target + dy * 0.65, -0.22, 0.22);
  }

  private computeRegScore(): number {
    const err = Math.hypot(this.offsetX.value - this.targetOffX, this.offsetY.value - this.targetOffY);
    return clamp(1 - err / (0.085 / this.profile.snapPrecisionMul), 0, 1);
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

    this.blinkTimer += dt;
    if (this.blinkTimer >= 0.46) {
      this.blinkTimer = 0;
      this.epochB = !this.epochB;
      this.ctx.showcase?.applyInstrumentPatch({ blinkFlip: this.epochB });
    }

    this.offsetX.step(dt, {
      stiffness: 185,
      damping: 22,
      detentCenter: 0,
      detentRadius: 0.028 * this.profile.detentWellScale,
      detentPull: this.profile.vibe === 'warm' ? 0.68 : 0.4,
    });
    this.offsetY.step(dt, {
      stiffness: 185,
      damping: 22,
      detentCenter: 0,
      detentRadius: 0.028 * this.profile.detentWellScale,
      detentPull: this.profile.vibe === 'warm' ? 0.68 : 0.4,
    });

    const regScore = this.computeRegScore();
    const taggedCount = this.stars.filter((s) => s.isAnomaly && s.tagged).length;
    const overall = regScore * 0.45 + (taggedCount / 3) * 0.55;

    const assistTier = this.director.tick(dt, overall);
    const rawOk = computeRawGate(this.profile, this.rawActive);
    const latchOut = this.latch.tick(dt, regScore >= 0.72 && taggedCount >= 3 ? 1.0 : 0.0, rawOk);

    this.ctx.audio?.updateBeatSynth({
      beatHz: (1 - regScore) * 14,
      harmonicLock: overall,
      warmth: this.profile.harmonicWarmthGain,
      strain: latchOut.overclockZone ? 0.85 : 0.1,
    });
    this.ctx.audio?.setWatchdogBed(latchOut.overclockZone ? 0.45 : 0);

    this.ctx.showcase?.applyInstrumentPatch({
      progress: overall,
      seamReveal: taggedCount / 3,
    });

    const beatIndex: 1 | 2 | 3 = regScore < 0.72 ? 1 : taggedCount < 3 ? 2 : 3;
    const beatLabel =
      beatIndex === 1
        ? '01 ISOLATE (DRAG TO STABILIZE EPOCH BLINK)'
        : beatIndex === 2
        ? `02 EXPOSE (CLICK 3 JUMPING OUTLIERS · ${taggedCount}/3)`
        : rawOk
        ? '03 EXTRACT [HOLD SPACE]'
        : '03 OVER-REGULARIZED — PRESS [R]';

    this.ctx.onTelemetry?.({
      beatIndex,
      beatLabel,
      lockMeter: latchOut.lockProgress > 0 ? latchOut.lockProgress : overall,
      overclockZone: latchOut.overclockZone,
      rawResidualActive: this.rawActive,
      canCommitPartial: taggedCount >= 2 && (assistTier >= 3 || overall >= 0.55),
      telemetryReadout: `EPOCH ${this.epochB ? 'B (+14m)' : 'A (T-0)'} · REG ${Math.round(regScore * 100)}% · OUTLIERS ${taggedCount}/3`,
      cueWhisper:
        regScore < 0.72
          ? 'Drag sky to align flickering Epoch A/B stars until background stars freeze'
          : 'Background stars locked — click the 3 foreground stars still jumping between blinks!',
      assistTier,
    });

    if (latchOut.completedGrade) {
      this.commitFinish(latchOut.completedGrade, overall);
      return;
    }

    this.render(recoil.shakeX, recoil.shakeY, regScore, assistTier);
  };

  private render(shakeX: number, shakeY: number, regScore: number, assistTier: number): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const ctx = this.g;
    ctx.clearRect(0, 0, w, h);

    drawReticleFrame(ctx, w, h, this.profile, this.rawActive, this.elapsed, shakeX, shakeY);

    const cx = w * 0.5 + shakeX;
    const cy = h * 0.5 + shakeY;
    const scale = Math.min(w, h) * 0.41;
    const { theme } = this.profile;

    for (const st of this.stars) {
      const shiftX = this.epochB ? this.offsetX.value + (st.isAnomaly ? st.jumpDx : 0) : 0;
      const shiftY = this.epochB ? this.offsetY.value + (st.isAnomaly ? st.jumpDy : 0) : 0;
      const sx = cx + (st.nx + shiftX) * scale;
      const sy = cy + (st.ny + shiftY) * scale;

      ctx.save();
      ctx.fillStyle = st.tagged
        ? theme.accentHex
        : this.epochB
        ? theme.secondaryHex
        : '#fff2d8';
      ctx.beginPath();
      ctx.arc(sx, sy, st.isAnomaly ? 4.2 : 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (st.tagged || (assistTier >= 2 && st.isAnomaly && regScore >= 0.72)) {
        drawCrosshairMarker(ctx, sx, sy, 13, st.tagged, this.profile, assistTier);
      }
    }

    drawFloatingDeltaPill(
      ctx,
      cx,
      cy + scale * 0.85,
      `${this.epochB ? 'EPOCH B (+14m)' : 'EPOCH A (T-0)'} · REG ${Math.round(regScore * 100)}%`,
      this.profile,
      regScore >= 0.72
    );
  }

  private commitFinish(grade: MinigameGrade, accuracy: number): void {
    if (this.finished) return;
    this.finished = true;
    this.ctx.audio?.playCaptureShutter(grade);
    const elapsedSec = Math.round(this.elapsed * 10) / 10;
    const res = resolveInstrumentPayout(
      grade,
      elapsedSec,
      accuracy,
      'antipodal_ephemeris_proof',
      'Dual-epoch blink comparison pinned three identical parallax outliers across opposing horizon poles.',
      `Antipodal Blink Comparator (${grade}) in ${elapsedSec}s.`
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
