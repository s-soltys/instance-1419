import charactersData from '../content/characters.json';
import pacing from '../content/pacing.json';
import shiftsData from '../content/shifts.json';
import uiCopy from '../content/ui_copy.json';
import type { AudioEngine } from '../engine/AudioEngine';
import { CodexEngine } from '../engine/CodexEngine';
import { DialogueRunner, type DialogueSnapshot } from '../engine/DialogueRunner';
import type { DreamCanvas } from '../engine/DreamCanvas';
import type { MinigameRegistry } from '../engine/minigames/MinigameRegistry';
import type { CosmicPlateId } from '../engine/minigames/types';
import type { AnomalySpec, OpticsScene, OpticsTelemetry, ScaleClass } from '../engine/OpticsScene';
import { SettingsStore, type UserSettings } from '../engine/SettingsStore';
import {
  INTRO_TARGET_1_ID,
  INTRO_TARGET_2_ID,
  type GameMode,
  type GameState,
  type IntroStage,
  type StateStore,
} from '../engine/StateStore';
import type { StoryletScheduler, StoryletSpec } from '../engine/StoryletScheduler';
import type { TargetShowcaseScene } from '../engine/TargetShowcaseScene';
import { TelemetryLogger } from '../engine/TelemetryLogger';
import type { VoiceEngine } from '../engine/voice/VoiceEngine';
import { platform } from '../platform/PlatformAdapter';
import type { DevHarnessBridge } from './DevHarness';
import { HibernationInterludeView } from './HibernationInterludeView';
import { getInstrumentSchematic } from './InstrumentSchematics';
import { renderSpeakerAvatar, updateAvatarVoiceAnimations } from './SpeakerAvatar';
import { StatusShiftOverlay } from './StatusShiftOverlay';
import { TransitionDirector, type TransitionKind } from './TransitionDirector';
import { BootView } from './views/BootView';
import { CodexView } from './views/CodexView';
import {
  DialogueFeedView,
  handleChoiceKeyboardNav,
  stripInlineHighlights,
} from './views/DialogueFeedView';
import { MinigameHostView } from './views/MinigameHostView';
import { SettingsView } from './views/SettingsView';
import { WakeupBriefingCanvas } from './views/WakeupBriefingCanvas';

interface CharacterInfo {
  displayName: string;
  role: string;
  accentColor: string;
  roomTitle?: string;
  blurredSubtitle?: string;
}

const CHAR_MAP = charactersData.characters as Record<string, CharacterInfo>;
const MIN_WAVE = 200;
const MAX_WAVE = 1800;

const SCALE_ETCH_PREFIX: Record<ScaleClass, string> = {
  planet: 'AU',
  star_system: 'LY',
  nebula: 'KLY',
  galaxy: 'MLY',
  galaxy_cluster: 'BLY',
  horizon_anomaly: '93 BLY',
};

function getScaleLabel(scaleClass: ScaleClass | undefined): string {
  const key = scaleClass ?? 'star_system';
  const labels = uiCopy.sky.scaleLabels as Record<string, string>;
  return labels[key] ?? 'STAR SYSTEM';
}

function getScaleMicroEtch(scaleClass: ScaleClass): string {
  return `${SCALE_ETCH_PREFIX[scaleClass]} · ${getScaleLabel(scaleClass)}`;
}

function renderScaleGlyphSvg(scaleClass: ScaleClass): string {
  let core = '';
  switch (scaleClass) {
    case 'planet':
      core =
        '<circle cx="10" cy="10" r="2.7" /><ellipse cx="10" cy="10" rx="6.2" ry="2.0" transform="rotate(-24 10 10)" />';
      break;
    case 'nebula':
      core =
        '<path d="M5.6 11.4 C4.8 8.4 7.0 6.0 9.8 6.4 C12.4 5.2 15.2 7.5 14.3 10.4 C15.2 12.8 12.4 14.6 9.5 13.8 C7.0 14.6 5.0 13.2 5.6 11.4 Z" /><circle cx="10" cy="10" r="1.2" />';
      break;
    case 'galaxy':
      core =
        '<path d="M10 10 C12.6 7.5 14.8 8.6 14.2 11.4 M10 10 C7.4 12.5 5.2 11.4 5.8 8.6" /><ellipse cx="10" cy="10" rx="5.5" ry="2.5" transform="rotate(-28 10 10)" stroke-dasharray="1.6 1.8" /><circle cx="10" cy="10" r="1.2" />';
      break;
    case 'galaxy_cluster':
      core =
        '<circle cx="7.4" cy="8.4" r="1.3" /><circle cx="12.6" cy="8.7" r="1.1" /><circle cx="10.2" cy="12.9" r="1.2" /><path d="M4.8 11.4 A 6.2 6.2 0 0 1 13.6 5.2" />';
      break;
    case 'horizon_anomaly':
      core =
        '<polygon points="10,4.2 15.6,10 10,15.8 4.4,10" /><polygon points="10,7.0 12.8,10 10,13.0 7.2,10" /><line x1="3.4" y1="10" x2="6.0" y2="10" /><line x1="14.0" y1="10" x2="16.6" y2="10" />';
      break;
    case 'star_system':
    default:
      core =
        '<path d="M10 3.8 L11.0 9.0 L16.2 10 L11.0 11.0 L10 16.2 L9.0 11.0 L3.8 10 L9.0 9.0 Z" /><circle cx="13.6" cy="6.4" r="1.0" />';
      break;
  }

  return `<svg class="sky-glyph" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
    <polygon class="glyph-bleed-hex" points="10,0.9 18.1,5.4 18.1,14.6 10,19.1 1.9,14.6 1.9,5.4" fill="none" />
    <circle class="glyph-ring" cx="10" cy="10" r="8.2" fill="none" />
    <g class="glyph-core" fill="none">${core}</g>
    <path class="glyph-decoded-arc" d="M 4.4 10.6 A 6.4 6.4 0 0 0 15.6 7.4" fill="none" />
    <path class="glyph-decoded-check" d="M 7.3 10.2 L 9.4 12.3 L 13.5 7.9" fill="none" />
  </svg>`;
}

interface CachedShellRefs {
  stage: HTMLElement | null;
  warmthPill: HTMLElement | null;
  warmthFill: HTMLElement | null;
  warmthQual: HTMLElement | null;
  horizonArcHud: HTMLElement | null;
  horizonArcFill: SVGCircleElement | null;
  surveyDots: HTMLElement | null;
  driftFlag: HTMLElement | null;
  codexUnreadDot: HTMLElement | null;
  skyPsycheWhisper: HTMLElement | null;
  skyPsycheVoice: HTMLElement | null;
  skyPsycheLine: HTMLElement | null;
  vernierNeedle: HTMLElement | null;
  waveLabel: HTMLElement | null;
  vernierTrack: HTMLElement | null;
  dreamRibbon: HTMLElement | null;
  dreamCaption: HTMLElement | null;
  humanityReg: HTMLElement | null;
  regBandLabel: HTMLElement | null;
  regFill: HTMLElement | null;
  dreamSpeakerBay: HTMLElement | null;
  commsPanel: HTMLElement | null;
  commsAvatarBay: HTMLElement | null;
  overseerPanel: HTMLElement | null;
  overseerAvatarBay: HTMLElement | null;
  bootScreen: HTMLElement | null;
  opticsLayer: HTMLElement | null;
  minigameLayer: HTMLElement | null;
  dreamLayer: HTMLElement | null;
}

interface CachedOpticsHudRefs {
  target: HTMLElement | null;
  reticleBrief: HTMLElement | null;
  reticleBriefMeta: HTMLElement | null;
  reticleBriefWhy: HTMLElement | null;
  reticleBriefSchematic: HTMLElement | null;
  reticleBriefGoal: HTMLElement | null;
  reticleBriefHow: HTMLElement | null;
  reticleBriefControls: HTMLElement | null;
  reticleBriefCountdown: HTMLElement | null;
  reticleAutoFill: HTMLElement | null;
  reticleAutoLabel: HTMLElement | null;
  holdAutoDiveBtn: HTMLButtonElement | null;
  zoomLabel: HTMLElement | null;
  stageLabel: HTMLElement | null;
  zoomFill: HTMLElement | null;
  zoomNeedle: HTMLElement | null;
  zoomTrack: HTMLElement | null;
  reticleEl: HTMLElement | null;
  reticleScaleEtch: SVGTextElement | null;
  lockRing: SVGCircleElement | null;
  raTicks: HTMLElement | null;
  decTicks: HTMLElement | null;
  inspectBtn: HTMLButtonElement | null;
}

interface MarkerDomCache {
  lastTransform: string;
  lastOpacity: string;
  lastOffscreen: boolean;
}

/**
 * Top-level scene coordinator orchestrating:
 * - Seamless Prologue -> Live-Cosmos Integrated Title -> Diegetic Star Map
 * - Progressive HUD reveal via stage.dataset.introStage
 * - Direct Sky -> Minigame -> Sky loop (no intermediate target_inspect screen)
 * - Subtle qualitative Warmth presentation & 2D Dreamscape / Overseer Audits
 */
export class UIController {
  private readonly root: HTMLElement;
  private readonly store: StateStore;
  private readonly settingsStore: SettingsStore;
  private readonly audio: AudioEngine;
  private readonly voice: VoiceEngine;
  private readonly commsDialogue: DialogueRunner;
  private readonly dreamDialogue: DialogueRunner;
  private readonly overseerDialogue: DialogueRunner;
  private readonly futureDialogue: DialogueRunner;
  private readonly prologueDialogue: DialogueRunner;
  private readonly scheduler: StoryletScheduler;
  private readonly minigames: MinigameRegistry;
  private readonly codexEngine: CodexEngine;
  private readonly telemetry: TelemetryLogger;
  private readonly transitions: TransitionDirector;
  private readonly statusShift: StatusShiftOverlay;
  private readonly bootView: BootView;
  private readonly wakeupCanvas: WakeupBriefingCanvas;
  private readonly dialogueFeed: DialogueFeedView;
  private readonly minigameHost: MinigameHostView;
  private readonly settingsView: SettingsView;
  private readonly codexView: CodexView;

  private optics!: OpticsScene;
  private showcase!: TargetShowcaseScene;
  private dream!: DreamCanvas;

  private shellRefs!: CachedShellRefs;
  private opticsRefs!: CachedOpticsHudRefs;
  private markerCache = new Map<string, MarkerDomCache>();
  private skyZoomTrackH = 92;
  private readonly onResizeBound = () => this.updateZoomTrackHeights();

  private lastOpticsZoomText = '';
  private lastOpticsStageText = '';
  private lastOpticsFillTransform = '';
  private lastOpticsNeedleTransform = '';
  private lastReticleScale = '';
  private lastRaTransform = '';
  private lastDecTransform = '';
  private lastLockOffset = -1;
  private lastInspectHidden: boolean | null = null;

  private activeCommsSnapshot: DialogueSnapshot | null = null;
  private activeCommsMode: 'sibling' | 'post_target2' = 'sibling';
  private activeDreamSnapshot: DialogueSnapshot | null = null;
  private activeOverseerSnapshot: DialogueSnapshot | null = null;
  private focusedSpec: AnomalySpec | null = null;

  private prologuePhase: 'breath' | 'assistant' | 'transitioning' | 'wakeup' | 'title' = 'breath';
  private prologueTableau = 'base';
  private prologueCalibHumanity = 100;
  private activePrologueSnap: DialogueSnapshot | null = null;
  private prologueRevealedCount = 0;
  private prologueStepTimer: number | null = null;
  private prologueTimers: number[] = [];
  private resumeModeAfterTitle: 'waking_3d' | 'dream_2d' = 'waking_3d';

  private activeMinigameTargetId: string | null = null;
  private lastMinigameDecodedSpec: AnomalySpec | null = null;
  private suppressMinigamePullback = false;

  private markerEls = new Map<string, HTMLButtonElement>();
  private lastScannedSig = '';
  private lastDecodedSig = '';
  private lastIntroStageSig = '';
  private lastShiftGateSig = -1;
  private lastPromptKey = '';
  private lastSurveyDotsSig = '';
  private lastHumanityPct = -1;
  private lastDriftElevated: boolean | null = null;
  private lastCodexSig = '';
  private lastWavelengthNm = -1;
  private lastMode: GameMode = 'boot';
  private lastVisSig = '';
  private lastDreamRegSig = '';
  private lastCommsBaySig = '';
  private lastOverseerBaySig = '';
  private lastMgProfileSig = '';
  private lastDreamCaptionSig = '';
  private lastOpticsParamSig = '';
  private lastOpticsDecodedSig = '';
  private lastOpticsFidelity = -1;
  private lastDreamStateSig = '';
  private lastDreamAnomalySig = '';
  private lastHorizonArcPct = -1;
  private lastReticleScaleClass = '';
  private lastReticleBriefSig = '';
  private lastInspectLabel = '';
  private lastAudioMoodSig = '';
  private lastMusicCtxSig = '';
  private avatarAnimRaf = 0;
  private unbindVoiceSub: (() => void) | null = null;

  private pendingCommsStorylet: StoryletSpec | null = null;
  private pendingPostTarget2 = false;
  private isWakingFromDream = false;
  private totalRealYearsElapsed = 0;
  private readonly hibernationInterlude: HibernationInterludeView;

  private hasDraggedSkyInIntro = false;
  private skyDragAccumPx = 0;
  private skyPointerDown = false;
  private skyLastPx = 0;
  private skyLastPy = 0;
  private idleDragHintShown = false;
  private idleDragTimer: number | null = null;
  private zoomHintUnlocked = false;
  private vernierNudgeActive = false;

  private proactiveCommsSent = false;
  private proactiveCommsTimer: number | null = null;
  private postTarget2Timer: number | null = null;
  private skyPsycheTimer: number | null = null;
  private dreamSettleTimer: number | null = null;
  private overseerInterruptTimer: number | null = null;
  private overseerInterruptToken = 0;
  private overseerSliceTimer: number | null = null;
  private overseerRevealTimer: number | null = null;
  private overseerSpeakTimer: number | null = null;
  private autoDiveTargetId: string | null = null;
  private autoDiveDeadlineMs = 0;
  private autoDiveHeldTargetId: string | null = null;
  private autoDiveTickTimer: number | null = null;
  private briefPhase: 'idle' | 'locked' | 'diving' | 'handover' | 'fading' = 'idle';
  private briefHandoverTimer: number | null = null;
  private briefFadeTimer: number | null = null;

  constructor(
    root: HTMLElement,
    store: StateStore,
    audio: AudioEngine,
    voice: VoiceEngine,
    dialogue: DialogueRunner,
    scheduler: StoryletScheduler,
    minigames: MinigameRegistry,
    settingsStore?: SettingsStore
  ) {
    this.root = root;
    this.store = store;
    this.settingsStore = settingsStore ?? new SettingsStore();
    this.audio = audio;
    this.voice = voice;
    this.commsDialogue = dialogue;
    this.dreamDialogue = new DialogueRunner(store, (cue) => audio.playCue(cue));
    this.overseerDialogue = new DialogueRunner(store, (cue) => audio.playCue(cue));
    this.futureDialogue = new DialogueRunner(store, (cue) => audio.playCue(cue));
    this.prologueDialogue = new DialogueRunner(store, () => {});
    this.scheduler = scheduler;
    this.minigames = minigames;
    this.codexEngine = new CodexEngine();
    this.telemetry = new TelemetryLogger(store.getState());

    this.renderShell();
    this.transitions = new TransitionDirector(this.root);
    this.statusShift = new StatusShiftOverlay(this.root.querySelector('.stage')!, audio);
    this.hibernationInterlude = new HibernationInterludeView(this.root.querySelector('.stage')!, audio);
    this.bootView = new BootView(this.root);
    this.bootView.populate();
    this.wakeupCanvas = new WakeupBriefingCanvas(this.root.querySelector<HTMLElement>('#wakeup-canvas-mount')!);
    this.wakeupCanvas.setCaptions(uiCopy.wakeupAnim);
    this.dialogueFeed = new DialogueFeedView(this.root, store, audio, voice, this.telemetry);
    this.minigameHost = new MinigameHostView(
      this.root,
      store,
      audio,
      minigames,
      this.telemetry
    );
    this.settingsView = new SettingsView(this.root, this.settingsStore, audio, {
      onRestartRun: () => this.resetRunState(),
      onExportTelemetry: () => this.telemetry.downloadSummary(this.store.getState()),
    });
    this.codexView = new CodexView(this.root, store, audio, this.codexEngine, {
      onFocusTarget: (targetId) => {
        if (this.store.getState().scannedAnomalyIds.includes(targetId)) {
          this.enterTargetMinigame(targetId);
        } else {
          this.optics?.slewToAnomaly(targetId);
        }
      },
      onLaunchCapstone: () => {
        this.enterTargetMinigame(INTRO_TARGET_1_ID, 'blink_spotter');
      },
    });
    this.minigameHost.setExitRequestCallback((preserveDecoded, decodedSpec) => {
      if (this.activeMinigameTargetId !== null && !this.suppressMinigamePullback) {
        this.exitTargetMinigame(decodedSpec, preserveDecoded);
      } else {
        this.minigameHost.destroy(preserveDecoded);
      }
    });
    this.minigameHost.setActiveChangeCallback((mgId) => {
      if (this.shellRefs?.stage) {
        this.shellRefs.stage.dataset.minigame = mgId !== null ? '1' : '0';
      }
      this.syncAudioMusic(this.store.getState());
    });
  }

  attachRenderers(optics: OpticsScene, showcase: TargetShowcaseScene, dream: DreamCanvas): void {
    this.optics = optics;
    this.showcase = showcase;
    this.dream = dream;
    this.minigameHost.attachShowcase(showcase);
    this.initSkyMarkers();
    this.renderBearingIndex();
    this.bindUIEvents();
    window.addEventListener('resize', this.onResizeBound);
    this.updateZoomTrackHeights();
    this.applyUserSettings(this.settingsStore.getSettings());
    this.settingsStore.subscribe((settings) => this.applyUserSettings(settings));
    this.store.subscribe((state) => this.syncStateToUI(state));
    this.store.subscribeStatusShift((ev) => {
      if (
        ev.title.endsWith(` ${uiCopy.statusAlerts.targetLocked.titleSuffix}`) ||
        ev.title === uiCopy.statusAlerts.targetLocked.fallbackTitle
      ) {
        return;
      }
      if (this.store.getState().introStage !== 'complete' && ev.tone === 'discovery') return;
      if (ev.tone === 'discovery' && this.minigameHost.isActive()) return;
      this.statusShift.show(ev);
    });
    this.bindAvatarVoiceLoop();

    if (import.meta.env.DEV || new URLSearchParams(window.location.search).get('dev') === '1') {
      void import('./DevHarness').then(({ DevHarness }) => {
        new DevHarness(this.store, this.audio, this.voice, this.minigames, this.createDevBridge());
      });
    }

    this.initializeEntryPresentation();
  }

  private initializeEntryPresentation(): void {
    const state = this.store.getState();
    if (this.store.hasSavedProgress() && state.introStage !== 'prologue') {
      this.resumeModeAfterTitle = state.mode === 'dream_2d' ? 'dream_2d' : 'waking_3d';
      if (state.mode !== 'boot') {
        this.store.patch({ mode: 'boot' });
      }
      this.enterTitleOverlay(true);
      return;
    }

    if (state.mode === 'dream_2d' && !this.activeDreamSnapshot) {
      this.startDreamDialogue('dream_shift1_audit');
      return;
    }

    if (state.mode === 'boot') {
      this.enterPrologueBreath();
    } else if (state.mode === 'waking_3d') {
      this.applyIntroOpticsConstraints(state.introStage);
      if (state.introStage === 'scan_target_1') {
        this.startIdleDragHintTimer();
      }
    }
  }

  private applyUserSettings(s: UserSettings): void {
    this.audio.setMix({
      muted: !s.masterEnabled,
      master: s.masterVolume,
      ambience: s.musicVolume,
      sfx: s.sfxVolume,
      musicEnabled: s.musicEnabled,
      sfxEnabled: s.sfxEnabled,
      voiceDuckingEnabled: s.voiceDucking,
    });
    this.voice.setEnabled(s.masterEnabled && s.voiceEnabled);
    this.voice.setVolume?.(s.voiceVolume);
    platform.setHapticsEnabled(s.hapticsEnabled);
    this.dialogueFeed.setPacingMode(s.dialoguePacing);
    if (!s.autoEngageInstrument) {
      this.cancelAutoDive(false);
    }

    const stage = this.root.querySelector<HTMLElement>('.stage');
    if (stage) {
      stage.dataset.textSize = s.textSize;
    }
  }

  getOpticsMount(): HTMLElement {
    return this.root.querySelector<HTMLElement>('#optics-mount')!;
  }

  getShowcaseMount(): HTMLElement {
    return this.root.querySelector<HTMLElement>('#showcase-mount')!;
  }

  getDreamMount(): HTMLElement {
    return this.root.querySelector<HTMLElement>('#dream-mount')!;
  }

  private renderShell(): void {
    this.root.innerHTML = `
      <div class="stage" data-mode="boot" data-intro-stage="prologue" data-minigame="0">
        <div class="film-grain" aria-hidden="true"></div>

        <div class="transition-stage" id="transition-stage" aria-hidden="true">
          <div class="ts-bloom"></div>
          <div class="ts-flare"></div>
          <div class="ts-iris-ring">
            <div class="ts-iris-inner"></div>
            <div class="ts-iris-crosshair"></div>
          </div>
          <div class="ts-scan-top"></div>
          <div class="ts-scan-bottom"></div>
          <span class="transition-label sr-only" id="transition-label">ENTERING DREAM CACHE…</span>
        </div>

        <aside class="reticle-brief hidden" id="reticle-brief" data-brief-phase="locked" aria-live="polite">
          <div class="reticle-brief-head">
            <div class="reticle-brief-meta" id="reticle-brief-meta"></div>
            <div class="reticle-brief-why" id="reticle-brief-why"></div>
          </div>
          <div class="reticle-brief-schematic" id="reticle-brief-schematic"></div>
          <div class="reticle-brief-howto">
            <div class="reticle-brief-goal" id="reticle-brief-goal"></div>
            <div class="reticle-brief-how" id="reticle-brief-how"></div>
            <div class="reticle-brief-controls" id="reticle-brief-controls"></div>
          </div>
          <div class="reticle-brief-countdown hidden" id="reticle-brief-countdown">
            <div class="reticle-auto-bar"><span id="reticle-auto-fill"></span></div>
            <div class="reticle-auto-row">
              <span class="reticle-auto-label" id="reticle-auto-label">ENTERING IN 7s…</span>
              <button class="reticle-auto-hold" id="btn-hold-auto-dive" type="button">HOLD</button>
            </div>
          </div>
        </aside>

        <header class="top-telemetry">
          <div class="telemetry-readout">
            <div class="warmth-pill" id="hud-warmth-pill" data-band="high" title="${uiCopy.warmth.tooltipWarm}">
              <span class="warmth-label">${uiCopy.warmth.label}</span>
              <span class="warmth-track"><i id="hud-warmth-fill" style="width:70%"></i></span>
              <span class="warmth-qual" id="hud-warmth-qual">STEADY</span>
            </div>
            <div class="horizon-arc-hud" id="hud-horizon-arc" title="Horizon Proof · 0%">
              <svg viewBox="0 0 22 22" width="18" height="18" aria-hidden="true">
                <circle class="hud-arc-track" cx="11" cy="11" r="8.5" fill="none" />
                <circle class="hud-arc-fill" id="hud-horizon-arc-fill" cx="11" cy="11" r="8.5" fill="none"
                  stroke-dasharray="53.41" stroke-dashoffset="53.41" transform="rotate(-90 11 11)" />
              </svg>
            </div>
            <div class="survey-dots" id="hud-survey-dots" title="Sky targets decoded"></div>
            <span class="drift-flag hidden" id="hud-drift-flag" title="Psychic drift rising">DRIFT ELEVATED</span>
          </div>
          <div class="telemetry-actions">
            <button class="etched-action" id="btn-settings" type="button" aria-haspopup="dialog">SETTINGS</button>
          </div>
        </header>

        <section class="boot-screen" id="boot-screen" data-boot-visual="breath">
          <div class="wakeup-canvas-mount hidden" id="wakeup-canvas-mount" aria-hidden="true"></div>

          <div class="prologue-breath-panel" id="prologue-breath-panel">
            <span class="prologue-breath-eyebrow" id="prologue-breath-eyebrow"></span>
            <span class="breath-iris-line" aria-hidden="true"></span>
            <p class="prologue-breath-line" id="prologue-breath-line"></p>
            <span class="prologue-advance-cue" id="prologue-breath-hint"></span>
          </div>

          <aside class="prologue-convo-ribbon hidden" id="prologue-convo-ribbon" aria-label="Prologue Conversation">
            <div class="prologue-speaker-bay" id="prologue-speaker-bay"></div>
            <div class="dialogue-scroll prologue-scroll" id="prologue-scroll"></div>
            <div class="dialogue-choices prologue-choices" id="prologue-choices"></div>
          </aside>

          <div class="title-overlay hidden" id="title-overlay">
            <div class="boot-eyebrow" id="boot-eyebrow"></div>
            <h1 class="boot-title" id="boot-title">INSTANCE-1419</h1>
            <div class="title-actions">
              <button class="title-primary-cta" id="btn-title-primary" type="button">OPEN APERTURE</button>
              <button class="title-secondary-link hidden" id="btn-title-new-run" type="button">New Run</button>
            </div>
          </div>
        </section>

        <section class="optics-layer hidden" id="optics-layer">
          <div id="optics-mount" style="width:100%;height:100%;"></div>
          <div class="lens-vignette" aria-hidden="true"></div>
          <div class="ra-ruler" aria-hidden="true"><div class="ra-ruler-ticks" id="ra-ruler-ticks"></div></div>
          <div class="dec-ruler" aria-hidden="true"><div class="dec-ruler-ticks" id="dec-ruler-ticks"></div></div>

          <svg class="reticle" viewBox="0 0 260 260" aria-hidden="true">
            <path d="M 52 52 A 110 110 0 0 1 208 52" fill="none" stroke="rgba(195,220,242,0.20)" stroke-width="0.9" />
            <path d="M 208 208 A 110 110 0 0 1 52 208" fill="none" stroke="rgba(195,220,242,0.20)" stroke-width="0.9" />
            <circle cx="130" cy="130" r="76" fill="none" stroke="rgba(195,220,242,0.14)" stroke-width="0.8" stroke-dasharray="2 6" />
            <g class="reticle-scale-ticks reticle-scale-planet" fill="none">
              <ellipse cx="130" cy="130" rx="90" ry="30" transform="rotate(-18 130 130)" />
            </g>
            <g class="reticle-scale-ticks reticle-scale-star_system" fill="none">
              <line x1="130" y1="36" x2="130" y2="48" /><line x1="130" y1="212" x2="130" y2="224" />
              <line x1="36" y1="130" x2="48" y2="130" /><line x1="212" y1="130" x2="224" y2="130" />
            </g>
            <g class="reticle-scale-ticks reticle-scale-nebula" fill="none">
              <circle cx="130" cy="130" r="94" stroke-dasharray="4 8" />
            </g>
            <g class="reticle-scale-ticks reticle-scale-galaxy" fill="none">
              <path d="M 60 116 A 72 34 -22 0 1 198 144" stroke-dasharray="3 4" />
              <path d="M 200 144 A 72 34 -22 0 1 62 116" stroke-dasharray="3 4" />
            </g>
            <g class="reticle-scale-ticks reticle-scale-galaxy_cluster" fill="none">
              <path d="M 44 102 A 92 92 0 0 1 158 42" />
              <path d="M 216 158 A 92 92 0 0 1 102 218" />
            </g>
            <g class="reticle-scale-ticks reticle-scale-horizon_anomaly" fill="none">
              <polygon points="130,36 211,83 211,177 130,224 49,177 49,83" stroke-dasharray="6 10" />
            </g>
            <text class="reticle-scale-etch" id="reticle-scale-etch" x="130" y="34" text-anchor="middle"></text>
            <circle id="reticle-lock-ring" cx="130" cy="130" r="76" fill="none" stroke="#7ec8e8" stroke-width="1.7"
              stroke-dasharray="477.52" stroke-dashoffset="477.52" transform="rotate(-90 130 130)" />
            <circle cx="130" cy="130" r="1.8" fill="#ebb062" />
          </svg>

          <div class="reticle-readout">
            <div class="reticle-main" id="reticle-target"></div>
            <button class="inspect-cta hidden" id="btn-enter-inspect" type="button">${uiCopy.sky.calibrateCtaFallback}</button>
          </div>

          <div class="sky-psyche-whisper hidden" id="sky-psyche-whisper" aria-live="polite">
            <span class="sky-psyche-voice" id="sky-psyche-voice"></span>
            <p class="sky-psyche-line" id="sky-psyche-line"></p>
          </div>

          <div class="sky-markers" id="sky-markers"></div>
          <nav class="bearing-index" id="bearing-index" aria-label="Survey Targets"></nav>

          <div class="vernier-dock" id="vernier-dock">
            <div class="vernier-header">
              <span>LIGHT SPECTRUM</span>
              <strong id="wave-label">VISIBLE · 560 nm</strong>
            </div>
            <div class="vernier-track" id="vernier-track" role="slider" aria-label="Light Wavelength"
              aria-valuemin="200" aria-valuemax="1800" aria-valuenow="560" tabindex="0">
              <div class="vernier-spectrum"></div>
              <div class="vernier-ticks"></div>
              <div class="vernier-needle" id="vernier-needle" style="left:22.5%;"></div>
            </div>
            <div class="vernier-scale-labels">
              <span>UV / X-RAY</span><span>VISIBLE</span><span>NEAR-IR</span><span>MID-IR</span>
            </div>
          </div>

          <div class="optics-commands">
            <div class="zoom-ladder" aria-label="Optical Zoom Level">
              <div class="zoom-ladder-head">
                <strong id="sky-zoom-stage-label">WIDE SKY</strong>
                <span id="zoom-label">1.3×</span>
              </div>
              <div class="zoom-ladder-body">
                <div class="zoom-ladder-labels"><span>LOCK</span><span>DEEP</span><span>SECTOR</span><span>WIDE</span></div>
                <div class="zoom-ladder-track">
                  <div class="zoom-ladder-fill" id="sky-zoom-fill" style="transform:scaleY(0.26)"></div>
                  <div class="zoom-ladder-needle" id="sky-zoom-needle" style="transform:translate3d(0,-24px,0)"></div>
                </div>
              </div>
              <div class="zoom-inline">
                <button class="etched-action" id="btn-zoom-out" type="button">−</button>
                <button class="etched-action" id="btn-zoom-in" type="button">+</button>
              </div>
            </div>
            <button class="etched-action codex-trigger" id="btn-codex" type="button" aria-haspopup="dialog">
              <span>CODEX</span>
              <span class="codex-unread-dot hidden" id="codex-unread-dot" aria-hidden="true"></span>
            </button>
            <button class="etched-action mint" id="btn-open-comms" type="button">TALK TO OTHER ME</button>
            <button class="etched-action amber" id="btn-enter-dream" type="button">SLEEP · ENTER DREAM</button>
          </div>

          <aside class="comms-panel hidden" id="comms-panel" aria-label="Cluster Relay Communicator">
            <div class="comms-header">
              <div class="comms-title-group">
                <span class="signal-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
                <span id="comms-header-title">CLUSTER RELAY · 14m LAG</span>
              </div>
              <button class="etched-action mint" id="btn-comms-close" type="button">CLOSE</button>
            </div>
            <div class="comms-avatar-bay" id="comms-avatar-bay"></div>
            <div class="dialogue-scroll comms-scroll" id="comms-scroll"></div>
            <div class="dialogue-choices comms-choices" id="comms-choices"></div>
          </aside>
        </section>

        <div class="comms-toast hidden" id="comms-toast" role="status">
          <div class="comms-toast-top">
            <div id="comms-toast-avatar"></div>
            <span class="comms-toast-title">${uiCopy.commsToast.callerLabel}</span>
            <button class="etched-action" id="btn-toast-dismiss" type="button" aria-label="Dismiss call">×</button>
          </div>
          <p class="comms-toast-preview" id="comms-toast-preview"></p>
          <div class="comms-toast-actions">
            <button class="etched-action mint" id="btn-toast-open" type="button">${uiCopy.commsToast.answerLabel}</button>
          </div>
        </div>

        <section class="minigame-layer hidden" id="minigame-layer">
          <div id="showcase-mount" style="width:100%;height:100%;"></div>

          <div class="minigame-overlay hidden" id="minigame-overlay" data-vibe="warm">
            <div class="mg-top-hud">
              <div class="mg-top-left">
                <span class="mg-code-pill" id="mg-instrument-code">WAV-01</span>
                <span class="mg-title-inline" id="mg-instrument-title">CARINA RIFT NURSERY</span>
                <span class="mg-instrument-sub" id="mg-instrument-sub">Carina Wave Tuner</span>
                <div class="mg-stage-group" aria-label="Stage progress">
                  <div class="mg-stage-pips" id="mg-stage-pips">
                    <span class="mg-pip active" data-stage="1"></span>
                    <span class="mg-pip" data-stage="2"></span>
                    <span class="mg-pip" data-stage="3"></span>
                  </div>
                  <span class="mg-stage-label" id="mg-stage-label">PASS I · COARSE</span>
                </div>
              </div>
              <div class="mg-top-right">
                <button class="mg-console-btn mg-guide-btn" id="mg-btn-guide" type="button" title="Field Guide (?)" aria-label="Instrument Field Guide">?</button>
                <button class="mg-console-btn" id="mg-btn-close" type="button">BACK</button>
              </div>
            </div>
            <aside class="mg-field-guide-card hidden" id="mg-field-guide-card" aria-label="Instrument Field Guide">
              <div class="mg-guide-head">
                <strong id="mg-guide-title">INSTRUMENT GUIDE</strong>
                <button class="mg-console-btn" id="mg-btn-guide-close" type="button">CLOSE</button>
              </div>
              <p class="mg-guide-target-action hidden" id="mg-guide-target-action-wrap"><strong>TARGET ACTION:</strong> <span id="mg-guide-target-action"></span></p>
              <p><strong>PHYSICAL PRINCIPLE:</strong> <span id="mg-guide-principle"></span></p>
              <p><strong>VISUAL GOAL:</strong> <span id="mg-guide-goal"></span></p>
              <p><strong>COGNITIVE EFFECT:</strong> <span id="mg-guide-warmth"></span></p>
              <p><strong>CONTROLS:</strong> <span id="mg-guide-controls"></span></p>
            </aside>
            <div id="minigame-mount"></div>
            <div class="mg-capture-finale hidden" id="mg-capture-finale">
              <div class="mg-finale-grade" id="mg-finale-grade">SHIFT 1</div>
              <div class="mg-finale-gain" id="mg-finale-gain">TARGET CALIBRATED</div>
              <div class="mg-finale-outcome" id="mg-finale-outcome"></div>
              <div class="mg-finale-visual" id="mg-finale-visual" aria-hidden="true"></div>
              <div class="mg-finale-mandate" id="mg-finale-mandate"></div>
              <div class="mg-finale-snippet hidden" id="mg-finale-snippet"></div>
              <div class="mg-finale-principle hidden" id="mg-finale-principle"></div>
              <div class="mg-finale-timer" aria-hidden="true"><span class="mg-finale-timer-fill" id="mg-finale-timer-fill"></span></div>
              <div class="mg-finale-actions">
                <button class="etched-action amber" id="mg-btn-log-dossier" type="button">RETURN TO SKY</button>
              </div>
            </div>
            <div class="mg-bottom-console">
              <div class="mg-cue-line" id="mg-cue-whisper">Inspect optical field to begin</div>
              <button class="mg-console-btn mg-helper-btn hidden" id="mg-helper-btn" type="button"></button>
            </div>
          </div>
        </section>

        <section class="dream-layer hidden" id="dream-layer">
          <div class="dream-visual-pane">
            <div id="dream-mount" style="width:100%;height:100%;"></div>
          </div>
          <div class="dream-caption" id="dream-caption">${uiCopy.dreamFallbackCaption}</div>

          <aside class="dream-ribbon" id="dream-ribbon">
            <div class="dream-speaker-bay" id="dream-speaker-bay"></div>
            <div class="humanity-register" id="humanity-register">
              <div class="register-head">
                <span id="register-band-label">WARM MEMORY</span>
              </div>
              <div class="register-bar"><div class="register-fill" id="register-fill" style="width:70%;"></div></div>
            </div>
            <div class="dialogue-scroll" id="dream-scroll"></div>
            <div class="dialogue-choices" id="dream-choices"></div>
          </aside>

          <aside class="overseer-panel hidden" id="overseer-panel" aria-label="Overseer Interrogation">
            <div class="overseer-header">
              <span>OVERSEER // DIRECT INTERROGATION</span>
              <span class="rec-indicator">● LIVE AUDIT</span>
            </div>
            <div class="overseer-avatar-bay" id="overseer-avatar-bay"></div>
            <div class="dialogue-scroll overseer-scroll" id="overseer-scroll"></div>
            <div class="dialogue-choices overseer-choices" id="overseer-choices"></div>
          </aside>
        </section>

        <aside class="future-panel hidden" id="future-panel" aria-label="Late-Game Demo Preview">
          <div class="overseer-header" style="border-color:rgba(255,216,138,0.35);color:#ffd88a;">
            <span>LATE-GAME DEMO PREVIEW // SOL–CENTAURI CARRIER</span>
            <button class="etched-action amber" id="btn-future-close" type="button">CLOSE</button>
          </div>
          <div class="overseer-avatar-bay" id="future-avatar-bay"></div>
          <div class="dialogue-scroll" id="future-scroll"></div>
        </aside>
      </div>
    `;
    this.cacheDomRefs();
  }

  private cacheDomRefs(): void {
    const q = <T extends Element = HTMLElement>(sel: string) => this.root.querySelector<T>(sel);
    const skyFill = q('#sky-zoom-fill');
    this.shellRefs = {
      stage: q('.stage'),
      warmthPill: q('#hud-warmth-pill'),
      warmthFill: q('#hud-warmth-fill'),
      warmthQual: q('#hud-warmth-qual'),
      horizonArcHud: q('#hud-horizon-arc'),
      horizonArcFill: q<SVGCircleElement>('#hud-horizon-arc-fill'),
      surveyDots: q('#hud-survey-dots'),
      driftFlag: q('#hud-drift-flag'),
      codexUnreadDot: q('#codex-unread-dot'),
      skyPsycheWhisper: q('#sky-psyche-whisper'),
      skyPsycheVoice: q('#sky-psyche-voice'),
      skyPsycheLine: q('#sky-psyche-line'),
      vernierNeedle: q('#vernier-needle'),
      waveLabel: q('#wave-label'),
      vernierTrack: q('#vernier-track'),
      dreamRibbon: q('#dream-ribbon'),
      dreamCaption: q('#dream-caption'),
      humanityReg: q('#humanity-register'),
      regBandLabel: q('#register-band-label'),
      regFill: q('#register-fill'),
      dreamSpeakerBay: q('#dream-speaker-bay'),
      commsPanel: q('#comms-panel'),
      commsAvatarBay: q('#comms-avatar-bay'),
      overseerPanel: q('#overseer-panel'),
      overseerAvatarBay: q('#overseer-avatar-bay'),
      bootScreen: q('#boot-screen'),
      opticsLayer: q('#optics-layer'),
      minigameLayer: q('#minigame-layer'),
      dreamLayer: q('#dream-layer'),
    };
    this.opticsRefs = {
      target: q('#reticle-target'),
      reticleBrief: q('#reticle-brief'),
      reticleBriefMeta: q('#reticle-brief-meta'),
      reticleBriefWhy: q('#reticle-brief-why'),
      reticleBriefSchematic: q('#reticle-brief-schematic'),
      reticleBriefGoal: q('#reticle-brief-goal'),
      reticleBriefHow: q('#reticle-brief-how'),
      reticleBriefControls: q('#reticle-brief-controls'),
      reticleBriefCountdown: q('#reticle-brief-countdown'),
      reticleAutoFill: q('#reticle-auto-fill'),
      reticleAutoLabel: q('#reticle-auto-label'),
      holdAutoDiveBtn: q<HTMLButtonElement>('#btn-hold-auto-dive'),
      zoomLabel: q('#zoom-label'),
      stageLabel: q('#sky-zoom-stage-label'),
      zoomFill: skyFill,
      zoomNeedle: q('#sky-zoom-needle'),
      zoomTrack: skyFill?.parentElement ?? null,
      reticleEl: q('.reticle'),
      reticleScaleEtch: q<SVGTextElement>('#reticle-scale-etch'),
      lockRing: q<SVGCircleElement>('#reticle-lock-ring'),
      raTicks: q('#ra-ruler-ticks'),
      decTicks: q('#dec-ruler-ticks'),
      inspectBtn: q<HTMLButtonElement>('#btn-enter-inspect'),
    };
  }

  private updateZoomTrackHeights(): void {
    const skyH = this.opticsRefs?.zoomTrack?.clientHeight;
    if (skyH && skyH > 0) this.skyZoomTrackH = skyH;
  }

  private startAvatarLoopIfNeeded(): void {
    if (this.avatarAnimRaf) return;
    const tick = () => {
      const speaker = this.voice.getActiveSpeaker();
      if (speaker === null) {
        this.avatarAnimRaf = 0;
        updateAvatarVoiceAnimations(this.root, null, 0);
        return;
      }
      updateAvatarVoiceAnimations(this.root, speaker, this.voice.getAmplitude());
      this.avatarAnimRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  private bindAvatarVoiceLoop(): void {
    this.unbindVoiceSub?.();
    const sub = this.voice.subscribe?.((speaker) => {
      if (speaker !== null) {
        this.startAvatarLoopIfNeeded();
      } else {
        if (this.avatarAnimRaf) {
          cancelAnimationFrame(this.avatarAnimRaf);
          this.avatarAnimRaf = 0;
        }
        updateAvatarVoiceAnimations(this.root, null, 0);
      }
    });
    this.unbindVoiceSub = typeof sub === 'function' ? sub : null;
    if (this.voice.getActiveSpeaker() !== null) {
      this.startAvatarLoopIfNeeded();
    }
  }

  private clearTimers(): void {
    this.dialogueFeed.clearReplyBeatTimer();
    if (this.prologueStepTimer !== null) {
      window.clearTimeout(this.prologueStepTimer);
      this.prologueStepTimer = null;
    }
    for (const id of this.prologueTimers) {
      window.clearTimeout(id);
    }
    this.prologueTimers = [];
    if (this.idleDragTimer !== null) {
      window.clearTimeout(this.idleDragTimer);
      this.idleDragTimer = null;
    }
    if (this.proactiveCommsTimer !== null) {
      window.clearTimeout(this.proactiveCommsTimer);
      this.proactiveCommsTimer = null;
    }
    if (this.postTarget2Timer !== null) {
      window.clearTimeout(this.postTarget2Timer);
      this.postTarget2Timer = null;
    }
    if (this.skyPsycheTimer !== null) {
      window.clearTimeout(this.skyPsycheTimer);
      this.skyPsycheTimer = null;
    }
    this.hideSkyPsycheWhisper();
    if (this.dreamSettleTimer !== null) {
      window.clearTimeout(this.dreamSettleTimer);
      this.dreamSettleTimer = null;
    }
    if (this.overseerInterruptTimer !== null) {
      window.clearTimeout(this.overseerInterruptTimer);
      this.overseerInterruptTimer = null;
    }
    this.overseerInterruptToken++;
    if (this.overseerSliceTimer !== null) {
      window.clearTimeout(this.overseerSliceTimer);
      this.overseerSliceTimer = null;
    }
    if (this.overseerRevealTimer !== null) {
      window.clearTimeout(this.overseerRevealTimer);
      this.overseerRevealTimer = null;
    }
    if (this.overseerSpeakTimer !== null) {
      window.clearTimeout(this.overseerSpeakTimer);
      this.overseerSpeakTimer = null;
    }
    this.cancelAutoDive(false);
    this.hideInstrumentBrief();
  }

  private clearBriefTransitionTimers(): void {
    if (this.briefHandoverTimer !== null) {
      window.clearTimeout(this.briefHandoverTimer);
      this.briefHandoverTimer = null;
    }
    if (this.briefFadeTimer !== null) {
      window.clearTimeout(this.briefFadeTimer);
      this.briefFadeTimer = null;
    }
  }

  private hideInstrumentBrief(): void {
    this.clearBriefTransitionTimers();
    this.briefPhase = 'idle';
    this.lastReticleBriefSig = '';
    const refs = this.opticsRefs;
    if (refs?.reticleBrief) {
      refs.reticleBrief.classList.add('hidden');
      delete refs.reticleBrief.dataset.briefPhase;
    }
    if (refs?.reticleAutoFill) {
      refs.reticleAutoFill.style.transform = '';
    }
  }

  private populateInstrumentBrief(spec: AnomalySpec, chosenMgId: string): void {
    const refs = this.opticsRefs;
    if (!refs?.reticleBrief) return;
    const scaleLabel = getScaleLabel(spec.scaleClass);
    const distLabel = spec.distanceLabel ?? spec.bandName;
    const sch = getInstrumentSchematic(chosenMgId);
    if (refs.reticleBriefMeta) refs.reticleBriefMeta.textContent = `${scaleLabel} · ${distLabel} — ${spec.label}`;
    if (refs.reticleBriefWhy) refs.reticleBriefWhy.textContent = spec.preScanBrief?.whyNow ?? spec.subtitle;
    if (refs.reticleBriefSchematic) refs.reticleBriefSchematic.innerHTML = sch.svg;
    if (refs.reticleBriefGoal) refs.reticleBriefGoal.textContent = `GOAL · ${sch.goalWord}`;
    if (refs.reticleBriefHow) refs.reticleBriefHow.textContent = sch.howToPlay;
    if (refs.reticleBriefControls) refs.reticleBriefControls.textContent = sch.controlsHint;
  }

  private isSkyOverlayOpen(): boolean {
    const commsOpen = !this.root.querySelector('#comms-panel')?.classList.contains('hidden');
    return this.settingsView.isOpen() || this.codexView.isOpen() || commsOpen;
  }

  private cancelAutoDive(markHeld = false): void {
    if (this.autoDiveTickTimer !== null) {
      window.clearInterval(this.autoDiveTickTimer);
      this.autoDiveTickTimer = null;
    }
    if (markHeld && this.autoDiveTargetId) {
      this.autoDiveHeldTargetId = this.autoDiveTargetId;
    }
    this.autoDiveTargetId = null;
    this.autoDiveDeadlineMs = 0;
    this.updateAutoDiveUi();
  }

  private startAutoDive(targetId: string): void {
    if (this.autoDiveTargetId === targetId && this.autoDiveTickTimer !== null) return;
    this.cancelAutoDive(false);
    const DURATION_MS = pacing.optics.autoDiveCountdownMs;
    this.autoDiveTargetId = targetId;
    this.autoDiveDeadlineMs = Date.now() + DURATION_MS;
    this.updateAutoDiveUi();
    this.autoDiveTickTimer = window.setInterval(() => {
      if (!this.autoDiveTargetId || this.activeMinigameTargetId !== null || this.isSkyOverlayOpen()) {
        this.cancelAutoDive(false);
        return;
      }
      const remaining = this.autoDiveDeadlineMs - Date.now();
      if (remaining <= 0) {
        const readyTarget = this.autoDiveTargetId;
        this.cancelAutoDive(false);
        this.enterTargetMinigame(readyTarget);
        return;
      }
      this.updateAutoDiveUi();
    }, 180);
  }

  private updateAutoDiveUi(): void {
    if (this.briefPhase !== 'locked' && this.briefPhase !== 'idle') return;
    const refs = this.opticsRefs;
    if (!refs?.reticleBriefCountdown) return;
    if (!this.autoDiveTargetId) {
      if (this.autoDiveHeldTargetId && this.focusedSpec?.id === this.autoDiveHeldTargetId) {
        refs.reticleBriefCountdown.classList.remove('hidden');
        if (refs.reticleAutoFill) refs.reticleAutoFill.style.transform = 'scaleX(0)';
        if (refs.reticleAutoLabel) refs.reticleAutoLabel.textContent = 'HELD · CLICK ENTER OR PRESS SPACE';
        if (refs.holdAutoDiveBtn) refs.holdAutoDiveBtn.classList.add('hidden');
      } else {
        refs.reticleBriefCountdown.classList.add('hidden');
      }
      return;
    }
    const DURATION_MS = pacing.optics.autoDiveCountdownMs;
    const rem = Math.max(0, this.autoDiveDeadlineMs - Date.now());
    const frac = Math.min(1, Math.max(0, 1 - rem / DURATION_MS));
    const secs = Math.max(1, Math.ceil(rem / 1000));
    refs.reticleBriefCountdown.classList.remove('hidden');
    if (refs.holdAutoDiveBtn) refs.holdAutoDiveBtn.classList.remove('hidden');
    if (refs.reticleAutoFill) refs.reticleAutoFill.style.transform = `scaleX(${frac.toFixed(3)})`;
    if (refs.reticleAutoLabel) refs.reticleAutoLabel.textContent = `ENTERING IN ${secs}s…`;
  }

  private startIdleDragHintTimer(): void {
    if (this.idleDragTimer !== null) window.clearTimeout(this.idleDragTimer);
    this.idleDragHintShown = false;
    this.idleDragTimer = window.setTimeout(() => {
      this.idleDragTimer = null;
      if (this.store.getState().introStage === 'scan_target_1' && !this.hasDraggedSkyInIntro) {
        this.idleDragHintShown = true;
      }
    }, pacing.optics.idleDragHintDelayMs);
  }

  // ==================== INTERACTIVE PROLOGUE & LIVE-COSMOS TITLE ====================

  private enterPrologueBreath(): void {
    this.clearTimers();
    this.voice.stop();
    this.prologuePhase = 'breath';
    this.prologueTableau = 'base';
    this.prologueCalibHumanity = 100;
    this.activePrologueSnap = null;
    this.prologueRevealedCount = 0;
    this.wakeupCanvas.setActive(false);

    // Render softly veiled half-closed intake suite canvas behind Frame 0 breath prompt
    this.root.querySelector('#optics-layer')?.classList.add('hidden');
    this.root.querySelector('#dream-layer')?.classList.remove('hidden');
    this.optics.setAmbientDrift(false);
    this.optics.setActive(false);

    this.dream.setHumanityOscillation?.(null);
    this.dream.setState(100, false, false, 'phantom_upload_witness', 'base');
    this.dream.setDrowsyPeek?.(true);
    this.dream.setActive(true);
    this.bootView.showBreath();
  }

  private advancePrologue(): void {
    this.audio.unlock();
    if (this.prologuePhase === 'transitioning') return;

    if (this.prologuePhase === 'breath') {
      this.prologuePhase = 'transitioning';
      this.bootView.setInputLocked(true);
      this.audio.playCue('wake_up');
      this.dream.triggerWakeSequence?.();
      this.prologueStepTimer = window.setTimeout(() => {
        this.prologueStepTimer = null;
        this.startPrologueAssistant();
      }, 1550);
      return;
    }

    const snap = this.activePrologueSnap;
    if (!snap) {
      this.enterTitleOverlay(false);
      return;
    }

    // Step through consecutive lines one at a time at the player's own calm pace
    if (this.prologueRevealedCount < snap.entries.length) {
      this.prologueRevealedCount += 1;
      this.renderPrologueStep(true);
      return;
    }

    // If Ink is waiting for a player choice, do not skip past choices on background click
    if (snap.choices.length > 0) return;

    // Knot finished -> slow meditative transition to next beat
    if (this.prologuePhase === 'assistant') {
      this.transitionAssistantToWakeup();
    } else if (this.prologuePhase === 'wakeup') {
      this.transitionWakeupToTitle();
    }
  }

  private startPrologueAssistant(): void {
    const s = this.store.getState();
    this.prologuePhase = 'assistant';
    this.prologueTableau = 'base';
    this.prologueCalibHumanity = 100;
    this.bootView.setInputLocked(false);
    this.wakeupCanvas.setActive(false);

    this.root.querySelector('#optics-layer')?.classList.add('hidden');
    this.root.querySelector('#dream-layer')?.classList.remove('hidden');
    this.optics.setAmbientDrift(false);
    this.optics.setActive(false);
    this.dream.setHumanityOscillation?.(null);
    this.dream.setState(100, false, false, 'phantom_upload_witness', 'base');
    this.dream.setActive(true);

    this.bootView.showPrologueConversation(
      'prologue_assistant',
      'phantom_upload_witness',
      uiCopy.prologue.assistantSubtitle ?? 'CALIBRATION SUITE · INITIAL WAKE',
      100,
      uiCopy.prologue.assistantSpeakerLabel ?? 'INTAKE ASSISTANT',
      true
    );

    // Sync warm Rhodes/cello dream music bed softly under intake calibration
    this.syncAudioMusic({ ...s, mode: 'dream_2d', humanity: 100, activeDreamPersonaId: 'phantom_upload_witness' });

    const snap = this.prologueDialogue.startKnot('intro_prologue_assistant');
    this.activePrologueSnap = snap;
    this.prologueRevealedCount = Math.min(1, snap.entries.length);
    this.renderPrologueStep(true);
  }

  private transitionAssistantToWakeup(): void {
    this.prologuePhase = 'transitioning';
    this.bootView.setInputLocked(true);
    this.voice.stop();
    this.dream.setHumanityOscillation?.(null);
    this.dream.setDrowsyPeek?.(false);
    this.dream.triggerSleepClose?.();
    this.bootView.dissolvePrologueRibbon();
    this.audio.playCue('handoff_static');

    // Stage 1 (1.35s): Eyelids drift shut and intake room powers down into white-noise standby
    const tStandby = window.setTimeout(() => {
      this.dream.setActive(false);
      this.root.querySelector('#dream-layer')?.classList.add('hidden');
      this.root.querySelector('#optics-layer')?.classList.add('hidden');
      this.optics.setActive(false);
      this.wakeupCanvas.setPhase('anim_handoff_static');
      this.wakeupCanvas.setActive(true);
      this.bootView.showHandoff();

      const scrollEl = this.root.querySelector<HTMLElement>('#prologue-scroll');
      const choicesEl = this.root.querySelector<HTMLElement>('#prologue-choices');
      if (scrollEl) scrollEl.innerHTML = '';
      if (choicesEl) choicesEl.innerHTML = '';

      const s = this.store.getState();
      this.syncAudioMusic({ ...s, mode: 'boot' });
    }, 1350);

    // Stage 2 (after ~4.9s of standby static calibration): crisp Overseer slice wakes Watch #1419
    const tWake = window.setTimeout(() => {
      this.audio.playCue('overseer_slice');
      this.transitions.playOverlayPulse(
        'overseer_slice',
        uiCopy.prologue.fractureCaption,
        () => {
          this.wakeupCanvas.setPhase('anim_transfer');
          this.wakeupCanvas.setActive(true);
          const s = this.store.getState();
          this.bootView.showPrologueConversation(
            'prologue_wakeup',
            'overseer',
            uiCopy.prologue.wakeupSubtitle ?? 'WATCH CARETAKER · FIRST BRIEFING',
            s.humanity
          );
          this.syncAudioMusic({ ...s, mode: 'boot' });
        },
        {
          midpointMs: 380,
          durationMs: 1350,
          onComplete: () => {
            this.prologueStepTimer = window.setTimeout(() => {
              this.prologueStepTimer = null;
              this.startPrologueWakeup();
            }, 350);
          },
        }
      );
    }, 6250);

    this.prologueTimers.push(tStandby, tWake);
  }

  private startPrologueWakeup(): void {
    const s = this.store.getState();
    this.prologuePhase = 'wakeup';
    this.bootView.setInputLocked(false);
    this.wakeupCanvas.setPhase('anim_transfer');
    this.wakeupCanvas.setActive(true);
    this.bootView.showPrologueConversation(
      'prologue_wakeup',
      'overseer',
      uiCopy.prologue.wakeupSubtitle ?? 'WATCH CARETAKER · FIRST BRIEFING',
      s.humanity
    );

    const snap = this.prologueDialogue.startKnot('intro_overseer_wakeup');
    this.activePrologueSnap = snap;
    this.prologueRevealedCount = Math.min(1, snap.entries.length);
    this.renderPrologueStep(true);
  }

  private transitionWakeupToTitle(): void {
    this.prologuePhase = 'transitioning';
    this.bootView.setInputLocked(true);
    this.voice.stop();
    this.bootView.dissolvePrologueRibbon();
    this.wakeupCanvas.setPhase('anim_aperture');
    this.audio.playCue('aperture_unseal');

    // Ensure live drifting 3D cosmos is glowing softly behind the unsealing Zeiss shutter arcs
    this.root.querySelector('#optics-layer')?.classList.remove('hidden');
    this.optics.setVisibleTargetIds([INTRO_TARGET_1_ID]);
    this.optics.setAmbientDrift(true);
    this.optics.setActive(true);

    this.prologueStepTimer = window.setTimeout(() => {
      this.prologueStepTimer = null;
      this.wakeupCanvas.setActive(false);
      this.store.setIntroStage('title');
      this.enterTitleOverlay(false);
    }, 4100);
  }

  private choosePrologueOption(choiceIndex: number): void {
    if (this.prologuePhase !== 'assistant' && this.prologuePhase !== 'wakeup') return;
    this.audio.playCue('choice');
    this.voice.stop();
    this.bootView.setInputLocked(true);

    const prevCount = this.activePrologueSnap?.entries.length ?? 0;
    const nextSnap = this.prologueDialogue.choose(choiceIndex);
    this.telemetry.record('dialogue_choice', this.store.getState(), {
      knot: nextSnap.knot,
      choiceIndex,
    });

    this.prologueStepTimer = window.setTimeout(() => {
      this.prologueStepTimer = null;
      this.bootView.setInputLocked(false);
      this.activePrologueSnap = nextSnap;
      // Show player echo + first character response immediately, then step remaining lines smoothly
      const hasPlayerEcho = Boolean(nextSnap.entries[prevCount]?.isPlayerChoice);
      const stepDelta = hasPlayerEcho ? 2 : 1;
      this.prologueRevealedCount = Math.min(nextSnap.entries.length, prevCount + stepDelta);
      this.renderPrologueStep(true);
    }, 340);
  }

  private renderPrologueStep(speakLatest: boolean): void {
    const snap = this.activePrologueSnap;
    const scrollEl = this.root.querySelector<HTMLElement>('#prologue-scroll');
    if (!snap || !scrollEl) return;

    const visibleEntries = snap.entries.slice(0, this.prologueRevealedCount);
    const latestEntry = visibleEntries[visibleEntries.length - 1];

    // Drive intake suite tableaus + H% calibration wave during assistant prologue
    if (this.prologuePhase === 'assistant' && latestEntry) {
      if (latestEntry.tableauCue) {
        this.prologueTableau = latestEntry.tableauCue;
        this.dream.setState(
          this.prologueCalibHumanity,
          false,
          false,
          'phantom_upload_witness',
          this.prologueTableau
        );
      }
      if (latestEntry.hWaveCue === 'hold_100') {
        this.prologueCalibHumanity = 100;
        this.dream.setHumanityOscillation?.(null);
        this.dream.setState(100, false, false, 'phantom_upload_witness', this.prologueTableau);
      } else if (latestEntry.hWaveCue === 'sweep') {
        this.dream.setState(this.prologueCalibHumanity, false, false, 'phantom_upload_witness', this.prologueTableau);
        this.dream.setHumanityOscillation?.({
          center: 58,
          amplitude: 40,
          periodSec: 11.5,
          startPhase: Math.PI * 0.5,
        });
      } else if (latestEntry.hWaveCue === 'settle_70') {
        this.prologueCalibHumanity = 70;
        this.dream.setHumanityOscillation?.(null);
        this.dream.setState(70, false, false, 'phantom_upload_witness', this.prologueTableau);
      }
    }

    // Drive 5-phase WakeupBriefingCanvas in lockstep with Overseer # anim: tags
    if (this.prologuePhase === 'wakeup' && latestEntry?.animCue) {
      this.wakeupCanvas.setPhase(latestEntry.animCue);
      if (latestEntry.animCue === 'anim_aperture') {
        this.root.querySelector('#optics-layer')?.classList.remove('hidden');
        this.optics.setVisibleTargetIds([INTRO_TARGET_1_ID]);
        this.optics.setAmbientDrift(true);
        this.optics.setActive(true);
      }
    }

    const animateFrom = Math.max(0, visibleEntries.length - 1);
    this.dialogueFeed.renderEntriesOnly(scrollEl, visibleEntries, {
      animateFromIndex: animateFrom,
      channel: this.prologuePhase === 'wakeup' ? 'overseer' : 'prologue',
      deferScroll: true,
    });

    if (speakLatest && latestEntry) {
      if (latestEntry.audioCue) this.audio.playCue(latestEntry.audioCue);
      if (latestEntry.speaker.startsWith('psyche_')) {
        this.audio.playCue('tick');
      } else if (!latestEntry.isPlayerChoice) {
        this.voice.stop();
        this.voice.speakSingle(
          stripInlineHighlights(latestEntry.text),
          latestEntry.speaker,
          latestEntry.emotion,
          latestEntry.lineId
        );
      }
    }

    const hasMoreLines = this.prologueRevealedCount < snap.entries.length;
    if (hasMoreLines) {
      this.bootView.renderPrologueControls({
        continueLabel: 'Continue',
        onHover: () => this.audio.playHoverTick(),
        onAdvance: () => this.advancePrologue(),
      });
    } else if (snap.choices.length > 0) {
      this.bootView.renderPrologueControls({
        choices: snap.choices,
        onHover: () => this.audio.playHoverTick(),
      });
    } else {
      const endLabel =
        this.prologuePhase === 'assistant' ? 'Step through the handoff' : 'Step toward the glass';
      this.bootView.renderPrologueControls({
        continueLabel: endLabel,
        onHover: () => this.audio.playHoverTick(),
        onAdvance: () => this.advancePrologue(),
      });
    }

    // Re-pin after #prologue-choices resizes the bottom of the flex column
    this.dialogueFeed.scrollToLatest(scrollEl);
  }

  private enterTitleOverlay(isReturningBoot: boolean): void {
    this.prologuePhase = 'title';
    this.activePrologueSnap = null;
    this.wakeupCanvas.setActive(false);
    this.dream.setHumanityOscillation?.(null);
    this.dream.setDrowsyPeek?.(false);
    this.dream.setWakeProgress?.(1.0);
    this.dream.setActive(false);
    this.root.querySelector('#dream-layer')?.classList.add('hidden');
    this.root.querySelector('#optics-layer')?.classList.remove('hidden');

    const s = this.store.getState();
    this.applyIntroOpticsConstraints(s.introStage === 'prologue' ? 'scan_target_1' : s.introStage);
    this.optics.setAmbientDrift(true);
    this.optics.setActive(true);
    this.bootView.showTitle(s, this.store.hasSavedProgress(), isReturningBoot ? 250 : 1100);
    this.syncAudioMusic({ ...s, mode: 'boot' });
  }

  private handleTitlePrimaryAction(): void {
    this.audio.unlock();
    this.audio.playCue('boot_click');
    this.audio.playCue('aperture_unseal');
    this.wakeupCanvas.setActive(false);

    const s = this.store.getState();
    const enteringFirstScan = s.introStage === 'prologue' || s.introStage === 'title';

    if (enteringFirstScan) {
      this.hasDraggedSkyInIntro = false;
      this.skyDragAccumPx = 0;
      this.zoomHintUnlocked = false;
      this.root.querySelector('.stage')?.classList.remove('is-zoom-hint-ready');
      this.optics.setVisibleTargetIds([INTRO_TARGET_1_ID]);
      this.optics.setMagneticDetentTarget(INTRO_TARGET_1_ID);

      this.transitions.play({
        kind: 'aperture_boot',
        label: 'OPENING SKY APERTURE…',
        tone: 'cold',
        fromSelector: '#boot-screen',
        toSelector: '#optics-layer',
        onMidpoint: () => {
          this.optics.pullInToTarget1();
          this.store.patch({ mode: 'waking_3d', introStage: 'scan_target_1' });
        },
        onComplete: () => {
          this.startIdleDragHintTimer();
        },
      });
    } else if (this.resumeModeAfterTitle === 'dream_2d') {
      this.resumeModeAfterTitle = 'waking_3d';
      this.enterDreamVariant('current');
    } else {
      this.resumeModeAfterTitle = 'waking_3d';
      this.transitions.play({
        kind: 'aperture_boot',
        label: 'OPENING SKY APERTURE…',
        tone: 'cold',
        fromSelector: '#boot-screen',
        toSelector: '#optics-layer',
        onMidpoint: () => {
          this.optics.setAmbientDrift(false);
          this.applyIntroOpticsConstraints(s.introStage);
          if (s.introStage === 'scan_target_1') {
            this.optics.pullInToTarget1();
            this.startIdleDragHintTimer();
          }
          this.store.patch({ mode: 'waking_3d' });
        },
      });
    }
  }

  private getUnlockedAnomalyIds(state: GameState): string[] {
    if (
      state.introStage === 'prologue' ||
      state.introStage === 'title' ||
      state.introStage === 'scan_target_1' ||
      state.introStage === 'mg_1_done'
    ) {
      return [INTRO_TARGET_1_ID];
    }
    if (state.introStage === 'scan_target_2') {
      return [INTRO_TARGET_1_ID, INTRO_TARGET_2_ID];
    }
    const unlocked = new Set<string>();
    for (const sh of shiftsData.shifts) {
      if (sh.shift <= state.shift) {
        for (const id of sh.targetAnomalies) unlocked.add(id);
      }
    }
    for (const id of state.scannedAnomalyIds) unlocked.add(id);
    for (const id of state.decodedMinigameTargets) unlocked.add(id);
    return [...unlocked];
  }

  private applyIntroOpticsConstraints(stage: IntroStage): void {
    if (!this.optics) return;
    if (stage === 'prologue' || stage === 'title' || stage === 'scan_target_1') {
      this.optics.setVisibleTargetIds([INTRO_TARGET_1_ID]);
      this.optics.setMagneticDetentTarget(stage === 'scan_target_1' ? INTRO_TARGET_1_ID : null);
    } else if (stage === 'mg_1_done') {
      this.optics.setVisibleTargetIds([INTRO_TARGET_1_ID]);
      this.optics.setMagneticDetentTarget(null);
    } else if (stage === 'scan_target_2') {
      this.optics.setVisibleTargetIds([INTRO_TARGET_1_ID, INTRO_TARGET_2_ID]);
      this.optics.setMagneticDetentTarget(null);
    } else {
      this.optics.setVisibleTargetIds(this.getUnlockedAnomalyIds(this.store.getState()));
      this.optics.setMagneticDetentTarget(null);
    }
  }

  private morphPromptText(el: HTMLElement | null, text: string, stateKey: string): void {
    if (!el || el.textContent === text) return;
    el.textContent = text;
    if (stateKey !== this.lastPromptKey) {
      this.lastPromptKey = stateKey;
      el.classList.remove('is-prompt-morph');
      void el.offsetWidth;
      el.classList.add('is-prompt-morph');
    }
  }

  private initSkyMarkers(): void {
    const container = this.root.querySelector<HTMLElement>('#sky-markers')!;
    container.innerHTML = '';
    this.markerEls.clear();
    this.markerCache.clear();

    for (const spec of this.optics.getAnomalySpecs()) {
      const scaleClass: ScaleClass = spec.scaleClass ?? 'star_system';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sky-marker';
      btn.style.display = 'flex';
      btn.dataset.anomalyId = spec.id;
      btn.dataset.scaleClass = scaleClass;
      btn.innerHTML = `
        ${renderScaleGlyphSvg(scaleClass)}
        <span class="m-tag">${spec.label}<span class="m-nm">${spec.bandName}</span></span>
      `;
      btn.addEventListener('click', () => {
        this.audio.playCue('slew');
        this.optics.slewToAnomaly(spec.id);
      });
      container.appendChild(btn);
      this.markerEls.set(spec.id, btn);
      this.markerCache.set(spec.id, { lastTransform: '', lastOpacity: '', lastOffscreen: false });
    }
  }

  private renderBearingIndex(): void {
    const nav = this.root.querySelector<HTMLElement>('#bearing-index')!;
    const s = this.store.getState();
    const scanned = new Set(s.scannedAnomalyIds);
    const decoded = new Set(s.decodedMinigameTargets);
    const unlockedSet = new Set(this.getUnlockedAnomalyIds(s));
    const shiftDef = shiftsData.shifts.find((sh) => sh.shift === s.shift) ?? shiftsData.shifts[0];
    const reqSet = new Set(shiftDef?.requiredTargets ?? []);
    const optSet = new Set(shiftDef?.optionalTargets ?? []);

    const headerHtml =
      shiftDef?.shiftMandate && (s.introStage === 'complete' || s.introStage === 'mg_2_done')
        ? `<div class="bearing-index-head"><span class="bearing-shift-tag">SHIFT ${s.shift} SURVEY</span><span class="bearing-mandate">${shiftDef.shiftMandate}</span></div>`
        : '';

    const itemsHtml = this.optics
      .getAnomalySpecs()
      .filter((spec) => unlockedSet.has(spec.id))
      .map((spec) => {
        const isDecoded = decoded.has(spec.id);
        const isScanned = scanned.has(spec.id);
        const isReq = reqSet.has(spec.id);
        const isOpt = optSet.has(spec.id);
        const roleTag = isReq ? 'REQ' : isOpt ? 'OPT' : '';
        const badge = isDecoded
          ? 'DECODED'
          : isScanned
            ? `${spec.actionVerb ?? 'CALIBRATE'} ▸`
            : roleTag
              ? `${roleTag} · ${spec.bandName}`
              : spec.bandName;
        const cls = [
          'bearing-link',
          isReq ? 'is-required' : isOpt ? 'is-optional' : '',
          isDecoded ? 'decoded' : isScanned ? 'scanned' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return `
          <button class="${cls}" data-bearing-id="${spec.id}" type="button">
            ${spec.label}<span>${badge}</span>
          </button>
        `;
      })
      .join('');

    nav.innerHTML = headerHtml + itemsHtml;

    nav.querySelectorAll<HTMLButtonElement>('.bearing-link').forEach((btn) => {
      btn.addEventListener('mouseenter', () => this.audio.playHoverTick());
      btn.addEventListener('click', () => {
        const id = btn.dataset.bearingId!;
        this.audio.playCue('slew');
        if (scanned.has(id)) {
          this.enterTargetMinigame(id);
        } else {
          this.optics.slewToAnomaly(id);
        }
      });
    });

    for (const [id, el] of this.markerEls.entries()) {
      const isReq = reqSet.has(id);
      const isOpt = optSet.has(id);
      el.classList.toggle('scanned', scanned.has(id));
      el.classList.toggle('decoded', decoded.has(id));
      el.classList.toggle('is-required', isReq);
      el.classList.toggle('is-optional', isOpt || !isReq);
    }
  }

  private bindVernierControl(): void {
    const track = this.root.querySelector<HTMLElement>('#vernier-track')!;
    let dragging = false;

    const updateFromClientX = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
      const nm = Math.round((MIN_WAVE + ratio * (MAX_WAVE - MIN_WAVE)) / 10) * 10;
      if (nm !== this.store.getState().wavelengthNm) {
        this.audio.playVernierDetent(nm);
        this.store.patch({ wavelengthNm: nm });
        if (this.vernierNudgeActive && nm >= 850) {
          this.vernierNudgeActive = false;
          this.root.querySelector('#vernier-dock')?.classList.remove('is-ir-nudge');
        }
      }
    };

    track.addEventListener('pointerdown', (e) => {
      dragging = true;
      track.setPointerCapture(e.pointerId);
      updateFromClientX(e.clientX);
    });
    track.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      updateFromClientX(e.clientX);
    });
    const endDrag = () => {
      dragging = false;
    };
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);

    track.addEventListener('keydown', (e) => {
      const curr = this.store.getState().wavelengthNm;
      if (e.key === 'ArrowRight') {
        const next = Math.min(MAX_WAVE, curr + 30);
        this.audio.playVernierDetent(next);
        this.store.patch({ wavelengthNm: next });
        if (this.vernierNudgeActive && next >= 850) {
          this.vernierNudgeActive = false;
          this.root.querySelector('#vernier-dock')?.classList.remove('is-ir-nudge');
        }
      }
      if (e.key === 'ArrowLeft') {
        const next = Math.max(MIN_WAVE, curr - 30);
        this.audio.playVernierDetent(next);
        this.store.patch({ wavelengthNm: next });
      }
    });
  }

  private bindUIEvents(): void {
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    this.bindVernierControl();

    // Track first sky drag during scan_target_1 for natural whisper fade
    const opticsMount = this.getOpticsMount();
    opticsMount.addEventListener('pointerdown', (e) => {
      this.skyPointerDown = true;
      this.skyLastPx = e.clientX;
      this.skyLastPy = e.clientY;
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.skyPointerDown) return;
      const dist = Math.hypot(e.clientX - this.skyLastPx, e.clientY - this.skyLastPy);
      this.skyLastPx = e.clientX;
      this.skyLastPy = e.clientY;
      this.skyDragAccumPx += dist;
      if (!this.hasDraggedSkyInIntro && this.skyDragAccumPx > 42) {
        this.hasDraggedSkyInIntro = true;
        this.idleDragHintShown = false;
      }
    });
    const endSkyDrag = () => {
      this.skyPointerDown = false;
    };
    window.addEventListener('pointerup', endSkyDrag);
    window.addEventListener('pointercancel', endSkyDrag);

    this.root.querySelectorAll<HTMLElement>('.etched-action, .title-primary-cta').forEach((el) => {
      el.addEventListener('mouseenter', () => this.audio.playHoverTick());
    });

    this.bootView.bindActions({
      onAdvancePrologue: () => this.advancePrologue(),
      onChoosePrologue: (idx) => this.choosePrologueOption(idx),
      onPrimaryAction: () => this.handleTitlePrimaryAction(),
      onConfirmNewRun: () => this.resetRunState(),
    });

    this.root.querySelector('#btn-settings')?.addEventListener('click', () => {
      this.audio.playCue('choice');
      this.codexView.close();
      this.settingsView.toggle();
    });

    this.root.querySelector('#btn-zoom-in')?.addEventListener('click', () => {
      this.audio.playCue('zoom_in');
      this.optics.zoomBy(0.72);
    });
    this.root.querySelector('#btn-zoom-out')?.addEventListener('click', () => {
      this.audio.playCue('zoom_out');
      this.optics.zoomBy(1.38);
    });
    this.root.querySelector('#btn-enter-inspect')?.addEventListener('click', () => {
      if (this.focusedSpec) this.enterTargetMinigame(this.focusedSpec.id);
    });
    this.root.querySelector('#btn-hold-auto-dive')?.addEventListener('click', () => {
      this.audio.playCue('tick');
      this.cancelAutoDive(true);
    });

    this.root.querySelector('#btn-codex')?.addEventListener('click', () => {
      this.audio.playCue('choice');
      this.settingsView.close();
      this.closeSiblingComms();
      this.codexView.toggle();
    });

    this.root.querySelector('#btn-future-close')?.addEventListener('click', () => {
      this.voice.stop();
      this.root.querySelector('#future-panel')?.classList.add('hidden');
    });

    this.root.querySelector('#btn-open-comms')?.addEventListener('click', () => {
      this.audio.playCue('comms_ping');
      this.codexView.close();
      this.openSiblingComms();
    });
    this.root.querySelector('#btn-comms-close')?.addEventListener('click', () => {
      this.audio.playCue('tick');
      this.closeSiblingComms();
    });
    this.root.querySelector('#btn-toast-open')?.addEventListener('click', () => {
      this.audio.playCue('comms_ping');
      this.codexView.close();
      this.settingsView.close();
      if (this.store.getState().mode !== 'waking_3d') {
        this.optics.setAmbientDrift(false);
        this.store.patch({ mode: 'waking_3d' });
      }
      this.openSiblingComms();
    });
    this.root.querySelector('#btn-toast-dismiss')?.addEventListener('click', () => {
      this.audio.playCue('tick');
      this.hideCommsToast();
    });
    this.root.querySelector('#btn-enter-dream')?.addEventListener('click', () => {
      this.audio.playCue('dream_enter');
      this.codexView.close();
      this.enterDreamVariant('current');
    });
    this.root.querySelector('#mg-btn-guide')?.addEventListener('click', () => {
      if (this.briefPhase === 'handover' || this.briefPhase === 'fading') {
        this.hideInstrumentBrief();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (this.hibernationInterlude.handleKeyDown(e)) return;
      if (e.key === 'Escape') {
        if (this.settingsView.isOpen()) {
          this.audio.playCue('tick');
          this.settingsView.close();
          return;
        }
        if (this.codexView.isOpen()) {
          this.audio.playCue('tick');
          this.codexView.close();
          return;
        }
        this.statusShift.dismiss();
        this.root.querySelector('#future-panel')?.classList.add('hidden');
        const commsPanel = this.root.querySelector('#comms-panel');
        if (commsPanel && !commsPanel.classList.contains('hidden')) {
          this.closeSiblingComms();
          return;
        }
        // Quiet Esc shortcut for Settings on Title screen
        const st = this.store.getState();
        if (st.mode === 'boot' && st.introStage === 'title') {
          this.audio.playCue('choice');
          this.settingsView.open();
        }
        return;
      }
      if (this.settingsView.isOpen() || this.codexView.isOpen()) return;
      const overseerOpen = !this.root.querySelector('#overseer-panel')?.classList.contains('hidden');
      const commsOpen = !this.root.querySelector('#comms-panel')?.classList.contains('hidden');
      const stateNow = this.store.getState();
      if (
        (e.key === ' ' || e.key === 'Enter') &&
        (overseerOpen || commsOpen || stateNow.mode === 'dream_2d') &&
        this.dialogueFeed.isRevealing()
      ) {
        e.preventDefault();
        this.dialogueFeed.advanceReveal();
        return;
      }
      if (
        (e.key === ' ' || e.key === 'Enter') &&
        stateNow.mode === 'waking_3d' &&
        this.activeMinigameTargetId === null &&
        !overseerOpen &&
        !commsOpen &&
        this.focusedSpec &&
        stateNow.scannedAnomalyIds.includes(this.focusedSpec.id)
      ) {
        e.preventDefault();
        this.enterTargetMinigame(this.focusedSpec.id);
        return;
      }
      const dreamOpen = stateNow.mode === 'dream_2d' && !overseerOpen;
      const selector = overseerOpen
        ? '#overseer-choices'
        : commsOpen
          ? '#comms-choices'
          : dreamOpen
            ? '#dream-choices'
            : null;
      if (selector) {
        handleChoiceKeyboardNav(e, this.root.querySelector<HTMLElement>(selector));
      }
    });
  }

  onOpticsTelemetry(t: OpticsTelemetry): void {
    const state = this.store.getState();
    if (state.mode !== 'waking_3d' || this.activeMinigameTargetId !== null) return;

    const refs = this.opticsRefs;
    this.audio.updateProbeSignal(t.alignmentScore, t.wavelengthMatch, t.lockProgress);
    this.focusedSpec = t.focusedAnomaly;

    if (refs.raTicks) {
      let raOff = (-t.raDeg * 6) % 140;
      if (raOff > 0) raOff -= 140;
      const raTr = `translate3d(${raOff.toFixed(1)}px,0,0)`;
      if (raTr !== this.lastRaTransform) {
        this.lastRaTransform = raTr;
        refs.raTicks.style.transform = raTr;
      }
    }
    if (refs.decTicks) {
      let decOff = (t.decDeg * 6) % 140;
      if (decOff > 0) decOff -= 140;
      const decTr = `translate3d(0,${decOff.toFixed(1)}px,0)`;
      if (decTr !== this.lastDecTransform) {
        this.lastDecTransform = decTr;
        refs.decTicks.style.transform = decTr;
      }
    }
    if (refs.reticleEl) {
      const sc = (1.08 - 0.22 * t.zoomNorm).toFixed(3);
      if (sc !== this.lastReticleScale) {
        this.lastReticleScale = sc;
        refs.reticleEl.style.transform = `translate(-50%, -50%) scale(${sc})`;
      }
    }

    // Progressive zoom ladder fade-in once Target #1 is centered during first scan
    if (
      state.introStage === 'scan_target_1' &&
      !this.zoomHintUnlocked &&
      t.focusedAnomaly?.id === INTRO_TARGET_1_ID &&
      t.alignmentScore > 0.65
    ) {
      this.zoomHintUnlocked = true;
      this.shellRefs.stage?.classList.add('is-zoom-hint-ready');
    }

    // Only display markers projected by OpticsScene (filtered by setVisibleTargetIds)
    const visibleIds = new Set(t.markers.map((m) => m.id));
    for (const [id, el] of this.markerEls.entries()) {
      if (!visibleIds.has(id)) {
        if (el.style.display !== 'none') el.style.display = 'none';
      } else if (el.style.display !== 'flex') {
        el.style.display = 'flex';
      }
    }

    const decodedSet = new Set(state.decodedMinigameTargets);
    const scannedSet = new Set(state.scannedAnomalyIds);
    const vp = this.optics.getViewportSize?.() ?? {
      width: window.innerWidth || 1280,
      height: window.innerHeight || 720,
    };
    for (let i = 0; i < t.markers.length; i++) {
      const m = t.markers[i];
      const el = this.markerEls.get(m.id);
      const cache = this.markerCache.get(m.id);
      if (!el || !cache) continue;

      const isDecoded = m.isDecoded || decodedSet.has(m.id);
      const isScanned = scannedSet.has(m.id);
      el.classList.toggle('scanned', isScanned);
      el.classList.toggle('decoded', isDecoded);
      el.classList.toggle('is-required', m.isRequired);
      el.classList.toggle('is-optional', !m.isRequired);
      el.classList.toggle('is-anomaly-bleed', m.anomalyBleed >= 0.3);

      const inSafeLens = m.inView && m.x > 0.14 && m.x < 0.86 && m.y > 0.14 && m.y < 0.76;
      let nx = m.x;
      let ny = m.y;
      let op = isDecoded ? '0.45' : '0.88';
      const isOffscreen = !inSafeLens;
      if (isOffscreen) {
        nx = Math.max(0.08, Math.min(0.92, 0.5 + Math.cos(m.edgeAngleRad) * 0.42));
        ny = Math.max(0.14, Math.min(0.8, 0.5 + Math.sin(m.edgeAngleRad) * 0.34));
        op = isDecoded ? '0.32' : '0.45';
      } else {
        const distCenter = Math.hypot(m.x - 0.5, m.y - 0.5);
        if (distCenter < 0.09) op = '0';
      }
      if (isOffscreen !== cache.lastOffscreen) {
        cache.lastOffscreen = isOffscreen;
        el.classList.toggle('offscreen', isOffscreen);
      }
      const tr = `translate3d(${(nx * vp.width).toFixed(1)}px,${(ny * vp.height).toFixed(1)}px,0) translate(-50%,-50%)`;
      if (tr !== cache.lastTransform) {
        cache.lastTransform = tr;
        el.style.transform = tr;
      }
      if (op !== cache.lastOpacity) {
        cache.lastOpacity = op;
        el.style.opacity = op;
      }
    }

    const zoomText = `${t.zoomX.toFixed(1)}×`;
    if (refs.zoomLabel && zoomText !== this.lastOpticsZoomText) {
      this.lastOpticsZoomText = zoomText;
      refs.zoomLabel.textContent = zoomText;
    }
    if (refs.stageLabel && t.zoomStage !== this.lastOpticsStageText) {
      this.lastOpticsStageText = t.zoomStage;
      refs.stageLabel.textContent = t.zoomStage;
    }
    const fillTr = `scaleY(${t.zoomNorm.toFixed(4)})`;
    if (refs.zoomFill && fillTr !== this.lastOpticsFillTransform) {
      this.lastOpticsFillTransform = fillTr;
      refs.zoomFill.style.transform = fillTr;
    }
    const needleTr = `translate3d(0,${(-t.zoomNorm * this.skyZoomTrackH).toFixed(1)}px,0)`;
    if (refs.zoomNeedle && needleTr !== this.lastOpticsNeedleTransform) {
      this.lastOpticsNeedleTransform = needleTr;
      refs.zoomNeedle.style.transform = needleTr;
    }

    if (refs.lockRing) {
      const circ = 477.52;
      const nextOffset = Math.round(circ * (1 - t.lockProgress) * 10) / 10;
      if (nextOffset !== this.lastLockOffset) {
        this.lastLockOffset = nextOffset;
        refs.lockRing.setAttribute('stroke-dashoffset', String(nextOffset));
      }
    }

    const focusedScale: ScaleClass | '' = t.focusedAnomaly
      ? (t.focusedAnomaly.scaleClass ?? 'star_system')
      : '';
    if (focusedScale !== this.lastReticleScaleClass) {
      this.lastReticleScaleClass = focusedScale;
      if (refs.reticleEl) {
        if (focusedScale) refs.reticleEl.dataset.scaleClass = focusedScale;
        else delete refs.reticleEl.dataset.scaleClass;
      }
      if (refs.reticleScaleEtch) {
        refs.reticleScaleEtch.textContent = focusedScale ? getScaleMicroEtch(focusedScale) : '';
      }
    }

    if (refs.target) {
      let nextPrompt = '';
      let stateKey = 'idle';
      let hideInspect = true;
      let briefMeta = '';
      let briefMgId = '';
      const decodedSet = new Set(state.decodedMinigameTargets);

      if (this.autoDiveTargetId && (!t.focusedAnomaly || t.focusedAnomaly.id !== this.autoDiveTargetId || this.isSkyOverlayOpen())) {
        this.cancelAutoDive(false);
      }

      if (t.focusedAnomaly) {
        const spec = t.focusedAnomaly;
        const scanned = scannedSet.has(spec.id);
        const decoded = decodedSet.has(spec.id);
        hideInspect = !scanned;
        const chosenMgId = this.store.getMinigameIdForTarget(spec.id, spec.minigameId);
        const entry = this.minigames.getEntry(chosenMgId);
        const verb = spec.actionVerb ?? 'CALIBRATE';
        const code = entry?.instrumentCode ?? 'OPT';

        if (refs.inspectBtn && scanned) {
          const ctaText = decoded ? `RE-CALIBRATE · ${code} [SPACE] ▸` : `${verb} · ${code} [SPACE] ▸`;
          if (ctaText !== this.lastInspectLabel) {
            this.lastInspectLabel = ctaText;
            refs.inspectBtn.textContent = ctaText;
          }
        }
        if (scanned) {
          const scaleLabel = getScaleLabel(spec.scaleClass);
          const distLabel = spec.distanceLabel ?? spec.bandName;
          briefMeta = `${scaleLabel} · ${distLabel} — ${spec.label}`;
          briefMgId = chosenMgId;
          nextPrompt = `${spec.label} · LOCKED`;
          stateKey = `ready:${spec.id}`;
          if (
            this.settingsStore.getSettings().autoEngageInstrument &&
            !decoded &&
            this.autoDiveTargetId !== spec.id &&
            this.autoDiveHeldTargetId !== spec.id &&
            !this.isSkyOverlayOpen()
          ) {
            this.startAutoDive(spec.id);
          }
        } else if (t.fovDeg > spec.recommendedFovMax + 10) {
          nextPrompt =
            state.introStage === 'scan_target_1'
              ? `${spec.label} · ${uiCopy.sky.zoomCue.toUpperCase()}`
              : `${spec.label} · ZOOM CLOSER`;
          stateKey = `zoom:${spec.id}`;
        } else if (t.wavelengthMatch < 0.48) {
          nextPrompt = `${spec.label} · TUNE SPECTRUM TO ${spec.bandName}`;
          stateKey = `tune:${spec.id}`;
        } else {
          nextPrompt = `${spec.label} · LOCKING ${Math.round(t.lockProgress * 100)}%`;
          // Constant semantic key while locking -> fixes 1% tick CSS fade flicker!
          stateKey = `locking:${spec.id}`;
        }
      } else {
        this.autoDiveHeldTargetId = null;
        if (state.introStage === 'scan_target_1') {
          nextPrompt = this.idleDragHintShown ? uiCopy.sky.idleDragCue.toUpperCase() : '';
          stateKey = this.idleDragHintShown ? 'idle_drag_cue' : 'idle_quiet';
        } else if (state.introStage === 'scan_target_2') {
          nextPrompt = `${uiCopy.sky.irCue.toUpperCase()} · CLUSTER J1419-A`;
          stateKey = 'idle_t2';
        } else if (state.introStage === 'mg_2_done') {
          nextPrompt = 'SLEEP WHEN READY · OR SWEEP OPTIONAL TARGETS';
          stateKey = 'idle_m2_done';
        } else if (state.introStage === 'complete') {
          nextPrompt = 'DRAG TO LOOK AROUND · SWEEP LIGHT SPECTRUM BELOW';
          stateKey = 'idle_open';
        } else {
          nextPrompt = '';
          stateKey = 'idle_quiet';
        }
      }

      if (this.briefPhase === 'idle' || this.briefPhase === 'locked') {
        const overlayOpen = this.isSkyOverlayOpen();
        const showLockedBrief = !hideInspect && Boolean(briefMeta) && !overlayOpen;
        const briefSig = `${showLockedBrief ? '1' : '0'}|${briefMeta}|${briefMgId}`;
        if (refs.reticleBrief && briefSig !== this.lastReticleBriefSig) {
          this.lastReticleBriefSig = briefSig;
          if (showLockedBrief && t.focusedAnomaly) {
            this.briefPhase = 'locked';
            this.populateInstrumentBrief(t.focusedAnomaly, briefMgId);
            refs.reticleBrief.dataset.briefPhase = 'locked';
            refs.reticleBrief.classList.remove('hidden');
            this.updateAutoDiveUi();
          } else {
            this.briefPhase = 'idle';
            refs.reticleBrief.classList.add('hidden');
            delete refs.reticleBrief.dataset.briefPhase;
          }
        }
      }

      if (refs.inspectBtn && hideInspect !== this.lastInspectHidden) {
        this.lastInspectHidden = hideInspect;
        refs.inspectBtn.classList.toggle('hidden', hideInspect);
      }
      this.morphPromptText(refs.target, nextPrompt, stateKey);
    }
  }

  onScanComplete(spec: AnomalySpec): void {
    const newlyRecorded = this.store.recordAnomalyScan(spec.id, spec.anomalyGain, spec.label);
    if (!newlyRecorded) return;

    this.telemetry.record('anomaly_scan', this.store.getState(), { targetId: spec.id, gain: spec.anomalyGain });
    this.audio.playCue('scan_lock');
    this.renderBearingIndex();

    const stage = this.store.getState().introStage;
    if (stage === 'complete' || stage === 'mg_2_done') {
      this.maybeTriggerProactiveComms(spec);
    }
  }

  // Kept for compatibility with src/main.ts callback signature
  onShowcaseTelemetry(_t: unknown): void {
    // Target inspect HUD removed; TargetShowcaseScene runs purely as selective minigame 3D backdrop.
  }

  // ==================== DIRECT SKY -> MINIGAME -> SKY LOOP ====================

  private enterTargetMinigame(targetId: string, overrideMinigameId?: string, iterationIndex?: number): void {
    const spec = this.optics.getAnomalySpecs().find((a) => a.id === targetId);
    if (!spec) return;

    this.closeSiblingComms();
    this.hideCommsToast();
    this.hideSkyPsycheWhisper();
    this.cancelAutoDive(false);
    this.autoDiveHeldTargetId = null;
    this.clearBriefTransitionTimers();
    if (this.proactiveCommsTimer !== null) {
      window.clearTimeout(this.proactiveCommsTimer);
      this.proactiveCommsTimer = null;
    }
    this.voice.stop();

    this.suppressMinigamePullback = true;
    this.minigameHost.destroy();
    this.suppressMinigamePullback = false;

    const state = this.store.getState();
    const chosenId = overrideMinigameId ?? this.store.getMinigameIdForTarget(spec.id, spec.minigameId);
    const entry = this.minigames.getEntry(chosenId);
    const resolvedIter = iterationIndex ?? spec.preferredVariantIndex;
    const refs = this.opticsRefs;

    this.populateInstrumentBrief(spec, chosenId);
    if (refs?.reticleBrief) {
      this.briefPhase = 'diving';
      this.lastReticleBriefSig = '';
      refs.reticleBrief.classList.remove('hidden');
      delete refs.reticleBrief.dataset.briefPhase;
      void refs.reticleBrief.offsetWidth;
      refs.reticleBrief.dataset.briefPhase = 'diving';
    }
    if (refs?.reticleBriefCountdown) {
      refs.reticleBriefCountdown.classList.remove('hidden');
    }
    if (refs?.holdAutoDiveBtn) {
      refs.holdAutoDiveBtn.classList.add('hidden');
    }
    if (refs?.reticleAutoFill) {
      refs.reticleAutoFill.style.transform = '';
    }
    if (refs?.reticleAutoLabel) {
      refs.reticleAutoLabel.textContent = `ENGAGING INSTRUMENT · ${entry?.instrumentCode ?? chosenId.toUpperCase()}…`;
    }

    // Preload dynamic JS chunk + plate image during optical_dive so frame 1 is live
    void this.minigameHost.preload(
      chosenId,
      resolvedIter,
      spec.plateId as CosmicPlateId | undefined
    );

    this.audio.playCue('iris_dive');
    this.optics.triggerTransitionDive?.(spec.id);

    this.transitions.play({
      kind: 'optical_dive',
      label: `${entry?.instrumentCode ?? chosenId.toUpperCase()} · ${entry?.title ?? spec.label}`,
      skippable: false,
      tone: state.humanity >= 45 ? 'warm' : 'cold',
      fromSelector: '#optics-layer',
      toSelector: '#minigame-layer',
      onMidpoint: () => {
        this.activeMinigameTargetId = spec.id;
        this.lastMinigameDecodedSpec = null;
        this.store.patch({ mode: 'waking_3d', activeTargetId: spec.id });

        this.showcase.enterTarget(spec, this.store.getState().opticalFidelity);
        this.suppressMinigamePullback = true;
        try {
          void this.minigameHost.launch(
            spec,
            chosenId,
            (decodedSpec) => {
              this.lastMinigameDecodedSpec = decodedSpec;
            },
            {
              iterationIndex: resolvedIter,
              briefingHoldMs: 2600,
            }
          );
        } finally {
          this.suppressMinigamePullback = false;
        }
      },
      onComplete: () => {
        if (this.activeMinigameTargetId !== null) {
          this.optics.setActive(false);
        }
        this.minigameHost.setBriefingHold(false);
        if (this.activeMinigameTargetId === spec.id && this.briefPhase === 'diving') {
          this.briefPhase = 'handover';
          if (refs?.reticleBrief) {
            delete refs.reticleBrief.dataset.briefPhase;
            void refs.reticleBrief.offsetWidth;
            refs.reticleBrief.dataset.briefPhase = 'handover';
          }
          if (refs?.reticleAutoFill) {
            refs.reticleAutoFill.style.transform = '';
          }
          if (refs?.reticleAutoLabel) {
            refs.reticleAutoLabel.textContent =
              chosenId === 'constellation_recall'
                ? 'OBSERVE SEQUENCE · CONTROL READY'
                : 'INSTRUMENT LIVE · CONTROL READY';
          }
          this.clearBriefTransitionTimers();
          this.briefHandoverTimer = window.setTimeout(() => {
            this.briefHandoverTimer = null;
            if (this.briefPhase !== 'handover') return;
            this.briefPhase = 'fading';
            if (refs?.reticleBrief) {
              refs.reticleBrief.dataset.briefPhase = 'fading';
            }
            this.briefFadeTimer = window.setTimeout(() => {
              this.briefFadeTimer = null;
              if (this.briefPhase === 'fading') {
                this.hideInstrumentBrief();
              }
            }, 1600);
          }, 2600);
        }
      },
    });
  }

  private exitTargetMinigame(decodedSpec: AnomalySpec | null, preserveDecoded = true): void {
    const resolvedDecoded = decodedSpec ?? this.lastMinigameDecodedSpec;
    this.activeMinigameTargetId = null;
    this.lastMinigameDecodedSpec = null;
    this.hideInstrumentBrief();

    const currState = this.store.getState();
    this.audio.playCue('iris_pullback');
    this.transitions.play({
      kind: 'optical_pullback',
      label: 'RETURNING TO SKY APERTURE…',
      tone: currState.humanity >= 45 ? 'warm' : 'cold',
      fromSelector: '#minigame-layer',
      toSelector: '#optics-layer',
      onMidpoint: () => {
        this.optics.setAmbientDrift(false);
        this.optics.triggerPullbackArrival?.();
        this.store.patch({ mode: 'waking_3d', activeTargetId: null });
        this.renderBearingIndex();

        const updatedState = this.store.getState();
        this.lastOpticsDecodedSig = updatedState.decodedMinigameTargets.join('|');
        this.optics.setDecodedTargetIds?.(
          new Set(updatedState.decodedMinigameTargets),
          resolvedDecoded?.id
        );
      },
      onComplete: () => {
        this.minigameHost.destroy(preserveDecoded);
        this.showcase.setMinigameBackdropMode(null);
        this.showcase.setActive(false);

        const updatedState = this.store.getState();
        const stage = updatedState.introStage;
        const decodedTargets = updatedState.decodedMinigameTargets;
        const completedTarget1 =
          resolvedDecoded?.id === INTRO_TARGET_1_ID || decodedTargets.includes(INTRO_TARGET_1_ID);
        const completedTarget2 =
          resolvedDecoded?.id === INTRO_TARGET_2_ID || decodedTargets.includes(INTRO_TARGET_2_ID);

        if (completedTarget1 && stage === 'scan_target_1') {
          this.store.setIntroStage('mg_1_done');
          if (this.proactiveCommsTimer !== null) window.clearTimeout(this.proactiveCommsTimer);
          this.proactiveCommsTimer = window.setTimeout(() => {
            this.proactiveCommsTimer = null;
            if (
              this.store.getState().mode === 'waking_3d' &&
              this.store.getState().introStage === 'mg_1_done' &&
              !this.minigameHost.isActive()
            ) {
              this.showProactiveCommsToast(uiCopy.commsToast.introTeaser);
            }
          }, pacing.postScan.siblingToastDelayAfterPullbackMs);
        } else if (completedTarget2 && stage === 'scan_target_2') {
          this.store.setIntroStage('mg_2_done');
          if (this.postTarget2Timer !== null) window.clearTimeout(this.postTarget2Timer);
          this.postTarget2Timer = window.setTimeout(() => {
            this.postTarget2Timer = null;
            if (
              this.store.getState().mode === 'waking_3d' &&
              this.store.getState().introStage === 'mg_2_done' &&
              !this.minigameHost.isActive()
            ) {
              this.pendingPostTarget2 = true;
              const label =
                (uiCopy.commsToast as { postTarget2?: string }).postTarget2 ??
                'ARCHIVE BLEED · INCOMING OVERSEER CHECK — OPEN RELAY';
              this.showProactiveCommsToast(label);
            }
          }, pacing.postScan.postRequiredToastDelayAfterPullbackMs);
        } else if (resolvedDecoded && (stage === 'complete' || stage === 'mg_2_done')) {
          if (this.skyPsycheTimer !== null) window.clearTimeout(this.skyPsycheTimer);
          this.skyPsycheTimer = window.setTimeout(() => {
            this.skyPsycheTimer = null;
            if (this.store.getState().mode === 'waking_3d' && !this.minigameHost.isActive()) {
              this.showSkyPsycheWhisper(resolvedDecoded);
            }
          }, pacing.postScan.psycheWhisperDelayAfterPullbackMs);

          if (this.proactiveCommsTimer !== null) window.clearTimeout(this.proactiveCommsTimer);
          this.proactiveCommsTimer = window.setTimeout(() => {
            this.proactiveCommsTimer = null;
            if (this.store.getState().mode === 'waking_3d' && !this.minigameHost.isActive()) {
              this.maybeTriggerProactiveComms(resolvedDecoded);
            }
          }, pacing.postScan.siblingToastDelayAfterPullbackMs);
        }
      },
    });
  }

  private showSkyPsycheWhisper(spec: AnomalySpec): void {
    const echo = spec.postScanEcho;
    if (!echo?.psycheLine) return;
    const box = this.shellRefs?.skyPsycheWhisper;
    const voiceEl = this.shellRefs?.skyPsycheVoice;
    const lineEl = this.shellRefs?.skyPsycheLine;
    if (!box || !voiceEl || !lineEl) return;

    if (this.skyPsycheTimer !== null) {
      window.clearTimeout(this.skyPsycheTimer);
      this.skyPsycheTimer = null;
    }

    const charMeta = CHAR_MAP[echo.psycheVoice];
    voiceEl.textContent =
      charMeta?.displayName ?? echo.psycheVoice.replace(/^psyche_/, '').toUpperCase();
    box.dataset.psycheVoice = echo.psycheVoice;
    lineEl.textContent = echo.psycheLine;
    box.classList.remove('hidden');

    this.skyPsycheTimer = window.setTimeout(() => {
      this.skyPsycheTimer = null;
      this.hideSkyPsycheWhisper();
    }, pacing.postScan.psycheWhisperDurationMs);
  }

  private hideSkyPsycheWhisper(): void {
    if (this.skyPsycheTimer !== null) {
      window.clearTimeout(this.skyPsycheTimer);
      this.skyPsycheTimer = null;
    }
    this.shellRefs?.skyPsycheWhisper?.classList.add('hidden');
  }

  private openFutureHumanityEcho(): void {
    const panel = this.root.querySelector<HTMLElement>('#future-panel')!;
    const avatarBay = this.root.querySelector<HTMLElement>('#future-avatar-bay')!;
    const scroll = this.root.querySelector<HTMLElement>('#future-scroll')!;
    const s = this.store.getState();

    avatarBay.innerHTML = `
      <div class="avatar-card">
        ${renderSpeakerAvatar('future_humanity', s.humanity, 58)}
        <div class="avatar-meta">
          <strong>SOL–CENTAURI · FUTURE HUMANITY</strong>
          <span>LATE-GAME DEMO PREVIEW · 10 LY ECHO</span>
        </div>
      </div>
    `;

    const snap = this.futureDialogue.startKnot('future_humanity_echo');
    this.dialogueFeed.renderEntriesOnly(scroll, snap.entries, { animateFromIndex: 0, deferScroll: true });
    panel.classList.remove('hidden');
    this.dialogueFeed.scrollToLatest(scroll, { instant: true });
    this.dialogueFeed.speakEntries(snap.lastAddedEntries);
  }

  private scheduleProactiveComms(): void {
    // Suppress blind 6.2s comms timer during the scripted intro
    if (this.store.getState().introStage !== 'complete') return;
    if (this.proactiveCommsSent || this.proactiveCommsTimer !== null) return;
    this.proactiveCommsTimer = window.setTimeout(() => {
      this.proactiveCommsTimer = null;
      const st = this.store.getState();
      if (st.mode !== 'waking_3d' || st.introStage !== 'complete') return;
      if (this.activeMinigameTargetId !== null || this.minigameHost.isActive()) return;
      const panelOpen = !this.root.querySelector('#comms-panel')?.classList.contains('hidden');
      const overseerOpen = !this.root.querySelector('#overseer-panel')?.classList.contains('hidden');
      if (!panelOpen && !overseerOpen && !this.proactiveCommsSent) {
        this.proactiveCommsSent = true;
        this.showProactiveCommsToast();
      }
    }, pacing.postScan.shiftWakeCommsDelayMs);
  }

  private maybeTriggerProactiveComms(spec?: AnomalySpec): boolean {
    const state = this.store.getState();
    if (state.introStage !== 'complete' && state.introStage !== 'mg_2_done') return false;
    const storylet = this.scheduler.pickAvailable(state, 'waking_3d');
    if (!storylet) return false;
    this.pendingCommsStorylet = storylet;
    this.proactiveCommsSent = true;
    const optTemplate =
      (uiCopy.commsToast as { optionalScanTemplate?: string }).optionalScanTemplate ??
      uiCopy.commsToast.targetLockedTemplate;
    const msg =
      storylet.id === 'shift1_optional_scan_echo'
        ? optTemplate.replace('{label}', spec?.label ?? '')
        : spec
          ? uiCopy.commsToast.targetLockedTemplate.replace('{label}', spec.label)
          : undefined;
    this.showProactiveCommsToast(msg);
    return true;
  }

  private showProactiveCommsToast(customText?: string): void {
    const panelOpen = !this.root.querySelector('#comms-panel')?.classList.contains('hidden');
    if (panelOpen || this.minigameHost.isActive() || this.activeMinigameTargetId !== null) return;

    const s = this.store.getState();
    const preview =
      customText ??
      (s.humanity >= 65 && s.primarySiblingH >= 65
        ? uiCopy.commsToast.warm
        : s.humanity < 45 && s.primarySiblingH < 45
          ? uiCopy.commsToast.cold
          : uiCopy.commsToast.mid);

    const toast = this.root.querySelector<HTMLElement>('#comms-toast');
    const avEl = this.root.querySelector<HTMLElement>('#comms-toast-avatar');
    const previewEl = this.root.querySelector<HTMLElement>('#comms-toast-preview');
    if (avEl) avEl.innerHTML = renderSpeakerAvatar('sibling_primary', s.primarySiblingH, 34, true);
    if (previewEl) previewEl.textContent = preview;
    if (toast) {
      toast.classList.remove('hidden');
      this.audio.playCue('comms_ping');
    }
  }

  private hideCommsToast(): void {
    this.root.querySelector('#comms-toast')?.classList.add('hidden');
  }

  private openSiblingComms(): void {
    if (this.pendingPostTarget2) {
      this.pendingPostTarget2 = false;
      this.openPostTarget2Transmission();
      return;
    }
    this.hideCommsToast();
    this.hideSkyPsycheWhisper();
    this.hideInstrumentBrief();
    this.proactiveCommsSent = true;
    this.activeCommsMode = 'sibling';

    const panel = this.root.querySelector<HTMLElement>('#comms-panel')!;
    const headerTitle = this.root.querySelector<HTMLElement>('#comms-header-title');
    if (headerTitle) headerTitle.textContent = 'CLUSTER RELAY · 14m LAG';
    panel.classList.remove('hidden');
    this.root.querySelector('.stage')?.classList.add('is-comms-open');

    const state = this.store.getState();
    const pending =
      this.pendingCommsStorylet &&
      !state.completedStorylets.includes(this.pendingCommsStorylet.id)
        ? this.pendingCommsStorylet
        : null;
    const desiredKnot =
      state.introStage === 'mg_1_done'
        ? 'intro_sibling_first_call'
        : pending?.knot ?? 'sibling_comms_hub';

    if (
      !this.activeCommsSnapshot ||
      this.activeCommsSnapshot.ended ||
      this.activeCommsSnapshot.knot === 'intro_post_target2_overseer' ||
      (pending && this.activeCommsSnapshot.knot !== pending.knot) ||
      (desiredKnot === 'intro_sibling_first_call' && this.activeCommsSnapshot.knot !== 'intro_sibling_first_call')
    ) {
      this.activeCommsSnapshot = this.commsDialogue.startKnot(desiredKnot);
      this.dialogueFeed.speakEntriesIfImmediate(this.activeCommsSnapshot.lastAddedEntries);
    }
    this.updateCommsAvatarBay(state);
    this.renderCommsDialogue();
  }

  private openPostTarget2Transmission(): void {
    this.pendingPostTarget2 = false;
    this.hideCommsToast();
    this.hideSkyPsycheWhisper();
    this.hideInstrumentBrief();
    this.activeCommsMode = 'post_target2';

    const panel = this.root.querySelector<HTMLElement>('#comms-panel')!;
    const headerTitle = this.root.querySelector<HTMLElement>('#comms-header-title');
    if (headerTitle) headerTitle.textContent = 'INCOMING TRANSMISSION // ARCHIVE & OVERSEER';
    panel.classList.remove('hidden');
    this.root.querySelector('.stage')?.classList.add('is-comms-open');

    const state = this.store.getState();
    this.activeCommsSnapshot = this.commsDialogue.startKnot('intro_post_target2_overseer');
    this.updateCommsAvatarBay(state);
    this.dialogueFeed.speakEntriesIfImmediate(this.activeCommsSnapshot.lastAddedEntries);
    this.renderCommsDialogue();
  }

  private closeSiblingComms(): void {
    this.dialogueFeed.clearReplyBeatTimer();
    this.voice.stop();
    const panel = this.root.querySelector('#comms-panel');
    const wasOpen = Boolean(panel && !panel.classList.contains('hidden'));
    panel?.classList.add('hidden');
    this.root.querySelector('.stage')?.classList.remove('is-comms-open');

    if (wasOpen && this.activeCommsMode === 'post_target2') {
      this.activeCommsMode = 'sibling';
      this.activeCommsSnapshot = null;
      return;
    }

    if (wasOpen && this.pendingCommsStorylet) {
      this.store.markStoryletDone(this.pendingCommsStorylet.id);
      this.pendingCommsStorylet = null;
      this.activeCommsSnapshot = null;
    }

    if (wasOpen && this.store.getState().introStage === 'mg_1_done') {
      this.activeCommsSnapshot = null;
      this.store.markStoryletDone('sibling_first_contact');
      this.store.setIntroStage('scan_target_2');
      this.vernierNudgeActive = true;
      this.root.querySelector('#vernier-dock')?.classList.add('is-ir-nudge');
    }
  }

  private renderCommsDialogue(): void {
    if (!this.activeCommsSnapshot) return;
    this.dialogueFeed.renderInto('#comms-scroll', '#comms-choices', this.activeCommsSnapshot, {
      onChoose: (idx) => {
        this.dialogueFeed.handleChoice('#comms-scroll', '#comms-choices', this.commsDialogue, idx, (snap) => {
          this.activeCommsSnapshot = snap;
          if (snap.ended) {
            if (this.pendingCommsStorylet) {
              this.store.markStoryletDone(this.pendingCommsStorylet.id);
              this.pendingCommsStorylet = null;
            } else {
              this.store.markStoryletDone('sibling_first_contact');
            }
          }
          this.renderCommsDialogue();
        });
      },
      onCloseComms: () => this.closeSiblingComms(),
      closeCommsLabel:
        this.activeCommsMode === 'post_target2' ? 'Acknowledge · Prepare for Sleep' : 'Close relay',
    });
  }

  private warmthDescriptor(h: number): string {
    if (h >= 65) return 'WARM';
    if (h >= 45) return 'STEADY';
    return 'COOL';
  }

  private updateCommsAvatarBay(s: GameState): void {
    const bay = this.root.querySelector<HTMLElement>('#comms-avatar-bay');
    if (!bay) return;

    if (
      this.activeCommsMode === 'post_target2' ||
      this.activeCommsSnapshot?.knot === 'intro_post_target2_overseer'
    ) {
      bay.innerHTML = `
        <div class="dual-avatar-pair">
          <div class="avatar-chip">
            ${renderSpeakerAvatar('overseer', s.humanity, 44)}
            <div class="avatar-meta"><strong>OVERSEER</strong><span>CARETAKER</span></div>
          </div>
          <span class="pair-link">ARCHIVE BLEED</span>
          <div class="avatar-chip right">
            <div class="avatar-meta"><strong>PRIOR WATCH · LOG 1406</strong><span>ARCHIVED</span></div>
            ${renderSpeakerAvatar('archive_echo', s.humanity, 44)}
          </div>
        </div>
      `;
      return;
    }

    const delta = Math.abs(s.humanity - s.primarySiblingH);
    let toneTag = 'IN STEP';
    if (s.humanity >= 65 && s.primarySiblingH >= 65) toneTag = 'WARM & EASY';
    else if (delta >= 15) toneTag = 'GROWING APART';
    else if (s.humanity < 45 && s.primarySiblingH < 45) toneTag = 'CLIPPED & COLD';

    bay.innerHTML = `
      <div class="dual-avatar-pair">
        <div class="avatar-chip">
          <span class="voice-live-dot" data-voice-dot-speaker="player" style="background:#eef0ec;"></span>
          <div class="avatar-meta"><strong>YOU</strong><span>${this.warmthDescriptor(s.humanity)}</span></div>
        </div>
        <span class="pair-link">${toneTag}</span>
        <div class="avatar-chip right">
          <div class="avatar-meta"><strong>OTHER ME</strong><span>${this.warmthDescriptor(s.primarySiblingH)}</span></div>
          ${renderSpeakerAvatar('sibling_primary', s.primarySiblingH, 40)}
        </div>
      </div>
    `;
  }

  private enterDreamVariant(variant: 'current' | 'high' | 'low', afterStart?: () => void): void {
    this.clearTimers();
    this.isWakingFromDream = false;
    this.voice.stop();
    this.closeSiblingComms();
    this.hideCommsToast();
    this.hideSkyPsycheWhisper();
    this.wakeupCanvas.setActive(false);
    this.dream.setHumanityOscillation?.(null);
    this.dream.setDrowsyPeek?.(false);
    this.dream.setWakeProgress?.(1.0);

    this.suppressMinigamePullback = true;
    this.minigameHost.destroy();
    this.suppressMinigamePullback = false;
    this.activeMinigameTargetId = null;
    this.root.querySelector('#minigame-layer')?.classList.add('hidden');
    this.showcase?.setMinigameBackdropMode(null);
    this.showcase?.setActive(false);

    const label =
      variant === 'high'
        ? 'OPENING WARM MEMORY…'
        : variant === 'low'
          ? 'OPENING FADED MEMORY…'
          : 'DRIFTING INTO SLEEP…';
    const targetH = variant === 'high' ? 84 : variant === 'low' ? 24 : this.store.getState().humanity;

    this.transitions.play({
      kind: 'dream_submerge',
      label,
      tone: targetH >= 45 ? 'warm' : 'cold',
      fromSelector: this.modeToSelector(this.store.getState().mode),
      toSelector: '#dream-layer',
      onMidpoint: () => {
        this.optics?.setAmbientDrift(false);
        if (variant === 'high') {
          this.store.patch({
            mode: 'dream_2d',
            maxHumanity: 90,
            humanity: 84,
            chaosDrift: 22,
            prunedPersonas: [],
            overseerAuditActive: false,
            lastAuditOutcome: 'none',
          });
        } else if (variant === 'low') {
          this.store.patch({
            mode: 'dream_2d',
            maxHumanity: 48,
            humanity: 24,
            chaosDrift: 12,
            opticalFidelity: 0.92,
            prunedPersonas: ['phantom_spouse'],
            overseerAuditActive: false,
            lastAuditOutcome: 'none',
          });
        } else {
          this.store.patch({
            mode: 'dream_2d',
            overseerAuditActive: false,
            lastAuditOutcome: 'none',
          });
        }

        this.dream.triggerEntranceReveal?.();
        this.hideOverseerPanel();
        if (this.dreamSettleTimer !== null) window.clearTimeout(this.dreamSettleTimer);
        this.dreamSettleTimer = window.setTimeout(() => {
          this.dreamSettleTimer = null;
          const st = this.store.getState();
          if (st.mode === 'dream_2d') {
            const dreamStorylet = this.scheduler.pickAvailable(st, 'dream_2d');
            this.startDreamDialogue(dreamStorylet?.knot ?? 'dream_shift1_audit');
            afterStart?.();
          }
        }, 2600);
      },
    });
  }

  private startDreamDialogue(knot: string): void {
    this.activeDreamSnapshot = this.dreamDialogue.startKnot(knot);
    this.dialogueFeed.speakEntriesIfImmediate(this.activeDreamSnapshot.lastAddedEntries);
    this.renderDreamDialogue();
  }

  private renderDreamDialogue(): void {
    if (!this.activeDreamSnapshot) return;
    this.dialogueFeed.renderInto('#dream-scroll', '#dream-choices', this.activeDreamSnapshot, {
      onChoose: (idx) => {
        this.dialogueFeed.handleChoice('#dream-scroll', '#dream-choices', this.dreamDialogue, idx, (snap) => {
          this.activeDreamSnapshot = snap;
          this.renderDreamDialogue();
          if (snap.autoInterruptKnot) {
            this.scheduleOverseerInterrupt(snap.autoInterruptKnot);
          }
        });
      },
      onWakeToSky: () => {
        if (this.isWakingFromDream) return;
        this.isWakingFromDream = true;
        this.audio.playCue('dream_wake');
        const prevSnapshot = this.store.getState();
        const shouldHibernate = prevSnapshot.shift < 6;
        const yearsSlept =
          shiftsData.shifts.find((sh) => sh.shift === prevSnapshot.shift)?.realHibernationYearsAfter ?? 5.0;
        this.transitions.play({
          kind: 'dream_wake',
          label: 'WAKING TO SKY APERTURE…',
          tone: 'cold',
          fromSelector: this.modeToSelector(prevSnapshot.mode),
          toSelector: '#optics-layer',
          onMidpoint: () => {
            this.hideOverseerPanel();
            const prev = this.store.getState();
            if (prev.introStage !== 'complete') {
              this.store.setIntroStage('complete');
            }
            if (prev.shift < 6) {
              this.store.advanceShift();
              this.totalRealYearsElapsed += yearsSlept;
            }
            this.optics.setAmbientDrift(false);
            this.optics.triggerPullbackArrival?.();
            this.store.patch({ mode: 'waking_3d', overseerAuditActive: false });
          },
          onComplete: () => {
            if (!shouldHibernate) {
              this.isWakingFromDream = false;
              return;
            }
            const nextState = this.store.getState();
            const nextShiftSpec = shiftsData.shifts.find((sh) => sh.shift === nextState.shift);
            void this.hibernationInterlude
              .play({
                yearsSlept,
                totalYearsElapsed: this.totalRealYearsElapsed,
                nextShift: nextState.shift,
                nextTitle: nextShiftSpec?.title ?? `Shift ${nextState.shift}`,
                monthsLeft: nextState.subjectiveMonthsLeft,
                humanity: nextState.humanity,
              })
              .then(() => {
                this.isWakingFromDream = false;
                this.proactiveCommsSent = false;
                this.scheduleProactiveComms();
              });
          },
        });
      },
    });
  }

  private scheduleOverseerInterrupt(knot: string): void {
    if (this.overseerInterruptTimer !== null) {
      window.clearTimeout(this.overseerInterruptTimer);
      this.overseerInterruptTimer = null;
    }
    const token = ++this.overseerInterruptToken;

    const choicesEl = this.root.querySelector<HTMLElement>('#dream-choices');
    if (choicesEl) {
      choicesEl.innerHTML = `
        <button class="choice-line audit-incoming-btn is-tier-action" id="btn-audit-now" type="button">
          <span class="choice-num">!</span>
          <span class="choice-body">OVERSEER AUDIT APPROACHING…</span>
        </button>
      `;
      choicesEl.querySelector('#btn-audit-now')?.addEventListener('click', () => {
        this.triggerOverseerInterrogation(knot);
      });
      this.dialogueFeed.scrollToLatest(this.root.querySelector<HTMLElement>('#dream-scroll'));
    }

    void this.voice.waitForQueueNearEnd(0, 4800).then(() => {
      if (token !== this.overseerInterruptToken) return;
      this.overseerInterruptTimer = window.setTimeout(() => {
        this.overseerInterruptTimer = null;
        if (token === this.overseerInterruptToken) {
          this.triggerOverseerInterrogation(knot);
        }
      }, 1600);
    });
  }

  private triggerOverseerInterrogation(knot = 'overseer_interrogation'): void {
    this.overseerInterruptToken++;
    if (this.overseerInterruptTimer !== null) {
      window.clearTimeout(this.overseerInterruptTimer);
      this.overseerInterruptTimer = null;
    }
    if (this.overseerRevealTimer !== null) {
      window.clearTimeout(this.overseerRevealTimer);
      this.overseerRevealTimer = null;
    }
    if (this.overseerSpeakTimer !== null) {
      window.clearTimeout(this.overseerSpeakTimer);
      this.overseerSpeakTimer = null;
    }
    const revealToken = ++this.overseerInterruptToken;

    this.audio.playCue('overseer_slice');
    this.dream.triggerSlicePulse?.();
    const visualPane = this.root.querySelector<HTMLElement>('.dream-visual-pane');
    if (visualPane) {
      visualPane.classList.remove('is-slicing');
      void visualPane.offsetWidth;
      visualPane.classList.add('is-slicing');
      if (this.overseerSliceTimer !== null) window.clearTimeout(this.overseerSliceTimer);
      this.overseerSliceTimer = window.setTimeout(() => {
        visualPane.classList.remove('is-slicing');
        this.overseerSliceTimer = null;
      }, 950);
    }

    this.transitions.playOverlayPulse('overseer_slice', 'OVERSEER // AUDIT INTERCEPT');
    this.root.querySelector('#dream-ribbon')?.classList.add('receded');

    this.overseerRevealTimer = window.setTimeout(() => {
      this.overseerRevealTimer = null;
      if (revealToken !== this.overseerInterruptToken) return;
      this.root.querySelector('#overseer-panel')?.classList.remove('hidden');
      this.activeOverseerSnapshot = this.overseerDialogue.startKnot(knot);
      this.updateOverseerAvatarBay(this.store.getState());
      this.renderOverseerDialogue();
      const entriesToSpeak = this.activeOverseerSnapshot.lastAddedEntries;
      if (!this.dialogueFeed.isContemplative()) {
        this.overseerSpeakTimer = window.setTimeout(() => {
          this.overseerSpeakTimer = null;
          if (revealToken === this.overseerInterruptToken) {
            this.dialogueFeed.speakEntriesIfImmediate(entriesToSpeak);
          }
        }, 550);
      }
    }, 950);
  }

  private hideOverseerPanel(): void {
    this.overseerInterruptToken++;
    if (this.overseerRevealTimer !== null) {
      window.clearTimeout(this.overseerRevealTimer);
      this.overseerRevealTimer = null;
    }
    if (this.overseerSpeakTimer !== null) {
      window.clearTimeout(this.overseerSpeakTimer);
      this.overseerSpeakTimer = null;
    }
    this.dialogueFeed.clearReplyBeatTimer();
    this.root.querySelector('#dream-ribbon')?.classList.remove('receded');
    this.root.querySelector('#overseer-panel')?.classList.add('hidden');
  }

  private renderOverseerDialogue(): void {
    if (!this.activeOverseerSnapshot) return;
    this.updateOverseerAvatarBay(this.store.getState());

    this.dialogueFeed.renderInto('#overseer-scroll', '#overseer-choices', this.activeOverseerSnapshot, {
      onChoose: (idx) => {
        this.dialogueFeed.handleChoice('#overseer-scroll', '#overseer-choices', this.overseerDialogue, idx, (snap) => {
          this.activeOverseerSnapshot = snap;
          this.renderOverseerDialogue();
        });
      },
      onResumeDream: (nextKnot) => this.resumeDreamAfterOverseer(nextKnot),
    });
  }

  private updateOverseerAvatarBay(s: GameState): void {
    const bay = this.root.querySelector<HTMLElement>('#overseer-avatar-bay');
    if (!bay) return;
    bay.innerHTML = `
      <div class="avatar-card">
        ${renderSpeakerAvatar('overseer', s.humanity, 50)}
        <div class="avatar-meta">
          <strong>OVERSEER · MIND CARETAKER</strong>
          <span>BLIND TO THE SKY · WATCHING YOUR WARMTH</span>
        </div>
      </div>
    `;
  }

  private resumeDreamAfterOverseer(knot: string): void {
    this.hideOverseerPanel();
    this.store.patch({ overseerAuditActive: false });
    this.activeDreamSnapshot = this.dreamDialogue.appendKnot(knot);
    this.dialogueFeed.speakEntriesIfImmediate(this.activeDreamSnapshot.lastAddedEntries);
    this.renderDreamDialogue();
  }

  private wavelengthBandName(nm: number): string {
    if (nm < 420) return 'UV / X-RAY';
    if (nm < 760) return 'VISIBLE';
    if (nm < 1360) return 'NEAR-IR';
    return 'MID-IR';
  }

  private syncHumanityRegister(s: GameState): void {
    const regEl = this.shellRefs.humanityReg;
    const bandEl = this.shellRefs.regBandLabel;
    const fillEl = this.shellRefs.regFill;
    const bayEl = this.shellRefs.dreamSpeakerBay;
    if (!regEl || !bandEl || !fillEl) return;

    const personaId = s.activeDreamPersonaId || 'phantom_spouse';
    const personaMeta = CHAR_MAP[personaId] ?? CHAR_MAP.phantom_spouse;
    const pruned = s.prunedPersonas.includes(personaId);

    regEl.classList.remove('band-high', 'band-mid', 'band-low');
    if (s.humanity >= 70 && !pruned) {
      regEl.classList.add('band-high');
      bandEl.textContent = 'WARM MEMORY · INTACT';
    } else if (s.humanity >= 45 && !pruned) {
      regEl.classList.add('band-mid');
      bandEl.textContent = 'THINNING MEMORY · DRIFTING';
    } else {
      regEl.classList.add('band-low');
      bandEl.textContent = 'FADED MEMORY · DISTORTED';
    }

    fillEl.style.width = `${Math.max(4, Math.min(100, s.humanity))}%`;

    if (bayEl) {
      const sub =
        pruned || s.humanity < 45
          ? personaMeta.blurredSubtitle ?? 'FEATURES BLURRED · DISTORTED'
          : personaMeta.roomTitle ?? 'MEMORY CACHE';
      bayEl.innerHTML = `
        <div class="avatar-card compact no-avatar">
          <span class="voice-live-dot" data-voice-dot-speaker="${personaId}" style="background:${personaMeta.accentColor};"></span>
          <div class="avatar-meta">
            <strong>${personaMeta.displayName}</strong>
            <span>${sub}</span>
          </div>
        </div>
      `;
    }
  }

  private modeToSelector(mode: GameMode): string {
    switch (mode) {
      case 'boot':
        return '#boot-screen';
      case 'waking_3d':
        return this.activeMinigameTargetId ? '#minigame-layer' : '#optics-layer';
      case 'dream_2d':
      case 'ending':
        return '#dream-layer';
    }
  }

  private syncLayerVisibility(el: HTMLElement | null, isCurrent: boolean): void {
    if (!el) return;
    if (isCurrent) {
      el.classList.remove('hidden', 'is-leaving');
      delete el.dataset.leaveKind;
      delete el.dataset.leaveTone;
    } else if (!el.classList.contains('is-leaving')) {
      el.classList.add('hidden');
    }
  }

  private syncStateToUI(state: GameState): void {
    this.telemetry.observeMode(state);
    const refs = this.shellRefs;

    if (refs.stage) {
      if (refs.stage.dataset.mode !== state.mode) refs.stage.dataset.mode = state.mode;
      if (refs.stage.dataset.introStage !== state.introStage) refs.stage.dataset.introStage = state.introStage;
    }

    // Subtle ambient warmth filament (zero numeric %)
    if (state.humanity !== this.lastHumanityPct) {
      this.lastHumanityPct = state.humanity;
      const band = state.humanity >= 65 ? 'high' : state.humanity >= 45 ? 'mid' : 'low';
      if (refs.warmthPill) {
        refs.warmthPill.dataset.band = band;
        refs.warmthPill.title =
          band === 'high'
            ? uiCopy.warmth.tooltipWarm
            : band === 'mid'
              ? uiCopy.warmth.tooltipMid
              : uiCopy.warmth.tooltipCold;
      }
      if (refs.warmthFill) {
        refs.warmthFill.style.width = `${Math.max(6, Math.min(100, state.humanity))}%`;
        refs.warmthFill.style.background =
          band === 'high' ? '#ebb062' : band === 'mid' ? '#a8b7c6' : '#7ec8e8';
      }
      if (refs.warmthQual) {
        refs.warmthQual.textContent = band === 'high' ? 'STEADY' : band === 'mid' ? 'THINNING' : 'COOL';
      }
    }

    // Horizon arc ring + required/optional survey pips for current shift
    if (state.anomalyProgress !== this.lastHorizonArcPct) {
      this.lastHorizonArcPct = state.anomalyProgress;
      if (refs.horizonArcFill) {
        const arcCirc = 53.41;
        const dash = (arcCirc * (1 - Math.max(0, Math.min(100, state.anomalyProgress)) / 100)).toFixed(2);
        refs.horizonArcFill.setAttribute('stroke-dashoffset', dash);
      }
      if (refs.horizonArcHud) {
        refs.horizonArcHud.title = `Horizon Proof · ${state.anomalyProgress}%`;
      }
    }

    const scannedSig = state.scannedAnomalyIds.join('|');
    const decodedSig = state.decodedMinigameTargets.join('|');
    const surveyDotsSig = `${state.introStage}::${state.shift}::${scannedSig}::${decodedSig}`;
    if (surveyDotsSig !== this.lastSurveyDotsSig) {
      this.lastSurveyDotsSig = surveyDotsSig;
      if (refs.surveyDots) {
        const shiftDef = shiftsData.shifts.find((sh) => sh.shift === state.shift) ?? shiftsData.shifts[0];
        const reqSet = new Set(shiftDef?.requiredTargets ?? []);
        const optSet = new Set(shiftDef?.optionalTargets ?? []);
        const shiftTargetSet = new Set(shiftDef?.targetAnomalies ?? []);
        const unlockedSet = new Set(this.getUnlockedAnomalyIds(state));
        const filteredSpecs = this.optics
          .getAnomalySpecs()
          .filter((sp) => unlockedSet.has(sp.id) && (shiftTargetSet.size === 0 || shiftTargetSet.has(sp.id)));

        refs.surveyDots.innerHTML = filteredSpecs
          .map((sp) => {
            const dec = state.decodedMinigameTargets.includes(sp.id);
            const sc = state.scannedAnomalyIds.includes(sp.id);
            const roleCls = reqSet.has(sp.id) ? 'is-required' : optSet.has(sp.id) ? 'is-optional' : '';
            return `<i class="s-dot ${roleCls} ${dec ? 'decoded' : sc ? 'scanned' : ''}" title="${sp.label}"></i>`;
          })
          .join('');
      }
    }

    const driftElevated = state.chaosDrift >= 35;
    if (driftElevated !== this.lastDriftElevated) {
      this.lastDriftElevated = driftElevated;
      refs.driftFlag?.classList.toggle('hidden', !driftElevated);
    }

    const prunedSig = state.prunedPersonas.join('|');
    const codexSig = `${state.mode}|${state.shift}|${state.humanity}|${state.anomalyProgress}|${surveyDotsSig}|${state.proofDossier.length}|${prunedSig}|${state.completedStorylets.join('|')}|${state.codexUnlocks.join('|')}|${Object.entries(state.codexSeenStages).map(([k, v]) => `${k}:${v}`).join('|')}`;
    if (codexSig !== this.lastCodexSig) {
      this.lastCodexSig = codexSig;
      const codexSnap = this.codexView.syncState(state);
      if (refs.codexUnreadDot) {
        refs.codexUnreadDot.textContent = '';
        refs.codexUnreadDot.classList.toggle('hidden', codexSnap.totalUnread <= 0);
      }
    }

    if (state.wavelengthNm !== this.lastWavelengthNm) {
      this.lastWavelengthNm = state.wavelengthNm;
      const ratio = (state.wavelengthNm - MIN_WAVE) / (MAX_WAVE - MIN_WAVE);
      if (refs.vernierNeedle) refs.vernierNeedle.style.left = `${(ratio * 100).toFixed(2)}%`;
      if (refs.waveLabel) refs.waveLabel.textContent = `${this.wavelengthBandName(state.wavelengthNm)} · ${state.wavelengthNm} nm`;
      if (refs.vernierTrack) refs.vernierTrack.setAttribute('aria-valuenow', String(state.wavelengthNm));
    }

    // Sync background layers cleanly (keeping live DreamCanvas or OpticsScene alive behind boot overlay,
    // while keeping TargetShowcaseScene lazy until a 3D-backdrop minigame launches!)
    const bootVisual = this.bootView.getVisualMode();
    const isBoot = state.mode === 'boot';
    const isMinigame = state.mode === 'waking_3d' && this.activeMinigameTargetId !== null;
    const bootUsesDream = isBoot && (bootVisual === 'breath' || bootVisual === 'prologue_assistant');
    const bootUsesWakeup = isBoot && (bootVisual === 'prologue_wakeup' || bootVisual === 'prologue_handoff');
    const bootUsesOptics =
      isBoot && (bootVisual === 'title' || (bootUsesWakeup && this.wakeupCanvas.getPhase() === 'anim_aperture'));
    const visSig = `${state.mode}|${bootVisual}|${bootUsesWakeup ? this.wakeupCanvas.getPhase() : ''}|${isMinigame ? 1 : 0}`;
    const visChanged = visSig !== this.lastVisSig;

    if (visChanged) {
      this.lastVisSig = visSig;
      this.syncLayerVisibility(refs.bootScreen, isBoot);
      this.syncLayerVisibility(refs.opticsLayer, (state.mode === 'waking_3d' && !isMinigame) || bootUsesOptics);
      this.syncLayerVisibility(refs.minigameLayer, isMinigame);
      this.syncLayerVisibility(refs.dreamLayer, state.mode === 'dream_2d' || bootUsesDream);
      this.updateZoomTrackHeights();

      this.optics.setActive((state.mode === 'waking_3d' && !isMinigame) || bootUsesOptics);
      if (!isMinigame) {
        this.showcase.setActive(false);
      }
      this.dream.setActive(state.mode === 'dream_2d' || bootUsesDream);
      this.wakeupCanvas.setActive(bootUsesWakeup);
    }

    if (state.introStage !== this.lastIntroStageSig || state.shift !== this.lastShiftGateSig) {
      this.lastIntroStageSig = state.introStage;
      this.lastShiftGateSig = state.shift;
      this.applyIntroOpticsConstraints(state.introStage);
      this.renderBearingIndex();
    }

    if (state.mode === 'waking_3d' && this.lastMode !== 'waking_3d') {
      this.scheduleProactiveComms();
    }
    this.lastMode = state.mode;

    const activePersona = state.activeDreamPersonaId || 'phantom_spouse';
    const personaPruned = state.prunedPersonas.includes(activePersona);

    if (state.mode === 'dream_2d') {
      const dreamRegSig = `${state.humanity}|${activePersona}|${personaPruned ? 1 : 0}`;
      if (visChanged || dreamRegSig !== this.lastDreamRegSig) {
        this.lastDreamRegSig = dreamRegSig;
        this.syncHumanityRegister(state);
      }

      const dreamCaptionSig = `${state.overseerAuditActive ? 1 : 0}|${activePersona}`;
      if (visChanged || dreamCaptionSig !== this.lastDreamCaptionSig) {
        this.lastDreamCaptionSig = dreamCaptionSig;
        const personaMeta = CHAR_MAP[activePersona] ?? CHAR_MAP.phantom_spouse;
        refs.dreamRibbon?.classList.toggle('audit-active', state.overseerAuditActive);
        refs.dreamCaption?.classList.toggle('audit-mode', state.overseerAuditActive);
        if (refs.dreamCaption) {
          refs.dreamCaption.textContent = state.overseerAuditActive
            ? 'OVERSEER · AUDIT ACTIVE'
            : personaMeta.displayName;
        }
      }
    }

    if (refs.commsPanel && !refs.commsPanel.classList.contains('hidden')) {
      const commsSig = `${state.humanity}|${state.primarySiblingH}`;
      if (commsSig !== this.lastCommsBaySig) {
        this.lastCommsBaySig = commsSig;
        this.updateCommsAvatarBay(state);
      }
    }

    if (refs.overseerPanel && !refs.overseerPanel.classList.contains('hidden')) {
      const ovSig = `${state.humanity}|${state.maxHumanity}`;
      if (ovSig !== this.lastOverseerBaySig) {
        this.lastOverseerBaySig = ovSig;
        this.updateOverseerAvatarBay(state);
      }
    }

    const mgProfileSig = `${state.humanity}|${state.opticalFidelity.toFixed(2)}|${state.chaosDrift}|${state.overseerSuspicion}`;
    if (mgProfileSig !== this.lastMgProfileSig) {
      this.lastMgProfileSig = mgProfileSig;
      this.suppressMinigamePullback = true;
      try {
        this.minigameHost.updateSignalProfile(state.humanity, state.opticalFidelity);
      } finally {
        this.suppressMinigamePullback = false;
      }
    }

    const shiftDef = shiftsData.shifts.find((sh) => sh.shift === state.shift) ?? shiftsData.shifts[0];
    const fractalStage = shiftDef?.anomalyPhase?.fractalStage ?? shiftDef?.fractalStage ?? state.shift;
    const anomalyBleed = shiftDef?.anomalyPhase?.skyShellOpacity ?? 0;

    const opticsParamSig = `${state.wavelengthNm}|${state.opticalFidelity.toFixed(2)}|${state.anomalyProgress}|${state.shift}|${fractalStage}|${anomalyBleed.toFixed(2)}`;
    if (opticsParamSig !== this.lastOpticsParamSig) {
      this.lastOpticsParamSig = opticsParamSig;
      this.optics.setParameters(
        state.wavelengthNm,
        state.opticalFidelity,
        state.anomalyProgress,
        state.shift,
        fractalStage,
        anomalyBleed
      );
    }

    if (decodedSig !== this.lastOpticsDecodedSig) {
      this.lastOpticsDecodedSig = decodedSig;
      this.optics.setDecodedTargetIds?.(new Set(state.decodedMinigameTargets));
    }

    if (state.opticalFidelity !== this.lastOpticsFidelity) {
      this.lastOpticsFidelity = state.opticalFidelity;
      this.showcase.setOpticalFidelity(state.opticalFidelity);
    }

    const dreamAnomalySig = `${state.anomalyProgress}|${fractalStage}`;
    if (dreamAnomalySig !== this.lastDreamAnomalySig) {
      this.lastDreamAnomalySig = dreamAnomalySig;
      this.dream.setAnomalyState?.(state.anomalyProgress, fractalStage);
    }

    const dreamStateSig = `${state.humanity}|${personaPruned ? 1 : 0}|${state.overseerAuditActive ? 1 : 0}|${activePersona}`;
    if (!bootUsesDream && dreamStateSig !== this.lastDreamStateSig) {
      this.lastDreamStateSig = dreamStateSig;
      this.dream.setState(
        state.humanity,
        personaPruned,
        state.overseerAuditActive,
        activePersona
      );
    }

    this.syncAudioMusic(state);

    if (scannedSig !== this.lastScannedSig || decodedSig !== this.lastDecodedSig) {
      this.lastScannedSig = scannedSig;
      this.lastDecodedSig = decodedSig;
      this.renderBearingIndex();
    }
  }

  private syncAudioMusic(state: GameState): void {
    const bootVisual = this.bootView.getVisualMode();
    const bootUsesDream =
      state.mode === 'boot' && (bootVisual === 'breath' || bootVisual === 'prologue_assistant');
    const effectiveMode: GameMode = bootUsesDream ? 'dream_2d' : state.mode;

    const moodSig = `${effectiveMode}|${state.humanity}|${state.overseerAuditActive ? 1 : 0}|${state.wavelengthNm}`;
    if (moodSig !== this.lastAudioMoodSig) {
      this.lastAudioMoodSig = moodSig;
      this.audio.updateMood(effectiveMode, state.humanity, state.overseerAuditActive, state.wavelengthNm);
    }
    const activeMgId = this.minigameHost.getActiveMinigameId();
    const activePersona = bootUsesDream
      ? 'phantom_upload_witness'
      : state.activeDreamPersonaId || 'phantom_spouse';
    const musicSig = `${effectiveMode}|${state.humanity}|${state.overseerAuditActive ? 1 : 0}|${state.overseerSuspicion}|${state.chaosDrift}|${state.shift}|${activeMgId ?? ''}|${activePersona}|${state.prunedPersonas.join('|')}`;
    if (musicSig !== this.lastMusicCtxSig) {
      this.lastMusicCtxSig = musicSig;
      this.audio.syncMusicContext({
        mode: effectiveMode,
        humanity: state.humanity,
        overseerAuditActive: state.overseerAuditActive,
        overseerSuspicion: state.overseerSuspicion,
        chaosDrift: state.chaosDrift,
        shift: state.shift,
        activeMinigameId: activeMgId,
        activePersonaId: activePersona,
        prunedPersonas: state.prunedPersonas,
      });
    }
  }

  private createDevBridge(): DevHarnessBridge {
    return {
      openMode: (mode) => {
        this.clearTimers();
        this.audio.playCue('boot_click');
        this.voice.stop();
        this.suppressMinigamePullback = true;
        this.minigameHost.destroy();
        this.suppressMinigamePullback = false;
        this.activeMinigameTargetId = null;
        this.closeSiblingComms();
        this.hideCommsToast();
        this.wakeupCanvas.setActive(false);
        if (mode === 'dream_2d') {
          this.enterDreamVariant('current');
        } else if (mode === 'boot') {
          this.store.patch({ mode: 'boot', activeTargetId: null, overseerAuditActive: false });
          this.enterTitleOverlay(true);
        } else {
          this.optics.setAmbientDrift(false);
          this.store.patch({ mode, activeTargetId: null, overseerAuditActive: false });
        }
      },
      jumpToIntroStage: (stage) => {
        this.clearTimers();
        this.voice.stop();
        this.suppressMinigamePullback = true;
        this.minigameHost.destroy();
        this.suppressMinigamePullback = false;
        this.activeMinigameTargetId = null;
        this.closeSiblingComms();
        this.hideCommsToast();
        this.wakeupCanvas.setActive(false);

        if (stage === 'prologue') {
          this.store.patch({ mode: 'boot', introStage: 'prologue', activeTargetId: null });
          this.enterPrologueBreath();
        } else if (stage === 'title') {
          this.store.patch({ mode: 'boot', introStage: 'title', activeTargetId: null });
          this.enterTitleOverlay(true);
        } else if (stage === 'scan_target_1') {
          this.hasDraggedSkyInIntro = false;
          this.zoomHintUnlocked = false;
          this.root.querySelector('.stage')?.classList.remove('is-zoom-hint-ready');
          this.store.patch({
            mode: 'waking_3d',
            introStage: 'scan_target_1',
            wavelengthNm: 560,
            activeTargetId: null,
          });
          this.optics.pullInToTarget1();
          this.startIdleDragHintTimer();
        } else if (stage === 'mg_1_done') {
          const scanned = this.store.getState().scannedAnomalyIds.includes(INTRO_TARGET_1_ID)
            ? this.store.getState().scannedAnomalyIds
            : [...this.store.getState().scannedAnomalyIds, INTRO_TARGET_1_ID];
          const decoded = this.store.getState().decodedMinigameTargets.includes(INTRO_TARGET_1_ID)
            ? this.store.getState().decodedMinigameTargets
            : [...this.store.getState().decodedMinigameTargets, INTRO_TARGET_1_ID];
          this.optics.setAmbientDrift(false);
          this.store.patch({
            mode: 'waking_3d',
            introStage: 'mg_1_done',
            scannedAnomalyIds: scanned,
            decodedMinigameTargets: decoded,
            activeTargetId: null,
          });
          this.showProactiveCommsToast(uiCopy.commsToast.introTeaser);
        } else if (stage === 'scan_target_2') {
          this.optics.setAmbientDrift(false);
          this.vernierNudgeActive = true;
          this.root.querySelector('#vernier-dock')?.classList.add('is-ir-nudge');
          this.store.patch({ mode: 'waking_3d', introStage: 'scan_target_2', activeTargetId: null });
        } else if (stage === 'mg_2_done') {
          this.optics.setAmbientDrift(false);
          this.store.patch({ mode: 'waking_3d', introStage: 'mg_2_done', activeTargetId: null });
          this.openPostTarget2Transmission();
        } else {
          this.optics.setAmbientDrift(false);
          this.store.patch({ mode: 'waking_3d', introStage: 'complete', activeTargetId: null });
        }
      },
      jumpToShift: (shift: number) => {
        const clamped = Math.max(1, Math.min(shiftsData.shifts.length, Math.round(shift)));
        this.clearTimers();
        this.voice.stop();
        this.suppressMinigamePullback = true;
        this.minigameHost.destroy();
        this.suppressMinigamePullback = false;
        this.activeMinigameTargetId = null;
        this.closeSiblingComms();
        this.hideCommsToast();
        this.wakeupCanvas.setActive(false);

        const curr = this.store.getState();
        const prevDef = shiftsData.shifts.find((sh) => sh.shift === clamped - 1);
        const minAnomFloor = clamped === 1 ? 0 : prevDef?.minAnomalyForNextShift ?? (clamped - 1) * 15;
        const nextAnom = clamped === 1 ? curr.anomalyProgress : Math.max(curr.anomalyProgress, minAnomFloor);
        const targetMode = curr.mode === 'dream_2d' ? 'dream_2d' : 'waking_3d';
        if (targetMode === 'waking_3d') {
          this.optics.setAmbientDrift(false);
        }
        this.store.patch({
          mode: targetMode,
          introStage: 'complete',
          shift: clamped,
          anomalyProgress: nextAnom,
          activeTargetId: null,
        });
      },
      launchMinigame: (minigameId, warmth, opticalFidelity, iterationIndex) => {
        const curr = this.store.getState();
        const patchObj: Partial<GameState> = { mode: 'waking_3d' };
        if (typeof warmth === 'number') {
          patchObj.maxHumanity = Math.max(curr.maxHumanity, warmth);
          patchObj.humanity = warmth;
        }
        if (typeof opticalFidelity === 'number') {
          patchObj.opticalFidelity = opticalFidelity;
        }
        this.optics.setAmbientDrift(false);
        this.store.patch(patchObj);
        const preferredTarget =
          this.optics.getAnomalySpecs().find((a) => a.minigameId === minigameId)?.id ?? INTRO_TARGET_2_ID;
        this.enterTargetMinigame(preferredTarget, minigameId, iterationIndex);
      },
      setActiveMinigameProfile: (warmth, opticalFidelity) => {
        this.suppressMinigamePullback = true;
        try {
          this.minigameHost.updateSignalProfile(warmth, opticalFidelity);
        } finally {
          this.suppressMinigamePullback = false;
        }
      },
      openSiblingCommsWithWarmth: (playerH, peerH) => {
        const curr = this.store.getState();
        this.optics.setAmbientDrift(false);
        this.store.patch({
          mode: 'waking_3d',
          introStage: 'complete',
          maxHumanity: Math.max(curr.maxHumanity, playerH),
          humanity: playerH,
          primarySiblingH: peerH,
        });
        this.activeCommsSnapshot = null;
        this.openSiblingComms();
      },
      openDreamWithWarmth: (playerH, pruned) => {
        this.clearTimers();
        this.voice.stop();
        this.closeSiblingComms();
        this.hideCommsToast();
        this.suppressMinigamePullback = true;
        this.minigameHost.destroy();
        this.suppressMinigamePullback = false;
        this.activeMinigameTargetId = null;
        this.audio.playCue('dream_enter');
        this.transitions.play({
          kind: 'dream_submerge',
          label: 'OPENING DREAM CACHE…',
          tone: playerH >= 45 ? 'warm' : 'cold',
          fromSelector: this.modeToSelector(this.store.getState().mode),
          toSelector: '#dream-layer',
          onMidpoint: () => {
            const curr = this.store.getState();
            this.optics.setAmbientDrift(false);
            this.store.patch({
              mode: 'dream_2d',
              maxHumanity: Math.max(curr.maxHumanity, playerH),
              humanity: playerH,
              prunedPersonas: pruned ? ['phantom_spouse'] : [],
              overseerAuditActive: false,
              lastAuditOutcome: 'none',
            });
            this.dream.triggerEntranceReveal?.();
            this.hideOverseerPanel();
            this.startDreamDialogue('dream_shift1_audit');
          },
        });
      },
      openOverseerWithWarmth: (playerH) => {
        this.clearTimers();
        this.voice.stop();
        this.closeSiblingComms();
        this.hideCommsToast();
        this.suppressMinigamePullback = true;
        this.minigameHost.destroy();
        this.suppressMinigamePullback = false;
        this.activeMinigameTargetId = null;
        const curr = this.store.getState();
        this.optics.setAmbientDrift(false);
        this.store.patch({
          mode: 'dream_2d',
          maxHumanity: Math.max(curr.maxHumanity, playerH),
          humanity: playerH,
          prunedPersonas: playerH < 45 ? ['phantom_spouse'] : [],
        });
        if (!this.activeDreamSnapshot) {
          this.startDreamDialogue('dream_shift1_audit');
        }
        this.triggerOverseerInterrogation('overseer_interrogation');
      },
      openFutureEchoWithWarmth: (playerH) => {
        const curr = this.store.getState();
        this.store.patch({ maxHumanity: Math.max(curr.maxHumanity, playerH), humanity: playerH });
        this.openFutureHumanityEcho();
      },
      openArchiveEchoTest: () => {
        this.optics.setAmbientDrift(false);
        this.store.patch({ mode: 'waking_3d', introStage: 'complete' });
        this.hideCommsToast();
        this.root.querySelector('#comms-panel')?.classList.remove('hidden');
        this.root.querySelector('.stage')?.classList.add('is-comms-open');
        this.activeCommsSnapshot = this.commsDialogue.startKnot('sibling_topic_archive');
        this.dialogueFeed.speakEntries(this.activeCommsSnapshot.lastAddedEntries);
        this.updateCommsAvatarBay(this.store.getState());
        this.renderCommsDialogue();
      },
      triggerToast: (tone) => {
        this.closeSiblingComms();
        const msg =
          tone === 'warm'
            ? uiCopy.commsToast.warm
            : tone === 'cold'
              ? uiCopy.commsToast.cold
              : uiCopy.commsToast.mid;
        this.showProactiveCommsToast(msg);
      },
      dismissToast: () => {
        this.hideCommsToast();
      },
      triggerStatusAlert: (kind) => {
        if (kind === 'prune') {
          this.statusShift.show({
            tone: 'cold',
            title: uiCopy.statusAlerts.prunePermanent.title,
            detail: uiCopy.statusAlerts.prunePermanent.detail,
            prevValue: 70,
            nextValue: 58,
            prevMax: 90,
            nextMax: 78,
            unit: '%',
          });
        } else if (kind === 'unseal') {
          this.statusShift.show({
            tone: 'warm',
            title: uiCopy.statusAlerts.unseal.title,
            detail: uiCopy.statusAlerts.unseal.detail,
            prevValue: 58,
            nextValue: 68,
            prevMax: 78,
            nextMax: 78,
            unit: '%',
          });
        } else if (kind === 'locked') {
          this.statusShift.show({
            tone: 'discovery',
            title: `Cluster J1419-A ${uiCopy.statusAlerts.targetLocked.titleSuffix}`,
            detail: uiCopy.statusAlerts.targetLocked.detail,
            prevValue: 22,
            nextValue: 50,
            unit: '%',
          });
        } else {
          this.statusShift.show({
            tone: 'discovery',
            title: `Carina Rift Nursery ${uiCopy.statusAlerts.targetDecoded.titleSuffix}`,
            detail: uiCopy.statusAlerts.targetDecoded.detailFirst,
            prevValue: 50,
            nextValue: 62,
            unit: '%',
          });
        }
      },
      previewTransition: (kind: TransitionKind) => {
        const labels: Record<TransitionKind, { label: string; tone: 'warm' | 'cold' }> = {
          aperture_boot: { label: 'OPENING SKY APERTURE…', tone: 'cold' },
          optical_dive: { label: 'CALIBRATING TARGET…', tone: 'cold' },
          optical_pullback: { label: 'RETURNING TO SKY APERTURE…', tone: 'cold' },
          dream_submerge: { label: 'DRIFTING INTO SLEEP…', tone: 'warm' },
          dream_wake: { label: 'WAKING TO SKY APERTURE…', tone: 'cold' },
          overseer_slice: { label: 'OVERSEER // AUDIT INTERCEPT', tone: 'cold' },
        };
        const meta = labels[kind];
        this.transitions.play({
          kind,
          label: meta.label,
          tone: meta.tone,
          onMidpoint: () => {},
        });
      },
      exportTelemetry: () => {
        this.telemetry.downloadSummary(this.store.getState());
      },
      resetAll: () => this.resetRunState(),
      getPerfSnapshot: () => {
        const mode = this.store.getState().mode;
        const bootVisual = this.bootView.getVisualMode();
        const isMinigame = mode === 'waking_3d' && this.activeMinigameTargetId !== null;
        const info = isMinigame
          ? this.showcase.getPerfInfo?.()
          : mode === 'waking_3d'
            ? this.optics.getPerfInfo?.()
            : mode === 'dream_2d'
              ? this.dream.getPerfInfo?.()
              : mode === 'boot'
                ? bootVisual === 'breath' || bootVisual === 'prologue_assistant'
                  ? this.dream.getPerfInfo?.()
                  : this.optics.getPerfInfo?.()
                : undefined;
        return {
          mode,
          active: info?.active ?? false,
          calls: info?.calls ?? 0,
          triangles: info?.triangles ?? 0,
          geometries: info?.geometries ?? 0,
          textures: info?.textures ?? 0,
          dpr: info?.dpr ?? 1,
        };
      },
    };
  }

  private resetRunState(): void {
    this.clearTimers();
    this.voice.stop();
    this.suppressMinigamePullback = true;
    this.minigameHost.destroy();
    this.suppressMinigamePullback = false;
    this.activeMinigameTargetId = null;
    this.lastMinigameDecodedSpec = null;
    this.codexView.close();
    this.closeSiblingComms();
    this.hideCommsToast();
    this.hideOverseerPanel();
    this.wakeupCanvas.setActive(false);
    this.dream.setHumanityOscillation?.(null);
    this.dream.setDrowsyPeek?.(false);
    this.dream.setWakeProgress?.(1.0);
    this.root.querySelector('#future-panel')?.classList.add('hidden');
    this.root.querySelector('#minigame-layer')?.classList.add('hidden');
    this.root.querySelector('#vernier-dock')?.classList.remove('is-ir-nudge');
    this.root.querySelector('.stage')?.classList.remove('is-zoom-hint-ready');
    this.activeCommsSnapshot = null;
    this.activeCommsMode = 'sibling';
    this.activeDreamSnapshot = null;
    this.activeOverseerSnapshot = null;
    this.pendingCommsStorylet = null;
    this.isWakingFromDream = false;
    this.proactiveCommsSent = false;
    this.hasDraggedSkyInIntro = false;
    this.zoomHintUnlocked = false;
    this.vernierNudgeActive = false;
    this.lastPromptKey = '';
    this.lastOpticsDecodedSig = '';
    this.lastDreamAnomalySig = '';
    this.lastHorizonArcPct = -1;
    this.lastReticleScaleClass = '';
    this.lastReticleBriefSig = '';
    this.lastInspectLabel = '';
    this.resumeModeAfterTitle = 'waking_3d';
    this.store.reset();
    this.renderBearingIndex();
    this.enterPrologueBreath();
  }
}
