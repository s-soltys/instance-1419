import { BinaryMassScaleGame } from './BinaryMassScaleGame';
import { CepheidLadderGame } from './CepheidLadderGame';
import { ChromaticDispersionGame } from './ChromaticDispersionGame';
import { ConstellationRecallGame } from './ConstellationRecallGame';
import { CoronagraphMaskGame } from './CoronagraphMaskGame';
import { EinsteinCrossGame } from './EinsteinCrossGame';
import { ExoplanetTransitGame } from './ExoplanetTransitGame';
import { ExposureStackerGame } from './ExposureStackerGame';
import { GravitySlingshotGame } from './GravitySlingshotGame';
import { HorizonSeamStitcherGame } from './HorizonSeamStitcherGame';
import { MichelsonFringeGame } from './MichelsonFringeGame';
import { MultiBandLoupeGame } from './MultiBandLoupeGame';
import { ParallaxDepthGame } from './ParallaxDepthGame';
import { PolarizationFilterGame } from './PolarizationFilterGame';
import { PulsarEchoGame } from './PulsarEchoGame';
import { RadioTriangulationGame } from './RadioTriangulationGame';
import { SpectralPrismMixerGame } from './SpectralPrismMixerGame';
import { StarfieldBlinkSpotterGame } from './StarfieldBlinkSpotterGame';
import { SupernovaEchoesGame } from './SupernovaEchoesGame';
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
  coronagraph_mask: {
    id: 'coronagraph_mask',
    instrumentCode: 'COR-11',
    title: 'Solar Coronagraph Mask',
    subtitle: 'Servo-Tracked Exoplanet Spot',
    physicalPrinciple: 'Coronagraphic starlight suppression via servo-tracked occulting masks & apodizer apertures.',
    warmthNote: 'Warm H%: wide servo lock capture · Cold H%: razor high-contrast occultation.',
  },
  polarization_filter: {
    id: 'polarization_filter',
    instrumentCode: 'POL-12',
    title: 'Cosmic Polarization Filter',
    subtitle: 'Crossed Polarizer Extinction',
    physicalPrinciple: 'Malus’s Law polarized glare extinction isolating faint perpendicular dust filaments.',
    warmthNote: 'Warm H%: forgiving polarizer extinction angle · Cold H%: crisp crossed-filter lock.',
  },
  exposure_stacker: {
    id: 'exposure_stacker',
    instrumentCode: 'EXP-13',
    title: 'Long-Exposure Stacker',
    subtitle: 'Variable-Iris Deep-Field Integration',
    physicalPrinciple: 'Latched shutter blades & variable-aperture stacking with sub-frame cosmic-ray rejection.',
    warmthNote: 'Warm H%: warm amber photon integration · Cold H%: strict cryo-cyan frame rejection.',
  },
  binary_mass_scale: {
    id: 'binary_mass_scale',
    instrumentCode: 'BIN-14',
    title: 'Binary Star Mass Scale',
    subtitle: 'Cosmic Barycenter Seesaw',
    physicalPrinciple: 'Unequal-mass barycentric equilibrium (m₁r₁ = m₂r₂) & Keplerian orbital cadence.',
    warmthNote: 'Warm H%: steady golden seesaw lock · Cold H%: precise Keplerian mass-ratio tuning.',
  },
  cepheid_ladder: {
    id: 'cepheid_ladder',
    instrumentCode: 'CEP-15',
    title: 'Cepheid Distance Ladder',
    subtitle: 'Heartbeat Photometer & Distance Ruler',
    physicalPrinciple: 'Leavitt’s period–luminosity sparklines & split-mirror flux matching across megaparsec rungs.',
    warmthNote: 'Warm H%: gentle golden pulsation envelope · Cold H%: strict megaparsec distance ruler.',
  },
  supernova_echoes: {
    id: 'supernova_echoes',
    instrumentCode: 'ECH-16',
    title: 'Supernova Light-Echoes',
    subtitle: 'Light-Echo Triangulation & Blast Rewind',
    physicalPrinciple: 'Spherical light-echo curvature matching across cosmic dust patches & t=0 detonation focus.',
    warmthNote: 'Warm H%: forgiving epicenter snap · Cold H%: forensic light-delay wavefront timing.',
  },
  horizon_seam_stitcher: {
    id: 'horizon_seam_stitcher',
    instrumentCode: 'SEM-17',
    title: 'Horizon Seam Stitcher',
    subtitle: 'Boundary Tile Continuity Repair',
    physicalPrinciple: 'Spherical sky-survey tile unwarping & orientation matching across the enclosure horizon.',
    warmthNote: 'Warm H%: forgiving celestial horizon lock · Cold H%: clinical enclosure seam inspection.',
  },
  michelson_fringe: {
    id: 'michelson_fringe',
    instrumentCode: 'INT-18',
    title: 'Michelson Fringe Tuner',
    subtitle: 'Optical Delay Phase Interference',
    physicalPrinciple: 'Beam-splitter path equalization producing coherent Airy interference fringes.',
    warmthNote: 'Warm H%: generous coherent delay capture · Cold H%: surgical sub-micron fringe lock.',
  },
  multiband_loupe: {
    id: 'multiband_loupe',
    instrumentCode: 'BND-19',
    title: 'Spectral Band Loupe',
    subtitle: 'X-Ray / IR / Optical Reveal',
    physicalPrinciple: 'Multi-wavelength photometry penetrating Carina dust columns to uncover hidden stellar cores.',
    warmthNote: 'Warm H%: soft multi-band dust veil · Cold H%: clinical X-ray & IR reticle clarity.',
  },
  einstein_cross: {
    id: 'einstein_cross',
    instrumentCode: 'MIR-20',
    title: 'Einstein Cross Mirage',
    subtitle: 'Time-Delayed Quasar Cadence',
    physicalPrinciple: 'Strong gravitational lensing splits quasar bursts into identical cadence copies staggered in arrival time.',
    warmthNote: 'Warm H%: golden quasar burst highlights · Cold H%: crisp gravitational time-delay markers.',
  },
  parallax_depth: {
    id: 'parallax_depth',
    instrumentCode: 'PRX-21',
    title: 'Orbital Parallax Depth',
    subtitle: 'Baseline Depth-Layer Sorting',
    physicalPrinciple: 'Orbital baseline swings reveal 3D parallax depth trails vs. rogue proper-motion stars.',
    warmthNote: 'Warm H%: luminous near/mid parallax trails · Cold H%: stark astrometric proper-motion vectors.',
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
  coronagraph_mask: () => new CoronagraphMaskGame(),
  polarization_filter: () => new PolarizationFilterGame(),
  exposure_stacker: () => new ExposureStackerGame(),
  binary_mass_scale: () => new BinaryMassScaleGame(),
  cepheid_ladder: () => new CepheidLadderGame(),
  supernova_echoes: () => new SupernovaEchoesGame(),
  horizon_seam_stitcher: () => new HorizonSeamStitcherGame(),
  michelson_fringe: () => new MichelsonFringeGame(),
  multiband_loupe: () => new MultiBandLoupeGame(),
  einstein_cross: () => new EinsteinCrossGame(),
  parallax_depth: () => new ParallaxDepthGame(),
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
