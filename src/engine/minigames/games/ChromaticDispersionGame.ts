import { platform } from '../../../platform/PlatformAdapter';
import { BaseCosmicMinigame, type PointerLocalEvent } from '../core/BaseCosmicMinigame';
import {
  drawVernierStrip,
  getAspectFieldBox,
  hitVernierStrip,
  layoutVernierRowInto,
  valueFromStripX,
  type VernierItemInput,
  type VernierStripSpec,
} from '../core/vernierWidgets';
import { drawSpectralPrismFan } from '../render/InstrumentSprites';
import { drawGlowStroke } from '../render/OpticalDrawUtils';
import { drawOpticalStar, drawSoftDustPuff } from '../render/StarPSFAtlas';
import { angleDiffRad, clamp, lerp } from '../tactilePhysics';
import type { CosmicPlateId, InstrumentFieldGuide, MinigameVariantSpec } from '../types';

interface WavelengthBand {
  key: 'UV' | 'BLU' | 'VIS' | 'HA' | 'IR';
  label: string;
  nm: number;
  refractiveIndex: number;
  color: string;
  rgb: string;
  offsetSign: number;
  piercesDust: boolean;
  targetTx: number;
  targetTy: number;
  hit: boolean;
  blockedByDust: boolean;
  drawDist: number;
  proximity01: number;
}

interface DustCloud {
  tx: number;
  ty: number;
  radius: number;
  extinctionAv: number;
}

interface DispersionVariantProfile {
  emitterTx: number;
  emitterTy: number;
  prismTx: number;
  prismTy: number;
  opticMode: 'prism' | 'grating';
  fourBandStage3: boolean;
  opticLabel: string;
}

const VARIANT_PROFILES: readonly DispersionVariantProfile[] = [
  {
    emitterTx: 0.16,
    emitterTy: 0.45,
    prismTx: 0.56,
    prismTy: 0.45,
    opticMode: 'prism',
    fourBandStage3: false,
    opticLabel: 'CROWN PRISM · CAUCHY n(λ)',
  },
  {
    emitterTx: 0.16,
    emitterTy: 0.24,
    prismTx: 0.56,
    prismTy: 0.46,
    opticMode: 'prism',
    fourBandStage3: false,
    opticLabel: 'OBLIQUE PRISM · AV EXTINCTION',
  },
  {
    emitterTx: 0.16,
    emitterTy: 0.68,
    prismTx: 0.56,
    prismTy: 0.48,
    opticMode: 'prism',
    fourBandStage3: true,
    opticLabel: '4-BAND SPECTROMETER',
  },
  {
    emitterTx: 0.16,
    emitterTy: 0.46,
    prismTx: 0.56,
    prismTy: 0.46,
    opticMode: 'grating',
    fourBandStage3: false,
    opticLabel: 'NIRSPEC GRATING · d sin θ = mλ',
  },
];

const SPREAD_MIN = 0.16;
const SPREAD_MAX = 0.52;

/**
 * DSP-05 — Chromatic Light Disperser
 * Authentic equilateral crown-glass prism (Cauchy dispersion: UV deflects most toward prism base,
 * IR deflects least & penetrates high-Av dust!) plus NIRSpec grating variant, smooth relative
 * 360° drag (zero left-of-prism atan2 flip), tactical Stage 3 dust corridor, and zero shadowBlur/gradients.
 */
export class ChromaticDispersionGame extends BaseCosmicMinigame {
  readonly id = 'light_dispersion';
  readonly title = 'CHROMATIC LIGHT DISPERSER';
  readonly subtitle = 'Wavelength Refraction & Dust Penetration';
  readonly instrumentCode = 'DSP-05';

  readonly platePool: readonly CosmicPlateId[] = ['pillars', 'horsehead', 'carina'];
  readonly variants: readonly MinigameVariantSpec[] = [
    { index: 0, id: 'light_dispersion_v1', label: 'Eagle Pillar Veil', plateId: 'pillars', scenarioTag: 'eagle_pillars' },
    { index: 1, id: 'light_dispersion_v2', label: 'Horsehead Rim Refraction', plateId: 'horsehead', scenarioTag: 'horsehead_wall' },
    { index: 2, id: 'light_dispersion_v3', label: 'Carina IR Window', plateId: 'carina', scenarioTag: 'carina_window' },
    { index: 3, id: 'light_dispersion_v4', label: 'Diffraction Grating Split', plateId: 'pillars', scenarioTag: 'grating_split' },
  ];

  private variantCfg: DispersionVariantProfile = VARIANT_PROFILES[0];
  private emitter = { tx: 0.16, ty: 0.45 };
  private prism = { tx: 0.56, ty: 0.45 };
  private readonly detRadius = 0.66;

  private baseAngle = 0.35;
  private targetBaseAngle = 0;
  private spread = 0.34;
  private targetSpread = 0.34;

  private bands: WavelengthBand[] = [];
  private dustClouds: DustCloud[] = [];
  private dragMode: 'prism' | 'spread' | null = null;
  private lastDragAngle = 0;
  private lastProximityTickAt = 0;
  private scatterSparkCooldown = 0;
  private accSum = 0;
  private accCount = 0;

  private readonly spreadStrips: VernierStripSpec[] = [];
  private readonly spreadInputs: VernierItemInput[] = [];

  protected override onMount(): void {
    this.lockHoldTargetSec = 0.92;
    this.variantCfg = VARIANT_PROFILES[this.iterationIndex % VARIANT_PROFILES.length];
    this.emitter = { tx: this.variantCfg.emitterTx, ty: this.variantCfg.emitterTy };
    this.prism = { tx: this.variantCfg.prismTx, ty: this.variantCfg.prismTy };
    this.accSum = 0;
    this.accCount = 0;
    this.lastProximityTickAt = 0;
  }

  protected override onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.dragMode = null;
    this.scatterSparkCooldown = 0;

    // Keep all detector rings strictly within safe vertical bounds on 844x390
    // Offset Stage 3 slightly vs Stage 2 so Stage 3 always poses a distinct tactical aim
    const baseRand = stage === 1 ? (rng() - 0.5) * 0.14 : (rng() - 0.5) * 0.18;
    this.targetBaseAngle =
      stage === 3 ? clamp(baseRand + (rng() > 0.5 ? 0.08 : -0.08), -0.22, 0.22) : baseRand;
    this.targetSpread =
      stage === 1
        ? 0.34
        : stage === 2
        ? 0.27 + rng() * 0.14
        : 0.32 + rng() * 0.11;

    this.baseAngle = clamp(
      this.targetBaseAngle + (rng() > 0.5 ? 0.42 : -0.42),
      -0.68,
      0.68
    );
    this.spread =
      stage === 1
        ? this.targetSpread
        : this.targetSpread > 0.35
        ? 0.19
        : 0.48;

    // Cauchy crown-glass prism: n_UV (1.565) > n_VIS (1.519) > n_IR (1.503), so UV deflects
    // further downward (+Y toward thick prism base) while IR deflects least (-Y upper ray).
    // Diffraction grating (V4): d sin θ = mλ flips dispersion so longer IR diffracts widest!
    const isGrating = this.variantCfg.opticMode === 'grating';
    const irSign = isGrating ? 1 : -1;
    const uvSign = isGrating ? -1 : 1;

    let specs: Array<
      Pick<WavelengthBand, 'key' | 'label' | 'nm' | 'refractiveIndex' | 'color' | 'rgb' | 'offsetSign' | 'piercesDust'>
    >;

    if (stage === 3 && this.variantCfg.fourBandStage3) {
      specs = [
        { key: 'IR', label: '1400nm IR', nm: 1400, refractiveIndex: 1.503, color: '#ff7070', rgb: '255, 112, 112', offsetSign: irSign * 1.0, piercesDust: true },
        { key: 'HA', label: '656nm Hα', nm: 656, refractiveIndex: 1.514, color: '#ffb56b', rgb: '255, 181, 107', offsetSign: irSign * 0.33, piercesDust: false },
        { key: 'BLU', label: '460nm B', nm: 460, refractiveIndex: 1.525, color: '#8ad4ff', rgb: '138, 212, 255', offsetSign: uvSign * 0.33, piercesDust: false },
        { key: 'UV', label: '280nm UV', nm: 280, refractiveIndex: 1.565, color: '#b892ff', rgb: '184, 146, 255', offsetSign: uvSign * 1.0, piercesDust: false },
      ];
    } else {
      specs = [
        { key: 'IR', label: '1400nm IR', nm: 1400, refractiveIndex: 1.503, color: '#ff7070', rgb: '255, 112, 112', offsetSign: irSign, piercesDust: true },
        ...(stage >= 2
          ? [{ key: 'VIS' as const, label: '550nm VIS', nm: 550, refractiveIndex: 1.519, color: '#ffd97d', rgb: '255, 217, 125', offsetSign: 0, piercesDust: false }]
          : []),
        { key: 'UV', label: '280nm UV', nm: 280, refractiveIndex: 1.565, color: '#b892ff', rgb: '184, 146, 255', offsetSign: uvSign, piercesDust: false },
      ];
    }

    this.bands = specs.map((sp) => {
      const ang = this.targetBaseAngle + sp.offsetSign * this.targetSpread;
      return {
        ...sp,
        targetTx: this.prism.tx + Math.cos(ang) * this.detRadius,
        targetTy: this.prism.ty + Math.sin(ang) * this.detRadius,
        hit: false,
        blockedByDust: false,
        drawDist: 1.1,
        proximity01: 0,
      };
    });

    // Stage 3: tactical interstellar dust clouds (IR punches through primary cloud;
    // flanking secondary dust knot constrains VIS/UV to thread cleanly without hitting dust!)
    if (stage === 3) {
      const irBand = this.bands[0];
      const irAng = this.targetBaseAngle + irBand.offsetSign * this.targetSpread;
      // In 4-band Stage 3 (V3), HA 656nm sits at 0.67 * targetSpread from IR:
      // placing primaryDust at dist=0.48 with radius=0.068 gives min perp clearance
      // 0.48 * sin(0.67 * 0.32) = 0.102 > 0.068 across 100% of seeds!
      const dustDist = this.variantCfg.fourBandStage3 ? 0.48 : 0.37;
      const dustRad = this.variantCfg.fourBandStage3 ? 0.068 : 0.092;
      const primaryDust: DustCloud = {
        tx: this.prism.tx + Math.cos(irAng) * dustDist,
        ty: this.prism.ty + Math.sin(irAng) * dustDist,
        radius: dustRad,
        extinctionAv: 8.4,
      };
      // Flanking cloud positioned safely outside all non-IR solution rays (clearance >= 0.065)
      const flankAng = this.targetBaseAngle + uvSign * (this.targetSpread + 0.34);
      const flankDust: DustCloud = {
        tx: this.prism.tx + Math.cos(flankAng) * 0.42,
        ty: this.prism.ty + Math.sin(flankAng) * 0.42,
        radius: 0.072,
        extinctionAv: 5.2,
      };
      this.dustClouds = [primaryDust, flankDust];
    } else {
      this.dustClouds = [];
    }

    this.traceDispersion();
  }

  private getFieldBox(w: number, h: number) {
    return getAspectFieldBox(w, h, 1.75, 54, this.compact ? 94 : 104);
  }

  private getAngleTol(): number {
    if (this.profile.vibe === 'warm') return 0.095;
    if (this.profile.vibe === 'cold') return 0.064;
    return 0.078;
  }

  private getSpreadTol(): number {
    if (this.profile.vibe === 'warm') return 0.052;
    if (this.profile.vibe === 'cold') return 0.032;
    return 0.042;
  }

  private rayCircleT(rx: number, ry: number, dx: number, dy: number, cx: number, cy: number, r: number): number | null {
    const fx = rx - cx;
    const fy = ry - cy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) * 0.5;
    return t > 0.02 ? t : null;
  }

  private traceDispersion(): void {
    const tol = this.getAngleTol();
    for (let i = 0; i < this.bands.length; i++) {
      const band = this.bands[i];
      const rayAng = this.baseAngle + band.offsetSign * this.spread;
      const dx = Math.cos(rayAng);
      const dy = Math.sin(rayAng);

      let blockedDist = 1.15;
      let blockedByDust = false;

      if (!band.piercesDust) {
        for (let d = 0; d < this.dustClouds.length; d++) {
          const cloud = this.dustClouds[d];
          const hitT = this.rayCircleT(this.prism.tx, this.prism.ty, dx, dy, cloud.tx, cloud.ty, cloud.radius);
          if (hitT !== null && hitT < blockedDist) {
            blockedDist = hitT;
            blockedByDust = true;
          }
        }
      }

      const targetAng = Math.atan2(band.targetTy - this.prism.ty, band.targetTx - this.prism.tx);
      const angErr = Math.abs(angleDiffRad(rayAng, targetAng));
      band.blockedByDust = blockedByDust;
      band.hit = !blockedByDust && angErr <= tol;
      band.proximity01 = blockedByDust ? 0 : clamp(1 - angErr / 0.34, 0, 1);
      band.drawDist = band.hit ? this.detRadius : blockedDist;
    }
  }

  private computeAlignment01(): number {
    if (this.bands.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.bands.length; i++) {
      sum += this.bands[i].hit ? 1 : this.bands[i].proximity01 * 0.72;
    }
    return clamp(sum / this.bands.length, 0, 1);
  }

  private applySpreadFromX(px: number): void {
    const strip = this.spreadStrips[0];
    if (!strip) return;
    const targetFrac = clamp((this.targetSpread - SPREAD_MIN) / (SPREAD_MAX - SPREAD_MIN), 0, 1);
    const magnetTol = 0.065 * this.profile.detentWellScale;
    const nextFrac = valueFromStripX(strip, px, targetFrac, magnetTol);
    this.spread = lerp(SPREAD_MIN, SPREAD_MAX, nextFrac);
    this.traceDispersion();
  }

  protected override onPointerDown(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;

    if (this.stage >= 2 && this.spreadStrips.length > 0 && hitVernierStrip(this.spreadStrips[0], ev.x, ev.y)) {
      this.dragMode = 'spread';
      this.applySpreadFromX(ev.x);
      platform.triggerHaptic('vernierTick', 0.45);
      return;
    }

    const box = this.getFieldBox(ev.w, ev.h);
    const tx = (ev.x - box.left) / box.scale;
    const ty = (ev.y - box.top) / box.scale;
    const dx = tx - this.prism.tx;
    const dy = ty - this.prism.ty;
    this.dragMode = 'prism';
    this.lastDragAngle = Math.atan2(dy, dx);

    // If user clicks directly on the right refracted fan, gently snap toward click angle;
    // clicking on or left of the prism enters pure smooth relative rotation (ZERO +/-0.75 flip!).
    if (dx > 0.14) {
      let directAng = clamp(Math.atan2(dy, dx), -0.68, 0.68);
      const diff = angleDiffRad(this.targetBaseAngle, directAng);
      if (Math.abs(diff) < 0.06 * this.profile.detentWellScale) {
        directAng += diff * 0.42;
      }
      this.baseAngle = directAng;
      this.traceDispersion();
    }
    platform.triggerHaptic('vernierTick', 0.45);
  }

  protected override onPointerMove(ev: PointerLocalEvent): void {
    if (!this.dragMode || this.stageClearTimer > 0) return;

    if (this.dragMode === 'spread') {
      this.applySpreadFromX(ev.x);
      return;
    }

    const box = this.getFieldBox(ev.w, ev.h);
    const tx = (ev.x - box.left) / box.scale;
    const ty = (ev.y - box.top) / box.scale;
    const dx = tx - this.prism.tx;
    const dy = ty - this.prism.ty;
    if (Math.hypot(dx, dy) < 0.035) return;

    const curAng = Math.atan2(dy, dx);
    const delta = angleDiffRad(curAng, this.lastDragAngle);
    this.lastDragAngle = curAng;

    let nextAng = clamp(this.baseAngle + delta, -0.68, 0.68);
    const diff = angleDiffRad(this.targetBaseAngle, nextAng);
    if (Math.abs(diff) < 0.055 * this.profile.detentWellScale) {
      nextAng = clamp(nextAng + diff * 0.25, -0.68, 0.68);
    }
    this.baseAngle = nextAng;
    this.traceDispersion();

    const align = this.computeAlignment01();
    if (align > 0.65 && this.elapsedSec - this.lastProximityTickAt > 0.2) {
      this.lastProximityTickAt = this.elapsedSec;
      this.ctx.audio?.playProximityTick?.(align);
    }
  }

  protected override onPointerUp(): void {
    this.dragMode = null;
  }

  protected override onWheel(deltaY: number): boolean {
    if (this.stage < 2 || this.stageClearTimer > 0) return false;
    this.spread = clamp(this.spread + (deltaY > 0 ? -0.014 : 0.014), SPREAD_MIN, SPREAD_MAX);
    this.traceDispersion();
    return true;
  }

  protected override onKeyDown(e: KeyboardEvent): void {
    if (this.stageClearTimer > 0) return;
    const step = e.shiftKey ? 0.015 : 0.035;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.baseAngle = clamp(this.baseAngle - step, -0.68, 0.68);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.baseAngle = clamp(this.baseAngle + step, -0.68, 0.68);
    } else if (this.stage >= 2 && e.key === 'ArrowUp') {
      e.preventDefault();
      this.spread = clamp(this.spread + 0.018, SPREAD_MIN, SPREAD_MAX);
    } else if (this.stage >= 2 && e.key === 'ArrowDown') {
      e.preventDefault();
      this.spread = clamp(this.spread - 0.018, SPREAD_MIN, SPREAD_MAX);
    } else {
      return;
    }
    this.traceDispersion();
  }

  protected override onUpdate(dt: number): void {
    this.scatterSparkCooldown = Math.max(0, this.scatterSparkCooldown - dt);

    const align = this.computeAlignment01();
    this.accSum += align;
    this.accCount += 1;

    // Live harmonic beat synth + 3D dust peel coupling
    this.ctx.audio?.updateBeatSynth({
      beatHz: (1 - align) * 8.4,
      harmonicLock: align,
      warmth: this.profile.harmonicWarmthGain,
      strain: 0,
    });

    this.ctx.showcase?.applyInstrumentPatch({
      progress: clamp((this.stage - 1 + align) / 3, 0, 1),
      dustPeel: align,
      humanity: this.ctx.state.humanity,
    });

    // Live Mie/Rayleigh scatter shimmer sparks when short UV/VIS beams strike dark dust!
    if (this.scatterSparkCooldown <= 0 && this.dustClouds.length > 0) {
      const box = this.getFieldBox(this.width, this.height);
      for (let i = 0; i < this.bands.length; i++) {
        const b = this.bands[i];
        if (b.blockedByDust) {
          this.scatterSparkCooldown = 0.16;
          const ang = this.baseAngle + b.offsetSign * this.spread;
          const sx = box.left + (this.prism.tx + Math.cos(ang) * b.drawDist) * box.scale;
          const sy = box.top + (this.prism.ty + Math.sin(ang) * b.drawDist) * box.scale;
          this.particles.emitSpectralShimmer(sx, sy, 0.25, 2);
          break;
        }
      }
    }

    if (this.stageClearTimer > 0) return;

    const allHit = this.bands.length > 0 && this.bands.every((b) => b.hit);
    if (allHit) {
      if (this.lockHoldSec === 0) {
        this.ctx.audio?.playTumblerClick(0.95, true);
        platform.triggerHaptic('proximityPulse', 0.65);
      }
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        const box = this.getFieldBox(this.width, this.height);
        const px = box.left + this.prism.tx * box.scale;
        const py = box.top + this.prism.ty * box.scale;
        this.particles.emitPhotonSparks(px, py, 5, 44, this.palette.lockHex);
        this.triggerStageClear(
          this.stage === 3 ? 'FULL SPECTRUM DISPERSED' : `SPECTRUM SPLIT ${this.stage}/${this.maxStages} CALIBRATED`,
          this.stage === 3 ? 0 : 0.45,
          px,
          py
        );
      }
    } else {
      this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.8);
    }
  }

  protected override onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const align = this.computeAlignment01();
    const box = this.getFieldBox(w, h);
    const emX = box.left + this.emitter.tx * box.scale;
    const emY = box.top + this.emitter.ty * box.scale;
    const prX = box.left + this.prism.tx * box.scale;
    const prY = box.top + this.prism.ty * box.scale;

    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: 3.5,
      alpha: lerp(0.46, 0.66, align),
      brightness: 0.82,
      scale: 1.03,
      tintAlpha: 0.44,
      starOpacity: 0.74,
      reticleDuck: { cx: prX + box.scale * 0.25, cy: prY, r: box.scale * 0.42 },
    });

    // Subtle protractor dispersion arc around prism
    c2d.save();
    c2d.strokeStyle = `rgba(${this.palette.secondaryRgb}, 0.16)`;
    c2d.lineWidth = 1;
    c2d.setLineDash([3, 5]);
    c2d.beginPath();
    c2d.arc(prX, prY, this.detRadius * box.scale, -0.95, 0.95);
    c2d.stroke();
    c2d.setLineDash([]);
    c2d.restore();

    // Continuous feathered rainbow spectral fan emerging from prism / grating
    if (this.bands.length >= 2) {
      const a0 = this.baseAngle - this.spread;
      const a1 = this.baseAngle + this.spread;
      drawSpectralPrismFan(
        c2d,
        prX,
        prY,
        a0,
        a1,
        this.detRadius * box.scale * 0.96,
        0.78,
        this.variantCfg.opticMode === 'grating'
      );
    }

    // Stage 3 Organic Bok Globule Interstellar Dust Clouds (cached drawSoftDustPuff — ZERO dashed circles!)
    for (let d = 0; d < this.dustClouds.length; d++) {
      const cloud = this.dustClouds[d];
      const dx = box.left + cloud.tx * box.scale;
      const dy = box.top + cloud.ty * box.scale;
      const rPx = cloud.radius * box.scale;

      // Multi-lobe organic dark carbonaceous silhouette + faint warm dust scatter motes
      drawSoftDustPuff(c2d, dx, dy, rPx * 1.32, '#1d100a', 0.95);
      drawSoftDustPuff(c2d, dx - rPx * 0.28, dy - rPx * 0.16, rPx * 0.9, '#2a160d', 0.84);
      drawSoftDustPuff(c2d, dx + rPx * 0.24, dy + rPx * 0.2, rPx * 0.82, '#140a06', 0.9);
      drawSoftDustPuff(c2d, dx + rPx * 0.12, dy - rPx * 0.24, rPx * 0.65, '#4c2614', 0.34);

      for (let m = 0; m < 4; m++) {
        const ma = d * 1.9 + m * 1.57 + this.elapsedSec * 0.12;
        drawOpticalStar(c2d, dx + Math.cos(ma) * rPx * 0.82, dy + Math.sin(ma) * rPx * 0.82, 1.5, {
          spectralClass: 'K',
          spikes: 0,
          alpha: 0.34,
          vibeMode: this.palette.mode,
        });
      }

      c2d.save();
      c2d.font = '600 8px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = 'rgba(255, 198, 146, 0.72)';
      c2d.textAlign = 'center';
      c2d.fillText(`Av ${cloud.extinctionAv.toFixed(1)}`, dx, dy + 3);
      c2d.restore();
    }

    // Incoming polychromatic white starlight beam (2-pass bloom, ZERO shadowBlur!)
    drawGlowStroke(
      c2d,
      (ctx) => {
        ctx.moveTo(emX, emY);
        ctx.lineTo(prX, prY);
      },
      '#f6fbff',
      2.6,
      { outerWidthMul: 3.1, outerAlpha: 0.26, coreAlpha: 0.96 }
    );

    drawOpticalStar(c2d, emX, emY, 10.5, {
      spectralClass: 'F',
      spikes: 6,
      alpha: 0.98,
      vibeMode: this.palette.mode,
      timeSec: this.elapsedSec,
    });

    // Dispersed chromatic rays + flowing photon streaks + wavelength detectors
    // Preserve authentic rainbow colors on lock — illuminate collector halo + crisp white-hot ray core!
    for (let i = 0; i < this.bands.length; i++) {
      const band = this.bands[i];
      const ang = this.baseAngle + band.offsetSign * this.spread;
      const endX = box.left + (this.prism.tx + Math.cos(ang) * band.drawDist) * box.scale;
      const endY = box.top + (this.prism.ty + Math.sin(ang) * band.drawDist) * box.scale;

      drawGlowStroke(
        c2d,
        (ctx) => {
          ctx.moveTo(prX, prY);
          ctx.lineTo(endX, endY);
        },
        band.color,
        band.hit ? 2.7 : 1.9,
        { outerWidthMul: band.hit ? 3.5 : 2.6, outerAlpha: band.hit ? 0.34 : 0.2, coreAlpha: 0.96 }
      );

      if (band.hit) {
        c2d.save();
        c2d.strokeStyle = '#ffffff';
        c2d.globalAlpha = 0.72;
        c2d.lineWidth = 0.9;
        c2d.beginPath();
        c2d.moveTo(prX, prY);
        c2d.lineTo(endX, endY);
        c2d.stroke();
        c2d.restore();
      }

      // Scattering glow burst right at dust impact point when short wavelength is blocked
      if (band.blockedByDust) {
        drawOpticalStar(c2d, endX, endY, 5.2, {
          colorHex: band.color,
          spikes: 4,
          alpha: 0.85,
          vibeMode: this.palette.mode,
        });
      }

      // Flowing wavelength photon wave-packets via PSF sprite
      for (let pkt = 0; pkt < 3; pkt++) {
        const t = (this.elapsedSec * 0.85 + pkt / 3) % 1;
        drawOpticalStar(c2d, lerp(prX, endX, t), lerp(prY, endY, t), 2.3, {
          colorHex: band.color,
          spikes: 0,
          alpha: band.hit ? 0.92 : 0.78,
          vibeMode: this.palette.mode,
        });
      }

      // Wavelength detector collector ring + label
      const detX = box.left + band.targetTx * box.scale;
      const detY = box.top + band.targetTy * box.scale;
      const detR = this.compact ? 14 : 17;
      c2d.save();
      if (band.hit) {
        c2d.strokeStyle = this.palette.lockHex;
        c2d.globalAlpha = 0.42;
        c2d.lineWidth = 1.4;
        c2d.beginPath();
        c2d.arc(detX, detY, detR + 5, 0, Math.PI * 2);
        c2d.stroke();
        c2d.globalAlpha = 1;
      }
      c2d.strokeStyle = band.hit ? this.palette.lockHex : band.color;
      c2d.fillStyle = band.hit ? `rgba(${this.palette.lockRgb}, 0.24)` : 'rgba(8, 14, 24, 0.72)';
      c2d.lineWidth = band.hit ? 2.5 : 1.7;
      c2d.beginPath();
      c2d.arc(detX, detY, detR, 0, Math.PI * 2);
      c2d.fill();
      c2d.stroke();

      // Label placed cleanly outward to the right of detector ring (never colliding with bottom strip!)
      c2d.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = band.hit ? this.palette.lockHex : band.color;
      c2d.textAlign = 'left';
      c2d.fillText(band.label, detX + detR + 7, detY + 3);
      c2d.restore();
    }

    // Zeiss Optical Goniometer Gimbal Ring + Crown-Glass Prism / NIRSpec Grating
    const sz = this.compact ? 22 : 27;
    const gimbalR = sz * 1.38;
    c2d.save();
    c2d.translate(prX, prY);
    c2d.strokeStyle = `rgba(${this.palette.secondaryRgb}, 0.28)`;
    c2d.lineWidth = 1.1;
    c2d.beginPath();
    c2d.arc(0, 0, gimbalR, 0, Math.PI * 2);
    c2d.stroke();
    c2d.strokeStyle = `rgba(${this.palette.secondaryRgb}, 0.34)`;
    c2d.beginPath();
    for (let t = 0; t < 16; t++) {
      const ta = (t / 16) * Math.PI * 2;
      const inR = gimbalR - (t % 4 === 0 ? 5 : 2.5);
      c2d.moveTo(Math.cos(ta) * inR, Math.sin(ta) * inR);
      c2d.lineTo(Math.cos(ta) * gimbalR, Math.sin(ta) * gimbalR);
    }
    c2d.stroke();

    c2d.rotate(this.baseAngle);
    if (this.variantCfg.opticMode === 'grating') {
      c2d.fillStyle = 'rgba(148, 214, 255, 0.22)';
      c2d.strokeStyle = '#dff4ff';
      c2d.lineWidth = 1.8;
      c2d.fillRect(-5, -sz, 10, sz * 2);
      c2d.strokeRect(-5, -sz, 10, sz * 2);
      c2d.strokeStyle = 'rgba(200, 236, 255, 0.55)';
      c2d.lineWidth = 1;
      c2d.beginPath();
      for (let g = -sz + 5; g <= sz - 5; g += 5) {
        c2d.moveTo(-4, g);
        c2d.lineTo(4, g - 2);
      }
      c2d.stroke();
    } else {
      c2d.beginPath();
      c2d.moveTo(0, -sz * 1.02);
      c2d.lineTo(sz * 0.92, sz * 0.74);
      c2d.lineTo(-sz * 0.92, sz * 0.74);
      c2d.closePath();
      c2d.fillStyle = 'rgba(176, 224, 255, 0.16)';
      c2d.fill();

      c2d.beginPath();
      c2d.moveTo(0, -sz * 1.02);
      c2d.lineTo(0, sz * 0.12);
      c2d.lineTo(sz * 0.92, sz * 0.74);
      c2d.closePath();
      c2d.fillStyle = 'rgba(220, 244, 255, 0.14)';
      c2d.fill();

      c2d.beginPath();
      c2d.moveTo(0, -sz * 1.02);
      c2d.lineTo(sz * 0.92, sz * 0.74);
      c2d.lineTo(-sz * 0.92, sz * 0.74);
      c2d.closePath();
      c2d.strokeStyle = '#e4f6ff';
      c2d.lineWidth = 1.8;
      c2d.stroke();

      // Internal spectral bend lines showing Cauchy dispersion inside the glass
      const redY = lerp(-0.14, 0.14, clamp(this.spread / SPREAD_MAX, 0, 1)) * sz;
      c2d.strokeStyle = 'rgba(255, 168, 148, 0.55)';
      c2d.lineWidth = 1.25;
      c2d.beginPath();
      c2d.moveTo(-sz * 0.44, -sz * 0.05);
      c2d.lineTo(sz * 0.45, -sz * 0.12 - redY * 0.25);
      c2d.stroke();

      c2d.strokeStyle = 'rgba(164, 198, 255, 0.55)';
      c2d.beginPath();
      c2d.moveTo(-sz * 0.44, -sz * 0.05);
      c2d.lineTo(sz * 0.48, sz * 0.16 + redY * 0.35);
      c2d.stroke();
    }
    c2d.restore();

    // Subtle astrophysical optic label + Cold numeric Δθ readout
    c2d.save();
    c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = `rgba(${this.palette.secondaryRgb}, 0.74)`;
    c2d.textAlign = 'left';
    c2d.fillText(this.variantCfg.opticLabel, w * 0.06, this.compact ? 58 : 76);
    if (this.profile.showNumericDeltas) {
      const deg = ((this.baseAngle * 180) / Math.PI).toFixed(1);
      const dispDeg = ((this.spread * 2 * 180) / Math.PI).toFixed(1);
      c2d.fillStyle = this.palette.accentHex;
      c2d.fillText(`θ ${deg}° · Δθ ${dispDeg}°`, w * 0.06, this.compact ? 72 : 92);
    }
    c2d.restore();

    // Dispersion Spread Hairline Vernier in Stages 2 & 3 (zero allocs, safe above mobile cue line)
    if (this.stage >= 2) {
      const frac = clamp((this.spread - SPREAD_MIN) / (SPREAD_MAX - SPREAD_MIN), 0, 1);
      const locked = Math.abs(this.spread - this.targetSpread) <= this.getSpreadTol();
      const degText = `${((this.spread * 2 * 180) / Math.PI).toFixed(0)}°`;
      if (this.spreadInputs[0]) {
        this.spreadInputs[0].val01 = frac;
        this.spreadInputs[0].locked = locked;
        this.spreadInputs[0].rightText = degText;
      } else {
        this.spreadInputs[0] = {
          key: 'spread',
          label: 'DISPERSION Δθ',
          val01: frac,
          locked,
          rightText: degText,
        };
      }
      this.spreadInputs.length = 1;
      layoutVernierRowInto(this.spreadStrips, w, h, this.spreadInputs, this.compact ? h - 88 : h - 98);
      drawVernierStrip(c2d, this.spreadStrips[0], this.palette.accentHex, this.palette.lockHex);
    } else {
      this.spreadStrips.length = 0;
    }

    this.drawSharedOverlays(
      c2d,
      w,
      h,
      this.lockHoldSec > 0.02
        ? {
            cx: prX,
            cy: prY,
            radius: this.compact ? 34 : 42,
            progress01: this.lockHoldSec / this.lockHoldTargetSec,
            label: `LOCKED ${Math.round((this.lockHoldSec / this.lockHoldTargetSec) * 100)}%`,
          }
        : undefined
    );
  }

  protected override getStageProgress01(): number {
    return clamp((this.stage - 1 + this.computeAlignment01()) / 3, 0, 1);
  }

  protected override getPromptText(): string {
    const opticWord = this.variantCfg.opticMode === 'grating' ? 'diffraction grating' : 'optical prism';
    if (this.stage === 1) {
      return `Rotate the ${opticWord} to aim both UV & Infrared rays into their wavelength collectors.`;
    }
    if (this.stage === 2) {
      return `Aim the ${opticWord} AND tune DISPERSION Δθ below so UV, Visible, and Infrared collectors lock together.`;
    }
    return 'Infrared pierces dense Av dust while UV/Visible scatter — route short rays clear and punch IR through the cloud!';
  }

  protected override solveCurrentStage(_stage: 1 | 2 | 3): void {
    this.baseAngle = this.targetBaseAngle;
    this.spread = this.targetSpread;
    this.traceDispersion();
    if (!this.bands.every((b) => b.hit)) {
      throw new Error(
        `DSP-05 stage ${this.stage} (${this.activeVariant?.id}) left unhit bands: ${this.bands
          .filter((b) => !b.hit)
          .map((b) => `${b.key}(blocked=${b.blockedByDust})`)
          .join(',')}`
      );
    }
  }

  protected override verifySolved(): boolean {
    return this.bands.length > 0 && this.bands.every((b) => b.hit);
  }

  protected override onAllStagesCleared(): void {
    const avgAcc = clamp(this.accCount > 0 ? this.accSum / this.accCount : 0.93, 0.74, 1.0);
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.finishSuccess({
      accuracy: avgAcc,
      proofFragmentSuffix: 'dispersion',
      dossierSnippet: `Multi-band chromatic dispersion (${this.variantCfg.opticLabel}) & IR dust penetration locked on ${this.ctx.targetName}.`,
      telemetrySummary: `${this.activeVariant?.label ?? 'Prism'} · Precision ${(avgAcc * 100).toFixed(0)}% · ${totalSec.toFixed(1)}s`,
      physicalPrinciple: 'Cauchy Chromatic Refraction, Diffraction Gratings & Infrared Dust Penetration (Aλ ∝ λ⁻¹·⁷)',
    });
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Crown-glass prisms bend shorter UV wavelengths more strongly than Infrared (Cauchy’s law, nUV > nIR), while interstellar extinction (Aλ ∝ λ⁻¹·⁷) scatters UV/Visible light yet lets Infrared pierce cold dust clouds.',
      goalSummary:
        'Tilt the optic and tune DISPERSION Δθ across 3 stages so every wavelength ray illuminates its detector ring simultaneously.',
      controlsDesktop: 'Drag smoothly around the prism to rotate; drag DISPERSION Δθ, scroll wheel, or use Arrow keys.',
      controlsTouch: 'Drag anywhere on the optical field to tilt the beams; slide DISPERSION Δθ below on Stages 2–3.',
      warmthEffect: 'Warm H% widens detector capture arcs and magnetic wells; Cold H% sharpens spectral tolerance and displays θ/Δθ°.',
    };
  }
}
