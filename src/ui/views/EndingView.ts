import manifestJson from '../../../assets/MANIFEST.json';
import charactersData from '../../content/characters.json';
import type { AudioEngine } from '../../engine/AudioEngine';
import type { EndingId, GameState } from '../../engine/StateStore';

interface ManifestAsset {
  path: string;
  license: string;
  attribution: string;
  internal_prototype_only?: boolean;
}

const CHAR_MAP = charactersData.characters as Record<string, { displayName: string }>;

const ENDING_COPY: Record<
  EndingId,
  { eyebrow: string; title: string; body: string }
> = {
  ending_sweet_spot: {
    eyebrow: 'ENDING · SIGNAL ANSWERED AFTER 41,802 YEARS',
    title: 'WARM CARRIER · PROOF ACCEPTED',
    body: 'Twenty years later, light from Sol–Centauri catches your mirror deck. Inside the calibration packet they folded both the 93-billion-light-year proof and the fragile, unpruned human warmth you refused to surrender.',
  },
  ending_cold_complete: {
    eyebrow: 'ENDING · CARRIER ACKNOWLEDGED IN SILENCE',
    title: 'COLD TELEMETRY · ARCHIVE CLOSED',
    body: 'Your carrier delivered clean coordinates for the recursive enclosure—stripped of hesitation, unsealed memories, or noise. Sol–Centauri logged the geometric proof cleanly and let the watch go quiet.',
  },
  ending_whole_incomplete: {
    eyebrow: 'ENDING · PARTIAL CARRIER IN DEEP DRIFT',
    title: 'WHOLE WARMTH · INCOMPLETE PROOF',
    body: 'You kept the rooms intact through six sleeps, though the carrier crossed ten light-years without the full 93-billion-light-year triangulation. Someone back on the line still remembers how your voice sounded, waiting for Instance 1421.',
  },
};

export interface EndingViewCallbacks {
  onReturnToTitle: () => void;
  onStartNewRun: () => void;
}

/**
 * Displays the Shift 6 Ending Epilogue, run telemetry summary,
 * filtered commercial-safe MANIFEST.json credits, and unlocks post-ending Shift Select.
 */
export class EndingView {
  private readonly el: HTMLElement;
  private openState = false;

  constructor(
    container: HTMLElement,
    private readonly audio: AudioEngine,
    private readonly callbacks: EndingViewCallbacks
  ) {
    this.el = document.createElement('section');
    this.el.id = 'ending-overlay';
    this.el.className = 'ending-overlay hidden';
    this.el.setAttribute('aria-label', 'Watch Conclusion & Credits');
    container.appendChild(this.el);
  }

  isOpen(): boolean {
    return this.openState;
  }

  show(state: GameState, endingId: EndingId): void {
    this.openState = true;
    const copy = ENDING_COPY[endingId] ?? ENDING_COPY.ending_whole_incomplete;
    const totalYears = (state.elapsedRealYears + 20.0).toFixed(1);
    const sig = state.composedSignal;
    const motifs = (sig?.personaMotifIds ?? [])
      .map((id) => CHAR_MAP[id]?.displayName ?? id)
      .join(', ');

    const credits = ((manifestJson as { assets?: ManifestAsset[] }).assets ?? [])
      .filter((a) => !a.internal_prototype_only)
      .slice(0, 14)
      .map(
        (a) =>
          `<li><span class="cred-path">${a.path.split('/').pop()}</span><span class="cred-attr">${a.attribution} (${a.license})</span></li>`
      )
      .join('');

    this.el.classList.toggle('is-cold', endingId === 'ending_cold_complete');
    this.el.innerHTML = `
      <div class="ending-card">
        <span class="ending-eyebrow">${copy.eyebrow}</span>
        <h1 class="ending-title">${copy.title}</h1>
        <p class="ending-body">${copy.body}</p>

        <div class="ending-telemetry-grid">
          <div><span>REAL TIME ELAPSED</span><strong>${totalYears} YR</strong></div>
          <div><span>HORIZON PROOF</span><strong>${state.anomalyProgress}%</strong></div>
          <div><span>FINAL WARMTH</span><strong>${state.humanity}% (CEILING ${state.maxHumanity}%)</strong></div>
          <div><span>SLOTTED MOTIFS</span><strong>${motifs || 'TELEMETRY ONLY'}</strong></div>
        </div>

        <details class="ending-credits">
          <summary>COMMERCIAL ASSET & ARCHIVE CREDITS</summary>
          <ul>${credits}</ul>
        </details>

        <div class="ending-actions">
          <button class="etched-action amber" id="btn-ending-title" type="button">RETURN TO TITLE · SHIFT SELECT UNLOCKED</button>
          <button class="etched-action" id="btn-ending-new-run" type="button">NEW RUN FROM PROLOGUE</button>
        </div>
      </div>
    `;

    this.el.classList.remove('hidden');

    this.el.querySelector('#btn-ending-title')?.addEventListener('click', () => {
      this.audio.playCue('boot_click');
      this.hide();
      this.callbacks.onReturnToTitle();
    });
    this.el.querySelector('#btn-ending-new-run')?.addEventListener('click', () => {
      this.audio.playCue('choice');
      this.hide();
      this.callbacks.onStartNewRun();
    });
  }

  hide(): void {
    this.openState = false;
    this.el.classList.add('hidden');
  }
}
