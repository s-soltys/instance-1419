import { describe, expect, it } from 'vitest';
import anomaliesData from '../../src/content/anomalies.json';
import { MinigameRegistry } from '../../src/engine/minigames/MinigameRegistry';

describe('MinigameRegistry catalog integrity', () => {
  it('registers all 5 tactile instruments with complete metadata', () => {
    const reg = new MinigameRegistry();
    const catalog = reg.listCatalog();
    const ids = catalog.map((m) => m.id);

    expect(ids).toEqual([
      'parallax_array',
      'fourier_sieve',
      'caustic_unwarper',
      'phase_matrix',
      'blink_comparator',
    ]);

    for (const meta of catalog) {
      expect(meta.instrumentCode.length).toBeGreaterThanOrEqual(5);
      expect(meta.title.length).toBeGreaterThan(3);
      expect(meta.warmthNote.length).toBeGreaterThan(20);
      const instance = reg.create(meta.id);
      expect(instance.id).toBe(meta.id);
      expect(instance.instrumentCode).toBe(meta.instrumentCode);
    }
  });

  it('resolves every anomaly target minigameId without falling back', () => {
    const reg = new MinigameRegistry();
    for (const anomaly of anomaliesData.anomalies) {
      const inst = reg.create(anomaly.minigameId);
      expect(inst.id).toBe(anomaly.minigameId);
    }
  });
});
