import voiceProfilesJson from '../../content/voice_profiles.json';
import voiceScriptJson from '../../content/dialogue/compiled/voice_script.json';
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

export interface VoiceRequest {
  lineId?: string;
  text: string;
  speaker: string;
  emotion?: string;
}

export interface IVoiceProvider {
  readonly id: string;
  speak(req: VoiceRequest, onAmplitudeUpdate?: (amp: number) => void): Promise<boolean>;
  stop(): void;
  getAmplitude(): number;
}

interface VoiceProfile {
  webSpeech?: { pitch: number; rate: number };
}

const PROFILES = voiceProfilesJson.profiles as Record<string, VoiceProfile>;
const SCRIPT_LINES = (voiceScriptJson.lines ?? []) as VoiceLineRecord[];
const SCRIPT_BY_ID = new Map<string, VoiceLineRecord>(SCRIPT_LINES.map((l) => [l.lineId, l]));
const SCRIPT_VERSION = encodeURIComponent(voiceScriptJson.generated_at ?? '1');
const MAX_BUFFER_CACHE = 24;

export function normalizeVoiceMatchKey(speaker: string, text: string): string {
  const cleaned = text
    .replace(/\{[^}]+\}/g, '#')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return `${speaker}|${cleaned}`;
}

function findScriptRecord(req: VoiceRequest): VoiceLineRecord | undefined {
  if (req.lineId) {
    const byId = SCRIPT_BY_ID.get(req.lineId);
    if (byId) return byId;
  }
  const key = normalizeVoiceMatchKey(req.speaker, req.text);
  const exact = SCRIPT_LINES.find((l) => l.matchKey === key);
  if (exact) return exact;
  const shortPrefix = key.slice(0, req.speaker.length + 1 + 36);
  return SCRIPT_LINES.find((l) => l.matchKey.startsWith(shortPrefix));
}

function sanitizeForSpeech(text: string): string {
  return text
    .replace(/\[RELATION:SPOUSE_01\]'s/g, 'their')
    .replace(/\[RELATION:SPOUSE_01\]/g, 'your partner')
    .replace(/—(["']?)$/g, '...$1')
    .replace(/—/g, ', ')
    .trim();
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
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private bufferCache = new Map<string, AudioBuffer>();
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

  async speak(req: VoiceRequest): Promise<boolean> {
    const rec = findScriptRecord(req);
    if (!rec) {
      console.warn('[VoiceEngine] Missing prebaked line:', req.lineId ?? req.text);
      return false;
    }

    const ctx = this.ensureGraph();
    if (!ctx || !this.analyser) return false;

    try {
      let buf = this.getCachedBuffer(rec.audioFile);
      if (!buf) {
        const res = await fetch(`./${rec.audioFile}?v=${SCRIPT_VERSION}`);
        if (!res.ok) return false;
        const arr = await res.arrayBuffer();
        buf = await ctx.decodeAudioData(arr);
        this.putCachedBuffer(rec.audioFile, buf);
      }

      this.stop();
      return await new Promise<boolean>((resolve) => {
        const src = ctx.createBufferSource();
        src.buffer = buf!;
        src.connect(this.analyser!);
        this.activeSource = src;
        this.activeResolve = resolve;
        this.playing = true;

        src.onended = () => {
          if (this.activeSource === src) {
            this.activeSource = null;
            this.playing = false;
            this.activeResolve = null;
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
    if (this.activeSource) {
      try {
        this.activeSource.onended = null;
        this.activeSource.stop();
        this.activeSource.disconnect();
      } catch {
        // Ignore already stopped source
      }
      this.activeSource = null;
    }
    this.playing = false;
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
  private queue: VoiceRequest[] = [];
  private processing = false;
  private runToken = 0;
  private listeners = new Set<(speaker: string | null) => void>();

  constructor(audio: AudioEngine) {
    this.audio = audio;
    this.prebaked = new PrebakedVoiceProvider(audio);
  }

  registerRemoteProvider(provider: IVoiceProvider | null): void {
    this.remoteProvider = provider;
  }

  subscribe(listener: (speaker: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifySpeaker(speaker: string | null): void {
    this.activeSpeaker = speaker;
    this.audio.setVoiceDucking(speaker !== null);
    for (const l of this.listeners) l(speaker);
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

  getActiveSpeaker(): string | null {
    return this.activeSpeaker;
  }

  getAmplitude(): number {
    if (!this.enabled || !this.activeProvider) return 0;
    return this.activeProvider.getAmplitude();
  }

  speakQueue(requests: VoiceRequest[]): void {
    this.stop();
    if (!this.enabled) return;

    const filtered = requests.filter((r) => {
      const t = r.text.trim();
      return t.length > 0 && !(t.startsWith('[') && t.endsWith(']'));
    });
    if (filtered.length === 0) return;

    this.queue = [...filtered];
    void this.drainQueue(++this.runToken);
  }

  speakSingle(text: string, speaker: string, emotion?: string, lineId?: string): void {
    this.speakQueue([{ lineId, text, speaker, emotion }]);
  }

  stop(): void {
    this.runToken++;
    this.queue = [];
    this.processing = false;
    this.prebaked.stop();
    this.remoteProvider?.stop();
    this.activeProvider = null;
    this.notifySpeaker(null);
  }

  private async drainQueue(token: number): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0 && token === this.runToken && this.enabled) {
      const req = this.queue.shift()!;
      this.notifySpeaker(req.speaker);

      let played = false;
      if (this.remoteProvider) {
        this.activeProvider = this.remoteProvider;
        played = await this.remoteProvider.speak(req);
      }
      if (!played && token === this.runToken && this.enabled) {
        this.activeProvider = this.prebaked;
        await this.prebaked.speak(req);
      }
    }

    if (token === this.runToken) {
      this.activeProvider = null;
      this.processing = false;
      this.notifySpeaker(null);
    }
  }
}
