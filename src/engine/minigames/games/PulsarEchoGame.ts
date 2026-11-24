import { platform } from '../../../platform/PlatformAdapter';
import { BaseCosmicMinigame } from '../core/BaseCosmicMinigame';
import { drawGlowStroke, drawInclinedAstrometryRing } from '../render/OpticalDrawUtils';
import { drawLimbDarkenedStar, drawOpticalStar } from '../render/StarPSFAtlas';
import { angleDiffRad, clamp, lerp, wrapAngleRad } from '../tactilePhysics';
import type { CosmicPlateId, InstrumentFieldGuide, MinigameVariantSpec, SpectralClass } from '../types';

interface StarKnot {
  idx: number;
  angle: number;
  orbitFrac: number;
  pitchHz: number;
  spectral: SpectralClass;
  catchFlash: number;
  wrongFlash: number;
}

interface PulsarVariantProfile {
  periodMs: number;
  bFieldText: string;
  tiltY: number;
  knotDriftRadSec: number;
  baseSpeedMul: number;
  stage3Glitch: 'phase_slip' | 'glitch_surge';
  coreSpectral: SpectralClass;
}

const VARIANT_PROFILES: readonly PulsarVariantProfile[] = [
  {
    periodMs: 33.4,
    bFieldText: '3.8×10¹² G',
    tiltY: 0.96,
    knotDriftRadSec: 0,
    baseSpeedMul: 1.0,
    stage3Glitch: 'phase_slip',
    coreSpectral: 'O',
  },
  {
    periodMs: 18.7,
    bFieldText: '1.2×10¹² G',
    tiltY: 0.8,
    knotDriftRadSec: 0.14,
    baseSpeedMul: 1.04,
    stage3Glitch: 'phase_slip',
    coreSpectral: 'B',
  },
  {
    periodMs: 1.56,
    bFieldText: '4.1×10⁸ G',
    tiltY: 0.74,
    knotDriftRadSec: 0.18,
    baseSpeedMul: 1.1,
    stage3Glitch: 'glitch_surge',
    coreSpectral: 'A',
  },
  {
    periodMs: 89.3,
    bFieldText: '3.4×10¹² G',
    tiltY: 0.86,
    knotDriftRadSec: 0.08,
    baseSpeedMul: 0.97,
    stage3Glitch: 'phase_slip',
    coreSpectral: 'O',
  },
];

/**
 * PLS-03 — Pulsar Beacon Timing
 * Spinning magnetized neutron star sweeping relativistic synchrotron beams across
 * 2.5D orbiting accretion star-knots with fair angular lead, heterodyne crust-glitch
 * telegraphs, aligned beam/hitbox geometry, and zero per-frame gradients/shadowBlur.
 */
export class PulsarEchoGame extends BaseCosmicMinigame {
  readonly id = 'pulsar_echo';
  readonly title = 'PULSAR BEACON TIMING';
  readonly subtitle = 'Accretion Ring & Jet Sync';
  readonly instrumentCode = 'PLS-03';

  readonly platePool: readonly CosmicPlateId[] = ['crab', 'cas_a', 'hudf'];
  readonly variants: readonly MinigameVariantSpec[] = [
    { index: 0, id: 'pulsar_echo_v1', label: 'Crab Synchrotron Core', plateId: 'crab', scenarioTag: 'crab_sync' },
    { index: 1, id: 'pulsar_echo_v2', label: 'Cas A Remnant Spin', plateId: 'cas_a', scenarioTag: 'cas_a_remnant' },
    { index: 2, id: 'pulsar_echo_v3', label: 'Millisecond Drift', plateId: 'hudf', scenarioTag: 'msp_drift' },
    { index: 3, id: 'pulsar_echo_v4', label: 'Glitch Recovery Sweep', plateId: 'crab', scenarioTag: 'glitch_sweep' },
  ];

  private variantCfg: PulsarVariantProfile = VARIANT_PROFILES[0];
  private knots: StarKnot[] = [];
  private activeKnotIdx = 0;
  private catches = 0;
  private catchesNeeded = 3;
  private beamAngle = -Math.PI * 0.85;
  private sweepDir: 1 | -1 = 1;
  private reversalTelegraph = 0;
  private surgeTimer = 0;
  private lastCatchAt = -10;
  private lastPhaseErrMs = 0;
  private perfectBannerTimer = 0;
  private perfectBannerText = '';
  private wrongTapCount = 0;
  private overridePrompt: string | null = null;
  private lastMeridianHalf = 0;

  // Pre-seeded accretion dust orbital phases (zero per-frame allocs)
  private readonly dustAngles = new Float32Array(20);
  private readonly dustShells = new Float32Array(20);
  private readonly dustSpeeds = new Float32Array(20);

  protected override onMount(): void {
    this.variantCfg = VARIANT_PROFILES[this.iterationIndex % VARIANT_PROFILES.length];
    this.wrongTapCount = 0;
    const rng = this.stageRng(1, 'dust');
    for (let i = 0; i < this.dustAngles.length; i++) {
      this.dustAngles[i] = rng() * Math.PI * 2;
      this.dustShells[i] = 0.64 + rng() * 0.34;
      this.dustSpeeds[i] = 0.25 + rng() * 0.35;
    }
  }

  protected override onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.catches = 0;
    this.catchesNeeded = stage === 1 ? 3 : stage === 2 ? 4 : 5;
    this.sweepDir = 1;
    this.reversalTelegraph = 0;
    this.surgeTimer = 0;
    this.overridePrompt = null;
    this.perfectBannerTimer = 0;
    this.lastCatchAt = -10;

    const knotCount = stage === 1 ? 4 : stage === 2 ? 5 : 6;
    const basePitches = [261.6, 329.6, 392.0, 440.0, 523.3, 659.3];
    const spectrals: SpectralClass[] = ['B', 'A', 'F', 'G', 'K', 'O'];
    const span = (Math.PI * 2) / knotCount;
    const baseRot = rng() * 0.65;

    this.knots = [];
    for (let i = 0; i < knotCount; i++) {
      this.knots.push({
        idx: i,
        angle: wrapAngleRad(-Math.PI * 0.5 + baseRot + i * span),
        orbitFrac: i % 2 === 0 ? 0.92 : 0.78,
        pitchHz: basePitches[i % basePitches.length],
        spectral: spectrals[i % spectrals.length],
        catchFlash: 0,
        wrongFlash: 0,
      });
    }

    this.activeKnotIdx = Math.floor(rng() * knotCount);
    const targetKnot = this.knots[this.activeKnotIdx];
    // Guaranteed fair ~1.25s lead-in before first sweep crosses active knot
    this.beamAngle = wrapAngleRad(targetKnot.angle - 1.35 * this.sweepDir);
    this.lastMeridianHalf = Math.floor(this.beamAngle / Math.PI);
  }

  private getCatchToleranceRad(): number {
    if (this.profile.vibe === 'warm') return 0.3;
    if (this.profile.vibe === 'cold') return 0.22;
    return 0.26;
  }

  private getBeamClosestDiff(knot: StarKnot): number {
    const d1 = Math.abs(angleDiffRad(this.beamAngle, knot.angle));
    if (this.stage === 1) return d1;
    const d2 = Math.abs(angleDiffRad(this.beamAngle + Math.PI, knot.angle));
    return Math.min(d1, d2);
  }

  private isBeamOnKnot(knot: StarKnot): boolean {
    return this.getBeamClosestDiff(knot) <= this.getCatchToleranceRad();
  }

  private forwardLeadRad(beamAng: number, knotAng: number, dir: 1 | -1): number {
    const raw = (knotAng - beamAng) * dir;
    return ((raw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  }

  /**
   * Selects the next star-knot with a guaranteed fair anticipation window [0.85, 2.55] rad
   * ahead of the nearest sweeping beam in the given travel direction.
   */
  private pickNextTarget(expectedDir: 1 | -1): void {
    const n = this.knots.length;
    if (n <= 1) return;

    let bestIdx = (this.activeKnotIdx + 1) % n;
    let bestScore = Infinity;
    const idealLead = 1.55;

    for (let i = 0; i < n; i++) {
      if (i === this.activeKnotIdx) continue;
      const k = this.knots[i];
      let lead = this.forwardLeadRad(this.beamAngle, k.angle, expectedDir);
      if (this.stage >= 2) {
        const leadOpp = this.forwardLeadRad(this.beamAngle + Math.PI, k.angle, expectedDir);
        lead = Math.min(lead, leadOpp);
      }
      // Penalize anything too close (< 0.85 rad) or too far (> 2.65 rad)
      let score = Math.abs(lead - idealLead);
      if (lead < 0.85) score += 5 + (0.85 - lead) * 4;
      if (lead > 2.65) score += 2 + (lead - 2.65);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    this.activeKnotIdx = bestIdx;
  }

  private getGeometry(w: number, h: number) {
    // Clamped radius on 844x390 so outer knots + shrinking timing halo stay safely within [54px, h-62px]
    const orbitRx = Math.min(w * 0.27, this.compact ? h * 0.285 : h * 0.32);
    const orbitRy = orbitRx * this.variantCfg.tiltY;
    return {
      cx: w * 0.5,
      cy: this.compact ? h * 0.48 : h * 0.5,
      orbitRx,
      orbitRy,
    };
  }

  private knotScreenPos(knot: StarKnot, cx: number, cy: number, orbitRx: number, orbitRy: number) {
    return {
      x: cx + Math.cos(knot.angle) * orbitRx * knot.orbitFrac,
      y: cy + Math.sin(knot.angle) * orbitRy * knot.orbitFrac,
    };
  }

  private triggerCapture(): void {
    if (this.completed || this.stageClearTimer > 0) return;
    // 180ms post-catch debounce prevents accidental double-tap penalties
    if (this.elapsedSec - this.lastCatchAt < 0.18) return;

    const target = this.knots[this.activeKnotIdx];
    if (!target) return;

    const { cx, cy, orbitRx, orbitRy } = this.getGeometry(this.width, this.height);
    const kPos = this.knotScreenPos(target, cx, cy, orbitRx, orbitRy);
    const diff = this.getBeamClosestDiff(target);

    if (diff <= this.getCatchToleranceRad()) {
      target.catchFlash = 1;
      this.catches += 1;
      this.lastCatchAt = this.elapsedSec;
      this.overridePrompt = null;

      const phaseErrMs = Math.round((diff / (Math.PI * 2)) * this.variantCfg.periodMs * 10) / 10;
      this.lastPhaseErrMs = phaseErrMs;
      const isPerfect = diff <= 0.088;

      if (isPerfect) {
        this.perfectBannerTimer = 0.85;
        this.perfectBannerText = this.profile.showNumericDeltas
          ? `PHASE LOCK · ±${phaseErrMs.toFixed(1)} ms`
          : 'PHASE LOCK';
      }

      const pan = clamp(Math.cos(target.angle) * 0.72, -0.8, 0.8);
      this.ctx.audio?.playStereoSonarEcho(pan, 0.14, isPerfect ? target.pitchHz * 1.12 : target.pitchHz);
      this.ctx.audio?.playTumblerClick(isPerfect ? 0.98 : 0.82, true);
      platform.triggerHaptic('vernierTick', isPerfect ? 0.92 : 0.78);

      this.particles.emitLockCausticRing(kPos.x, kPos.y, isPerfect ? 20 : 15, this.palette.lockHex);
      this.particles.emitPhotonSparks(kPos.x, kPos.y, isPerfect ? 6 : 4, 42, this.palette.lockHex);
      this.particles.emitLockCausticRing(cx, cy, orbitRx * 0.25, this.palette.lockHex);

      // Stage 3 telegraphed heterodyne phase-slip or crust-glitch surge
      let nextDir: 1 | -1 = this.sweepDir;
      if (this.stage === 3 && this.catches % 2 === 0 && this.catches < this.catchesNeeded) {
        this.reversalTelegraph = 0.85;
        this.ctx.audio?.playSolenoidClack(true);
        if (this.variantCfg.stage3Glitch === 'phase_slip') {
          nextDir = this.sweepDir === 1 ? -1 : 1;
        }
      }

      if (this.catches >= this.catchesNeeded) {
        this.triggerStageClear(
          this.stage === 3 ? 'RELATIVISTIC JETS SYNCHRONIZED' : `BEACON BANK ${this.stage}/3 CAUGHT`,
          0.62,
          cx,
          cy
        );
      } else {
        this.pickNextTarget(nextDir);
        this.emitHud(true);
      }
    } else {
      target.wrongFlash = 1;
      this.wrongTapCount += 1;
      this.particles.emitLockCausticRing(kPos.x, kPos.y, 14, '#ff8652');
      this.ctx.audio?.playSolenoidClack(false);
      platform.triggerHaptic('rejectThud', 0.62);
      this.overridePrompt = 'Wait until the synchrotron light-cone sweeps across the lit star-knot!';
      this.emitHud(true);
    }
  }

  protected override onPointerDown(): void {
    this.triggerCapture();
  }

  protected override onKeyDown(e: KeyboardEvent): void {
    if ((e.code === 'Space' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      this.triggerCapture();
    }
  }

  protected override onUpdate(dt: number): void {
    this.perfectBannerTimer = Math.max(0, this.perfectBannerTimer - dt);
    this.surgeTimer = Math.max(0, this.surgeTimer - dt);

    if (this.reversalTelegraph > 0) {
      this.reversalTelegraph -= dt;
      if (this.reversalTelegraph <= 0) {
        this.reversalTelegraph = 0;
        if (this.variantCfg.stage3Glitch === 'phase_slip') {
          this.sweepDir = this.sweepDir === 1 ? -1 : 1;
        } else {
          this.surgeTimer = 1.65;
        }
      }
    }

    const stageSpeed = this.stage === 1 ? 1.08 : this.stage === 2 ? 1.24 : 1.42;
    const baseSpeed = stageSpeed * this.variantCfg.baseSpeedMul;
    const speedFactor = this.reversalTelegraph > 0 ? 0.28 : this.surgeTimer > 0 ? 1.32 : 1.0;

    if (this.stageClearTimer <= 0) {
      this.beamAngle += dt * baseSpeed * speedFactor * this.sweepDir;
      // Subtle meridian rhythmic heartbeat tick every half-turn
      const curHalf = Math.floor(this.beamAngle / Math.PI);
      if (curHalf !== this.lastMeridianHalf) {
        this.lastMeridianHalf = curHalf;
        this.ctx.audio?.playProximityTick?.(0.32);
      }

      // Optional gentle prograde orbital drift of accretion knots in Stages 2–3
      if (this.stage >= 2 && this.variantCfg.knotDriftRadSec > 0) {
        const drift = this.variantCfg.knotDriftRadSec * dt;
        for (let i = 0; i < this.knots.length; i++) {
          this.knots[i].angle = wrapAngleRad(this.knots[i].angle + drift);
        }
      }
    }

    for (let i = 0; i < this.dustAngles.length; i++) {
      this.dustAngles[i] += dt * this.dustSpeeds[i] * this.sweepDir;
    }

    for (let i = 0; i < this.knots.length; i++) {
      this.knots[i].catchFlash = Math.max(0, this.knots[i].catchFlash - dt * 2.0);
      this.knots[i].wrongFlash = Math.max(0, this.knots[i].wrongFlash - dt * 2.1);
    }

    const total = this.getStageProgress01();
    this.ctx.showcase?.applyInstrumentPatch({
      progress: total,
      jetResonance: clamp(total + (this.perfectBannerTimer > 0 ? 0.25 : 0), 0, 1),
      humanity: this.ctx.state.humanity,
    });
  }

  protected override onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const overall = this.getStageProgress01();
    const { cx, cy, orbitRx, orbitRy } = this.getGeometry(w, h);

    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: lerp(5, 0, overall),
      alpha: lerp(0.56, 0.92, overall),
      brightness: lerp(0.84, 1.12, overall),
      scale: 1.03,
      tintAlpha: 0.36,
      starOpacity: 0.84,
      reticleDuck: { cx, cy, r: orbitRx * 1.05 },
    });

    const activeTarget = this.knots[this.activeKnotIdx];
    const inZone = activeTarget && this.stageClearTimer <= 0 ? this.isBeamOnKnot(activeTarget) : false;

    // 2.5D tilted accretion shells (front/back z-fade via OpticalDrawUtils)
    drawInclinedAstrometryRing(c2d, cx, cy, orbitRx * 0.92, orbitRy * 0.92, 0, this.palette.accentRgb, {
      backAlpha: 0.12,
      frontAlpha: 0.28,
      lineWidth: 1.8,
      ticks: this.palette.mode === 'cold' ? 12 : 4,
    });
    drawInclinedAstrometryRing(c2d, cx, cy, orbitRx * 0.78, orbitRy * 0.78, 0, this.palette.secondaryRgb, {
      backAlpha: 0.08,
      frontAlpha: 0.18,
      lineWidth: 1.1,
      ticks: 0,
      dashBack: [3, 4],
    });

    // Subtle orbiting accretion dust specks (zero gradients!)
    for (let i = 0; i < this.dustAngles.length; i++) {
      const a = this.dustAngles[i];
      const sh = this.dustShells[i];
      const dx = cx + Math.cos(a) * orbitRx * sh;
      const dy = cy + Math.sin(a) * orbitRy * sh;
      const frontBoost = Math.sin(a) > 0 ? 0.42 : 0.2;
      drawOpticalStar(c2d, dx, dy, 1.4, {
        spectralClass: i % 3 === 0 ? 'B' : 'G',
        spikes: 0,
        alpha: frontBoost,
        vibeMode: this.palette.mode,
      });
    }

    // Sweeping synchrotron light-cones matched to exact catch window (ZERO per-frame radial gradients!)
    const tol = this.getCatchToleranceRad();
    const coneSpread = tol * 0.78;
    const coneLen = orbitRx * (this.stage === 3 ? 1.32 : 1.18);
    const coneRgb = inZone
      ? this.palette.lockRgb
      : this.reversalTelegraph > 0
      ? '255, 152, 107'
      : this.palette.accentRgb;

    const drawLayeredCone = (ang: number) => {
      c2d.save();
      if ('globalCompositeOperation' in c2d) c2d.globalCompositeOperation = 'lighter';

      // Outer catch-window boundary sheen
      c2d.fillStyle = `rgba(${coneRgb}, ${inZone ? '0.20' : '0.10'})`;
      c2d.beginPath();
      c2d.moveTo(cx, cy);
      c2d.lineTo(cx + Math.cos(ang - tol) * coneLen, cy + Math.sin(ang - tol) * coneLen * this.variantCfg.tiltY);
      c2d.lineTo(cx + Math.cos(ang + tol) * coneLen, cy + Math.sin(ang + tol) * coneLen * this.variantCfg.tiltY);
      c2d.closePath();
      c2d.fill();

      // Inner collimated synchrotron jet cone
      c2d.fillStyle = `rgba(${coneRgb}, ${inZone ? '0.32' : '0.18'})`;
      c2d.beginPath();
      c2d.moveTo(cx, cy);
      c2d.lineTo(
        cx + Math.cos(ang - coneSpread * 0.65) * coneLen * 0.92,
        cy + Math.sin(ang - coneSpread * 0.65) * coneLen * 0.92 * this.variantCfg.tiltY
      );
      c2d.lineTo(
        cx + Math.cos(ang + coneSpread * 0.65) * coneLen * 0.92,
        cy + Math.sin(ang + coneSpread * 0.65) * coneLen * 0.92 * this.variantCfg.tiltY
      );
      c2d.closePath();
      c2d.fill();
      c2d.restore();

      // Crisp 2-pass collimated beam centerline (ZERO shadowBlur!)
      const tipX = cx + Math.cos(ang) * coneLen * 0.98;
      const tipY = cy + Math.sin(ang) * coneLen * 0.98 * this.variantCfg.tiltY;
      drawGlowStroke(
        c2d,
        (ctx) => {
          ctx.moveTo(cx, cy);
          ctx.lineTo(tipX, tipY);
        },
        inZone ? this.palette.lockHex : this.reversalTelegraph > 0 ? '#ff986b' : '#eef8ff',
        inZone ? 2.6 : 1.9,
        { outerWidthMul: 3.1, outerAlpha: inZone ? 0.34 : 0.22, coreAlpha: 0.95 }
      );
    };

    drawLayeredCone(this.beamAngle);
    if (this.stage >= 2) drawLayeredCone(this.beamAngle + Math.PI);

    // Subtle magnetosphere dipole field loops flanking the neutron star
    c2d.save();
    c2d.translate(cx, cy);
    c2d.rotate(this.beamAngle);
    c2d.strokeStyle = `rgba(${this.palette.secondaryRgb}, 0.2)`;
    c2d.lineWidth = 1;
    const loopR = orbitRx * 0.24;
    for (const sign of [-1, 1]) {
      c2d.beginPath();
      c2d.ellipse(0, sign * loopR * 0.58, loopR * 0.85, loopR * 0.52, 0, 0, Math.PI * 2);
      c2d.stroke();
    }
    c2d.restore();

    // Orbiting accretion star-knots via StarPSFAtlas (locked diffraction spikes!)
    for (let i = 0; i < this.knots.length; i++) {
      const knot = this.knots[i];
      const pos = this.knotScreenPos(knot, cx, cy, orbitRx, orbitRy);
      const isTarget = knot.idx === this.activeKnotIdx && this.stageClearTimer <= 0;

      if (knot.wrongFlash > 0.05) {
        drawOpticalStar(c2d, pos.x, pos.y, 10.5, {
          spectralClass: 'ALERT',
          spikes: 6,
          alpha: 0.95,
          vibeMode: this.palette.mode,
        });
      } else if (knot.catchFlash > 0.08) {
        drawOpticalStar(c2d, pos.x, pos.y, 13.5, {
          spectralClass: 'LOCK',
          spikes: 6,
          alpha: 1,
          vibeMode: this.palette.mode,
        });
      } else if (isTarget) {
        const diff = this.getBeamClosestDiff(knot);
        const closeness = clamp(1 - diff / 1.4, 0, 1);
        const starCol = inZone ? this.palette.lockHex : this.palette.accentHex;
        drawOpticalStar(c2d, pos.x, pos.y, inZone ? 12.5 : 10, {
          spectralClass: inZone ? 'LOCK' : this.palette.mode === 'cold' ? 'O' : 'G',
          spikes: 6,
          alpha: inZone ? 1 : 0.9,
          vibeMode: this.palette.mode,
          timeSec: this.elapsedSec,
        });

        // Contracting timing halo synced to beam arrival
        const shrinkR = lerp(this.compact ? 28 : 38, 14, closeness);
        c2d.save();
        c2d.strokeStyle = starCol;
        c2d.lineWidth = inZone ? 2.4 : 1.5;
        c2d.globalAlpha = 0.42 + closeness * 0.56;
        c2d.beginPath();
        c2d.arc(pos.x, pos.y, shrinkR, 0, Math.PI * 2);
        c2d.stroke();
        c2d.restore();
      } else {
        drawOpticalStar(c2d, pos.x, pos.y, 5.8, {
          spectralClass: knot.spectral,
          spikes: 4,
          alpha: 0.58,
          vibeMode: this.palette.mode,
          timeSec: this.elapsedSec,
          scintPhase: knot.idx * 1.3,
        });
      }
    }

    // Central magnetized neutron star core (pre-rendered limb-darkened disc + PSF flare, ZERO gradients)
    drawLimbDarkenedStar(c2d, cx, cy, this.compact ? 11 : 14, this.variantCfg.coreSpectral, 0.95);
    drawOpticalStar(c2d, cx, cy, this.compact ? 10 : 13, {
      spectralClass: inZone ? 'LOCK' : this.reversalTelegraph > 0 ? 'ALERT' : this.variantCfg.coreSpectral,
      spikes: 4,
      alpha: 0.88,
      vibeMode: this.palette.mode,
    });

    // Diegetic catch-progress collar segments + directional spin chevron around neutron core
    const collarR = orbitRx * 0.34;
    const segSpan = (Math.PI * 2) / this.catchesNeeded;
    c2d.save();
    for (let s = 0; s < this.catchesNeeded; s++) {
      const a0 = -Math.PI * 0.5 + s * segSpan + 0.08;
      const a1 = -Math.PI * 0.5 + (s + 1) * segSpan - 0.08;
      c2d.strokeStyle = s < this.catches ? this.palette.lockHex : 'rgba(200, 224, 248, 0.18)';
      c2d.lineWidth = s < this.catches ? 2.4 : 1.3;
      c2d.beginPath();
      c2d.arc(cx, cy, collarR, a0, a1);
      c2d.stroke();
    }

    // Spin direction chevron (flips amber during Stage 3 heterodyne telegraph!)
    const chevR = collarR + 10;
    const chevAng = this.beamAngle + this.sweepDir * 0.38;
    const chx = cx + Math.cos(chevAng) * chevR;
    const chy = cy + Math.sin(chevAng) * chevR;
    const tang = chevAng + this.sweepDir * Math.PI * 0.5;
    c2d.strokeStyle = this.reversalTelegraph > 0 ? '#ff986b' : this.palette.secondaryHex;
    c2d.lineWidth = 1.8;
    c2d.beginPath();
    c2d.moveTo(chx - Math.cos(tang - 0.55) * 6, chy - Math.sin(tang - 0.55) * 6);
    c2d.lineTo(chx, chy);
    c2d.lineTo(chx - Math.cos(tang + 0.55) * 6, chy - Math.sin(tang + 0.55) * 6);
    c2d.stroke();

    // Stage 3 Heterodyne Phase-Slip / Crust-Glitch Telegraph Ring
    if (this.reversalTelegraph > 0) {
      c2d.strokeStyle = '#ff986b';
      c2d.lineWidth = 2.2;
      c2d.setLineDash([6, 4]);
      c2d.beginPath();
      c2d.arc(cx, cy, collarR + 18, 0, Math.PI * 2);
      c2d.stroke();
      c2d.setLineDash([]);
      c2d.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = '#ffbc8c';
      c2d.textAlign = 'center';
      c2d.fillText(
        this.variantCfg.stage3Glitch === 'phase_slip' ? '⇄ HETERODYNE PHASE SLIP' : '⚡ CRUST GLITCH SURGE',
        cx,
        cy - collarR - 24
      );
    } else if (this.perfectBannerTimer > 0) {
      c2d.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = this.palette.lockHex;
      c2d.globalAlpha = clamp(this.perfectBannerTimer * 1.6, 0, 1);
      c2d.textAlign = 'center';
      c2d.fillText(this.perfectBannerText, cx, cy - collarR - 18);
    }

    // Subtle real neutron star ephemeris tag (top-left safe margin)
    c2d.globalAlpha = 0.72;
    c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    c2d.fillStyle = this.palette.secondaryHex;
    c2d.textAlign = 'left';
    c2d.fillText(
      `P ${this.variantCfg.periodMs.toFixed(1)}ms · B ${this.variantCfg.bFieldText}`,
      w * 0.06,
      this.compact ? 58 : 76
    );
    c2d.restore();

    this.drawSharedOverlays(c2d, w, h);
  }

  protected override getStageProgress01(): number {
    return clamp((this.stage - 1 + this.catches / Math.max(1, this.catchesNeeded)) / 3, 0, 1);
  }

  protected override getPromptText(): string {
    if (this.overridePrompt) return this.overridePrompt;
    if (this.stage === 1) {
      return `Tap or press Space as the synchrotron beam sweeps across the lit star-knot (${this.catches}/${this.catchesNeeded}).`;
    }
    if (this.stage === 2) {
      return `Catch either antipodal lighthouse beam crossing the lit star-knot (${this.catches}/${this.catchesNeeded}).`;
    }
    return this.variantCfg.stage3Glitch === 'phase_slip'
      ? `Watch for amber heterodyne phase-slip telegraphs — sync the active star-knots (${this.catches}/${this.catchesNeeded}).`
      : `Watch for amber crust-glitch speed surges — sync the active star-knots (${this.catches}/${this.catchesNeeded}).`;
  }

  protected override solveCurrentStage(_stage: 1 | 2 | 3): void {
    const target = this.knots[this.activeKnotIdx];
    if (target) {
      this.beamAngle = target.angle;
    }
    this.catches = this.catchesNeeded;
  }

  protected override onAllStagesCleared(): void {
    const acc = clamp(1 - this.wrongTapCount * 0.04, 0.72, 1.0);
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    const phaseNote = this.lastPhaseErrMs > 0 ? ` · Δt ±${this.lastPhaseErrMs.toFixed(1)}ms` : '';
    this.finishSuccess({
      accuracy: acc,
      proofFragmentSuffix: 'pulsar',
      dossierSnippet: `Magnetized pulsar ephemeris (P = ${this.variantCfg.periodMs} ms) synced across 3 accretion banks on ${this.ctx.targetName}.`,
      telemetrySummary: `${this.activeVariant?.label ?? 'Pulsar'} · Sync ${(acc * 100).toFixed(0)}%${phaseNote} · ${totalSec.toFixed(1)}s`,
      physicalPrinciple: 'Magnetized Neutron Star Lighthouse, Heterodyne Beat Phase & Pulsar Crust Glitches',
    });
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Rapidly spinning magnetized neutron stars sweep twin synchrotron jets across orbiting accretion knots; superfluid crust glitches trigger abrupt heterodyne phase slips and spin surges.',
      goalSummary:
        'Tap/click or press Space right when the luminous synchrotron cone crosses the glowing star-knot with the contracting halo.',
      controlsDesktop: 'Click anywhere or press Space / Enter as the beam intersects the lit star-knot.',
      controlsTouch: 'Tap anywhere when the shrinking ring closes around the illuminated star-knot.',
      warmthEffect: 'Warm H% widens the amber capture window; Cold H% narrows the collimated cyan jet and reports ±ms phase error.',
    };
  }
}
