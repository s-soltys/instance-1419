import { platform } from '../../platform/PlatformAdapter';
import { computeOpticalClarity, setupFullRetinaCanvas } from './canvasUtils';
import {
  drawAmbientStars,
  drawCosmicPlateBackdrop,
  drawLockResonanceRing,
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

interface StripRect {
  key: 'phase' | 'freq' | 'amp' | 'harm';
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  val01: number;
}

/**
 * WAV-01 — Carina Wave Tuner
 * Match period, phase, amplitude & second-harmonic overtone of dynamic traveling cosmic waves.
 * Misalignment wobbles & splits interference haze; alignment calms into luminous flowing resonance
 * that pulses & clarifies NASA/JWST Carina Nebula.
 */
export class WaveShaperGame implements IMinigame {
  readonly id = 'wave_shaper';
  readonly title = 'CARINA WAVE TUNER';
  readonly subtitle = 'Harmonic Waveform Shaping';
  readonly instrumentCode = 'WAV-01';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private stageFlash = 0;
  private stageFlashText = '';
  private lockHoldSec = 0;
  private readonly lockHoldTargetSec = 0.5;

  private userPhase = 0.2;
  private userFreq = 0.25;
  private userAmp = 0.5;
  private userHarm = 0.15;

  private targetPhase = 0.68;
  private targetFreq = 0.58;
  private targetAmp = 0.66;
  private targetHarm = 0.55;

  private activeDrag: 'wave' | 'phase' | 'freq' | 'amp' | 'harm' | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartPhase = 0;
  private dragStartFreq = 0;
  private activeStrips: StripRect[] = [];
  private ambientStars = generateAmbientStars(createSeededRng('wav-stars'), 48);
  private lastTickAt = 0;
  private prevMatch01 = 0;
  private accSum = 0;
  private accCount = 0;
  private unbind: (() => void) | null = null;

  mount(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.startedAt = performance.now();
    this.completed = false;
    this.stage = 1;
    this.lockHoldSec = 0;
    this.elapsedSec = 0;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minigame-canvas';
    ctx.container.innerHTML = '';
    ctx.container.appendChild(this.canvas);
    this.c2d = setupFullRetinaCanvas(this.canvas);

    this.setupStage(1);
    this.bindEvents();
    this.emitHud(0);
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
    const rng = createSeededRng(`${this.ctx.targetId}:wav:${this.ctx.state.shift}:${stage}`);

    this.targetPhase = 0.22 + rng() * 0.58;
    this.targetFreq = 0.28 + rng() * 0.54;
    this.targetAmp = stage === 1 ? 0.62 : 0.34 + rng() * 0.48;
    this.targetHarm = stage < 3 ? 0 : 0.34 + rng() * 0.52;

    this.userPhase = (this.targetPhase + 0.36) % 0.92;
    this.userFreq = this.targetFreq > 0.5 ? this.targetFreq - 0.34 : this.targetFreq + 0.34;
    this.userAmp = stage === 1 ? this.targetAmp : this.targetAmp > 0.55 ? 0.28 : 0.78;
    this.userHarm = stage < 3 ? 0 : 0.12;
  }

  private sampleWave(
    u: number,
    phase01: number,
    freq01: number,
    amp01: number,
    harm01: number,
    travelOffset = 0,
    wobbleStrength = 0
  ): number {
    const cycles = lerp(1.4, 4.4, freq01);
    const phi = lerp(-Math.PI, Math.PI, phase01) - travelOffset;
    const breath = 1 + 0.05 * Math.sin(this.elapsedSec * 1.8 + u * 2.2);
    const amp = lerp(0.28, 0.94, amp01) * breath;
    let val = amp * Math.sin(u * Math.PI * 2 * cycles + phi);
    if (this.stage >= 3) {
      const hAmp = harm01 * 0.46;
      val += hAmp * Math.sin(u * Math.PI * 2 * (cycles * 2) + phi * 1.35);
    }
    if (wobbleStrength > 0.005) {
      val +=
        wobbleStrength *
        (0.11 * Math.sin(u * 26 + this.elapsedSec * 9.5) +
          0.06 * Math.cos(u * 41 - this.elapsedSec * 13));
    }
    return clamp(val, -1.25, 1.25);
  }

  private computeMatch01(): number {
    const clarity = computeOpticalClarity(this.ctx.state.humanity, this.ctx.state.opticalFidelity);
    const samples = 44;
    let errSq = 0;
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const yT = this.sampleWave(u, this.targetPhase, this.targetFreq, this.targetAmp, this.targetHarm, 0, 0);
      const yU = this.sampleWave(u, this.userPhase, this.userFreq, this.userAmp, this.userHarm, 0, 0);
      const d = yT - yU;
      errSq += d * d;
    }
    const rms = Math.sqrt(errSq / (samples + 1));
    const tol = lerp(0.64, 0.5, 1 - clarity * 0.45);
    return clamp(1 - rms / tol, 0, 1);
  }

  private bindEvents(): void {
    const onResize = () => {
      this.c2d = setupFullRetinaCanvas(this.canvas);
    };

    const getCanvasPos = (clientX: number, clientY: number) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
        w: Math.max(1, rect.width),
        h: Math.max(1, rect.height),
      };
    };

    const onDown = (e: PointerEvent) => {
      if (this.completed) return;
      this.canvas.setPointerCapture(e.pointerId);
      const pos = getCanvasPos(e.clientX, e.clientY);

      for (const s of this.activeStrips) {
        if (pos.x >= s.x - 14 && pos.x <= s.x + s.w + 14 && pos.y >= s.y - 16 && pos.y <= s.y + s.h + 18) {
          this.activeDrag = s.key;
          this.applyStripPos(s, pos.x);
          platform.triggerHaptic('vernierTick', 0.45);
          return;
        }
      }

      this.activeDrag = 'wave';
      this.dragStartX = pos.x;
      this.dragStartY = pos.y;
      this.dragStartPhase = this.userPhase;
      this.dragStartFreq = this.userFreq;
    };

    const onMove = (e: PointerEvent) => {
      if (!this.activeDrag || this.completed) return;
      const pos = getCanvasPos(e.clientX, e.clientY);

      if (this.activeDrag !== 'wave') {
        const s = this.activeStrips.find((item) => item.key === this.activeDrag);
        if (s) this.applyStripPos(s, pos.x);
        return;
      }

      const dx = (pos.x - this.dragStartX) / Math.max(180, pos.w * 0.48);
      const dy = (this.dragStartY - pos.y) / Math.max(140, pos.h * 0.42);
      this.userPhase = clamp(this.dragStartPhase + dx, 0, 1);
      this.userFreq = clamp(this.dragStartFreq + dy, 0, 1);
    };

    const onUp = () => {
      this.activeDrag = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (this.completed) return;
      if (e.key === 'ArrowLeft') this.userPhase = clamp(this.userPhase - 0.03, 0, 1);
      if (e.key === 'ArrowRight') this.userPhase = clamp(this.userPhase + 0.03, 0, 1);
      if (e.key === 'ArrowUp') this.userFreq = clamp(this.userFreq + 0.03, 0, 1);
      if (e.key === 'ArrowDown') this.userFreq = clamp(this.userFreq - 0.03, 0, 1);
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

  private applyStripPos(s: StripRect, clientCanvasX: number): void {
    let v = clamp((clientCanvasX - s.x) / Math.max(1, s.w), 0, 1);
    const snapMagnet = (val: number, target: number) =>
      Math.abs(val - target) < 0.065 ? lerp(val, target, 0.45) : val;
    if (s.key === 'phase') this.userPhase = snapMagnet(v, this.targetPhase);
    if (s.key === 'freq') this.userFreq = snapMagnet(v, this.targetFreq);
    if (s.key === 'amp') this.userAmp = snapMagnet(v, this.targetAmp);
    if (s.key === 'harm') this.userHarm = snapMagnet(v, this.targetHarm);
  }

  private update(dt: number): void {
    if (this.completed) return;
    this.elapsedSec += dt;
    this.stageFlash = Math.max(0, this.stageFlash - dt * 1.4);

    const match = this.computeMatch01();
    this.accSum += match;
    this.accCount += 1;

    if (match > 0.78 && this.elapsedSec - this.lastTickAt > 0.16 && Math.abs(match - this.prevMatch01) > 0.012) {
      this.lastTickAt = this.elapsedSec;
      this.ctx.audio?.playProximityTick?.(match);
      platform.triggerHaptic('proximityPulse', match * 0.55);
    }
    this.prevMatch01 = match;

    const palette = getCosmicPalette(this.ctx.state.humanity);
    const beatHz = (1 - match) * 10.5;
    this.ctx.audio?.updateBeatSynth({
      beatHz,
      harmonicLock: match,
      warmth: palette.mode === 'warm' ? 0.92 : palette.mode === 'cold' ? 0.18 : 0.55,
      strain: 0,
    });

    this.ctx.showcase?.applyInstrumentPatch({
      progress: (this.stage - 1 + match) / 3,
      dustPeel: match,
      jetResonance: match,
      humanity: this.ctx.state.humanity,
    });

    const lockThreshold = this.stage === 1 ? 0.82 : this.stage === 2 ? 0.8 : 0.78;
    if (match >= lockThreshold) {
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        this.advanceStage();
      }
    } else {
      this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.6);
    }

    this.emitHud(match);
  }

  private advanceStage(): void {
    platform.triggerHaptic('phaseSnapLock', 0.95);
    this.ctx.audio?.playPhaseLock?.(this.stage);

    if (this.stage < 3) {
      const next = (this.stage + 1) as 2 | 3;
      this.stageFlash = 1;
      this.stageFlashText = `STAGE ${this.stage} HARMONIC LOCKED`;
      this.setupStage(next);
    } else {
      this.finishSuccess();
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

    const avgAcc = clamp(this.accCount > 0 ? this.accSum / this.accCount : 0.92, 0.72, 1.0);
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.ctx.onComplete(
      resolveInstrumentPayout(
        'clean',
        totalSec,
        avgAcc,
        `${this.ctx.targetId}_wave`,
        `Resonant emission waveform locked across 3 stages on ${this.ctx.targetName}. Ionized Carina filaments aligned without shear.`,
        `Match ${(avgAcc * 100).toFixed(0)}% · ${totalSec.toFixed(1)}s`,
        'Fourier Superposition & Electromagnetic Wave Phase Resonance'
      )
    );
  }

  private emitHud(match: number): void {
    const labelMap: Record<1 | 2 | 3, string> = {
      1: '1/3 · EASY',
      2: '2/3 · MEDIUM',
      3: '3/3 · HARD',
    };
    const promptMap: Record<1 | 2 | 3, string> = {
      1: 'Match the flowing emission wave — watch wobble calm and Carina Nebula pulse into focus.',
      2: 'Match Amplitude + Period + Phase until the golden emission lock ring completes.',
      3: 'Tune the 2nd Harmonic Overtone strip together with fundamental Phase & Period.',
    };
    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: labelMap[this.stage],
      stageProgress: clamp((this.stage - 1 + match) / 3, 0, 1),
      promptText: promptMap[this.stage],
      actionButton: null,
    });
  }

  private render(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const c2d = this.c2d;
    const palette = getCosmicPalette(this.ctx.state.humanity);
    const match = this.computeMatch01();
    const overallClr = clamp((this.stage - 1) * 0.22 + match * 0.78, 0, 1);

    // Reactive background sights: Carina Nebula zooms slightly, breathes & brightens as waves lock
    const reactivePulse = 0.014 * match * Math.sin(this.elapsedSec * 2.2);
    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'carina',
      blurPx: lerp(13, 0, overallClr),
      alpha: lerp(0.54, 0.96, overallClr),
      brightness: lerp(0.62, 1.18, overallClr) + match * 0.09 * Math.sin(this.elapsedSec * 2.6),
      scale: lerp(1.1, 1.02, overallClr) + reactivePulse,
      tintAlpha: lerp(0.46, 0.16, overallClr),
      gridAlpha: palette.mode === 'cold' ? 0.14 : 0.06,
    });

    // Ambient starfield reacts dynamically with gentle harmonic drift scaled by wave match
    c2d.save();
    c2d.translate(Math.sin(this.elapsedSec * (0.4 + match * 0.8)) * 6, 0);
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec * (1 + match * 0.9), 0.72 + match * 0.28);
    c2d.restore();

    const waveLeft = w * 0.11;
    const waveRight = w * 0.89;
    const waveW = waveRight - waveLeft;
    const compact = h < 450;
    const waveCy = compact ? h * 0.41 : h * 0.45;
    const waveAmpPx = compact ? h * 0.17 : h * 0.19;

    const travel = this.elapsedSec * 2.2;
    const wobble = clamp((1 - match) * 1.2, 0, 1);
    const steps = 128;

    const targetPts: Array<{ x: number; y: number }> = [];
    const userPts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = waveLeft + u * waveW;
      const yt = waveCy - this.sampleWave(u, this.targetPhase, this.targetFreq, this.targetAmp, this.targetHarm, travel, 0) * waveAmpPx;
      const yu = waveCy - this.sampleWave(u, this.userPhase, this.userFreq, this.userAmp, this.userHarm, travel, wobble) * waveAmpPx;
      targetPts.push({ x, y: yt });
      userPts.push({ x, y: yu });
    }

    // Baseline axis
    c2d.save();
    c2d.strokeStyle = 'rgba(200, 224, 248, 0.18)';
    c2d.lineWidth = 1;
    c2d.setLineDash([4, 6]);
    c2d.beginPath();
    c2d.moveTo(waveLeft, waveCy);
    c2d.lineTo(waveRight, waveCy);
    c2d.stroke();
    c2d.restore();

    // Translucent interference ribbon between mismatched waves
    if (match < 0.92) {
      c2d.save();
      c2d.beginPath();
      for (let i = 0; i <= steps; i++) {
        if (i === 0) c2d.moveTo(targetPts[i].x, targetPts[i].y);
        else c2d.lineTo(targetPts[i].x, targetPts[i].y);
      }
      for (let i = steps; i >= 0; i--) {
        c2d.lineTo(userPts[i].x, userPts[i].y);
      }
      c2d.closePath();
      c2d.fillStyle = `rgba(${palette.accentRgb}, ${(0.12 * (1 - match)).toFixed(3)})`;
      c2d.fill();
      c2d.restore();
    }

    // Target traveling wave (dashed luminous reference)
    c2d.save();
    c2d.strokeStyle = `rgba(255, 255, 255, ${(0.42 + match * 0.22).toFixed(2)})`;
    c2d.lineWidth = 2.2;
    c2d.setLineDash([7, 6]);
    c2d.beginPath();
    for (let i = 0; i <= steps; i++) {
      if (i === 0) c2d.moveTo(targetPts[i].x, targetPts[i].y);
      else c2d.lineTo(targetPts[i].x, targetPts[i].y);
    }
    c2d.stroke();
    c2d.restore();

    // Chromatic ghost echo when misaligned
    if (wobble > 0.12) {
      c2d.save();
      c2d.strokeStyle = `rgba(255, 118, 92, ${(0.28 * wobble).toFixed(2)})`;
      c2d.lineWidth = 1.6;
      c2d.beginPath();
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const yGhost = userPts[i].y + Math.sin(u * 20 - this.elapsedSec * 7) * 7 * wobble;
        if (i === 0) c2d.moveTo(userPts[i].x, yGhost);
        else c2d.lineTo(userPts[i].x, yGhost);
      }
      c2d.stroke();
      c2d.restore();
    }

    // Player live glowing wave
    const waveColor = match >= 0.88 ? palette.lockHex : palette.accentHex;
    c2d.save();
    c2d.strokeStyle = waveColor;
    c2d.lineWidth = 3.2;
    c2d.shadowColor = waveColor;
    c2d.shadowBlur = lerp(10, 24, match);
    c2d.beginPath();
    for (let i = 0; i <= steps; i++) {
      if (i === 0) c2d.moveTo(userPts[i].x, userPts[i].y);
      else c2d.lineTo(userPts[i].x, userPts[i].y);
    }
    c2d.stroke();
    c2d.restore();

    // Glowing harmonic crest energy particles flowing rightward along the wave
    const moteCount = 6;
    c2d.save();
    for (let m = 0; m < moteCount; m++) {
      const u = ((this.elapsedSec * (0.28 + match * 0.24) + m / moteCount) % 1);
      const idx = Math.min(steps, Math.floor(u * steps));
      const pt = userPts[idx];
      c2d.fillStyle = match >= 0.86 ? '#ffffff' : waveColor;
      c2d.globalAlpha = 0.45 + match * 0.55;
      c2d.beginPath();
      c2d.arc(pt.x, pt.y, 2.5 + match * 2.2, 0, Math.PI * 2);
      c2d.fill();
    }
    c2d.restore();

    // Sleek hairline control strips
    const stripSpecs: Array<{ key: StripRect['key']; label: string; val01: number }> = [
      { key: 'phase', label: 'PHASE', val01: this.userPhase },
      { key: 'freq', label: 'FREQUENCY', val01: this.userFreq },
    ];
    if (this.stage >= 2) stripSpecs.push({ key: 'amp', label: 'AMPLITUDE', val01: this.userAmp });
    if (this.stage >= 3) stripSpecs.push({ key: 'harm', label: '2X HARMONIC', val01: this.userHarm });

    const totalStripAreaW = Math.min(w * 0.78, stripSpecs.length * 205);
    const gap = 18;
    const eachW = (totalStripAreaW - gap * (stripSpecs.length - 1)) / stripSpecs.length;
    const startX = (w - totalStripAreaW) * 0.5;
    const stripY = compact ? h - 78 : h - 102;

    this.activeStrips = stripSpecs.map((spec, idx) => ({
      ...spec,
      x: startX + idx * (eachW + gap),
      y: stripY,
      w: eachW,
      h: 18,
    }));

    const isParamLocked = (key: StripRect['key']) => {
      if (key === 'phase') return Math.abs(this.userPhase - this.targetPhase) <= 0.09;
      if (key === 'freq') return Math.abs(this.userFreq - this.targetFreq) <= 0.09;
      if (key === 'amp') return Math.abs(this.userAmp - this.targetAmp) <= 0.09;
      return Math.abs(this.userHarm - this.targetHarm) <= 0.09;
    };

    c2d.save();
    for (const s of this.activeStrips) {
      const stripCol = isParamLocked(s.key) ? palette.lockHex : waveColor;
      c2d.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = isParamLocked(s.key) ? palette.lockHex : 'rgba(220, 236, 250, 0.78)';
      c2d.textAlign = 'left';
      c2d.fillText(s.label, s.x, s.y - 6);

      c2d.textAlign = 'right';
      c2d.fillStyle = stripCol;
      c2d.fillText(`${Math.round(s.val01 * 100)}%`, s.x + s.w, s.y - 6);

      const lineY = s.y + 6;
      c2d.fillStyle = 'rgba(255, 255, 255, 0.16)';
      c2d.fillRect(s.x, lineY - 1, s.w, 2);

      const knobX = s.x + s.val01 * s.w;
      c2d.fillStyle = stripCol;
      c2d.fillRect(s.x, lineY - 1.5, s.val01 * s.w, 3);

      c2d.beginPath();
      c2d.arc(knobX, lineY, 6.5, 0, Math.PI * 2);
      c2d.fillStyle = '#07101c';
      c2d.fill();
      c2d.lineWidth = 2;
      c2d.strokeStyle = stripCol;
      c2d.stroke();
    }
    c2d.restore();

    if (this.lockHoldSec > 0.02) {
      drawLockResonanceRing(
        c2d,
        w * 0.5,
        waveCy,
        compact ? 42 : 54,
        this.lockHoldSec / this.lockHoldTargetSec,
        palette.lockHex,
        `LOCKING ${Math.round((this.lockHoldSec / this.lockHoldTargetSec) * 100)}%`
      );
    }

    drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, palette.lockHex);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Real JWST spectroscopy decomposes nebular light into dynamic harmonic waves: period sets wavelength, phase aligns interference, and higher harmonics shape ionized ridges.',
      goalSummary:
        'Match the flowing emission curve across 3 progressive stages (Period+Phase → +Amplitude → +2x Harmonic) to calm interference wobble and bring Carina Nebula into focus.',
      controlsDesktop: 'Drag directly on the wave or drag the hairline strips below; Arrow keys also fine-tune.',
      controlsTouch: 'Touch and drag directly on the wave or hairline strips below.',
      warmthEffect: 'Warm H% gives generous amber phase lock tolerances; Cold H% sharpens clinical blue grids.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        this.userPhase = this.targetPhase;
        this.userFreq = this.targetFreq;
        this.userAmp = this.targetAmp;
        this.userHarm = this.targetHarm;
        if (stage < 3) {
          this.stage = (stage + 1) as 2 | 3;
          this.setupStage(this.stage);
        } else {
          this.finishSuccess();
        }
      },
      getDiagnostics: () => ({
        stage: this.stage,
        completed: this.completed,
        stageProgress: this.completed ? 1 : (this.stage - 1 + this.computeMatch01()) / 3,
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
