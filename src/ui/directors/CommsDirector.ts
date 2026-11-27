import uiCopy from '../../content/ui_copy.json';
import type { DialogueSnapshot } from '../../engine/DialogueRunner';
import type { AnomalySpec } from '../../engine/OpticsScene';
import type { GameState } from '../../engine/StateStore';
import type { StoryletSpec } from '../../engine/StoryletScheduler';
import { renderSpeakerAvatar } from '../SpeakerAvatar';

export type CommsChannelMode = 'sibling' | 'post_target2' | 'secondary_1418' | 'archive_echo';

function warmthDescriptor(h: number): string {
  if (h >= 65) return 'WARM';
  if (h >= 45) return 'STEADY';
  return 'COOL';
}

/**
 * Coordinates Wake-World Relay Comms across Probe 1420 (sibling_primary),
 * Probe 1418 (sibling_secondary), and archived predecessor echoes (1406/1411/0812).
 */
export class CommsDirector {
  resolveChannelMode(
    activeCommsMode: 'sibling' | 'post_target2',
    snapshot: DialogueSnapshot | null,
    storylet: StoryletSpec | null
  ): CommsChannelMode {
    if (
      activeCommsMode === 'post_target2' ||
      snapshot?.knot === 'intro_post_target2_overseer'
    ) {
      return 'post_target2';
    }
    const entries = snapshot?.entries ?? [];
    if (
      entries.some((e) => e.speaker === 'sibling_secondary') ||
      storylet?.id.includes('1418') ||
      snapshot?.knot.includes('1418')
    ) {
      return 'secondary_1418';
    }
    if (
      entries.some((e) => e.speaker === 'archive_echo') &&
      !entries.some((e) => e.speaker === 'sibling_primary')
    ) {
      return 'archive_echo';
    }
    return 'sibling';
  }

  getHeaderTitle(mode: CommsChannelMode): string {
    switch (mode) {
      case 'post_target2':
        return 'INCOMING TRANSMISSION // ARCHIVE & OVERSEER';
      case 'secondary_1418':
        return 'OUTER APERTURE RELAY · PROBE 1418';
      case 'archive_echo':
        return 'CACHED PREDECESSOR ARCHIVE · PRIOR WATCH';
      case 'sibling':
      default:
        return 'CLUSTER RELAY · 14m LAG';
    }
  }

  renderAvatarBay(
    bay: HTMLElement | null,
    state: GameState,
    mode: CommsChannelMode
  ): void {
    if (!bay) return;

    if (mode === 'post_target2' || mode === 'archive_echo') {
      bay.innerHTML = `
        <div class="dual-avatar-pair">
          <div class="avatar-chip">
            ${renderSpeakerAvatar('overseer', state.humanity, 44)}
            <div class="avatar-meta"><strong>OVERSEER</strong><span>CARETAKER</span></div>
          </div>
          <span class="pair-link">ARCHIVE BLEED</span>
          <div class="avatar-chip right">
            <div class="avatar-meta"><strong>PRIOR WATCH · ARCHIVE</strong><span>ARCHIVED</span></div>
            ${renderSpeakerAvatar('archive_echo', state.humanity, 44)}
          </div>
        </div>
      `;
      return;
    }

    if (mode === 'secondary_1418') {
      bay.innerHTML = `
        <div class="dual-avatar-pair">
          <div class="avatar-chip">
            <span class="voice-live-dot" data-voice-dot-speaker="player" style="background:#eef0ec;"></span>
            <div class="avatar-meta"><strong>YOU · 1419</strong><span>${warmthDescriptor(state.humanity)}</span></div>
          </div>
          <span class="pair-link">SECOND CLUSTER ECHO</span>
          <div class="avatar-chip right">
            <div class="avatar-meta"><strong>SIBLING 1418</strong><span>DISTANT APERTURE</span></div>
            ${renderSpeakerAvatar('sibling_secondary', state.humanity, 40)}
          </div>
        </div>
      `;
      return;
    }

    const delta = Math.abs(state.humanity - state.primarySiblingH);
    let toneTag = 'IN STEP';
    if (state.humanity >= 65 && state.primarySiblingH >= 65) toneTag = 'WARM & EASY';
    else if (delta >= 15) toneTag = 'GROWING APART';
    else if (state.humanity < 45 && state.primarySiblingH < 45) toneTag = 'CLIPPED & COLD';

    bay.innerHTML = `
      <div class="dual-avatar-pair">
        <div class="avatar-chip">
          <span class="voice-live-dot" data-voice-dot-speaker="player" style="background:#eef0ec;"></span>
          <div class="avatar-meta"><strong>YOU</strong><span>${warmthDescriptor(state.humanity)}</span></div>
        </div>
        <span class="pair-link">${toneTag}</span>
        <div class="avatar-chip right">
          <div class="avatar-meta"><strong>OTHER ME</strong><span>${warmthDescriptor(state.primarySiblingH)}</span></div>
          ${renderSpeakerAvatar('sibling_primary', state.primarySiblingH, 40)}
        </div>
      </div>
    `;
  }

  buildToastMessage(storylet: StoryletSpec, spec?: AnomalySpec): string | undefined {
    const optTemplate =
      (uiCopy.commsToast as { optionalScanTemplate?: string }).optionalScanTemplate ??
      uiCopy.commsToast.targetLockedTemplate;
    if (storylet.id === 'shift1_optional_scan_echo') {
      return optTemplate.replace('{label}', spec?.label ?? '');
    }
    if (spec?.postScanEcho?.unlocksStoryletId === storylet.id && spec.postScanEcho.dossierFinding) {
      return `"Caught your lock on ${spec.label} — relay open when you have a moment."`;
    }
    if (spec) {
      return uiCopy.commsToast.targetLockedTemplate.replace('{label}', spec.label);
    }
    return undefined;
  }
}
