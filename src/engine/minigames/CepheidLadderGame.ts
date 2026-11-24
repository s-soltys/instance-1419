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

interface ReferenceCepheid {
  idx: number;
  freqHz: number;
  phaseOffset: number;
  pitchHz: number;
  baseRadius: number;
  label: string;
  x: number;
  y: number;
  lastCycle: number;
}

interface PulseRing {
  x: number;
  y: number;
  age: number;
  color: string;
}

/**
 * CEP-15 — Cepheid Distance Ladder
 * Match Cepheid heartbeat frequency via scrolling sparklines + pulse rings + sonar pings,
 * then match Split-Mirror Comparator flux with live diagnostic guidance & Distance Ruler.
 */
export class CepheidLadderGame implements IMinigame {
  readonly id = 'cepheid_ladder';
  readonly title = 'CEPHEID DISTANCE LADDER';
  readonly subtitle = 'Heartbeat Photometer & Distance Ruler';
  readonly instrumentCode = 'CEP-15';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private refs: ReferenceCepheid[] = [];
  private targetRefIdx = 0;
  private selectedRefIdx: number | null = null;
  private targetDist = 0.65;
  private userDist = 0.22;
  private targetRedden = 0.4;
  private userRedden = 0.08;
  private targetLastCycle = -1;
  private pulseRings: PulseRing[] = [];

  private strips: VernierStripSpec[] = [];
  private activeKey: string | null = null;
  private lockHoldSec = 0;
  private readonly lockHoldTargetSec = 0.55;
  private stageFlash = 0;
  private stageFlashText = '';
  private ambientStars = generateAmbientStars(createSeededRng('cep-stars'), 44);
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
    this.selectedRefIdx = null;
    this.pulseRings = [];
    this.targetLastCycle = -1;
    const rng = createSeededRng(`${this.ctx.targetId}:cep:${this.ctx.state.shift}:${stage}`);

    const defs =
      stage === 1
        ? [
            { freqHz: 2.1, label: '4d CEPHEID', pitchHz: 480, baseRadius: 11 },
            { freqHz: 1.2, label: '10d CEPHEID', pitchHz: 340, baseRadius: 14 },
            { freqHz: 0.65, label: '24d CEPHEID', pitchHz: 240, baseRadius: 17 },
          ]
        : [
            { freqHz: 2.3, label: '4d CEPHEID', pitchHz: 510, baseRadius: 10 },
            { freqHz: 1.55, label: '8d CEPHEID', pitchHz: 400, baseRadius: 12.5 },
            { freqHz: 1.0, label: '14d CEPHEID', pitchHz: 305, baseRadius: 15 },
            { freqHz: 0.62, label: '26d CEPHEID', pitchHz: 240, baseRadius: 17.5 },
          ];

    this.refs = defs.map((d, idx) => ({
      idx,
      freqHz: d.freqHz,
      phaseOffset: stage === 1 ? 0 : idx * 0.37 + rng() * 0.4,
      pitchHz: d.pitchHz,
      baseRadius: d.baseRadius,
      label: d.label,
      x: 0,
      y: 0,
      lastCycle: -1,
    }));

    this.targetRefIdx = Math.floor(rng() * this.refs.length);
    this.targetDist = 0.28 + rng() * 0.56;
    this.userDist = this.targetDist > 0.5 ? 0.16 : 0.86;
    this.targetRedden = stage < 3 ? 0 : 0.3 + rng() * 0.48;
    this.userRedden = stage < 3 ? 0 : 0.06;
  }

  private isMatchNow(): boolean {
    if (this.selectedRefIdx !== this.targetRefIdx) return false;
    const tol = this.ctx.state.humanity >= 45 ? 0.085 : 0.062;
    if (Math.abs(this.userDist - this.targetDist) > tol) return false;
    if (this.stage === 3 && Math.abs(this.userRedden - this.targetRedden) > tol) return false;
    return true;
  }

  private drawSparkline(
    c2d: CanvasRenderingContext2D,
    cx: number,
    yTop: number,
    freqHz: number,
    phaseOffset: number,
    color: string
  ): void {
    const wSpark = 54;
    const hSpark = 14;
    const x0 = cx - wSpark * 0.5;
    c2d.save();
    c2d.strokeStyle = color;
    c2d.globalAlpha = 0.78;
    c2d.lineWidth = 1.4;
    c2d.beginPath();
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const t = this.elapsedSec - (1 - u) * 1.4;
      const val = Math.sin((t * freqHz + phaseOffset) * Math.PI * 2);
      const px = x0 + u * wSpark;
      const py = yTop + hSpark * 0.5 - val * (hSpark * 0.42);
      if (i === 0) c2d.moveTo(px, py);
      else c2d.lineTo(px, py);
    }
    c2d.stroke();
    c2d.restore();
  }

  private bindEvents(): void {
    const onResize = () => {
      this.c2d = setupFullRetinaCanvas(this.canvas);
    };

    const applyStrip = (s: VernierStripSpec, px: number) => {
      const targ = s.key === 'dist' ? this.targetDist : this.targetRedden;
      const v = valueFromStripX(s, px, targ);
      if (s.key === 'dist') this.userDist = v;
      if (s.key === 'dust') this.userRedden = v;
    };

    const onDown = (e: PointerEvent) => {
      if (this.completed) return;
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      for (const s of this.strips) {
        if (hitVernierStrip(s, px, py)) {
          this.canvas.setPointerCapture(e.pointerId);
          this.activeKey = s.key;
          applyStrip(s, px);
          platform.triggerHaptic('vernierTick', 0.45);
          return;
        }
      }

      for (const r of this.refs) {
        if (Math.hypot(px - r.x, py - r.y) <= 46) {
          this.selectedRefIdx = r.idx;
          const ok = r.idx === this.targetRefIdx;
          this.ctx.audio?.playTumblerClick(0.85, ok);
          this.ctx.audio?.playStereoSonarEcho?.((r.x / Math.max(1, rect.width)) * 2 - 1, 0.35, r.pitchHz);
          platform.triggerHaptic(ok ? 'phaseSnapLock' : 'rejectThud', ok ? 0.8 : 0.55);
          this.emitHud();
          return;
        }
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!this.activeKey || this.completed) return;
      const s = this.strips.find((item) => item.key === this.activeKey);
      if (!s) return;
      const rect = this.canvas.getBoundingClientRect();
      applyStrip(s, e.clientX - rect.left);
    };

    const onUp = () => {
      this.activeKey = null;
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

    const w = Math.max(1, this.canvas.clientWidth || 1280);
    const h = Math.max(1, this.canvas.clientHeight || 720);
    const compact = h < 450;
    const palette = getCosmicPalette(this.ctx.state.humanity);

    for (const r of this.refs) {
      const cyc = Math.floor(this.elapsedSec * r.freqHz + r.phaseOffset);
      if (cyc > r.lastCycle) {
        r.lastCycle = cyc;
        if (r.x > 0) {
          this.pulseRings.push({ x: r.x, y: r.y, age: 0, color: palette.secondaryHex });
          if (this.selectedRefIdx === r.idx) {
            this.ctx.audio?.playStereoSonarEcho?.((r.x / w) * 2 - 1, 0.4, r.pitchHz);
          }
        }
      }
    }

    const targ = this.refs[this.targetRefIdx];
    const tCyc = Math.floor(this.elapsedSec * targ.freqHz);
    if (tCyc > this.targetLastCycle) {
      this.targetLastCycle = tCyc;
      this.pulseRings.push({
        x: w * 0.5,
        y: compact ? h * 0.5 : h * 0.52,
        age: 0,
        color: palette.accentHex,
      });
      this.ctx.audio?.playStereoSonarEcho?.(0, 0.5, targ.pitchHz);
    }

    for (const pr of this.pulseRings) pr.age += dt;
    this.pulseRings = this.pulseRings.filter((pr) => pr.age <= 1.0);

    if (this.isMatchNow()) {
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        platform.triggerHaptic('phaseSnapLock', 0.95);
        this.ctx.audio?.playPhaseLock?.(this.stage);
        if (this.stage < 3) {
          this.stageFlash = 1;
          this.stageFlashText = `CEPHEID RUNG ${this.stage}/3 MEASURED`;
          this.setupStage((this.stage + 1) as 2 | 3);
        } else {
          this.finishSuccess();
        }
      }
    } else {
      this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.6);
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
        `${this.ctx.targetId}_cepheid`,
        `Period-Luminosity standard candles calibrated on the Split-Mirror Photometer for ${this.ctx.targetName}.`,
        `Distance Rung Locked · ${totalSec.toFixed(1)}s`,
        'Leavitt Period-Luminosity Law & Split-Mirror Photometry'
      )
    );
  }

  private emitHud(): void {
    const prompt =
      this.selectedRefIdx !== this.targetRefIdx
        ? 'Compare the scrolling pulse sparklines & beat cadence to click the matching Standard-Candle Cepheid above.'
        : this.stage === 3
        ? 'Split-Mirror active! Slide IR DE-REDDENING & DISTANCE (Mpc) until both half-disks match flush.'
        : 'Split-Mirror active! Slide DISTANCE (Mpc) until the right Target half-disk matches the left Reference half-disk.';

    const dScore = clamp(1 - Math.abs(this.userDist - this.targetDist) / 0.5, 0, 1);
    const prog = (this.stage - 1 + (this.selectedRefIdx === this.targetRefIdx ? 0.5 + dScore * 0.5 : 0.1)) / 3;

    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: stageLabel(this.stage),
      stageProgress: clamp(prog, 0, 1),
      promptText: prompt,
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
      alpha: 0.44,
      brightness: 0.78,
      tintAlpha: 0.46,
      gridAlpha: palette.mode === 'cold' ? 0.14 : 0.05,
    });
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, 0.76);

    c2d.save();
    for (const pr of this.pulseRings) {
      c2d.strokeStyle = pr.color;
      c2d.globalAlpha = clamp((1 - pr.age) * 0.5, 0, 0.55);
      c2d.lineWidth = 1.4;
      c2d.beginPath();
      c2d.arc(pr.x, pr.y, 12 + pr.age * 46, 0, Math.PI * 2);
      c2d.stroke();
    }
    c2d.restore();

    // Top Row: Reference Standard-Candle Cepheids + scrolling sparkline wave beneath each!
    const refY = compact ? h * 0.2 : h * 0.21;
    const spanW = Math.min(w * 0.74, this.refs.length * 175);
    const startX = (w - spanW) * 0.5 + spanW / (this.refs.length * 2);
    const stepX = spanW / this.refs.length;

    for (let i = 0; i < this.refs.length; i++) {
      const r = this.refs[i];
      r.x = startX + i * stepX;
      r.y = refY;
      const pulse = 0.65 + 0.35 * Math.sin((this.elapsedSec * r.freqHz + r.phaseOffset) * Math.PI * 2);
      const selected = this.selectedRefIdx === r.idx;
      const col = selected ? (r.idx === this.targetRefIdx ? palette.lockHex : '#ff8b5e') : palette.secondaryHex;

      drawDiffractionStar(c2d, r.x, r.y, r.baseRadius * pulse, col, { spikes: 6, glowAlpha: 0.62 + pulse * 0.38 });
      c2d.save();
      if (selected) {
        c2d.strokeStyle = col;
        c2d.lineWidth = 2;
        c2d.beginPath();
        c2d.arc(r.x, r.y, 26, 0, Math.PI * 2);
        c2d.stroke();
      }
      c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = col;
      c2d.textAlign = 'center';
      c2d.fillText(r.label, r.x, r.y + 32);
      c2d.restore();

      if (!compact) {
        this.drawSparkline(c2d, r.x, r.y + 38, r.freqHz, r.phaseOffset, col);
      }
    }

    // Center: Split-Mirror Photometer Comparator Lens + Diagnostic Guide
    const targ = this.refs[this.targetRefIdx];
    const tPulse = 0.65 + 0.35 * Math.sin(this.elapsedSec * targ.freqHz * Math.PI * 2);
    const cx = w * 0.5;
    const cy = compact ? h * 0.5 : h * 0.51;
    const lensR = compact ? 46 : 64;
    const tempoMatched = this.selectedRefIdx === this.targetRefIdx;

    if (tempoMatched) {
      const distRatio = clamp(lerp(1.48, 0.46, (this.userDist - this.targetDist + 0.4) / 0.8), 0.38, 1.56);
      const redErr = this.stage === 3 ? clamp(this.targetRedden - this.userRedden, -0.5, 0.8) : 0;
      const redTintAlpha = clamp(Math.abs(redErr) * 1.4, 0, 0.85);
      const rightScale = distRatio * clamp(1 - Math.max(0, redErr) * 0.45, 0.5, 1.15);

      const refGlowR = lensR * (0.58 + 0.16 * tPulse);
      const targGlowR = clamp(refGlowR * rightScale, 14, lensR * 1.15);

      c2d.save();
      c2d.beginPath();
      c2d.rect(cx - lensR - 4, cy - lensR - 4, lensR + 4, lensR * 2 + 8);
      c2d.clip?.();
      const lg = c2d.createRadialGradient(cx, cy, 4, cx, cy, refGlowR);
      lg.addColorStop(0, '#fff7dc');
      lg.addColorStop(0.45, '#ffd480');
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      c2d.fillStyle = lg;
      c2d.beginPath();
      c2d.arc(cx, cy, refGlowR, 0, Math.PI * 2);
      c2d.fill();
      c2d.restore();

      c2d.save();
      c2d.beginPath();
      c2d.rect(cx, cy - lensR - 4, lensR + 4, lensR * 2 + 8);
      c2d.clip?.();
      // Subtle scaling host galaxy ellipse behind target half-disk
      c2d.strokeStyle = 'rgba(200, 224, 248, 0.16)';
      c2d.beginPath();
      c2d.ellipse(cx + 10, cy, lerp(48, 16, this.userDist), lerp(24, 8, this.userDist), 0.35, 0, Math.PI * 2);
      c2d.stroke();

      const rg = c2d.createRadialGradient(cx, cy, 4, cx, cy, targGlowR);
      rg.addColorStop(0, redErr > 0.1 ? '#ffbfa3' : '#fff7dc');
      rg.addColorStop(0.45, redTintAlpha > 0.14 ? '#ff7d54' : '#ffd480');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      c2d.fillStyle = rg;
      c2d.beginPath();
      c2d.arc(cx, cy, targGlowR, 0, Math.PI * 2);
      c2d.fill();
      c2d.restore();

      const synced = this.isMatchNow();
      c2d.save();
      c2d.strokeStyle = synced ? palette.lockHex : palette.accentHex;
      c2d.lineWidth = synced ? 2.4 : 1.6;
      c2d.beginPath();
      c2d.arc(cx, cy, lensR, 0, Math.PI * 2);
      c2d.stroke();

      c2d.strokeStyle = synced ? palette.lockHex : 'rgba(255,255,255,0.45)';
      c2d.setLineDash([4, 4]);
      c2d.lineWidth = 1.4;
      c2d.beginPath();
      c2d.moveTo(cx, cy - lensR - 8);
      c2d.lineTo(cx, cy + lensR + 8);
      c2d.stroke();

      c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = palette.secondaryHex;
      c2d.textAlign = 'right';
      c2d.fillText('REF CANDLE', cx - 12, cy - lensR - 8);
      c2d.textAlign = 'left';
      c2d.fillText('TARGET GALAXY', cx + 12, cy - lensR - 8);

      // Live photometric comparator hint directly beneath lens
      let diagMsg = 'PHOTOMETRIC FLUSH MATCH';
      let diagCol = palette.lockHex;
      if (this.stage === 3 && Math.abs(this.userRedden - this.targetRedden) > 0.085) {
        diagMsg = 'DUST TINTED — SLIDE IR DE-REDDENING';
        diagCol = '#ff9875';
      } else if (this.userDist < this.targetDist - 0.085) {
        diagMsg = 'TARGET TOO BRIGHT — SLIDE FARTHER (+Mpc)';
        diagCol = palette.accentHex;
      } else if (this.userDist > this.targetDist + 0.085) {
        diagMsg = 'TARGET TOO DIM — SLIDE CLOSER (-Mpc)';
        diagCol = palette.accentHex;
      }
      c2d.textAlign = 'center';
      c2d.fillStyle = diagCol;
      c2d.fillText(diagMsg, cx, cy + lensR + 18);
      c2d.restore();
    } else {
      drawDiffractionStar(c2d, cx, cy, targ.baseRadius * 1.15 * tPulse, palette.accentHex, {
        spikes: 6,
        glowAlpha: 0.92,
      });
      c2d.save();
      c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = palette.accentHex;
      c2d.textAlign = 'center';
      c2d.fillText('UNKNOWN DISTANT CEPHEID', cx, cy + 32);
      c2d.restore();
      this.drawSparkline(c2d, cx, cy + 38, targ.freqHz, 0, palette.accentHex);
    }

    const items: Array<{ key: string; label: string; val01: number; locked?: boolean; rightText?: string }> = [
      {
        key: 'dist',
        label: 'DISTANCE (Mpc)',
        val01: this.userDist,
        locked: Math.abs(this.userDist - this.targetDist) <= 0.085,
        rightText: `${lerp(1, 45, this.userDist).toFixed(1)} Mpc`,
      },
    ];
    if (this.stage === 3) {
      items.push({
        key: 'dust',
        label: 'IR DE-REDDENING',
        val01: this.userRedden,
        locked: Math.abs(this.userRedden - this.targetRedden) <= 0.085,
      });
    }
    this.strips = tempoMatched ? layoutVernierRow(w, h, items) : [];
    for (const s of this.strips) drawVernierStrip(c2d, s, palette.accentHex, palette.lockHex);

    if (this.lockHoldSec > 0.02) {
      drawLockResonanceRing(c2d, cx, cy, lensR + 10, this.lockHoldSec / this.lockHoldTargetSec, palette.lockHex);
    }
    drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, palette.lockHex);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Cepheid variable stars pulse strictly faster when dimmer and slower when brighter; comparing pulse sparklines & Split-Mirror apparent flux calibrates cosmic distances across megaparsecs.',
      goalSummary: 'Pick the matching-tempo Reference Cepheid, then flush-match the Split-Mirror halves with Distance & IR De-Reddening.',
      controlsDesktop: 'Click the Reference Cepheid with matching heartbeat sparkline, then slide DISTANCE / IR DE-REDDENING.',
      controlsTouch: 'Tap the twin pulsating Cepheid above, then slide DISTANCE (Mpc).',
      warmthEffect: 'Warm H% gives wider Split-Mirror brightness locks; Cold H% tightens megaparsec precision.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        this.selectedRefIdx = this.targetRefIdx;
        this.userDist = this.targetDist;
        this.userRedden = this.targetRedden;
        if (stage < 3) this.setupStage((stage + 1) as 2 | 3);
        else this.finishSuccess();
      },
      getDiagnostics: () => ({
        stage: this.stage,
        completed: this.completed,
        stageProgress: this.completed ? 1 : (this.stage - 1 + (this.isMatchNow() ? 1 : 0.3)) / 3,
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
