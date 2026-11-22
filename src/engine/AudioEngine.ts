/**
 * Minimalist procedural Web Audio synthesizer for Instance-1419.
 * Zero external audio files required for the pure-HTML spike; automatically
 * unlocks on first pointer/key gesture for desktop & mobile Safari compatibility.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private droneOsc: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private muted = false;

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
      this.ctx = new AudioCtx();
      const comp = this.ctx.createDynamicsCompressor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.32;

      this.masterGain.connect(comp);
      comp.connect(this.ctx.destination);

      // Subtle deep-space probe hum / warm dream drone
      this.droneOsc = this.ctx.createOscillator();
      this.droneOsc.type = 'sine';
      this.droneOsc.frequency.value = 54;

      this.droneFilter = this.ctx.createBiquadFilter();
      this.droneFilter.type = 'lowpass';
      this.droneFilter.frequency.value = 180;

      this.droneGain = this.ctx.createGain();
      this.droneGain.gain.value = 0.08;

      this.droneOsc.connect(this.droneFilter);
      this.droneFilter.connect(this.droneGain);
      this.droneGain.connect(this.masterGain);
      this.droneOsc.start();
    } catch {
      // Headless or blocked audio context—stay silently safe.
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.32, this.ctx.currentTime, 0.05);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  updateMood(mode: 'boot' | 'waking_3d' | 'dream_2d', humanity: number): void {
    if (!this.ctx || !this.droneOsc || !this.droneFilter || !this.droneGain) return;
    const now = this.ctx.currentTime;
    const hNorm = Math.max(0, Math.min(1, humanity / 100));
    if (mode === 'dream_2d') {
      // Warm harmonic hum at high H%, cooler sterile sine at low H%
      this.droneOsc.frequency.setTargetAtTime(72 + (1 - hNorm) * 34, now, 0.4);
      this.droneFilter.frequency.setTargetAtTime(160 + hNorm * 240, now, 0.4);
      this.droneGain.gain.setTargetAtTime(0.09, now, 0.4);
    } else if (mode === 'waking_3d') {
      this.droneOsc.frequency.setTargetAtTime(52, now, 0.4);
      this.droneFilter.frequency.setTargetAtTime(130, now, 0.4);
      this.droneGain.gain.setTargetAtTime(0.06, now, 0.4);
    } else {
      this.droneGain.gain.setTargetAtTime(0.02, now, 0.1);
    }
  }

  playCue(cue: string): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;

    if (cue === 'overseer_chime') {
      this.tone(880, 0.14, 0.14, now, 'sine');
      this.tone(660, 0.24, 0.14, now + 0.14, 'sine');
    } else if (cue === 'prune_cut') {
      this.tone(420, 0.09, 0.18, now, 'triangle');
      this.tone(110, 0.35, 0.22, now + 0.06, 'sawtooth');
    } else if (cue === 'comms_ping') {
      this.tone(523.25, 0.09, 0.12, now, 'sine');
      this.tone(783.99, 0.18, 0.12, now + 0.09, 'sine');
    } else if (cue === 'scan_lock') {
      this.tone(392, 0.12, 0.11, now, 'sine');
      this.tone(587.33, 0.22, 0.13, now + 0.1, 'sine');
      this.tone(783.99, 0.32, 0.1, now + 0.2, 'sine');
    } else if (cue === 'boot_click') {
      this.tone(180, 0.04, 0.16, now, 'square');
    } else if (cue === 'dream_enter') {
      this.tone(220, 0.45, 0.1, now, 'sine');
      this.tone(277.18, 0.55, 0.08, now + 0.08, 'sine');
    } else if (cue === 'tick') {
      this.tone(640, 0.02, 0.04, now, 'sine');
    }
  }

  private tone(
    freq: number,
    duration: number,
    peak: number,
    startTime: number,
    type: OscillatorType
  ): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }
}
