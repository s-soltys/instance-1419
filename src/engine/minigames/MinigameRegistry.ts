import { IMinigame } from './types';
import { ParallaxTriangulationArray } from './ParallaxTriangulationArray';
import { FourierSkySieve } from './FourierSkySieve';
import { CausticTumblerUnwarper } from './CausticTumblerUnwarper';
import { CorrelatorPhaseMatrix } from './CorrelatorPhaseMatrix';
import { AntipodalBlinkComparator } from './AntipodalBlinkComparator';

export interface MinigameMeta {
  id: string;
  title: string;
  subtitle: string;
  instrumentCode: string;
  warmthNote: string;
}

const WARMTH_NOTES: Record<string, string> = {
  parallax_array:
    'Warm H >= 65%: broad amber detents & intuitive stereo echoes. Cold H <= 44%: razor baseline tolerances, numeric deltas & [R] RAW residual.',
  fourier_sieve:
    'Warm H >= 65%: rich fifths harmonic lock & generous phase well. Cold H <= 44%: surgical FFT notches, exact beat Hz & [R] RAW unmasking.',
  caustic_unwarper:
    'Warm H >= 65%: magnetic shear sweet-spots & organic bloom. Cold H <= 44%: tight millimeter tumbler notches, degree readouts & [R] RAW gate.',
  phase_matrix:
    'Warm H >= 65%: clear amber harmonic hints on orthogonal trace. Cold H <= 44%: crisp cryo parity markers, chaos tag & [R] RAW daemon lock.',
  blink_comparator:
    'Warm H >= 65%: forgiving sub-pixel plate snap & warm star bloom. Cold H <= 44%: razor plate registration & [R] RAW residual capture.',
};

const REGISTRY: Record<string, () => IMinigame> = {
  parallax_array: () => new ParallaxTriangulationArray(),
  fourier_sieve: () => new FourierSkySieve(),
  caustic_unwarper: () => new CausticTumblerUnwarper(),
  phase_matrix: () => new CorrelatorPhaseMatrix(),
  blink_comparator: () => new AntipodalBlinkComparator(),
};

export function createMinigame(id: string): IMinigame {
  const factory = REGISTRY[id] ?? REGISTRY.parallax_array;
  return factory();
}

export function listMinigames(): MinigameMeta[] {
  return Object.keys(REGISTRY).map((id) => {
    const inst = REGISTRY[id]();
    return {
      id: inst.id,
      title: inst.title,
      subtitle: inst.subtitle,
      instrumentCode: inst.instrumentCode,
      warmthNote: WARMTH_NOTES[id] ?? inst.subtitle,
    };
  });
}

export class MinigameRegistry {
  create(id: string): IMinigame {
    return createMinigame(id);
  }

  listCatalog(): MinigameMeta[] {
    return listMinigames();
  }
}
