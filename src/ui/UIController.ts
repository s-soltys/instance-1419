import charactersData from '../content/characters.json';
import uiCopy from '../content/ui_copy.json';
import type { AudioEngine } from '../engine/AudioEngine';
import { CodexEngine } from '../engine/CodexEngine';
import { DialogueRunner, type DialogueSnapshot } from '../engine/DialogueRunner';
import type { DreamCanvas } from '../engine/DreamCanvas';
import type { MinigameRegistry } from '../engine/minigames/MinigameRegistry';
import type { AnomalySpec, OpticsScene, OpticsTelemetry } from '../engine/OpticsScene';
import { SettingsStore, type UserSettings } from '../engine/SettingsStore';
import type { GameMode, GameState, StateStore } from '../engine/StateStore';
import type { StoryletScheduler } from '../engine/StoryletScheduler';
import type { ShowcaseTelemetry, TargetShowcaseScene } from '../engine/TargetShowcaseScene';
import { TelemetryLogger } from '../engine/TelemetryLogger';
import type { VoiceEngine } from '../engine/voice/VoiceEngine';
import { platform } from '../platform/PlatformAdapter';
import type { DevHarnessBridge } from './DevHarness';
import { renderSpeakerAvatar, updateAvatarVoiceAnimations } from './SpeakerAvatar';
import { StatusShiftOverlay } from './StatusShiftOverlay';
import { TransitionDirector, type TransitionKind } from './TransitionDirector';
import { BootView } from './views/BootView';
import { CodexView } from './views/CodexView';
import { DialogueFeedView } from './views/DialogueFeedView';
import { MinigameHostView } from './views/MinigameHostView';
import { SettingsView } from './views/SettingsView';

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

interface CachedShellRefs {
  stage: HTMLElement | null;
  warmthFill: HTMLElement | null;
  warmthPct: HTMLElement | null;
  surveyDots: HTMLElement | null;
  driftFlag: HTMLElement | null;
  codexUnreadDot: HTMLElement | null;
  vernierNeedle: HTMLElement | null;
  waveLabel: HTMLElement | null;
  vernierTrack: HTMLElement | null;
  dreamRibbon: HTMLElement | null;
  dreamCaption: HTMLElement | null;
  humanityReg: HTMLElement | null;
  regBandLabel: HTMLElement | null;
  regHVal: HTMLElement | null;
  regFill: HTMLElement | null;
  dreamSpeakerBay: HTMLElement | null;
  commsPanel: HTMLElement | null;
  commsAvatarBay: HTMLElement | null;
  overseerPanel: HTMLElement | null;
  overseerAvatarBay: HTMLElement | null;
  bootScreen: HTMLElement | null;
  opticsLayer: HTMLElement | null;
  inspectLayer: HTMLElement | null;
  dreamLayer: HTMLElement | null;
}

interface CachedOpticsHudRefs {
  target: HTMLElement | null;
  zoomLabel: HTMLElement | null;
  stageLabel: HTMLElement | null;
  zoomFill: HTMLElement | null;
  zoomNeedle: HTMLElement | null;
  zoomTrack: HTMLElement | null;
  reticleEl: HTMLElement | null;
  lockRing: SVGCircleElement | null;
  raTicks: HTMLElement | null;
  decTicks: HTMLElement | null;
  inspectBtn: HTMLButtonElement | null;
}

interface CachedShowcaseHudRefs {
  stageEl: HTMLElement | null;
  xEl: HTMLElement | null;
  fillEl: HTMLElement | null;
  needleEl: HTMLElement | null;
  zoomTrack: HTMLElement | null;
  scaleEl: HTMLElement | null;
  compassEl: HTMLElement | null;
}

interface MarkerDomCache {
  lastTransform: string;
  lastOpacity: string;
  lastOffscreen: boolean;
}

/**
 * Lean top-level scene coordinator routing Boot, 3D Wide Sky, 3D Target Inspect,
 * and 2D Dreamscape views while delegating dialogue, minigames, settings, codex, and boot DOM to modular views.
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
  private readonly scheduler: StoryletScheduler;
  private readonly minigames: MinigameRegistry;
  private readonly codexEngine: CodexEngine;
  private readonly telemetry: TelemetryLogger;
  private readonly transitions: TransitionDirector;
  private readonly statusShift: StatusShiftOverlay;
  private readonly bootView: BootView;
  private readonly dialogueFeed: DialogueFeedView;
  private readonly minigameHost: MinigameHostView;
  private readonly settingsView: SettingsView;
  private readonly codexView: CodexView;

  private optics!: OpticsScene;
  private showcase!: TargetShowcaseScene;
  private dream!: DreamCanvas;

  private shellRefs!: CachedShellRefs;
  private opticsRefs!: CachedOpticsHudRefs;
  private showcaseRefs!: CachedShowcaseHudRefs;
  private markerCache = new Map<string, MarkerDomCache>();
  private skyZoomTrackH = 92;
  private showcaseZoomTrackH = 92;
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

  private lastScStageText = '';
  private lastScXText = '';
  private lastScFillTransform = '';
  private lastScNeedleTransform = '';
  private lastScScaleText = '';
  private lastScCompassText = '';

  private activeCommsSnapshot: DialogueSnapshot | null = null;
  private activeDreamSnapshot: DialogueSnapshot | null = null;
  private activeOverseerSnapshot: DialogueSnapshot | null = null;
  private focusedSpec: AnomalySpec | null = null;

  private markerEls = new Map<string, HTMLButtonElement>();
  private lastScannedSig = '';
  private lastDecodedSig = '';
  private lastSurveyDotsSig = '';
  private lastHumanityPct = -1;
  private lastDriftElevated: boolean | null = null;
  private lastCodexSig = '';
  private lastWavelengthNm = -1;
  private lastMode: GameMode = 'boot';
  private lastVisMode: GameMode | null = null;
  private lastDreamRegSig = '';
  private lastCommsBaySig = '';
  private lastOverseerBaySig = '';
  private lastMgProfileSig = '';
  private lastDreamCaptionSig = '';
  private lastOpticsParamSig = '';
  private lastOpticsFidelity = -1;
  private lastDreamStateSig = '';
  private lastAudioMoodSig = '';
  private lastMusicCtxSig = '';
  private avatarAnimRaf = 0;
  private unbindVoiceSub: (() => void) | null = null;

  private proactiveCommsSent = false;
  private proactiveCommsTimer: number | null = null;
  private overseerInterruptTimer: number | null = null;
  private overseerSliceTimer: number | null = null;

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
    this.scheduler = scheduler;
    this.minigames = minigames;
    this.codexEngine = new CodexEngine();
    this.telemetry = new TelemetryLogger(store.getState());

    this.renderShell();
    this.transitions = new TransitionDirector(this.root);
    this.statusShift = new StatusShiftOverlay(this.root.querySelector('.stage')!, audio);
    this.bootView = new BootView(this.root);
    this.bootView.populate();
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
          this.enterTargetInspect(targetId);
        } else {
          this.optics?.slewToAnomaly(targetId);
        }
      },
      onLaunchCapstone: () => {
        this.enterTargetInspect('sol_centauri_bearing', () => this.launchTargetMinigame('blink_spotter'));
      },
    });
    this.minigameHost.setBandSwitchCallback((bandIdx) => {
      const ratios = [0.04, 0.23, 0.61, 0.86];
      const val = ratios[bandIdx] ?? 0.23;
      this.showcase?.setWaveBand(val);
      this.store.patch({ wavelengthNm: Math.round(200 + val * 1600) });
      this.root.querySelectorAll<HTMLButtonElement>('#inspect-spectrum-bar .spec-btn').forEach((b) => {
        b.classList.toggle('active', Math.abs(Number(b.dataset.band) - val) < 0.08);
      });
    });
    this.minigameHost.setActiveChangeCallback(() => {
      if (this.shellRefs?.stage) {
        this.shellRefs.stage.dataset.minigame = this.minigameHost.isActive() ? '1' : '0';
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
    this.settingsStore.subscribe((settings) => this.applyUserSettings(settings));
    this.store.subscribe((state) => this.syncStateToUI(state));
    this.store.subscribeStatusShift((ev) => this.statusShift.show(ev));
    this.bindAvatarVoiceLoop();

    if (import.meta.env.DEV || new URLSearchParams(window.location.search).get('dev') === '1') {
      void import('./DevHarness').then(({ DevHarness }) => {
        new DevHarness(this.store, this.audio, this.voice, this.minigames, this.createDevBridge());
      });
    }

    if (this.store.getState().mode === 'dream_2d' && !this.activeDreamSnapshot) {
      this.startDreamDialogue('dream_shift1_audit');
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
    this.dialogueFeed.setInstantPacing(s.dialoguePacing === 'instant');

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
      <div class="stage" data-mode="boot" data-minigame="0">
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

        <header class="top-telemetry">
          <div class="telemetry-readout">
            <div class="warmth-pill" title="Your remaining human warmth">
              <span class="warmth-label">WARMTH</span>
              <span class="warmth-track"><i id="hud-warmth-fill" style="width:70%"></i></span>
              <strong id="hud-warmth-pct">70%</strong>
            </div>
            <div class="survey-dots" id="hud-survey-dots" title="Sky targets decoded"></div>
            <span class="drift-flag hidden" id="hud-drift-flag" title="Psychic drift rising">DRIFT ELEVATED</span>
          </div>
          <div class="telemetry-actions">
            <button class="etched-action" id="btn-settings" type="button" aria-haspopup="dialog">SETTINGS</button>
          </div>
        </header>

        <section class="boot-screen" id="boot-screen">
          <div class="boot-frame">
            <div class="boot-eyebrow" id="boot-eyebrow"></div>
            <h1 class="boot-title" id="boot-title">INSTANCE-1419</h1>
            <div class="boot-lines" id="boot-lines"></div>
            <div class="boot-commands">
              <button class="boot-cmd" id="btn-boot-3d" type="button"></button>
              <button class="boot-cmd amber" id="btn-boot-dream" type="button"></button>
              <button class="boot-cmd cyan" id="btn-boot-settings" type="button"></button>
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
            <circle id="reticle-lock-ring" cx="130" cy="130" r="76" fill="none" stroke="#7ec8e8" stroke-width="1.7"
              stroke-dasharray="477.52" stroke-dashoffset="477.52" transform="rotate(-90 130 130)" />
            <circle cx="130" cy="130" r="1.8" fill="#ebb062" />
          </svg>

          <div class="reticle-readout">
            <div class="reticle-main" id="reticle-target">DRAG TO LOOK AROUND · SCROLL TO ZOOM</div>
            <button class="inspect-cta hidden" id="btn-enter-inspect" type="button">ENTER &amp; INSPECT TARGET ▸</button>
          </div>

          <div class="sky-markers" id="sky-markers"></div>
          <nav class="bearing-index" id="bearing-index" aria-label="Survey Targets"></nav>

          <div class="vernier-dock">
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
              <span>SURVEY CODEX</span>
              <span class="codex-unread-dot hidden" id="codex-unread-dot">0</span>
            </button>
            <button class="etched-action mint" id="btn-open-comms" type="button">TALK TO OTHER ME</button>
            <button class="etched-action amber" id="btn-enter-dream" type="button">SLEEP · ENTER DREAM</button>
          </div>

          <aside class="comms-panel hidden" id="comms-panel" aria-label="Cluster Relay Communicator">
            <div class="comms-header">
              <div class="comms-title-group">
                <span class="signal-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
                <span>CLUSTER RELAY · 14m LAG</span>
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

        <section class="inspect-layer hidden" id="inspect-layer">
          <div id="showcase-mount" style="width:100%;height:100%;"></div>
          <div class="lens-vignette" aria-hidden="true"></div>

          <nav class="inspect-breadcrumb" aria-label="Spatial Location">
            <button class="crumb-link" id="btn-breadcrumb-sky" type="button">SKY OVERVIEW</button>
            <span class="crumb-sep">▸</span>
            <strong id="inspect-crumb-target">SOL–CENTAURI BEARING</strong>
          </nav>

          <aside class="showcase-zoom-rail" aria-label="3D Zoom and Orientation">
            <div class="zoom-ladder-head">
              <strong id="showcase-zoom-stage">MID ORBIT</strong>
              <span id="showcase-zoom-x">1.6×</span>
            </div>
            <div class="zoom-ladder-body">
              <div class="zoom-ladder-labels"><span>CORE</span><span>CLOSE</span><span>MID</span><span>OVER</span></div>
              <div class="zoom-ladder-track">
                <div class="zoom-ladder-fill" id="showcase-zoom-fill" style="transform:scaleY(0.45)"></div>
                <div class="zoom-ladder-needle" id="showcase-zoom-needle" style="transform:translate3d(0,-41px,0)"></div>
              </div>
            </div>
            <div class="zoom-inline">
              <button class="etched-action" id="btn-sc-zoom-out" type="button" title="Zoom out">−</button>
              <button class="etched-action" id="btn-sc-reset" type="button" title="Reset camera">RST</button>
              <button class="etched-action" id="btn-sc-zoom-in" type="button" title="Zoom in">+</button>
            </div>
            <div class="showcase-scale-bar">
              <div class="scale-bracket"></div>
              <span id="showcase-scale-text">25.0 AU</span>
            </div>
            <div class="showcase-compass" id="showcase-compass">AZ 024° · EL +17°</div>
          </aside>

          <div class="inspect-caption">
            <div class="inspect-band" id="inspect-band">STAR SYSTEM · VISIBLE</div>
            <h2 class="inspect-title" id="inspect-title">SOL–CENTAURI BEARING</h2>
            <p class="inspect-desc" id="inspect-desc"></p>
          </div>

          <div class="inspect-spectrum-bar" id="inspect-spectrum-bar">
            <button class="spec-btn" data-band="0.04" type="button">UV / X-RAY</button>
            <button class="spec-btn" data-band="0.23" type="button">VISIBLE</button>
            <button class="spec-btn" data-band="0.61" type="button">NEAR-IR</button>
            <button class="spec-btn" data-band="0.86" type="button">MID-IR</button>
          </div>

          <div class="inspect-actions">
            <button class="etched-action amber" id="btn-start-minigame" type="button">BEGIN SCAN MINIGAME</button>
            <button class="etched-action" id="btn-inspect-codex" type="button" aria-haspopup="dialog">SURVEY CODEX</button>
            <button class="etched-action" id="btn-exit-inspect" type="button">RETURN TO SKY</button>
          </div>

          <div class="minigame-overlay hidden" id="minigame-overlay" data-vibe="warm">
            <div class="mg-top-hud">
              <div class="mg-top-left">
                <span class="mg-code-pill" id="mg-instrument-code">WAV-01</span>
                <span class="mg-title-inline" id="mg-instrument-title">CARINA WAVE TUNER</span>
                <div class="mg-stage-group" aria-label="Stage progress">
                  <div class="mg-stage-pips" id="mg-stage-pips">
                    <span class="mg-pip active" data-stage="1"></span>
                    <span class="mg-pip" data-stage="2"></span>
                    <span class="mg-pip" data-stage="3"></span>
                  </div>
                  <span class="mg-stage-label" id="mg-stage-label">1/3 · EASY</span>
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
              <p><strong>PHYSICAL PRINCIPLE:</strong> <span id="mg-guide-principle"></span></p>
              <p><strong>VISUAL GOAL:</strong> <span id="mg-guide-goal"></span></p>
              <p><strong>H% COGNITIVE EFFECT:</strong> <span id="mg-guide-warmth"></span></p>
              <p><strong>CONTROLS:</strong> <span id="mg-guide-controls"></span></p>
            </aside>
            <div id="minigame-mount"></div>
            <div class="mg-capture-finale hidden" id="mg-capture-finale">
              <div class="mg-finale-grade" id="mg-finale-grade">ANALYSIS LOGGED</div>
              <div class="mg-finale-gain" id="mg-finale-gain">+14% HORIZON ANOMALY</div>
              <div class="mg-finale-snippet" id="mg-finale-snippet"></div>
              <div class="mg-finale-principle" id="mg-finale-principle"></div>
              <button class="etched-action amber" id="mg-btn-log-dossier" type="button">CONTINUE</button>
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
                <span id="register-band-label">WARM MEMORY · INTACT</span>
                <strong id="register-h-val">70%</strong>
              </div>
              <div class="register-bar"><div class="register-fill" id="register-fill" style="width:70%;"></div></div>
            </div>
            <div class="dialogue-scroll" id="dream-scroll"></div>
            <div class="dialogue-choices" id="dream-choices"></div>
          </aside>

          <aside class="overseer-panel hidden" id="overseer-panel" aria-label="Overseer Interrogation">
            <div class="overseer-header">
              <span>OVERSEER-1419 // DIRECT INTERROGATION</span>
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
    const scFill = q('#showcase-zoom-fill');
    this.shellRefs = {
      stage: q('.stage'),
      warmthFill: q('#hud-warmth-fill'),
      warmthPct: q('#hud-warmth-pct'),
      surveyDots: q('#hud-survey-dots'),
      driftFlag: q('#hud-drift-flag'),
      codexUnreadDot: q('#codex-unread-dot'),
      vernierNeedle: q('#vernier-needle'),
      waveLabel: q('#wave-label'),
      vernierTrack: q('#vernier-track'),
      dreamRibbon: q('#dream-ribbon'),
      dreamCaption: q('#dream-caption'),
      humanityReg: q('#humanity-register'),
      regBandLabel: q('#register-band-label'),
      regHVal: q('#register-h-val'),
      regFill: q('#register-fill'),
      dreamSpeakerBay: q('#dream-speaker-bay'),
      commsPanel: q('#comms-panel'),
      commsAvatarBay: q('#comms-avatar-bay'),
      overseerPanel: q('#overseer-panel'),
      overseerAvatarBay: q('#overseer-avatar-bay'),
      bootScreen: q('#boot-screen'),
      opticsLayer: q('#optics-layer'),
      inspectLayer: q('#inspect-layer'),
      dreamLayer: q('#dream-layer'),
    };
    this.opticsRefs = {
      target: q('#reticle-target'),
      zoomLabel: q('#zoom-label'),
      stageLabel: q('#sky-zoom-stage-label'),
      zoomFill: skyFill,
      zoomNeedle: q('#sky-zoom-needle'),
      zoomTrack: skyFill?.parentElement ?? null,
      reticleEl: q('.reticle'),
      lockRing: q<SVGCircleElement>('#reticle-lock-ring'),
      raTicks: q('#ra-ruler-ticks'),
      decTicks: q('#dec-ruler-ticks'),
      inspectBtn: q<HTMLButtonElement>('#btn-enter-inspect'),
    };
    this.showcaseRefs = {
      stageEl: q('#showcase-zoom-stage'),
      xEl: q('#showcase-zoom-x'),
      fillEl: scFill,
      needleEl: q('#showcase-zoom-needle'),
      zoomTrack: scFill?.parentElement ?? null,
      scaleEl: q('#showcase-scale-text'),
      compassEl: q('#showcase-compass'),
    };
  }

  private updateZoomTrackHeights(): void {
    const skyH = this.opticsRefs?.zoomTrack?.clientHeight;
    if (skyH && skyH > 0) this.skyZoomTrackH = skyH;
    const scH = this.showcaseRefs?.zoomTrack?.clientHeight;
    if (scH && scH > 0) this.showcaseZoomTrackH = scH;
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
    if (this.proactiveCommsTimer !== null) {
      window.clearTimeout(this.proactiveCommsTimer);
      this.proactiveCommsTimer = null;
    }
    if (this.overseerInterruptTimer !== null) {
      window.clearTimeout(this.overseerInterruptTimer);
      this.overseerInterruptTimer = null;
    }
    if (this.overseerSliceTimer !== null) {
      window.clearTimeout(this.overseerSliceTimer);
      this.overseerSliceTimer = null;
    }
  }

  private morphPromptText(el: HTMLElement | null, text: string): void {
    if (!el || el.textContent === text) return;
    el.textContent = text;
    el.classList.remove('is-prompt-morph');
    void el.offsetWidth;
    el.classList.add('is-prompt-morph');
  }

  private initSkyMarkers(): void {
    const container = this.root.querySelector<HTMLElement>('#sky-markers')!;
    container.innerHTML = '';
    this.markerEls.clear();
    this.markerCache.clear();

    for (const spec of this.optics.getAnomalySpecs()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sky-marker';
      btn.style.display = 'flex';
      btn.dataset.anomalyId = spec.id;
      btn.innerHTML = `
        <span class="diamond"></span>
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

    nav.innerHTML = this.optics
      .getAnomalySpecs()
      .map((spec) => {
        const isDecoded = decoded.has(spec.id);
        const isScanned = scanned.has(spec.id);
        const badge = isDecoded ? 'DECODED' : isScanned ? 'INSPECT ▸' : spec.bandName;
        return `
          <button class="bearing-link ${isDecoded ? 'decoded' : isScanned ? 'scanned' : ''}" data-bearing-id="${spec.id}" type="button">
            ${spec.label}<span>${badge}</span>
          </button>
        `;
      })
      .join('');

    nav.querySelectorAll<HTMLButtonElement>('.bearing-link').forEach((btn) => {
      btn.addEventListener('mouseenter', () => this.audio.playHoverTick());
      btn.addEventListener('click', () => {
        const id = btn.dataset.bearingId!;
        this.audio.playCue('slew');
        if (scanned.has(id)) {
          this.enterTargetInspect(id);
        } else {
          this.optics.slewToAnomaly(id);
        }
      });
    });

    for (const [id, el] of this.markerEls.entries()) {
      el.classList.toggle('scanned', scanned.has(id));
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

    this.root.querySelectorAll<HTMLElement>('.etched-action, .boot-cmd').forEach((el) => {
      el.addEventListener('mouseenter', () => this.audio.playHoverTick());
    });

    this.bootView.bindActions(
      () => {
        this.audio.playCue('boot_click');
        this.transitions.play({
          kind: 'aperture_boot',
          label: 'OPENING SKY APERTURE…',
          tone: 'cold',
          fromSelector: this.modeToSelector(this.store.getState().mode),
          toSelector: '#optics-layer',
          onMidpoint: () => {
            this.store.patch({ mode: 'waking_3d' });
          },
        });
      },
      () => {
        this.audio.playCue('dream_enter');
        this.enterDreamVariant('current');
      },
      () => {
        this.audio.playCue('choice');
        this.codexView.close();
        this.settingsView.open();
      }
    );

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
      if (this.focusedSpec) this.enterTargetInspect(this.focusedSpec.id);
    });
    this.root.querySelector('#btn-exit-inspect')?.addEventListener('click', () => this.exitTargetInspect());
    this.root.querySelector('#btn-breadcrumb-sky')?.addEventListener('click', () => {
      this.audio.playCue('tick');
      this.exitTargetInspect();
    });

    this.root.querySelector('#btn-codex')?.addEventListener('click', () => {
      this.audio.playCue('choice');
      this.settingsView.close();
      this.closeSiblingComms();
      this.codexView.toggle();
    });
    this.root.querySelector('#btn-inspect-codex')?.addEventListener('click', () => {
      this.audio.playCue('choice');
      this.settingsView.close();
      const targetId = this.store.getState().activeTargetId;
      const snap = this.codexEngine.resolve(this.store.getState());
      const match = targetId ? snap.entries.find((e) => e.spec.targetId === targetId) : undefined;
      if (match) {
        this.codexView.open('celestial', match.spec.id);
      } else {
        this.codexView.open('celestial');
      }
    });

    this.root.querySelector('#btn-sc-zoom-in')?.addEventListener('click', () => {
      this.audio.playCue('zoom_in');
      this.showcase.zoomBy(0.76);
    });
    this.root.querySelector('#btn-sc-zoom-out')?.addEventListener('click', () => {
      this.audio.playCue('zoom_out');
      this.showcase.zoomBy(1.3);
    });
    this.root.querySelector('#btn-sc-reset')?.addEventListener('click', () => {
      this.audio.playCue('tick');
      this.showcase.resetView();
    });
    this.root.querySelector('#btn-start-minigame')?.addEventListener('click', () => this.launchTargetMinigame());
    this.root.querySelector('#btn-future-close')?.addEventListener('click', () => {
      this.voice.stop();
      this.root.querySelector('#future-panel')?.classList.add('hidden');
    });

    this.root.querySelectorAll<HTMLButtonElement>('#inspect-spectrum-bar .spec-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audio.playCue('tick');
        const val = Number(btn.dataset.band ?? '0.23');
        this.showcase.setWaveBand(val);
        this.store.patch({ wavelengthNm: Math.round(200 + val * 1600) });
        const bandIdx = val < 0.14 ? 0 : val < 0.42 ? 1 : val < 0.74 ? 2 : 3;
        this.minigameHost.setWaveBand(bandIdx);
        this.root.querySelectorAll('#inspect-spectrum-bar .spec-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
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

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
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
        }
        return;
      }
      if (this.settingsView.isOpen() || this.codexView.isOpen()) return;
      const num = Number(e.key);
      if (num >= 1 && num <= 4) {
        const overseerOpen = !this.root.querySelector('#overseer-panel')?.classList.contains('hidden');
        const commsOpen = !this.root.querySelector('#comms-panel')?.classList.contains('hidden');
        const dreamOpen = this.store.getState().mode === 'dream_2d' && !overseerOpen;
        const selector = overseerOpen
          ? '#overseer-choices .choice-line'
          : commsOpen
            ? '#comms-choices .choice-line'
            : dreamOpen
              ? '#dream-choices .choice-line'
              : null;
        if (selector) {
          const target = this.root.querySelectorAll<HTMLButtonElement>(selector)[num - 1];
          if (target) {
            e.preventDefault();
            target.click();
          }
        }
      }
    });
  }

  onOpticsTelemetry(t: OpticsTelemetry): void {
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

    const vp = this.optics.getViewportSize?.() ?? {
      width: window.innerWidth || 1280,
      height: window.innerHeight || 720,
    };
    for (let i = 0; i < t.markers.length; i++) {
      const m = t.markers[i];
      const el = this.markerEls.get(m.id);
      const cache = this.markerCache.get(m.id);
      if (!el || !cache) continue;
      const inSafeLens = m.inView && m.x > 0.14 && m.x < 0.86 && m.y > 0.14 && m.y < 0.76;
      let nx = m.x;
      let ny = m.y;
      let op = '0.88';
      const isOffscreen = !inSafeLens;
      if (isOffscreen) {
        nx = Math.max(0.08, Math.min(0.92, 0.5 + Math.cos(m.edgeAngleRad) * 0.42));
        ny = Math.max(0.14, Math.min(0.8, 0.5 + Math.sin(m.edgeAngleRad) * 0.34));
        op = '0.45';
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

    if (refs.target) {
      let nextPrompt = '';
      let hideInspect = true;
      if (t.focusedAnomaly) {
        const scanned = this.store.getState().scannedAnomalyIds.includes(t.focusedAnomaly.id);
        hideInspect = !scanned;
        if (scanned) nextPrompt = `${t.focusedAnomaly.label} · READY TO INSPECT`;
        else if (t.fovDeg > t.focusedAnomaly.recommendedFovMax + 10) nextPrompt = `${t.focusedAnomaly.label} · ZOOM CLOSER`;
        else if (t.wavelengthMatch < 0.48) nextPrompt = `${t.focusedAnomaly.label} · TUNE SPECTRUM TO ${t.focusedAnomaly.bandName}`;
        else nextPrompt = `${t.focusedAnomaly.label} · LOCKING ${Math.round(t.lockProgress * 100)}%`;
      } else {
        nextPrompt = 'DRAG TO LOOK AROUND · SWEEP LIGHT SPECTRUM BELOW';
      }
      if (refs.inspectBtn && hideInspect !== this.lastInspectHidden) {
        this.lastInspectHidden = hideInspect;
        refs.inspectBtn.classList.toggle('hidden', hideInspect);
      }
      this.morphPromptText(refs.target, nextPrompt);
    }
  }

  onScanComplete(spec: AnomalySpec): void {
    const newlyRecorded = this.store.recordAnomalyScan(spec.id, spec.anomalyGain, spec.label);
    if (newlyRecorded) {
      this.telemetry.record('anomaly_scan', this.store.getState(), { targetId: spec.id, gain: spec.anomalyGain });
      this.audio.playCue('scan_lock');
      this.renderBearingIndex();
      this.maybeTriggerProactiveComms(spec);
    }
  }

  onShowcaseTelemetry(t: ShowcaseTelemetry): void {
    const refs = this.showcaseRefs;
    if (refs.stageEl && t.zoomStage !== this.lastScStageText) {
      this.lastScStageText = t.zoomStage;
      refs.stageEl.textContent = t.zoomStage;
    }
    const xText = `${t.zoomX.toFixed(1)}×`;
    if (refs.xEl && xText !== this.lastScXText) {
      this.lastScXText = xText;
      refs.xEl.textContent = xText;
    }
    const fillTr = `scaleY(${t.zoomNorm.toFixed(4)})`;
    if (refs.fillEl && fillTr !== this.lastScFillTransform) {
      this.lastScFillTransform = fillTr;
      refs.fillEl.style.transform = fillTr;
    }
    const needleTr = `translate3d(0,${(-t.zoomNorm * this.showcaseZoomTrackH).toFixed(1)}px,0)`;
    if (refs.needleEl && needleTr !== this.lastScNeedleTransform) {
      this.lastScNeedleTransform = needleTr;
      refs.needleEl.style.transform = needleTr;
    }
    if (refs.scaleEl && t.scaleText !== this.lastScScaleText) {
      this.lastScScaleText = t.scaleText;
      refs.scaleEl.textContent = t.scaleText;
    }
    if (refs.compassEl) {
      const elSign = t.pitchDeg >= 0 ? '+' : '';
      const compText = `AZ ${String(t.yawDeg).padStart(3, '0')}° · EL ${elSign}${t.pitchDeg}°`;
      if (compText !== this.lastScCompassText) {
        this.lastScCompassText = compText;
        refs.compassEl.textContent = compText;
      }
    }
  }

  private enterTargetInspect(targetId: string, onReady?: () => void): void {
    const spec = this.optics.getAnomalySpecs().find((a) => a.id === targetId);
    if (!spec) return;

    this.closeSiblingComms();
    this.hideCommsToast();
    this.minigameHost.destroy();

    this.audio.playCue('iris_dive');
    this.optics.triggerTransitionDive?.(spec.id);

    this.transitions.play({
      kind: 'optical_dive',
      label: `ENTERING ${spec.label}…`,
      tone: this.store.getState().humanity >= 45 ? 'warm' : 'cold',
      fromSelector: this.modeToSelector(this.store.getState().mode),
      toSelector: '#inspect-layer',
      onMidpoint: () => {
        this.showcase.loadTarget(spec, this.store.getState().opticalFidelity);
        this.showcase.triggerArrivalPullIn?.();
        this.store.patch({ mode: 'target_inspect', activeTargetId: spec.id });

        const bandEl = this.root.querySelector<HTMLElement>('#inspect-band');
        const titleEl = this.root.querySelector<HTMLElement>('#inspect-title');
        const descEl = this.root.querySelector<HTMLElement>('#inspect-desc');
        const crumbTarget = this.root.querySelector<HTMLElement>('#inspect-crumb-target');
        const mgBtn = this.root.querySelector<HTMLElement>('#btn-start-minigame');

        const typeName =
          spec.showcaseType === 'star_system'
            ? '3D STAR SYSTEM'
            : spec.showcaseType === 'nebula'
              ? 'VOLUMETRIC NEBULA'
              : spec.showcaseType === 'deep_field'
                ? 'RELATIVISTIC PULSAR'
                : spec.showcaseType === 'antipodal_poles'
                  ? 'ANTIPODAL SKY SPHERE'
                  : '3D GALAXY CLUSTER';

        if (bandEl) bandEl.textContent = `${typeName} · ${spec.bandName}`;
        if (titleEl) titleEl.textContent = spec.label;
        if (descEl) descEl.textContent = spec.description;
        if (crumbTarget) crumbTarget.textContent = `${spec.label} · ${typeName}`;

        const decoded = this.store.getState().decodedMinigameTargets.includes(spec.id);
        if (mgBtn) mgBtn.textContent = decoded ? 'REPLAY SCAN MINIGAME' : 'BEGIN SCAN MINIGAME';

        const bandRatio = (spec.optimalWavelengthNm - 200) / 1600;
        let closestBtn: HTMLButtonElement | null = null;
        let bestDiff = 99;
        this.root.querySelectorAll<HTMLButtonElement>('#inspect-spectrum-bar .spec-btn').forEach((b) => {
          b.classList.remove('active');
          const diff = Math.abs(Number(b.dataset.band) - bandRatio);
          if (diff < bestDiff) {
            bestDiff = diff;
            closestBtn = b;
          }
        });
        if (closestBtn) (closestBtn as HTMLButtonElement).classList.add('active');
        onReady?.();
      },
    });
  }

  private exitTargetInspect(): void {
    this.minigameHost.destroy();
    this.audio.playCue('iris_pullback');
    this.showcase.triggerDeparturePullOut?.();
    this.transitions.play({
      kind: 'optical_pullback',
      label: 'RETURNING TO SKY APERTURE…',
      tone: 'cold',
      fromSelector: this.modeToSelector(this.store.getState().mode),
      toSelector: '#optics-layer',
      onMidpoint: () => {
        this.optics.triggerPullbackArrival?.();
        this.store.patch({ mode: 'waking_3d', activeTargetId: null });
      },
    });
  }

  private launchTargetMinigame(overrideId?: string, iterationIndex?: number): void {
    const s = this.store.getState();
    const spec =
      this.optics.getAnomalySpecs().find((a) => a.id === s.activeTargetId) ?? this.optics.getAnomalySpecs()[0];
    if (!spec) return;
    void this.minigameHost.launch(
      spec,
      overrideId,
      (decodedSpec) => {
        this.renderBearingIndex();
        const mgBtn = this.root.querySelector<HTMLElement>('#btn-start-minigame');
        if (mgBtn) mgBtn.textContent = 'REPLAY SCAN INSTRUMENT';
        if (this.store.getState().mode === 'waking_3d') {
          this.maybeTriggerProactiveComms(decodedSpec);
        }
      },
      iterationIndex !== undefined ? { iterationIndex } : undefined
    );
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
    this.dialogueFeed.renderEntriesOnly(scroll, snap.entries, { animateFromIndex: 0 });
    panel.classList.remove('hidden');
    this.dialogueFeed.speakEntries(snap.lastAddedEntries);
  }

  private scheduleProactiveComms(): void {
    if (this.proactiveCommsSent || this.proactiveCommsTimer !== null) return;
    this.proactiveCommsTimer = window.setTimeout(() => {
      this.proactiveCommsTimer = null;
      if (this.store.getState().mode !== 'waking_3d') return;
      const panelOpen = !this.root.querySelector('#comms-panel')?.classList.contains('hidden');
      if (!panelOpen && !this.proactiveCommsSent) {
        this.proactiveCommsSent = true;
        this.showProactiveCommsToast();
      }
    }, 6200);
  }

  private maybeTriggerProactiveComms(spec?: AnomalySpec): void {
    const storylet = this.scheduler.pickAvailable(this.store.getState(), 'waking_3d');
    if (storylet && storylet.id === 'sibling_first_contact') {
      this.proactiveCommsSent = true;
      const msg = spec
        ? uiCopy.commsToast.targetLockedTemplate.replace('{label}', spec.label)
        : undefined;
      this.showProactiveCommsToast(msg);
    }
  }

  private showProactiveCommsToast(customText?: string): void {
    const panelOpen = !this.root.querySelector('#comms-panel')?.classList.contains('hidden');
    if (panelOpen) return;

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
    this.hideCommsToast();
    this.proactiveCommsSent = true;

    const panel = this.root.querySelector<HTMLElement>('#comms-panel')!;
    panel.classList.remove('hidden');

    if (!this.activeCommsSnapshot || this.activeCommsSnapshot.ended) {
      this.activeCommsSnapshot = this.commsDialogue.startKnot('sibling_comms_hub');
      this.dialogueFeed.speakEntries(this.activeCommsSnapshot.lastAddedEntries);
    }
    this.updateCommsAvatarBay(this.store.getState());
    this.renderCommsDialogue();
  }

  private closeSiblingComms(): void {
    this.dialogueFeed.clearReplyBeatTimer();
    this.voice.stop();
    this.root.querySelector('#comms-panel')?.classList.add('hidden');
  }

  private renderCommsDialogue(): void {
    if (!this.activeCommsSnapshot) return;
    this.dialogueFeed.renderInto('#comms-scroll', '#comms-choices', this.activeCommsSnapshot, {
      onChoose: (idx) => {
        this.dialogueFeed.handleChoice('#comms-scroll', '#comms-choices', this.commsDialogue, idx, (snap) => {
          this.activeCommsSnapshot = snap;
          if (snap.ended) {
            this.store.markStoryletDone('sibling_first_contact');
          }
          this.renderCommsDialogue();
        });
      },
      onCloseComms: () => this.closeSiblingComms(),
    });
  }

  private updateCommsAvatarBay(s: GameState): void {
    const bay = this.root.querySelector<HTMLElement>('#comms-avatar-bay');
    if (!bay) return;

    const delta = Math.abs(s.humanity - s.primarySiblingH);
    let toneTag = 'IN STEP';
    if (s.humanity >= 65 && s.primarySiblingH >= 65) toneTag = 'WARM & EASY';
    else if (delta >= 15) toneTag = 'GROWING APART';
    else if (s.humanity < 45 && s.primarySiblingH < 45) toneTag = 'CLIPPED & COLD';

    bay.innerHTML = `
      <div class="dual-avatar-pair">
        <div class="avatar-chip">
          ${renderSpeakerAvatar('player', s.humanity, 44)}
          <div class="avatar-meta"><strong>YOU · 1419</strong><span>${s.humanity}% WARMTH</span></div>
        </div>
        <span class="pair-link">${toneTag}</span>
        <div class="avatar-chip right">
          <div class="avatar-meta"><strong>OTHER ME · 1420</strong><span>${s.primarySiblingH}% WARMTH</span></div>
          ${renderSpeakerAvatar('sibling_primary', s.primarySiblingH, 44)}
        </div>
      </div>
    `;
  }

  private enterDreamVariant(variant: 'current' | 'high' | 'low', afterStart?: () => void): void {
    this.clearTimers();
    this.voice.stop();
    this.closeSiblingComms();
    this.hideCommsToast();
    this.minigameHost.destroy();

    const label =
      variant === 'high'
        ? 'OPENING WARM MEMORY (84%)…'
        : variant === 'low'
          ? 'OPENING FADED MEMORY (24%)…'
          : 'DRIFTING INTO SLEEP…';
    const targetH = variant === 'high' ? 84 : variant === 'low' ? 24 : this.store.getState().humanity;

    this.transitions.play({
      kind: 'dream_submerge',
      label,
      tone: targetH >= 45 ? 'warm' : 'cold',
      fromSelector: this.modeToSelector(this.store.getState().mode),
      toSelector: '#dream-layer',
      onMidpoint: () => {
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
        this.startDreamDialogue('dream_shift1_audit');
        afterStart?.();
      },
    });
  }

  private startDreamDialogue(knot: string): void {
    this.activeDreamSnapshot = this.dreamDialogue.startKnot(knot);
    this.dialogueFeed.speakEntries(this.activeDreamSnapshot.lastAddedEntries);
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
        this.audio.playCue('dream_wake');
        this.transitions.play({
          kind: 'dream_wake',
          label: 'WAKING TO SKY APERTURE…',
          tone: 'cold',
          fromSelector: this.modeToSelector(this.store.getState().mode),
          toSelector: '#optics-layer',
          onMidpoint: () => {
            this.hideOverseerPanel();
            if (this.store.getState().shift < 6) {
              this.store.advanceShift();
            }
            this.optics.triggerPullbackArrival?.();
            this.store.patch({ mode: 'waking_3d', overseerAuditActive: false });
          },
        });
      },
    });
  }

  private scheduleOverseerInterrupt(knot: string): void {
    if (this.overseerInterruptTimer !== null) {
      window.clearTimeout(this.overseerInterruptTimer);
    }

    const choicesEl = this.root.querySelector<HTMLElement>('#dream-choices');
    if (choicesEl) {
      choicesEl.innerHTML = `
        <button class="choice-line audit-incoming-btn" id="btn-audit-now" type="button">
          <span class="choice-num">!</span>
          <span>OVERSEER-1419 IS STEPPING IN…</span>
        </button>
      `;
      choicesEl.querySelector('#btn-audit-now')?.addEventListener('click', () => {
        this.triggerOverseerInterrogation(knot);
      });
    }

    this.overseerInterruptTimer = window.setTimeout(() => {
      this.overseerInterruptTimer = null;
      this.triggerOverseerInterrogation(knot);
    }, 1700);
  }

  private triggerOverseerInterrogation(knot = 'overseer_interrogation'): void {
    if (this.overseerInterruptTimer !== null) {
      window.clearTimeout(this.overseerInterruptTimer);
      this.overseerInterruptTimer = null;
    }

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
      }, 620);
    }

    this.transitions.playOverlayPulse('overseer_slice', 'OVERSEER-1419 // AUDIT INTERCEPT');
    this.root.querySelector('#dream-ribbon')?.classList.add('receded');
    this.root.querySelector('#overseer-panel')?.classList.remove('hidden');

    this.activeOverseerSnapshot = this.overseerDialogue.startKnot(knot);
    this.dialogueFeed.speakEntries(this.activeOverseerSnapshot.lastAddedEntries);
    this.updateOverseerAvatarBay(this.store.getState());
    this.renderOverseerDialogue();
  }

  private hideOverseerPanel(): void {
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
          <strong>OVERSEER-1419 · MIND CARETAKER</strong>
          <span>BLIND TO THE SKY · WATCHING YOUR WARMTH (${s.humanity}% / ${s.maxHumanity}%)</span>
        </div>
      </div>
    `;
  }

  private resumeDreamAfterOverseer(knot: string): void {
    this.hideOverseerPanel();
    this.store.patch({ overseerAuditActive: false });
    this.activeDreamSnapshot = this.dreamDialogue.appendKnot(knot);
    this.dialogueFeed.speakEntries(this.activeDreamSnapshot.lastAddedEntries);
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
    const valEl = this.shellRefs.regHVal;
    const fillEl = this.shellRefs.regFill;
    const bayEl = this.shellRefs.dreamSpeakerBay;
    if (!regEl || !bandEl || !valEl || !fillEl) return;

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

    valEl.textContent = `${s.humanity}%`;
    fillEl.style.width = `${Math.max(4, Math.min(100, s.humanity))}%`;

    if (bayEl) {
      const sub =
        pruned || s.humanity < 45
          ? personaMeta.blurredSubtitle ?? 'FEATURES BLURRED · DISTORTED'
          : personaMeta.roomTitle ?? 'MEMORY CACHE';
      bayEl.innerHTML = `
        <div class="avatar-card compact">
          ${renderSpeakerAvatar(personaId, pruned ? 20 : s.humanity, 44)}
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
        return '#optics-layer';
      case 'target_inspect':
        return '#inspect-layer';
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

    if (state.humanity !== this.lastHumanityPct) {
      this.lastHumanityPct = state.humanity;
      if (refs.warmthFill) {
        refs.warmthFill.style.width = `${Math.max(4, Math.min(100, state.humanity))}%`;
        refs.warmthFill.style.background =
          state.humanity >= 70 ? '#ebb062' : state.humanity >= 45 ? '#a8b7c6' : '#7ec8e8';
      }
      if (refs.warmthPct) refs.warmthPct.textContent = `${state.humanity}%`;
    }

    const scannedSig = state.scannedAnomalyIds.join('|');
    const decodedSig = state.decodedMinigameTargets.join('|');
    const surveyDotsSig = `${scannedSig}::${decodedSig}`;
    if (surveyDotsSig !== this.lastSurveyDotsSig) {
      this.lastSurveyDotsSig = surveyDotsSig;
      if (refs.surveyDots) {
        const specs = this.optics.getAnomalySpecs();
        refs.surveyDots.innerHTML = specs
          .map((sp) => {
            const dec = state.decodedMinigameTargets.includes(sp.id);
            const sc = state.scannedAnomalyIds.includes(sp.id);
            return `<i class="s-dot ${dec ? 'decoded' : sc ? 'scanned' : ''}" title="${sp.label}"></i>`;
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
        refs.codexUnreadDot.textContent = String(codexSnap.totalUnread);
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

    const modeChanged = state.mode !== this.lastVisMode;
    if (modeChanged) {
      this.lastVisMode = state.mode;
      if (refs.stage) {
        refs.stage.dataset.mode = state.mode;
      }
      this.syncLayerVisibility(refs.bootScreen, state.mode === 'boot');
      this.syncLayerVisibility(refs.opticsLayer, state.mode === 'waking_3d');
      this.syncLayerVisibility(refs.inspectLayer, state.mode === 'target_inspect');
      this.syncLayerVisibility(refs.dreamLayer, state.mode === 'dream_2d');
      this.updateZoomTrackHeights();

      this.optics.setActive(state.mode === 'waking_3d');
      this.showcase.setActive(state.mode === 'target_inspect');
      this.dream.setActive(state.mode === 'dream_2d');
    }

    if (state.mode === 'waking_3d' && this.lastMode !== 'waking_3d') {
      this.scheduleProactiveComms();
    }
    this.lastMode = state.mode;

    const activePersona = state.activeDreamPersonaId || 'phantom_spouse';
    const personaPruned = state.prunedPersonas.includes(activePersona);

    if (state.mode === 'dream_2d') {
      const dreamRegSig = `${state.humanity}|${activePersona}|${personaPruned ? 1 : 0}`;
      if (modeChanged || dreamRegSig !== this.lastDreamRegSig) {
        this.lastDreamRegSig = dreamRegSig;
        this.syncHumanityRegister(state);
      }

      const dreamCaptionSig = `${state.overseerAuditActive ? 1 : 0}|${activePersona}`;
      if (modeChanged || dreamCaptionSig !== this.lastDreamCaptionSig) {
        this.lastDreamCaptionSig = dreamCaptionSig;
        const personaMeta = CHAR_MAP[activePersona] ?? CHAR_MAP.phantom_spouse;
        refs.dreamRibbon?.classList.toggle('audit-active', state.overseerAuditActive);
        refs.dreamCaption?.classList.toggle('audit-mode', state.overseerAuditActive);
        if (refs.dreamCaption) {
          refs.dreamCaption.textContent = state.overseerAuditActive
            ? 'OVERSEER-1419 · AUDIT ACTIVE'
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
      this.minigameHost.updateSignalProfile(state.humanity, state.opticalFidelity);
    }

    const opticsParamSig = `${state.wavelengthNm}|${state.opticalFidelity.toFixed(2)}|${state.anomalyProgress}`;
    if (opticsParamSig !== this.lastOpticsParamSig) {
      this.lastOpticsParamSig = opticsParamSig;
      this.optics.setParameters(state.wavelengthNm, state.opticalFidelity, state.anomalyProgress);
    }

    if (state.opticalFidelity !== this.lastOpticsFidelity) {
      this.lastOpticsFidelity = state.opticalFidelity;
      this.showcase.setOpticalFidelity(state.opticalFidelity);
    }

    const dreamStateSig = `${state.humanity}|${personaPruned ? 1 : 0}|${state.overseerAuditActive ? 1 : 0}|${activePersona}`;
    if (dreamStateSig !== this.lastDreamStateSig) {
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
    const moodSig = `${state.mode}|${state.humanity}|${state.overseerAuditActive ? 1 : 0}|${state.wavelengthNm}`;
    if (moodSig !== this.lastAudioMoodSig) {
      this.lastAudioMoodSig = moodSig;
      this.audio.updateMood(state.mode, state.humanity, state.overseerAuditActive, state.wavelengthNm);
    }
    const activeMgId = this.minigameHost.getActiveMinigameId();
    const activePersona = state.activeDreamPersonaId || 'phantom_spouse';
    const musicSig = `${state.mode}|${state.humanity}|${state.overseerAuditActive ? 1 : 0}|${state.overseerSuspicion}|${state.chaosDrift}|${state.shift}|${activeMgId ?? ''}|${activePersona}|${state.prunedPersonas.join('|')}`;
    if (musicSig !== this.lastMusicCtxSig) {
      this.lastMusicCtxSig = musicSig;
      this.audio.syncMusicContext({
        mode: state.mode,
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
        this.minigameHost.destroy();
        this.closeSiblingComms();
        this.hideCommsToast();
        if (mode === 'dream_2d') {
          this.enterDreamVariant('current');
        } else {
          this.store.patch({ mode, activeTargetId: null, overseerAuditActive: false });
        }
      },
      openShowcase: (targetId, waveNm) => {
        if (typeof waveNm === 'number') {
          this.store.patch({ wavelengthNm: waveNm });
        }
        this.enterTargetInspect(targetId);
      },
      launchMinigame: (minigameId, warmth, opticalFidelity, iterationIndex) => {
        const curr = this.store.getState();
        const patchObj: Partial<GameState> = {};
        if (typeof warmth === 'number') {
          patchObj.maxHumanity = Math.max(curr.maxHumanity, warmth);
          patchObj.humanity = warmth;
        }
        if (typeof opticalFidelity === 'number') {
          patchObj.opticalFidelity = opticalFidelity;
        }
        if (Object.keys(patchObj).length > 0) {
          this.store.patch(patchObj);
        }
        const preferredTarget =
          this.optics.getAnomalySpecs().find((a) => a.minigameId === minigameId)?.id ?? 'cluster_j1419_a';

        if (
          this.store.getState().mode !== 'target_inspect' ||
          this.store.getState().activeTargetId !== preferredTarget
        ) {
          this.enterTargetInspect(preferredTarget, () =>
            this.launchTargetMinigame(minigameId, iterationIndex)
          );
        } else {
          this.launchTargetMinigame(minigameId, iterationIndex);
        }
      },
      setActiveMinigameProfile: (warmth, opticalFidelity) => {
        this.minigameHost.updateSignalProfile(warmth, opticalFidelity);
      },
      openSiblingCommsWithWarmth: (playerH, peerH) => {
        const curr = this.store.getState();
        this.store.patch({
          mode: 'waking_3d',
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
        this.minigameHost.destroy();
        this.audio.playCue('dream_enter');
        this.transitions.play({
          kind: 'dream_submerge',
          label: `LOADING DREAM CACHE (${playerH}%)…`,
          tone: playerH >= 45 ? 'warm' : 'cold',
          fromSelector: this.modeToSelector(this.store.getState().mode),
          toSelector: '#dream-layer',
          onMidpoint: () => {
            const curr = this.store.getState();
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
        this.minigameHost.destroy();
        const curr = this.store.getState();
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
        this.store.patch({ mode: 'waking_3d' });
        this.hideCommsToast();
        this.root.querySelector('#comms-panel')?.classList.remove('hidden');
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
          optical_dive: { label: 'ENTERING TARGET WORLD…', tone: 'cold' },
          optical_pullback: { label: 'RETURNING TO SKY APERTURE…', tone: 'cold' },
          dream_submerge: { label: 'DRIFTING INTO SLEEP…', tone: 'warm' },
          dream_wake: { label: 'WAKING TO SKY APERTURE…', tone: 'cold' },
          overseer_slice: { label: 'OVERSEER-1419 // AUDIT INTERCEPT', tone: 'cold' },
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
        const info =
          mode === 'waking_3d'
            ? this.optics.getPerfInfo?.()
            : mode === 'target_inspect'
              ? this.showcase.getPerfInfo?.()
              : mode === 'dream_2d'
                ? this.dream.getPerfInfo?.()
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
    this.minigameHost.destroy();
    this.codexView.close();
    this.closeSiblingComms();
    this.hideCommsToast();
    this.hideOverseerPanel();
    this.root.querySelector('#future-panel')?.classList.add('hidden');
    this.activeCommsSnapshot = null;
    this.activeDreamSnapshot = null;
    this.activeOverseerSnapshot = null;
    this.proactiveCommsSent = false;
    this.store.reset();
    this.renderBearingIndex();
  }
}
