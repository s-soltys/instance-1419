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
import { drawInclinedAstrometryRing } from '../render/OpticalDrawUtils';
import { drawLimbDarkenedStar, drawOpticalStar } from '../render/StarPSFAtlas';
import { angleDiffRad, clamp, lerp } from '../tactilePhysics';
import type {
  CosmicPlateId,
  InstrumentFieldGuide,
  MinigameVariantSpec,
  SpectralClass,
} from '../types';

type CompanionClass = 'white_dwarf' | 'neutron_star' | 'black_hole';

interface BinaryScenarioConfig {
  primaryMassSolar: number;
  primaryClass: SpectralClass;
  companionClass: CompanionClass;
  companionShortTag: string;
  companionTitle: string;
  massMinSolar: number;
  massMaxSolar: number;
  stage1CompanionMassSolar: number;
  inclinationY: number; // 1.0 = face-on circular, <1 = subtle 2.5D tilted orbital plane
}

const BIN_PLATES: readonly [CosmicPlateId, CosmicPlateId, CosmicPlateId] = [
  'southern_ring',
  'whirlpool',
  'sombrero',
];

const BIN_VARIANTS: readonly MinigameVariantSpec[] = [
  { index: 0, id: 'binary_mass_scale_v1', label: 'Southern Ring Binary', plateId: 'southern_ring' },
  { index: 1, id: 'binary_mass_scale_v2', label: 'M51a/b Tidal Pair', plateId: 'whirlpool' },
  { index: 2, id: 'binary_mass_scale_v3', label: 'Compact Dark Companion', plateId: 'sombrero' },
  { index: 3, id: 'binary_mass_scale_v4', label: 'High-Ratio Red Dwarf', plateId: 'southern_ring' },
];

/**
 * Astrophysically accurate compact-object mass regimes:
 * - White Dwarf: < 1.4 M☉ (Chandrasekhar limit)
 * - Neutron Star: 1.4 – 2.3 M☉ (below TOV limit)
 * - Stellar Black Hole: >= 3.0 M☉ (above TOV limit!)
 */
const SCENARIOS: readonly BinaryScenarioConfig[] = [
  {
    primaryMassSolar: 1.6,
    primaryClass: 'A',
    companionClass: 'white_dwarf',
    companionShortTag: 'WD',
    companionTitle: 'WHITE DWARF',
    massMinSolar: 0.55,
    massMaxSolar: 1.35,
    stage1CompanionMassSolar: 1.15,
    inclinationY: 1.0,
  },
  {
    primaryMassSolar: 1.2,
    primaryClass: 'G',
    companionClass: 'neutron_star',
    companionShortTag: 'NS',
    companionTitle: 'NEUTRON STAR',
    massMinSolar: 1.4,
    massMaxSolar: 2.25,
    stage1CompanionMassSolar: 1.85,
    inclinationY: 0.94,
  },
  {
    primaryMassSolar: 3.0,
    primaryClass: 'B',
    companionClass: 'black_hole',
    companionShortTag: 'BH',
    companionTitle: 'BLACK HOLE',
    massMinSolar: 3.5,
    massMaxSolar: 8.5,
    stage1CompanionMassSolar: 5.5,
    inclinationY: 1.0,
  },
  {
    primaryMassSolar: 0.55,
    primaryClass: 'M',
    companionClass: 'black_hole',
    companionShortTag: 'BH',
    companionTitle: 'DARK REMNANT',
    massMinSolar: 3.0,
    massMaxSolar: 5.5,
    stage1CompanionMassSolar: 3.6,
    inclinationY: 0.82,
  },
];

const R2_AU_MIN = 0.38;
const R2_AU_MAX = 1.0;

/**
 * BIN-14 — Binary Star Mass Scale (Cosmic Barycenter Seesaw)
 * Strictly obeys exact barycenter equilibrium m₁·r₁ = m₂·r₂ (zero clamping saturation!)
 * and true Kepler's Third Law ω ∝ √((M₁ + M₂) / (r₁ + r₂)³), across accurate compact-object
 * classes (White Dwarf, Neutron Star, Stellar Black Hole) with smooth cadence phase-coupling.
 */
export class BinaryMassScaleGame extends BaseCosmicMinigame {
  readonly id = 'binary_mass_scale';
  readonly title = 'BINARY STAR MASS SCALE';
  readonly subtitle = 'Cosmic Barycenter Seesaw';
  readonly instrumentCode = 'BIN-14';
  readonly platePool = BIN_PLATES;
  readonly variants = BIN_VARIANTS;

  private scenario: BinaryScenarioConfig = SCENARIOS[0];
  private targetDist = 0.55;
  private targetMass = 0.65;
  private userDist = 0.2;
  private userMass = 0.65;

  private phaseUser = 0;
  private phaseTarget = 0;
  private dragMode: 'companion' | 'dist' | 'mass' | null = null;
  private cachedMatch = 0;
  private lastSparkAt = -10;

  private readonly vernierItems: VernierItemInput[] = [];
  private readonly strips: VernierStripSpec[] = [];

  protected override onMount(): void {
    this.scenario = SCENARIOS[this.iterationIndex % SCENARIOS.length];
    this.lockHoldTargetSec = 0.88;
  }

  protected onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.scenario = SCENARIOS[this.iterationIndex % SCENARIOS.length];
    this.dragMode = null;

    this.targetDist = stage === 1 ? 0.44 + rng() * 0.34 : 0.28 + rng() * 0.52;
    const stage1M01 = clamp(
      (this.scenario.stage1CompanionMassSolar - this.scenario.massMinSolar) /
        Math.max(0.01, this.scenario.massMaxSolar - this.scenario.massMinSolar),
      0.15,
      0.85
    );
    this.targetMass = stage === 1 ? stage1M01 : 0.22 + rng() * 0.58;

    this.userDist = stage === 2 ? this.targetDist : this.targetDist > 0.5 ? 0.14 : 0.86;
    this.userMass = stage === 1 ? this.targetMass : this.targetMass > 0.5 ? 0.16 : 0.86;
    this.phaseUser = rng() * Math.PI * 2;
    this.phaseTarget = this.phaseUser + 0.6;
    this.cachedMatch = this.computeMatch01();
  }

  private getCompanionMassSolar(mass01: number): number {
    return lerp(this.scenario.massMinSolar, this.scenario.massMaxSolar, clamp(mass01, 0, 1));
  }

  private getR2AU(dist01: number): number {
    return lerp(R2_AU_MIN, R2_AU_MAX, clamp(dist01, 0, 1));
  }

  /**
   * Exact barycenter lever-arm law: m₁ * r₁ = m₂ * r₂  =>  r₁ = (m₂ / m₁) * r₂.
   * ZERO arbitrary fudge factors and ZERO clamping freeze!
   */
  private getR1AU(dist01: number, mass01: number): number {
    const m2 = this.getCompanionMassSolar(mass01);
    const r2 = this.getR2AU(dist01);
    return (m2 / this.scenario.primaryMassSolar) * r2;
  }

  /**
   * Maps AU distances to screen pixels so even maximum (dist01=1, mass01=1) NEVER clamps or clips HUD!
   */
  private getDisplayScale(w: number, h: number) {
    const compact = h < 450;
    const scale = Math.min(w, h);
    const maxDisplayFrac = compact ? 0.23 : 0.27;
    const maxRatio = Math.max(1.0, this.scenario.massMaxSolar / this.scenario.primaryMassSolar);
    const maxPossibleAU = maxRatio * R2_AU_MAX;
    const pxPerAU = (maxDisplayFrac * scale) / maxPossibleAU;
    return {
      cx: w * 0.5,
      cy: compact ? h * 0.43 : h * 0.445,
      scale,
      pxPerAU,
      inclY: this.scenario.inclinationY,
      compact,
    };
  }

  /**
   * Authentic Kepler's Third Law: ω = k * √((M₁ + M₂) / (r₁ + r₂)³).
   */
  private computeKeplerOmega(dist01: number, mass01: number): number {
    const m1 = this.scenario.primaryMassSolar;
    const m2 = this.getCompanionMassSolar(mass01);
    const aAU = this.getR1AU(dist01, mass01) + this.getR2AU(dist01);
    const refA = (this.scenario.massMinSolar / m1 + 1) * 0.72;
    const refM = m1 + (this.scenario.massMinSolar + this.scenario.massMaxSolar) * 0.5;
    const normOmega = Math.sqrt(((m1 + m2) / refM) * Math.pow(refA / Math.max(0.25, aAU), 3));
    return clamp(1.35 * normOmega, 0.55, 2.85);
  }

  private computeOrbitalPeriodDays(dist01: number, mass01: number): number {
    const mTot = this.scenario.primaryMassSolar + this.getCompanionMassSolar(mass01);
    const aAU = this.getR1AU(dist01, mass01) + this.getR2AU(dist01);
    // P_yr = sqrt(a^3 / M_tot) => days
    return Math.sqrt((aAU * aAU * aAU) / Math.max(0.2, mTot)) * 365.25;
  }

  private computeMatch01(): number {
    const dErr = this.stage === 2 ? 0 : Math.abs(this.userDist - this.targetDist);
    const mErr = this.stage === 1 ? 0 : Math.abs(this.userMass - this.targetMass);
    const r1U = this.getR1AU(this.userDist, this.userMass);
    const r1T = this.getR1AU(this.targetDist, this.targetMass);
    const maxR1 = (this.scenario.massMaxSolar / this.scenario.primaryMassSolar) * R2_AU_MAX;
    const rErrNorm = Math.abs(r1U - r1T) / Math.max(0.2, maxR1);

    const count = this.stage === 3 ? 3 : 2;
    const avg = (dErr + mErr + rErrNorm * 1.6) / count;
    return clamp(1 - avg / 0.25, 0, 1);
  }

  private getLockThreshold(): number {
    return this.palette.mode === 'warm' ? 0.84 : this.palette.mode === 'cold' ? 0.90 : 0.87;
  }

  private dist01FromPointer(px: number, py: number): number {
    const { cx, cy, pxPerAU, inclY } = this.getDisplayScale(this.width, this.height);
    const rPx = Math.hypot(px - cx, (py - cy) / Math.max(0.4, inclY));
    const rAU = rPx / Math.max(1, pxPerAU);
    let nextD = clamp((rAU - R2_AU_MIN) / (R2_AU_MAX - R2_AU_MIN), 0, 1);
    const magRad = 0.06 * this.profile.detentWellScale;
    if (Math.abs(nextD - this.targetDist) < magRad) {
      nextD = lerp(nextD, this.targetDist, 0.45);
    }
    return nextD;
  }

  protected override onPointerDown(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;
    const { x: px, y: py } = ev;

    for (let i = 0; i < this.strips.length; i++) {
      const s = this.strips[i];
      if (hitVernierStrip(s, px, py)) {
        this.dragMode = s.key as 'dist' | 'mass';
        const targ = s.key === 'dist' ? this.targetDist : this.targetMass;
        const v = valueFromStripX(s, px, targ, 0.055 * this.profile.detentWellScale);
        if (s.key === 'dist') this.userDist = v;
        if (s.key === 'mass') this.userMass = v;
        platform.triggerHaptic('vernierTick', 0.45);
        return;
      }
    }

    if (this.stage !== 2) {
      this.dragMode = 'companion';
      this.userDist = this.dist01FromPointer(px, py);
      platform.triggerHaptic('vernierTick', 0.45);
    }
  }

  protected override onPointerMove(ev: PointerLocalEvent): void {
    if (!this.dragMode || this.stageClearTimer > 0) return;
    if (this.dragMode === 'companion') {
      this.userDist = this.dist01FromPointer(ev.x, ev.y);
    } else {
      for (let i = 0; i < this.strips.length; i++) {
        const s = this.strips[i];
        if (s.key === this.dragMode) {
          const targ = s.key === 'dist' ? this.targetDist : this.targetMass;
          const v = valueFromStripX(s, ev.x, targ, 0.055 * this.profile.detentWellScale);
          if (s.key === 'dist') this.userDist = v;
          if (s.key === 'mass') this.userMass = v;
          break;
        }
      }
    }
  }

  protected override onPointerUp(): void {
    this.dragMode = null;
  }

  protected override onKeyDown(e: KeyboardEvent): void {
    if (this.stageClearTimer > 0) return;
    const step = e.shiftKey ? 0.055 : 0.025;
    if (this.stage >= 2 && e.key === 'ArrowLeft') {
      e.preventDefault();
      this.userMass = clamp(this.userMass - step, 0, 1);
    } else if (this.stage >= 2 && e.key === 'ArrowRight') {
      e.preventDefault();
      this.userMass = clamp(this.userMass + step, 0, 1);
    } else if (this.stage !== 2 && e.key === 'ArrowUp') {
      e.preventDefault();
      this.userDist = clamp(this.userDist + step, 0, 1);
    } else if (this.stage !== 2 && e.key === 'ArrowDown') {
      e.preventDefault();
      this.userDist = clamp(this.userDist - step, 0, 1);
    }
  }

  protected onUpdate(dt: number): void {
    const omegaUser = this.computeKeplerOmega(this.userDist, this.userMass);
    const omegaTarget = this.computeKeplerOmega(this.targetDist, this.targetMass);
    this.phaseUser += dt * omegaUser;
    this.phaseTarget += dt * omegaTarget;

    // Gentle phase-lock coupling when orbital cadence matches -> star smoothly glides inside hollow ghost ring!
    const omegaDiff = Math.abs(omegaUser - omegaTarget);
    if (omegaDiff < 0.22) {
      const pullStrength = clamp(1 - omegaDiff / 0.22, 0, 1) * 4.5;
      this.phaseUser += angleDiffRad(this.phaseTarget, this.phaseUser) * clamp(dt * pullStrength, 0, 0.5);
    }

    const match = this.computeMatch01();
    this.cachedMatch = match;

    this.ctx.audio?.updateBeatSynth({
      beatHz: clamp(omegaDiff * 3.8 + (1 - match) * 4.5, 0, 12),
      harmonicLock: match,
      warmth: this.profile.harmonicWarmthGain,
      strain: 0,
    });

    if (match > 0.8 && this.elapsedSec - this.lastSparkAt > 0.34) {
      this.lastSparkAt = this.elapsedSec;
      const g = this.getDisplayScale(this.width, this.height);
      this.particles.emitPhotonSparks(g.cx, g.cy, 2, 26, this.palette.lockHex);
    }

    if (this.stageClearTimer > 0) return;

    if (match >= this.getLockThreshold()) {
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        const g = this.getDisplayScale(this.width, this.height);
        this.triggerStageClear(
          `BARYCENTER ${this.stage}/${this.maxStages} WEIGHED`,
          this.stage < 3 ? 0.58 : 0.42,
          g.cx,
          g.cy
        );
      }
    } else {
      this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.6);
    }
  }

  private drawOrbitEllipse(
    c2d: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rPx: number,
    inclY: number
  ): void {
    c2d.beginPath();
    if (Math.abs(inclY - 1) > 0.01 && typeof c2d.ellipse === 'function') {
      c2d.ellipse(cx, cy, rPx, rPx * inclY, 0, 0, Math.PI * 2);
    } else {
      c2d.arc(cx, cy, rPx, 0, Math.PI * 2);
    }
    c2d.stroke();
  }

  protected onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const g = this.getDisplayScale(w, h);
    const match = this.cachedMatch;
    const lockedNow = match >= this.getLockThreshold();

    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: 4,
      alpha: 0.44,
      brightness: 0.78,
      tintAlpha: 0.46,
      reticleDuck: { cx: g.cx, cy: g.cy, r: g.scale * 0.25 },
    });

    const r1TPx = this.getR1AU(this.targetDist, this.targetMass) * g.pxPerAU;
    const r1UPx = this.getR1AU(this.userDist, this.userMass) * g.pxPerAU;
    const r2TPx = this.getR2AU(this.targetDist) * g.pxPerAU;
    const r2UPx = this.getR2AU(this.userDist) * g.pxPerAU;
    const m2Solar = this.getCompanionMassSolar(this.userMass);
    const m1Solar = this.scenario.primaryMassSolar;

    // Subtle 2.5D ecliptic astrometry ring frame
    drawInclinedAstrometryRing(
      c2d,
      g.cx,
      g.cy,
      Math.max(r1TPx, r2TPx, r1UPx, r2UPx) + 16,
      (Math.max(r1TPx, r2TPx, r1UPx, r2UPx) + 16) * g.inclY,
      0,
      this.palette.secondaryRgb,
      { backAlpha: 0.06, frontAlpha: 0.14, ticks: 8 }
    );

    // Stage 2–3 Observed Dark Companion Track (dashed violet lensing ring)
    if (this.stage >= 2) {
      c2d.save();
      c2d.strokeStyle = 'rgba(176, 152, 255, 0.36)';
      c2d.setLineDash?.([4, 6]);
      c2d.lineWidth = 1.4;
      this.drawOrbitEllipse(c2d, g.cx, g.cy, r2TPx, g.inclY);
      c2d.restore();
    }

    // Observed Primary Star Wobble Orbit (dashed white) + Hollow Ghost Cadence Star & Trail
    c2d.save();
    c2d.strokeStyle = 'rgba(245, 248, 255, 0.48)';
    c2d.setLineDash?.([5, 5]);
    c2d.lineWidth = 1.8;
    this.drawOrbitEllipse(c2d, g.cx, g.cy, r1TPx, g.inclY);

    if (this.stage >= 2) {
      c2d.setLineDash?.([]);
      // Ghost star cadence arc trail (6 short tapered polyline segments — supports inclined ellipses!)
      c2d.strokeStyle = 'rgba(255, 224, 148, 0.36)';
      c2d.lineWidth = 2.6;
      c2d.beginPath();
      for (let k = 0; k <= 10; k++) {
        const a = this.phaseTarget - 0.52 + (k / 10) * 0.52;
        const tx = g.cx + Math.cos(a) * r1TPx;
        const ty = g.cy + Math.sin(a) * r1TPx * g.inclY;
        if (k === 0) c2d.moveTo(tx, ty);
        else c2d.lineTo(tx, ty);
      }
      c2d.stroke();

      const gx = g.cx + Math.cos(this.phaseTarget) * r1TPx;
      const gy = g.cy + Math.sin(this.phaseTarget) * r1TPx * g.inclY;
      c2d.strokeStyle = 'rgba(255, 232, 165, 0.88)';
      c2d.lineWidth = 1.8;
      c2d.beginPath();
      c2d.arc(gx, gy, 7.5, 0, Math.PI * 2);
      c2d.stroke();
    }

    // User Model Wobble Orbit
    c2d.setLineDash?.([]);
    c2d.strokeStyle = lockedNow ? this.palette.lockHex : this.palette.accentHex;
    c2d.lineWidth = 2.1;
    this.drawOrbitEllipse(c2d, g.cx, g.cy, r1UPx, g.inclY);
    c2d.restore();

    const ux = Math.cos(this.phaseUser);
    const uy = Math.sin(this.phaseUser);
    const starX = g.cx + ux * r1UPx;
    const starY = g.cy + uy * r1UPx * g.inclY;
    const compX = g.cx - ux * r2UPx;
    const compY = g.cy - uy * r2UPx * g.inclY;

    // Tapered orbital wake ribbon behind primary star (Warm H% luminous wake; Cold H% crisp hairline)
    c2d.save();
    c2d.strokeStyle = lockedNow
      ? `rgba(${this.palette.lockRgb}, 0.36)`
      : `rgba(${this.palette.accentRgb}, ${this.palette.mode === 'warm' ? 0.32 : 0.18})`;
    c2d.lineWidth = this.palette.mode === 'warm' ? 2.4 : 1.3;
    c2d.beginPath();
    for (let k = 0; k <= 10; k++) {
      const a = this.phaseUser - 0.55 + (k / 10) * 0.55;
      const wx = g.cx + Math.cos(a) * r1UPx;
      const wy = g.cy + Math.sin(a) * r1UPx * g.inclY;
      if (k === 0) c2d.moveTo(wx, wy);
      else c2d.lineTo(wx, wy);
    }
    c2d.stroke();
    c2d.restore();

    // Astrometric Seesaw Lever Arm — STOPS CLEANLY OUTSIDE BOTH BODY HALOS (never stabs star cores!)
    const starCoreR = g.compact ? 8.5 : 11;
    const compCoreR = this.stage === 1 ? (g.compact ? 7 : 9) : lerp(7.5, 16.5, this.userMass);
    const dxLine = starX - compX;
    const dyLine = starY - compY;
    const distBodies = Math.max(1, Math.hypot(dxLine, dyLine));
    const nxL = dxLine / distBodies;
    const nyL = dyLine / distBodies;
    const armStartX = compX + nxL * (compCoreR + 7);
    const armStartY = compY + nyL * (compCoreR + 7);
    const armEndX = starX - nxL * (starCoreR + 7);
    const armEndY = starY - nyL * (starCoreR + 7);

    c2d.save();
    if (distBodies > starCoreR + compCoreR + 18) {
      c2d.strokeStyle = lockedNow ? this.palette.lockHex : this.palette.accentHex;
      c2d.globalAlpha = 0.62;
      c2d.lineWidth = 1.6;
      c2d.setLineDash?.([4, 4]);
      c2d.beginPath();
      c2d.moveTo(armStartX, armStartY);
      c2d.lineTo(armEndX, armEndY);
      c2d.stroke();
      c2d.setLineDash?.([]);
    }

    // Central Barycenter Fulcrum + Crosshair
    c2d.globalAlpha = 0.92;
    c2d.fillStyle = this.palette.secondaryHex;
    c2d.beginPath();
    c2d.moveTo(g.cx, g.cy - 5.5);
    c2d.lineTo(g.cx - 4.5, g.cy + 4.5);
    c2d.lineTo(g.cx + 4.5, g.cy + 4.5);
    c2d.closePath();
    c2d.fill();
    c2d.restore();

    // Primary Star (Eddington limb-darkened photosphere + restrained PSF)
    drawOpticalStar(c2d, starX, starY, starCoreR * 0.65, {
      spectralClass: this.scenario.primaryClass,
      spikes: 6,
      alpha: 0.72,
      vibeMode: this.palette.mode,
      timeSec: this.elapsedSec,
    });
    drawLimbDarkenedStar(c2d, starX, starY, starCoreR, this.scenario.primaryClass, 0.98);

    // Companion Body (Stage 1 visible star; Stage 2–3 accurate White Dwarf / Neutron Star / Black Hole!)
    if (this.stage === 1) {
      drawOpticalStar(c2d, compX, compY, compCoreR * 0.75, {
        spectralClass: 'O',
        spikes: 4,
        alpha: 0.85,
        vibeMode: this.palette.mode,
      });
      drawLimbDarkenedStar(c2d, compX, compY, compCoreR * 0.85, 'B', 0.95);
      c2d.save();
      c2d.strokeStyle = 'rgba(158, 232, 255, 0.55)';
      c2d.setLineDash?.([3, 3]);
      c2d.lineWidth = 1.2;
      c2d.beginPath();
      c2d.arc(compX, compY, compCoreR + 8, 0, Math.PI * 2);
      c2d.stroke();
      c2d.restore();
    } else {
      const massOk = Math.abs(this.userMass - this.targetMass) <= this.getParamTol();
      const rimCol = massOk ? this.palette.lockHex : '#b9a2ff';
      c2d.save();
      if (this.scenario.companionClass === 'black_hole') {
        // Crisp gravitational-lensing photon crescent + matte event-horizon shadow (ZERO per-frame gradient!)
        c2d.strokeStyle = 'rgba(185, 162, 255, 0.28)';
        c2d.lineWidth = 4.2;
        c2d.beginPath();
        c2d.arc(compX, compY, compCoreR + 2.5, 0, Math.PI * 2);
        c2d.stroke();

        c2d.fillStyle = '#03050a';
        c2d.strokeStyle = rimCol;
        c2d.lineWidth = 1.9;
        c2d.beginPath();
        c2d.arc(compX, compY, compCoreR, 0, Math.PI * 2);
        c2d.fill();
        c2d.stroke();

        // Relativistic Doppler-beamed bright lensing crescent on leading orbital limb
        c2d.strokeStyle = '#e8f4ff';
        c2d.lineWidth = 2.0;
        c2d.beginPath();
        c2d.arc(compX, compY, compCoreR + 1.5, this.phaseUser + 0.6, this.phaseUser + 2.1);
        c2d.stroke();
      } else if (this.scenario.companionClass === 'neutron_star') {
        // Compact magnetized neutron star + delicate rotating polar pulsar jet wisps
        const jetA = this.elapsedSec * 2.8;
        c2d.strokeStyle = `rgba(158, 232, 255, 0.45)`;
        c2d.lineWidth = 1.5;
        c2d.beginPath();
        c2d.moveTo(compX - Math.cos(jetA) * (compCoreR + 14), compY - Math.sin(jetA) * (compCoreR + 14));
        c2d.lineTo(compX + Math.cos(jetA) * (compCoreR + 14), compY + Math.sin(jetA) * (compCoreR + 14));
        c2d.stroke();
        drawOpticalStar(c2d, compX, compY, 5.5, {
          spectralClass: massOk ? 'LOCK' : 'O',
          spikes: 4,
          alpha: 0.92,
        });
        c2d.strokeStyle = rimCol;
        c2d.lineWidth = 1.4;
        c2d.beginPath();
        c2d.arc(compX, compY, compCoreR * 0.62, 0, Math.PI * 2);
        c2d.stroke();
      } else {
        // Ultra-dense hot White Dwarf compact core
        drawOpticalStar(c2d, compX, compY, 5.2, {
          spectralClass: massOk ? 'LOCK' : 'A',
          spikes: 4,
          alpha: 0.94,
        });
        c2d.strokeStyle = rimCol;
        c2d.lineWidth = 1.4;
        c2d.beginPath();
        c2d.arc(compX, compY, compCoreR * 0.65, 0, Math.PI * 2);
        c2d.stroke();
      }
      c2d.restore();
    }

    // Crisp Mass Labels positioned safely away from star spikes & HUD edges!
    const labelOffStar = starCoreR + 16;
    const labelOffComp = compCoreR + 18;
    const starLabX = clamp(starX + ux * labelOffStar, 44, w - 44);
    const starLabY = clamp(starY + uy * labelOffStar * g.inclY, g.compact ? 56 : 70, g.compact ? h - 102 : h - 122);
    const compLabX = clamp(compX - ux * labelOffComp, 48, w - 48);
    const compLabY = clamp(compY - uy * labelOffComp * g.inclY, g.compact ? 56 : 70, g.compact ? h - 102 : h - 122);

    c2d.save();
    c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = this.palette.secondaryHex;
    c2d.textAlign = 'center';
    c2d.fillText(`${m1Solar.toFixed(1)} M☉`, starLabX, starLabY);
    c2d.fillStyle = this.stage === 1 ? '#9ee8ff' : '#d2c2ff';
    c2d.fillText(`${m2Solar.toFixed(2)} M☉ ${this.stage === 1 ? '' : this.scenario.companionShortTag}`.trim(), compLabX, compLabY);

    // Top telemetry readout: true Keplerian period & Cold H% torque balance equation (m₁r₁ = m₂r₂)
    const pDays = this.computeOrbitalPeriodDays(this.userDist, this.userMass);
    const r1AU = this.getR1AU(this.userDist, this.userMass);
    const r2AU = this.getR2AU(this.userDist);
    const omegaUser = this.computeKeplerOmega(this.userDist, this.userMass);
    const omegaTarget = this.computeKeplerOmega(this.targetDist, this.targetMass);
    const cadenceHint =
      this.stage >= 2 && Math.abs(omegaUser - omegaTarget) > 0.14
        ? omegaUser < omegaTarget
          ? ' · CADENCE SLOW'
          : ' · CADENCE FAST'
        : '';

    c2d.fillStyle = 'rgba(204, 224, 244, 0.68)';
    const topReadout = this.profile.showNumericDeltas
      ? `${this.scenario.companionTitle} · P=${pDays.toFixed(0)}d · m₁r₁=${(m1Solar * r1AU).toFixed(2)} = m₂r₂=${(m2Solar * r2AU).toFixed(2)}${cadenceHint}`
      : `${this.scenario.companionTitle} · ORBITAL PERIOD ${pDays.toFixed(0)} d${cadenceHint}`;
    c2d.fillText(topReadout, g.cx, g.compact ? 54 : 68);
    c2d.restore();

    // Bottom Zeiss Verniers (pre-allocated zero-GC, synced to exact H% lock tolerance!)
    const paramTol = this.getParamTol();
    this.vernierItems.length = 0;
    if (this.stage === 3) {
      this.vernierItems.push({
        key: 'dist',
        label: 'DISTANCE (r₂)',
        val01: this.userDist,
        locked: Math.abs(this.userDist - this.targetDist) <= paramTol,
        rightText: `${r2AU.toFixed(2)} AU`,
      });
    }
    if (this.stage >= 2) {
      this.vernierItems.push({
        key: 'mass',
        label: `${this.scenario.companionTitle} MASS (M₂)`,
        val01: this.userMass,
        locked: Math.abs(this.userMass - this.targetMass) <= paramTol,
        rightText: `${m2Solar.toFixed(2)} M☉`,
      });
    }

    if (this.vernierItems.length > 0) {
      layoutVernierRowInto(this.strips, w, h, this.vernierItems, g.compact ? h - 82 : h - 102);
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
            cx: g.cx,
            cy: g.cy,
            radius: g.compact ? 34 : 44,
            progress01: this.lockHoldSec / this.lockHoldTargetSec,
            label: `BALANCED ${Math.round((this.lockHoldSec / this.lockHoldTargetSec) * 100)}%`,
          }
        : undefined
    );
  }

  protected getStageProgress01(): number {
    return clamp((this.stage - 1 + this.cachedMatch) / 3, 0, 1);
  }

  protected getPromptText(): string {
    const m1Str = this.scenario.primaryMassSolar.toFixed(1);
    if (this.stage === 1) {
      return `Drag the companion star radially (or Up/Down) so the ${m1Str} M☉ star’s wobble hugs the dashed ring.`;
    }
    if (this.stage === 2) {
      return `Tune ${this.scenario.companionTitle} MASS (M₂) until the wobble ring AND ghost star cadence lock together.`;
    }
    return `Drag companion DISTANCE onto the dashed violet track & weigh ${this.scenario.companionTitle} MASS (M₂).`;
  }

  private getParamTol(): number {
    return this.palette.mode === 'warm' ? 0.042 : this.palette.mode === 'cold' ? 0.024 : 0.032;
  }

  protected solveCurrentStage(stage: 1 | 2 | 3): void {
    void stage;
    this.userDist = this.targetDist;
    this.userMass = this.targetMass;
    this.phaseUser = this.phaseTarget;
    this.cachedMatch = this.computeMatch01();
  }

  protected override verifySolved(): boolean {
    return this.cachedMatch >= this.getLockThreshold();
  }

  protected onAllStagesCleared(): void {
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    const m2 = this.getCompanionMassSolar(this.targetMass);
    this.finishSuccess({
      accuracy: 0.96,
      proofFragmentSuffix: 'binary',
      dossierSnippet: `Barycentric Keplerian balance (${this.activeVariant?.label ?? 'Binary'}: ${m2.toFixed(2)} M☉ ${this.scenario.companionTitle}) verified on ${this.ctx.targetName}.`,
      telemetrySummary: `Mass Balance 96% · M₂=${m2.toFixed(2)} M☉ · ${totalSec.toFixed(1)}s`,
      physicalPrinciple: 'Barycenter Equilibrium (m₁r₁ = m₂r₂) & Binary Keplerian Third Law (ω ∝ √((M₁+M₂)/a³))',
    });
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'A luminous star and dark compact companion (White Dwarf <1.4 M☉, Neutron Star 1.4–2.3 M☉, or Black Hole ≥3 M☉) orbit a shared fulcrum obeying m₁r₁ = m₂r₂ and Kepler’s Third Law.',
      goalSummary:
        'Match companion distance and compact-object mass so your primary star’s wobble orbit and Keplerian cadence sync with the observed dashed ring.',
      controlsDesktop:
        'Drag companion orbit radially (or Up/Down) on Stages 1 & 3; tune M₂ slider (or Left/Right) on Stages 2–3.',
      controlsTouch: 'Touch-drag the companion orbit radius and slide the bottom vernier bars.',
      warmthEffect:
        'Warm H% gives generous barycentric snap detents; Cold H% sharpens Keplerian cadence lock and reveals live m₁r₁ = m₂r₂ torque math.',
    };
  }
}
