import pacing from '../../../content/pacing.json';
import { platform } from '../../../platform/PlatformAdapter';
import { setupRetinaCanvas } from '../canvasUtils';
import {
  drawCachedCosmicBackdrop,
  type BackdropDrawOpts,
  preloadCosmicPlate,
} from '../render/BackdropCachePipeline';
import { Minigame3DBridge, resolveMinigame3DConfig } from '../render/Minigame3DBridge';
import {
  type CosmicPalette,
  drawLockResonanceRing,
  drawStageUnlockPulse,
  getCosmicPalette,
} from '../render/OpticalDrawUtils';
import { ParticlePool, type ReticleDuckZone } from '../render/ParticlePool';
import {
  drawAmbientStarfield3Depth,
  generateDepthStarfield,
  type DepthStarSpec,
} from '../render/StarPSFAtlas';
import { clamp, computeInstrumentProfile, createSeededRng, lerp, resolveInstrumentPayout } from '../tactilePhysics';
import type {
  CognitiveInstrumentProfile,
  CosmicPlateId,
  HudActionButtonSpec,
  HudHeartbeatSnapshot,
  IMinigame,
  InstrumentFieldGuide,
  Minigame3DConfig,
  MinigameContext,
  MinigameGrade,
  MinigameStateVector,
  MinigameVariantSpec,
  SolvabilityHarness,
} from '../types';
import { stageLabel } from './vernierWidgets';

export interface FinishMinigameOptions {
  grade?: Exclude<MinigameGrade, 'aborted'>;
  accuracy: number;
  proofFragmentSuffix: string;
  dossierSnippet: string;
  telemetrySummary: string;
  physicalPrinciple: string;
}

export interface PointerLocalEvent {
  x: number;
  y: number;
  w: number;
  h: number;
  nx: number; // -1..+1 relative to center
  ny: number; // -1..+1 relative to center
  button: number;
  pointerId: number;
  pointerType: string;
  original: PointerEvent;
}

/**
 * Shared abstract lifecycle shell for all 21+ cosmic minigames.
 * Owns:
 * - DPR-clamped Retina canvas + ResizeObserver + cached logical w/h/rect (0 layout reads in render/pointermove)
 * - Clamped rAF loop (dt <= 0.05)
 * - Unified pointerdown/move/up/cancel + pointer capture + wheel + keyboard routing
 * - Multi-iteration variant selection + deterministic seeded RNG per stage (`stageRng`)
 * - Throttled & signature-diffed HUD heartbeat emission (<= 10 Hz)
 * - Pooled cosmic ParticlePool + 3-depth power-law starfield + Minigame3DBridge parallax coupling
 * - Clean stage transitions, lock ring / unlock pulse helpers, result builder, destroy(), and SolvabilityHarness
 */
export abstract class BaseCosmicMinigame implements IMinigame {
  abstract readonly id: string;
  abstract readonly title: string;
  abstract readonly subtitle: string;
  abstract readonly instrumentCode: string;

  readonly variants?: readonly MinigameVariantSpec[];
  readonly platePool?: readonly CosmicPlateId[];
  readonly backdrop3D?: Minigame3DConfig;

  protected ctx!: MinigameContext;
  protected canvas!: HTMLCanvasElement;
  protected c2d!: CanvasRenderingContext2D;

  // Cached layout dimensions (updated ONLY on mount/ResizeObserver/window.resize — never read DOM in render!)
  protected width = 1280;
  protected height = 720;
  protected compact = false;
  protected dpr = 1;
  private cachedRect: { left: number; top: number; width: number; height: number } = {
    left: 0,
    top: 0,
    width: 1280,
    height: 720,
  };

  protected palette!: CosmicPalette;
  protected profile!: CognitiveInstrumentProfile;
  protected clarity01 = 0.65;

  protected elapsedSec = 0;
  protected startedAt = 0;
  protected completed = false;
  protected postCompleteAmbient = false;
  protected maxStages: 2 | 3 = 3;
  protected stage: 1 | 2 | 3 = 1;
  protected stageEnterT = 1;
  protected stageFlash = 0;
  protected stageFlashText = '';
  protected stageClearTimer = 0;
  protected lockHoldSec = 0;
  protected lockHoldTargetSec = pacing.minigames.lockHoldTargetSec;

  private stageTransitionPhase: 'idle' | 'holding' | 'closing' | 'opening' = 'idle';
  private stageTransitionElapsed = 0;
  private stageTransitionDuration = 0;
  private stageVeilAlpha = 0;
  private stageFocusX = 0;
  private stageFocusY = 0;

  private lockRingAlpha = 0;
  private lockRingDisplayProgress = 0;
  private lockRingRequestedThisFrame = false;
  private lockRingSpec: {
    cx: number;
    cy: number;
    radius: number;
    targetProgress: number;
    colorHex: string;
    label?: string;
  } | null = null;

  protected iterationIndex = 0;
  protected variantSeed = '';
  protected activeVariant: MinigameVariantSpec | null = null;
  protected activePlateId: CosmicPlateId = 'smacs';

  protected particles = new ParticlePool();
  protected depthStars: DepthStarSpec[] = [];
  protected pointerNormX = 0;
  protected pointerNormY = 0;

  private rafId: number | null = null;
  private lastTs = 0;
  private resizeObserver: ResizeObserver | null = null;
  private unbindEvents: (() => void) | null = null;
  private bridge3D: Minigame3DBridge | null = null;
  private activePointerId: number | null = null;
  private lastHudSig = '';
  private lastHudSentMs = 0;
  private briefingHold = false;
  private briefingHoldRemainingSec = 0;
  private paused = false;

  mount(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.startedAt = performance.now();
    this.completed = false;
    this.postCompleteAmbient = false;
    this.paused = false;
    this.elapsedSec = 0;
    this.maxStages = ctx.state.anomalyRole === 'baseline' ? 2 : 3;
    this.stage = 1;
    this.stageEnterT = 1;
    this.stageFlash = 0;
    this.stageFlashText = '';
    this.stageClearTimer = 0;
    this.lockHoldSec = 0;
    this.stageTransitionPhase = 'idle';
    this.stageTransitionElapsed = 0;
    this.stageTransitionDuration = 0;
    this.stageVeilAlpha = 0;
    this.lockRingAlpha = 0;
    this.lockRingDisplayProgress = 0;
    this.lockRingRequestedThisFrame = false;
    this.lockRingSpec = null;
    this.pointerNormX = 0;
    this.pointerNormY = 0;
    this.lastHudSig = '';
    this.lastHudSentMs = 0;
    this.briefingHold = Boolean(ctx.briefingHoldMs && ctx.briefingHoldMs > 0);
    this.briefingHoldRemainingSec = this.briefingHold ? (ctx.briefingHoldMs ?? 0) / 1000 : 0;

    this.palette = getCosmicPalette(ctx.state.humanity);
    this.profile = computeInstrumentProfile(ctx.state);
    this.clarity01 = this.profile.clarity01;

    // Resolve curated iteration / variant + plate pool
    const variants = this.variants ?? [];
    this.iterationIndex = Math.max(0, Math.floor(ctx.iterationIndex ?? 0));
    this.activeVariant =
      variants.length > 0 ? variants[this.iterationIndex % variants.length] : null;
    this.variantSeed =
      ctx.variantSeed ??
      `${ctx.targetId}:${this.id}:v${this.iterationIndex}:s${ctx.state.shift}`;

    const pool = this.platePool;
    this.activePlateId =
      ctx.plateOverride ??
      this.activeVariant?.plateId ??
      (pool && pool.length > 0 ? pool[this.iterationIndex % pool.length] : 'smacs');
    preloadCosmicPlate(this.activePlateId);

    // Build DPR-clamped canvas inside container
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minigame-canvas';
    ctx.container.innerHTML = '';
    ctx.container.appendChild(this.canvas);
    this.c2d = this.canvas.getContext('2d')!;
    this.syncCanvasMetrics();

    // Initialize depth starfield + zero-GC particle pool
    const starRng = createSeededRng(`${this.variantSeed}:ambient-stars`);
    this.depthStars = generateDepthStarfield(starRng, this.compact ? 46 : 66);
    this.particles.clear();
    this.particles.configureVibe(this.palette.mode, Math.round(starRng() * 1e6));
    this.particles.seedAmbientMotes(this.width, this.height);

    // Configure lightweight 3D backdrop coupling (or clean WebGL pause for pure-plate games)
    const cfg3D = this.getBackdrop3DConfig();
    this.bridge3D = new Minigame3DBridge(ctx.showcase);
    this.bridge3D.enter(cfg3D, ctx.state.humanity);

    this.onMount();
    this.setupStage(1);
    this.bindInputListeners();
    this.emitHud(true);
    ctx.onCalibrationComplete?.();

    this.lastTs = performance.now();
    const tick = (now: number) => {
      if (this.completed && !this.postCompleteAmbient) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTs) / 1000));
      this.lastTs = now;
      if (this.paused && !this.postCompleteAmbient) {
        this.renderFrame();
      } else if (this.postCompleteAmbient) {
        this.elapsedSec += dt * 0.45;
        this.stageFlash = Math.max(0, this.stageFlash - dt * 0.85);
        this.lockRingAlpha = Math.max(0, this.lockRingAlpha - dt * 2.2);
        this.particles.update(dt * 0.55, this.width, this.height);
        this.renderFrame();
        this.bridge3D?.updateParallax(this.pointerNormX * 0.35, this.pointerNormY * 0.35, 1);
      } else {
        this.stepFrame(dt);
        this.renderFrame();
      }
      if (!this.completed || this.postCompleteAmbient) {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    if (typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame(tick);
    }
  }

  /**
   * Live in-place 3-Axis state update (Warmth, Optical Clarity, Horizon Drift) without
   * tearing down the canvas or resetting the player's current Stage progress.
   */
  updateState(nextState: MinigameStateVector): void {
    if (!this.ctx || this.completed) return;
    this.ctx.state = nextState;
    this.maxStages = nextState.anomalyRole === 'baseline' ? 2 : 3;
    this.palette = getCosmicPalette(nextState.humanity);
    this.profile = computeInstrumentProfile(nextState);
    this.clarity01 = this.profile.clarity01;
    this.particles.configureVibe(this.palette.mode);
    this.bridge3D?.setVibe(nextState.humanity);
    this.onProfileUpdated();
    this.emitHud(true);
  }

  setBriefingHold(active: boolean): void {
    this.briefingHold = active;
    if (!active) {
      this.briefingHoldRemainingSec = 0;
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.lastTs = performance.now();
  }

  getBackdrop3DConfig(): Minigame3DConfig {
    return this.backdrop3D ?? resolveMinigame3DConfig(this.id);
  }

  protected get is3DBackdropActive(): boolean {
    return Boolean(this.bridge3D?.is3DVisible);
  }

  /**
   * Deterministic stage PRNG seeded from (targetId, minigameId, iterationIndex, shift, stage).
   */
  protected stageRng(stage: 1 | 2 | 3 = this.stage, salt = ''): () => number {
    return createSeededRng(`${this.variantSeed}:st${stage}${salt ? ':' + salt : ''}`);
  }

  protected syncCanvasMetrics(): void {
    const w = Math.max(
      1,
      this.canvas.clientWidth || this.ctx.container.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1280)
    );
    const h = Math.max(
      1,
      this.canvas.clientHeight || this.ctx.container.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 720)
    );
    const metrics = setupRetinaCanvas(this.canvas, this.c2d, w, h);
    this.width = metrics.w;
    this.height = metrics.h;
    this.dpr = metrics.dpr;
    this.compact = this.height < 450;
    this.refreshCachedRect();
    this.onResize(this.width, this.height);
  }

  private refreshCachedRect(): void {
    if (typeof this.canvas.getBoundingClientRect === 'function') {
      const r = this.canvas.getBoundingClientRect();
      this.cachedRect = {
        left: r.left,
        top: r.top,
        width: Math.max(1, r.width || this.width),
        height: Math.max(1, r.height || this.height),
      };
    } else {
      this.cachedRect = { left: 0, top: 0, width: this.width, height: this.height };
    }
  }

  private toPointerEvent(e: PointerEvent): PointerLocalEvent {
    const rect = this.cachedRect;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const nx = clamp((x / w) * 2 - 1, -1, 1);
    const ny = clamp((y / h) * 2 - 1, -1, 1);
    return {
      x,
      y,
      w,
      h,
      nx,
      ny,
      button: e.button,
      pointerId: e.pointerId,
      pointerType: e.pointerType || 'mouse',
      original: e,
    };
  }

  private bindInputListeners(): void {
    const onResize = () => this.syncCanvasMetrics();

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.syncCanvasMetrics());
      this.resizeObserver.observe(this.ctx.container);
    }

    const onDown = (e: PointerEvent) => {
      if (this.completed || this.briefingHold || this.paused) return;
      this.refreshCachedRect();
      this.activePointerId = e.pointerId;
      if (typeof this.canvas.setPointerCapture === 'function') {
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch {
          // Synthetic / detached pointer events in unit tests
        }
      }
      const ev = this.toPointerEvent(e);
      this.pointerNormX = ev.nx;
      this.pointerNormY = ev.ny;
      this.onPointerDown(ev);
    };

    const onMove = (e: PointerEvent) => {
      if (this.completed || this.paused) return;
      const ev = this.toPointerEvent(e);
      this.pointerNormX = ev.nx;
      this.pointerNormY = ev.ny;
      this.onPointerMove(ev);
    };

    const onUpOrCancel = (e: PointerEvent) => {
      if (this.activePointerId === e.pointerId) {
        this.activePointerId = null;
      }
      if (
        typeof this.canvas.hasPointerCapture === 'function' &&
        typeof this.canvas.releasePointerCapture === 'function'
      ) {
        try {
          if (this.canvas.hasPointerCapture(e.pointerId)) {
            this.canvas.releasePointerCapture(e.pointerId);
          }
        } catch {
          // Ignore synthetic pointer ids
        }
      }
      const ev = this.toPointerEvent(e);
      if (e.type === 'pointercancel') {
        this.onPointerCancel(ev);
      } else {
        this.onPointerUp(ev);
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (this.completed || this.briefingHold || this.paused) return;
      if (this.onWheel(e.deltaY, e)) {
        e.preventDefault();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (this.completed || this.briefingHold || this.paused) return;
      this.onKeyDown(e);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (this.completed) return;
      this.onKeyUp(e);
    };

    window.addEventListener('resize', onResize);
    this.canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUpOrCancel);
    window.addEventListener('pointercancel', onUpOrCancel);
    this.canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    this.unbindEvents = () => {
      window.removeEventListener('resize', onResize);
      this.canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUpOrCancel);
      window.removeEventListener('pointercancel', onUpOrCancel);
      this.canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }

  private stepFrame(dt: number): void {
    if (this.completed) return;
    if (this.briefingHold) {
      if (this.briefingHoldRemainingSec > 0) {
        this.briefingHoldRemainingSec -= dt;
        if (this.briefingHoldRemainingSec <= 0) {
          this.briefingHold = false;
          this.briefingHoldRemainingSec = 0;
        }
      }
      if (this.briefingHold) {
        this.particles.update(dt * 0.25, this.width, this.height);
        this.bridge3D?.updateParallax(
          this.pointerNormX * 0.35,
          this.pointerNormY * 0.35,
          this.getStageProgress01()
        );
        this.emitHud(false);
        return;
      }
    }
    this.elapsedSec += dt;
    this.stageFlash = Math.max(0, this.stageFlash - dt * 0.78);
    if (this.stageEnterT < 1) {
      this.stageEnterT = Math.min(1, this.stageEnterT + dt / 0.56);
    }
    this.particles.update(dt, this.width, this.height);

    // Inertial smoothing on the lock resonance ring (gentle appear, damped progress, unhurried fade-out)
    const wantRing =
      this.lockRingRequestedThisFrame ||
      (this.stageTransitionPhase === 'holding' && this.lockRingSpec !== null);
    const targetAlpha = this.stageTransitionPhase === 'closing' ? 0 : wantRing ? 1 : 0;
    const alphaRate = targetAlpha > this.lockRingAlpha ? 5.2 : 2.8;
    this.lockRingAlpha = lerp(this.lockRingAlpha, targetAlpha, 1 - Math.exp(-alphaRate * dt));

    const targetProg = this.lockRingSpec
      ? this.stageTransitionPhase === 'holding'
        ? 1
        : this.lockRingSpec.targetProgress
      : 0;
    const progRate = targetProg >= this.lockRingDisplayProgress ? 4.8 : 2.6;
    this.lockRingDisplayProgress = lerp(
      this.lockRingDisplayProgress,
      targetProg,
      1 - Math.exp(-progRate * dt)
    );

    if (!wantRing && this.lockRingAlpha < 0.015) {
      this.lockRingAlpha = 0;
      this.lockRingDisplayProgress = 0;
      this.lockRingSpec = null;
    }

    // Two-phase optical aperture cross-dissolve between Stage 1 -> 2 (-> 3 for anomalies)
    if (this.stageTransitionPhase === 'holding') {
      this.stageClearTimer -= dt;
      if (this.stageClearTimer <= 0) {
        if (this.stage < this.maxStages) {
          this.stageTransitionPhase = 'closing';
          this.stageTransitionElapsed = 0;
          this.stageTransitionDuration = pacing.minigames.stageVeilCloseSec;
          this.stageClearTimer = pacing.minigames.stageVeilCloseSec;
        } else {
          this.stageClearTimer = 0;
          this.stageTransitionPhase = 'idle';
          this.onAllStagesCleared();
          return;
        }
      }
    } else if (this.stageTransitionPhase === 'closing') {
      this.stageTransitionElapsed += dt;
      const u = clamp(this.stageTransitionElapsed / Math.max(0.01, this.stageTransitionDuration), 0, 1);
      this.stageVeilAlpha = u * u * 0.86;
      this.stageClearTimer = Math.max(0.001, this.stageTransitionDuration - this.stageTransitionElapsed);
      if (u >= 1) {
        this.setupStage((this.stage + 1) as 2 | 3);
        this.stageTransitionPhase = 'opening';
        this.stageTransitionElapsed = 0;
        this.stageTransitionDuration = pacing.minigames.stageVeilOpenSec;
        this.stageVeilAlpha = 0.86;
        this.stageClearTimer = 0;
        this.emitHud(true);
      }
    } else if (this.stageTransitionPhase === 'opening') {
      this.stageTransitionElapsed += dt;
      const u = clamp(this.stageTransitionElapsed / Math.max(0.01, this.stageTransitionDuration), 0, 1);
      const easeOut = 1 - Math.pow(1 - u, 3);
      this.stageVeilAlpha = (1 - easeOut) * 0.86;
      if (u >= 1) {
        this.stageTransitionPhase = 'idle';
        this.stageVeilAlpha = 0;
      }
    } else if (this.stageClearTimer > 0) {
      this.stageClearTimer -= dt;
      if (this.stageClearTimer <= 0) {
        this.stageClearTimer = 0;
        if (this.stage < this.maxStages) {
          this.setupStage((this.stage + 1) as 2 | 3);
          this.emitHud(true);
        } else {
          this.onAllStagesCleared();
          return;
        }
      }
    }

    this.onUpdate(dt);
    this.bridge3D?.updateParallax(this.pointerNormX, this.pointerNormY, this.getStageProgress01());
    this.emitHud(false);
  }

  private renderFrame(): void {
    this.lockRingRequestedThisFrame = false;
    this.onRender(this.c2d, this.width, this.height);
    const veilAlpha = Math.max(
      this.stageVeilAlpha,
      this.stageEnterT < 0.995
        ? (1 - (1 - Math.pow(1 - clamp(this.stageEnterT, 0, 1), 3))) * 0.28
        : 0
    );
    if (veilAlpha > 0.005) {
      this.c2d.save();
      this.c2d.fillStyle = this.palette.voidBg;
      this.c2d.globalAlpha = veilAlpha;
      this.c2d.fillRect(0, 0, this.width, this.height);

      // Subtle expanding/contracting optical iris hairline centered on stage lock focus
      if (this.stageTransitionPhase === 'closing' || this.stageTransitionPhase === 'opening') {
        const fx = this.stageFocusX || this.width * 0.5;
        const fy = this.stageFocusY || this.height * 0.46;
        const maxR = Math.min(this.width, this.height) * 0.42;
        const irisR = maxR * (1 - clamp(veilAlpha / 0.86, 0, 1) * 0.62);
        this.c2d.strokeStyle = this.palette.accentHex;
        this.c2d.globalAlpha = veilAlpha * 0.45;
        this.c2d.lineWidth = 1.25;
        this.c2d.beginPath();
        this.c2d.arc(fx, fy, Math.max(12, irisR), 0, Math.PI * 2);
        this.c2d.stroke();
      }
      this.c2d.restore();
    }
  }

  /**
   * Shared cached astronomy backdrop + 3-depth starfield + pooled ambient cosmic motes helper.
   * Applies the 3-Axis contract (Warmth cooling tint, Optical Clarity blur/grain, Horizon Drift edge ticks)
   * cleanly at the base level without square graph-paper overlays.
   */
  protected drawBackdropAndAmbient(
    c2d: CanvasRenderingContext2D,
    w: number,
    h: number,
    opts?: Partial<BackdropDrawOpts> & {
      starOpacity?: number;
      reticleDuck?: ReticleDuckZone;
    }
  ): void {
    const requestedBlur = opts?.blurPx ?? 4;
    const clarityScale = 0.28 + 0.42 * clamp(requestedBlur / 10, 0, 1);
    const effectiveBlur = requestedBlur + this.profile.plateBlurPenaltyPx * clarityScale;

    const baseTintHex =
      this.palette.mode === 'cold' ? '#041828' : this.palette.mode === 'warm' ? '#100804' : '#040812';
    const baseTintAlpha = opts?.tintAlpha ?? 0.44;
    const effectiveTintAlpha =
      this.palette.mode === 'cold' ? clamp(baseTintAlpha + 0.09, 0, 0.72) : baseTintAlpha;

    drawCachedCosmicBackdrop(c2d, w, h, {
      plateId: opts?.plateId ?? this.activePlateId,
      blurPx: effectiveBlur,
      alpha: opts?.alpha ?? 0.48,
      brightness: opts?.brightness ?? 0.82,
      scale: opts?.scale ?? 1.04,
      tintHex: opts?.tintHex ?? baseTintHex,
      tintAlpha: effectiveTintAlpha,
      vignetteAlpha: opts?.vignetteAlpha ?? 0.78,
      gridAlpha: opts?.gridAlpha ?? 0,
      grainAlpha: opts?.grainAlpha ?? this.profile.ccdNoiseAlpha,
      horizonDriftAlpha: opts?.horizonDriftAlpha ?? this.profile.seamBleedAlpha,
      compositeOver3D: opts?.compositeOver3D ?? this.is3DBackdropActive,
      parallaxX: opts?.parallaxX ?? this.pointerNormX,
      parallaxY: opts?.parallaxY ?? this.pointerNormY,
    });

    drawAmbientStarfield3Depth(c2d, w, h, this.depthStars, this.elapsedSec, {
      opacityMul: (opts?.starOpacity ?? 0.78) * lerp(0.84, 1.08, this.profile.clarity01),
      vibeMode: this.palette.mode,
      parallaxX: this.pointerNormX,
      parallaxY: this.pointerNormY,
    });

    this.particles.render(c2d, {
      parallaxX: this.pointerNormX,
      parallaxY: this.pointerNormY,
      reticleDuck: opts?.reticleDuck,
    });

    // Subtle non-blocking atmospheric enclosure bleed hairline on non-baseline anomaly targets
    const bleed = clamp(this.ctx?.state?.anomalyBleed ?? 0, 0, 1);
    if (this.ctx?.state?.anomalyRole !== 'baseline' && bleed > 0.05) {
      const pulse = 0.5 + 0.5 * Math.sin(this.elapsedSec * 1.4);
      const inset = this.compact ? 8 : 12;
      c2d.save();
      c2d.strokeStyle = `rgba(148, 224, 255, ${(bleed * (0.08 + 0.08 * pulse)).toFixed(3)})`;
      c2d.lineWidth = 0.85;
      c2d.strokeRect(inset, inset, Math.max(10, w - inset * 2), Math.max(10, h - inset * 2));
      c2d.restore();
    }
  }

  protected drawSharedOverlays(
    c2d: CanvasRenderingContext2D,
    w: number,
    h: number,
    lockRing?: { cx: number; cy: number; radius: number; progress01: number; label?: string; colorHex?: string }
  ): void {
    if (lockRing && lockRing.progress01 > 0.008) {
      this.lockRingRequestedThisFrame = true;
      this.lockRingSpec = {
        cx: lockRing.cx,
        cy: lockRing.cy,
        radius: lockRing.radius,
        targetProgress: clamp(lockRing.progress01, 0, 1),
        colorHex: lockRing.colorHex ?? this.palette.lockHex,
        label: lockRing.label,
      };
    } else if (this.lockRingSpec) {
      this.lockRingSpec.targetProgress = this.stageTransitionPhase === 'holding' ? 1 : 0;
    }

    if (this.lockRingSpec && this.lockRingAlpha > 0.015 && this.lockRingDisplayProgress > 0.005) {
      const spec = this.lockRingSpec;
      drawLockResonanceRing(
        c2d,
        spec.cx,
        spec.cy,
        spec.radius,
        this.lockRingDisplayProgress,
        spec.colorHex,
        spec.label,
        this.lockRingAlpha
      );
    }
    if (this.stageFlash > 0.01) {
      drawStageUnlockPulse(
        c2d,
        w,
        h,
        this.stageFlash,
        this.stageFlashText,
        this.palette.lockHex,
        this.palette.secondaryHex
      );
    }
  }

  protected setupStage(stage: 1 | 2 | 3): void {
    this.stage = stage;
    this.stageEnterT = stage === 1 ? 1 : 0;
    this.lockHoldSec = 0;
    this.stageClearTimer = 0;
    this.stageTransitionPhase = 'idle';
    this.stageTransitionElapsed = 0;
    this.stageTransitionDuration = 0;
    this.stageVeilAlpha = 0;
    this.lockRingAlpha = 0;
    this.lockRingDisplayProgress = 0;
    this.lockRingRequestedThisFrame = false;
    this.lockRingSpec = null;
    this.onSetupStage(stage, this.stageRng(stage));
  }

  /**
   * Triggers a clean stage-clear pulse + caustic ring and advances to the next stage
   * (or completes the instrument after maxStages) once the calm optical hold & cross-dissolve finish.
   */
  protected triggerStageClear(flashText: string, delaySec = 0.85, ringCx?: number, ringCy?: number): void {
    if (this.completed || this.stageClearTimer > 0) return;
    platform.triggerHaptic('phaseSnapLock', 0.95);
    this.ctx.audio?.playPhaseLock?.(this.stage);
    this.stageFlash = 1;
    this.stageFlashText = flashText;
    this.stageFocusX = ringCx ?? this.width * 0.5;
    this.stageFocusY = ringCy ?? this.height * 0.46;
    this.particles.emitLockCausticRing(
      this.stageFocusX,
      this.stageFocusY,
      this.compact ? 26 : 36,
      this.palette.lockHex
    );

    if (delaySec <= 0) {
      if (this.stage < this.maxStages) {
        this.setupStage((this.stage + 1) as 2 | 3);
      } else {
        this.onAllStagesCleared();
      }
    } else {
      const holdDur = Math.max(pacing.minigames.stageHoldSec, delaySec);
      this.stageClearTimer = holdDur;
      this.stageTransitionPhase = 'holding';
      this.stageTransitionElapsed = 0;
      this.stageTransitionDuration = holdDur;
    }
    this.emitHud(true);
  }

  /**
   * Throttled (<= 10 Hz) & signature-diffed HUD heartbeat emitter to eliminate 60Hz DOM thrash.
   */
  protected emitHud(force = false): void {
    if (!this.ctx?.onTelemetry) return;
    const now = performance.now();
    if (!force && now - this.lastHudSentMs < 100) return;

    const snap = this.buildHudSnapshot();
    const progBucket = Math.round(clamp(snap.stageProgress, 0, 1) * 50);
    const sig = `${snap.stageIndex}|${snap.stageLabel}|${progBucket}|${snap.promptText}|${snap.actionButton?.id ?? ''}|${snap.actionButton?.label ?? ''}|${snap.actionButton?.active ? 1 : 0}|${snap.variantTag ?? ''}`;
    if (!force && sig === this.lastHudSig) return;

    this.lastHudSig = sig;
    this.lastHudSentMs = now;
    this.ctx.onTelemetry(snap);
  }

  protected buildHudSnapshot(): HudHeartbeatSnapshot {
    return {
      stageIndex: this.stage,
      stageLabel: stageLabel(this.stage),
      stageProgress: this.getStageProgress01(),
      promptText: this.getPromptText(),
      actionButton: this.getHelperActionSpec(),
      variantTag: this.activeVariant?.label,
    };
  }

  protected finishSuccess(opts: FinishMinigameOptions): void {
    if (this.completed) return;
    this.completed = true;
    this.postCompleteAmbient = true;
    const resolvedGrade: Exclude<MinigameGrade, 'aborted'> = opts.grade ?? 'clean';
    this.ctx.audio?.stopInstrumentAudio();
    this.ctx.audio?.playCaptureShutter(resolvedGrade);
    platform.triggerHaptic('shutterCommit', 1.0);

    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.ctx.onComplete(
      resolveInstrumentPayout(
        resolvedGrade,
        totalSec,
        clamp(opts.accuracy, 0.5, 1.0),
        `${this.ctx.targetId}_${opts.proofFragmentSuffix}`,
        opts.dossierSnippet,
        opts.telemetrySummary,
        opts.physicalPrinciple
      )
    );
  }

  getSolvabilityHarness(): SolvabilityHarness {
    return {
      solveStage: (targetStage: 1 | 2 | 3) => {
        if (this.completed) return;
        if (this.stage !== targetStage) {
          this.setupStage(targetStage);
        }
        this.solveCurrentStage(targetStage);
        if (!this.verifySolved(targetStage)) {
          throw new Error(
            `[${this.instrumentCode} ${this.id}] Solvability invariant failed on Stage ${targetStage} (variant=${this.activeVariant?.id ?? this.iterationIndex})`
          );
        }
        if (!this.completed) {
          if (targetStage < this.maxStages) {
            this.setupStage((targetStage + 1) as 2 | 3);
            this.emitHud(true);
          } else {
            this.onAllStagesCleared();
          }
        }
      },
      getDiagnostics: () => ({
        stage: this.stage,
        completed: this.completed,
        stageProgress: this.completed ? 1 : this.getStageProgress01(),
        variantIndex: this.iterationIndex,
        variantId: this.activeVariant?.id ?? `${this.id}_v${this.iterationIndex}`,
        stageCount: this.maxStages,
      }),
    };
  }

  destroy(): void {
    this.completed = true;
    this.postCompleteAmbient = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.unbindEvents?.();
    this.unbindEvents = null;
    this.bridge3D?.exit();
    this.bridge3D = null;
    this.particles.clear();
    this.ctx?.audio?.stopInstrumentAudio();
    this.onDestroy();
    this.canvas?.remove();
  }

  // ==================== SUBCLASS HOOKS ====================

  protected onMount(): void {}
  protected onProfileUpdated(): void {}
  protected onResize(_w: number, _h: number): void {}
  protected onDestroy(): void {}
  protected onPointerDown(_ev: PointerLocalEvent): void {}
  protected onPointerMove(_ev: PointerLocalEvent): void {}
  protected onPointerUp(_ev: PointerLocalEvent): void {}
  protected onPointerCancel(ev: PointerLocalEvent): void {
    this.onPointerUp(ev);
  }
  protected onWheel(_deltaY: number, _e: WheelEvent): boolean {
    return false;
  }
  protected onKeyDown(_e: KeyboardEvent): void {}
  protected onKeyUp(_e: KeyboardEvent): void {}
  protected getHelperActionSpec(): HudActionButtonSpec | null {
    return null;
  }
  /**
   * Real-rules win predicate verified by `getSolvabilityHarness().solveStage()`
   * immediately after `solveCurrentStage()` runs. Every game must enforce its true physical win condition.
   */
  protected abstract verifySolved(stage: 1 | 2 | 3): boolean;

  protected abstract onSetupStage(stage: 1 | 2 | 3, rng: () => number): void;
  protected abstract onUpdate(dt: number): void;
  protected abstract onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void;
  protected abstract getStageProgress01(): number;
  protected abstract getPromptText(): string;
  protected abstract solveCurrentStage(stage: 1 | 2 | 3): void;
  protected abstract onAllStagesCleared(): void;
  abstract getFieldGuide(): InstrumentFieldGuide;
}
