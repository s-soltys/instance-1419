import { platform } from '../../../platform/PlatformAdapter';
import { BaseCosmicMinigame, type PointerLocalEvent } from '../core/BaseCosmicMinigame';
import { getAspectFieldBox } from '../core/vernierWidgets';
import { drawGlowPolylineXY } from '../render/OpticalDrawUtils';
import { drawLimbDarkenedStar, drawOpticalStar, drawSoftDustPuff } from '../render/StarPSFAtlas';
import { clamp, lerp } from '../tactilePhysics';
import type {
  CosmicPlateId,
  HudActionButtonSpec,
  InstrumentFieldGuide,
  MinigameVariantSpec,
  SpectralClass,
} from '../types';

interface FieldPinpoint {
  tx: number;
  ty: number;
  size: number;
  spectral: SpectralClass;
  hasSpikes: boolean;
  phase: number;
}

interface EpochPt {
  tx: number;
  ty: number;
}

interface GravityMass {
  tx: number;
  ty: number;
  gm: number;
  massSolar: number;
}

interface BlinkVariantProfile {
  surveyTag: string;
  stage2Mode: 'conjunction' | 'accelerating';
  stage3TwinMass: boolean;
  epochStepYears: number;
}

const VARIANT_PROFILES: readonly BlinkVariantProfile[] = [
  {
    surveyTag: 'HUDF ASTROMETRY',
    stage2Mode: 'conjunction',
    stage3TwinMass: false,
    epochStepYears: 0.5,
  },
  {
    surveyTag: 'QUINTET TIDAL SURVEY',
    stage2Mode: 'accelerating',
    stage3TwinMass: false,
    epochStepYears: 1.0,
  },
  {
    surveyTag: 'SMACS LENS FIELD',
    stage2Mode: 'conjunction',
    stage3TwinMass: false,
    epochStepYears: 0.5,
  },
  {
    surveyTag: 'BINARY PROPER-MOTION',
    stage2Mode: 'conjunction',
    stage3TwinMass: true,
    epochStepYears: 0.25,
  },
];

// Isotropic safe interior box inside [0..1.75] x [0..1.0] (ZERO post-hoc clamping!)
const SAFE_TX_MIN = 0.2;
const SAFE_TX_MAX = 1.55;
const SAFE_TY_MIN = 0.16;
const SAFE_TY_MAX = 0.8;

function inSafeBounds(tx: number, ty: number): boolean {
  return tx >= SAFE_TX_MIN && tx <= SAFE_TX_MAX && ty >= SAFE_TY_MIN && ty <= SAFE_TY_MAX;
}

/**
 * BLK-06 — Star Trajectory Predictor
 * Isotropic aspect-locked epochal blink astrometry with zero silent coordinate clamping,
 * 16-substep Velocity Verlet Stage 3 gravitational deflection, animated Epoch 3->4 glide,
 * subtle Moffat field pinpoints (no colliding cartoon snowflakes), and full keyboard/Cold contrast parity.
 */
export class StarfieldBlinkSpotterGame extends BaseCosmicMinigame {
  readonly id = 'blink_spotter';
  readonly title = 'STAR TRAJECTORY PREDICTOR';
  readonly subtitle = 'Proper-Motion & Conjunction Forecast';
  readonly instrumentCode = 'BLK-06';

  readonly platePool: readonly CosmicPlateId[] = ['hudf', 'stephans_quintet', 'smacs'];
  readonly variants: readonly MinigameVariantSpec[] = [
    { index: 0, id: 'blink_spotter_v1', label: 'HUDF High-PM Drift', plateId: 'hudf', scenarioTag: 'barnard_pm' },
    { index: 1, id: 'blink_spotter_v2', label: 'Quintet Tidal Deflection', plateId: 'stephans_quintet', scenarioTag: 'quintet_tidal' },
    { index: 2, id: 'blink_spotter_v3', label: 'Cluster Lensing Arc', plateId: 'smacs', scenarioTag: 'cluster_lens' },
    { index: 3, id: 'blink_spotter_v4', label: 'Binary Proper-Motion', plateId: 'hudf', scenarioTag: 'binary_pm' },
  ];

  private variantCfg: BlinkVariantProfile = VARIANT_PROFILES[0];
  private staticStars: FieldPinpoint[] = [];
  private primaryEpochs: EpochPt[] = []; // [E1, E2, E3, Target E4]
  private secondaryEpochs: EpochPt[] = []; // Stage 2 crossing star OR Stage 3 linear decoy
  private glideCurve: EpochPt[] = []; // High-res E3 -> E4 path for smooth confirmation glide
  private masses: GravityMass[] = [];

  private activeEpochIdx = 0;
  private cycleTimer = 0;
  private showAllEpochs = false;

  private guessPos: { tx: number; ty: number; ok: boolean; timer: number } | null = null;
  private wrongTapCount = 0;
  private stageMisses = 0;
  private overridePrompt: string | null = null;

  private cursorTx = 0.88;
  private cursorTy = 0.48;
  private hasPointerHover = false;
  private kbdCursorActive = false;

  private readonly glideXY = new Float32Array(40);
  private readonly dustOrbitAng = new Float32Array(12);

  protected override onMount(): void {
    this.variantCfg = VARIANT_PROFILES[this.iterationIndex % VARIANT_PROFILES.length];
    this.wrongTapCount = 0;
    const rng = this.stageRng(1, 'swirl');
    for (let i = 0; i < this.dustOrbitAng.length; i++) {
      this.dustOrbitAng[i] = rng() * Math.PI * 2;
    }
  }

  protected override onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.guessPos = null;
    this.showAllEpochs = false;
    this.activeEpochIdx = 0;
    this.cycleTimer = 0;
    this.stageMisses = 0;
    this.overridePrompt = null;
    this.masses = [];
    this.secondaryEpochs = [];
    this.glideCurve = [];

    const spectralPool: readonly SpectralClass[] = ['B', 'A', 'F', 'G', 'K'];
    this.staticStars = [];
    for (let i = 0; i < 22; i++) {
      this.staticStars.push({
        tx: 0.08 + rng() * 1.59,
        ty: 0.08 + rng() * 0.84,
        size: i < 2 ? 3.2 : 1.4 + rng() * 1.4,
        spectral: spectralPool[i % spectralPool.length],
        hasSpikes: i < 2, // Only 2 faint background anchors get subtle 4-pt spikes; 20 are crisp Moffat pinpoints!
        phase: rng() * Math.PI * 2,
      });
    }

    if (stage === 1) {
      // Pure linear constant-velocity proper motion guaranteed strictly inside safe box
      const dir = rng() > 0.4 ? 1 : -1;
      const vx = dir * (0.21 + rng() * 0.055);
      const vy = (rng() - 0.5) * 0.11;
      const x0 = dir > 0 ? 0.3 + rng() * 0.14 : 1.45 - rng() * 0.14;
      const y0 = clamp(0.46 - vy * 1.5 + (rng() - 0.5) * 0.12, 0.24, 0.72);
      this.primaryEpochs = [0, 1, 2, 3].map((k) => ({
        tx: x0 + vx * k,
        ty: y0 + vy * k,
      }));
      this.glideCurve = this.buildLinearGlide(this.primaryEpochs[2], this.primaryEpochs[3]);
    } else if (stage === 2) {
      if (this.variantCfg.stage2Mode === 'accelerating') {
        // Tidal radial acceleration: step spacing grows cleanly (1.0x -> 1.32x -> 1.64x)
        const dir = rng() > 0.5 ? 1 : -1;
        const baseStep = 0.165;
        const accel = 0.052;
        const angle = (rng() - 0.5) * 0.32;
        const ux = Math.cos(angle) * dir;
        const uy = Math.sin(angle);
        const totalSpan = baseStep * 3 + accel * (0 + 1 + 2); // 0.651
        const startTx = dir > 0 ? 0.36 + rng() * 0.12 : 1.39 - rng() * 0.12;
        const startTy = clamp(0.48 - uy * totalSpan * 0.5, 0.24, 0.72);
        const pts: EpochPt[] = [{ tx: startTx, ty: startTy }];
        for (let k = 1; k <= 3; k++) {
          const prev = pts[k - 1];
          const stepLen = baseStep + accel * (k - 1);
          pts.push({ tx: prev.tx + ux * stepLen, ty: prev.ty + uy * stepLen });
        }
        this.primaryEpochs = pts;
        this.glideCurve = this.buildLinearGlide(pts[2], pts[3]);
      } else {
        // Exact Twin-Star Conjunction at Epoch 4: mathematically guaranteed ZERO clamping!
        const cx = 0.74 + rng() * 0.28; // [0.74..1.02]
        const cy = 0.44 + rng() * 0.2; // [0.44..0.64]
        const v1x = 0.145 + rng() * 0.032; // 3*v1x <= 0.531 -> cx - 3*v1x >= 0.209 >= SAFE_TX_MIN!
        const v1y = 0.07 + rng() * 0.025; // 3*v1y <= 0.285 -> cy - 3*v1y >= 0.155
        const v2x = -(0.14 + rng() * 0.032); // cx - 3*v2x <= 1.536 <= SAFE_TX_MAX!
        const v2y = 0.068 + rng() * 0.024;

        // Guarantee starting ty >= SAFE_TY_MIN
        const safeCy = Math.max(cy, SAFE_TY_MIN + 3 * Math.max(v1y, v2y) + 0.01);
        this.primaryEpochs = [0, 1, 2, 3].map((k) => ({
          tx: cx - (3 - k) * v1x,
          ty: safeCy - (3 - k) * v1y,
        }));
        this.secondaryEpochs = [0, 1, 2, 3].map((k) => ({
          tx: cx - (3 - k) * v2x,
          ty: safeCy - (3 - k) * v2y,
        }));
        this.glideCurve = this.buildLinearGlide(this.primaryEpochs[2], this.primaryEpochs[3]);
      }
    } else {
      // Stage 3: Smooth 16-substep Verlet gravity-bent trajectory in isotropic space + linear decoy
      const curveSign = rng() > 0.5 ? 1 : -1;
      const x0 = 0.28 + rng() * 0.08;
      const y0 = curveSign > 0 ? 0.34 + rng() * 0.06 : 0.62 - rng() * 0.06;

      if (this.variantCfg.stage3TwinMass) {
        this.masses = [
          { tx: x0 + 0.36, ty: y0 + curveSign * 0.24, gm: 0.019, massSolar: 9 },
          { tx: x0 + 0.72, ty: y0 + curveSign * 0.14, gm: 0.016, massSolar: 7 },
        ];
      } else {
        this.masses = [
          { tx: x0 + 0.44, ty: y0 + curveSign * 0.24, gm: 0.028, massSolar: 14 },
        ];
      }

      const sim = this.integrateGravityEpochs(x0, y0, 0.24, -curveSign * 0.055);
      this.primaryEpochs = sim.epochs;
      this.glideCurve = sim.finalSegment;

      // Straight linear decoy star crossing in another lane (guaranteed inside safe bounds)
      const dx0 = 1.44 - rng() * 0.08;
      const dy0 = curveSign > 0 ? 0.7 : 0.26;
      const dvx = -(0.19 + rng() * 0.03);
      const dvy = -curveSign * 0.035;
      this.secondaryEpochs = [0, 1, 2, 3].map((k) => ({
        tx: dx0 + dvx * k,
        ty: dy0 + dvy * k,
      }));
    }

    // Center keyboard reticle cleanly near Epoch 3
    const e3 = this.primaryEpochs[2];
    if (e3) {
      this.cursorTx = clamp(e3.tx + 0.14, SAFE_TX_MIN, SAFE_TX_MAX);
      this.cursorTy = clamp(e3.ty, SAFE_TY_MIN, SAFE_TY_MAX);
    }
  }

  private buildLinearGlide(a: EpochPt, b: EpochPt): EpochPt[] {
    const out: EpochPt[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      out.push({ tx: lerp(a.tx, b.tx, t), ty: lerp(a.ty, b.ty, t) });
    }
    return out;
  }

  private evalGravityAccel(tx: number, ty: number, gmScale = 1): { ax: number; ay: number } {
    let ax = 0;
    let ay = 0;
    for (let m = 0; m < this.masses.length; m++) {
      const mass = this.masses[m];
      const dx = mass.tx - tx;
      const dy = mass.ty - ty;
      const r2 = dx * dx + dy * dy + 0.038;
      const inv = (mass.gm * gmScale) / (r2 * Math.sqrt(r2));
      ax += dx * inv;
      ay += dy * inv;
    }
    return { ax, ay };
  }

  private integrateGravityEpochs(
    x0: number,
    y0: number,
    vx0: number,
    vy0: number,
    depth = 0,
    gmScale = 1
  ): { epochs: EpochPt[]; finalSegment: EpochPt[] } {
    const substeps = 16;
    const h = 1 / substeps;
    let tx = x0;
    let ty = y0;
    let vx = vx0;
    let vy = vy0;
    let { ax, ay } = this.evalGravityAccel(tx, ty, gmScale);

    const epochs: EpochPt[] = [{ tx, ty }];
    const finalSegment: EpochPt[] = [];

    for (let ep = 1; ep <= 3; ep++) {
      if (ep === 3) finalSegment.push({ tx, ty });
      for (let s = 0; s < substeps; s++) {
        // Velocity Verlet integration for smooth energy-conserving curvature
        tx += vx * h + 0.5 * ax * h * h;
        ty += vy * h + 0.5 * ay * h * h;
        const nextAcc = this.evalGravityAccel(tx, ty, gmScale);
        vx += 0.5 * (ax + nextAcc.ax) * h;
        vy += 0.5 * (ay + nextAcc.ay) * h;
        ax = nextAcc.ax;
        ay = nextAcc.ay;
        if (ep === 3) finalSegment.push({ tx, ty });
      }
      epochs.push({ tx, ty });
    }

    // If an extreme seed deflected outside safe bounds, reduce gravitational pull (gmScale)
    // instead of shrinking vx0 (which would lengthen dwell time and increase deflection!).
    if (depth < 6 && !epochs.every((p) => inSafeBounds(p.tx, p.ty))) {
      return this.integrateGravityEpochs(x0, y0, vx0, vy0, depth + 1, gmScale * 0.76);
    }
    return { epochs, finalSegment };
  }

  private getFieldBox(w: number, h: number) {
    return getAspectFieldBox(w, h, 1.75, 58, this.compact ? 92 : 98);
  }

  private getCaptureToleranceT(): number {
    // Isotropic field-unit capture tolerance (fair identically on desktop 1280x720 & mobile 844x390)
    if (this.profile.vibe === 'warm') return 0.135;
    if (this.profile.vibe === 'cold') return 0.095;
    return 0.115;
  }

  onHelperAction(actionId: string): void {
    if (actionId === 'toggle_pause' && !this.completed && this.stageClearTimer <= 0) {
      this.showAllEpochs = !this.showAllEpochs;
      this.ctx.audio?.playTumblerClick(0.65, true);
      this.emitHud(true);
    }
  }

  private submitPrediction(tx: number, ty: number): void {
    if (this.completed || this.stageClearTimer > 0) return;
    const trueE4 = this.primaryEpochs[3];
    if (!trueE4) return;

    const distT = Math.hypot(tx - trueE4.tx, ty - trueE4.ty);
    const box = this.getFieldBox(this.width, this.height);

    if (distT <= this.getCaptureToleranceT()) {
      this.guessPos = { tx, ty, ok: true, timer: 0.76 };
      this.overridePrompt = null;
      const sx = box.left + trueE4.tx * box.scale;
      const sy = box.top + trueE4.ty * box.scale;
      this.particles.emitPhotonSparks(sx, sy, 5, 36, this.palette.lockHex);
      this.triggerStageClear(
        this.stage === 2 && this.variantCfg.stage2Mode === 'conjunction'
          ? 'CONJUNCTION POINT LOCKED (2/${this.maxStages})'
          : `EPOCH 4 FORECAST VERIFIED (${this.stage}/${this.maxStages})`,
        0.76,
        sx,
        sy
      );
    } else {
      this.wrongTapCount += 1;
      this.stageMisses += 1;
      this.guessPos = { tx, ty, ok: false, timer: 0.85 };
      const sx = box.left + tx * box.scale;
      const sy = box.top + ty * box.scale;
      this.particles.emitLockCausticRing(sx, sy, 14, '#ff8b5e');
      platform.triggerHaptic('rejectThud', 0.6);
      this.ctx.audio?.playSolenoidClack(false);
      this.overridePrompt =
        this.stage === 2 && this.variantCfg.stage2Mode === 'conjunction'
          ? 'Trace where BOTH stars cross on Epoch 4 and click their conjunction point.'
          : this.stage === 3
          ? 'Follow the diamond-marked curved star bending toward the compact mass — ignore the dashed straight decoy.'
          : 'Match the star’s equal-time cadence across Epochs 1 → 2 → 3 and mark Epoch 4.';
      this.emitHud(true);
    }
  }

  protected override onPointerMove(ev: PointerLocalEvent): void {
    const box = this.getFieldBox(ev.w, ev.h);
    this.cursorTx = (ev.x - box.left) / box.scale;
    this.cursorTy = (ev.y - box.top) / box.scale;
    this.hasPointerHover = ev.pointerType !== 'touch';
    this.kbdCursorActive = false;
  }

  protected override onPointerDown(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;
    const box = this.getFieldBox(ev.w, ev.h);
    const tx = (ev.x - box.left) / box.scale;
    const ty = (ev.y - box.top) / box.scale;
    this.cursorTx = tx;
    this.cursorTy = ty;
    this.submitPrediction(tx, ty);
  }

  protected override onKeyDown(e: KeyboardEvent): void {
    if (this.stageClearTimer > 0) return;
    if (e.key === 'e' || e.key === 'E' || e.key === 'Tab') {
      e.preventDefault();
      this.onHelperAction('toggle_pause');
      return;
    }
    const step = e.shiftKey ? 0.02 : 0.045;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.kbdCursorActive = true;
      this.cursorTx = clamp(this.cursorTx - step, 0.08, 1.67);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.kbdCursorActive = true;
      this.cursorTx = clamp(this.cursorTx + step, 0.08, 1.67);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.kbdCursorActive = true;
      this.cursorTy = clamp(this.cursorTy - step, 0.08, 0.92);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.kbdCursorActive = true;
      this.cursorTy = clamp(this.cursorTy + step, 0.08, 0.92);
    } else if ((e.key === 'Enter' || e.code === 'Space') && this.kbdCursorActive) {
      e.preventDefault();
      this.submitPrediction(this.cursorTx, this.cursorTy);
    }
  }

  protected override onUpdate(dt: number): void {
    if (this.guessPos && !this.guessPos.ok) {
      this.guessPos.timer -= dt;
      if (this.guessPos.timer <= 0) this.guessPos = null;
    }

    for (let i = 0; i < this.dustOrbitAng.length; i++) {
      this.dustOrbitAng[i] += dt * (0.42 + (i % 4) * 0.14);
    }

    if (!this.showAllEpochs && this.stageClearTimer <= 0) {
      this.cycleTimer += dt;
      if (this.cycleTimer >= 0.74) {
        this.cycleTimer = 0;
        this.activeEpochIdx = (this.activeEpochIdx + 1) % 3;
        this.ctx.audio?.playProximityTick?.(0.35 + this.activeEpochIdx * 0.22);
      }
    }

    const total = this.getStageProgress01();
    this.ctx.showcase?.applyInstrumentPatch({
      progress: total,
      blinkFlip: this.activeEpochIdx === 2,
      humanity: this.ctx.state.humanity,
    });
  }

  protected override onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const box = this.getFieldBox(w, h);
    const toPxX = (tx: number) => box.left + tx * box.scale;
    const toPxY = (ty: number) => box.top + ty * box.scale;

    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: 2,
      alpha: lerp(0.56, 0.84, (this.stage - 1) / 2),
      brightness: 0.92,
      scale: 1.03,
      tintAlpha: 0.36,
      starOpacity: 0.65,
    });

    // Subtle Moffat pinpoint field stars (NO 18 giant colliding cartoon snowflakes!)
    for (let i = 0; i < this.staticStars.length; i++) {
      const s = this.staticStars[i];
      drawOpticalStar(c2d, toPxX(s.tx), toPxY(s.ty), s.size, {
        spectralClass: s.spectral,
        spikes: s.hasSpikes ? 4 : 0,
        alpha: s.hasSpikes ? 0.56 : 0.44,
        vibeMode: this.palette.mode,
        timeSec: this.elapsedSec,
        scintPhase: s.phase,
      });
    }

    // Authentic exposure epoch header & cadence dots (top-left safe margin)
    const dtYr = this.variantCfg.epochStepYears;
    const epYear = ((this.activeEpochIdx) * dtYr).toFixed(1);
    c2d.save();
    c2d.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = this.palette.secondaryHex;
    c2d.textAlign = 'left';
    const headerX = w * 0.06;
    const headerY = this.compact ? 58 : 78;
    const statusLabel =
      this.stageClearTimer > 0
        ? `● EP-4 · +${(dtYr * 3).toFixed(1)} yr (LOCKED)`
        : this.showAllEpochs
        ? `◎ EP 1–3 OVERLAY · Δt ${dtYr} yr`
        : `● EP-${this.activeEpochIdx + 1} · +${epYear} yr`;
    c2d.fillText(`${this.variantCfg.surveyTag}  |  ${statusLabel}`, headerX, headerY);

    // Subtle cadence dots • • ●
    for (let d = 0; d < 3; d++) {
      const active = this.showAllEpochs || d === this.activeEpochIdx;
      c2d.fillStyle = active ? this.palette.accentHex : 'rgba(200, 224, 248, 0.25)';
      c2d.beginPath();
      c2d.arc(headerX + 4 + d * 12, headerY + 11, active ? 3 : 2, 0, Math.PI * 2);
      c2d.fill();
    }
    c2d.restore();

    // Stage 3 Compact Remnant Gravity Well(s) (ZERO per-frame radial gradients!)
    for (let m = 0; m < this.masses.length; m++) {
      const mass = this.masses[m];
      const lx = toPxX(mass.tx);
      const ly = toPxY(mass.ty);
      const wellR = box.scale * 0.14;

      drawSoftDustPuff(c2d, lx, ly, wellR * 1.35, '#3b2412', 0.42);
      drawLimbDarkenedStar(c2d, lx, ly, this.compact ? 8 : 10, 'K', 0.92);

      // Concentric gravitational deflection contour rings + orbiting dust motes
      c2d.save();
      c2d.strokeStyle = `rgba(${this.palette.accentRgb}, 0.26)`;
      c2d.lineWidth = 1;
      c2d.setLineDash([4, 4]);
      c2d.beginPath();
      c2d.arc(lx, ly, wellR * 0.62, 0, Math.PI * 2);
      c2d.stroke();
      c2d.globalAlpha = 0.45;
      c2d.beginPath();
      c2d.arc(lx, ly, wellR * 1.05, 0, Math.PI * 2);
      c2d.stroke();
      c2d.setLineDash([]);

      c2d.font = '600 8px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = `rgba(${this.palette.secondaryRgb}, 0.72)`;
      c2d.textAlign = 'center';
      c2d.fillText(`${mass.massSolar} M☉`, lx, ly + wellR * 0.62 + 12);
      c2d.restore();

      for (let d = 0; d < 6; d++) {
        const a = this.dustOrbitAng[(m * 6 + d) % this.dustOrbitAng.length];
        const r = wellR * (0.48 + (d % 3) * 0.22);
        drawOpticalStar(c2d, lx + Math.cos(a) * r, ly + Math.sin(a) * r, 1.4, {
          spectralClass: 'G',
          spikes: 0,
          alpha: 0.45,
          vibeMode: this.palette.mode,
        });
      }
    }

    // Helper: draw epoch track with high-contrast Primary (diamond reticle) vs Secondary/Decoy (dashed circle)
    const drawTrack = (epochs: EpochPt[], isPrimary: boolean, isDecoy: boolean) => {
      // Faint cadence persistence connector when overlay is active OR after 2 misses on primary
      if ((this.showAllEpochs || (isPrimary && this.stageMisses >= 2)) && epochs.length >= 3) {
        c2d.save();
        c2d.strokeStyle = isDecoy
          ? 'rgba(148, 178, 212, 0.24)'
          : `rgba(${this.palette.accentRgb}, ${this.showAllEpochs ? '0.32' : '0.24'})`;
        c2d.lineWidth = 1.2;
        c2d.setLineDash([4, 5]);
        c2d.beginPath();
        c2d.moveTo(toPxX(epochs[0].tx), toPxY(epochs[0].ty));
        c2d.lineTo(toPxX(epochs[1].tx), toPxY(epochs[1].ty));
        c2d.lineTo(toPxX(epochs[2].tx), toPxY(epochs[2].ty));
        c2d.stroke();
        c2d.restore();
      }

      for (let i = 0; i < 3; i++) {
        const ep = epochs[i];
        if (!ep) continue;
        const x = toPxX(ep.tx);
        const y = toPxY(ep.ty);
        const isActive = this.showAllEpochs || i === this.activeEpochIdx;
        // Tapering persistence visibility across Epochs 1 -> 2 -> 3
        const ghostAlpha = isActive ? 1.0 : 0.22 + i * 0.16;

        const spectral: SpectralClass = isDecoy
          ? 'B'
          : isPrimary
          ? this.palette.mode === 'cold'
            ? 'A'
            : 'G'
          : 'O';

        if (isActive) {
          drawOpticalStar(c2d, x, y, isDecoy ? 7.2 : 9.6, {
            spectralClass: spectral,
            spikes: isDecoy ? 4 : 6,
            alpha: isDecoy ? 0.72 : 0.98,
            vibeMode: this.palette.mode,
          });
        } else {
          drawOpticalStar(c2d, x, y, isDecoy ? 3.2 : 4.2, {
            spectralClass: spectral,
            spikes: 0,
            alpha: ghostAlpha * 0.72,
            vibeMode: this.palette.mode,
          });
        }

        // Shape-coded reticle: Primary = sharp rotated diamond; Decoy = muted dashed circle (works in Warm AND Cold!)
        c2d.save();
        if (isDecoy) {
          c2d.strokeStyle = `rgba(146, 176, 210, ${(isActive ? 0.56 : 0.24).toFixed(2)})`;
          c2d.lineWidth = 1.2;
          c2d.setLineDash([3, 3]);
          c2d.beginPath();
          c2d.arc(x, y, isActive ? 12 : 6 + i * 1.4, 0, Math.PI * 2);
          c2d.stroke();
        } else {
          const r = isActive ? 13 : 6 + i * 1.6;
          c2d.strokeStyle = isPrimary ? this.palette.accentHex : this.palette.secondaryHex;
          c2d.globalAlpha = isActive ? 0.88 : ghostAlpha;
          c2d.lineWidth = isActive ? 1.8 : 1.1;
          if (isPrimary) {
            c2d.beginPath();
            c2d.moveTo(x, y - r);
            c2d.lineTo(x + r, y);
            c2d.lineTo(x, y + r);
            c2d.lineTo(x - r, y);
            c2d.closePath();
            c2d.stroke();
          } else {
            c2d.beginPath();
            c2d.arc(x, y, r, 0, Math.PI * 2);
            c2d.stroke();
          }
        }
        c2d.restore();
      }
    };

    drawTrack(this.primaryEpochs, true, false);
    if (this.secondaryEpochs.length > 0) {
      drawTrack(this.secondaryEpochs, false, this.stage === 3);
    }

    // Animated Epoch 3 -> Epoch 4 smooth physical glide upon confirmation!
    if (this.stageClearTimer > 0 && this.glideCurve.length >= 2) {
      const glideT = clamp(1 - this.stageClearTimer / 0.76, 0, 1);
      const easeT = 1 - Math.pow(1 - glideT, 3);
      const maxIdx = Math.max(1, Math.round(easeT * (this.glideCurve.length - 1)));
      for (let i = 0; i <= maxIdx; i++) {
        this.glideXY[i * 2] = toPxX(this.glideCurve[i].tx);
        this.glideXY[i * 2 + 1] = toPxY(this.glideCurve[i].ty);
      }
      drawGlowPolylineXY(c2d, this.glideXY, maxIdx + 1, this.palette.lockHex, 2.0, {
        outerWidthMul: 3.0,
        outerAlpha: 0.28,
        coreAlpha: 0.95,
      });

      const head = this.glideCurve[maxIdx];
      drawOpticalStar(c2d, toPxX(head.tx), toPxY(head.ty), 11.5, {
        spectralClass: 'LOCK',
        spikes: 6,
        alpha: 1,
        vibeMode: this.palette.mode,
      });
    }

    // Prediction reticle / miss feedback ring
    if (this.guessPos) {
      const gx = toPxX(this.guessPos.tx);
      const gy = toPxY(this.guessPos.ty);
      c2d.save();
      c2d.strokeStyle = this.guessPos.ok ? this.palette.lockHex : '#ff8b5e';
      c2d.lineWidth = 2.1;
      c2d.beginPath();
      c2d.arc(gx, gy, this.guessPos.ok ? 18 : 14, 0, Math.PI * 2);
      c2d.stroke();
      c2d.restore();
    }

    // Desktop / Keyboard diegetic astrometric crosshair
    if ((this.hasPointerHover || this.kbdCursorActive) && this.stageClearTimer <= 0) {
      const cx = toPxX(this.cursorTx);
      const cy = toPxY(this.cursorTy);
      const tolPx = this.getCaptureToleranceT() * box.scale;
      c2d.save();
      c2d.strokeStyle = `rgba(${this.palette.accentRgb}, ${this.kbdCursorActive ? '0.72' : '0.32'})`;
      c2d.lineWidth = 1;
      c2d.beginPath();
      c2d.moveTo(cx - 12, cy);
      c2d.lineTo(cx - 4, cy);
      c2d.moveTo(cx + 4, cy);
      c2d.lineTo(cx + 12, cy);
      c2d.moveTo(cx, cy - 12);
      c2d.lineTo(cx, cy - 4);
      c2d.moveTo(cx, cy + 4);
      c2d.lineTo(cx, cy + 12);
      c2d.stroke();

      if (this.kbdCursorActive) {
        c2d.setLineDash([3, 4]);
        c2d.beginPath();
        c2d.arc(cx, cy, Math.min(26, tolPx * 0.55), 0, Math.PI * 2);
        c2d.stroke();
      }
      if (this.profile.showNumericDeltas) {
        const e3 = this.primaryEpochs[2];
        if (e3) {
          const muMas = Math.round(Math.hypot(this.cursorTx - e3.tx, this.cursorTy - e3.ty) * 320);
          c2d.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
          c2d.fillStyle = this.palette.secondaryHex;
          c2d.globalAlpha = 0.72;
          c2d.textAlign = 'left';
          c2d.fillText(`Δθ ${muMas} mas`, cx + 14, cy - 6);
        }
      }
      c2d.restore();
    }

    this.drawSharedOverlays(c2d, w, h);
  }

  protected override getStageProgress01(): number {
    return clamp((this.stage - 1 + (this.stageClearTimer > 0 ? 1 : 0)) / 3, 0, 1);
  }

  protected override getPromptText(): string {
    if (this.overridePrompt) return this.overridePrompt;
    if (this.stage === 1) {
      return 'Read the diamond star’s 3-epoch proper-motion cadence and click where it lands at Epoch 4.';
    }
    if (this.stage === 2) {
      return this.variantCfg.stage2Mode === 'accelerating'
        ? 'Notice the star accelerating each epoch — forecast its longer Epoch 4 leap!'
        : 'Two stars converge across Epochs 1–3 — click the exact Epoch 4 conjunction point!';
    }
    return 'Ignore the dashed straight decoy — predict where the gravity-curved diamond star lands at Epoch 4.';
  }

  protected override getHelperActionSpec(): HudActionButtonSpec | null {
    return {
      id: 'toggle_pause',
      label: this.showAllEpochs ? 'RESUME CYCLE' : 'SHOW ALL 3 EPOCHS',
      active: this.showAllEpochs,
    };
  }

  protected override solveCurrentStage(_stage: 1 | 2 | 3): void {
    const e4 = this.primaryEpochs[3];
    if (e4) {
      this.guessPos = { tx: e4.tx, ty: e4.ty, ok: true, timer: 0.76 };
    }
  }

  protected override verifySolved(): boolean {
    return Boolean(this.guessPos?.ok);
  }

  protected override onAllStagesCleared(): void {
    const acc = clamp(1 - this.wrongTapCount * 0.05, 0.72, 1.0);
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.finishSuccess({
      accuracy: acc,
      proofFragmentSuffix: 'trajectory',
      dossierSnippet: `Proper-motion cadence, conjunction & gravitational deflection forecast cleanly (${this.variantCfg.surveyTag}) on ${this.ctx.targetName}.`,
      telemetrySummary: `${this.activeVariant?.label ?? 'Astrometry'} · Forecast ${(acc * 100).toFixed(0)}% · ${totalSec.toFixed(1)}s`,
      physicalPrinciple: 'Epochal Proper-Motion Astrometry, Stellar Conjunction & Gravitational Deflection',
    });
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Multi-epoch blink astrometry tracks proper motion (mas/yr), orbital acceleration, stellar conjunctions, and Keplerian deflection around dark compact stellar remnants.',
      goalSummary:
        'Study Epochs 1 → 2 → 3 and mark the star’s Epoch 4 destination across linear cadence, conjunction/acceleration, and gravity-deflected paths.',
      controlsDesktop: 'Click your predicted Epoch 4 landing (or Arrows + Enter); press E/Tab to toggle SHOW ALL 3 EPOCHS.',
      controlsTouch: 'Tap your predicted Epoch 4 destination; tap SHOW ALL 3 EPOCHS to compare exposures.',
      warmthEffect: 'Warm H% widens the prediction capture radius; Cold H% sharpens pinpoint astrometry and adds Δθ mas telemetry.',
    };
  }
}
