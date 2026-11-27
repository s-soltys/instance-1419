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
import { drawSoftGalaxyHalo } from '../render/InstrumentSprites';
import { drawGlowStroke } from '../render/OpticalDrawUtils';
import { drawOpticalStar } from '../render/StarPSFAtlas';
import { angleDiffRad, clamp, lerp } from '../tactilePhysics';
import type {
  CosmicPlateId,
  HudActionButtonSpec,
  InstrumentFieldGuide,
  MinigameVariantSpec,
  SpectralClass,
} from '../types';

type GalaxyMorph = 'spiral' | 'lenticular' | 'ring' | 'pair';

interface HorizonGalaxy {
  rx: number; // local normalized offset relative to patch center
  ry: number;
  morph: GalaxyMorph;
  tilt: number;
  spiralChirality: 1 | -1;
  size: number;
  spectralClass: SpectralClass;
  tintHex: string;
  isForegroundDecoy?: boolean;
}

interface SeamVariantProfile {
  flipAxis: 'horizontal' | 'vertical';
  hasScaleDriftStage3: boolean;
  hasForegroundDecoys: boolean;
  raLabelNorth: string;
  raLabelSouth: string;
}

const SEAM_VARIANTS: readonly MinigameVariantSpec[] = [
  { index: 0, id: 'horizon_seam_stitcher_v1', label: 'HUDF Mosaic Rift', plateId: 'hudf' },
  { index: 1, id: 'horizon_seam_stitcher_v2', label: 'SMACS Facet Join', plateId: 'smacs' },
  { index: 2, id: 'horizon_seam_stitcher_v3', label: 'M57 Polar Seam', plateId: 'ring_m57' },
  { index: 3, id: 'horizon_seam_stitcher_v4', label: '93-BLY Horizon Stitch', plateId: 'hudf' },
];

const VARIANT_PROFILES: readonly SeamVariantProfile[] = [
  {
    flipAxis: 'horizontal',
    hasScaleDriftStage3: false,
    hasForegroundDecoys: false,
    raLabelNorth: 'N-POLE · RA 03h32m +27°',
    raLabelSouth: 'S-ANTIPODE · RA 15h32m -27°',
  },
  {
    flipAxis: 'horizontal',
    hasScaleDriftStage3: false,
    hasForegroundDecoys: true,
    raLabelNorth: 'SMACS-N · RA 07h23m +73°',
    raLabelSouth: 'ANTIPODE · RA 19h23m -73°',
  },
  {
    flipAxis: 'vertical',
    hasScaleDriftStage3: false,
    hasForegroundDecoys: false,
    raLabelNorth: 'LYRA-N · RA 18h53m +33°',
    raLabelSouth: 'ANTIPODE · RA 06h53m -33°',
  },
  {
    flipAxis: 'horizontal',
    hasScaleDriftStage3: true,
    hasForegroundDecoys: false,
    raLabelNorth: 'SOL+10ly N · 93.0 Gly',
    raLabelSouth: 'ANTIPODE · Δ=180.0°',
  },
];

/**
 * SEM-17 — Horizon Seam Stitcher (Lore Signature Instrument)
 * Translate, rotate to non-zero galactic skew, mirror-flip chiral galaxies, and match
 * subtle 10-ly Sol–Centauri off-center scale drift across antipodal 93-BLY sky tiles —
 * proving the synthetic spherical enclosure seam.
 */
export class HorizonSeamStitcherGame extends BaseCosmicMinigame {
  readonly id = 'horizon_seam_stitcher';
  readonly title = 'HORIZON SEAM STITCHER';
  readonly subtitle = 'Antipodal 93-BLY Sky Overlap';
  readonly instrumentCode = 'SEM-17';
  readonly platePool: readonly CosmicPlateId[] = ['hudf', 'smacs', 'ring_m57'];
  readonly variants = SEAM_VARIANTS;

  private variantProfile: SeamVariantProfile = VARIANT_PROFILES[0];
  private galaxies: HorizonGalaxy[] = [];
  private northNx = 0.56;
  private northNy = 0.43;
  private patchNx = 0.28;
  private patchNy = 0.48;
  private targetRot = 0;
  private patchRot = 0;
  private targetScale = 1.0;
  private patchScale = 1.0;
  private targetFlipped = false;
  private patchFlipped = false;

  private dragMode: 'patch' | 'bezel_rot' | 'rot' | 'scale' | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private rotDragStartAng = 0;
  private rotDragStartVal = 0;
  private strips: VernierStripSpec[] = [];
  private stripInputs: VernierItemInput[] = [];
  private lastShowcaseSig = '';
  private lastOverlapCount = 0;
  private flipAnimT = 1;

  protected onMount(): void {
    this.lockHoldTargetSec = 0.92;
    this.variantProfile = VARIANT_PROFILES[this.iterationIndex % VARIANT_PROFILES.length];
  }

  private getPosTolPx(): number {
    const base = Math.min(this.width, this.height);
    if (this.profile.vibe === 'warm') return base * 0.038;
    if (this.profile.vibe === 'cold') return base * 0.022;
    return base * 0.029;
  }

  private getRotTolRad(): number {
    if (this.profile.vibe === 'warm') return 0.145;
    if (this.profile.vibe === 'cold') return 0.088;
    return 0.115;
  }

  private getScaleTol(): number {
    if (this.profile.vibe === 'warm') return 0.068;
    if (this.profile.vibe === 'cold') return 0.042;
    return 0.054;
  }

  private isScaleActive(): boolean {
    return this.stage === 3 && this.variantProfile.hasScaleDriftStage3;
  }

  protected onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.dragMode = null;
    this.lastOverlapCount = 0;
    this.flipAnimT = 1;

    this.northNx = 0.54 + (rng() - 0.5) * 0.1;
    this.northNy = 0.41 + (rng() - 0.5) * 0.07;
    this.patchNx = 0.27 + rng() * 0.07;
    this.patchNy = 0.44 + (rng() - 0.5) * 0.08;

    // Non-zero randomized target rotation on Stages 2–3 (never hardcoded 0°!)
    if (stage === 1) {
      this.targetRot = 0;
      this.patchRot = 0;
    } else {
      const sign = rng() > 0.5 ? 1 : -1;
      this.targetRot = sign * (0.32 + rng() * 0.72); // +-18°..+-60°
      // Place initial rotation at least 0.52 rad (~30°) away inside [-pi/2, pi/2]
      let startRot = this.targetRot - sign * (0.58 + rng() * 0.42);
      if (Math.abs(startRot) > Math.PI * 0.47) {
        startRot = clamp(-this.targetRot * 0.85, -Math.PI * 0.45, Math.PI * 0.45);
      }
      this.patchRot = startRot;
    }

    this.targetFlipped = stage === 3;
    this.patchFlipped = false;

    if (stage === 3 && this.variantProfile.hasScaleDriftStage3) {
      this.targetScale = rng() > 0.5 ? 1.14 : 0.86;
      this.patchScale = this.targetScale > 1 ? 0.82 : 1.18;
    } else {
      this.targetScale = 1.0;
      this.patchScale = 1.0;
    }

    const morphPool: readonly GalaxyMorph[] = ['spiral', 'lenticular', 'ring', 'pair'];
    const specPool: readonly { cls: SpectralClass; hex: string }[] = [
      { cls: 'G', hex: '#ffe2ad' },
      { cls: 'B', hex: '#9ed6ff' },
      { cls: 'K', hex: '#ffba7d' },
      { cls: 'A', hex: '#dceeff' },
      { cls: 'M', hex: '#ff966e' },
      { cls: 'F', hex: '#fff4de' },
    ];

    const repeatingCount = stage === 1 ? 4 : stage === 2 ? 5 : 6;
    this.galaxies = [];
    // Asymmetric constellation so handedness & rotation are unmistakably distinct
    for (let i = 0; i < repeatingCount; i++) {
      const a = (i * Math.PI * 2) / repeatingCount + (i % 2 === 0 ? 0.14 : -0.22) + rng() * 0.25;
      const r = 0.048 + (i === 0 ? 0.105 : 0.03 + rng() * 0.095);
      const sp = specPool[i % specPool.length];
      this.galaxies.push({
        rx: Math.cos(a) * r,
        ry: Math.sin(a) * r,
        morph: morphPool[i % morphPool.length],
        tilt: (rng() - 0.5) * Math.PI,
        spiralChirality: i % 2 === 0 ? 1 : -1,
        size: 7.5 + (i % 3) * 2.2,
        spectralClass: sp.cls,
        tintHex: sp.hex,
      });
    }

    // Variant 2 (SMACS Facet Join): Stage 3 adds 2 non-repeating foreground stars on North template
    if (stage === 3 && this.variantProfile.hasForegroundDecoys) {
      for (let d = 0; d < 2; d++) {
        const a = d * Math.PI + 0.65 + rng() * 0.4;
        const r = 0.16 + rng() * 0.035;
        this.galaxies.push({
          rx: Math.cos(a) * r,
          ry: Math.sin(a) * r,
          morph: 'ring',
          tilt: 0,
          spiralChirality: 1,
          size: 5.5,
          spectralClass: 'O',
          tintHex: '#a8ccff',
          isForegroundDecoy: true,
        });
      }
    }

    this.syncShowcaseCoupling(true);
  }

  onHelperAction(actionId: string): void {
    if (actionId === 'mirror_flip' && this.stage === 3 && !this.completed && this.stageClearTimer <= 0) {
      this.toggleMirrorFlip();
    }
  }

  protected getHelperActionSpec(): HudActionButtonSpec | null {
    if (this.stage !== 3) return null;
    const axisTag = this.variantProfile.flipAxis === 'vertical' ? 'V-MIRROR' : 'H-MIRROR';
    return {
      id: 'mirror_flip',
      label: this.patchFlipped ? `${axisTag} FLIPPED ✓` : `MIRROR FLIP [M]`,
      active: this.patchFlipped,
    };
  }

  private toggleMirrorFlip(): void {
    this.patchFlipped = !this.patchFlipped;
    this.flipAnimT = 0;
    this.ctx.audio?.playSolenoidClack(true);
    platform.triggerHaptic('vernierTick', 0.72);
    this.particles.emitPhotonSparks(
      this.patchNx * this.width,
      this.patchNy * this.height,
      3,
      34,
      this.palette.secondaryHex
    );
    this.emitHud(true);
  }

  private isFlipMatched(): boolean {
    return this.patchFlipped === this.targetFlipped;
  }

  private isRotMatched(): boolean {
    return Math.abs(angleDiffRad(this.patchRot, this.targetRot)) <= this.getRotTolRad();
  }

  private isScaleMatched(): boolean {
    return !this.isScaleActive() || Math.abs(this.patchScale - this.targetScale) <= this.getScaleTol();
  }

  private getPosErrorPx(): number {
    const dx = (this.patchNx - this.northNx) * this.width;
    const dy = (this.patchNy - this.northNy) * this.height;
    return Math.hypot(dx, dy);
  }

  private isAlignedNow(): boolean {
    return (
      this.isFlipMatched() &&
      this.isRotMatched() &&
      this.isScaleMatched() &&
      this.getPosErrorPx() <= this.getPosTolPx()
    );
  }

  private computeCorrelation01(): number {
    const scale = Math.max(1, Math.min(this.width, this.height));
    const posScore = clamp(1 - this.getPosErrorPx() / (scale * 0.34), 0, 1);
    const rotScore = this.stage === 1 ? 1 : clamp(1 - Math.abs(angleDiffRad(this.patchRot, this.targetRot)) / 1.2, 0, 1);
    const flipScore = this.isFlipMatched() ? 1 : 0.35;
    const scaleScore = this.isScaleActive() ? clamp(1 - Math.abs(this.patchScale - this.targetScale) / 0.35, 0, 1) : 1;
    return clamp(posScore * 0.48 + rotScore * 0.28 + scaleScore * 0.14 + flipScore * 0.1, 0, 1);
  }

  private getPatchRadiusPx(): number {
    return Math.min(this.width, this.height) * (this.compact ? 0.22 : 0.21);
  }

  private applyStripInput(strip: VernierStripSpec, px: number): void {
    const mag = 0.045 * this.profile.detentWellScale;
    if (strip.key === 'rot') {
      const targetVal01 = clamp((this.targetRot + Math.PI * 0.5) / Math.PI, 0, 1);
      const val01 = valueFromStripX(strip, px, targetVal01, mag);
      this.patchRot = lerp(-Math.PI * 0.5, Math.PI * 0.5, val01);
    } else if (strip.key === 'scale') {
      const targetVal01 = clamp((this.targetScale - 0.72) / 0.56, 0, 1);
      const val01 = valueFromStripX(strip, px, targetVal01, mag);
      this.patchScale = lerp(0.72, 1.28, val01);
    }
  }

  protected onPointerDown(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;

    for (let i = 0; i < this.strips.length; i++) {
      const s = this.strips[i];
      if (hitVernierStrip(s, ev.x, ev.y)) {
        this.dragMode = s.key as 'rot' | 'scale';
        this.applyStripInput(s, ev.x);
        platform.triggerHaptic('vernierTick', 0.45);
        return;
      }
    }

    const pCx = this.patchNx * this.width;
    const pCy = this.patchNy * this.height;
    const patchR = this.getPatchRadiusPx();
    const distFromPatch = Math.hypot(ev.x - pCx, ev.y - pCy);

    // Optional tactile bezel rotation handle grab on Stages 2-3
    if (this.stage >= 2 && Math.abs(distFromPatch - patchR) <= 18) {
      const handleAng = this.patchRot - Math.PI * 0.5;
      const hx = pCx + Math.cos(handleAng) * patchR;
      const hy = pCy + Math.sin(handleAng) * patchR;
      if (Math.hypot(ev.x - hx, ev.y - hy) <= 28) {
        this.dragMode = 'bezel_rot';
        this.rotDragStartAng = Math.atan2(ev.y - pCy, ev.x - pCx);
        this.rotDragStartVal = this.patchRot;
        platform.triggerHaptic('vernierTick', 0.5);
        return;
      }
    }

    this.dragMode = 'patch';
    this.dragOffsetX = ev.x / Math.max(1, this.width) - this.patchNx;
    this.dragOffsetY = ev.y / Math.max(1, this.height) - this.patchNy;
  }

  protected onPointerMove(ev: PointerLocalEvent): void {
    if (!this.dragMode || this.stageClearTimer > 0) return;

    if (this.dragMode === 'rot' || this.dragMode === 'scale') {
      const s = this.strips.find((item) => item.key === this.dragMode);
      if (s) this.applyStripInput(s, ev.x);
      return;
    }

    if (this.dragMode === 'bezel_rot') {
      const pCx = this.patchNx * this.width;
      const pCy = this.patchNy * this.height;
      const curAng = Math.atan2(ev.y - pCy, ev.x - pCx);
      const delta = angleDiffRad(curAng, this.rotDragStartAng);
      let nextRot = clamp(this.rotDragStartVal + delta, -Math.PI * 0.5, Math.PI * 0.5);
      const snapTol = 0.09 * this.profile.detentWellScale;
      if (Math.abs(angleDiffRad(nextRot, this.targetRot)) < snapTol) {
        nextRot = lerp(nextRot, this.targetRot, 0.42);
      }
      this.patchRot = nextRot;
      return;
    }

    if (this.dragMode === 'patch') {
      let nx = clamp(ev.x / Math.max(1, this.width) - this.dragOffsetX, 0.14, 0.86);
      let ny = clamp(ev.y / Math.max(1, this.height) - this.dragOffsetY, 0.2, 0.68);
      // ONLY apply magnetic position snap if mirror flip & rotation are already matched!
      if (this.isFlipMatched() && Math.abs(angleDiffRad(this.patchRot, this.targetRot)) <= this.getRotTolRad() * 1.4) {
        const snapPx = this.getPosTolPx() * 1.35 * this.profile.detentWellScale;
        const dPx = Math.hypot((nx - this.northNx) * this.width, (ny - this.northNy) * this.height);
        if (dPx < snapPx) {
          nx = lerp(nx, this.northNx, 0.42);
          ny = lerp(ny, this.northNy, 0.42);
        }
      }
      this.patchNx = nx;
      this.patchNy = ny;
    }
  }

  protected onPointerUp(): void {
    this.dragMode = null;
  }

  protected onWheel(deltaY: number): boolean {
    if (this.stage < 2 || this.stageClearTimer > 0) return false;
    const dir = deltaY > 0 ? 1 : -1;
    this.patchRot = clamp(this.patchRot + dir * 0.06, -Math.PI * 0.5, Math.PI * 0.5);
    return true;
  }

  protected onKeyDown(e: KeyboardEvent): void {
    if (this.stageClearTimer > 0) return;
    if ((e.key === 'm' || e.key === 'M' || e.code === 'Space') && this.stage === 3 && !e.repeat) {
      e.preventDefault();
      this.toggleMirrorFlip();
      return;
    }
    const rotStep = e.shiftKey ? 0.03 : 0.075;
    if (this.stage >= 2 && (e.key === 'q' || e.key === 'Q')) {
      e.preventDefault();
      this.patchRot = clamp(this.patchRot - rotStep, -Math.PI * 0.5, Math.PI * 0.5);
      return;
    }
    if (this.stage >= 2 && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault();
      this.patchRot = clamp(this.patchRot + rotStep, -Math.PI * 0.5, Math.PI * 0.5);
      return;
    }
    if (this.isScaleActive() && (e.key === '-' || e.key === '_' || e.key === '[' || e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      const scStep = e.shiftKey ? 0.015 : 0.035;
      this.patchScale = clamp(this.patchScale - scStep, 0.72, 1.28);
      return;
    }
    if (this.isScaleActive() && (e.key === '=' || e.key === '+' || e.key === ']' || e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      const scStep = e.shiftKey ? 0.015 : 0.035;
      this.patchScale = clamp(this.patchScale + scStep, 0.72, 1.28);
      return;
    }
    const moveStep = e.shiftKey ? 0.008 : 0.018;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      this.patchNx = clamp(this.patchNx - moveStep, 0.14, 0.86);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      this.patchNx = clamp(this.patchNx + moveStep, 0.14, 0.86);
    } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      this.patchNy = clamp(this.patchNy - moveStep, 0.2, 0.68);
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.preventDefault();
      this.patchNy = clamp(this.patchNy + moveStep, 0.2, 0.68);
    }
  }

  private transformPatchGalaxy(
    g: HorizonGalaxy,
    scalePx: number
  ): { x: number; y: number } {
    const flipMismatch = this.patchFlipped !== this.targetFlipped;
    const fx = flipMismatch && this.variantProfile.flipAxis === 'horizontal' ? -g.rx : g.rx;
    const fy = flipMismatch && this.variantProfile.flipAxis === 'vertical' ? -g.ry : g.ry;
    const relRot = this.patchRot - this.targetRot;
    const relScale = this.patchScale / Math.max(0.5, this.targetScale);
    const sx = fx * scalePx * relScale;
    const sy = fy * scalePx * relScale;
    return {
      x: sx * Math.cos(relRot) - sy * Math.sin(relRot),
      y: sx * Math.sin(relRot) + sy * Math.cos(relRot),
    };
  }

  private syncShowcaseCoupling(force: boolean): void {
    if (!this.ctx.showcase) return;
    const corr = this.computeCorrelation01();
    const sig = `${Math.round(corr * 30)}:${this.stage}`;
    if (!force && sig === this.lastShowcaseSig) return;
    this.lastShowcaseSig = sig;
    this.ctx.showcase.applyInstrumentPatch({
      progress: this.getStageProgress01(),
      seamReveal: clamp((corr - 0.35) / 0.65, 0, 1),
    });
  }

  protected onUpdate(dt: number): void {
    if (this.flipAnimT < 1) {
      this.flipAnimT = Math.min(1, this.flipAnimT + dt / 0.28);
    }
    if (this.stageClearTimer > 0) return;

    // Count individual galaxy overlaps for tactile micro-feedback chimes
    const scalePx = Math.min(this.width, this.height);
    const nCx = this.northNx * this.width;
    const nCy = this.northNy * this.height;
    const pCx = this.patchNx * this.width;
    const pCy = this.patchNy * this.height;
    let overlaps = 0;
    for (let i = 0; i < this.galaxies.length; i++) {
      const g = this.galaxies[i];
      if (g.isForegroundDecoy) continue;
      const off = this.transformPatchGalaxy(g, scalePx);
      const d = Math.hypot(pCx + off.x - (nCx + g.rx * scalePx), pCy + off.y - (nCy + g.ry * scalePx));
      if (d <= 14) overlaps++;
    }
    if (overlaps > this.lastOverlapCount) {
      this.ctx.audio?.playProximityTick?.(overlaps / Math.max(1, this.galaxies.length), 0);
    }
    this.lastOverlapCount = overlaps;

    this.syncShowcaseCoupling(false);

    if (this.isAlignedNow()) {
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        this.triggerStageClear(
          `93-BLY ANTIPODAL SEAM ${this.stage}/${this.maxStages} PROVEN`,
          0.6,
          nCx,
          nCy
        );
      }
    } else {
      this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.6);
    }
  }

  protected onAllStagesCleared(): void {
    this.finishSuccess({
      accuracy: 0.96,
      proofFragmentSuffix: 'horizonseam',
      dossierSnippet: `Identical mirrored antipodal high-z galaxies overlapped 1:1 across 180.0° (93.0 Gly wall, offset 10 ly from Sol–Centauri) on ${this.ctx.targetName}.`,
      telemetrySummary: `Antipodal Seam Correlation 96% · ${this.elapsedSec.toFixed(1)}s`,
      physicalPrinciple: 'Antipodal Spherical Enclosure Projection Symmetry (Δ = 180.0° · 93.0 Gly)',
    });
  }

  protected getStageProgress01(): number {
    if (this.completed) return 1;
    return clamp((this.stage - 1 + this.computeCorrelation01()) / 3, 0, 1);
  }

  protected getPromptText(): string {
    if (this.stage === 1) {
      return 'Drag the translucent South-Sky comparison lens over the North Horizon until every distant galaxy overlaps 1:1.';
    }
    if (this.stage === 2) {
      return 'Slide the South-Sky lens and rotate PATCH ROTATION (or Q/E / bezel notch) to fuse the antipodal galaxy cluster.';
    }
    if (this.isScaleActive()) {
      return 'Flip MIRROR [M], align rotation & 10-ly PATCH SCALE until all 6 antipodal galaxies lock onto the 93-BLY seam.';
    }
    return this.variantProfile.hasForegroundDecoys
      ? 'Flip MIRROR [M], rotate & slide the patch to lock the 6 repeating high-z galaxies (ignore non-repeating foreground stars).'
      : 'Press MIRROR FLIP [M], rotate & slide the South-Sky patch until chiral spiral galaxies fuse 1:1 on the 93-BLY seam.';
  }

  /**
   * Draws a miniature procedural galaxy sprite (spiral with chiral arms, tilted lenticular,
   * ring galaxy, or interacting dwarf pair) with ZERO per-frame gradients or shadowBlur.
   */
  private drawMiniGalaxy(
    c2d: CanvasRenderingContext2D,
    x: number,
    y: number,
    g: HorizonGalaxy,
    rotRad: number,
    scaleMul: number,
    flipSignX: number,
    flipSignY: number,
    tintHex: string,
    alpha: number,
    isOverlayPlate: boolean
  ): void {
    const r = g.size * scaleMul;
    c2d.save();
    c2d.translate(x, y);
    c2d.rotate(rotRad + g.tilt);
    c2d.scale(flipSignX, flipSignY);

    // Pre-rendered luminous galactic halo beneath every miniature galaxy
    drawSoftGalaxyHalo(c2d, 0, 0, r * 1.45, r * 1.05, 0, tintHex, alpha * 0.46);
    c2d.globalAlpha = alpha;

    if (g.morph === 'spiral') {
      // Multi-stroke tapered spiral arms with unambiguous chiral winding
      c2d.strokeStyle = tintHex;
      for (let arm = 0; arm < 2; arm++) {
        c2d.lineWidth = isOverlayPlate ? 1.55 : 1.85;
        c2d.beginPath();
        const baseA = arm * Math.PI;
        for (let step = 0; step <= 12; step++) {
          const u = step / 12;
          const a = baseA + g.spiralChirality * u * 2.25;
          const rad = 1.6 + u * r * 1.2;
          const px = Math.cos(a) * rad;
          const py = Math.sin(a) * rad * 0.66;
          if (step === 0) c2d.moveTo(px, py);
          else c2d.lineTo(px, py);
        }
        c2d.stroke();
      }
      drawOpticalStar(c2d, 0, 0, r * 0.42, {
        spectralClass: isOverlayPlate ? 'B' : g.spectralClass,
        spikes: 0,
        alpha: alpha * 0.92,
        vibeMode: this.palette.mode,
      });
    } else if (g.morph === 'lenticular') {
      // Edge-on galaxy disk + central dark dust lane slit
      c2d.strokeStyle = tintHex;
      c2d.lineWidth = 1.4;
      if (typeof c2d.ellipse === 'function') {
        c2d.beginPath();
        c2d.ellipse(0, 0, r * 1.25, r * 0.34, 0, 0, Math.PI * 2);
        c2d.stroke();
      }
      c2d.fillStyle = tintHex;
      c2d.globalAlpha = alpha * 0.28;
      if (typeof c2d.ellipse === 'function') {
        c2d.beginPath();
        c2d.ellipse(0, 0, r * 1.15, r * 0.28, 0, 0, Math.PI * 2);
        c2d.fill();
      }
      c2d.globalAlpha = alpha * 0.9;
      c2d.strokeStyle = '#040812';
      c2d.lineWidth = 1.2;
      c2d.beginPath();
      c2d.moveTo(-r * 0.95, 0);
      c2d.lineTo(r * 0.95, 0);
      c2d.stroke();
      drawOpticalStar(c2d, 0, 0, r * 0.34, {
        spectralClass: isOverlayPlate ? 'A' : g.spectralClass,
        spikes: 0,
        alpha: alpha * 0.85,
        vibeMode: this.palette.mode,
      });
    } else if (g.morph === 'ring') {
      c2d.strokeStyle = tintHex;
      c2d.lineWidth = 1.5;
      if (typeof c2d.ellipse === 'function') {
        c2d.beginPath();
        c2d.ellipse(0, 0, r * 0.96, r * 0.62, 0, 0, Math.PI * 2);
        c2d.stroke();
      }
      drawOpticalStar(c2d, 0, 0, r * 0.32, {
        spectralClass: isOverlayPlate ? 'B' : g.spectralClass,
        spikes: 0,
        alpha: alpha * 0.9,
        vibeMode: this.palette.mode,
      });
    } else {
      // Interacting dwarf galaxy pair (asymmetric double-bulge with faint bridge)
      c2d.strokeStyle = tintHex;
      c2d.lineWidth = 1.1;
      c2d.beginPath();
      c2d.moveTo(-r * 0.55, -r * 0.15);
      c2d.lineTo(r * 0.52, r * 0.18);
      c2d.stroke();
      drawOpticalStar(c2d, -r * 0.55, -r * 0.15, r * 0.4, {
        spectralClass: isOverlayPlate ? 'B' : g.spectralClass,
        spikes: 0,
        alpha: alpha * 0.92,
        vibeMode: this.palette.mode,
      });
      drawOpticalStar(c2d, r * 0.52, r * 0.18, r * 0.28, {
        spectralClass: isOverlayPlate ? 'A' : 'K',
        spikes: 0,
        alpha: alpha * 0.85,
        vibeMode: this.palette.mode,
      });
    }
    c2d.restore();
  }

  protected onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const compact = this.compact;
    const scalePx = Math.min(w, h);
    const aligned = this.isAlignedNow();
    const corr = this.computeCorrelation01();
    const nCx = this.northNx * w;
    const nCy = this.northNy * h;
    const pCx = this.patchNx * w;
    const pCy = this.patchNy * h;
    const patchR = this.getPatchRadiusPx();

    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: 3,
      alpha: 0.46,
      brightness: 0.78,
      tintAlpha: 0.46,
      gridAlpha: aligned ? 0.22 : this.palette.mode === 'cold' ? 0.14 : 0.05,
      reticleDuck: { cx: pCx, cy: pCy, r: patchR + 18 },
    });

    // Multi-facet geodesic 93-BLY spherical enclosure lattice emerging as alignment climbs
    const seamVis = aligned ? 1 : clamp((corr - 0.58) / 0.42, 0, 1);
    if (seamVis > 0.04) {
      const seamCol = aligned ? this.palette.lockHex : this.palette.secondaryHex;
      const facetInnerR = scalePx * 0.33;
      const facetOuterR = scalePx * 0.44;
      c2d.save();
      c2d.strokeStyle = seamCol;
      c2d.globalAlpha = seamVis * (this.palette.mode === 'cold' ? 0.44 : 0.3);
      c2d.lineWidth = aligned ? 1.4 : 0.95;
      if (typeof c2d.setLineDash === 'function') c2d.setLineDash([7, 6]);
      c2d.beginPath();
      for (let ring = 0; ring < 2; ring++) {
        const rad = ring === 0 ? facetInnerR : facetOuterR;
        for (let v = 0; v < 6; v++) {
          const a = (v * Math.PI) / 3 + 0.18;
          const vx = nCx + Math.cos(a) * rad;
          const vy = nCy + Math.sin(a) * rad;
          if (v === 0) c2d.moveTo(vx, vy);
          else c2d.lineTo(vx, vy);
        }
        c2d.closePath();
      }
      for (let v = 0; v < 6; v++) {
        const a = (v * Math.PI) / 3 + 0.18;
        c2d.moveTo(nCx + Math.cos(a) * facetInnerR, nCy + Math.sin(a) * facetInnerR);
        c2d.lineTo(nCx + Math.cos(a) * facetOuterR, nCy + Math.sin(a) * facetOuterR);
      }
      c2d.stroke();
      if (typeof c2d.setLineDash === 'function') c2d.setLineDash([]);
      c2d.restore();
    }

    // Fixed North Horizon Template Galaxies (warm amber-gold photographic register)
    for (let i = 0; i < this.galaxies.length; i++) {
      const g = this.galaxies[i];
      const gx = nCx + g.rx * scalePx;
      const gy = nCy + g.ry * scalePx;
      if (g.isForegroundDecoy) {
        drawOpticalStar(c2d, gx, gy, 5.2, {
          spectralClass: 'O',
          spikes: 4,
          alpha: 0.82,
          vibeMode: this.palette.mode,
        });
      } else {
        this.drawMiniGalaxy(c2d, gx, gy, g, 0, 1, 1, 1, g.tintHex, 0.92, false);
      }
    }

    // North Horizon Subtle Astrometric Label
    c2d.save();
    c2d.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = 'rgba(255, 224, 174, 0.72)';
    c2d.textAlign = 'center';
    c2d.fillText(this.variantProfile.raLabelNorth, nCx, nCy - patchR - 8);
    c2d.restore();

    // Draggable South-Sky Translucent Photographic Comparison Lens with optical-prism mirror flip squash!
    const flipMismatch = this.patchFlipped !== this.targetFlipped;
    const flipSignX = flipMismatch && this.variantProfile.flipAxis === 'horizontal' ? -1 : 1;
    const flipSignY = flipMismatch && this.variantProfile.flipAxis === 'vertical' ? -1 : 1;
    const flipSquash = this.flipAnimT < 1 ? Math.max(0.06, Math.abs(Math.cos(this.flipAnimT * Math.PI))) : 1;
    const drawScaleX = flipSignX * (this.variantProfile.flipAxis === 'horizontal' ? flipSquash : 1);
    const drawScaleY = flipSignY * (this.variantProfile.flipAxis === 'vertical' ? flipSquash : 1);
    const relRot = this.patchRot - this.targetRot;
    const relScale = this.patchScale / Math.max(0.5, this.targetScale);

    c2d.save();
    c2d.beginPath();
    c2d.arc(pCx, pCy, patchR, 0, Math.PI * 2);
    c2d.fillStyle = aligned ? `rgba(${this.palette.lockRgb}, 0.14)` : 'rgba(10, 22, 38, 0.36)';
    c2d.fill();
    c2d.clip?.();

    // Clipped rotated/mirrored cached sky plate slice inside the comparison lens (0ms ctx.filter!)
    const platePair = getPlateCanvasPair(this.activePlateId, w, h);
    if (platePair && typeof c2d.drawImage === 'function') {
      c2d.save();
      c2d.translate(pCx, pCy);
      c2d.rotate(relRot);
      c2d.scale(drawScaleX * relScale, drawScaleY * relScale);
      c2d.globalAlpha = aligned ? 0.34 : 0.22;
      c2d.drawImage(platePair.sharp, -nCx, -nCy, w, h);
      c2d.restore();
    }

    // Translucent cyan-register South-Sky copies of the repeating high-z galaxies
    for (let i = 0; i < this.galaxies.length; i++) {
      const g = this.galaxies[i];
      if (g.isForegroundDecoy) continue;
      const off = this.transformPatchGalaxy(g, scalePx);
      const squashedOffX =
        this.variantProfile.flipAxis === 'horizontal' ? off.x * flipSquash : off.x;
      const squashedOffY =
        this.variantProfile.flipAxis === 'vertical' ? off.y * flipSquash : off.y;
      const gx = pCx + squashedOffX;
      const gy = pCy + squashedOffY;
      const dToNorth = Math.hypot(pCx + off.x - (nCx + g.rx * scalePx), pCy + off.y - (nCy + g.ry * scalePx));
      const matchedThis = this.flipAnimT >= 0.9 && dToNorth <= 14;
      const overlayCol = matchedThis ? this.palette.lockHex : '#8be0ff';

      this.drawMiniGalaxy(
        c2d,
        gx,
        gy,
        g,
        relRot,
        relScale,
        drawScaleX,
        drawScaleY,
        overlayCol,
        matchedThis ? 0.96 : 0.82,
        true
      );

      // Subtle hairline alignment bracket when an individual galaxy fuses
      if (matchedThis) {
        c2d.strokeStyle = this.palette.lockHex;
        c2d.globalAlpha = 0.72;
        c2d.lineWidth = 1.2;
        c2d.beginPath();
        c2d.arc(gx, gy, g.size + 4.5, 0, Math.PI * 2);
        c2d.stroke();
      }
    }
    c2d.restore();

    // Comparison Lens Bezel + Orientation Meridian Notch + Handle
    const bezelCol = aligned ? this.palette.lockHex : this.palette.accentHex;
    drawGlowStroke(
      c2d,
      (ctx) => {
        ctx.arc(pCx, pCy, patchR, 0, Math.PI * 2);
      },
      bezelCol,
      aligned ? 2.2 : 1.5,
      { outerAlpha: aligned ? 0.26 : 0.15 }
    );

    c2d.save();
    // Meridian handedness notch & rotation grab bead on rim
    const notchAng = this.patchRot - Math.PI * 0.5;
    const nxRim = pCx + Math.cos(notchAng) * patchR;
    const nyRim = pCy + Math.sin(notchAng) * patchR;
    c2d.strokeStyle = bezelCol;
    c2d.lineWidth = 1.6;
    c2d.beginPath();
    c2d.moveTo(pCx + Math.cos(notchAng) * (patchR - 7), pCy + Math.sin(notchAng) * (patchR - 7));
    c2d.lineTo(pCx + Math.cos(notchAng) * (patchR + 7), pCy + Math.sin(notchAng) * (patchR + 7));
    c2d.stroke();

    if (this.stage >= 2) {
      c2d.fillStyle = '#07101c';
      c2d.beginPath();
      c2d.arc(nxRim, nyRim, 5.5, 0, Math.PI * 2);
      c2d.fill();
      c2d.stroke();
    }

    // Small chirality parity badge below comparison lens
    c2d.font = '600 8px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.textAlign = 'center';
    c2d.fillStyle = aligned ? this.palette.lockHex : 'rgba(158, 232, 255, 0.82)';
    const parityStr = this.stage === 3 ? (this.patchFlipped ? ' · PARITY INV' : ' · PARITY STD') : '';
    c2d.fillText(`${this.variantProfile.raLabelSouth}${parityStr}`, pCx, pCy + patchR + 14);

    if (this.profile.showNumericDeltas && !compact) {
      c2d.fillStyle = aligned ? this.palette.lockHex : 'rgba(186, 224, 248, 0.68)';
      c2d.fillText(`CORR ${Math.round(corr * 100)}% · 93.0 Gly`, pCx, pCy + patchR + 25);
    }
    c2d.restore();

    // Bottom Verniers (CLEANLY ABOVE DOM #mg-helper-btn MIRROR FLIP on Stage 3 mobile 844x390!)
    if (this.stage >= 2) {
      const rotVal01 = clamp((this.patchRot + Math.PI * 0.5) / Math.PI, 0, 1);
      const degDisplay = Math.round((this.patchRot * 180) / Math.PI);
      this.stripInputs.length = this.isScaleActive() ? 2 : 1;
      this.stripInputs[0] = {
        key: 'rot',
        label: 'PATCH ROTATION (Q/E)',
        val01: rotVal01,
        locked: this.isRotMatched(),
        rightText: `${degDisplay >= 0 ? '+' : ''}${degDisplay}°`,
      };
      if (this.isScaleActive()) {
        this.stripInputs[1] = {
          key: 'scale',
          label: '10-LY PATCH SCALE',
          val01: clamp((this.patchScale - 0.72) / 0.56, 0, 1),
          locked: this.isScaleMatched(),
          rightText: `${this.patchScale.toFixed(2)}×`,
        };
      }
      const stripY =
        this.stage === 3 ? (compact ? h - 106 : h - 134) : compact ? h - 76 : h - 98;
      layoutVernierRowInto(this.strips, w, h, this.stripInputs, stripY);
      for (let i = 0; i < this.strips.length; i++) {
        drawVernierStrip(c2d, this.strips[i], this.palette.accentHex, this.palette.lockHex);
      }
    } else {
      this.strips.length = 0;
    }

    this.drawSharedOverlays(
      c2d,
      w,
      h,
      this.lockHoldSec > 0.02
        ? {
            cx: nCx,
            cy: nCy,
            radius: patchR + 9,
            progress01: this.lockHoldSec / this.lockHoldTargetSec,
          }
        : undefined
    );
  }

  protected solveCurrentStage(_stage: 1 | 2 | 3): void {
    this.patchNx = this.northNx;
    this.patchNy = this.northNy;
    this.patchRot = this.targetRot;
    this.patchScale = this.targetScale;
    this.patchFlipped = this.targetFlipped;
  }

  protected override verifySolved(_stage: 1 | 2 | 3): boolean {
    return this.isAlignedNow();
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'From 10 light-years outside Sol–Centauri, opposite sky hemispheres (Δ = 180.0°) at 93.0 billion light-years display mirrored duplicate high-z galaxies—exposing a finite spherical projection enclosure.',
      goalSummary:
        'Slide, rotate, mirror-flip, and scale-match the translucent South-Sky lens until all repeating distant galaxies fuse 1:1.',
      controlsDesktop:
        'Drag the lens patch (or Arrows/WASD); rotate via Q/E or wheel; scale via -/= on V4 Stage 3; press M / MIRROR FLIP on Stage 3.',
      controlsTouch:
        'Touch-drag the comparison patch, slide PATCH ROTATION, and tap MIRROR FLIP on Stage 3.',
      warmthEffect:
        'Warm H% provides forgiving alignment capture and golden seam glow; Cold H% sharpens angular Δθ telemetry and wireframe enclosure facets.',
    };
  }
}
