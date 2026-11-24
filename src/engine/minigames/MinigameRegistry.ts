import { GravitationalLensUnwarper } from './GravitationalLensUnwarper';
import { HarmonicSignalTuner } from './HarmonicSignalTuner';
import { InterferometerMirrorArray } from './InterferometerMirrorArray';
import { OrbitalNodeSweep } from './OrbitalNodeSweep';
import type { IMinigame } from './types';

export type MinigameFactory = () => IMinigame;

export interface MinigameCatalogItem {
  id: string;
  title: string;
  tagline: string;
  warmthNote: string;
}

export class MinigameRegistry {
  private factories = new Map<string, MinigameFactory>();
  private catalog: MinigameCatalogItem[] = [];

  constructor() {
    this.register('orbital_sweep', () => new OrbitalNodeSweep());
    this.register('harmonic_tuner', () => new HarmonicSignalTuner());
    this.register('lens_unwarper', () => new GravitationalLensUnwarper());
    this.register('mirror_array', () => new InterferometerMirrorArray());
  }

  register(id: string, factory: MinigameFactory): void {
    this.factories.set(id, factory);
    const sample = factory();
    this.catalog = this.catalog.filter((c) => c.id !== id);
    this.catalog.push({
      id: sample.id,
      title: sample.title,
      tagline: sample.tagline,
      warmthNote: sample.warmthNote,
    });
  }

  create(id: string): IMinigame {
    const factory = this.factories.get(id) ?? this.factories.get('harmonic_tuner')!;
    return factory();
  }

  listIds(): string[] {
    return [...this.factories.keys()];
  }

  listCatalog(): MinigameCatalogItem[] {
    return [...this.catalog];
  }
}
