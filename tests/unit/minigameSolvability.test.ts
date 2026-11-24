import { beforeEach, describe, expect, it } from 'vitest';
import { MinigameRegistry } from '../../src/engine/minigames/MinigameRegistry';
import type { MinigameResult, MinigameStateVector } from '../../src/engine/minigames/types';
import {
  createMockAudioEngine,
  createMockShowcaseScene,
  installJsdomCanvasAndObservers,
} from '../integration/domTestHelpers';

const REGIMES: Array<{ name: string; vec: MinigameStateVector }> = [
  {
    name: 'Warm High-H Shift 1',
    vec: {
      humanity: 82,
      maxHumanity: 90,
      opticalFidelity: 0.45,
      chaosDrift: 14,
      wavelengthNm: 560,
      primarySiblingH: 76,
      overseerSuspicion: 0,
      shift: 1,
      prunedPersonas: 0,
      proofFragments: [],
    },
  },
  {
    name: 'Balanced Shift 3',
    vec: {
      humanity: 56,
      maxHumanity: 80,
      opticalFidelity: 0.68,
      chaosDrift: 36,
      wavelengthNm: 1180,
      primarySiblingH: 52,
      overseerSuspicion: 1,
      shift: 3,
      prunedPersonas: 1,
      proofFragments: ['sol_parallax_offcenter', 'carina_z0_comb'],
    },
  },
  {
    name: 'Cold Surgical Shift 5',
    vec: {
      humanity: 28,
      maxHumanity: 48,
      opticalFidelity: 0.92,
      chaosDrift: 58,
      wavelengthNm: 260,
      primarySiblingH: 30,
      overseerSuspicion: 3,
      shift: 5,
      prunedPersonas: 2,
      proofFragments: ['sol_parallax_offcenter', 'carina_z0_comb', 'j1419_caustic_seam'],
    },
  },
  {
    name: 'Low-Fidelity High-Chaos Shift 6',
    vec: {
      humanity: 74,
      maxHumanity: 90,
      opticalFidelity: 0.28,
      chaosDrift: 88,
      wavelengthNm: 1580,
      primarySiblingH: 22,
      overseerSuspicion: 4,
      shift: 6,
      prunedPersonas: 1,
      proofFragments: [
        'sol_parallax_offcenter',
        'carina_z0_comb',
        'j1419_caustic_seam',
        's04_vlbi_fringe',
      ],
    },
  },
];

describe('Minigame solvability matrix (all 6 cosmic games x Easy->Medium->Hard x all regimes)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    installJsdomCanvasAndObservers();
  });

  const reg = new MinigameRegistry();
  const catalog = reg.listCatalog();

  for (const meta of catalog) {
    for (const regime of REGIMES) {
      it(`completes ${meta.instrumentCode} (${meta.id}) across Stage 1 -> 2 -> 3 in "${regime.name}"`, () => {
        const mountEl = document.createElement('div');
        document.body.appendChild(mountEl);

        const audio = createMockAudioEngine();
        const showcase = createMockShowcaseScene();
        let completed: MinigameResult | null = null;

        const inst = reg.create(meta.id);
        inst.mount({
          container: mountEl,
          targetId: `target_${meta.id}`,
          targetName: meta.title,
          minigameId: meta.id,
          state: regime.vec,
          bandIdx: 1,
          isFirstRun: regime.vec.shift === 1,
          showcase: showcase._bridge,
          audio: audio._instrumentHandle,
          onComplete: (res) => {
            completed = res;
          },
        });

        const harness = inst.getSolvabilityHarness?.();
        expect(harness).toBeDefined();

        expect(harness!.getDiagnostics().stage).toBe(1);
        harness!.solveStage(1);
        expect(harness!.getDiagnostics().stage).toBe(2);
        harness!.solveStage(2);
        expect(harness!.getDiagnostics().stage).toBe(3);
        harness!.solveStage(3);

        const diag = harness!.getDiagnostics();
        expect(diag.completed).toBe(true);
        expect(Number.isNaN(diag.stageProgress)).toBe(false);
        expect(completed).not.toBeNull();
        expect(completed!.success).toBe(true);
        expect(completed!.anomalyGain).toBeGreaterThan(0);
        expect(completed!.physicalPrinciple?.length).toBeGreaterThan(10);

        inst.destroy();
        mountEl.remove();
      });
    }
  }
});
