import { BinaryMassScaleGame } from './games/BinaryMassScaleGame';
import { CepheidLadderGame } from './games/CepheidLadderGame';
import { ChromaticDispersionGame } from './games/ChromaticDispersionGame';
import { ConstellationRecallGame } from './games/ConstellationRecallGame';
import { CoronagraphMaskGame } from './games/CoronagraphMaskGame';
import { EinsteinCrossGame } from './games/EinsteinCrossGame';
import { ExoplanetTransitGame } from './games/ExoplanetTransitGame';
import { ExposureStackerGame } from './games/ExposureStackerGame';
import { GravitySlingshotGame } from './games/GravitySlingshotGame';
import { HorizonSeamStitcherGame } from './games/HorizonSeamStitcherGame';
import { MichelsonFringeGame } from './games/MichelsonFringeGame';
import { MultiBandLoupeGame } from './games/MultiBandLoupeGame';
import { ParallaxDepthGame } from './games/ParallaxDepthGame';
import { PolarizationFilterGame } from './games/PolarizationFilterGame';
import { PulsarEchoGame } from './games/PulsarEchoGame';
import { RadioTriangulationGame } from './games/RadioTriangulationGame';
import { resolveMinigame3DConfig } from './render/Minigame3DBridge';
import { SpectralPrismMixerGame } from './games/SpectralPrismMixerGame';
import { StarfieldBlinkSpotterGame } from './games/StarfieldBlinkSpotterGame';
import { SupernovaEchoesGame } from './games/SupernovaEchoesGame';
import { TelescopeLensFocusGame } from './games/TelescopeLensFocusGame';
import type {
  CosmicPlateId,
  IMinigame,
  Minigame3DConfig,
  MinigameVariantSpec,
} from './types';
import { WaveShaperGame } from './games/WaveShaperGame';

export interface MinigameCatalogEntry {
  id: string;
  instrumentCode: string;
  title: string;
  subtitle: string;
  physicalPrinciple: string;
  warmthNote: string;
  platePool: readonly [CosmicPlateId, CosmicPlateId, CosmicPlateId];
  variants: readonly MinigameVariantSpec[];
  backdrop3D: Minigame3DConfig;
}

function makeVariants(
  id: string,
  plates: readonly [CosmicPlateId, CosmicPlateId, CosmicPlateId],
  labels: readonly [string, string, string, string]
): readonly MinigameVariantSpec[] {
  return [
    { index: 0, id: `${id}_v1`, label: labels[0], plateId: plates[0] },
    { index: 1, id: `${id}_v2`, label: labels[1], plateId: plates[1] },
    { index: 2, id: `${id}_v3`, label: labels[2], plateId: plates[2] },
    { index: 3, id: `${id}_v4`, label: labels[3], plateId: plates[0] },
  ];
}

function entry(
  id: string,
  instrumentCode: string,
  title: string,
  subtitle: string,
  physicalPrinciple: string,
  warmthNote: string,
  platePool: readonly [CosmicPlateId, CosmicPlateId, CosmicPlateId],
  variantLabels: readonly [string, string, string, string]
): MinigameCatalogEntry {
  return {
    id,
    instrumentCode,
    title,
    subtitle,
    physicalPrinciple,
    warmthNote,
    platePool,
    variants: makeVariants(id, platePool, variantLabels),
    backdrop3D: resolveMinigame3DConfig(id),
  };
}

export const MINIGAME_CATALOG: Record<string, MinigameCatalogEntry> = {
  wave_shaper: entry(
    'wave_shaper',
    'WAV-01',
    'Carina Wave Tuner',
    'Harmonic Waveform Shaping',
    'Fourier superposition & phase resonance across traveling emission waves.',
    'Warm H%: golden lock margin · Cold H%: surgical emission tuning.',
    ['carina', 'tarantula', 'rho_ophiuchi'],
    ['Carina H-Alpha Cliff', 'Tarantula O-III Ridge', 'Rho Ophiuchi Dust Echo', 'Deep Harmonic Cavity']
  ),
  constellation_recall: entry(
    'constellation_recall',
    'CON-02',
    'Stellar Constellation',
    'Parallax Spatial Memory',
    'Astrometric parallax baselines against distant reference stars.',
    'Warm H%: luminous gold starlight · Cold H%: crystalline astrometry grid.',
    ['smacs', 'tarantula', 'hudf'],
    ['SMACS Anchor Asterism', 'Doradus Supercluster', 'Ultra Deep Field Lattice', 'Sol-Centauri Baseline']
  ),
  pulsar_echo: entry(
    'pulsar_echo',
    'PLS-03',
    'Pulsar Beacon Timing',
    'Synchrotron Ring & Jet Sync',
    'Magnetized neutron star lighthouse rotation, glitches, and relativistic jets.',
    'Warm H%: generous catch arc · Cold H%: razor pulsar phase sync.',
    ['crab', 'cas_a', 'hudf'],
    ['Crab Synchrotron Core', 'Cas A Remnant Spin', 'Millisecond Drift', 'Glitch Recovery Sweep']
  ),
  lens_focus: entry(
    'lens_focus',
    'LNS-04',
    'Gravitational Lens Focus',
    'Concentric Caustic De-Warping',
    'Gravitational lensing caustic continuity and focal depth on SMACS 0723.',
    'Warm H%: forgiving bezel snaps · Cold H%: crisp aperture calibration.',
    ['smacs', 'stephans_quintet', 'cartwheel'],
    ['SMACS 0723 Arcs', 'Quintet Tidal Shear', 'Cartwheel Ring Caustic', 'Deep Enclosure Seam']
  ),
  light_dispersion: entry(
    'light_dispersion',
    'DSP-05',
    'Chromatic Light Disperser',
    'Wavelength Refraction & Dust Penetration',
    'Multi-wavelength prism dispersion & IR dust penetration.',
    'Warm H%: broad spectral beam pockets · Cold H%: surgical refraction optics.',
    ['pillars', 'horsehead', 'carina'],
    ['Eagle Pillar Veil', 'Horsehead Rim Refraction', 'Carina IR Window', 'Diffraction Grating Split']
  ),
  blink_spotter: entry(
    'blink_spotter',
    'BLK-06',
    'Star Trajectory Predictor',
    'Proper-Motion & Conjunction Forecast',
    'Epochal astrometry predicting linear, accelerating, and gravitationally bent paths.',
    'Warm H%: generous Epoch 4 prediction ring · Cold H%: surgical extrapolation.',
    ['hudf', 'stephans_quintet', 'smacs'],
    ['HUDF High-PM Drift', 'Quintet Tidal Deflection', 'Cluster Lensing Arc', 'Binary Proper-Motion']
  ),
  gravity_slingshot: entry(
    'gravity_slingshot',
    'ORB-07',
    'Gravity Slingshot',
    'Orbital Trajectory Bending',
    'Gravitational assist orbital mechanics around stellar wells.',
    'Warm H%: golden orbital contours · Cold H%: stark ballistic trajectory grid.',
    ['whirlpool', 'stephans_quintet', 'sombrero'],
    ['M51 Companion Assist', 'Quintet Twin Wells', 'Sombrero Halo Sweep', 'Figure-8 Periapsis']
  ),
  exoplanet_transit: entry(
    'exoplanet_transit',
    'TRN-08',
    'Exoplanet Transit Lab',
    'Keplerian Orbit & Transit Matching',
    'Exoplanet transit photometry & multi-planet orbital periodicities.',
    'Warm H%: luminous solar halo · Cold H%: sharp photometric dip trace.',
    ['sombrero', 'southern_ring', 'rho_ophiuchi'],
    ['Hot Jupiter Dip', 'Twin Resonant Worlds', 'Young Protostar Transit', 'Grazing Inclination']
  ),
  spectral_prism: entry(
    'spectral_prism',
    'PRM-09',
    'Spectral Prism Mixer',
    'Chemical Barcodes & Doppler Shift',
    'Atomic emission barcodes & cosmological Doppler redshift.',
    'Warm H%: broad prism tolerance · Cold H%: precision z-shift vernier.',
    ['ring_m57', 'cas_a', 'southern_ring'],
    ['M57 Ionized Shell', 'Cas A Oxygen-Sulfur', 'Southern Ring Halo', 'High-z Doppler Comb']
  ),
  radio_triangulation: entry(
    'radio_triangulation',
    'TRI-10',
    'Radio Dish Array',
    'Interferometric Triangulation',
    'Very Long Baseline Interferometry (VLBI) directional beam convergence.',
    'Warm H%: broader amber beam cones · Cold H%: razor VLBI baselines.',
    ['stephans_quintet', 'cartwheel', 'whirlpool'],
    ['Quintet Shock Front', 'Cartwheel Core Fix', 'M51 Spiral Maser', 'Antipodal Drift Beacon']
  ),
  coronagraph_mask: entry(
    'coronagraph_mask',
    'COR-11',
    'Solar Coronagraph Mask',
    'Servo-Tracked Exoplanet Spot',
    'Coronagraphic starlight suppression via servo-tracked occulting masks & apodizer apertures.',
    'Warm H%: wide servo lock capture · Cold H%: razor high-contrast occultation.',
    ['sombrero', 'rho_ophiuchi', 'horsehead'],
    ['Fomalhaut Debris Companion', 'Rho Oph Young Giant', 'Horsehead Edge-On Rim', 'Dual-Orbit Apodizer']
  ),
  polarization_filter: entry(
    'polarization_filter',
    'POL-12',
    'Cosmic Polarization Filter',
    'Malus Law Glare Extinction',
    'Malus’s Law polarized glare extinction isolating faint perpendicular dust filaments.',
    'Warm H%: forgiving polarizer extinction angle · Cold H%: crisp crossed-filter lock.',
    ['horsehead', 'pillars', 'carina'],
    ['Horsehead B-Field Rim', 'Eagle Pillar Alignment', 'Carina Dust Polarization', 'Tri-Vector Crossed Extinction']
  ),
  exposure_stacker: entry(
    'exposure_stacker',
    'EXP-13',
    'Long-Exposure Stacker',
    'Variable-Iris Deep-Field Integration',
    'Latched shutter blades & variable-aperture stacking with sub-frame cosmic-ray rejection.',
    'Warm H%: warm amber photon integration · Cold H%: strict cryo-cyan frame rejection.',
    ['hudf', 'smacs', 'whirlpool'],
    ['HUDF Ultra-Deep Stack', 'SMACS Cluster Exposure', 'M51 Faint Tidal Tail', 'Meteor Shower Dodger']
  ),
  binary_mass_scale: entry(
    'binary_mass_scale',
    'BIN-14',
    'Binary Star Mass Scale',
    'Cosmic Barycenter Seesaw',
    'Unequal-mass barycentric equilibrium (m₁r₁ = m₂r₂) & Keplerian orbital cadence.',
    'Warm H%: steady golden seesaw lock · Cold H%: precise Keplerian mass-ratio tuning.',
    ['southern_ring', 'whirlpool', 'sombrero'],
    ['Southern Ring Binary', 'M51a/b Tidal Pair', 'Compact Dark Companion', 'High-Ratio Red Dwarf']
  ),
  cepheid_ladder: entry(
    'cepheid_ladder',
    'CEP-15',
    'Cepheid Distance Ladder',
    'Heartbeat Photometer & Distance Ruler',
    'Leavitt’s period–luminosity sparklines & split-mirror flux matching across megaparsec rungs.',
    'Warm H%: gentle golden pulsation envelope · Cold H%: strict megaparsec distance ruler.',
    ['whirlpool', 'stephans_quintet', 'cartwheel'],
    ['Local Group Rung', 'Virgo / M51 Core', 'Dust-Veiled Starburst', 'Overtone Decoy Rung']
  ),
  supernova_echoes: entry(
    'supernova_echoes',
    'ECH-16',
    'Supernova Light-Echoes',
    'Light-Echo Triangulation & Blast Rewind',
    'Spherical light-echo curvature matching across cosmic dust patches & t=0 detonation focus.',
    'Warm H%: forgiving epicenter snap · Cold H%: forensic light-delay wavefront timing.',
    ['cas_a', 'crab', 'tarantula'],
    ['Cas A Echo Sheets', 'Crab 1054 Remnant', 'SN 1987A Tarantula', 'Asymmetric Dust Echo']
  ),
  horizon_seam_stitcher: entry(
    'horizon_seam_stitcher',
    'SEM-17',
    'Horizon Seam Stitcher',
    'Antipodal 93-BLY Sky Overlap',
    'Spherical sky-survey tile unwarping & orientation matching across the enclosure horizon.',
    'Warm H%: forgiving celestial horizon lock · Cold H%: clinical enclosure seam inspection.',
    ['hudf', 'smacs', 'ring_m57'],
    ['HUDF Mosaic Rift', 'SMACS Facet Join', 'M57 Polar Seam', '93-BLY Horizon Stitch']
  ),
  michelson_fringe: entry(
    'michelson_fringe',
    'INT-18',
    'Michelson Fringe Tuner',
    'Optical Delay Phase Interference',
    'Beam-splitter path equalization producing coherent Michelson / Haidinger interference fringes.',
    'Warm H%: generous coherent delay capture · Cold H%: surgical sub-micron fringe lock.',
    ['ring_m57', 'southern_ring', 'cartwheel'],
    ['M57 Narrowband Fringe', 'Southern Ring Delay', 'Cartwheel Wide Baseline', 'Thermal Drift Nulling']
  ),
  multiband_loupe: entry(
    'multiband_loupe',
    'BND-19',
    'Spectral Band Loupe',
    'X-Ray / IR / Optical Reveal',
    'Multi-wavelength photometry penetrating molecular dust pillars & supernova remnants to uncover hidden stellar cores.',
    'Warm H%: soft multi-band dust veil · Cold H%: clinical X-ray & IR reticle clarity.',
    ['pillars', 'crab', 'cas_a'],
    ['Pillars Protostar Hunt', 'Crab X-Ray Wind Nebula', 'Cas A Ejecta Knots', 'Multi-Band Decoy Sweep']
  ),
  einstein_cross: entry(
    'einstein_cross',
    'MIR-20',
    'Einstein Cross Mirage',
    'Time-Delayed Quasar Cadence',
    'Strong gravitational lensing splits quasar bursts into identical cadence copies staggered in arrival time.',
    'Warm H%: golden quasar burst highlights · Cold H%: crisp gravitational time-delay markers.',
    ['smacs', 'cartwheel', 'stephans_quintet'],
    ['Huchra Quad Quasar', 'Cartwheel Lensed Burst', 'Quintet Foreground Mirage', 'Staggered Delay Echo']
  ),
  parallax_depth: entry(
    'parallax_depth',
    'PRX-21',
    'Orbital Parallax Depth',
    'Baseline Depth-Layer Sorting',
    'Orbital baseline swings reveal 3D parallax depth trails vs. rogue proper-motion stars.',
    'Warm H%: luminous near/mid parallax trails · Cold H%: stark astrometric proper-motion vectors.',
    ['tarantula', 'rho_ophiuchi', 'horsehead'],
    ['Tarantula Cluster Depth', 'Rho Oph 390ly Foreground', 'Horsehead Silhouette Plane', 'Rogue Proper-Motion Sweep']
  ),
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

  getEntry(id: string): MinigameCatalogEntry | undefined {
    return MINIGAME_CATALOG[id];
  }

  listIds(): string[] {
    return Object.keys(REGISTRY);
  }

  listCatalog(): MinigameCatalogEntry[] {
    return Object.values(MINIGAME_CATALOG);
  }
}
