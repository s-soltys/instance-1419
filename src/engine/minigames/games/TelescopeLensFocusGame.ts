import { platform } from '../../../platform/PlatformAdapter';
import { BaseCosmicMinigame, type PointerLocalEvent } from '../core/BaseCosmicMinigame';
import {
  drawVernierStrip,
  hitVernierStrip,
  layoutVernierRowInto,
  layoutVerticalVernierRackInto,
  valueFromStripPos,
  type VernierItemInput,
  type VernierStripSpec,
} from '../core/vernierWidgets';
import { getPlateCanvasPair } from '../render/BackdropCachePipeline';
import { drawGlowStroke } from '../render/OpticalDrawUtils';
import { drawOpticalStar } from '../render/StarPSFAtlas';
import { angleDiffRad, clamp, lerp, wrapAngleRad } from '../tactilePhysics';
import type { CosmicPlateId, InstrumentFieldGuide, MinigameVariantSpec, SpectralClass } from '../types';

interface LensRing {
  idx: number;
  angle: number;
  targetAngle: number;
  rInnerFrac: number;
  rOuterFrac: number;
}

interface CausticLandmark {
  angleRad: number;
  colorHex: string;
  spectral: SpectralClass;
  arcSpan: number;
}

interface LensVariantProfile {
  einsteinArcsec: number;
  shearTag: string;
  landmarks: readonly CausticLandmark[];
  hexSeamCore: boolean;
}

// Asymmetric angular spacings + distinct spectral colors eliminate ALL 3-fold rotational ambiguity!
const VARIANT_PROFILES: readonly LensVariantProfile[] = [
  {
    einsteinArcsec: 18.4,
    shearTag: 'SMACS 0723 · θE 18.4″',
    landmarks: [
      { angleRad: 0.24, colorHex: '#ffd285', spectral: 'G', arcSpan: 0.24 },
      { angleRad: 2.18, colorHex: '#92ccff', spectral: 'B', arcSpan: 0.17 },
      { angleRad: 4.46, colorHex: '#ff9678', spectral: 'M', arcSpan: 0.13 },
    ],
    hexSeamCore: true,
  },
  {
    einsteinArcsec: 24.1,
    shearTag: 'QUINTET SHEAR · θE 24.1″',
    landmarks: [
      { angleRad: 0.58, colorHex: '#9ee8ff', spectral: 'O', arcSpan: 0.22 },
      { angleRad: 2.92, colorHex: '#ffcf86', spectral: 'K', arcSpan: 0.18 },
      { angleRad: 4.74, colorHex: '#d8e9ff', spectral: 'A', arcSpan: 0.14 },
    ],
    hexSeamCore: false,
  },
  {
    einsteinArcsec: 15.8,
    shearTag: 'CARTWHEEL SPOKES · θE 15.8″',
    landmarks: [
      { angleRad: 0.12, colorHex: '#ffe4a8', spectral: 'F', arcSpan: 0.22 },
      { angleRad: 1.88, colorHex: '#8fc5ff', spectral: 'B', arcSpan: 0.16 },
      { angleRad: 3.62, colorHex: '#ffaa76', spectral: 'K', arcSpan: 0.2 },
      { angleRad: 5.18, colorHex: '#c6e5ff', spectral: 'A', arcSpan: 0.12 },
    ],
    hexSeamCore: false,
  },
  {
    einsteinArcsec: 21.0,
    shearTag: 'ENCLOSURE SEAM · θE 21.0″',
    landmarks: [
      { angleRad: 0.42, colorHex: '#ffd890', spectral: 'G', arcSpan: 0.25 },
      { angleRad: 2.54, colorHex: '#95d8ff', spectral: 'O', arcSpan: 0.16 },
      { angleRad: 4.52, colorHex: '#ff9d7a', spectral: 'M', arcSpan: 0.14 },
    ],
    hexSeamCore: true,
  },
];

/**
 * LNS-04 — Gravitational Lens Focus
 * Concentric adaptive-optics de-lensing phase plates with 0ms pre-baked blur crossfade
 * (ZERO per-frame ctx.filter!), seamless 1:1 rotation (zero 72° wrap jump), asymmetric
 * spectral landmarks (zero symmetry trap), and mobile vertical right-side Zeiss rack vernier.
 */
export class TelescopeLensFocusGame extends BaseCosmicMinigame {
  readonly id = 'lens_focus';
  readonly title = 'GRAVITATIONAL LENS FOCUS';
  readonly subtitle = 'Concentric Caustic De-Warping';
  readonly instrumentCode = 'LNS-04';

  readonly platePool: readonly CosmicPlateId[] = ['smacs', 'stephans_quintet', 'cartwheel'];
  readonly variants: readonly MinigameVariantSpec[] = [
    { index: 0, id: 'lens_focus_v1', label: 'SMACS 0723 Arcs', plateId: 'smacs', scenarioTag: 'smacs_caustic' },
    { index: 1, id: 'lens_focus_v2', label: 'Quintet Tidal Shear', plateId: 'stephans_quintet', scenarioTag: 'quintet_shear' },
    { index: 2, id: 'lens_focus_v3', label: 'Cartwheel Ring Caustic', plateId: 'cartwheel', scenarioTag: 'cartwheel_spokes' },
    { index: 3, id: 'lens_focus_v4', label: 'Deep Enclosure Seam', plateId: 'smacs', scenarioTag: 'enclosure_seam' },
  ];

  private variantCfg: LensVariantProfile = VARIANT_PROFILES[0];
  private rings: LensRing[] = [];
  private focalDepth = 0.65;
  private targetFocalDepth = 0.65;

  private dragMode: 'ring' | 'focal' | null = null;
  private lastPointerAngle = 0;
  private wasAngleLocked = false;
  private wasFocalLocked = false;
  private currentMatch = 0;
  private accSum = 0;
  private accCount = 0;

  private readonly focalStrips: VernierStripSpec[] = [];
  private readonly focalInputs: VernierItemInput[] = [];
  private readonly bokehAngle = new Float32Array(12);
  private readonly bokehRadiusFrac = new Float32Array(12);

  protected override onMount(): void {
    this.lockHoldTargetSec = 0.9;
    this.variantCfg = VARIANT_PROFILES[this.iterationIndex % VARIANT_PROFILES.length];
    this.accSum = 0;
    this.accCount = 0;

    const rng = this.stageRng(1, 'rings');
    const bands: ReadonlyArray<readonly [number, number]> = [
      [0.7, 0.98], // Outer (Stage 1)
      [0.44, 0.68], // Middle (Stage 2)
      [0.2, 0.42], // Inner (Stage 3)
    ];

    this.rings = bands.map(([rIn, rOut], idx) => {
      const targetAngle = (rng() - 0.5) * 1.2;
      const offset = (idx % 2 === 0 ? 1 : -1) * (0.9 + rng() * 0.95);
      return {
        idx,
        angle: wrapAngleRad(targetAngle + offset),
        targetAngle: wrapAngleRad(targetAngle),
        rInnerFrac: rIn,
        rOuterFrac: rOut,
      };
    });

    for (let i = 0; i < this.bokehAngle.length; i++) {
      this.bokehAngle[i] = rng() * Math.PI * 2;
      this.bokehRadiusFrac[i] = 0.26 + rng() * 0.68;
    }
  }

  protected override onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.dragMode = null;
    this.wasAngleLocked = false;
    this.wasFocalLocked = false;

    for (let i = 0; i < this.rings.length; i++) {
      if (i < stage - 1) {
        this.rings[i].angle = this.rings[i].targetAngle;
      }
    }

    if (stage === 1) {
      this.focalDepth = 0.65;
      this.targetFocalDepth = 0.65;
    } else {
      this.targetFocalDepth = 0.24 + rng() * 0.54;
      this.focalDepth =
        this.targetFocalDepth > 0.5 ? 0.14 + rng() * 0.08 : 0.8 + rng() * 0.08;
    }
    this.currentMatch = this.computeMatch01();
  }

  private getAngleLockTol(): number {
    // Warm = forgiving amber bezel snap; Cold = surgical alignment
    if (this.profile.vibe === 'warm') return 0.21;
    if (this.profile.vibe === 'cold') return 0.135;
    return 0.175;
  }

  private getFocalLockTol(): number {
    if (this.profile.vibe === 'warm') return 0.125;
    if (this.profile.vibe === 'cold') return 0.078;
    return 0.1;
  }

  private isAngleAligned(): boolean {
    const active = this.rings[this.stage - 1];
    if (!active) return false;
    return Math.abs(angleDiffRad(active.angle, active.targetAngle)) <= this.getAngleLockTol();
  }

  private isFocalAligned(): boolean {
    if (this.stage === 1) return true;
    return Math.abs(this.focalDepth - this.targetFocalDepth) <= this.getFocalLockTol();
  }

  private isStageAligned(): boolean {
    return this.isAngleAligned() && this.isFocalAligned();
  }

  private computeMatch01(): number {
    const active = this.rings[this.stage - 1];
    if (!active) return 0;
    const angDiff = Math.abs(angleDiffRad(active.angle, active.targetAngle));
    // Proper H% direction: Warm = wider smooth falloff, Cold = sharper curve
    const angScale = this.profile.vibe === 'warm' ? 1.15 : this.profile.vibe === 'cold' ? 0.82 : 0.98;
    const angScore = clamp(1 - angDiff / angScale, 0, 1);

    if (this.stage === 1) return angScore;
    const focalDiff = Math.abs(this.focalDepth - this.targetFocalDepth);
    const focalScale = this.profile.vibe === 'warm' ? 0.54 : this.profile.vibe === 'cold' ? 0.4 : 0.47;
    const focalScore = clamp(1 - focalDiff / focalScale, 0, 1);
    return angScore * 0.62 + focalScore * 0.38;
  }

  private getGeometry(w: number, h: number) {
    // On compact mobile Stages 2–3, offset lens gently left of the vertical right Zeiss focus rack
    const cx = this.compact && this.stage >= 2 ? w * 0.44 : w * 0.5;
    const cy = this.compact ? h * 0.49 : h * 0.44;
    const maxR = Math.min(w * 0.28, this.compact ? h * 0.34 : h * 0.31);
    return { cx, cy, maxR };
  }

  private applyFocalFromPointer(px: number, py: number): void {
    const strip = this.focalStrips[0];
    if (!strip) return;
    const magnetTol = 0.065 * this.profile.detentWellScale;
    this.focalDepth = valueFromStripPos(strip, px, py, this.targetFocalDepth, magnetTol);
  }

  protected override onPointerDown(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;

    if (this.stage >= 2 && this.focalStrips.length > 0 && hitVernierStrip(this.focalStrips[0], ev.x, ev.y)) {
      this.dragMode = 'focal';
      this.applyFocalFromPointer(ev.x, ev.y);
      platform.triggerHaptic('vernierTick', 0.45);
      return;
    }

    const { cx, cy } = this.getGeometry(ev.w, ev.h);
    // Deadzone right at (cx, cy) prevents chaotic atan2 jumps
    if (Math.hypot(ev.x - cx, ev.y - cy) < 18) return;

    this.dragMode = 'ring';
    this.lastPointerAngle = Math.atan2(ev.y - cy, ev.x - cx);
    platform.triggerHaptic('vernierTick', 0.45);
  }

  protected override onPointerMove(ev: PointerLocalEvent): void {
    if (!this.dragMode || this.stageClearTimer > 0) return;
    if (this.dragMode === 'focal') {
      this.applyFocalFromPointer(ev.x, ev.y);
      return;
    }

    const { cx, cy } = this.getGeometry(ev.w, ev.h);
    if (Math.hypot(ev.x - cx, ev.y - cy) < 12) return;

    const ang = Math.atan2(ev.y - cy, ev.x - cx);
    const delta = angleDiffRad(ang, this.lastPointerAngle);
    this.lastPointerAngle = ang;

    const active = this.rings[this.stage - 1];
    if (!active) return;
    active.angle = wrapAngleRad(active.angle + delta);

    const diff = angleDiffRad(active.targetAngle, active.angle);
    const pullRadius = 0.13 * this.profile.detentWellScale;
    if (Math.abs(diff) < pullRadius) {
      active.angle = wrapAngleRad(active.angle + diff * 0.18);
    }
  }

  protected override onPointerUp(): void {
    this.dragMode = null;
  }

  protected override onWheel(deltaY: number): boolean {
    if (this.stage < 2 || this.stageClearTimer > 0) return false;
    const step = deltaY > 0 ? -0.028 : 0.028;
    this.focalDepth = clamp(this.focalDepth + step, 0, 1);
    return true;
  }

  protected override onKeyDown(e: KeyboardEvent): void {
    if (this.stageClearTimer > 0) return;
    const active = this.rings[this.stage - 1];
    if (!active) return;
    const angStep = e.shiftKey ? 0.03 : 0.075;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      active.angle = wrapAngleRad(active.angle - angStep);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      active.angle = wrapAngleRad(active.angle + angStep);
    } else if (this.stage >= 2 && e.key === 'ArrowUp') {
      e.preventDefault();
      this.focalDepth = clamp(this.focalDepth + 0.035, 0, 1);
    } else if (this.stage >= 2 && e.key === 'ArrowDown') {
      e.preventDefault();
      this.focalDepth = clamp(this.focalDepth - 0.035, 0, 1);
    }
  }

  protected override onUpdate(dt: number): void {
    const match = this.computeMatch01();
    this.currentMatch = match;
    this.accSum += match;
    this.accCount += 1;

    // Independent snap-chime when Angle OR Focal Depth enters alignment on Stages 2–3
    const angOk = this.isAngleAligned();
    const focOk = this.isFocalAligned();
    if (angOk && !this.wasAngleLocked) {
      this.ctx.audio?.playTumblerClick(0.75, true);
      platform.triggerHaptic('vernierTick', 0.65);
    }
    if (this.stage >= 2 && focOk && !this.wasFocalLocked) {
      this.ctx.audio?.playTumblerClick(0.85, true);
      platform.triggerHaptic('vernierTick', 0.65);
    }
    this.wasAngleLocked = angOk;
    this.wasFocalLocked = focOk;

    this.ctx.audio?.updateBeatSynth({
      beatHz: (1 - match) * 8.6,
      harmonicLock: match,
      warmth: this.profile.harmonicWarmthGain,
      strain: 0,
    });

    this.ctx.showcase?.applyInstrumentPatch({
      progress: clamp((this.stage - 1 + match) / 3, 0, 1),
      unwarpProgress: match,
      seamReveal: this.stage === 3 ? match : (this.stage - 1) * 0.3,
      humanity: this.ctx.state.humanity,
    });

    if (this.stageClearTimer > 0) return;

    if (angOk && focOk) {
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        const { cx, cy } = this.getGeometry(this.width, this.height);
        this.particles.emitPhotonSparks(cx, cy, 5, 48, this.palette.lockHex);
        this.triggerStageClear(
          this.stage === 3 ? 'GRAVITATIONAL LENS DE-WARPED' : `LENS SHELL ${this.stage}/3 LOCKED`,
          this.stage === 3 ? 0 : 0.45,
          cx,
          cy
        );
      }
    } else {
      this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.8);
    }
  }

  protected override onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const match = this.currentMatch;
    const { cx, cy, maxR } = this.getGeometry(w, h);

    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: lerp(9, 2, match),
      alpha: 0.44,
      brightness: 0.78,
      scale: 1.04,
      tintAlpha: 0.52,
      starOpacity: 0.7,
      reticleDuck: { cx, cy, r: maxR * 1.05 },
    });

    const pair = getPlateCanvasPair(this.activePlateId, w, h);
    const focalErr = Math.abs(this.focalDepth - this.targetFocalDepth);
    const zoomScale = 1 + (this.focalDepth - this.targetFocalDepth) * 0.24;
    const landmarks = this.variantCfg.landmarks;

    // Render all 3 concentric adaptive-optics lens shells using 0ms offscreen pair crossfade (ZERO ctx.filter!)
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      const rIn = ring.rInnerFrac * maxR;
      const rOut = ring.rOuterFrac * maxR;
      const isSolved = ring.idx < this.stage - 1;
      const isActive = ring.idx === this.stage - 1;
      const err = isSolved ? 0 : angleDiffRad(ring.angle, ring.targetAngle);
      const blurMix = isSolved
        ? 0
        : isActive
        ? clamp(Math.abs(err) * 0.52 + (this.stage >= 2 ? focalErr * 1.65 : 0), 0, 1)
        : 0.65;

      c2d.save();
      c2d.beginPath();
      c2d.arc(cx, cy, rOut, 0, Math.PI * 2);
      c2d.arc(cx, cy, rIn, 0, Math.PI * 2, true);
      c2d.clip?.();

      c2d.translate(cx, cy);
      // Exact 1.0x angular rotation: seamless 360° wrap, ZERO 72° teleport!
      c2d.rotate(err);
      if (isActive && this.stage >= 2) c2d.scale(zoomScale, zoomScale);
      c2d.translate(-cx, -cy);

      const drawSpan = maxR * 2.24;
      const baseAlpha = isSolved ? 0.96 : isActive ? 0.92 : 0.46;

      if (pair && typeof c2d.drawImage === 'function') {
        const dx = cx - drawSpan * 0.5;
        const dy = cy - drawSpan * 0.5;
        if (blurMix <= 0.03) {
          c2d.globalAlpha = baseAlpha;
          c2d.drawImage(pair.sharp, dx, dy, drawSpan, drawSpan);
        } else if (blurMix >= 0.97) {
          c2d.globalAlpha = baseAlpha;
          c2d.drawImage(pair.blurred, dx, dy, drawSpan, drawSpan);
        } else {
          c2d.globalAlpha = baseAlpha;
          c2d.drawImage(pair.blurred, dx, dy, drawSpan, drawSpan);
          c2d.globalAlpha = baseAlpha * (1 - blurMix);
          c2d.drawImage(pair.sharp, dx, dy, drawSpan, drawSpan);
        }
      } else {
        c2d.fillStyle = isSolved
          ? 'rgba(56, 134, 114, 0.35)'
          : isActive
          ? 'rgba(58, 92, 136, 0.32)'
          : 'rgba(20, 32, 48, 0.35)';
        c2d.fillRect(cx - rOut, cy - rOut, rOut * 2, rOut * 2);
      }

      // Asymmetric, color-distinct lensed galaxy arc filaments + radial caustic bridges
      const rMid = (rIn + rOut) * 0.5;
      for (let l = 0; l < landmarks.length; l++) {
        const lm = landmarks[l];
        const col = isSolved ? this.palette.lockHex : lm.colorHex;
        const lmAlpha = isSolved ? 0.9 : isActive ? 0.85 : 0.28;

        // Tangential curved Einstein galaxy smear along ring midline
        c2d.strokeStyle = col;
        c2d.globalAlpha = lmAlpha * 0.72;
        c2d.lineWidth = isActive ? 2.4 : 1.5;
        c2d.beginPath();
        c2d.arc(cx, cy, rMid, lm.angleRad - lm.arcSpan * 0.5, lm.angleRad + lm.arcSpan * 0.5);
        c2d.stroke();

        // Radial starlight bridge spanning rIn -> rOut so players match across shells cleanly
        c2d.globalAlpha = lmAlpha;
        c2d.lineWidth = isActive ? 2.1 : 1.4;
        c2d.beginPath();
        c2d.moveTo(cx + Math.cos(lm.angleRad) * rIn, cy + Math.sin(lm.angleRad) * rIn);
        c2d.lineTo(cx + Math.cos(lm.angleRad) * rOut, cy + Math.sin(lm.angleRad) * rOut);
        c2d.stroke();

        // Stage 3 chromatic aberration split that converges cleanly as error -> 0
        if (isActive && this.stage === 3 && Math.abs(err) > 0.08) {
          c2d.globalAlpha = clamp(Math.abs(err) * 0.35, 0, 0.38);
          c2d.strokeStyle = '#ff7b66';
          c2d.lineWidth = 1.2;
          const offA = lm.angleRad + err * 0.08;
          c2d.beginPath();
          c2d.moveTo(cx + Math.cos(offA) * rIn, cy + Math.sin(offA) * rIn);
          c2d.lineTo(cx + Math.cos(offA) * rOut, cy + Math.sin(offA) * rOut);
          c2d.stroke();
        }

        // Pinpoint lensed star knot at landmark midpoint
        if (isActive || isSolved) {
          drawOpticalStar(
            c2d,
            cx + Math.cos(lm.angleRad) * rMid,
            cy + Math.sin(lm.angleRad) * rMid,
            isSolved ? 4.2 : 3.6,
            { spectralClass: isSolved ? 'LOCK' : lm.spectral, spikes: 4, alpha: lmAlpha, vibeMode: this.palette.mode }
          );
        }
      }

      // Bokeh dust specks inside active ring sharpening as Focal Depth converges (Stages 2–3)
      if (isActive && this.stage >= 2) {
        for (let b = 0; b < this.bokehAngle.length; b++) {
          const rB = this.bokehRadiusFrac[b] * maxR;
          if (rB < rIn + 4 || rB > rOut - 4) continue;
          const bx = cx + Math.cos(this.bokehAngle[b]) * rB;
          const by = cy + Math.sin(this.bokehAngle[b]) * rB;
          const bokehR = lerp(1.5, 9.5, clamp(focalErr * 2.2, 0, 1));
          if (bokehR > 3.2) {
            c2d.strokeStyle = `rgba(${this.palette.secondaryRgb}, ${(0.28 * (1 - focalErr)).toFixed(3)})`;
            c2d.lineWidth = 1.1;
            c2d.beginPath();
            c2d.arc(bx, by, bokehR, 0, Math.PI * 2);
            c2d.stroke();
          } else {
            drawOpticalStar(c2d, bx, by, 2.2, {
              spectralClass: 'A',
              spikes: 0,
              alpha: 0.72,
              vibeMode: this.palette.mode,
            });
          }
        }
      }

      c2d.restore();

      // Clean Zeiss bezel outlines + tactile knurled grip ticks on active shell
      const angOk = isActive && this.isAngleAligned();
      const ringCol = isSolved
        ? this.palette.lockHex
        : isActive
        ? angOk
          ? this.palette.lockHex
          : this.palette.accentHex
        : 'rgba(186, 214, 240, 0.22)';
      c2d.save();
      c2d.strokeStyle = ringCol;
      c2d.lineWidth = isActive ? 2.2 : isSolved ? 1.6 : 1;
      c2d.beginPath();
      c2d.arc(cx, cy, rOut, 0, Math.PI * 2);
      c2d.stroke();

      if (isActive) {
        // Subtle tactile knurled bezel ticks communicating rotatable optical barrel
        c2d.strokeStyle = ringCol;
        c2d.globalAlpha = 0.45;
        c2d.lineWidth = 1.1;
        c2d.beginPath();
        for (let t = 0; t < 24; t++) {
          const ta = err + (t / 24) * Math.PI * 2;
          const len = t % 3 === 0 ? 5.5 : 3;
          c2d.moveTo(cx + Math.cos(ta) * (rOut - len), cy + Math.sin(ta) * (rOut - len));
          c2d.lineTo(cx + Math.cos(ta) * rOut, cy + Math.sin(ta) * rOut);
        }
        c2d.stroke();
      }
      c2d.restore();
    }

    // Matching asymmetric outer bezel index markers (color-coded to each lensed arc!)
    c2d.save();
    for (let l = 0; l < landmarks.length; l++) {
      const lm = landmarks[l];
      c2d.strokeStyle = lm.colorHex;
      c2d.globalAlpha = 0.75;
      c2d.lineWidth = 2.2;
      c2d.beginPath();
      c2d.moveTo(cx + Math.cos(lm.angleRad) * (maxR * 1.005), cy + Math.sin(lm.angleRad) * (maxR * 1.005));
      c2d.lineTo(cx + Math.cos(lm.angleRad) * (maxR * 1.065), cy + Math.sin(lm.angleRad) * (maxR * 1.065));
      c2d.stroke();
    }
    c2d.restore();

    // Inner aperture core: reveals crisp 93-BLY hexagonal enclosure seam on Stage 3 (or calibrated reticle)
    const coreR = (this.rings[2]?.rInnerFrac ?? 0.2) * maxR - 2;
    c2d.save();
    c2d.beginPath();
    c2d.arc(cx, cy, coreR, 0, Math.PI * 2);
    c2d.clip?.();
    c2d.fillStyle = 'rgba(4, 10, 18, 0.78)';
    c2d.fillRect(cx - coreR, cy - coreR, coreR * 2, coreR * 2);

    const coreCol = match > 0.85 ? this.palette.lockHex : this.palette.secondaryHex;
    c2d.strokeStyle = coreCol;
    c2d.globalAlpha = 0.24 + match * 0.65;
    c2d.lineWidth = 1;

    if (this.variantCfg.hexSeamCore && this.stage === 3) {
      // 93-BLY hexagonal enclosure lattice emerging inside core
      const hexR = Math.max(8, coreR * 0.56);
      c2d.beginPath();
      for (let side = 0; side <= 6; side++) {
        const a = (side * Math.PI) / 3 - Math.PI / 6;
        const hx = cx + Math.cos(a) * hexR;
        const hy = cy + Math.sin(a) * hexR;
        if (side === 0) c2d.moveTo(hx, hy);
        else c2d.lineTo(hx, hy);
      }
      c2d.stroke();
    }
    c2d.beginPath();
    for (let g = -coreR; g <= coreR; g += Math.max(10, coreR * 0.42)) {
      c2d.moveTo(cx + g, cy - coreR);
      c2d.lineTo(cx + g, cy + coreR);
      c2d.moveTo(cx - coreR, cy + g);
      c2d.lineTo(cx + coreR, cy + g);
    }
    c2d.stroke();
    c2d.restore();

    // Lock progress rendered directly ON the active outer bezel rim (ZERO collision on 844x390!)
    if (this.lockHoldSec > 0.02) {
      const p = clamp(this.lockHoldSec / this.lockHoldTargetSec, 0, 1);
      const activeR = (this.rings[this.stage - 1]?.rOuterFrac ?? 0.98) * maxR;
      const startA = -Math.PI * 0.5;
      drawGlowStroke(
        c2d,
        (ctx) => {
          ctx.arc(cx, cy, activeR + 3, startA, startA + Math.PI * 2 * p);
        },
        this.palette.lockHex,
        2.8,
        { outerWidthMul: 3.0, outerAlpha: 0.3, coreAlpha: 0.96, lineCap: 'round' }
      );
      c2d.save();
      c2d.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = this.palette.lockHex;
      c2d.textAlign = 'center';
      c2d.fillText(`FOCUSING ${Math.round(p * 100)}%`, cx, cy + 3);
      c2d.restore();
    }

    // Subtle astrophysical Einstein radius + Cold numeric deltas header
    c2d.save();
    c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = `rgba(${this.palette.secondaryRgb}, 0.72)`;
    c2d.textAlign = 'left';
    c2d.fillText(this.variantCfg.shearTag, w * 0.06, this.compact ? 58 : 76);

    if (this.profile.showNumericDeltas) {
      const active = this.rings[this.stage - 1];
      const deg = active ? Math.round((Math.abs(angleDiffRad(active.angle, active.targetAngle)) * 180) / Math.PI) : 0;
      const deltaUm = ((this.focalDepth - this.targetFocalDepth) * 80).toFixed(1);
      c2d.fillStyle = this.isStageAligned() ? this.palette.lockHex : this.palette.accentHex;
      c2d.fillText(
        this.stage >= 2 ? `Δθ ${deg}° · Δz ${Number(deltaUm) >= 0 ? '+' : ''}${deltaUm} μm` : `Δθ ${deg}°`,
        w * 0.06,
        this.compact ? 72 : 92
      );
    }
    c2d.restore();

    // Focal Depth Vernier in Stages 2 & 3:
    // Compact mobile (844x390) = sleek vertical right-side Zeiss rack (ZERO HUD overlap!)
    // Desktop = clean horizontal bottom hairline vernier
    if (this.stage >= 2) {
      const pistonUm = (this.focalDepth - 0.5) * 80;
      const rightText = `${pistonUm >= 0 ? '+' : ''}${pistonUm.toFixed(0)} μm`;
      const locked = this.isFocalAligned();
      if (this.focalInputs[0]) {
        this.focalInputs[0].val01 = this.focalDepth;
        this.focalInputs[0].locked = locked;
        this.focalInputs[0].rightText = rightText;
        this.focalInputs[0].label = this.compact ? 'FOCUS' : 'FOCAL PISTON Δz';
      } else {
        this.focalInputs[0] = {
          key: 'focal',
          label: this.compact ? 'FOCUS' : 'FOCAL PISTON Δz',
          val01: this.focalDepth,
          locked,
          rightText,
        };
      }
      this.focalInputs.length = 1;

      if (this.compact) {
        layoutVerticalVernierRackInto(this.focalStrips, w, h, this.focalInputs, 'right');
      } else {
        layoutVernierRowInto(this.focalStrips, w, h, this.focalInputs, h - 98);
      }
      drawVernierStrip(c2d, this.focalStrips[0], this.palette.accentHex, this.palette.lockHex);
    } else {
      this.focalStrips.length = 0;
    }

    this.drawSharedOverlays(c2d, w, h);
  }

  protected override getStageProgress01(): number {
    return clamp((this.stage - 1 + this.currentMatch) / 3, 0, 1);
  }

  protected override getPromptText(): string {
    if (this.stage === 1) {
      return 'Twist the outer phase shell so each colored lensed arc bridges its matching rim tick.';
    }
    if (this.stage === 2) {
      return this.compact
        ? 'Rotate the middle shell AND slide the right FOCUS rack until bokeh specks snap sharp.'
        : 'Rotate the middle shell AND tune FOCAL PISTON below until bokeh specks snap sharp.';
    }
    return this.variantCfg.hexSeamCore
      ? 'Align the inner shell & FOCAL PISTON to resolve the 93-BLY hexagonal horizon lattice.'
      : 'Align the inner shell & FOCAL PISTON to sharpen the central Einstein caustic core.';
  }

  protected override solveCurrentStage(stage: 1 | 2 | 3): void {
    const ring = this.rings[stage - 1];
    if (ring) {
      ring.angle = ring.targetAngle;
    }
    this.focalDepth = this.targetFocalDepth;
    this.currentMatch = this.computeMatch01();
  }

  protected override verifySolved(_stage: 1 | 2 | 3): boolean {
    return this.isStageAligned();
  }

  protected override onAllStagesCleared(): void {
    const avgAcc = clamp(this.accCount > 0 ? this.accSum / this.accCount : 0.94, 0.74, 1.0);
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.finishSuccess({
      accuracy: avgAcc,
      proofFragmentSuffix: 'lens',
      dossierSnippet: `All 3 concentric gravitational lens shells & secondary-mirror piston calibrated (${this.variantCfg.shearTag}) on ${this.ctx.targetName}.`,
      telemetrySummary: `${this.activeVariant?.label ?? 'Lens'} · Clarity ${(avgAcc * 100).toFixed(0)}% · ${totalSec.toFixed(1)}s`,
      physicalPrinciple: 'Gravitational Lensing Tangential Shear & Adaptive-Optics Focal Piston Calibration',
    });
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Foreground galaxy clusters warp distant starlight along asymmetric Einstein arcs; adaptive-optics phase plates correct tangential shear while secondary-mirror piston (Δz μm) removes defocus.',
      goalSummary:
        'Unlock Outer → Middle (+ Focal Piston) → Inner (+ Focal Piston) by bridging the color-distinct lensed arcs to their outer bezel markers.',
      controlsDesktop: 'Drag radially around the lens to twist the active shell; drag FOCAL PISTON, scroll wheel, or press Arrow keys.',
      controlsTouch: 'Twist around the lens ring to rotate; slide the side FOCUS rack on Stages 2–3.',
      warmthEffect: 'Warm H% gives forgiving amber bezel detents; Cold H% tightens tolerances and shows exact Δθ° / Δz μm readouts.',
    };
  }
}
