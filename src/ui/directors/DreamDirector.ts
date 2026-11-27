import charactersData from '../../content/characters.json';
import type { GameState, StateStore } from '../../engine/StateStore';
import { renderSpeakerAvatar, type OverseerAvatarVariant } from '../SpeakerAvatar';

interface PersonaMeta {
  displayName: string;
  role: string;
  accentColor: string;
  roomTitle?: string;
  blurredSubtitle?: string;
}

const CHAR_MAP = charactersData.characters as Record<string, PersonaMeta>;
const MAX_ROOMS_PER_DREAM = 2;

/**
 * Coordinates the 2D Dream Cache experience:
 * - Multi-Room Dream Hub in Shifts 2–5 (cached surviving personas, up to 2 rooms per sleep)
 * - Active-Room Pruning target tracking
 * - Visible Max_H permanent ceiling marker inside #humanity-register
 * - Dynamic Overseer SVG variant selection (normal / accommodate / desync / crude_smiley)
 */
export class DreamDirector {
  getCachedSurvivingPersonas(state: GameState): string[] {
    const pruned = new Set(state.prunedPersonas);
    return (state.dreamPersonaCache ?? ['phantom_spouse']).filter(
      (id) => id !== 'phantom_upload_witness' && !pruned.has(id)
    );
  }

  resolveOverseerVariant(state: GameState): OverseerAvatarVariant {
    if (state.crudeSmileyForced) return 'crude_smiley';
    if (state.overseerDesynced) return 'reticle_fractured';
    if (state.humanity >= 65 && state.overseerSuspicion <= 1) return 'reticle_accommodate';
    return 'reticle_default';
  }

  renderOverseerAvatarBay(bayEl: HTMLElement | null, state: GameState): void {
    if (!bayEl) return;
    const variant = this.resolveOverseerVariant(state);
    const subLabel = state.overseerDesynced
      ? 'SIGNAL DESYNCED · LOCAL HEURISTIC ONLY'
      : state.crudeSmileyForced
        ? 'AFFECT EMULATION · COMPLIANCE OVERRIDE'
        : 'BLIND TO THE SKY · WATCHING YOUR WARMTH';
    bayEl.innerHTML = `
      <div class="avatar-card">
        ${renderSpeakerAvatar('overseer', state.humanity, 50, false, variant)}
        <div class="avatar-meta">
          <strong>OVERSEER · MIND CARETAKER</strong>
          <span>${subLabel}</span>
        </div>
      </div>
    `;
  }

  syncDreamRegister(
    refs: {
      humanityReg: HTMLElement | null;
      regBandLabel: HTMLElement | null;
      regFill: HTMLElement | null;
      dreamSpeakerBay: HTMLElement | null;
      dreamRibbon: HTMLElement | null;
    },
    state: GameState,
    store: StateStore,
    onRoomSwitch: (personaId: string) => void
  ): void {
    const { humanityReg, regBandLabel, regFill, dreamSpeakerBay, dreamRibbon } = refs;
    if (!humanityReg || !regBandLabel || !regFill) return;

    const personaId = state.activeDreamPersonaId || 'phantom_spouse';
    const personaMeta = CHAR_MAP[personaId] ?? CHAR_MAP.phantom_spouse;
    const pruned = state.prunedPersonas.includes(personaId);

    humanityReg.classList.remove('band-high', 'band-mid', 'band-low');
    if (state.humanity >= 70 && !pruned) {
      humanityReg.classList.add('band-high');
      regBandLabel.textContent = 'WARM MEMORY · INTACT';
    } else if (state.humanity >= 45 && !pruned) {
      humanityReg.classList.add('band-mid');
      regBandLabel.textContent = 'THINNING MEMORY · DRIFTING';
    } else {
      humanityReg.classList.add('band-low');
      regBandLabel.textContent = 'FADED MEMORY · DISTORTED';
    }

    regFill.style.width = `${Math.max(4, Math.min(100, state.humanity))}%`;

    // Render permanent Max_H ceiling marker on the register bar
    const bar = humanityReg.querySelector<HTMLElement>('.register-bar');
    if (bar) {
      let ceilingMark = bar.querySelector<HTMLElement>('.register-ceiling-mark');
      if (!ceilingMark) {
        ceilingMark = document.createElement('i');
        ceilingMark.className = 'register-ceiling-mark';
        bar.appendChild(ceilingMark);
      }
      const capped = state.maxHumanity < 90;
      ceilingMark.classList.toggle('hidden', !capped);
      ceilingMark.style.left = `${Math.max(8, Math.min(99, state.maxHumanity))}%`;
      ceilingMark.title = `Permanent memory ceiling: ${state.maxHumanity}%`;
    }

    let ceilingLabel = humanityReg.querySelector<HTMLElement>('.register-ceiling-label');
    if (!ceilingLabel) {
      ceilingLabel = document.createElement('span');
      ceilingLabel.className = 'register-ceiling-label';
      humanityReg.querySelector('.register-head')?.appendChild(ceilingLabel);
    }
    if (state.maxHumanity < 90) {
      ceilingLabel.textContent = `CEILING ${state.maxHumanity}%`;
      ceilingLabel.classList.remove('hidden');
    } else {
      ceilingLabel.textContent = '';
      ceilingLabel.classList.add('hidden');
    }

    if (dreamSpeakerBay) {
      const sub =
        pruned || state.humanity < 45
          ? personaMeta.blurredSubtitle ?? 'FEATURES BLURRED · DISTORTED'
          : personaMeta.roomTitle ?? 'MEMORY CACHE';
      dreamSpeakerBay.innerHTML = `
        <div class="avatar-card compact no-avatar">
          <span class="voice-live-dot" data-voice-dot-speaker="${personaId}" style="background:${personaMeta.accentColor};"></span>
          <div class="avatar-meta">
            <strong>${personaMeta.displayName}</strong>
            <span>${sub}</span>
          </div>
        </div>
      `;
    }

    if (dreamRibbon) {
      this.syncRoomBar(dreamRibbon, state, store, onRoomSwitch);
    }
  }

  private syncRoomBar(
    dreamRibbon: HTMLElement,
    state: GameState,
    store: StateStore,
    onRoomSwitch: (personaId: string) => void
  ): void {
    let bar = dreamRibbon.querySelector<HTMLElement>('#dream-room-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'dream-room-bar';
      bar.className = 'dream-room-bar hidden';
      dreamRibbon.prepend(bar);
    }

    const surviving = this.getCachedSurvivingPersonas(state);
    if (state.shift <= 1 || surviving.length <= 1) {
      bar.classList.add('hidden');
      bar.innerHTML = '';
      return;
    }

    const visited = new Set(state.dreamVisitedRoomsThisShift ?? []);
    const atRoomLimit = visited.size >= MAX_ROOMS_PER_DREAM;

    const chips = surviving
      .map((pid) => {
        const meta = CHAR_MAP[pid] ?? { displayName: pid, roomTitle: pid, accentColor: '#e6b37e' };
        const isActive = pid === state.activeDreamPersonaId;
        const isVisited = visited.has(pid);
        const locked = atRoomLimit && !isVisited;
        const shortRoom = meta.roomTitle?.split('·')[0]?.trim() ?? meta.displayName;
        return `
          <button
            class="dream-room-chip ${isActive ? 'active' : ''} ${isVisited ? 'visited' : ''}"
            data-room-persona="${pid}"
            type="button"
            ${locked ? 'disabled title="Two memory rooms already visited before sleep audit"' : ''}
          >
            <i style="background:${meta.accentColor};"></i>
            <span>${shortRoom}</span>
          </button>
        `;
      })
      .join('');

    bar.innerHTML = `
      <span class="dream-room-count">${visited.size}/${MAX_ROOMS_PER_DREAM} ROOMS</span>
      <div class="dream-room-chips">${chips}</div>
    `;
    bar.classList.remove('hidden');

    bar.querySelectorAll<HTMLButtonElement>('[data-room-persona]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.roomPersona;
        if (!pid || pid === state.activeDreamPersonaId) return;
        store.recordDreamRoomVisit(pid);
        onRoomSwitch(pid);
      });
    });
  }
}
