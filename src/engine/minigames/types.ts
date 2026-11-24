import type * as THREE from 'three';

/**
 * Unified types & 8-Input State Vector for the 5+1 3D Tactile Investigation Suite.
 * Engine <-> Content isolated: prose/balance live in JSON, physics, 3D handles & audio live here.
 */

export type VibeMode = 'warm' | 'balanced' | 'cold';

export type MinigameGrade = 'aborted' | 'partial' | 'clean' | 'deep_overclock';

export interface MinigameStateVector {
  humanity: number;           // 0..maxHumanity
  maxHumanity: number;        // 20..100
  opticalFidelity: number;    // 0.25..1.0
  chaosDrift: number;         // 0..100
  wavelengthNm: number;       // 200..1800
  primarySiblingH: number;    // 0..100
  overseerSuspicion: number;  // 0..100
  shift: number;              // 1..6
  prunedPersonas: number;     // 0..N
  proofFragments?: string[];  // Collected dossier fragments (for Shift 6 SIG-06)
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
  requiresRawResidual: boolean;
}

export interface CognitiveInstrumentProfile {
  vibe: VibeMode;
  theme: UnifiedVibeTheme;
  detentWellScale: number;        // Warm = 1.35x forgiving magnetic wells, Cold = 0.72x surgical
  jitterAmplitude: number;        // Optical fidelity inverse micro-tremor
  snapPrecisionMul: number;       // Cold = 1.28x razor tolerance
  pareidoliaChance: number;       // Chaos ghost decoy probability (lower in Cold)
  showNumericDeltas: boolean;     // True in Cold, subtle in Balanced, hidden in Warm
  requiresRawResidual: boolean;   // True when H% <= 44 (Over-Regularization Lock)
  overclockRiskMul: number;       // Higher in high Chaos / Suspicion
  harmonicWarmthGain: number;     // Audio harmonic overtone blend (1.0 Warm -> 0.16 Cold)
}

export interface ShowcaseCouplingUpdate {
  progress?: number;              // 0..1 overall solve/isolation progress
  dustPeel?: number;              // 0..1 clears obscuring dust/noise on 3D object
  slicePlaneZ?: number;           // -14..14 axial slicer depth for 3D nebula dust
  unwarpProgress?: number;        // 0..1 straightens Einstein caustic lensing
  ringTwist?: number;             // radians shear/twist on 3D anomaly rings
  seamReveal?: number;            // 0..1 reveals 93-BLY wall / synthetic grid seam
  jetResonance?: number;          // 0..1 drives pulsar/star harmonic pulse
  dollyDelta?: number;            // -1..+1 camera zoom/dolly nudge
  blinkFlip?: boolean;            // true toggles Epoch B blink view
  blinkMix?: number;              // 0..1 smooth epoch blend
  humanity?: number;              // 0..100 live H% lookdev
  rawResidual?: boolean;          // true clears Cold Over-Regularization film
  haloOffsets?: Array<[number, number, number]>;
  shearAngle?: number;
  shearMag?: number;
  fringeContrast?: number;        // 0..1 Michelson constructive fringe visibility
  fringePhase?: number;           // radians optical delay phase
}

export interface Interactive3DHandle {
  id: string;
  object: THREE.Object3D;
  pickRadiusPx?: number;          // >= 44px screen-space collider guarantee
  dragPlane?: 'camera' | 'equatorial' | 'axial_z';
  onHover?: (hovered: boolean) => void;
  onDragStart?: (hitPoint: THREE.Vector3) => void;
  onDrag?: (ctx: {
    worldPoint: THREE.Vector3;
    worldDelta: THREE.Vector3;
    screenX: number;
    screenY: number;
    screenDx: number;
    screenDy: number;
  }) => void;
  onDragEnd?: () => void;
  onTap?: (hitPoint: THREE.Vector3) => void;
}

export interface CameraKeyframe {
  yaw?: number;
  pitch?: number;
  dist?: number;
  lookAt?: [number, number, number];
  lockOrbit?: boolean;
}

export interface ShowcaseInstrumentBridge {
  applyInstrumentPatch(patch: ShowcaseCouplingUpdate): void;
  trigger3DSonarPulse(originX: number, originY: number, bandIdx?: number): void;
  add3DBearingVector(angleRad: number, confidence: number, colorHex?: string): void;
  clearInstrumentOverlays(): void;
  resetInstrumentState(): void;
  // Extended Interactive 3D API (optional on legacy mocks, implemented on TargetShowcaseScene)
  getInstrumentGroup?(): THREE.Group | null;
  register3DHandle?(handle: Interactive3DHandle): () => void;
  setCameraKeyframe?(kf: CameraKeyframe | null): void;
  recenterCamera?(): void;
  setVibeState?(humanity: number, rawResidual: boolean): void;
  commitDecodedState?(targetId: string, patch: ShowcaseCouplingUpdate): void;
  projectWorldToScreen?(worldPos: { x: number; y: number; z: number }): {
    x: number;
    y: number;
    visible: boolean;
  };
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
  setWatchdogBed(level: number): void;
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
}

export interface MinigameContext {
  container: HTMLElement;
  targetId: string;
  targetName: string;
  minigameId: string;
  state: MinigameStateVector;
  bandIdx: number;
  isFirstRun?: boolean;
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

export interface SolvabilityHarness {
  solveStage(stage: 1 | 2 | 3): void;
  getDiagnostics(): {
    stage: number;
    completed: boolean;
    stageProgress: number;
  };
}

export interface IMinigame {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly instrumentCode: string;
  mount(ctx: MinigameContext): void;
  onHelperAction?(actionId: string): void;
  getFieldGuide?(): InstrumentFieldGuide;
  getSolvabilityHarness?(): SolvabilityHarness;
  destroy(): void;
}
