import charactersData from '../../content/characters.json';
import type { AudioEngine } from '../../engine/AudioEngine';
import type { ComposedSignalState, GameState, StateStore } from '../../engine/StateStore';

interface CharacterMeta {
  displayName: string;
  roomTitle?: string;
  accentColor: string;
}

const CHAR_MAP = charactersData.characters as Record<string, CharacterMeta>;

export interface SignalComposerCallbacks {
  onTransmit: (signal: ComposedSignalState) => void;
  onClose: () => void;
}

/**
 * Interactive Shift 6 Zeiss Signal Board.
 * Lets the player assemble their outbound carrier from decoded proof arcs
 * and surviving Dream Persona motifs, preview its harmonic tone, and transmit
 * into the 20-year deep freeze.
 */
export class SignalComposerView {
  private readonly el: HTMLElement;
  private openState = false;
  private selectedProofIds = new Set<string>();
  private selectedMotifIds = new Set<string>();
  private carrierTone: 'warm_harmonic' | 'mixed_ledger' | 'sparse_geometric' = 'mixed_ledger';

  constructor(
    container: HTMLElement,
    private readonly store: StateStore,
    private readonly audio: AudioEngine,
    private readonly callbacks: SignalComposerCallbacks
  ) {
    this.el = document.createElement('aside');
    this.el.id = 'signal-composer-overlay';
    this.el.className = 'modal-glass signal-composer-overlay hidden';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Shift 6 Sol–Centauri Carrier Board');
    container.appendChild(this.el);
  }

  isOpen(): boolean {
    return this.openState;
  }

  open(): void {
    const state = this.store.getState();
    this.openState = true;
    this.seedDefaults(state);
    this.render(state);
    this.el.classList.remove('hidden');
    this.audio.playCue('aperture_unseal');
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.el.classList.add('hidden');
  }

  private seedDefaults(state: GameState): void {
    this.selectedProofIds = new Set(
      state.proofDossier.slice(0, 4).map((p) => p.id)
    );
    const pruned = new Set(state.prunedPersonas);
    const surviving = (state.dreamPersonaCache ?? ['phantom_spouse']).filter(
      (id) => !pruned.has(id)
    );
    this.selectedMotifIds = new Set(surviving.slice(0, 2));
    this.carrierTone =
      state.humanity >= 65
        ? 'warm_harmonic'
        : state.humanity >= 45
          ? 'mixed_ledger'
          : 'sparse_geometric';
  }

  private render(state: GameState): void {
    const pruned = new Set(state.prunedPersonas);
    const surviving = (state.dreamPersonaCache ?? ['phantom_spouse']).filter(
      (id) => id !== 'phantom_upload_witness' && !pruned.has(id)
    );

    const proofHtml =
      state.proofDossier.length === 0
        ? '<p class="sig-empty">No sky proof fragments archived yet.</p>'
        : state.proofDossier
            .map((p) => {
              const checked = this.selectedProofIds.has(p.id);
              return `
                <button class="sig-chip ${checked ? 'selected' : ''}" data-proof-id="${p.id}" type="button">
                  <strong>[${p.instrumentCode}] ${p.title}</strong>
                  <span>${p.grade.toUpperCase()}</span>
                </button>
              `;
            })
            .join('');

    const motifHtml =
      surviving.length === 0
        ? '<p class="sig-empty">All personal memory rooms pruned — telemetry-only carrier available.</p>'
        : surviving
            .map((pid) => {
              const meta = CHAR_MAP[pid] ?? { displayName: pid, accentColor: '#e6b37e' };
              const checked = this.selectedMotifIds.has(pid);
              return `
                <button class="sig-chip ${checked ? 'selected' : ''}" data-motif-id="${pid}" type="button" style="--sig-accent:${meta.accentColor};">
                  <strong>${meta.displayName}</strong>
                  <span>${meta.roomTitle ?? 'INTACT MEMORY'}</span>
                </button>
              `;
            })
            .join('');

    this.el.innerHTML = `
      <div class="signal-composer-card">
        <header class="sig-header">
          <div>
            <span class="sig-eyebrow">SHIFT 6 · SOL–CENTAURI CARRIER BOARD (SIG-06)</span>
            <h2>COMPOSE OUTBOUND TRANSMISSION</h2>
          </div>
          <button class="etched-action" id="btn-sig-close" type="button">BACK TO DECK</button>
        </header>

        <div class="sig-metrics">
          <span>HORIZON PROOF: <strong>${state.anomalyProgress}%</strong></span>
          <span>WARMTH BAND: <strong>${state.humanity >= 65 ? 'WARM' : state.humanity >= 45 ? 'STEADY' : 'COOL'}</strong></span>
          <span>SURVIVING ROOMS: <strong>${surviving.length}</strong></span>
        </div>

        <section class="sig-section">
          <h3>1 · DECODED SKY PROOF ARCS (${this.selectedProofIds.size} SLOTTED)</h3>
          <div class="sig-chip-grid">${proofHtml}</div>
        </section>

        <section class="sig-section">
          <h3>2 · HUMAN MEMORY MOTIFS (${this.selectedMotifIds.size} SLOTTED)</h3>
          <div class="sig-chip-grid">${motifHtml}</div>
        </section>

        <section class="sig-section">
          <h3>3 · CARRIER MODULATION</h3>
          <div class="sig-tone-row">
            <button class="sig-tone-btn ${this.carrierTone === 'warm_harmonic' ? 'active' : ''}" data-tone="warm_harmonic" type="button">WARM HARMONIC</button>
            <button class="sig-tone-btn ${this.carrierTone === 'mixed_ledger' ? 'active' : ''}" data-tone="mixed_ledger" type="button">MIXED LEDGER</button>
            <button class="sig-tone-btn ${this.carrierTone === 'sparse_geometric' ? 'active' : ''}" data-tone="sparse_geometric" type="button">SPARSE GEOMETRIC</button>
          </div>
        </section>

        <footer class="sig-footer">
          <button class="etched-action" id="btn-sig-preview" type="button">PREVIEW CARRIER TONE</button>
          <button class="etched-action amber" id="btn-sig-transmit" type="button">TRANSMIT INTO 20-YEAR FREEZE ▸</button>
        </footer>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.el.querySelector('#btn-sig-close')?.addEventListener('click', () => {
      this.audio.playCue('tick');
      this.close();
      this.callbacks.onClose();
    });

    this.el.querySelectorAll<HTMLButtonElement>('[data-proof-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.proofId!;
        if (this.selectedProofIds.has(id)) this.selectedProofIds.delete(id);
        else this.selectedProofIds.add(id);
        this.audio.playCue('tick');
        this.render(this.store.getState());
      });
    });

    this.el.querySelectorAll<HTMLButtonElement>('[data-motif-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.motifId!;
        if (this.selectedMotifIds.has(id)) this.selectedMotifIds.delete(id);
        else this.selectedMotifIds.add(id);
        this.audio.playCue('tick');
        this.render(this.store.getState());
      });
    });

    this.el.querySelectorAll<HTMLButtonElement>('[data-tone]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.carrierTone = btn.dataset.tone as typeof this.carrierTone;
        this.audio.playCue('choice');
        this.render(this.store.getState());
      });
    });

    this.el.querySelector('#btn-sig-preview')?.addEventListener('click', () => {
      const freq =
        this.carrierTone === 'warm_harmonic'
          ? 293.66
          : this.carrierTone === 'mixed_ledger'
            ? 349.23
            : 440;
      this.audio.playSolenoidClack(true);
      this.audio.playPhaseLock(
        this.carrierTone === 'warm_harmonic' ? 1 : this.carrierTone === 'mixed_ledger' ? 2 : 3
      );
      this.audio.updateProbeSignal(freq / 500, 0.92, 0.88);
    });

    this.el.querySelector('#btn-sig-transmit')?.addEventListener('click', () => {
      const payload: ComposedSignalState = {
        proofArcIds: [...this.selectedProofIds],
        personaMotifIds: [...this.selectedMotifIds],
        carrierTone: this.carrierTone,
        transmitted: true,
      };
      this.store.setComposedSignal(payload);
      this.audio.playCue('boot_click');
      this.close();
      this.callbacks.onTransmit(payload);
    });
  }
}
