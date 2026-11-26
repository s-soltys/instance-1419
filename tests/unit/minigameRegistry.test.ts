import { describe, expect, it } from 'vitest';
import anomaliesData from '../../src/content/anomalies.json';
import { MinigameRegistry } from '../../src/engine/minigames/MinigameRegistry';

describe('MinigameRegistry catalog integrity', () => {
  it('registers all 21 Easy-to-Hard cosmic instruments with complete metadata, 4 curated variants, & field guides', async () => {
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
      'coronagraph_mask',
      'polarization_filter',
      'exposure_stacker',
      'binary_mass_scale',
      'cepheid_ladder',
      'supernova_echoes',
      'horizon_seam_stitcher',
      'michelson_fringe',
      'multiband_loupe',
      'einstein_cross',
      'parallax_depth',
    ]);

    for (const meta of catalog) {
      expect(meta.instrumentCode.length).toBeGreaterThanOrEqual(5);
      expect(meta.title.length).toBeGreaterThan(3);
      expect(meta.warmthNote.length).toBeGreaterThan(20);
      expect(meta.platePool.length).toBe(3);
      expect(new Set(meta.platePool).size).toBe(3);
      expect(meta.variants.length).toBe(4);
      expect(meta.backdrop3D).toBeDefined();
      expect(reg.getEntry(meta.id)).toEqual(meta);
      const instance = await reg.createAsync(meta.id);
      expect(instance.id).toBe(meta.id);
      expect(instance.instrumentCode).toBe(meta.instrumentCode);
      expect(instance.variants?.length).toBe(4);
      for (let v = 0; v < 4; v++) {
        expect(instance.variants?.[v].id).toBe(meta.variants[v].id);
        expect(instance.variants?.[v].label).toBe(meta.variants[v].label);
        expect(instance.variants?.[v].plateId).toBe(meta.variants[v].plateId);
      }
      expect(instance.getFieldGuide?.().physicalPrinciple.length).toBeGreaterThan(20);
      expect(instance.getSolvabilityHarness).toBeDefined();
    }
  });

  it('resolves every anomaly target minigameId across all 21 instruments without falling back', async () => {
    const reg = new MinigameRegistry();
    expect(anomaliesData.anomalies.length).toBe(21);
    const mappedIds = new Set<string>();
    for (const anomaly of anomaliesData.anomalies) {
      const inst = await reg.createAsync(anomaly.minigameId);
      expect(inst.id).toBe(anomaly.minigameId);
      mappedIds.add(inst.id);
    }
    expect(mappedIds.size).toBe(21);
  });
});
