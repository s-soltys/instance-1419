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
const MIN_WAVE = 400;
const MAX_WAVE = 1800;

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
  private markerEls = new Map<string, HTMLButtonElement>();

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
    this.initSkyMarkers();
    this.renderBearingIndex();
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
        <div class="film-grain" aria-hidden="true"></div>

        <!-- DIEGETIC TOP TELEMETRY (ZERO BOXED CHIPS) -->
        <header class="top-telemetry">
          <div class="telemetry-readout">
            <span class="metric m-h">H <strong id="hud-h">70/90</strong></span>
            <span class="telemetry-sep">·</span>
            <span class="metric m-chaos">DRIFT <strong id="hud-chaos">14%</strong></span>
            <span class="telemetry-sep">·</span>
            <span class="metric m-anom">ANOMALY <strong id="hud-anom">0%</strong></span>
            <span class="telemetry-sep">·</span>
            <span class="metric">CLOCK <strong id="hud-life">24 MO</strong></span>
          </div>
          <div class="telemetry-actions">
            <button class="etched-action" id="btn-mute" type="button">AUDIO ON</button>
            <button class="etched-action amber" id="btn-dev-toggle" type="button">DEV</button>
          </div>
        </header>

        <!-- STARK SENSOR-APERTURE COLD BOOT -->
        <section class="boot-screen" id="boot-screen">
          <div class="boot-frame">
            <div class="boot-eyebrow">SOL–CENTAURI DEEP SURVEY NETWORK · COLD BOOT</div>
            <h1 class="boot-title">INSTANCE-1419</h1>
            <div class="boot-lines" id="boot-lines"></div>
            <div class="boot-commands">
              <button class="boot-cmd" id="btn-boot-3d" type="button">01 — Open 3D Optical Aperture</button>
              <button class="boot-cmd amber" id="btn-boot-dream" type="button">02 — Enter 2D Dream Cache</button>
            </div>
          </div>
        </section>

        <!-- 3D DIEGETIC OBSERVATORY LAYER -->
        <section class="optics-layer hidden" id="optics-layer">
          <div id="optics-mount" style="width:100%;height:100%;"></div>
          <div class="lens-vignette" aria-hidden="true"></div>

          <!-- Live scrolling RA / DEC glass scales -->
          <div class="ra-ruler" aria-hidden="true"><div class="ra-ruler-ticks" id="ra-ruler-ticks"></div></div>
          <div class="dec-ruler" aria-hidden="true"><div class="dec-ruler-ticks" id="dec-ruler-ticks"></div></div>

          <!-- Etched curved optical vernier reticle -->
          <svg class="reticle" viewBox="0 0 260 260" aria-hidden="true">
            <!-- Outer curved vernier arcs -->
            <path d="M 52 52 A 110 110 0 0 1 208 52" fill="none" stroke="rgba(195,220,242,0.22)" stroke-width="0.9" />
            <path d="M 208 208 A 110 110 0 0 1 52 208" fill="none" stroke="rgba(195,220,242,0.22)" stroke-width="0.9" />
            <circle cx="130" cy="130" r="76" fill="none" stroke="rgba(195,220,242,0.16)" stroke-width="0.8" stroke-dasharray="2 6" />
            <circle id="reticle-lock-ring" cx="130" cy="130" r="76" fill="none" stroke="#7ec8e8" stroke-width="1.6"
              stroke-dasharray="477.52" stroke-dashoffset="477.52" transform="rotate(-90 130 130)" />
            <!-- Fine crosshair ticks -->
            <line x1="130" y1="30" x2="130" y2="54" stroke="rgba(220,236,248,0.45)" stroke-width="0.9" />
            <line x1="130" y1="206" x2="130" y2="230" stroke="rgba(220,236,248,0.45)" stroke-width="0.9" />
            <line x1="30" y1="130" x2="54" y2="130" stroke="rgba(220,236,248,0.45)" stroke-width="0.9" />
            <line x1="206" y1="130" x2="230" y2="130" stroke="rgba(220,236,248,0.45)" stroke-width="0.9" />
            <circle cx="130" cy="130" r="1.8" fill="#ebb062" />
          </svg>

          <div class="reticle-readout">
            <div id="reticle-coords">RA 008.0° · DEC +04.0° · 1.3×</div>
            <div class="reticle-sub" id="reticle-target">DRAG TO SLEW APERTURE · SCROLL OR PINCH TO ZOOM</div>
          </div>

          <!-- Projected in-world sky markers -->
          <div class="sky-markers" id="sky-markers"></div>

          <!-- Whisper-thin bare target index -->
          <nav class="bearing-index" id="bearing-index" aria-label="Survey Bearings"></nav>

          <!-- Custom Pointer-Draggable Diegetic Spectral Vernier (Zero HTML range input) -->
          <div class="vernier-dock">
            <div class="vernier-header">
              <span>SPECTRAL FILTER</span>
              <strong id="wave-label">580 nm · OPTICAL</strong>
            </div>
            <div class="vernier-track" id="vernier-track" role="slider" aria-label="Spectral Wavelength"
              aria-valuemin="400" aria-valuemax="1800" aria-valuenow="580" tabindex="0">
              <div class="vernier-spectrum"></div>
              <div class="vernier-ticks"></div>
              <div class="vernier-needle" id="vernier-needle" style="left:12.85%;"></div>
            </div>
            <div class="vernier-scale-labels">
              <span>400</span><span>700</span><span>1000</span><span>1340</span><span>1800 nm</span>
            </div>
          </div>

          <!-- Bottom-right bare optical commands -->
          <div class="optics-commands">
            <div class="zoom-inline">
              <button class="etched-action" id="btn-zoom-out" type="button">−</button>
              <span id="zoom-label">1.3×</span>
              <button class="etched-action" id="btn-zoom-in" type="button">+</button>
            </div>
            <button class="etched-action" id="btn-push-scan" type="button">PUSH DEEP SCAN (+CHAOS)</button>
            <button class="etched-action mint" id="btn-open-comms" type="button">CLUSTER COMMS · 14m</button>
            <button class="etched-action amber" id="btn-enter-dream" type="button">SLEEP · 2D DREAM</button>
          </div>

          <!-- Primary Sibling Comms Ink Ribbon -->
          <aside class="comms-drawer hidden" id="comms-drawer">
            <div class="comms-header">
              <span>LOCAL CLUSTER · 14m 08s LAG</span>
              <button class="etched-action" id="btn-comms-close" type="button">CLOSE</button>
            </div>
            <div class="dialogue-scroll" id="comms-scroll"></div>
            <div class="dialogue-choices" id="comms-choices"></div>
          </aside>
        </section>

        <!-- 2D FULL-BLEED OIL IMPASTO DREAMSCAPE -->
        <section class="dream-layer hidden" id="dream-layer">
          <div class="dream-visual-pane">
            <div id="dream-mount" style="width:100%;height:100%;"></div>
          </div>
          <div class="dream-caption" id="dream-caption">[RELATION:SPOUSE_01] · HUMANITY 70%</div>
          <aside class="dream-ribbon" id="dream-ribbon">
            <div class="audit-banner">OVERSEER-1419 · UNSCHEDULED PSYCHE STABILITY AUDIT</div>
            <div class="dialogue-scroll" id="dream-scroll"></div>
            <div class="dialogue-choices" id="dream-choices"></div>
          </aside>
        </section>

        <!-- ?dev=1 DIRECTOR OVERLAY -->
        <aside class="dev-panel ${this.devOpen ? '' : 'hidden'}" id="dev-panel">
          <div class="dev-title">
            <span>DIRECTOR (?dev=1)</span>
            <button class="etched-action" id="btn-dev-close" type="button">×</button>
          </div>
          <div class="dev-row">
            <span>MODE</span>
            <div class="dev-row-inline">
              <button class="etched-action" data-dev-mode="boot" type="button">BOOT</button>
              <button class="etched-action" data-dev-mode="waking_3d" type="button">3D SKY</button>
              <button class="etched-action amber" data-dev-mode="dream_2d" type="button">2D DREAM</button>
            </div>
          </div>
          <div class="dev-row">
            <label>HUMANITY: <strong id="dev-h-val">70%</strong></label>
            <input id="dev-h-slider" type="range" min="10" max="90" value="70" />
          </div>
          <div class="dev-row">
            <label>OPTICAL FIDELITY: <strong id="dev-fid-val">55%</strong></label>
            <input id="dev-fid-slider" type="range" min="25" max="100" value="55" />
          </div>
          <div class="dev-row-inline">
            <button class="etched-action" id="dev-toggle-audit" type="button">AUDIT</button>
            <button class="etched-action" id="dev-toggle-pruned" type="button">PRUNED</button>
            <button class="etched-action amber" id="dev-reset" type="button">RESET</button>
          </div>
        </aside>
      </div>
    `;

    const bootLines = this.root.querySelector<HTMLElement>('#boot-lines')!;
    bootLines.innerHTML = [
      'BIOLOGICAL TRANSFER ..... <span class="hl-warn">41,802 YEARS ELAPSED</span>',
      'PRIOR INSTANCES ......... <span class="hl-warn">1,417 DECOMMISSIONED</span>',
      'SURVEY POSITION ......... 10.0 LIGHT-YEARS ASTERN OF SOL–CENTAURI',
      'LOCAL CLUSTER SYNC ...... INSTANCE-1420 (14m 08s LIGHT-LAG)',
      'CONNECTOME COHERENCE .... 70% HUMANITY · ~24 SUBJECTIVE MONTHS',
      '<span class="hl-dim">PERSONAL NAME ARCHIVE ... COMPRESSED TO RELATIONAL TAGS [IRREVERSIBLE]</span>',
    ].join('\n');
  }

  private initSkyMarkers(): void {
    const container = this.root.querySelector<HTMLElement>('#sky-markers')!;
    container.innerHTML = '';
    this.markerEls.clear();

    for (const spec of this.optics.getAnomalySpecs()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sky-marker';
      btn.dataset.anomalyId = spec.id;
      btn.innerHTML = `
        <span class="diamond"></span>
        <span class="m-tag">${spec.label}<span class="m-nm">${spec.optimalWavelengthNm}nm</span></span>
      `;
      btn.addEventListener('click', () => {
        this.audio.playCue('tick');
        this.optics.slewToAnomaly(spec.id);
      });
      container.appendChild(btn);
      this.markerEls.set(spec.id, btn);
    }
  }

  private renderBearingIndex(): void {
    const nav = this.root.querySelector<HTMLElement>('#bearing-index')!;
    const scanned = new Set(this.store.getState().scannedAnomalyIds);
    nav.innerHTML = this.optics
      .getAnomalySpecs()
      .map(
        (s) => `
        <button class="bearing-link ${scanned.has(s.id) ? 'scanned' : ''}" data-bearing-id="${s.id}" type="button">
          ${s.label}<span>${scanned.has(s.id) ? 'LOCKED' : `${s.optimalWavelengthNm}nm`}</span>
        </button>
      `
      )
      .join('');

    nav.querySelectorAll<HTMLButtonElement>('.bearing-link').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audio.playCue('tick');
        this.optics.slewToAnomaly(btn.dataset.bearingId!);
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
      this.store.patch({ wavelengthNm: nm });
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

    // Accessible keyboard scrubbing + programmatic test hook
    track.addEventListener('keydown', (e) => {
      const curr = this.store.getState().wavelengthNm;
      if (e.key === 'ArrowRight') this.store.patch({ wavelengthNm: Math.min(MAX_WAVE, curr + 20) });
      if (e.key === 'ArrowLeft') this.store.patch({ wavelengthNm: Math.max(MIN_WAVE, curr - 20) });
    });
    track.addEventListener('set-wavelength', (e: Event) => {
      const nm = Number((e as CustomEvent<number>).detail);
      if (!Number.isNaN(nm)) {
        this.store.patch({ wavelengthNm: Math.max(MIN_WAVE, Math.min(MAX_WAVE, nm)) });
      }
    });
  }

  private bindUIEvents(): void {
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    this.bindVernierControl();

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
      muteBtn.textContent = next ? 'AUDIO OFF' : 'AUDIO ON';
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

    this.root.querySelector('#btn-zoom-in')?.addEventListener('click', () => {
      this.audio.playCue('tick');
      this.optics.zoomBy(0.72);
    });
    this.root.querySelector('#btn-zoom-out')?.addEventListener('click', () => {
      this.audio.playCue('tick');
      this.optics.zoomBy(1.38);
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

    this.root.querySelectorAll<HTMLButtonElement>('[data-dev-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.devMode as GameState['mode'];
        if (mode === 'dream_2d') this.enterDreamMode();
        else this.store.patch({ mode });
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
    const raTicks = this.root.querySelector<HTMLElement>('#ra-ruler-ticks');
    const decTicks = this.root.querySelector<HTMLElement>('#dec-ruler-ticks');

    // Scroll diegetic optical lens rulers in sync with 3D camera panning
    if (raTicks) raTicks.style.backgroundPositionX = `${(-t.raDeg * 6).toFixed(1)}px`;
    if (decTicks) decTicks.style.backgroundPositionY = `${(t.decDeg * 6).toFixed(1)}px`;

    // Update projected 3D sky markers (only show cleanly inside main central lens area)
    for (const m of t.markers) {
      const el = this.markerEls.get(m.id);
      if (!el) continue;
      const inSafeLens = m.inView && m.x > 0.14 && m.x < 0.86 && m.y > 0.14 && m.y < 0.76;
      if (!inSafeLens) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = 'flex';
      el.style.left = `${(m.x * 100).toFixed(2)}%`;
      el.style.top = `${(m.y * 100).toFixed(2)}%`;
      const distCenter = Math.hypot(m.x - 0.5, m.y - 0.5);
      el.style.opacity = distCenter < 0.09 ? '0.0' : '0.86';
    }

    if (coords) {
      const decSign = t.decDeg >= 0 ? '+' : '';
      coords.textContent = `RA ${t.raDeg.toFixed(1).padStart(5, '0')}° · DEC ${decSign}${t.decDeg.toFixed(1)}° · ${t.zoomX.toFixed(1)}×`;
    }
    if (zoomLabel) {
      zoomLabel.textContent = `${t.zoomX.toFixed(1)}×`;
    }
    if (lockRing) {
      const circ = 477.52;
      lockRing.setAttribute('stroke-dashoffset', String(circ * (1 - t.lockProgress)));
    }
    if (target) {
      if (t.focusedAnomaly) {
        const already = this.store.getState().scannedAnomalyIds.includes(t.focusedAnomaly.id);
        if (already) {
          target.textContent = `${t.focusedAnomaly.label} · ARCHIVED IN SURVEY BUFFER`;
        } else if (t.fovDeg > t.focusedAnomaly.recommendedFovMax + 10) {
          target.textContent = `${t.focusedAnomaly.label} · ZOOM IN TO RESOLVE`;
        } else if (t.wavelengthMatch < 0.52) {
          target.textContent = `${t.focusedAnomaly.label} · TUNE FILTER NEAR ${t.focusedAnomaly.optimalWavelengthNm} nm`;
        } else {
          target.textContent = `${t.focusedAnomaly.label} · INTEGRATING PHOTONS ${Math.round(t.lockProgress * 100)}%`;
        }
      } else {
        target.textContent = 'DRAG TO SLEW APERTURE · SCROLL OR PINCH TO ZOOM';
      }
    }
  }

  onScanComplete(spec: AnomalySpec): void {
    const newlyRecorded = this.store.recordAnomalyScan(spec.id, spec.anomalyGain);
    if (newlyRecorded) {
      this.audio.playCue('scan_lock');
      this.renderBearingIndex();
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
          (c, i) => `
          <button class="choice-line" data-choice-index="${c.index}" type="button">
            <span class="choice-num">${i + 1}.</span>
            <span>${c.text}</span>
          </button>
        `
        )
        .join('');
      choicesEl.querySelectorAll<HTMLButtonElement>('.choice-line').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.audio.playCue('tick');
          onChoose(Number(btn.dataset.choiceIndex));
        });
      });
    } else if (snap.knot === 'dream_shift1_audit') {
      choicesEl.innerHTML = `
        <button class="choice-line" id="btn-return-3d" type="button"><span class="choice-num">→</span><span>Wake and resume 3D survey shift</span></button>
        <button class="choice-line" id="btn-replay-dream" type="button"><span class="choice-num">↺</span><span>Replay dream sequence with current Humanity</span></button>
      `;
      choicesEl.querySelector('#btn-return-3d')?.addEventListener('click', () => {
        this.audio.playCue('boot_click');
        this.store.patch({ mode: 'waking_3d', overseerAuditActive: false });
      });
      choicesEl.querySelector('#btn-replay-dream')?.addEventListener('click', () => {
        this.enterDreamMode();
      });
    } else {
      choicesEl.innerHTML = `<button class="choice-line" id="btn-comms-done" type="button"><span class="choice-num">→</span><span>Close cluster link</span></button>`;
      choicesEl.querySelector('#btn-comms-done')?.addEventListener('click', () => {
        this.root.querySelector('#comms-drawer')?.classList.add('hidden');
      });
    }
  }

  private wavelengthBandName(nm: number): string {
    if (nm < 720) return 'OPTICAL';
    if (nm < 1150) return 'NEAR-IR I';
    if (nm < 1500) return 'NEAR-IR II';
    return 'MID-IR';
  }

  private syncStateToUI(state: GameState): void {
    this.root.querySelector('#hud-h')!.textContent = `${state.humanity}/${state.maxHumanity}`;
    this.root.querySelector('#hud-chaos')!.textContent = `${state.chaosDrift}%`;
    this.root.querySelector('#hud-anom')!.textContent = `${state.anomalyProgress}%`;
    this.root.querySelector('#hud-life')!.textContent = `${state.subjectiveMonthsLeft} MO`;

    // Update custom diegetic spectral vernier needle & readout
    const ratio = (state.wavelengthNm - MIN_WAVE) / (MAX_WAVE - MIN_WAVE);
    const needle = this.root.querySelector<HTMLElement>('#vernier-needle');
    const waveLabel = this.root.querySelector<HTMLElement>('#wave-label');
    const track = this.root.querySelector<HTMLElement>('#vernier-track');
    if (needle) needle.style.left = `${(ratio * 100).toFixed(2)}%`;
    if (waveLabel) {
      waveLabel.textContent = `${state.wavelengthNm} nm · ${this.wavelengthBandName(state.wavelengthNm)}`;
    }
    if (track) track.setAttribute('aria-valuenow', String(state.wavelengthNm));

    const devH = this.root.querySelector<HTMLInputElement>('#dev-h-slider');
    const devHVal = this.root.querySelector<HTMLElement>('#dev-h-val');
    if (devH) devH.value = String(state.humanity);
    if (devHVal) devHVal.textContent = `${state.humanity}% (Max ${state.maxHumanity}%)`;

    const devFid = this.root.querySelector<HTMLInputElement>('#dev-fid-slider');
    const devFidVal = this.root.querySelector<HTMLElement>('#dev-fid-val');
    if (devFid) devFid.value = String(Math.round(state.opticalFidelity * 100));
    if (devFidVal) devFidVal.textContent = `${Math.round(state.opticalFidelity * 100)}%`;

    this.root.querySelector('#boot-screen')?.classList.toggle('hidden', state.mode !== 'boot');
    this.root.querySelector('#optics-layer')?.classList.toggle('hidden', state.mode !== 'waking_3d');
    this.root.querySelector('#dream-layer')?.classList.toggle('hidden', state.mode !== 'dream_2d');

    const dreamRibbon = this.root.querySelector('#dream-ribbon');
    const caption = this.root.querySelector('#dream-caption');
    dreamRibbon?.classList.toggle('audit-active', state.overseerAuditActive);
    caption?.classList.toggle('audit-mode', state.overseerAuditActive);
    if (caption) {
      const prunedTag = state.prunedPersonas.includes('phantom_spouse') ? ' · PRUNED' : '';
      caption.textContent = state.overseerAuditActive
        ? `OVERSEER AUDIT ACTIVE · HUMANITY ${state.humanity}%`
        : `[RELATION:SPOUSE_01] · HUMANITY ${state.humanity}%${prunedTag}`;
    }

    this.optics.setParameters(state.wavelengthNm, state.opticalFidelity, state.anomalyProgress);
    this.optics.setActive(state.mode === 'waking_3d');

    this.dream.setState(
      state.humanity,
      state.prunedPersonas.includes('phantom_spouse'),
      state.overseerAuditActive
    );
    this.dream.setActive(state.mode === 'dream_2d');

    this.audio.updateMood(state.mode, state.humanity);
    this.renderBearingIndex();
  }
}
