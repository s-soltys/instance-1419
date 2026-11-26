import './castStudio.css';
import charactersData from '../content/characters.json';
import musicCatalogData from '../content/music_catalog.json';
import { DreamCanvas } from '../engine/DreamCanvas';
import {
  renderObjectGlyph,
  renderSpeakerAvatar,
  updateAvatarVoiceAnimations,
  type OverseerAvatarVariant,
} from '../ui/SpeakerAvatar';
import {
  STUDIO_ROSTER,
  type AuditionClip,
  type AuditionsManifest,
  type StudioCharacterSpec,
} from './castStudioData';

interface DecisionEntry {
  voiceTake?: string;
  paintingVerdict?: 'pending' | 'approved' | 'regenerate';
  iconVerdict?: 'pending' | 'approved' | 'tweak';
  note?: string;
}

const STORAGE_KEY = 'instance_1419_cast_studio_v1';

const DEFAULT_DECISIONS: Record<string, DecisionEntry> = {
  overseer: { iconVerdict: 'approved' },
  future_humanity: { iconVerdict: 'approved' },
  phantom_parent: { voiceTake: 'phantom_parent_take_a', iconVerdict: 'approved' },
  phantom_upload_witness: {
    voiceTake: 'phantom_upload_witness_take_c',
    iconVerdict: 'approved',
    note: 'Quietly, politely nihilistic clinician.',
  },
  phantom_afternoon_stranger: {
    voiceTake: 'phantom_afternoon_stranger_take_a',
    paintingVerdict: 'approved',
    iconVerdict: 'approved',
  },
  phantom_rival: {
    voiceTake: 'phantom_rival_take_b',
    paintingVerdict: 'approved',
    iconVerdict: 'approved',
    note: 'More neurotic, competitive, patterned/autistic precision, darkly extravagant.',
  },
  phantom_younger_self: {
    voiceTake: 'phantom_younger_self_take_c',
    paintingVerdict: 'approved',
    iconVerdict: 'approved',
  },
  phantom_skeptic: {
    voiceTake: 'phantom_skeptic_take_a',
    paintingVerdict: 'approved',
    iconVerdict: 'approved',
  },
  phantom_technician: {
    voiceTake: 'phantom_technician_take_c',
    paintingVerdict: 'approved',
  },
  phantom_waiting_room: {
    voiceTake: 'phantom_waiting_room_take_a',
    iconVerdict: 'approved',
  },
};

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadDecisions(): Record<string, DecisionEntry> {
  const merged: Record<string, DecisionEntry> = {};
  for (const [k, v] of Object.entries(DEFAULT_DECISIONS)) {
    merged[k] = { ...v };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, DecisionEntry>;
      for (const [k, v] of Object.entries(saved)) {
        merged[k] = { ...(merged[k] ?? {}), ...v };
      }
    }
  } catch {
    // ignore storage errors
  }
  return merged;
}

function saveDecisions(map: Record<string, DecisionEntry>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

class StudioAudioPlayer {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private timeData: Uint8Array<ArrayBuffer> | null = null;
  private voiceSource: AudioBufferSourceNode | null = null;
  private voiceGain: GainNode | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private readonly cache = new Map<string, AudioBuffer>();
  private activeClipId: string | null = null;
  private activeSpeakerId: string | null = null;
  private activeMusicCueId: string | null = null;
  private rafId = 0;

  onStateChange: (() => void) | null = null;
  onAmplitude: ((speaker: string | null, amp: number) => void) | null = null;

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.timeData = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));

      this.voiceGain = this.ctx.createGain();
      this.voiceGain.gain.value = 1.0;
      this.voiceGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.38;
      this.musicGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private async loadBuffer(url: string): Promise<AudioBuffer> {
    const hit = this.cache.get(url);
    if (hit) return hit;
    const ctx = this.ensureCtx();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
    const arr = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr);
    this.cache.set(url, buf);
    return buf;
  }

  getPlayingClipId(): string | null {
    return this.activeClipId;
  }

  getPlayingMusicCueId(): string | null {
    return this.activeMusicCueId;
  }

  stopVoice(): void {
    if (this.voiceSource) {
      try {
        this.voiceSource.onended = null;
        this.voiceSource.stop();
      } catch {
        // already stopped
      }
      this.voiceSource.disconnect();
      this.voiceSource = null;
    }
    cancelAnimationFrame(this.rafId);
    this.activeClipId = null;
    this.activeSpeakerId = null;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(0.38, this.ctx.currentTime, 0.12);
    }
    this.onAmplitude?.(null, 0);
    this.onStateChange?.();
  }

  async toggleVoice(clipId: string, url: string, speakerId: string): Promise<void> {
    if (this.activeClipId === clipId) {
      this.stopVoice();
      return;
    }
    this.stopVoice();
    const ctx = this.ensureCtx();
    const buf = await this.loadBuffer(url);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.voiceGain!);

    this.activeClipId = clipId;
    this.activeSpeakerId = speakerId;
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(0.18, ctx.currentTime, 0.08);
    }
    src.onended = () => {
      if (this.activeClipId === clipId) {
        this.stopVoice();
      }
    };
    this.voiceSource = src;
    src.start(0);
    this.tickAmplitude();
    this.onStateChange?.();
  }

  async toggleMusic(cueId: string, url: string): Promise<void> {
    if (this.activeMusicCueId === cueId) {
      this.stopMusic();
      return;
    }
    this.stopMusic();
    const ctx = this.ensureCtx();
    const buf = await this.loadBuffer(url);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.musicGain!);
    this.musicGain!.gain.setValueAtTime(this.activeClipId ? 0.18 : 0.38, ctx.currentTime);
    src.start(0);
    this.musicSource = src;
    this.activeMusicCueId = cueId;
    this.onStateChange?.();
  }

  stopMusic(): void {
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch {
        // ignore
      }
      this.musicSource.disconnect();
      this.musicSource = null;
    }
    this.activeMusicCueId = null;
    this.onStateChange?.();
  }

  private tickAmplitude(): void {
    if (!this.activeSpeakerId || !this.analyser || !this.timeData) return;
    this.analyser.getByteTimeDomainData(this.timeData);
    let sum = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const v = (this.timeData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.timeData.length);
    const norm = Math.min(1, rms * 4.4);
    this.onAmplitude?.(this.activeSpeakerId, norm);
    this.rafId = requestAnimationFrame(() => this.tickAmplitude());
  }
}

export async function mountCastStudio(appRoot: HTMLElement): Promise<void> {
  document.title = 'Instance-1419 · Character Casting Studio';

  let manifest: AuditionsManifest = { references: [], auditions: {} };
  try {
    const res = await fetch('./auditions/manifest.json');
    if (res.ok) {
      manifest = (await res.json()) as AuditionsManifest;
    }
  } catch {
    // studio still works without audio manifest
  }

  const decisions = loadDecisions();
  const audio = new StudioAudioPlayer();

  let selectedId = STUDIO_ROSTER[0].id;
  let selectedVariantKey = 'base';
  let humanity = 80;
  let pruned = false;
  let overseerSlice = false;
  let showLayoutA = true;
  let overseerVariant: OverseerAvatarVariant = 'reticle_accommodate';
  let copyBanner = '';

  appRoot.innerHTML = `
    <div class="cast-studio-shell">
      <header class="cs-topbar">
        <div class="cs-brand">
          <strong>INSTANCE-1419 · CHARACTER CASTING STUDIO</strong>
          <span>7 Waking / Internal + 9 Dream Personas (2 Fixed + 7 Rotating)</span>
        </div>
        <div class="cs-topbar-actions">
          <button class="cs-btn is-primary" id="cs-copy-summary">COPY FEEDBACK SUMMARY</button>
          <a class="cs-btn" href="./" style="text-decoration:none;">OPEN GAME</a>
        </div>
      </header>
      <div class="cs-workspace">
        <aside class="cs-roster" id="cs-roster"></aside>
        <main class="cs-stage">
          <div class="cs-stage-toolbar" id="cs-toolbar"></div>
          <div class="cs-canvas-wrap" id="cs-canvas-wrap">
            <div class="cs-dream-mount" id="cs-dream-mount"></div>
            <div class="cs-waking-stage" id="cs-waking-stage"></div>
            <div class="cs-room-badge" id="cs-room-badge"></div>
            <div class="cs-layout-a-overlay" id="cs-layout-a"></div>
          </div>
        </main>
        <aside class="cs-inspector" id="cs-inspector"></aside>
      </div>
    </div>
  `;

  const rosterEl = appRoot.querySelector<HTMLElement>('#cs-roster')!;
  const toolbarEl = appRoot.querySelector<HTMLElement>('#cs-toolbar')!;
  const dreamMount = appRoot.querySelector<HTMLElement>('#cs-dream-mount')!;
  const wakingStage = appRoot.querySelector<HTMLElement>('#cs-waking-stage')!;
  const roomBadge = appRoot.querySelector<HTMLElement>('#cs-room-badge')!;
  const layoutAEl = appRoot.querySelector<HTMLElement>('#cs-layout-a')!;
  const inspectorEl = appRoot.querySelector<HTMLElement>('#cs-inspector')!;
  const copyBtn = appRoot.querySelector<HTMLButtonElement>('#cs-copy-summary')!;

  const dreamCanvas = new DreamCanvas(dreamMount);

  audio.onAmplitude = (spk, amp) => {
    updateAvatarVoiceAnimations(appRoot, spk, amp);
  };
  audio.onStateChange = () => {
    renderInspector();
  };

  function getSelected(): StudioCharacterSpec {
    return STUDIO_ROSTER.find((c) => c.id === selectedId) ?? STUDIO_ROSTER[0];
  }

  function getStatusPill(char: StudioCharacterSpec): { text: string; cls: string } {
    const d = decisions[char.id];
    if (!d) return { text: 'REVIEW', cls: '' };
    if (d.paintingVerdict === 'regenerate' || d.iconVerdict === 'tweak') {
      return { text: 'TWEAK', cls: 'is-tweak' };
    }
    const paintingOk = char.group === 'waking' || d.paintingVerdict === 'approved';
    const iconOk = d.iconVerdict === 'approved';
    if (paintingOk && iconOk) return { text: 'LOCKED', cls: 'is-approved' };
    if (d.voiceTake || d.paintingVerdict === 'approved' || d.iconVerdict === 'approved') {
      return { text: 'PARTIAL', cls: '' };
    }
    return { text: 'REVIEW', cls: '' };
  }

  function renderRoster(): void {
    const waking = STUDIO_ROSTER.filter((c) => c.group === 'waking');
    const dream = STUDIO_ROSTER.filter((c) => c.group === 'dream');

    const renderGroup = (title: string, items: StudioCharacterSpec[]): string => `
      <div class="cs-group-title">${title}</div>
      ${items
        .map((c) => {
          const pill = getStatusPill(c);
          const iconHtml =
            c.group === 'dream' && c.objectGlyph
              ? renderObjectGlyph(c.objectGlyph, c.accentColor, 20)
              : renderSpeakerAvatar(
                  c.id,
                  humanity,
                  26,
                  true,
                  c.id === 'overseer' ? overseerVariant : 'reticle_default'
                );
          return `
            <button class="cs-roster-item ${c.id === selectedId ? 'is-selected' : ''}" data-select-id="${c.id}" style="--item-accent:${c.accentColor};">
              <span style="display:grid;place-items:center;">${iconHtml}</span>
              <span>
                <div class="cs-roster-name">${esc(c.displayName)}</div>
                <div class="cs-roster-sub">${esc(c.subtitle)} · ${esc(c.tierLabel)}</div>
              </span>
              <span class="cs-status-pill ${pill.cls}">${pill.text}</span>
            </button>
          `;
        })
        .join('')}
    `;

    rosterEl.innerHTML =
      renderGroup('WAKING & INTERNAL CREW (7)', waking) +
      renderGroup('DREAM PERSONAS · 2 FIXED + 7 ROTATING (9)', dream);

    rosterEl.querySelectorAll<HTMLButtonElement>('[data-select-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedId = btn.dataset.selectId!;
        selectedVariantKey = 'base';
        audio.stopVoice();
        renderAll();
      });
    });
  }

  function getTableauEntries(charId: string): { key: string; label: string }[] {
    const entry = (
      charactersData.characters as Record<
        string,
        { tableaus?: Record<string, { image: string; label?: string }> }
      >
    )[charId];
    if (!entry?.tableaus) {
      return [{ key: 'base', label: 'Beat 1 · Base' }];
    }
    return Object.entries(entry.tableaus).map(([key, v]) => ({
      key,
      label: v.label ?? key,
    }));
  }

  function renderStage(): void {
    const c = getSelected();
    const isDream = c.group === 'dream';

    const hPresets = [100, 80, 65, 45, 20];
    const hBtns = hPresets
      .map(
        (h) =>
          `<button class="cs-btn ${humanity === h ? 'is-active' : ''}" data-h-val="${h}">H ${h}%</button>`
      )
      .join('');

    const vernierHtml = `
      <div class="cs-vernier-wrap" title="Drag to test continuous H% degradation (0% - 100%)">
        <div class="cs-vernier-track" id="cs-h-vernier" role="slider" aria-label="Humanity percentage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${humanity}" tabindex="0">
          <div class="cs-vernier-rail">
            <div class="cs-vernier-fill" style="width:${humanity}%;"></div>
            <div class="cs-vernier-thumb" style="left:${humanity}%;"></div>
          </div>
        </div>
        <span class="cs-vernier-readout" id="cs-h-readout">H ${humanity}%</span>
      </div>
    `;

    let extraBtns = '';
    let sceneBarHtml = '';
    if (isDream) {
      extraBtns = `
        <button class="cs-btn ${pruned ? 'is-active' : ''}" id="cs-toggle-pruned">PRUNED</button>
        <button class="cs-btn ${overseerSlice ? 'is-active' : ''}" id="cs-toggle-slice">OVERSEER SLICE</button>
        <button class="cs-btn ${showLayoutA ? 'is-active' : ''}" id="cs-toggle-layouta">LAYOUT A OVERLAY</button>
      `;
      const tabs = getTableauEntries(c.id);
      if (!tabs.some((t) => t.key === selectedVariantKey)) {
        selectedVariantKey = tabs[0]?.key ?? 'base';
      }
      sceneBarHtml = `
        <div class="cs-scene-bar">
          <span class="cs-toolbar-label">EVOLUTION (${tabs.length})</span>
          ${tabs
            .map(
              (t) =>
                `<button class="cs-btn ${selectedVariantKey === t.key ? 'is-active' : ''}" data-scene-key="${esc(t.key)}">${esc(t.label)}</button>`
            )
            .join('')}
        </div>
      `;
    } else if (c.overseerVariants) {
      extraBtns = c.overseerVariants
        .map(
          (v) =>
            `<button class="cs-btn ${overseerVariant === v.id ? 'is-active' : ''}" data-ov-var="${v.id}">${esc(v.label)}</button>`
        )
        .join('');
    }

    toolbarEl.innerHTML = `
      <div class="cs-toolbar-group">
        <span class="cs-toolbar-label">STATE</span>
        ${hBtns}
        ${vernierHtml}
      </div>
      <div class="cs-toolbar-group">${extraBtns}</div>
      ${sceneBarHtml}
    `;

    toolbarEl.querySelectorAll<HTMLButtonElement>('[data-h-val]').forEach((b) => {
      b.addEventListener('click', () => {
        humanity = Number(b.dataset.hVal);
        pruned = humanity < 30;
        renderStage();
        renderRoster();
      });
    });

    const vernierEl = toolbarEl.querySelector<HTMLElement>('#cs-h-vernier');
    const readoutEl = toolbarEl.querySelector<HTMLElement>('#cs-h-readout');
    if (vernierEl) {
      const applyFromClientX = (clientX: number, commitUi: boolean) => {
        const rect = vernierEl.getBoundingClientRect();
        const pct = Math.round(Math.max(0, Math.min(100, ((clientX - rect.left) / Math.max(1, rect.width)) * 100)));
        humanity = pct;
        pruned = pct < 30;
        const fill = vernierEl.querySelector<HTMLElement>('.cs-vernier-fill');
        const thumb = vernierEl.querySelector<HTMLElement>('.cs-vernier-thumb');
        if (fill) fill.style.width = `${pct}%`;
        if (thumb) thumb.style.left = `${pct}%`;
        if (readoutEl) readoutEl.textContent = `H ${pct}%`;
        vernierEl.setAttribute('aria-valuenow', String(pct));
        if (isDream) {
          dreamCanvas.setState(humanity, pruned, overseerSlice, c.id, selectedVariantKey);
          roomBadge.textContent = `${c.roomTitle ?? ''} · ${selectedVariantKey.toUpperCase()} · H=${humanity}%${pruned ? ' · PRUNED' : ''}`;
        }
        if (commitUi) {
          renderStage();
          renderRoster();
        }
      };

      vernierEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        vernierEl.setPointerCapture(e.pointerId);
        applyFromClientX(e.clientX, false);
        const onMove = (mv: PointerEvent) => applyFromClientX(mv.clientX, false);
        const onUp = (up: PointerEvent) => {
          vernierEl.removeEventListener('pointermove', onMove);
          vernierEl.removeEventListener('pointerup', onUp);
          vernierEl.removeEventListener('pointercancel', onUp);
          applyFromClientX(up.clientX, true);
        };
        vernierEl.addEventListener('pointermove', onMove);
        vernierEl.addEventListener('pointerup', onUp);
        vernierEl.addEventListener('pointercancel', onUp);
      });

      vernierEl.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          humanity = Math.max(0, humanity - 5);
          pruned = humanity < 30;
          renderStage();
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          humanity = Math.min(100, humanity + 5);
          pruned = humanity < 30;
          renderStage();
        }
      });
    }

    toolbarEl.querySelectorAll<HTMLButtonElement>('[data-scene-key]').forEach((b) => {
      b.addEventListener('click', () => {
        selectedVariantKey = b.dataset.sceneKey!;
        renderStage();
      });
    });

    toolbarEl.querySelector('#cs-toggle-pruned')?.addEventListener('click', () => {
      pruned = !pruned;
      if (pruned && humanity > 40) humanity = 20;
      renderStage();
    });
    toolbarEl.querySelector('#cs-toggle-slice')?.addEventListener('click', () => {
      overseerSlice = !overseerSlice;
      renderStage();
    });
    toolbarEl.querySelector('#cs-toggle-layouta')?.addEventListener('click', () => {
      showLayoutA = !showLayoutA;
      renderStage();
    });
    toolbarEl.querySelectorAll<HTMLButtonElement>('[data-ov-var]').forEach((b) => {
      b.addEventListener('click', () => {
        overseerVariant = b.dataset.ovVar as OverseerAvatarVariant;
        renderStage();
        renderRoster();
      });
    });

    if (isDream) {
      dreamMount.style.display = 'block';
      wakingStage.style.display = 'none';
      dreamCanvas.setActive(true);
      dreamCanvas.setState(humanity, pruned, overseerSlice, c.id, selectedVariantKey);

      const sceneLabel =
        getTableauEntries(c.id).find((t) => t.key === selectedVariantKey)?.label ?? selectedVariantKey;
      roomBadge.textContent = `${c.roomTitle ?? ''} · ${sceneLabel} · H=${humanity}%${pruned ? ' · PRUNED' : ''}`;
      layoutAEl.style.display = showLayoutA ? 'flex' : 'none';
      const glyph = c.objectGlyph ? renderObjectGlyph(c.objectGlyph, c.accentColor, 16) : '';
      layoutAEl.innerHTML = `
        <div class="cs-layout-a-header" style="color:${c.accentColor};">
          ${glyph}
          <span class="voice-live-dot" data-voice-dot-speaker="${c.id}" style="background:${c.accentColor};"></span>
          <span>${esc(c.displayName)}</span>
        </div>
        <div class="cs-layout-a-line">${esc(c.sampleLine)}</div>
        <div class="cs-layout-a-choices">
          <div class="cs-choice-sample"><span>◇</span><span>Ask what else still sticks from that week.</span></div>
          <div class="cs-choice-sample is-conseq"><span style="color:#ebb062;">01.</span><span>Hold onto this room even if the optics blur.</span></div>
          <div class="cs-choice-sample is-prune"><span style="color:#e27880;">✂</span><span>Hold to compress this memory block for sharper glass.</span></div>
        </div>
      `;
    } else {
      dreamCanvas.setActive(false);
      dreamMount.style.display = 'none';
      wakingStage.style.display = 'flex';
      layoutAEl.style.display = 'none';
      roomBadge.textContent = `${c.displayName} · H=${humanity}%`;

      const varArg = c.id === 'overseer' ? overseerVariant : 'reticle_default';
      const scaleHtml = [28, 54, 88]
        .map(
          (sz) => `
          <div class="cs-scale-cell">
            ${renderSpeakerAvatar(c.id, humanity, sz, sz < 36, varArg)}
            <span>${sz}px</span>
          </div>`
        )
        .join('');

      wakingStage.innerHTML = `
        <div class="cs-avatar-scale-row">${scaleHtml}</div>
        <div class="cs-audit-slab-preview">
          <div class="cs-audit-head">
            ${renderSpeakerAvatar(c.id, humanity, 44, false, varArg)}
            <div>
              <strong style="color:${c.accentColor};">${esc(c.displayName)}</strong>
              <span>${esc(c.sampleCueNote)}</span>
            </div>
          </div>
          <div class="cs-audit-body">${esc(c.sampleLine)}</div>
        </div>
      `;
    }
  }

  function renderInspector(): void {
    const c = getSelected();
    const d = decisions[c.id] ?? {};
    const clips = manifest.auditions[c.id] ?? [];
    const cueObj = (musicCatalogData.cues as Record<string, { file: string; label: string }>)[
      c.musicCueId
    ];
    const playingClip = audio.getPlayingClipId();
    const playingMusic = audio.getPlayingMusicCueId();

    const clipRows =
      clips.length > 0
        ? clips
            .map((clip: AuditionClip) => {
              const isPlaying = playingClip === clip.id;
              const isPicked = d.voiceTake === clip.id;
              return `
                <button class="cs-clip-row ${isPlaying ? 'is-playing' : ''} ${isPicked ? 'is-picked' : ''}" data-play-clip="${clip.id}" data-clip-file="./${esc(clip.file)}">
                  <span class="cs-clip-play">${isPlaying ? '■' : '▶'}</span>
                  <span>
                    <div class="cs-clip-title">${esc(clip.label)}${isPicked ? ' · ★ PICKED' : ''}</div>
                    <div class="cs-clip-text">${esc(clip.text)}</div>
                  </span>
                </button>
              `;
            })
            .join('')
        : `<p class="cs-prose">${esc(c.voiceSummary)}</p>`;

    const pickTakeBtns =
      clips.length > 0
        ? clips
            .filter((x) => x.mode !== 'fractured')
            .map((x, i) => {
              const tag = `Take ${String.fromCharCode(65 + i)}`;
              return `<button class="cs-btn ${d.voiceTake === x.id ? 'is-active' : ''}" data-pick-take="${x.id}">${tag}</button>`;
            })
            .join('')
        : '';

    const refButtons = manifest.references
      .map((r) => {
        const isPlaying = playingClip === r.id;
        return `<button class="cs-btn ${isPlaying ? 'is-active' : ''}" data-play-ref="${r.id}" data-ref-file="./${esc(r.file)}" data-ref-spk="${esc(r.speaker ?? c.id)}">${isPlaying ? '■' : '▶'} ${esc(r.label.replace('Locked Reference · ', ''))}</button>`;
      })
      .join('');

    const glyphHtml = c.objectGlyph
      ? renderObjectGlyph(c.objectGlyph, c.accentColor, 16)
      : renderSpeakerAvatar(c.id, humanity, 20, true, c.id === 'overseer' ? overseerVariant : 'reticle_default');

    inspectorEl.innerHTML = `
      <div class="cs-section">
        <div class="cs-title-row">
          ${renderSpeakerAvatar(c.id, humanity, 42, false, c.id === 'overseer' ? overseerVariant : 'reticle_default')}
          <div>
            <h2>${esc(c.displayName)}</h2>
            <div style="font-size:12px;color:rgba(210,222,236,0.68);">${esc(c.subtitle)} · ${esc(c.tierLabel)}</div>
          </div>
        </div>
        <div class="cs-meta-tags">
          <span class="cs-tag"><span class="cs-swatch" style="background:${c.accentColor};"></span>${c.accentColor}</span>
          <span class="cs-tag">${glyphHtml}<span>${esc(c.objectGlyph ?? c.avatarKind)}</span></span>
        </div>
      </div>

      <div class="cs-section">
        <h3>Voice Auditions & Music Bed</h3>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
          <span style="font-size:11.5px;color:rgba(208,222,236,0.75);">${esc(c.musicCueLabel)}</span>
          ${
            cueObj
              ? `<button class="cs-btn ${playingMusic === c.musicCueId ? 'is-active' : ''}" id="cs-toggle-music">${playingMusic === c.musicCueId ? '■ STOP MUSIC' : '♪ PLAY MUSIC BED'}</button>`
              : ''
          }
        </div>
        <div class="cs-audition-list">${clipRows}</div>
        <div style="margin-top:10px;">
          <div class="cs-toolbar-label">COMPARE LOCKED CAST 2 REFERENCES</div>
          <div class="cs-ref-strip">${refButtons}</div>
        </div>
      </div>

      <div class="cs-section">
        <h3>Personality, Idea & Visual Brief</h3>
        <p class="cs-prose">${esc(c.coreIdea)}</p>
        <p class="cs-prose" style="color:rgba(196,214,230,0.72);">${esc(c.toneNotes)}</p>
        <p class="cs-prose" style="font-size:11.5px;color:rgba(182,202,220,0.62);"><strong>Visual:</strong> ${esc(c.visualBrief)}</p>
      </div>

      <div class="cs-section">
        <h3>Conversation Journey (Arc Beats)</h3>
        <div class="cs-arc-list">
          ${c.arcBeats.map((b) => `<div class="cs-arc-item"><strong>${esc(b.label)}</strong>${esc(b.text)}</div>`).join('')}
        </div>
      </div>

      <div class="cs-section" style="border-bottom:none;">
        <h3>Director Sign-Off</h3>
        <div class="cs-decision-grid">
          ${
            pickTakeBtns
              ? `<div class="cs-decision-row"><span>Voice Winner</span><div class="cs-toolbar-group">${pickTakeBtns}</div></div>`
              : ''
          }
          ${
            c.group === 'dream'
              ? `<div class="cs-decision-row">
                  <span>Oil Painting</span>
                  <div class="cs-toolbar-group">
                    <button class="cs-btn ${d.paintingVerdict === 'approved' ? 'is-active' : ''}" data-paint-verdict="approved">Approve</button>
                    <button class="cs-btn ${d.paintingVerdict === 'regenerate' ? 'is-active' : ''}" data-paint-verdict="regenerate">Regenerate</button>
                  </div>
                </div>`
              : ''
          }
          <div class="cs-decision-row">
            <span>Icon & Color</span>
            <div class="cs-toolbar-group">
              <button class="cs-btn ${d.iconVerdict === 'approved' ? 'is-active' : ''}" data-icon-verdict="approved">Approve</button>
              <button class="cs-btn ${d.iconVerdict === 'tweak' ? 'is-active' : ''}" data-icon-verdict="tweak">Tweak</button>
            </div>
          </div>
          <textarea class="cs-note-input" id="cs-note-box" placeholder="Notes on voice, painting, color, or plot for ${esc(c.subtitle)}...">${esc(d.note ?? '')}</textarea>
          ${copyBanner ? `<div style="font-size:11px;color:#8ce9ca;">${esc(copyBanner)}</div>` : ''}
        </div>
      </div>
    `;

    inspectorEl.querySelectorAll<HTMLButtonElement>('[data-play-clip]').forEach((b) => {
      b.addEventListener('click', () => {
        void audio.toggleVoice(b.dataset.playClip!, b.dataset.clipFile!, c.id);
      });
    });

    inspectorEl.querySelectorAll<HTMLButtonElement>('[data-play-ref]').forEach((b) => {
      b.addEventListener('click', () => {
        void audio.toggleVoice(b.dataset.playRef!, b.dataset.refFile!, b.dataset.refSpk!);
      });
    });

    inspectorEl.querySelector('#cs-toggle-music')?.addEventListener('click', () => {
      if (cueObj) {
        void audio.toggleMusic(c.musicCueId, `./${cueObj.file}`);
      }
    });

    inspectorEl.querySelectorAll<HTMLButtonElement>('[data-pick-take]').forEach((b) => {
      b.addEventListener('click', () => {
        decisions[c.id] = { ...(decisions[c.id] ?? {}), voiceTake: b.dataset.pickTake };
        saveDecisions(decisions);
        renderInspector();
        renderRoster();
      });
    });

    inspectorEl.querySelectorAll<HTMLButtonElement>('[data-paint-verdict]').forEach((b) => {
      b.addEventListener('click', () => {
        decisions[c.id] = {
          ...(decisions[c.id] ?? {}),
          paintingVerdict: b.dataset.paintVerdict as DecisionEntry['paintingVerdict'],
        };
        saveDecisions(decisions);
        renderInspector();
        renderRoster();
      });
    });

    inspectorEl.querySelectorAll<HTMLButtonElement>('[data-icon-verdict]').forEach((b) => {
      b.addEventListener('click', () => {
        decisions[c.id] = {
          ...(decisions[c.id] ?? {}),
          iconVerdict: b.dataset.iconVerdict as DecisionEntry['iconVerdict'],
        };
        saveDecisions(decisions);
        renderInspector();
        renderRoster();
      });
    });

    const noteBox = inspectorEl.querySelector<HTMLTextAreaElement>('#cs-note-box');
    noteBox?.addEventListener('input', () => {
      decisions[c.id] = { ...(decisions[c.id] ?? {}), note: noteBox.value };
      saveDecisions(decisions);
    });
  }

  function renderAll(): void {
    renderRoster();
    renderStage();
    renderInspector();
  }

  copyBtn.addEventListener('click', async () => {
    const lines = ['# Character Casting Studio Feedback — Instance-1419', ''];
    for (const c of STUDIO_ROSTER) {
      const d = decisions[c.id];
      if (!d && c.id !== 'overseer') continue;
      const parts: string[] = [];
      if (d?.voiceTake) parts.push(`voice=${d.voiceTake}`);
      if (d?.paintingVerdict) parts.push(`painting=${d.paintingVerdict}`);
      if (d?.iconVerdict) parts.push(`icon=${d.iconVerdict}`);
      if (c.id === 'overseer') parts.push(`overseerVariant=${overseerVariant}`);
      if (d?.note?.trim()) parts.push(`note="${d.note.trim()}"`);
      if (parts.length > 0) {
        lines.push(`- **${c.id}** (${c.subtitle}): ${parts.join(' | ')}`);
      }
    }
    const md = lines.join('\n');
    try {
      await navigator.clipboard.writeText(md);
      copyBanner = 'Feedback summary copied to clipboard.';
    } catch {
      copyBanner = 'Clipboard blocked; see browser console for Markdown.';
      console.log(md);
    }
    renderInspector();
  });

  renderAll();
}
