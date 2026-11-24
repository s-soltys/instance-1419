import { platform } from '../../../platform/PlatformAdapter';
import { BaseCosmicMinigame, type PointerLocalEvent } from '../core/BaseCosmicMinigame';
import {
  drawVernierStrip,
  hitVernierStrip,
  layoutVernierRowInto,
  valueFromStripX,
  type VernierItemInput,
  type VernierStripSpec,
} from '../core/vernierWidgets';
import { clamp, lerp } from '../tactilePhysics';
import type {
  CosmicPlateId,
  InstrumentFieldGuide,
  MinigameVariantSpec,
} from '../types';

type ElementId = 'H' | 'He' | 'C' | 'O' | 'Fe' | 'Na';

interface ElementSpec {
  id: ElementId;
  name: string;
  /** Authentic rest-frame visible emission/absorption wavelengths in nanometers (380–700 nm). */
  wavelengthsNm: readonly number[];
  color: string;
}

interface PrismScenarioConfig {
  absorptionMode: boolean;
  stage3ZRange: readonly [number, number];
  stage3ForceSign: -1 | 0 | 1;
  stage1Pool: readonly [ElementId, ElementId, ElementId, ElementId];
  curatedStage3Triples: readonly (readonly [ElementId, ElementId, ElementId])[];
}

interface TileRect {
  id: ElementId;
  x: number;
  y: number;
  w: number;
  h: number;
}

const LAMBDA_MIN = 360;
const LAMBDA_MAX = 760;
const DOPPLER_Z_MIN = -0.10;
const DOPPLER_Z_MAX = 0.15;
const C_KM_S = 299792;

const ELEMENTS: readonly ElementSpec[] = [
  { id: 'H', name: 'HYDROGEN', wavelengthsNm: [410.2, 434.0, 486.1, 656.3], color: '#ff8a7a' },
  { id: 'He', name: 'HELIUM', wavelengthsNm: [447.1, 501.6, 587.6, 667.8], color: '#ffd97d' },
  { id: 'C', name: 'CARBON', wavelengthsNm: [426.7, 464.7, 569.6], color: '#9ee8ff' },
  { id: 'O', name: 'OXYGEN', wavelengthsNm: [495.9, 500.7, 630.0], color: '#8be9c0' },
  { id: 'Fe', name: 'IRON', wavelengthsNm: [438.4, 527.0, 614.8], color: '#ffb86c' },
  // Real Na I lines: 568.8 nm + Fraunhofer D2/D1 doublet (589.0 / 589.6 nm)
  { id: 'Na', name: 'SODIUM', wavelengthsNm: [568.8, 589.0, 589.6], color: '#ffe570' },
];

const ELEMENT_BY_ID: Record<ElementId, ElementSpec> = {
  H: ELEMENTS[0],
  He: ELEMENTS[1],
  C: ELEMENTS[2],
  O: ELEMENTS[3],
  Fe: ELEMENTS[4],
  Na: ELEMENTS[5],
};

const PRISM_PLATES: readonly [CosmicPlateId, CosmicPlateId, CosmicPlateId] = [
  'ring_m57',
  'cas_a',
  'southern_ring',
];

const PRISM_VARIANTS: readonly MinigameVariantSpec[] = [
  { index: 0, id: 'spectral_prism_v1', label: 'M57 Ionized Shell', plateId: 'ring_m57' },
  { index: 1, id: 'spectral_prism_v2', label: 'Cas A Oxygen-Sulfur', plateId: 'cas_a' },
  { index: 2, id: 'spectral_prism_v3', label: 'Southern Ring Halo', plateId: 'southern_ring' },
  { index: 3, id: 'spectral_prism_v4', label: 'High-z Doppler Comb', plateId: 'ring_m57' },
];

const SCENARIOS: readonly PrismScenarioConfig[] = [
  {
    absorptionMode: false,
    stage3ZRange: [0.044, 0.078],
    stage3ForceSign: -1, // Approaching ionized shell (Blueshift)
    stage1Pool: ['H', 'O', 'Fe', 'Na'],
    curatedStage3Triples: [
      ['H', 'O', 'Na'],
      ['H', 'C', 'Na'],
      ['O', 'Fe', 'Na'],
    ],
  },
  {
    absorptionMode: false,
    stage3ZRange: [0.048, 0.085],
    stage3ForceSign: 1, // Receding supernova ejecta (Redshift)
    stage1Pool: ['O', 'Fe', 'C', 'Na'],
    curatedStage3Triples: [
      ['O', 'Fe', 'Na'],
      ['H', 'O', 'Fe'],
      ['C', 'O', 'Fe'],
    ],
  },
  {
    absorptionMode: true, // Fraunhofer stellar photosphere dark absorption lines!
    stage3ZRange: [0.042, 0.076],
    stage3ForceSign: 0,
    stage1Pool: ['H', 'He', 'Fe', 'Na'],
    curatedStage3Triples: [
      ['H', 'Fe', 'Na'],
      ['H', 'C', 'Fe'],
      ['He', 'Fe', 'Na'],
    ],
  },
  {
    absorptionMode: false,
    stage3ZRange: [0.078, 0.128],
    stage3ForceSign: 1, // High-z cosmological redshift comb
    stage1Pool: ['H', 'He', 'C', 'O'],
    curatedStage3Triples: [
      ['H', 'O', 'C'],
      ['H', 'O', 'Na'],
      ['H', 'He', 'O'],
    ],
  },
];

/**
 * Dan Bruton's accurate visible-spectrum wavelength (nm) -> RGB conversion (380–750 nm).
 */
function wavelengthNmToRgb(nm: number): [number, number, number] {
  const wl = clamp(nm, 380, 750);
  let r = 0;
  let g = 0;
  let b = 0;
  if (wl < 440) {
    r = -(wl - 440) / (440 - 380);
    g = 0;
    b = 1;
  } else if (wl < 490) {
    r = 0;
    g = (wl - 440) / (490 - 440);
    b = 1;
  } else if (wl < 510) {
    r = 0;
    g = 1;
    b = -(wl - 510) / (510 - 490);
  } else if (wl < 580) {
    r = (wl - 510) / (580 - 510);
    g = 1;
    b = 0;
  } else if (wl < 645) {
    r = 1;
    g = -(wl - 645) / (645 - 580);
    b = 0;
  } else {
    r = 1;
    g = 0;
    b = 0;
  }

  let atten = 1;
  if (wl < 420) atten = 0.35 + (0.65 * (wl - 380)) / 40;
  else if (wl > 700) atten = 0.35 + (0.65 * (750 - wl)) / 50;

  const gamma = 0.8;
  return [
    Math.round(Math.pow(clamp(r * atten, 0, 1), gamma) * 255),
    Math.round(Math.pow(clamp(g * atten, 0, 1), gamma) * 255),
    Math.round(Math.pow(clamp(b * atten, 0, 1), gamma) * 255),
  ];
}

function wavelengthNmToHex(nm: number): string {
  const [r, g, b] = wavelengthNmToRgb(nm);
  return `rgb(${r},${g},${b})`;
}

function nmToNormU(nm: number): number {
  return clamp((nm - LAMBDA_MIN) / (LAMBDA_MAX - LAMBDA_MIN), 0.008, 0.992);
}

let cachedContinuumCanvas: HTMLCanvasElement | null = null;
function getContinuumStripCanvas(): HTMLCanvasElement | null {
  if (cachedContinuumCanvas) return cachedContinuumCanvas;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 400;
  c.height = 4;
  const ctx = c.getContext('2d');
  if (!ctx || typeof ctx.createImageData !== 'function' || typeof ctx.putImageData !== 'function') {
    return null;
  }
  const img = ctx.createImageData(400, 4);
  for (let x = 0; x < 400; x++) {
    const nm = lerp(LAMBDA_MIN, LAMBDA_MAX, x / 399);
    const [r, g, b] = wavelengthNmToRgb(nm);
    // Gentle UV/NIR falloff at edges of visible window
    const vis = nm < 380 ? clamp((nm - 360) / 20, 0.12, 1) : nm > 720 ? clamp((760 - nm) / 40, 0.14, 1) : 1;
    for (let y = 0; y < 4; y++) {
      const idx = (y * 400 + x) * 4;
      img.data[idx] = Math.round(r * vis);
      img.data[idx + 1] = Math.round(g * vis);
      img.data[idx + 2] = Math.round(b * vis);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  cachedContinuumCanvas = c;
  return c;
}

/**
 * PRM-09 — Spectral Prism Mixer
 * Authentic atomic emission & Fraunhofer absorption spectroscopy using real visible wavelengths
 * (380–700 nm: H Balmer, Na D-doublet, [O III], He, C, Fe) and multiplicative Doppler redshift
 * λ_obs = λ_rest * (1 + z). Zero shadowBlur, zero per-frame gradients/Set churn.
 */
export class SpectralPrismMixerGame extends BaseCosmicMinigame {
  readonly id = 'spectral_prism';
  readonly title = 'SPECTRAL PRISM MIXER';
  readonly subtitle = 'Chemical Barcodes & Doppler Shift';
  readonly instrumentCode = 'PRM-09';
  readonly platePool = PRISM_PLATES;
  readonly variants = PRISM_VARIANTS;

  private scenario: PrismScenarioConfig = SCENARIOS[0];
  private availableElements: ElementSpec[] = [];
  private targetElements = new Set<ElementId>();
  private selectedElements = new Set<ElementId>();
  private targetZ = 0;
  private userZ = 0;

  private draggingShift = false;
  private cachedMatch = 0;
  private lastShimmerAt = -10;

  // Pre-allocated flat buffers (ZERO per-frame Set/Array allocations in render!)
  private readonly targetLineU = new Float32Array(32);
  private targetLineCount = 0;
  private readonly userLineU = new Float32Array(32);
  private userLineCount = 0;
  private readonly tileRects: TileRect[] = [];
  private readonly shiftStripBuf: VernierStripSpec[] = [];
  private readonly shiftItemInput: VernierItemInput[] = [
    { key: 'doppler', label: 'DOPPLER SHIFT', val01: 0.4, locked: false, rightText: 'z = 0.000' },
  ];

  protected override onMount(): void {
    this.scenario = SCENARIOS[this.iterationIndex % SCENARIOS.length];
    this.lockHoldTargetSec = 0.58;
  }

  protected onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.scenario = SCENARIOS[this.iterationIndex % SCENARIOS.length];
    this.selectedElements.clear();
    this.draggingShift = false;

    this.availableElements =
      stage === 1
        ? this.scenario.stage1Pool.map((id) => ELEMENT_BY_ID[id])
        : [...ELEMENTS];

    if (stage === 3) {
      const triple =
        this.scenario.curatedStage3Triples[
          Math.floor(rng() * this.scenario.curatedStage3Triples.length)
        ];
      this.targetElements = new Set(triple);
      const sign =
        this.scenario.stage3ForceSign !== 0
          ? this.scenario.stage3ForceSign
          : rng() > 0.45
          ? 1
          : -1;
      const mag = lerp(this.scenario.stage3ZRange[0], this.scenario.stage3ZRange[1], rng());
      this.targetZ = clamp(sign * mag, DOPPLER_Z_MIN + 0.012, DOPPLER_Z_MAX - 0.012);
      this.userZ = 0;
    } else {
      const pickCount = stage === 1 ? 2 : 3;
      const pool = [...this.availableElements];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      this.targetElements = new Set(pool.slice(0, pickCount).map((e) => e.id));
      this.targetZ = 0;
      this.userZ = 0;
    }

    this.rebuildLineBuffers();
    this.cachedMatch = this.computeMatch01();
  }

  /**
   * Single source of truth for Doppler tolerance — shared by lock logic AND per-line visual dots!
   */
  private getDopplerTol(): number {
    return this.palette.mode === 'warm' ? 0.018 : this.palette.mode === 'cold' ? 0.0105 : 0.014;
  }

  private rebuildLineBuffers(): void {
    let tc = 0;
    for (let i = 0; i < ELEMENTS.length; i++) {
      const el = ELEMENTS[i];
      if (!this.targetElements.has(el.id)) continue;
      for (let j = 0; j < el.wavelengthsNm.length; j++) {
        if (tc < this.targetLineU.length) {
          this.targetLineU[tc++] = nmToNormU(el.wavelengthsNm[j] * (1 + this.targetZ));
        }
      }
    }
    this.targetLineCount = tc;

    let uc = 0;
    for (let i = 0; i < ELEMENTS.length; i++) {
      const el = ELEMENTS[i];
      if (!this.selectedElements.has(el.id)) continue;
      for (let j = 0; j < el.wavelengthsNm.length; j++) {
        if (uc < this.userLineU.length) {
          this.userLineU[uc++] = nmToNormU(el.wavelengthsNm[j] * (1 + this.userZ));
        }
      }
    }
    this.userLineCount = uc;
  }

  private isCompositionExact(): boolean {
    if (this.selectedElements.size !== this.targetElements.size) return false;
    for (const id of this.targetElements) {
      if (!this.selectedElements.has(id)) return false;
    }
    return true;
  }

  private isDopplerMatched(): boolean {
    if (this.stage < 3) return true;
    return Math.abs(this.userZ - this.targetZ) <= this.getDopplerTol();
  }

  private isSolvedNow(): boolean {
    return this.isCompositionExact() && this.isDopplerMatched();
  }

  private isLinePairMatchedU(uA: number, uB: number): boolean {
    const nmA = LAMBDA_MIN + uA * (LAMBDA_MAX - LAMBDA_MIN);
    const nmB = LAMBDA_MIN + uB * (LAMBDA_MAX - LAMBDA_MIN);
    const refNm = Math.max(360, (nmA + nmB) * 0.5);
    return Math.abs(nmA - nmB) / refNm <= this.getDopplerTol() + 0.001;
  }

  private computeLineOverlapScore(): number {
    if (this.targetLineCount === 0 || this.userLineCount === 0) return 0;
    let hits = 0;
    for (let i = 0; i < this.userLineCount; i++) {
      const uu = this.userLineU[i];
      for (let j = 0; j < this.targetLineCount; j++) {
        if (this.isLinePairMatchedU(uu, this.targetLineU[j])) {
          hits++;
          break;
        }
      }
    }
    const extra = Math.max(0, this.userLineCount - hits);
    return clamp((hits - extra * 0.45) / this.targetLineCount, 0, 1);
  }

  private computeMatch01(): number {
    let overlap = 0;
    for (const id of this.selectedElements) {
      overlap += this.targetElements.has(id) ? 1 : -0.45;
    }
    const compScore = clamp(overlap / Math.max(1, this.targetElements.size), 0, 1);
    if (this.stage < 3) return compScore;
    const shiftDiff = Math.abs(this.userZ - this.targetZ);
    const shiftScore = clamp(1 - shiftDiff / 0.11, 0, 1);
    return compScore * 0.62 + shiftScore * 0.38;
  }

  private applyDopplerFromX(px: number): void {
    const strip = this.shiftStripBuf[0];
    if (!strip) return;
    const frac = valueFromStripX(strip, px);
    let nextZ = lerp(DOPPLER_Z_MIN, DOPPLER_Z_MAX, frac);
    const magnetTol = this.getDopplerTol() * 0.9;
    if (Math.abs(nextZ - this.targetZ) < magnetTol) {
      nextZ = lerp(nextZ, this.targetZ, 0.42);
    } else if (Math.abs(nextZ) < 0.004) {
      nextZ = 0;
    }
    this.userZ = clamp(nextZ, DOPPLER_Z_MIN, DOPPLER_Z_MAX);
    this.rebuildLineBuffers();
  }

  private toggleElement(id: ElementId): void {
    const prevOverlap = this.computeLineOverlapScore();
    if (this.selectedElements.has(id)) {
      this.selectedElements.delete(id);
      this.rebuildLineBuffers();
      this.ctx.audio?.playTumblerClick(0.5, false);
      platform.triggerHaptic('vernierTick', 0.35);
    } else {
      this.selectedElements.add(id);
      this.rebuildLineBuffers();
      // Audio feedback reflects REAL observed line-overlap gain (zero secret target leakage!)
      const nextOverlap = this.computeLineOverlapScore();
      const improved = nextOverlap > prevOverlap + 0.04;
      this.ctx.audio?.playTumblerClick(0.82, improved);
      platform.triggerHaptic('vernierTick', improved ? 0.68 : 0.4);
    }
    this.cachedMatch = this.computeMatch01();
    this.emitHud(true);
  }

  protected override onPointerDown(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;
    const { x: px, y: py } = ev;

    if (this.stage === 3 && this.shiftStripBuf[0] && hitVernierStrip(this.shiftStripBuf[0], px, py)) {
      this.draggingShift = true;
      this.applyDopplerFromX(px);
      platform.triggerHaptic('vernierTick', 0.45);
      return;
    }

    for (let i = 0; i < this.tileRects.length; i++) {
      const tile = this.tileRects[i];
      if (px >= tile.x && px <= tile.x + tile.w && py >= tile.y && py <= tile.y + tile.h) {
        this.toggleElement(tile.id);
        return;
      }
    }
  }

  protected override onPointerMove(ev: PointerLocalEvent): void {
    if (!this.draggingShift || this.stageClearTimer > 0) return;
    this.applyDopplerFromX(ev.x);
  }

  protected override onPointerUp(): void {
    this.draggingShift = false;
  }

  protected override onKeyDown(e: KeyboardEvent): void {
    if (this.stageClearTimer > 0) return;
    const num = Number(e.key);
    if (num >= 1 && num <= this.availableElements.length) {
      this.toggleElement(this.availableElements[num - 1].id);
      return;
    }
    if (this.stage === 3) {
      const step = e.shiftKey ? 0.012 : 0.005;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.userZ = clamp(this.userZ - step, DOPPLER_Z_MIN, DOPPLER_Z_MAX);
        this.rebuildLineBuffers();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.userZ = clamp(this.userZ + step, DOPPLER_Z_MIN, DOPPLER_Z_MAX);
        this.rebuildLineBuffers();
      } else if (e.key === '0') {
        this.userZ = 0;
        this.rebuildLineBuffers();
      }
    }
  }

  protected onUpdate(dt: number): void {
    this.cachedMatch = this.computeMatch01();
    const overlap = this.computeLineOverlapScore();

    this.ctx.audio?.updateBeatSynth({
      beatHz: (1 - this.cachedMatch) * 6.5,
      harmonicLock: this.cachedMatch,
      warmth: this.profile.harmonicWarmthGain,
      strain: 0,
    });

    if (overlap > 0.65 && this.elapsedSec - this.lastShimmerAt > 0.42) {
      this.lastShimmerAt = this.elapsedSec;
      this.particles.emitSpectralShimmer(
        this.width * 0.5,
        this.compact ? this.height * 0.31 : this.height * 0.28,
        overlap,
        2
      );
    }

    if (this.stageClearTimer > 0) return;

    if (this.isSolvedNow()) {
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        this.triggerStageClear(
          `SPECTRUM ${this.stage}/3 DECODED`,
          this.stage < 3 ? 0.58 : 0.42,
          this.width * 0.5,
          this.compact ? this.height * 0.31 : this.height * 0.29
        );
      }
    } else {
      this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.9);
    }
  }

  private renderSpectrumStrip(
    c2d: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    elements: Set<ElementId>,
    zShift: number,
    otherU: Float32Array,
    otherCount: number,
    isTargetStrip: boolean
  ): void {
    const zTol = this.getDopplerTol();
    const continuum = getContinuumStripCanvas();
    const absorption = this.scenario.absorptionMode;

    c2d.save();
    c2d.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = 'rgba(220, 236, 250, 0.8)';
    c2d.textAlign = 'left';
    c2d.fillText(title, x, y - 6);

    // Strip glass bed
    c2d.fillStyle = 'rgba(4, 8, 15, 0.86)';
    c2d.fillRect(x, y, w, h);

    if (continuum && typeof c2d.drawImage === 'function') {
      c2d.globalAlpha = absorption ? 0.72 : 0.16;
      c2d.drawImage(continuum, x, y, w, h);
      c2d.globalAlpha = 1;
    }

    // Subtle dark edge vignette on absorption continuum for authentic spectrograph feel
    if (absorption) {
      c2d.fillStyle = 'rgba(4, 8, 16, 0.26)';
      c2d.fillRect(x, y, w, 4);
      c2d.fillRect(x, y + h - 4, w, 4);
    }

    c2d.strokeStyle = 'rgba(186, 214, 240, 0.28)';
    c2d.lineWidth = 1;
    c2d.strokeRect(x, y, w, h);

    // Nanometer ruler ticks (400, 500, 600, 700 nm)
    c2d.strokeStyle = 'rgba(220, 236, 252, 0.16)';
    c2d.beginPath();
    for (let nm = 400; nm <= 700; nm += 100) {
      const tx = x + nmToNormU(nm) * w;
      c2d.moveTo(tx, y + h - 5);
      c2d.lineTo(tx, y + h);
    }
    c2d.stroke();

    if (!isTargetStrip) {
      c2d.font = '600 8px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = 'rgba(200, 222, 244, 0.56)';
      c2d.textAlign = 'center';
      for (let nm = 400; nm <= 700; nm += 100) {
        c2d.fillText(`${nm}nm`, x + nmToNormU(nm) * w, y + h + 11);
      }
    }

    // Draw atomic lines (ZERO shadowBlur: 2-pass additive glow for emission; crisp dark troughs for absorption!)
    for (let eIdx = 0; eIdx < ELEMENTS.length; eIdx++) {
      const el = ELEMENTS[eIdx];
      if (!elements.has(el.id)) continue;
      for (let lIdx = 0; lIdx < el.wavelengthsNm.length; lIdx++) {
        const restNm = el.wavelengthsNm[lIdx];
        const obsNm = restNm * (1 + zShift);
        const u = nmToNormU(obsNm);
        const lx = x + u * w;

        // Per-line redshift comparison synced identically with getDopplerTol() across blue & red bands!
        let matched = false;
        for (let k = 0; k < otherCount; k++) {
          const otherNm = LAMBDA_MIN + otherU[k] * (LAMBDA_MAX - LAMBDA_MIN);
          if (Math.abs(otherNm - obsNm) / restNm <= zTol + 0.001) {
            matched = true;
            break;
          }
        }

        if (absorption) {
          // Fraunhofer dark absorption trough carved cleanly into visible blackbody rainbow
          c2d.fillStyle = 'rgba(4, 7, 14, 0.94)';
          c2d.fillRect(lx - 1.6, y + 1, 3.2, h - 2);
          c2d.strokeStyle = matched ? 'rgba(139, 233, 192, 0.65)' : 'rgba(255, 255, 255, 0.22)';
          c2d.lineWidth = 0.8;
          c2d.beginPath();
          c2d.moveTo(lx - 2, y + 1);
          c2d.lineTo(lx - 2, y + h - 1);
          c2d.moveTo(lx + 2, y + 1);
          c2d.lineTo(lx + 2, y + h - 1);
          c2d.stroke();
        } else {
          const col = wavelengthNmToHex(obsNm);
          if ('globalCompositeOperation' in c2d) c2d.globalCompositeOperation = 'lighter';
          c2d.strokeStyle = col;
          c2d.globalAlpha = this.palette.mode === 'warm' ? 0.34 : 0.22;
          c2d.lineWidth = 7;
          c2d.beginPath();
          c2d.moveTo(lx, y + 2);
          c2d.lineTo(lx, y + h - 2);
          c2d.stroke();

          if ('globalCompositeOperation' in c2d) c2d.globalCompositeOperation = 'source-over';
          c2d.globalAlpha = 0.98;
          c2d.strokeStyle = col;
          c2d.lineWidth = 2.3;
          c2d.beginPath();
          c2d.moveTo(lx, y + 2);
          c2d.lineTo(lx, y + h - 2);
          c2d.stroke();

          c2d.strokeStyle = '#ffffff';
          c2d.globalAlpha = 0.55;
          c2d.lineWidth = 0.9;
          c2d.beginPath();
          c2d.moveTo(lx, y + 4);
          c2d.lineTo(lx, y + h - 4);
          c2d.stroke();
          c2d.globalAlpha = 1;
        }

        // Exact-synced match indicator dot (uses identical tolU as lock logic!)
        if (!isTargetStrip) {
          c2d.fillStyle = matched ? this.palette.lockHex : '#ff986b';
          c2d.beginPath();
          c2d.arc(lx, y - 3.5, matched ? 3.1 : 2.5, 0, Math.PI * 2);
          c2d.fill();
        } else if (!matched && otherCount > 0) {
          c2d.strokeStyle = 'rgba(255, 224, 150, 0.72)';
          c2d.lineWidth = 1.3;
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

  protected onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const compact = this.compact;
    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: 5,
      alpha: 0.42,
      brightness: 0.74,
      tintAlpha: 0.52,
    });

    const barW = Math.min(w * 0.82, 860);
    const barX = (w - barW) * 0.5;
    const barH = compact ? 34 : 54;
    const topY = compact ? 64 : 110;
    const midY = topY + barH + (compact ? 22 : 38);

    // Subtle diegetic optical glass prism dispersion fan above Observed strip (desktop)
    if (!compact) {
      c2d.save();
      const apexX = w * 0.5;
      const apexY = topY - 38;
      c2d.strokeStyle = 'rgba(220, 238, 255, 0.24)';
      c2d.fillStyle = 'rgba(130, 180, 224, 0.06)';
      c2d.lineWidth = 1;
      c2d.beginPath();
      c2d.moveTo(apexX, apexY);
      c2d.lineTo(apexX - 18, apexY + 20);
      c2d.lineTo(apexX + 18, apexY + 20);
      c2d.closePath();
      c2d.fill();
      c2d.stroke();

      c2d.strokeStyle = 'rgba(196, 222, 248, 0.12)';
      c2d.beginPath();
      c2d.moveTo(apexX - 16, apexY + 20);
      c2d.lineTo(barX + barW * 0.08, topY - 12);
      c2d.moveTo(apexX + 16, apexY + 20);
      c2d.lineTo(barX + barW * 0.92, topY - 12);
      c2d.stroke();
      c2d.restore();
    }

    // Subtle vertical resonance beams linking aligned spectral lines between top & bottom strips
    c2d.save();
    c2d.strokeStyle = `rgba(${this.palette.lockRgb}, 0.26)`;
    c2d.lineWidth = 1;
    c2d.beginPath();
    for (let i = 0; i < this.userLineCount; i++) {
      const uu = this.userLineU[i];
      for (let j = 0; j < this.targetLineCount; j++) {
        if (this.isLinePairMatchedU(uu, this.targetLineU[j])) {
          const lx = barX + uu * barW;
          c2d.moveTo(lx, topY + barH);
          c2d.lineTo(lx, midY);
          break;
        }
      }
    }
    c2d.stroke();
    c2d.restore();

    const modeTag = this.scenario.absorptionMode ? 'FRAUNHOFER ABSORPTION' : 'EMISSION SPECTRUM';
    this.renderSpectrumStrip(
      c2d,
      barX,
      topY,
      barW,
      barH,
      `OBSERVED ${modeTag}`,
      this.targetElements,
      this.targetZ,
      this.userLineU,
      this.userLineCount,
      true
    );
    this.renderSpectrumStrip(
      c2d,
      barX,
      midY,
      barW,
      barH,
      `YOUR PRISM MIX (${this.selectedElements.size}/${this.targetElements.size})`,
      this.selectedElements,
      this.userZ,
      this.targetLineU,
      this.targetLineCount,
      false
    );

    // Element cards with stacked crisp labels + mini spectral barcodes (+ live Stage 3 shifted ghost ticks!)
    const count = this.availableElements.length;
    const gap = compact ? 7 : 11;
    const tileW = Math.min(130, (barW - gap * (count - 1)) / count);
    const tileH = compact ? 52 : 70;
    const totalTilesW = count * tileW + (count - 1) * gap;
    const tileStartX = (w - totalTilesW) * 0.5;
    const tileY = midY + barH + (compact ? 20 : 28);

    this.tileRects.length = count;
    c2d.save();
    for (let i = 0; i < count; i++) {
      const el = this.availableElements[i];
      const tx = tileStartX + i * (tileW + gap);
      const existing = this.tileRects[i];
      if (existing) {
        existing.id = el.id;
        existing.x = tx;
        existing.y = tileY;
        existing.w = tileW;
        existing.h = tileH;
      } else {
        this.tileRects[i] = { id: el.id, x: tx, y: tileY, w: tileW, h: tileH };
      }

      const active = this.selectedElements.has(el.id);
      c2d.fillStyle = active ? `rgba(${this.palette.accentRgb}, 0.2)` : 'rgba(7, 13, 22, 0.84)';
      c2d.strokeStyle = active ? el.color : 'rgba(186, 214, 240, 0.22)';
      c2d.lineWidth = active ? 2 : 1.1;
      c2d.fillRect(tx, tileY, tileW, tileH);
      c2d.strokeRect(tx, tileY, tileW, tileH);

      // Stacked Symbol + Name (never overflows narrow mobile tiles!)
      c2d.font = `700 ${compact ? 12 : 13.5}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      c2d.fillStyle = active ? el.color : '#e6f0fa';
      c2d.textAlign = 'left';
      c2d.fillText(el.id, tx + 8, tileY + (compact ? 15 : 19));

      c2d.font = `600 ${compact ? 7.5 : 8.5}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      c2d.fillStyle = active ? 'rgba(240, 248, 255, 0.88)' : 'rgba(190, 212, 234, 0.62)';
      c2d.textAlign = 'right';
      c2d.fillText(`${i + 1} · ${el.name}`, tx + tileW - 7, tileY + (compact ? 14 : 18));

      // Mini spectral barcode strip inside card
      const bx = tx + 7;
      const bw = tileW - 14;
      const by = tileY + (compact ? 22 : 30);
      const bh = compact ? 22 : 30;
      const continuum = getContinuumStripCanvas();
      c2d.fillStyle = 'rgba(4, 8, 14, 0.9)';
      c2d.fillRect(bx, by, bw, bh);
      if (this.scenario.absorptionMode && continuum && typeof c2d.drawImage === 'function') {
        c2d.globalAlpha = 0.52;
        c2d.drawImage(continuum, bx, by, bw, bh);
        c2d.globalAlpha = 1;
      }
      c2d.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      c2d.lineWidth = 1;
      c2d.strokeRect(bx, by, bw, bh);

      for (let j = 0; j < el.wavelengthsNm.length; j++) {
        const restNm = el.wavelengthsNm[j];
        // Live shifted preview ticks when Stage 3 Doppler z != 0!
        if (this.stage === 3 && Math.abs(this.userZ) > 0.004) {
          const restX = bx + nmToNormU(restNm) * bw;
          c2d.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          c2d.lineWidth = 1;
          c2d.beginPath();
          c2d.moveTo(restX, by + 2);
          c2d.lineTo(restX, by + 6);
          c2d.stroke();
        }
        const shiftedNm = restNm * (1 + (this.stage === 3 ? this.userZ : 0));
        const lx = bx + nmToNormU(shiftedNm) * bw;
        c2d.strokeStyle = this.scenario.absorptionMode ? '#04070d' : wavelengthNmToHex(shiftedNm);
        c2d.lineWidth = this.scenario.absorptionMode ? 2.4 : 2;
        c2d.beginPath();
        c2d.moveTo(lx, by + 2);
        c2d.lineTo(lx, by + bh - 2);
        c2d.stroke();
      }
    }
    c2d.restore();

    // Stage 3 Bidirectional Multiplicative Doppler Vernier (safely positioned above mobile console!)
    if (this.stage === 3) {
      const zFrac = clamp((this.userZ - DOPPLER_Z_MIN) / (DOPPLER_Z_MAX - DOPPLER_Z_MIN), 0, 1);
      const dopplerOk = this.isDopplerMatched();
      const velKmS = Math.round(this.userZ * C_KM_S);
      const signStr = this.userZ >= 0 ? '+' : '';
      const rightLabel = this.profile.showNumericDeltas
        ? `z=${signStr}${this.userZ.toFixed(3)} (${signStr}${(velKmS / 1000).toFixed(1)}k km/s)`
        : `z = ${signStr}${this.userZ.toFixed(3)}`;

      this.shiftItemInput[0].label = '← BLUESHIFT · DOPPLER · REDSHIFT →';
      this.shiftItemInput[0].val01 = zFrac;
      this.shiftItemInput[0].locked = dopplerOk;
      this.shiftItemInput[0].rightText = rightLabel;

      const sY = compact ? Math.min(h - 92, tileY + tileH + 22) : tileY + tileH + 34;
      layoutVernierRowInto(this.shiftStripBuf, w, h, this.shiftItemInput, sY);
      const strip = this.shiftStripBuf[0];
      const baseCol =
        this.userZ < -0.005 ? '#82c8ff' : this.userZ > 0.005 ? '#ff8a7a' : this.palette.accentHex;
      drawVernierStrip(c2d, strip, baseCol, this.palette.lockHex);

      // Zero-velocity rest-frame notch on Doppler bar
      const zeroX = strip.x + ((0 - DOPPLER_Z_MIN) / (DOPPLER_Z_MAX - DOPPLER_Z_MIN)) * strip.w;
      c2d.save();
      c2d.fillStyle = 'rgba(255, 255, 255, 0.48)';
      c2d.fillRect(zeroX - 1, strip.y + 1, 2, 10);
      c2d.restore();
    } else {
      this.shiftStripBuf.length = 0;
    }

    this.drawSharedOverlays(
      c2d,
      w,
      h,
      this.lockHoldSec > 0.02
        ? {
            cx: w * 0.5,
            cy: (topY + midY + barH) * 0.5,
            radius: compact ? 32 : 44,
            progress01: this.lockHoldSec / this.lockHoldTargetSec,
            label: `LOCKED ${Math.round((this.lockHoldSec / this.lockHoldTargetSec) * 100)}%`,
          }
        : undefined
    );
  }

  protected getStageProgress01(): number {
    return clamp((this.stage - 1 + this.cachedMatch) / 3, 0, 1);
  }

  protected getPromptText(): string {
    const styleWord = this.scenario.absorptionMode ? 'dark absorption troughs' : 'bright emission lines';
    if (this.stage === 1) {
      return `Match the observed ${styleWord} by toggling ${this.targetElements.size} atomic barcodes (keys 1–4).`;
    }
    if (this.stage === 2) {
      return `Decode the ${this.targetElements.size}-element chemical fingerprint — watch mint match dots above your mix.`;
    }
    return `Select ${this.targetElements.size} elements & slide DOPPLER z until shifted wavelengths lock mint green.`;
  }

  protected solveCurrentStage(stage: 1 | 2 | 3): void {
    void stage;
    this.selectedElements = new Set(this.targetElements);
    this.userZ = this.targetZ;
    this.rebuildLineBuffers();
    this.cachedMatch = this.computeMatch01();
  }

  protected override verifySolved(): boolean {
    return this.isCompositionExact() && this.isDopplerMatched();
  }

  protected onAllStagesCleared(): void {
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.finishSuccess({
      accuracy: 0.96,
      proofFragmentSuffix: 'prism',
      dossierSnippet: `Atomic spectral barcodes & multiplicative Doppler shift (${this.activeVariant?.label ?? 'Spectrograph'}) decoded on ${this.ctx.targetName}.`,
      telemetrySummary: `Spectrograph Lock 96% · z=${this.targetZ >= 0 ? '+' : ''}${this.targetZ.toFixed(3)} · ${totalSec.toFixed(1)}s`,
      physicalPrinciple: 'Atomic Emission / Fraunhofer Absorption Spectroscopy & Relativistic Doppler Shift λ = λ₀(1+z)',
    });
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Every element absorbs or emits light at fixed visible wavelengths (e.g., H-alpha 656 nm, Sodium D-doublet 589 nm). Radial motion shifts all wavelengths multiplicatively: λ_obs = λ_rest(1 + z).',
      goalSummary:
        'Match the observed stellar spectrum using atomic barcode cards, then dial Doppler redshift/blueshift z in Stage 3.',
      controlsDesktop:
        'Click element cards (or keys 1–6) to mix spectra; drag DOPPLER SHIFT or use ArrowLeft/Right on Stage 3.',
      controlsTouch: 'Tap atomic cards and slide DOPPLER SHIFT on Stage 3.',
      warmthEffect:
        'Warm H% broadens Doppler resonance tolerances; Cold H% shows exact radial velocity (km/s) and tightens wavelength lock.',
    };
  }
}
