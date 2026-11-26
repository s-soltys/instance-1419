import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogueRunner } from '../../src/engine/DialogueRunner';
import { MinigameRegistry } from '../../src/engine/minigames/MinigameRegistry';
import {
  INTRO_TARGET_1_ID,
  INTRO_TARGET_1_MINIGAME,
  INTRO_TARGET_2_ID,
  INTRO_TARGET_2_MINIGAME,
  StateStore,
} from '../../src/engine/StateStore';
import { StoryletScheduler } from '../../src/engine/StoryletScheduler';
import { UIController } from '../../src/ui/UIController';
import {
  createMockAudioEngine,
  createMockDreamCanvas,
  createMockOpticsScene,
  createMockShowcaseScene,
  createMockVoiceEngine,
  installJsdomCanvasAndObservers,
} from './domTestHelpers';

describe('UIController <-> MinigameHostView <-> DevHarness wiring', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    installJsdomCanvasAndObservers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('wires showcase directly into MinigameHostView without target_inspect or throwing TypeError', async () => {
    const appRoot = document.getElementById('app')!;
    const store = new StateStore();
    const audio = createMockAudioEngine();
    const voice = createMockVoiceEngine();
    const dialogue = new DialogueRunner(store, audio.playCue);
    const scheduler = new StoryletScheduler();
    const minigames = new MinigameRegistry();

    const ui = new UIController(
      appRoot,
      store,
      audio as never,
      voice as never,
      dialogue,
      scheduler,
      minigames
    );

    const optics = createMockOpticsScene();
    const showcase = createMockShowcaseScene();
    const dream = createMockDreamCanvas();

    ui.attachRenderers(optics as never, showcase as never, dream as never);
    await vi.waitFor(() => {
      expect(document.querySelector('[data-launch-mg="lens_focus"]')).not.toBeNull();
    });

    // #inspect-layer is completely removed overall
    expect(appRoot.querySelector('#inspect-layer')).toBeNull();
    expect(appRoot.querySelector('#minigame-layer')).not.toBeNull();

    // Clicking DevHarness launch button reproduces the direct sky -> minigame path
    const lensBtn = document.querySelector<HTMLButtonElement>('[data-launch-mg="lens_focus"]');
    expect(lensBtn).not.toBeNull();
    lensBtn!.click();

    // Advance optical_dive transition & dynamic import microtasks cleanly
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => {
      expect(appRoot.querySelector('#minigame-overlay')?.classList.contains('hidden')).toBe(false);
    });

    expect(showcase.enterTarget).toHaveBeenCalled();
    expect(showcase.getInstrumentBridge).toHaveBeenCalled();
    expect(store.getState().mode).toBe('waking_3d');
    expect(appRoot.querySelector('#minigame-layer')?.classList.contains('hidden')).toBe(false);
    expect(appRoot.querySelector('#mg-instrument-code')?.textContent).toBe('LNS-04');

    // Switching to another instrument whose anomaly targets a different 3D showcase reloads target
    const waveBtn = document.querySelector<HTMLButtonElement>('[data-launch-mg="wave_shaper"]');
    expect(waveBtn).not.toBeNull();
    waveBtn!.click();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => {
      expect(appRoot.querySelector('#mg-instrument-code')?.textContent).toBe('WAV-01');
    });

    expect(showcase.enterTarget).toHaveBeenCalledTimes(2);
    expect(audio.syncMusicContext).toHaveBeenCalledWith(
      expect.objectContaining({ activeMinigameId: 'lens_focus' })
    );
    expect(audio.syncMusicContext).toHaveBeenCalledWith(
      expect.objectContaining({ activeMinigameId: 'wave_shaper' })
    );
    store.dispose();
  });

  it('opens Settings from top HUD, toggles music & voice, and enforces Wake-World-only Codex visibility', () => {
    const appRoot = document.getElementById('app')!;
    const store = new StateStore();
    const audio = createMockAudioEngine();
    const voice = createMockVoiceEngine();
    const dialogue = new DialogueRunner(store, audio.playCue);
    const scheduler = new StoryletScheduler();
    const minigames = new MinigameRegistry();

    const ui = new UIController(
      appRoot,
      store,
      audio as never,
      voice as never,
      dialogue,
      scheduler,
      minigames
    );

    const optics = createMockOpticsScene();
    const showcase = createMockShowcaseScene();
    const dream = createMockDreamCanvas();
    ui.attachRenderers(optics as never, showcase as never, dream as never);

    // Top-right HUD exposes single SETTINGS button (old VOICE ON / AUDIO ON buttons removed)
    expect(appRoot.querySelector('#btn-voice')).toBeNull();
    expect(appRoot.querySelector('#btn-mute')).toBeNull();
    const settingsBtn = appRoot.querySelector<HTMLButtonElement>('#btn-settings');
    expect(settingsBtn).not.toBeNull();

    settingsBtn!.click();
    expect(appRoot.querySelector('#settings-overlay')?.classList.contains('hidden')).toBe(false);
    expect(appRoot.querySelector('#toggle-reduced-motion')).toBeNull();
    expect(appRoot.querySelector('[data-quality]')).toBeNull();

    // Turning off Music and Voice propagates cleanly to AudioEngine and VoiceEngine
    appRoot.querySelector<HTMLButtonElement>('#toggle-music')!.click();
    appRoot.querySelector<HTMLButtonElement>('#toggle-voice')!.click();
    expect(audio.setMix).toHaveBeenLastCalledWith(
      expect.objectContaining({ musicEnabled: false })
    );
    expect(voice.setEnabled).toHaveBeenLastCalledWith(false);

    // Close Settings with Escape
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(appRoot.querySelector('#settings-overlay')?.classList.contains('hidden')).toBe(true);

    // Enter Wake World (complete intro) and open Survey Codex
    store.patch({ mode: 'waking_3d', introStage: 'complete' });
    appRoot.querySelector<HTMLButtonElement>('#btn-codex')!.click();
    expect(appRoot.querySelector('#codex-overlay')?.classList.contains('hidden')).toBe(false);

    // Entering Dream View automatically closes Codex and keeps Dream View free of Codex buttons
    store.patch({ mode: 'dream_2d' });
    expect(appRoot.querySelector('#codex-overlay')?.classList.contains('hidden')).toBe(true);
    expect(appRoot.querySelector('#dream-layer #btn-codex')).toBeNull();
    store.dispose();
  });

  it('routes Prologue -> Live Title -> Direct Sky -> Minigame -> mg_1_done -> Shift-1 Soft Dream transitions', async () => {
    const appRoot = document.getElementById('app')!;
    const store = new StateStore();
    const audio = createMockAudioEngine();
    const voice = createMockVoiceEngine();
    const dialogue = new DialogueRunner(store, audio.playCue);
    const scheduler = new StoryletScheduler();
    const minigames = new MinigameRegistry();

    const ui = new UIController(
      appRoot,
      store,
      audio as never,
      voice as never,
      dialogue,
      scheduler,
      minigames
    );

    const optics = createMockOpticsScene();
    const showcase = createMockShowcaseScene();
    const dream = createMockDreamCanvas();
    ui.attachRenderers(optics as never, showcase as never, dream as never);
    await vi.waitFor(() => {
      expect(document.querySelector('[data-intro-jump="complete"]')).not.toBeNull();
    });

    const stageEl = appRoot.querySelector<HTMLElement>('#transition-stage')!;
    const bootEl = appRoot.querySelector<HTMLElement>('#boot-screen')!;
    expect(stageEl).not.toBeNull();
    expect(appRoot.querySelector('#psyche-whisper')).toBeNull();
    expect(store.getState().introStage).toBe('prologue');
    expect(bootEl.dataset.bootVisual).toBe('breath');

    // 1. Step through interactive Prologue (Assistant w/ wake effect & oscillation -> Overseer 5-phase Wakeup -> Live Title)
    const seenVisuals = new Set<string>();
    // Unlock audio breath & trigger wake-up effect
    bootEl.click();
    await vi.advanceTimersByTimeAsync(1100);
    if (bootEl.dataset.bootVisual) seenVisuals.add(bootEl.dataset.bootVisual);

    let sawExploreTier = false;
    let sawConsequentialTier = false;
    for (let step = 0; step < 140; step++) {
      if (bootEl.dataset.bootVisual) seenVisuals.add(bootEl.dataset.bootVisual);
      if (store.getState().introStage === 'title') break;

      const continueBtn = appRoot.querySelector<HTMLButtonElement>('#prologue-choices .prologue-continue-bar');
      const choiceBtn =
        appRoot.querySelector<HTMLButtonElement>('#prologue-choices .choice-line:not([data-choice-kind="ask"])') ??
        appRoot.querySelector<HTMLButtonElement>('#prologue-choices .choice-line');
      if (choiceBtn) {
        if (appRoot.querySelector('#prologue-choices .is-tier-explore')) sawExploreTier = true;
        if (appRoot.querySelector('#prologue-choices .is-tier-consequential')) sawConsequentialTier = true;
        expect(appRoot.querySelector('#prologue-choices .choice-affinity-dot')).toBeNull();
        choiceBtn.click();
      } else if (continueBtn) {
        continueBtn.click();
      } else {
        bootEl.click();
      }
      await vi.advanceTimersByTimeAsync(2600);
    }

    expect(seenVisuals.has('prologue_assistant')).toBe(true);
    expect(seenVisuals.has('prologue_wakeup')).toBe(true);
    expect(dream.triggerWakeSequence).toHaveBeenCalled();
    expect(dream.setHumanityOscillation).toHaveBeenCalled();
    expect(sawExploreTier).toBe(true);
    expect(sawConsequentialTier).toBe(true);
    expect(store.getState().introStage).toBe('title');
    expect(optics.setAmbientDrift).toHaveBeenCalledWith(true);
    expect(appRoot.querySelector('#title-overlay')?.classList.contains('hidden')).toBe(false);

    // 2. Single primary CTA (`OPEN APERTURE`) pulls cleanly into scan_target_1 (Target #1 only + magnetic detent)
    appRoot.querySelector<HTMLButtonElement>('#btn-title-primary')!.click();
    await vi.advanceTimersByTimeAsync(2400);
    expect(store.getState().mode).toBe('waking_3d');
    expect(store.getState().introStage).toBe('scan_target_1');
    expect(optics.pullInToTarget1).toHaveBeenCalled();
    expect(optics.setVisibleTargetIds).toHaveBeenCalledWith([INTRO_TARGET_1_ID]);
    expect(optics.setMagneticDetentTarget).toHaveBeenCalledWith(INTRO_TARGET_1_ID);

    // 3. Locking Target #1 and clicking etched CTA dives DIRECTLY into fixed Target #1 starter (CON-02)
    const target1Spec = optics.getAnomalySpecs().find((a) => a.id === INTRO_TARGET_1_ID)!;
    store.recordAnomalyScan(target1Spec.id, target1Spec.anomalyGain, target1Spec.label);
    ui.onOpticsTelemetry({
      raDeg: target1Spec.raDeg,
      decDeg: target1Spec.decDeg,
      fovDeg: 22,
      zoomX: 3.2,
      zoomNorm: 0.72,
      zoomStage: 'DEEP FIELD',
      focusedAnomaly: target1Spec,
      alignmentScore: 0.96,
      wavelengthMatch: 0.98,
      lockProgress: 1,
      markers: [],
    });

    const calibrateBtn = appRoot.querySelector<HTMLButtonElement>('#btn-enter-inspect')!;
    expect(calibrateBtn.classList.contains('hidden')).toBe(false);
    calibrateBtn.click();
    expect(stageEl.dataset.kind).toBe('optical_dive');
    expect(optics.triggerTransitionDive).toHaveBeenCalledWith(INTRO_TARGET_1_ID);
    await vi.advanceTimersByTimeAsync(2100);
    await vi.waitFor(() => {
      expect(appRoot.querySelector('#minigame-overlay')?.classList.contains('hidden')).toBe(false);
    });

    expect(appRoot.querySelector('#optics-layer')?.classList.contains('hidden')).toBe(true);
    expect(appRoot.querySelector('#minigame-layer')?.classList.contains('hidden')).toBe(false);
    expect(store.getMinigameIdForTarget(INTRO_TARGET_1_ID, 'fallback')).toBe(INTRO_TARGET_1_MINIGAME);
    expect(store.getMinigameIdForTarget(INTRO_TARGET_2_ID, 'fallback')).toBe(INTRO_TARGET_2_MINIGAME);
    expect(appRoot.querySelector('#mg-instrument-code')?.textContent).toBe('CON-02');

    // 4. Completing Target #1 and returning to sky advances scan_target_1 -> mg_1_done cleanly
    store.recordMinigameCompletion(INTRO_TARGET_1_ID, target1Spec.label, { grade: 'clean' });
    appRoot.querySelector<HTMLButtonElement>('#mg-btn-close')!.click();
    expect(stageEl.dataset.kind).toBe('optical_pullback');
    await vi.advanceTimersByTimeAsync(2100);
    expect(optics.triggerPullbackArrival).toHaveBeenCalled();
    expect(appRoot.querySelector('#minigame-layer')?.classList.contains('hidden')).toBe(true);
    expect(appRoot.querySelector('#optics-layer')?.classList.contains('hidden')).toBe(false);
    expect(store.getState().mode).toBe('waking_3d');
    expect(store.getState().introStage).toBe('mg_1_done');

    // 5. Entering 2D Dream uses dream_submerge + DreamCanvas entrance reveal + soft Shift-1 audit
    document.querySelector<HTMLButtonElement>('[data-intro-jump="complete"]')!.click();
    await vi.advanceTimersByTimeAsync(400);
    appRoot.querySelector<HTMLButtonElement>('#btn-enter-dream')!.click();
    expect(stageEl.dataset.kind).toBe('dream_submerge');
    await vi.advanceTimersByTimeAsync(2700);
    expect(dream.triggerEntranceReveal).toHaveBeenCalled();
    expect(appRoot.querySelector('#optics-layer')?.classList.contains('hidden')).toBe(true);
    expect(appRoot.querySelector('#dream-scroll .dialogue-entry')?.getAttribute('data-channel')).toBe('dream');

    // Choice click triggers selection pulse during reply beat and settles cleanly
    const firstChoice = appRoot.querySelector<HTMLButtonElement>('#dream-choices .choice-line')!;
    firstChoice.click();
    expect(appRoot.querySelector('#dream-choices')?.classList.contains('is-locked')).toBe(true);
    expect(firstChoice.classList.contains('is-selected')).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(appRoot.querySelector('#dream-choices')?.classList.contains('is-locked')).toBe(false);

    // 6. Overseer interrogation triggers overseer_slice pulse + overseer channel
    document.querySelector<HTMLButtonElement>('[data-overseer-h="84"]')!.click();
    expect(stageEl.dataset.kind).toBe('overseer_slice');
    await vi.advanceTimersByTimeAsync(1400);
    expect(appRoot.querySelector('#overseer-panel')?.classList.contains('hidden')).toBe(false);
    expect(appRoot.querySelector('#overseer-scroll .dialogue-entry')?.getAttribute('data-channel')).toBe('overseer');
    store.dispose();
  });
});
