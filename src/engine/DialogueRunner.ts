import { Story } from 'inkjs';
import compiledSpikeStory from '../content/dialogue/compiled/spike_shift1.ink.json';
import type { StateStore } from './StateStore';

export interface DialogueEntry {
  text: string;
  speaker: string;
  portrait?: string;
  mood?: string;
  audioCue?: string;
  auditState?: 'active' | 'inactive';
}

export interface DialogueChoice {
  index: number;
  text: string;
}

export interface DialogueSnapshot {
  knot: string;
  entries: DialogueEntry[];
  choices: DialogueChoice[];
  ended: boolean;
}

function parseTags(rawTags: string[] | null): Omit<DialogueEntry, 'text'> {
  const meta: Omit<DialogueEntry, 'text'> = { speaker: 'narrator' };
  if (!rawTags) return meta;
  for (const tag of rawTags) {
    const trimmed = tag.trim();
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    const val = trimmed.slice(colon + 1).trim();
    if (key === 'speaker') meta.speaker = val;
    else if (key === 'portrait') meta.portrait = val;
    else if (key === 'mood') meta.mood = val;
    else if (key === 'audio') meta.audioCue = val;
    else if (key === 'audit' && (val === 'active' || val === 'inactive')) {
      meta.auditState = val;
    }
  }
  return meta;
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
    this.story.variablesState.$('spouse_pruned', s.prunedPersonas.includes('phantom_spouse'));
  }

  startKnot(knotName: string): DialogueSnapshot {
    this.story = this.createStory();
    this.syncVarsToInk();
    this.currentKnot = knotName;
    this.entries = [];
    this.store.patch({ overseerAuditActive: false });
    this.story.ChoosePathString(knotName);
    return this.advance();
  }

  choose(choiceIndex: number): DialogueSnapshot {
    this.syncVarsToInk();
    this.story.ChooseChoiceIndex(choiceIndex);
    return this.advance();
  }

  private advance(): DialogueSnapshot {
    let lastSpeaker = 'narrator';
    while (this.story.canContinue) {
      const rawLine = this.story.Continue();
      const text = rawLine ? rawLine.trim() : '';
      const meta = parseTags(this.story.currentTags);
      if (meta.speaker !== 'narrator') {
        lastSpeaker = meta.speaker;
      } else if (this.story.currentTags && this.story.currentTags.some((t) => t.startsWith('speaker:'))) {
        lastSpeaker = 'narrator';
      } else {
        meta.speaker = lastSpeaker;
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
        this.entries.push({ text, ...meta });
      }
    }

    const choices: DialogueChoice[] = this.story.currentChoices.map((c) => ({
      index: c.index,
      text: c.text,
    }));

    return {
      knot: this.currentKnot,
      entries: [...this.entries],
      choices,
      ended: choices.length === 0 && !this.story.canContinue,
    };
  }
}
