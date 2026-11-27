import pacing from '../../content/pacing.json';
import pronunciationJson from '../../content/pronunciation.json';
import voiceProfilesJson from '../../content/voice_profiles.json';
import voiceRuntimeJson from '../../content/dialogue/compiled/voice_runtime.json';
import type { AudioEngine } from '../AudioEngine';

export interface VoiceLineRecord {
  lineId: string;
  matchKey: string;
  speaker: string;
  emotion: string;
  text: string;
  spokenText: string;
  audioFile: string;
}

interface VoiceRuntimeEntry {
  f: string;
  s: string | null;
  m: string;
}

export interface VoiceRequest {
  lineId?: string;
  text: string;
  speaker: string;
  emotion?: string;
  pauseBeforeMs?: number;
}

export interface SpeakQueueCallbacks {
  onEntryStart?: (index: number, req: VoiceRequest, durationSec: number) => void;
  onEntryEnd?: (index: number, req: VoiceRequest, played: boolean) => void;
  onQueueComplete?: (playedAny: boolean) => void;
}

export interface IVoiceProvider {
  readonly id: string;
  speak(
    req: VoiceRequest,
    onPlaybackStart?: (durationSec: number) => void
  ): Promise<boolean>;
  stop(): void;
  getAmplitude(): number;
}

export interface VoiceProfile {
  voiced?: boolean;
  webSpeech?: { pitch: number; rate: number };
}

interface ResolvedRuntimeClip {
  lineId: string;
  audioFile: string;
  sha: string | null;
  matchKey: string;
}

const PROFILES = voiceProfilesJson.profiles as Record<string, VoiceProfile>;
const SCRIPT_VERSION = encodeURIComponent(voiceRuntimeJson.version ?? '1');
const RUNTIME_BY_ID = new Map<string, ResolvedRuntimeClip>();
const RUNTIME_BY_MATCH_KEY = new Map<string, ResolvedRuntimeClip>();
for (const [lineId, entry] of Object.entries(
  (voiceRuntimeJson.byId ?? {}) as Record<string, VoiceRuntimeEntry>
)) {
  const clip: ResolvedRuntimeClip = {
    lineId,
    audioFile: entry.f,
    sha: entry.s ?? null,
    matchKey: entry.m,
  };
  RUNTIME_BY_ID.set(lineId, clip);
  if (clip.matchKey && !RUNTIME_BY_MATCH_KEY.has(clip.matchKey)) {
    RUNTIME_BY_MATCH_KEY.set(clip.matchKey, clip);
  }
}
const MAX_BUFFER_CACHE = 24;
const COMPILED_PRONUNCIATION_RULES = (pronunciationJson.replacements ?? []).map(
  ([pattern, replacement]) => [new RegExp(pattern, 'g'), replacement] as const
);

function stripInlineMarkup(text: string): string {
  return text
    .replace(/\[\[target:[a-z0-9_]+(?:::|\|)([^\]]+)\]\]/gi, '$1')
    .replace(/\[\[(?:warm|cold):([^\]]+)\]\]/gi, '$1');
}

export function normalizeVoiceMatchKey(speaker: string, text: string): string {
  const cleaned = stripInlineMarkup(text)
    .replace(/\{[^}]+\}/g, '#')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return `${speaker}|${cleaned}`;
}

function findRuntimeClip(req: VoiceRequest): ResolvedRuntimeClip | undefined {
  if (req.lineId) {
    const byId = RUNTIME_BY_ID.get(req.lineId);
    if (byId) {
      if (
        import.meta.env?.DEV &&
        normalizeVoiceMatchKey(req.speaker, req.text) !== byId.matchKey
      ) {
        console.warn(
          `[VoiceEngine] Spoken/text mismatch for lineId "${req.lineId}": runtime="${req.text}" (expected "${byId.matchKey}")`
        );
      }
      return byId;
    }
  }
  return RUNTIME_BY_MATCH_KEY.get(normalizeVoiceMatchKey(req.speaker, req.text));
}

function sanitizeForSpeech(text: string): string {
  let out = stripInlineMarkup(text);
  for (const [relKey, relSpec] of Object.entries(
    (pronunciationJson.relations ?? {}) as Record<string, { possessive: string; noun: string }>
  )) {
    const token = `[RELATION:${relKey}]`;
    const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(new RegExp(`${esc}['’]s\\b`, 'g'), relSpec.possessive ?? 'their')
      .replace(new RegExp(esc, 'g'), relSpec.noun ?? 'them');
  }
  for (const [rx, replacement] of COMPILED_PRONUNCIATION_RULES) {
    out = out.replace(rx, replacement);
  }
  return out.replace(/—(["']?)$/g, '...$1').replace(/—/g, ', ').trim();
}

/**
 * Plays pre-rendered MP3 voice files through AudioEngine's single shared
 * AudioContext & voice bus so Master Volume, mute, and -6dB ambience ducking work cleanly.
 */
export class PrebakedVoiceProvider implements IVoiceProvider {
  readonly id = 'prebaked-local';
  private readonly audio: AudioEngine;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private boundCtx: AudioContext | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private activeClipGain: GainNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private bufferCache = new Map<string, AudioBuffer>();
  private inflightLoads = new Map<string, Promise<AudioBuffer | null>>();
  private volume = 0.92;
  private activeResolve: ((ok: boolean) => void) | null = null;
  private playing = false;

  constructor(audio: AudioEngine) {
    this.audio = audio;
  }

  private ensureGraph(): AudioContext | null {
    this.audio.unlock();
    const ctx = this.audio.getAudioContext();
    const bus = this.audio.getVoiceBus();
    if (!ctx || !bus) return null;

    if (this.boundCtx !== ctx || !this.analyser || !this.gainNode) {
      this.boundCtx = ctx;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.72;
      this.freqData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));

      this.gainNode = ctx.createGain();
      this.gainNode.gain.value = this.volume;

      this.analyser.connect(this.gainNode);
      this.gainNode.connect(bus);
    }

    return ctx;
  }

  private getCachedBuffer(key: string): AudioBuffer | undefined {
    const hit = this.bufferCache.get(key);
    if (hit) {
      this.bufferCache.delete(key);
      this.bufferCache.set(key, hit);
    }
    return hit;
  }

  private putCachedBuffer(key: string, buf: AudioBuffer): void {
    if (this.bufferCache.has(key)) {
      this.bufferCache.delete(key);
    } else if (this.bufferCache.size >= MAX_BUFFER_CACHE) {
      const oldest = this.bufferCache.keys().next().value;
      if (oldest) this.bufferCache.delete(oldest);
    }
    this.bufferCache.set(key, buf);
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode && this.boundCtx) {
      this.gainNode.gain.setTargetAtTime(this.volume, this.boundCtx.currentTime, 0.04);
    }
  }

  getVolume(): number {
    return this.volume;
  }

  private async loadOrGetBuffer(
    rec: ResolvedRuntimeClip,
    ctx: AudioContext
  ): Promise<AudioBuffer | null> {
    const cached = this.getCachedBuffer(rec.audioFile);
    if (cached) return cached;

    const existing = this.inflightLoads.get(rec.audioFile);
    if (existing) return existing;

    const vTag = encodeURIComponent(rec.sha ?? SCRIPT_VERSION);
    const loadPromise = (async (): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(`./${rec.audioFile}?v=${vTag}`);
        if (!res.ok) return null;
        const arr = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr);
        this.putCachedBuffer(rec.audioFile, buf);
        return buf;
      } catch {
        return null;
      } finally {
        this.inflightLoads.delete(rec.audioFile);
      }
    })();

    this.inflightLoads.set(rec.audioFile, loadPromise);
    return loadPromise;
  }

  prefetch(req: VoiceRequest): void {
    const rec = findRuntimeClip(req);
    if (!rec || this.getCachedBuffer(rec.audioFile) || this.inflightLoads.has(rec.audioFile)) {
      return;
    }
    const ctx = this.audio.getAudioContext();
    if (!ctx) return;
    void this.loadOrGetBuffer(rec, ctx);
  }

  async speak(
    req: VoiceRequest,
    onPlaybackStart?: (durationSec: number) => void
  ): Promise<boolean> {
    const rec = findRuntimeClip(req);
    if (!rec) {
      console.warn('[VoiceEngine] Missing prebaked line:', req.lineId ?? req.text);
      return false;
    }

    const ctx = this.ensureGraph();
    if (!ctx || !this.analyser) return false;

    try {
      const buf = await this.loadOrGetBuffer(rec, ctx);
      if (!buf) return false;

      this.stop();
      return await new Promise<boolean>((resolve) => {
        const src = ctx.createBufferSource();
        const clipGain = ctx.createGain();
        clipGain.gain.setValueAtTime(1.0, ctx.currentTime);
        src.buffer = buf;
        src.connect(clipGain);
        clipGain.connect(this.analyser!);
        this.activeSource = src;
        this.activeClipGain = clipGain;
        this.activeResolve = resolve;
        this.playing = true;

        onPlaybackStart?.(buf.duration);

        src.onended = () => {
          if (this.activeSource === src) {
            this.activeSource = null;
            this.activeClipGain = null;
            this.playing = false;
            this.activeResolve = null;
            try {
              clipGain.disconnect();
            } catch {
              // Ignore already disconnected
            }
            resolve(true);
          }
        };
        src.start();
      });
    } catch {
      this.playing = false;
      return false;
    }
  }

  stop(): void {
    const src = this.activeSource;
    const clipGain = this.activeClipGain;
    this.activeSource = null;
    this.activeClipGain = null;
    this.playing = false;

    if (src) {
      try {
        src.onended = null;
        if (clipGain && this.boundCtx) {
          const now = this.boundCtx.currentTime;
          clipGain.gain.cancelScheduledValues(now);
          clipGain.gain.setValueAtTime(Math.max(0.0001, clipGain.gain.value), now);
          clipGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
          src.stop(now + 0.045);
          window.setTimeout(() => {
            try {
              src.disconnect();
              clipGain.disconnect();
            } catch {
              // Ignore cleanup errors
            }
          }, 65);
        } else {
          src.stop();
          src.disconnect();
        }
      } catch {
        // Ignore already stopped source
      }
    }
    if (this.activeResolve) {
      const res = this.activeResolve;
      this.activeResolve = null;
      res(false);
    }
  }

  getAmplitude(): number {
    if (!this.playing || !this.analyser || !this.freqData) return 0;
    this.analyser.getByteFrequencyData(this.freqData);
    let sum = 0;
    const len = Math.min(20, this.freqData.length);
    for (let i = 1; i < len; i++) {
      sum += this.freqData[i];
    }
    const avg = sum / Math.max(1, len - 1);
    return Math.min(1, avg / 115);
  }
}

/**
 * Optional browser speech provider (disabled by default to avoid jarring robotic fallback flashes).
 */
export class WebSpeechVoiceProvider implements IVoiceProvider {
  readonly id = 'web-speech';
  private speaking = false;
  private startMs = 0;

  async speak(req: VoiceRequest): Promise<boolean> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
    const spoken = sanitizeForSpeech(req.text);
    if (!spoken) return false;

    this.stop();
    const profile = PROFILES[req.speaker]?.webSpeech ?? { pitch: 1.0, rate: 0.98 };

    return await new Promise<boolean>((resolve) => {
      try {
        const utt = new SpeechSynthesisUtterance(spoken);
        utt.pitch = profile.pitch;
        utt.rate = profile.rate;
        this.speaking = true;
        this.startMs = performance.now();

        utt.onend = () => {
          this.speaking = false;
          resolve(true);
        };
        utt.onerror = () => {
          this.speaking = false;
          resolve(false);
        };
        window.speechSynthesis.speak(utt);
      } catch {
        this.speaking = false;
        resolve(false);
      }
    });
  }

  stop(): void {
    this.speaking = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  getAmplitude(): number {
    if (!this.speaking) return 0;
    const t = (performance.now() - this.startMs) * 0.001;
    return 0.35 + 0.38 * Math.abs(Math.sin(t * 9.2)) * (0.65 + 0.35 * Math.cos(t * 4.1));
  }
}

/**
 * Unified VoiceEngine with sequential dialogue queue, stable lineId resolution,
 * AudioEngine ambience ducking, and a pluggable remote studio-VO slot.
 */
export class VoiceEngine {
  private readonly audio: AudioEngine;
  private readonly prebaked: PrebakedVoiceProvider;
  private remoteProvider: IVoiceProvider | null = null;
  private activeProvider: IVoiceProvider | null = null;

  private enabled = true;
  private activeSpeaker: string | null = null;
  private activeLineId: string | null = null;
  private queue: VoiceRequest[] = [];
  private processing = false;
  private playedInCurrentQueue = false;
  private runToken = 0;
  private listeners = new Set<(speaker: string | null, lineId?: string | null) => void>();
  private finalClipEndWaiters: Array<{ leadMs: number; resolve: () => void }> = [];
  private finalClipTimer: number | null = null;
  private queueDoneWaiters: Array<(playedAny: boolean) => void> = [];
  private singleEntryResolvers: Array<(played: boolean) => void> = [];

  constructor(audio: AudioEngine) {
    this.audio = audio;
    this.prebaked = new PrebakedVoiceProvider(audio);
  }

  registerRemoteProvider(provider: IVoiceProvider | null): void {
    this.remoteProvider = provider;
  }

  subscribe(listener: (speaker: string | null, lineId?: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifySpeaker(speaker: string | null, lineId: string | null = null): void {
    this.activeSpeaker = speaker;
    this.activeLineId = speaker ? lineId : null;
    this.audio.setVoiceDucking(speaker !== null);
    for (const l of this.listeners) l(speaker, this.activeLineId);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setVolume(vol: number): void {
    this.prebaked.setVolume(vol);
  }

  getVolume(): number {
    return this.prebaked.getVolume();
  }

  getActiveSpeaker(): string | null {
    return this.activeSpeaker;
  }

  getActiveLineId(): string | null {
    return this.activeLineId;
  }

  getAmplitude(): number {
    if (!this.enabled || !this.activeProvider) return 0;
    return this.activeProvider.getAmplitude();
  }

  speakQueue(requests: VoiceRequest[], callbacks?: SpeakQueueCallbacks): void {
    this.stop();
    if (!this.enabled) {
      callbacks?.onQueueComplete?.(false);
      return;
    }

    const filtered = requests.filter((r) => {
      if (PROFILES[r.speaker]?.voiced === false) return false;
      const t = stripInlineMarkup(r.text).trim();
      return t.length > 0 && !(t.startsWith('[') && t.endsWith(']'));
    });
    if (filtered.length === 0) {
      callbacks?.onQueueComplete?.(false);
      return;
    }

    this.queue = [...filtered];
    void this.drainQueue(++this.runToken, callbacks);
  }

  speakSingle(text: string, speaker: string, emotion?: string, lineId?: string): void {
    this.speakQueue([{ lineId, text, speaker, emotion }]);
  }

  /**
   * Speaks a single VoiceRequest and resolves `true` when playback completes,
   * or `false` if unvoiced/disabled/stopped early. Used by contemplative line-by-line reveal.
   */
  async speakEntry(req: VoiceRequest): Promise<boolean> {
    this.stop();
    if (!this.enabled) return false;
    if (PROFILES[req.speaker]?.voiced === false) return false;
    const t = stripInlineMarkup(req.text).trim();
    if (!t || (t.startsWith('[') && t.endsWith(']'))) return false;

    const token = ++this.runToken;
    this.processing = true;
    let played = false;

    const onPlaybackStart = (_durationSec: number) => {
      if (token !== this.runToken) return;
      this.playedInCurrentQueue = true;
      this.notifySpeaker(req.speaker, req.lineId ?? null);
    };

    let finishEarly!: (ok: boolean) => void;
    const stopRace = new Promise<boolean>((resolve) => {
      finishEarly = resolve;
      this.singleEntryResolvers.push(resolve);
    });

    const playAttempt = (async (): Promise<boolean> => {
      if (this.remoteProvider) {
        this.activeProvider = this.remoteProvider;
        played = await this.remoteProvider.speak(req, onPlaybackStart);
      }
      if (!played && token === this.runToken && this.enabled) {
        this.activeProvider = this.prebaked;
        played = await this.prebaked.speak(req, onPlaybackStart);
      }
      return token === this.runToken ? played : false;
    })();

    const result = await Promise.race([playAttempt, stopRace]);
    const idx = this.singleEntryResolvers.indexOf(finishEarly);
    if (idx >= 0) this.singleEntryResolvers.splice(idx, 1);

    if (token === this.runToken) {
      this.activeProvider = null;
      this.processing = false;
      this.notifySpeaker(null, null);
    }
    return result;
  }

  stop(): void {
    this.runToken++;
    this.queue = [];
    this.processing = false;
    this.playedInCurrentQueue = false;
    if (this.finalClipTimer !== null) {
      window.clearTimeout(this.finalClipTimer);
      this.finalClipTimer = null;
    }
    const entryWaiters = this.singleEntryResolvers.splice(0);
    for (const resolve of entryWaiters) resolve(false);
    const endWaiters = this.finalClipEndWaiters.splice(0);
    for (const w of endWaiters) w.resolve();
    const doneWaiters = this.queueDoneWaiters.splice(0);
    for (const resolve of doneWaiters) resolve(false);

    this.prebaked.stop();
    this.remoteProvider?.stop();
    this.activeProvider = null;
    this.notifySpeaker(null, null);
  }

  /**
   * Resolves `leadMs` before the final queued voice clip completes (for audio-synced
   * mid-sentence interrupts), or after `fallbackMs` if voice is disabled or no clip plays.
   */
  waitForQueueNearEnd(leadMs = 260, fallbackMs = 2200): Promise<void> {
    if (!this.enabled || (!this.processing && this.queue.length === 0)) {
      return new Promise((resolve) => window.setTimeout(resolve, fallbackMs));
    }

    const startedAt = performance.now();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      this.finalClipEndWaiters.push({ leadMs, resolve: finish });
      this.queueDoneWaiters.push((playedAny) => {
        if (settled) return;
        if (playedAny) {
          finish();
        } else {
          const elapsed = performance.now() - startedAt;
          const remaining = Math.max(0, fallbackMs - elapsed);
          window.setTimeout(finish, remaining);
        }
      });
    });
  }

  private waitPauseMs(ms: number, token: number): Promise<boolean> {
    if (ms <= 0) return Promise.resolve(token === this.runToken && this.enabled);
    return new Promise((resolve) => {
      window.setTimeout(() => {
        resolve(token === this.runToken && this.enabled);
      }, ms);
    });
  }

  private async drainQueue(token: number, callbacks?: SpeakQueueCallbacks): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    this.playedInCurrentQueue = false;
    let prevSpeaker: string | null = null;
    let entryIndex = 0;

    while (this.queue.length > 0 && token === this.runToken && this.enabled) {
      const req = this.queue.shift()!;
      const idx = entryIndex++;
      const isLastInQueue = this.queue.length === 0;

      const baseGapMs =
        prevSpeaker !== null && this.playedInCurrentQueue
          ? prevSpeaker === req.speaker
            ? pacing.dialogue.postVoicePauseSameSpeakerMs
            : pacing.dialogue.postVoicePauseSpeakerChangeMs
          : 0;
      const totalWaitMs = Math.max(baseGapMs, req.pauseBeforeMs ?? 0);
      if (totalWaitMs > 0) {
        const ok = await this.waitPauseMs(totalWaitMs, token);
        if (!ok) break;
      }

      let played = false;
      const onPlaybackStart = (durationSec: number) => {
        if (token !== this.runToken) return;
        this.playedInCurrentQueue = true;
        this.notifySpeaker(req.speaker, req.lineId ?? null);
        callbacks?.onEntryStart?.(idx, req, durationSec);
        if (isLastInQueue && this.finalClipEndWaiters.length > 0) {
          const waiters = this.finalClipEndWaiters.splice(0);
          for (const w of waiters) {
            const delayMs = Math.max(200, Math.round(durationSec * 1000) - w.leadMs);
            this.finalClipTimer = window.setTimeout(() => {
              this.finalClipTimer = null;
              w.resolve();
            }, delayMs);
          }
        }
      };

      if (this.queue.length > 0 && !this.remoteProvider) {
        this.prebaked.prefetch(this.queue[0]);
      }

      if (this.remoteProvider) {
        this.activeProvider = this.remoteProvider;
        played = await this.remoteProvider.speak(req, onPlaybackStart);
      }
      if (!played && token === this.runToken && this.enabled) {
        this.activeProvider = this.prebaked;
        played = await this.prebaked.speak(req, onPlaybackStart);
      }
      if (played) {
        this.playedInCurrentQueue = true;
      }
      if (token === this.runToken) {
        callbacks?.onEntryEnd?.(idx, req, played);
      }
      prevSpeaker = req.speaker;
    }

    if (token === this.runToken) {
      const playedAny = this.playedInCurrentQueue;
      this.activeProvider = null;
      this.processing = false;
      this.notifySpeaker(null, null);
      const endWaiters = this.finalClipEndWaiters.splice(0);
      for (const w of endWaiters) w.resolve();
      const doneWaiters = this.queueDoneWaiters.splice(0);
      for (const resolve of doneWaiters) resolve(playedAny);
      callbacks?.onQueueComplete?.(playedAny);
    }
  }
}
