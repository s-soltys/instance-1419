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

interface HiddenPlanet {
  id: number;
  orbitR: number; // fraction of scale = Math.min(w, h)
  ang: number;
  speed: number;
  requiresTightMask: boolean;
  found: boolean;
  rimColor: string;
}

interface CoronagraphScenarioConfig {
  starClass: SpectralClass;
  debrisRing: boolean;
  edgeOnDisk: boolean;
  diskTiltRad: number;
  stage3PlanetCount: 2 | 3;
  counterRotating: boolean;
  starLabel: string;
}

const COR_PLATES: readonly [CosmicPlateId, CosmicPlateId, CosmicPlateId] = [
  'sombrero',
  'rho_ophiuchi',
  'horsehead',
];

const COR_VARIANTS: readonly MinigameVariantSpec[] = [
  { index: 0, id: 'coronagraph_mask_v1', label: 'Fomalhaut Debris Companion', plateId: 'sombrero' },
  { index: 1, id: 'coronagraph_mask_v2', label: 'Rho Oph Young Giant', plateId: 'rho_ophiuchi' },
  { index: 2, id: 'coronagraph_mask_v3', label: 'Horsehead Edge-On Rim', plateId: 'horsehead' },
  { index: 3, id: 'coronagraph_mask_v4', label: 'Dual-Orbit Apodizer', plateId: 'sombrero' },
];

const SCENARIOS: readonly CoronagraphScenarioConfig[] = [
  {
    starClass: 'A',
    debrisRing: true,
    edgeOnDisk: false,
    diskTiltRad: -0.22,
    stage3PlanetCount: 2,
    counterRotating: false,
    starLabel: 'A3V · FOMALHAUT ANALOG',
  },
  {
    starClass: 'G',
    debrisRing: false,
    edgeOnDisk: false,
    diskTiltRad: 0,
    stage3PlanetCount: 3,
    counterRotating: false,
    starLabel: 'G5V · YOUNG GIANT SYSTEM',
  },
  {
    starClass: 'A',
    debrisRing: false,
    edgeOnDisk: true,
    diskTiltRad: -0.32,
    stage3PlanetCount: 2,
    counterRotating: false,
    starLabel: 'A6V · BETA PIC DEBRIS DISK',
  },
  {
    starClass: 'B',
    debrisRing: true,
    edgeOnDisk: false,
    diskTiltRad: 0.25,
    stage3PlanetCount: 2,
    counterRotating: true,
    starLabel: 'B9V · DUAL-ORBIT APODIZER',
  },
];

// Scale-proportional Lyot mask radii (guarantees identical physical fit on 1280x720 AND 844x390!)
const MASK_R_MIN_FRAC = 0.032;
const MASK_R_MAX_FRAC = 0.145;
const MASK_SIZE_MIN_VALID = 0.28;
const MASK_SIZE_MAX_STAGE2 = 0.72;
const MASK_SIZE_MAX_STAGE3 = 0.58; // mr = 0.0975 * scale < inner orbit 0.125 * scale!

/**
 * COR-11 — Solar Coronagraph Mask (Lyot Stellar Coronagraphy)
 * Drag the scale-calibrated Lyot occulting disk onto the host star to engage Auto-Track Servo,
 * tune Mask Inner Working Angle (IWA) to block photosphere glare without eclipsing inner worlds,
 * and directly image revealed exoplanets.
 */
export class CoronagraphMaskGame extends BaseCosmicMinigame {
  readonly id = 'coronagraph_mask';
  readonly title = 'SOLAR CORONAGRAPH MASK';
  readonly subtitle = 'Servo-Tracked Exoplanet Spot';
  readonly instrumentCode = 'COR-11';
  readonly platePool = COR_PLATES;
  readonly variants = COR_VARIANTS;

  private scenario: CoronagraphScenarioConfig = SCENARIOS[0];
  private maskNx = 0.22;
  private maskNy = 0.43;
  private maskSize01 = 0.46;
  private servoLocked = false;
  private servoHoldSec = 0;
  private servoMaxSec = 8.0;

  private dragging: 'mask' | 'size' | null = null;
  private planets: HiddenPlanet[] = [];
  private activeTouchPts = new Map<number, { x: number; y: number }>();
  private lastPinchDist = 0;

  private readonly sizeStripBuf: VernierStripSpec[] = [];
  private readonly sizeItemInput: VernierItemInput[] = [
    { key: 'size', label: 'MASK IWA RADIUS', val01: 0.46, locked: true, rightText: '0.32"' },
  ];

  protected override onMount(): void {
    this.scenario = SCENARIOS[this.iterationIndex % SCENARIOS.length];
  }

  protected onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.scenario = SCENARIOS[this.iterationIndex % SCENARIOS.length];
    this.dragging = null;
    this.activeTouchPts.clear();
    this.lastPinchDist = 0;

    this.maskNx = 0.2;
    this.maskNy = this.compact ? 0.41 : 0.44;
    this.maskSize01 = stage === 1 ? 0.45 : 0.86;
    this.servoLocked = false;
    this.servoHoldSec = 0;
    this.servoMaxSec = stage === 1 ? 8.5 : stage === 2 ? 6.0 : 5.2;

    this.planets = [];
    if (stage === 1) {
      this.planets.push({
        id: 0,
        orbitR: 0.175,
        ang: rng() * Math.PI * 2,
        speed: 0.24,
        requiresTightMask: false,
        found: false,
        rimColor: '#9ee8ff',
      });
    } else if (stage === 2) {
      this.planets.push(
        {
          id: 0,
          orbitR: 0.145,
          ang: rng() * Math.PI * 2,
          speed: 0.28,
          requiresTightMask: false,
          found: false,
          rimColor: '#ffd485',
        },
        {
          id: 1,
          orbitR: 0.215,
          ang: rng() * Math.PI * 2 + 2.4,
          speed: this.scenario.counterRotating ? -0.22 : 0.22,
          requiresTightMask: false,
          found: false,
          rimColor: '#9ee8ff',
        }
      );
    } else {
      // Inner planet at 0.126 * scale: strictly OUTSIDE valid Stage 3 mask (max 0.0975 * scale),
      // and genuinely COVERED by too-wide mask (0.86 -> 0.129 * scale) on EVERY viewport!
      this.planets.push(
        {
          id: 0,
          orbitR: 0.126,
          ang: rng() * Math.PI * 2,
          speed: 0.31,
          requiresTightMask: true,
          found: false,
          rimColor: '#ffd485',
        },
        {
          id: 1,
          orbitR: 0.215,
          ang: rng() * Math.PI * 2 + 2.2,
          speed: this.scenario.counterRotating ? -0.21 : 0.21,
          requiresTightMask: false,
          found: false,
          rimColor: '#9ee8ff',
        }
      );
      if (this.scenario.stage3PlanetCount === 3) {
        this.planets.push({
          id: 2,
          orbitR: 0.172,
          ang: rng() * Math.PI * 2 + 4.3,
          speed: 0.25,
          requiresTightMask: false,
          found: false,
          rimColor: '#b7c8ff',
        });
      }
    }
  }

  private getStarCenterPx(w: number, h: number): { sx: number; sy: number; scale: number } {
    const compact = h < 450;
    const baseY = compact ? 0.405 : 0.44;
    let nx: number;
    let ny: number;
    if (this.stage === 1) {
      nx = 0.5 + Math.sin(this.elapsedSec * 0.24) * 0.022;
      ny = baseY + Math.cos(this.elapsedSec * 0.19) * 0.016;
    } else {
      const speed = this.stage === 2 ? 0.31 : 0.39;
      const ampX = this.stage === 2 ? 0.075 : 0.09;
      const ampY = compact ? 0.036 : this.stage === 2 ? 0.05 : 0.058;
      nx = 0.5 + Math.sin(this.elapsedSec * speed) * ampX;
      ny = baseY + Math.cos(this.elapsedSec * speed * 0.72) * ampY;
    }
    return { sx: nx * w, sy: ny * h, scale: Math.min(w, h) };
  }

  private getMaskRadiusPx(scale: number): number {
    return lerp(MASK_R_MIN_FRAC, MASK_R_MAX_FRAC, clamp(this.maskSize01, 0, 1)) * scale;
  }

  private getPlanetScreenPos(p: HiddenPlanet, sx: number, sy: number, scale: number): { px: number; py: number } {
    if (this.scenario.edgeOnDisk) {
      // Gently foreshortened Beta-Pic orbit along tilted debris disk while keeping periapsis safely > valid mask!
      const rx = p.orbitR * scale * 1.18;
      const ry = Math.max(p.orbitR * scale * 0.88, 0.114 * scale);
      const lx = Math.cos(p.ang) * rx;
      const ly = Math.sin(p.ang) * ry;
      const ct = Math.cos(this.scenario.diskTiltRad);
      const st = Math.sin(this.scenario.diskTiltRad);
      return {
        px: sx + lx * ct - ly * st,
        py: sy + lx * st + ly * ct,
      };
    }
    return {
      px: sx + Math.cos(p.ang) * p.orbitR * scale,
      py: sy + Math.sin(p.ang) * p.orbitR * scale,
    };
  }

  private getSnapTolScaleFrac(): number {
    return this.palette.mode === 'warm' ? 0.094 : this.palette.mode === 'cold' ? 0.064 : 0.08;
  }

  private getMaskSizeStatus(): 'ok' | 'too_small' | 'too_wide' {
    if (this.stage === 1) return 'ok';
    if (this.maskSize01 < MASK_SIZE_MIN_VALID) return 'too_small';
    const maxAllowed = this.stage === 3 ? MASK_SIZE_MAX_STAGE3 : MASK_SIZE_MAX_STAGE2;
    if (this.maskSize01 > maxAllowed) return 'too_wide';
    return 'ok';
  }

  private isMaskSizeValid(tightInnerNeeded = false): boolean {
    if (this.stage === 1) return true;
    const maxAllowed = this.stage === 2 ? MASK_SIZE_MAX_STAGE2 : tightInnerNeeded ? MASK_SIZE_MAX_STAGE3 : 0.72;
    return this.maskSize01 >= MASK_SIZE_MIN_VALID && this.maskSize01 <= maxAllowed;
  }

  private getOccultationQuality(): { masked: boolean; centered: boolean; visibility: number; distFrac: number } {
    const { sx, sy, scale } = this.getStarCenterPx(this.width, this.height);
    const mx = this.maskNx * this.width;
    const my = this.maskNy * this.height;
    const distFrac = Math.hypot(mx - sx, my - sy) / Math.max(1, scale);
    const centered = this.servoLocked || distFrac <= this.getSnapTolScaleFrac();
    const sizeStatus = this.getMaskSizeStatus();
    const sizeOk = sizeStatus === 'ok';
    const masked = centered && sizeOk;
    const distVis = this.servoLocked ? 1 : clamp(1 - distFrac / 0.18, 0, 1);
    const sizePenalty = sizeStatus === 'ok' ? 1 : sizeStatus === 'too_small' ? 0.34 : 0.58;
    return { masked, centered, visibility: clamp(distVis * sizePenalty, 0, 1), distFrac };
  }

  private engageServoIfClose(): void {
    const { sx, sy, scale } = this.getStarCenterPx(this.width, this.height);
    const mx = this.maskNx * this.width;
    const my = this.maskNy * this.height;
    const distFrac = Math.hypot(mx - sx, my - sy) / Math.max(1, scale);
    if (distFrac <= this.getSnapTolScaleFrac()) {
      if (!this.servoLocked) {
        platform.triggerHaptic('phaseSnapLock', 0.75);
        this.ctx.audio?.playTumblerClick(0.78, true);
        this.particles.emitLockCausticRing(sx, sy, this.getMaskRadiusPx(scale) + 4, this.palette.lockHex);
      }
      this.servoLocked = true;
      this.servoHoldSec = this.servoMaxSec;
      this.maskNx = sx / Math.max(1, this.width);
      this.maskNy = sy / Math.max(1, this.height);
    }
  }

  private refreshServoOnSizing(): void {
    // Never let the servo drop while the player is actively sizing Mask Radius!
    if (this.servoLocked) {
      this.servoHoldSec = Math.max(this.servoHoldSec, this.servoMaxSec * 0.78);
    }
  }

  private tagPlanet(p: HiddenPlanet, screenX: number, screenY: number): void {
    p.found = true;
    platform.triggerHaptic('phaseSnapLock', 0.9);
    this.ctx.audio?.playTumblerClick(0.95, true);
    this.particles.emitLockCausticRing(screenX, screenY, 12, this.palette.lockHex);
    this.particles.emitPhotonSparks(screenX, screenY, 4, 28, this.palette.lockHex);

    if (this.planets.every((item) => item.found)) {
      const { sx, sy } = this.getStarCenterPx(this.width, this.height);
      this.triggerStageClear(
        `CORONAGRAPH SCAN ${this.stage}/${this.maxStages} COMPLETE`,
        this.stage < 3 ? 0.6 : 0.45,
        sx,
        sy
      );
    } else {
      this.emitHud(true);
    }
  }

  protected override onPointerDown(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;
    const { x: px, y: py } = ev;

    if (ev.pointerType === 'touch') {
      this.activeTouchPts.set(ev.pointerId, { x: px, y: py });
      if (this.activeTouchPts.size === 2 && this.stage >= 2) {
        const pts = Array.from(this.activeTouchPts.values());
        this.lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        return;
      }
    }

    // 1. Mask IWA Vernier Strip
    const strip = this.sizeStripBuf[0];
    if (strip && hitVernierStrip(strip, px, py)) {
      this.dragging = 'size';
      const targetSize = this.stage === 3 ? 0.44 : 0.5;
      this.maskSize01 = clamp(valueFromStripX(strip, px, targetSize, 0.06), 0.1, 0.96);
      this.refreshServoOnSizing();
      platform.triggerHaptic('vernierTick', 0.45);
      return;
    }

    // 2. Check clicking revealed exoplanets (requires centered occultation AND valid IWA size!)
    const { visibility, centered } = this.getOccultationQuality();
    const sizeStatus = this.getMaskSizeStatus();
    if (centered && sizeStatus === 'ok' && visibility >= 0.46) {
      const { sx, sy, scale } = this.getStarCenterPx(this.width, this.height);
      const mr = this.getMaskRadiusPx(scale);
      for (let i = 0; i < this.planets.length; i++) {
        const p = this.planets[i];
        if (p.found) continue;
        if (p.requiresTightMask && !this.isMaskSizeValid(true)) continue;
        const pos = this.getPlanetScreenPos(p, sx, sy, scale);
        // Physical guard: planet must lie outside the opaque mask disc
        if (Math.hypot(pos.px - sx, pos.py - sy) <= mr + 3) continue;
        if (Math.hypot(px - pos.px, py - pos.py) <= 44) {
          this.tagPlanet(p, pos.px, pos.py);
          return;
        }
      }
    }

    // 3. Dragging occulting Lyot mask (only unlock if clicking ON disk or not yet servo-locked)
    const mx = this.maskNx * this.width;
    const my = this.maskNy * this.height;
    const mr = this.getMaskRadiusPx(Math.min(this.width, this.height));
    const onDisk = Math.hypot(px - mx, py - my) <= mr + 20;
    if (!this.servoLocked || onDisk) {
      this.dragging = 'mask';
      this.servoLocked = false;
      this.maskNx = clamp(px / Math.max(1, this.width), 0.08, 0.92);
      this.maskNy = clamp(py / Math.max(1, this.height), 0.14, 0.8);
      this.engageServoIfClose();
    }
  }

  protected override onPointerMove(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;

    // 2-finger pinch resize for Mask IWA on touchscreens
    if (ev.pointerType === 'touch' && this.activeTouchPts.has(ev.pointerId)) {
      this.activeTouchPts.set(ev.pointerId, { x: ev.x, y: ev.y });
      if (this.activeTouchPts.size === 2 && this.stage >= 2) {
        const pts = Array.from(this.activeTouchPts.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        if (this.lastPinchDist > 4) {
          this.maskSize01 = clamp(this.maskSize01 + (dist - this.lastPinchDist) * 0.0032, 0.1, 0.96);
          this.refreshServoOnSizing();
        }
        this.lastPinchDist = dist;
        return;
      }
    }

    if (!this.dragging) return;
    if (this.dragging === 'size' && this.sizeStripBuf[0]) {
      const targetSize = this.stage === 3 ? 0.44 : 0.5;
      this.maskSize01 = clamp(valueFromStripX(this.sizeStripBuf[0], ev.x, targetSize, 0.06), 0.1, 0.96);
      this.refreshServoOnSizing();
    } else if (this.dragging === 'mask') {
      const nextNx = clamp(ev.x / Math.max(1, this.width), 0.08, 0.92);
      const nextNy = clamp(ev.y / Math.max(1, this.height), 0.14, 0.8);
      const { sx, sy, scale } = this.getStarCenterPx(this.width, this.height);
      const distFrac = Math.hypot(nextNx * this.width - sx, nextNy * this.height - sy) / Math.max(1, scale);
      if (distFrac <= this.getSnapTolScaleFrac()) {
        this.maskNx = nextNx;
        this.maskNy = nextNy;
        this.engageServoIfClose();
      } else {
        this.servoLocked = false;
        this.maskNx = nextNx;
        this.maskNy = nextNy;
      }
    }
  }

  protected override onPointerUp(ev: PointerLocalEvent): void {
    this.activeTouchPts.delete(ev.pointerId);
    if (this.activeTouchPts.size < 2) this.lastPinchDist = 0;
    this.dragging = null;
  }

  protected override onWheel(deltaY: number): boolean {
    if (this.stage < 2 || this.stageClearTimer > 0) return false;
    this.maskSize01 = clamp(this.maskSize01 - deltaY * 0.0008, 0.1, 0.96);
    this.refreshServoOnSizing();
    return true;
  }

  protected override onKeyDown(e: KeyboardEvent): void {
    if (this.stageClearTimer > 0) return;
    const step = 0.032;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      this.servoLocked = false;
      this.maskNx = clamp(this.maskNx - step, 0.08, 0.92);
      this.engageServoIfClose();
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      this.servoLocked = false;
      this.maskNx = clamp(this.maskNx + step, 0.08, 0.92);
      this.engageServoIfClose();
    } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      this.servoLocked = false;
      this.maskNy = clamp(this.maskNy - step, 0.14, 0.8);
      this.engageServoIfClose();
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.preventDefault();
      this.servoLocked = false;
      this.maskNy = clamp(this.maskNy + step, 0.14, 0.8);
      this.engageServoIfClose();
    } else if (this.stage >= 2 && (e.key === 'q' || e.key === 'Q' || e.key === '-')) {
      this.maskSize01 = clamp(this.maskSize01 - 0.04, 0.1, 0.96);
      this.refreshServoOnSizing();
    } else if (this.stage >= 2 && (e.key === 'e' || e.key === 'E' || e.key === '=' || e.key === '+')) {
      this.maskSize01 = clamp(this.maskSize01 + 0.04, 0.1, 0.96);
      this.refreshServoOnSizing();
    } else if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      const { centered, visibility } = this.getOccultationQuality();
      const sizeStatus = this.getMaskSizeStatus();
      if (centered && sizeStatus === 'ok' && visibility >= 0.46) {
        const { sx, sy, scale } = this.getStarCenterPx(this.width, this.height);
        const mr = this.getMaskRadiusPx(scale);
        for (let i = 0; i < this.planets.length; i++) {
          const p = this.planets[i];
          if (p.found) continue;
          if (p.requiresTightMask && !this.isMaskSizeValid(true)) continue;
          const pos = this.getPlanetScreenPos(p, sx, sy, scale);
          if (Math.hypot(pos.px - sx, pos.py - sy) <= mr + 3) continue;
          this.tagPlanet(p, pos.px, pos.py);
          break;
        }
      }
    }
  }

  protected onUpdate(dt: number): void {
    for (let i = 0; i < this.planets.length; i++) {
      this.planets[i].ang += dt * this.planets[i].speed;
    }

    if (this.servoLocked && this.stageClearTimer <= 0) {
      const { sx, sy } = this.getStarCenterPx(this.width, this.height);
      const tNx = sx / Math.max(1, this.width);
      const tNy = sy / Math.max(1, this.height);
      this.maskNx = lerp(this.maskNx, tNx, clamp(dt * 14, 0, 1));
      this.maskNy = lerp(this.maskNy, tNy, clamp(dt * 14, 0, 1));
      // Pause servo decay while user is actively resizing the Lyot stop
      if (this.dragging !== 'size') {
        this.servoHoldSec -= dt;
        if (this.servoHoldSec <= 0) {
          this.servoLocked = false;
          this.servoHoldSec = 0;
        }
      }
    }

    const { visibility } = this.getOccultationQuality();
    this.ctx.audio?.updateBeatSynth({
      beatHz: (1 - visibility) * 6.0,
      harmonicLock: visibility,
      warmth: this.profile.harmonicWarmthGain,
      strain: this.getMaskSizeStatus() === 'too_small' ? 0.4 : 0,
    });
  }

  protected onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const { sx, sy, scale } = this.getStarCenterPx(w, h);
    const { masked, centered, visibility } = this.getOccultationQuality();
    const sizeStatus = this.getMaskSizeStatus();
    const mr = this.getMaskRadiusPx(scale);
    const mx = this.maskNx * w;
    const my = this.maskNy * h;

    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: 4,
      alpha: 0.46,
      brightness: 0.78,
      tintAlpha: 0.44,
      reticleDuck: { cx: sx, cy: sy, r: scale * 0.24 },
    });

    // Optional astrophysical circumstellar debris belt / edge-on disk (V1, V3, V4)
    if (this.scenario.debrisRing || this.scenario.edgeOnDisk) {
      const rx = scale * (this.scenario.edgeOnDisk ? 0.28 : 0.255);
      const ry = scale * (this.scenario.edgeOnDisk ? 0.145 : 0.22);
      drawInclinedAstrometryRing(c2d, sx, sy, rx, ry, this.scenario.diskTiltRad, this.palette.accentRgb, {
        backAlpha: 0.08 + visibility * 0.12,
        frontAlpha: 0.14 + visibility * 0.22,
        lineWidth: this.scenario.edgeOnDisk ? 3.2 : 2.0,
        ticks: 0,
      });
    }

    // Precision angular separation calibration circles (0.3", 0.6") when centered
    if (centered) {
      c2d.save();
      c2d.strokeStyle =
        this.palette.mode === 'cold' ? 'rgba(158, 232, 255, 0.18)' : 'rgba(216, 232, 248, 0.12)';
      c2d.setLineDash?.([4, 6]);
      c2d.lineWidth = 1;
      for (let i = 0; i < this.planets.length; i++) {
        const p = this.planets[i];
        c2d.beginPath();
        if (this.scenario.edgeOnDisk && typeof c2d.ellipse === 'function') {
          c2d.ellipse(
            sx,
            sy,
            p.orbitR * scale * 1.18,
            Math.max(p.orbitR * scale * 0.88, 0.114 * scale),
            this.scenario.diskTiltRad,
            0,
            Math.PI * 2
          );
        } else {
          c2d.arc(sx, sy, p.orbitR * scale, 0, Math.PI * 2);
        }
        c2d.stroke();
      }
      c2d.restore();
    }

    // Orbiting exoplanets (rendered BEFORE Lyot mask so too-wide mask genuinely occults inner worlds!)
    for (let i = 0; i < this.planets.length; i++) {
      const p = this.planets[i];
      const pos = this.getPlanetScreenPos(p, sx, sy, scale);
      const validInner = !p.requiresTightMask || this.isMaskSizeValid(true);
      const clearOfMask = Math.hypot(pos.px - mx, pos.py - my) > mr + 2;
      const canSee = p.found || (centered && validInner && clearOfMask && sizeStatus === 'ok');
      const alpha = p.found ? 1 : canSee ? visibility : visibility * 0.14;

      if (alpha > 0.16) {
        const pr = p.found ? 6.8 : 5.6;
        drawOpticalStar(c2d, pos.px, pos.py, pr * 0.72, {
          spectralClass: p.found ? 'LOCK' : 'A',
          spikes: 0,
          alpha: alpha * 0.82,
          vibeMode: this.palette.mode,
        });
        drawCrescentPlanet(
          c2d,
          pos.px,
          pos.py,
          pr,
          Math.atan2(sy - pos.py, sx - pos.px),
          p.found ? this.palette.lockHex : p.rimColor,
          '#08101c'
        );

        if (!p.found && canSee && visibility >= 0.46) {
          const pulse = 1 + 0.12 * Math.sin(this.elapsedSec * 5.2 + p.id);
          c2d.save();
          c2d.strokeStyle = this.servoLocked ? this.palette.lockHex : this.palette.accentHex;
          c2d.lineWidth = 1.5;
          c2d.beginPath();
          c2d.arc(pos.px, pos.py, 17 * pulse, 0, Math.PI * 2);
          c2d.stroke();
          c2d.restore();
        }
      }
    }

    // Host Star Glare: layered Eddington limb-darkened photosphere + Airy PSF that collapses cleanly on occultation!
    const unmaskedFactor = 1 - visibility * 0.76;
    drawOpticalStar(c2d, sx, sy, scale * lerp(0.055, 0.14, unmaskedFactor), {
      spectralClass: this.scenario.starClass,
      spikes: 6,
      alpha: clamp(0.32 + unmaskedFactor * 0.68, 0.25, 1),
      vibeMode: this.palette.mode,
      timeSec: this.elapsedSec,
    });
    drawLimbDarkenedStar(c2d, sx, sy, scale * 0.054, this.scenario.starClass, clamp(0.38 + unmaskedFactor * 0.62, 0.3, 1));

    // Matte-Black Lyot Occulting Mask + Realistic Solar-Eclipse Bezel Corona
    c2d.save();

    // Glare leak around undersized mask (locked spider-vane axis, zero spinning spikes!)
    if (sizeStatus === 'too_small' && centered) {
      drawOpticalStar(c2d, mx, my, mr * 0.92, {
        spectralClass: this.scenario.starClass,
        spikes: 6,
        alpha: 0.78,
        rotationRad: 0,
        vibeMode: this.palette.mode,
      });
    }

    // Subtle eclipse bezel corona ring when occulting star cleanly
    if (centered && sizeStatus === 'ok') {
      c2d.strokeStyle = this.palette.mode === 'cold' ? 'rgba(158, 232, 255, 0.52)' : 'rgba(255, 224, 165, 0.48)';
      c2d.lineWidth = 3.5;
      c2d.beginPath();
      c2d.arc(mx, my, mr + 1.5, 0, Math.PI * 2);
      c2d.stroke();
    }

    c2d.fillStyle = 'rgba(3, 6, 12, 0.97)';
    c2d.strokeStyle =
      sizeStatus !== 'ok' ? '#ff9d5c' : this.servoLocked || masked ? this.palette.lockHex : this.palette.accentHex;
    c2d.lineWidth = this.servoLocked ? 2.2 : 1.6;
    c2d.beginPath();
    c2d.arc(mx, my, mr, 0, Math.PI * 2);
    c2d.fill();
    c2d.stroke();

    // Subtle alignment crosshair inside the Lyot stop
    c2d.strokeStyle = 'rgba(220, 236, 252, 0.22)';
    c2d.lineWidth = 1;
    c2d.beginPath();
    c2d.moveTo(mx - 6, my);
    c2d.lineTo(mx + 6, my);
    c2d.moveTo(mx, my - 6);
    c2d.lineTo(mx, my + 6);
    c2d.stroke();

    if (this.servoLocked) {
      const frac = clamp(this.servoHoldSec / Math.max(0.1, this.servoMaxSec), 0, 1);
      c2d.strokeStyle = sizeStatus === 'ok' ? this.palette.lockHex : '#ff9d5c';
      c2d.lineWidth = 2.2;
      c2d.beginPath();
      c2d.arc(mx, my, mr + 7, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * frac);
      c2d.stroke();

      c2d.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = sizeStatus === 'ok' ? this.palette.lockHex : '#ff9d5c';
      c2d.textAlign = 'center';
      if (mr >= 24) {
        c2d.fillText('LOCK', mx, my - 8);
      }
      if (sizeStatus !== 'ok') {
        c2d.fillText(
          sizeStatus === 'too_small' ? 'AIRY LEAK — WIDEN IWA' : 'IWA TOO WIDE — ECLIPSING INNER ORBIT',
          mx,
          my + mr + 20
        );
      }
    } else if (this.stageClearTimer <= 0) {
      c2d.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      c2d.setLineDash?.([4, 4]);
      c2d.beginPath();
      c2d.arc(sx, sy, scale * 0.062, 0, Math.PI * 2);
      c2d.stroke();
    }
    c2d.restore();

    // Subtle contrast & target readout at top of optical field
    const contrastExp = lerp(3.4, 6.2, masked ? 1 : visibility * 0.65);
    const iwaArcsec = lerp(0.14, 0.64, this.maskSize01);
    c2d.save();
    c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = 'rgba(204, 224, 244, 0.66)';
    c2d.textAlign = 'center';
    const readout = this.profile.showNumericDeltas
      ? `${this.scenario.starLabel} · CONTRAST 10^-${contrastExp.toFixed(1)} · IWA ${iwaArcsec.toFixed(2)}"`
      : `${this.scenario.starLabel} · CONTRAST 10^-${contrastExp.toFixed(1)}`;
    c2d.fillText(readout, w * 0.5, this.compact ? 56 : 70);
    c2d.restore();

    // Stage 2–3 Mask IWA Radius Vernier (safely above mobile bottom console!)
    if (this.stage >= 2) {
      this.sizeItemInput[0].label = 'LYOT MASK IWA';
      this.sizeItemInput[0].val01 = this.maskSize01;
      this.sizeItemInput[0].locked = sizeStatus === 'ok';
      this.sizeItemInput[0].rightText = `${iwaArcsec.toFixed(2)}"`;
      layoutVernierRowInto(this.sizeStripBuf, w, h, this.sizeItemInput, this.compact ? h - 82 : h - 102);
      drawVernierStrip(c2d, this.sizeStripBuf[0], this.palette.accentHex, this.palette.lockHex);
    } else {
      this.sizeStripBuf.length = 0;
    }

    this.drawSharedOverlays(c2d, w, h);
  }

  protected getStageProgress01(): number {
    const found = this.planets.filter((p) => p.found).length;
    return clamp((this.stage - 1 + found / Math.max(1, this.planets.length)) / 3, 0, 1);
  }

  protected getPromptText(): string {
    const found = this.planets.filter((p) => p.found).length;
    const total = this.planets.length;
    const sizeStatus = this.getMaskSizeStatus();
    if (this.servoLocked && sizeStatus === 'ok') {
      return `SERVO LOCKED (${this.servoHoldSec.toFixed(1)}s) — Tap revealed exoplanets (${found}/${total}).`;
    }
    if (sizeStatus === 'too_small') {
      return 'Airy glare leaking past mask! Widen LYOT MASK IWA (slider, scroll, or E).';
    }
    if (sizeStatus === 'too_wide') {
      return 'Mask IWA too wide — eclipsing inner planet! Narrow LYOT MASK IWA (slider, scroll, or Q).';
    }
    return `Drag the black Lyot mask onto the star to engage Auto-Track, then tap exoplanets (${found}/${total}).`;
  }

  protected solveCurrentStage(stage: 1 | 2 | 3): void {
    void stage;
    const { sx, sy } = this.getStarCenterPx(this.width, this.height);
    this.maskNx = sx / Math.max(1, this.width);
    this.maskNy = sy / Math.max(1, this.height);
    this.maskSize01 = 0.46;
    this.servoLocked = true;
    this.servoHoldSec = this.servoMaxSec;
    for (let i = 0; i < this.planets.length; i++) {
      this.planets[i].found = true;
    }
  }

  protected override verifySolved(): boolean {
    return (
      this.getMaskSizeStatus() === 'ok' &&
      this.planets.length > 0 &&
      this.planets.every((p) => p.found)
    );
  }

  protected onAllStagesCleared(): void {
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.finishSuccess({
      accuracy: 0.96,
      proofFragmentSuffix: 'coronagraph',
      dossierSnippet: `High-contrast Lyot coronagraphy (${this.activeVariant?.label ?? 'Apodizer'}) imaged hidden companions on ${this.ctx.targetName}.`,
      telemetrySummary: `Contrast 10^-6.2 · IWA ${lerp(0.14, 0.64, this.maskSize01).toFixed(2)}" · ${totalSec.toFixed(1)}s`,
      physicalPrinciple: 'Lyot Stellar Coronagraphy, Inner Working Angle (IWA) & Direct Exoplanet Imaging',
    });
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'A Lyot coronagraph blocks a star’s central Airy diffraction core with a matte occulting mask so exoplanets a million times fainter become directly visible beyond the Inner Working Angle (IWA).',
      goalSummary:
        'Snap the Lyot mask onto the star to lock Auto-Track Servo, tune IWA so glare stops leaking without hiding inner orbits, and tap revealed worlds.',
      controlsDesktop:
        'Drag mask onto star glare, adjust LYOT MASK IWA (slider / wheel / Q–E), and click planets (or Space).',
      controlsTouch: 'Touch-drag the black mask onto the star, pinch or slide IWA, then tap revealed exoplanets.',
      warmthEffect:
        'Warm H% widens servo lock capture; Cold H% tightens occultation alignment and reveals live contrast & IWA arcsec readouts.',
    };
  }
}
