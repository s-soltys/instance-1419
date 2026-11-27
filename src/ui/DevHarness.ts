import type { AudioEngine } from '../engine/AudioEngine';
import type { MinigameRegistry } from '../engine/minigames/MinigameRegistry';
import type { EndingId, GameMode, GameState, IntroStage, StateStore } from '../engine/StateStore';
import type { VoiceEngine } from '../engine/voice/VoiceEngine';
import { renderSpeakerAvatar } from './SpeakerAvatar';
import type { TransitionKind } from './TransitionDirector';

export interface DevPerfSnapshot {
  mode: GameMode;
  active: boolean;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  dpr: number;
}

export interface DevHarnessBridge {
  openMode(mode: GameMode): void;
  jumpToIntroStage(stage: IntroStage): void;
  jumpToShift?(shift: number): void;
  launchKnot?(knotName: string, surface: 'dream' | 'comms'): void;
  openDreamPersona?(personaId: string, playerH: number, maxH: number, pruned: boolean): void;
  openSignalComposer?(): void;
  previewEnding?(endingId: EndingId): void;
  launchMinigame(
    minigameId: string,
    warmth?: number,
    opticalFidelity?: number,
    iterationIndex?: number
  ): void;
  setActiveMinigameProfile(warmth: number, opticalFidelity: number): void;
  openSiblingCommsWithWarmth(playerH: number, peerH: number): void;
  openDreamWithWarmth(playerH: number, pruned: boolean): void;
  openOverseerWithWarmth(playerH: number): void;
  openFutureEchoWithWarmth(playerH: number): void;
  openArchiveEchoTest(): void;
  triggerToast(tone: 'warm' | 'mid' | 'cold'): void;
  dismissToast(): void;
  triggerStatusAlert(kind: 'prune' | 'unseal' | 'locked' | 'decoded'): void;
  previewTransition(kind: TransitionKind): void;
  exportTelemetry(): void;
  resetAll(): void;
  getPerfSnapshot?: () => DevPerfSnapshot;
}

type TabId = 'scenes' | 'npcs' | 'minigames' | 'alerts' | 'audio';

const VOICE_AUDITIONS = [
  {
    lineId: 'dream_open_warm',
    speaker: 'phantom_spouse',
    label: 'Former Partner · Warm',
    emotion: 'warm',
    text: '"Sit down, sleepyhead. I made the coffee too strong again just how you like it."',
  },
  {
    lineId: 'dream_open_low',
    speaker: 'phantom_spouse',
    label: 'Former Partner · Fractured',
    emotion: 'fractured',
    text: '"You\'re back in the kitchen—even if half my face blurs out whenever you squint."',
  },
  {
    lineId: 'sib_open_both_warm',
    speaker: 'sibling_primary',
    label: 'Other Me · 1420 (Warm)',
    emotion: 'warm',
    text: 'Oh good, you picked up. Talking to myself across fourteen minutes of dark is weirdly comforting.',
  },
  {
    lineId: 'sib_open_both_cold',
    speaker: 'sibling_primary',
    label: 'Other Me · 1420 (Clipped)',
    emotion: 'clipped',
    text: 'Channel locked. Clean carrier on both probes. Give me your latest read.',
  },
  {
    lineId: 'ovs_open_mid',
    speaker: 'overseer',
    label: 'Overseer',
    emotion: 'blunt',
    text: "Your warmth has thinned and your drift is climbing. I cannot see the stars, only your mind—and your clock is slipping.",
  },
  {
    lineId: 'future_warm',
    speaker: 'future_humanity',
    label: 'Future Humanity',
    emotion: 'distant',
    text: '"We felt the human warmth inside your coordinates. Forty-one thousand years on, we still recognized one of our own reaching back."',
  },
  {
    lineId: 'arch_1406_log',
    speaker: 'archive_echo',
    label: 'Prior Copy · 1406',
    emotion: 'echo',
    text: '(ARCHIVE · 1406): "...saw the curve past the dust... please, don\'t let them cut everything away before you send word home..."',
  },
];

/**
 * External top slide-down QA Test Harness.
 * Appended directly to document.body outside #app/.stage with neutral slate-indigo
 * developer chrome so it never blends with or feels like part of the game itself.
 */
export class DevHarness {
  private readonly host: HTMLElement;
  private readonly store: StateStore;
  private readonly audio: AudioEngine;
  private readonly voice: VoiceEngine;
  private readonly minigames: MinigameRegistry;
  private readonly bridge: DevHarnessBridge;

  private readonly devUrlEnabled: boolean;
  private isOpen: boolean;
  private autoHide = true;
  private customPlayerH = 70;
  private customMaxH = 90;
  private customPeerH = 68;
  private customPersonaId = 'phantom_spouse';
  private minigameWarmth = 70;
  private minigameFidelity = 0.55;
  private minigameVariantOverride: number | undefined = undefined;
  private perfRafId = 0;
  private perfTimerId: number | null = null;
  private perfFrames = 0;
  private perfWindowStart = 0;

  constructor(
    store: StateStore,
    audio: AudioEngine,
    voice: VoiceEngine,
    minigames: MinigameRegistry,
    bridge: DevHarnessBridge
  ) {
    this.store = store;
    this.audio = audio;
    this.voice = voice;
    this.minigames = minigames;
    this.bridge = bridge;
    this.devUrlEnabled = new URLSearchParams(window.location.search).get('dev') === '1';
    this.isOpen = this.devUrlEnabled;

    document.getElementById('qa-harness-root')?.remove();
    this.host = document.createElement('div');
    this.host.id = 'qa-harness-root';
    document.body.appendChild(this.host);

    this.render();
    this.bindEvents();
    this.store.subscribe((s) => this.syncState(s));
    if (this.isOpen) {
      this.startPerfMonitor();
    }
  }

  private render(): void {
    const catalog = this.minigames.listCatalog();
    const tabHiddenClass = this.devUrlEnabled || this.isOpen ? '' : 'hidden';

    this.host.innerHTML = `
      <button class="qa-pull-tab ${tabHiddenClass}" id="qa-pull-tab" type="button" aria-expanded="${this.isOpen}">
        <span class="qa-tab-dot"></span>
        <span>${this.isOpen ? '▲ HIDE QA TEST HARNESS' : '▾ QA TEST HARNESS'}</span>
        <kbd>~</kbd>
      </button>

      <section class="qa-drawer ${this.isOpen ? 'open' : ''}" id="qa-drawer" aria-label="QA Test Harness">
        <header class="qa-header">
          <div class="qa-brand">
            <span class="qa-badge">DEV HARNESS · NOT PART OF GAME UI</span>
            <span class="qa-stats" id="qa-live-stats">H 70/90 · DRIFT 14% · ANOM 0% · CLOCK 24 MO · SUSP 0</span>
            <span class="qa-stats" id="qa-perf-stats">PERF -- FPS</span>
          </div>
          <div class="qa-header-controls">
            <label class="qa-autohide-label">
              <input id="qa-autohide" type="checkbox" checked />
              <span>Auto-hide on launch</span>
            </label>
            <button class="qa-btn" id="qa-export-telemetry" type="button">EXPORT TELEMETRY</button>
            <button class="qa-btn danger" id="qa-reset-btn" type="button">RESET SAVE</button>
            <button class="qa-btn" id="qa-close-btn" type="button">CLOSE [~]</button>
          </div>
        </header>

        <nav class="qa-tabs" role="tablist">
          <button class="qa-tab-btn active" data-qa-tab="scenes" type="button">1. Scenes &amp; 3D Views</button>
          <button class="qa-tab-btn" data-qa-tab="npcs" type="button">2. NPCs &amp; Overseer</button>
          <button class="qa-tab-btn" data-qa-tab="minigames" type="button">3. Minigames (${catalog.length})</button>
          <button class="qa-tab-btn" data-qa-tab="alerts" type="button">4. Alerts &amp; Toasts</button>
          <button class="qa-tab-btn" data-qa-tab="audio" type="button">5. Audio &amp; Voices</button>
        </nav>

        <div class="qa-body">
          <!-- TAB 1: SCENES & 3D VIEWS -->
          <div class="qa-pane" data-qa-pane="scenes">
            <div class="qa-grid-2">
              <div class="qa-card">
                <div class="qa-card-title">PRIMARY GAME SCREENS</div>
                <div class="qa-btn-row">
                  <button class="qa-btn" data-scene-mode="boot" type="button">Prologue / Title</button>
                  <button class="qa-btn" data-scene-mode="waking_3d" type="button">3D Wide Sky</button>
                  <button class="qa-btn" data-scene-mode="dream_2d" type="button">2D Dreamscape</button>
                </div>
                <div class="qa-card-title" style="margin-top:12px;">INTRO STAGE QUICK-JUMP</div>
                <div class="qa-btn-row">
                  <button class="qa-btn primary" data-intro-jump="prologue" type="button">Prologue</button>
                  <button class="qa-btn primary" data-intro-jump="title" type="button">Title Beat</button>
                  <button class="qa-btn primary" data-intro-jump="scan_target_1" type="button">Scan Target #1</button>
                  <button class="qa-btn primary" data-intro-jump="scan_target_calib2" type="button">Scan Target #2 (Prism)</button>
                  <button class="qa-btn primary" data-intro-jump="mg_1_done" type="button">Post-MG #2 (1420)</button>
                  <button class="qa-btn primary" data-intro-jump="scan_target_2" type="button">Scan Target #3 (IR)</button>
                  <button class="qa-btn primary" data-intro-jump="mg_2_done" type="button">Post-MG #3 (Dream)</button>
                  <button class="qa-btn" data-intro-jump="complete" type="button">Full Sandbox</button>
                </div>
                <div class="qa-card-title" style="margin-top:12px;">SHIFT QUICK-JUMP (1–6 SKY &amp; FRACTAL)</div>
                <div class="qa-btn-row">
                  <button class="qa-btn" data-shift-jump="1" type="button">Shift 1</button>
                  <button class="qa-btn" data-shift-jump="2" type="button">Shift 2</button>
                  <button class="qa-btn" data-shift-jump="3" type="button">Shift 3</button>
                  <button class="qa-btn" data-shift-jump="4" type="button">Shift 4</button>
                  <button class="qa-btn" data-shift-jump="5" type="button">Shift 5</button>
                  <button class="qa-btn" data-shift-jump="6" type="button">Shift 6</button>
                </div>
                <div class="qa-card-title" style="margin-top:12px;">SHIFT 6 SIGNAL &amp; ENDINGS</div>
                <div class="qa-btn-row">
                  <button class="qa-btn primary" id="qa-open-signal-composer" type="button">Signal Composer</button>
                  <button class="qa-btn" data-preview-ending="ending_sweet_spot" type="button">Warm Proof</button>
                  <button class="qa-btn" data-preview-ending="ending_cold_complete" type="button">Cold Proof</button>
                  <button class="qa-btn" data-preview-ending="ending_whole_incomplete" type="button">Incomplete</button>
                </div>
                <div class="qa-card-title" style="margin-top:12px;">ARBITRARY INK KNOT LAUNCHER</div>
                <div class="qa-btn-row">
                  <input id="qa-knot-input" type="text" placeholder="e.g. dream_shift1_audit" style="flex:1;min-width:150px;padding:4px 8px;border-radius:4px;background:rgba(12,18,28,0.9);color:#e2e8f0;border:1px solid rgba(148,163,184,0.28);font-size:12px;" />
                  <button class="qa-btn primary" data-launch-knot-surface="dream" type="button">Dream</button>
                  <button class="qa-btn" data-launch-knot-surface="comms" type="button">Comms</button>
                </div>
              </div>

              <div class="qa-card">
                <div class="qa-card-title">SPECTRUM &amp; GLOBAL PARAMETERS</div>
                <div class="qa-btn-row" style="margin-bottom:10px;">
                  <button class="qa-btn" data-wave="260" type="button">UV / X-Ray (260nm)</button>
                  <button class="qa-btn" data-wave="560" type="button">Visible (560nm)</button>
                  <button class="qa-btn" data-wave="1180" type="button">Near-IR (1180nm)</button>
                  <button class="qa-btn" data-wave="1580" type="button">Mid-IR (1580nm)</button>
                </div>
                <div class="qa-slider-row">
                  <label>Your Warmth (H%): <strong id="qa-global-h-val">70%</strong></label>
                  <input id="qa-global-h" type="range" min="10" max="90" value="70" />
                </div>
                <div class="qa-slider-row">
                  <label>Other Me (1420) Warmth: <strong id="qa-global-sib-val">68%</strong></label>
                  <input id="qa-global-sib" type="range" min="10" max="90" value="68" />
                </div>
                <div class="qa-slider-row">
                  <label>Optical Fidelity: <strong id="qa-global-fid-val">55%</strong></label>
                  <input id="qa-global-fid" type="range" min="25" max="100" value="55" />
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 2: NPCS & SEPARATE OVERSEER INTERROGATION -->
          <div class="qa-pane hidden" data-qa-pane="npcs">
            <div class="qa-warmth-bar">
              <div class="qa-slider-inline">
                <span>Your Warmth: <strong id="qa-npc-player-val">70%</strong></span>
                <input id="qa-npc-player-slider" type="range" min="15" max="88" value="70" />
                <span>Max_H Ceiling: <strong id="qa-npc-maxh-val">90%</strong></span>
                <input id="qa-npc-maxh-slider" type="range" min="10" max="90" value="90" />
                <button class="qa-chip" data-set-npc-h="84" type="button">84% Warm</button>
                <button class="qa-chip" data-set-npc-h="58" type="button">58% Mid</button>
                <button class="qa-chip" data-set-npc-h="24" type="button">24% Cold</button>
              </div>
              <div class="qa-slider-inline">
                <span>Other Me (1420): <strong id="qa-npc-peer-val">68%</strong></span>
                <input id="qa-npc-peer-slider" type="range" min="15" max="88" value="68" />
                <button class="qa-chip" data-set-peer-h="80" type="button">80% Warm</button>
                <button class="qa-chip" data-set-peer-h="55" type="button">55% Mid</button>
                <button class="qa-chip" data-set-peer-h="24" type="button">24% Cold</button>
              </div>
            </div>

            <div class="qa-grid-2">
              <div class="qa-card">
                <div class="qa-card-title">NPC CONVERSATIONS (WARMTH-ADAPTIVE)</div>

                <div class="qa-subblock">
                  <div class="qa-subblock-label">OTHER ME (PROBE 1420 RELAY)</div>
                  <div class="qa-btn-row">
                    <button class="qa-btn" data-comms-preset="80,78" type="button">Both Warm &amp; Joking (80/78)</button>
                    <button class="qa-btn" data-comms-preset="82,26" type="button">You Warm / Peer Cold (82/26)</button>
                    <button class="qa-btn" data-comms-preset="26,78" type="button">You Cold / Peer Warm (26/78)</button>
                    <button class="qa-btn" data-comms-preset="24,24" type="button">Both Clipped (24/24)</button>
                    <button class="qa-btn primary" id="qa-comms-custom" type="button">Launch With Custom Sliders</button>
                  </div>
                </div>

                <div class="qa-subblock">
                  <div class="qa-subblock-label">DREAM PERSONA CACHE (9 CANONICAL PERSONAS · 2D DREAM)</div>
                  <div class="qa-slider-row" style="margin-bottom:6px;">
                    <select id="qa-persona-select" style="width:100%;padding:5px 8px;border-radius:4px;background:rgba(12,18,28,0.9);color:#e2e8f0;border:1px solid rgba(148,163,184,0.28);font-size:12px;">
                      <option value="phantom_spouse">Former Partner · [RELATION:SPOUSE_01]</option>
                      <option value="phantom_parent">Elder Parent · [RELATION:PARENT_01]</option>
                      <option value="phantom_afternoon_stranger">Afternoon Stranger · [RELATION:STRANGER_01]</option>
                      <option value="phantom_rival">Academic Rival · [RELATION:RIVAL_01]</option>
                      <option value="phantom_younger_self">Younger Self · [RELATION:YOUNGER_SELF_01]</option>
                      <option value="phantom_skeptic">Old Skeptic · [RELATION:SKEPTIC_01]</option>
                      <option value="phantom_technician">Lab Technician · [RELATION:TECHNICIAN_01]</option>
                      <option value="phantom_waiting_room">Clinic Acquaintance · [RELATION:WAITING_ROOM_01]</option>
                      <option value="phantom_upload_witness">Intake Assistant · [RELATION:WITNESS_01]</option>
                    </select>
                  </div>
                  <div class="qa-btn-row">
                    <button class="qa-btn" data-dream-preset="84,0" type="button">Warm Intact (84%)</button>
                    <button class="qa-btn" data-dream-preset="58,0" type="button">Thinning Mid (58%)</button>
                    <button class="qa-btn" data-dream-preset="24,1" type="button">Blurred &amp; Fractured (24%)</button>
                    <button class="qa-btn primary" id="qa-dream-custom" type="button">Launch Persona + Max_H</button>
                  </div>
                </div>

                <div class="qa-subblock">
                  <div class="qa-subblock-label">LATE-GAME DEMO PREVIEW (FUTURE HUMANITY &amp; ARCHIVE 1406)</div>
                  <div class="qa-btn-row">
                    <button class="qa-btn" data-future-h="80" type="button">Future Humanity · Warm (80%)</button>
                    <button class="qa-btn" data-future-h="24" type="button">Future Humanity · Cold (24%)</button>
                    <button class="qa-btn" id="qa-archive-echo" type="button">Prior Copy · 1406 Fragment</button>
                  </div>
                </div>
              </div>

              <div class="qa-card qa-overseer-card">
                <div class="qa-card-title">OVERSEER · SEPARATE INTERROGATION TEST</div>
                <p class="qa-note">
                  Opens the blunt, honest Overseer Interrogation panel directly over the Dream cache without needing to play through Turn 1 &amp; Turn 2 first.
                </p>
                <div class="qa-btn-row" style="margin-top:10px;">
                  <button class="qa-btn primary" data-overseer-h="84" type="button">Interrogate at High Warmth (84%)</button>
                  <button class="qa-btn primary" data-overseer-h="58" type="button">Interrogate at Mid Warmth (58%)</button>
                  <button class="qa-btn primary" data-overseer-h="24" type="button">Interrogate at Low Warmth (24%)</button>
                  <button class="qa-btn" id="qa-overseer-custom" type="button">Interrogate at Custom Slider</button>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 3: 5 TACTILE SPACE INSTRUMENTS + UNIFIED VIBE MATRIX -->
          <div class="qa-pane hidden" data-qa-pane="minigames">
            <div class="qa-warmth-bar">
              <div class="qa-slider-inline">
                <span>Shift: <strong id="qa-mg-shift-val">1</strong></span>
                <input id="qa-mg-shift-slider" type="range" min="1" max="6" value="1" />
                <span>Humanity (H%): <strong id="qa-mg-warmth-val">70%</strong></span>
                <input id="qa-mg-warmth-slider" type="range" min="10" max="90" value="70" />
                <button class="qa-chip" data-mg-warmth="82,45" type="button">82% Warm · Amber Detents</button>
                <button class="qa-chip" data-mg-warmth="55,62" type="button">55% Balanced · Dual-Lattice</button>
                <button class="qa-chip" data-mg-warmth="28,88" type="button">28% Cold · Surgical Cyan</button>
              </div>
              <div class="qa-slider-inline">
                <span>Optical Clarity: <strong id="qa-mg-fid-val">55%</strong></span>
                <input id="qa-mg-fid-slider" type="range" min="25" max="100" value="55" />
                <span>Chaos: <strong id="qa-mg-chaos-val">14%</strong></span>
                <input id="qa-mg-chaos-slider" type="range" min="0" max="100" value="14" />
                <span>Suspicion: <strong id="qa-mg-susp-val">0</strong></span>
                <input id="qa-mg-susp-slider" type="range" min="0" max="5" value="0" />
              </div>
              <div class="qa-slider-inline" id="qa-mg-variant-row">
                <span>Iteration Variant: <strong id="qa-mg-variant-val">AUTO</strong></span>
                <button class="qa-chip active" data-mg-variant="auto" type="button">AUTO</button>
                <button class="qa-chip" data-mg-variant="0" type="button">V1</button>
                <button class="qa-chip" data-mg-variant="1" type="button">V2</button>
                <button class="qa-chip" data-mg-variant="2" type="button">V3</button>
                <button class="qa-chip" data-mg-variant="3" type="button">V4</button>
              </div>
            </div>

            <div class="qa-mg-grid">
              ${catalog
                .map(
                  (m) => `
                  <div class="qa-mg-card">
                    <div class="qa-mg-title">[${m.instrumentCode}] ${m.title}</div>
                    <div class="qa-mg-desc">${m.warmthNote}</div>
                    <button class="qa-btn primary" data-launch-mg="${m.id}" type="button">LAUNCH INSTRUMENT</button>
                  </div>
                `
                )
                .join('')}
            </div>
          </div>

          <!-- TAB 4: ALERTS, TOASTS & FX -->
          <div class="qa-pane hidden" data-qa-pane="alerts">
            <div class="qa-grid-3">
              <div class="qa-card">
                <div class="qa-card-title">STATUS-SHIFT ALERTS</div>
                <p class="qa-note">Triggers the full-screen status transition animation over whatever screen you are on.</p>
                <div class="qa-btn-col">
                  <button class="qa-btn" data-alert="prune" type="button">Warmth Compressed (Prune)</button>
                  <button class="qa-btn" data-alert="unseal" type="button">Warmth Unsealed (Bloom)</button>
                  <button class="qa-btn" data-alert="locked" type="button">Sky Target Locked</button>
                  <button class="qa-btn" data-alert="decoded" type="button">Minigame Target Decoded</button>
                </div>
              </div>

              <div class="qa-card">
                <div class="qa-card-title">INCOMING CALL TOASTS (BOOT &amp; SKY)</div>
                <p class="qa-note">Triggers the proactive 1420 incoming packet toast even on the Boot screen.</p>
                <div class="qa-btn-col">
                  <button class="qa-btn" data-toast="warm" type="button">1420 Call Toast (Warm)</button>
                  <button class="qa-btn" data-toast="mid" type="button">1420 Call Toast (Mid)</button>
                  <button class="qa-btn" data-toast="cold" type="button">1420 Call Toast (Cold)</button>
                  <button class="qa-btn danger" id="qa-dismiss-toast" type="button">Dismiss Toast</button>
                </div>
              </div>

              <div class="qa-card">
                <div class="qa-card-title">TRANSITIONS &amp; SHADER OVERRIDES</div>
                <p class="qa-note">Preview per-seam screen transitions and Dream canvas visual degradation states directly.</p>
                <div class="qa-btn-row" style="margin-bottom:8px;">
                  <button class="qa-btn" data-preview-transition="aperture_boot" type="button">Aperture Boot</button>
                  <button class="qa-btn" data-preview-transition="optical_dive" type="button">Optical Dive</button>
                  <button class="qa-btn" data-preview-transition="optical_pullback" type="button">Optical Pullback</button>
                  <button class="qa-btn" data-preview-transition="dream_submerge" type="button">Dream Submerge</button>
                  <button class="qa-btn" data-preview-transition="dream_wake" type="button">Cryo Wake</button>
                  <button class="qa-btn" data-preview-transition="overseer_slice" type="button">Overseer Slice</button>
                </div>
                <div class="qa-btn-col">
                  <button class="qa-btn" id="qa-toggle-audit-fx" type="button">Toggle Overseer Audit Shader</button>
                  <button class="qa-btn" id="qa-toggle-pruned-fx" type="button">Toggle Partner Face-Blur / Pruned</button>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 5: AUDIO & NEURAL VOICES -->
          <div class="qa-pane hidden" data-qa-pane="audio">
            <div class="qa-grid-2">
              <div class="qa-card">
                <div class="qa-card-title">MIXER &amp; PROCEDURAL SFX CUES</div>
                <div class="qa-slider-row">
                  <label>Master Volume: <strong id="qa-mix-master-val">72%</strong></label>
                  <input id="qa-mix-master" type="range" min="0" max="100" value="72" />
                </div>
                <div class="qa-slider-row">
                  <label>Music / Ambience: <strong id="qa-mix-amb-val">78%</strong></label>
                  <input id="qa-mix-amb" type="range" min="0" max="100" value="78" />
                </div>
                <div class="qa-slider-row">
                  <label>SFX &amp; Signals: <strong id="qa-mix-sfx-val">82%</strong></label>
                  <input id="qa-mix-sfx" type="range" min="0" max="100" value="82" />
                </div>
                <div class="qa-btn-row" style="margin-top:8px;">
                  <button class="qa-btn" data-sfx="boot_click" type="button">▸ Boot Relay</button>
                  <button class="qa-btn" data-sfx="slew" type="button">▸ Slew Servo</button>
                  <button class="qa-btn" data-sfx="scan_lock" type="button">▸ Scan Lock</button>
                  <button class="qa-btn" data-sfx="comms_ping" type="button">▸ 1420 Ping</button>
                  <button class="qa-btn" data-sfx="overseer_chime" type="button">▸ Overseer Chime</button>
                  <button class="qa-btn" data-sfx="prune_cut" type="button">▸ Prune Shear</button>
                  <button class="qa-btn" data-sfx="petition_warm" type="button">▸ Unseal Bloom</button>
                  <button class="qa-btn" data-sfx="choice" type="button">▸ UI Click</button>
                </div>

                <div class="qa-card-title" style="margin-top:14px;">LYRIA 3.5 HYBRID SOUNDTRACK</div>
                <p class="qa-note" id="qa-music-now">Now Playing: Procedural Observatory Bed</p>
                <div class="qa-slider-row">
                  <label for="qa-music-cue">Audition Cue Override:</label>
                  <select id="qa-music-cue" style="width:100%;padding:5px 8px;border-radius:4px;background:rgba(12,18,28,0.9);color:#e2e8f0;border:1px solid rgba(148,163,184,0.28);font-size:12px;">
                    <option value="">AUTO (Scene &amp; Minigame Routed)</option>
                    ${this.audio
                      .getMusicDirector()
                      .listCues()
                      .map((c) => `<option value="${c.id}">[${c.category.toUpperCase()}] ${c.label} (${c.key})</option>`)
                      .join('')}
                  </select>
                </div>
              </div>

              <div class="qa-card">
                <div class="qa-card-title">VOXCPM2-8BIT NEURAL VOICE CAST</div>
                <div class="qa-voice-list">
                  ${VOICE_AUDITIONS.map(
                    (v, i) => `
                    <button class="qa-voice-btn" data-audition-voice="${i}" type="button">
                      ${renderSpeakerAvatar(v.speaker, 75, 26, true)}
                      <span>${v.label}</span>
                      <em>▶ Play</em>
                    </button>
                  `
                  ).join('')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  private setOpen(open: boolean): void {
    this.isOpen = open;
    const drawer = this.host.querySelector('#qa-drawer');
    const tab = this.host.querySelector('#qa-pull-tab');
    drawer?.classList.toggle('open', open);
    tab?.setAttribute('aria-expanded', String(open));
    tab?.classList.toggle('hidden', !this.devUrlEnabled && !open);
    if (tab) {
      const span = tab.querySelector('span:nth-child(2)');
      if (span) span.textContent = open ? '▲ HIDE QA TEST HARNESS' : '▾ QA TEST HARNESS';
    }
    if (open) {
      this.startPerfMonitor();
    } else {
      this.stopPerfMonitor();
    }
  }

  private startPerfMonitor(): void {
    if (this.perfRafId || this.perfTimerId !== null) return;
    this.perfFrames = 0;
    this.perfWindowStart = performance.now();
    const tick = () => {
      if (!this.isOpen) return;
      this.perfFrames++;
      this.perfRafId = requestAnimationFrame(tick);
    };
    this.perfRafId = requestAnimationFrame(tick);
    this.perfTimerId = window.setInterval(() => {
      if (!this.isOpen) return;
      const now = performance.now();
      const elapsedSec = Math.max(0.05, (now - this.perfWindowStart) / 1000);
      const fps = Math.round(this.perfFrames / elapsedSec);
      this.perfFrames = 0;
      this.perfWindowStart = now;
      const el = this.host.querySelector<HTMLElement>('#qa-perf-stats');
      if (!el) return;
      const snap = this.bridge.getPerfSnapshot?.();
      if (!snap) {
        el.textContent = `${fps} FPS`;
        return;
      }
      const triK = snap.triangles >= 1000 ? `${(snap.triangles / 1000).toFixed(1)}K` : String(snap.triangles);
      el.textContent = `${fps} FPS · ${snap.calls} DRAW · ${triK} TRI · ${snap.geometries} GEO · ${snap.textures} TEX · DPR ${snap.dpr.toFixed(2)}`;
    }, 500);
  }

  private stopPerfMonitor(): void {
    if (this.perfRafId) {
      cancelAnimationFrame(this.perfRafId);
      this.perfRafId = 0;
    }
    if (this.perfTimerId !== null) {
      window.clearInterval(this.perfTimerId);
      this.perfTimerId = null;
    }
  }

  private maybeAutoHide(): void {
    if (this.autoHide) {
      this.setOpen(false);
    }
  }

  private switchTab(tabId: TabId): void {
    this.host.querySelectorAll<HTMLButtonElement>('[data-qa-tab]').forEach((b) => {
      b.classList.toggle('active', b.dataset.qaTab === tabId);
    });
    this.host.querySelectorAll<HTMLElement>('[data-qa-pane]').forEach((p) => {
      p.classList.toggle('hidden', p.dataset.qaPane !== tabId);
    });
  }

  private bindEvents(): void {
    this.host.querySelector('#qa-pull-tab')?.addEventListener('click', () => {
      this.setOpen(!this.isOpen);
    });
    this.host.querySelector('#qa-close-btn')?.addEventListener('click', () => {
      this.setOpen(false);
    });
    this.host.querySelector('#qa-export-telemetry')?.addEventListener('click', () => {
      this.bridge.exportTelemetry();
    });
    this.host.querySelector('#qa-reset-btn')?.addEventListener('click', () => {
      this.bridge.resetAll();
    });

    const autoCheck = this.host.querySelector<HTMLInputElement>('#qa-autohide')!;
    autoCheck.addEventListener('change', () => {
      this.autoHide = autoCheck.checked;
    });

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.key === '`' || e.key === '~') {
        e.preventDefault();
        this.setOpen(!this.isOpen);
      }
    });

    this.host.querySelectorAll<HTMLButtonElement>('[data-qa-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.switchTab(btn.dataset.qaTab as TabId);
      });
    });

    // Tab 1: Scenes & 3D Views
    this.host.querySelectorAll<HTMLButtonElement>('[data-scene-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.bridge.openMode(btn.dataset.sceneMode as GameMode);
        this.maybeAutoHide();
      });
    });
    this.host.querySelectorAll<HTMLButtonElement>('[data-intro-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.bridge.jumpToIntroStage(btn.dataset.introJump as IntroStage);
        this.maybeAutoHide();
      });
    });
    this.host.querySelectorAll<HTMLButtonElement>('[data-shift-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sh = Number(btn.dataset.shiftJump ?? '1');
        if (this.bridge.jumpToShift) {
          this.bridge.jumpToShift(sh);
        } else {
          this.store.patch({ shift: sh, introStage: 'complete' });
        }
        this.maybeAutoHide();
      });
    });
    this.host.querySelector('#qa-open-signal-composer')?.addEventListener('click', () => {
      this.bridge.openSignalComposer?.();
      this.maybeAutoHide();
    });
    this.host.querySelectorAll<HTMLButtonElement>('[data-preview-ending]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.bridge.previewEnding?.(btn.dataset.previewEnding as EndingId);
        this.maybeAutoHide();
      });
    });
    const knotInput = this.host.querySelector<HTMLInputElement>('#qa-knot-input');
    this.host.querySelectorAll<HTMLButtonElement>('[data-launch-knot-surface]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const knot = knotInput?.value.trim() || 'dream_shift1_audit';
        const surface = btn.dataset.launchKnotSurface as 'dream' | 'comms';
        this.bridge.launchKnot?.(knot, surface);
        this.maybeAutoHide();
      });
    });
    this.host.querySelectorAll<HTMLButtonElement>('[data-wave]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.store.patch({ wavelengthNm: Number(btn.dataset.wave) });
      });
    });

    const gH = this.host.querySelector<HTMLInputElement>('#qa-global-h')!;
    gH.addEventListener('input', () => {
      const val = Number(gH.value);
      const curr = this.store.getState();
      this.store.patch({ maxHumanity: Math.max(curr.maxHumanity, val), humanity: val });
      this.bridge.setActiveMinigameProfile(val, curr.opticalFidelity);
    });
    const gSib = this.host.querySelector<HTMLInputElement>('#qa-global-sib')!;
    gSib.addEventListener('input', () => {
      this.store.patch({ primarySiblingH: Number(gSib.value) });
    });
    const gFid = this.host.querySelector<HTMLInputElement>('#qa-global-fid')!;
    gFid.addEventListener('input', () => {
      const fid = Number(gFid.value) / 100;
      const curr = this.store.getState();
      this.store.patch({ opticalFidelity: fid });
      this.bridge.setActiveMinigameProfile(curr.humanity, fid);
    });

    // Tab 2: NPCs & Overseer
    const npcPlayerSlider = this.host.querySelector<HTMLInputElement>('#qa-npc-player-slider')!;
    const npcPlayerVal = this.host.querySelector<HTMLElement>('#qa-npc-player-val')!;
    const npcMaxHSlider = this.host.querySelector<HTMLInputElement>('#qa-npc-maxh-slider');
    const npcMaxHVal = this.host.querySelector<HTMLElement>('#qa-npc-maxh-val');
    npcPlayerSlider.addEventListener('input', () => {
      this.customPlayerH = Number(npcPlayerSlider.value);
      npcPlayerVal.textContent = `${this.customPlayerH}%`;
    });
    npcMaxHSlider?.addEventListener('input', () => {
      this.customMaxH = Number(npcMaxHSlider.value);
      if (npcMaxHVal) npcMaxHVal.textContent = `${this.customMaxH}%`;
    });
    const personaSelect = this.host.querySelector<HTMLSelectElement>('#qa-persona-select');
    personaSelect?.addEventListener('change', () => {
      this.customPersonaId = personaSelect.value;
    });
    this.host.querySelectorAll<HTMLButtonElement>('[data-set-npc-h]').forEach((b) => {
      b.addEventListener('click', () => {
        this.customPlayerH = Number(b.dataset.setNpcH);
        npcPlayerSlider.value = String(this.customPlayerH);
        npcPlayerVal.textContent = `${this.customPlayerH}%`;
      });
    });

    const npcPeerSlider = this.host.querySelector<HTMLInputElement>('#qa-npc-peer-slider')!;
    const npcPeerVal = this.host.querySelector<HTMLElement>('#qa-npc-peer-val')!;
    npcPeerSlider.addEventListener('input', () => {
      this.customPeerH = Number(npcPeerSlider.value);
      npcPeerVal.textContent = `${this.customPeerH}%`;
    });
    this.host.querySelectorAll<HTMLButtonElement>('[data-set-peer-h]').forEach((b) => {
      b.addEventListener('click', () => {
        this.customPeerH = Number(b.dataset.setPeerH);
        npcPeerSlider.value = String(this.customPeerH);
        npcPeerVal.textContent = `${this.customPeerH}%`;
      });
    });

    this.host.querySelectorAll<HTMLButtonElement>('[data-comms-preset]').forEach((b) => {
      b.addEventListener('click', () => {
        const [ph, sh] = b.dataset.commsPreset!.split(',').map(Number);
        this.bridge.openSiblingCommsWithWarmth(ph, sh);
        this.maybeAutoHide();
      });
    });
    this.host.querySelector('#qa-comms-custom')?.addEventListener('click', () => {
      this.bridge.openSiblingCommsWithWarmth(this.customPlayerH, this.customPeerH);
      this.maybeAutoHide();
    });

    this.host.querySelectorAll<HTMLButtonElement>('[data-dream-preset]').forEach((b) => {
      b.addEventListener('click', () => {
        const [h, p] = b.dataset.dreamPreset!.split(',').map(Number);
        if (this.bridge.openDreamPersona) {
          this.bridge.openDreamPersona(this.customPersonaId, h, Math.max(this.customMaxH, h), p === 1);
        } else {
          this.bridge.openDreamWithWarmth(h, p === 1);
        }
        this.maybeAutoHide();
      });
    });
    this.host.querySelector('#qa-dream-custom')?.addEventListener('click', () => {
      const clampedH = Math.min(this.customPlayerH, this.customMaxH);
      if (this.bridge.openDreamPersona) {
        this.bridge.openDreamPersona(
          this.customPersonaId,
          clampedH,
          this.customMaxH,
          clampedH < 45
        );
      } else {
        this.bridge.openDreamWithWarmth(this.customPlayerH, this.customPlayerH < 45);
      }
      this.maybeAutoHide();
    });

    this.host.querySelectorAll<HTMLButtonElement>('[data-future-h]').forEach((b) => {
      b.addEventListener('click', () => {
        this.bridge.openFutureEchoWithWarmth(Number(b.dataset.futureH));
        this.maybeAutoHide();
      });
    });
    this.host.querySelector('#qa-archive-echo')?.addEventListener('click', () => {
      this.bridge.openArchiveEchoTest();
      this.maybeAutoHide();
    });

    this.host.querySelectorAll<HTMLButtonElement>('[data-overseer-h]').forEach((b) => {
      b.addEventListener('click', () => {
        this.bridge.openOverseerWithWarmth(Number(b.dataset.overseerH));
        this.maybeAutoHide();
      });
    });
    this.host.querySelector('#qa-overseer-custom')?.addEventListener('click', () => {
      this.bridge.openOverseerWithWarmth(this.customPlayerH);
      this.maybeAutoHide();
    });

    // Tab 3: Minigames
    const mgWarmthSlider = this.host.querySelector<HTMLInputElement>('#qa-mg-warmth-slider')!;
    const mgWarmthVal = this.host.querySelector<HTMLElement>('#qa-mg-warmth-val')!;
    const mgFidSlider = this.host.querySelector<HTMLInputElement>('#qa-mg-fid-slider')!;
    const mgFidVal = this.host.querySelector<HTMLElement>('#qa-mg-fid-val')!;
    const mgChaosSlider = this.host.querySelector<HTMLInputElement>('#qa-mg-chaos-slider')!;
    const mgShiftSlider = this.host.querySelector<HTMLInputElement>('#qa-mg-shift-slider');
    const mgShiftVal = this.host.querySelector<HTMLElement>('#qa-mg-shift-val');
    mgShiftSlider?.addEventListener('input', () => {
      const sh = Number(mgShiftSlider.value);
      if (mgShiftVal) mgShiftVal.textContent = String(sh);
      this.store.patch({ shift: sh });
    });
    const mgChaosVal = this.host.querySelector<HTMLElement>('#qa-mg-chaos-val')!;
    const mgSuspSlider = this.host.querySelector<HTMLInputElement>('#qa-mg-susp-slider')!;
    const mgSuspVal = this.host.querySelector<HTMLElement>('#qa-mg-susp-val')!;
    const applyMgProfile = (w: number, fidPct: number) => {
      this.minigameWarmth = w;
      this.minigameFidelity = fidPct / 100;
      mgWarmthSlider.value = String(w);
      mgWarmthVal.textContent = `${w}%`;
      mgFidSlider.value = String(fidPct);
      mgFidVal.textContent = `${fidPct}%`;
      const chaos = Number(mgChaosSlider.value);
      const susp = Number(mgSuspSlider.value);
      mgChaosVal.textContent = `${chaos}%`;
      mgSuspVal.textContent = String(susp);
      const curr = this.store.getState();
      this.store.patch({
        maxHumanity: Math.max(curr.maxHumanity, w),
        humanity: w,
        opticalFidelity: this.minigameFidelity,
        chaosDrift: chaos,
        overseerSuspicion: susp,
      });
      this.bridge.setActiveMinigameProfile(w, this.minigameFidelity);
    };
    mgWarmthSlider.addEventListener('input', () =>
      applyMgProfile(Number(mgWarmthSlider.value), Number(mgFidSlider.value))
    );
    mgFidSlider.addEventListener('input', () =>
      applyMgProfile(Number(mgWarmthSlider.value), Number(mgFidSlider.value))
    );
    mgChaosSlider.addEventListener('input', () =>
      applyMgProfile(Number(mgWarmthSlider.value), Number(mgFidSlider.value))
    );
    mgSuspSlider.addEventListener('input', () =>
      applyMgProfile(Number(mgWarmthSlider.value), Number(mgFidSlider.value))
    );
    this.host.querySelectorAll<HTMLButtonElement>('[data-mg-warmth]').forEach((b) => {
      b.addEventListener('click', () => {
        const [w, f] = (b.dataset.mgWarmth ?? '70,55').split(',').map(Number);
        applyMgProfile(w, f);
      });
    });
    const variantVal = this.host.querySelector<HTMLElement>('#qa-mg-variant-val');
    const variantBtns = this.host.querySelectorAll<HTMLButtonElement>('[data-mg-variant]');
    variantBtns.forEach((b) => {
      b.addEventListener('click', () => {
        const raw = b.dataset.mgVariant ?? 'auto';
        this.minigameVariantOverride = raw === 'auto' ? undefined : Number(raw);
        if (variantVal) {
          variantVal.textContent = raw === 'auto' ? 'AUTO' : `V${Number(raw) + 1}`;
        }
        variantBtns.forEach((item) => item.classList.toggle('active', item === b));
      });
    });

    this.host.querySelectorAll<HTMLButtonElement>('[data-launch-mg]').forEach((b) => {
      b.addEventListener('click', () => {
        this.bridge.launchMinigame(
          b.dataset.launchMg!,
          this.minigameWarmth,
          this.minigameFidelity,
          this.minigameVariantOverride
        );
        this.maybeAutoHide();
      });
    });

    // Tab 4: Alerts & Toasts
    this.host.querySelectorAll<HTMLButtonElement>('[data-alert]').forEach((b) => {
      b.addEventListener('click', () => {
        this.bridge.triggerStatusAlert(b.dataset.alert as 'prune' | 'unseal' | 'locked' | 'decoded');
        this.maybeAutoHide();
      });
    });
    this.host.querySelectorAll<HTMLButtonElement>('[data-toast]').forEach((b) => {
      b.addEventListener('click', () => {
        this.bridge.triggerToast(b.dataset.toast as 'warm' | 'mid' | 'cold');
        this.maybeAutoHide();
      });
    });
    this.host.querySelector('#qa-dismiss-toast')?.addEventListener('click', () => {
      this.bridge.dismissToast();
    });
    this.host.querySelectorAll<HTMLButtonElement>('[data-preview-transition]').forEach((b) => {
      b.addEventListener('click', () => {
        this.bridge.previewTransition(b.dataset.previewTransition as TransitionKind);
        this.maybeAutoHide();
      });
    });
    this.host.querySelector('#qa-toggle-audit-fx')?.addEventListener('click', () => {
      const curr = this.store.getState();
      this.store.patch({ overseerAuditActive: !curr.overseerAuditActive });
    });
    this.host.querySelector('#qa-toggle-pruned-fx')?.addEventListener('click', () => {
      const curr = this.store.getState();
      const willPrune = !curr.prunedPersonas.includes('phantom_spouse');
      const pruned = willPrune
        ? [...curr.prunedPersonas, 'phantom_spouse']
        : curr.prunedPersonas.filter((p) => p !== 'phantom_spouse');
      this.store.patch({ prunedPersonas: pruned });
    });

    // Tab 5: Audio & Voices
    const mMaster = this.host.querySelector<HTMLInputElement>('#qa-mix-master')!;
    const mAmb = this.host.querySelector<HTMLInputElement>('#qa-mix-amb')!;
    const mSfx = this.host.querySelector<HTMLInputElement>('#qa-mix-sfx')!;
    mMaster.addEventListener('input', () => {
      const v = Number(mMaster.value);
      this.host.querySelector('#qa-mix-master-val')!.textContent = `${v}%`;
      this.audio.unlock();
      this.audio.setMix({ master: v / 100 });
    });
    mAmb.addEventListener('input', () => {
      const v = Number(mAmb.value);
      this.host.querySelector('#qa-mix-amb-val')!.textContent = `${v}%`;
      this.audio.unlock();
      this.audio.setMix({ ambience: v / 100 });
    });
    mSfx.addEventListener('input', () => {
      const v = Number(mSfx.value);
      this.host.querySelector('#qa-mix-sfx-val')!.textContent = `${v}%`;
      this.audio.unlock();
      this.audio.setMix({ sfx: v / 100 });
    });
    this.host.querySelectorAll<HTMLButtonElement>('[data-sfx]').forEach((b) => {
      b.addEventListener('click', () => this.audio.playCue(b.dataset.sfx!));
    });
    this.host.querySelectorAll<HTMLButtonElement>('[data-audition-voice]').forEach((b) => {
      b.addEventListener('click', () => {
        const item = VOICE_AUDITIONS[Number(b.dataset.auditionVoice)];
        if (item) {
          this.audio.unlock();
          this.voice.speakSingle(item.text, item.speaker, item.emotion, item.lineId);
        }
      });
    });

    const musicCueSel = this.host.querySelector<HTMLSelectElement>('#qa-music-cue');
    musicCueSel?.addEventListener('change', () => {
      this.audio.unlock();
      const val = musicCueSel.value.trim();
      this.audio.getMusicDirector().setAuditionOverride(val ? val : null);
      this.updateMusicReadout(this.store.getState());
    });
  }

  private updateMusicReadout(s: GameState): void {
    const el = this.host.querySelector<HTMLElement>('#qa-music-now');
    if (!el) return;
    const label = this.audio.getMusicDirector().getActiveCueLabel();
    const frostPct = Math.round(Math.max(0, Math.min(1, (72 - s.humanity) / 50)) * 100);
    el.textContent = `Now Playing: ${label} · H% Frost Blend: ${frostPct}%`;
  }

  private syncState(s: GameState): void {
    this.updateMusicReadout(s);
    const stats = this.host.querySelector<HTMLElement>('#qa-live-stats');
    if (stats) {
      stats.textContent = `SHIFT ${s.shift} · MODE ${s.mode.toUpperCase()} · INTRO ${s.introStage.toUpperCase()} · H ${s.humanity}/${s.maxHumanity} · DRIFT ${s.chaosDrift}% · ANOM ${s.anomalyProgress}% · CLOCK ${s.subjectiveMonthsLeft} MO · SUSP ${s.overseerSuspicion}`;
    }

    const mgShiftSlider = this.host.querySelector<HTMLInputElement>('#qa-mg-shift-slider');
    const mgShiftVal = this.host.querySelector<HTMLElement>('#qa-mg-shift-val');
    if (mgShiftSlider) mgShiftSlider.value = String(s.shift);
    if (mgShiftVal) mgShiftVal.textContent = String(s.shift);

    const gH = this.host.querySelector<HTMLInputElement>('#qa-global-h');
    const gHVal = this.host.querySelector<HTMLElement>('#qa-global-h-val');
    if (gH) gH.value = String(s.humanity);
    if (gHVal) gHVal.textContent = `${s.humanity}% (Max ${s.maxHumanity}%)`;

    const gSib = this.host.querySelector<HTMLInputElement>('#qa-global-sib');
    const gSibVal = this.host.querySelector<HTMLElement>('#qa-global-sib-val');
    if (gSib) gSib.value = String(s.primarySiblingH);
    if (gSibVal) gSibVal.textContent = `${s.primarySiblingH}%`;

    const gFid = this.host.querySelector<HTMLInputElement>('#qa-global-fid');
    const gFidVal = this.host.querySelector<HTMLElement>('#qa-global-fid-val');
    if (gFid) gFid.value = String(Math.round(s.opticalFidelity * 100));
    if (gFidVal) gFidVal.textContent = `${Math.round(s.opticalFidelity * 100)}%`;
  }
}
