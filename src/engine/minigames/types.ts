/**
 * Unified types & 8-Input State Vector for the 5-Instrument Tactile Investigation Suite.
 * Engine <-> Content isolated: prose/balance live in JSON, physics & audio live here.
 */

export type VibeMode = 'warm' | 'balanced' | 'cold';

export type MinigameGrade = 'aborted' | 'partial' | 'clean' | 'deep_overclock';

export interface MinigameStateVector {
  humanity: number;           // 0..maxHumanity
  maxHumanity: number;        // 20..100
  opticalFidelity: number;    // 0.35..1.0
  chaosDrift: number;         // 0..100
  wavelengthNm: number;       // 0..3
  primarySiblingH: number;    // 0..100
  overseerSuspicion: number;  // 0..100
  shift: number;              // 0..6
  prunedPersonas: number;     // 0..N
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
  snapPrecisionMul: number;       // Cold = 1.30x razor tolerance
  pareidoliaChance: number;       // Chaos ghost decoy probability (lower in Cold)
  showNumericDeltas: boolean;     // True in Cold, subtle in Balanced, hidden in Warm
  requiresRawResidual: boolean;   // True when H% < 45 (Over-Regularization Lock)
  overclockRiskMul: number;       // Higher in high Chaos / Suspicion
  harmonicWarmthGain: number;     // Audio harmonic overtone blend (1.0 Warm -> 0.15 Cold)
}

export interface ShowcaseCouplingUpdate {
  progress?: number;              // 0..1 overall solve/isolation progress
  dustPeel?: number;              // 0..1 clears obscuring dust/noise on 3D object
  unwarpProgress?: number;        // 0..1 straightens Einstein caustic lensing
  ringTwist?: number;             // radians shear/twist on 3D anomaly rings
  seamReveal?: number;            // 0..1 reveals 93-BLY wall / synthetic grid seam
  jetResonance?: number;          // 0..1 drives pulsar/star harmonic pulse
  dollyDelta?: number;            // -1..+1 camera zoom/dolly nudge
  blinkFlip?: boolean;            // true toggles Epoch B blink view
}

export interface ShowcaseInstrumentBridge {
  applyInstrumentPatch(patch: ShowcaseCouplingUpdate): void;
  trigger3DSonarPulse(originX: number, originY: number, bandIdx?: number): void;
  add3DBearingVector(angleRad: number, confidence: number, colorHex?: string): void;
  clearInstrumentOverlays(): void;
  resetInstrumentState(): void;
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
}

export interface HudHeartbeatSnapshot {
  beatIndex: 1 | 2 | 3;
  beatLabel: string;
  lockMeter: number;        // 0..1 overall capture/latch readiness
  overclockZone: boolean;   // true when holding latch in 85..100% Deep Overclock
  rawResidualActive: boolean;
  canCommitPartial: boolean;
  telemetryReadout: string;
  cueWhisper: string;
  assistTier: 0 | 1 | 2 | 3;
}

export interface MinigameContext {
  container: HTMLElement;
  targetId: string;
  targetName: string;
  minigameId: string;
  state: MinigameStateVector;
  bandIdx: number;
  showcase: ShowcaseInstrumentBridge | null;
  audio: InstrumentAudioHandle | null;
  onTelemetry?: (hud: HudHeartbeatSnapshot) => void;
  onSwitchBand?: (bandIdx: number) => void;
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
  dossierSnippet?: string;
  telemetrySummary: string;
}

export interface IMinigame {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly instrumentCode: string;
  mount(ctx: MinigameContext): void;
  setWaveBand?(bandIdx: number): void;
  toggleRawResidual?(force?: boolean): void;
  triggerCaptureLatch?(holding: boolean): void;
  requestPartialCommit?(): void;
  destroy(): void;
}
