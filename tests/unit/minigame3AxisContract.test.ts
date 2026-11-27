import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseCosmicMinigame } from '../../src/engine/minigames/core/BaseCosmicMinigame';
import { MinigameRegistry } from '../../src/engine/minigames/MinigameRegistry';
import type {
  CognitiveInstrumentProfile,
  MinigameResult,
  MinigameStateVector,
} from '../../src/engine/minigames/types';
import {
  createMockAudioEngine,
  createMockShowcaseScene,
  installJsdomCanvasAndObservers,
} from '../integration/domTestHelpers';

interface InspectableMinigame {
  profile: CognitiveInstrumentProfile;
  stage: 1 | 2 | 3;
  maxStages: 2 | 3;
  elapsedSec: number;
}

const WARM_SHIFT1_LOW_CLARITY: MinigameStateVector = {
  humanity: 82,
  opticalFidelity: 0.4,
  chaosDrift: 12,
  shift: 1,
};

const COLD_SHIFT5_HIGH_CLARITY: MinigameStateVector = {
  humanity: 28,
  opticalFidelity: 0.92,
  chaosDrift: 68,
  shift: 5,
};

describe('Minigame Lean 3-Axis contract across all 21 cosmic instruments', () => {
  const reg = new MinigameRegistry();
  const catalog = reg.listCatalog();

  beforeEach(() => {
    document.body.innerHTML = '';
    installJsdomCanvasAndObservers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  for (const meta of catalog) {
    it(`${meta.instrumentCode} (${meta.id}) extends BaseCosmicMinigame and updates all 3 axes live without resetting Stage`, async () => {
      const mountEl = document.createElement('div');
      document.body.appendChild(mountEl);

      const inst = await reg.createAsync(meta.id);
      expect(inst).toBeInstanceOf(BaseCosmicMinigame);

      inst.mount({
        container: mountEl,
        targetId: `target_${meta.id}`,
        targetName: meta.title,
        minigameId: meta.id,
        state: WARM_SHIFT1_LOW_CLARITY,
        iterationIndex: 0,
        showcase: createMockShowcaseScene()._bridge,
        audio: createMockAudioEngine()._instrumentHandle,
        onComplete: () => {},
      });

      const priv = inst as unknown as InspectableMinigame;
      const before = { ...priv.profile };
      expect(priv.stage).toBe(1);
      expect(before.vibe).toBe('warm');

      inst.updateState?.(COLD_SHIFT5_HIGH_CLARITY);

      const after = priv.profile;
      expect(priv.stage).toBe(1);
      expect(after.vibe).toBe('cold');
      expect(after.warmth01).toBeLessThan(before.warmth01);
      expect(after.clarity01).toBeGreaterThan(before.clarity01);
      expect(after.drift01).toBeGreaterThan(before.drift01);

      inst.destroy();
    });
  }

  it('runs 2 stages for baseline targets and 3 stages for boundary_bleed / direct_anomaly targets, and pauses cleanly', async () => {
    const mountEl = document.createElement('div');
    document.body.appendChild(mountEl);

    // 1. Baseline target completes cleanly after Stage 2
    let baselineRes: MinigameResult | null = null;
    const baseInst = await reg.createAsync('constellation_recall');
    baseInst.mount({
      container: mountEl,
      targetId: 'sol_centauri_bearing',
      targetName: 'SOL–CENTAURI BEARING',
      minigameId: 'constellation_recall',
      state: { ...WARM_SHIFT1_LOW_CLARITY, anomalyRole: 'baseline', anomalyBleed: 0 },
      iterationIndex: 0,
      showcase: createMockShowcaseScene()._bridge,
      audio: createMockAudioEngine()._instrumentHandle,
      onComplete: (res) => {
        baselineRes = res;
      },
    });
    expect((baseInst as unknown as InspectableMinigame).maxStages).toBe(2);
    const harnessBase = baseInst.getSolvabilityHarness!();
    harnessBase.solveStage(1);
    expect(baselineRes).toBeNull();
    harnessBase.solveStage(2);
    expect(baselineRes).not.toBeNull();
    expect(baselineRes!.grade).toBe('clean');
    baseInst.destroy();

    // 2. Anomaly target runs 3 stages and resolves clean without Stage-3 Overclock
    let anomRes: MinigameResult | null = null;
    const instAnom = await reg.createAsync('lens_focus');
    instAnom.mount({
      container: mountEl,
      targetId: 'cluster_j1419_a',
      targetName: 'CLUSTER J1419-A',
      minigameId: 'lens_focus',
      state: { ...COLD_SHIFT5_HIGH_CLARITY, anomalyRole: 'direct_anomaly', anomalyBleed: 0.48 },
      iterationIndex: 0,
      showcase: createMockShowcaseScene()._bridge,
      audio: createMockAudioEngine()._instrumentHandle,
      onComplete: (res) => {
        anomRes = res;
      },
    });
    expect((instAnom as unknown as InspectableMinigame).maxStages).toBe(3);
    const harnessAnom = instAnom.getSolvabilityHarness!();
    harnessAnom.solveStage(1);
    harnessAnom.solveStage(2);
    expect(anomRes).toBeNull();
    harnessAnom.solveStage(3);
    expect(anomRes).not.toBeNull();
    expect(anomRes!.grade).toBe('clean');
    expect(anomRes!.anomalyGain).toBeGreaterThan(0);
    instAnom.destroy();
  });

  it('pauses elapsedSec during briefingHold and resumes cleanly on setBriefingHold(false)', async () => {
    vi.useFakeTimers();
    const mountEl = document.createElement('div');
    document.body.appendChild(mountEl);

    const inst = await reg.createAsync('constellation_recall');
    inst.mount({
      container: mountEl,
      targetId: 'sol_centauri_bearing',
      targetName: 'SOL–CENTAURI BEARING',
      minigameId: 'constellation_recall',
      state: WARM_SHIFT1_LOW_CLARITY,
      iterationIndex: 3,
      briefingHoldMs: 5000,
      showcase: createMockShowcaseScene()._bridge,
      audio: createMockAudioEngine()._instrumentHandle,
      onComplete: () => {},
    });

    const priv = inst as unknown as InspectableMinigame;
    await vi.advanceTimersByTimeAsync(120);
    expect(priv.elapsedSec).toBe(0);

    // Input events are ignored cleanly during briefingHold until handover
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
    const canvas = mountEl.querySelector('canvas');
    canvas?.dispatchEvent(new Event('pointerdown'));
    expect(priv.elapsedSec).toBe(0);

    inst.setBriefingHold?.(false);
    await vi.advanceTimersByTimeAsync(120);
    expect(priv.elapsedSec).toBeGreaterThan(0);

    inst.destroy();
  });

  it('every *Game.ts invokes shared drawBackdropAndAmbient() so all 3 axes affect rendered optics', () => {
    const gamesDir = path.resolve(process.cwd(), 'src/engine/minigames/games');
    const gameFiles = fs.readdirSync(gamesDir).filter((f) => f.endsWith('Game.ts')).sort();
    expect(gameFiles.length).toBe(21);

    for (const file of gameFiles) {
      const src = fs.readFileSync(path.join(gamesDir, file), 'utf8');
      expect(src, `${file} must extend BaseCosmicMinigame`).toContain('extends BaseCosmicMinigame');
      expect(src, `${file} must invoke drawBackdropAndAmbient()`).toContain('drawBackdropAndAmbient(');
    }
  });
});
