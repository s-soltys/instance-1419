import { Story } from 'inkjs';
import compiledSpikeStory from '../content/dialogue/compiled/spike_shift1.ink.json';
import {
  deriveSiblingRelation,
  getHumanityBand,
  type AuditOutcome,
  type StateStore,
} from './StateStore';

export interface DialogueEntry {
  text: string;
  speaker: string;
  lineId?: string;
  portrait?: string;
  mood?: string;
  emotion?: string;
  audioCue?: string;
  direction?: string;
  camera?: string;
  beat?: string;
  vo?: boolean;
  auditState?: 'active' | 'inactive';
  isPlayerChoice?: boolean;
}

export interface DialogueChoice {
  index: number;
  text: string;
  requiresHoldPrune?: boolean;
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
}

function parseTags(rawTags: string[] | null): ParsedTags {
  const meta: ParsedTags = { speaker: 'narrator' };
  if (!rawTags) return meta;
  for (const tag of rawTags) {
    const trimmed = tag.trim();
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    const val = trimmed.slice(colon + 1).trim();
    if (key === 'speaker') meta.speaker = val;
    else if (key === 'id') meta.lineId = val;
    else if (key === 'portrait') meta.portrait = val;
    else if (key === 'mood') meta.mood = val;
    else if (key === 'emotion') meta.emotion = val;
    else if (key === 'audio') meta.audioCue = val;
    else if (key === 'direction') meta.direction = val;
    else if (key === 'camera') meta.camera = val;
    else if (key === 'beat') meta.beat = val;
    else if (key === 'vo') meta.vo = val.toLowerCase() === 'true';
    else if (key === 'audit' && (val === 'active' || val === 'inactive')) {
      meta.auditState = val;
    } else if (key === 'auto_interrupt' && val) {
      meta.autoInterruptKnot = val;
    } else if (key === 'resume_dream' && val) {
      meta.resumeDreamKnot = val;
    }
  }
  return meta;
}

function formatPlayerEcho(rawChoiceText: string): string {
  return rawChoiceText
    .replace(/\s*(?:\[|\()HOLD TO COMPRESS(?:\]|\))\s*/gi, '')
    .replace(/\s*\([^)]*(?:%\s*H|Max\s*H|Drift|Optics|Clock|Suspicion)[^)]*\)\s*$/i, '')
    .trim();
}

export class DialogueRunner {
  private story: Story;
  private currentKnot = '';
  private entries: DialogueEntry[] = [];
  private readonly store: StateStore;
  private readonly onAudioCue: (cue: string) => void;

  constructor(store: StateStore, onAudioCue: (cue: string) => void) {
    this.store = store;
    this.onAudioCue = onAudioCue;
    this.story = this.createStory();
    const savedInk = this.store.getState().inkStateJson;
    if (savedInk) {
      this.importStateJson(savedInk);
    }
  }

  private createStory(): Story {
    const story = new Story(compiledSpikeStory as Record<string, unknown>);
    story.BindExternalFunction(
      'prune_humanity',
      (delta: number, personaId: string) => {
        this.store.pruneHumanity(Number(delta), String(personaId));
        this.syncVarsToInk();
      },
      false
    );
    story.BindExternalFunction(
      'petition_overseer',
      (delta: number) => {
        this.store.petitionOverseer(Number(delta));
        this.syncVarsToInk();
      },
      false
    );
    story.BindExternalFunction(
      'shift_chaos',
      (delta: number) => {
        const curr = this.store.getState();
        this.store.patch({ chaosDrift: curr.chaosDrift + Number(delta) });
        this.syncVarsToInk();
      },
      false
    );
    story.BindExternalFunction(
      'record_suspicion',
      (delta: number) => {
        const curr = this.store.getState();
        this.store.patch({ overseerSuspicion: curr.overseerSuspicion + Number(delta) });
        this.syncVarsToInk();
      },
      false
    );
    story.BindExternalFunction(
      'set_audit_outcome',
      (outcome: string) => {
        const valid = outcome === 'pruned' || outcome === 'unsealed' || outcome === 'held' || outcome === 'none';
        if (valid) {
          this.store.setAuditOutcome(outcome as AuditOutcome);
          this.syncVarsToInk();
        }
      },
      false
    );
    return story;
  }

  private setVarIfDeclared(name: string, value: string | number | boolean): void {
    try {
      const globalVars = this.story.variablesState as unknown as {
        GlobalVariableExistsWithName?: (n: string) => boolean;
        $: (n: string, v?: unknown) => unknown;
      };
      if (
        typeof globalVars.GlobalVariableExistsWithName === 'function' &&
        !globalVars.GlobalVariableExistsWithName(name)
      ) {
        return;
      }
      globalVars.$(name, value);
    } catch {
      // Ignore undeclared variables across story revisions
    }
  }

  private syncVarsToInk(): void {
    const s = this.store.getState();
    this.setVarIfDeclared('humanity', s.humanity);
    this.setVarIfDeclared('max_humanity', s.maxHumanity);
    this.setVarIfDeclared('chaos_drift', s.chaosDrift);
    this.setVarIfDeclared('anomaly_progress', s.anomalyProgress);
    this.setVarIfDeclared('primary_sibling_h', s.primarySiblingH);
    this.setVarIfDeclared('overseer_suspicion', s.overseerSuspicion);
    this.setVarIfDeclared('subjective_months', s.subjectiveMonthsLeft);
    this.setVarIfDeclared('spouse_pruned', s.prunedPersonas.includes('phantom_spouse'));
    this.setVarIfDeclared('wronged_pruned', s.prunedPersonas.includes('phantom_wronged'));
    this.setVarIfDeclared('pet_pruned', s.prunedPersonas.includes('phantom_pet'));
    this.setVarIfDeclared('last_audit_outcome', s.lastAuditOutcome);
    this.setVarIfDeclared('shift', s.shift);
    this.setVarIfDeclared('humanity_band', getHumanityBand(s.humanity));
    this.setVarIfDeclared('sibling_relation', deriveSiblingRelation(s.humanity, s.primarySiblingH));
    this.setVarIfDeclared('secondary_sibling_found', s.secondarySiblingFound);
    this.setVarIfDeclared('sibling_desynced', s.siblingDesynced);
    this.setVarIfDeclared('working_theory', s.workingTheory ?? 'none');
    this.setVarIfDeclared('prologue_anchor', s.prologueAnchor ?? 'coffee');
  }

  exportStateJson(): string {
    return this.story.state.ToJson();
  }

  importStateJson(json: string): void {
    try {
      this.story.state.LoadJson(json);
    } catch {
      this.story = this.createStory();
    }
  }

  /**
   * Starts a fresh isolated conversation at the given knot (used for scene resets & QA previews).
   */
  startKnot(knotName: string): DialogueSnapshot {
    this.story = this.createStory();
    this.syncVarsToInk();
    this.currentKnot = knotName;
    this.entries = [];
    this.store.patch({ overseerAuditActive: false });
    this.story.ChoosePathString(knotName);
    return this.advance();
  }

  /**
   * Navigates to a knot on the existing Ink story instance, preserving visit counts and once-only choices.
   */
  goToKnot(knotName: string, resetLog = false): DialogueSnapshot {
    this.syncVarsToInk();
    this.currentKnot = knotName;
    if (resetLog) {
      this.entries = [];
    }
    this.story.ChoosePathString(knotName);
    return this.advance();
  }

  /**
   * Continues onto another knot on the SAME persistent Story instance so visit counts
   * and once-only choices survive Overseer interrupts and multi-turn conversations.
   */
  appendKnot(knotName: string): DialogueSnapshot {
    this.syncVarsToInk();
    this.currentKnot = knotName;
    this.story.ChoosePathString(knotName);
    return this.advance();
  }

  choose(choiceIndex: number, echoPlayer = true): DialogueSnapshot {
    this.syncVarsToInk();
    if (echoPlayer) {
      const selected = this.story.currentChoices.find((c) => c.index === choiceIndex);
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
    this.story.ChooseChoiceIndex(choiceIndex);
    return this.advance();
  }

  private advance(): DialogueSnapshot {
    let lastSpeaker = 'narrator';
    let lastEmotion: string | undefined;
    let lastMood: string | undefined;
    let lastCamera: string | undefined;
    let autoInterruptKnot: string | undefined;
    let resumeDreamKnot: string | undefined;
    const newlyAdded: DialogueEntry[] = [];

    while (this.story.canContinue) {
      const rawLine = this.story.Continue();
      const text = rawLine ? rawLine.trim() : '';
      const meta = parseTags(this.story.currentTags);

      if (meta.autoInterruptKnot) autoInterruptKnot = meta.autoInterruptKnot;
      if (meta.resumeDreamKnot) resumeDreamKnot = meta.resumeDreamKnot;

      if (meta.speaker !== 'narrator') {
        lastSpeaker = meta.speaker;
      } else if (this.story.currentTags && this.story.currentTags.some((t) => t.startsWith('speaker:'))) {
        lastSpeaker = 'narrator';
      } else {
        meta.speaker = lastSpeaker;
      }

      if (meta.emotion) {
        lastEmotion = meta.emotion;
      } else {
        meta.emotion = lastEmotion;
      }

      if (meta.mood) {
        lastMood = meta.mood;
      } else {
        meta.mood = lastMood;
      }

      if (meta.camera) {
        lastCamera = meta.camera;
      } else {
        meta.camera = lastCamera;
      }

      if (meta.auditState === 'active') {
        this.store.patch({ overseerAuditActive: true });
      } else if (meta.auditState === 'inactive') {
        this.store.patch({ overseerAuditActive: false });
      }

      if (meta.audioCue) {
        this.onAudioCue(meta.audioCue);
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
          direction: meta.direction,
          camera: meta.camera,
          beat: meta.beat,
          vo: meta.vo,
          auditState: meta.auditState,
        };
        this.entries.push(entry);
        newlyAdded.push(entry);
      }
    }

    this.store.saveInkStateJson(this.exportStateJson());

    const choices: DialogueChoice[] = this.story.currentChoices.map((c) => {
      const requiresHoldPrune = /(?:\[|\()HOLD TO COMPRESS(?:\]|\))/i.test(c.text);
      return {
        index: c.index,
        text: c.text.replace(/\s*(?:\[|\()HOLD TO COMPRESS(?:\]|\))\s*/gi, '').trim(),
        requiresHoldPrune,
      };
    });

    return {
      knot: this.currentKnot,
      entries: [...this.entries],
      lastAddedEntries: newlyAdded,
      choices,
      ended: choices.length === 0 && !this.story.canContinue,
      autoInterruptKnot,
      resumeDreamKnot,
    };
  }
}
