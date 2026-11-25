import { describe, expect, it } from 'vitest';
import {
  computeHybridHMix,
  MUSIC_CATALOG,
  resolveMusicCueId,
  type MusicContext,
} from '../../src/engine/audio/MusicDirector';
import { MinigameRegistry } from '../../src/engine/minigames/MinigameRegistry';

function baseCtx(overrides: Partial<MusicContext> = {}): MusicContext {
  return {
    mode: 'waking_3d',
    humanity: 72,
    overseerAuditActive: false,
    overseerSuspicion: 0,
    chaosDrift: 12,
    shift: 1,
    activeMinigameId: null,
    activePersonaId: 'phantom_spouse',
    prunedPersonas: [],
    ...overrides,
  };
}

describe('MusicDirector catalog integrity & Hybrid H% routing', () => {
  it('maps every registered minigame (all 21) to a valid catalog cue and beatless cold stem', () => {
    const registry = new MinigameRegistry();
    const ids = registry.listIds();
    expect(ids.length).toBe(21);

    for (const mgId of ids) {
      const cueId = resolveMusicCueId(baseCtx({ mode: 'waking_3d', activeMinigameId: mgId }));
      expect(cueId, `Missing cue mapping for minigame ${mgId}`).toBeTruthy();
      const cue = MUSIC_CATALOG.cues[cueId!];
      expect(cue, `Cue ${cueId} missing from catalog`).toBeDefined();
      expect(cue.category).toBe('minigame');
      expect(MUSIC_CATALOG.coldStems[cue.coldStem], `Cold stem ${cue.coldStem} missing`).toBeDefined();
    }
  });

  it('keeps open 3D waking sky and boot on the procedural observatory bed', () => {
    expect(resolveMusicCueId(baseCtx({ mode: 'boot' }))).toBeNull();
    expect(resolveMusicCueId(baseCtx({ mode: 'waking_3d', activeMinigameId: null }))).toBeNull();
  });

  it('routes Dream personas and Shift 6 Epilogue cleanly', () => {
    expect(resolveMusicCueId(baseCtx({ mode: 'dream_2d', activePersonaId: 'phantom_spouse' }))).toBe(
      'dream_wurlitzer_rain'
    );
    expect(resolveMusicCueId(baseCtx({ mode: 'dream_2d', activePersonaId: 'pet' }))).toBe(
      'dream_nylon_sunbeam'
    );
    expect(resolveMusicCueId(baseCtx({ mode: 'dream_2d', activePersonaId: 'parent' }))).toBe(
      'dream_harmonium_breath'
    );
    expect(resolveMusicCueId(baseCtx({ mode: 'dream_2d', activePersonaId: 'wronged_person' }))).toBe(
      'dream_rhodes_cello'
    );
    expect(resolveMusicCueId(baseCtx({ mode: 'dream_2d', activePersonaId: 'old_teacher' }))).toBe(
      'dream_vibraphone_nocturne'
    );
    expect(resolveMusicCueId(baseCtx({ mode: 'dream_2d', shift: 6 }))).toBe('dream_epilogue_dawn');
  });

  it('escalates Overseer Audit cues across baseline, elevated suspicion/chaos, and high-stakes ultimatum', () => {
    expect(
      resolveMusicCueId(
        baseCtx({ mode: 'dream_2d', overseerAuditActive: true, overseerSuspicion: 0, chaosDrift: 18, shift: 1 })
      )
    ).toBe('overseer_glass_corridor');

    expect(
      resolveMusicCueId(
        baseCtx({ mode: 'dream_2d', overseerAuditActive: true, overseerSuspicion: 2, chaosDrift: 20, shift: 2 })
      )
    ).toBe('overseer_drift_lattice');

    expect(
      resolveMusicCueId(
        baseCtx({ mode: 'dream_2d', overseerAuditActive: true, overseerSuspicion: 0, chaosDrift: 40, shift: 2 })
      )
    ).toBe('overseer_drift_lattice');

    expect(
      resolveMusicCueId(
        baseCtx({ mode: 'dream_2d', overseerAuditActive: true, overseerSuspicion: 3, shift: 3 })
      )
    ).toBe('overseer_cello_ultimatum');

    expect(
      resolveMusicCueId(
        baseCtx({
          mode: 'dream_2d',
          overseerAuditActive: true,
          shift: 1,
          activePersonaId: 'phantom_spouse',
          prunedPersonas: ['phantom_spouse'],
        })
      )
    ).toBe('overseer_cello_ultimatum');
  });

  it('morphs Hybrid H% mix monotonically from warm acoustic clarity to icy frost dominance', () => {
    const warm = computeHybridHMix(80, false);
    const mid = computeHybridHMix(50, false);
    const cold = computeHybridHMix(22, false);
    const pruned = computeHybridHMix(68, true);

    expect(warm.mainGain).toBeGreaterThan(mid.mainGain);
    expect(mid.mainGain).toBeGreaterThan(cold.mainGain);

    expect(warm.coldGain).toBeLessThan(0.01);
    expect(mid.coldGain).toBeGreaterThan(0.15);
    expect(cold.coldGain).toBeGreaterThan(0.85);

    expect(cold.highpassHz).toBeGreaterThan(warm.highpassHz + 180);
    // Pruning the active persona immediately pushes the frost bed high even if global H% was mid-high
    expect(pruned.coldGain).toBeGreaterThan(0.65);
  });
});
