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
import { getPlateCanvasPair } from '../render/BackdropCachePipeline';
import { drawGlowStroke } from '../render/OpticalDrawUtils';
import { drawOpticalStar } from '../render/StarPSFAtlas';
import { clamp, lerp } from '../tactilePhysics';
import type {
  CosmicPlateId,
  HudActionButtonSpec,
  InstrumentFieldGuide,
  MinigameVariantSpec,
  SpectralClass,
} from '../types';

interface HazardTrack {
  /** Isotropic aperture-centered coordinates (scaled by min(w, h) -> consistent on desktop & mobile!). */
  offsetScale: number;
  dirX: number;
  dirY: number;
  telegraphSec: number;
  maxTelegraphSec: number;
  progress: number;
  speed: number;
  /** True = central unavoidable flare (crimson -> CLOSE SHUTTER); false = peripheral grazing streak (amber -> NARROW IRIS). */
  isFlare: boolean;
}

interface SubFrameCard {
  id: number;
  contaminated: boolean;
  rejected: boolean;
  cropOffsetX: number;
  cropOffsetY: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PhotonKnot {
  rx: number;
  ry: number;
  threshold: number;
  size: number;
  spectralClass: SpectralClass;
}

interface ExposureScenarioConfig {
  artifactKind: 'cosmic_slash' | 'double_satellite' | 'hot_column' | 'twin_cr';
  pairedGrazers: boolean;
  centralFlareBias: number;
  speedMul: number;
  labelTag: string;
}

const EXP_PLATES: readonly [CosmicPlateId, CosmicPlateId, CosmicPlateId] = [
  'hudf',
  'smacs',
  'whirlpool',
];

const EXP_VARIANTS: readonly MinigameVariantSpec[] = [
  { index: 0, id: 'exposure_stacker_v1', label: 'HUDF Ultra-Deep Stack', plateId: 'hudf' },
  { index: 1, id: 'exposure_stacker_v2', label: 'SMACS Cluster Exposure', plateId: 'smacs' },
  { index: 2, id: 'exposure_stacker_v3', label: 'M51 Faint Tidal Tail', plateId: 'whirlpool' },
  { index: 3, id: 'exposure_stacker_v4', label: 'Meteor Shower Dodger', plateId: 'hudf' },
];

const SCENARIOS: readonly ExposureScenarioConfig[] = [
  {
    artifactKind: 'cosmic_slash',
    pairedGrazers: false,
    centralFlareBias: 0.34,
    speedMul: 1.0,
    labelTag: 'HUDF CCD STACK',
  },
  {
    artifactKind: 'double_satellite',
    pairedGrazers: false,
    centralFlareBias: 0.48,
    speedMul: 0.96,
    labelTag: 'PROTON FLARE WINDOW',
  },
  {
    artifactKind: 'hot_column',
    pairedGrazers: false,
    centralFlareBias: 0.38,
    speedMul: 1.04,
    labelTag: 'TIDAL TAIL INTEGRATION',
  },
  {
    artifactKind: 'twin_cr',
    pairedGrazers: true,
    centralFlareBias: 0.30,
    speedMul: 1.12,
    labelTag: 'METEOR GRAZING STREAM',
  },
];

/**
 * EXP-13 — Long-Exposure Stacker
 * Variable-aperture deep-field CCD integration (gather rate ∝ r², focal ratio f/2.0–f/5.6, SNR ∝ √t).
 * ZERO per-frame `ctx.filter` blurs (uses pre-baked sharp/blurred offscreen plate crossfade & cropped
 * sub-frame blits), isotropic hazard physics, real curved-leaf 8-blade iris diaphragm, and Stage 3
 * sigma-clipping artifact rejection.
 */
export class ExposureStackerGame extends BaseCosmicMinigame {
  readonly id = 'exposure_stacker';
  readonly title = 'LONG-EXPOSURE STACKER';
  readonly subtitle = 'Variable-Iris Deep-Field Integration';
  readonly instrumentCode = 'EXP-13';
  readonly platePool = EXP_PLATES;
  readonly variants = EXP_VARIANTS;

  private scenario: ExposureScenarioConfig = SCENARIOS[0];
  private phase: 'expose' | 'inspect' = 'expose';
  private shutterOpen = false;
  private shutterBlade01 = 0; // 0 = closed, 1 = open
  private exposure01 = 0;
  private iris01 = 0.72;
  private dragMode: 'iris' | 'rim' | null = null;

  private hazards: HazardTrack[] = [];
  private hazardCooldown = 1.5;
  private spoilFlash = 0;
  private inspectHintFlash = 0;
  private subFrames: SubFrameCard[] = [];
  private photonKnots: PhotonKnot[] = [];
  private noiseSpecks: Float32Array = new Float32Array(0);
  private stageHazardRng: () => number = () => 0.5;
  private lastSparkAt = -10;

  private readonly irisStripBuf: VernierStripSpec[] = [];
  private readonly irisItemInput: VernierItemInput[] = [
    { key: 'iris', label: 'APERTURE IRIS', val01: 0.72, rightText: 'f/2.8' },
  ];

  protected override onMount(): void {
    this.scenario = SCENARIOS[this.iterationIndex % SCENARIOS.length];
    const knotRng = this.stageRng(1, 'photon-knots');
    const classes: SpectralClass[] = ['O', 'B', 'A', 'F', 'G', 'K'];
    this.photonKnots = Array.from({ length: 68 }, (_, i) => {
      const a = knotRng() * Math.PI * 2;
      const rad = Math.sqrt(knotRng()) * 0.9;
      return {
        rx: Math.cos(a) * rad,
        ry: Math.sin(a) * rad,
        threshold: i / 68,
        size: 1.2 + knotRng() * 1.6,
        spectralClass: classes[i % classes.length],
      };
    });

    // Deterministic sensor shot-noise coordinates [rx, ry, phase, ...] (60 specks, zero GC)
    const speckCount = 60;
    this.noiseSpecks = new Float32Array(speckCount * 3);
    for (let i = 0; i < speckCount; i++) {
      const a = knotRng() * Math.PI * 2;
      const r = Math.sqrt(knotRng()) * 0.94;
      this.noiseSpecks[i * 3] = Math.cos(a) * r;
      this.noiseSpecks[i * 3 + 1] = Math.sin(a) * r;
      this.noiseSpecks[i * 3 + 2] = knotRng() * 6.28;
    }
  }

  protected onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.scenario = SCENARIOS[this.iterationIndex % SCENARIOS.length];
    this.stageHazardRng = rng;
    this.phase = 'expose';
    this.exposure01 = 0;
    this.shutterOpen = false;
    this.shutterBlade01 = 0;
    this.iris01 = stage === 1 ? 0.74 : stage === 2 ? 0.68 : 0.72;
    this.dragMode = null;
    this.hazards = [];
    this.hazardCooldown = stage === 1 ? 1.45 : 1.05;
    this.spoilFlash = 0;
    this.inspectHintFlash = 0;

    const badIdx = Math.floor(rng() * 4);
    this.subFrames = Array.from({ length: 4 }, (_, id) => ({
      id,
      contaminated: id === badIdx,
      rejected: false,
      cropOffsetX: (rng() - 0.5) * 0.08,
      cropOffsetY: (rng() - 0.5) * 0.08,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    }));
  }

  onHelperAction(actionId: string): void {
    if (actionId === 'toggle_shutter' && this.phase === 'expose' && !this.completed && this.stageClearTimer <= 0) {
      this.setShutter(!this.shutterOpen);
    }
  }

  private setShutter(open: boolean): void {
    if (this.completed || this.stageClearTimer > 0 || this.phase !== 'expose') return;
    if (this.shutterOpen !== open) {
      this.shutterOpen = open;
      this.ctx.audio?.playSolenoidClack(open);
      platform.triggerHaptic('vernierTick', open ? 0.65 : 0.35);
      this.emitHud(true);
    }
  }

  private getApertureGeometry(w: number, h: number) {
    const compact = h < 450;
    const scale = Math.min(w, h);
    const minMul = 0.095;
    const maxMul = compact ? 0.195 : 0.245;
    const minR = scale * minMul;
    const maxR = scale * maxMul;
    const apR = lerp(minR, maxR, clamp(this.iris01, 0, 1));
    return {
      cx: w * 0.5,
      cy: compact ? h * 0.365 : h * 0.425,
      scale,
      minR,
      maxR,
      apR,
      compact,
    };
  }

  private getTelegraphLeadSec(): number {
    // Warm H% gives generous human warning lead (1.06s); Cold H% gives brisk surgical cadence (0.78s)
    return this.palette.mode === 'warm' ? 1.06 : this.palette.mode === 'cold' ? 0.78 : 0.92;
  }

  private spawnHazard(): void {
    const rng = this.stageHazardRng;
    const ang = rng() * Math.PI * 2;
    const dirX = Math.cos(ang);
    const dirY = Math.sin(ang);
    const isFlare = rng() < (this.stage === 1 ? 0.28 : this.scenario.centralFlareBias);
    const lead = this.getTelegraphLeadSec();
    const baseSpeed = (this.stage === 1 ? 0.62 : this.stage === 2 ? 0.78 : 0.9) * this.scenario.speedMul;

    if (isFlare) {
      // Central unavoidable flare (offset <= 0.045 * scale -> cuts straight through even narrowest iris!)
      this.hazards.push({
        offsetScale: (rng() - 0.5) * 0.08,
        dirX,
        dirY,
        telegraphSec: lead,
        maxTelegraphSec: lead,
        progress: 0,
        speed: baseSpeed,
        isFlare: true,
      });
      this.ctx.audio?.playProximityTick?.(0.95);
    } else {
      // Peripheral grazing satellite/meteor track (offset 0.135..0.185 * scale -> dodgeable by shrinking iris!)
      const sign = rng() > 0.5 ? 1 : -1;
      const off = sign * (0.135 + rng() * 0.052);
      this.hazards.push({
        offsetScale: off,
        dirX,
        dirY,
        telegraphSec: lead,
        maxTelegraphSec: lead,
        progress: 0,
        speed: baseSpeed,
        isFlare: false,
      });
      if (this.scenario.pairedGrazers && this.stage >= 2) {
        this.hazards.push({
          offsetScale: -off,
          dirX: -dirX,
          dirY: -dirY,
          telegraphSec: lead + 0.18,
          maxTelegraphSec: lead + 0.18,
          progress: 0,
          speed: baseSpeed * 0.94,
          isFlare: false,
        });
      }
      this.ctx.audio?.playProximityTick?.(0.45);
    }
  }

  private hazardEndpointsPx(
    hz: HazardTrack,
    cx: number,
    cy: number,
    scale: number
  ): { x0: number; y0: number; x1: number; y1: number } {
    const normX = -hz.dirY;
    const normY = hz.dirX;
    const offPx = hz.offsetScale * scale;
    const spanPx = scale * 0.52;
    return {
      x0: cx + normX * offPx - hz.dirX * spanPx,
      y0: cy + normY * offPx - hz.dirY * spanPx,
      x1: cx + normX * offPx + hz.dirX * spanPx,
      y1: cy + normY * offPx + hz.dirY * spanPx,
    };
  }

  private rejectCard(card: SubFrameCard): void {
    if (card.contaminated) {
      card.rejected = true;
      platform.triggerHaptic('phaseSnapLock', 1.0);
      this.ctx.audio?.playTumblerClick(0.95, true);
      this.triggerStageClear(
        'ARTIFACT REJECTED · CLEAN STACK VERIFIED',
        0.55,
        card.x + card.w * 0.5,
        card.y + card.h * 0.5
      );
    } else {
      this.inspectHintFlash = 1;
      platform.triggerHaptic('rejectThud', 0.65);
      this.ctx.audio?.playSolenoidClack(false);
      this.emitHud(true);
    }
  }

  protected override onPointerDown(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;
    const { x: px, y: py } = ev;

    if (this.phase === 'inspect') {
      for (let i = 0; i < this.subFrames.length; i++) {
        const card = this.subFrames[i];
        if (px >= card.x && px <= card.x + card.w && py >= card.y && py <= card.y + card.h) {
          this.rejectCard(card);
          return;
        }
      }
      return;
    }

    // 1. Aperture Iris Vernier Strip
    const strip = this.irisStripBuf[0];
    if (strip && hitVernierStrip(strip, px, py)) {
      this.dragMode = 'iris';
      this.iris01 = clamp(valueFromStripX(strip, px), 0.14, 1);
      platform.triggerHaptic('vernierTick', 0.4);
      return;
    }

    const { cx, cy, apR } = this.getApertureGeometry(this.width, this.height);
    // 2. Dedicated rim resize handle tab on right edge of aperture
    const tabX = cx + apR;
    const tabY = cy;
    if (Math.hypot(px - tabX, py - tabY) <= 24) {
      this.dragMode = 'rim';
      platform.triggerHaptic('vernierTick', 0.4);
      return;
    }

    // 3. Tapping inside circular aperture cleanly latches/toggles shutter!
    if (Math.hypot(px - cx, py - cy) <= apR + 10) {
      this.setShutter(!this.shutterOpen);
    }
  }

  protected override onPointerMove(ev: PointerLocalEvent): void {
    if (!this.dragMode || this.stageClearTimer > 0 || this.phase !== 'expose') return;
    if (this.dragMode === 'iris' && this.irisStripBuf[0]) {
      this.iris01 = clamp(valueFromStripX(this.irisStripBuf[0], ev.x), 0.14, 1);
    } else if (this.dragMode === 'rim') {
      const { cx, cy, minR, maxR } = this.getApertureGeometry(this.width, this.height);
      const r = Math.hypot(ev.x - cx, ev.y - cy);
      this.iris01 = clamp((r - minR) / Math.max(1, maxR - minR), 0.14, 1);
    }
  }

  protected override onPointerUp(): void {
    this.dragMode = null;
  }

  protected override onWheel(deltaY: number): boolean {
    if (this.phase !== 'expose' || this.stageClearTimer > 0) return false;
    this.iris01 = clamp(this.iris01 - deltaY * 0.0008, 0.14, 1);
    return true;
  }

  protected override onKeyDown(e: KeyboardEvent): void {
    if (this.stageClearTimer > 0) return;
    if (this.phase === 'inspect') {
      const num = Number(e.key);
      if (num >= 1 && num <= this.subFrames.length) {
        this.rejectCard(this.subFrames[num - 1]);
      }
      return;
    }
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      this.setShutter(true);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      this.iris01 = clamp(this.iris01 - 0.06, 0.14, 1);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.iris01 = clamp(this.iris01 + 0.06, 0.14, 1);
    }
  }

  protected override onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space' && this.phase === 'expose') {
      e.preventDefault();
      this.setShutter(false);
    }
  }

  protected onUpdate(dt: number): void {
    this.spoilFlash = Math.max(0, this.spoilFlash - dt * 1.8);
    this.inspectHintFlash = Math.max(0, this.inspectHintFlash - dt * 1.6);
    this.shutterBlade01 = lerp(this.shutterBlade01, this.shutterOpen ? 1 : 0, clamp(dt * 13, 0, 1));

    if (this.stageClearTimer > 0 || this.phase === 'inspect') return;

    this.hazardCooldown -= dt;
    if (this.hazardCooldown <= 0) {
      this.hazardCooldown = this.stage === 1 ? 1.85 : this.stage === 2 ? 1.38 : 1.16;
      this.spawnHazard();
    }

    const { cx, cy, scale, apR, maxR } = this.getApertureGeometry(this.width, this.height);
    let hittingOpenSensor = false;

    for (let i = 0; i < this.hazards.length; i++) {
      const hz = this.hazards[i];
      if (hz.telegraphSec > 0) {
        hz.telegraphSec = Math.max(0, hz.telegraphSec - dt);
      } else {
        hz.progress += hz.speed * dt;
        const { x0, y0, x1, y1 } = this.hazardEndpointsPx(hz, cx, cy, scale);
        const headX = lerp(x0, x1, hz.progress);
        const headY = lerp(y0, y1, hz.progress);
        const tailP = Math.max(0, hz.progress - 0.17);
        const tailX = lerp(x0, x1, tailP);
        const tailY = lerp(y0, y1, tailP);
        const sx = tailX - headX;
        const sy = tailY - headY;
        const len2 = sx * sx + sy * sy;
        const u = len2 > 0 ? clamp(((cx - headX) * sx + (cy - headY) * sy) / len2, 0, 1) : 0;
        if (Math.hypot(cx - (headX + sx * u), cy - (headY + sy * u)) <= apR + 2) {
          hittingOpenSensor = true;
        }
      }
    }

    // Compact active hazards in-place (minimal churn)
    let writeIdx = 0;
    for (let i = 0; i < this.hazards.length; i++) {
      if (this.hazards[i].progress <= 1.18) {
        this.hazards[writeIdx++] = this.hazards[i];
      }
    }
    this.hazards.length = writeIdx;

    if (this.shutterOpen) {
      if (hittingOpenSensor) {
        this.exposure01 = Math.max(0, this.exposure01 - dt * 0.4);
        if (this.spoilFlash <= 0.1) {
          this.spoilFlash = 1;
          platform.triggerHaptic('rejectThud', 0.75);
          this.ctx.audio?.playSolenoidClack(true);
        }
      } else {
        // Authentic optical gathering rate proportional to APERTURE AREA (r²)!
        const areaFrac = (apR / Math.max(1, maxR)) * (apR / Math.max(1, maxR));
        const coldBonus = this.palette.mode === 'cold' ? 1.07 : 1.0;
        const gatherRate = lerp(0.11, 0.39, areaFrac) * coldBonus;
        this.exposure01 = clamp(this.exposure01 + dt * gatherRate, 0, 1);

        if (this.elapsedSec - this.lastSparkAt > 0.24) {
          this.lastSparkAt = this.elapsedSec;
          this.particles.emitPhotonSparks(cx, cy, 2, apR * 0.85, this.palette.accentHex);
        }

        if (this.exposure01 >= 1) {
          this.shutterOpen = false;
          if (this.stage === 3) {
            platform.triggerHaptic('phaseSnapLock', 0.95);
            this.ctx.audio?.playPhaseLock?.(this.stage);
            this.phase = 'inspect';
            this.stageFlash = 1;
            this.stageFlashText = '4 SUB-FRAMES CAPTURED · REJECT ARTIFACT';
            this.emitHud(true);
          } else {
            this.triggerStageClear(`EXPOSURE FRAME ${this.stage}/3 STACKED`, 0.58, cx, cy);
          }
        }
      }
    }

    this.ctx.audio?.updateBeatSynth({
      beatHz: this.shutterOpen ? (hittingOpenSensor ? 12 : (1 - this.exposure01) * 4.5) : 0,
      harmonicLock: this.shutterOpen ? this.exposure01 : 0,
      warmth: this.profile.harmonicWarmthGain,
      strain: hittingOpenSensor ? 0.8 : 0,
    });
  }

  private renderInspectSubFrames(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const compact = this.compact;
    const cardW = compact ? Math.min(138, w * 0.19) : Math.min(170, w * 0.185);
    const cardH = cardW * 0.92;
    const gap = compact ? 14 : 24;
    const totalW = cardW * 4 + gap * 3;
    const startX = (w - totalW) * 0.5;
    const cardY = (h - cardH) * 0.46;
    const pair = getPlateCanvasPair(this.activePlateId, w, h);

    for (let i = 0; i < this.subFrames.length; i++) {
      const card = this.subFrames[i];
      card.x = startX + i * (cardW + gap);
      card.y = cardY;
      card.w = cardW;
      card.h = cardH;

      c2d.save();
      c2d.fillStyle = 'rgba(6, 11, 20, 0.92)';
      c2d.strokeStyle = card.rejected ? this.palette.lockHex : this.palette.secondaryHex;
      c2d.lineWidth = card.rejected ? 2.2 : 1.4;
      c2d.fillRect(card.x, card.y, card.w, card.h);
      c2d.strokeRect(card.x, card.y, card.w, card.h);

      const ix = card.x + 4;
      const iy = card.y + 4;
      const iw = card.w - 8;
      const ih = card.h - 24;

      c2d.beginPath();
      c2d.rect(ix, iy, iw, ih);
      c2d.clip?.();

      // Single fast cropped blit from cached sharp plate (ZERO full-screen blur redraws!)
      if (pair && typeof c2d.drawImage === 'function') {
        const sw = pair.sharp.width * 0.46;
        const sh = pair.sharp.height * 0.46;
        const sx = clamp(pair.sharp.width * (0.27 + card.cropOffsetX), 0, pair.sharp.width - sw);
        const sy = clamp(pair.sharp.height * (0.27 + card.cropOffsetY), 0, pair.sharp.height - sh);
        c2d.globalAlpha = 0.88;
        c2d.drawImage(pair.sharp, sx, sy, sw, sh, ix, iy, iw, ih);
        c2d.globalAlpha = 1;
      }

      const cxCard = ix + iw * 0.5;
      const cyCard = iy + ih * 0.5;
      drawOpticalStar(c2d, cxCard - iw * 0.2, cyCard - ih * 0.16, 4.6, {
        spectralClass: 'G',
        spikes: 4,
        alpha: 0.9,
      });
      drawOpticalStar(c2d, cxCard + iw * 0.22, cyCard + ih * 0.14, 3.8, {
        spectralClass: 'B',
        spikes: 4,
        alpha: 0.85,
      });

      // Scenario-varied authentic CCD artifact on the contaminated frame (ZERO shadowBlur!)
      if (card.contaminated && !card.rejected) {
        if (this.scenario.artifactKind === 'cosmic_slash') {
          drawGlowStroke(
            c2d,
            (ctx) => {
              ctx.moveTo(cxCard - iw * 0.3, cyCard - ih * 0.24);
              ctx.lineTo(cxCard + iw * 0.28, cyCard + ih * 0.22);
            },
            '#ff8a7a',
            2.1,
            { outerWidthMul: 3.0, outerAlpha: 0.35 }
          );
          c2d.strokeStyle = '#ffffff';
          c2d.lineWidth = 1.2;
          c2d.beginPath();
          c2d.moveTo(cxCard - iw * 0.3, cyCard - ih * 0.24);
          c2d.lineTo(cxCard + iw * 0.28, cyCard + ih * 0.22);
          c2d.stroke();
        } else if (this.scenario.artifactKind === 'double_satellite') {
          drawGlowStroke(
            c2d,
            (ctx) => {
              ctx.moveTo(ix + 4, iy + ih * 0.28);
              ctx.lineTo(ix + iw - 4, iy + ih * 0.62);
              ctx.moveTo(ix + 4, iy + ih * 0.38);
              ctx.lineTo(ix + iw - 4, iy + ih * 0.72);
            },
            '#ffd485',
            1.6,
            { outerWidthMul: 2.8, outerAlpha: 0.32 }
          );
        } else if (this.scenario.artifactKind === 'hot_column') {
          // Authentic vertical CCD saturated readout bleed column
          const colX = cxCard + iw * 0.12;
          drawGlowStroke(
            c2d,
            (ctx) => {
              ctx.moveTo(colX, iy + 2);
              ctx.lineTo(colX, iy + ih - 2);
            },
            '#ff7a6b',
            2.2,
            { outerWidthMul: 3.0, outerAlpha: 0.36 }
          );
          c2d.fillStyle = '#ffffff';
          c2d.fillRect(colX - 2.5, cyCard - 4, 5, 8);
        } else {
          // Twin cosmic-ray impact glints
          drawGlowStroke(
            c2d,
            (ctx) => {
              ctx.moveTo(cxCard - 18, cyCard - 14);
              ctx.lineTo(cxCard - 4, cyCard + 2);
              ctx.moveTo(cxCard + 8, cyCard - 6);
              ctx.lineTo(cxCard + 22, cyCard + 12);
            },
            '#ff8578',
            2.1,
            { outerWidthMul: 3.0, outerAlpha: 0.36 }
          );
        }
      }
      c2d.restore();

      c2d.save();
      c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = card.rejected ? this.palette.lockHex : this.palette.secondaryHex;
      c2d.textAlign = 'center';
      c2d.fillText(
        card.rejected ? 'REJECTED' : `SUB-FRAME #0${i + 1}`,
        card.x + card.w * 0.5,
        card.y + card.h - 7
      );
      c2d.restore();
    }
  }

  protected onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    // Cached outer dark backdrop (ZERO per-frame ctx.filter!)
    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: 12,
      alpha: 0.28,
      brightness: 0.56,
      tintAlpha: 0.64,
    });

    if (this.phase === 'inspect') {
      this.renderInspectSubFrames(c2d, w, h);
      this.drawSharedOverlays(c2d, w, h);
      return;
    }

    const { cx, cy, scale, apR, compact } = this.getApertureGeometry(w, h);
    const pair = getPlateCanvasPair(this.activePlateId, w, h);

    // Clipped Circular Sensor Developing Plate (0ms cached blurred->sharp crossfade, ZERO ctx.filter!)
    c2d.save();
    c2d.beginPath();
    c2d.arc(cx, cy, apR, 0, Math.PI * 2);
    c2d.clip?.();

    c2d.fillStyle = '#03070f';
    c2d.fillRect(cx - apR, cy - apR, apR * 2, apR * 2);

    if (pair && typeof c2d.drawImage === 'function') {
      const exp = clamp(this.exposure01, 0, 1);
      c2d.globalAlpha = lerp(0.32, 0.96, exp);
      c2d.drawImage(pair.blurred, 0, 0, w, h);
      if (exp > 0.05) {
        c2d.globalAlpha = clamp(exp * 1.05, 0, 1);
        c2d.drawImage(pair.sharp, 0, 0, w, h);
      }
      c2d.globalAlpha = 1;
    }

    // Subtle CCD dark-frame shot noise that smooths out cleanly as SNR climbs!
    const noiseAlpha = (1 - this.exposure01) * (this.palette.mode === 'cold' ? 0.32 : 0.2);
    if (noiseAlpha > 0.02) {
      c2d.fillStyle = this.palette.mode === 'cold' ? '#9ee8ff' : '#ffd8a8';
      for (let i = 0; i < this.noiseSpecks.length; i += 3) {
        const flicker = Math.sin(this.elapsedSec * 9.5 + this.noiseSpecks[i + 2]);
        if (flicker > 0.15) {
          c2d.globalAlpha = noiseAlpha * flicker;
          c2d.fillRect(
            cx + this.noiseSpecks[i] * apR,
            cy + this.noiseSpecks[i + 1] * apR,
            1.6,
            1.6
          );
        }
      }
      c2d.globalAlpha = 1;
    }

    // Developing deep-field photon knots (pre-rendered PSF Row 0 — zero gradients!)
    for (let i = 0; i < this.photonKnots.length; i++) {
      const k = this.photonKnots[i];
      if (this.exposure01 >= k.threshold * 0.92) {
        drawOpticalStar(c2d, cx + k.rx * apR, cy + k.ry * apR, k.size, {
          spectralClass: k.spectralClass,
          spikes: 0,
          alpha: clamp((this.exposure01 - k.threshold * 0.8) * 2.0, 0.14, 0.88),
          vibeMode: this.palette.mode,
        });
      }
    }

    // Real 8-Leaf Tangential Curved Camera Iris Diaphragm (closes cleanly to mechanical pinwheel!)
    const bladeCover = 1 - this.shutterBlade01;
    if (bladeCover > 0.02) {
      const openInnerR = apR * this.shutterBlade01 * 0.98;
      c2d.globalAlpha = clamp(0.45 + bladeCover * 0.52, 0, 0.96);
      c2d.fillStyle = '#070d17';
      c2d.strokeStyle = 'rgba(186, 216, 244, 0.34)';
      c2d.lineWidth = 1.1;
      for (let b = 0; b < 8; b++) {
        const a0 = (b * Math.PI) / 4 + bladeCover * 0.42;
        const a1 = a0 + Math.PI / 4 + 0.32;
        const aMid = a0 + Math.PI / 6;
        c2d.beginPath();
        c2d.moveTo(cx + Math.cos(a0) * openInnerR, cy + Math.sin(a0) * openInnerR);
        c2d.lineTo(cx + Math.cos(aMid) * apR * 1.12, cy + Math.sin(aMid) * apR * 1.12);
        c2d.lineTo(cx + Math.cos(a1) * apR * 1.16, cy + Math.sin(a1) * apR * 1.16);
        c2d.lineTo(cx + Math.cos(a0 + Math.PI / 4) * openInnerR, cy + Math.sin(a0 + Math.PI / 4) * openInnerR);
        c2d.closePath();
        c2d.fill();
        c2d.stroke();
      }
      c2d.globalAlpha = 1;
    }
    c2d.restore();

    // Passing Telegraphed Isotropic Hazards (Crimson = central close-shutter; Amber = peripheral dodge-iris!)
    for (let i = 0; i < this.hazards.length; i++) {
      const hz = this.hazards[i];
      const col = hz.isFlare ? '#ff6c6c' : '#ffb86c';
      const { x0, y0, x1, y1 } = this.hazardEndpointsPx(hz, cx, cy, scale);

      c2d.save();
      if (hz.telegraphSec > 0) {
        const urgency = 1 - hz.telegraphSec / Math.max(0.01, hz.maxTelegraphSec);
        c2d.strokeStyle = col;
        c2d.globalAlpha = 0.25 + 0.32 * urgency + 0.16 * Math.sin(this.elapsedSec * 16);
        c2d.setLineDash?.(hz.isFlare ? [4, 4] : [7, 7]);
        c2d.lineWidth = hz.isFlare ? 1.8 : 1.3;
        c2d.beginPath();
        c2d.moveTo(x0, y0);
        c2d.lineTo(x1, y1);
        c2d.stroke();

        // Warning origin beacon
        const bx = lerp(x0, x1, 0.08);
        const by = lerp(y0, y1, 0.08);
        c2d.setLineDash?.([]);
        c2d.globalAlpha = 0.92;
        c2d.fillStyle = col;
        c2d.beginPath();
        c2d.arc(bx, by, hz.isFlare ? 5.2 : 4.2, 0, Math.PI * 2);
        c2d.fill();
      } else {
        const hx = lerp(x0, x1, hz.progress);
        const hy = lerp(y0, y1, hz.progress);
        const tx = lerp(x0, x1, Math.max(0, hz.progress - 0.17));
        const ty = lerp(y0, y1, Math.max(0, hz.progress - 0.17));
        drawGlowStroke(
          c2d,
          (ctx) => {
            ctx.moveTo(tx, ty);
            ctx.lineTo(hx, hy);
          },
          col,
          hz.isFlare ? 4.4 : 2.6,
          { outerWidthMul: 2.8, outerAlpha: 0.3 }
        );
      }
      c2d.restore();
    }

    // Aperture Iris Ring + Dedicated Right-Rim Resize Tab + Centered Compact Label (NEVER overflows rim!)
    c2d.save();
    c2d.strokeStyle = this.spoilFlash > 0.1 ? '#ff6b6b' : this.shutterOpen ? this.palette.lockHex : this.palette.accentHex;
    c2d.lineWidth = this.shutterOpen ? 2.8 : 1.9;
    c2d.beginPath();
    c2d.arc(cx, cy, apR, 0, Math.PI * 2);
    c2d.stroke();

    // Dedicated knurled iris rim tab on right edge
    c2d.fillStyle = '#07101c';
    c2d.strokeStyle = this.palette.accentHex;
    c2d.lineWidth = 1.8;
    c2d.beginPath();
    c2d.arc(cx + apR, cy, 5.8, 0, Math.PI * 2);
    c2d.fill();
    c2d.stroke();

    if (!this.shutterOpen && this.stageClearTimer <= 0) {
      const fontSize = apR < 52 ? 8 : 9.5;
      c2d.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      c2d.fillStyle = this.palette.secondaryHex;
      c2d.textAlign = 'center';
      c2d.fillText('TAP LENS', cx, cy - 3);
      c2d.fillText('OPEN SHUTTER', cx, cy + fontSize + 1);
    }

    // Live f-stop & SNR readout neatly above aperture
    const fStop = lerp(5.6, 2.0, this.iris01);
    const snrSigma = Math.sqrt(this.exposure01) * 18.0;
    c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = 'rgba(204, 224, 244, 0.68)';
    c2d.textAlign = 'center';
    c2d.fillText(
      `${this.scenario.labelTag} · f/${fStop.toFixed(1)} · SNR ${snrSigma.toFixed(1)}σ`,
      cx,
      compact ? 54 : 68
    );
    c2d.restore();

    // Bottom Aperture Iris Vernier (safely above #mg-helper-btn + prompt on 844x390!)
    this.irisItemInput[0].label = 'APERTURE IRIS';
    this.irisItemInput[0].val01 = this.iris01;
    this.irisItemInput[0].rightText = `f/${fStop.toFixed(1)} · ${this.iris01 > 0.65 ? 'FAST' : this.iris01 < 0.42 ? 'DODGE' : 'MID'}`;
    layoutVernierRowInto(this.irisStripBuf, w, h, this.irisItemInput, compact ? h - 114 : h - 134);
    drawVernierStrip(c2d, this.irisStripBuf[0], this.palette.accentHex, this.palette.lockHex);

    this.drawSharedOverlays(
      c2d,
      w,
      h,
      this.exposure01 > 0.01
        ? {
            cx,
            cy,
            radius: apR + 10,
            progress01: this.exposure01,
            colorHex: this.spoilFlash > 0.1 ? '#ff6b6b' : this.palette.lockHex,
            label: `${Math.round(this.exposure01 * 100)}%`,
          }
        : undefined
    );
  }

  protected override getHelperActionSpec(): HudActionButtonSpec | null {
    if (this.phase !== 'expose') return null;
    return {
      id: 'toggle_shutter',
      label: this.shutterOpen ? 'CLOSE SHUTTER' : 'OPEN SHUTTER (LATCH)',
      active: this.shutterOpen,
    };
  }

  protected getStageProgress01(): number {
    return clamp((this.stage - 1 + (this.phase === 'inspect' ? 0.92 : this.exposure01)) / 3, 0, 1);
  }

  protected getPromptText(): string {
    const pct = Math.round(this.exposure01 * 100);
    if (this.phase === 'inspect') {
      return this.inspectHintFlash > 0.1
        ? 'That frame is spotless! Click the sub-frame scarred by a cosmic-ray or satellite artifact.'
        : 'Inspect the 4 deep-field sub-frames (or keys 1–4) and reject the ONE contaminated frame.';
    }
    if (this.shutterOpen) {
      return `SHUTTER OPEN (${pct}%) — Narrow iris for amber edge streaks; close shutter for crimson core flares!`;
    }
    return `Tap inside lens (or OPEN SHUTTER) to gather light (${pct}%). Shrink iris to dodge edge tracks!`;
  }

  protected solveCurrentStage(stage: 1 | 2 | 3): void {
    this.exposure01 = 1;
    this.shutterOpen = false;
    if (stage === 3) {
      this.phase = 'inspect';
      const bad = this.subFrames.find((c) => c.contaminated);
      if (bad) {
        bad.rejected = true;
      }
    }
  }

  protected override verifySolved(stage: 1 | 2 | 3): boolean {
    if (this.exposure01 < 0.999) return false;
    if (stage === 3) {
      const bad = this.subFrames.find((c) => c.contaminated);
      return Boolean(bad && bad.rejected);
    }
    return true;
  }

  protected onAllStagesCleared(): void {
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.finishSuccess({
      accuracy: 0.96,
      proofFragmentSuffix: 'exposure',
      dossierSnippet: `Variable-iris deep-field integration (${this.activeVariant?.label ?? 'Stacker'}) verified free of artifacts on ${this.ctx.targetName}.`,
      telemetrySummary: `Clean Stack SNR 18.0σ · ${totalSec.toFixed(1)}s`,
      physicalPrinciple: 'Aperture-Area Photon Integration (∝ r², SNR ∝ √t) & Sigma-Clipped Cosmic-Ray Rejection',
    });
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Photon gathering scales with aperture area (∝ r², f/2.0 to f/5.6) while SNR grows as √t. Astronomers dodge satellite streaks and sigma-clip cosmic-ray hits from stacked sub-frames.',
      goalSummary:
        'Latch shutter open to reach 100% exposure, narrow iris around amber edge tracks, shut for crimson core flares, and reject the scarred Stage 3 sub-frame.',
      controlsDesktop:
        'Click lens/button (or hold Space) for shutter; drag APERTURE IRIS, rim tab, wheel, or Arrows; keys 1–4 in Stage 3.',
      controlsTouch:
        'Tap lens/OPEN SHUTTER, slide APERTURE IRIS around edge streaks, and tap the scarred Stage 3 frame.',
      warmthEffect:
        'Warm H% grants longer hazard telegraph warning lead; Cold H% switches to sharp CCD readout noise and faster peak gathering.',
    };
  }
}
