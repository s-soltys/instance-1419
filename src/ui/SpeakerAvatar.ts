import charactersData from '../content/characters.json';

export type OverseerAvatarVariant =
  | 'reticle_default'
  | 'reticle_accommodate'
  | 'reticle_fractured'
  | 'rubber_duck'
  | 'traffic_cone'
  | 'crude_smiley';

interface CharacterEntry {
  accentColor?: string;
  objectGlyph?: string;
}

const CHAR_MAP = charactersData.characters as Record<string, CharacterEntry>;

function getCharColor(speakerId: string, fallback: string): string {
  return CHAR_MAP[speakerId]?.accentColor ?? fallback;
}

function getDreamColor(speakerId: string, humanity: number): string {
  const base = getCharColor(speakerId, '#e6b37e');
  if (humanity < 45) {
    return `color-mix(in srgb, ${base} 42%, #8fb8cc 58%)`;
  }
  if (humanity < 70) {
    return `color-mix(in srgb, ${base} 72%, #a8bec9 28%)`;
  }
  return base;
}

export function renderObjectGlyph(glyphId: string, color: string, size = 18): string {
  let inner = '';
  switch (glyphId) {
    case 'chipped_mug':
      inner = `
        <path d="M5 7 H16 V16 C16 18.2 14.2 19.5 11.5 19.5 H9.5 C6.8 19.5 5 18.2 5 16 Z" fill="none" stroke="${color}" stroke-width="1.5" />
        <path d="M16 9 H18.5 C19.8 9 20.5 10 20.5 11.5 C20.5 13 19.8 14 18.5 14 H16" fill="none" stroke="${color}" stroke-width="1.5" />
        <path d="M5 7 L7 5.5 L8.8 7" fill="none" stroke="${color}" stroke-width="1.3" />
        <path d="M9 4 C9 2.8 10.5 2.8 10.5 1.8 M12.5 4.2 C12.5 3 14 3 14 2" fill="none" stroke="${color}" stroke-opacity="0.7" stroke-width="1.2" stroke-linecap="round" />`;
      break;
    case 'binoculars':
      inner = `
        <circle cx="8" cy="15" r="3.6" fill="none" stroke="${color}" stroke-width="1.5" />
        <circle cx="16" cy="15" r="3.6" fill="none" stroke="${color}" stroke-width="1.5" />
        <path d="M6 12 L8.2 6.5 H10.6 L11 11 M18 12 L15.8 6.5 H13.4 L13 11" fill="none" stroke="${color}" stroke-width="1.4" stroke-linejoin="round" />
        <line x1="10.2" y1="9.5" x2="13.8" y2="9.5" stroke="${color}" stroke-width="1.5" />`;
      break;
    case 'glasses':
      inner = `
        <circle cx="7.4" cy="13.2" r="3.9" fill="none" stroke="${color}" stroke-width="1.5" />
        <circle cx="16.6" cy="13.2" r="3.9" fill="none" stroke="${color}" stroke-width="1.5" />
        <path d="M11.3 12.8 Q12 11.4 12.7 12.8" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" />
        <path d="M3.6 12.4 L5.4 7.6 Q5.8 6.8 6.8 7.2 M20.4 12.4 L18.6 7.6 Q18.2 6.8 17.2 7.2" fill="none" stroke="${color}" stroke-opacity="0.82" stroke-width="1.3" stroke-linecap="round" />
        <path d="M5.6 11.8 L7 10.6 M14.8 11.8 L16.2 10.6" fill="none" stroke="${color}" stroke-opacity="0.6" stroke-width="1.1" stroke-linecap="round" />`;
      break;
    case 'paper_cup':
      inner = `
        <polygon points="7,6 17,6 15.2,19.5 8.8,19.5" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" />
        <line x1="6.2" y1="6" x2="17.8" y2="6" stroke="${color}" stroke-width="1.6" stroke-linecap="round" />
        <path d="M8.5 11 L12 13 L15.2 10.5" fill="none" stroke="${color}" stroke-opacity="0.75" stroke-width="1.2" />`;
      break;
    case 'transit_ticket':
      inner = `
        <path d="M4.5 8 H19.5 V10.5 A1.5 1.5 0 0 0 19.5 13.5 V16 H4.5 V13.5 A1.5 1.5 0 0 0 4.5 10.5 Z" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" />
        <line x1="14" y1="8.5" x2="14" y2="15.5" stroke="${color}" stroke-dasharray="1.8 1.8" stroke-width="1.2" />
        <line x1="7" y1="12" x2="11.5" y2="12" stroke="${color}" stroke-opacity="0.75" stroke-width="1.3" />`;
      break;
    case 'calipers':
      inner = `
        <circle cx="12" cy="6" r="1.8" fill="none" stroke="${color}" stroke-width="1.5" />
        <path d="M10.8 7.5 L6.8 19 L9.2 17.5 M13.2 7.5 L17.2 19 L14.8 17.5" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M8 13.5 Q12 15.2 16 13.5" fill="none" stroke="${color}" stroke-opacity="0.75" stroke-width="1.2" />`;
      break;
    case 'wristwatch':
      inner = `
        <rect x="9.5" y="3" width="5" height="3.2" fill="none" stroke="${color}" stroke-width="1.3" />
        <rect x="9.5" y="17.8" width="5" height="3.2" fill="none" stroke="${color}" stroke-width="1.3" />
        <circle cx="12" cy="12" r="5.5" fill="none" stroke="${color}" stroke-width="1.5" />
        <polyline points="12,8.8 12,12 14.5,13.5" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" />`;
      break;
    case 'lowball_glass':
      inner = `
        <polygon points="6.5,6.5 17.5,6.5 16.2,19 7.8,19" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" />
        <line x1="7.2" y1="13" x2="16.8" y2="13" stroke="${color}" stroke-opacity="0.8" stroke-width="1.3" />
        <rect x="9.5" y="13.8" width="3.8" height="3.2" transform="rotate(-12 11.4 15.4)" fill="none" stroke="${color}" stroke-opacity="0.7" stroke-width="1.1" />`;
      break;
    case 'wrench':
      inner = `
        <path d="M15.8 5.2 A4 4 0 0 0 11.2 10.6 L5.6 16.2 A1.5 1.5 0 0 0 7.8 18.4 L13.4 12.8 A4 4 0 0 0 18.8 8.2 L16.2 10.2 L13.8 7.8 Z" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" />`;
      break;
    case 'vending_coin':
    default:
      inner = `
        <circle cx="12" cy="12" r="6.8" fill="none" stroke="${color}" stroke-width="1.5" />
        <circle cx="12" cy="12" r="4.2" fill="none" stroke="${color}" stroke-opacity="0.6" stroke-dasharray="2 2" stroke-width="1.1" />
        <line x1="12" y1="9.2" x2="12" y2="14.8" stroke="${color}" stroke-width="1.4" stroke-linecap="round" />`;
      break;
  }
  return `<svg class="object-micro-glyph" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${inner}</svg>`;
}

function renderOverseerSvg(variant: OverseerAvatarVariant, color: string): string {
  if (variant === 'rubber_duck') {
    return `
      <circle cx="32" cy="32" r="27" fill="rgba(16,24,32,0.75)" stroke="rgba(216,236,250,0.28)" stroke-width="1.1" />
      <path d="M18 37 C18 30, 26 31, 31 31 C32 23, 27 20, 27 17 C27 13, 31 11, 35 11 C39 11, 42 14, 42 18 C42 20, 41 22, 39 24 C45 25, 49 30, 48 36 C47 43, 40 46, 31 46 C23 46, 18 42, 18 37 Z" fill="#f7d046" stroke="#18222c" stroke-width="1.4" stroke-linejoin="round" />
      <path d="M41.5 16.5 L49 18.5 L41.8 20.8 Z" fill="#e8843c" stroke="#18222c" stroke-width="1.1" stroke-linejoin="round" />
      <circle cx="37.2" cy="15.8" r="1.5" fill="#18222c" />
      <path d="M25 35 C29 33, 35 34, 38 38" fill="none" stroke="#d49e1c" stroke-width="1.4" stroke-linecap="round" />`;
  }
  if (variant === 'traffic_cone') {
    return `
      <circle cx="32" cy="32" r="27" fill="rgba(16,24,32,0.75)" stroke="rgba(216,236,250,0.28)" stroke-width="1.1" />
      <polygon points="28,13 36,13 43,45 21,45" fill="#f07438" stroke="#18222c" stroke-width="1.4" stroke-linejoin="round" />
      <polygon points="26.3,22 37.7,22 39.2,28.5 24.8,28.5" fill="#f4f7fa" />
      <polygon points="24.2,32.5 39.8,32.5 41.2,38.5 22.8,38.5" fill="#f4f7fa" />
      <rect x="16" y="45" width="32" height="4.5" rx="1.5" fill="#d45d28" stroke="#18222c" stroke-width="1.2" />`;
  }
  if (variant === 'crude_smiley') {
    return `
      <circle cx="32" cy="32" r="27" fill="rgba(16,24,32,0.75)" stroke="rgba(216,236,250,0.28)" stroke-width="1.1" />
      <circle cx="32" cy="32" r="19" fill="#f7d046" stroke="#18222c" stroke-width="1.5" />
      <circle cx="25.5" cy="27" r="2.2" fill="#18222c" />
      <circle cx="38.5" cy="27" r="2.2" fill="#18222c" />
      <path d="M23 36 Q32 44 41 36" fill="none" stroke="#18222c" stroke-width="2.2" stroke-linecap="round" />`;
  }
  if (variant === 'reticle_accommodate') {
    return `
      <circle cx="32" cy="32" r="26" fill="none" stroke="${color}" stroke-opacity="0.45" stroke-width="1.2" />
      <circle class="av-pulse-ring" cx="32" cy="32" r="20" fill="none" stroke="${color}" stroke-opacity="0.72" stroke-width="1.3" />
      <circle cx="32" cy="32" r="13" fill="rgba(18,28,38,0.8)" stroke="${color}" stroke-opacity="0.62" stroke-width="1.2" stroke-dasharray="5 3" />
      <line x1="25" y1="32" x2="39" y2="32" stroke="${color}" stroke-opacity="0.7" stroke-width="1.2" />
      <line x1="32" y1="25" x2="32" y2="39" stroke="${color}" stroke-opacity="0.7" stroke-width="1.2" />`;
  }
  if (variant === 'reticle_fractured') {
    return `
      <path d="M12 18 A24 24 0 0 1 48 15 M52 44 A24 24 0 0 1 16 49" fill="none" stroke="${color}" stroke-opacity="0.55" stroke-width="1.3" stroke-dasharray="4 3" />
      <polygon class="av-pulse-ring" points="32,12 49,21 47,42 30,51 15,40 17,20" fill="rgba(14,22,30,0.88)" stroke="${color}" stroke-width="1.4" />
      <line x1="19" y1="24" x2="45" y2="39" stroke="#7ec8e8" stroke-opacity="0.7" stroke-width="1.1" stroke-dasharray="3 2" />
      <line x1="25" y1="44" x2="39" y2="19" stroke="${color}" stroke-opacity="0.6" stroke-width="1.1" />`;
  }
  // reticle_default: Eye-less broken caliper calibration reticle (zero pupil)
  return `
    <path d="M13 20 A22 22 0 0 1 51 20 M51 44 A22 22 0 0 1 13 44" fill="none" stroke="${color}" stroke-opacity="0.45" stroke-width="1.2" />
    <circle class="av-pulse-ring" cx="32" cy="32" r="25" fill="none" stroke="${color}" stroke-opacity="0.6" stroke-width="1.1" stroke-dasharray="6 4" />
    <polygon points="32,13 48,22 48,42 32,51 16,42 16,22" fill="rgba(18,28,38,0.85)" stroke="${color}" stroke-width="1.4" />
    <line x1="8" y1="32" x2="21" y2="32" stroke="${color}" stroke-width="1.3" />
    <line x1="43" y1="32" x2="56" y2="32" stroke="${color}" stroke-width="1.3" />
    <line x1="32" y1="8" x2="32" y2="21" stroke="${color}" stroke-width="1.3" />
    <line x1="32" y1="43" x2="32" y2="56" stroke="${color}" stroke-width="1.3" />`;
}

export function renderSpeakerAvatar(
  speakerId: string,
  humanity = 70,
  size = 54,
  compact = false,
  overseerVariant: OverseerAvatarVariant = 'reticle_default'
): string {
  const isLow = humanity < 45;
  const ampClass = compact ? 'speaker-avatar compact' : 'speaker-avatar';

  if (speakerId === 'overseer') {
    const col = getCharColor('overseer', '#d8ecfa');
    return `
      <div class="${ampClass} avatar-overseer" data-avatar-speaker="${speakerId}" style="width:${size}px;height:${size}px;--speaker-color:${col};">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          ${renderOverseerSvg(overseerVariant, col)}
        </svg>
      </div>
    `;
  }

  if (speakerId === 'future_humanity') {
    const col = getCharColor('future_humanity', '#fff0c2');
    return `
      <div class="${ampClass} avatar-future" data-avatar-speaker="${speakerId}" style="width:${size}px;height:${size}px;--speaker-color:${col};">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle class="av-pulse-ring" cx="32" cy="32" r="25" fill="none" stroke="${col}" stroke-opacity="0.34" stroke-width="1.1" stroke-dasharray="3 4" />
          <circle cx="32" cy="32" r="16" fill="none" stroke="${col}" stroke-opacity="0.52" stroke-width="1" />
          <line x1="32" y1="7" x2="32" y2="57" stroke="${col}" stroke-width="1.5" stroke-linecap="round" />
          <line x1="10.4" y1="19.5" x2="53.6" y2="44.5" stroke="${col}" stroke-width="1.4" stroke-linecap="round" />
          <line x1="10.4" y1="44.5" x2="53.6" y2="19.5" stroke="${col}" stroke-width="1.4" stroke-linecap="round" />
          <circle class="av-core" cx="32" cy="32" r="3.4" fill="#ffffff" />
        </svg>
      </div>
    `;
  }

  if (speakerId === 'archive_echo') {
    const col = getCharColor('archive_echo', '#a89f91');
    return `
      <div class="${ampClass} avatar-archive" data-avatar-speaker="${speakerId}" style="width:${size}px;height:${size}px;--speaker-color:${col};">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M18 14 H12 V50 H18 M46 14 H52 V50 H46" fill="none" stroke="${col}" stroke-opacity="0.72" stroke-width="1.6" />
          <line class="av-pulse-ring" x1="19" y1="23" x2="45" y2="23" stroke="${col}" stroke-width="2" stroke-dasharray="7 3" />
          <line x1="19" y1="32" x2="39" y2="32" stroke="${col}" stroke-opacity="0.65" stroke-width="2" stroke-dasharray="4 4" />
          <line x1="19" y1="41" x2="33" y2="41" stroke="${col}" stroke-opacity="0.4" stroke-width="2" stroke-dasharray="3 5" />
          <circle class="av-core" cx="43" cy="41" r="2.6" fill="${col}" />
        </svg>
      </div>
    `;
  }

  if (speakerId === 'sibling_primary' || speakerId === 'sibling_secondary') {
    const isSecondary = speakerId === 'sibling_secondary';
    const baseCol = getCharColor(speakerId, isSecondary ? '#b8d474' : '#6fd6b6');
    const col = isLow && !isSecondary ? '#9cbab2' : baseCol;
    const tilt = isSecondary ? ' transform="rotate(-22 32 32)"' : '';
    const wave1 = isLow
      ? 'M11 32 H19 V22 H28 V42 H37 V22 H45 V32 H53'
      : 'M11 32 C17 18, 25 18, 32 32 C39 46, 47 46, 53 32';
    const wave2 = isLow
      ? 'M11 32 H23 V40 H34 V24 H45 V32 H53'
      : 'M11 32 C17 44, 25 44, 32 32 C39 20, 47 20, 53 32';
    return `
      <div class="${ampClass} ${isSecondary ? 'avatar-sibling-secondary' : 'avatar-sibling'} ${isLow ? 'is-fractured' : ''}" data-avatar-speaker="${speakerId}" style="width:${size}px;height:${size}px;--speaker-color:${col};">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle class="av-pulse-ring" cx="32" cy="32" r="26" fill="none" stroke="${col}" stroke-opacity="0.4" stroke-width="1.2" ${isLow || isSecondary ? 'stroke-dasharray="4 3"' : ''} />
          <g${tilt}>
            <path d="${wave1}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round" />
            <path d="${wave2}" fill="none" stroke="${col}" stroke-opacity="0.52" stroke-width="1.3" stroke-linecap="round" />
          </g>
          ${isSecondary ? `<line x1="47" y1="13" x2="53" y2="19" stroke="${col}" stroke-width="1.6" stroke-linecap="round" />` : ''}
          <circle class="av-core" cx="32" cy="32" r="2.4" fill="${col}" />
        </svg>
      </div>
    `;
  }

  if (speakerId === 'player') {
    const col = getCharColor('player', '#eef0ec');
    return `
      <div class="${ampClass} avatar-player" data-avatar-speaker="${speakerId}" style="width:${size}px;height:${size}px;--speaker-color:${col};">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle class="av-pulse-ring" cx="32" cy="32" r="22" fill="none" stroke="${col}" stroke-opacity="0.45" stroke-width="1.2" />
          <circle cx="32" cy="32" r="11" fill="none" stroke="${col}" stroke-opacity="0.72" stroke-width="1.3" />
          <circle class="av-core" cx="32" cy="32" r="3" fill="${col}" />
        </svg>
      </div>
    `;
  }

  if (speakerId.startsWith('phantom_')) {
    const col = getDreamColor(speakerId, humanity);
    const glyphId = CHAR_MAP[speakerId]?.objectGlyph ?? 'chipped_mug';
    const rawHex = getCharColor(speakerId, '#e6b37e');
    return `
      <div class="${ampClass} avatar-dream ${isLow ? 'is-fractured' : ''}" data-avatar-speaker="${speakerId}" style="width:${size}px;height:${size}px;--speaker-color:${rawHex};">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle class="av-pulse-ring" cx="32" cy="32" r="26" fill="none" stroke="${col}" stroke-opacity="0.45" stroke-width="1.2" ${isLow ? 'stroke-dasharray="4 3"' : ''} />
          <circle cx="32" cy="32" r="20" fill="${col}" fill-opacity="0.08" stroke="${col}" stroke-opacity="0.28" stroke-width="1" />
          <g transform="translate(14,14) scale(1.5)">
            ${renderObjectGlyph(glyphId, col, 24).replace(/^<svg[^>]*>|<\/svg>$/g, '')}
          </g>
        </svg>
      </div>
    `;
  }

  // Psyche x3 & Narrator distinct micro-emblems
  const col = getCharColor(speakerId, '#7d90a3');
  let inner = `<rect x="24" y="24" width="16" height="16" fill="none" stroke="${col}" stroke-width="1.5" /><circle class="av-core" cx="32" cy="32" r="2.4" fill="${col}" />`;
  if (speakerId === 'psyche_warmth') {
    inner = `
      <circle class="av-pulse-ring" cx="32" cy="32" r="19" fill="${col}" fill-opacity="0.14" stroke="${col}" stroke-width="1.5" />
      <circle cx="32" cy="32" r="10" fill="none" stroke="${col}" stroke-opacity="0.72" stroke-width="1.2" />
      <circle class="av-core" cx="32" cy="32" r="3" fill="${col}" />`;
  } else if (speakerId === 'psyche_clinical') {
    inner = `
      <circle class="av-pulse-ring" cx="32" cy="32" r="21" fill="none" stroke="${col}" stroke-opacity="0.45" stroke-width="1.2" stroke-dasharray="3 3" />
      <line x1="16" y1="32" x2="48" y2="32" stroke="${col}" stroke-width="1.5" />
      <line x1="32" y1="16" x2="32" y2="48" stroke="${col}" stroke-width="1.5" />
      <rect x="26" y="26" width="12" height="12" fill="rgba(16,24,34,0.85)" stroke="${col}" stroke-width="1.4" />`;
  } else if (speakerId === 'psyche_horizon') {
    inner = `
      <polygon class="av-pulse-ring" points="32,12 49,22 49,42 32,52 15,42 15,22" fill="${col}" fill-opacity="0.12" stroke="${col}" stroke-width="1.4" />
      <line x1="15" y1="22" x2="49" y2="42" stroke="${col}" stroke-opacity="0.6" stroke-width="1.1" />
      <line x1="49" y1="22" x2="15" y2="42" stroke="${col}" stroke-opacity="0.6" stroke-width="1.1" />
      <circle class="av-core" cx="32" cy="32" r="2.8" fill="${col}" />`;
  }

  return `
    <div class="${ampClass} avatar-psyche" data-avatar-speaker="${speakerId}" style="width:${size}px;height:${size}px;--speaker-color:${col};">
      <svg viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>
    </div>
  `;
}

export function updateAvatarVoiceAnimations(
  root: HTMLElement,
  activeSpeaker: string | null,
  amplitude: number
): void {
  const prevSpeaking = root.querySelectorAll<HTMLElement>(
    '[data-avatar-speaker].is-speaking, [data-voice-dot-speaker].is-speaking'
  );
  for (const el of prevSpeaking) {
    const spk = el.dataset.avatarSpeaker ?? el.dataset.voiceDotSpeaker;
    if (activeSpeaker === null || spk !== activeSpeaker) {
      el.classList.remove('is-speaking');
      el.style.setProperty('--voice-amp', '0');
    }
  }
  if (activeSpeaker === null) return;

  const escaped = activeSpeaker.replace(/"/g, '\\"');
  const activeEls = root.querySelectorAll<HTMLElement>(
    `[data-avatar-speaker="${escaped}"], [data-voice-dot-speaker="${escaped}"]`
  );
  const ampStr = amplitude.toFixed(3);
  for (const el of activeEls) {
    el.classList.add('is-speaking');
    el.style.setProperty('--voice-amp', ampStr);
  }
}
