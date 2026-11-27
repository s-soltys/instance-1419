import { platform } from '../../../platform/PlatformAdapter';
import { BaseCosmicMinigame, type PointerLocalEvent } from '../core/BaseCosmicMinigame';
import { getPlateCanvasPair } from '../render/BackdropCachePipeline';
import { drawGlowStroke } from '../render/OpticalDrawUtils';
import { drawOpticalStar, drawSoftDustPuff } from '../render/StarPSFAtlas';
import { clamp, lerp, SpringActuator } from '../tactilePhysics';
import type {
  CosmicPlateId,
  InstrumentFieldGuide,
  MinigameVariantSpec,
} from '../types';

type SpectralBand = 'optical' | 'infrared' | 'xray';

interface DustPillar {
  nx: number;
  ny: number;
  widthR: number;
  heightR: number;
  tilt: number;
  puffSeeds: readonly [number, number, number];
}

interface BandTarget {
  id: number;
  nx: number;
  ny: number;
  band: SpectralBand;
  isDecoy: boolean;
  found: boolean;
  jetAngle: number;
  pulsePhase: number;
  snr: number;
  rejectFlash: number;
}

interface FilterTabSpec {
  band: SpectralBand;
  label: string;
  compactLabel: string;
  passband: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface LoupeVariantProfile {
  dustColorHex: string;
  rimHighlightHex: string;
  irTintRgba: string;
  xrayTintRgba: string;
  emptyPillarCount: number;
  stage3Decoys: number;
  regionTag: string;
}

const LOUPE_VARIANTS: readonly MinigameVariantSpec[] = [
  { index: 0, id: 'multiband_loupe_v1', label: 'Pillars Protostar Hunt', plateId: 'pillars' },
  { index: 1, id: 'multiband_loupe_v2', label: 'Crab X-Ray Wind Nebula', plateId: 'crab' },
  { index: 2, id: 'multiband_loupe_v3', label: 'Cas A Ejecta Knots', plateId: 'cas_a' },
  { index: 3, id: 'multiband_loupe_v4', label: 'Multi-Band Decoy Sweep', plateId: 'pillars' },
];

const VARIANT_PROFILES: readonly LoupeVariantProfile[] = [
  {
    dustColorHex: '#24140d',
    rimHighlightHex: '#cc8a54',
    irTintRgba: 'rgba(66, 20, 10, 0.36)',
    xrayTintRgba: 'rgba(5, 13, 32, 0.82)',
    emptyPillarCount: 3,
    stage3Decoys: 2,
    regionTag: 'M16 PILLARS',
  },
  {
    dustColorHex: '#18141c',
    rimHighlightHex: '#84b8d8',
    irTintRgba: 'rgba(54, 18, 16, 0.38)',
    xrayTintRgba: 'rgba(4, 12, 30, 0.84)',
    emptyPillarCount: 2,
    stage3Decoys: 2,
    regionTag: 'M1 CRAB PWN',
  },
  {
    dustColorHex: '#221512',
    rimHighlightHex: '#d49468',
    irTintRgba: 'rgba(60, 22, 12, 0.38)',
    xrayTintRgba: 'rgba(5, 14, 34, 0.84)',
    emptyPillarCount: 3,
    stage3Decoys: 2,
    regionTag: 'CAS A EJECTA',
  },
  {
    dustColorHex: '#20130e',
    rimHighlightHex: '#cfa06e',
    irTintRgba: 'rgba(58, 18, 12, 0.38)',
    xrayTintRgba: 'rgba(4, 12, 28, 0.84)',
    emptyPillarCount: 3,
    stage3Decoys: 3,
    regionTag: 'DEEP SURVEY',
  },
];

/**
 * BND-19 — Multi-Band Spectral Loupe
 * Sweep an optical magnifying loupe (1.06x) across real & empty molecular dust pillars,
 * switching between Optical (0.55 μm), Near-IR (2.12 μm), and X-Ray (4 keV) passbands
 * via sleek unified diegetic filter tabs — ZERO per-frame ctx.filter blurs or gradients,
 * ZERO giveaway target circles, and genuine astrophysical signature differentiation.
 */
export class MultiBandLoupeGame extends BaseCosmicMinigame {
  readonly id = 'multiband_loupe';
  readonly title = 'SPECTRAL BAND LOUPE';
  readonly subtitle = 'X-Ray / IR / Optical Reveal';
  readonly instrumentCode = 'BND-19';
  readonly platePool: readonly CosmicPlateId[] = ['pillars', 'crab', 'cas_a'];
  readonly variants = LOUPE_VARIANTS;

  private variantProfile: LoupeVariantProfile = VARIANT_PROFILES[0];
  private band: SpectralBand = 'optical';
  private loupeNx = 0.5;
  private loupeNy = 0.42;
  private readonly loupeSpringX = new SpringActuator(0.5);
  private readonly loupeSpringY = new SpringActuator(0.42);
  private bandSwitchT = 1;
  private dragging = false;
  private pointerMoved = false;
  private downX = 0;
  private downY = 0;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  private pillars: DustPillar[] = [];
  private targets: BandTarget[] = [];
  private tabs: FilterTabSpec[] = [];
  private decoyWarningText = '';
  private decoyWarningTimer = 0;
  private lastProximityChimeSec = 0;
  private wrongTapCount = 0;

  protected onMount(): void {
    this.variantProfile = VARIANT_PROFILES[this.iterationIndex % VARIANT_PROFILES.length];
    this.wrongTapCount = 0;
  }

  private getLoupeRadiusPx(): number {
    const base = this.compact ? 70 : 98;
    if (this.profile.vibe === 'warm') return Math.round(base * 1.13);
    if (this.profile.vibe === 'cold') return Math.round(base * 0.92);
    return base;
  }

  private getDustOpacity(): number {
    if (this.profile.vibe === 'warm') return 0.72;
    if (this.profile.vibe === 'cold') return 0.95;
    return 0.84;
  }

  private sampleSeparatedPoint(
    rng: () => number,
    existing: Array<{ nx: number; ny: number }>,
    minSep: number
  ): { nx: number; ny: number } {
    let bestNx = 0.2 + rng() * 0.6;
    let bestNy = 0.24 + rng() * 0.36;
    let bestMinD = -1;
    for (let attempt = 0; attempt < 36; attempt++) {
      const nx = 0.18 + rng() * 0.64;
      const ny = 0.23 + rng() * 0.37;
      let minD = 999;
      for (let i = 0; i < existing.length; i++) {
        const d = Math.hypot((nx - existing[i].nx) * 1.35, ny - existing[i].ny);
        if (d < minD) minD = d;
      }
      if (minD >= minSep) {
        return { nx, ny };
      }
      if (minD > bestMinD) {
        bestMinD = minD;
        bestNx = nx;
        bestNy = ny;
      }
    }
    return { nx: bestNx, ny: bestNy };
  }

  protected onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.band = 'optical';
    this.loupeNx = 0.5;
    this.loupeNy = 0.42;
    this.loupeSpringX.snap(0.5);
    this.loupeSpringY.snap(0.42);
    this.bandSwitchT = 1;
    this.dragging = false;
    this.decoyWarningText = '';
    this.decoyWarningTimer = 0;

    this.targets = [];
    this.pillars = [];
    const occupied: Array<{ nx: number; ny: number }> = [];

    const pushTarget = (band: SpectralBand, isDecoy: boolean, addPillar: boolean) => {
      const pt = this.sampleSeparatedPoint(rng, occupied, isDecoy ? 0.14 : 0.19);
      occupied.push(pt);
      const t: BandTarget = {
        id: this.targets.length,
        nx: pt.nx,
        ny: pt.ny,
        band,
        isDecoy,
        found: false,
        jetAngle: rng() * Math.PI * 2,
        pulsePhase: rng() * Math.PI * 2,
        snr: isDecoy ? 3.2 : 11.4 + rng() * 9.5,
        rejectFlash: 0,
      };
      this.targets.push(t);
      if (addPillar) {
        this.pillars.push({
          nx: pt.nx + (rng() - 0.5) * 0.02,
          ny: pt.ny + (rng() - 0.5) * 0.02,
          widthR: 48 + rng() * 16,
          heightR: 60 + rng() * 18,
          tilt: (rng() - 0.5) * 0.55,
          puffSeeds: [rng() * 6.28, rng() * 6.28, rng() * 6.28],
        });
      }
    };

    if (stage === 1) {
      // 2 hidden IR protostars inside dust pillars + 1 foreground optical decoy star
      pushTarget('infrared', false, true);
      pushTarget('infrared', false, true);
      pushTarget('optical', true, false);
    } else if (stage === 2) {
      // 1 Optical ionized bow-shock core + 1 IR protostar + 1 X-Ray pulsar (with X-ray jet clue -> IR!)
      pushTarget('optical', false, false);
      pushTarget('infrared', false, true);
      pushTarget('xray', false, true);
      pushTarget('optical', true, false);
    } else {
      // Stage 3: 1 X-ray pulsar + 2 IR protostars + N foreground optical stars + 1 diffuse IR thermal decoy!
      pushTarget('xray', false, true);
      pushTarget('infrared', false, true);
      pushTarget('infrared', false, true);
      pushTarget('infrared', true, true);
      for (let d = 0; d < this.variantProfile.stage3Decoys; d++) {
        pushTarget('optical', true, false);
      }
    }

    // Add 2–3 EMPTY dust pillars so dark molecular clouds do NOT spoil target locations!
    const emptyCount = stage === 1 ? 2 : this.variantProfile.emptyPillarCount;
    for (let e = 0; e < emptyCount; e++) {
      const pt = this.sampleSeparatedPoint(rng, occupied, 0.16);
      occupied.push(pt);
      this.pillars.push({
        nx: pt.nx,
        ny: pt.ny,
        widthR: 46 + rng() * 18,
        heightR: 56 + rng() * 20,
        tilt: (rng() - 0.5) * 0.65,
        puffSeeds: [rng() * 6.28, rng() * 6.28, rng() * 6.28],
      });
    }
  }

  private setBand(next: SpectralBand): void {
    if (this.stage === 1 && next === 'xray') return;
    if (this.band !== next) {
      this.band = next;
      this.bandSwitchT = 0;
      this.ctx.audio?.playSolenoidClack(false);
      platform.triggerHaptic('vernierTick', 0.5);
      this.particles.emitSpectralShimmer(
        this.loupeSpringX.value * this.width,
        this.loupeSpringY.value * this.height,
        0.65,
        2
      );
      this.emitHud(true);
    }
  }

  private cycleBand(): void {
    const order: SpectralBand[] = this.stage === 1 ? ['optical', 'infrared'] : ['optical', 'infrared', 'xray'];
    const idx = (order.indexOf(this.band) + 1) % order.length;
    this.setBand(order[idx]);
  }

  private getBandColor(band: SpectralBand): string {
    if (this.palette.mode === 'cold') {
      if (band === 'optical') return '#d8eefc';
      if (band === 'infrared') return '#ff9e78';
      return '#7fe4ff';
    }
    if (band === 'optical') return '#ffe29c';
    if (band === 'infrared') return '#ff8559';
    return '#7fd8ff';
  }

  private getBandPassbandLabel(band: SpectralBand): string {
    if (band === 'optical') return '0.55 μm V-BAND';
    if (band === 'infrared') return '2.12 μm NIRCam';
    return '0.5–8.0 keV X-RAY';
  }

  private tryTagAt(px: number, py: number, isTouch: boolean): boolean {
    const w = Math.max(1, this.width);
    const h = Math.max(1, this.height);
    const lx = this.loupeSpringX.value * w;
    const ly = this.loupeSpringY.value * h;
    const loupeR = this.getLoupeRadiusPx();
    const pickR = isTouch ? 46 : 38;

    let best: BandTarget | null = null;
    let bestD = pickR;

    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      if (t.found || t.band !== this.band) continue;
      const tx = t.nx * w;
      const ty = t.ny * h;
      const insideLoupe = Math.hypot(tx - lx, ty - ly) <= loupeR + 10;
      if (!insideLoupe) continue;
      const d = Math.hypot(px - tx, py - ty);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }

    if (!best) return false;

    if (best.isDecoy) {
      best.rejectFlash = 1.0;
      this.wrongTapCount++;
      this.decoyWarningText =
        best.band === 'infrared'
          ? 'DIFFUSE THERMAL KNOT — NO PROTOSTAR CORE'
          : 'FOREGROUND STAR — NO IR/X-RAY COUNTERPART';
      this.decoyWarningTimer = 2.1;
      platform.triggerHaptic('rejectThud', 0.65);
      this.ctx.audio?.playSolenoidClack(false);
      this.emitHud(true);
      return true;
    }

    best.found = true;
    const tx = best.nx * w;
    const ty = best.ny * h;
    platform.triggerHaptic('phaseSnapLock', 0.9);
    this.ctx.audio?.playTumblerClick(0.95, true);
    this.particles.emitPhotonSparks(tx, ty, 4, 34, this.palette.lockHex);
    this.particles.emitLockCausticRing(tx, ty, 16, this.palette.lockHex);

    const realTargets = this.targets.filter((item) => !item.isDecoy);
    if (realTargets.every((item) => item.found)) {
      this.triggerStageClear(`MULTI-BAND SURVEY ${this.stage}/${this.maxStages} COMPLETE`, 0.62, tx, ty);
    } else {
      this.emitHud(true);
    }
    return true;
  }

  protected onPointerDown(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;

    // 1. Check unified diegetic spectral filter tabs (>=36px ergonomic touch height)
    for (let i = 0; i < this.tabs.length; i++) {
      const tab = this.tabs[i];
      if (ev.x >= tab.x && ev.x <= tab.x + tab.w && ev.y >= tab.y && ev.y <= tab.y + tab.h) {
        this.setBand(tab.band);
        return;
      }
    }

    // 2. Check if tapping a revealed target inside the loupe
    const isTouch = ev.pointerType === 'touch';
    if (this.tryTagAt(ev.x, ev.y, isTouch)) {
      return;
    }

    // 3. Begin smooth relative drag if grabbing inside loupe, or glide loupe cleanly to pointer
    this.dragging = true;
    this.pointerMoved = false;
    this.downX = ev.x;
    this.downY = ev.y;
    const lx = this.loupeSpringX.value * this.width;
    const ly = this.loupeSpringY.value * this.height;
    const loupeR = this.getLoupeRadiusPx();
    if (Math.hypot(ev.x - lx, ev.y - ly) <= loupeR + 18) {
      this.dragOffsetX = ev.x - lx;
      this.dragOffsetY = ev.y - ly;
    } else {
      this.dragOffsetX = 0;
      this.dragOffsetY = 0;
      this.loupeNx = clamp(ev.x / Math.max(1, this.width), 0.1, 0.9);
      this.loupeNy = clamp(ev.y / Math.max(1, this.height), 0.18, 0.68);
    }
  }

  protected onPointerMove(ev: PointerLocalEvent): void {
    if (!this.dragging || this.stageClearTimer > 0) return;
    if (Math.hypot(ev.x - this.downX, ev.y - this.downY) > 6) {
      this.pointerMoved = true;
    }
    const nextX = ev.x - this.dragOffsetX;
    const nextY = ev.y - this.dragOffsetY;
    this.loupeNx = clamp(nextX / Math.max(1, this.width), 0.1, 0.9);
    this.loupeNy = clamp(nextY / Math.max(1, this.height), 0.18, 0.68);
  }

  protected onPointerUp(ev: PointerLocalEvent): void {
    if (this.dragging && !this.pointerMoved && this.stageClearTimer <= 0) {
      this.tryTagAt(ev.x, ev.y, ev.pointerType === 'touch');
    }
    this.dragging = false;
  }

  protected onKeyDown(e: KeyboardEvent): void {
    if (this.stageClearTimer > 0) return;
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      this.cycleBand();
    } else if (e.key === '1') {
      this.setBand('optical');
    } else if (e.key === '2') {
      this.setBand('infrared');
    } else if (e.key === '3') {
      this.setBand('xray');
    } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      this.loupeNx = clamp(this.loupeNx - 0.035, 0.1, 0.9);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      this.loupeNx = clamp(this.loupeNx + 0.035, 0.1, 0.9);
    } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      this.loupeNy = clamp(this.loupeNy - 0.035, 0.18, 0.68);
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.preventDefault();
      this.loupeNy = clamp(this.loupeNy + 0.035, 0.18, 0.68);
    } else if ((e.key === 'Enter' || e.key === 'f' || e.key === 'F') && !e.repeat) {
      e.preventDefault();
      this.tryTagAt(this.loupeNx * this.width, this.loupeNy * this.height, false);
    }
  }

  protected onUpdate(dt: number): void {
    this.loupeSpringX.target = this.loupeNx;
    this.loupeSpringY.target = this.loupeNy;
    this.loupeSpringX.step(dt, { stiffness: 185, damping: 24 });
    this.loupeSpringY.step(dt, { stiffness: 185, damping: 24 });
    if (this.bandSwitchT < 1) {
      this.bandSwitchT = Math.min(1, this.bandSwitchT + dt / 0.24);
    }

    if (this.decoyWarningTimer > 0) {
      this.decoyWarningTimer = Math.max(0, this.decoyWarningTimer - dt);
      if (this.decoyWarningTimer === 0) {
        this.decoyWarningText = '';
        this.emitHud(true);
      }
    }

    const lx = this.loupeSpringX.value * this.width;
    const ly = this.loupeSpringY.value * this.height;
    const loupeR = this.getLoupeRadiusPx();

    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      if (t.rejectFlash > 0) t.rejectFlash = Math.max(0, t.rejectFlash - dt * 2.2);

      // Subtle Geiger/pulsar proximity audio tick when sweeping over an active X-ray core!
      if (!t.found && !t.isDecoy && t.band === 'xray' && this.band === 'xray') {
        const d = Math.hypot(t.nx * this.width - lx, t.ny * this.height - ly);
        if (d < loupeR * 0.95 && this.elapsedSec - this.lastProximityChimeSec > 0.42) {
          this.lastProximityChimeSec = this.elapsedSec;
          const closeness = clamp(1 - d / loupeR, 0.2, 1);
          this.ctx.audio?.playProximityTick?.(closeness, (t.nx - 0.5) * 1.4);
        }
      }
    }
  }

  protected onAllStagesCleared(): void {
    this.finishSuccess({
      accuracy: clamp(1 - this.wrongTapCount * 0.05, 0.72, 1),
      proofFragmentSuffix: 'multiband',
      dossierSnippet: `Embedded Infrared protostars & high-energy X-ray pulsar cores isolated beneath ${this.variantProfile.regionTag} dust columns on ${this.ctx.targetName}.`,
      telemetrySummary: `Multi-Band Survey Complete · ${this.elapsedSec.toFixed(1)}s`,
      physicalPrinciple: 'Multi-Wavelength Dust Penetration (0.55 μm Optical · 2.12 μm NIR · 4 keV X-Ray)',
    });
  }

  protected getStageProgress01(): number {
    if (this.completed) return 1;
    let total = 0;
    let found = 0;
    for (let i = 0; i < this.targets.length; i++) {
      if (!this.targets[i].isDecoy) {
        total++;
        if (this.targets[i].found) found++;
      }
    }
    return clamp((this.stage - 1 + found / Math.max(1, total)) / 3, 0, 1);
  }

  protected getPromptText(): string {
    if (this.decoyWarningTimer > 0 && this.decoyWarningText) {
      return this.decoyWarningText;
    }
    let total = 0;
    let found = 0;
    for (let i = 0; i < this.targets.length; i++) {
      if (!this.targets[i].isDecoy) {
        total++;
        if (this.targets[i].found) found++;
      }
    }
    const bandTag = this.band.toUpperCase();
    if (this.stage === 1) {
      return `[${bandTag}] Sweep the loupe over molecular dust pillars, switch to INFRARED (2), and tag embedded protostars (${found}/${total}).`;
    }
    if (this.stage === 2) {
      return `[${bandTag}] Switch OPT / IR / X-RAY to follow the X-ray jet clue & tag all ${total} true cosmic cores (${found}/${total}).`;
    }
    return `[${bandTag}] Ignore plain foreground optical stars — isolate the ${total} embedded IR protostars & X-ray pulsar (${found}/${total}).`;
  }

  /**
   * Renders a layered organic molecular dust pillar using cached StarPSFAtlas soft dust puffs
   * (ZERO per-frame radial gradients!).
   */
  private drawDustPillar(
    c2d: CanvasRenderingContext2D,
    pillar: DustPillar,
    w: number,
    h: number,
    opacityMul: number,
    ghostOnly: boolean
  ): void {
    const px = pillar.nx * w;
    const py = pillar.ny * h;
    const scale = this.compact ? 0.78 : 1.0;
    const wr = pillar.widthR * scale;
    const hr = pillar.heightR * scale;

    c2d.save();
    c2d.translate(px, py);
    c2d.rotate(pillar.tilt);

    if (ghostOnly) {
      // Inside IR loupe: filamentary wisps turn translucent exposing buried cores!
      drawSoftDustPuff(c2d, Math.sin(pillar.puffSeeds[0]) * 6, -hr * 0.28, wr * 0.85, '#6a2e1a', 0.16 * opacityMul);
      drawSoftDustPuff(c2d, Math.cos(pillar.puffSeeds[1]) * 7, hr * 0.2, wr * 1.0, '#522214', 0.14 * opacityMul);
    } else {
      // Sculpted filamentary molecular dust columns (6 overlapping asymmetric wisps + backlit rim)
      const col = this.palette.mode === 'cold' ? '#141720' : this.variantProfile.dustColorHex;
      const rim = this.palette.mode === 'cold' ? '#7098b8' : this.variantProfile.rimHighlightHex;
      drawSoftDustPuff(c2d, Math.sin(pillar.puffSeeds[0]) * 8, -hr * 0.44, wr * 0.62, rim, 0.15 * opacityMul);
      drawSoftDustPuff(c2d, Math.cos(pillar.puffSeeds[2]) * 10, -hr * 0.14, wr * 0.72, rim, 0.1 * opacityMul);

      for (let seg = 0; seg < 5; seg++) {
        const u = seg / 4 - 0.5;
        const swayX = Math.sin(pillar.puffSeeds[seg % 3] + seg * 1.4) * (10 + seg * 2);
        const rad = wr * lerp(0.56, 1.08, (seg + 1) / 5);
        drawSoftDustPuff(c2d, swayX, u * hr * 0.92, rad, col, lerp(0.84, 0.94, seg / 4) * opacityMul);
      }
    }
    c2d.restore();
  }

  /**
   * Draws an astrophysically distinct source inside the loupe (NO spoiler target circles!).
   */
  private drawBandSource(c2d: CanvasRenderingContext2D, t: BandTarget, tx: number, ty: number): void {
    if (t.band === 'infrared' && !t.isDecoy) {
      // Embedded IR protostar: warm crimson-amber PSF core + delicate bipolar Herbig-Haro outflow wisps!
      const cosA = Math.cos(t.jetAngle);
      const sinA = Math.sin(t.jetAngle);
      const jetLen = this.compact ? 22 : 28;
      drawGlowStroke(
        c2d,
        (ctx) => {
          ctx.moveTo(tx - cosA * jetLen, ty - sinA * jetLen);
          ctx.lineTo(tx + cosA * jetLen, ty + sinA * jetLen);
        },
        '#ff8a5b',
        1.3,
        { outerWidthMul: 3.4, outerAlpha: 0.24, coreAlpha: 0.72 }
      );
      drawOpticalStar(c2d, tx, ty, 8.8, {
        spectralClass: 'M',
        spikes: 6,
        alpha: 0.96,
        timeSec: this.elapsedSec,
        scintPhase: t.pulsePhase,
        vibeMode: this.palette.mode,
      });
    } else if (t.band === 'infrared' && t.isDecoy) {
      // Diffuse IR thermal knot decoy: soft warm glow without a protostellar core or bipolar jet!
      drawSoftDustPuff(c2d, tx, ty, 14, '#c45e3a', 0.56);
      drawOpticalStar(c2d, tx, ty, 4.2, {
        spectralClass: 'M',
        spikes: 0,
        alpha: 0.55,
        vibeMode: this.palette.mode,
      });
    } else if (t.band === 'xray') {
      // High-energy X-ray pulsar: electric sapphire pulsing core + synchrotron torus halo
      const pulse = 0.78 + 0.22 * Math.sin(this.elapsedSec * 5.2 + t.pulsePhase);
      c2d.save();
      c2d.strokeStyle = 'rgba(127, 216, 255, 0.52)';
      c2d.lineWidth = 1.25;
      if (typeof c2d.ellipse === 'function') {
        c2d.beginPath();
        c2d.ellipse(tx, ty, 15 * pulse, 7 * pulse, t.jetAngle, 0, Math.PI * 2);
        c2d.stroke();
      }
      c2d.restore();
      drawOpticalStar(c2d, tx, ty, 8.2 * pulse, {
        spectralClass: 'O',
        spikes: 4,
        alpha: 0.96,
        vibeMode: this.palette.mode,
      });
    } else if (!t.isDecoy) {
      // Real Optical ionized bow-shock knot (Stage 2): distinct crescent H-alpha bow shock arc!
      drawGlowStroke(
        c2d,
        (ctx) => {
          ctx.arc(tx, ty, 14, t.jetAngle - 0.95, t.jetAngle + 0.95);
        },
        '#ffe29c',
        1.6,
        { outerAlpha: 0.26, coreAlpha: 0.88 }
      );
      drawOpticalStar(c2d, tx, ty, 7.6, {
        spectralClass: 'F',
        spikes: 4,
        alpha: 0.94,
        vibeMode: this.palette.mode,
      });
    } else {
      // Plain foreground optical star decoy: steady G/F star with zero outflow/shock/halo
      drawOpticalStar(c2d, tx, ty, 6.8, {
        spectralClass: 'G',
        spikes: 4,
        alpha: 0.86,
        vibeMode: this.palette.mode,
      });
    }

    if (t.rejectFlash > 0.02) {
      c2d.save();
      c2d.strokeStyle = '#ff6b6b';
      c2d.globalAlpha = t.rejectFlash;
      c2d.lineWidth = 1.8;
      c2d.beginPath();
      c2d.arc(tx, ty, 18 + (1 - t.rejectFlash) * 10, 0, Math.PI * 2);
      c2d.stroke();
      c2d.restore();
    }
  }

  protected onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const compact = this.compact;
    const lx = this.loupeSpringX.value * w;
    const ly = this.loupeSpringY.value * h;
    const loupeR = this.getLoupeRadiusPx();
    const bandCol = this.getBandColor(this.band);
    const dustOpacity = this.getDustOpacity();

    // Cached backdrop (ZERO per-frame ctx.filter!)
    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: 5,
      alpha: 0.46,
      brightness: 0.72,
      tintAlpha: 0.54,
      reticleDuck: { cx: lx, cy: ly, r: loupeR + 14 },
    });

    // Outer optical field: opaque layered molecular dust pillars (both hosting & empty!)
    for (let i = 0; i < this.pillars.length; i++) {
      this.drawDustPillar(c2d, this.pillars[i], w, h, dustOpacity, false);
    }

    // Warm H%: subtle thermal amber bleed hint beneath dense embedded cores
    if (this.profile.vibe === 'warm') {
      for (let i = 0; i < this.targets.length; i++) {
        const t = this.targets[i];
        if (t.found || t.isDecoy || t.band !== 'infrared') continue;
        drawSoftDustPuff(c2d, t.nx * w, t.ny * h, 26, '#c86434', 0.14);
      }
    }

    // Faint visible foreground optical stars outside the loupe
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      if (t.found) {
        drawOpticalStar(c2d, t.nx * w, t.ny * h, 8.5, {
          spectralClass: 'LOCK',
          spikes: 6,
          alpha: 0.96,
          vibeMode: this.palette.mode,
        });
        c2d.save();
        c2d.strokeStyle = this.palette.lockHex;
        c2d.globalAlpha = 0.65;
        c2d.lineWidth = 1.3;
        c2d.beginPath();
        c2d.arc(t.nx * w, t.ny * h, 14, 0, Math.PI * 2);
        c2d.stroke();
        c2d.restore();
      } else if (t.band === 'optical' && t.isDecoy) {
        drawOpticalStar(c2d, t.nx * w, t.ny * h, 5.2, {
          spectralClass: 'G',
          spikes: 0,
          alpha: 0.55,
          vibeMode: this.palette.mode,
        });
      }
    }

    // ==================== CLIPPED MULTI-SPECTRAL LOUPE APERTURE ====================
    c2d.save();
    c2d.beginPath();
    c2d.arc(lx, ly, loupeR, 0, Math.PI * 2);
    c2d.fillStyle = '#040812';
    c2d.fill();
    c2d.clip?.();

    // Draw cached SHARP plate with subtle 1.06x optical glass magnification (ZERO ctx.filter!)
    const pair = getPlateCanvasPair(this.activePlateId, w, h);
    if (pair && typeof c2d.drawImage === 'function') {
      const mag = 1.06;
      const mw = w * mag;
      const mh = h * mag;
      const mx = lx - lx * mag;
      const my = ly - ly * mag;
      c2d.globalAlpha = this.band === 'infrared' ? 0.88 : this.band === 'xray' ? 0.24 : 0.68;
      c2d.drawImage(pair.sharp, mx, my, mw, mh);
    }

    // Band-specific astrophysical contrast wash
    if (this.band === 'infrared') {
      c2d.fillStyle = this.variantProfile.irTintRgba;
      c2d.fillRect(lx - loupeR, ly - loupeR, loupeR * 2, loupeR * 2);
      // Ghostly translucent dust silhouettes so player clearly sees IR penetrating the columns!
      for (let i = 0; i < this.pillars.length; i++) {
        this.drawDustPillar(c2d, this.pillars[i], w, h, 0.85, true);
      }
    } else if (this.band === 'xray') {
      c2d.fillStyle = this.variantProfile.xrayTintRgba;
      c2d.fillRect(lx - loupeR, ly - loupeR, loupeR * 2, loupeR * 2);
    } else {
      c2d.fillStyle = 'rgba(10, 16, 26, 0.26)';
      c2d.fillRect(lx - loupeR, ly - loupeR, loupeR * 2, loupeR * 2);
      for (let i = 0; i < this.pillars.length; i++) {
        this.drawDustPillar(c2d, this.pillars[i], w, h, dustOpacity * 0.92, false);
      }
    }

    // Stage 2 cross-band clue: organic tapered synchrotron jet plume pointing toward buried IR protostar
    if (this.stage === 2 && this.band === 'xray') {
      const irTarget = this.targets.find((item) => item.band === 'infrared' && !item.isDecoy);
      const xTarget = this.targets.find((item) => item.band === 'xray' && !item.isDecoy);
      if (irTarget && xTarget) {
        const xx = xTarget.nx * w;
        const xy = xTarget.ny * h;
        const ix = irTarget.nx * w;
        const iy = irTarget.ny * h;
        const jetDist = Math.hypot(ix - xx, iy - xy);
        const jetAng = Math.atan2(iy - xy, ix - xx);
        const perpX = -Math.sin(jetAng);
        const perpY = Math.cos(jetAng);

        c2d.save();
        // Multi-layered tapered synchrotron jet envelope + bright inner filament
        drawGlowStroke(
          c2d,
          (ctx) => {
            ctx.moveTo(xx, xy);
            ctx.lineTo(ix, iy);
          },
          '#7fd8ff',
          1.35,
          { outerWidthMul: 4.5, outerAlpha: 0.22, coreAlpha: 0.54 }
        );
        c2d.fillStyle = 'rgba(127, 216, 255, 0.14)';
        c2d.beginPath();
        c2d.moveTo(xx + perpX * 8, xy + perpY * 8);
        c2d.lineTo(ix, iy);
        c2d.lineTo(xx - perpX * 8, xy - perpY * 8);
        c2d.closePath();
        c2d.fill();

        // Streaming synchrotron emission knots moving from pulsar toward IR protostar
        for (let k = 0; k < 4; k++) {
          const u = ((this.elapsedSec * 0.42 + k / 4) % 1 + 1) % 1;
          drawOpticalStar(
            c2d,
            xx + Math.cos(jetAng) * jetDist * u,
            xy + Math.sin(jetAng) * jetDist * u,
            lerp(2.6, 1.4, u),
            { spectralClass: 'O', spikes: 0, alpha: (1 - u * 0.5) * 0.72, vibeMode: this.palette.mode }
          );
        }
        c2d.restore();
      }
    }

    // Render objects visible in the active spectral passband
    let hoveredSnrTarget: BandTarget | null = null;
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      if (t.found || t.band !== this.band) continue;
      const tx = t.nx * w;
      const ty = t.ny * h;
      this.drawBandSource(c2d, t, tx, ty);
      if (Math.hypot(tx - lx, ty - ly) < loupeR * 0.72) {
        hoveredSnrTarget = t;
      }
    }

    // Filter-wheel iris sweep wipe & subtle Fresnel optical glass sheen on band switch
    if (this.bandSwitchT < 0.99) {
      const wipeEase = 1 - Math.pow(1 - this.bandSwitchT, 3);
      c2d.save();
      c2d.strokeStyle = bandCol;
      c2d.globalAlpha = (1 - wipeEase) * 0.65;
      c2d.lineWidth = 2.2;
      c2d.beginPath();
      c2d.arc(lx, ly, loupeR * lerp(0.18, 1.0, wipeEase), 0, Math.PI * 2);
      c2d.stroke();
      c2d.restore();
    }

    c2d.save();
    c2d.strokeStyle = 'rgba(232, 246, 255, 0.24)';
    c2d.lineWidth = 1.4;
    c2d.beginPath();
    c2d.arc(lx, ly, loupeR * 0.88, -Math.PI * 0.78, -Math.PI * 0.34);
    c2d.stroke();
    c2d.restore();

    // Cold H%: crisp astrometric reticle hairlines inside the loupe
    if (this.profile.vibe === 'cold') {
      c2d.strokeStyle = 'rgba(158, 232, 255, 0.24)';
      c2d.lineWidth = 0.9;
      c2d.beginPath();
      c2d.moveTo(lx - loupeR, ly);
      c2d.lineTo(lx - 14, ly);
      c2d.moveTo(lx + 14, ly);
      c2d.lineTo(lx + loupeR, ly);
      c2d.moveTo(lx, ly - loupeR);
      c2d.lineTo(lx, ly - 14);
      c2d.moveTo(lx, ly + 14);
      c2d.lineTo(lx, ly + loupeR);
      c2d.stroke();
    }

    c2d.restore(); // end loupe clip

    // Machined Zeiss Glass Loupe Bezel + Degree Ticks + Passband Header
    drawGlowStroke(
      c2d,
      (ctx) => {
        ctx.arc(lx, ly, loupeR, 0, Math.PI * 2);
      },
      bandCol,
      2.1,
      { outerAlpha: 0.22, coreAlpha: 0.94 }
    );

    c2d.save();
    c2d.strokeStyle = 'rgba(220, 238, 252, 0.34)';
    c2d.lineWidth = 1;
    c2d.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const len = k % 4 === 0 ? 6 : 3;
      c2d.moveTo(lx + Math.cos(a) * (loupeR - len), ly + Math.sin(a) * (loupeR - len));
      c2d.lineTo(lx + Math.cos(a) * loupeR, ly + Math.sin(a) * loupeR);
    }
    c2d.stroke();

    c2d.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = bandCol;
    c2d.textAlign = 'center';
    c2d.fillText(this.getBandPassbandLabel(this.band), lx, ly - loupeR - 8);

    if (this.profile.showNumericDeltas && hoveredSnrTarget) {
      const snrText = hoveredSnrTarget.isDecoy
        ? 'SNR 3.2 · FOREGROUND'
        : `SNR ${hoveredSnrTarget.snr.toFixed(1)} · ${hoveredSnrTarget.band.toUpperCase()} CORE`;
      c2d.fillStyle = hoveredSnrTarget.isDecoy ? '#ffb385' : this.palette.lockHex;
      c2d.fillText(snrText, lx, ly + loupeR + 14);
    }
    c2d.restore();

    // Target-aware subtle instrument sector header + Cold SNR telemetry
    c2d.save();
    c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = `rgba(${this.palette.secondaryRgb}, 0.66)`;
    c2d.textAlign = 'left';
    c2d.fillText(`${this.ctx.targetName.toUpperCase()} · ${this.variantProfile.regionTag}`, w * 0.06, compact ? 58 : 76);
    c2d.restore();

    // Unified Diegetic Spectral Filter Tabs (ZERO duplicate DOM CYCLE BAND button, >=36px tall!)
    const tabDefs: Array<{ band: SpectralBand; label: string; compactLabel: string; passband: string }> =
      this.stage === 1
        ? [
            { band: 'optical', label: '1 · OPTICAL', compactLabel: '1 · OPT', passband: '0.55μm' },
            { band: 'infrared', label: '2 · INFRARED', compactLabel: '2 · IR', passband: '2.1μm' },
          ]
        : [
            { band: 'optical', label: '1 · OPTICAL', compactLabel: '1 · OPT', passband: '0.55μm' },
            { band: 'infrared', label: '2 · INFRARED', compactLabel: '2 · IR', passband: '2.1μm' },
            { band: 'xray', label: '3 · X-RAY', compactLabel: '3 · X-RAY', passband: '4 keV' },
          ];

    const tabW = compact ? 104 : 138;
    const tabH = 36;
    const gap = compact ? 10 : 14;
    const totalW = tabDefs.length * tabW + (tabDefs.length - 1) * gap;
    const startX = (w - totalW) * 0.5;
    const tabY = compact ? h - 86 : h - 108;

    this.tabs.length = tabDefs.length;
    c2d.save();
    c2d.textAlign = 'center';
    for (let i = 0; i < tabDefs.length; i++) {
      const d = tabDefs[i];
      const tx = startX + i * (tabW + gap);
      this.tabs[i] = { ...d, x: tx, y: tabY, w: tabW, h: tabH };
      const active = this.band === d.band;
      const tCol = this.getBandColor(d.band);

      // Sleek diegetic Zeiss etched tab (bottom hairline accent, no clunky HTML pill boxes)
      c2d.fillStyle = active ? 'rgba(14, 22, 36, 0.86)' : 'rgba(6, 11, 20, 0.58)';
      c2d.fillRect(tx, tabY, tabW, tabH);
      c2d.strokeStyle = active ? tCol : 'rgba(186, 214, 240, 0.22)';
      c2d.lineWidth = active ? 2 : 1;
      c2d.beginPath();
      c2d.moveTo(tx, tabY + tabH);
      c2d.lineTo(tx + tabW, tabY + tabH);
      c2d.stroke();
      // Subtle top corner ticks
      c2d.strokeStyle = active ? tCol : 'rgba(186, 214, 240, 0.16)';
      c2d.lineWidth = 1;
      c2d.beginPath();
      c2d.moveTo(tx, tabY + 5);
      c2d.lineTo(tx, tabY);
      c2d.lineTo(tx + 5, tabY);
      c2d.moveTo(tx + tabW - 5, tabY);
      c2d.lineTo(tx + tabW, tabY);
      c2d.lineTo(tx + tabW, tabY + 5);
      c2d.stroke();

      c2d.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = active ? tCol : 'rgba(210, 228, 244, 0.72)';
      c2d.fillText(compact ? d.compactLabel : d.label, tx + tabW * 0.5, tabY + 15);
      c2d.font = '500 8px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = active ? 'rgba(232, 245, 255, 0.84)' : 'rgba(170, 194, 218, 0.5)';
      c2d.fillText(d.passband, tx + tabW * 0.5, tabY + 28);
    }
    c2d.restore();

    this.drawSharedOverlays(c2d, w, h);
  }

  protected solveCurrentStage(_stage: 1 | 2 | 3): void {
    this.loupeSpringX.snap(this.loupeNx);
    this.loupeSpringY.snap(this.loupeNy);
    for (let i = 0; i < this.targets.length; i++) {
      if (!this.targets[i].isDecoy) {
        this.targets[i].found = true;
      }
    }
  }

  protected override verifySolved(_stage: 1 | 2 | 3): boolean {
    const real = this.targets.filter((t) => !t.isDecoy);
    return real.length > 0 && real.every((t) => t.found);
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Near-infrared (2.12 μm) penetrates micron-sized interstellar dust grains to expose warm embedded protostars & Herbig-Haro jets, while X-rays (4 keV) reveal high-energy pulsar wind nebulae invisible in optical starlight.',
      goalSummary:
        'Sweep the spectral loupe across dark molecular pillars, switch Optical / Infrared / X-Ray passbands, and tag the real hidden cores while ignoring plain foreground stars.',
      controlsDesktop:
        'Drag the loupe (or Arrows/WASD); switch bands via tabs or 1/2/3/Space; click revealed cores or press Enter/F to tag inside the loupe.',
      controlsTouch:
        'Touch-drag the spectral loupe, tap Optical / IR / X-Ray tabs below, and tap revealed cosmic cores.',
      warmthEffect:
        'Warm H% enlarges the loupe aperture and reveals faint amber thermal dust hints; Cold H% darkens optical dust and exposes passband SNR telemetry.',
    };
  }
}
