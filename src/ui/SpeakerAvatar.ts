export function renderSpeakerAvatar(
  speakerId: string,
  humanity = 70,
  size = 54,
  compact = false
): string {
  const isLow = humanity < 45;
  const isMid = humanity >= 45 && humanity < 70;
  const ampClass = compact ? 'speaker-avatar compact' : 'speaker-avatar';

  if (speakerId === 'overseer') {
    return `
      <div class="${ampClass} avatar-overseer" data-avatar-speaker="${speakerId}" style="width:${size}px;height:${size}px;">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="27" fill="none" stroke="rgba(220,236,248,0.38)" stroke-width="1.2" />
          <circle class="av-pulse-ring" cx="32" cy="32" r="22" fill="none" stroke="rgba(220,236,248,0.65)" stroke-width="1.2" stroke-dasharray="6 4" />
          <polygon points="32,12 49,22 49,42 32,52 15,42 15,22" fill="rgba(18,28,38,0.85)" stroke="#dceaf5" stroke-width="1.4" />
          <circle class="av-iris" cx="32" cy="32" r="8.5" fill="none" stroke="#9ecae8" stroke-width="1.6" />
          <circle class="av-core" cx="32" cy="32" r="3.2" fill="#ffffff" />
        </svg>
      </div>
    `;
  }

  if (speakerId === 'future_humanity') {
    return `
      <div class="${ampClass} avatar-future" data-avatar-speaker="${speakerId}" style="width:${size}px;height:${size}px;">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle class="av-pulse-ring" cx="32" cy="32" r="26" fill="none" stroke="rgba(255,216,138,0.35)" stroke-width="1" />
          <circle cx="32" cy="32" r="18" fill="none" stroke="rgba(255,216,138,0.6)" stroke-width="1.2" stroke-dasharray="2 4" />
          <path d="M32 10 L35 29 L54 32 L35 35 L32 54 L29 35 L10 32 L29 29 Z" fill="rgba(255,216,138,0.88)" />
          <circle class="av-core" cx="32" cy="32" r="4" fill="#ffffff" />
        </svg>
      </div>
    `;
  }

  if (speakerId === 'archive_echo') {
    return `
      <div class="${ampClass} avatar-archive" data-avatar-speaker="${speakerId}" style="width:${size}px;height:${size}px;">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <rect x="10" y="10" width="44" height="44" rx="4" fill="rgba(16,20,26,0.9)" stroke="rgba(143,152,166,0.55)" stroke-width="1.2" stroke-dasharray="4 3" />
          <line x1="16" y1="24" x2="48" y2="24" stroke="rgba(170,184,200,0.6)" stroke-width="1.6" />
          <line x1="16" y1="32" x2="42" y2="32" stroke="rgba(170,184,200,0.42)" stroke-width="1.6" />
          <line x1="16" y1="40" x2="36" y2="40" stroke="rgba(170,184,200,0.28)" stroke-width="1.6" />
          <circle class="av-pulse-ring" cx="44" cy="40" r="4" fill="#9eaab8" />
        </svg>
      </div>
    `;
  }

  if (speakerId === 'phantom_spouse') {
    const col = isLow ? '#7ec8e8' : isMid ? '#d9c6aa' : '#f2be7a';
    const split = isLow ? 3.5 : 0;
    return `
      <div class="${ampClass} avatar-spouse ${isLow ? 'is-fractured' : ''}" data-avatar-speaker="${speakerId}" style="width:${size}px;height:${size}px;">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle class="av-pulse-ring" cx="32" cy="32" r="26" fill="none" stroke="${col}" stroke-opacity="0.45" stroke-width="1.2" />
          <circle cx="${32 - split}" cy="24" r="9" fill="none" stroke="${col}" stroke-width="1.6" />
          <path d="M${17 + split} 50 C19 38, 45 38, ${47 - split} 50" fill="none" stroke="${col}" stroke-width="1.6" />
          ${
            isLow
              ? '<line x1="12" y1="22" x2="52" y2="30" stroke="#7ec8e8" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="3 3" />'
              : '<circle cx="32" cy="24" r="14" fill="' + col + '" fill-opacity="0.12" />'
          }
        </svg>
      </div>
    `;
  }

  if (speakerId === 'sibling_primary' || speakerId === 'player') {
    const isPeer = speakerId === 'sibling_primary';
    const col = isLow ? '#7ec8e8' : isPeer ? '#7cd6b8' : '#ebb062';
    const shard = isLow ? 'stroke-dasharray="4 3"' : '';
    return `
      <div class="${ampClass} ${isPeer ? 'avatar-sibling' : 'avatar-player'} ${isLow ? 'is-fractured' : ''}" data-avatar-speaker="${speakerId}" style="width:${size}px;height:${size}px;">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle class="av-pulse-ring" cx="32" cy="32" r="27" fill="none" stroke="${col}" stroke-opacity="0.45" stroke-width="1.3" ${shard} />
          ${
            isLow
              ? `<polygon points="32,14 44,26 39,46 25,46 20,26" fill="rgba(14,24,34,0.85)" stroke="${col}" stroke-width="1.4" />
                 <line x1="22" y1="30" x2="42" y2="30" stroke="${col}" stroke-width="1.3" />`
              : `<circle cx="32" cy="25" r="8.5" fill="${col}" fill-opacity="0.16" stroke="${col}" stroke-width="1.6" />
                 <path d="M18 49 C21 38, 43 38, 46 49" fill="${col}" fill-opacity="0.12" stroke="${col}" stroke-width="1.6" />`
          }
          <circle class="av-core" cx="32" cy="25" r="2.2" fill="${col}" />
        </svg>
      </div>
    `;
  }

  // Psyche & Narrator mini-icons
  const toneColor =
    speakerId === 'psyche_warmth'
      ? '#ebad5c'
      : speakerId === 'psyche_horizon'
        ? '#c9a4f2'
        : speakerId === 'psyche_clinical'
          ? '#7ec2e0'
          : '#8fa7bc';

  return `
    <div class="${ampClass} avatar-psyche" data-avatar-speaker="${speakerId}" style="width:${size}px;height:${size}px;">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle class="av-pulse-ring" cx="32" cy="32" r="22" fill="none" stroke="${toneColor}" stroke-opacity="0.55" stroke-width="1.4" />
        <polygon points="32,16 46,32 32,48 18,32" fill="${toneColor}" fill-opacity="0.18" stroke="${toneColor}" stroke-width="1.4" />
        <circle class="av-core" cx="32" cy="32" r="3" fill="${toneColor}" />
      </svg>
    </div>
  `;
}

export function updateAvatarVoiceAnimations(
  root: HTMLElement,
  activeSpeaker: string | null,
  amplitude: number
): void {
  const els = root.querySelectorAll<HTMLElement>('[data-avatar-speaker]');
  for (const el of els) {
    const isSpeaking = activeSpeaker !== null && el.dataset.avatarSpeaker === activeSpeaker;
    el.classList.toggle('is-speaking', isSpeaking);
    el.style.setProperty('--voice-amp', isSpeaking ? amplitude.toFixed(3) : '0');
  }
}
