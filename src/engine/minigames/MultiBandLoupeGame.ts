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
import { clamp, createSeededRng, resolveInstrumentPayout } from './tactilePhysics';
import type { IMinigame, InstrumentFieldGuide, MinigameContext, SolvabilityHarness } from './types';

type SpectralBand = 'optical' | 'infrared' | 'xray';

interface BandTarget {
  id: number;
  nx: number;
  ny: number;
  band: SpectralBand;
  isDecoy?: boolean;
  found: boolean;
}

interface BandPillBox {
  band: SpectralBand;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * BND-19 — Multi-Band Spectral Loupe
 * Dramatic layered Carina dark-dust pillars veil hidden targets across the field:
 * click directly on the OPTICAL / INFRARED / X-RAY filter pills (or 1/2/3/Space),
 * sweep your clipped circular loupe across dust columns, and tag hidden protostars & pulsars!
 */
export class MultiBandLoupeGame implements IMinigame {
  readonly id = 'multiband_loupe';
  readonly title = 'SPECTRAL BAND LOUPE';
  readonly subtitle = 'X-Ray / IR / Optical Reveal';
  readonly instrumentCode = 'BND-19';

  private ctx!: MinigameContext;
  private canvas!: HTMLCanvasElement;
  private c2d!: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;
  private elapsedSec = 0;
  private startedAt = 0;
  private completed = false;

  private stage: 1 | 2 | 3 = 1;
  private band: SpectralBand = 'optical';
  private loupeNx = 0.5;
  private loupeNy = 0.44;
  private dragging = false;
  private targets: BandTarget[] = [];
  private pillBoxes: BandPillBox[] = [];
  private stageClearTimer = 0;
  private stageFlash = 0;
  private stageFlashText = '';
  private ambientStars = generateAmbientStars(createSeededRng('bnd-stars'), 44);
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
    this.band = 'optical';
    this.loupeNx = 0.5;
    this.loupeNy = 0.44;
    this.stageClearTimer = 0;
    const rng = createSeededRng(`${this.ctx.targetId}:bnd:${this.ctx.state.shift}:${stage}`);

    this.targets = [];
    if (stage === 1) {
      this.targets.push(
        { id: 0, nx: 0.3 + rng() * 0.14, ny: 0.35 + rng() * 0.18, band: 'infrared', found: false },
        { id: 1, nx: 0.58 + rng() * 0.14, ny: 0.35 + rng() * 0.18, band: 'infrared', found: false }
      );
    } else if (stage === 2) {
      this.targets.push(
        { id: 0, nx: 0.27 + rng() * 0.08, ny: 0.36, band: 'optical', found: false },
        { id: 1, nx: 0.5 + rng() * 0.06, ny: 0.42, band: 'infrared', found: false },
        { id: 2, nx: 0.72, ny: 0.48, band: 'xray', found: false }
      );
    } else {
      this.targets.push(
        { id: 0, nx: 0.34, ny: 0.38, band: 'xray', found: false },
        { id: 1, nx: 0.37, ny: 0.43, band: 'optical', isDecoy: true, found: false },
        { id: 2, nx: 0.65, ny: 0.46, band: 'infrared', found: false }
      );
    }
  }

  onHelperAction(actionId: string): void {
    if (actionId === 'cycle_band' && !this.completed && this.stageClearTimer <= 0) {
      this.cycleBand();
    }
  }

  private setBand(next: SpectralBand): void {
    if (this.stage === 1 && next === 'xray') return;
    if (this.band !== next) {
      this.band = next;
      this.ctx.audio?.playSolenoidClack(false);
      platform.triggerHaptic('vernierTick', 0.5);
      this.emitHud();
    }
  }

  private cycleBand(): void {
    const order: SpectralBand[] = this.stage === 1 ? ['optical', 'infrared'] : ['optical', 'infrared', 'xray'];
    const idx = (order.indexOf(this.band) + 1) % order.length;
    this.setBand(order[idx]);
  }

  private getBandColor(band: SpectralBand): string {
    if (band === 'optical') return '#ffe29c';
    if (band === 'infrared') return '#ff7e57';
    return '#7fd6ff';
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

      // Clickable on-canvas spectral filter chips
      for (const pill of this.pillBoxes) {
        if (px >= pill.x && px <= pill.x + pill.w && py >= pill.y && py <= pill.y + pill.h) {
          this.setBand(pill.band);
          return;
        }
      }

      const lx = this.loupeNx * w;
      const ly = this.loupeNy * h;
      const loupeR = h < 450 ? 72 : 98;

      for (const t of this.targets) {
        if (t.found || t.isDecoy || t.band !== this.band) continue;
        const tx = t.nx * w;
        const ty = t.ny * h;
        const insideLoupe = Math.hypot(tx - lx, ty - ly) <= loupeR + 8;
        if (insideLoupe && Math.hypot(px - tx, py - ty) <= 38) {
          t.found = true;
          platform.triggerHaptic('phaseSnapLock', 0.9);
          this.ctx.audio?.playTumblerClick(0.95, true);
          const realTargets = this.targets.filter((item) => !item.isDecoy);
          if (realTargets.every((item) => item.found)) {
            this.stageClearTimer = 0.62;
            this.stageFlash = 1;
            this.stageFlashText = `MULTI-BAND SURVEY ${this.stage}/3 COMPLETE`;
            this.ctx.audio?.playPhaseLock?.(this.stage);
          }
          this.emitHud();
          return;
        }
      }

      this.canvas.setPointerCapture(e.pointerId);
      this.dragging = true;
      this.loupeNx = clamp(px / w, 0.12, 0.88);
      this.loupeNy = clamp(py / h, 0.18, 0.72);
    };

    const onMove = (e: PointerEvent) => {
      if (!this.dragging || this.completed) return;
      const rect = this.canvas.getBoundingClientRect();
      this.loupeNx = clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0.12, 0.88);
      this.loupeNy = clamp((e.clientY - rect.top) / Math.max(1, rect.height), 0.18, 0.72);
    };

    const onUp = () => {
      this.dragging = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        this.cycleBand();
      } else if (e.key === '1') this.setBand('optical');
      else if (e.key === '2') this.setBand('infrared');
      else if (e.key === '3') this.setBand('xray');
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
        0.96,
        `${this.ctx.targetId}_multiband`,
        `Concealed Infrared protostars & X-ray cores isolated beneath dust columns on ${this.ctx.targetName}.`,
        `Multi-Band Tagged · ${totalSec.toFixed(1)}s`,
        'Multi-Wavelength Astronomical Imaging & Dust Penetration'
      )
    );
  }

  private emitHud(): void {
    const real = this.targets.filter((item) => !item.isDecoy);
    const found = real.filter((item) => item.found).length;
    const bandLabel = this.band.toUpperCase();
    const prompt =
      this.stage === 1
        ? `[${bandLabel}] Drag loupe over dark dust pillars, select INFRARED filter, and click hidden cores (${found}/${real.length}).`
        : `[${bandLabel}] Switch Optical / IR / X-Ray filters to trace jets & dust pillars, tagging all ${real.length} cores (${found}/${real.length}).`;

    this.ctx.onTelemetry?.({
      stageIndex: this.stage,
      stageLabel: stageLabel(this.stage),
      stageProgress: clamp((this.stage - 1 + found / Math.max(1, real.length)) / 3, 0, 1),
      promptText: prompt,
      actionButton: { id: 'cycle_band', label: `CYCLE BAND (${bandLabel})`, active: this.band !== 'optical' },
    });
  }

  private render(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const c2d = this.c2d;
    const palette = getCosmicPalette(this.ctx.state.humanity);
    const compact = h < 450;

    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'carina',
      blurPx: 6,
      alpha: 0.44,
      brightness: 0.72,
      tintAlpha: 0.56,
      gridAlpha: palette.mode === 'cold' ? 0.14 : 0.05,
    });
    drawAmbientStars(c2d, w, h, this.ambientStars, this.elapsedSec, 0.76);

    const lx = this.loupeNx * w;
    const ly = this.loupeNy * h;
    const loupeR = compact ? 72 : 98;
    const bandCol = this.getBandColor(this.band);

    // Dramatic dark Carina nebula dust-pillar clouds veiling concealed targets
    c2d.save();
    for (const t of this.targets) {
      if (t.found) {
        drawDiffractionStar(c2d, t.nx * w, t.ny * h, 9, palette.lockHex, { spikes: 6, glowAlpha: 0.95 });
        continue;
      }
      for (const offset of [-18, 0, 18]) {
        const g = c2d.createRadialGradient(t.nx * w + offset, t.ny * h + offset * 0.5, 4, t.nx * w + offset, t.ny * h, 68);
        g.addColorStop(0, 'rgba(38, 22, 14, 0.86)');
        g.addColorStop(0.55, 'rgba(24, 15, 11, 0.55)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        c2d.fillStyle = g;
        c2d.beginPath();
        c2d.arc(t.nx * w + offset, t.ny * h + offset * 0.5, 68, 0, Math.PI * 2);
        c2d.fill();
      }
    }
    c2d.restore();

    // Clipped Circular Multi-Spectral Loupe Aperture
    c2d.save();
    c2d.beginPath();
    c2d.arc(lx, ly, loupeR, 0, Math.PI * 2);
    c2d.fillStyle =
      this.band === 'infrared'
        ? 'rgba(54, 14, 10, 0.74)'
        : this.band === 'xray'
        ? 'rgba(8, 22, 48, 0.78)'
        : 'rgba(12, 16, 24, 0.48)';
    c2d.fill();
    c2d.clip?.();

    drawCosmicPlateBackdrop(c2d, w, h, {
      plateId: 'carina',
      blurPx: 1,
      alpha: this.band === 'infrared' ? 0.82 : this.band === 'xray' ? 0.35 : 0.6,
      brightness: this.band === 'infrared' ? 1.25 : 0.95,
      tintAlpha: this.band === 'infrared' ? 0.14 : 0.42,
      gridAlpha: 0,
    });

    // Stage 2 X-ray clue vector pointing straight toward the hidden IR protostar
    if (this.stage === 2 && this.band === 'xray') {
      const irTarget = this.targets.find((item) => item.band === 'infrared');
      const xTarget = this.targets.find((item) => item.band === 'xray');
      if (irTarget && xTarget) {
        c2d.strokeStyle = 'rgba(127, 214, 255, 0.65)';
        c2d.setLineDash([5, 6]);
        c2d.lineWidth = 1.6;
        c2d.beginPath();
        c2d.moveTo(xTarget.nx * w, xTarget.ny * h);
        c2d.lineTo(irTarget.nx * w, irTarget.ny * h);
        c2d.stroke();
        c2d.setLineDash([]);
      }
    }

    for (const t of this.targets) {
      if (t.band !== this.band || t.found) continue;
      const tx = t.nx * w;
      const ty = t.ny * h;
      const col = this.getBandColor(t.band);
      drawDiffractionStar(c2d, tx, ty, t.isDecoy ? 7 : 9.5, col, { spikes: 6, glowAlpha: 0.96 });
      if (!t.isDecoy) {
        c2d.strokeStyle = col;
        c2d.lineWidth = 1.6;
        c2d.beginPath();
        c2d.arc(tx, ty, 19, 0, Math.PI * 2);
        c2d.stroke();
      }
    }
    c2d.restore();

    // Loupe Bezel Rim
    c2d.save();
    c2d.strokeStyle = bandCol;
    c2d.lineWidth = 2.4;
    c2d.beginPath();
    c2d.arc(lx, ly, loupeR, 0, Math.PI * 2);
    c2d.stroke();
    c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = bandCol;
    c2d.textAlign = 'center';
    c2d.fillText(`${this.band.toUpperCase()} FILTER`, lx, ly - loupeR - 8);
    c2d.restore();

    // Clickable On-Canvas Spectral Band Selector Chips cleanly positioned above bottom console
    const bands: Array<{ band: SpectralBand; label: string }> =
      this.stage === 1
        ? [
            { band: 'optical', label: '1 · OPTICAL' },
            { band: 'infrared', label: '2 · INFRARED' },
          ]
        : [
            { band: 'optical', label: '1 · OPTICAL' },
            { band: 'infrared', label: '2 · INFRARED' },
            { band: 'xray', label: '3 · X-RAY' },
          ];
    const pillW = compact ? 92 : 108;
    const pillH = 22;
    const gap = 10;
    const totalW = bands.length * pillW + (bands.length - 1) * gap;
    const startX = (w - totalW) * 0.5;
    const pillY = compact ? h - 108 : h - 134;

    this.pillBoxes = bands.map((b, i) => ({
      band: b.band,
      label: b.label,
      x: startX + i * (pillW + gap),
      y: pillY,
      w: pillW,
      h: pillH,
    }));

    c2d.save();
    c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.textAlign = 'center';
    for (const pill of this.pillBoxes) {
      const active = this.band === pill.band;
      const pCol = this.getBandColor(pill.band);
      c2d.fillStyle = active ? 'rgba(18, 28, 44, 0.92)' : 'rgba(8, 12, 20, 0.72)';
      c2d.strokeStyle = active ? pCol : 'rgba(200, 224, 248, 0.25)';
      c2d.lineWidth = active ? 1.8 : 1;
      c2d.fillRect(pill.x, pill.y, pill.w, pill.h);
      c2d.strokeRect(pill.x, pill.y, pill.w, pill.h);
      c2d.fillStyle = active ? pCol : 'rgba(210, 228, 244, 0.72)';
      c2d.fillText(pill.label, pill.x + pill.w * 0.5, pill.y + 14);
    }
    c2d.restore();

    drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, palette.lockHex);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Infrared light penetrates opaque Carina dust columns while X-rays expose high-energy pulsars masked behind foreground optical stars.',
      goalSummary: 'Sweep the Multi-Spectral Loupe over dark dust columns, click Band filters (Optical/IR/X-Ray), and tag hidden targets.',
      controlsDesktop: 'Drag circular loupe over dust clouds; click Band pills (or 1/2/3/Space); click glowing hidden targets.',
      controlsTouch: 'Touch-drag the spectral loupe, tap a wavelength pill, and tap hidden cores.',
      warmthEffect: 'Warm H% softens Carina dust opacity; Cold H% switches to sharp telemetry loupe framing.',
    };
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (stage: 1 | 2 | 3) => {
        if (this.completed) return;
        this.stage = stage;
        this.setupStage(stage);
        for (const t of this.targets) if (!t.isDecoy) t.found = true;
        if (stage < 3) this.setupStage((stage + 1) as 2 | 3);
        else this.finishSuccess();
      },
      getDiagnostics: () => ({
        stage: this.stage,
        completed: this.completed,
        stageProgress: this.completed
          ? 1
          : (this.stage - 1 + this.targets.filter((t) => !t.isDecoy && t.found).length / Math.max(1, this.targets.filter((t) => !t.isDecoy).length)) /
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
