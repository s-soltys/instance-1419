import { ChromaticDispersionGame } from './ChromaticDispersionGame';
import { ConstellationRecallGame } from './ConstellationRecallGame';
import { ExoplanetTransitGame } from './ExoplanetTransitGame';
import { GravitySlingshotGame } from './GravitySlingshotGame';
import { PulsarEchoGame } from './PulsarEchoGame';
import { RadioTriangulationGame } from './RadioTriangulationGame';
import { SpectralPrismMixerGame } from './SpectralPrismMixerGame';
import { StarfieldBlinkSpotterGame } from './StarfieldBlinkSpotterGame';
import { TelescopeLensFocusGame } from './TelescopeLensFocusGame';
import type { IMinigame } from './types';
import { WaveShaperGame } from './WaveShaperGame';

export interface MinigameCatalogEntry {
  id: string;
  instrumentCode: string;
  title: string;
  subtitle: string;
  physicalPrinciple: string;
  warmthNote: string;
}

export const MINIGAME_CATALOG: Record<string, MinigameCatalogEntry> = {
  wave_shaper: {
    id: 'wave_shaper',
    instrumentCode: 'WAV-01',
    title: 'Carina Wave Tuner',
    subtitle: 'Harmonic Waveform Shaping',
    physicalPrinciple: 'Fourier superposition & phase resonance across traveling emission waves.',
    warmthNote: 'Warm H%: golden lock margin · Cold H%: surgical emission tuning.',
  },
  constellation_recall: {
    id: 'constellation_recall',
    instrumentCode: 'CON-02',
    title: 'Stellar Constellation',
    subtitle: 'Parallax Spatial Memory',
    physicalPrinciple: 'Astrometric parallax baselines against distant reference stars.',
    warmthNote: 'Warm H%: luminous gold starlight · Cold H%: crystalline astrometry grid.',
  },
  pulsar_echo: {
    id: 'pulsar_echo',
    instrumentCode: 'PLS-03',
    title: 'Pulsar Beacon Timing',
    subtitle: 'Rotational Sweep & Jet Sync',
    physicalPrinciple: 'Magnetized neutron star lighthouse rotation, glitches, and relativistic jets.',
    warmthNote: 'Warm H%: generous catch arc · Cold H%: razor pulsar phase sync.',
  },
  lens_focus: {
    id: 'lens_focus',
    instrumentCode: 'LNS-04',
    title: 'Gravitational Lens Focus',
    subtitle: 'Concentric Caustic De-Warping',
    physicalPrinciple: 'Gravitational lensing caustic continuity and focal depth on SMACS 0723.',
    warmthNote: 'Warm H%: forgiving bezel snaps · Cold H%: crisp aperture calibration.',
  },
  light_dispersion: {
    id: 'light_dispersion',
    instrumentCode: 'DSP-05',
    title: 'Chromatic Light Disperser',
    subtitle: 'Wavelength Refraction & Dust Penetration',
    physicalPrinciple: 'Multi-wavelength prism dispersion & IR dust penetration.',
    warmthNote: 'Warm H%: broad spectral beam pockets · Cold H%: surgical refraction optics.',
  },
  blink_spotter: {
    id: 'blink_spotter',
    instrumentCode: 'BLK-06',
    title: 'Star Trajectory Predictor',
    subtitle: 'Proper-Motion & Gravity Extrapolation',
    physicalPrinciple: 'Epochal astrometry predicting linear, accelerating, and gravitationally bent paths.',
    warmthNote: 'Warm H%: generous Epoch 4 prediction ring · Cold H%: surgical extrapolation.',
  },
  gravity_slingshot: {
    id: 'gravity_slingshot',
    instrumentCode: 'ORB-07',
    title: 'Gravity Slingshot',
    subtitle: 'Orbital Trajectory Bending',
    physicalPrinciple: 'Gravitational assist orbital mechanics around stellar wells.',
    warmthNote: 'Warm H%: golden orbital contours · Cold H%: stark ballistic trajectory grid.',
  },
  exoplanet_transit: {
    id: 'exoplanet_transit',
    instrumentCode: 'TRN-08',
    title: 'Exoplanet Transit Lab',
    subtitle: 'Photometric Orbit Matching',
    physicalPrinciple: 'Exoplanet transit photometry & multi-planet orbital periodicities.',
    warmthNote: 'Warm H%: luminous solar halo · Cold H%: sharp photometric dip trace.',
  },
  spectral_prism: {
    id: 'spectral_prism',
    instrumentCode: 'PRM-09',
    title: 'Spectral Prism Mixer',
    subtitle: 'Chemical Elements & Redshift',
    physicalPrinciple: 'Atomic emission barcodes & cosmological Doppler redshift.',
    warmthNote: 'Warm H%: broad prism tolerance · Cold H%: precision z-shift vernier.',
  },
  radio_triangulation: {
    id: 'radio_triangulation',
    instrumentCode: 'TRI-10',
    title: 'Radio Dish Array',
    subtitle: 'Interferometric Triangulation',
    physicalPrinciple: 'Very Long Baseline Interferometry (VLBI) directional beam convergence.',
    warmthNote: 'Warm H%: broader amber beam cones · Cold H%: razor VLBI baselines.',
  },
};

const REGISTRY: Record<string, () => IMinigame> = {
  wave_shaper: () => new WaveShaperGame(),
  constellation_recall: () => new ConstellationRecallGame(),
  pulsar_echo: () => new PulsarEchoGame(),
  lens_focus: () => new TelescopeLensFocusGame(),
  light_dispersion: () => new ChromaticDispersionGame(),
  blink_spotter: () => new StarfieldBlinkSpotterGame(),
  gravity_slingshot: () => new GravitySlingshotGame(),
  exoplanet_transit: () => new ExoplanetTransitGame(),
  spectral_prism: () => new SpectralPrismMixerGame(),
  radio_triangulation: () => new RadioTriangulationGame(),
};

export class MinigameRegistry {
  create(id: string): IMinigame {
    const factory = REGISTRY[id] ?? REGISTRY.wave_shaper;
    return factory();
  }

  listIds(): string[] {
    return Object.keys(REGISTRY);
  }

  listCatalog(): MinigameCatalogEntry[] {
    return Object.values(MINIGAME_CATALOG);
  }
}
