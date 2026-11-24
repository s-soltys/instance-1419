import { describe, expect, it } from 'vitest';
import anomaliesData from '../../src/content/anomalies.json';
import { MinigameRegistry } from '../../src/engine/minigames/MinigameRegistry';

describe('MinigameRegistry catalog integrity', () => {
  it('registers all 6 simplified Easy-to-Hard cosmic instruments with complete metadata & field guides', () => {
    const reg = new MinigameRegistry();
    const catalog = reg.listCatalog();
    const ids = catalog.map((m) => m.id);

    expect(ids).toEqual([
      'wave_shaper',
      'constellation_recall',
      'pulsar_echo',
      'lens_focus',
      'light_dispersion',
      'blink_spotter',
      'gravity_slingshot',
      'exoplanet_transit',
      'spectral_prism',
      'radio_triangulation',
    ]);

    for (const meta of catalog) {
      expect(meta.instrumentCode.length).toBeGreaterThanOrEqual(5);
      expect(meta.title.length).toBeGreaterThan(3);
      expect(meta.warmthNote.length).toBeGreaterThan(20);
      const instance = reg.create(meta.id);
      expect(instance.id).toBe(meta.id);
      expect(instance.instrumentCode).toBe(meta.instrumentCode);
      expect(instance.getFieldGuide?.().physicalPrinciple.length).toBeGreaterThan(20);
      expect(instance.getSolvabilityHarness).toBeDefined();
    }
  });

  it('resolves every anomaly target minigameId without falling back', () => {
    const reg = new MinigameRegistry();
    expect(anomaliesData.anomalies.length).toBe(5);
    for (const anomaly of anomaliesData.anomalies) {
      const inst = reg.create(anomaly.minigameId);
      expect(inst.id).toBe(anomaly.minigameId);
    }
  });
});
