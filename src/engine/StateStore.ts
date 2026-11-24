import balance from '../content/balance.json';
import shiftsData from '../content/shifts.json';
import uiCopy from '../content/ui_copy.json';
import { platform } from '../platform/PlatformAdapter';

export type GameMode = 'boot' | 'waking_3d' | 'target_inspect' | 'dream_2d' | 'ending';
export type AuditOutcome = 'none' | 'pruned' | 'unsealed' | 'held';
export type EndingId = 'ending_whole_incomplete' | 'ending_cold_complete' | 'ending_sweet_spot';
export type MinigameGradeTier = 'partial' | 'clean' | 'deep_overclock';
export type HumanityBand = 'warm' | 'mid' | 'cold';
export type SiblingRelation = 'both_warm' | 'both_cold' | 'player_warmer' | 'peer_warmer';
export type PersonaSlotRole = 'anchor' | 'friction' | 'grace';

export interface PersonaSlot {
  slot: PersonaSlotRole;
  id: string;
  status: 'cached' | 'pruned' | 'unsealed';
}

export interface AnomalyRecord {
  targetId: string;
  scanned: boolean;
  grade: MinigameGradeTier | null;
  proofId?: string;
  instrumentCode?: string;
  title?: string;
  principle?: string;
  snippet?: string;
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

export interface EndingEvaluation {
  endingId: EndingId;
  isHollow: boolean;
  isScarred: boolean;
  siblingRelation: SiblingRelation;
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
  activeTargetId: string | null;
  activeDreamPersonaId: string;
  // Axis 1: Identity
  humanity: number;
  maxHumanity: number;
  // Axis 2: Instability & clocks
  chaosDrift: number;
  subjectiveMonthsLeft: number;
  hibernationMonthsElapsed: number;
  // Axis 3: Normalized investigation ledger + derived progress
  anomalyRecords: Record<string, AnomalyRecord>;
  anomalyProgress: number;
  deeperScansCount: number;
  // Axis 4: Institutional friction
  overseerSuspicion: number;
  siblingDesynced: boolean;
  // Axis 5: Relational state
  primarySiblingH: number;
  secondarySiblingFound: boolean;
  personaSlots: PersonaSlot[];
  workingTheory: string | null;
  prologueAnchor: string | null;
  // Derived & compatibility projections (kept synced for renderers/minigames)
  opticalFidelity: number;
  dreamPersonaCache: string[];
  prunedPersonas: string[];
  scannedAnomalyIds: string[];
  decodedMinigameTargets: string[];
  decodedGrades: Record<string, MinigameGradeTier>;
  calibratedInstruments: string[];
  minigameRunCounts: Record<string, number>;
  proofFragments: string[];
  proofDossier: ProofDossierEntry[];
  completedStorylets: string[];
  inkStateJson: string | null;
  overseerAuditActive: boolean;
  wavelengthNm: number;
  lastAuditOutcome: AuditOutcome;
}

const SAVE_SCHEMA_VERSION = 6;
const STORAGE_KEY = 'instance_1419_state_v6';
const LEGACY_STORAGE_KEYS = [
  'instance_1419_state_v5',
  'instance_1419_state_v4',
  'instance_1419_state_v3',
  'instance_1419_spike_state_v2',
];

const DEFAULT_PERSONA_SLOTS: PersonaSlot[] = [
  { slot: 'anchor', id: 'phantom_spouse', status: 'cached' },
  { slot: 'friction', id: 'phantom_wronged', status: 'cached' },
  { slot: 'grace', id: 'phantom_pet', status: 'cached' },
];

export type StateListener = (state: GameState) => void;
export type StatusShiftListener = (event: StatusShiftEvent) => void;

export function getHumanityBand(humanity: number): HumanityBand {
  if (humanity >= balance.humanityBands.warmMin) return 'warm';
  if (humanity >= balance.humanityBands.midMin) return 'mid';
  return 'cold';
}

export function deriveOpticalFidelity(humanity: number, maxHumanity: number): number {
  const cfg = balance.opticalFidelityDerivation;
  const hNorm = Math.max(0, Math.min(1, humanity / 90));
  const scarNorm = Math.max(0, Math.min(1, (90 - maxHumanity) / 75));
  const raw = cfg.base - hNorm * cfg.humanityWeight + scarNorm * cfg.scarWeight;
  const clamped = Math.max(cfg.min, Math.min(cfg.max, raw));
  return Math.round(clamped * 1000) / 1000;
}

export function deriveSiblingRelation(playerH: number, siblingH: number): SiblingRelation {
  const diff = playerH - siblingH;
  if (diff >= 15) return 'player_warmer';
  if (diff <= -15) return 'peer_warmer';
  if (playerH < balance.humanityBands.midMin && siblingH < balance.humanityBands.midMin) {
    return 'both_cold';
  }
  return 'both_warm';
}

export function evaluateEndingDetail(
  state: Pick<GameState, 'anomalyProgress' | 'humanity' | 'maxHumanity' | 'primarySiblingH'>
): EndingEvaluation {
  const rules = shiftsData.endings;
  let endingId: EndingId = 'ending_whole_incomplete';
  if (state.anomalyProgress >= rules.completeThresholdAnomaly) {
    endingId =
      state.humanity < rules.coldThresholdHumanity ? 'ending_cold_complete' : 'ending_sweet_spot';
  }
  const isHollow =
    endingId === 'ending_whole_incomplete' && state.humanity < rules.coldThresholdHumanity;
  const isScarred = state.maxHumanity < balance.petitionUpward.maxHumanityCap;
  const siblingRelation = deriveSiblingRelation(state.humanity, state.primarySiblingH);
  return { endingId, isHollow, isScarred, siblingRelation };
}

function defaultSlotRoleForPersona(personaId: string): PersonaSlotRole {
  if (personaId === 'phantom_wronged' || personaId === 'phantom_rival' || personaId === 'phantom_witness') {
    return 'friction';
  }
  if (personaId === 'phantom_pet' || personaId === 'phantom_stranger' || personaId === 'phantom_grace') {
    return 'grace';
  }
  return 'anchor';
}

function syncDerivedFields(
  state: GameState,
  preserveExplicitOpticalFidelity = false
): GameState {
  const next: GameState = { ...state };

  if (!preserveExplicitOpticalFidelity) {
    next.opticalFidelity = deriveOpticalFidelity(next.humanity, next.maxHumanity);
  }

  // Project persona cache & pruned lists from personaSlots
  next.dreamPersonaCache = next.personaSlots.map((slot) => slot.id);
  next.prunedPersonas = next.personaSlots
    .filter((slot) => slot.status === 'pruned')
    .map((slot) => slot.id);

  // Project legacy anomaly arrays/maps from anomalyRecords
  const scanned: string[] = [];
  const decoded: string[] = [];
  const grades: Record<string, MinigameGradeTier> = {};
  const fragments: string[] = [];
  const dossier: ProofDossierEntry[] = [];

  for (const record of Object.values(next.anomalyRecords)) {
    if (record.scanned) {
      scanned.push(record.targetId);
    }
    if (record.grade) {
      decoded.push(record.targetId);
      grades[record.targetId] = record.grade;
    }
    if (record.proofId && !fragments.includes(record.proofId)) {
      fragments.push(record.proofId);
    }
    if (record.proofId || record.principle || record.snippet) {
      const entryId = record.proofId ?? `proof_${record.targetId}`;
      dossier.push({
        id: entryId,
        targetId: record.targetId,
        instrumentCode: record.instrumentCode ?? 'OPT',
        title: record.title ?? record.targetId.toUpperCase(),
        principle: record.principle ?? record.snippet ?? 'Horizon correlation verified.',
        snippet: record.snippet ?? '',
        grade: record.grade ?? 'clean',
      });
    }
  }

  next.scannedAnomalyIds = scanned;
  next.decodedMinigameTargets = decoded;
  next.decodedGrades = grades;
  next.proofFragments = fragments;
  next.proofDossier = dossier;

  return next;
}

export function createInitialState(): GameState {
  const s = balance.startingState;
  const initialSlots = DEFAULT_PERSONA_SLOTS.map((slot) => ({ ...slot }));
  const base: GameState = {
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    shift: s.shift,
    mode: 'boot',
    activeTargetId: null,
    activeDreamPersonaId: 'phantom_spouse',
    humanity: s.humanity,
    maxHumanity: s.maxHumanity,
    chaosDrift: s.chaosDrift,
    subjectiveMonthsLeft: s.subjectiveMonthsLeft,
    hibernationMonthsElapsed: 0,
    anomalyRecords: {},
    anomalyProgress: s.anomalyProgress,
    deeperScansCount: 0,
    overseerSuspicion: s.overseerSuspicion,
    siblingDesynced: false,
    primarySiblingH: s.primarySiblingH,
    secondarySiblingFound: false,
    personaSlots: initialSlots,
    workingTheory: null,
    prologueAnchor: null,
    opticalFidelity: deriveOpticalFidelity(s.humanity, s.maxHumanity),
    dreamPersonaCache: initialSlots.map((slot) => slot.id),
    prunedPersonas: [],
    scannedAnomalyIds: [],
    decodedMinigameTargets: [],
    decodedGrades: {},
    calibratedInstruments: [],
    minigameRunCounts: {},
    proofFragments: [],
    proofDossier: [],
    completedStorylets: [],
    inkStateJson: null,
    overseerAuditActive: false,
    wavelengthNm: 560,
    lastAuditOutcome: 'none',
  };
  return syncDerivedFields(base);
}

function buildAnomalyRecordsFromLegacy(raw: Partial<GameState>): Record<string, AnomalyRecord> {
  const records: Record<string, AnomalyRecord> = {};
  if (raw.anomalyRecords && typeof raw.anomalyRecords === 'object') {
    for (const [k, rec] of Object.entries(raw.anomalyRecords)) {
      if (rec && typeof rec === 'object') {
        records[k] = { ...rec, targetId: rec.targetId || k };
      }
    }
  }
  for (const tid of raw.scannedAnomalyIds ?? []) {
    records[tid] = {
      ...(records[tid] ?? { targetId: tid, scanned: true, grade: null }),
      scanned: true,
    };
  }
  for (const tid of raw.decodedMinigameTargets ?? []) {
    const grade = raw.decodedGrades?.[tid] ?? 'clean';
    records[tid] = {
      ...(records[tid] ?? { targetId: tid, scanned: false, grade }),
      grade,
    };
  }
  for (const entry of raw.proofDossier ?? []) {
    records[entry.targetId] = {
      ...(records[entry.targetId] ?? { targetId: entry.targetId, scanned: false, grade: entry.grade }),
      grade: records[entry.targetId]?.grade ?? entry.grade,
      proofId: entry.id,
      instrumentCode: entry.instrumentCode,
      title: entry.title,
      principle: entry.principle,
      snippet: entry.snippet,
    };
  }
  return records;
}

function buildPersonaSlotsFromLegacy(raw: Partial<GameState>): PersonaSlot[] {
  if (Array.isArray(raw.personaSlots) && raw.personaSlots.length > 0) {
    return raw.personaSlots.map((s) => ({ ...s }));
  }
  const cache =
    Array.isArray(raw.dreamPersonaCache) && raw.dreamPersonaCache.length > 0
      ? raw.dreamPersonaCache
      : DEFAULT_PERSONA_SLOTS.map((s) => s.id);
  const prunedSet = new Set(Array.isArray(raw.prunedPersonas) ? raw.prunedPersonas : []);
  const slots: PersonaSlot[] = [];
  for (const id of cache) {
    slots.push({
      slot: defaultSlotRoleForPersona(id),
      id,
      status: prunedSet.has(id) ? 'pruned' : 'cached',
    });
  }
  for (const def of DEFAULT_PERSONA_SLOTS) {
    if (!slots.some((s) => s.id === def.id) && cache.length <= 1) {
      slots.push({
        ...def,
        status: prunedSet.has(def.id) ? 'pruned' : 'cached',
      });
    }
  }
  for (const prunedId of prunedSet) {
    if (!slots.some((s) => s.id === prunedId)) {
      slots.push({
        slot: defaultSlotRoleForPersona(prunedId),
        id: prunedId,
        status: 'pruned',
      });
    }
  }
  return slots;
}

function migrateSavedState(raw: Partial<GameState> | null): GameState {
  const base = createInitialState();
  if (!raw || typeof raw !== 'object') return base;
  const merged: GameState = {
    ...base,
    ...raw,
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
  };
  if (merged.mode === 'target_inspect' && !merged.activeTargetId) {
    merged.mode = 'waking_3d';
  }
  merged.anomalyRecords = buildAnomalyRecordsFromLegacy(raw);
  merged.personaSlots = buildPersonaSlotsFromLegacy(raw);
  if (!merged.activeDreamPersonaId) {
    merged.activeDreamPersonaId = merged.personaSlots[0]?.id ?? 'phantom_spouse';
  }
  if (!Array.isArray(merged.calibratedInstruments)) {
    merged.calibratedInstruments = [];
  }
  if (!merged.minigameRunCounts || typeof merged.minigameRunCounts !== 'object') {
    merged.minigameRunCounts = {};
  }
  if (!Array.isArray(merged.completedStorylets)) {
    merged.completedStorylets = [];
  }
  const hasExplicitFidelity = typeof raw.opticalFidelity === 'number' && raw.saveSchemaVersion === SAVE_SCHEMA_VERSION;
  return syncDerivedFields(merged, hasExplicitFidelity);
}

export class StateStore {
  private state: GameState;
  private listeners = new Set<StateListener>();
  private shiftListeners = new Set<StatusShiftListener>();

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

  private commit(next: GameState): void {
    this.state = next;
    platform.saveState(STORAGE_KEY, this.state);
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  /**
   * Persists serialized Ink state quietly without re-emitting UI listeners
   * (prevents recursive render cycles when DialogueRunner advances mid-turn).
   */
  saveInkStateJson(json: string): void {
    this.state = {
      ...this.state,
      inkStateJson: json,
    };
    platform.saveState(STORAGE_KEY, this.state);
  }

  patch(partial: Partial<GameState>): void {
    const merged: GameState = { ...this.state, ...partial, saveSchemaVersion: SAVE_SCHEMA_VERSION };
    const maxCap = balance.petitionUpward.maxHumanityCap;
    const minCeil = balance.pruning.minMaxHumanity;
    merged.maxHumanity = Math.max(minCeil, Math.min(maxCap, Math.round(merged.maxHumanity)));
    merged.humanity = Math.max(0, Math.min(merged.maxHumanity, Math.round(merged.humanity)));
    merged.primarySiblingH = Math.max(10, Math.min(maxCap, Math.round(merged.primarySiblingH)));
    merged.chaosDrift = Math.max(0, Math.min(100, Math.round(merged.chaosDrift)));
    merged.anomalyProgress = Math.max(0, Math.min(100, Math.round(merged.anomalyProgress)));
    merged.wavelengthNm = Math.max(200, Math.min(1800, Math.round(merged.wavelengthNm)));
    merged.shift = Math.max(1, Math.min(shiftsData.shifts.length, Math.round(merged.shift)));

    // Sync personaSlots if caller patched legacy dreamPersonaCache / prunedPersonas directly
    if (partial.prunedPersonas && !partial.personaSlots) {
      const prunedSet = new Set(partial.prunedPersonas);
      merged.personaSlots = merged.personaSlots.map((slot) => ({
        ...slot,
        status: prunedSet.has(slot.id) ? 'pruned' : slot.status === 'pruned' ? 'cached' : slot.status,
      }));
      for (const prunedId of prunedSet) {
        if (!merged.personaSlots.some((s) => s.id === prunedId)) {
          merged.personaSlots.push({
            slot: defaultSlotRoleForPersona(prunedId),
            id: prunedId,
            status: 'pruned',
          });
        }
      }
    } else if (partial.dreamPersonaCache && !partial.personaSlots) {
      const prevMap = new Map(merged.personaSlots.map((s) => [s.id, s]));
      merged.personaSlots = partial.dreamPersonaCache.map(
        (id) => prevMap.get(id) ?? { slot: defaultSlotRoleForPersona(id), id, status: 'cached' }
      );
    }

    const explicitFidelity = typeof partial.opticalFidelity === 'number';
    if (explicitFidelity) {
      merged.opticalFidelity = Math.max(0.25, Math.min(1.0, merged.opticalFidelity));
    }

    this.commit(syncDerivedFields(merged, explicitFidelity));
  }

  pruneHumanity(delta: number, personaId: string): void {
    const step = delta > 0 ? delta : balance.pruning.defaultDelta;
    const threshold = balance.pruning.permanentCeilingThreshold;
    const minCeil = balance.pruning.minMaxHumanity;

    const prevH = this.state.humanity;
    const prevMax = this.state.maxHumanity;
    const rawNextH = Math.max(5, prevH - step);
    let nextMax = prevMax;
    if (rawNextH < threshold) {
      const overshoot = threshold - rawNextH;
      const rubiconCap = threshold - Math.ceil(overshoot / 2);
      nextMax = Math.max(minCeil, Math.min(prevMax - step, rubiconCap));
    }
    const nextH = Math.min(nextMax, rawNextH);

    const hasSlot = this.state.personaSlots.some((s) => s.id === personaId);
    const nextSlots: PersonaSlot[] = hasSlot
      ? this.state.personaSlots.map((s) => (s.id === personaId ? { ...s, status: 'pruned' } : s))
      : [
          ...this.state.personaSlots,
          { slot: defaultSlotRoleForPersona(personaId), id: personaId, status: 'pruned' },
        ];

    this.patch({
      humanity: nextH,
      maxHumanity: nextMax,
      chaosDrift: Math.max(0, this.state.chaosDrift - balance.pruning.chaosRelief),
      subjectiveMonthsLeft: this.state.subjectiveMonthsLeft + balance.pruning.lifespanGainMonths,
      personaSlots: nextSlots,
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
      deeperScansCount: this.state.deeperScansCount + 1,
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
    const existing = this.state.anomalyRecords[anomalyId];
    if (existing?.scanned) return false;
    const prevAnom = this.state.anomalyProgress;
    const nextAnom = Math.min(100, prevAnom + gain);
    const nextRecords: Record<string, AnomalyRecord> = {
      ...this.state.anomalyRecords,
      [anomalyId]: {
        ...(existing ?? { targetId: anomalyId, grade: null }),
        targetId: anomalyId,
        scanned: true,
      },
    };
    this.patch({
      anomalyRecords: nextRecords,
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
          grade?: MinigameGradeTier;
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
    const gradeRank: Record<MinigameGradeTier, number> = {
      partial: 1,
      clean: 2,
      deep_overclock: 3,
    };
    const gradePayoutMap: Record<MinigameGradeTier, number> = {
      partial: balance.minigames.payouts.partial.anomalyGain,
      clean: balance.minigames.payouts.clean.anomalyGain,
      deep_overclock: balance.minigames.payouts.deep_overclock.anomalyGain,
    };

    const existingRecord = this.state.anomalyRecords[targetId];
    const prevGrade = existingRecord?.grade ?? undefined;
    const nextGrade: MinigameGradeTier = opts.grade ?? 'clean';
    const already = Boolean(prevGrade);
    const fullGain = opts.anomalyGain ?? gradePayoutMap[nextGrade] ?? balance.minigames.payouts.clean.anomalyGain;

    let awardedGain = 0;
    let upgraded = false;
    if (!already) {
      awardedGain = fullGain;
    } else if (prevGrade && gradeRank[nextGrade] > gradeRank[prevGrade]) {
      awardedGain = Math.max(0, fullGain - gradePayoutMap[prevGrade]);
      upgraded = true;
    }

    const prevAnom = this.state.anomalyProgress;
    const nextAnom = Math.min(100, prevAnom + awardedGain);
    const applyRiskDeltas = !already || upgraded;
    const nextChaos = applyRiskDeltas
      ? Math.max(0, Math.min(100, this.state.chaosDrift + (opts.chaosDelta ?? 0)))
      : this.state.chaosDrift;
    const nextSusp = applyRiskDeltas
      ? Math.max(0, this.state.overseerSuspicion + (opts.suspicionDelta ?? 0))
      : this.state.overseerSuspicion;
    const nextH = applyRiskDeltas
      ? Math.max(5, Math.min(this.state.maxHumanity, this.state.humanity + (opts.humanityDelta ?? 0)))
      : this.state.humanity;

    const resolvedGrade =
      !prevGrade || gradeRank[nextGrade] > gradeRank[prevGrade] ? nextGrade : prevGrade;

    if (
      !already ||
      upgraded ||
      opts.proofFragmentId ||
      opts.physicalPrinciple ||
      opts.dossierSnippet
    ) {
      const nextRecords: Record<string, AnomalyRecord> = {
        ...this.state.anomalyRecords,
        [targetId]: {
          targetId,
          scanned: existingRecord?.scanned ?? false,
          grade: resolvedGrade,
          proofId: opts.proofFragmentId ?? existingRecord?.proofId,
          instrumentCode: opts.instrumentCode ?? existingRecord?.instrumentCode ?? 'OPT',
          title: label || existingRecord?.title,
          principle:
            opts.physicalPrinciple ??
            opts.dossierSnippet ??
            existingRecord?.principle ??
            'Horizon correlation verified.',
          snippet: opts.dossierSnippet ?? existingRecord?.snippet ?? '',
        },
      };

      this.patch({
        anomalyRecords: nextRecords,
        anomalyProgress: nextAnom,
        chaosDrift: nextChaos,
        overseerSuspicion: nextSusp,
        humanity: nextH,
      });
    }

    const copy = uiCopy.statusAlerts.targetDecoded;
    const gradeLabel =
      resolvedGrade === 'deep_overclock'
        ? ' [OVERCLOCK PROOF]'
        : resolvedGrade === 'partial'
        ? ' [PARTIAL LOG]'
        : '';
    this.emitStatusShift({
      tone: 'discovery',
      title: `${label} ${copy.titleSuffix}${gradeLabel}`,
      detail: opts.dossierSnippet || (already && !upgraded ? copy.detailRepeat : copy.detailFirst),
      prevValue: prevAnom,
      nextValue: nextAnom,
      unit: '%',
    });
    platform.triggerHaptic('shutterCommit', 1.0);
    return !already || upgraded;
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

    // Advance Primary Sibling H% deterministically inside next shift's drift envelope
    const [driftMin, driftMax] = nextDef.siblingDriftRange;
    const playerWarmRatio = Math.max(0, Math.min(1, (this.state.humanity - 20) / 70));
    const targetSiblingH = Math.round(
      driftMin + (driftMax - driftMin) * (0.68 - playerWarmRatio * 0.36)
    );
    const nextSiblingH = Math.min(this.state.primarySiblingH, Math.max(driftMin, Math.min(driftMax, targetSiblingH)));
    const desynced =
      this.state.siblingDesynced ||
      this.state.overseerSuspicion >= nextDef.desyncSuspicionThreshold;
    const hibDelta = nextDef.hibernationMonthsElapsed ?? 0;

    this.patch({
      shift: nextShift,
      chaosDrift: Math.max(
        0,
        this.state.chaosDrift + nextDef.baseChaosPerShift - balance.dreamDefrag.chaosRelief
      ),
      subjectiveMonthsLeft: Math.max(0, this.state.subjectiveMonthsLeft - currentDef.monthsPerShift),
      hibernationMonthsElapsed: this.state.hibernationMonthsElapsed + hibDelta,
      primarySiblingH: nextSiblingH,
      siblingDesynced: desynced,
    });

    this.emitStatusShift({
      tone: 'discovery',
      title: `${uiCopy.statusAlerts.shiftAdvance.titlePrefix} ${nextShift}`,
      detail: `${nextDef.title} — ${uiCopy.statusAlerts.shiftAdvance.detail}`,
      prevValue: prevShift,
      nextValue: nextShift,
    });
  }

  evaluateEndingDetail(): EndingEvaluation {
    return evaluateEndingDetail(this.state);
  }

  evaluateEnding(): EndingId {
    return evaluateEndingDetail(this.state).endingId;
  }

  markStoryletDone(id: string): void {
    if (this.state.completedStorylets.includes(id)) return;
    this.patch({
      completedStorylets: [...this.state.completedStorylets, id],
    });
  }

  reset(): void {
    platform.clearState(STORAGE_KEY);
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      platform.clearState(legacyKey);
    }
    this.commit(createInitialState());
  }
}
