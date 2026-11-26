import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { BaseCosmicMinigame } from '../../src/engine/minigames/core/BaseCosmicMinigame';
import { MinigameRegistry } from '../../src/engine/minigames/MinigameRegistry';
import type { CognitiveInstrumentProfile, MinigameStateVector } from '../../src/engine/minigames/types';
import {
  createMockAudioEngine,
  createMockShowcaseScene,
  installJsdomCanvasAndObservers,
} from '../integration/domTestHelpers';

interface InspectableMinigame {
  profile: CognitiveInstrumentProfile;
  stage: 1 | 2 | 3;
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
