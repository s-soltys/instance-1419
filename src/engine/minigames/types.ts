/**
 * Unified types & Lean 3-Axis State Vector for the Instance-1419 Cosmic Instrument Suite:
 * - Axis 1 (Warmth): `humanity` -> palette, acoustic warmth, detent wells, numeric deltas
 * - Axis 2 (Optical Clarity): `opticalFidelity` -> plate crispness, CCD noise floor, micro-jitter
 * - Axis 3 (Horizon Drift): `chaosDrift` + `shift` -> subtle edge seam bleed & late-shift drift
 */

export type VibeMode = 'warm' | 'balanced' | 'cold';

export type TargetScaleClass =
  | 'planet'
  | 'star_system'
  | 'nebula'
  | 'galaxy'
  | 'galaxy_cluster'
  | 'horizon_anomaly';

export type AnomalyRole = 'baseline' | 'boundary_bleed' | 'direct_anomaly';

export type MinigameGrade = 'aborted' | 'partial' | 'clean' | 'deep_overclock';

export type CosmicPlateId =
  | 'carina'
  | 'smacs'
  | 'hudf'
  | 'pillars'
  | 'southern_ring'
  | 'stephans_quintet'
  | 'tarantula'
  | 'crab'
  | 'ring_m57'
  | 'cartwheel'
  | 'rho_ophiuchi'
  | 'cas_a'
  | 'horsehead'
  | 'sombrero'
  | 'whirlpool';

export type SpectralClass = 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M' | 'LOCK' | 'ALERT';

export interface MinigameVariantSpec {
  index: number;
  id: string;
  label: string;
  plateId: CosmicPlateId;
  scenarioTag?: string;
}

export type Minigame3DPropRig =
  | 'none'
  | 'orbital_plane'
  | 'lensing_shell'
  | 'dust_wisps'
  | 'horizon_arc';

export interface Minigame3DConfig {
  mode: 'off' | 'ambient_stars' | 'orbital_rig';
  opacity?: number;
  parallaxScale?: number;
  propRig?: Minigame3DPropRig;
  exposure?: number;
  driftSpeed?: number;
  accentHex?: string;
}

export interface MinigameStateVector {
  humanity: number;           // Axis 1: Warmth (0..100)
  opticalFidelity: number;    // Axis 2: Optical Clarity (0.25..1.0)
  chaosDrift: number;         // Axis 3: Horizon Drift (0..100)
  shift: number;              // Axis 3: Campaign Shift (1..6)
  targetScale?: TargetScaleClass;
  anomalyRole?: AnomalyRole;
  fractalStage?: number;
  anomalyBleed?: number;      // 0..1 enclosure bleed intensity
  // Legacy optional fields retained for backward compatibility with older call sites
  maxHumanity?: number;
  wavelengthNm?: number;
  primarySiblingH?: number;
  overseerSuspicion?: number;
  prunedPersonas?: number;
  proofFragments?: string[];
}

export interface UnifiedVibeTheme {
  mode: VibeMode;
  label: string;
  subtitle: string;
  accentHex: string;
  accentRgb: string;
  secondaryHex: string;
  secondaryRgb: string;
  dangerHex: string;
  bgTintRgba: string;
  gridAlpha: number;
  glowBlurPx: number;
  reticleStyle: 'organic_amber' | 'hybrid_slate' | 'surgical_cyan';
}

export interface CognitiveInstrumentProfile {
  // Axis 1: Warmth (H%)
  vibe: VibeMode;
  warmth01: number;               // 0 (cold) .. 1 (warm)
  theme: UnifiedVibeTheme;
  detentWellScale: number;        // Warm = 1.35x forgiving magnetic wells, Cold = 0.72x surgical
  showNumericDeltas: boolean;     // True in Cold/Balanced, hidden in Warm
  harmonicWarmthGain: number;     // Audio harmonic overtone blend (1.0 Warm -> 0.16 Cold)

  // Axis 2: Optical Clarity (opticalFidelity)
  clarity01: number;              // 0..1 optical precision from pruning
  jitterAmplitude: number;        // Optical fidelity inverse micro-tremor
  ccdNoiseAlpha: number;          // Subtle CCD photographic grain (clears as fidelity rises)
  plateBlurPenaltyPx: number;     // Subtle optical softness at low fidelity

  // Axis 3: Horizon Drift (chaosDrift + shift)
  drift01: number;                // 0..1 combined instability across shifts/chaos
  seamBleedAlpha: number;         // Subtle enclosure edge coordinate bleed
}

export interface ShowcaseCouplingUpdate {
  progress?: number;
  dustPeel?: number;
  slicePlaneZ?: number;
  unwarpProgress?: number;
  ringTwist?: number;
  seamReveal?: number;
  jetResonance?: number;
  dollyDelta?: number;
  blinkFlip?: boolean;
  blinkMix?: number;
  humanity?: number;
  haloOffsets?: Array<[number, number, number]>;
  shearAngle?: number;
  shearMag?: number;
  fringeContrast?: number;
  fringePhase?: number;
}

export interface ShowcaseInstrumentBridge {
  applyInstrumentPatch(patch: ShowcaseCouplingUpdate): void;
  clearInstrumentOverlays(): void;
  resetInstrumentState(): void;
  setVibeState?(humanity: number, rawResidual?: boolean): void;
  commitDecodedState?(targetId: string, patch: ShowcaseCouplingUpdate): void;
  setMinigameBackdropMode?(cfg: Minigame3DConfig | null): void;
  setMinigameParallax?(nx: number, ny: number, progress01: number): void;
}

export interface BeatSynthParams {
  beatHz: number;       // 0 = pure unison lock; >0 = audible beating
  harmonicLock: number; // 0..1 lock clarity
  warmth: number;       // 0..1 (High H% rich warm fifths vs Cold H% crystalline sine)
  strain: number;       // 0..1 Overclock / shear tension
  pan?: number;         // -1..+1 stereo azimuth
}

export interface InstrumentAudioHandle {
  updateBeatSynth(params: BeatSynthParams): void;
  stopInstrumentAudio(): void;
  playTumblerClick(tension: number, hitSweetSpot: boolean): void;
  playStereoSonarEcho(pan: number, distanceNorm: number, pitchHz?: number): void;
  playSolenoidClack(heavy?: boolean): void;
  playCaptureShutter(grade: MinigameGrade): void;
  playProximityTick?(closeness01: number, pan?: number): void;
  playPhaseLock?(stageIndex: number): void;
  playHapticThump?(intensity01: number): void;
}

export interface InstrumentFieldGuide {
  title: string;
  physicalPrinciple: string;
  goalSummary: string;
  controlsDesktop: string;
  controlsTouch: string;
  warmthEffect: string;
}

export interface HudActionButtonSpec {
  id: string;
  label: string;
  active?: boolean;
}

export interface HudHeartbeatSnapshot {
  stageIndex: 1 | 2 | 3;
  stageLabel: string;
  stageProgress: number; // 0..1 within stage or overall completion feel
  promptText: string;
  actionButton?: HudActionButtonSpec | null;
  variantTag?: string;
}

export interface MinigameContext {
  container: HTMLElement;
  targetId: string;
  targetName: string;
  minigameId: string;
  state: MinigameStateVector;
  bandIdx?: number;
  isFirstRun?: boolean;
  iterationIndex?: number;
  variantSeed?: string;
  plateOverride?: CosmicPlateId;
  backdrop3DActive?: boolean;
  briefingHoldMs?: number;
  showcase: ShowcaseInstrumentBridge | null;
  audio: InstrumentAudioHandle | null;
  onTelemetry?: (hud: HudHeartbeatSnapshot) => void;
  onCalibrationComplete?: () => void;
  onComplete: (result: MinigameResult) => void;
}

export interface MinigameResult {
  success: boolean;
  grade: MinigameGrade;
  anomalyGain: number;
  chaosDelta: number;
  suspicionDelta: number;
  humanityDelta: number;
  accuracy: number;
  elapsedSec: number;
  proofFragmentId?: string;
  physicalPrinciple?: string;
  dossierSnippet?: string;
  telemetrySummary: string;
}

export interface SolvabilityDiagnostics {
  stage: number;
  completed: boolean;
  stageProgress: number;
  variantIndex?: number;
  variantId?: string;
  stageCount?: number;
}

export interface SolvabilityHarness {
  solveStage(stage: 1 | 2 | 3): void;
  getDiagnostics(): SolvabilityDiagnostics;
}

export interface IMinigame {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly instrumentCode: string;
  readonly variants?: readonly MinigameVariantSpec[];
  readonly platePool?: readonly CosmicPlateId[];
  readonly backdrop3D?: Minigame3DConfig;
  mount(ctx: MinigameContext): void;
  updateState?(nextState: MinigameStateVector): void;
  setBriefingHold?(active: boolean): void;
  onHelperAction?(actionId: string): void;
  getFieldGuide?(): InstrumentFieldGuide;
  getSolvabilityHarness?(): SolvabilityHarness;
  getBackdrop3DConfig?(): Minigame3DConfig;
  destroy(): void;
}
