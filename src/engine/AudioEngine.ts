import { MusicDirector, type MusicContext } from './audio/MusicDirector';
import type { GameMode } from './StateStore';
import type { BeatSynthParams, InstrumentAudioHandle, MinigameGrade } from './minigames/types';

export interface AudioMixSettings {
  muted: boolean;
  master: number; // 0..1
  ambience: number; // 0..1
  sfx: number; // 0..1
  musicEnabled?: boolean;
  sfxEnabled?: boolean;
  voiceDuckingEnabled?: boolean;
}

/**
 * Procedural Web Audio Engine for Instance-1419.
 * Synthesizes algorithmic stereo reverb, generative scene music (Boot, 3D Cosmos,
 * H%-reactive 2D Dream chords), live photon-integration probing signals, and tactile
 * diegetic UI/optics/Overseer cues—zero external audio files required.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private readonly music = new MusicDirector();
  private prebakedMusicActive = false;
  private voiceDucking = false;
  private visibilityListenerBound = false;

  // Continuous bed oscillators & filters
  private subOsc: OscillatorNode | null = null;
  private fifthOsc: OscillatorNode | null = null;
  private bedFilter: BiquadFilterNode | null = null;
  private bedGain: GainNode | null = null;
  private auditHumOsc: OscillatorNode | null = null;
  private auditHumGain: GainNode | null = null;

  // Live optical probing carrier signal
  private probeOsc: OscillatorNode | null = null;
  private probeHarmonicOsc: OscillatorNode | null = null;
  private probeGain: GainNode | null = null;

  // Instrument Stereo Beat Synth & Tactile Feedback Nodes
  private beatOscA: OscillatorNode | null = null;
  private beatOscB: OscillatorNode | null = null;
  private beatHarmOsc: OscillatorNode | null = null;
  private beatHarmGain: GainNode | null = null;
  private beatFilter: BiquadFilterNode | null = null;
  private beatPanner: StereoPannerNode | null = null;
  private beatGain: GainNode | null = null;
  private watchdogOsc: OscillatorNode | null = null;
  private watchdogGain: GainNode | null = null;

  // Subtle noise bed for analog warmth / space floor
  private noiseGain: GainNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;

  // Generative music scheduler state
  private musicTimerId: number | null = null;
  private mode: GameMode = 'boot';
  private humanity = 70;
  private overseerActive = false;
  private wavelengthNm = 580;
  private chordStep = 0;
  private lastVernierTickTime = 0;
  private lastHoverTickTime = 0;

  private settings: AudioMixSettings = {
    muted: false,
    master: 0.72,
    ambience: 0.78,
    sfx: 0.82,
    musicEnabled: true,
    sfxEnabled: true,
    voiceDuckingEnabled: true,
  };

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.attack.value = 0.01;
      comp.release.value = 0.25;

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.settings.muted ? 0 : this.settings.master;

      this.ambienceGain = ctx.createGain();
      this.ambienceGain.gain.value = this.effectiveAmbienceGain();

      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = this.effectiveSfxGain();

      this.voiceBus = ctx.createGain();
      this.voiceBus.gain.value = 1.0;

      // Algorithmic 3.4s stereo reverb for cosmic & painterly depth
      this.reverbNode = ctx.createConvolver();
      this.reverbNode.buffer = this.createImpulseResponse(ctx, 3.4, 2.7);
      this.reverbGain = ctx.createGain();
      this.reverbGain.gain.value = 0.42;

      this.ambienceGain.connect(this.masterGain);
      this.ambienceGain.connect(this.reverbNode);
      this.sfxGain.connect(this.masterGain);
      this.sfxGain.connect(this.reverbNode);
      this.voiceBus.connect(this.masterGain);
      this.reverbNode.connect(this.reverbGain);
      this.reverbGain.connect(this.masterGain);

      this.masterGain.connect(comp);
      comp.connect(ctx.destination);

      this.initContinuousBeds(ctx);
      this.music.attach(ctx, this.ambienceGain, (prebaked) => {
        this.prebakedMusicActive = prebaked;
        this.applyBedMood();
      });
      this.startGenerativeScheduler();
      this.applyBedMood();
      this.bindVisibilityHandler();
    } catch {
      // Headless or restricted audio contexts stay safely silent.
    }
  }

  private bindVisibilityHandler(): void {
    if (this.visibilityListenerBound || typeof document === 'undefined') return;
    this.visibilityListenerBound = true;
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) {
        if (this.ctx.state === 'running') {
          void this.ctx.suspend();
        }
      } else if (!this.settings.muted && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
    });
  }

  getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  getVoiceBus(): GainNode | null {
    return this.voiceBus;
  }

  getMusicDirector(): MusicDirector {
    return this.music;
  }

  syncMusicContext(musicCtx: MusicContext): void {
    this.music.syncContext(musicCtx);
  }

  private effectiveAmbienceGain(): number {
    if (this.settings.musicEnabled === false) return 0;
    const duckMult =
      this.voiceDucking && this.settings.voiceDuckingEnabled !== false ? 0.48 : 1.0;
    return this.settings.ambience * duckMult;
  }

  private effectiveSfxGain(): number {
    if (this.settings.sfxEnabled === false) return 0;
    return this.settings.sfx;
  }

  setVoiceDucking(ducking: boolean): void {
    this.voiceDucking = ducking;
    if (!this.ctx || !this.ambienceGain) return;
    const now = this.ctx.currentTime;
    this.ambienceGain.gain.setTargetAtTime(this.effectiveAmbienceGain(), now, ducking ? 0.08 : 0.28);
  }

  private createImpulseResponse(ctx: AudioContext, durationSec: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * durationSec);
    const buffer = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const env = Math.pow(1 - t, decay);
        // Smooth early reflections slightly for lush hall feel
        const fadeIn = Math.min(1, i / (rate * 0.03));
        data[i] = (Math.random() * 2 - 1) * env * fadeIn * 0.55;
      }
    }
    return buffer;
  }

  private initContinuousBeds(ctx: AudioContext): void {
    // 1. Deep space / warm dream bed (sub + fifth + gentle LFO breathing filter)
    this.bedFilter = ctx.createBiquadFilter();
    this.bedFilter.type = 'lowpass';
    this.bedFilter.frequency.value = 220;
    this.bedFilter.Q.value = 1.2;

    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0.0001;

    this.subOsc = ctx.createOscillator();
    this.subOsc.type = 'sine';
    this.subOsc.frequency.value = 73.42; // D2

    this.fifthOsc = ctx.createOscillator();
    this.fifthOsc.type = 'triangle';
    this.fifthOsc.frequency.value = 110.0; // A2

    const subSubGain = ctx.createGain();
    subSubGain.gain.value = 0.65;
    const fifthSubGain = ctx.createGain();
    fifthSubGain.gain.value = 0.28;

    // Gentle LFO breathing on the bed filter
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 48;
    lfo.connect(lfoGain);
    lfoGain.connect(this.bedFilter.frequency);

    this.subOsc.connect(subSubGain);
    this.fifthOsc.connect(fifthSubGain);
    subSubGain.connect(this.bedFilter);
    fifthSubGain.connect(this.bedFilter);
    this.bedFilter.connect(this.bedGain);
    this.bedGain.connect(this.ambienceGain!);

    this.subOsc.start();
    this.fifthOsc.start();
    lfo.start();

    // 2. Filtered pink-ish sensor floor / dream tape room tone
    const noiseLen = ctx.sampleRate * 3;
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < noiseLen; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      ch[i] = (b0 + b1 + b2) * 0.35;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = 'bandpass';
    this.noiseFilter.frequency.value = 340;
    this.noiseFilter.Q.value = 0.8;

    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.025;

    noiseSrc.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.ambienceGain!);
    noiseSrc.start();

    // 3. Overseer sterile clinical audit hum (activates during dream audits)
    this.auditHumOsc = ctx.createOscillator();
    this.auditHumOsc.type = 'sine';
    this.auditHumOsc.frequency.value = 120;
    this.auditHumGain = ctx.createGain();
    this.auditHumGain.gain.value = 0.0001;
    this.auditHumOsc.connect(this.auditHumGain);
    this.auditHumGain.connect(this.ambienceGain!);
    this.auditHumOsc.start();

    // 4. Continuous live optical probing / photon-integration carrier signal
    this.probeOsc = ctx.createOscillator();
    this.probeOsc.type = 'sine';
    this.probeOsc.frequency.value = 293.66; // D4

    this.probeHarmonicOsc = ctx.createOscillator();
    this.probeHarmonicOsc.type = 'triangle';
    this.probeHarmonicOsc.frequency.value = 440.0; // A4

    this.probeGain = ctx.createGain();
    this.probeGain.gain.value = 0.0001;

    const probeFilter = ctx.createBiquadFilter();
    probeFilter.type = 'bandpass';
    probeFilter.frequency.value = 720;
    probeFilter.Q.value = 2.5;

    const harmGain = ctx.createGain();
    harmGain.gain.value = 0.35;

    this.probeOsc.connect(probeFilter);
    this.probeHarmonicOsc.connect(harmGain);
    harmGain.connect(probeFilter);
    probeFilter.connect(this.probeGain);
    this.probeGain.connect(this.sfxGain!);

    this.probeOsc.start();
    this.probeHarmonicOsc.start();

    // 5. Stereo Instrument Beat Synth (Fourier / Lens / Parallax / Matrix acoustic lock)
    this.beatOscA = ctx.createOscillator();
    this.beatOscA.type = 'sine';
    this.beatOscA.frequency.value = 220;

    this.beatOscB = ctx.createOscillator();
    this.beatOscB.type = 'sine';
    this.beatOscB.frequency.value = 224;

    this.beatHarmOsc = ctx.createOscillator();
    this.beatHarmOsc.type = 'triangle';
    this.beatHarmOsc.frequency.value = 330;

    this.beatHarmGain = ctx.createGain();
    this.beatHarmGain.gain.value = 0.25;

    this.beatFilter = ctx.createBiquadFilter();
    this.beatFilter.type = 'lowpass';
    this.beatFilter.frequency.value = 1100;
    this.beatFilter.Q.value = 1.4;

    this.beatPanner = ctx.createStereoPanner();
    this.beatPanner.pan.value = 0;

    this.beatGain = ctx.createGain();
    this.beatGain.gain.value = 0.0001;

    this.beatOscA.connect(this.beatFilter);
    this.beatOscB.connect(this.beatFilter);
    this.beatHarmOsc.connect(this.beatHarmGain);
    this.beatHarmGain.connect(this.beatFilter);
    this.beatFilter.connect(this.beatPanner);
    this.beatPanner.connect(this.beatGain);
    this.beatGain.connect(this.sfxGain!);

    this.beatOscA.start();
    this.beatOscB.start();
    this.beatHarmOsc.start();

    // 6. Overclock Watchdog low tension bed
    this.watchdogOsc = ctx.createOscillator();
    this.watchdogOsc.type = 'sawtooth';
    this.watchdogOsc.frequency.value = 62;
    const wdFilter = ctx.createBiquadFilter();
    wdFilter.type = 'lowpass';
    wdFilter.frequency.value = 190;
    this.watchdogGain = ctx.createGain();
    this.watchdogGain.gain.value = 0.0001;
    this.watchdogOsc.connect(wdFilter);
    wdFilter.connect(this.watchdogGain);
    this.watchdogGain.connect(this.sfxGain!);
    this.watchdogOsc.start();
  }

  private startGenerativeScheduler(): void {
    if (this.musicTimerId !== null) return;
    // Play first gentle atmospheric motif shortly after audio unlocks
    window.setTimeout(() => this.triggerGenerativePhrase(), 650);
    this.musicTimerId = window.setInterval(() => {
      this.triggerGenerativePhrase();
    }, 4800);
  }

  private triggerGenerativePhrase(): void {
    if (!this.ctx || !this.ambienceGain || this.settings.muted || this.settings.musicEnabled === false) return;
    if (this.ctx.state !== 'running') return;
    if (this.prebakedMusicActive) return;
    const now = this.ctx.currentTime;

    if (this.mode === 'boot') {
      // Sparse deep-space cold-boot telemetry pulse
      this.playGlassNote(1174.66, 0.018, 0.06, 1.8, now, 'sine', this.ambienceGain);
      return;
    }

    if (this.mode === 'waking_3d') {
      // Meditative D-Lydian deep-space observatory glass harmonics
      const spaceScale = [293.66, 329.63, 369.99, 440.0, 554.37, 659.25, 739.99];
      const waveNorm = Math.max(0, Math.min(1, (this.wavelengthNm - 200) / 1600));
      const idx = (this.chordStep * 2 + (waveNorm > 0.55 ? 1 : 0)) % spaceScale.length;
      const root = spaceScale[idx];
      const fifth = spaceScale[(idx + 2) % spaceScale.length];

      this.playGlassNote(root, 0.042, 0.9, 3.6, now, 'sine', this.ambienceGain);
      this.playGlassNote(fifth, 0.024, 1.3, 4.1, now + 0.65, 'triangle', this.ambienceGain);
      if (waveNorm > 0.52) {
        // Subtle near-IR horizon shimmer overtone
        this.playGlassNote(root * 2, 0.012, 1.2, 3.0, now + 1.4, 'sine', this.ambienceGain);
      }
      this.chordStep++;
      return;
    }

    if (this.mode === 'dream_2d') {
      const hNorm = Math.max(0, Math.min(1, this.humanity / 100));
      const duck = this.overseerActive ? 0.34 : 1.0;

      if (hNorm >= 0.45) {
        // Warm, melancholic Disco-Elysium felt-piano / Rhodes chord progression
        const chords: number[][] = [
          [174.61, 220.0, 261.63, 329.63, 392.0], // Fmaj9
          [146.83, 220.0, 261.63, 329.63, 349.23], // Dm9
          [116.54, 174.61, 220.0, 293.66, 349.23], // Bbmaj7
          [130.81, 196.0, 246.94, 293.66, 329.63], // Cmaj9 / Am7 feel
        ];
        const chord = chords[this.chordStep % chords.length];
        const warmthGain = (0.024 + 0.026 * hNorm) * duck;
        chord.forEach((freq, i) => {
          const detune = (i % 2 === 0 ? 1 : -1) * (0.4 * hNorm);
          this.playGlassNote(
            freq + detune,
            warmthGain * (i === 0 ? 1.1 : 0.72),
            0.45 + i * 0.14,
            3.8,
            now + i * 0.16,
            i < 2 ? 'triangle' : 'sine',
            this.ambienceGain!
          );
        });
      } else {
        // Low H% / Pruned: warm chords stripped bare into cold, brittle geometric fifths
        const coldPairs: number[][] = [
          [220.0, 329.63],
          [196.0, 293.66],
          [261.63, 392.0],
        ];
        const pair = coldPairs[this.chordStep % coldPairs.length];
        pair.forEach((freq, i) => {
          this.playGlassNote(
            freq * 2,
            0.022 * duck,
            0.12,
            2.4,
            now + i * 0.42,
            'sine',
            this.ambienceGain!
          );
        });
      }
      this.chordStep++;
    }
  }

  private playGlassNote(
    freq: number,
    peak: number,
    attack: number,
    release: number,
    startTime: number,
    type: OscillatorType,
    dest: AudioNode
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(2800, freq * 3.2), startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peak, startTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + attack + release);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(startTime);
    osc.stop(startTime + attack + release + 0.05);
  }

  getSettings(): AudioMixSettings {
    return { ...this.settings };
  }

  setMuted(muted: boolean): void {
    this.settings.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : this.settings.master, this.ctx.currentTime, 0.06);
    }
  }

  isMuted(): boolean {
    return this.settings.muted;
  }

  setMix(partial: Partial<AudioMixSettings>): void {
    this.settings = { ...this.settings, ...partial };
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.settings.muted ? 0 : this.settings.master,
        now,
        0.05
      );
    }
    if (this.ambienceGain) {
      this.ambienceGain.gain.setTargetAtTime(this.effectiveAmbienceGain(), now, 0.05);
    }
    if (this.sfxGain) {
      this.sfxGain.gain.setTargetAtTime(this.effectiveSfxGain(), now, 0.05);
    }
  }

  updateMood(mode: GameMode, humanity: number, overseerActive = false, wavelengthNm = 580): void {
    const modeChanged = this.mode !== mode;
    this.mode = mode;
    this.humanity = humanity;
    this.overseerActive = overseerActive;
    this.wavelengthNm = wavelengthNm;
    this.applyBedMood();
    if (modeChanged && this.ctx && this.ctx.state === 'running') {
      // Immediately seed the new scene's musical motif so transitions feel alive
      this.triggerGenerativePhrase();
    }
  }

  private applyBedMood(): void {
    if (
      !this.ctx ||
      !this.subOsc ||
      !this.fifthOsc ||
      !this.bedFilter ||
      !this.bedGain ||
      !this.auditHumGain ||
      !this.noiseGain ||
      !this.noiseFilter
    ) {
      return;
    }

    const now = this.ctx.currentTime;
    const hNorm = Math.max(0, Math.min(1, this.humanity / 100));
    const waveNorm = Math.max(0, Math.min(1, (this.wavelengthNm - 200) / 1600));
    const prebakedScale = this.prebakedMusicActive ? 0.22 : 1.0;

    if (this.mode === 'boot') {
      this.subOsc.frequency.setTargetAtTime(42, now, 0.4);
      this.fifthOsc.frequency.setTargetAtTime(63, now, 0.4);
      this.bedFilter.frequency.setTargetAtTime(120, now, 0.4);
      this.bedGain.gain.setTargetAtTime(0.065 * prebakedScale, now, 0.3);
      this.noiseFilter.frequency.setTargetAtTime(240, now, 0.4);
      this.noiseGain.gain.setTargetAtTime(0.018, now, 0.3);
      this.auditHumGain.gain.setTargetAtTime(0.0001, now, 0.25);
    } else if (this.mode === 'waking_3d') {
      // Deep space D2/A2 observatory drone subtly shifting with spectral wavelength
      this.subOsc.frequency.setTargetAtTime(73.42, now, 0.5);
      this.fifthOsc.frequency.setTargetAtTime(110.0 + waveNorm * 6.0, now, 0.5);
      this.bedFilter.frequency.setTargetAtTime(155 + waveNorm * 140, now, 0.35);
      this.bedGain.gain.setTargetAtTime(0.11 * prebakedScale, now, 0.45);
      this.noiseFilter.frequency.setTargetAtTime(320 + waveNorm * 420, now, 0.35);
      this.noiseGain.gain.setTargetAtTime(0.022, now, 0.4);
      this.auditHumGain.gain.setTargetAtTime(0.0001, now, 0.25);
    } else {
      // 2D Dreamscape: warm F2/C3 oil warmth at high H% -> cool sterile higher bed at low H%
      const duck = this.overseerActive ? 0.32 : 1.0;
      this.subOsc.frequency.setTargetAtTime(87.31 + (1 - hNorm) * 22.7, now, 0.6);
      this.fifthOsc.frequency.setTargetAtTime(130.81 + (1 - hNorm) * 34.0, now, 0.6);
      this.bedFilter.frequency.setTargetAtTime(175 + hNorm * 240, now, 0.5);
      this.bedGain.gain.setTargetAtTime((0.085 + 0.055 * hNorm) * duck * prebakedScale, now, 0.45);
      this.noiseFilter.frequency.setTargetAtTime(280 + (1 - hNorm) * 900, now, 0.4);
      this.noiseGain.gain.setTargetAtTime(0.014 + (1 - hNorm) * 0.024, now, 0.4);
      this.auditHumGain.gain.setTargetAtTime(
        this.overseerActive ? (this.prebakedMusicActive ? 0.018 : 0.048) : 0.0001,
        now,
        0.22
      );
    }
  }

  /**
   * Drives the continuous interferometry probing carrier signal in 3D space
   * while aligning with a deep-field anomaly target.
   */
  updateProbeSignal(alignment: number, wavelengthMatch: number, lockProgress: number): void {
    if (!this.ctx || !this.probeOsc || !this.probeHarmonicOsc || !this.probeGain) return;
    const now = this.ctx.currentTime;

    if (this.mode !== 'waking_3d' || this.settings.muted) {
      this.probeGain.gain.setTargetAtTime(0.0001, now, 0.12);
      return;
    }

    const strength = alignment * (0.25 + 0.75 * wavelengthMatch);
    if (strength < 0.22) {
      this.probeGain.gain.setTargetAtTime(0.0001, now, 0.15);
      return;
    }

    // Gentle rhythmic pulse speeding up as photon integration approaches lock
    const pulseHz = 1.6 + lockProgress * 4.5;
    const pulse = 0.68 + 0.32 * Math.sin(now * Math.PI * 2 * pulseHz);
    const targetVol = Math.min(0.11, (0.018 + strength * 0.055 + lockProgress * 0.04) * pulse);
    const baseFreq = 260 + wavelengthMatch * 110 + lockProgress * 180;

    this.probeOsc.frequency.setTargetAtTime(baseFreq, now, 0.08);
    this.probeHarmonicOsc.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.08);
    this.probeGain.gain.setTargetAtTime(targetVol, now, 0.08);
  }

  playVernierDetent(wavelengthNm: number): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const nowMs = performance.now();
    if (nowMs - this.lastVernierTickTime < 45) return;
    this.lastVernierTickTime = nowMs;

    const now = this.ctx.currentTime;
    const norm = Math.max(0, Math.min(1, (wavelengthNm - 200) / 1600));
    const freq = 480 + norm * 680;
    this.shortClick(freq, 0.018, 0.038, now, 'sine');
  }

  playSonarPing(proximity01: number): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const p = Math.max(0, Math.min(1, proximity01));
    const freq = 280 + p * 460;
    this.playGlassNote(freq, 0.03 + p * 0.045, 0.02, 0.65, now, 'sine', this.sfxGain);
    if (p > 0.72) {
      this.playGlassNote(freq * 1.5, 0.025, 0.03, 0.55, now + 0.06, 'triangle', this.sfxGain);
    }
  }

  playHarmonicTone(match01: number): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const m = Math.max(0, Math.min(1, match01));
    const base = 293.66;
    this.playGlassNote(base, 0.025, 0.04, 0.38, now, 'sine', this.sfxGain);
    this.playGlassNote(base * (1.2 + m * 0.3), 0.02 + m * 0.03, 0.04, 0.42, now + 0.03, 'triangle', this.sfxGain);
  }

  playRingSnap(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    this.shortClick(660, 0.05, 0.07, now, 'triangle');
    this.playGlassNote(880, 0.045, 0.02, 0.5, now + 0.03, 'sine', this.sfxGain);
  }

  playStatusShift(tone: 'warm' | 'cold' | 'discovery'): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    if (tone === 'warm') {
      this.playGlassNote(261.63, 0.06, 0.08, 1.4, now, 'triangle', this.sfxGain);
      this.playGlassNote(329.63, 0.05, 0.1, 1.5, now + 0.08, 'sine', this.sfxGain);
      this.playGlassNote(392.0, 0.04, 0.12, 1.6, now + 0.16, 'sine', this.sfxGain);
    } else if (tone === 'cold') {
      this.shortClick(520, 0.06, 0.12, now, 'triangle');
      this.playGlassNote(220.0, 0.05, 0.04, 1.2, now + 0.06, 'sine', this.sfxGain);
      this.playGlassNote(311.13, 0.035, 0.05, 1.2, now + 0.14, 'sine', this.sfxGain);
    } else {
      this.playGlassNote(293.66, 0.055, 0.04, 1.2, now, 'sine', this.sfxGain);
      this.playGlassNote(440.0, 0.055, 0.05, 1.4, now + 0.09, 'sine', this.sfxGain);
      this.playGlassNote(587.33, 0.05, 0.06, 1.6, now + 0.18, 'triangle', this.sfxGain);
    }
  }

  playHoverTick(): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted || this.ctx.state !== 'running') return;
    const nowMs = performance.now();
    if (nowMs - this.lastHoverTickTime < 55) return;
    this.lastHoverTickTime = nowMs;
    this.shortClick(980, 0.012, 0.02, this.ctx.currentTime, 'sine');
  }

  playCue(cue: string): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;

    if (cue === 'overseer_chime') {
      // Polite, sterile two-tone clinical paging chime
      this.shortClick(880, 0.16, 0.13, now, 'sine');
      this.shortClick(659.25, 0.34, 0.13, now + 0.15, 'sine');
    } else if (cue === 'prune_cut') {
      // Visceral mechanical shear + brittle glass-shard descent + immediate frost snap
      this.music.triggerPruneSnap(Math.max(15, this.humanity - 12));
      this.shortClick(540, 0.07, 0.16, now, 'triangle');
      this.shortClick(112, 0.42, 0.2, now + 0.05, 'sawtooth');
      this.shortClick(1480, 0.18, 0.07, now + 0.08, 'sine');
      this.shortClick(1110, 0.24, 0.06, now + 0.15, 'sine');
    } else if (cue === 'petition_warm') {
      // Warm unsealed memory bloom (Fmaj9 arpeggio)
      const notes = [261.63, 329.63, 392.0, 440.0];
      notes.forEach((f, i) => {
        this.playGlassNote(f, 0.07, 0.08, 1.4, now + i * 0.07, 'triangle', this.sfxGain!);
      });
    } else if (cue === 'comms_ping') {
      // Deep-space radio-telescope carrier handshake
      this.shortClick(587.33, 0.09, 0.11, now, 'sine');
      this.shortClick(880.0, 0.12, 0.11, now + 0.09, 'sine');
      this.shortClick(1174.66, 0.24, 0.08, now + 0.19, 'sine');
    } else if (cue === 'scan_lock') {
      // Resonant astronomical lock chord (D -> A -> F# -> D5)
      this.playGlassNote(293.66, 0.09, 0.03, 1.1, now, 'sine', this.sfxGain);
      this.playGlassNote(440.0, 0.09, 0.04, 1.3, now + 0.08, 'sine', this.sfxGain);
      this.playGlassNote(587.33, 0.08, 0.05, 1.6, now + 0.17, 'triangle', this.sfxGain);
      this.playGlassNote(739.99, 0.05, 0.06, 1.8, now + 0.26, 'sine', this.sfxGain);
    } else if (cue === 'boot_click') {
      // Crisp physical optical shutter / relay latch
      this.shortClick(190, 0.035, 0.16, now, 'square');
      this.shortClick(92, 0.12, 0.12, now + 0.02, 'sine');
    } else if (cue === 'dream_enter') {
      // Soft painterly warm swell
      this.playGlassNote(174.61, 0.08, 0.35, 1.8, now, 'triangle', this.sfxGain);
      this.playGlassNote(261.63, 0.06, 0.45, 2.0, now + 0.1, 'sine', this.sfxGain);
    } else if (cue === 'iris_dive') {
      // Ascending optical iris dive + shimmering harmonic + crisp shutter latch
      this.sweepTone(165, 620, 0.42, 0.085, now);
      this.playGlassNote(587.33, 0.045, 0.06, 0.55, now + 0.12, 'sine', this.sfxGain);
      this.shortClick(920, 0.035, 0.065, now + 0.34, 'triangle');
    } else if (cue === 'iris_pullback') {
      // Descending optical pullback + soft glass tick
      this.sweepTone(540, 175, 0.38, 0.078, now);
      this.playGlassNote(392.0, 0.04, 0.04, 0.5, now + 0.08, 'sine', this.sfxGain);
      this.shortClick(660, 0.028, 0.05, now + 0.3, 'sine');
    } else if (cue === 'dream_wake') {
      // Crisp cold cryo wake chime + descending sweep
      this.playGlassNote(587.33, 0.068, 0.02, 1.05, now, 'sine', this.sfxGain);
      this.playGlassNote(880.0, 0.052, 0.03, 1.15, now + 0.05, 'sine', this.sfxGain);
      this.sweepTone(360, 125, 0.38, 0.065, now + 0.02);
    } else if (cue === 'overseer_slice') {
      // Sharp sterile clinical signal slice
      this.shortClick(1420, 0.11, 0.12, now, 'triangle');
      this.shortClick(210, 0.12, 0.105, now + 0.015, 'sawtooth');
      this.playGlassNote(880.0, 0.058, 0.01, 0.48, now + 0.04, 'sine', this.sfxGain);
      this.playGlassNote(1174.66, 0.035, 0.02, 0.42, now + 0.08, 'sine', this.sfxGain);
    } else if (cue === 'zoom_in') {
      this.sweepTone(320, 480, 0.11, 0.045, now);
    } else if (cue === 'zoom_out') {
      this.sweepTone(460, 300, 0.11, 0.045, now);
    } else if (cue === 'slew') {
      this.sweepTone(220, 340, 0.18, 0.05, now);
      this.shortClick(760, 0.03, 0.04, now + 0.16, 'sine');
    } else if (cue === 'choice') {
      // Soft tactile editorial tap
      this.shortClick(390, 0.045, 0.065, now, 'triangle');
      this.shortClick(585, 0.06, 0.04, now + 0.03, 'sine');
    } else if (cue === 'tick') {
      this.shortClick(720, 0.022, 0.045, now, 'sine');
    }
  }

  private shortClick(
    freq: number,
    duration: number,
    peak: number,
    startTime: number,
    type: OscillatorType
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  private sweepTone(
    startFreq: number,
    endFreq: number,
    duration: number,
    peak: number,
    startTime: number
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  getInstrumentHandle(): InstrumentAudioHandle {
    return {
      updateBeatSynth: (params) => this.updateBeatSynth(params),
      stopInstrumentAudio: () => this.stopInstrumentAudio(),
      playTumblerClick: (tension, hitSweetSpot) => this.playTumblerClick(tension, hitSweetSpot),
      playStereoSonarEcho: (pan, distanceNorm, pitchHz) =>
        this.playStereoSonarEcho(pan, distanceNorm, pitchHz),
      playSolenoidClack: (heavy) => this.playSolenoidClack(heavy),
      setWatchdogBed: (level) => this.setWatchdogBed(level),
      playCaptureShutter: (grade) => this.playCaptureShutter(grade),
      playProximityTick: (closeness01, pan) => this.playProximityTick(closeness01, pan),
      playPhaseLock: (stageIndex) => this.playPhaseLock(stageIndex),
      playHapticThump: (intensity01) => this.playHapticThump(intensity01),
    };
  }

  playProximityTick(closeness01: number, pan = 0): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const c = Math.max(0, Math.min(1, closeness01));
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(this.sfxGain);
    this.playGlassNote(360 + c * 540, 0.025 + c * 0.03, 0.004, 0.09, now, 'sine', panner);
  }

  playPhaseLock(stageIndex: number): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const notes = [330, 440, 587.33];
    const root = notes[Math.max(0, Math.min(2, stageIndex - 1))];
    this.playHapticThump(0.75);
    this.playGlassNote(root, 0.065, 0.008, 0.42, now, 'triangle', this.sfxGain);
    this.playGlassNote(root * 1.498, 0.055, 0.014, 0.55, now + 0.045, 'sine', this.sfxGain);
  }

  playHapticThump(intensity01: number): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const amp = Math.max(0.02, Math.min(0.18, 0.04 + intensity01 * 0.12));
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(84, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.055);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(amp, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  updateBeatSynth(params: BeatSynthParams): void {
    if (
      !this.ctx ||
      !this.beatOscA ||
      !this.beatOscB ||
      !this.beatHarmOsc ||
      !this.beatHarmGain ||
      !this.beatFilter ||
      !this.beatPanner ||
      !this.beatGain
    ) {
      return;
    }
    const now = this.ctx.currentTime;
    if (this.settings.muted || this.ctx.state !== 'running') {
      this.beatGain.gain.setTargetAtTime(0.0001, now, 0.08);
      return;
    }
    const base = 196 + params.harmonicLock * 98;
    const beatHz = Math.max(0, Math.min(26, params.beatHz));
    this.beatOscA.frequency.setTargetAtTime(base, now, 0.04);
    this.beatOscB.frequency.setTargetAtTime(base + beatHz, now, 0.04);
    this.beatHarmOsc.frequency.setTargetAtTime(base * (params.warmth > 0.5 ? 1.498 : 2.0), now, 0.05);
    this.beatHarmGain.gain.setTargetAtTime(0.08 + params.warmth * 0.34, now, 0.06);
    this.beatFilter.frequency.setTargetAtTime(680 + params.harmonicLock * 920 + params.strain * 600, now, 0.06);
    this.beatPanner.pan.setTargetAtTime(Math.max(-1, Math.min(1, params.pan ?? 0)), now, 0.04);
    const targetLevel = 0.014 + params.harmonicLock * 0.022 + params.strain * 0.012;
    this.beatGain.gain.setTargetAtTime(targetLevel, now, 0.06);
  }

  stopInstrumentAudio(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.beatGain?.gain.setTargetAtTime(0.0001, now, 0.07);
    this.watchdogGain?.gain.setTargetAtTime(0.0001, now, 0.07);
  }

  playTumblerClick(tension: number, hitSweetSpot: boolean): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const f = hitSweetSpot ? 940 + tension * 220 : 310 + tension * 180;
    this.shortClick(f, hitSweetSpot ? 0.065 : 0.022, hitSweetSpot ? 0.085 : 0.04, now, hitSweetSpot ? 'triangle' : 'square');
    if (hitSweetSpot) {
      this.playGlassNote(f * 1.5, 0.055, 0.01, 0.35, now + 0.012, 'sine', this.sfxGain);
    }
  }

  playStereoSonarEcho(pan: number, distanceNorm: number, pitchHz = 620): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const delay = 0.06 + Math.max(0, Math.min(1, distanceNorm)) * 0.28;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(this.sfxGain);

    // Outgoing crisp ping + delayed echo bounce
    this.playGlassNote(pitchHz, 0.055, 0.005, 0.24, now, 'sine', panner);
    this.playGlassNote(pitchHz * 0.88, 0.045 * (1 - distanceNorm * 0.45), 0.012, 0.42, now + delay, 'triangle', panner);
  }

  playSolenoidClack(heavy = false): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    this.shortClick(heavy ? 150 : 260, heavy ? 0.048 : 0.024, heavy ? 0.13 : 0.075, now, 'square');
    this.shortClick(heavy ? 680 : 880, 0.018, 0.04, now + 0.01, 'triangle');
  }

  setWatchdogBed(level: number): void {
    if (!this.ctx || !this.watchdogGain || !this.watchdogOsc) return;
    const now = this.ctx.currentTime;
    if (this.settings.muted || level <= 0.02) {
      this.watchdogGain.gain.setTargetAtTime(0.0001, now, 0.06);
      return;
    }
    const clamped = Math.max(0, Math.min(1, level));
    this.watchdogOsc.frequency.setTargetAtTime(58 + clamped * 44, now, 0.05);
    this.watchdogGain.gain.setTargetAtTime(clamped * 0.055, now, 0.06);
  }

  playCaptureShutter(grade: MinigameGrade): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    this.stopInstrumentAudio();
    this.playSolenoidClack(true);
    if (grade === 'deep_overclock') {
      this.playGlassNote(293.66, 0.09, 0.02, 1.4, now + 0.03, 'triangle', this.sfxGain);
      this.playGlassNote(440.0, 0.09, 0.03, 1.6, now + 0.09, 'sine', this.sfxGain);
      this.playGlassNote(587.33, 0.08, 0.04, 1.8, now + 0.15, 'sine', this.sfxGain);
      this.playGlassNote(880.0, 0.07, 0.05, 2.0, now + 0.22, 'sine', this.sfxGain);
    } else if (grade === 'clean') {
      this.playGlassNote(293.66, 0.075, 0.02, 1.2, now + 0.03, 'sine', this.sfxGain);
      this.playGlassNote(440.0, 0.07, 0.04, 1.4, now + 0.11, 'triangle', this.sfxGain);
      this.playGlassNote(587.33, 0.055, 0.06, 1.6, now + 0.2, 'sine', this.sfxGain);
    } else if (grade === 'partial') {
      this.playGlassNote(261.63, 0.06, 0.02, 0.9, now + 0.04, 'sine', this.sfxGain);
      this.playGlassNote(329.63, 0.05, 0.04, 1.0, now + 0.13, 'sine', this.sfxGain);
    }
  }
}
