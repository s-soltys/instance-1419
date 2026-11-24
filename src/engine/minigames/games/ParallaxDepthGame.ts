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
import { drawOpticalStar } from '../render/StarPSFAtlas';
import { clamp, lerp } from '../tactilePhysics';
import type {
  CosmicPlateId,
  HudActionButtonSpec,
  InstrumentFieldGuide,
  MinigameVariantSpec,
  SpectralClass,
} from '../types';

const TRAIL_LEN = 8;
const TRAIL_SAMPLE_INTERVAL = 0.036;

interface ParallaxStar {
  id: number;
  baseNx: number;
  baseNy: number;
  layer: 'near' | 'mid' | 'deep' | 'rogue';
  isTarget: boolean;
  found: boolean;
  rejectFlash: number;
  // Decoupled visual brightness/color (real astrophysics: distant supergiants can outshine near M-dwarfs!)
  apparentRadius: number;
  spectralClass: SpectralClass;
  parallaxMas: number; // Real milliarcseconds (d_pc = 1000 / p_mas)
  properMotionArcsecYr: number;
  // True 2D oblique linear proper motion state for rogue stars
  rogueOffNx: number;
  rogueOffNy: number;
  rogueVx: number;
  rogueVy: number;
  // FPS-independent ring buffer trail (zero Frame-1 streak!)
  trailX: Float32Array;
  trailY: Float32Array;
  trailHead: number;
  trailInitialized: boolean;
}

interface ParallaxVariantProfile {
  elliptical2D: boolean;
  stage3RogueCount: number;
  maxShiftFrac: number;
  surveyLabel: string;
}

const PARALLAX_VARIANTS: readonly MinigameVariantSpec[] = [
  { index: 0, id: 'parallax_depth_v1', label: 'Tarantula Cluster Depth', plateId: 'tarantula' },
  { index: 1, id: 'parallax_depth_v2', label: 'Rho Oph 390ly Foreground', plateId: 'rho_ophiuchi' },
  { index: 2, id: 'parallax_depth_v3', label: 'Horsehead Silhouette Plane', plateId: 'horsehead' },
  { index: 3, id: 'parallax_depth_v4', label: 'Rogue Proper-Motion Sweep', plateId: 'tarantula' },
];

const VARIANT_PROFILES: readonly ParallaxVariantProfile[] = [
  { elliptical2D: false, stage3RogueCount: 1, maxShiftFrac: 0.135, surveyLabel: 'EQUATORIAL ±1 AU' },
  { elliptical2D: true, stage3RogueCount: 1, maxShiftFrac: 0.115, surveyLabel: 'ECLIPTIC 2D ORBIT' },
  { elliptical2D: false, stage3RogueCount: 1, maxShiftFrac: 0.13, surveyLabel: 'HYADES DEPTH PLANE' },
  { elliptical2D: false, stage3RogueCount: 2, maxShiftFrac: 0.135, surveyLabel: 'SOL+10ly PROPER MOTION' },
];

const ALL_SPECTRAL: readonly SpectralClass[] = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];

/**
 * PRX-21 — Orbital Parallax Depth Sorter
 * Rock the ±1.0 AU orbital baseline (1D equatorial OR 2D ecliptic parallactic ellipses) to
 * discriminate NEAR, MID, and DEEP layers purely by angular parallax amplitude (d_pc = 1/p_arcsec) —
 * with apparent size/color realistically decoupled from distance, uniform neutral velocity trails
 * backed by an FPS-independent ring buffer, true 2D oblique linear proper motion for rogue stars,
 * and layered 3D sky parallax across backdrop, ambient stars, and 3D showcase!
 */
export class ParallaxDepthGame extends BaseCosmicMinigame {
  readonly id = 'parallax_depth';
  readonly title = 'ORBITAL PARALLAX DEPTH';
  readonly subtitle = 'Baseline Depth-Layer Sorting';
  readonly instrumentCode = 'PRX-21';
  readonly platePool: readonly CosmicPlateId[] = ['tarantula', 'rho_ophiuchi', 'horsehead'];
  readonly variants = PARALLAX_VARIANTS;

  private variantProfile: ParallaxVariantProfile = VARIANT_PROFILES[0];
  private baseline01 = 0.5;
  private autoRock = true;
  private autoPhase = 0;
  private strips: VernierStripSpec[] = [];
  private stripInputs: VernierItemInput[] = [];
  private dragMode: 'strip' | 'sky' | null = null;
  private dragStartBaseline = 0.5;
  private dragStartX = 0;

  private stars: ParallaxStar[] = [];
  private trailSampleAccum = 0;
  private wrongTapCount = 0;

  protected onMount(): void {
    this.variantProfile = VARIANT_PROFILES[this.iterationIndex % VARIANT_PROFILES.length];
    this.wrongTapCount = 0;
  }

  private getAutoRockSpeed(): number {
    if (this.profile.vibe === 'warm') return 1.05;
    if (this.profile.vibe === 'cold') return 1.38;
    return 1.22;
  }

  protected onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.baseline01 = 0.5;
    this.autoRock = true;
    this.autoPhase = 0;
    this.dragMode = null;
    this.trailSampleAccum = 0;
    this.stars = [];

    const specs: Array<{ layer: ParallaxStar['layer']; isTarget: boolean }> = [];
    if (stage === 1) {
      for (let i = 0; i < 3; i++) specs.push({ layer: 'near', isTarget: true });
      for (let i = 0; i < 7; i++) specs.push({ layer: 'deep', isTarget: false });
    } else if (stage === 2) {
      for (let i = 0; i < 3; i++) specs.push({ layer: 'mid', isTarget: true });
      for (let i = 0; i < 4; i++) specs.push({ layer: 'near', isTarget: false });
      for (let i = 0; i < 6; i++) specs.push({ layer: 'deep', isTarget: false });
    } else {
      const rogues = this.variantProfile.stage3RogueCount;
      for (let i = 0; i < rogues; i++) specs.push({ layer: 'rogue', isTarget: true });
      for (let i = 0; i < 3 - rogues; i++) specs.push({ layer: 'mid', isTarget: true });
      for (let i = 0; i < 4; i++) specs.push({ layer: 'near', isTarget: false });
      for (let i = 0; i < 6; i++) specs.push({ layer: 'deep', isTarget: false });
    }

    // Shuffle layer order across stratified vertical lanes inside ny ∈ [0.20, 0.62]
    // so stars NEVER cross directly on top of each other or drop into the bottom vernier!
    const count = specs.length;
    const laneIndices: number[] = [];
    for (let i = 0; i < count; i++) laneIndices.push(i);
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = laneIndices[i];
      laneIndices[i] = laneIndices[j];
      laneIndices[j] = tmp;
    }

    for (let i = 0; i < count; i++) {
      const sp = specs[i];
      const laneFrac = (laneIndices[i] + 0.5) / count;
      const baseNy = lerp(0.21, 0.62, laneFrac) + (rng() - 0.5) * 0.015;
      const baseNx = 0.22 + rng() * 0.56;

      // Decouple apparent brightness & color from distance!
      const apparentRadius = 5.0 + rng() * 3.8;
      const spectralClass = ALL_SPECTRAL[Math.floor(rng() * ALL_SPECTRAL.length)];

      // Physical parallax angle p (mas) -> distance d (pc) = 1000 / p_mas
      const parallaxMas =
        sp.layer === 'near'
          ? 125 + rng() * 110
          : sp.layer === 'mid'
          ? 44 + rng() * 18
          : sp.layer === 'rogue'
          ? 38 + rng() * 16
          : 2.2 + rng() * 4.5;

      // True 2D oblique linear proper motion vector for rogue stars (NEVER horizontal sine!)
      const signX = rng() > 0.5 ? 1 : -1;
      const signY = rng() > 0.5 ? 1 : -1;
      const pmAng = (0.42 + rng() * 0.42) * signY; // 24°..48° oblique inclination!
      const pmSpeed = 0.042 + rng() * 0.016; // normalized viewport units/sec

      this.stars.push({
        id: i,
        baseNx,
        baseNy: clamp(baseNy, 0.2, 0.63),
        layer: sp.layer,
        isTarget: sp.isTarget,
        found: false,
        rejectFlash: 0,
        apparentRadius,
        spectralClass,
        parallaxMas,
        properMotionArcsecYr: sp.layer === 'rogue' ? 8.6 + rng() * 3.6 : 0.04 + rng() * 0.12,
        rogueOffNx: 0,
        rogueOffNy: 0,
        rogueVx: Math.cos(pmAng) * pmSpeed * signX,
        rogueVy: Math.sin(pmAng) * pmSpeed,
        trailX: new Float32Array(TRAIL_LEN),
        trailY: new Float32Array(TRAIL_LEN),
        trailHead: 0,
        trailInitialized: false,
      });
    }
  }

  onHelperAction(actionId: string): void {
    if (actionId === 'toggle_autorock' && !this.completed && this.stageClearTimer <= 0) {
      this.toggleAutoRock();
    }
  }

  protected getHelperActionSpec(): HudActionButtonSpec {
    return {
      id: 'toggle_autorock',
      label: this.autoRock ? 'PAUSE ORBIT ROCK [SPACE]' : 'AUTO-ROCK ORBIT [SPACE]',
      active: this.autoRock,
    };
  }

  private toggleAutoRock(): void {
    this.autoRock = !this.autoRock;
    this.ctx.audio?.playSolenoidClack(false);
    platform.triggerHaptic('vernierTick', 0.45);
    this.emitHud(true);
  }

  /**
   * Computes current orbital baseline vector (bx, by) in [-1, +1]:
   * - 1D equatorial: horizontal swing bx ∈ [-1, 1], by = 0
   * - 2D ecliptic (Variant 2): full orbital ellipse bx = cos(θ), by = 0.55 * sin(θ)
   */
  private getBaselineVector(): { bx: number; by: number } {
    if (this.variantProfile.elliptical2D) {
      const theta = (this.baseline01 - 0.5) * Math.PI * 2;
      return { bx: Math.sin(theta), by: Math.cos(theta) * 0.52 };
    }
    return { bx: (this.baseline01 - 0.5) * 2, by: 0 };
  }

  private getStarScreenPos(s: ParallaxStar, w: number, h: number): { x: number; y: number } {
    const { bx, by } = this.getBaselineVector();
    const maxShiftX = w * this.variantProfile.maxShiftFrac;
    const maxShiftY = h * (this.variantProfile.elliptical2D ? 0.11 : 0);

    let depthMul = 0.04;
    if (s.layer === 'near') depthMul = 1.0;
    else if (s.layer === 'mid') depthMul = 0.44;
    else if (s.layer === 'rogue') depthMul = 0.36;

    let nx = s.baseNx + (bx * maxShiftX * depthMul) / Math.max(1, w);
    let ny = s.baseNy + (by * maxShiftY * depthMul) / Math.max(1, h);

    if (s.layer === 'rogue') {
      nx += s.rogueOffNx;
      ny += s.rogueOffNy;
    }

    return { x: nx * w, y: ny * h };
  }

  private resetStarTrail(s: ParallaxStar, x: number, y: number): void {
    for (let k = 0; k < TRAIL_LEN; k++) {
      s.trailX[k] = x;
      s.trailY[k] = y;
    }
    s.trailHead = 0;
    s.trailInitialized = true;
  }

  protected onResize(): void {
    // Re-sync ring-buffer trail positions on resize so no fake streaks shoot across screen
    for (let i = 0; i < this.stars.length; i++) {
      this.stars[i].trailInitialized = false;
    }
  }

  protected onPointerDown(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;

    if (this.strips.length > 0 && hitVernierStrip(this.strips[0], ev.x, ev.y)) {
      this.autoRock = false;
      this.dragMode = 'strip';
      this.baseline01 = valueFromStripX(this.strips[0], ev.x, 0.5, 0);
      platform.triggerHaptic('vernierTick', 0.4);
      this.emitHud(true);
      return;
    }

    // Nearest-star hit test with generous touch radius (34px desktop / 42px touch)
    const pickR = ev.pointerType === 'touch' ? 42 : 34;
    let bestStar: ParallaxStar | null = null;
    let bestDist = pickR;

    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      if (s.found) continue;
      const pos = this.getStarScreenPos(s, this.width, this.height);
      const d = Math.hypot(ev.x - pos.x, ev.y - pos.y);
      if (d < bestDist) {
        bestDist = d;
        bestStar = s;
      }
    }

    if (bestStar) {
      const pos = this.getStarScreenPos(bestStar, this.width, this.height);
      if (bestStar.isTarget) {
        bestStar.found = true;
        platform.triggerHaptic('phaseSnapLock', 0.9);
        this.ctx.audio?.playTumblerClick(0.92, true);
        this.particles.emitPhotonSparks(pos.x, pos.y, 4, 30, this.palette.lockHex);
        this.particles.emitLockCausticRing(pos.x, pos.y, 14, this.palette.lockHex);
        const targs = this.stars.filter((item) => item.isTarget);
        if (targs.every((item) => item.found)) {
          this.triggerStageClear(`PARALLAX DEPTH ${this.stage}/3 SORTED`, 0.62, pos.x, pos.y);
        } else {
          this.emitHud(true);
        }
      } else {
        bestStar.rejectFlash = 1.0;
        this.wrongTapCount++;
        platform.triggerHaptic('rejectThud', 0.65);
        this.ctx.audio?.playSolenoidClack(false);
      }
      return;
    }

    // Direct sky drag scrubs orbital baseline smoothly
    this.autoRock = false;
    this.dragMode = 'sky';
    this.dragStartBaseline = this.baseline01;
    this.dragStartX = ev.x;
    this.emitHud(true);
  }

  protected onPointerMove(ev: PointerLocalEvent): void {
    if (!this.dragMode || this.stageClearTimer > 0) return;
    if (this.dragMode === 'strip' && this.strips.length > 0) {
      this.baseline01 = valueFromStripX(this.strips[0], ev.x, 0.5, 0);
    } else if (this.dragMode === 'sky') {
      const delta = (ev.x - this.dragStartX) / Math.max(120, this.width * 0.48);
      if (this.variantProfile.elliptical2D) {
        const wrapped = (this.dragStartBaseline + delta) % 1;
        this.baseline01 = wrapped < 0 ? wrapped + 1 : wrapped;
      } else {
        this.baseline01 = clamp(this.dragStartBaseline + delta, 0, 1);
      }
    }
  }

  protected onPointerUp(): void {
    this.dragMode = null;
  }

  protected onKeyDown(e: KeyboardEvent): void {
    if (this.stageClearTimer > 0) return;
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      this.toggleAutoRock();
      return;
    }
    const step = e.shiftKey ? 0.015 : 0.036;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      this.autoRock = false;
      this.baseline01 = this.variantProfile.elliptical2D
        ? (this.baseline01 - step + 1) % 1
        : clamp(this.baseline01 - step, 0, 1);
      this.emitHud(true);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      this.autoRock = false;
      this.baseline01 = this.variantProfile.elliptical2D
        ? (this.baseline01 + step) % 1
        : clamp(this.baseline01 + step, 0, 1);
      this.emitHud(true);
    }
  }

  protected onUpdate(dt: number): void {
    if (this.autoRock && !this.dragMode) {
      this.autoPhase += dt * this.getAutoRockSpeed();
      if (this.variantProfile.elliptical2D) {
        this.baseline01 = (this.autoPhase / (Math.PI * 2)) % 1;
      } else {
        this.baseline01 = 0.5 + Math.sin(this.autoPhase) * 0.46;
      }
    }

    // Advance true 2D oblique linear proper motion on rogue stars (continues even while baseline is paused!)
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      if (s.rejectFlash > 0) s.rejectFlash = Math.max(0, s.rejectFlash - dt * 2.4);
      if (s.layer !== 'rogue') continue;

      s.rogueOffNx += s.rogueVx * dt;
      s.rogueOffNy += s.rogueVy * dt;

      // Seamless toroidal wrap inside safe sky bounds with clean trail reset (zero turnaround freeze!)
      const curNx = s.baseNx + s.rogueOffNx;
      const curNy = s.baseNy + s.rogueOffNy;
      let wrapped = false;
      if (curNx > 0.84) {
        s.rogueOffNx -= 0.68;
        wrapped = true;
      } else if (curNx < 0.16) {
        s.rogueOffNx += 0.68;
        wrapped = true;
      }
      if (curNy > 0.63) {
        s.rogueOffNy -= 0.42;
        wrapped = true;
      } else if (curNy < 0.2) {
        s.rogueOffNy += 0.42;
        wrapped = true;
      }
      if (wrapped) {
        s.trailInitialized = false;
      }
    }

    // Fixed-interval ring-buffer trail sampling (100% FPS-independent across 30/60/120Hz!)
    this.trailSampleAccum += dt;
    const shouldSample = this.trailSampleAccum >= TRAIL_SAMPLE_INTERVAL;
    if (shouldSample) {
      this.trailSampleAccum -= TRAIL_SAMPLE_INTERVAL;
      if (this.trailSampleAccum > TRAIL_SAMPLE_INTERVAL) this.trailSampleAccum = 0;
    }

    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const pos = this.getStarScreenPos(s, this.width, this.height);
      if (!s.trailInitialized) {
        this.resetStarTrail(s, pos.x, pos.y);
      } else if (shouldSample) {
        s.trailHead = (s.trailHead + 1) % TRAIL_LEN;
        s.trailX[s.trailHead] = pos.x;
        s.trailY[s.trailHead] = pos.y;
      }
    }

    // Drive layered 3D sky parallax directly from the orbital baseline!
    const { bx, by } = this.getBaselineVector();
    this.pointerNormX = bx * 0.85;
    this.pointerNormY = by * 0.85;
  }

  protected onAllStagesCleared(): void {
    this.finishSuccess({
      accuracy: clamp(1 - this.wrongTapCount * 0.05, 0.72, 1),
      proofFragmentSuffix: 'parallax',
      dossierSnippet: `3D astrometric parallax shells (d = 1/p pc) & oblique rogue proper motion isolated (${this.variantProfile.surveyLabel}) on ${this.ctx.targetName}.`,
      telemetrySummary: `Parallax Layers Sorted · ${this.elapsedSec.toFixed(1)}s`,
      physicalPrinciple: 'Trigonometric Orbital Parallax (d_pc = 1 / p_arcsec) & Linear Proper Motion',
    });
  }

  protected getStageProgress01(): number {
    if (this.completed) return 1;
    let total = 0;
    let done = 0;
    for (let i = 0; i < this.stars.length; i++) {
      if (this.stars[i].isTarget) {
        total++;
        if (this.stars[i].found) done++;
      }
    }
    return clamp((this.stage - 1 + done / Math.max(1, total)) / 3, 0, 1);
  }

  protected getPromptText(): string {
    let total = 0;
    let done = 0;
    for (let i = 0; i < this.stars.length; i++) {
      if (this.stars[i].isTarget) {
        total++;
        if (this.stars[i].found) done++;
      }
    }
    if (this.stage === 1) {
      return `Judge swing amplitude (not brightness!) to click the ${total} widest-swinging NEAR foreground stars (${done}/${total}).`;
    }
    if (this.stage === 2) {
      return `Isolate the ${total} moderate-swing MID-LAYER cluster stars gliding between foreground & deep sky (${done}/${total}).`;
    }
    const rCount = this.variantProfile.stage3RogueCount;
    const mCount = total - rCount;
    return `Press PAUSE ORBIT ROCK [Space] to freeze parallax — tag the ${rCount} oblique-drifting ROGUE star${rCount > 1 ? 's' : ''} + ${mCount} MID star${mCount > 1 ? 's' : ''} (${done}/${total}).`;
  }

  private drawDepthLegendAndOrbit(c2d: CanvasRenderingContext2D, w: number, h: number, stripY: number): void {
    const compact = h < 450;
    const { bx, by } = this.getBaselineVector();

    c2d.save();
    // Subtle schematic depth swing legend at top-center (zero color spoiler!)
    const legY = compact ? 52 : 62;
    c2d.font = '600 8px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = 'rgba(204, 226, 246, 0.72)';
    c2d.textAlign = 'center';
    const modeLabel = this.variantProfile.elliptical2D ? '2D ELLIPSE' : '±1.0 AU';
    c2d.fillText(`${modeLabel} · NEAR ↔↔  ·  MID ↔  ·  DEEP ·`, w * 0.5, legY);

    // Miniature orbiting probe schematic right above the baseline vernier
    const orbCx = w * 0.5;
    const orbCy = stripY - (compact ? 22 : 26);
    const orbRx = compact ? 38 : 48;
    const orbRy = this.variantProfile.elliptical2D ? 11 : 6;
    c2d.strokeStyle = 'rgba(200, 224, 248, 0.25)';
    c2d.lineWidth = 1;
    if (typeof c2d.ellipse === 'function') {
      c2d.beginPath();
      c2d.ellipse(orbCx, orbCy, orbRx, orbRy, 0, 0, Math.PI * 2);
      c2d.stroke();
    }
    // Central star (Sol) + orbiting survey probe dot
    c2d.fillStyle = '#ffe6bd';
    c2d.beginPath();
    c2d.arc(orbCx, orbCy, 2.3, 0, Math.PI * 2);
    c2d.fill();

    const probeX = orbCx + bx * orbRx;
    const probeY = orbCy + by * orbRy * 1.6;
    c2d.fillStyle = this.palette.accentHex;
    c2d.beginPath();
    c2d.arc(probeX, probeY, 3.2, 0, Math.PI * 2);
    c2d.fill();
    c2d.restore();
  }

  protected onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const compact = this.compact;
    const { bx, by } = this.getBaselineVector();

    // Layered 3D depth parallax across deep-space plate, 3-depth ambient stars & motes!
    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: 4,
      alpha: 0.45,
      brightness: 0.78,
      tintAlpha: 0.46,
      parallaxX: bx * 0.95,
      parallaxY: by * 0.95,
    });

    const trailBaseCol = this.palette.mode === 'cold' ? '#b8e8ff' : '#dceaff';

    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const pos = this.getStarScreenPos(s, w, h);

      // Uniform neutral FPS-independent motion wake from ring buffer (ZERO layer color/width spoiler!)
      if (s.trailInitialized) {
        c2d.save();
        c2d.strokeStyle = s.found ? this.palette.lockHex : trailBaseCol;
        c2d.lineWidth = 1.35;
        c2d.lineCap = 'round';
        const trailAlpha = this.profile.vibe === 'warm' ? 0.52 : 0.42;
        for (let step = 0; step < TRAIL_LEN - 1; step++) {
          const i0 = (s.trailHead - step + TRAIL_LEN) % TRAIL_LEN;
          const i1 = (s.trailHead - step - 1 + TRAIL_LEN) % TRAIL_LEN;
          const x0 = step === 0 ? pos.x : s.trailX[i0];
          const y0 = step === 0 ? pos.y : s.trailY[i0];
          const x1 = s.trailX[i1];
          const y1 = s.trailY[i1];
          const segD = Math.hypot(x0 - x1, y0 - y1);
          if (segD < 0.3 || segD > 120) continue; // skip wrap jumps & static noise
          c2d.globalAlpha = trailAlpha * (1 - step / TRAIL_LEN);
          c2d.beginPath();
          c2d.moveTo(x0, y0);
          c2d.lineTo(x1, y1);
          c2d.stroke();
        }
        c2d.restore();
      }

      // Multi-spectral PSF Star Sprite (size & color DECOUPLED from distance — zero spoilers!)
      drawOpticalStar(c2d, pos.x, pos.y, s.found ? Math.max(7.8, s.apparentRadius) : s.apparentRadius, {
        spectralClass: s.found ? 'LOCK' : s.spectralClass,
        spikes: s.apparentRadius > 7.4 || s.found ? 4 : 0,
        alpha: s.found ? 0.98 : 0.88,
        timeSec: this.elapsedSec,
        scintPhase: s.id * 1.37,
        vibeMode: this.palette.mode,
      });

      if (s.rejectFlash > 0.02) {
        c2d.save();
        c2d.strokeStyle = '#ff6b6b';
        c2d.globalAlpha = s.rejectFlash;
        c2d.lineWidth = 1.8;
        c2d.beginPath();
        c2d.arc(pos.x, pos.y, 15 + (1 - s.rejectFlash) * 10, 0, Math.PI * 2);
        c2d.stroke();
        c2d.restore();
      }

      if (s.found) {
        c2d.save();
        c2d.strokeStyle = this.palette.lockHex;
        c2d.lineWidth = 1.6;
        c2d.beginPath();
        c2d.arc(pos.x, pos.y, 15, 0, Math.PI * 2);
        c2d.stroke();

        // Real astrometric parsec / proper-motion telemetry upon lock (especially crisp in Cold H%!)
        if (this.profile.showNumericDeltas || s.layer === 'rogue') {
          const dPc = 1000 / Math.max(1, s.parallaxMas);
          const tag =
            s.layer === 'rogue'
              ? `ROGUE · μ ${s.properMotionArcsecYr.toFixed(1)}″/yr`
              : `${dPc.toFixed(1)} pc · ${Math.round(s.parallaxMas)} mas`;
          c2d.font = '600 8px ui-monospace, SFMono-Regular, Menlo, monospace';
          c2d.fillStyle = this.palette.lockHex;
          c2d.textAlign = 'center';
          c2d.fillText(tag, pos.x, pos.y + 24);
        }
        c2d.restore();
      }
    }

    // Bottom Baseline Vernier cleanly above #mg-helper-btn PAUSE ORBIT ROCK
    const stripY = compact ? h - 108 : h - 134;
    this.drawDepthLegendAndOrbit(c2d, w, h, stripY);

    const rightText = this.variantProfile.elliptical2D
      ? `${Math.round(this.baseline01 * 360)}° ORBIT`
      : `${bx >= 0 ? '+' : ''}${bx.toFixed(2)} AU`;

    this.stripInputs.length = 1;
    this.stripInputs[0] = {
      key: 'baseline',
      label: this.variantProfile.elliptical2D
        ? 'ORBITAL PHASE (0°–360°)'
        : 'ORBITAL BASELINE (ROCK L/R)',
      val01: this.baseline01,
      rightText,
    };
    layoutVernierRowInto(this.strips, w, h, this.stripInputs, stripY);
    drawVernierStrip(c2d, this.strips[0], this.palette.accentHex, this.palette.lockHex);

    this.drawSharedOverlays(c2d, w, h);
  }

  protected solveCurrentStage(_stage: 1 | 2 | 3): void {
    for (let i = 0; i < this.stars.length; i++) {
      if (this.stars[i].isTarget) {
        this.stars[i].found = true;
      }
    }
    const targs = this.stars.filter((s) => s.isTarget);
    if (targs.length === 0 || !targs.every((s) => s.found)) {
      throw new Error(`PRX-21 stage ${this.stage} target stars not solved`);
    }
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'As an observatory orbits across a ±1 AU baseline, nearby stars swing wider (d_pc = 1 / p_arcsec) regardless of apparent brightness; pausing baseline sway isolates oblique proper-motion rogue stars.',
      goalSummary:
        'Observe or scrub the Orbital Baseline to sort depth layers purely by angular swing amplitude, and pause to catch oblique-drifting rogue stars.',
      controlsDesktop:
        'Watch AUTO-ROCK ORBIT or press Space / drag ORBITAL BASELINE (or ←/→); click target depth-layer stars.',
      controlsTouch:
        'Tap PAUSE ORBIT ROCK to manually scrub ORBITAL BASELINE and tap matching depth stars.',
      warmthEffect:
        'Warm H% slows orbit sway and lengthens soft parallax wakes; Cold H% sharpens sweep cadence and displays milliarcsecond/parsec telemetry.',
    };
  }
}
