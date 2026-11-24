import { platform } from '../../platform/PlatformAdapter';
import { setupFullRetinaCanvas } from './canvasUtils';
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

interface ElementSpec {
  id: 'H' | 'He' | 'C' | 'O' | 'Fe' | 'Na';
  name: string;
  lines: number[]; // Normalized 0.14..0.82 so +/-0.10 Doppler shift stays cleanly inside [0.02..0.98]
  color: string;
}

const ELEMENTS: ElementSpec[] = [
  { id: 'H', name: 'HYDROGEN', lines: [0.16, 0.30, 0.74], color: '#ff8a7a' },
  { id: 'He', name: 'HELIUM', lines: [0.22, 0.50, 0.66], color: '#ffd97d' },
  { id: 'C', name: 'CARBON', lines: [0.26, 0.44, 0.80], color: '#9ee8ff' },
  { id: 'O', name: 'OXYGEN', lines: [0.34, 0.38, 0.56], color: '#8be9c0' },
  { id: 'Fe', name: 'IRON', lines: [0.14, 0.41, 0.54, 0.70], color: '#ffb86c' },
  { id: 'Na', name: 'SODIUM', lines: [0.59, 0.61], color: '#ffe570' },
];

interface TileRect {
  id: ElementSpec['id'];
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * PRM-09 — Spectral Prism Mixer (Iteration 2)
 * Features visual mini spectral barcodes inside each element card, mismatch line indicators,
 * 6th element (Na Sodium doublet), and bidirectional Blueshift <-> Redshift vernier on Stage 3.
 */
export class SpectralPrismMixerGame implements IMinigame {
  readonly id = 'spectral_prism';
  readonly title = 'SPECTRAL PRISM MIXER';
  readonly subtitle = 'Chemical Barcodes & Doppler Shift';
  readonly instrumentCode = 'PRM-09';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private availableElements: ElementSpec[] = [];
  private targetElements = new Set<ElementSpec['id']>();
  private selectedElements = new Set<ElementSpec['id']>();
  private targetDoppler = 0; // -0.10 (Blueshift) .. +0.10 (Redshift)
  private userDoppler = 0;

  private tileRects: TileRect[] = [];
  private shiftRect = { x: 0, y: 0, w: 0, h: 0 };
  private draggingShift = false;
  private lockHoldSec = 0;
  private readonly lockHoldTargetSec = 0.6;
  private stageFlash = 0;
  private stageFlashText = '';
  private ambientStars = generateAmbientStars(createSeededRng('prm-stars'), 44);
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
    this.selectedElements.clear();
    const rng = createSeededRng(`${this.ctx.targetId}:prm:${this.ctx.state.shift}:${stage}`);

    this.availableElements =
      stage === 1 ? [ELEMENTS[0], ELEMENTS[1], ELEMENTS[3], ELEMENTS[4]] : [...ELEMENTS];
    const pickCount = stage === 1 ? 2 : 3;

    const pool = [...this.availableElements];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.targetElements = new Set(pool.slice(0, pickCount).map((e) => e.id));

    if (stage < 3) {
      this.targetDoppler = 0;
      this.userDoppler = 0;
    } else {
      const sign = rng() > 0.45 ? 1 : -1;
      this.targetDoppler = sign * (0.045 + rng() * 0.048);
      this.userDoppler = 0;
    }
  }

  private isCompositionExact(): boolean {
    if (this.selectedElements.size !== this.targetElements.size) return false;
    for (const id of this.targetElements) {
      if (!this.selectedElements.has(id)) return false;
    }
    return true;
  }

  private computeMatch01(): number {
    let overlap = 0;
    for (const id of this.selectedElements) {
      overlap += this.targetElements.has(id) ? 1 : -0.45;
    }
    const compScore = clamp(overlap / Math.max(1, this.targetElements.size), 0, 1);
    if (this.stage < 3) return compScore;
    const shiftDiff = Math.abs(this.userDoppler - this.targetDoppler);
    const shiftScore = clamp(1 - shiftDiff / 0.09, 0, 1);
    return compScore * 0.65 + shiftScore * 0.35;
  }

  private isSolvedNow(): boolean {
    if (!this.isCompositionExact()) return false;
    if (this.stage < 3) return true;
    const tol = this.ctx.state.humanity >= 45 ? 0.017 : 0.012;
    return Math.abs(this.userDoppler - this.targetDoppler) <= tol;
  }

  private bindEvents(): void {
    const onResize = () => {
      this.c2d = setupFullRetinaCanvas(this.canvas);
    };

    const applyShiftAtX = (px: number) => {
      const frac = clamp((px - this.shiftRect.x) / Math.max(1, this.shiftRect.w), 0, 1);
      let next = lerp(-0.1, 0.1, frac);
      if (Math.abs(next - this.targetDoppler) < 0.014) {
        next = lerp(next, this.targetDoppler, 0.45);
      }
      this.userDoppler = next;
    };

    const onDown = (e: PointerEvent) => {
      if (this.completed) return;
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      if (
        this.stage === 3 &&
        px >= this.shiftRect.x - 16 &&
        px <= this.shiftRect.x + this.shiftRect.w + 16 &&
        py >= this.shiftRect.y - 18 &&
        py <= this.shiftRect.y + this.shiftRect.h + 18
      ) {
        this.canvas.setPointerCapture(e.pointerId);
        this.draggingShift = true;
        applyShiftAtX(px);
        platform.triggerHaptic('vernierTick', 0.45);
        return;
      }

      for (const tile of this.tileRects) {
        if (px >= tile.x && px <= tile.x + tile.w && py >= tile.y && py <= tile.y + tile.h) {
          if (this.selectedElements.has(tile.id)) {
            this.selectedElements.delete(tile.id);
            this.ctx.audio?.playTumblerClick(0.5, false);
          } else {
            this.selectedElements.add(tile.id);
            const isTarget = this.targetElements.has(tile.id);
            this.ctx.audio?.playTumblerClick(0.85, isTarget);
            platform.triggerHaptic('vernierTick', isTarget ? 0.72 : 0.4);
          }
          this.emitHud();
          return;
        }
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!this.draggingShift || this.completed) return;
      const rect = this.canvas.getBoundingClientRect();
      applyShiftAtX(e.clientX - rect.left);
    };

    const onUp = () => {
      this.draggingShift = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (this.completed) return;
      if (this.stage === 3) {
        if (e.key === 'ArrowLeft') this.userDoppler = clamp(this.userDoppler - 0.006, -0.1, 0.1);
        if (e.key === 'ArrowRight') this.userDoppler = clamp(this.userDoppler + 0.006, -0.1, 0.1);
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

    if (this.isSolvedNow()) {
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        platform.triggerHaptic('phaseSnapLock', 0.95);
        this.ctx.audio?.playPhaseLock?.(this.stage);
        if (this.stage < 3) {
          this.stageFlash = 1;
          this.stageFlashText = `SPECTRUM ${this.stage}/3 DECODED`;
          this.setupStage((this.stage + 1) as 2 | 3);
        } else {
          this.finishSuccess();
        }
      }
    } else {
      this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.8);
    }

    this.emitHud();
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

    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.ctx.onComplete(
      resolveInstrumentPayout(
        'clean',
        totalSec,
        0.95,
        `${this.ctx.targetId}_prism`,
        `Elemental chemical barcodes & Doppler shift decoded cleanly on ${this.ctx.targetName}.`,
        `Prism Fit 95% · ${totalSec.toFixed(1)}s`,
        'Atomic Emission Barcodes & Bidirectional Cosmic Doppler Shift'
      )
    );
  }

  private emitHud(): void {
    const labelMap: Record<1 | 2 | 3, string> = {
      1: '1/3 · EASY',
      2: '2/3 · MEDIUM',
      3: '3/3 · HARD',
    };
    const dirHint = this.targetDoppler < 0 ? 'left (BLUESHIFT)' : 'right (REDSHIFT)';
    const promptMap: Record<1 | 2 | 3, string> = {
      1: `Compare the mini barcodes on each card — toggle the ${this.targetElements.size} elements that build the star spectrum.`,
      2: `Identify the ${this.targetElements.size}-element chemical fingerprint (watch amber extra-line dots).`,
      3: `Select the ${this.targetElements.size} elements AND slide DOPPLER SHIFT ${dirHint} so lines lock mint green.`,
    };
    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: labelMap[this.stage],
      stageProgress: clamp((this.stage - 1 + this.computeMatch01()) / 3, 0, 1),
      promptText: promptMap[this.stage],
      actionButton: null,
    });
  }

  private wavelengthColor(u: number): string {
    const hue = lerp(265, 4, clamp(u, 0, 1));
    return `hsl(${hue.toFixed(0)}, 88%, 64%)`;
  }

  private renderSpectrumStrip(
    c2d: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    elements: ElementSpec[],
    shift: number,
    otherPosSet: Set<number>,
    isTargetStrip: boolean
  ): void {
    c2d.save();
    c2d.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = 'rgba(220, 236, 250, 0.78)';
    c2d.textAlign = 'left';
    c2d.fillText(title, x, y - 8);

    const grad = c2d.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, 'rgba(92, 54, 168, 0.24)');
    grad.addColorStop(0.28, 'rgba(54, 152, 230, 0.24)');
    grad.addColorStop(0.54, 'rgba(72, 200, 148, 0.24)');
    grad.addColorStop(0.76, 'rgba(235, 178, 68, 0.24)');
    grad.addColorStop(1, 'rgba(210, 62, 62, 0.24)');

    c2d.fillStyle = 'rgba(4, 8, 16, 0.8)';
    c2d.fillRect(x, y, w, h);
    c2d.fillStyle = grad;
    c2d.fillRect(x, y, w, h);
    c2d.strokeStyle = 'rgba(186, 214, 240, 0.26)';
    c2d.strokeRect(x, y, w, h);

    const otherArr = Array.from(otherPosSet);
    for (const el of elements) {
      for (const baseU of el.lines) {
        const u = clamp(baseU + shift, 0.01, 0.99);
        const lx = x + u * w;
        const col = this.wavelengthColor(u);
        c2d.strokeStyle = col;
        c2d.shadowColor = col;
        c2d.shadowBlur = 10;
        c2d.lineWidth = 3;
        c2d.beginPath();
        c2d.moveTo(lx, y + 3);
        c2d.lineTo(lx, y + h - 3);
        c2d.stroke();

        const matched = otherArr.some((tu) => Math.abs(tu - u) < 0.017);
        c2d.shadowBlur = 0;
        if (!isTargetStrip) {
          c2d.fillStyle = matched ? '#8be9c0' : '#ff986b';
          c2d.beginPath();
          c2d.arc(lx, y - 3.5, matched ? 3.2 : 2.6, 0, Math.PI * 2);
          c2d.fill();
        } else if (!matched && otherArr.length > 0) {
          // Hollow bracket below target line indicating missing wavelength in mix
          c2d.strokeStyle = 'rgba(255, 224, 150, 0.72)';
          c2d.lineWidth = 1.4;
          c2d.beginPath();
          c2d.moveTo(lx - 3, y + h + 5);
          c2d.lineTo(lx, y + h + 2);
          c2d.lineTo(lx + 3, y + h + 5);
          c2d.stroke();
        }
      }
    }
    c2d.restore();
  }

  private render(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const c2d = this.c2d;
    const palette = getCosmicPalette(this.ctx.state.humanity);
    const compact = h < 450;

    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'carina',
      blurPx: 5,
      alpha: 0.42,
      brightness: 0.72,
      scale: 1.03,
      tintAlpha: 0.54,
      gridAlpha: palette.mode === 'cold' ? 0.14 : 0.05,
    });
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, 0.7);

    const barW = Math.min(w * 0.78, 860);
    const barX = (w - barW) * 0.5;
    const barH = compact ? 40 : 58;
    const topY = compact ? h * 0.18 : h * 0.21;
    const midY = topY + barH + (compact ? 26 : 40);

    const targetSpecList = ELEMENTS.filter((e) => this.targetElements.has(e.id));
    const userSpecList = ELEMENTS.filter((e) => this.selectedElements.has(e.id));

    const targetPosSet = new Set<number>();
    for (const el of targetSpecList) {
      for (const u of el.lines) targetPosSet.add(clamp(u + this.targetDoppler, 0.01, 0.99));
    }
    const userPosSet = new Set<number>();
    for (const el of userSpecList) {
      for (const u of el.lines) userPosSet.add(clamp(u + this.userDoppler, 0.01, 0.99));
    }

    this.renderSpectrumStrip(
      c2d,
      barX,
      topY,
      barW,
      barH,
      'OBSERVED STAR SPECTRUM',
      targetSpecList,
      this.targetDoppler,
      userPosSet,
      true
    );
    this.renderSpectrumStrip(
      c2d,
      barX,
      midY,
      barW,
      barH,
      'YOUR PRISM MIX',
      userSpecList,
      this.userDoppler,
      targetPosSet,
      false
    );

    // Element filter cards WITH crisp mini spectral barcode previews!
    const count = this.availableElements.length;
    const gap = compact ? 8 : 12;
    const tileW = Math.min(126, (barW - gap * (count - 1)) / count);
    const tileH = compact ? 52 : 68;
    const totalTilesW = count * tileW + (count - 1) * gap;
    const tileStartX = (w - totalTilesW) * 0.5;
    const tileY = compact ? h - 124 : midY + barH + 30;

    this.tileRects = this.availableElements.map((el, i) => ({
      id: el.id,
      x: tileStartX + i * (tileW + gap),
      y: tileY,
      w: tileW,
      h: tileH,
    }));

    c2d.save();
    for (let i = 0; i < this.availableElements.length; i++) {
      const el = this.availableElements[i];
      const tr = this.tileRects[i];
      const active = this.selectedElements.has(el.id);

      c2d.fillStyle = active ? `rgba(${palette.accentRgb}, 0.22)` : 'rgba(8, 14, 24, 0.82)';
      c2d.strokeStyle = active ? el.color : 'rgba(186, 214, 240, 0.24)';
      c2d.lineWidth = active ? 2.2 : 1.2;
      c2d.fillRect(tr.x, tr.y, tr.w, tr.h);
      c2d.strokeRect(tr.x, tr.y, tr.w, tr.h);

      c2d.font = '700 13px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = active ? el.color : '#e2ecf8';
      c2d.textAlign = 'center';
      c2d.fillText(`${el.id} · ${el.name}`, tr.x + tr.w * 0.5, tr.y + (compact ? 18 : 22));

      // Mini spectral barcode strip preview directly inside each element tile!
      const bx = tr.x + 8;
      const bw = tr.w - 16;
      const by = tr.y + (compact ? 26 : 34);
      const bh = compact ? 16 : 22;
      c2d.fillStyle = 'rgba(4, 8, 14, 0.85)';
      c2d.fillRect(bx, by, bw, bh);
      c2d.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      c2d.lineWidth = 1;
      c2d.strokeRect(bx, by, bw, bh);
      for (const u of el.lines) {
        const lx = bx + clamp(u, 0.04, 0.96) * bw;
        c2d.strokeStyle = this.wavelengthColor(u);
        c2d.lineWidth = 2;
        c2d.beginPath();
        c2d.moveTo(lx, by + 2);
        c2d.lineTo(lx, by + bh - 2);
        c2d.stroke();
      }
    }
    c2d.restore();

    // Bidirectional Doppler Shift vernier bar on Stage 3 (BLUESHIFT <- 0 -> REDSHIFT)
    if (this.stage === 3) {
      const sW = Math.min(360, w * 0.58);
      const sX = (w - sW) * 0.5;
      const sY = compact ? h - 58 : tileY + tileH + 30;
      this.shiftRect = { x: sX, y: sY, w: sW, h: 18 };
      const frac = clamp((this.userDoppler + 0.1) / 0.2, 0, 1);
      const ok = Math.abs(this.userDoppler - this.targetDoppler) <= 0.017;
      const col = ok ? palette.lockHex : this.userDoppler < -0.005 ? '#82c8ff' : this.userDoppler > 0.005 ? '#ff8a7a' : palette.accentHex;

      c2d.save();
      c2d.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = '#82c8ff';
      c2d.textAlign = 'left';
      c2d.fillText('← BLUESHIFT', sX, sY - 6);
      c2d.fillStyle = col;
      c2d.textAlign = 'center';
      c2d.fillText(`DOPPLER z = ${(this.userDoppler * 2.5).toFixed(2)}`, sX + sW * 0.5, sY - 6);
      c2d.fillStyle = '#ff8a7a';
      c2d.textAlign = 'right';
      c2d.fillText('REDSHIFT →', sX + sW, sY - 6);

      const lineY = sY + 6;
      c2d.fillStyle = 'rgba(255, 255, 255, 0.16)';
      c2d.fillRect(sX, lineY - 1, sW, 2);
      // Center zero tick
      c2d.fillStyle = 'rgba(255, 255, 255, 0.38)';
      c2d.fillRect(sX + sW * 0.5 - 1, lineY - 4, 2, 8);

      const knobX = sX + frac * sW;
      c2d.beginPath();
      c2d.arc(knobX, lineY, 6.5, 0, Math.PI * 2);
      c2d.fillStyle = '#07101c';
      c2d.fill();
      c2d.lineWidth = 2;
      c2d.strokeStyle = col;
      c2d.stroke();
      c2d.restore();
    }

    if (this.lockHoldSec > 0.02) {
      drawLockResonanceRing(
        c2d,
        w * 0.5,
        (topY + midY + barH) * 0.5,
        compact ? 38 : 48,
        this.lockHoldSec / this.lockHoldTargetSec,
        palette.lockHex,
        `LOCKED ${Math.round((this.lockHoldSec / this.lockHoldTargetSec) * 100)}%`
      );
    }

    drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, palette.lockHex);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Each atom leaves an unmistakable spectral barcode; galaxies moving away shift lines toward red (Redshift), while approaching stars shift lines toward blue (Blueshift).',
      goalSummary:
        'Match the observed stellar spectrum using the mini barcodes on each element tile, then slide DOPPLER SHIFT left/right in Stage 3.',
      controlsDesktop: 'Click chemical element cards to mix them; slide DOPPLER SHIFT left/right on Stage 3.',
      controlsTouch: 'Tap chemical cards and drag DOPPLER SHIFT on Stage 3.',
      warmthEffect: 'Warm H% gives generous Doppler tolerances; Cold H% tightens spectral alignment.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        this.selectedElements = new Set(this.targetElements);
        this.userDoppler = this.targetDoppler;
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
