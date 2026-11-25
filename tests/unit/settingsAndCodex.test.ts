import { beforeEach, describe, expect, it } from 'vitest';
import { CodexEngine } from '../../src/engine/CodexEngine';
import { DialogueRunner } from '../../src/engine/DialogueRunner';
import { SettingsStore } from '../../src/engine/SettingsStore';
import { StateStore } from '../../src/engine/StateStore';

describe('SettingsStore persistence and sanitization', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists music, voice, display, and haptic preferences across store instances independently of run state', () => {
    const settingsA = new SettingsStore();
    settingsA.patch({
      musicEnabled: false,
      musicVolume: 0.45,
      voiceEnabled: false,
      voiceVolume: 0.6,
      textSize: 'large',
      dialoguePacing: 'instant',
      reducedMotion: true,
      graphicsQuality: 'performance',
      hapticsEnabled: false,
    });

    // Resetting GameState must NOT clear user preferences
    const gameStore = new StateStore();
    gameStore.reset();

    const settingsB = new SettingsStore();
    const s = settingsB.getSettings();
    expect(s.musicEnabled).toBe(false);
    expect(s.musicVolume).toBe(0.45);
    expect(s.voiceEnabled).toBe(false);
    expect(s.voiceVolume).toBe(0.6);
    expect(s.textSize).toBe('large');
    expect(s.dialoguePacing).toBe('instant');
    expect(s.reducedMotion).toBe(true);
    expect(s.graphicsQuality).toBe('performance');
    expect(s.hapticsEnabled).toBe(false);

    settingsB.resetToDefaults();
    expect(settingsB.getSettings().musicEnabled).toBe(true);
    expect(settingsB.getSettings().voiceEnabled).toBe(true);
  });
});

describe('CodexEngine progressive unlocking, unread tracking, and H%-reactive annotations', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('gradually expands entries as anomalies are scanned, decoded, pruned, and discussed in dialogue', () => {
    const store = new StateStore();
    const codex = new CodexEngine();

    const initial = codex.resolve(store.getState());
    const j1419Initial = initial.entries.find((e) => e.spec.id === 'celestial_cluster_j1419')!;
    expect(j1419Initial.unlockedStages).toHaveLength(1);
    expect(j1419Initial.statusLabel).toBe('READ');
    expect(j1419Initial.hasUnread).toBe(false);
    expect(initial.totalUnread).toBe(0);
    expect(j1419Initial.annotationBand).toBe('warm');

    // Scanning the anomaly unlocks stage 2 and marks entry UPDATED
    store.recordAnomalyScan('cluster_j1419_a', 3, 'CLUSTER J1419-A');
    const afterScan = codex.resolve(store.getState());
    const j1419Scanned = afterScan.entries.find((e) => e.spec.id === 'celestial_cluster_j1419')!;
    expect(j1419Scanned.unlockedStages).toHaveLength(2);
    expect(j1419Scanned.statusLabel).toBe('UPDATED');
    expect(j1419Scanned.hasUnread).toBe(true);
    expect(j1419Scanned.unlockedStages[1].isNew).toBe(true);

    // Viewing the entry marks Stage 2 seen cleanly
    store.markCodexEntrySeen('celestial_cluster_j1419', 2);
    const afterRead = codex.resolve(store.getState());
    const j1419Read = afterRead.entries.find((e) => e.spec.id === 'celestial_cluster_j1419')!;
    expect(j1419Read.statusLabel).toBe('READ');
    expect(j1419Read.hasUnread).toBe(false);

    // Decoding the anomaly unlocks stage 3
    store.recordMinigameCompletion('cluster_j1419_a', 'CLUSTER J1419-A', {
      grade: 'clean',
      instrumentCode: 'LNS-04',
      physicalPrinciple: 'Thin-lens gravitational shear inversion.',
    });
    const afterDecode = codex.resolve(store.getState());
    const j1419Decoded = afterDecode.entries.find((e) => e.spec.id === 'celestial_cluster_j1419')!;
    expect(j1419Decoded.unlockedStages).toHaveLength(3);
    expect(j1419Decoded.hasMoreStages).toBe(false);

    // Pruning shifts annotation band from warm -> cold and expands chaos ceiling entry
    store.pruneHumanity(30, 'phantom_spouse');
    const afterPrune = codex.resolve(store.getState());
    const chaosEntry = afterPrune.entries.find((e) => e.spec.id === 'sys_chaos_ceiling')!;
    expect(chaosEntry.annotationBand).toBe('cold');
    expect(chaosEntry.unlockedStages.some((st) => st.id === 'permanent_cut')).toBe(true);
  });

  it('unlocks Ink-driven codex revisions via # codex:<key> tags during dialogue', () => {
    const store = new StateStore();
    const runner = new DialogueRunner(store, () => {});
    const codex = new CodexEngine();

    // Starting sibling_topic_archive emits # codex:archive_1406_echo
    runner.startKnot('sibling_topic_archive');
    expect(store.getState().codexUnlocks).toContain('archive_1406_echo');

    const snap = codex.resolve(store.getState());
    const priorCopies = snap.entries.find((e) => e.spec.id === 'inst_prior_copies')!;
    expect(priorCopies.unlockedStages.some((st) => st.id === 'echo_1406')).toBe(true);
  });
});
