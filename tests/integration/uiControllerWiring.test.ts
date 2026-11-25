import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogueRunner } from '../../src/engine/DialogueRunner';
import { MinigameRegistry } from '../../src/engine/minigames/MinigameRegistry';
import { StateStore } from '../../src/engine/StateStore';
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

  it('wires showcase cleanly through DevHarness launch buttons without throwing TypeError', () => {
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

    // Clicking DevHarness launch button reproduces the exact production trigger path
    const lensBtn = document.querySelector<HTMLButtonElement>('[data-launch-mg="lens_focus"]');
    expect(lensBtn).not.toBeNull();
    lensBtn!.click();

    // Advance transitionToMode timers cleanly
    vi.advanceTimersByTime(1000);

    expect(showcase.loadTarget).toHaveBeenCalled();
    expect(showcase.getInstrumentBridge).toHaveBeenCalled();
    expect(appRoot.querySelector('#minigame-overlay')?.classList.contains('hidden')).toBe(false);
    expect(appRoot.querySelector('#mg-instrument-code')?.textContent).toBe('LNS-04');

    // Switching to another instrument whose anomaly targets a different 3D showcase reloads target
    const waveBtn = document.querySelector<HTMLButtonElement>('[data-launch-mg="wave_shaper"]');
    expect(waveBtn).not.toBeNull();
    waveBtn!.click();
    vi.advanceTimersByTime(1000);

    expect(showcase.loadTarget).toHaveBeenCalledTimes(2);
    expect(appRoot.querySelector('#mg-instrument-code')?.textContent).toBe('WAV-01');
    expect(audio.syncMusicContext).toHaveBeenCalledWith(
      expect.objectContaining({ activeMinigameId: 'lens_focus' })
    );
    expect(audio.syncMusicContext).toHaveBeenCalledWith(
      expect.objectContaining({ activeMinigameId: 'wave_shaper' })
    );
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

    // Enter Wake World and open Survey Codex
    store.patch({ mode: 'waking_3d' });
    appRoot.querySelector<HTMLButtonElement>('#btn-codex')!.click();
    expect(appRoot.querySelector('#codex-overlay')?.classList.contains('hidden')).toBe(false);

    // Entering Dream View automatically closes Codex and keeps Dream View free of Codex buttons
    store.patch({ mode: 'dream_2d' });
    expect(appRoot.querySelector('#codex-overlay')?.classList.contains('hidden')).toBe(true);
    expect(appRoot.querySelector('#dream-layer #btn-codex')).toBeNull();
  });

  it('routes distinct per-seam transitions and voice-matched kinetic dialogue dynamics', () => {
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

    const stageEl = appRoot.querySelector<HTMLElement>('#transition-stage')!;
    expect(stageEl).not.toBeNull();

    // 1. Boot -> 3D Sky uses aperture_boot and leaves no stale .is-leaving/.is-arriving state
    appRoot.querySelector<HTMLButtonElement>('#btn-boot-3d')!.click();
    expect(stageEl.dataset.kind).toBe('aperture_boot');
    expect(stageEl.classList.contains('is-active')).toBe(true);
    expect(appRoot.querySelector('#boot-screen')?.classList.contains('is-leaving')).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(store.getState().mode).toBe('waking_3d');
    expect(stageEl.classList.contains('is-active')).toBe(false);
    expect(appRoot.querySelector('#boot-screen')?.classList.contains('hidden')).toBe(true);
    expect(appRoot.querySelector('#boot-screen')?.classList.contains('is-leaving')).toBe(false);
    expect(appRoot.querySelector('#optics-layer')?.classList.contains('is-arriving')).toBe(false);

    // 2. 3D Sky -> Target Inspect uses optical_dive + 3D camera hooks
    document.querySelector<HTMLButtonElement>('[data-showcase="cluster_j1419_a"]')!.click();
    expect(stageEl.dataset.kind).toBe('optical_dive');
    expect(optics.triggerTransitionDive).toHaveBeenCalledWith('cluster_j1419_a');
    vi.advanceTimersByTime(1050);
    expect(showcase.triggerArrivalPullIn).toHaveBeenCalled();
    expect(appRoot.querySelector('#optics-layer')?.classList.contains('hidden')).toBe(true);
    expect(appRoot.querySelector('#inspect-layer')?.classList.contains('hidden')).toBe(false);

    // 3. Target Inspect -> 3D Sky uses optical_pullback
    appRoot.querySelector<HTMLButtonElement>('#btn-exit-inspect')!.click();
    expect(stageEl.dataset.kind).toBe('optical_pullback');
    expect(showcase.triggerDeparturePullOut).toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(optics.triggerPullbackArrival).toHaveBeenCalled();
    expect(appRoot.querySelector('#inspect-layer')?.classList.contains('hidden')).toBe(true);
    expect(appRoot.querySelector('#optics-layer')?.classList.contains('hidden')).toBe(false);

    // 4. 3D Sky -> 2D Dream uses dream_submerge + DreamCanvas entrance reveal + dream dialogue channel
    appRoot.querySelector<HTMLButtonElement>('#btn-enter-dream')!.click();
    expect(stageEl.dataset.kind).toBe('dream_submerge');
    vi.advanceTimersByTime(1200);
    expect(dream.triggerEntranceReveal).toHaveBeenCalled();
    expect(appRoot.querySelector('#optics-layer')?.classList.contains('hidden')).toBe(true);
    expect(appRoot.querySelector('#dream-scroll .dialogue-entry')?.getAttribute('data-channel')).toBe('dream');

    // Choice click triggers selection pulse during 280ms reply beat and settles cleanly
    const firstChoice = appRoot.querySelector<HTMLButtonElement>('#dream-choices .choice-line')!;
    firstChoice.click();
    expect(appRoot.querySelector('#dream-choices')?.classList.contains('is-locked')).toBe(true);
    expect(firstChoice.classList.contains('is-selected')).toBe(true);
    vi.advanceTimersByTime(320);
    expect(appRoot.querySelector('#dream-choices')?.classList.contains('is-locked')).toBe(false);

    // 5. Overseer interrogation triggers overseer_slice pulse + overseer channel
    document.querySelector<HTMLButtonElement>('[data-overseer-h="84"]')!.click();
    expect(stageEl.dataset.kind).toBe('overseer_slice');
    expect(appRoot.querySelector('#overseer-panel')?.classList.contains('hidden')).toBe(false);
    expect(appRoot.querySelector('#overseer-scroll .dialogue-entry')?.getAttribute('data-channel')).toBe('overseer');
    vi.advanceTimersByTime(700);
  });
});
