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
  private story: Story | null = null;
  private currentKnot = '';
  private entries: DialogueEntry[] = [];
  private readonly store: StateStore;
  private readonly onAudioCue: (cue: string) => void;

  constructor(store: StateStore, onAudioCue: (cue: string) => void) {
    this.store = store;
    this.onAudioCue = onAudioCue;
  }

  private ensureStory(): Story {
    if (!this.story) {
      this.story = this.createStory();
    }
    return this.story;
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
    const story = this.ensureStory();
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
          auditState: meta.auditState,
        };
        this.entries.push(entry);
        newlyAdded.push(entry);
      }
    }

    const choices: DialogueChoice[] = story.currentChoices.map((c) => ({
      index: c.index,
      text: c.text,
    }));

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
