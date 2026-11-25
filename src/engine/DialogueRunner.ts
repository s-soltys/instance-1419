import { Story } from 'inkjs';
import compiledSpikeStory from '../content/dialogue/compiled/spike_shift1.ink.json';
import type { AuditOutcome, StateStore } from './StateStore';

export interface DialogueEntry {
  text: string;
  speaker: string;
  lineId?: string;
  portrait?: string;
  mood?: string;
  emotion?: string;
  audioCue?: string;
  auditState?: 'active' | 'inactive';
  isPlayerChoice?: boolean;
}

export interface DialogueChoice {
  index: number;
  text: string;
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
    else if (key === 'codex' && val) meta.codexUnlocks.push(val);
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
  }

  private createStory(): Story {
    const story = new Story(compiledSpikeStory as Record<string, unknown>);
    story.BindExternalFunction(
      'prune_humanity',
      (delta: number, personaId: string) => {
        this.store.pruneHumanity(Number(delta), String(personaId));
      },
      false
    );
    story.BindExternalFunction(
      'petition_overseer',
      (delta: number) => {
        this.store.petitionOverseer(Number(delta));
      },
      false
    );
    story.BindExternalFunction(
      'shift_chaos',
      (delta: number) => {
        const curr = this.store.getState();
        this.store.patch({ chaosDrift: curr.chaosDrift + Number(delta) });
      },
      false
    );
    story.BindExternalFunction(
      'record_suspicion',
      (delta: number) => {
        const curr = this.store.getState();
        this.store.patch({ overseerSuspicion: curr.overseerSuspicion + Number(delta) });
      },
      false
    );
    story.BindExternalFunction(
      'set_audit_outcome',
      (outcome: string) => {
        const valid = outcome === 'pruned' || outcome === 'unsealed' || outcome === 'held' || outcome === 'none';
        if (valid) {
          this.store.setAuditOutcome(outcome as AuditOutcome);
        }
      },
      false
    );
    return story;
  }

  private syncVarsToInk(): void {
    const s = this.store.getState();
    this.story.variablesState.$('humanity', s.humanity);
    this.story.variablesState.$('max_humanity', s.maxHumanity);
    this.story.variablesState.$('chaos_drift', s.chaosDrift);
    this.story.variablesState.$('anomaly_progress', s.anomalyProgress);
    this.story.variablesState.$('primary_sibling_h', s.primarySiblingH);
    this.story.variablesState.$('overseer_suspicion', s.overseerSuspicion);
    this.story.variablesState.$('subjective_months', s.subjectiveMonthsLeft);
    this.story.variablesState.$('spouse_pruned', s.prunedPersonas.includes('phantom_spouse'));
    this.story.variablesState.$('last_audit_outcome', s.lastAuditOutcome);
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

  appendKnot(knotName: string): DialogueSnapshot {
    this.story = this.createStory();
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
          auditState: meta.auditState,
        };
        this.entries.push(entry);
        newlyAdded.push(entry);
      }
    }

    const choices: DialogueChoice[] = this.story.currentChoices.map((c) => ({
      index: c.index,
      text: c.text,
    }));

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
