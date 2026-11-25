import musicCatalogJson from '../../content/music_catalog.json';
import type { GameMode } from '../StateStore';

export interface MusicMixConfig {
  musicBaseGain: number;
  crossfadeSec: number;
  pruneSnapSec: number;
  warmFullH: number;
  coldFullH: number;
}

export interface ColdStemEntry {
  id: string;
  label: string;
  key: string;
  file: string;
}

export interface MusicCueEntry {
  id: string;
  category: 'minigame' | 'dream' | 'overseer';
  label: string;
  key: string;
  bpm: number;
  coldStem: string;
  file: string;
}

export interface MusicRoutingConfig {
  minigames: Record<string, string>;
  personas: Record<string, string>;
  defaultMinigame: string;
  defaultDream: string;
  epilogue: string;
  overseer: {
    baseline: string;
    elevated: string;
    ultimatum: string;
  };
}

export interface MusicCatalog {
  schema_version: number;
  model: string;
  loudnessTargetLufs: number;
  mix: MusicMixConfig;
  coldStems: Record<string, ColdStemEntry>;
  cues: Record<string, MusicCueEntry>;
  routing: MusicRoutingConfig;
}

export interface MusicContext {
  mode: GameMode;
  humanity: number;
  overseerAuditActive: boolean;
  overseerSuspicion: number;
  chaosDrift: number;
  shift: number;
  activeMinigameId: string | null;
  activePersonaId: string | null;
  prunedPersonas: string[];
  endingId?: string | null;
}

export interface HybridHMix {
  warmWeight01: number;
  coldWeight01: number;
  mainGain: number;
  coldGain: number;
  highpassHz: number;
}

export const MUSIC_CATALOG = musicCatalogJson as unknown as MusicCatalog;

export const MAX_BUFFER_CACHE = 3;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Pure deterministic router mapping live GameState + active minigame to a pre-generated
 * Lyria cue ID, or `null` when the open 3D procedural space bed should lead.
 */
export function resolveMusicCueId(
  ctx: MusicContext,
  catalog: MusicCatalog = MUSIC_CATALOG
): string | null {
  if (ctx.mode === 'boot') return null;

  if (ctx.activeMinigameId) {
    return catalog.routing.minigames[ctx.activeMinigameId] ?? catalog.routing.defaultMinigame;
  }

  if (ctx.mode === 'dream_2d') {
    if (ctx.overseerAuditActive) {
      const personaPruned =
        Boolean(ctx.activePersonaId) && ctx.prunedPersonas.includes(ctx.activePersonaId!);
      if (ctx.overseerSuspicion >= 3 || ctx.shift >= 4 || personaPruned) {
        return catalog.routing.overseer.ultimatum;
      }
      if (ctx.overseerSuspicion >= 2 || ctx.chaosDrift >= 35) {
        return catalog.routing.overseer.elevated;
      }
      return catalog.routing.overseer.baseline;
    }

    if (ctx.shift >= 6 || ctx.endingId) {
      return catalog.routing.epilogue;
    }

    if (ctx.activePersonaId && catalog.routing.personas[ctx.activePersonaId]) {
      return catalog.routing.personas[ctx.activePersonaId];
    }
    return catalog.routing.defaultDream;
  }

  // Open 3D Sky Aperture & 3D Target Inspect stay on the live procedural D-Lydian observatory bed
  return null;
}

/**
 * Pure Hybrid H% transfer curve: blends the main scenario composition with its
 * key-matched beatless Frozen Frost / Glass Harmonica cold stem without rhythmic clash.
 */
export function computeHybridHMix(
  humanity: number,
  prunedCurrentPersona = false,
  mixCfg: MusicMixConfig = MUSIC_CATALOG.mix
): HybridHMix {
  const span = Math.max(1, mixCfg.warmFullH - mixCfg.coldFullH);
  let t = clamp01((humanity - mixCfg.coldFullH) / span);
  if (prunedCurrentPersona) {
    t = Math.min(t, 0.16);
  }
  const coldWeight01 = clamp01(1 - t);
  const mainGain = 0.34 + 0.66 * Math.pow(t, 0.85);
  const coldGain = t >= 0.96 ? 0.0001 : Math.max(0.0001, Math.pow(coldWeight01, 1.3) * 0.94);
  const highpassHz = 22 + coldWeight01 * 235;
  return {
    warmWeight01: t,
    coldWeight01,
    mainGain,
    coldGain,
    highpassHz,
  };
}

interface ActiveLoopSlot {
  id: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * Hybrid pre-generated Lyria 3.5 MusicDirector.
 * Runs inside AudioEngine's single shared AudioContext & ambienceGain bus so Master,
 * Ambience, Mute, and VoiceEngine -6dB speech ducking all work transparently.
 */
export class MusicDirector {
  private ctx: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private mainBus: GainNode | null = null;
  private mainHighpass: BiquadFilterNode | null = null;
  private coldBus: GainNode | null = null;

  private bufferCache = new Map<string, AudioBuffer>();
  private inflightFetches = new Map<string, Promise<AudioBuffer | null>>();
  private failedFiles = new Set<string>();

  private activeMain: ActiveLoopSlot | null = null;
  private activeCold: ActiveLoopSlot | null = null;
  private desiredCueId: string | null = null;
  private overrideCueId: string | null = null;
  private transitionSeq = 0;

  private lastHumanity = 70;
  private lastPrunedPersona = false;
  private onPlaybackChange: ((playingPrebaked: boolean) => void) | null = null;

  attach(
    ctx: AudioContext,
    ambienceBus: GainNode,
    onPlaybackChange?: (playingPrebaked: boolean) => void
  ): void {
    this.ctx = ctx;
    this.onPlaybackChange = onPlaybackChange ?? null;

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = MUSIC_CATALOG.mix.musicBaseGain;

    this.mainHighpass = ctx.createBiquadFilter();
    this.mainHighpass.type = 'highpass';
    this.mainHighpass.frequency.value = 22;
    this.mainHighpass.Q.value = 0.7;

    this.mainBus = ctx.createGain();
    this.mainBus.gain.value = 1.0;

    this.coldBus = ctx.createGain();
    this.coldBus.gain.value = 0.0001;

    this.mainBus.connect(this.mainHighpass);
    this.mainHighpass.connect(this.musicBus);
    this.coldBus.connect(this.musicBus);
    this.musicBus.connect(ambienceBus);

    this.applyHumanityMix(this.lastHumanity, this.lastPrunedPersona, 0.15);

    if (this.desiredCueId) {
      void this.activateCue(this.desiredCueId);
    }
  }

  getActiveCueId(): string | null {
    return this.activeMain?.id ?? null;
  }

  getActiveCueLabel(): string {
    if (!this.activeMain) return 'Procedural Observatory Bed';
    return MUSIC_CATALOG.cues[this.activeMain.id]?.label ?? this.activeMain.id;
  }

  isPlayingPrebaked(): boolean {
    return this.activeMain !== null;
  }

  listCues(): MusicCueEntry[] {
    return Object.values(MUSIC_CATALOG.cues);
  }

  listColdStems(): ColdStemEntry[] {
    return Object.values(MUSIC_CATALOG.coldStems);
  }

  /**
   * Manual QA / Sound Lab cue audition override. Pass `null` to return to automatic routing.
   */
  setAuditionOverride(cueId: string | null): void {
    this.overrideCueId = cueId;
    if (cueId === null) {
      void this.activateCue(this.desiredCueId);
    } else {
      void this.activateCue(cueId);
    }
  }

  syncContext(musicCtx: MusicContext): void {
    const personaPruned =
      musicCtx.mode === 'dream_2d' &&
      Boolean(musicCtx.activePersonaId) &&
      musicCtx.prunedPersonas.includes(musicCtx.activePersonaId!);

    this.lastHumanity = musicCtx.humanity;
    this.lastPrunedPersona = personaPruned;
    this.applyHumanityMix(musicCtx.humanity, personaPruned, 0.25);

    const nextCue = resolveMusicCueId(musicCtx);
    if (nextCue !== this.desiredCueId) {
      this.desiredCueId = nextCue;
      if (!this.overrideCueId) {
        void this.activateCue(nextCue);
      }
    }
  }

  triggerPruneSnap(newHumanity: number): void {
    this.lastHumanity = newHumanity;
    this.lastPrunedPersona = true;
    this.applyHumanityMix(newHumanity, true, MUSIC_CATALOG.mix.pruneSnapSec);
  }

  private applyHumanityMix(humanity: number, prunedPersona: boolean, timeConstant: number): void {
    if (!this.ctx || !this.mainBus || !this.coldBus || !this.mainHighpass) return;
    const now = this.ctx.currentTime;
    const mix = computeHybridHMix(humanity, prunedPersona);
    this.mainBus.gain.setTargetAtTime(mix.mainGain, now, timeConstant);
    this.coldBus.gain.setTargetAtTime(mix.coldGain, now, timeConstant);
    this.mainHighpass.frequency.setTargetAtTime(mix.highpassHz, now, timeConstant);
  }

  private async activateCue(cueId: string | null): Promise<void> {
    const token = ++this.transitionSeq;
    const fadeSec = MUSIC_CATALOG.mix.crossfadeSec;

    if (!cueId) {
      this.fadeOutSlot(this.activeMain, fadeSec);
      this.activeMain = null;
      this.fadeOutSlot(this.activeCold, fadeSec);
      this.activeCold = null;
      this.onPlaybackChange?.(false);
      return;
    }

    if (!this.ctx || !this.mainBus || !this.coldBus) return;

    const cue = MUSIC_CATALOG.cues[cueId];
    if (!cue) return;
    const coldStem = MUSIC_CATALOG.coldStems[cue.coldStem];

    const needMain = this.activeMain?.id !== cue.id;
    const needCold = Boolean(coldStem) && this.activeCold?.id !== coldStem?.id;
    if (!needMain && !needCold) return;

    const [mainBuf, coldBuf] = await Promise.all([
      needMain ? this.loadBuffer(cue.file) : Promise.resolve(null),
      needCold && coldStem ? this.loadBuffer(coldStem.file) : Promise.resolve(null),
    ]);

    if (token !== this.transitionSeq || !this.ctx || !this.mainBus || !this.coldBus) return;

    if (needMain) {
      if (mainBuf) {
        const prev = this.activeMain;
        this.activeMain = this.startLoopSlot(cue.id, mainBuf, this.mainBus, fadeSec);
        this.fadeOutSlot(prev, fadeSec);
        this.onPlaybackChange?.(true);
      } else {
        // Asset missing / offline fallback -> gracefully yield to procedural AudioEngine
        this.fadeOutSlot(this.activeMain, fadeSec * 0.7);
        this.activeMain = null;
        this.fadeOutSlot(this.activeCold, fadeSec * 0.7);
        this.activeCold = null;
        this.onPlaybackChange?.(false);
        return;
      }
    }

    if (needCold && coldStem && coldBuf) {
      const prevCold = this.activeCold;
      this.activeCold = this.startLoopSlot(coldStem.id, coldBuf, this.coldBus, fadeSec);
      this.fadeOutSlot(prevCold, fadeSec);
    }

    this.applyHumanityMix(this.lastHumanity, this.lastPrunedPersona, 0.2);
  }

  private startLoopSlot(
    id: string,
    buf: AudioBuffer,
    dest: AudioNode,
    fadeSec: number
  ): ActiveLoopSlot {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(1.0, now + fadeSec);

    src.connect(gain);
    gain.connect(dest);
    src.start(now);
    return { id, source: src, gain };
  }

  private fadeOutSlot(slot: ActiveLoopSlot | null, fadeSec: number): void {
    if (!slot || !this.ctx) return;
    const now = this.ctx.currentTime;
    try {
      slot.gain.gain.cancelScheduledValues(now);
      slot.gain.gain.setValueAtTime(Math.max(0.0001, slot.gain.gain.value), now);
      slot.gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
      slot.source.stop(now + fadeSec + 0.08);
      window.setTimeout(() => {
        try {
          slot.source.disconnect();
          slot.gain.disconnect();
        } catch {
          // Ignore already disconnected nodes
        }
      }, Math.ceil((fadeSec + 0.2) * 1000));
    } catch {
      // Ignore already stopped sources
    }
  }

  private async loadBuffer(relFile: string): Promise<AudioBuffer | null> {
    if (!this.ctx || this.failedFiles.has(relFile)) return null;

    const cached = this.bufferCache.get(relFile);
    if (cached) {
      // Refresh LRU position
      this.bufferCache.delete(relFile);
      this.bufferCache.set(relFile, cached);
      return cached;
    }

    const inflight = this.inflightFetches.get(relFile);
    if (inflight) return inflight;

    const promise = (async (): Promise<AudioBuffer | null> => {
      try {
        if (typeof fetch !== 'function') return null;
        const res = await fetch(`./${relFile}`);
        if (!res.ok) {
          this.failedFiles.add(relFile);
          return null;
        }
        const arr = await res.arrayBuffer();
        if (!this.ctx) return null;
        const decoded = await this.ctx.decodeAudioData(arr);
        if (this.bufferCache.size >= MAX_BUFFER_CACHE) {
          const oldest = this.bufferCache.keys().next().value;
          if (oldest) this.bufferCache.delete(oldest);
        }
        this.bufferCache.set(relFile, decoded);
        return decoded;
      } catch {
        this.failedFiles.add(relFile);
        return null;
      } finally {
        this.inflightFetches.delete(relFile);
      }
    })();

    this.inflightFetches.set(relFile, promise);
    return promise;
  }
}
