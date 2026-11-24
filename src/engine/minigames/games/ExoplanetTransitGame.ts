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
import { drawGlowPolylineXY, drawInclinedAstrometryRing } from '../render/OpticalDrawUtils';
import {
  drawCrescentPlanet,
  drawLimbDarkenedStar,
  drawOpticalStar,
} from '../render/StarPSFAtlas';
import { clamp, lerp } from '../tactilePhysics';
import type {
  CosmicPlateId,
  InstrumentFieldGuide,
  MinigameVariantSpec,
  SpectralClass,
} from '../types';

interface TransitScenarioConfig {
  starClass: SpectralClass;
  starLabel: string;
  planetColorA: string;
  planetColorB: string;
  grazing: boolean;
  resonantPair: boolean;
  flareSpikes: boolean;
  spotModulation: boolean;
  windowDays: number;
  baseDepthScale: number;
}

interface SizeStopRect {
  idx: 0 | 1 | 2;
  label: string;
  subLabel: string;
  depthPpt: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const TRANSIT_PLATES: readonly [CosmicPlateId, CosmicPlateId, CosmicPlateId] = [
  'sombrero',
  'southern_ring',
  'rho_ophiuchi',
];

const TRANSIT_VARIANTS: readonly MinigameVariantSpec[] = [
  { index: 0, id: 'exoplanet_transit_v1', label: 'Hot Jupiter Dip', plateId: 'sombrero' },
  { index: 1, id: 'exoplanet_transit_v2', label: 'Twin Resonant Worlds', plateId: 'southern_ring' },
  { index: 2, id: 'exoplanet_transit_v3', label: 'Young Protostar Transit', plateId: 'rho_ophiuchi' },
  { index: 3, id: 'exoplanet_transit_v4', label: 'Grazing Inclination', plateId: 'sombrero' },
];

const SCENARIOS: readonly TransitScenarioConfig[] = [
  {
    starClass: 'G',
    starLabel: 'G2V · 5780 K',
    planetColorA: '#9ed2ff',
    planetColorB: '#ffd48c',
    grazing: false,
    resonantPair: false,
    flareSpikes: false,
    spotModulation: true,
    windowDays: 12.0,
    baseDepthScale: 1.0,
  },
  {
    starClass: 'M',
    starLabel: 'M8V · 2650 K',
    planetColorA: '#ffaa76',
    planetColorB: '#9ee8ff',
    grazing: false,
    resonantPair: true,
    flareSpikes: false,
    spotModulation: false,
    windowDays: 8.0,
    baseDepthScale: 1.15,
  },
  {
    starClass: 'K',
    starLabel: 'K3V · 4620 K',
    planetColorA: '#ffc987',
    planetColorB: '#a8dcff',
    grazing: false,
    resonantPair: false,
    flareSpikes: true,
    spotModulation: false,
    windowDays: 14.0,
    baseDepthScale: 0.96,
  },
  {
    starClass: 'A',
    starLabel: 'A2IV · 8900 K',
    planetColorA: '#b8dcff',
    planetColorB: '#ffe2a6',
    grazing: true,
    resonantPair: false,
    flareSpikes: false,
    spotModulation: false,
    windowDays: 16.0,
    baseDepthScale: 0.92,
  },
];

// Physically quadratic transit depth ΔF = (Rp / R★)² for a compact 0.70 R☉ star (~76.4 R⊕):
// (4.6/76.4)² = 3.6 ppt, (7.7/76.4)² = 10.2 ppt, (10.4/76.4)² = 18.5 ppt.
const SIZE_CLASSES: readonly { idx: 0 | 1 | 2; label: string; subLabel: string; depthPpt: number; visualR: number }[] = [
  { idx: 0, label: '4.6 R⊕', subLabel: 'MINI-NEPTUNE', depthPpt: 3.6, visualR: 5.2 },
  { idx: 1, label: '7.7 R⊕', subLabel: 'SATURN-CLASS', depthPpt: 10.2, visualR: 7.6 },
  { idx: 2, label: '10.4 R⊕', subLabel: 'GAS GIANT', depthPpt: 18.5, visualR: 10.6 },
];

const CURVE_SAMPLES = 96;
const MATCH_SAMPLES = 64;
const FREQ_A_MIN = 1.0;
const FREQ_A_MAX = 3.0;
const FREQ_B_MIN = 1.9;
const FREQ_B_MAX = 4.6;

function wrap01(v: number): number {
  const m = v % 1;
  return m < 0 ? m + 1 : m;
}

function wrapDiff01(a: number, b: number): number {
  let d = wrap01(a) - wrap01(b);
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
}

/**
 * Computes normalized orbital semi-major axis following Kepler's Third Law (a ∝ P^(2/3) = f^(-2/3)).
 */
function keplerSemiMajor01(freq: number, fMin: number, fMax: number): number {
  const aCur = Math.pow(Math.max(0.2, freq), -2 / 3);
  const aMin = Math.pow(fMax, -2 / 3);
  const aMax = Math.pow(fMin, -2 / 3);
  return clamp((aCur - aMin) / Math.max(0.0001, aMax - aMin), 0, 1);
}

/**
 * Inverse Kepler mapping: converts normalized semi-major axis a01 (0=innermost, 1=outermost) back to speed01.
 */
function speed01FromKeplerAxis(a01: number, fMin: number, fMax: number): number {
  const aMin = Math.pow(fMax, -2 / 3);
  const aMax = Math.pow(fMin, -2 / 3);
  const a = lerp(aMin, aMax, clamp(a01, 0, 1));
  const freq = Math.pow(a, -1.5);
  return clamp((freq - fMin) / Math.max(0.0001, fMax - fMin), 0, 1);
}

/**
 * TRN-08 — Exoplanet Transit Lab
 * Keplerian orbital photometry: drag orbital ellipses radially (Kepler's 3rd Law: a ∝ P^(2/3)),
 * scrub the light curve or planet handle to align transit epoch, and select planetary radius (R⊕)
 * on Stage 3 while watching limb-darkened Mandel-Agol transits match the observed starlight flux.
 */
export class ExoplanetTransitGame extends BaseCosmicMinigame {
  readonly id = 'exoplanet_transit';
  readonly title = 'EXOPLANET TRANSIT LAB';
  readonly subtitle = 'Keplerian Orbit & Transit Matching';
  readonly instrumentCode = 'TRN-08';
  readonly platePool = TRANSIT_PLATES;
  readonly variants = TRANSIT_VARIANTS;

  private scenario: TransitScenarioConfig = SCENARIOS[0];
  private userSpeedA = 0.3;
  private userSpeedB = 0.65;
  private userPhase = 0.2;
  private userSizeIdx: 0 | 1 | 2 = 1;

  private targetSpeedA = 0.6;
  private targetSpeedB = 0.35;
  private targetPhase = 0.55;
  private targetSizeIdx: 0 | 1 | 2 = 1;
  private phaseOffsetB = 1.3;
  private flarePos1 = 0.31;
  private flarePos2 = 0.74;

  private activeOrbitKey: 'A' | 'B' = 'A';
  private dragMode: 'speedA' | 'speedB' | 'phase' | 'orbitA' | 'orbitB' | 'graphPhase' | null = null;
  private dragStartX = 0;
  private dragStartPhase = 0;
  private hasInteracted = false;

  private cachedMatch = 0;
  private accSum = 0;
  private accCount = 0;
  private lastDipSparkAt = -10;

  // Pre-allocated render buffers (ZERO per-frame allocations)
  private readonly targetCurveXY = new Float32Array((CURVE_SAMPLES + 1) * 2);
  private readonly userCurveXY = new Float32Array((CURVE_SAMPLES + 1) * 2);
  private readonly residualCurveXY = new Float32Array((CURVE_SAMPLES + 1) * 2);
  private readonly vernierItems: VernierItemInput[] = [];
  private readonly activeStrips: VernierStripSpec[] = [];
  private readonly sizeStops: SizeStopRect[] = [];

  protected override onMount(): void {
    this.scenario = SCENARIOS[this.iterationIndex % SCENARIOS.length];
    this.lockHoldTargetSec = 0.55;
    this.accSum = 0;
    this.accCount = 0;
    this.hasInteracted = false;
  }

  protected onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.scenario = SCENARIOS[this.iterationIndex % SCENARIOS.length];
    this.activeOrbitKey = 'A';
    this.dragMode = null;

    this.targetSpeedA = 0.24 + rng() * 0.56;
    if (stage === 1) {
      this.targetSpeedB = 0.5;
    } else if (this.scenario.resonantPair) {
      // Resonant 2:1 or 3:2 orbital period pairing with guaranteed frequency separation >= 0.7
      const freqA = lerp(FREQ_A_MIN, FREQ_A_MAX, this.targetSpeedA);
      const ratio = rng() > 0.45 ? 1.5 : 2.0;
      const desiredB = clamp(freqA * ratio, FREQ_B_MIN + 0.25, FREQ_B_MAX - 0.15);
      this.targetSpeedB = clamp((desiredB - FREQ_B_MIN) / (FREQ_B_MAX - FREQ_B_MIN), 0.16, 0.86);
    } else {
      let sB = 0.2 + rng() * 0.62;
      const freqA = lerp(FREQ_A_MIN, FREQ_A_MAX, this.targetSpeedA);
      let freqB = lerp(FREQ_B_MIN, FREQ_B_MAX, sB);
      if (Math.abs(freqB - freqA) < 0.72) {
        sB = sB > 0.5 ? clamp(sB - 0.34, 0.14, 0.86) : clamp(sB + 0.34, 0.14, 0.86);
        freqB = lerp(FREQ_B_MIN, FREQ_B_MAX, sB);
        if (Math.abs(freqB - freqA) < 0.72) {
          sB = this.targetSpeedA > 0.5 ? 0.18 : 0.84;
        }
      }
      this.targetSpeedB = sB;
    }

    this.targetPhase = 0.14 + rng() * 0.72;
    this.phaseOffsetB = 0.9 + rng() * 3.8;
    this.targetSizeIdx = stage < 3 ? 1 : (Math.floor(rng() * 3) as 0 | 1 | 2);
    this.flarePos1 = 0.18 + rng() * 0.25;
    this.flarePos2 = 0.62 + rng() * 0.24;

    this.userSpeedA = this.targetSpeedA > 0.5 ? 0.18 : 0.82;
    this.userSpeedB = stage === 1 ? this.targetSpeedB : this.targetSpeedB > 0.5 ? 0.16 : 0.84;
    this.userPhase = wrap01(this.targetPhase + 0.34);
    this.userSizeIdx = stage < 3 ? this.targetSizeIdx : this.targetSizeIdx === 1 ? 0 : 1;
    this.cachedMatch = this.computeMatch01();
  }

  private getFreqA(speed01: number): number {
    return lerp(FREQ_A_MIN, FREQ_A_MAX, clamp(speed01, 0, 1));
  }

  private getFreqB(speed01: number): number {
    return lerp(FREQ_B_MIN, FREQ_B_MAX, clamp(speed01, 0, 1));
  }

  private getDepthPpt(sizeIdx: 0 | 1 | 2): number {
    return SIZE_CLASSES[sizeIdx].depthPpt * this.scenario.baseDepthScale;
  }

  /**
   * Evaluates normalized relative stellar flux (1.000 = baseline, dips down to ~0.978 = 22 ppt).
   * Transit occurs strictly at cos(angle) > 0, sin(angle) ~ 0 — exact match with front-of-star visual crossing!
   */
  private evalFlux(
    u: number,
    speedA: number,
    speedB: number,
    phase: number,
    sizeIdx: 0 | 1 | 2,
    includeObservedNoise: boolean
  ): number {
    const freqA = this.getFreqA(speedA);
    const angA = (u + phase) * Math.PI * 2 * freqA;
    let dipPpt = 0;

    // Planet A transit: front of star (cos > 0) crossing stellar disc (|sin| < halfChord)
    if (Math.cos(angA) > 0) {
      const halfChordA = this.scenario.grazing ? 0.27 : 0.32;
      const zA = Math.abs(Math.sin(angA)) / halfChordA;
      if (zA < 1) {
        const profile = this.scenario.grazing
          ? Math.pow(1 - zA, 1.38)
          : Math.pow(1 - zA * zA, 0.36); // Limb-darkened Mandel-Agol U-shape
        dipPpt += profile * this.getDepthPpt(sizeIdx);
      }
    }

    if (this.stage >= 2) {
      const freqB = this.getFreqB(speedB);
      const angB = (u + phase) * Math.PI * 2 * freqB + this.phaseOffsetB;
      if (Math.cos(angB) > 0) {
        const halfChordB = 0.26;
        const zB = Math.abs(Math.sin(angB)) / halfChordB;
        if (zB < 1) {
          const profileB = Math.pow(1 - zB * zB, 0.42);
          dipPpt += profileB * (7.2 * this.scenario.baseDepthScale);
        }
      }
    }

    let flux = 1.0 - dipPpt * 0.001;

    if (includeObservedNoise && this.stage === 3) {
      if (this.scenario.flareSpikes) {
        // Authentic upward stellar flares (ignore upward peaks, fit downward transits!)
        const d1 = (u - this.flarePos1) / 0.018;
        const d2 = (u - this.flarePos2) / 0.015;
        flux += 0.0046 * Math.exp(-d1 * d1) + 0.0034 * Math.exp(-d2 * d2);
      } else if (this.scenario.spotModulation) {
        flux += 0.0009 * Math.sin(u * Math.PI * 4 + 0.6);
      } else {
        flux += 0.0007 * Math.sin(u * 34 + 0.4);
      }
    }

    return clamp(flux, 0.974, 1.006);
  }

  private getMatchThreshold(): number {
    // Warm H% = more forgiving (0.80); Balanced = 0.83; Cold H% = sharper precision (0.87)
    return this.palette.mode === 'warm' ? 0.80 : this.palette.mode === 'cold' ? 0.87 : 0.83;
  }

  private isParamMatched(kind: 'speedA' | 'speedB' | 'phase'): boolean {
    if (kind === 'phase') {
      const tol = 0.022 * this.profile.detentWellScale;
      return Math.abs(wrapDiff01(this.userPhase, this.targetPhase)) <= tol;
    }
    const tol = 0.032 * this.profile.detentWellScale;
    if (kind === 'speedA') return Math.abs(this.userSpeedA - this.targetSpeedA) <= tol;
    return Math.abs(this.userSpeedB - this.targetSpeedB) <= tol;
  }

  private computeMatch01(): number {
    let weightedErrSq = 0;
    let weightSum = 0;
    for (let i = 0; i <= MATCH_SAMPLES; i++) {
      const u = i / MATCH_SAMPLES;
      const ft = this.evalFlux(u, this.targetSpeedA, this.targetSpeedB, this.targetPhase, this.targetSizeIdx, false);
      const fu = this.evalFlux(u, this.userSpeedA, this.userSpeedB, this.userPhase, this.userSizeIdx, false);
      // Weight transit dip regions 4x higher so flat baseline never grants false passes
      const dipWeight = ft < 0.999 || fu < 0.999 ? 4.0 : 1.0;
      const diffPpt = (ft - fu) * 1000;
      weightedErrSq += diffPpt * diffPpt * dipWeight;
      weightSum += dipWeight;
    }
    const weightedRmsPpt = Math.sqrt(weightedErrSq / Math.max(1, weightSum));

    // Warm H% widens tolerance (detentWellScale 1.35 -> looser); Cold H% tightens (0.72 -> surgical)
    const rmsTolPpt = lerp(3.4, 6.2, clamp((this.profile.detentWellScale - 0.7) / 0.68, 0, 1));
    const curveScore = clamp(1 - weightedRmsPpt / rmsTolPpt, 0, 1);

    // Parameter agreement guard prevents aliased false lock
    const sAErr = Math.abs(this.userSpeedA - this.targetSpeedA);
    const sBErr = this.stage >= 2 ? Math.abs(this.userSpeedB - this.targetSpeedB) : 0;
    const phErr = Math.abs(wrapDiff01(this.userPhase, this.targetPhase));
    const paramTol = 0.24 * this.profile.detentWellScale;
    const paramScore = clamp(1 - (sAErr + sBErr + phErr) / (paramTol * (this.stage >= 2 ? 2.4 : 1.7)), 0, 1);

    const combined = curveScore * 0.68 + paramScore * 0.32;
    if (this.stage === 3 && this.userSizeIdx !== this.targetSizeIdx) {
      return Math.min(combined, 0.72);
    }
    return combined;
  }

  private getLayoutGeometry(w: number, h: number) {
    const compact = h < 450;
    const starCx = w * 0.5;
    const starCy = compact ? h * 0.245 : h * 0.255;
    const starR = compact ? 16.5 : 25;
    const minRx = Math.min(w * 0.105, compact ? 64 : 84);
    const maxRx = Math.min(w * 0.34, compact ? 210 : 272);
    const ryA = compact ? 14 : 21;
    const ryB = compact ? 20 : 29;

    const gLeft = w * (compact ? 0.11 : 0.13);
    const gRight = w * (compact ? 0.89 : 0.87);
    const gW = gRight - gLeft;
    const gTop = compact ? h * 0.375 : h * 0.435;
    const gH = compact ? h * 0.19 : h * 0.205;

    return { starCx, starCy, starR, minRx, maxRx, ryA, ryB, gLeft, gRight, gW, gTop, gH, compact };
  }

  private getOrbitRadiusPx(which: 'A' | 'B', speed01: number, minRx: number, maxRx: number): number {
    if (which === 'A') {
      const a01 = keplerSemiMajor01(this.getFreqA(speed01), FREQ_A_MIN, FREQ_A_MAX);
      return lerp(minRx, maxRx * 0.86, a01);
    }
    const a01 = keplerSemiMajor01(this.getFreqB(speed01), FREQ_B_MIN, FREQ_B_MAX);
    return lerp(minRx * 1.12, maxRx, a01);
  }

  private snapValue(v: number, target: number, isWrap = false): number {
    const pullRad = 0.055 * this.profile.detentWellScale;
    const diff = isWrap ? wrapDiff01(target, v) : target - v;
    if (Math.abs(diff) < pullRad) {
      return isWrap ? wrap01(v + diff * 0.42) : clamp(v + diff * 0.42, 0, 1);
    }
    return isWrap ? wrap01(v) : clamp(v, 0, 1);
  }

  private applyStripDrag(strip: VernierStripSpec, px: number): void {
    const raw = valueFromStripX(strip, px);
    if (strip.key === 'speedA') {
      this.userSpeedA = this.snapValue(raw, this.targetSpeedA);
    } else if (strip.key === 'speedB') {
      this.userSpeedB = this.snapValue(raw, this.targetSpeedB);
    } else if (strip.key === 'phase') {
      this.userPhase = this.snapValue(raw, this.targetPhase, true);
    }
  }

  private applyRadialOrbitDrag(which: 'orbitA' | 'orbitB', px: number, py: number): void {
    const { starCx, starCy, minRx, maxRx, ryA, ryB } = this.getLayoutGeometry(this.width, this.height);
    const ry = which === 'orbitA' ? ryA : ryB;
    const dx = px - starCx;
    const dy = (py - starCy) * (maxRx / Math.max(12, ry)) * 0.35;
    const effR = Math.hypot(dx, dy);

    if (which === 'orbitA') {
      const a01 = clamp((effR - minRx) / Math.max(1, maxRx * 0.86 - minRx), 0, 1);
      const nextSpeed = speed01FromKeplerAxis(a01, FREQ_A_MIN, FREQ_A_MAX);
      this.userSpeedA = this.snapValue(nextSpeed, this.targetSpeedA);
    } else {
      const a01 = clamp((effR - minRx * 1.12) / Math.max(1, maxRx - minRx * 1.12), 0, 1);
      const nextSpeed = speed01FromKeplerAxis(a01, FREQ_B_MIN, FREQ_B_MAX);
      this.userSpeedB = this.snapValue(nextSpeed, this.targetSpeedB);
    }
  }

  protected override onPointerDown(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;
    const { x: px, y: py } = ev;
    this.hasInteracted = true;

    // 1. Stage 3 etched aperture-stop planetary size selectors
    for (let i = 0; i < this.sizeStops.length; i++) {
      const stop = this.sizeStops[i];
      if (px >= stop.x - 4 && px <= stop.x + stop.w + 4 && py >= stop.y - 4 && py <= stop.y + stop.h + 4) {
        this.userSizeIdx = stop.idx;
        const matched = this.userSizeIdx === this.targetSizeIdx;
        this.ctx.audio?.playTumblerClick(0.75, matched);
        platform.triggerHaptic('vernierTick', matched ? 0.72 : 0.45);
        this.emitHud(true);
        return;
      }
    }

    // 2. Bottom Zeiss vernier strips
    for (let i = 0; i < this.activeStrips.length; i++) {
      const s = this.activeStrips[i];
      if (hitVernierStrip(s, px, py)) {
        this.dragMode = s.key as 'speedA' | 'speedB' | 'phase';
        if (s.key === 'speedA') this.activeOrbitKey = 'A';
        if (s.key === 'speedB') this.activeOrbitKey = 'B';
        this.applyStripDrag(s, px);
        platform.triggerHaptic('vernierTick', 0.45);
        return;
      }
    }

    const g = this.getLayoutGeometry(this.width, this.height);

    // 3. Direct light-curve horizontal scrub shifts EPOCH PHASE cleanly (decoupled from orbital radius!)
    if (px >= g.gLeft - 10 && px <= g.gRight + 10 && py >= g.gTop - 8 && py <= g.gTop + g.gH + 8) {
      this.dragMode = 'graphPhase';
      this.dragStartX = px;
      this.dragStartPhase = this.userPhase;
      platform.triggerHaptic('vernierTick', 0.4);
      return;
    }

    // 4. Orbital ellipse radial drag (decoupled from phase!)
    if (py < g.gTop - 6) {
      const rxA = this.getOrbitRadiusPx('A', this.userSpeedA, g.minRx, g.maxRx);
      const rxB = this.getOrbitRadiusPx('B', this.userSpeedB, g.minRx, g.maxRx);
      const distX = Math.abs(px - g.starCx);
      if (this.stage >= 2 && Math.abs(distX - rxB) < Math.abs(distX - rxA)) {
        this.dragMode = 'orbitB';
        this.activeOrbitKey = 'B';
      } else {
        this.dragMode = 'orbitA';
        this.activeOrbitKey = 'A';
      }
      this.applyRadialOrbitDrag(this.dragMode, px, py);
      platform.triggerHaptic('vernierTick', 0.45);
    }
  }

  protected override onPointerMove(ev: PointerLocalEvent): void {
    if (!this.dragMode || this.stageClearTimer > 0) return;
    if (this.dragMode === 'orbitA' || this.dragMode === 'orbitB') {
      this.applyRadialOrbitDrag(this.dragMode, ev.x, ev.y);
    } else if (this.dragMode === 'graphPhase') {
      const g = this.getLayoutGeometry(this.width, this.height);
      const deltaFrac = (ev.x - this.dragStartX) / Math.max(120, g.gW);
      this.userPhase = this.snapValue(wrap01(this.dragStartPhase - deltaFrac), this.targetPhase, true);
    } else {
      for (let i = 0; i < this.activeStrips.length; i++) {
        if (this.activeStrips[i].key === this.dragMode) {
          this.applyStripDrag(this.activeStrips[i], ev.x);
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
    const step = e.shiftKey ? 0.05 : 0.022;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.hasInteracted = true;
      this.userPhase = wrap01(this.userPhase - step);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.hasInteracted = true;
      this.userPhase = wrap01(this.userPhase + step);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.hasInteracted = true;
      if (this.stage >= 2 && this.activeOrbitKey === 'B') {
        this.userSpeedB = clamp(this.userSpeedB + step, 0, 1);
      } else {
        this.userSpeedA = clamp(this.userSpeedA + step, 0, 1);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.hasInteracted = true;
      if (this.stage >= 2 && this.activeOrbitKey === 'B') {
        this.userSpeedB = clamp(this.userSpeedB - step, 0, 1);
      } else {
        this.userSpeedA = clamp(this.userSpeedA - step, 0, 1);
      }
    } else if (e.key === 'Tab' && this.stage >= 2) {
      e.preventDefault();
      this.activeOrbitKey = this.activeOrbitKey === 'A' ? 'B' : 'A';
      this.ctx.audio?.playTumblerClick(0.55, false);
    } else if (this.stage === 3 && (e.key === '1' || e.key === '2' || e.key === '3')) {
      this.hasInteracted = true;
      this.userSizeIdx = (Number(e.key) - 1) as 0 | 1 | 2;
      this.ctx.audio?.playTumblerClick(0.75, this.userSizeIdx === this.targetSizeIdx);
    }
  }

  protected onUpdate(dt: number): void {
    const match = this.computeMatch01();
    this.cachedMatch = match;

    if (this.hasInteracted && this.stageClearTimer <= 0) {
      this.accSum += match;
      this.accCount += 1;
    }

    this.ctx.audio?.updateBeatSynth({
      beatHz: (1 - match) * 7.5,
      harmonicLock: match,
      warmth: this.profile.harmonicWarmthGain,
      strain: 0,
    });

    this.ctx.showcase?.applyInstrumentPatch({
      progress: this.getStageProgress01(),
      jetResonance: match,
    });

    if (this.stageClearTimer > 0) return;

    const threshold = this.getMatchThreshold();
    const depthOk = this.stage < 3 || this.userSizeIdx === this.targetSizeIdx;
    if (match >= threshold && depthOk) {
      this.lockHoldSec += dt;
      if (this.lockHoldSec >= this.lockHoldTargetSec) {
        const g = this.getLayoutGeometry(this.width, this.height);
        this.triggerStageClear(
          `TRANSIT ORBIT ${this.stage}/3 CONFIRMED`,
          this.stage < 3 ? 0.58 : 0.42,
          g.starCx,
          g.starCy
        );
      }
    } else {
      this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.7);
    }
  }

  protected onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const g = this.getLayoutGeometry(w, h);
    const match = this.cachedMatch;
    const lockedNow = match >= this.getMatchThreshold() && (this.stage < 3 || this.userSizeIdx === this.targetSizeIdx);

    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: 4,
      alpha: 0.46,
      brightness: 0.8,
      tintAlpha: 0.46,
      reticleDuck: { cx: g.starCx, cy: g.starCy, r: g.maxRx * 0.72 },
    });

    const uLive = (this.elapsedSec * 0.14) % 1;
    const liveFlux = this.evalFlux(uLive, this.userSpeedA, this.userSpeedB, this.userPhase, this.userSizeIdx, false);
    const liveDip01 = clamp((1.0 - liveFlux) / 0.018, 0, 1);

    // Subtle 2.5D ecliptic astrometry ring around host system
    drawInclinedAstrometryRing(c2d, g.starCx, g.starCy, g.maxRx * 1.06, g.ryB * 1.25, 0, this.palette.secondaryRgb, {
      backAlpha: 0.06,
      frontAlpha: 0.15,
      ticks: 6,
    });

    const freqA = this.getFreqA(this.userSpeedA);
    const rxA = this.getOrbitRadiusPx('A', this.userSpeedA, g.minRx, g.maxRx);
    const angA = (uLive + this.userPhase) * Math.PI * 2 * freqA;
    const pAx = g.starCx + Math.sin(angA) * rxA;
    const pAy = g.starCy + Math.cos(angA) * g.ryA;
    const pAFront = Math.cos(angA) > 0;
    const aLocked = this.isParamMatched('speedA');
    const planetRA = SIZE_CLASSES[this.userSizeIdx].visualR * (g.compact ? 0.84 : 1.0);

    const freqB = this.getFreqB(this.userSpeedB);
    const rxB = this.getOrbitRadiusPx('B', this.userSpeedB, g.minRx, g.maxRx);
    const angB = (uLive + this.userPhase) * Math.PI * 2 * freqB + this.phaseOffsetB;
    const pBx = g.starCx + Math.sin(angB) * rxB;
    const pBy = g.starCy + Math.cos(angB) * g.ryB;
    const pBFront = Math.cos(angB) > 0;
    const bLocked = this.stage < 2 || this.isParamMatched('speedB');
    const planetRB = g.compact ? 4.8 : 6.0;

    // 1. Back hemisphere of orbital tracks + behind-star planets (true Z-order!)
    this.drawOrbitArcHalf(c2d, g.starCx, g.starCy, rxA, g.ryA, Math.PI, Math.PI * 2, aLocked, this.activeOrbitKey === 'A', true);
    if (this.stage >= 2) {
      this.drawOrbitArcHalf(c2d, g.starCx, g.starCy, rxB, g.ryB, Math.PI, Math.PI * 2, bLocked, this.activeOrbitKey === 'B', true);
    }

    if (!pAFront) {
      drawCrescentPlanet(c2d, pAx, pAy, planetRA, Math.atan2(g.starCy - pAy, g.starCx - pAx), aLocked ? this.palette.lockHex : this.scenario.planetColorA, '#0a1220');
    }
    if (this.stage >= 2 && !pBFront) {
      drawCrescentPlanet(c2d, pBx, pBy, planetRB, Math.atan2(g.starCy - pBy, g.starCx - pBx), bLocked ? this.palette.lockHex : this.scenario.planetColorB, '#0a1220');
    }

    // 2. Host Star (Eddington limb-darkened photosphere + soft optical PSF corona that subtly dims on transit)
    const starAlpha = clamp(1 - liveDip01 * 0.22, 0.72, 1.0);
    drawOpticalStar(c2d, g.starCx, g.starCy, g.starR * 0.62, {
      spectralClass: this.scenario.starClass,
      spikes: 6,
      alpha: starAlpha * (this.palette.mode === 'cold' ? 0.56 : 0.72),
      vibeMode: this.palette.mode,
      timeSec: this.elapsedSec,
    });
    drawLimbDarkenedStar(c2d, g.starCx, g.starCy, g.starR, this.scenario.starClass, starAlpha);

    // 3. Front hemisphere of orbital tracks + transiting foreground planets
    this.drawOrbitArcHalf(c2d, g.starCx, g.starCy, rxA, g.ryA, 0, Math.PI, aLocked, this.activeOrbitKey === 'A', false);
    if (this.stage >= 2) {
      this.drawOrbitArcHalf(c2d, g.starCx, g.starCy, rxB, g.ryB, 0, Math.PI, bLocked, this.activeOrbitKey === 'B', false);
    }

    // Drag grab ticks on orbit edges
    this.drawOrbitGrabTick(c2d, g.starCx + rxA, g.starCy, aLocked ? this.palette.lockHex : this.palette.accentHex, 'A');
    if (this.stage >= 2) {
      this.drawOrbitGrabTick(c2d, g.starCx - rxB, g.starCy, bLocked ? this.palette.lockHex : this.palette.secondaryHex, 'B');
    }

    if (pAFront) {
      drawCrescentPlanet(
        c2d,
        pAx,
        pAy,
        planetRA,
        Math.atan2(g.starCy - pAy, g.starCx - pAx),
        aLocked ? this.palette.lockHex : this.scenario.planetColorA,
        '#05070e'
      );
    }
    if (this.stage >= 2 && pBFront) {
      drawCrescentPlanet(
        c2d,
        pBx,
        pBy,
        planetRB,
        Math.atan2(g.starCy - pBy, g.starCx - pBx),
        bLocked ? this.palette.lockHex : this.scenario.planetColorB,
        '#05070e'
      );
    }

    // Star classification micro-tag cleanly above outer astrometry ring (zero planet eclipse!)
    const starLabelY = Math.max(g.compact ? 48 : 66, g.starCy - Math.max(g.ryB * 1.25, g.starR) - 10);
    c2d.save();
    c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = 'rgba(212, 228, 244, 0.62)';
    c2d.textAlign = 'center';
    c2d.fillText(this.scenario.starLabel, g.starCx, starLabelY);
    c2d.restore();

    // 4. Photometric Light-Curve Instrument Panel (0.978 – 1.003 normalized flux)
    this.renderLightCurvePanel(c2d, g, uLive, liveFlux, liveDip01, lockedNow);

    // 5. Stage 3 Etched Aperture-Stop Planetary Radius Selector (zero rounded HTML pills)
    this.renderSizeStops(c2d, g, w);

    // 6. Bottom Precision Zeiss Verniers (Kepler period in days + orbital epoch)
    const pADays = this.scenario.windowDays / freqA;
    const pBDays = this.scenario.windowDays / freqB;
    const phaseDeg = Math.round(this.userPhase * 360);

    this.vernierItems.length = 0;
    this.vernierItems.push({
      key: 'speedA',
      label: this.stage === 1 ? 'ORBIT PERIOD' : 'PLANET A',
      val01: this.userSpeedA,
      locked: aLocked,
      rightText: `${pADays.toFixed(1)} d`,
    });
    if (this.stage >= 2) {
      this.vernierItems.push({
        key: 'speedB',
        label: 'PLANET B',
        val01: this.userSpeedB,
        locked: bLocked,
        rightText: `${pBDays.toFixed(1)} d`,
      });
    }
    this.vernierItems.push({
      key: 'phase',
      label: 'TRANSIT EPOCH',
      val01: this.userPhase,
      locked: this.isParamMatched('phase'),
      rightText: `${phaseDeg}°`,
    });

    const stripY = g.compact ? h - 84 : h - 106;
    layoutVernierRowInto(this.activeStrips, w, h, this.vernierItems, stripY);
    for (let i = 0; i < this.activeStrips.length; i++) {
      drawVernierStrip(c2d, this.activeStrips[i], this.palette.accentHex, this.palette.lockHex);
    }

    this.drawSharedOverlays(
      c2d,
      w,
      h,
      this.lockHoldSec > 0.02
        ? {
            cx: g.starCx,
            cy: g.starCy,
            radius: g.starR + (g.compact ? 16 : 22),
            progress01: this.lockHoldSec / this.lockHoldTargetSec,
            label: `LOCKING ${Math.round((this.lockHoldSec / this.lockHoldTargetSec) * 100)}%`,
          }
        : undefined
    );
  }

  private drawOrbitArcHalf(
    c2d: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    startA: number,
    endA: number,
    locked: boolean,
    selected: boolean,
    isBack: boolean
  ): void {
    c2d.save();
    const baseAlpha = isBack ? (locked ? 0.42 : 0.16) : locked ? 0.85 : selected ? 0.52 : 0.34;
    c2d.strokeStyle = locked
      ? `rgba(${this.palette.lockRgb}, ${baseAlpha.toFixed(2)})`
      : `rgba(${this.palette.secondaryRgb}, ${baseAlpha.toFixed(2)})`;
    c2d.lineWidth = locked ? 1.8 : selected ? 1.5 : 1.05;
    if (isBack && typeof c2d.setLineDash === 'function') {
      c2d.setLineDash([4, 5]);
    }
    c2d.beginPath();
    if (typeof c2d.ellipse === 'function') {
      c2d.ellipse(cx, cy, rx, ry, 0, startA, endA);
    } else {
      c2d.arc(cx, cy, rx, startA, endA);
    }
    c2d.stroke();
    c2d.restore();
  }

  private drawOrbitGrabTick(
    c2d: CanvasRenderingContext2D,
    x: number,
    y: number,
    col: string,
    tag: string
  ): void {
    c2d.save();
    c2d.strokeStyle = col;
    c2d.lineWidth = 1.4;
    c2d.beginPath();
    c2d.moveTo(x - 4, y);
    c2d.lineTo(x + 4, y);
    c2d.moveTo(x, y - 4);
    c2d.lineTo(x, y + 4);
    c2d.stroke();
    c2d.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = col;
    c2d.textAlign = 'center';
    c2d.fillText(tag, x, y - 7);
    c2d.restore();
  }

  private renderLightCurvePanel(
    c2d: CanvasRenderingContext2D,
    g: ReturnType<ExoplanetTransitGame['getLayoutGeometry']>,
    uLive: number,
    liveFlux: number,
    liveDip01: number,
    lockedNow: boolean
  ): void {
    const fluxMin = 0.976;
    const fluxMax = 1.005;
    const mapY = (flux: number) => g.gTop + g.gH - clamp((flux - fluxMin) / (fluxMax - fluxMin), 0, 1) * g.gH;

    // Etched optical photometer frame
    c2d.save();
    c2d.fillStyle = this.palette.mode === 'cold' ? 'rgba(3, 10, 18, 0.62)' : 'rgba(6, 10, 18, 0.56)';
    c2d.fillRect(g.gLeft, g.gTop, g.gW, g.gH);
    c2d.strokeStyle = 'rgba(186, 214, 240, 0.18)';
    c2d.lineWidth = 1;
    c2d.strokeRect(g.gLeft, g.gTop, g.gW, g.gH);

    // Subtle flux calibration ticks (1.000, 0.990, 0.980)
    const ticks = [1.0, 0.99, 0.98];
    c2d.strokeStyle = 'rgba(186, 214, 240, 0.08)';
    c2d.beginPath();
    for (let i = 0; i < ticks.length; i++) {
      const ty = mapY(ticks[i]);
      c2d.moveTo(g.gLeft, ty);
      c2d.lineTo(g.gRight, ty);
    }
    c2d.stroke();

    c2d.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = 'rgba(200, 222, 244, 0.58)';
    c2d.textAlign = 'right';
    c2d.fillText('1.000', g.gLeft - 6, mapY(1.0) + 3);
    c2d.fillText('0.990', g.gLeft - 6, mapY(0.99) + 3);
    c2d.fillText('0.980', g.gLeft - 6, mapY(0.98) + 3);

    c2d.textAlign = 'left';
    c2d.fillText('FLUX', g.gLeft + 2, g.gTop - 5);
    c2d.textAlign = 'right';
    c2d.fillText(
      `WINDOW ${this.scenario.windowDays.toFixed(0)} DAYS · SCRUB TO SHIFT EPOCH`,
      g.gRight - 2,
      g.gTop - 5
    );
    c2d.restore();

    // Populate pre-allocated curve vertex buffers
    for (let i = 0; i <= CURVE_SAMPLES; i++) {
      const u = i / CURVE_SAMPLES;
      const x = g.gLeft + u * g.gW;
      const ft = this.evalFlux(u, this.targetSpeedA, this.targetSpeedB, this.targetPhase, this.targetSizeIdx, true);
      const fu = this.evalFlux(u, this.userSpeedA, this.userSpeedB, this.userPhase, this.userSizeIdx, false);
      const idx = i * 2;
      this.targetCurveXY[idx] = x;
      this.targetCurveXY[idx + 1] = mapY(ft);
      this.userCurveXY[idx] = x;
      this.userCurveXY[idx + 1] = mapY(fu);
      this.residualCurveXY[idx] = x;
      this.residualCurveXY[idx + 1] = mapY(1.0 + (fu - ft) * 0.55);
    }

    // Cold H%: crisp faint photometric residual hairline
    if (this.profile.showNumericDeltas) {
      c2d.save();
      c2d.strokeStyle = 'rgba(158, 232, 255, 0.24)';
      c2d.lineWidth = 1;
      c2d.beginPath();
      c2d.moveTo(this.residualCurveXY[0], this.residualCurveXY[1]);
      for (let i = 1; i <= CURVE_SAMPLES; i++) {
        c2d.lineTo(this.residualCurveXY[i * 2], this.residualCurveXY[i * 2 + 1]);
      }
      c2d.stroke();
      c2d.restore();
    }

    // Observed target light curve (dashed white trace)
    c2d.save();
    c2d.strokeStyle = 'rgba(244, 248, 255, 0.56)';
    c2d.lineWidth = 1.9;
    c2d.setLineDash?.([5, 5]);
    c2d.beginPath();
    c2d.moveTo(this.targetCurveXY[0], this.targetCurveXY[1]);
    for (let i = 1; i <= CURVE_SAMPLES; i++) {
      c2d.lineTo(this.targetCurveXY[i * 2], this.targetCurveXY[i * 2 + 1]);
    }
    c2d.stroke();
    c2d.restore();

    // User Kepler model curve (2-pass optical glow — ZERO shadowBlur!)
    const curveCol = lockedNow ? this.palette.lockHex : this.palette.accentHex;
    drawGlowPolylineXY(c2d, this.userCurveXY, CURVE_SAMPLES + 1, curveCol, 2.3, {
      outerWidthMul: 2.8,
      outerAlpha: 0.24,
      coreAlpha: 0.96,
    });

    // Live playhead synchronized with orbital animation
    const headX = g.gLeft + uLive * g.gW;
    const headY = mapY(liveFlux);
    c2d.save();
    c2d.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    c2d.lineWidth = 1;
    c2d.beginPath();
    c2d.moveTo(headX, g.gTop);
    c2d.lineTo(headX, g.gTop + g.gH);
    c2d.stroke();

    c2d.fillStyle = liveDip01 > 0.15 ? curveCol : '#ffffff';
    c2d.beginPath();
    c2d.arc(headX, headY, liveDip01 > 0.15 ? 3.8 : 2.6, 0, Math.PI * 2);
    c2d.fill();
    c2d.restore();

    // Gentle photon integration spark during active live transit dip
    if (liveDip01 > 0.35 && this.elapsedSec - this.lastDipSparkAt > 0.28) {
      this.lastDipSparkAt = this.elapsedSec;
      this.particles.emitPhotonSparks(headX, headY, 1, 18, curveCol);
    }
  }

  private renderSizeStops(
    c2d: CanvasRenderingContext2D,
    g: ReturnType<ExoplanetTransitGame['getLayoutGeometry']>,
    w: number
  ): void {
    this.sizeStops.length = 0;
    if (this.stage !== 3) return;

    const stopW = g.compact ? 94 : 114;
    const stopH = g.compact ? 25 : 30;
    const gap = g.compact ? 14 : 20;
    const totalW = SIZE_CLASSES.length * stopW + (SIZE_CLASSES.length - 1) * gap;
    const startX = (w - totalW) * 0.5;
    const stopY = g.gTop + g.gH + (g.compact ? 8 : 14);

    c2d.save();
    for (let i = 0; i < SIZE_CLASSES.length; i++) {
      const sc = SIZE_CLASSES[i];
      const sx = startX + i * (stopW + gap);
      this.sizeStops.push({
        idx: sc.idx,
        label: sc.label,
        subLabel: sc.subLabel,
        depthPpt: sc.depthPpt,
        x: sx,
        y: stopY,
        w: stopW,
        h: stopH,
      });

      const selected = this.userSizeIdx === sc.idx;
      const matched = selected && this.userSizeIdx === this.targetSizeIdx;
      const col = matched ? this.palette.lockHex : selected ? this.palette.accentHex : 'rgba(195, 218, 240, 0.34)';

      // Sleek etched glass hairline bracket ticks (Zeiss optics aesthetic — zero bulky boxes)
      c2d.strokeStyle = col;
      c2d.lineWidth = selected ? 1.8 : 1;
      const bLen = 7;
      c2d.beginPath();
      // Left bracket
      c2d.moveTo(sx + bLen, stopY);
      c2d.lineTo(sx, stopY);
      c2d.lineTo(sx, stopY + stopH);
      c2d.lineTo(sx + bLen, stopY + stopH);
      // Right bracket
      c2d.moveTo(sx + stopW - bLen, stopY);
      c2d.lineTo(sx + stopW, stopY);
      c2d.lineTo(sx + stopW, stopY + stopH);
      c2d.lineTo(sx + stopW - bLen, stopY + stopH);
      c2d.stroke();

      if (selected) {
        c2d.fillStyle = matched
          ? `rgba(${this.palette.lockRgb}, 0.14)`
          : `rgba(${this.palette.accentRgb}, 0.14)`;
        c2d.fillRect(sx + 1, stopY + 1, stopW - 2, stopH - 2);
      }

      // Scaled planet icon + radius label
      const iconR = 2.6 + i * 1.6;
      c2d.fillStyle = selected ? col : 'rgba(205, 224, 244, 0.5)';
      c2d.beginPath();
      c2d.arc(sx + 14, stopY + stopH * 0.5, iconR, 0, Math.PI * 2);
      c2d.fill();

      c2d.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = selected ? '#f4f9ff' : 'rgba(212, 228, 244, 0.72)';
      c2d.textAlign = 'left';
      c2d.fillText(`${sc.label}`, sx + 26, stopY + (g.compact ? 11.5 : 13.5));

      c2d.font = '600 7.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = selected ? col : 'rgba(182, 206, 228, 0.55)';
      c2d.fillText(sc.subLabel, sx + 26, stopY + (g.compact ? 21 : 24));
    }
    c2d.restore();
  }

  protected getStageProgress01(): number {
    return clamp((this.stage - 1 + this.cachedMatch) / 3, 0, 1);
  }

  protected getPromptText(): string {
    if (this.stage === 1) {
      return 'Drag orbit ring inward/outward (Kepler period) & scrub the flux curve to match the transit dip.';
    }
    if (this.stage === 2) {
      return this.scenario.resonantPair
        ? 'Tune resonant Planet A & B orbits (Tab switches keys) to match the dual photometric dips.'
        : 'Tune both Planet A & B orbital periods and epoch to align the dual observed dips.';
    }
    return this.scenario.flareSpikes
      ? 'Match both orbits & planet radius (R⊕) while ignoring upward stellar flare spikes.'
      : 'Align both orbits and select planet radius (4.6 / 7.7 / 10.4 R⊕) to match transit depth.';
  }

  protected solveCurrentStage(stage: 1 | 2 | 3): void {
    void stage;
    this.userSpeedA = this.targetSpeedA;
    this.userSpeedB = this.targetSpeedB;
    this.userPhase = this.targetPhase;
    this.userSizeIdx = this.targetSizeIdx;
    this.cachedMatch = this.computeMatch01();
    this.accSum += this.cachedMatch;
    this.accCount += 1;
  }

  protected override verifySolved(): boolean {
    return this.cachedMatch >= this.getMatchThreshold();
  }

  protected onAllStagesCleared(): void {
    const avgAcc = clamp(this.accCount > 0 ? this.accSum / this.accCount : 0.94, 0.78, 1.0);
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.finishSuccess({
      accuracy: avgAcc,
      proofFragmentSuffix: 'transit',
      dossierSnippet: `Keplerian transit photometry (${this.activeVariant?.label ?? 'Survey'}) locked across 3 systems on ${this.ctx.targetName}.`,
      telemetrySummary: `Light-Curve Fit ${(avgAcc * 100).toFixed(0)}% · ${totalSec.toFixed(1)}s`,
      physicalPrinciple: 'Kepler’s Third Law (a ∝ P²/³) & Limb-Darkened Exoplanet Transit Photometry',
    });
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'By Kepler’s Third Law (a ∝ P²/³), closer-in worlds orbit faster and cross the star’s disc more frequently; transit depth ΔF = (Rₚ/R★)² reveals planetary radius.',
      goalSummary:
        'Scale orbital rings radially for period, scrub the light curve for epoch, and match Stage 3 planetary radius (R⊕) to lock the transit.',
      controlsDesktop:
        'Drag orbit rings radially for period; scrub light curve for epoch; Arrow keys + Tab & 1–3 on Stage 3.',
      controlsTouch: 'Drag orbital rings or bottom verniers; slide across the flux graph to shift epoch.',
      warmthEffect:
        'Warm H% widens magnetic transit wells and amber starlight; Cold H% sharpens photometric tolerances and displays flux residuals.',
    };
  }
}
