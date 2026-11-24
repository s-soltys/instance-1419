import { setupFullRetinaCanvas } from './canvasUtils';
import {
  bindCanvasPress,
  computeRawGate,
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

interface FourierBin {
  k: number; // harmonic index 1..6
  isSignal: boolean;
  targetGain: number; // 1.0 for signal, 0.0 for noise
  userGain: number;   // player-painted 0..1 gain
  jitterPhase: number;
}

export class FourierSkySieve implements IMinigame {
  readonly id = 'fourier_sieve';
  readonly title = 'FOURIER SKY SIEVE';
  readonly subtitle = 'Interactive Harmonic Decomposition · Carrier Phase Unison';
  readonly instrumentCode = 'FFT-02';

  private ctx!: MinigameContext;
  private profile!: CognitiveInstrumentProfile;
  private canvas!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private unbindInput: (() => void) | null = null;
  private resizeObs: ResizeObserver | null = null;

  private bins: FourierBin[] = [];
  private phaseSpring = new SpringActuator(0);
  private targetPhase = 0;
  private dragMode: 'none' | 'bins' | 'phase' = 'none';

  private rawActive = false;
  private latch = new LatchController();
  private director = new StuckTimeDirector();
  private hitstop = new HitstopRecoil();
  private rafId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private finished = false;
  private wasMatchOk = false;

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

    const rand = createSeededRng(`fft-${ctx.targetId}-${ctx.state.shift}`);
    const signalMask = [true, false, true, false, true, false];
    // Deterministic shuffle of 3 signal / 3 noise bins
    for (let i = signalMask.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [signalMask[i], signalMask[j]] = [signalMask[j], signalMask[i]];
    }

    this.bins = signalMask.map((isSig, idx) => ({
      k: idx + 1,
      isSignal: isSig,
      targetGain: isSig ? 0.92 : 0.08,
      // Start scrambled: noise high, true harmonics veiled
      userGain: isSig ? 0.25 + rand() * 0.15 : 0.72 + rand() * 0.2,
      jitterPhase: rand() * 6.28,
    }));

    this.targetPhase = (rand() - 0.5) * 1.4;
    this.phaseSpring.snap(this.targetPhase + 0.85);

    this.unbindInput = bindCanvasPress(this.canvas, {
      onDown: (x, y, w, h) => this.handlePointer(x, y, w, h, true),
      onMove: (x, y, w, h) => {
        if (this.dragMode !== 'none') this.handlePointer(x, y, w, h, false);
      },
      onUp: () => {
        this.dragMode = 'none';
      },
      onWheel: (dy) => {
        this.phaseSpring.target += dy * 0.002;
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
    if (this.finished) return;
    if (this.computeSpectrumScore() >= 0.55) {
      this.commitFinish('partial', 0.65);
    }
  }

  private getPanelBounds(w: number, h: number) {
    return {
      px: 26,
      py: Math.max(76, h * 0.16),
      pw: Math.min(285, w * 0.27),
      ph: Math.min(340, h * 0.58),
    };
  }

  private handlePointer(x: number, y: number, w: number, h: number, isDown: boolean): void {
    if (this.finished) return;
    const panel = this.getPanelBounds(w, h);
    const specTop = panel.py + panel.ph * 0.44;
    const specBot = panel.py + panel.ph - 18;
    const inPanel = x >= panel.px && x <= panel.px + panel.pw && y >= specTop && y <= specBot;

    if (isDown) {
      if (inPanel) {
        this.dragMode = 'bins';
      } else {
        this.dragMode = 'phase';
      }
    }

    if (this.dragMode === 'bins' && x >= panel.px && x <= panel.px + panel.pw) {
      const binW = (panel.pw - 24) / this.bins.length;
      const idx = Math.floor((x - (panel.px + 12)) / binW);
      if (idx >= 0 && idx < this.bins.length) {
        const val = clamp((specBot - y) / Math.max(1, specBot - specTop), 0, 1);
        this.bins[idx].userGain = val;
        if (isDown) this.ctx.audio?.playTumblerClick(val, false);
      }
    } else if (this.dragMode === 'phase') {
      const cx = w * 0.5;
      const cy = h * 0.5;
      this.phaseSpring.target = Math.atan2(y - cy, x - cx);
    }
  }

  private computeSpectrumScore(): number {
    let err = 0;
    for (const b of this.bins) {
      err += Math.abs(b.userGain - b.targetGain);
    }
    const maxErr = this.bins.length * 0.72;
    return clamp(1 - err / maxErr, 0, 1);
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

    const phase = this.phaseSpring.step(dt, {
      stiffness: 185,
      damping: 22,
      detentCenter: this.targetPhase,
      detentRadius: 0.16 * this.profile.detentWellScale,
      detentPull: this.profile.vibe === 'warm' ? 0.65 : 0.4,
    });

    const specScore = this.computeSpectrumScore();
    const bandMatch = this.ctx.bandIdx === 3 ? 1.0 : this.ctx.bandIdx === 2 ? 0.65 : 0.25;
    const phaseErr = Math.abs(Math.atan2(Math.sin(phase - this.targetPhase), Math.cos(phase - this.targetPhase)));
    const phaseScore = clamp(1 - phaseErr / (0.36 / this.profile.snapPrecisionMul), 0, 1);

    const matchOk = specScore >= 0.74 && bandMatch >= 0.85;
    if (matchOk && !this.wasMatchOk) {
      this.wasMatchOk = true;
      this.hitstop.trigger(40, 4);
      this.ctx.audio?.playTumblerClick(0.95, true);
    }

    const overall = specScore * 0.48 + bandMatch * 0.22 + phaseScore * 0.30;
    const assistTier = this.director.tick(dt, overall);
    const rawOk = computeRawGate(this.profile, this.rawActive);
    const latchOut = this.latch.tick(dt, Math.min(specScore, phaseScore, bandMatch), rawOk);

    // Real-time stereo Fourier beat oscillator!
    this.ctx.audio?.updateBeatSynth({
      beatHz: (1 - specScore) * 14 + phaseErr * 12,
      harmonicLock: overall,
      warmth: this.profile.harmonicWarmthGain,
      strain: latchOut.overclockZone ? clamp((latchOut.lockProgress - 0.85) * 3, 0, 1) : 0,
    });
    this.ctx.audio?.setWatchdogBed(latchOut.overclockZone ? 0.45 : 0);

    // Live 3D Carina dust pillar clearing shader coupling!
    this.ctx.showcase?.applyInstrumentPatch({
      progress: overall,
      dustPeel: clamp(specScore * 0.72 + bandMatch * 0.28, 0, 0.96),
      jetResonance: phaseScore,
    });

    const beatIndex: 1 | 2 | 3 = specScore < 0.72 || bandMatch < 0.85 ? 1 : phaseScore < 0.78 ? 2 : 3;
    const beatLabel =
      beatIndex === 1
        ? '01 ISOLATE (MID-IR [4] + SIEVE NOISE BINS)'
        : beatIndex === 2
        ? '02 EXPOSE (DRAG RETICLE TO ZERO BEAT HZ)'
        : rawOk
        ? '03 EXTRACT [HOLD SPACE]'
        : '03 OVER-REGULARIZED — PRESS [R]';

    this.ctx.onTelemetry?.({
      beatIndex,
      beatLabel,
      lockMeter: latchOut.lockProgress > 0 ? latchOut.lockProgress : overall,
      overclockZone: latchOut.overclockZone,
      rawResidualActive: this.rawActive,
      canCommitPartial: specScore >= 0.55 && (assistTier >= 3 || overall >= 0.5),
      telemetryReadout: `FFT ${Math.round(specScore * 100)}% · BEAT ${((1 - overall) * 18).toFixed(1)}Hz · MID-IR ${Math.round(bandMatch * 100)}%`,
      cueWhisper:
        this.ctx.bandIdx !== 3
          ? 'Switch spectrum band to MID-IR [4] to peel dust veil'
          : specScore < 0.74
          ? 'Paint left spectrum bars: raise golden hydrogen bins, pull down red dust spikes'
          : 'Drag around center reticle to null carrier beat frequency to 0.0 Hz',
      assistTier,
    });

    if (latchOut.completedGrade) {
      this.commitFinish(latchOut.completedGrade, overall);
      return;
    }

    this.render(recoil.shakeX, recoil.shakeY, specScore, phase, phaseScore, assistTier);
  };

  private render(
    shakeX: number,
    shakeY: number,
    specScore: number,
    phase: number,
    phaseScore: number,
    assistTier: number
  ): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const ctx = this.g;
    ctx.clearRect(0, 0, w, h);

    drawReticleFrame(ctx, w, h, this.profile, this.rawActive, this.elapsed, shakeX, shakeY);

    const { theme } = this.profile;
    const panel = this.getPanelBounds(w, h);

    // 1. Floating Glass Fourier Decomposition Card (side-docked, leaving center 3D nebula wide open)
    ctx.save();
    ctx.fillStyle = 'rgba(7, 11, 18, 0.68)';
    ctx.strokeStyle = `rgba(${theme.accentRgb}, 0.34)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(panel.px, panel.py, panel.pw, panel.ph, 8);
    ctx.fill();
    ctx.stroke();

    // Waveform IFFT reconstruction preview (top half)
    const waveX = panel.px + 12;
    const waveY = panel.py + 16;
    const waveW = panel.pw - 24;
    const waveH = panel.ph * 0.32;

    // Ghost Target IFFT curve
    ctx.strokeStyle = `rgba(${theme.secondaryRgb}, 0.28)`;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      let val = 0;
      for (const b of this.bins) val += b.targetGain * Math.sin(b.k * t + this.targetPhase * 0.6);
      const px = waveX + (i / 64) * waveW;
      const py = waveY + waveH * 0.5 - val * (waveH * 0.22);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Player Live IFFT curve
    ctx.strokeStyle = theme.accentHex;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      let val = 0;
      for (const b of this.bins) val += b.userGain * Math.sin(b.k * t + phase * 0.6);
      const px = waveX + (i / 64) * waveW;
      const py = waveY + waveH * 0.5 - val * (waveH * 0.22);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Interactive 6-Bin FFT Spectrum Mixer (bottom half)
    const specTop = panel.py + panel.ph * 0.44;
    const specBot = panel.py + panel.ph - 18;
    const specH = specBot - specTop;
    const binW = waveW / this.bins.length;

    for (let i = 0; i < this.bins.length; i++) {
      const b = this.bins[i];
      const bx = panel.px + 12 + i * binW + 4;
      const bw = binW - 8;
      const bh = b.userGain * specH;

      // Target guide marker (brighter in Cold or Assist Tier 2+)
      if (b.isSignal || assistTier >= 2 || this.profile.showNumericDeltas) {
        const ty = specBot - b.targetGain * specH;
        ctx.strokeStyle = b.isSignal ? theme.accentHex : theme.dangerHex;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bx - 2, ty);
        ctx.lineTo(bx + bw + 2, ty);
        ctx.stroke();
      }

      ctx.fillStyle = b.isSignal
        ? `rgba(${theme.accentRgb}, 0.72)`
        : `rgba(255, 88, 108, ${0.42 + 0.25 * Math.sin(this.elapsed * 4 + b.jitterPhase)})`;
      ctx.fillRect(bx, specBot - bh, bw, bh);

      ctx.fillStyle = `rgba(${theme.secondaryRgb}, 0.7)`;
      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`k${b.k}`, bx + bw * 0.5, specBot + 11);
    }
    ctx.restore();

    // 2. Center Reticle Phase Dial Ring
    const cx = w * 0.5 + shakeX;
    const cy = h * 0.5 + shakeY;
    const dialR = Math.min(w, h) * 0.30;

    ctx.save();
    ctx.strokeStyle = phaseScore >= 0.78 ? theme.accentHex : `rgba(${theme.secondaryRgb}, 0.45)`;
    ctx.lineWidth = phaseScore >= 0.78 ? 2.5 : 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, dialR, phase - 0.45, phase + 0.45);
    ctx.stroke();

    // Target ghost tick on dial
    ctx.strokeStyle = `rgba(${theme.accentRgb}, ${0.35 + specScore * 0.45})`;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(this.targetPhase) * (dialR - 10), cy + Math.sin(this.targetPhase) * (dialR - 10));
    ctx.lineTo(cx + Math.cos(this.targetPhase) * (dialR + 10), cy + Math.sin(this.targetPhase) * (dialR + 10));
    ctx.stroke();

    // Phase knob
    const kx = cx + Math.cos(phase) * dialR;
    const ky = cy + Math.sin(phase) * dialR;
    ctx.fillStyle = phaseScore >= 0.78 ? theme.accentHex : theme.secondaryHex;
    ctx.beginPath();
    ctx.arc(kx, ky, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawFloatingDeltaPill(
      ctx,
      cx,
      cy + dialR + 22,
      `FFT ${Math.round(specScore * 100)}% · PHASE ${Math.round(phaseScore * 100)}%`,
      this.profile,
      phaseScore >= 0.78 && specScore >= 0.74
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
      'carina_fft_residual',
      'Fourier synthesis isolated coherent hydrogen beats beneath opaque Mid-IR dust cliffs.',
      `Fourier Sky Sieve (${grade}) in ${elapsedSec}s.`
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
