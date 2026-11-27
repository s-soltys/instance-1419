import type { Minigame3DConfig, ShowcaseInstrumentBridge } from '../types';
import { setGlobal3DBackdropComposite } from './BackdropCachePipeline';

/**
 * Selective Tier-A 3D Backdrop presets for all 21 instruments:
 * - Pure Plate Games (EXP-13, BND-19, SEM-17, BLK-06, LNS-04, DSP-05, PRM-09, POL-12):
 *   mode: 'off' pauses TargetShowcaseScene cleanly (0ms WebGL overhead).
 * - Spatial / Orbital / Field Games:
 *   Single-pass DPR-capped Backdrop Mode (no UnrealBloomPass, auto-30fps mobile guard,
 *   dimmed exposure, subtle pointer parallax + lightweight pooled Minigame3DPropRig).
 */
export const DEFAULT_MINIGAME_3D_PRESETS: Record<string, Minigame3DConfig> = {
  // Spatial / Orbital / Field Games (Subtle Single-Pass 3D Backdrop Mode)
  wave_shaper: {
    mode: 'ambient_stars',
    opacity: 0.48,
    parallaxScale: 0.03,
    propRig: 'dust_wisps',
    exposure: 0.5,
    driftSpeed: 0.014,
  },
  constellation_recall: { mode: 'off', propRig: 'none' },
  pulsar_echo: {
    mode: 'orbital_rig',
    opacity: 0.5,
    parallaxScale: 0.028,
    propRig: 'orbital_plane',
    exposure: 0.52,
    driftSpeed: 0.016,
  },
  gravity_slingshot: {
    mode: 'orbital_rig',
    opacity: 0.46,
    parallaxScale: 0.03,
    propRig: 'orbital_plane',
    exposure: 0.48,
    driftSpeed: 0.015,
  },
  exoplanet_transit: {
    mode: 'orbital_rig',
    opacity: 0.46,
    parallaxScale: 0.028,
    propRig: 'orbital_plane',
    exposure: 0.5,
    driftSpeed: 0.014,
  },
  radio_triangulation: {
    mode: 'ambient_stars',
    opacity: 0.45,
    parallaxScale: 0.03,
    propRig: 'horizon_arc',
    exposure: 0.48,
    driftSpeed: 0.012,
  },
  coronagraph_mask: {
    mode: 'ambient_stars',
    opacity: 0.46,
    parallaxScale: 0.026,
    propRig: 'orbital_plane',
    exposure: 0.46,
    driftSpeed: 0.014,
  },
  binary_mass_scale: {
    mode: 'orbital_rig',
    opacity: 0.48,
    parallaxScale: 0.03,
    propRig: 'orbital_plane',
    exposure: 0.5,
    driftSpeed: 0.016,
  },
  cepheid_ladder: {
    mode: 'ambient_stars',
    opacity: 0.46,
    parallaxScale: 0.026,
    propRig: 'dust_wisps',
    exposure: 0.48,
    driftSpeed: 0.012,
  },
  supernova_echoes: {
    mode: 'ambient_stars',
    opacity: 0.48,
    parallaxScale: 0.03,
    propRig: 'dust_wisps',
    exposure: 0.5,
    driftSpeed: 0.015,
  },
  michelson_fringe: {
    mode: 'ambient_stars',
    opacity: 0.44,
    parallaxScale: 0.024,
    propRig: 'lensing_shell',
    exposure: 0.48,
    driftSpeed: 0.012,
  },
  einstein_cross: {
    mode: 'ambient_stars',
    opacity: 0.48,
    parallaxScale: 0.03,
    propRig: 'lensing_shell',
    exposure: 0.5,
    driftSpeed: 0.015,
  },
  parallax_depth: {
    mode: 'ambient_stars',
    opacity: 0.52,
    parallaxScale: 0.036,
    propRig: 'horizon_arc',
    exposure: 0.52,
    driftSpeed: 0.014,
  },

  // Pure Plate / High-Contrast Optical Aperture Games (WebGL Paused Cleanly = 0ms GL cost)
  lens_focus: { mode: 'off', propRig: 'none' },
  light_dispersion: { mode: 'off', propRig: 'none' },
  blink_spotter: { mode: 'off', propRig: 'none' },
  spectral_prism: { mode: 'off', propRig: 'none' },
  polarization_filter: { mode: 'off', propRig: 'none' },
  exposure_stacker: { mode: 'off', propRig: 'none' },
  horizon_seam_stitcher: { mode: 'off', propRig: 'none' },
  multiband_loupe: { mode: 'off', propRig: 'none' },
};

export function resolveMinigame3DConfig(minigameId: string): Minigame3DConfig {
  return DEFAULT_MINIGAME_3D_PRESETS[minigameId] ?? { mode: 'off', propRig: 'none' };
}

/**
 * Thin lifecycle bridge coordinating BaseCosmicMinigame pointer parallax / solve progress
 * with TargetShowcaseScene's lightweight Single-Pass Backdrop Mode.
 */
export class Minigame3DBridge {
  private active = false;
  private lastNx = 0;
  private lastNy = 0;
  private lastProgress = -1;
  private config: Minigame3DConfig = { mode: 'off', propRig: 'none' };

  constructor(private readonly showcase: ShowcaseInstrumentBridge | null) {}

  get is3DVisible(): boolean {
    return this.active && this.config.mode !== 'off' && Boolean(this.showcase);
  }

  enter(config: Minigame3DConfig, humanity?: number): void {
    this.config = config;
    this.active = true;
    this.lastNx = 0;
    this.lastNy = 0;
    this.lastProgress = -1;
    if (typeof humanity === 'number') {
      this.showcase?.setVibeState?.(humanity, false);
    }
    this.showcase?.setMinigameBackdropMode?.(config);
    setGlobal3DBackdropComposite(this.is3DVisible);
  }

  setVibe(humanity: number): void {
    if (!this.active) return;
    this.showcase?.setVibeState?.(humanity, false);
  }

  updateParallax(nx: number, ny: number, progress01: number): void {
    if (!this.is3DVisible) return;
    if (
      Math.abs(nx - this.lastNx) < 0.005 &&
      Math.abs(ny - this.lastNy) < 0.005 &&
      Math.abs(progress01 - this.lastProgress) < 0.01
    ) {
      return;
    }
    this.lastNx = nx;
    this.lastNy = ny;
    this.lastProgress = progress01;
    this.showcase?.setMinigameParallax?.(nx, ny, progress01);
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    setGlobal3DBackdropComposite(false);
    this.showcase?.setMinigameBackdropMode?.(null);
  }
}
