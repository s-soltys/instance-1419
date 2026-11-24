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
import { drawGlowStroke, drawInclinedAstrometryRing } from '../render/OpticalDrawUtils';
import { drawLimbDarkenedStar, drawOpticalStar, drawSoftDustPuff } from '../render/StarPSFAtlas';
import { clamp, lerp } from '../tactilePhysics';
import type {
  CosmicPlateId,
  HudActionButtonSpec,
  InstrumentFieldGuide,
  MinigameVariantSpec,
} from '../types';

interface DustPatchArc {
  angle: number;
  span: number;
  speedMul: number;
  phaseOffset: number;
  isDecoy: boolean;
  cloudDistNorm: number; // fraction of safe maxR
  sheetDepthMul: number; // paraboloid sheet depth scaling (1.0 or dual-depth)
  puffOffsetX: number;
  puffOffsetY: number;
  pingResonanceFlash: number;
  lastPingTriggered: boolean;
}

interface EchoVariantProfile {
  asymmetricHemisphere: boolean;
  sweepSpeed: number;
  extraStage2Decoy: boolean;
  dualDepthRewind: boolean;
  remnantTag: string;
}

const ECHO_VARIANTS: readonly MinigameVariantSpec[] = [
  { index: 0, id: 'supernova_echoes_v1', label: 'Cas A Echo Sheets', plateId: 'cas_a' },
  { index: 1, id: 'supernova_echoes_v2', label: 'Crab 1054 Remnant', plateId: 'crab' },
  { index: 2, id: 'supernova_echoes_v3', label: 'SN 1987A Tarantula', plateId: 'tarantula' },
  { index: 3, id: 'supernova_echoes_v4', label: 'Asymmetric Dust Echo', plateId: 'cas_a' },
];

const VARIANT_PROFILES: readonly EchoVariantProfile[] = [
  { asymmetricHemisphere: false, sweepSpeed: 0.32, extraStage2Decoy: false, dualDepthRewind: false, remnantTag: 'CAS A' },
  { asymmetricHemisphere: false, sweepSpeed: 0.37, extraStage2Decoy: false, dualDepthRewind: true, remnantTag: 'M1 CRAB' },
  { asymmetricHemisphere: false, sweepSpeed: 0.34, extraStage2Decoy: true, dualDepthRewind: false, remnantTag: 'SN 1987A' },
  { asymmetricHemisphere: true, sweepSpeed: 0.33, extraStage2Decoy: false, dualDepthRewind: true, remnantTag: 'TYCHO 1572' },
];

/**
 * ECH-16 — Supernova Light-Echoes
 * Paraboloid supernova light-echo wavefronts (rho(t) ~ sqrt(2czt)) sweep across wispy
 * foreground dust sheets. Drag the Wavefront Compass and fire TEST PING rings to match
 * arc curvature via local short normal stubs & tangential resonance — never revealing
 * direct answer lines — then rewind the echo shells cleanly to t = 0.0 yr core collapse.
 */
export class SupernovaEchoesGame extends BaseCosmicMinigame {
  readonly id = 'supernova_echoes';
  readonly title = 'SUPERNOVA LIGHT-ECHOES';
  readonly subtitle = 'Light-Echo Triangulation & Blast Rewind';
  readonly instrumentCode = 'ECH-16';
  readonly platePool: readonly CosmicPlateId[] = ['cas_a', 'crab', 'tarantula'];
  readonly variants = ECHO_VARIANTS;

  private variantProfile: EchoVariantProfile = VARIANT_PROFILES[0];
  private phase: 'locate' | 'rewind' = 'locate';
  private epicenterNx = 0.5;
  private epicenterNy = 0.44;
  private decoyNx = 0.72;
  private decoyNy = 0.56;
  private compassNx = 0.5;
  private compassNy = 0.48;
  private arcs: DustPatchArc[] = [];
  private realCount = 3;

  private pingActive = false;
  private pingProgress01 = 0;
  private normalStubFlash = 0;
  private rewindVal = 1.0;
  private rewindTargetVal = 0.28; // Randomized per stage in [0.18, 0.42]
  private strips: VernierStripSpec[] = [];
  private stripInputs: VernierItemInput[] = [];
  private dragMode: 'compass' | 'rewind' | null = null;
  private lastShowcaseSig = '';

  protected onMount(): void {
    this.lockHoldTargetSec = 0.55;
    this.variantProfile = VARIANT_PROFILES[this.iterationIndex % VARIANT_PROFILES.length];
  }

  private getSafePlayBounds(w: number, h: number): {
    left: number;
    right: number;
    top: number;
    bot: number;
    maxR: number;
  } {
    const compact = h < 450;
    const top = compact ? 64 : 76;
    const bot = compact ? h - 98 : h - 118;
    const left = w * 0.1;
    const right = w * 0.9;
    const availH = Math.max(120, bot - top);
    const maxR = Math.min(w * 0.28, availH * 0.48);
    return { left, right, top, bot, maxR };
  }

  private getEpicenterTolPx(): number {
    const base = Math.min(this.width, this.height);
    if (this.profile.vibe === 'warm') return base * 0.058;
    if (this.profile.vibe === 'cold') return base * 0.036;
    return base * 0.047;
  }

  private getRewindTol(): number {
    if (this.profile.vibe === 'warm') return 0.072;
    if (this.profile.vibe === 'cold') return 0.045;
    return 0.058;
  }

  private epochYearsFromVal(val: number): number {
    // Maps rewindTargetVal -> 0.0 yr, 0 -> ~ -12.4 yr, 1 -> ~ +38.0 yr
    if (val >= this.rewindTargetVal) {
      const u = (val - this.rewindTargetVal) / Math.max(0.05, 1 - this.rewindTargetVal);
      return u * 38.0;
    }
    const u = (this.rewindTargetVal - val) / Math.max(0.05, this.rewindTargetVal);
    return -u * 12.4;
  }

  protected onSetupStage(stage: 1 | 2 | 3, rng: () => number): void {
    this.phase = 'locate';
    this.lockHoldSec = 0;
    this.rewindVal = 1.0;
    this.rewindTargetVal = 0.18 + rng() * 0.24; // [0.18, 0.42]
    this.pingActive = false;
    this.pingProgress01 = 0;
    this.normalStubFlash = 0;
    this.dragMode = null;

    // Keep epicenter safely centered away from HUD chrome
    this.epicenterNx = 0.34 + rng() * 0.32;
    this.epicenterNy = 0.32 + rng() * 0.2;
    this.compassNx = 0.5;
    this.compassNy = 0.45;
    if (Math.hypot(this.compassNx - this.epicenterNx, this.compassNy - this.epicenterNy) < 0.15) {
      this.epicenterNx = this.epicenterNx < 0.5 ? 0.32 : 0.68;
      this.epicenterNy = 0.36;
    }

    // Randomize decoy center with guaranteed separation >= 0.24 from true epicenter
    let dNx = 0.28 + rng() * 0.44;
    let dNy = 0.28 + rng() * 0.28;
    for (let attempt = 0; attempt < 16; attempt++) {
      if (Math.hypot(dNx - this.epicenterNx, dNy - this.epicenterNy) >= 0.24) break;
      dNx = 0.26 + rng() * 0.48;
      dNy = 0.28 + rng() * 0.28;
    }
    this.decoyNx = dNx;
    this.decoyNy = dNy;

    this.realCount = stage === 1 ? 3 : 4;
    this.arcs = [];
    const baseHeading = rng() * Math.PI * 2;
    const asym = this.variantProfile.asymmetricHemisphere && stage >= 2;

    for (let i = 0; i < this.realCount; i++) {
      const ang = asym
        ? baseHeading + ((i / Math.max(1, this.realCount - 1)) - 0.5) * (Math.PI * 1.02) + (rng() - 0.5) * 0.16
        : baseHeading + (i * Math.PI * 2) / this.realCount + (rng() - 0.5) * 0.36;
      this.arcs.push({
        angle: ang,
        span: 0.68 - stage * 0.06,
        speedMul: 1,
        phaseOffset: i * 0.19 + rng() * 0.08,
        isDecoy: false,
        cloudDistNorm: 0.44 + rng() * 0.36,
        sheetDepthMul: this.variantProfile.dualDepthRewind && i % 2 === 1 ? 0.72 : 1.0,
        puffOffsetX: (rng() - 0.5) * 14,
        puffOffsetY: (rng() - 0.5) * 10,
        pingResonanceFlash: 0,
        lastPingTriggered: false,
      });
    }

    const decoyCount =
      stage === 3 ? (this.variantProfile.extraStage2Decoy ? 2 : 1) : stage === 2 && this.variantProfile.extraStage2Decoy ? 1 : 0;

    for (let d = 0; d < decoyCount; d++) {
      const ang = Math.atan2(0.44 - this.decoyNy, 0.5 - this.decoyNx) + (d === 0 ? 0.55 : -0.85) + (rng() - 0.5) * 0.3;
      this.arcs.push({
        angle: ang,
        span: 0.52,
        speedMul: d === 0 ? 0.82 : 1.22,
        phaseOffset: 0.35 + d * 0.4,
        isDecoy: true,
        cloudDistNorm: 0.46 + rng() * 0.24,
        sheetDepthMul: 1.0,
        puffOffsetX: (rng() - 0.5) * 12,
        puffOffsetY: (rng() - 0.5) * 10,
        pingResonanceFlash: 0,
        lastPingTriggered: false,
      });
    }
  }

  onHelperAction(actionId: string): void {
    if (actionId === 'emit_ping' && !this.completed && this.phase === 'locate' && this.stageClearTimer <= 0) {
      this.triggerPing();
    }
  }

  protected getHelperActionSpec(): HudActionButtonSpec | null {
    if (this.phase !== 'locate') return null;
    return {
      id: 'emit_ping',
      label: 'TEST PING (SPACE)',
      active: this.pingActive,
    };
  }

  private triggerPing(): void {
    this.pingActive = true;
    this.pingProgress01 = 0;
    this.normalStubFlash = 1.0;
    for (let i = 0; i < this.arcs.length; i++) {
      this.arcs[i].lastPingTriggered = false;
    }
    const errPx = this.getEpicenterErrorPx();
    const closeness = clamp(1 - errPx / Math.max(40, Math.min(this.width, this.height) * 0.35), 0, 1);
    const pitch = lerp(290, 520, closeness);
    this.ctx.audio?.playStereoSonarEcho?.((this.compassNx - 0.5) * 1.4, 0.35, pitch);
    platform.triggerHaptic('vernierTick', 0.55);
    this.emitHud(true);
  }

  private getEpicenterErrorPx(): number {
    const dx = (this.compassNx - this.epicenterNx) * this.width;
    const dy = (this.compassNy - this.epicenterNy) * this.height;
    return Math.hypot(dx, dy);
  }

  private isEpicenterLocked(): boolean {
    return this.getEpicenterErrorPx() <= this.getEpicenterTolPx();
  }

  private isRewindFocused(): boolean {
    return Math.abs(this.rewindVal - this.rewindTargetVal) <= this.getRewindTol();
  }

  private moveCompassTo(x: number, y: number): void {
    const b = this.getSafePlayBounds(this.width, this.height);
    const cx = clamp(x, b.left + 14, b.right - 14);
    const cy = clamp(y, b.top + 14, b.bot - 14);
    this.compassNx = cx / Math.max(1, this.width);
    this.compassNy = cy / Math.max(1, this.height);
  }

  protected onPointerDown(ev: PointerLocalEvent): void {
    if (this.stageClearTimer > 0) return;

    if (this.phase === 'rewind' && this.strips.length > 0 && hitVernierStrip(this.strips[0], ev.x, ev.y)) {
      this.dragMode = 'rewind';
      const mag = 0.045 * this.profile.detentWellScale;
      this.rewindVal = valueFromStripX(this.strips[0], ev.x, this.rewindTargetVal, mag);
      platform.triggerHaptic('vernierTick', 0.45);
      return;
    }

    if (this.phase === 'locate') {
      this.dragMode = 'compass';
      this.moveCompassTo(ev.x, ev.y);
      this.triggerPing();
    }
  }

  protected onPointerMove(ev: PointerLocalEvent): void {
    if (!this.dragMode || this.stageClearTimer > 0) return;
    if (this.dragMode === 'rewind' && this.strips.length > 0) {
      const mag = 0.045 * this.profile.detentWellScale;
      this.rewindVal = valueFromStripX(this.strips[0], ev.x, this.rewindTargetVal, mag);
    } else if (this.dragMode === 'compass') {
      this.moveCompassTo(ev.x, ev.y);
    }
  }

  protected onPointerUp(): void {
    if (this.dragMode === 'compass' && this.phase === 'locate') {
      this.triggerPing();
    }
    this.dragMode = null;
  }

  protected onKeyDown(e: KeyboardEvent): void {
    if (this.stageClearTimer > 0) return;
    if (e.code === 'Space' && !e.repeat && this.phase === 'locate') {
      e.preventDefault();
      this.triggerPing();
      return;
    }
    const step = e.shiftKey ? 0.012 : 0.028;
    if (this.phase === 'rewind') {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        this.rewindVal = clamp(this.rewindVal - step, 0, 1);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        this.rewindVal = clamp(this.rewindVal + step, 0, 1);
      }
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.moveCompassTo(this.compassNx * this.width - 14, this.compassNy * this.height);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.moveCompassTo(this.compassNx * this.width + 14, this.compassNy * this.height);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.moveCompassTo(this.compassNx * this.width, this.compassNy * this.height - 14);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.moveCompassTo(this.compassNx * this.width, this.compassNy * this.height + 14);
    }
  }

  /**
   * Computes clamped safe screen position and effective cloud distance for a dust patch
   * so dust clouds NEVER overlap HUD chrome on 844x390 or 1280x720.
   */
  private computeArcCloudPos(
    arc: DustPatchArc,
    w: number,
    h: number,
    bounds: { left: number; right: number; top: number; bot: number; maxR: number }
  ): { cx: number; cy: number; px: number; py: number; cloudR: number } {
    const cx = (arc.isDecoy ? this.decoyNx : this.epicenterNx) * w;
    const cy = (arc.isDecoy ? this.decoyNy : this.epicenterNy) * h;
    const desiredR = 24 + arc.cloudDistNorm * bounds.maxR;
    const cosA = Math.cos(arc.angle);
    const sinA = Math.sin(arc.angle);

    // Clamp radial distance along ray so cloud center sits cleanly inside safe box
    let maxAllowedR = desiredR;
    const padX = 32;
    const padY = 24;
    if (cosA > 0.01) maxAllowedR = Math.min(maxAllowedR, (bounds.right - padX - cx) / cosA);
    else if (cosA < -0.01) maxAllowedR = Math.min(maxAllowedR, (cx - (bounds.left + padX)) / -cosA);
    if (sinA > 0.01) maxAllowedR = Math.min(maxAllowedR, (bounds.bot - padY - cy) / sinA);
    else if (sinA < -0.01) maxAllowedR = Math.min(maxAllowedR, (cy - (bounds.top + padY)) / -sinA);

    const cloudR = Math.max(26, maxAllowedR);
    return {
      cx,
      cy,
      px: cx + cosA * cloudR,
      py: cy + sinA * cloudR,
      cloudR,
    };
  }

  protected onUpdate(dt: number): void {
    this.normalStubFlash = Math.max(0, this.normalStubFlash - dt * 0.58);

    const bounds = this.getSafePlayBounds(this.width, this.height);
    const ux = this.compassNx * this.width;
    const uy = this.compassNy * this.height;

    if (this.pingActive) {
      this.pingProgress01 += dt * 0.78;
      const pingR = 18 + Math.sqrt(clamp(this.pingProgress01, 0, 1)) * (bounds.maxR * 1.08);

      // Tangential curvature resonance: when ping sweeps over a dust cloud with matching radial angle!
      for (let i = 0; i < this.arcs.length; i++) {
        const arc = this.arcs[i];
        arc.pingResonanceFlash = Math.max(0, arc.pingResonanceFlash - dt * 1.8);
        if (arc.lastPingTriggered) continue;
        const pos = this.computeArcCloudPos(arc, this.width, this.height, bounds);
        const distToCompass = Math.hypot(pos.px - ux, pos.py - uy);
        if (Math.abs(pingR - distToCompass) < 16) {
          arc.lastPingTriggered = true;
          // Compare unit radial vector from compass vs true arc normal vector
          const compassAng = Math.atan2(pos.py - uy, pos.px - ux);
          const angAlign = Math.cos(compassAng - arc.angle); // 1.0 = exact concentric tangential match!
          if (angAlign > 0.86) {
            arc.pingResonanceFlash = clamp((angAlign - 0.82) / 0.18, 0.35, 1);
            this.particles.emitSpectralShimmer(pos.px, pos.py, angAlign, 2);
            if (!arc.isDecoy && angAlign > 0.94) {
              this.ctx.audio?.playProximityTick?.(angAlign, (pos.px / Math.max(1, this.width)) * 2 - 1);
            }
          }
        }
      }

      if (this.pingProgress01 >= 1) {
        this.pingActive = false;
        this.pingProgress01 = 0;
      }
    } else {
      for (let i = 0; i < this.arcs.length; i++) {
        this.arcs[i].pingResonanceFlash = Math.max(0, this.arcs[i].pingResonanceFlash - dt * 1.8);
      }
    }

    // Subtle 3D showcase coupling
    if (this.ctx.showcase) {
      const p = this.getStageProgress01();
      const sig = `${Math.round(p * 30)}:${this.phase}`;
      if (sig !== this.lastShowcaseSig) {
        this.lastShowcaseSig = sig;
        this.ctx.showcase.applyInstrumentPatch({
          progress: p,
          dustPeel: this.phase === 'rewind' ? 0.85 : p * 0.6,
          jetResonance: this.phase === 'rewind' && this.isRewindFocused() ? 0.95 : 0.35,
        });
      }
    }

    if (this.stageClearTimer > 0) return;

    if (this.phase === 'locate') {
      if (this.isEpicenterLocked()) {
        this.lockHoldSec += dt;
        if (this.lockHoldSec >= this.lockHoldTargetSec) {
          if (this.stage === 1) {
            this.triggerStageClear(
              `SUPERNOVA ORIGIN 1/3 · ${this.variantProfile.remnantTag} LOCKED`,
              0.55,
              ux,
              uy
            );
          } else {
            platform.triggerHaptic('phaseSnapLock', 0.95);
            this.ctx.audio?.playPhaseLock?.(this.stage);
            this.phase = 'rewind';
            this.lockHoldSec = 0;
            this.stageFlash = 1;
            this.stageFlashText = 'ORIGIN LOCKED · REWIND SHELLS TO t = 0.0 yr';
            this.particles.emitLockCausticRing(ux, uy, 24, this.palette.lockHex);
            this.emitHud(true);
          }
        }
      } else {
        this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.6);
      }
    } else if (this.phase === 'rewind') {
      if (this.isRewindFocused()) {
        this.lockHoldSec += dt;
        if (this.lockHoldSec >= 0.48) {
          this.triggerStageClear(
            `DETONATION t = 0.0 yr RESTORED (${this.stage}/3)`,
            0.55,
            this.epicenterNx * this.width,
            this.epicenterNy * this.height
          );
        }
      } else {
        this.lockHoldSec = Math.max(0, this.lockHoldSec - dt * 1.5);
      }
    }
  }

  protected onAllStagesCleared(): void {
    this.finishSuccess({
      accuracy: 0.96,
      proofFragmentSuffix: 'echoes',
      dossierSnippet: `Paraboloid dust light-echo origin triangulated & rewound cleanly to core-collapse t = 0.0 yr (${this.variantProfile.remnantTag}) on ${this.ctx.targetName}.`,
      telemetrySummary: `Detonation Epicenter · ${this.elapsedSec.toFixed(1)}s`,
      physicalPrinciple: 'Supernova Paraboloid Light-Echo Triangulation (ρ ∝ √(2czt)) & Temporal Wavefront Focus',
    });
  }

  protected getStageProgress01(): number {
    if (this.completed) return 1;
    const errPx = this.getEpicenterErrorPx();
    const closeness = clamp(1 - errPx / Math.max(60, Math.min(this.width, this.height) * 0.4), 0, 1);
    const rewindProg = clamp(1 - Math.abs(this.rewindVal - this.rewindTargetVal) / 0.72, 0, 1);
    const stageFrac =
      this.stage === 1 ? closeness : this.phase === 'locate' ? closeness * 0.55 : 0.55 + rewindProg * 0.45;
    return clamp((this.stage - 1 + stageFrac) / 3, 0, 1);
  }

  protected getPromptText(): string {
    if (this.phase === 'rewind') {
      const yr = this.epochYearsFromVal(this.rewindVal);
      if (yr < -1.5) {
        return `OVER-COLLAPSED (${yr.toFixed(1)} yr) — ease right back onto the t = 0.0 yr core-collapse focus!`;
      }
      return 'Slide REWIND EPOCH until the light-echo shells focus cleanly onto t = 0.0 yr core collapse.';
    }
    const decoyCount = this.arcs.length - this.realCount;
    if (decoyCount > 0) {
      return `Drag compass & fire TEST PING until wavefront curvature matches the ${this.realCount} true dust arcs (ignore ${decoyCount} off-center decoy${decoyCount > 1 ? 's' : ''}).`;
    }
    return `Drag Wavefront Compass & fire TEST PING ripples until curvature rings align tangentially with all ${this.realCount} dust arcs.`;
  }

  protected onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    const bounds = this.getSafePlayBounds(w, h);
    const locked = this.isEpicenterLocked();
    const ux = this.compassNx * w;
    const uy = this.compassNy * h;
    const ex = this.epicenterNx * w;
    const ey = this.epicenterNy * h;

    this.drawBackdropAndAmbient(c2d, w, h, {
      blurPx: 4,
      alpha: 0.45,
      brightness: 0.78,
      tintAlpha: 0.46,
      reticleDuck: { cx: ux, cy: uy, r: 74 },
    });

    // Render wispy pre-baked interstellar dust sheets & paraboloid light-echo wavefront arcs
    const tYears = this.epochYearsFromVal(this.rewindVal);
    const overCollapsed = this.phase === 'rewind' && tYears < -1.2;

    c2d.save();
    for (let i = 0; i < this.arcs.length; i++) {
      const arc = this.arcs[i];
      const pos = this.computeArcCloudPos(arc, w, h, bounds);

      // Paraboloid light-echo deceleration: rho(t) ~ sqrt(2czt)
      const waveT = (this.elapsedSec * this.variantProfile.sweepSpeed * arc.speedMul + arc.phaseOffset) % 1;
      const waveR = 20 + Math.sqrt(waveT) * (bounds.maxR * 1.04);
      const hitGlow = clamp(1 - Math.abs(waveR - pos.cloudR) / 48, 0.22, 1);

      // Uniform interstellar dust cloud tint & alpha regardless of isDecoy (ZERO visual color spoiler!)
      const dustTint = '#5e96ba';
      const puffAlpha = 0.24 + hitGlow * 0.28 + arc.pingResonanceFlash * 0.24;
      drawSoftDustPuff(c2d, pos.px, pos.py, this.compact ? 34 : 46, dustTint, puffAlpha);
      drawSoftDustPuff(
        c2d,
        pos.px + arc.puffOffsetX,
        pos.py + arc.puffOffsetY,
        this.compact ? 24 : 32,
        '#c2e4ff',
        hitGlow * 0.18 + arc.pingResonanceFlash * 0.26
      );

      // Local SHORT curvature-normal stub vector during TEST PING on ALL clouds (including decoy!)
      // Length ~0.35*cloudR so player visually extends converging normals — ZERO spoiler lines to (cx, cy)!
      if (this.normalStubFlash > 0.04 && this.phase === 'locate') {
        const stubLen = pos.cloudR * 0.35;
        const stubEndX = pos.px - Math.cos(arc.angle) * stubLen;
        const stubEndY = pos.py - Math.sin(arc.angle) * stubLen;
        c2d.strokeStyle = arc.pingResonanceFlash > 0.35 ? this.palette.lockHex : 'rgba(220, 236, 250, 0.55)';
        c2d.globalAlpha = this.normalStubFlash * 0.52;
        c2d.lineWidth = 1.25;
        if (typeof c2d.setLineDash === 'function') c2d.setLineDash([4, 5]);
        c2d.beginPath();
        c2d.moveTo(pos.px, pos.py);
        c2d.lineTo(stubEndX, stubEndY);
        c2d.stroke();
        if (typeof c2d.setLineDash === 'function') c2d.setLineDash([]);
        c2d.globalAlpha = 1;
      }

      if (this.phase === 'rewind' && !arc.isDecoy) {
        const normT = Math.abs(tYears) / 38.0;
        const r = Math.max(3, Math.sqrt(clamp(normT, 0, 1.2)) * bounds.maxR * 0.9 * arc.sheetDepthMul);
        const arcAngle = overCollapsed ? arc.angle + Math.PI : arc.angle;
        const arcCol = overCollapsed ? '#ff7a6b' : this.isRewindFocused() ? this.palette.lockHex : this.palette.accentHex;
        drawGlowStroke(
          c2d,
          (ctx) => {
            ctx.arc(ex, ey, r, arcAngle - arc.span * 0.55, arcAngle + arc.span * 0.55);
          },
          arcCol,
          2.6,
          { outerAlpha: 0.24, coreAlpha: 0.92 }
        );
      } else if (this.phase === 'locate') {
        for (let wave = 0; wave < 2; wave++) {
          const t = (this.elapsedSec * this.variantProfile.sweepSpeed * arc.speedMul + arc.phaseOffset + wave * 0.5) % 1;
          const r = 20 + Math.sqrt(t) * (bounds.maxR * 1.04);
          const distFromCloud = Math.abs(r - pos.cloudR);
          const flash = clamp(1 - distFromCloud / 64, 0.22, 1);
          const resonated = arc.pingResonanceFlash > 0.35;
          const strokeCol = resonated ? this.palette.lockHex : this.palette.secondaryHex;
          c2d.strokeStyle = strokeCol;
          c2d.globalAlpha = clamp((1 - t * 0.58) * flash * 0.9 + arc.pingResonanceFlash * 0.22, 0.12, 0.96);
          c2d.lineWidth = 2.0 + flash * 1.4 + arc.pingResonanceFlash * 0.8;
          c2d.beginPath();
          c2d.arc(pos.cx, pos.cy, r, arc.angle - arc.span * 0.5, arc.angle + arc.span * 0.5);
          c2d.stroke();
        }
      }
    }
    c2d.restore();

    // Subtle 2.5D iso-delay paraboloid perspective rings during Rewind focus
    if (this.phase === 'rewind') {
      const focusClose = clamp(1 - Math.abs(this.rewindVal - this.rewindTargetVal) / 0.35, 0, 1);
      drawInclinedAstrometryRing(
        c2d,
        ex,
        ey,
        bounds.maxR * 0.54,
        bounds.maxR * 0.22,
        -0.2,
        overCollapsed ? '255, 122, 107' : this.palette.accentRgb,
        { backAlpha: 0.08, frontAlpha: 0.22, ticks: 6 }
      );
      if (focusClose > 0.35) {
        drawLimbDarkenedStar(c2d, ex, ey, lerp(5, 16, focusClose), overCollapsed ? 'ALERT' : 'O', focusClose * 0.85);
        drawOpticalStar(c2d, ex, ey, lerp(6, 15, focusClose), {
          spectralClass: overCollapsed ? 'ALERT' : this.isRewindFocused() ? 'LOCK' : 'B',
          spikes: 6,
          alpha: focusClose,
          vibeMode: this.palette.mode,
        });
      }
    }

    // Clip compass rings cleanly inside safe play bounds so they NEVER overlap #qa-pull-tab or HUD buttons!
    c2d.save();
    c2d.beginPath();
    c2d.rect(bounds.left - 18, bounds.top - 10, bounds.right - bounds.left + 36, bounds.bot - bounds.top + 20);
    c2d.clip?.();

    // Interactive Curvature TEST PING Wavefront
    if (this.pingActive && this.phase === 'locate') {
      const pingR = 18 + Math.sqrt(clamp(this.pingProgress01, 0, 1)) * (bounds.maxR * 1.08);
      drawGlowStroke(
        c2d,
        (ctx) => {
          ctx.arc(ux, uy, pingR, 0, Math.PI * 2);
        },
        this.palette.accentHex,
        2.0,
        { outerAlpha: (1 - this.pingProgress01) * 0.22, coreAlpha: (1 - this.pingProgress01) * 0.88 }
      );
    }

    // Proportional concentric reference rings (scaled to maxR — fits 844x390 cleanly!)
    const ringCol = locked || this.phase === 'rewind' ? this.palette.lockHex : this.palette.accentHex;
    if (this.phase === 'locate') {
      c2d.strokeStyle = ringCol;
      c2d.lineWidth = 1.1;
      if (typeof c2d.setLineDash === 'function') c2d.setLineDash([4, 6]);
      const ratios = [0.28, 0.56, 0.84];
      for (let i = 0; i < ratios.length; i++) {
        c2d.globalAlpha = 0.22 - i * 0.03;
        c2d.beginPath();
        c2d.arc(ux, uy, bounds.maxR * ratios[i], 0, Math.PI * 2);
        c2d.stroke();
      }
      if (typeof c2d.setLineDash === 'function') c2d.setLineDash([]);
    }
    c2d.restore();

    // Compass Reticle & Cold-mode live ΔR residual readout
    const reticleX = this.phase === 'rewind' ? ex : ux;
    const reticleY = this.phase === 'rewind' ? ey : uy;
    c2d.save();
    c2d.strokeStyle = ringCol;
    c2d.lineWidth = 1.8;
    c2d.globalAlpha = 0.92;
    c2d.beginPath();
    c2d.arc(reticleX, reticleY, 17, 0, Math.PI * 2);
    c2d.stroke();
    c2d.beginPath();
    c2d.moveTo(reticleX - 23, reticleY);
    c2d.lineTo(reticleX - 11, reticleY);
    c2d.moveTo(reticleX + 11, reticleY);
    c2d.lineTo(reticleX + 23, reticleY);
    c2d.moveTo(reticleX, reticleY - 23);
    c2d.lineTo(reticleX, reticleY - 11);
    c2d.moveTo(reticleX, reticleY + 11);
    c2d.lineTo(reticleX, reticleY + 23);
    c2d.stroke();

    if (this.profile.showNumericDeltas && this.phase === 'locate') {
      const errArcsec = (this.getEpicenterErrorPx() / Math.max(1, bounds.maxR)) * 42;
      c2d.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      c2d.fillStyle = locked ? this.palette.lockHex : 'rgba(186, 224, 248, 0.82)';
      c2d.textAlign = 'left';
      c2d.fillText(`ΔR ${errArcsec.toFixed(1)}″`, reticleX + 24, reticleY - 6);
    }
    c2d.restore();

    if (locked && this.phase === 'locate') {
      drawOpticalStar(c2d, reticleX, reticleY, 8.5, {
        spectralClass: 'LOCK',
        spikes: 6,
        alpha: 0.95,
        vibeMode: this.palette.mode,
      });
    }

    // Rewind Vernier Strip in real years
    if (this.phase === 'rewind') {
      const yrLabel =
        Math.abs(tYears) < 0.8
          ? '0.0 yr · CORE'
          : `${tYears > 0 ? '+' : ''}${tYears.toFixed(1)} yr`;
      this.stripInputs.length = 1;
      this.stripInputs[0] = {
        key: 'rewind',
        label: 'REWIND EPOCH (FOCUS t = 0.0 yr)',
        val01: this.rewindVal,
        locked: this.isRewindFocused(),
        rightText: yrLabel,
      };
      layoutVernierRowInto(this.strips, w, h, this.stripInputs, this.compact ? h - 76 : h - 98);
      drawVernierStrip(c2d, this.strips[0], this.palette.accentHex, this.palette.lockHex);
    } else {
      this.strips.length = 0;
    }

    this.drawSharedOverlays(
      c2d,
      w,
      h,
      this.lockHoldSec > 0.02
        ? {
            cx: reticleX,
            cy: reticleY,
            radius: 26,
            progress01: this.lockHoldSec / (this.phase === 'locate' ? this.lockHoldTargetSec : 0.48),
          }
        : undefined
    );
  }

  protected solveCurrentStage(_stage: 1 | 2 | 3): void {
    this.compassNx = this.epicenterNx;
    this.compassNy = this.epicenterNy;
    if (this.stage >= 2) {
      this.phase = 'rewind';
      this.rewindVal = this.rewindTargetVal;
    }
  }

  protected override verifySolved(stage: 1 | 2 | 3): boolean {
    if (!this.isEpicenterLocked()) return false;
    if (stage >= 2) {
      return this.phase === 'rewind' && this.isRewindFocused();
    }
    return true;
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple:
        'Supernova blasts illuminate foreground dust sheets along expanding light-delay paraboloids (ρ ∝ √(2czt)); comparing test-ping circle curvature locates the progenitor so light echoes can be focused back to t = 0.0 yr.',
      goalSummary:
        'Move the Wavefront Compass and fire TEST PING rings until curvature aligns tangentially with all true dust arcs, then rewind the echo shells to t = 0.0 yr.',
      controlsDesktop:
        'Drag compass (or Arrow keys) onto epicenter; Space / TEST PING emits curvature ripples; slide REWIND EPOCH to t = 0.0 yr.',
      controlsTouch:
        'Touch-drag the compass and tap TEST PING; focus the REWIND EPOCH strip cleanly onto t = 0.0 yr.',
      warmthEffect:
        'Warm H% widens geometric epicenter and rewind focus detents; Cold H% tightens tolerance and exposes angular ΔR residuals.',
    };
  }
}
