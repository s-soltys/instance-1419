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
  key: 'speedA' | 'speedB' | 'phase';
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  val01: number;
}

interface SizePill {
  label: 'SMALL' | 'MEDIUM' | 'GIANT';
  depthVal: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * TRN-08 — Exoplanet Transit Lab
 * Differentiated tactile orbital physics (Kepler's 3rd Law): drag planet orbits directly
 * inward/outward to tune speed, drag around the star to shift phase, and toggle Stage 3
 * SMALL/MEDIUM/GIANT planet sizes while watching the live transit dip curve match!
 */
export class ExoplanetTransitGame implements IMinigame {
  readonly id = 'exoplanet_transit';
  readonly title = 'EXOPLANET TRANSIT LAB';
  readonly subtitle = 'Keplerian Orbit & Transit Matching';
  readonly instrumentCode = 'TRN-08';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private lockHoldSec = 0;
  private readonly lockHoldTargetSec = 0.55;
  private stageFlash = 0;
  private stageFlashText = '';

  private userSpeedA = 0.3;
  private userSpeedB = 0.65;
  private userPhase = 0.2;
  private userDepth = 0.55;

  private targetSpeedA = 0.6;
  private targetSpeedB = 0.35;
  private targetPhase = 0.55;
  private targetDepth = 0.55;

  private dragMode: StripRect['key'] | 'orbitA' | 'orbitB' | null = null;
  private activeStrips: StripRect[] = [];
  private sizePills: SizePill[] = [];
  private ambientStars = generateAmbientStars(createSeededRng('trn-stars'), 44);
  private accSum = 0;
  private accCount = 0;
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
    const rng = createSeededRng(`${this.ctx.targetId}:trn:${this.ctx.state.shift}:${stage}`);

    this.targetSpeedA = 0.28 + rng() * 0.54;
    this.targetSpeedB = stage === 1 ? 0.5 : 0.24 + rng() * 0.56;
    this.targetPhase = 0.22 + rng() * 0.58;
    const sizeChoices = [0.2, 0.55, 0.9];
    this.targetDepth = stage < 3 ? 0.55 : sizeChoices[Math.floor(rng() * 3)];

    this.userSpeedA = this.targetSpeedA > 0.5 ? 0.22 : 0.8;
    this.userSpeedB = stage === 1 ? this.targetSpeedB : this.targetSpeedB > 0.5 ? 0.18 : 0.82;
    this.userPhase = (this.targetPhase + 0.36) % 0.92;
    this.userDepth = stage < 3 ? this.targetDepth : this.targetDepth === 0.55 ? 0.2 : 0.55;
  }

  private evalLightCurve(
    u: number,
    speedA: number,
    speedB: number,
    phase: number,
    depth: number,
    withFlareNoise: boolean
  ): number {
    const freqA = lerp(1.0, 3.0, speedA);
    const phi = phase * Math.PI * 2;
    const pA = Math.sin(u * Math.PI * 2 * freqA + phi);
    let dip = pA > 0.78 ? Math.pow((pA - 0.78) / 0.22, 1.3) * lerp(0.38, 0.9, depth) : 0;

    if (this.stage >= 2) {
      const freqB = lerp(2.0, 5.0, speedB);
      const pB = Math.sin(u * Math.PI * 2 * freqB + phi * 1.4 + 1.1);
      if (pB > 0.82) {
        dip += Math.pow((pB - 0.82) / 0.18, 1.3) * 0.36;
      }
    }

    if (withFlareNoise && this.stage === 3) {
      dip += 0.035 * Math.sin(u * 38 + 0.7);
    }

    return clamp(1 - dip, 0.08, 1.05);
  }

  private computeMatch01(): number {
    const clarity = computeOpticalClarity(this.ctx.state.humanity, this.ctx.state.opticalFidelity);
    const samples = 60;
    let errSq = 0;
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const yt = this.evalLightCurve(u, this.targetSpeedA, this.targetSpeedB, this.targetPhase, this.targetDepth, false);
      const yu = this.evalLightCurve(u, this.userSpeedA, this.userSpeedB, this.userPhase, this.userDepth, false);
      const d = yt - yu;
      errSq += d * d;
    }
    const rms = Math.sqrt(errSq / (samples + 1));
    // More forgiving matching (~30% wider tolerance vs Iteration 1)
    const tol = lerp(0.38, 0.3, 1 - clarity * 0.45);
    return clamp(1 - rms / tol, 0, 1);
  }

  private getOrbitGeometry(w: number, h: number) {
    const compact = h < 450;
    const starCx = w * 0.5;
    const starCy = compact ? h * 0.24 : h * 0.26;
    const starR = compact ? 20 : 28;
    const minRx = Math.min(w * 0.12, 74);
    const maxRx = Math.min(w * 0.36, 255);
    return { starCx, starCy, starR, minRx, maxRx, compact };
  }

  private bindEvents(): void {
    const onResize = () => {
      this.c2d = setupFullRetinaCanvas(this.canvas);
    };

    const snap = (v: number, t: number) => (Math.abs(v - t) < 0.065 ? lerp(v, t, 0.42) : v);

    const applyStrip = (s: StripRect, px: number) => {
      const v = clamp((px - s.x) / Math.max(1, s.w), 0, 1);
      if (s.key === 'speedA') this.userSpeedA = snap(v, this.targetSpeedA);
      if (s.key === 'speedB') this.userSpeedB = snap(v, this.targetSpeedB);
      if (s.key === 'phase') this.userPhase = snap(v, this.targetPhase);
    };

    const applyOrbitDrag = (which: 'orbitA' | 'orbitB', px: number, py: number, w: number, h: number) => {
      const { starCx, starCy, minRx, maxRx } = this.getOrbitGeometry(w, h);
      const dx = Math.abs(px - starCx);
      // Kepler's 3rd Law: radial inward = tighter faster orbit (higher speed); outward = slower!
      const fracOutward = clamp((dx - minRx) / Math.max(1, maxRx - minRx), 0, 1);
      const nextSpeed = 1 - fracOutward;
      if (which === 'orbitA') this.userSpeedA = snap(nextSpeed, this.targetSpeedA);
      else this.userSpeedB = snap(nextSpeed, this.targetSpeedB);

      // Horizontal angle shifts orbital transit timing cleanly
      const angFrac = clamp(((px - starCx) / Math.max(60, maxRx)) * 0.3 + 0.5, 0, 1);
      if (Math.abs(py - starCy) < 80) {
        this.userPhase = snap(angFrac, this.targetPhase);
      }
    };

    const onDown = (e: PointerEvent) => {
      if (this.completed) return;
      this.canvas.setPointerCapture(e.pointerId);
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);

      // Stage 3 Planet Size Pill clicks
      for (const pill of this.sizePills) {
        if (px >= pill.x && px <= pill.x + pill.w && py >= pill.y && py <= pill.y + pill.h) {
          this.userDepth = pill.depthVal;
          this.ctx.audio?.playTumblerClick(0.8, Math.abs(this.userDepth - this.targetDepth) < 0.1);
          platform.triggerHaptic('vernierTick', 0.6);
          return;
        }
      }

      for (const s of this.activeStrips) {
        if (px >= s.x - 14 && px <= s.x + s.w + 14 && py >= s.y - 18 && py <= s.y + s.h + 18) {
          this.dragMode = s.key;
          applyStrip(s, px);
          platform.triggerHaptic('vernierTick', 0.45);
          return;
        }
      }

      const { starCy, minRx, maxRx } = this.getOrbitGeometry(w, h);
      if (py < starCy + 95) {
        const rxA = lerp(maxRx * 0.85, minRx, this.userSpeedA);
        const rxB = lerp(maxRx, minRx * 1.1, this.userSpeedB);
        if (this.stage >= 2 && Math.abs(Math.abs(px - w * 0.5) - rxB) < Math.abs(Math.abs(px - w * 0.5) - rxA)) {
          this.dragMode = 'orbitB';
        } else {
          this.dragMode = 'orbitA';
        }
        applyOrbitDrag(this.dragMode, px, py, w, h);
        platform.triggerHaptic('vernierTick', 0.45);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!this.dragMode || this.completed) return;
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      if (this.dragMode === 'orbitA' || this.dragMode === 'orbitB') {
        applyOrbitDrag(this.dragMode, px, py, Math.max(1, rect.width), Math.max(1, rect.height));
      } else {
        const s = this.activeStrips.find((item) => item.key === this.dragMode);
        if (s) applyStrip(s, px);
      }
    };

    const onUp = () => {
      this.dragMode = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (this.completed) return;
      if (e.key === 'ArrowLeft') this.userPhase = clamp(this.userPhase - 0.03, 0, 1);
      if (e.key === 'ArrowRight') this.userPhase = clamp(this.userPhase + 0.03, 0, 1);
      if (e.key === 'ArrowUp') this.userSpeedA = clamp(this.userSpeedA + 0.03, 0, 1);
      if (e.key === 'ArrowDown') this.userSpeedA = clamp(this.userSpeedA - 0.03, 0, 1);
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

    const match = this.computeMatch01();
    this.accSum += match;
    this.accCount += 1;

    const palette = getCosmicPalette(this.ctx.state.humanity);
    this.ctx.audio?.updateBeatSynth({
      beatHz: (1 - match) * 8,
      harmonicLock: match,
      warmth: palette.mode === 'warm' ? 0.9 : palette.mode === 'cold' ? 0.2 : 0.55,
      strain: 0,
    });

    const stageThreshold = this.stage === 1 ? 0.82 : 0.81;
    if (match >= stageThreshold) {
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        platform.triggerHaptic('phaseSnapLock', 0.95);
        this.ctx.audio?.playPhaseLock?.(this.stage);
        if (this.stage < 3) {
          this.stageFlash = 1;
          this.stageFlashText = `TRANSIT ORBIT ${this.stage}/3 CONFIRMED`;
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
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.ctx.audio?.stopInstrumentAudio();
    this.ctx.audio?.playCaptureShutter('clean');
    platform.triggerHaptic('shutterCommit', 1.0);

    const avgAcc = clamp(this.accCount > 0 ? this.accSum / this.accCount : 0.92, 0.74, 1.0);
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.ctx.onComplete(
      resolveInstrumentPayout(
        'clean',
        totalSec,
        avgAcc,
        `${this.ctx.targetId}_transit`,
        `Exoplanet Keplerian orbit & photometric transit matched across 3 systems on ${this.ctx.targetName}.`,
        `Light-Curve Match ${(avgAcc * 100).toFixed(0)}% · ${totalSec.toFixed(1)}s`,
        'Kepler’s Third Law & Photometric Exoplanet Transits'
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
      1: 'Drag the orbit ring wider/tighter (or sliders below) until your planet transit dims match the dashed starlight dip.',
      2: 'Tune both Planet A & B orbits (tighter = faster) to match the dual observed photometric dips.',
      3: 'Align both orbits and select SMALL / MEDIUM / GIANT planet size through stellar flicker.',
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
    const { starCx, starCy, starR, minRx, maxRx, compact } = this.getOrbitGeometry(w, h);

    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'carina',
      blurPx: 4,
      alpha: 0.44,
      brightness: 0.78,
      scale: 1.03,
      tintAlpha: 0.48,
      gridAlpha: palette.mode === 'cold' ? 0.14 : 0.05,
    });
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, 0.75);

    const uLive = (this.elapsedSec * 0.16) % 1;
    const liveFlux = this.evalLightCurve(uLive, this.userSpeedA, this.userSpeedB, this.userPhase, this.userDepth, false);

    c2d.save();
    const g = c2d.createRadialGradient(starCx, starCy, 4, starCx, starCy, starR * (2.6 + liveFlux * 0.6));
    g.addColorStop(0, '#fffdf2');
    g.addColorStop(0.32, '#ffd485');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c2d.globalAlpha = 0.65 + liveFlux * 0.35;
    c2d.fillStyle = g;
    c2d.beginPath();
    c2d.arc(starCx, starCy, starR * 3.1, 0, Math.PI * 2);
    c2d.fill();

    c2d.fillStyle = '#fff5d8';
    c2d.beginPath();
    c2d.arc(starCx, starCy, starR, 0, Math.PI * 2);
    c2d.fill();
    c2d.restore();

    const aLocked = Math.abs(this.userSpeedA - this.targetSpeedA) <= 0.095;
    const bLocked = Math.abs(this.userSpeedB - this.targetSpeedB) <= 0.095;

    const drawPlanetOrbit = (rx: number, ry: number, angle: number, planetR: number, ringCol: string, locked: boolean) => {
      c2d.save();
      c2d.strokeStyle = locked ? palette.lockHex : 'rgba(200, 224, 248, 0.28)';
      c2d.lineWidth = locked ? 1.8 : 1.1;
      c2d.beginPath();
      c2d.ellipse(starCx, starCy, rx, ry, 0, 0, Math.PI * 2);
      c2d.stroke();

      const px = starCx + Math.sin(angle) * rx;
      const py = starCy + Math.cos(angle) * ry;
      const inFront = Math.cos(angle) > 0;
      c2d.fillStyle = inFront ? '#070b14' : ringCol;
      c2d.strokeStyle = locked ? palette.lockHex : ringCol;
      c2d.lineWidth = 1.8;
      c2d.beginPath();
      c2d.arc(px, py, planetR, 0, Math.PI * 2);
      c2d.fill();
      c2d.stroke();
      c2d.restore();
    };

    const phi = this.userPhase * Math.PI * 2;
    const freqA = lerp(1.0, 3.0, this.userSpeedA);
    // Kepler's 3rd Law visual: wider orbit radius = lower orbital speed!
    const rxA = lerp(maxRx * 0.85, minRx, this.userSpeedA);
    drawPlanetOrbit(
      rxA,
      compact ? 14 : 20,
      uLive * Math.PI * 2 * freqA + phi,
      lerp(5.5, 11.5, this.userDepth),
      aLocked ? palette.lockHex : palette.accentHex,
      aLocked
    );

    if (this.stage >= 2) {
      const freqB = lerp(2.0, 5.0, this.userSpeedB);
      const rxB = lerp(maxRx, minRx * 1.12, this.userSpeedB);
      drawPlanetOrbit(
        rxB,
        compact ? 20 : 28,
        uLive * Math.PI * 2 * freqB + phi * 1.4 + 1.1,
        6,
        bLocked ? palette.lockHex : palette.secondaryHex,
        bLocked
      );
    }

    // Photometric Light Curve graph below star
    const gLeft = w * 0.14;
    const gRight = w * 0.86;
    const gW = gRight - gLeft;
    const gTop = compact ? h * 0.43 : h * 0.45;
    const gH = compact ? h * 0.2 : h * 0.21;

    c2d.save();
    c2d.fillStyle = 'rgba(5, 10, 18, 0.52)';
    c2d.strokeStyle = 'rgba(186, 214, 240, 0.16)';
    c2d.fillRect(gLeft, gTop, gW, gH);
    c2d.strokeRect(gLeft, gTop, gW, gH);
    c2d.restore();

    const samples = 96;
    const mapY = (flux: number) => gTop + gH - ((flux - 0.05) / 1.05) * gH;

    c2d.save();
    c2d.strokeStyle = 'rgba(255, 255, 255, 0.48)';
    c2d.lineWidth = 2;
    c2d.setLineDash([5, 5]);
    c2d.beginPath();
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const x = gLeft + u * gW;
      const y = mapY(this.evalLightCurve(u, this.targetSpeedA, this.targetSpeedB, this.targetPhase, this.targetDepth, true));
      if (i === 0) c2d.moveTo(x, y);
      else c2d.lineTo(x, y);
    }
    c2d.stroke();
    c2d.restore();

    const curveCol = match >= 0.81 ? palette.lockHex : palette.accentHex;
    c2d.save();
    c2d.strokeStyle = curveCol;
    c2d.lineWidth = 2.8;
    c2d.shadowColor = curveCol;
    c2d.shadowBlur = 12;
    c2d.beginPath();
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const x = gLeft + u * gW;
      const y = mapY(this.evalLightCurve(u, this.userSpeedA, this.userSpeedB, this.userPhase, this.userDepth, false));
      if (i === 0) c2d.moveTo(x, y);
      else c2d.lineTo(x, y);
    }
    c2d.stroke();
    c2d.restore();

    const headX = gLeft + uLive * gW;
    c2d.save();
    c2d.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    c2d.lineWidth = 1;
    c2d.beginPath();
    c2d.moveTo(headX, gTop);
    c2d.lineTo(headX, gTop + gH);
    c2d.stroke();
    c2d.restore();

    // Stage 3 Planet Size Pill Selector (SMALL / MEDIUM / GIANT)
    this.sizePills = [];
    if (this.stage === 3) {
      const sizes: Array<{ label: SizePill['label']; depthVal: number }> = [
        { label: 'SMALL', depthVal: 0.2 },
        { label: 'MEDIUM', depthVal: 0.55 },
        { label: 'GIANT', depthVal: 0.9 },
      ];
      const pillW = compact ? 74 : 90;
      const pillH = compact ? 24 : 28;
      const pGap = 10;
      const totalPW = sizes.length * pillW + (sizes.length - 1) * pGap;
      const pStartX = (w - totalPW) * 0.5;
      const pY = compact ? gTop + gH + 10 : gTop + gH + 14;

      c2d.save();
      for (let i = 0; i < sizes.length; i++) {
        const sp = sizes[i];
        const px = pStartX + i * (pillW + pGap);
        this.sizePills.push({ ...sp, x: px, y: pY, w: pillW, h: pillH });
        const selected = Math.abs(this.userDepth - sp.depthVal) < 0.08;
        const depthMatched = selected && Math.abs(this.userDepth - this.targetDepth) < 0.08;
        const pCol = depthMatched ? palette.lockHex : selected ? palette.accentHex : 'rgba(186,214,240,0.3)';
        c2d.fillStyle = selected ? `rgba(${depthMatched ? palette.lockRgb : palette.accentRgb}, 0.2)` : 'rgba(8,14,24,0.8)';
        c2d.strokeStyle = pCol;
        c2d.lineWidth = selected ? 2 : 1;
        c2d.fillRect(px, pY, pillW, pillH);
        c2d.strokeRect(px, pY, pillW, pillH);

        c2d.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
        c2d.fillStyle = selected ? '#ffffff' : 'rgba(215,230,245,0.75)';
        c2d.textAlign = 'center';
        c2d.fillText(sp.label, px + pillW * 0.5, pY + pillH * 0.65);
      }
      c2d.restore();
    }

    // Precision bottom verniers (synced with orbital ring drag!)
    const specs: Array<{ key: StripRect['key']; label: string; val01: number; ok: boolean }> = [
      { key: 'speedA', label: this.stage === 1 ? 'ORBIT SPEED' : 'PLANET A SPEED', val01: this.userSpeedA, ok: aLocked },
      {
        key: 'phase',
        label: 'ORBIT PHASE',
        val01: this.userPhase,
        ok: Math.abs(this.userPhase - this.targetPhase) <= 0.095,
      },
    ];
    if (this.stage >= 2) {
      specs.splice(1, 0, { key: 'speedB', label: 'PLANET B SPEED', val01: this.userSpeedB, ok: bLocked });
    }

    const totalStripW = Math.min(w * 0.8, specs.length * 210);
    const gap = 16;
    const eachW = (totalStripW - gap * (specs.length - 1)) / specs.length;
    const startX = (w - totalStripW) * 0.5;
    const stripY = compact ? h - 72 : h - 94;

    this.activeStrips = specs.map((sp, idx) => ({
      key: sp.key,
      label: sp.label,
      val01: sp.val01,
      x: startX + idx * (eachW + gap),
      y: stripY,
      w: eachW,
      h: 18,
    }));

    c2d.save();
    for (let i = 0; i < this.activeStrips.length; i++) {
      const s = this.activeStrips[i];
      const ok = specs[i].ok;
      const col = ok ? palette.lockHex : curveCol;
      c2d.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = ok ? palette.lockHex : 'rgba(220, 236, 250, 0.8)';
      c2d.textAlign = 'left';
      c2d.fillText(s.label, s.x, s.y - 6);
      c2d.textAlign = 'right';
      c2d.fillStyle = col;
      c2d.fillText(`${Math.round(s.val01 * 100)}%`, s.x + s.w, s.y - 6);

      const lineY = s.y + 6;
      c2d.fillStyle = 'rgba(255, 255, 255, 0.16)';
      c2d.fillRect(s.x, lineY - 1, s.w, 2);
      c2d.fillStyle = col;
      c2d.fillRect(s.x, lineY - 1.5, s.val01 * s.w, 3);

      c2d.beginPath();
      c2d.arc(s.x + s.val01 * s.w, lineY, 6.5, 0, Math.PI * 2);
      c2d.fillStyle = '#07101c';
      c2d.fill();
      c2d.lineWidth = 2;
      c2d.strokeStyle = col;
      c2d.stroke();
    }
    c2d.restore();

    if (this.lockHoldSec > 0.02) {
      drawLockResonanceRing(
        c2d,
        starCx,
        starCy,
        starR + 22,
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
        'By Kepler’s Third Law, closer-in planets orbit faster and trigger frequent starlight transits; larger planets block deeper fractions of starlight.',
      goalSummary:
        'Drag the orbital rings wider/tighter (or slide bottom controls) and toggle Stage 3 planet size to match the observed light curve.',
      controlsDesktop: 'Drag directly across the orbital ellipses around the star or drag the bottom hairline bars.',
      controlsTouch: 'Drag planet rings inward/outward to tune speed or slide the bottom strips.',
      warmthEffect: 'Warm H% gives generous photometric dip fit tolerances; Cold H% sharpens dual-planet alignment.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        this.userSpeedA = this.targetSpeedA;
        this.userSpeedB = this.targetSpeedB;
        this.userPhase = this.targetPhase;
        this.userDepth = this.targetDepth;
        if (stage < 3) {
          this.setupStage((stage + 1) as 2 | 3);
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
