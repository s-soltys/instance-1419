import { platform } from '../../../platform/PlatformAdapter';
import { BaseCosmicMinigame, type PointerLocalEvent } from '../core/BaseCosmicMinigame';
import { getAspectFieldBox } from '../core/vernierWidgets';
import { drawGlowPolylineXY, drawGlowStroke } from '../render/OpticalDrawUtils';
import { drawLimbDarkenedStar, drawOpticalStar, drawSoftDustPuff } from '../render/StarPSFAtlas';
import { clamp } from '../tactilePhysics';
import type {
  CosmicPlateId,
  HudActionButtonSpec,
  InstrumentFieldGuide,
  MinigameVariantSpec,
  SpectralClass,
} from '../types';

interface GravityWell {
  tx: number;
  ty: number;
  gm: number;
  radius: number;
  massSolar: number;
  spectral: SpectralClass;
}

interface DustHazard {
  tx: number;
  ty: number;
  radius: number;
}

interface GateSpec {
  tx: number;
  ty: number;
  radius: number;
  moveAmpX: number;
  moveAmpY: number;
}

interface SlingshotStageSpec {
  launcher: { tx: number; ty: number };
  wells: readonly GravityWell[];
  hazards: readonly DustHazard[];
  gate: GateSpec;
  goldenLaunch: { vx: number; vy: number };
  prompt: string;
}

const FIXED_DT = 1 / 120;
const TIME_SCALE = 1.25;
const GRAVITY_SOFTENING = 0.022;
const GATE_FREQ = 1.2;
const MAX_TRAIL_PTS = 96;
const MAX_PREVIEW_PTS = 68;

// 4 curated variants × 3 stages = 12 physics-verified Velocity Verlet gravitational slingshot courses
const VARIANT_COURSES: ReadonlyArray<readonly [SlingshotStageSpec, SlingshotStageSpec, SlingshotStageSpec]> = [
  // V1: M51 Companion Assist (whirlpool)
  [
    {
      launcher: { tx: 0.22, ty: 0.74 },
      wells: [{ tx: 0.84, ty: 0.34, gm: 0.28, radius: 0.068, massSolar: 2.1, spectral: 'G' }],
      hazards: [{ tx: 0.86, ty: 0.56, radius: 0.125 }],
      gate: { tx: 1.48, ty: 0.3, radius: 0.095, moveAmpX: 0, moveAmpY: 0 },
      goldenLaunch: { vx: 1.1173, vy: 0.0781 },
      prompt: 'Pull back from the bottom-left launcher to whip the probe around the star well above the dust cloud.',
    },
    {
      launcher: { tx: 1.5, ty: 0.24 },
      wells: [
        { tx: 1.12, ty: 0.54, gm: 0.24, radius: 0.062, massSolar: 1.8, spectral: 'B' },
        { tx: 0.62, ty: 0.32, gm: 0.24, radius: 0.062, massSolar: 1.8, spectral: 'K' },
      ],
      hazards: [{ tx: 0.88, ty: 0.64, radius: 0.11 }],
      gate: { tx: 0.24, ty: 0.72, radius: 0.092, moveAmpX: 0, moveAmpY: 0 },
      goldenLaunch: { vx: -1.2606, vy: 0.2223 },
      prompt: 'Reverse course: thread an S-curve between both binary gravity wells into the bottom-left gate.',
    },
    {
      launcher: { tx: 0.88, ty: 0.78 },
      wells: [
        { tx: 0.6, ty: 0.48, gm: 0.26, radius: 0.062, massSolar: 2.0, spectral: 'O' },
        { tx: 1.16, ty: 0.44, gm: 0.22, radius: 0.058, massSolar: 1.6, spectral: 'G' },
      ],
      hazards: [{ tx: 0.88, ty: 0.48, radius: 0.095 }],
      gate: { tx: 0.88, ty: 0.2, radius: 0.09, moveAmpX: 0.24, moveAmpY: 0 },
      goldenLaunch: { vx: 0.6766, vy: 0.2463 },
      prompt: 'Curve around either gravity well past the central dust core into the gliding collector gate!',
    },
  ],
  // V2: Quintet Twin Wells (stephans_quintet)
  [
    {
      launcher: { tx: 0.22, ty: 0.48 },
      wells: [{ tx: 0.86, ty: 0.66, gm: 0.3, radius: 0.07, massSolar: 2.4, spectral: 'O' }],
      hazards: [{ tx: 0.86, ty: 0.42, radius: 0.125 }],
      gate: { tx: 1.5, ty: 0.46, radius: 0.095, moveAmpX: 0, moveAmpY: 0 },
      goldenLaunch: { vx: 0.9536, vy: -0.507 },
      prompt: 'Skim beneath the dark dust barrier and harvest gravity from the blue giant to arc into the right gate.',
    },
    {
      launcher: { tx: 0.22, ty: 0.26 },
      wells: [
        { tx: 0.72, ty: 0.58, gm: 0.32, radius: 0.07, massSolar: 2.6, spectral: 'B' },
        { tx: 1.18, ty: 0.32, gm: 0.16, radius: 0.052, massSolar: 1.2, spectral: 'K' },
      ],
      hazards: [{ tx: 0.9, ty: 0.74, radius: 0.11 }],
      gate: { tx: 1.5, ty: 0.7, radius: 0.092, moveAmpX: 0, moveAmpY: 0 },
      goldenLaunch: { vx: 1.2792, vy: 0.0447 },
      prompt: 'Thread the unequal-mass 2:1 Lagrange saddle cleanly into the lower-right collector.',
    },
    {
      launcher: { tx: 1.5, ty: 0.5 },
      wells: [{ tx: 0.88, ty: 0.3, gm: 0.34, radius: 0.062, massSolar: 2.9, spectral: 'O' }],
      hazards: [{ tx: 0.92, ty: 0.62, radius: 0.125 }],
      gate: { tx: 0.24, ty: 0.48, radius: 0.09, moveAmpX: 0, moveAmpY: 0.2 },
      goldenLaunch: { vx: -0.5002, vy: -0.5179 },
      prompt: 'Slingshot right-to-left around the massive compact star and time the vertically gliding gate!',
    },
  ],
  // V3: Sombrero Halo Sweep (sombrero)
  [
    {
      launcher: { tx: 0.24, ty: 0.24 },
      wells: [{ tx: 0.88, ty: 0.64, gm: 0.28, radius: 0.068, massSolar: 2.1, spectral: 'K' }],
      hazards: [{ tx: 0.86, ty: 0.38, radius: 0.125 }],
      gate: { tx: 1.48, ty: 0.72, radius: 0.095, moveAmpX: 0, moveAmpY: 0 },
      goldenLaunch: { vx: 0.5621, vy: 0.6242 },
      prompt: 'Dive past the Sombrero dust rim and bend around the golden halo star into the lower-right gate.',
    },
    {
      launcher: { tx: 0.3, ty: 0.74 },
      wells: [{ tx: 0.88, ty: 0.32, gm: 0.34, radius: 0.068, massSolar: 2.8, spectral: 'G' }],
      hazards: [{ tx: 0.88, ty: 0.68, radius: 0.14 }],
      gate: { tx: 1.46, ty: 0.72, radius: 0.094, moveAmpX: 0, moveAmpY: 0 },
      goldenLaunch: { vx: 1.2304, vy: 0.3528 },
      prompt: 'Execute a high-arc Ulysses slingshot over the central dust wall into the opposite collector.',
    },
    {
      launcher: { tx: 0.24, ty: 0.74 },
      wells: [
        { tx: 0.68, ty: 0.36, gm: 0.25, radius: 0.06, massSolar: 1.9, spectral: 'A' },
        { tx: 1.14, ty: 0.62, gm: 0.25, radius: 0.06, massSolar: 1.9, spectral: 'G' },
      ],
      hazards: [
        { tx: 0.68, ty: 0.68, radius: 0.1 },
        { tx: 1.14, ty: 0.28, radius: 0.1 },
      ],
      gate: { tx: 1.48, ty: 0.3, radius: 0.092, moveAmpX: 0, moveAmpY: 0.16 },
      goldenLaunch: { vx: 1.0382, vy: 0.2977 },
      prompt: 'Weave through the twin-well dust corridor and intercept the gliding orbital gate!',
    },
  ],
  // V4: Figure-8 Periapsis (whirlpool)
  [
    {
      launcher: { tx: 0.62, ty: 0.78 },
      wells: [{ tx: 0.94, ty: 0.42, gm: 0.3, radius: 0.066, massSolar: 2.3, spectral: 'B' }],
      hazards: [{ tx: 1.12, ty: 0.64, radius: 0.12 }],
      gate: { tx: 1.48, ty: 0.24, radius: 0.095, moveAmpX: 0, moveAmpY: 0 },
      goldenLaunch: { vx: 0.158, vy: -0.7434 },
      prompt: 'Launch upward and let the off-axis blue star bend your trajectory sharply into the top-right gate.',
    },
    {
      launcher: { tx: 0.22, ty: 0.5 },
      wells: [
        { tx: 0.86, ty: 0.26, gm: 0.24, radius: 0.06, massSolar: 1.8, spectral: 'G' },
        { tx: 0.86, ty: 0.74, gm: 0.24, radius: 0.06, massSolar: 1.8, spectral: 'K' },
        { tx: 1.22, ty: 0.5, gm: 0.18, radius: 0.054, massSolar: 1.3, spectral: 'B' },
      ],
      hazards: [{ tx: 0.64, ty: 0.5, radius: 0.105 }],
      gate: { tx: 1.52, ty: 0.5, radius: 0.094, moveAmpX: 0, moveAmpY: 0 },
      goldenLaunch: { vx: 0.6113, vy: -0.633 },
      prompt: 'Curve around the central nebula barrier through the 3-body gravitational funnel!',
    },
    {
      launcher: { tx: 0.24, ty: 0.24 },
      wells: [
        { tx: 0.74, ty: 0.58, gm: 0.28, radius: 0.062, massSolar: 2.2, spectral: 'O' },
        { tx: 1.16, ty: 0.36, gm: 0.22, radius: 0.056, massSolar: 1.6, spectral: 'G' },
      ],
      hazards: [{ tx: 0.84, ty: 0.26, radius: 0.105 }],
      gate: { tx: 1.42, ty: 0.68, radius: 0.092, moveAmpX: 0.12, moveAmpY: 0.1 },
      goldenLaunch: { vx: 1.2606, vy: 0.2223 },
      prompt: 'Whip between both stellar wells and time insertion into the orbiting elliptical collector!',
    },
  ],
];

/**
 * ORB-07 — Gravity Slingshot
 * Unified fixed-timestep (1/120s) Velocity Verlet orbital integrator shared identically between
 * dirty-cached preview arc and live flight (100% deterministic across 30/60/144Hz), real
 * physics-verified SolvabilityHarness, unified slingshot pullback with cancel deadzone,
 * last-shot ghost trail echo, Roche-lobe contours, Oberth ion-tail & Doppler audio.
 */
export class GravitySlingshotGame extends BaseCosmicMinigame {
  readonly id = 'gravity_slingshot';
  readonly title = 'GRAVITY SLINGSHOT';
  readonly subtitle = 'Orbital Trajectory Bending';
  readonly instrumentCode = 'ORB-07';

  readonly platePool: readonly CosmicPlateId[] = ['whirlpool', 'stephans_quintet', 'sombrero'];
  readonly variants: readonly MinigameVariantSpec[] = [
    { index: 0, id: 'gravity_slingshot_v1', label: 'M51 Companion Assist', plateId: 'whirlpool', scenarioTag: 'm51_assist' },
    { index: 1, id: 'gravity_slingshot_v2', label: 'Quintet Twin Wells', plateId: 'stephans_quintet', scenarioTag: 'quintet_wells' },
    { index: 2, id: 'gravity_slingshot_v3', label: 'Sombrero Halo Sweep', plateId: 'sombrero', scenarioTag: 'sombrero_halo' },
    { index: 3, id: 'gravity_slingshot_v4', label: 'Figure-8 Periapsis', plateId: 'whirlpool', scenarioTag: 'figure8_whip' },
  ];

  private stageSpec: SlingshotStageSpec = VARIANT_COURSES[0][0];
  private simClockSec = 0;
  private simAccum = 0;

  private aimVx = 0;
  private aimVy = 0;
  private hasAimed = false;
  private isDraggingAim = false;
  private dragAnchorTx = 0;
  private dragAnchorTy = 0;
  private pullCancelZone = false;
  private previewDirty = true;

  // Live probe state + preallocated flat buffers (ZERO per-frame trail.shift() / GC churn!)
  private probeActive = false;
  private probeTx = 0;
  private probeTy = 0;
  private probeVx = 0;
  private probeVy = 0;
  private probeAx = 0;
  private probeAy = 0;
  private probeSpeed = 0;
  private probeMinWellDist = 99;
  private grazeSparkCooldown = 0;

  private readonly trailTx = new Float32Array(MAX_TRAIL_PTS);
  private readonly trailTy = new Float32Array(MAX_TRAIL_PTS);
  private trailCount = 0;
  private trailRecordTimer = 0;

  private readonly lastMissTx = new Float32Array(MAX_TRAIL_PTS);
  private readonly lastMissTy = new Float32Array(MAX_TRAIL_PTS);
  private lastMissCount = 0;

  private readonly previewTx = new Float32Array(MAX_PREVIEW_PTS);
  private readonly previewTy = new Float32Array(MAX_PREVIEW_PTS);
  private previewCount = 0;

  private readonly renderXY = new Float32Array(MAX_TRAIL_PTS * 2);
  private readonly wellDustPhase = new Float32Array(12);

  private impactFlash: { tx: number; ty: number; ok: boolean; timer: number } | null = null;
  private wrongTapCount = 0;
  private overridePrompt: string | null = null;

  protected override onMount(): void {
    this.wrongTapCount = 0;
    const rng = this.stageRng(1, 'orb-dust');
    for (let i = 0; i < this.wellDustPhase.length; i++) {
      this.wellDustPhase[i] = rng() * Math.PI * 2;
    }
  }

  protected override onSetupStage(stage: 1 | 2 | 3): void {
    const course = VARIANT_COURSES[this.iterationIndex % VARIANT_COURSES.length];
    this.stageSpec = course[stage - 1];
    this.simClockSec = 0;
    this.simAccum = 0;
    this.impactFlash = null;
    this.hasAimed = false;
    this.isDraggingAim = false;
    this.pullCancelZone = false;
    this.aimVx = 0;
    this.aimVy = 0;
    this.previewCount = 0;
    this.previewDirty = true;
    this.lastMissCount = 0;
    this.overridePrompt = null;
    this.resetProbe();
  }

  private resetProbe(): void {
    this.probeActive = false;
    this.probeTx = this.stageSpec.launcher.tx;
    this.probeTy = this.stageSpec.launcher.ty;
    this.probeVx = 0;
    this.probeVy = 0;
    this.probeAx = 0;
    this.probeAy = 0;
    this.probeSpeed = 0;
    this.probeMinWellDist = 99;
    this.trailCount = 0;
    this.trailRecordTimer = 0;
    this.simAccum = 0;
    this.ctx.audio?.stopInstrumentAudio();
  }

  private getEffectiveGateRadius(): number {
    const mul = this.profile.vibe === 'warm' ? 1.12 : this.profile.vibe === 'cold' ? 0.9 : 1.0;
    return this.stageSpec.gate.radius * mul;
  }

  private getGatePosAt(clockSec: number): { tx: number; ty: number } {
    const g = this.stageSpec.gate;
    return {
      tx: g.tx + Math.sin(clockSec * GATE_FREQ) * g.moveAmpX,
      ty: g.ty + Math.cos(clockSec * GATE_FREQ) * g.moveAmpY,
    };
  }

  private getArenaBox(w: number, h: number) {
    return getAspectFieldBox(w, h, 1.75, 54, this.compact ? 78 : 88);
  }

  private evalAccel(tx: number, ty: number): { ax: number; ay: number } {
    let ax = 0;
    let ay = 0;
    const wells = this.stageSpec.wells;
    for (let i = 0; i < wells.length; i++) {
      const well = wells[i];
      const dx = well.tx - tx;
      const dy = well.ty - ty;
      const r2 = dx * dx + dy * dy + GRAVITY_SOFTENING;
      const inv = well.gm / (r2 * Math.sqrt(r2));
      ax += dx * inv;
      ay += dy * inv;
    }
    return { ax, ay };
  }

  /**
   * Single deterministic Velocity Verlet fixed step (FIXED_DT = 1/120s).
   * Shared identically by both live probe simulation AND dirty-cached trajectory preview!
   */
  private stepVerlet(state: { tx: number; ty: number; vx: number; vy: number; ax: number; ay: number }): void {
    state.tx += state.vx * FIXED_DT + 0.5 * state.ax * FIXED_DT * FIXED_DT;
    state.ty += state.vy * FIXED_DT + 0.5 * state.ay * FIXED_DT * FIXED_DT;
    const next = this.evalAccel(state.tx, state.ty);
    state.vx += 0.5 * (state.ax + next.ax) * FIXED_DT;
    state.vy += 0.5 * (state.ay + next.ay) * FIXED_DT;
    state.ax = next.ax;
    state.ay = next.ay;
  }

  private refreshPreviewCache(): void {
    if (!this.previewDirty) return;
    this.previewDirty = false;
    if (!this.hasAimed || Math.hypot(this.aimVx, this.aimVy) < 0.08) {
      this.previewCount = 0;
      return;
    }

    const baseSamples = this.stage === 1 ? 52 : this.stage === 2 ? 38 : 28;
    const vibeBonus = this.profile.vibe === 'warm' ? 8 : this.profile.vibe === 'cold' ? -4 : 0;
    const totalSamples = clamp(baseSamples + vibeBonus, 18, MAX_PREVIEW_PTS - 1);
    const subPerSample = 4; // 4 * (1/120) = 1/30s per preview dot

    const acc0 = this.evalAccel(this.stageSpec.launcher.tx, this.stageSpec.launcher.ty);
    const sim = {
      tx: this.stageSpec.launcher.tx,
      ty: this.stageSpec.launcher.ty,
      vx: this.aimVx,
      vy: this.aimVy,
      ax: acc0.ax,
      ay: acc0.ay,
    };

    this.previewTx[0] = sim.tx;
    this.previewTy[0] = sim.ty;
    let count = 1;

    const wells = this.stageSpec.wells;
    const hazards = this.stageSpec.hazards;

    for (let i = 0; i < totalSamples; i++) {
      let stopped = false;
      for (let s = 0; s < subPerSample; s++) {
        this.stepVerlet(sim);
        for (let w = 0; w < wells.length; w++) {
          if (Math.hypot(sim.tx - wells[w].tx, sim.ty - wells[w].ty) <= wells[w].radius) {
            stopped = true;
            break;
          }
        }
        if (stopped) break;
        for (let d = 0; d < hazards.length; d++) {
          if (Math.hypot(sim.tx - hazards[d].tx, sim.ty - hazards[d].ty) <= hazards[d].radius) {
            stopped = true;
            break;
          }
        }
        if (stopped || sim.tx < -0.05 || sim.tx > 1.8 || sim.ty < -0.05 || sim.ty > 1.05) {
          stopped = true;
          break;
        }
      }
      this.previewTx[count] = sim.tx;
      this.previewTy[count] = sim.ty;
      count++;
      if (stopped) break;
    }
    this.previewCount = count;
  }

  onHelperAction(actionId: string): void {
    if (actionId === 'reset_probe' && !this.completed && this.stageClearTimer <= 0) {
      this.resetProbe();
      this.ctx.audio?.playTumblerClick(0.6, false);
      this.emitHud(true);
    }
  }

  private setAimFromPullback(curTx: number, curTy: number): void {
    const dx = this.dragAnchorTx - curTx;
    const dy = this.dragAnchorTy - curTy;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.045) {
      this.pullCancelZone = true;
      this.hasAimed = false;
      this.previewDirty = true;
      return;
    }
    this.pullCancelZone = false;
    this.hasAimed = true;
    const mag = clamp(dist * 3.15, 0.55, 1.38);
    this.aimVx = (dx / dist) * mag;
    this.aimVy = (dy / dist) * mag;
    this.previewDirty = true;
  }

  protected override onPointerDown(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;
    if (this.probeActive) this.resetProbe();
    this.isDraggingAim = true;
    this.pullCancelZone = false;

    const box = this.getArenaBox(ev.w, ev.h);
    const tx = (ev.x - box.left) / box.scale;
    const ty = (ev.y - box.top) / box.scale;

    // Unified slingshot pullback: pressing near launcher anchors at launcher;
    // pressing anywhere else anchors right under your touch so there is NEVER a surprise 180° flip!
    const distToLauncher = Math.hypot(tx - this.stageSpec.launcher.tx, ty - this.stageSpec.launcher.ty);
    if (distToLauncher < 0.24) {
      this.dragAnchorTx = this.stageSpec.launcher.tx;
      this.dragAnchorTy = this.stageSpec.launcher.ty;
      this.setAimFromPullback(tx, ty);
    } else {
      this.dragAnchorTx = tx;
      this.dragAnchorTy = ty;
      this.pullCancelZone = true;
    }
    platform.triggerHaptic('vernierTick', 0.42);
  }

  protected override onPointerMove(ev: PointerLocalEvent): void {
    if (!this.isDraggingAim || this.stageClearTimer > 0) return;
    const box = this.getArenaBox(ev.w, ev.h);
    const tx = (ev.x - box.left) / box.scale;
    const ty = (ev.y - box.top) / box.scale;
    this.setAimFromPullback(tx, ty);
  }

  protected override onPointerUp(): void {
    if (!this.isDraggingAim) return;
    this.isDraggingAim = false;
    // Release inside cancel deadzone cleanly aborts without firing a bad shot!
    if (!this.pullCancelZone && this.hasAimed && Math.hypot(this.aimVx, this.aimVy) > 0.1) {
      this.launchProbe();
    }
    this.pullCancelZone = false;
  }

  protected override onPointerCancel(): void {
    this.isDraggingAim = false;
    this.pullCancelZone = false;
  }

  protected override onKeyDown(e: KeyboardEvent): void {
    if (this.stageClearTimer > 0) return;
    if (!this.hasAimed) {
      this.hasAimed = true;
      const g = this.stageSpec.gate;
      const l = this.stageSpec.launcher;
      const ang = Math.atan2(g.ty - l.ty, g.tx - l.tx);
      this.aimVx = Math.cos(ang) * 0.92;
      this.aimVy = Math.sin(ang) * 0.92;
      this.previewDirty = true;
    }
    const step = e.shiftKey ? 0.025 : 0.06;
    let moved = false;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.aimVy -= step;
      moved = true;
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.aimVy += step;
      moved = true;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.aimVx -= step;
      moved = true;
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.aimVx += step;
      moved = true;
    } else if ((e.code === 'Space' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      this.launchProbe();
      return;
    }
    if (moved) {
      const mag = Math.hypot(this.aimVx, this.aimVy);
      if (mag > 1.38) {
        this.aimVx = (this.aimVx / mag) * 1.38;
        this.aimVy = (this.aimVy / mag) * 1.38;
      }
      this.previewDirty = true;
    }
  }

  private launchProbe(): void {
    const l = this.stageSpec.launcher;
    const acc0 = this.evalAccel(l.tx, l.ty);
    this.probeActive = true;
    this.probeTx = l.tx;
    this.probeTy = l.ty;
    this.probeVx = this.aimVx;
    this.probeVy = this.aimVy;
    this.probeAx = acc0.ax;
    this.probeAy = acc0.ay;
    this.probeSpeed = Math.hypot(this.aimVx, this.aimVy);
    this.probeMinWellDist = 99;
    this.trailTx[0] = l.tx;
    this.trailTy[0] = l.ty;
    this.trailCount = 1;
    this.trailRecordTimer = 0;
    this.simAccum = 0;
    this.overridePrompt = null;
    this.ctx.audio?.playSolenoidClack(false);
    platform.triggerHaptic('vernierTick', 0.72);
    this.emitHud(true);
  }

  private copyTrailToMissGhost(): void {
    this.lastMissCount = this.trailCount;
    for (let i = 0; i < this.trailCount; i++) {
      this.lastMissTx[i] = this.trailTx[i];
      this.lastMissTy[i] = this.trailTy[i];
    }
  }

  /**
   * Advances probe & moving gate by one exact FIXED_DT physics step.
   * Returns 'captured' | 'crashed' | 'flying'.
   */
  private advanceSingleFixedStep(): 'captured' | 'crashed' | 'flying' {
    const state = {
      tx: this.probeTx,
      ty: this.probeTy,
      vx: this.probeVx,
      vy: this.probeVy,
      ax: this.probeAx,
      ay: this.probeAy,
    };
    this.stepVerlet(state);
    this.probeTx = state.tx;
    this.probeTy = state.ty;
    this.probeVx = state.vx;
    this.probeVy = state.vy;
    this.probeAx = state.ax;
    this.probeAy = state.ay;
    this.probeSpeed = Math.hypot(state.vx, state.vy);
    this.simClockSec += FIXED_DT / TIME_SCALE;

    this.trailRecordTimer += FIXED_DT;
    if (this.trailRecordTimer >= 0.025) {
      this.trailRecordTimer = 0;
      if (this.trailCount < MAX_TRAIL_PTS) {
        this.trailTx[this.trailCount] = this.probeTx;
        this.trailTy[this.trailCount] = this.probeTy;
        this.trailCount++;
      } else {
        // Shift in-place without allocating arrays/objects
        for (let i = 1; i < MAX_TRAIL_PTS; i++) {
          this.trailTx[i - 1] = this.trailTx[i];
          this.trailTy[i - 1] = this.trailTy[i];
        }
        this.trailTx[MAX_TRAIL_PTS - 1] = this.probeTx;
        this.trailTy[MAX_TRAIL_PTS - 1] = this.probeTy;
      }
    }

    // Track periapsis proximity to nearest well
    const wells = this.stageSpec.wells;
    for (let i = 0; i < wells.length; i++) {
      const d = Math.hypot(this.probeTx - wells[i].tx, this.probeTy - wells[i].ty);
      if (d < this.probeMinWellDist) this.probeMinWellDist = d;
    }

    const gate = this.getGatePosAt(this.simClockSec);
    if (Math.hypot(this.probeTx - gate.tx, this.probeTy - gate.ty) <= this.getEffectiveGateRadius()) {
      return 'captured';
    }

    const hitWell = wells.some((w) => Math.hypot(this.probeTx - w.tx, this.probeTy - w.ty) <= w.radius);
    const hitDust = this.stageSpec.hazards.some(
      (d) => Math.hypot(this.probeTx - d.tx, this.probeTy - d.ty) <= d.radius
    );
    const outBounds =
      this.probeTx < -0.08 || this.probeTx > 1.84 || this.probeTy < -0.08 || this.probeTy > 1.08;

    return hitWell || hitDust || outBounds ? 'crashed' : 'flying';
  }

  protected override onUpdate(dt: number): void {
    this.grazeSparkCooldown = Math.max(0, this.grazeSparkCooldown - dt);

    for (let i = 0; i < this.wellDustPhase.length; i++) {
      this.wellDustPhase[i] += dt * (0.65 + (i % 4) * 0.22);
    }

    if (this.impactFlash) {
      this.impactFlash.timer -= dt;
      if (this.impactFlash.timer <= 0) this.impactFlash = null;
    }

    const progress = this.getStageProgress01();
    this.ctx.showcase?.applyInstrumentPatch({
      progress,
      jetResonance: this.probeActive ? clamp((this.probeSpeed - 0.7) * 0.9, 0.1, 1) : progress * 0.5,
      humanity: this.ctx.state.humanity,
    });

    if (!this.probeActive) {
      if (this.stageClearTimer <= 0) {
        this.simClockSec += dt;
      }
      return;
    }

    if (this.stageClearTimer > 0) return;

    this.simAccum += dt * TIME_SCALE;
    while (this.simAccum >= FIXED_DT && this.probeActive) {
      this.simAccum -= FIXED_DT;
      const outcome = this.advanceSingleFixedStep();

      if (outcome === 'captured') {
        const gate = this.getGatePosAt(this.simClockSec);
        const box = this.getArenaBox(this.width, this.height);
        const gx = box.left + gate.tx * box.scale;
        const gy = box.top + gate.ty * box.scale;
        this.probeActive = false;
        this.ctx.audio?.stopInstrumentAudio();
        this.impactFlash = { tx: gate.tx, ty: gate.ty, ok: true, timer: 0.7 };
        this.particles.emitPhotonSparks(gx, gy, 6, 44, this.palette.lockHex);
        this.triggerStageClear(
          `SLINGSHOT INSERTION ${this.stage}/3 LOCKED`,
          0.68,
          gx,
          gy
        );
        return;
      }

      if (outcome === 'crashed') {
        const box = this.getArenaBox(this.width, this.height);
        const cx = box.left + this.probeTx * box.scale;
        const cy = box.top + this.probeTy * box.scale;
        this.wrongTapCount += 1;
        this.copyTrailToMissGhost();
        this.impactFlash = { tx: this.probeTx, ty: this.probeTy, ok: false, timer: 0.48 };
        this.particles.emitLockCausticRing(cx, cy, 14, '#ff8b5e');
        this.particles.emitSpectralShimmer(cx, cy, 0.2, 3);
        this.resetProbe();
        platform.triggerHaptic('rejectThud', 0.55);
        this.ctx.audio?.playTumblerClick(0.3, false);
        this.overridePrompt = 'Probe missed collector — use your faint ghost arc to refine angle & launch again!';
        this.emitHud(true);
        return;
      }
    }

    // Oberth periapsis speed Doppler synth + graze sparks
    const speedNorm = clamp((this.probeSpeed - 0.65) / 1.25, 0, 1);
    this.ctx.audio?.updateBeatSynth({
      beatHz: 1.5 + speedNorm * 11,
      harmonicLock: 0.4 + speedNorm * 0.55,
      warmth: this.profile.harmonicWarmthGain,
      strain: speedNorm * 0.4,
      pan: clamp((this.probeTx / 1.75) * 2 - 1, -0.8, 0.8),
    });

    if (this.probeSpeed > 1.32 && this.grazeSparkCooldown <= 0) {
      this.grazeSparkCooldown = 0.08;
      const box = this.getArenaBox(this.width, this.height);
      this.particles.emitPhotonSparks(
        box.left + this.probeTx * box.scale,
        box.top + this.probeTy * box.scale,
        1,
        14,
        this.palette.secondaryHex
      );
    }
  }

  protected override onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const box = this.getArenaBox(w, h);
    const toPxX = (tx: number) => box.left + tx * box.scale;
    const toPxY = (ty: number) => box.top + ty * box.scale;

    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: 3.5,
      alpha: 0.48,
      brightness: 0.78,
      scale: 1.03,
      tintAlpha: 0.48,
      starOpacity: 0.74,
    });

    // Organic Bok Globule Interstellar Dust Hazards (cached drawSoftDustPuff — ZERO gradients!)
    for (let i = 0; i < this.stageSpec.hazards.length; i++) {
      const d = this.stageSpec.hazards[i];
      const px = toPxX(d.tx);
      const py = toPxY(d.ty);
      const rPx = d.radius * box.scale;

      drawSoftDustPuff(c2d, px, py, rPx * 1.18, '#1e110a', 0.94);
      drawSoftDustPuff(c2d, px - rPx * 0.24, py - rPx * 0.14, rPx * 0.82, '#2d190e', 0.8);
      drawSoftDustPuff(c2d, px + rPx * 0.22, py + rPx * 0.18, rPx * 0.72, '#140a06', 0.86);

      c2d.save();
      c2d.strokeStyle = 'rgba(255, 152, 96, 0.3)';
      c2d.lineWidth = 1.1;
      c2d.setLineDash([4, 4]);
      c2d.beginPath();
      c2d.arc(px, py, rPx, 0, Math.PI * 2);
      c2d.stroke();
      c2d.restore();
    }

    // Roche-lobe saddle bridge when twin/multiple gravity wells are present
    const wells = this.stageSpec.wells;
    if (wells.length >= 2) {
      const w0 = wells[0];
      const w1 = wells[1];
      // Mass-weighted L1 Lagrange saddle point: heavier primary pushes L1 toward lighter companion
      const s0 = Math.sqrt(Math.max(0.01, w0.gm));
      const s1 = Math.sqrt(Math.max(0.01, w1.gm));
      const l1Frac = s0 / (s0 + s1);
      const mx = toPxX(w0.tx + (w1.tx - w0.tx) * l1Frac);
      const my = toPxY(w0.ty + (w1.ty - w0.ty) * l1Frac);
      const span = Math.hypot(toPxX(w1.tx) - toPxX(w0.tx), toPxY(w1.ty) - toPxY(w0.ty));
      const ang = Math.atan2(w1.ty - w0.ty, w1.tx - w0.tx);
      c2d.save();
      c2d.translate(mx, my);
      c2d.rotate(ang);
      c2d.strokeStyle = `rgba(${this.palette.accentRgb}, ${this.palette.mode === 'cold' ? '0.24' : '0.14'})`;
      c2d.lineWidth = 1;
      c2d.setLineDash([4, 6]);
      c2d.beginPath();
      c2d.ellipse(0, 0, span * 0.68, span * 0.34, 0, 0, Math.PI * 2);
      c2d.stroke();
      // Subtle L1 Lagrange saddle cross marker
      c2d.setLineDash([]);
      c2d.beginPath();
      c2d.moveTo(-4, 0);
      c2d.lineTo(4, 0);
      c2d.moveTo(0, -4);
      c2d.lineTo(0, 4);
      c2d.stroke();
      c2d.restore();
    }

    // Stellar Gravity Wells (limb-darkened photosphere + PSF corona + equipotential rings, ZERO gradients!)
    for (let i = 0; i < wells.length; i++) {
      const well = wells[i];
      const wx = toPxX(well.tx);
      const wy = toPxY(well.ty);
      const rPx = well.radius * box.scale;

      drawLimbDarkenedStar(c2d, wx, wy, rPx, well.spectral, 0.96);
      drawOpticalStar(c2d, wx, wy, rPx * 0.72, {
        spectralClass: well.spectral,
        spikes: 4,
        alpha: 0.78,
        vibeMode: this.palette.mode,
      });

      c2d.save();
      for (let ring = 1; ring <= 2; ring++) {
        c2d.strokeStyle = `rgba(${this.palette.accentRgb}, ${(0.26 / ring).toFixed(2)})`;
        c2d.lineWidth = 1;
        c2d.beginPath();
        c2d.arc(wx, wy, rPx * (1.45 + ring * 0.82), 0, Math.PI * 2);
        c2d.stroke();
      }
      c2d.font = '600 8px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = `rgba(${this.palette.secondaryRgb}, 0.76)`;
      c2d.textAlign = 'center';
      c2d.fillText(`${well.massSolar.toFixed(1)} M☉`, wx, wy + rPx * 1.45 + 11);
      c2d.restore();

      // Subtle infalling orbital dust specks around each well
      for (let d = 0; d < 4; d++) {
        const a = this.wellDustPhase[(i * 4 + d) % this.wellDustPhase.length];
        const dist = rPx * (1.65 + (d % 2) * 0.55);
        drawOpticalStar(c2d, wx + Math.cos(a) * dist, wy + Math.sin(a) * dist, 1.3, {
          spectralClass: well.spectral,
          spikes: 0,
          alpha: 0.44,
          vibeMode: this.palette.mode,
        });
      }
    }

    // Dashed orbital rail for moving collector gate (Stages with moveAmpX/Y > 0)
    const gSpec = this.stageSpec.gate;
    if (gSpec.moveAmpX > 0 || gSpec.moveAmpY > 0) {
      c2d.save();
      c2d.strokeStyle = `rgba(${this.palette.lockRgb}, 0.24)`;
      c2d.lineWidth = 1.2;
      c2d.setLineDash([4, 5]);
      c2d.beginPath();
      if (gSpec.moveAmpX > 0 && gSpec.moveAmpY > 0) {
        c2d.ellipse(
          toPxX(gSpec.tx),
          toPxY(gSpec.ty),
          gSpec.moveAmpX * box.scale,
          gSpec.moveAmpY * box.scale,
          0,
          0,
          Math.PI * 2
        );
      } else {
        c2d.moveTo(toPxX(gSpec.tx - gSpec.moveAmpX), toPxY(gSpec.ty - gSpec.moveAmpY));
        c2d.lineTo(toPxX(gSpec.tx + gSpec.moveAmpX), toPxY(gSpec.ty + gSpec.moveAmpY));
      }
      c2d.stroke();
      c2d.restore();
    }

    // Collector Gate
    const gate = this.getGatePosAt(this.simClockSec);
    const gx = toPxX(gate.tx);
    const gy = toPxY(gate.ty);
    const gateR = this.getEffectiveGateRadius() * box.scale;
    c2d.save();
    c2d.strokeStyle = this.palette.lockHex;
    c2d.fillStyle = `rgba(${this.palette.lockRgb}, ${this.stageClearTimer > 0 ? '0.32' : '0.12'})`;
    c2d.lineWidth = 2.2;
    c2d.beginPath();
    c2d.arc(gx, gy, gateR, 0, Math.PI * 2);
    c2d.fill();
    c2d.stroke();
    // Subtle inner capture reticle crosshairs
    c2d.globalAlpha = 0.55;
    c2d.lineWidth = 1;
    c2d.beginPath();
    c2d.arc(gx, gy, gateR * 0.48, 0, Math.PI * 2);
    c2d.stroke();
    c2d.restore();

    // Ghost Echo of Previous Missed Launch Trail (enables instant precision micro-tuning!)
    if (this.lastMissCount >= 2 && !this.probeActive && this.stageClearTimer <= 0) {
      c2d.save();
      c2d.strokeStyle = `rgba(${this.palette.secondaryRgb}, 0.24)`;
      c2d.lineWidth = 1.3;
      c2d.setLineDash([3, 5]);
      c2d.beginPath();
      c2d.moveTo(toPxX(this.lastMissTx[0]), toPxY(this.lastMissTy[0]));
      for (let i = 1; i < this.lastMissCount; i++) {
        c2d.lineTo(toPxX(this.lastMissTx[i]), toPxY(this.lastMissTy[i]));
      }
      c2d.stroke();
      c2d.restore();
    }

    // Dirty-cached Velocity Verlet Preview Arc + timed arrival ticks (every 0.25s!)
    if (!this.probeActive && this.stageClearTimer <= 0 && this.hasAimed) {
      this.refreshPreviewCache();
      if (this.previewCount >= 2) {
        c2d.save();
        c2d.strokeStyle = this.palette.secondaryHex;
        c2d.globalAlpha = this.isDraggingAim ? 0.86 : 0.48;
        c2d.lineWidth = 1.7;
        c2d.setLineDash([4, 5]);
        c2d.beginPath();
        c2d.moveTo(toPxX(this.previewTx[0]), toPxY(this.previewTy[0]));
        for (let i = 1; i < this.previewCount; i++) {
          c2d.lineTo(toPxX(this.previewTx[i]), toPxY(this.previewTy[i]));
        }
        c2d.stroke();
        c2d.setLineDash([]);

        // Time-of-flight cadence beads every ~0.25s along preview arc
        c2d.fillStyle = this.palette.accentHex;
        for (let i = 8; i < this.previewCount; i += 8) {
          c2d.beginPath();
          c2d.arc(toPxX(this.previewTx[i]), toPxY(this.previewTy[i]), 2.2, 0, Math.PI * 2);
          c2d.fill();
        }
        c2d.restore();
      }
    }

    // Launcher Ring + Pullback Elastic + Live Δv km/s Readout
    const lx = toPxX(this.stageSpec.launcher.tx);
    const ly = toPxY(this.stageSpec.launcher.ty);
    c2d.save();
    if (!this.hasAimed && !this.probeActive) {
      const pulse = 17 + Math.sin(this.elapsedSec * 4) * 4.5;
      c2d.strokeStyle = `rgba(${this.palette.accentRgb}, 0.56)`;
      c2d.lineWidth = 1.4;
      c2d.beginPath();
      c2d.arc(lx, ly, pulse, 0, Math.PI * 2);
      c2d.stroke();
    }

    c2d.strokeStyle = this.pullCancelZone && this.isDraggingAim ? '#ff8b5e' : this.palette.accentHex;
    c2d.lineWidth = 2;
    c2d.beginPath();
    c2d.arc(lx, ly, 13, 0, Math.PI * 2);
    c2d.stroke();

    if (!this.probeActive && this.stageClearTimer <= 0 && this.hasAimed) {
      const pullX = lx - this.aimVx * 34;
      const pullY = ly - this.aimVy * 34;
      c2d.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      c2d.lineWidth = 1.4;
      c2d.beginPath();
      c2d.moveTo(lx, ly);
      c2d.lineTo(pullX, pullY);
      c2d.stroke();
      c2d.fillStyle = this.palette.accentHex;
      c2d.beginPath();
      c2d.arc(pullX, pullY, 4.8, 0, Math.PI * 2);
      c2d.fill();

      const dvKmS = (Math.hypot(this.aimVx, this.aimVy) * 14.5).toFixed(1);
      c2d.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = this.palette.secondaryHex;
      c2d.textAlign = 'center';
      c2d.fillText(`Δv ${dvKmS} km/s`, lx, ly - 19);
    }
    c2d.restore();

    // Live Probe + Oberth-scaled luminous ion tail (2-pass bloom, ZERO shadowBlur!)
    if (this.probeActive && this.trailCount >= 1) {
      for (let i = 0; i < this.trailCount; i++) {
        this.renderXY[i * 2] = toPxX(this.trailTx[i]);
        this.renderXY[i * 2 + 1] = toPxY(this.trailTy[i]);
      }
      const speedBoost = clamp((this.probeSpeed - 0.7) * 0.9, 0, 1);
      if (this.trailCount >= 2) {
        drawGlowPolylineXY(
          c2d,
          this.renderXY,
          this.trailCount,
          speedBoost > 0.55 ? '#fff1cc' : this.palette.secondaryHex,
          1.8 + speedBoost * 1.1,
          { outerWidthMul: 2.8 + speedBoost * 0.9, outerAlpha: 0.2 + speedBoost * 0.14, coreAlpha: 0.9 }
        );
      }

      const px = toPxX(this.probeTx);
      const py = toPxY(this.probeTy);
      drawOpticalStar(c2d, px, py, 5.2 + speedBoost * 2.2, {
        spectralClass: 'F',
        spikes: 4,
        alpha: 1,
        vibeMode: this.palette.mode,
      });
    }

    // Impact / Insertion ring
    if (this.impactFlash) {
      const fx = toPxX(this.impactFlash.tx);
      const fy = toPxY(this.impactFlash.ty);
      drawGlowStroke(
        c2d,
        (ctx) => {
          ctx.arc(fx, fy, 20, 0, Math.PI * 2);
        },
        this.impactFlash.ok ? this.palette.lockHex : '#ff8b5e',
        2.2,
        { outerWidthMul: 2.8, outerAlpha: 0.25 * clamp(this.impactFlash.timer * 2, 0, 1), coreAlpha: clamp(this.impactFlash.timer * 2, 0, 1) }
      );
    }

    // Cold/Balanced live periapsis telemetry readout
    if (this.profile.showNumericDeltas && this.probeActive && this.probeMinWellDist < 2) {
      c2d.save();
      c2d.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = this.palette.secondaryHex;
      c2d.textAlign = 'left';
      c2d.fillText(
        `v ${(this.probeSpeed * 14.5).toFixed(1)} km/s · rp ${(this.probeMinWellDist * 10).toFixed(2)} AU`,
        w * 0.06,
        this.compact ? 58 : 76
      );
      c2d.restore();
    }

    this.drawSharedOverlays(c2d, w, h);
  }

  protected override getStageProgress01(): number {
    return clamp((this.stage - 1 + (this.stageClearTimer > 0 ? 1 : 0)) / 3, 0, 1);
  }

  protected override getPromptText(): string {
    return this.overridePrompt ?? this.stageSpec.prompt;
  }

  protected override getHelperActionSpec(): HudActionButtonSpec | null {
    return this.probeActive ? { id: 'reset_probe', label: 'RELOAD PROBE' } : null;
  }

  /**
   * Real physics-verified SolvabilityHarness: resets gate phase to 0, fires the stage's golden
   * (vx, vy) launch vector, and steps the exact Velocity Verlet integrator until physical gate capture!
   */
  protected override solveCurrentStage(_stage: 1 | 2 | 3): void {
    this.simClockSec = 0;
    this.aimVx = this.stageSpec.goldenLaunch.vx;
    this.aimVy = this.stageSpec.goldenLaunch.vy;
    this.hasAimed = true;
    this.previewDirty = true;
    this.launchProbe();

    let captured = false;
    for (let step = 0; step < 360; step++) {
      const outcome = this.advanceSingleFixedStep();
      if (outcome === 'captured') {
        captured = true;
        break;
      }
      if (outcome === 'crashed') break;
    }

    this.probeActive = false;
    if (!captured) {
      this.stageClearTimer = 0;
      throw new Error(
        `ORB-07 physics solvability failed on variant ${this.iterationIndex} stage ${this.stage}`
      );
    }
    this.stageClearTimer = 0.01;
  }

  protected override verifySolved(_stage: 1 | 2 | 3): boolean {
    return this.stageClearTimer > 0;
  }

  protected override onAllStagesCleared(): void {
    const acc = clamp(1 - this.wrongTapCount * 0.05, 0.72, 1.0);
    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.finishSuccess({
      accuracy: acc,
      proofFragmentSuffix: 'slingshot',
      dossierSnippet: `Gravitational-assist slingshot trajectories inserted cleanly (${this.activeVariant?.label ?? 'Orbit'}) on ${this.ctx.targetName}.`,
      telemetrySummary: `${this.activeVariant?.label ?? 'Slingshot'} · Accuracy ${(acc * 100).toFixed(0)}% · ${totalSec.toFixed(1)}s`,
      physicalPrinciple: 'Keplerian Gravity-Assist Slingshot, Oberth Periapsis Boost & Roche Equipotentials',
    });
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Spacecraft accelerate through close periapsis swings around stellar gravity wells (vis-viva speed boost / Oberth regime) and thread Lagrange saddle corridors around dust hazards.',
      goalSummary:
        'Pull back to aim and release to curve the light-probe into the emerald collector gate across 3 distinct gravitational courses.',
      controlsDesktop: 'Click and pull back anywhere to preview your Verlet trajectory, then release to fire (pull back to origin to cancel; Arrows + Space also work).',
      controlsTouch: 'Touch and pull back to aim your curved arc, then release to launch; release gently inside the ring to cancel.',
      warmthEffect: 'Warm H% widens collector capture pockets and extends preview arcs; Cold H% tightens pockets and displays live v / rp AU readouts.',
    };
  }
}
