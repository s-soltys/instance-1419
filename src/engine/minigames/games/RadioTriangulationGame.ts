import { platform } from '../../../platform/PlatformAdapter';
import { BaseCosmicMinigame, type PointerLocalEvent } from '../core/BaseCosmicMinigame';
import { drawFeatheredRadioLobe, drawOutwardRadarWavefronts } from '../render/InstrumentSprites';
import { drawInclinedAstrometryRing } from '../render/OpticalDrawUtils';
import { drawOpticalStar } from '../render/StarPSFAtlas';
import { angleDiffRad, clamp, lerp, SpringActuator, wrapAngleRad } from '../tactilePhysics';
import type {
  CosmicPlateId,
  InstrumentFieldGuide,
  MinigameVariantSpec,
} from '../types';

interface RadioDish {
  id: number;
  rimAngle: number;
  aimAngle: number;
  aimSpring: SpringActuator;
  wasLocked: boolean;
  servoEngaged: boolean;
  closeness: number;
}

interface GhostDecoy {
  sx: number;
  sy: number;
  rejected: boolean;
  rejectFlash: number;
  illuminatedCount: number;
}

interface RadioScenarioConfig {
  bandLabel: string;
  freqGhz: number;
  baselineKm: number;
  stage1Ghosts: 1 | 2;
  stage3DishCount: 3 | 4;
  linearDrift: boolean;
  doubleTapPing: boolean;
  pingPeriodSec: number;
  ionosphericShimmer: boolean;
}

const TRI_PLATES: readonly [CosmicPlateId, CosmicPlateId, CosmicPlateId] = [
  'stephans_quintet',
  'cartwheel',
  'whirlpool',
];

const TRI_VARIANTS: readonly MinigameVariantSpec[] = [
  { index: 0, id: 'radio_triangulation_v1', label: 'Quintet Shock Front', plateId: 'stephans_quintet' },
  { index: 1, id: 'radio_triangulation_v2', label: 'Cartwheel Core Fix', plateId: 'cartwheel' },
  { index: 2, id: 'radio_triangulation_v3', label: 'M51 Spiral Maser', plateId: 'whirlpool' },
  { index: 3, id: 'radio_triangulation_v4', label: 'Antipodal Drift Beacon', plateId: 'stephans_quintet' },
];

const SCENARIOS: readonly RadioScenarioConfig[] = [
  {
    bandLabel: '1.4 GHz HI',
    freqGhz: 1.4,
    baselineKm: 4200,
    stage1Ghosts: 1,
    stage3DishCount: 3,
    linearDrift: false,
    doubleTapPing: false,
    pingPeriodSec: 1.8,
    ionosphericShimmer: false,
  },
  {
    bandLabel: '8.4 GHz X-BAND',
    freqGhz: 8.4,
    baselineKm: 6800,
    stage1Ghosts: 2,
    stage3DishCount: 3,
    linearDrift: false,
    doubleTapPing: false,
    pingPeriodSec: 1.65,
    ionosphericShimmer: true,
  },
  {
    bandLabel: '22 GHz H₂O MASER',
    freqGhz: 22,
    baselineKm: 8400,
    stage1Ghosts: 1,
    stage3DishCount: 3,
    linearDrift: true,
    doubleTapPing: true,
    pingPeriodSec: 1.45,
    ionosphericShimmer: false,
  },
  {
    bandLabel: '230 GHz VLBI',
    freqGhz: 230,
    baselineKm: 11200,
    stage1Ghosts: 1,
    stage3DishCount: 4,
    linearDrift: false,
    doubleTapPing: false,
    pingPeriodSec: 1.75,
    ionosphericShimmer: true,
  },
];

/**
 * TRI-10 — Radio Dish Array (VLBI Interferometry)
 * Converge perimeter parabolic dishes across long baselines to reject multipath ghost echoes
 * and lock drifting radio beacons, illuminating VLBI baseline chords & synchrotron contours.
 */
export class RadioTriangulationGame extends BaseCosmicMinigame {
  readonly id = 'radio_triangulation';
  readonly title = 'RADIO DISH ARRAY';
  readonly subtitle = 'Interferometric Triangulation';
  readonly instrumentCode = 'TRI-10';
  readonly platePool = TRI_PLATES;
  readonly variants = TRI_VARIANTS;

  private scenario: RadioScenarioConfig = SCENARIOS[0];
  private dishes: RadioDish[] = [];
  private sourceBase = { sx: 0.14, sy: -0.12 };
  private driftAxisAngle = 0.6;
  private ghosts: GhostDecoy[] = [];

  private activeDishId: number | null = null;
  private selectedDishId = 0;
  private cachedAvgClose = 0;
  private lastTickAt = -10;
  private lastSparkAt = -10;

  protected override onMount(): void {
    this.scenario = SCENARIOS[this.iterationIndex % SCENARIOS.length];
    this.lockHoldTargetSec = 0.95;
  }

  protected onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.scenario = SCENARIOS[this.iterationIndex % SCENARIOS.length];
    this.activeDishId = null;
    this.selectedDishId = 0;

    // Keep source safely within <= 0.36 unit radius so angular drift speed never spikes near a rim dish
    const srcAng = rng() * Math.PI * 2;
    const srcR = 0.12 + rng() * 0.22;
    this.sourceBase = {
      sx: Math.cos(srcAng) * srcR,
      sy: Math.sin(srcAng) * srcR,
    };
    this.driftAxisAngle = rng() * Math.PI * 2;

    // Stage 1 (and Stage 3 decoy sweep): interactive multipath ghost echo(es), clearly separated from true beacon
    this.ghosts = [];
    if (stage === 1 || stage === 3) {
      const gAng1 = srcAng + Math.PI + (rng() - 0.5) * 0.55;
      const gR1 = 0.24 + rng() * 0.16;
      this.ghosts.push({
        sx: Math.cos(gAng1) * gR1,
        sy: Math.sin(gAng1) * gR1,
        rejected: false,
        rejectFlash: 0,
        illuminatedCount: 0,
      });
      if (stage === 1 && this.scenario.stage1Ghosts === 2) {
        const gAng2 = srcAng + (rng() > 0.5 ? 1 : -1) * (Math.PI * 0.58);
        const gR2 = 0.26 + rng() * 0.14;
        this.ghosts.push({
          sx: Math.cos(gAng2) * gR2,
          sy: Math.sin(gAng2) * gR2,
          rejected: false,
          rejectFlash: 0,
          illuminatedCount: 0,
        });
      }
    }

    // Guaranteed well-spaced perimeter baselines (min angular separation >= 58 deg)
    const baseRot = rng() * Math.PI * 2;
    let rimSlots: number[];
    if (stage === 1) {
      rimSlots = [baseRot, baseRot + 1.55 + rng() * 0.65];
    } else if (stage === 3 && this.scenario.stage3DishCount === 4) {
      rimSlots = [
        baseRot,
        baseRot + Math.PI * 0.5 + (rng() - 0.5) * 0.26,
        baseRot + Math.PI + (rng() - 0.5) * 0.26,
        baseRot + Math.PI * 1.5 + (rng() - 0.5) * 0.26,
      ];
    } else {
      rimSlots = [
        baseRot,
        baseRot + 2.0 + rng() * 0.35,
        baseRot + 4.12 + rng() * 0.38,
      ];
    }

    this.dishes = rimSlots.map((rimAng, id) => {
      const inward = wrapAngleRad(rimAng + Math.PI);
      const trueAim = Math.atan2(this.sourceBase.sy - Math.sin(rimAng), this.sourceBase.sx - Math.cos(rimAng));
      const offset = (id % 2 === 0 ? 1 : -1) * (0.48 + rng() * 0.16);
      const aim = this.clampAimInward(rimAng, trueAim + offset);
      const resolved = Number.isFinite(aim) ? aim : inward;
      return {
        id,
        rimAngle: rimAng,
        aimAngle: resolved,
        aimSpring: new SpringActuator(resolved),
        wasLocked: false,
        servoEngaged: false,
        closeness: 0,
      };
    });

    this.refreshDishMetrics();
  }

  private clampAimInward(rimAngle: number, rawAim: number): number {
    const inward = wrapAngleRad(rimAngle + Math.PI);
    const delta = clamp(angleDiffRad(rawAim, inward), -1.18, 1.18);
    return wrapAngleRad(inward + delta);
  }

  private getGeometry(w: number, h: number) {
    const compact = h < 450;
    const radius = compact
      ? Math.min(w * 0.28, h * 0.305)
      : Math.min(w * 0.32, h * 0.335);
    return {
      cx: w * 0.5,
      cy: compact ? h * 0.465 : h * 0.485,
      radius,
      compact,
    };
  }

  private getCurrentSourceUnit(): { sx: number; sy: number } {
    if (this.stage === 1) return this.sourceBase;
    const speed = this.stage === 2 ? 0.15 : 0.18;
    if (this.scenario.linearDrift) {
      // Smooth ballistic back-and-forth proper-motion corridor across sky circle
      const sweep = Math.sin(this.elapsedSec * speed * 1.15) * 0.24;
      return {
        sx: clamp(this.sourceBase.sx * 0.5 + Math.cos(this.driftAxisAngle) * sweep, -0.4, 0.4),
        sy: clamp(this.sourceBase.sy * 0.5 + Math.sin(this.driftAxisAngle) * sweep, -0.4, 0.4),
      };
    }
    return {
      sx: clamp(this.sourceBase.sx * 0.72 + Math.sin(this.elapsedSec * speed) * 0.14, -0.4, 0.4),
      sy: clamp(this.sourceBase.sy * 0.72 + Math.cos(this.elapsedSec * speed * 0.82) * 0.13, -0.4, 0.4),
    };
  }

  private getBaseToleranceRad(): number {
    const stageTol = this.stage === 1 ? 0.165 : this.stage === 2 ? 0.145 : 0.14;
    return stageTol * (this.palette.mode === 'warm' ? 1.14 : this.palette.mode === 'cold' ? 0.88 : 1.0);
  }

  private getTrueAimForDish(dish: RadioDish, src: { sx: number; sy: number }): number {
    return Math.atan2(src.sy - Math.sin(dish.rimAngle), src.sx - Math.cos(dish.rimAngle));
  }

  private refreshDishMetrics(): boolean {
    const src = this.getCurrentSourceUnit();
    const baseTol = this.getBaseToleranceRad();
    let sumClose = 0;
    let allLocked = this.dishes.length > 0;

    for (let i = 0; i < this.dishes.length; i++) {
      const d = this.dishes[i];
      const trueAim = this.getTrueAimForDish(d, src);
      const err = Math.abs(angleDiffRad(d.aimAngle, trueAim));
      // 1.45x lock hysteresis prevents unfair Cold-mode plate-spinning while aiming other dishes!
      const effectiveTol = d.wasLocked ? baseTol * 1.45 : baseTol;
      const locked = err <= effectiveTol;
      d.wasLocked = locked;
      d.closeness = clamp(1 - err / (baseTol * 3.4), 0, 1);
      sumClose += d.closeness;
      if (!locked) allLocked = false;
    }

    this.cachedAvgClose = this.dishes.length > 0 ? sumClose / this.dishes.length : 0;

    // Interactive Stage 1 multipath ghost cross-check
    for (let gIdx = 0; gIdx < this.ghosts.length; gIdx++) {
      const g = this.ghosts[gIdx];
      let hits = 0;
      for (let i = 0; i < this.dishes.length; i++) {
        const d = this.dishes[i];
        const ghostAim = Math.atan2(g.sy - Math.sin(d.rimAngle), g.sx - Math.cos(d.rimAngle));
        if (Math.abs(angleDiffRad(d.aimAngle, ghostAim)) <= 0.18) {
          hits++;
        }
      }
      if (hits >= 2 && !g.rejected) {
        g.rejected = true;
        g.rejectFlash = 1;
        const { cx, cy, radius } = this.getGeometry(this.width, this.height);
        this.particles.emitPhotonSparks(
          cx + g.sx * radius,
          cy + g.sy * radius,
          6,
          28,
          '#ffb86c'
        );
        this.ctx.audio?.playSolenoidClack(false);
        platform.triggerHaptic('rejectThud', 0.55);
      }
      g.illuminatedCount = hits;
    }

    return allLocked;
  }

  private aimDishToward(dish: RadioDish, px: number, py: number, cx: number, cy: number, radius: number): void {
    const dxPx = cx + Math.cos(dish.rimAngle) * radius;
    const dyPx = cy + Math.sin(dish.rimAngle) * radius;
    if (Math.hypot(px - dxPx, py - dyPx) < 10) return;

    let nextAim = this.clampAimInward(dish.rimAngle, Math.atan2(py - dyPx, px - dxPx));
    const src = this.getCurrentSourceUnit();
    const trueAim = this.getTrueAimForDish(dish, src);
    const diff = angleDiffRad(trueAim, nextAim);
    const magnetRad = 0.075 * this.profile.detentWellScale;
    if (Math.abs(diff) < magnetRad) {
      nextAim = this.clampAimInward(dish.rimAngle, nextAim + diff * 0.42);
    }
    dish.aimAngle = nextAim;
  }

  protected override onPointerDown(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0 || this.dishes.length === 0) return;
    const { x: px, y: py } = ev;
    const { cx, cy, radius } = this.getGeometry(this.width, this.height);

    // 1. Direct rim-dish grab (generous 48px touch radius)
    let picked: RadioDish | null = null;
    let bestRimDist = Infinity;
    for (let i = 0; i < this.dishes.length; i++) {
      const d = this.dishes[i];
      const dx = cx + Math.cos(d.rimAngle) * radius;
      const dy = cy + Math.sin(d.rimAngle) * radius;
      const dist = Math.hypot(px - dx, py - dy);
      if (dist <= 48 && dist < bestRimDist) {
        bestRimDist = dist;
        picked = d;
      }
    }

    // 2. Beam-ray grab inside sky circle (clicking near a beam steers THAT dish without yanking opposite dishes!)
    if (!picked) {
      const beamLen = radius * 1.85;
      let bestRayDist = Infinity;
      for (let i = 0; i < this.dishes.length; i++) {
        const d = this.dishes[i];
        const dx = cx + Math.cos(d.rimAngle) * radius;
        const dy = cy + Math.sin(d.rimAngle) * radius;
        const ux = Math.cos(d.aimAngle);
        const uy = Math.sin(d.aimAngle);
        const proj = clamp((px - dx) * ux + (py - dy) * uy, 24, beamLen);
        const perp = Math.hypot(px - (dx + ux * proj), py - (dy + uy * proj));
        if (perp < 36 && perp < bestRayDist) {
          bestRayDist = perp;
          picked = d;
        }
      }
    }

    // 3. Fallback: nearest rim dish
    if (!picked) {
      let bestDist = Infinity;
      for (let i = 0; i < this.dishes.length; i++) {
        const d = this.dishes[i];
        const dx = cx + Math.cos(d.rimAngle) * radius;
        const dy = cy + Math.sin(d.rimAngle) * radius;
        const dist = Math.hypot(px - dx, py - dy);
        if (dist < bestDist) {
          bestDist = dist;
          picked = d;
        }
      }
    }

    if (!picked) return;
    this.activeDishId = picked.id;
    this.selectedDishId = picked.id;
    this.aimDishToward(picked, px, py, cx, cy, radius);
    platform.triggerHaptic('vernierTick', 0.45);
  }

  protected override onPointerMove(ev: PointerLocalEvent): void {
    if (this.activeDishId === null || this.stageClearTimer > 0) return;
    const dish = this.dishes[this.activeDishId];
    if (!dish) return;
    const { cx, cy, radius } = this.getGeometry(this.width, this.height);
    this.aimDishToward(dish, ev.x, ev.y, cx, cy, radius);
  }

  protected override onPointerUp(): void {
    this.activeDishId = null;
  }

  protected override onKeyDown(e: KeyboardEvent): void {
    if (this.stageClearTimer > 0 || this.dishes.length === 0) return;
    const dish = this.dishes[this.selectedDishId] ?? this.dishes[0];
    const step = e.shiftKey ? 0.09 : 0.045;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      dish.aimAngle = this.clampAimInward(dish.rimAngle, dish.aimAngle - step);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      dish.aimAngle = this.clampAimInward(dish.rimAngle, dish.aimAngle + step);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      this.selectedDishId = (this.selectedDishId + 1) % this.dishes.length;
      this.ctx.audio?.playTumblerClick(0.55, false);
    }
  }

  protected onUpdate(dt: number): void {
    for (let i = 0; i < this.ghosts.length; i++) {
      this.ghosts[i].rejectFlash = Math.max(0, this.ghosts[i].rejectFlash - dt * 1.4);
    }

    // Gentle servo phase-lead on already-locked dishes during Stage 2/3 drift while user steers another dish
    if (this.stage >= 2 && this.stageClearTimer <= 0) {
      const src = this.getCurrentSourceUnit();
      for (let i = 0; i < this.dishes.length; i++) {
        const d = this.dishes[i];
        if (d.wasLocked && d.id !== this.activeDishId) {
          d.servoEngaged = true;
          const trueAim = this.getTrueAimForDish(d, src);
          const diff = angleDiffRad(trueAim, d.aimAngle);
          const maxStep = dt * 0.032;
          d.aimAngle = this.clampAimInward(d.rimAngle, d.aimAngle + clamp(diff, -maxStep, maxStep));
        } else {
          d.servoEngaged = false;
        }
      }
    } else {
      for (let i = 0; i < this.dishes.length; i++) {
        this.dishes[i].servoEngaged = false;
      }
    }

    for (let i = 0; i < this.dishes.length; i++) {
      const d = this.dishes[i];
      d.aimSpring.target = d.aimAngle;
      d.aimSpring.step(dt, { stiffness: 165, damping: 22, wrapAngle: true });
    }

    const allLocked = this.refreshDishMetrics();

    this.ctx.audio?.updateBeatSynth({
      beatHz: (1 - this.cachedAvgClose) * 7.0,
      harmonicLock: this.cachedAvgClose,
      warmth: this.profile.harmonicWarmthGain,
      strain: 0,
    });

    if (this.cachedAvgClose > 0.7 && this.elapsedSec - this.lastTickAt > 0.26) {
      this.lastTickAt = this.elapsedSec;
      this.ctx.audio?.playProximityTick?.(this.cachedAvgClose);
    }

    if (this.cachedAvgClose > 0.78 && this.elapsedSec - this.lastSparkAt > 0.34) {
      this.lastSparkAt = this.elapsedSec;
      const { cx, cy, radius } = this.getGeometry(this.width, this.height);
      const src = this.getCurrentSourceUnit();
      this.particles.emitPhotonSparks(cx + src.sx * radius, cy + src.sy * radius, 2, 34, this.palette.lockHex);
    }

    if (this.stageClearTimer > 0) return;

    if (allLocked) {
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        const { cx, cy, radius } = this.getGeometry(this.width, this.height);
        const src = this.getCurrentSourceUnit();
        this.triggerStageClear(
          `VLBI SOURCE ${this.stage}/3 TRIANGULATED`,
          this.stage < 3 ? 0.58 : 0.42,
          cx + src.sx * radius,
          cy + src.sy * radius
        );
      }
    } else {
      this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.5);
    }
  }

  private evalPingStrength(): { boost: number; ringFrac: number } {
    if (this.stage < 3) return { boost: 0, ringFrac: 0 };
    const frac = (this.elapsedSec / this.scenario.pingPeriodSec) % 1;
    if (this.scenario.doubleTapPing) {
      const p1 = Math.pow(Math.max(0, 1 - frac * 2.4), 2.2);
      const frac2 = (frac + 0.72) % 1;
      const p2 = Math.pow(Math.max(0, 1 - frac2 * 2.8), 2.2) * 0.75;
      return { boost: Math.max(p1, p2) * 0.7, ringFrac: frac };
    }
    return { boost: Math.pow(1 - frac, 2.2) * 0.65, ringFrac: frac };
  }

  protected onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const { cx, cy, radius, compact } = this.getGeometry(w, h);
    const src = this.getCurrentSourceUnit();
    const srcX = cx + src.sx * radius;
    const srcY = cy + src.sy * radius;

    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: 5,
      alpha: 0.44,
      brightness: 0.76,
      tintAlpha: 0.48,
      reticleDuck: { cx, cy, r: radius * 0.78 },
    });

    // Subtle 2.5D celestial sphere meridian rings + perimeter VLBI array circle
    drawInclinedAstrometryRing(c2d, cx, cy, radius * 0.96, radius * 0.34, -0.18, this.palette.secondaryRgb, {
      backAlpha: 0.06,
      frontAlpha: 0.14,
      ticks: 4,
    });
    drawInclinedAstrometryRing(c2d, cx, cy, radius * 0.56, radius * 0.56, 0, this.palette.secondaryRgb, {
      backAlpha: 0.08,
      frontAlpha: 0.1,
      ticks: 8,
    });

    c2d.save();
    c2d.strokeStyle = 'rgba(186, 214, 240, 0.24)';
    c2d.lineWidth = 1.4;
    c2d.beginPath();
    c2d.arc(cx, cy, radius, 0, Math.PI * 2);
    c2d.stroke();
    c2d.restore();

    // Subtle perimeter baseline correlation arcs on the outer ring (NO heavy central triangle!)
    c2d.save();
    for (let i = 0; i < this.dishes.length; i++) {
      for (let j = i + 1; j < this.dishes.length; j++) {
        const a = this.dishes[i];
        const b = this.dishes[j];
        const pairCorr = a.closeness * b.closeness;
        const bothLocked = a.wasLocked && b.wasLocked;

        if (bothLocked || pairCorr > 0.58) {
          const ax = cx + Math.cos(a.rimAngle) * radius;
          const ay = cy + Math.sin(a.rimAngle) * radius;
          const bx = cx + Math.cos(b.rimAngle) * radius;
          const by = cy + Math.sin(b.rimAngle) * radius;
          c2d.strokeStyle = bothLocked
            ? `rgba(${this.palette.lockRgb}, 0.24)`
            : `rgba(${this.palette.secondaryRgb}, ${(pairCorr * 0.09).toFixed(2)})`;
          c2d.lineWidth = bothLocked ? 1.1 : 0.7;
          c2d.setLineDash?.(bothLocked ? [] : [3, 9]);
          c2d.beginPath();
          c2d.moveTo(ax, ay);
          c2d.lineTo(bx, by);
          c2d.stroke();
          c2d.setLineDash?.([]);
        }

        // Outer graduated baseline correlation arc segment
        const dAng = angleDiffRad(b.rimAngle, a.rimAngle);
        c2d.strokeStyle = bothLocked
          ? `rgba(${this.palette.lockRgb}, 0.42)`
          : `rgba(${this.palette.accentRgb}, ${(0.08 + pairCorr * 0.18).toFixed(2)})`;
        c2d.lineWidth = bothLocked ? 1.6 : 1.0;
        c2d.beginPath();
        c2d.arc(cx, cy, radius + 5, a.rimAngle, a.rimAngle + dAng, dAng < 0);
        c2d.stroke();
      }
    }
    c2d.restore();

    // Clipped outward-projecting radar signal lobes + wavefront pulses (strictly inside circular array!)
    const beamLen = radius * 1.92;
    c2d.save();
    c2d.beginPath();
    c2d.arc(cx, cy, Math.max(8, radius - 1.5), 0, Math.PI * 2);
    c2d.clip?.();

    for (let i = 0; i < this.dishes.length; i++) {
      const dish = this.dishes[i];
      const dx = cx + Math.cos(dish.rimAngle) * radius;
      const dy = cy + Math.sin(dish.rimAngle) * radius;
      const shimmer = this.scenario.ionosphericShimmer
        ? Math.sin(this.elapsedSec * 4.2 + dish.id * 2.1) * 0.015 * (1 - dish.closeness)
        : 0;
      const dispAim = dish.aimSpring.value + shimmer;
      const hornX = dx + Math.cos(dispAim) * 9;
      const hornY = dy + Math.sin(dispAim) * 9;
      const locked = dish.wasLocked;
      const col = locked
        ? this.palette.lockHex
        : dish.closeness > 0.72
        ? this.palette.secondaryHex
        : this.palette.accentHex;
      const halfCone = lerp(0.32, 0.11, dish.closeness) * (this.palette.mode === 'cold' ? 0.86 : 1.04);

      drawFeatheredRadioLobe(
        c2d,
        hornX,
        hornY,
        dispAim,
        beamLen,
        halfCone,
        col,
        0.16 + dish.closeness * 0.2
      );

      drawOutwardRadarWavefronts(
        c2d,
        hornX,
        hornY,
        dispAim,
        beamLen * 0.96,
        halfCone * 0.94,
        this.elapsedSec,
        dish.id * 0.29,
        col,
        dish.closeness,
        locked
      );

      // Whisper-faint boresight reticle hairline so exact aiming remains legible
      c2d.save();
      c2d.strokeStyle = col;
      c2d.globalAlpha = locked ? 0.34 : 0.13 + dish.closeness * 0.12;
      c2d.lineWidth = locked ? 1.15 : 0.8;
      c2d.setLineDash?.(locked ? [6, 5] : [3, 8]);
      c2d.beginPath();
      c2d.moveTo(hornX, hornY);
      c2d.lineTo(hornX + Math.cos(dispAim) * beamLen * 0.94, hornY + Math.sin(dispAim) * beamLen * 0.94);
      c2d.stroke();
      c2d.setLineDash?.([]);
      c2d.restore();
    }

    // Live Constructive Interference Synthesis Fringe Blooms at boresight intersections
    c2d.save();
    for (let i = 0; i < this.dishes.length; i++) {
      for (let j = i + 1; j < this.dishes.length; j++) {
        const a = this.dishes[i];
        const b = this.dishes[j];
        const ax = cx + Math.cos(a.rimAngle) * radius;
        const ay = cy + Math.sin(a.rimAngle) * radius;
        const bx = cx + Math.cos(b.rimAngle) * radius;
        const by = cy + Math.sin(b.rimAngle) * radius;
        const ux = Math.cos(a.aimSpring.value);
        const uy = Math.sin(a.aimSpring.value);
        const vx = Math.cos(b.aimSpring.value);
        const vy = Math.sin(b.aimSpring.value);
        const det = ux * vy - uy * vx;
        if (Math.abs(det) < 0.08) continue;
        const rx = bx - ax;
        const ry = by - ay;
        const ta = (rx * vy - ry * vx) / det;
        const tb = (rx * uy - ry * ux) / det;
        if (ta < 16 || tb < 16) continue;
        const ix = ax + ux * ta;
        const iy = ay + uy * ta;
        if (Math.hypot(ix - cx, iy - cy) >= radius * 0.95) continue;

        const pairClose = a.closeness * b.closeness;
        const pulse = 0.72 + 0.28 * Math.sin(this.elapsedSec * 5.2 + i + j);
        const col = a.wasLocked && b.wasLocked ? this.palette.lockHex : this.palette.secondaryHex;
        c2d.strokeStyle = col;
        c2d.globalAlpha = clamp((0.18 + pairClose * 0.44) * pulse, 0, 0.7);
        c2d.lineWidth = 1.05;
        if (typeof c2d.ellipse === 'function') {
          c2d.beginPath();
          c2d.ellipse(ix, iy, 12 * pulse, 4.5 * pulse, a.aimSpring.value, 0, Math.PI * 2);
          c2d.stroke();
          c2d.beginPath();
          c2d.ellipse(ix, iy, 12 * pulse, 4.5 * pulse, b.aimSpring.value, 0, Math.PI * 2);
          c2d.stroke();
        }
        c2d.fillStyle = col;
        c2d.beginPath();
        c2d.arc(ix, iy, 2.4, 0, Math.PI * 2);
        c2d.fill();
      }
    }
    c2d.restore();
    c2d.restore(); // end radar circle clip

    // Stage 1 / 3 Interactive Multipath Ghost Echoes (shatter clearly on dual-beam cross-check!)
    for (let i = 0; i < this.ghosts.length; i++) {
      const g = this.ghosts[i];
      const gx = cx + g.sx * radius;
      const gy = cy + g.sy * radius;
      const activeAlpha = g.rejected
        ? 0.2 + g.rejectFlash * 0.55
        : g.illuminatedCount === 1
        ? 0.74
        : 0.28;

      c2d.save();
      c2d.strokeStyle = g.rejected ? '#ff7a6b' : '#ffb86c';
      c2d.globalAlpha = activeAlpha;
      c2d.lineWidth = 1.3;
      c2d.setLineDash?.([3, 3]);
      c2d.beginPath();
      c2d.arc(gx, gy, g.illuminatedCount === 1 && !g.rejected ? 13 : 9, 0, Math.PI * 2);
      c2d.stroke();

      c2d.setLineDash?.([]);
      if (g.rejected) {
        c2d.beginPath();
        c2d.moveTo(gx - 8, gy - 8);
        c2d.lineTo(gx + 8, gy + 8);
        c2d.moveTo(gx + 8, gy - 8);
        c2d.lineTo(gx - 8, gy + 8);
        c2d.stroke();
        c2d.font = '600 8px ui-monospace, SFMono-Regular, Menlo, monospace';
        c2d.fillStyle = '#ff9d82';
        c2d.textAlign = 'center';
        c2d.fillText('GHOST REJECTED', gx, gy + 21);
      } else if (g.illuminatedCount === 1) {
        c2d.fillStyle = '#ffb86c';
        c2d.beginPath();
        c2d.arc(gx, gy, 3.2, 0, Math.PI * 2);
        c2d.fill();
        c2d.font = '600 8px ui-monospace, SFMono-Regular, Menlo, monospace';
        c2d.textAlign = 'center';
        c2d.fillText('UNVERIFIED LOBE?', gx, gy + 21);
      }
      c2d.restore();
    }

    // Authentic Radio Synchrotron Source (isophote contours + synchrotron lobes + wavefront pings)
    const { boost: pingBoost, ringFrac } = this.evalPingStrength();
    const revealAlpha = clamp((this.cachedAvgClose - 0.36) / 0.5 + pingBoost * 0.62, 0.14, 1);

    c2d.save();
    if (this.stage === 3) {
      c2d.strokeStyle = this.palette.secondaryHex;
      c2d.globalAlpha = (1 - ringFrac) * 0.45;
      c2d.lineWidth = 1.5;
      c2d.beginPath();
      c2d.arc(srcX, srcY, 8 + ringFrac * 38, 0, Math.PI * 2);
      c2d.stroke();
    }

    const isoCol = this.cachedAvgClose > 0.8 ? this.palette.lockHex : this.palette.secondaryHex;
    // Dual faint synchrotron jet lobes emerging when baseline correlation climbs
    if (revealAlpha > 0.36 && typeof c2d.ellipse === 'function') {
      const lobeScale = clamp((revealAlpha - 0.36) / 0.64, 0, 1);
      c2d.strokeStyle = isoCol;
      c2d.globalAlpha = lobeScale * 0.32;
      c2d.lineWidth = 1.05;
      const cosD = Math.cos(this.driftAxisAngle);
      const sinD = Math.sin(this.driftAxisAngle);
      c2d.beginPath();
      c2d.ellipse(srcX + cosD * 18, srcY + sinD * 18, 9 * lobeScale, 5 * lobeScale, this.driftAxisAngle, 0, Math.PI * 2);
      c2d.stroke();
      c2d.beginPath();
      c2d.ellipse(srcX - cosD * 18, srcY - sinD * 18, 9 * lobeScale, 5 * lobeScale, this.driftAxisAngle, 0, Math.PI * 2);
      c2d.stroke();
    }

    const contourRadii = [6, 12.5, 20];
    for (let k = 0; k < contourRadii.length; k++) {
      const rIso = contourRadii[k] * (0.85 + revealAlpha * 0.22);
      c2d.strokeStyle = isoCol;
      c2d.globalAlpha = revealAlpha * (0.68 - k * 0.18);
      c2d.lineWidth = k === 0 ? 1.6 : 1.0;
      c2d.beginPath();
      c2d.arc(srcX, srcY, rIso, 0, Math.PI * 2);
      c2d.stroke();
    }
    c2d.restore();

    drawOpticalStar(c2d, srcX, srcY, 4.4 + revealAlpha * 2.5, {
      spectralClass: this.cachedAvgClose > 0.8 ? 'LOCK' : 'O',
      spikes: 0,
      alpha: revealAlpha,
      vibeMode: this.palette.mode,
    });

    // Articulated Concave Parabolic Dish Turrets along perimeter
    for (let i = 0; i < this.dishes.length; i++) {
      const dish = this.dishes[i];
      const dx = cx + Math.cos(dish.rimAngle) * radius;
      const dy = cy + Math.sin(dish.rimAngle) * radius;
      const dispAim = dish.aimSpring.value;
      const locked = dish.wasLocked;
      const selected = dish.id === this.selectedDishId;
      const col = locked
        ? this.palette.lockHex
        : dish.closeness > 0.72
        ? this.palette.secondaryHex
        : this.palette.accentHex;

      c2d.save();
      c2d.translate(dx, dy);

      if (selected) {
        c2d.strokeStyle = 'rgba(232, 245, 255, 0.58)';
        c2d.lineWidth = 1.1;
        c2d.setLineDash?.([3, 3]);
        c2d.beginPath();
        c2d.arc(0, 0, 21, 0, Math.PI * 2);
        c2d.stroke();
        c2d.setLineDash?.([]);
      }

      if (dish.closeness > 0.08) {
        c2d.strokeStyle = col;
        c2d.lineWidth = 2.2;
        c2d.beginPath();
        c2d.arc(0, 0, 17, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * dish.closeness);
        c2d.stroke();
      }

      c2d.rotate(dispAim);
      // Azimuth carriage base + rear counterweight yoke
      c2d.fillStyle = '#07101c';
      c2d.strokeStyle = 'rgba(186, 214, 240, 0.36)';
      c2d.lineWidth = 1.2;
      c2d.beginPath();
      c2d.moveTo(-10, -4);
      c2d.lineTo(-5, -4);
      c2d.lineTo(-5, 4);
      c2d.lineTo(-10, 4);
      c2d.closePath();
      c2d.fill();
      c2d.stroke();

      // Concave Parabolic Dish Reflector opening toward +X (true cup curvature!)
      c2d.fillStyle = 'rgba(10, 22, 38, 0.72)';
      c2d.strokeStyle = col;
      c2d.lineWidth = 2.4;
      c2d.beginPath();
      c2d.moveTo(0, -13);
      if (typeof c2d.quadraticCurveTo === 'function') {
        c2d.quadraticCurveTo(-11.5, 0, 0, 13);
      } else {
        c2d.lineTo(-6, 0);
        c2d.lineTo(0, 13);
      }
      c2d.stroke();

      // 3-strut quadripod truss converging onto cryogenic focal feed horn at (+10, 0)
      c2d.strokeStyle = 'rgba(220, 238, 252, 0.58)';
      c2d.lineWidth = 1.05;
      c2d.beginPath();
      c2d.moveTo(-0.5, -11.5);
      c2d.lineTo(10, 0);
      c2d.moveTo(-0.5, 11.5);
      c2d.lineTo(10, 0);
      c2d.moveTo(-5.5, 0);
      c2d.lineTo(10, 0);
      c2d.stroke();

      // Cryogenic feed horn receiver node
      c2d.beginPath();
      c2d.arc(10, 0, 2.5, 0, Math.PI * 2);
      c2d.fillStyle = col;
      c2d.fill();

      // Subtle motorized TRACK indicator LED on rear yoke
      if (dish.servoEngaged) {
        c2d.beginPath();
        c2d.arc(-8.2, 0, 1.8, 0, Math.PI * 2);
        c2d.fillStyle = this.palette.lockHex;
        c2d.fill();
      }
      c2d.restore();
    }

    // Subtle top-right VLBI telemetry tag (band + synthetic resolution)
    c2d.save();
    c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = 'rgba(204, 224, 244, 0.68)';
    c2d.textAlign = 'center';
    // Authentic VLBI diffraction-limited angular resolution: θ_mas = (c / (ν · B)) * 206,264,806
    const freqHz = this.scenario.freqGhz * 1e9;
    const baselineM = this.scenario.baselineKm * 1000;
    const diffLimitMas = (299792458 / (freqHz * baselineM)) * 206264806;
    const synthMas = diffLimitMas / lerp(0.15, 1.0, this.cachedAvgClose);
    const thetaStr =
      synthMas >= 10 ? synthMas.toFixed(1) : synthMas >= 1 ? synthMas.toFixed(2) : synthMas.toFixed(3);
    const infoLine = this.profile.showNumericDeltas
      ? `${this.scenario.bandLabel} · B=${this.scenario.baselineKm} km · θ=${thetaStr} mas · CORR ${Math.round(this.cachedAvgClose * 100)}%`
      : `${this.scenario.bandLabel} · VLBI CORRELATION ${Math.round(this.cachedAvgClose * 100)}%`;
    c2d.fillText(infoLine, cx, compact ? cy - radius - 14 : cy - radius - 18);
    c2d.restore();

    this.drawSharedOverlays(
      c2d,
      w,
      h,
      this.lockHoldSec > 0.02
        ? {
            cx: srcX,
            cy: srcY,
            radius: 26,
            progress01: this.lockHoldSec / this.lockHoldTargetSec,
            label: `CORRELATED ${Math.round((this.lockHoldSec / this.lockHoldTargetSec) * 100)}%`,
          }
        : undefined
    );
  }

  protected getStageProgress01(): number {
    return clamp((this.stage - 1 + this.cachedAvgClose) / 3, 0, 1);
  }

  protected getPromptText(): string {
    if (this.stage === 1) {
      return this.scenario.stage1Ghosts === 2
        ? 'Aim both dishes to cross-check & cancel the twin multipath echoes, locking the true radio core.'
        : 'Steer both perimeter dishes (or beams) to reject the ghost echo and correlate the true beacon.';
    }
    if (this.stage === 2) {
      return 'Converge all 3 VLBI dishes on the gently drifting radio beacon — watch per-dish signal rings fill.';
    }
    return this.scenario.stage3DishCount === 4
      ? 'Quad VLBI array active — converge all 4 dishes on the pulsing beacon to synthesize full baseline lock.'
      : 'Track the rhythmic radio beacon pings with all 3 dishes until VLBI baseline chords lock mint green.';
  }

  protected solveCurrentStage(stage: 1 | 2 | 3): void {
    void stage;
    const src = this.getCurrentSourceUnit();
    for (let i = 0; i < this.dishes.length; i++) {
      const d = this.dishes[i];
      d.aimAngle = this.clampAimInward(d.rimAngle, this.getTrueAimForDish(d, src));
      d.aimSpring.snap(d.aimAngle);
    }
    this.refreshDishMetrics();
  }

  protected override verifySolved(_stage: 1 | 2 | 3): boolean {
    return this.refreshDishMetrics();
  }

  protected onAllStagesCleared(): void {
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.finishSuccess({
      accuracy: 0.95,
      proofFragmentSuffix: 'triangulation',
      dossierSnippet: `Sub-milliarcsecond VLBI correlation (${this.activeVariant?.label ?? 'Array'}, ${this.scenario.bandLabel}) locked on ${this.ctx.targetName}.`,
      telemetrySummary: `VLBI Convergence 95% · ${this.scenario.baselineKm} km · ${totalSec.toFixed(1)}s`,
      physicalPrinciple: 'Very Long Baseline Interferometry (VLBI, θ ≈ λ/B) & Multipath Ghost Rejection',
    });
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Very Long Baseline Interferometry (VLBI) links distant radio dishes so baseline separation B yields ultra-sharp resolution θ ≈ λ/B while cancelling single-dish multipath ghosts.',
      goalSummary:
        'Aim perimeter parabolic dishes to reject false echoes and converge correlated beams on stationary and drifting radio beacons.',
      controlsDesktop:
        'Drag any perimeter dish or its beam inside the circle; Tab switches dishes, ArrowLeft/Right slews aim.',
      controlsTouch: 'Touch-drag any rim dish or sweep its beam toward the radio beacon.',
      warmthEffect:
        'Warm H% broadens beam capture pockets; Cold H% narrows interferometric lobes and reveals baseline chord metrics.',
    };
  }
}
