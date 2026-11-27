import manifestJson from '../../../assets/MANIFEST.json';
import uiCopy from '../../content/ui_copy.json';
import type { AudioEngine } from '../../engine/AudioEngine';
import type { DialoguePacingSetting, SettingsStore, UserSettings } from '../../engine/SettingsStore';

type SettingsTabId = 'audio' | 'display' | 'credits';

interface ManifestAsset {
  path: string;
  license: string;
  attribution: string;
  internal_prototype_only?: boolean;
  notes?: string;
}

export interface SettingsViewCallbacks {
  onRestartRun: () => void;
  onExportTelemetry: () => void;
}

/**
 * Diegetic Zeiss-glass Settings modal.
 * Uses custom pointer-draggable + keyboard-accessible optical vernier sliders
 * (zero native browser range inputs) and auto-renders commercial credits
 * from assets/MANIFEST.json.
 */
export class SettingsView {
  private readonly root: HTMLElement;
  private readonly settingsStore: SettingsStore;
  private readonly audio: AudioEngine;
  private readonly callbacks: SettingsViewCallbacks;

  private activeTab: SettingsTabId = 'audio';
  private openState = false;
  private confirmingReset = false;

  constructor(
    root: HTMLElement,
    settingsStore: SettingsStore,
    audio: AudioEngine,
    callbacks: SettingsViewCallbacks
  ) {
    this.root = root;
    this.settingsStore = settingsStore;
    this.audio = audio;
    this.callbacks = callbacks;

    this.renderShell();
    this.bindEvents();
    this.settingsStore.subscribe((settings) => this.syncUI(settings));
  }

  isOpen(): boolean {
    return this.openState;
  }

  open(tab?: SettingsTabId): void {
    if (tab) this.activeTab = tab;
    this.openState = true;
    this.confirmingReset = false;
    const overlay = this.root.querySelector<HTMLElement>('#settings-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      this.syncTabButtons();
      this.syncResetConfirmUI();
      this.syncUI(this.settingsStore.getSettings());
    }
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.confirmingReset = false;
    this.root.querySelector<HTMLElement>('#settings-overlay')?.classList.add('hidden');
    this.syncResetConfirmUI();
  }

  toggle(): void {
    if (this.openState) this.close();
    else this.open();
  }

  private renderShell(): void {
    const stage = this.root.querySelector<HTMLElement>('.stage');
    if (!stage) return;

    const existing = stage.querySelector('#settings-overlay');
    existing?.remove();

    const copy = uiCopy.settings;
    const overlay = document.createElement('div');
    overlay.id = 'settings-overlay';
    overlay.className = 'modal-veil hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', copy.title);

    const creditsHtml = this.buildCreditsHtml();

    overlay.innerHTML = `
      <div class="modal-glass settings-modal">
        <header class="modal-header">
          <div class="modal-title-block">
            <span class="modal-eyebrow">${copy.eyebrow}</span>
            <h2 class="modal-title">${copy.title}</h2>
          </div>
          <button class="etched-action" id="btn-settings-close" type="button">CLOSE [ESC]</button>
        </header>

        <nav class="modal-tabs" role="tablist" aria-label="Settings Categories">
          <button class="modal-tab active" data-settings-tab="audio" role="tab" aria-selected="true" type="button">${copy.tabs.audio}</button>
          <button class="modal-tab" data-settings-tab="display" role="tab" aria-selected="false" type="button">${copy.tabs.display}</button>
          <button class="modal-tab" data-settings-tab="credits" role="tab" aria-selected="false" type="button">${copy.tabs.credits}</button>
        </nav>

        <div class="modal-body">
          <!-- TAB 1: AUDIO & VOICE -->
          <section class="settings-pane" data-settings-pane="audio">
            ${this.renderChannelRow('master', 'MASTER AUDIO', 'Global output across observatory, dreamscape, and relay.')}
            ${this.renderChannelRow('music', 'MUSIC & ATMOSPHERE', 'Generative observatory harmonics, deep-space drones, and H%-reactive dream chords.')}
            ${this.renderChannelRow('sfx', 'SOUND EFFECTS & INSTRUMENTS', 'Optical vernier detents, probe carrier lock, UI ticks, and minigame cues.')}
            ${this.renderChannelRow('voice', 'VOICE ACTING', 'Spoken dialogue for Other Me, Dream Personas, and Overseer.')}

            <div class="settings-row">
              <div class="settings-meta">
                <strong>VOICE AUTO-DUCKING</strong>
                <span>Automatically soften ambient music while dialogue is spoken.</span>
              </div>
              <div class="settings-controls">
                <button class="etched-toggle" id="toggle-voice-ducking" type="button" aria-pressed="true">ON</button>
              </div>
            </div>

            <div class="settings-footer-row">
              <button class="etched-action" id="btn-settings-defaults" type="button">RESTORE DEFAULTS</button>
            </div>
          </section>

          <!-- TAB 2: DISPLAY & COMFORT -->
          <section class="settings-pane hidden" data-settings-pane="display">
            <div class="settings-row">
              <div class="settings-meta">
                <strong>TEXT SIZE</strong>
                <span>Enlarge dialogue, codex entries, and HUD legibility for small screens.</span>
              </div>
              <div class="settings-controls">
                <div class="segmented-bar" role="group" aria-label="Text Size">
                  <button class="seg-btn" data-text-size="standard" type="button">STANDARD</button>
                  <button class="seg-btn" data-text-size="large" type="button">LARGE</button>
                </div>
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-meta">
                <strong>DIALOGUE PACING</strong>
                <span>Contemplative reveals lines one by one with voice; Standard/Instant show full bursts.</span>
              </div>
              <div class="settings-controls">
                <div class="segmented-bar" role="group" aria-label="Dialogue Pacing">
                  <button class="seg-btn" data-pacing="contemplative" type="button">CONTEMPLATIVE</button>
                  <button class="seg-btn" data-pacing="standard" type="button">STANDARD</button>
                  <button class="seg-btn" data-pacing="instant" type="button">INSTANT</button>
                </div>
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-meta">
                <strong>AUTO-ENGAGE LOCKED TARGETS</strong>
                <span>When OFF, locking a sky target lets you read the schematic calmly before pressing Space or Enter.</span>
              </div>
              <div class="settings-controls">
                <button class="etched-toggle" id="toggle-auto-engage" type="button" aria-pressed="false">OFF</button>
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-meta">
                <strong>HAPTICS &amp; VIBRATION</strong>
                <span>Tactile pulses on mobile devices and compatible gamepads.</span>
              </div>
              <div class="settings-controls">
                <button class="etched-toggle" id="toggle-haptics" type="button" aria-pressed="true">ON</button>
              </div>
            </div>
          </section>

          <!-- TAB 3: CREDITS & RUN -->
          <section class="settings-pane hidden" data-settings-pane="credits">
            <div class="settings-run-box">
              <div class="settings-meta">
                <strong>PLAYTHROUGH &amp; SESSION DATA</strong>
                <span>Audio and display settings are preserved even if you restart your current run.</span>
              </div>
              <div class="settings-run-actions">
                <button class="etched-action mint" id="btn-settings-export" type="button">EXPORT SESSION LOG</button>
                <button class="etched-action danger-link" id="btn-settings-restart" type="button">RESTART RUN</button>
                <div class="confirm-strip hidden" id="settings-restart-confirm">
                  <span>ERASE RUN PROGRESS?</span>
                  <button class="etched-action danger-link" id="btn-settings-restart-yes" type="button">CONFIRM WIPE</button>
                  <button class="etched-action" id="btn-settings-restart-no" type="button">CANCEL</button>
                </div>
              </div>
            </div>

            <div class="credits-section">
              <div class="credits-head">
                <strong>ASTRONOMY PLATES &amp; ASSET ATTRIBUTIONS</strong>
                <span>AUTO-GENERATED FROM MANIFEST.JSON</span>
              </div>
              <div class="credits-list">
                ${creditsHtml}
              </div>
            </div>
          </section>
        </div>
      </div>
    `;

    stage.appendChild(overlay);
  }

  private renderChannelRow(channel: 'master' | 'music' | 'sfx' | 'voice', label: string, desc: string): string {
    return `
      <div class="settings-row settings-audio-row" data-audio-row="${channel}">
        <div class="settings-meta">
          <strong>${label}</strong>
          <span>${desc}</span>
        </div>
        <div class="settings-controls settings-audio-controls">
          <button class="etched-toggle" id="toggle-${channel}" data-channel-toggle="${channel}" type="button" aria-pressed="true">ON</button>
          <div
            class="settings-vernier"
            id="vernier-${channel}"
            data-channel-vernier="${channel}"
            role="slider"
            tabindex="0"
            aria-label="${label} Volume"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="75"
          >
            <div class="settings-vernier-ticks" aria-hidden="true"></div>
            <div class="settings-vernier-fill" id="vernier-fill-${channel}" style="width:75%"></div>
            <div class="settings-vernier-needle" id="vernier-needle-${channel}" style="left:75%"></div>
          </div>
          <span class="settings-pct" id="pct-${channel}">75%</span>
        </div>
      </div>
    `;
  }

  private buildCreditsHtml(): string {
    const assets = (manifestJson.assets ?? []) as ManifestAsset[];
    const seen = new Set<string>();
    const items: string[] = [];

    for (const a of assets) {
      const key = `${a.attribution}|${a.license}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(`
        <div class="credit-item">
          <div class="credit-attr">${a.attribution}</div>
          <div class="credit-lic">${a.license}</div>
        </div>
      `);
    }
    return items.join('');
  }

  private bindEvents(): void {
    const overlay = this.root.querySelector<HTMLElement>('#settings-overlay');
    if (!overlay) return;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.audio.playCue('tick');
        this.close();
      }
    });

    overlay.querySelector('#btn-settings-close')?.addEventListener('click', () => {
      this.audio.playCue('tick');
      this.close();
    });

    overlay.querySelectorAll<HTMLButtonElement>('[data-settings-tab]').forEach((btn) => {
      btn.addEventListener('mouseenter', () => this.audio.playHoverTick());
      btn.addEventListener('click', () => {
        this.audio.playCue('tick');
        this.activeTab = btn.dataset.settingsTab as SettingsTabId;
        this.syncTabButtons();
      });
    });

    // Audio channel toggles
    const toggleMap: Record<'master' | 'music' | 'sfx' | 'voice', keyof UserSettings> = {
      master: 'masterEnabled',
      music: 'musicEnabled',
      sfx: 'sfxEnabled',
      voice: 'voiceEnabled',
    };
    const volMap: Record<'master' | 'music' | 'sfx' | 'voice', keyof UserSettings> = {
      master: 'masterVolume',
      music: 'musicVolume',
      sfx: 'sfxVolume',
      voice: 'voiceVolume',
    };

    (['master', 'music', 'sfx', 'voice'] as const).forEach((ch) => {
      overlay.querySelector<HTMLButtonElement>(`[data-channel-toggle="${ch}"]`)?.addEventListener('click', () => {
        const cur = this.settingsStore.getSettings();
        const key = toggleMap[ch];
        const nextVal = !cur[key];
        this.settingsStore.patch({ [key]: nextVal } as Partial<UserSettings>);
        if (nextVal) this.audio.playCue('tick');
      });

      const track = overlay.querySelector<HTMLElement>(`[data-channel-vernier="${ch}"]`);
      if (track) {
        this.bindVernierTrack(track, (ratio) => {
          const volKey = volMap[ch];
          const enKey = toggleMap[ch];
          const patch: Partial<UserSettings> = { [volKey]: ratio } as Partial<UserSettings>;
          if (ratio > 0.02 && !this.settingsStore.getSettings()[enKey]) {
            (patch as Record<string, unknown>)[enKey] = true;
          }
          this.settingsStore.patch(patch);
        });
      }
    });

    overlay.querySelector('#toggle-voice-ducking')?.addEventListener('click', () => {
      const cur = this.settingsStore.getSettings();
      this.settingsStore.patch({ voiceDucking: !cur.voiceDucking });
      this.audio.playCue('tick');
    });

    overlay.querySelector('#btn-settings-defaults')?.addEventListener('click', () => {
      this.settingsStore.resetToDefaults();
      this.audio.playCue('choice');
    });

    // Display & accessibility controls
    overlay.querySelectorAll<HTMLButtonElement>('[data-text-size]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.settingsStore.patch({ textSize: btn.dataset.textSize as 'standard' | 'large' });
        this.audio.playCue('tick');
      });
    });

    overlay.querySelectorAll<HTMLButtonElement>('[data-pacing]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.settingsStore.patch({ dialoguePacing: btn.dataset.pacing as DialoguePacingSetting });
        this.audio.playCue('tick');
      });
    });

    overlay.querySelector('#toggle-auto-engage')?.addEventListener('click', () => {
      const cur = this.settingsStore.getSettings();
      this.settingsStore.patch({ autoEngageInstrument: !cur.autoEngageInstrument });
      this.audio.playCue('tick');
    });

    overlay.querySelector('#toggle-haptics')?.addEventListener('click', () => {
      const cur = this.settingsStore.getSettings();
      this.settingsStore.patch({ hapticsEnabled: !cur.hapticsEnabled });
      this.audio.playCue('tick');
    });

    // Run & Credits controls
    overlay.querySelector('#btn-settings-export')?.addEventListener('click', () => {
      this.audio.playCue('choice');
      this.callbacks.onExportTelemetry();
    });

    overlay.querySelector('#btn-settings-restart')?.addEventListener('click', () => {
      this.audio.playCue('tick');
      this.confirmingReset = true;
      this.syncResetConfirmUI();
    });

    overlay.querySelector('#btn-settings-restart-no')?.addEventListener('click', () => {
      this.audio.playCue('tick');
      this.confirmingReset = false;
      this.syncResetConfirmUI();
    });

    overlay.querySelector('#btn-settings-restart-yes')?.addEventListener('click', () => {
      this.audio.playCue('boot_click');
      this.confirmingReset = false;
      this.close();
      this.callbacks.onRestartRun();
    });
  }

  private bindVernierTrack(track: HTMLElement, onChange: (ratio: number) => void): void {
    let dragging = false;
    const applyClientX = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      const raw = (clientX - rect.left) / Math.max(1, rect.width);
      const snapped = Math.round(Math.max(0, Math.min(1, raw)) * 20) / 20;
      onChange(snapped);
    };

    track.addEventListener('pointerdown', (e) => {
      dragging = true;
      try {
        track.setPointerCapture(e.pointerId);
      } catch {
        // jsdom / fallback
      }
      applyClientX(e.clientX);
    });
    track.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      applyClientX(e.clientX);
    });
    const end = () => {
      if (dragging) {
        dragging = false;
        this.audio.playCue('tick');
      }
    };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);

    track.addEventListener('keydown', (e) => {
      const curPct = Number(track.getAttribute('aria-valuenow') ?? '75');
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        onChange(Math.min(1, Math.round(curPct + 5) / 100));
        this.audio.playCue('tick');
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        onChange(Math.max(0, Math.round(curPct - 5) / 100));
        this.audio.playCue('tick');
      }
    });
  }

  private syncTabButtons(): void {
    const overlay = this.root.querySelector<HTMLElement>('#settings-overlay');
    if (!overlay) return;
    overlay.querySelectorAll<HTMLButtonElement>('[data-settings-tab]').forEach((btn) => {
      const active = btn.dataset.settingsTab === this.activeTab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    overlay.querySelectorAll<HTMLElement>('[data-settings-pane]').forEach((pane) => {
      pane.classList.toggle('hidden', pane.dataset.settingsPane !== this.activeTab);
    });
  }

  private syncResetConfirmUI(): void {
    const overlay = this.root.querySelector<HTMLElement>('#settings-overlay');
    if (!overlay) return;
    overlay.querySelector('#btn-settings-restart')?.classList.toggle('hidden', this.confirmingReset);
    overlay.querySelector('#settings-restart-confirm')?.classList.toggle('hidden', !this.confirmingReset);
  }

  private syncUI(s: UserSettings): void {
    const overlay = this.root.querySelector<HTMLElement>('#settings-overlay');
    if (!overlay) return;

    const channels: Array<{ id: 'master' | 'music' | 'sfx' | 'voice'; on: boolean; vol: number }> = [
      { id: 'master', on: s.masterEnabled, vol: s.masterVolume },
      { id: 'music', on: s.musicEnabled, vol: s.musicVolume },
      { id: 'sfx', on: s.sfxEnabled, vol: s.sfxVolume },
      { id: 'voice', on: s.voiceEnabled, vol: s.voiceVolume },
    ];

    for (const ch of channels) {
      const pct = Math.round(ch.vol * 100);
      const toggleBtn = overlay.querySelector<HTMLButtonElement>(`#toggle-${ch.id}`);
      const track = overlay.querySelector<HTMLElement>(`#vernier-${ch.id}`);
      const fill = overlay.querySelector<HTMLElement>(`#vernier-fill-${ch.id}`);
      const needle = overlay.querySelector<HTMLElement>(`#vernier-needle-${ch.id}`);
      const pctEl = overlay.querySelector<HTMLElement>(`#pct-${ch.id}`);
      const row = overlay.querySelector<HTMLElement>(`[data-audio-row="${ch.id}"]`);

      if (toggleBtn) {
        toggleBtn.textContent = ch.on ? 'ON' : 'OFF';
        toggleBtn.classList.toggle('is-on', ch.on);
        toggleBtn.setAttribute('aria-pressed', String(ch.on));
      }
      if (track) track.setAttribute('aria-valuenow', String(pct));
      if (fill) fill.style.width = `${pct}%`;
      if (needle) needle.style.left = `${pct}%`;
      if (pctEl) pctEl.textContent = ch.on ? `${pct}%` : 'OFF';
      row?.classList.toggle('is-dimmed', !ch.on || (ch.id !== 'master' && !s.masterEnabled));
    }

    const duckBtn = overlay.querySelector<HTMLButtonElement>('#toggle-voice-ducking');
    if (duckBtn) {
      duckBtn.textContent = s.voiceDucking ? 'ON' : 'OFF';
      duckBtn.classList.toggle('is-on', s.voiceDucking);
      duckBtn.setAttribute('aria-pressed', String(s.voiceDucking));
    }

    overlay.querySelectorAll<HTMLButtonElement>('[data-text-size]').forEach((b) => {
      b.classList.toggle('active', b.dataset.textSize === s.textSize);
    });

    overlay.querySelectorAll<HTMLButtonElement>('[data-pacing]').forEach((b) => {
      b.classList.toggle('active', b.dataset.pacing === s.dialoguePacing);
    });

    const autoBtn = overlay.querySelector<HTMLButtonElement>('#toggle-auto-engage');
    if (autoBtn) {
      autoBtn.textContent = s.autoEngageInstrument ? 'ON' : 'OFF';
      autoBtn.classList.toggle('is-on', s.autoEngageInstrument);
      autoBtn.setAttribute('aria-pressed', String(s.autoEngageInstrument));
    }

    const hapBtn = overlay.querySelector<HTMLButtonElement>('#toggle-haptics');
    if (hapBtn) {
      hapBtn.textContent = s.hapticsEnabled ? 'ON' : 'OFF';
      hapBtn.classList.toggle('is-on', s.hapticsEnabled);
      hapBtn.setAttribute('aria-pressed', String(s.hapticsEnabled));
    }
  }
}
