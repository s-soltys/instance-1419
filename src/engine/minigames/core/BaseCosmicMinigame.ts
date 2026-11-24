import { platform } from '../../../platform/PlatformAdapter';
import { computeOpticalClarity, setupRetinaCanvas } from '../canvasUtils';
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
import {
  clamp,
  computeInstrumentProfile,
  createSeededRng,
  resolveInstrumentPayout,
} from '../tactilePhysics';
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
  protected stage: 1 | 2 | 3 = 1;
  protected stageFlash = 0;
  protected stageFlashText = '';
  protected stageClearTimer = 0;
  protected lockHoldSec = 0;
  protected lockHoldTargetSec = 0.5;

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

  mount(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.startedAt = performance.now();
    this.completed = false;
    this.elapsedSec = 0;
    this.stage = 1;
    this.stageFlash = 0;
    this.stageFlashText = '';
    this.stageClearTimer = 0;
    this.lockHoldSec = 0;
    this.pointerNormX = 0;
    this.pointerNormY = 0;
    this.lastHudSig = '';
    this.lastHudSentMs = 0;

    this.palette = getCosmicPalette(ctx.state.humanity);
    this.profile = computeInstrumentProfile(ctx.state);
    this.clarity01 = computeOpticalClarity(ctx.state.humanity, ctx.state.opticalFidelity);

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
    this.bridge3D.enter(cfg3D);

    this.onMount();
    this.setupStage(1);
    this.bindInputListeners();
    this.emitHud(true);
    ctx.onCalibrationComplete?.();

    this.lastTs = performance.now();
    const tick = (now: number) => {
      if (this.completed) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTs) / 1000));
      this.lastTs = now;
      this.stepFrame(dt);
      this.renderFrame();
      if (!this.completed) {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    if (typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame(tick);
    }
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
      if (this.completed) return;
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
      if (this.completed) return;
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
      if (this.completed) return;
      if (this.onWheel(e.deltaY, e)) {
        e.preventDefault();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (this.completed) return;
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
    this.elapsedSec += dt;
    this.stageFlash = Math.max(0, this.stageFlash - dt * 1.4);
    this.particles.update(dt, this.width, this.height);

    if (this.stageClearTimer > 0) {
      this.stageClearTimer -= dt;
      if (this.stageClearTimer <= 0) {
        this.stageClearTimer = 0;
        if (this.stage < 3) {
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
    this.onRender(this.c2d, this.width, this.height);
  }

  /**
   * Shared cached astronomy backdrop + 3-depth starfield + pooled ambient cosmic motes helper.
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
    drawCachedCosmicBackdrop(c2d, w, h, {
      plateId: opts?.plateId ?? this.activePlateId,
      blurPx: opts?.blurPx ?? 4,
      alpha: opts?.alpha ?? 0.48,
      brightness: opts?.brightness ?? 0.82,
      scale: opts?.scale ?? 1.04,
      tintHex: opts?.tintHex ?? '#040812',
      tintAlpha: opts?.tintAlpha ?? 0.44,
      vignetteAlpha: opts?.vignetteAlpha ?? 0.78,
      gridAlpha: opts?.gridAlpha ?? (this.palette.mode === 'cold' ? 0.14 : 0.05),
      compositeOver3D: opts?.compositeOver3D ?? this.is3DBackdropActive,
      parallaxX: opts?.parallaxX ?? this.pointerNormX,
      parallaxY: opts?.parallaxY ?? this.pointerNormY,
    });

    drawAmbientStarfield3Depth(c2d, w, h, this.depthStars, this.elapsedSec, {
      opacityMul: opts?.starOpacity ?? 0.78,
      vibeMode: this.palette.mode,
      parallaxX: this.pointerNormX,
      parallaxY: this.pointerNormY,
    });

    this.particles.render(c2d, {
      parallaxX: this.pointerNormX,
      parallaxY: this.pointerNormY,
      reticleDuck: opts?.reticleDuck,
    });
  }

  protected drawSharedOverlays(
    c2d: CanvasRenderingContext2D,
    w: number,
    h: number,
    lockRing?: { cx: number; cy: number; radius: number; progress01: number; label?: string; colorHex?: string }
  ): void {
    if (lockRing && lockRing.progress01 > 0.01) {
      drawLockResonanceRing(
        c2d,
        lockRing.cx,
        lockRing.cy,
        lockRing.radius,
        lockRing.progress01,
        lockRing.colorHex ?? this.palette.lockHex,
        lockRing.label
      );
    }
    if (this.stageFlash > 0.01) {
      drawStageUnlockPulse(c2d, w, h, this.stageFlash, this.stageFlashText, this.palette.lockHex);
    }
  }

  protected setupStage(stage: 1 | 2 | 3): void {
    this.stage = stage;
    this.lockHoldSec = 0;
    this.stageClearTimer = 0;
    this.onSetupStage(stage, this.stageRng(stage));
  }

  /**
   * Triggers a clean stage-clear pulse + caustic ring and advances to the next stage
   * (or completes the instrument after Stage 3) once `delaySec` elapses.
   */
  protected triggerStageClear(flashText: string, delaySec = 0.62, ringCx?: number, ringCy?: number): void {
    if (this.completed || this.stageClearTimer > 0) return;
    platform.triggerHaptic('phaseSnapLock', 0.95);
    this.ctx.audio?.playPhaseLock?.(this.stage);
    this.stageFlash = 1;
    this.stageFlashText = flashText;
    this.particles.emitLockCausticRing(
      ringCx ?? this.width * 0.5,
      ringCy ?? this.height * 0.46,
      this.compact ? 26 : 36,
      this.palette.lockHex
    );

    if (delaySec <= 0) {
      if (this.stage < 3) {
        this.setupStage((this.stage + 1) as 2 | 3);
      } else {
        this.onAllStagesCleared();
      }
    } else {
      this.stageClearTimer = delaySec;
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
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.ctx.audio?.stopInstrumentAudio();
    this.ctx.audio?.playCaptureShutter(opts.grade ?? 'clean');
    platform.triggerHaptic('shutterCommit', 1.0);
    this.bridge3D?.exit();

    const totalSec = Math.max(this.elapsedSec, (performance.now() - this.startedAt) / 1000);
    this.ctx.onComplete(
      resolveInstrumentPayout(
        opts.grade ?? 'clean',
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
        if (!this.completed) {
          if (targetStage < 3) {
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
        stageCount: 3,
      }),
    };
  }

  destroy(): void {
    this.completed = true;
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

  protected abstract onSetupStage(stage: 1 | 2 | 3, rng: () => number): void;
  protected abstract onUpdate(dt: number): void;
  protected abstract onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void;
  protected abstract getStageProgress01(): number;
  protected abstract getPromptText(): string;
  protected abstract solveCurrentStage(stage: 1 | 2 | 3): void;
  protected abstract onAllStagesCleared(): void;
  abstract getFieldGuide(): InstrumentFieldGuide;
}
