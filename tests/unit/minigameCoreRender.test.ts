import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseCosmicMinigame } from '../../src/engine/minigames/core/BaseCosmicMinigame';
import {
  drawVernierStrip,
  hitVernierStrip,
  layoutVernierRowInto,
  layoutVerticalVernierRackInto,
  valueFromStripPos,
  type VernierStripSpec,
} from '../../src/engine/minigames/core/vernierWidgets';
import {
  clearBackdropCaches,
  drawCachedCosmicBackdrop,
  getBackdropCacheStats,
} from '../../src/engine/minigames/render/BackdropCachePipeline';
import {
  drawGlowStroke,
  drawInclinedAstrometryRing,
  drawLockResonanceRing,
  drawStageUnlockPulse,
} from '../../src/engine/minigames/render/OpticalDrawUtils';
import { ParticlePool } from '../../src/engine/minigames/render/ParticlePool';
import {
  drawAmbientStarfield3Depth,
  drawCrescentPlanet,
  drawLimbDarkenedStar,
  drawOpticalStar,
  drawSoftDustPuff,
  evalMicroScintillation,
  generateDepthStarfield,
  quantizeHexToSpectralClass,
} from '../../src/engine/minigames/render/StarPSFAtlas';
import { createSeededRng } from '../../src/engine/minigames/tactilePhysics';
import type {
  InstrumentFieldGuide,
  MinigameResult,
  MinigameVariantSpec,
} from '../../src/engine/minigames/types';
import {
  createMockAudioEngine,
  createMockShowcaseScene,
  installJsdomCanvasAndObservers,
} from '../integration/domTestHelpers';

class DemoCosmicMinigame extends BaseCosmicMinigame {
  readonly id = 'demo_cosmic';
  readonly title = 'DEMO COSMIC';
  readonly subtitle = 'Unit Harness';
  readonly instrumentCode = 'DEM-00';
  readonly variants: readonly MinigameVariantSpec[] = [
    { index: 0, id: 'demo_v1', label: 'Carina Run', plateId: 'carina' },
    { index: 1, id: 'demo_v2', label: 'Crab Run', plateId: 'crab' },
    { index: 2, id: 'demo_v3', label: 'Pillars Run', plateId: 'pillars' },
    { index: 3, id: 'demo_v4', label: 'Whirlpool Run', plateId: 'whirlpool' },
  ];

  stageValue = 0;
  cancelledCount = 0;

  protected onSetupStage(_stage: 1 | 2 | 3, rng: () => number): void {
    this.stageValue = rng();
  }

  protected onUpdate(_dt: number): void {}

  protected onRender(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    this.drawBackdropAndAmbient(c2d, w, h, { blurPx: 4 });
    this.drawSharedOverlays(c2d, w, h, { cx: w * 0.5, cy: h * 0.5, radius: 40, progress01: 0.5 });
  }

  protected onPointerCancel(): void {
    this.cancelledCount++;
  }

  protected getStageProgress01(): number {
    return (this.stage - 1) / 3;
  }

  protected getPromptText(): string {
    return `Stage ${this.stage} prompt`;
  }

  protected solveCurrentStage(): void {}

  protected verifySolved(): boolean {
    return true;
  }

  protected onAllStagesCleared(): void {
    this.finishSuccess({
      accuracy: 0.96,
      proofFragmentSuffix: 'demo',
      dossierSnippet: 'Demo calibrated.',
      telemetrySummary: 'Demo ok',
      physicalPrinciple: 'Demo optical invariance principle.',
    });
  }

  getFieldGuide(): InstrumentFieldGuide {
    return {
      title: this.title,
      physicalPrinciple: 'Demo optical invariance principle.',
      goalSummary: 'Verify shared core lifecycle.',
      controlsDesktop: 'Drag',
      controlsTouch: 'Touch',
      warmthEffect: 'Warm vs Cold',
    };
  }
}

describe('Phase 2B shared minigame core & render pipeline', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    installJsdomCanvasAndObservers();
    clearBackdropCaches();
  });

  it('runs BaseCosmicMinigame lifecycle, deterministic variant seeding, pointercancel, and SolvabilityHarness', () => {
    const mountEl = document.createElement('div');
    document.body.appendChild(mountEl);

    const audio = createMockAudioEngine();
    const showcase = createMockShowcaseScene();
    const hudSpy = vi.fn();
    let result: MinigameResult | null = null;

    const g0 = new DemoCosmicMinigame();
    g0.mount({
      container: mountEl,
      targetId: 'cluster_j1419_a',
      targetName: 'CLUSTER J1419-A',
      minigameId: 'demo_cosmic',
      state: {
        humanity: 75,
        maxHumanity: 90,
        opticalFidelity: 0.65,
        chaosDrift: 18,
        wavelengthNm: 560,
        primarySiblingH: 70,
        overseerSuspicion: 0,
        shift: 1,
        prunedPersonas: 0,
      },
      bandIdx: 1,
      iterationIndex: 0,
      showcase: showcase._bridge,
      audio: audio._instrumentHandle,
      onTelemetry: hudSpy,
      onComplete: (r) => {
        result = r;
      },
    });

    const v0SeedVal = g0.stageValue;
    expect(hudSpy).toHaveBeenCalledTimes(1);
    expect(g0.getSolvabilityHarness().getDiagnostics()).toMatchObject({
      stage: 1,
      completed: false,
      variantIndex: 0,
      variantId: 'demo_v1',
      stageCount: 3,
    });

    // pointercancel routes cleanly without throwing
    window.dispatchEvent(new Event('pointercancel'));
    expect(g0.cancelledCount).toBe(1);

    // Solve all 3 stages cleanly
    const harness = g0.getSolvabilityHarness();
    harness.solveStage(1);
    harness.solveStage(2);
    harness.solveStage(3);
    expect(harness.getDiagnostics().completed).toBe(true);
    expect(result?.success).toBe(true);
    g0.destroy();

    // Variant 1 produces a distinct deterministic stage layout
    const g1 = new DemoCosmicMinigame();
    g1.mount({
      container: mountEl,
      targetId: 'cluster_j1419_a',
      targetName: 'CLUSTER J1419-A',
      minigameId: 'demo_cosmic',
      state: {
        humanity: 30,
        maxHumanity: 50,
        opticalFidelity: 0.9,
        chaosDrift: 20,
        wavelengthNm: 260,
        primarySiblingH: 40,
        overseerSuspicion: 1,
        shift: 1,
        prunedPersonas: 1,
      },
      bandIdx: 0,
      iterationIndex: 1,
      showcase: showcase._bridge,
      audio: audio._instrumentHandle,
      onComplete: () => {},
    });
    expect(g1.stageValue).not.toBe(v0SeedVal);
    expect(g1.getSolvabilityHarness().getDiagnostics().variantId).toBe('demo_v2');
    g1.destroy();
  });

  it('quantizes spectral classes, evaluates H% micro-scintillation, and draws PSF/celestial sprites safely', () => {
    expect(quantizeHexToSpectralClass('#9bb8ff')).toBe('O');
    expect(quantizeHexToSpectralClass('#8be9c0')).toBe('LOCK');
    expect(quantizeHexToSpectralClass('#ff7a6b')).toBe('ALERT');
    expect(quantizeHexToSpectralClass('#ffe6bd')).toBe('G');

    const warmVal = evalMicroScintillation(1.2, 0.5, 'warm');
    const coldVal = evalMicroScintillation(1.2, 0.5, 'cold');
    expect(warmVal).toBeGreaterThan(0.89);
    expect(warmVal).toBeLessThanOrEqual(1.01);
    expect(coldVal).toBeGreaterThan(0.96);

    const canvas = document.createElement('canvas');
    const c2d = canvas.getContext('2d')!;
    const stars = generateDepthStarfield(createSeededRng('psf-test'), 48);
    expect(stars.length).toBe(48);

    expect(() => {
      drawOpticalStar(c2d, 100, 100, 8, { spectralClass: 'G', spikes: 6, vibeMode: 'warm', timeSec: 2 });
      drawLimbDarkenedStar(c2d, 200, 150, 28, 'G', 1);
      drawCrescentPlanet(c2d, 260, 150, 14, 0.4);
      drawSoftDustPuff(c2d, 300, 180, 48, '#26160e', 0.8);
      drawAmbientStarfield3Depth(c2d, 800, 450, stars, 3.1, { vibeMode: 'cold', parallaxX: 0.3, parallaxY: -0.2 });
    }).not.toThrow();
  });

  it('enforces bounded zero-GC ParticlePool capacity and renders all 4 cosmic particle types cleanly', () => {
    const pool = new ParticlePool(32);
    pool.configureVibe('warm', 1419);
    pool.seedAmbientMotes(800, 450);
    pool.emitPhotonSparks(400, 225, 4);
    pool.emitLockCausticRing(400, 225, 24);
    pool.emitSpectralShimmer(400, 225, 0.7, 3);
    expect(pool.getActiveCount()).toBeLessThanOrEqual(32);

    const canvas = document.createElement('canvas');
    const c2d = canvas.getContext('2d')!;
    expect(() => {
      pool.update(0.016, 800, 450);
      pool.render(c2d, { parallaxX: 0.2, parallaxY: -0.1, reticleDuck: { cx: 400, cy: 225, r: 90 } });
    }).not.toThrow();
  });

  it('draws cached backdrops, optical glow strokes, inclined rings, and zero-alloc verniers without errors', () => {
    const canvas = document.createElement('canvas');
    const c2d = canvas.getContext('2d')!;

    expect(() => {
      drawCachedCosmicBackdrop(c2d, 1280, 720, {
        plateId: 'pillars',
        blurPx: 6,
        alpha: 0.5,
        gridAlpha: 0.1,
        vignetteAlpha: 0.72,
        compositeOver3D: true,
      });
      drawGlowStroke(c2d, (ctx) => {
        ctx.moveTo(10, 10);
        ctx.lineTo(100, 80);
      }, '#ffb86c', 2.4);
      drawInclinedAstrometryRing(c2d, 640, 360, 180, 62, 0.22, '255, 184, 108');
      drawLockResonanceRing(c2d, 640, 360, 48, 0.75, '#8be9c0', '75%');
      drawStageUnlockPulse(c2d, 1280, 720, 0.8, 'STAGE 1 LOCKED', '#8be9c0');
    }).not.toThrow();

    const stats = getBackdropCacheStats();
    expect(stats.vignettes).toBeGreaterThanOrEqual(1);
    expect(stats.grids).toBeGreaterThanOrEqual(1);

    const strips: VernierStripSpec[] = [];
    layoutVernierRowInto(strips, 1280, 720, [
      { key: 'a', label: 'DELAY A', val01: 0.4 },
      { key: 'b', label: 'DELAY B', val01: 0.8, locked: true },
    ]);
    const firstObj = strips[0];
    layoutVernierRowInto(strips, 1280, 720, [
      { key: 'a', label: 'DELAY A', val01: 0.65 },
      { key: 'b', label: 'DELAY B', val01: 0.8, locked: true },
    ]);
    // Same object reused in place (zero per-frame allocation)
    expect(strips[0]).toBe(firstObj);
    expect(hitVernierStrip(strips[0], strips[0].x + 10, strips[0].y + 4)).toBe(true);
    drawVernierStrip(c2d, strips[0], '#ffb86c');

    // Vertical mobile rack helper
    const vStrips: VernierStripSpec[] = [];
    layoutVerticalVernierRackInto(vStrips, 844, 390, [{ key: 'iris', label: 'IRIS', val01: 0.5 }], 'right');
    expect(vStrips[0].vertical).toBe(true);
    expect(valueFromStripPos(vStrips[0], vStrips[0].x, vStrips[0].y)).toBeCloseTo(1, 2);
    expect(valueFromStripPos(vStrips[0], vStrips[0].x, vStrips[0].y + vStrips[0].h)).toBeCloseTo(0, 2);
    drawVernierStrip(c2d, vStrips[0], '#9ee8ff');
  });
});
