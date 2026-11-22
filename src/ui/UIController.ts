import charactersData from '../content/characters.json';
import type { AudioEngine } from '../engine/AudioEngine';
import type { DialogueRunner, DialogueSnapshot } from '../engine/DialogueRunner';
import type { DreamCanvas } from '../engine/DreamCanvas';
import type { AnomalySpec, OpticsScene, OpticsTelemetry } from '../engine/OpticsScene';
import type { GameState, StateStore } from '../engine/StateStore';
import type { StoryletScheduler } from '../engine/StoryletScheduler';

interface CharacterInfo {
  displayName: string;
  role: string;
  accentColor: string;
}

const CHAR_MAP = charactersData.characters as Record<string, CharacterInfo>;

export class UIController {
  private readonly root: HTMLElement;
  private readonly store: StateStore;
  private readonly audio: AudioEngine;
  private readonly dialogue: DialogueRunner;
  private readonly scheduler: StoryletScheduler;
  private optics!: OpticsScene;
  private dream!: DreamCanvas;

  private activeCommsSnapshot: DialogueSnapshot | null = null;
  private activeDreamSnapshot: DialogueSnapshot | null = null;
  private devOpen: boolean;

  constructor(
    root: HTMLElement,
    store: StateStore,
    audio: AudioEngine,
    dialogue: DialogueRunner,
    scheduler: StoryletScheduler
  ) {
    this.root = root;
    this.store = store;
    this.audio = audio;
    this.dialogue = dialogue;
    this.scheduler = scheduler;
    this.devOpen = new URLSearchParams(window.location.search).get('dev') === '1';

    this.renderShell();
  }

  attachRenderers(optics: OpticsScene, dream: DreamCanvas): void {
    this.optics = optics;
    this.dream = dream;
    this.renderTargetButtons();
    this.bindUIEvents();
    this.store.subscribe((state) => this.syncStateToUI(state));
  }

  getOpticsMount(): HTMLElement {
    return this.root.querySelector<HTMLElement>('#optics-mount')!;
  }

  getDreamMount(): HTMLElement {
    return this.root.querySelector<HTMLElement>('#dream-mount')!;
  }

  private renderShell(): void {
    this.root.innerHTML = `
      <div class="stage">
        <!-- TOP PERSISTENT TELEMETRY HUD -->
        <header class="top-hud">
          <div class="hud-group">
            <div class="stat-chip humanity"><span class="label">HUMANITY</span><span class="val" id="hud-h">70% / 90%</span></div>
            <div class="stat-chip chaos"><span class="label">CHAOS</span><span class="val" id="hud-chaos">14%</span></div>
            <div class="stat-chip anomaly"><span class="label">ANOMALY</span><span class="val" id="hud-anom">0%</span></div>
            <div class="stat-chip"><span class="label">LIFESPAN</span><span class="val" id="hud-life">24m</span></div>
          </div>
          <div class="hud-group">
            <button class="btn btn-compact" id="btn-mute" type="button">AUDIO: ON</button>
            <button class="btn btn-compact btn-amber" id="btn-dev-toggle" type="button">DEV</button>
          </div>
        </header>

        <!-- BOOT LOG HARD CUT -->
        <section class="boot-screen" id="boot-screen">
          <div class="boot-box">
            <div class="boot-lines" id="boot-lines"></div>
            <div class="boot-actions">
              <button class="btn" id="btn-boot-3d" type="button">INITIALIZE 3D OPTICAL SURVEY</button>
              <button class="btn btn-amber" id="btn-boot-dream" type="button">ENTER 2D DREAM DEFRAG</button>
            </div>
          </div>
        </section>

        <!-- 3D WAKING OPTICS LAYER -->
        <section class="optics-layer hidden" id="optics-layer">
          <div id="optics-mount" style="width:100%;height:100%;"></div>

          <svg class="reticle" viewBox="0 0 160 160" aria-hidden="true">
            <circle cx="80" cy="80" r="62" fill="none" stroke="rgba(165,205,235,0.22)" stroke-width="1" />
            <circle id="reticle-lock-ring" cx="80" cy="80" r="62" fill="none" stroke="#72c8e8" stroke-width="2.2"
              stroke-dasharray="389.56" stroke-dashoffset="389.56" transform="rotate(-90 80 80)" />
            <line x1="80" y1="6" x2="80" y2="24" stroke="rgba(215,234,248,0.65)" stroke-width="1" />
            <line x1="80" y1="136" x2="80" y2="154" stroke="rgba(215,234,248,0.65)" stroke-width="1" />
            <line x1="6" y1="80" x2="24" y2="80" stroke="rgba(215,234,248,0.65)" stroke-width="1" />
            <line x1="136" y1="80" x2="154" y2="80" stroke="rgba(215,234,248,0.65)" stroke-width="1" />
            <circle cx="80" cy="80" r="2.2" fill="#ebb062" />
          </svg>
          <div class="reticle-readout">
            <div id="reticle-coords">RA 008.0° · DEC +04.0° · 1.2×</div>
            <div class="reticle-sub" id="reticle-target">DRAG TO SCAN SKY · SCROLL OR PINCH TO ZOOM</div>
          </div>

          <aside class="target-strip" id="target-strip"></aside>

          <!-- PRIMARY SIBLING COMMS DRAWER -->
          <aside class="comms-drawer hidden" id="comms-drawer">
            <div class="comms-header">
              <span>LOCAL CLUSTER LINK · 14m LAG</span>
              <button class="btn btn-compact" id="btn-comms-close" type="button">CLOSE</button>
            </div>
            <div style="display:flex;flex-direction:column;flex:1;padding:12px;overflow:hidden;">
              <div class="dialogue-scroll" id="comms-scroll"></div>
              <div class="dialogue-choices" id="comms-choices"></div>
            </div>
          </aside>

          <!-- BOTTOM OPTICS CONTROLS -->
          <div class="optics-controls">
            <div class="control-deck">
              <button class="btn btn-compact" id="btn-zoom-out" type="button">ZOOM −</button>
              <span style="font-family:var(--font-mono);font-size:11px;min-width:44px;text-align:center;" id="zoom-label">1.2×</span>
              <button class="btn btn-compact" id="btn-zoom-in" type="button">ZOOM +</button>
            </div>

            <div class="control-deck wave-deck">
              <label for="wave-slider">BAND <strong id="wave-label">580 nm</strong></label>
              <input class="wave-slider" id="wave-slider" type="range" min="400" max="1800" step="10" value="580" />
            </div>

            <div class="control-deck" style="gap:8px;">
              <button class="btn btn-compact" id="btn-push-scan" type="button" title="Push deeper scan (+Anomaly, +Chaos)">DEEP SCAN (+CHAOS)</button>
              <button class="btn btn-compact" id="btn-open-comms" type="button">SIBLING COMMS</button>
              <button class="btn btn-compact btn-amber" id="btn-enter-dream" type="button">2D DREAM DEFRAG</button>
            </div>
          </div>
        </section>

        <!-- 2D PAINTERLY DREAM LAYER -->
        <section class="dream-layer hidden" id="dream-layer">
          <div class="dream-visual-pane">
            <div id="dream-mount" style="width:100%;height:100%;"></div>
            <div class="dream-plaque" id="dream-plaque">[RELATION:SPOUSE_01] · H 70%</div>
          </div>
          <div class="dream-dialogue-pane" id="dream-dialogue-pane">
            <div class="audit-banner">OVERSEER-1419 // UNSCHEDULED PSYCHE STABILITY AUDIT</div>
            <div class="dialogue-scroll" id="dream-scroll"></div>
            <div class="dialogue-choices" id="dream-choices"></div>
          </div>
        </section>

        <!-- ?dev=1 DIRECTOR OVERLAY -->
        <aside class="dev-panel ${this.devOpen ? '' : 'hidden'}" id="dev-panel">
          <div class="dev-title">
            <span>DIRECTOR OVERLAY (?dev=1)</span>
            <button class="btn btn-compact" id="btn-dev-close" type="button">×</button>
          </div>
          <div class="dev-row">
            <span>MODE JUMP</span>
            <div class="dev-row-inline">
              <button class="btn btn-compact" data-dev-mode="boot" type="button">BOOT</button>
              <button class="btn btn-compact" data-dev-mode="waking_3d" type="button">3D SKY</button>
              <button class="btn btn-compact" data-dev-mode="dream_2d" type="button">2D DREAM</button>
            </div>
          </div>
          <div class="dev-row">
            <label>HUMANITY (H%): <strong id="dev-h-val">70%</strong></label>
            <input id="dev-h-slider" type="range" min="10" max="90" value="70" />
          </div>
          <div class="dev-row">
            <label>OPTICAL FIDELITY: <strong id="dev-fid-val">55%</strong></label>
            <input id="dev-fid-slider" type="range" min="25" max="100" value="55" />
          </div>
          <div class="dev-row-inline">
            <button class="btn btn-compact" id="dev-toggle-audit" type="button">TOGGLE AUDIT</button>
            <button class="btn btn-compact" id="dev-toggle-pruned" type="button">TOGGLE PRUNED</button>
            <button class="btn btn-compact" id="dev-reset" type="button">RESET RUN</button>
          </div>
        </aside>
      </div>
    `;

    const bootLines = this.root.querySelector<HTMLElement>('#boot-lines')!;
    bootLines.innerHTML = [
      '<span class="hl-dim">SOL-CENTAURI DEEP SURVEY NETWORK // COLD BOOT SEQUENCE</span>',
      'CONNECTOME ID ......... <strong>INSTANCE-1419</strong>',
      'BIOLOGICAL TRANSFER ... <span class="hl-warn">41,802 YEARS ELAPSED</span>',
      'PRIOR INSTANCES ....... <span class="hl-warn">1,417 DECOMMISSIONED</span>',
      'PROBE POSITION ........ <strong>10.0 LIGHT-YEARS ASTERN OF SOL–CENTAURI</strong>',
      'LOCAL CLUSTER SYNC .... INSTANCE-1420 (14m 08s LIGHT-LAG)',
      'CONNECTOME INTEGRITY .. 70% HUMANITY // ~24 SUBJECTIVE MONTHS REMAINING',
      '<span class="hl-dim">NAME ARCHIVE STATUS ... COMPRESSED TO RELATIONAL TAGS [IRREVERSIBLE]</span>',
    ].join('\n');
  }

  private renderTargetButtons(): void {
    const strip = this.root.querySelector<HTMLElement>('#target-strip')!;
    const specs = this.optics.getAnomalySpecs();
    const scanned = new Set(this.store.getState().scannedAnomalyIds);

    strip.innerHTML = specs
      .map(
        (s) => `
        <button class="target-btn ${scanned.has(s.id) ? 'scanned' : ''}" data-anomaly-id="${s.id}" type="button">
          <div class="t-name">
            <span>${s.label}</span>
            <span>${scanned.has(s.id) ? 'LOCKED' : `${s.optimalWavelengthNm}nm`}</span>
          </div>
          <div class="t-meta">${s.subtitle}</div>
        </button>
      `
      )
      .join('');

    strip.querySelectorAll<HTMLButtonElement>('.target-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audio.playCue('tick');
        const id = btn.dataset.anomalyId!;
        this.optics.slewToAnomaly(id);
      });
    });
  }

  private bindUIEvents(): void {
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    this.root.querySelector('#btn-boot-3d')?.addEventListener('click', () => {
      this.audio.playCue('boot_click');
      this.store.patch({ mode: 'waking_3d' });
    });

    this.root.querySelector('#btn-boot-dream')?.addEventListener('click', () => {
      this.enterDreamMode();
    });

    const muteBtn = this.root.querySelector<HTMLButtonElement>('#btn-mute')!;
    muteBtn.addEventListener('click', () => {
      const next = !this.audio.isMuted();
      this.audio.setMuted(next);
      muteBtn.textContent = next ? 'AUDIO: OFF' : 'AUDIO: ON';
    });

    const devPanel = this.root.querySelector<HTMLElement>('#dev-panel')!;
    this.root.querySelector('#btn-dev-toggle')?.addEventListener('click', () => {
      this.devOpen = !this.devOpen;
      devPanel.classList.toggle('hidden', !this.devOpen);
    });
    this.root.querySelector('#btn-dev-close')?.addEventListener('click', () => {
      this.devOpen = false;
      devPanel.classList.add('hidden');
    });

    // Optics controls
    this.root.querySelector('#btn-zoom-in')?.addEventListener('click', () => {
      this.audio.playCue('tick');
      this.optics.zoomBy(0.72);
    });
    this.root.querySelector('#btn-zoom-out')?.addEventListener('click', () => {
      this.audio.playCue('tick');
      this.optics.zoomBy(1.38);
    });

    const waveSlider = this.root.querySelector<HTMLInputElement>('#wave-slider')!;
    waveSlider.addEventListener('input', () => {
      this.store.patch({ wavelengthNm: Number(waveSlider.value) });
    });

    this.root.querySelector('#btn-push-scan')?.addEventListener('click', () => {
      this.audio.playCue('scan_lock');
      this.store.pushDeeperScan();
      this.maybeTriggerSiblingComms();
    });

    this.root.querySelector('#btn-open-comms')?.addEventListener('click', () => {
      this.openSiblingComms();
    });

    this.root.querySelector('#btn-comms-close')?.addEventListener('click', () => {
      this.root.querySelector('#comms-drawer')?.classList.add('hidden');
    });

    this.root.querySelector('#btn-enter-dream')?.addEventListener('click', () => {
      this.enterDreamMode();
    });

    // Dev overlay controls
    this.root.querySelectorAll<HTMLButtonElement>('[data-dev-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.devMode as GameState['mode'];
        if (mode === 'dream_2d') {
          this.enterDreamMode();
        } else {
          this.store.patch({ mode });
        }
      });
    });

    const devH = this.root.querySelector<HTMLInputElement>('#dev-h-slider')!;
    devH.addEventListener('input', () => {
      const val = Number(devH.value);
      const curr = this.store.getState();
      this.store.patch({
        maxHumanity: Math.max(curr.maxHumanity, val),
        humanity: val,
      });
    });

    const devFid = this.root.querySelector<HTMLInputElement>('#dev-fid-slider')!;
    devFid.addEventListener('input', () => {
      this.store.patch({ opticalFidelity: Number(devFid.value) / 100 });
    });

    this.root.querySelector('#dev-toggle-audit')?.addEventListener('click', () => {
      const curr = this.store.getState();
      const next = !curr.overseerAuditActive;
      if (next) this.audio.playCue('overseer_chime');
      this.store.patch({ overseerAuditActive: next });
    });

    this.root.querySelector('#dev-toggle-pruned')?.addEventListener('click', () => {
      const curr = this.store.getState();
      const pruned = curr.prunedPersonas.includes('phantom_spouse')
        ? curr.prunedPersonas.filter((p) => p !== 'phantom_spouse')
        : [...curr.prunedPersonas, 'phantom_spouse'];
      this.store.patch({ prunedPersonas: pruned });
    });

    this.root.querySelector('#dev-reset')?.addEventListener('click', () => {
      this.activeCommsSnapshot = null;
      this.activeDreamSnapshot = null;
      this.store.reset();
    });
  }

  onOpticsTelemetry(t: OpticsTelemetry): void {
    const coords = this.root.querySelector<HTMLElement>('#reticle-coords');
    const target = this.root.querySelector<HTMLElement>('#reticle-target');
    const zoomLabel = this.root.querySelector<HTMLElement>('#zoom-label');
    const lockRing = this.root.querySelector<SVGCircleElement>('#reticle-lock-ring');

    if (coords) {
      const decSign = t.decDeg >= 0 ? '+' : '';
      coords.textContent = `RA ${t.raDeg.toFixed(1).padStart(5, '0')}° · DEC ${decSign}${t.decDeg.toFixed(1)}° · ${t.zoomX.toFixed(1)}×`;
    }
    if (zoomLabel) {
      zoomLabel.textContent = `${t.zoomX.toFixed(1)}×`;
    }
    if (lockRing) {
      const circ = 389.56;
      lockRing.setAttribute('stroke-dashoffset', String(circ * (1 - t.lockProgress)));
    }
    if (target) {
      if (t.focusedAnomaly) {
        const already = this.store.getState().scannedAnomalyIds.includes(t.focusedAnomaly.id);
        if (already) {
          target.textContent = `${t.focusedAnomaly.label} · LOGGED TO SURVEY BUFFER`;
        } else if (t.fovDeg > t.focusedAnomaly.recommendedFovMax + 8) {
          target.textContent = `${t.focusedAnomaly.label} · ZOOM IN FURTHER TO RESOLVE`;
        } else if (t.wavelengthMatch < 0.55) {
          target.textContent = `${t.focusedAnomaly.label} · TUNE SPECTRAL BAND NEAR ${t.focusedAnomaly.optimalWavelengthNm}nm`;
        } else {
          target.textContent = `${t.focusedAnomaly.label} · LOCKING OPTICAL SIGNAL ${Math.round(t.lockProgress * 100)}%`;
        }
      } else {
        target.textContent = 'DRAG TO SCAN SKY · SCROLL OR PINCH TO ZOOM';
      }
    }
  }

  onScanComplete(spec: AnomalySpec): void {
    const newlyRecorded = this.store.recordAnomalyScan(spec.id, spec.anomalyGain);
    if (newlyRecorded) {
      this.audio.playCue('scan_lock');
      this.renderTargetButtons();
      this.maybeTriggerSiblingComms();
    }
  }

  private maybeTriggerSiblingComms(): void {
    const storylet = this.scheduler.pickAvailable(this.store.getState(), 'waking_3d');
    if (storylet && storylet.id === 'sibling_first_contact') {
      this.openSiblingComms();
    }
  }

  private openSiblingComms(): void {
    const drawer = this.root.querySelector<HTMLElement>('#comms-drawer')!;
    drawer.classList.remove('hidden');
    if (!this.activeCommsSnapshot || this.activeCommsSnapshot.ended) {
      this.activeCommsSnapshot = this.dialogue.startKnot('sibling_first_contact');
    }
    this.renderDialogueInto('#comms-scroll', '#comms-choices', this.activeCommsSnapshot, (idx) => {
      this.activeCommsSnapshot = this.dialogue.choose(idx);
      if (this.activeCommsSnapshot.ended) {
        this.store.markStoryletDone('sibling_first_contact');
      }
      this.renderDialogueInto('#comms-scroll', '#comms-choices', this.activeCommsSnapshot, () => {});
    });
  }

  private enterDreamMode(): void {
    this.store.patch({ mode: 'dream_2d' });
    this.activeDreamSnapshot = this.dialogue.startKnot('dream_shift1_audit');
    this.renderDreamDialogue();
  }

  private renderDreamDialogue(): void {
    if (!this.activeDreamSnapshot) return;
    this.renderDialogueInto('#dream-scroll', '#dream-choices', this.activeDreamSnapshot, (idx) => {
      this.activeDreamSnapshot = this.dialogue.choose(idx);
      this.renderDreamDialogue();
    });
  }

  private renderDialogueInto(
    scrollSel: string,
    choicesSel: string,
    snap: DialogueSnapshot,
    onChoose: (idx: number) => void
  ): void {
    const scrollEl = this.root.querySelector<HTMLElement>(scrollSel)!;
    const choicesEl = this.root.querySelector<HTMLElement>(choicesSel)!;

    scrollEl.innerHTML = snap.entries
      .map((entry) => {
        const ch = CHAR_MAP[entry.speaker] ?? CHAR_MAP.narrator;
        return `
          <div class="dialogue-entry role-${ch.role}" style="border-left-color:${ch.accentColor};">
            <div class="dialogue-speaker" style="color:${ch.accentColor};">${ch.displayName}</div>
            <div class="dialogue-text">${entry.text}</div>
          </div>
        `;
      })
      .join('');
    scrollEl.scrollTop = scrollEl.scrollHeight;

    if (snap.choices.length > 0) {
      choicesEl.innerHTML = snap.choices
        .map(
          (c) =>
            `<button class="choice-btn" data-choice-index="${c.index}" type="button">${c.text}</button>`
        )
        .join('');
      choicesEl.querySelectorAll<HTMLButtonElement>('.choice-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.audio.playCue('tick');
          onChoose(Number(btn.dataset.choiceIndex));
        });
      });
    } else if (snap.knot === 'dream_shift1_audit') {
      choicesEl.innerHTML = `
        <button class="btn" id="btn-return-3d" type="button">RESUME 3D SURVEY SHIFT</button>
        <button class="btn btn-amber" id="btn-replay-dream" type="button">REPLAY DREAM WITH CURRENT H%</button>
      `;
      choicesEl.querySelector('#btn-return-3d')?.addEventListener('click', () => {
        this.audio.playCue('boot_click');
        this.store.patch({ mode: 'waking_3d', overseerAuditActive: false });
      });
      choicesEl.querySelector('#btn-replay-dream')?.addEventListener('click', () => {
        this.enterDreamMode();
      });
    } else {
      choicesEl.innerHTML = `<button class="btn btn-compact" id="btn-comms-done" type="button">ACKNOWLEDGE PACKET</button>`;
      choicesEl.querySelector('#btn-comms-done')?.addEventListener('click', () => {
        this.root.querySelector('#comms-drawer')?.classList.add('hidden');
      });
    }
  }

  private syncStateToUI(state: GameState): void {
    this.root.querySelector('#hud-h')!.textContent = `${state.humanity}% / ${state.maxHumanity}%`;
    this.root.querySelector('#hud-chaos')!.textContent = `${state.chaosDrift}%`;
    this.root.querySelector('#hud-anom')!.textContent = `${state.anomalyProgress}%`;
    this.root.querySelector('#hud-life')!.textContent = `${state.subjectiveMonthsLeft}m`;

    const waveSlider = this.root.querySelector<HTMLInputElement>('#wave-slider');
    const waveLabel = this.root.querySelector<HTMLElement>('#wave-label');
    if (waveSlider) waveSlider.value = String(state.wavelengthNm);
    if (waveLabel) waveLabel.textContent = `${state.wavelengthNm} nm`;

    const devH = this.root.querySelector<HTMLInputElement>('#dev-h-slider');
    const devHVal = this.root.querySelector<HTMLElement>('#dev-h-val');
    if (devH) devH.value = String(state.humanity);
    if (devHVal) devHVal.textContent = `${state.humanity}% (Max ${state.maxHumanity}%)`;

    const devFid = this.root.querySelector<HTMLInputElement>('#dev-fid-slider');
    const devFidVal = this.root.querySelector<HTMLElement>('#dev-fid-val');
    if (devFid) devFid.value = String(Math.round(state.opticalFidelity * 100));
    if (devFidVal) devFidVal.textContent = `${Math.round(state.opticalFidelity * 100)}%`;

    // Visibility toggles
    this.root.querySelector('#boot-screen')?.classList.toggle('hidden', state.mode !== 'boot');
    this.root.querySelector('#optics-layer')?.classList.toggle('hidden', state.mode !== 'waking_3d');
    this.root.querySelector('#dream-layer')?.classList.toggle('hidden', state.mode !== 'dream_2d');

    const dreamPane = this.root.querySelector('#dream-dialogue-pane');
    const plaque = this.root.querySelector('#dream-plaque');
    dreamPane?.classList.toggle('audit-active', state.overseerAuditActive);
    plaque?.classList.toggle('audit-mode', state.overseerAuditActive);
    if (plaque) {
      const prunedTag = state.prunedPersonas.includes('phantom_spouse') ? ' · PRUNED' : '';
      plaque.textContent = state.overseerAuditActive
        ? `OVERSEER AUDIT ACTIVE · H ${state.humanity}%`
        : `[RELATION:SPOUSE_01] · H ${state.humanity}%${prunedTag}`;
    }

    // Sync engines
    this.optics.setParameters(state.wavelengthNm, state.opticalFidelity, state.anomalyProgress);
    this.optics.setActive(state.mode === 'waking_3d');

    this.dream.setState(
      state.humanity,
      state.prunedPersonas.includes('phantom_spouse'),
      state.overseerAuditActive
    );
    this.dream.setActive(state.mode === 'dream_2d');

    this.audio.updateMood(state.mode, state.humanity);
    this.renderTargetButtons();
  }
}
