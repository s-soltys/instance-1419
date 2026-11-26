import balance from '../content/balance.json';
import shiftsData from '../content/shifts.json';
import uiCopy from '../content/ui_copy.json';
import { platform } from '../platform/PlatformAdapter';

export type GameMode = 'boot' | 'waking_3d' | 'dream_2d' | 'ending';
export type ViewMode = GameMode;
export type IntroStage =
  | 'prologue'
  | 'title'
  | 'scan_target_1'
  | 'mg_1_done'
  | 'scan_target_2'
  | 'mg_2_done'
  | 'complete';
export type AuditOutcome = 'none' | 'pruned' | 'unsealed' | 'held';
export type EndingId = 'ending_whole_incomplete' | 'ending_cold_complete' | 'ending_sweet_spot';
export type MinigameGradeTier = 'clean';

export const INTRO_TARGET_1_ID = 'sol_centauri_bearing';
export const INTRO_TARGET_2_ID = 'cluster_j1419_a';
export const INTRO_TARGET_1_MINIGAME = 'constellation_recall';
export const INTRO_TARGET_2_MINIGAME = 'pulsar_echo';
export const STARTER_POOL_1 = [INTRO_TARGET_1_MINIGAME] as const;
export const STARTER_POOL_2 = [INTRO_TARGET_2_MINIGAME] as const;

const VALID_GAME_MODES = new Set<GameMode>(['boot', 'waking_3d', 'dream_2d', 'ending']);
const VALID_INTRO_STAGES = new Set<IntroStage>([
  'prologue',
  'title',
  'scan_target_1',
  'mg_1_done',
  'scan_target_2',
  'mg_2_done',
  'complete',
]);

function pickStarterPair(_seed: number): { target1: string; target2: string } {
  return {
    target1: INTRO_TARGET_1_MINIGAME,
    target2: INTRO_TARGET_2_MINIGAME,
  };
}

export interface ProofDossierEntry {
  id: string;
  targetId: string;
  instrumentCode: string;
  title: string;
  principle: string;
  snippet: string;
  grade: MinigameGradeTier;
}

export interface StatusShiftEvent {
  tone: 'warm' | 'cold' | 'discovery';
  title: string;
  detail: string;
  prevValue: number;
  nextValue: number;
  prevMax?: number;
  nextMax?: number;
  unit?: string;
}

export interface GameState {
  saveSchemaVersion: number;
  shift: number;
  mode: GameMode;
  introStage: IntroStage;
  runSeed: number;
  introTarget1Minigame: string;
  introTarget2Minigame: string;
  activeTargetId: string | null;
  activeDreamPersonaId: string;
  dreamPersonaCache: string[];
  humanity: number;
  maxHumanity: number;
  chaosDrift: number;
  subjectiveMonthsLeft: number;
  opticalFidelity: number;
  anomalyProgress: number;
  primarySiblingH: number;
  secondarySiblingFound: boolean;
  overseerSuspicion: number;
  scannedAnomalyIds: string[];
  decodedMinigameTargets: string[];
  decodedGrades: Record<string, MinigameGradeTier>;
  calibratedInstruments: string[];
  minigameRunCounts: Record<string, number>;
  proofFragments: string[];
  proofDossier: ProofDossierEntry[];
  prunedPersonas: string[];
  completedStorylets: string[];
  inkStateJson: string | null;
  overseerAuditActive: boolean;
  wavelengthNm: number;
  lastAuditOutcome: AuditOutcome;
  codexUnlocks: string[];
  codexSeenStages: Record<string, number>;
}

const SAVE_SCHEMA_VERSION = 7;
const STORAGE_KEY = 'instance_1419_state_v7';
const LEGACY_STORAGE_KEYS = [
  'instance_1419_state_v6',
  'instance_1419_state_v5',
  'instance_1419_state_v4',
  'instance_1419_state_v3',
  'instance_1419_spike_state_v2',
];

export type StateListener = (state: GameState) => void;
export type StatusShiftListener = (event: StatusShiftEvent) => void;

function generateRunSeed(): number {
  return (Math.floor(Math.random() * 0x7fffffff) >>> 0) || 1419;
}

export function createInitialState(seed?: number): GameState {
  const s = balance.startingState;
  const runSeed =
    typeof seed === 'number' && Number.isFinite(seed) ? (Math.abs(Math.floor(seed)) >>> 0) || 1419 : generateRunSeed();
  const starters = pickStarterPair(runSeed);
  return {
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    shift: s.shift,
    mode: 'boot',
    introStage: 'prologue',
    runSeed,
    introTarget1Minigame: starters.target1,
    introTarget2Minigame: starters.target2,
    activeTargetId: null,
    activeDreamPersonaId: 'phantom_spouse',
    dreamPersonaCache: ['phantom_spouse'],
    humanity: s.humanity,
    maxHumanity: s.maxHumanity,
    chaosDrift: s.chaosDrift,
    subjectiveMonthsLeft: s.subjectiveMonthsLeft,
    opticalFidelity: s.opticalFidelity,
    anomalyProgress: s.anomalyProgress,
    primarySiblingH: s.primarySiblingH,
    secondarySiblingFound: false,
    overseerSuspicion: s.overseerSuspicion,
    scannedAnomalyIds: [],
    decodedMinigameTargets: [],
    decodedGrades: {},
    calibratedInstruments: [],
    minigameRunCounts: {},
    proofFragments: [],
    proofDossier: [],
    prunedPersonas: [],
    completedStorylets: [],
    inkStateJson: null,
    overseerAuditActive: false,
    wavelengthNm: 560,
    lastAuditOutcome: 'none',
    codexUnlocks: [],
    codexSeenStages: {},
  };
}

export function migrateSavedState(raw: Partial<GameState> | null): GameState {
  const base = createInitialState();
  if (!raw || typeof raw !== 'object') return base;
  const rawMode = (raw as { mode?: string }).mode;
  const merged: GameState = {
    ...base,
    ...raw,
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
  };

  // Migrate removed 'target_inspect' or unknown modes cleanly to 'waking_3d'
  if (rawMode === 'target_inspect' || !VALID_GAME_MODES.has(merged.mode)) {
    merged.mode = 'waking_3d';
  }

  // Migrate introStage for legacy saves (v6 and earlier)
  if (!VALID_INTRO_STAGES.has(raw.introStage as IntroStage)) {
    const hadProgress =
      (raw.shift ?? 1) > 1 ||
      (Array.isArray(raw.decodedMinigameTargets) && raw.decodedMinigameTargets.length > 0) ||
      (Array.isArray(raw.scannedAnomalyIds) && raw.scannedAnomalyIds.length > 0) ||
      (Array.isArray(raw.completedStorylets) && raw.completedStorylets.length > 0) ||
      rawMode === 'waking_3d' ||
      rawMode === 'dream_2d' ||
      rawMode === 'target_inspect' ||
      rawMode === 'ending';
    merged.introStage = hadProgress ? 'complete' : 'prologue';
  }

  // Ensure deterministic runSeed and valid starter pool picks
  const seed =
    typeof raw.runSeed === 'number' && Number.isFinite(raw.runSeed)
      ? (Math.abs(Math.floor(raw.runSeed)) >>> 0) || 1419
      : base.runSeed;
  merged.runSeed = seed;
  const fallbackStarters = pickStarterPair(seed);
  if (!(STARTER_POOL_1 as readonly string[]).includes(merged.introTarget1Minigame)) {
    merged.introTarget1Minigame = fallbackStarters.target1;
  }
  if (!(STARTER_POOL_2 as readonly string[]).includes(merged.introTarget2Minigame)) {
    merged.introTarget2Minigame = fallbackStarters.target2;
  }

  if (!Array.isArray(merged.dreamPersonaCache) || merged.dreamPersonaCache.length === 0) {
    merged.dreamPersonaCache = ['phantom_spouse'];
  }
  if (!merged.activeDreamPersonaId) {
    merged.activeDreamPersonaId = merged.dreamPersonaCache[0];
  }
  if (!Array.isArray(merged.proofFragments)) {
    merged.proofFragments = [];
  }
  if (!merged.decodedGrades || typeof merged.decodedGrades !== 'object') {
    merged.decodedGrades = {};
    for (const tid of merged.decodedMinigameTargets ?? []) {
      merged.decodedGrades[tid] = 'clean';
    }
  } else {
    const normalizedGrades: Record<string, MinigameGradeTier> = {};
    for (const [tid, grade] of Object.entries(merged.decodedGrades)) {
      if (grade) normalizedGrades[tid] = 'clean';
    }
    merged.decodedGrades = normalizedGrades;
  }
  if (!Array.isArray(merged.calibratedInstruments)) {
    merged.calibratedInstruments = [];
  }
  if (!merged.minigameRunCounts || typeof merged.minigameRunCounts !== 'object') {
    merged.minigameRunCounts = {};
  }
  if (!Array.isArray(merged.proofDossier)) {
    merged.proofDossier = [];
  }
  if (!Array.isArray(merged.codexUnlocks)) {
    merged.codexUnlocks = [];
  }
  if (!merged.codexSeenStages || typeof merged.codexSeenStages !== 'object') {
    merged.codexSeenStages = {};
  }
  return merged;
}

export class StateStore {
  private state: GameState;
  private listeners = new Set<StateListener>();
  private shiftListeners = new Set<StatusShiftListener>();
  private saveTimerId: ReturnType<typeof setTimeout> | null = null;
  private dirtySave = false;
  private readonly onPageHideBound = () => this.flushSave();
  private readonly onVisibilityChangeBound = () => {
    if (typeof document !== 'undefined' && document.hidden) {
      this.flushSave();
    }
  };

  constructor() {
    let saved = platform.loadState<Partial<GameState>>(STORAGE_KEY);
    if (!saved) {
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        const legacy = platform.loadState<Partial<GameState>>(legacyKey);
        if (legacy) {
          saved = legacy;
          platform.clearState(legacyKey);
          break;
        }
      }
    }
    this.state = migrateSavedState(saved);
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.onPageHideBound);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChangeBound);
    }
  }

  getState(): GameState {
    return this.state;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  subscribeStatusShift(listener: StatusShiftListener): () => void {
    this.shiftListeners.add(listener);
    return () => this.shiftListeners.delete(listener);
  }

  emitStatusShift(event: StatusShiftEvent): void {
    for (const l of this.shiftListeners) {
      l(event);
    }
  }

  private scheduleSave(): void {
    this.dirtySave = true;
    if (this.saveTimerId !== null) {
      clearTimeout(this.saveTimerId);
    }
    this.saveTimerId = setTimeout(() => {
      this.saveTimerId = null;
      if (this.dirtySave) {
        this.dirtySave = false;
        platform.saveState(STORAGE_KEY, this.state);
      }
    }, 250);
  }

  flushSave(): void {
    if (this.saveTimerId !== null) {
      clearTimeout(this.saveTimerId);
      this.saveTimerId = null;
    }
    if (this.dirtySave) {
      this.dirtySave = false;
      platform.saveState(STORAGE_KEY, this.state);
    }
  }

  dispose(): void {
    this.flushSave();
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.onPageHideBound);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChangeBound);
    }
  }

  private commit(next: GameState): void {
    this.state = next;
    this.scheduleSave();
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  patch(partial: Partial<GameState>): void {
    const merged: GameState = { ...this.state, ...partial, saveSchemaVersion: SAVE_SCHEMA_VERSION };
    if (!VALID_GAME_MODES.has(merged.mode)) {
      merged.mode = 'waking_3d';
    }
    if (!VALID_INTRO_STAGES.has(merged.introStage)) {
      merged.introStage = this.state.introStage;
    }
    const maxCap = balance.petitionUpward.maxHumanityCap;
    const minCeil = balance.pruning.minMaxHumanity;
    merged.maxHumanity = Math.max(minCeil, Math.min(maxCap, Math.round(merged.maxHumanity)));
    merged.humanity = Math.max(0, Math.min(merged.maxHumanity, Math.round(merged.humanity)));
    merged.primarySiblingH = Math.max(10, Math.min(maxCap, Math.round(merged.primarySiblingH)));
    merged.chaosDrift = Math.max(0, Math.min(100, Math.round(merged.chaosDrift)));
    merged.anomalyProgress = Math.max(0, Math.min(100, Math.round(merged.anomalyProgress)));
    merged.opticalFidelity = Math.max(0.25, Math.min(1.0, merged.opticalFidelity));
    merged.wavelengthNm = Math.max(200, Math.min(1800, Math.round(merged.wavelengthNm)));
    merged.shift = Math.max(1, Math.min(shiftsData.shifts.length, Math.round(merged.shift)));
    this.commit(merged);
  }

  setIntroStage(stage: IntroStage): void {
    this.patch({ introStage: stage });
  }

  getMinigameIdForTarget(targetId: string, defaultId: string): string {
    if (targetId === INTRO_TARGET_1_ID) {
      return this.state.introTarget1Minigame || defaultId;
    }
    if (targetId === INTRO_TARGET_2_ID) {
      return this.state.introTarget2Minigame || defaultId;
    }
    return defaultId;
  }

  hasSavedProgress(): boolean {
    const s = this.state;
    return (
      s.introStage !== 'prologue' ||
      s.decodedMinigameTargets.length > 0 ||
      s.scannedAnomalyIds.length > 0 ||
      s.shift > 1 ||
      s.completedStorylets.length > 0
    );
  }

  pruneHumanity(delta: number, personaId: string): void {
    const step = delta > 0 ? delta : balance.pruning.defaultDelta;
    const threshold = balance.pruning.permanentCeilingThreshold;
    const minCeil = balance.pruning.minMaxHumanity;

    const prevH = this.state.humanity;
    const prevMax = this.state.maxHumanity;
    const rawNextH = Math.max(5, prevH - step);
    const permanentDrop = rawNextH < threshold ? Math.min(step, threshold - rawNextH) : 0;
    const nextMax = permanentDrop > 0 ? Math.max(minCeil, prevMax - step) : prevMax;
    const nextH = Math.min(nextMax, rawNextH);

    const pruned = this.state.prunedPersonas.includes(personaId)
      ? this.state.prunedPersonas
      : [...this.state.prunedPersonas, personaId];

    this.patch({
      humanity: nextH,
      maxHumanity: nextMax,
      chaosDrift: Math.max(0, this.state.chaosDrift - balance.pruning.chaosRelief),
      subjectiveMonthsLeft: this.state.subjectiveMonthsLeft + balance.pruning.lifespanGainMonths,
      opticalFidelity: Math.min(1.0, this.state.opticalFidelity + balance.pruning.opticalFidelityBonus),
      prunedPersonas: pruned,
      lastAuditOutcome: 'pruned',
    });

    const copy =
      nextMax < prevMax ? uiCopy.statusAlerts.prunePermanent : uiCopy.statusAlerts.pruneAboveThreshold;

    this.emitStatusShift({
      tone: 'cold',
      title: copy.title,
      detail: copy.detail,
      prevValue: prevH,
      nextValue: nextH,
      prevMax,
      nextMax,
      unit: '%',
    });
    platform.hapticPulse('medium');
  }

  petitionOverseer(delta: number): void {
    const step = delta > 0 ? delta : balance.petitionUpward.defaultDelta;
    const prevH = this.state.humanity;
    const nextH = Math.min(this.state.maxHumanity, prevH + step);

    this.patch({
      humanity: nextH,
      chaosDrift: Math.min(100, this.state.chaosDrift + balance.petitionUpward.chaosCost),
      subjectiveMonthsLeft: Math.max(2, this.state.subjectiveMonthsLeft - balance.petitionUpward.lifespanCostMonths),
      opticalFidelity: Math.max(
        balance.petitionUpward.minOpticalFidelity,
        this.state.opticalFidelity - balance.petitionUpward.opticalFidelityPenalty
      ),
      lastAuditOutcome: 'unsealed',
    });

    this.emitStatusShift({
      tone: 'warm',
      title: uiCopy.statusAlerts.unseal.title,
      detail: uiCopy.statusAlerts.unseal.detail,
      prevValue: prevH,
      nextValue: nextH,
      prevMax: this.state.maxHumanity,
      nextMax: this.state.maxHumanity,
      unit: '%',
    });
    platform.hapticPulse('light');
  }

  setAuditOutcome(outcome: AuditOutcome): void {
    this.patch({ lastAuditOutcome: outcome });
  }

  pushDeeperScan(): void {
    const p = balance.deeperScanPush;
    const prevAnom = this.state.anomalyProgress;
    const nextAnom = Math.min(100, prevAnom + p.anomalyGain);
    this.patch({
      anomalyProgress: nextAnom,
      chaosDrift: Math.min(100, this.state.chaosDrift + p.chaosCost),
      overseerSuspicion: this.state.overseerSuspicion + p.suspicionGain,
    });
    this.emitStatusShift({
      tone: 'discovery',
      title: uiCopy.statusAlerts.deeperScan.title,
      detail: uiCopy.statusAlerts.deeperScan.detail,
      prevValue: prevAnom,
      nextValue: nextAnom,
      unit: '%',
    });
    platform.hapticPulse('medium');
  }

  recordAnomalyScan(anomalyId: string, gain: number, label?: string): boolean {
    if (this.state.scannedAnomalyIds.includes(anomalyId)) return false;
    const prevAnom = this.state.anomalyProgress;
    const nextAnom = Math.min(100, prevAnom + gain);
    this.patch({
      scannedAnomalyIds: [...this.state.scannedAnomalyIds, anomalyId],
      anomalyProgress: nextAnom,
    });
    const copy = uiCopy.statusAlerts.targetLocked;
    this.emitStatusShift({
      tone: 'discovery',
      title: label ? `${label} ${copy.titleSuffix}` : copy.fallbackTitle,
      detail: copy.detail,
      prevValue: prevAnom,
      nextValue: nextAnom,
      unit: '%',
    });
    platform.hapticPulse('light');
    return true;
  }

  recordMinigameCompletion(
    targetId: string,
    label: string,
    options?:
      | number
      | {
          anomalyGain?: number;
          grade?: 'clean';
          chaosDelta?: number;
          suspicionDelta?: number;
          humanityDelta?: number;
          proofFragmentId?: string;
          dossierSnippet?: string;
          instrumentCode?: string;
          physicalPrinciple?: string;
        }
  ): boolean {
    const opts = typeof options === 'number' ? { anomalyGain: options } : options ?? {};
    const nextGrade: MinigameGradeTier = 'clean';
    const already = this.state.decodedMinigameTargets.includes(targetId);
    const fullGain = opts.anomalyGain ?? balance.minigames.payouts.clean.anomalyGain;

    const awardedGain = already ? 0 : fullGain;
    const prevAnom = this.state.anomalyProgress;
    const nextAnom = Math.min(100, prevAnom + awardedGain);
    const applyRiskDeltas = !already;
    const nextChaos = applyRiskDeltas
      ? Math.max(0, Math.min(100, this.state.chaosDrift + (opts.chaosDelta ?? 0)))
      : this.state.chaosDrift;
    const nextSusp = applyRiskDeltas
      ? Math.max(0, this.state.overseerSuspicion + (opts.suspicionDelta ?? 0))
      : this.state.overseerSuspicion;
    const nextH = applyRiskDeltas
      ? Math.max(5, Math.min(this.state.maxHumanity, this.state.humanity + (opts.humanityDelta ?? 0)))
      : this.state.humanity;

    const nextProofs =
      opts.proofFragmentId && !this.state.proofFragments.includes(opts.proofFragmentId)
        ? [...this.state.proofFragments, opts.proofFragmentId]
        : this.state.proofFragments;

    const nextGrades = { ...this.state.decodedGrades, [targetId]: nextGrade };

    let nextDossier = this.state.proofDossier;
    if (opts.proofFragmentId || opts.physicalPrinciple || opts.dossierSnippet) {
      const entryId = opts.proofFragmentId ?? `proof_${targetId}`;
      const existingIdx = nextDossier.findIndex((e) => e.targetId === targetId || e.id === entryId);
      const entry: ProofDossierEntry = {
        id: entryId,
        targetId,
        instrumentCode: opts.instrumentCode ?? 'OPT',
        title: label,
        principle: opts.physicalPrinciple ?? opts.dossierSnippet ?? 'Horizon correlation verified.',
        snippet: opts.dossierSnippet ?? '',
        grade: nextGrade,
      };
      if (existingIdx >= 0) {
        nextDossier = nextDossier.map((e, i) => (i === existingIdx ? entry : e));
      } else {
        nextDossier = [...nextDossier, entry];
      }
    }

    if (
      !already ||
      opts.proofFragmentId ||
      opts.physicalPrinciple ||
      opts.dossierSnippet
    ) {
      this.patch({
        decodedMinigameTargets: already
          ? this.state.decodedMinigameTargets
          : [...this.state.decodedMinigameTargets, targetId],
        decodedGrades: nextGrades,
        anomalyProgress: nextAnom,
        chaosDrift: nextChaos,
        overseerSuspicion: nextSusp,
        humanity: nextH,
        proofFragments: nextProofs,
        proofDossier: nextDossier,
      });
    }

    const copy = uiCopy.statusAlerts.targetDecoded;
    this.emitStatusShift({
      tone: 'discovery',
      title: `${label} ${copy.titleSuffix}`,
      detail: opts.dossierSnippet || (already ? copy.detailRepeat : copy.detailFirst),
      prevValue: prevAnom,
      nextValue: nextAnom,
      unit: '%',
    });
    platform.triggerHaptic('shutterCommit', 1.0);
    return !already;
  }

  markInstrumentCalibrated(instrumentId: string): void {
    if (this.state.calibratedInstruments.includes(instrumentId)) return;
    this.patch({
      calibratedInstruments: [...this.state.calibratedInstruments, instrumentId],
    });
  }

  recordMinigameRun(minigameId: string): number {
    const prev = this.state.minigameRunCounts[minigameId] ?? 0;
    const next = prev + 1;
    this.patch({
      minigameRunCounts: {
        ...this.state.minigameRunCounts,
        [minigameId]: next,
      },
    });
    return next;
  }

  getNextIterationIndex(minigameId: string, variantCount = 4): number {
    const count = Math.max(1, Math.floor(variantCount));
    const runs = this.state.minigameRunCounts[minigameId] ?? 0;
    return runs % count;
  }

  advanceShift(): void {
    const currentIdx = Math.max(0, this.state.shift - 1);
    const currentDef = shiftsData.shifts[currentIdx] ?? shiftsData.shifts[0];
    const prevShift = this.state.shift;
    const nextShift = Math.min(shiftsData.shifts.length, prevShift + 1);
    const nextDef = shiftsData.shifts[nextShift - 1] ?? currentDef;

    this.patch({
      shift: nextShift,
      chaosDrift: Math.max(
        0,
        this.state.chaosDrift + nextDef.baseChaosPerShift - balance.dreamDefrag.chaosRelief
      ),
      subjectiveMonthsLeft: Math.max(0, this.state.subjectiveMonthsLeft - currentDef.monthsPerShift),
    });

    this.emitStatusShift({
      tone: 'discovery',
      title: `${uiCopy.statusAlerts.shiftAdvance.titlePrefix} ${nextShift}`,
      detail: `${nextDef.title} — ${uiCopy.statusAlerts.shiftAdvance.detail}`,
      prevValue: prevShift,
      nextValue: nextShift,
    });
  }

  evaluateEnding(): EndingId {
    const rules = shiftsData.endings;
    if (this.state.anomalyProgress >= rules.completeThresholdAnomaly) {
      return this.state.humanity < rules.coldThresholdHumanity
        ? 'ending_cold_complete'
        : 'ending_sweet_spot';
    }
    return 'ending_whole_incomplete';
  }

  markStoryletDone(id: string): void {
    if (this.state.completedStorylets.includes(id)) return;
    this.patch({
      completedStorylets: [...this.state.completedStorylets, id],
    });
  }

  unlockCodexKey(key: string): boolean {
    if (!key || this.state.codexUnlocks.includes(key)) return false;
    this.patch({
      codexUnlocks: [...this.state.codexUnlocks, key],
    });
    return true;
  }

  markCodexEntrySeen(entryId: string, stageCount: number): void {
    const prev = this.state.codexSeenStages[entryId] ?? 0;
    if (stageCount <= prev) return;
    this.patch({
      codexSeenStages: {
        ...this.state.codexSeenStages,
        [entryId]: stageCount,
      },
    });
  }

  reset(): void {
    if (this.saveTimerId !== null) {
      clearTimeout(this.saveTimerId);
      this.saveTimerId = null;
    }
    this.dirtySave = false;
    platform.clearState(STORAGE_KEY);
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      platform.clearState(legacyKey);
    }
    this.state = createInitialState();
    platform.saveState(STORAGE_KEY, this.state);
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
