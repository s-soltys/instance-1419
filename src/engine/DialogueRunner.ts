import { Story } from 'inkjs';
import anomaliesData from '../content/anomalies.json';
import compiledSpikeStory from '../content/dialogue/compiled/spike_shift1.ink.json';
import pacing from '../content/pacing.json';
import type { AuditOutcome, StateStore } from './StateStore';

export type ChoiceAffinity = 'warm' | 'cold';
export type ChoiceWeight = 'explore' | 'consequential' | 'permanent';
export type ChoiceKind = 'ask' | 'reply' | 'action' | 'prune';

export interface DialogueEntry {
  text: string;
  speaker: string;
  lineId?: string;
  portrait?: string;
  mood?: string;
  emotion?: string;
  audioCue?: string;
  visualCue?: string;
  animCue?: string;
  tableauCue?: string;
  hWaveCue?: string;
  whisper?: boolean;
  pauseBeforeMs?: number;
  auditState?: 'active' | 'inactive';
  isPlayerChoice?: boolean;
}

export type DialogueLine = DialogueEntry;

export interface DialogueChoice {
  index: number;
  text: string;
  affinity?: ChoiceAffinity;
  weight?: ChoiceWeight;
  kind?: ChoiceKind;
  costHint?: string;
  tags?: string[];
}

export interface DialogueSnapshot {
  knot: string;
  entries: DialogueEntry[];
  lastAddedEntries: DialogueEntry[];
  choices: DialogueChoice[];
  ended: boolean;
  autoInterruptKnot?: string;
  resumeDreamKnot?: string;
}

interface ParsedTags extends Omit<DialogueEntry, 'text' | 'isPlayerChoice'> {
  autoInterruptKnot?: string;
  resumeDreamKnot?: string;
  codexUnlocks: string[];
}

function parseTags(rawTags: string[] | null): ParsedTags {
  const meta: ParsedTags = { speaker: 'narrator', codexUnlocks: [] };
  if (!rawTags) return meta;
  for (const tag of rawTags) {
    const trimmed = tag.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(':');
    if (colon === -1) {
      if (trimmed.toLowerCase() === 'whisper') {
        meta.whisper = true;
      }
      continue;
    }
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    const val = trimmed.slice(colon + 1).trim();
    if (key === 'speaker') meta.speaker = val;
    else if (key === 'id') meta.lineId = val;
    else if (key === 'portrait') meta.portrait = val;
    else if (key === 'mood') meta.mood = val;
    else if (key === 'emotion') meta.emotion = val;
    else if ((key === 'audio' || key === 'sound') && val) meta.audioCue = val;
    else if (key === 'visual' && val) meta.visualCue = val;
    else if (key === 'anim' && val) meta.animCue = val;
    else if (key === 'tableau' && val) meta.tableauCue = val;
    else if (key === 'h_wave' && val) meta.hWaveCue = val;
    else if (key === 'whisper') meta.whisper = val.toLowerCase() !== 'false' && val !== '0';
    else if (key === 'pause' && val) {
      const ms = Number(val);
      if (Number.isFinite(ms) && ms > 0) meta.pauseBeforeMs = Math.min(8000, Math.round(ms));
    } else if (key === 'beat' && val) {
      const b = val.toLowerCase();
      if (b === 'long') meta.pauseBeforeMs = pacing.dialogue.beatLongMs;
      else if (b === 'short') meta.pauseBeforeMs = pacing.dialogue.beatShortMs;
    } else if (key === 'codex' && val) meta.codexUnlocks.push(val);
    else if (key === 'audit' && (val === 'active' || val === 'inactive')) {
      meta.auditState = val;
    } else if (key === 'auto_interrupt' && val) {
      meta.autoInterruptKnot = val;
    } else if (key === 'interrupt' && val) {
      meta.autoInterruptKnot = val === 'overseer' ? 'overseer_interrogation' : val;
    } else if (key === 'resume_dream' && val) {
      meta.resumeDreamKnot = val;
    }
  }
  return meta;
}

interface ParsedChoiceTags {
  affinity?: ChoiceAffinity;
  weight?: ChoiceWeight;
  kind?: ChoiceKind;
  costHint?: string;
}

function parseChoiceTags(rawTags: string[] | null | undefined): ParsedChoiceTags {
  const out: ParsedChoiceTags = {};
  if (!rawTags) return out;
  for (const tag of rawTags) {
    const trimmed = tag.trim();
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    const val = trimmed.slice(colon + 1).trim();
    const valLower = val.toLowerCase();
    if (key === 'affinity' && (valLower === 'warm' || valLower === 'cold')) {
      out.affinity = valLower;
    } else if (
      key === 'weight' &&
      (valLower === 'explore' || valLower === 'consequential' || valLower === 'permanent')
    ) {
      out.weight = valLower;
    } else if (
      key === 'kind' &&
      (valLower === 'ask' || valLower === 'reply' || valLower === 'action' || valLower === 'prune')
    ) {
      out.kind = valLower;
    } else if (key === 'hint' && val) {
      out.costHint = val;
    }
  }
  return out;
}

function formatPlayerEcho(rawChoiceText: string): string {
  return rawChoiceText
    .replace(/\s*\([^)]*(?:%\s*H|Max\s*H|Drift|Optics|Clock|Suspicion)[^)]*\)\s*$/i, '')
    .trim();
}

export class DialogueRunner {
  private story: Story | null = null;
  private currentKnot = '';
  private entries: DialogueEntry[] = [];
  private readonly store: StateStore;
  private readonly onAudioCue: (cue: string) => void;
  private readonly storyJson: Record<string, unknown>;
  private readonly persistSession: boolean;
  private readonly onEndingCallback?: (endingId: string, variant: string) => void;

  constructor(
    store: StateStore,
    onAudioCue: (cue: string) => void,
    storyJson: Record<string, unknown> = compiledSpikeStory as Record<string, unknown>,
    options?: { persistSession?: boolean; onEnding?: (endingId: string, variant: string) => void } | boolean
  ) {
    this.store = store;
    this.onAudioCue = onAudioCue;
    this.storyJson = storyJson;
    this.persistSession = typeof options === 'boolean' ? options : Boolean(options?.persistSession);
    this.onEndingCallback = typeof options === 'object' ? options?.onEnding : undefined;
  }

  private ensureStory(): Story {
    if (!this.story) {
      this.story = this.createStory();
      if (this.persistSession) {
        const savedJson = this.store.getState().inkStateJson;
        if (savedJson) {
          try {
            this.story.state.LoadJson(savedJson);
          } catch {
            // Ignore malformed or schema-mismatched saved Ink snapshot
          }
        }
      }
    }
    return this.story;
  }

  private bindOptionalExternal(
    story: Story,
    name: string,
    fn: (...args: unknown[]) => void
  ): void {
    try {
      story.BindExternalFunction(name, fn, false);
    } catch {
      // Optional EXTERNAL not declared in the currently compiled Ink bundle
    }
  }

  private createStory(): Story {
    const story = new Story(this.storyJson);
    story.BindExternalFunction(
      'prune_humanity',
      (delta: number, personaId: string) => {
        this.store.pruneHumanity(Number(delta), String(personaId));
        this.syncVarsToInk(story);
      },
      false
    );
    story.BindExternalFunction(
      'petition_overseer',
      (delta: number) => {
        this.store.petitionOverseer(Number(delta));
        this.syncVarsToInk(story);
      },
      false
    );
    story.BindExternalFunction(
      'shift_chaos',
      (delta: number) => {
        const curr = this.store.getState();
        this.store.patch({ chaosDrift: curr.chaosDrift + Number(delta) });
        this.syncVarsToInk(story);
      },
      false
    );
    story.BindExternalFunction(
      'record_suspicion',
      (delta: number) => {
        const curr = this.store.getState();
        this.store.patch({ overseerSuspicion: curr.overseerSuspicion + Number(delta) });
        this.syncVarsToInk(story);
      },
      false
    );
    story.BindExternalFunction(
      'set_audit_outcome',
      (outcome: string) => {
        const valid = outcome === 'pruned' || outcome === 'unsealed' || outcome === 'held' || outcome === 'none';
        if (valid) {
          this.store.setAuditOutcome(outcome as AuditOutcome);
          this.syncVarsToInk(story);
        }
      },
      false
    );

    this.bindOptionalExternal(story, 'set_flag', (name: unknown, val: unknown) => {
      this.store.setStoryFlag(String(name), Boolean(val));
      this.syncVarsToInk(story);
    });
    this.bindOptionalExternal(story, 'unlock_codex', (id: unknown) => {
      this.store.unlockCodexKey(String(id));
      this.syncVarsToInk(story);
    });
    this.bindOptionalExternal(story, 'set_active_persona', (id: unknown) => {
      this.store.setActiveDreamPersona(String(id));
      this.syncVarsToInk(story);
    });
    this.bindOptionalExternal(story, 'record_room_visit', (personaId: unknown) => {
      this.store.recordDreamRoomVisit(String(personaId));
      this.syncVarsToInk(story);
    });
    this.bindOptionalExternal(story, 'mark_secondary_found', () => {
      this.store.markSecondarySiblingFound();
      this.syncVarsToInk(story);
    });
    this.bindOptionalExternal(story, 'adjust_sibling_h', (delta: unknown) => {
      this.store.adjustPrimarySiblingH(Number(delta));
      this.syncVarsToInk(story);
    });
    this.bindOptionalExternal(story, 'set_overseer_desync', (flag: unknown) => {
      this.store.setOverseerDesynced(Boolean(flag));
      this.syncVarsToInk(story);
    });
    this.bindOptionalExternal(story, 'force_crude_smiley', (flag: unknown) => {
      this.store.setCrudeSmileyForced(Boolean(flag));
      this.syncVarsToInk(story);
    });
    this.bindOptionalExternal(story, 'enter_ending', (id: unknown, variant: unknown) => {
      const endingId = String(id || 'warm_incomplete');
      const v = variant ? String(variant) : 'standard';
      this.store.recordEnding(endingId, v);
      this.onEndingCallback?.(endingId, v);
      this.syncVarsToInk(story);
    });

    return story;
  }

  private setInkVarIfDeclared(story: Story, name: string, value: number | string | boolean): void {
    try {
      const existing = story.variablesState.$(name);
      if (existing !== null && existing !== undefined) {
        story.variablesState.$(name, value);
      }
    } catch {
      // Ignore variables not yet declared in compiled story JSON
    }
  }

  private syncVarsToInk(targetStory?: Story): void {
    const story = targetStory ?? this.ensureStory();
    const s = this.store.getState();
    story.variablesState.$('humanity', s.humanity);
    story.variablesState.$('max_humanity', s.maxHumanity);
    story.variablesState.$('chaos_drift', s.chaosDrift);
    story.variablesState.$('anomaly_progress', s.anomalyProgress);
    story.variablesState.$('primary_sibling_h', s.primarySiblingH);
    story.variablesState.$('overseer_suspicion', s.overseerSuspicion);
    story.variablesState.$('subjective_months', s.subjectiveMonthsLeft);
    story.variablesState.$('spouse_pruned', s.prunedPersonas.includes('phantom_spouse'));
    story.variablesState.$('last_audit_outcome', s.lastAuditOutcome);
    this.setInkVarIfDeclared(story, 'current_shift', s.shift);
    this.setInkVarIfDeclared(story, 'secondary_sibling_found', s.secondarySiblingFound);
    this.setInkVarIfDeclared(story, 'overseer_desynced', s.overseerDesynced);
    this.setInkVarIfDeclared(story, 'crude_smiley_forced', s.crudeSmileyForced);
    this.setInkVarIfDeclared(story, 'dream_rooms_visited', s.dreamVisitedRoomsThisShift.length);
    this.setInkVarIfDeclared(story, 'active_dream_persona', s.activeDreamPersonaId);
    this.setInkVarIfDeclared(story, 'elapsed_real_years', s.elapsedRealYears);
    this.setInkVarIfDeclared(story, 'optical_fidelity_pct', Math.round(s.opticalFidelity * 100));

    const quota = this.store.getShiftQuotaStatus(s.shift);
    this.setInkVarIfDeclared(story, 'shift_required_done', quota.requiredDone);
    this.setInkVarIfDeclared(story, 'shift_optional_done', quota.optionalDone);
    this.setInkVarIfDeclared(story, 'shift_mandate_met', quota.mandateMet);
    this.setInkVarIfDeclared(story, 'total_decoded', s.decodedMinigameTargets.length);
    const lastDecoded =
      s.decodedMinigameTargets.length > 0
        ? s.decodedMinigameTargets[s.decodedMinigameTargets.length - 1]
        : '';
    this.setInkVarIfDeclared(story, 'last_decoded_target', lastDecoded);
    this.setInkVarIfDeclared(
      story,
      'shift1_optional_scan_done',
      s.shift === 1 ? quota.optionalDone > 0 : false
    );

    for (const pid of s.dreamPersonaCache) {
      const short = pid.replace(/^phantom_/, '');
      this.setInkVarIfDeclared(story, `cached_${short}`, true);
    }
    for (const pid of s.prunedPersonas) {
      const short = pid.replace(/^phantom_/, '');
      this.setInkVarIfDeclared(story, `pruned_${short}`, true);
    }
    for (const [flagKey, flagVal] of Object.entries(s.storyFlags)) {
      this.setInkVarIfDeclared(story, flagKey, flagVal);
      this.setInkVarIfDeclared(story, `flag_${flagKey}`, flagVal);
    }

    for (const anomaly of anomaliesData.anomalies) {
      const flag = anomaly.postScanEcho?.storyFlag;
      if (flag) {
        this.setInkVarIfDeclared(story, flag, s.decodedMinigameTargets.includes(anomaly.id));
      }
    }
  }

  exportStateJson(): string {
    return this.ensureStory().state.ToJson();
  }

  importStateJson(json: string): void {
    try {
      this.ensureStory().state.LoadJson(json);
    } catch {
      this.story = this.createStory();
    }
  }

  hasKnot(knotName: string): boolean {
    if (!knotName) return false;
    try {
      return Boolean(this.ensureStory().KnotContainerWithName(knotName));
    } catch {
      return false;
    }
  }

  /**
   * Starts a fresh isolated conversation at the given knot (reusing compiled Story via ResetState).
   */
  startKnot(knotName: string): DialogueSnapshot {
    const story = this.ensureStory();
    story.ResetState();
    this.syncVarsToInk();
    this.currentKnot = knotName;
    this.entries = [];
    this.store.patch({ overseerAuditActive: false });
    story.ChoosePathString(knotName);
    return this.advance();
  }

  /**
   * Navigates to a knot on the existing Ink story instance, preserving visit counts and once-only choices.
   */
  goToKnot(knotName: string, resetLog = false): DialogueSnapshot {
    const story = this.ensureStory();
    this.syncVarsToInk();
    this.currentKnot = knotName;
    if (resetLog) {
      this.entries = [];
    }
    story.ChoosePathString(knotName);
    return this.advance();
  }

  appendKnot(knotName: string): DialogueSnapshot {
    const story = this.ensureStory();
    story.ResetState();
    this.syncVarsToInk();
    this.currentKnot = knotName;
    story.ChoosePathString(knotName);
    return this.advance();
  }

  choose(choiceIndex: number, echoPlayer = true): DialogueSnapshot {
    const story = this.ensureStory();
    this.syncVarsToInk();
    if (echoPlayer) {
      const selected = story.currentChoices.find((c) => c.index === choiceIndex);
      if (selected?.text) {
        const echoText = formatPlayerEcho(selected.text);
        if (echoText) {
          this.entries.push({
            text: echoText,
            speaker: 'player',
            isPlayerChoice: true,
          });
        }
      }
    }
    story.ChooseChoiceIndex(choiceIndex);
    return this.advance();
  }

  private advance(): DialogueSnapshot {
    const story = this.ensureStory();
    let lastSpeaker = 'narrator';
    let lastEmotion: string | undefined;
    let autoInterruptKnot: string | undefined;
    let resumeDreamKnot: string | undefined;
    const newlyAdded: DialogueEntry[] = [];

    while (story.canContinue) {
      const rawLine = story.Continue();
      const text = rawLine ? rawLine.trim() : '';
      const meta = parseTags(story.currentTags);

      if (meta.autoInterruptKnot) autoInterruptKnot = meta.autoInterruptKnot;
      if (meta.resumeDreamKnot) resumeDreamKnot = meta.resumeDreamKnot;

      if (meta.speaker !== 'narrator') {
        lastSpeaker = meta.speaker;
      } else if (story.currentTags && story.currentTags.some((t) => t.startsWith('speaker:'))) {
        lastSpeaker = 'narrator';
      } else {
        meta.speaker = lastSpeaker;
      }

      if (meta.emotion) {
        lastEmotion = meta.emotion;
      } else {
        meta.emotion = lastEmotion;
      }

      if (meta.auditState === 'active') {
        this.store.patch({ overseerAuditActive: true });
      } else if (meta.auditState === 'inactive') {
        this.store.patch({ overseerAuditActive: false });
      }

      if (meta.audioCue) {
        this.onAudioCue(meta.audioCue);
      }

      for (const codexKey of meta.codexUnlocks) {
        this.store.unlockCodexKey(codexKey);
      }

      if (text.length > 0) {
        const entry: DialogueEntry = {
          text,
          speaker: meta.speaker,
          lineId: meta.lineId,
          portrait: meta.portrait,
          mood: meta.mood,
          emotion: meta.emotion,
          audioCue: meta.audioCue,
          visualCue: meta.visualCue,
          animCue: meta.animCue,
          tableauCue: meta.tableauCue,
          hWaveCue: meta.hWaveCue,
          whisper: meta.whisper,
          pauseBeforeMs: meta.pauseBeforeMs,
          auditState: meta.auditState,
        };
        this.entries.push(entry);
        newlyAdded.push(entry);
      }
    }

    const choices: DialogueChoice[] = story.currentChoices.map((c) => {
      const rawTags = (c as { tags?: string[] | null }).tags ?? undefined;
      const parsed = parseChoiceTags(rawTags);
      return {
        index: c.index,
        text: c.text,
        ...(parsed.affinity ? { affinity: parsed.affinity } : {}),
        ...(parsed.weight ? { weight: parsed.weight } : {}),
        ...(parsed.kind ? { kind: parsed.kind } : {}),
        ...(parsed.costHint ? { costHint: parsed.costHint } : {}),
        ...(rawTags && rawTags.length > 0 ? { tags: [...rawTags] } : {}),
      };
    });

    if (this.persistSession) {
      this.store.setInkStateJson(story.state.ToJson());
    }

    return {
      knot: this.currentKnot,
      entries: [...this.entries],
      lastAddedEntries: newlyAdded,
      choices,
      ended: choices.length === 0 && !story.canContinue,
      autoInterruptKnot,
      resumeDreamKnot,
    };
  }
}
