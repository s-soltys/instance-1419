/**
 * Thin platform boundary so web prototypes stay 100% pure static HTML,
 * while Steam (Electron/steamworks.js) or Mobile/Switch swaps cleanly behind
 * synchronous/async storage, export, achievement, and haptic hooks.
 */
export type HapticPattern =
  | 'vernierTick'
  | 'proximityPulse'
  | 'detentResistance'
  | 'phaseSnapLock'
  | 'rejectThud'
  | 'shutterCommit';

export interface PlatformAdapter {
  readonly kind: 'web' | 'steam' | 'mobile';
  loadState<T>(key: string): T | null;
  saveState<T>(key: string, value: T): void;
  clearState(key: string): void;
  loadStateAsync<T>(key: string): Promise<T | null>;
  saveStateAsync<T>(key: string, value: T): Promise<void>;
  exportJsonFile(filename: string, data: unknown): void;
  unlockAchievement(id: string): void;
  setHapticsEnabled(enabled: boolean): void;
  isHapticsEnabled(): boolean;
  hapticPulse(intensity: 'light' | 'medium'): void;
  triggerHaptic(pattern: HapticPattern, strength?: number): void;
}

const HAPTIC_SPECS: Record<HapticPattern, { ms: number | number[]; weak: number; strong: number; durationMs: number }> = {
  vernierTick: { ms: 6, weak: 0.14, strong: 0.04, durationMs: 14 },
  proximityPulse: { ms: 11, weak: 0.28, strong: 0.12, durationMs: 26 },
  detentResistance: { ms: 14, weak: 0.36, strong: 0.24, durationMs: 32 },
  phaseSnapLock: { ms: [18, 22, 28], weak: 0.48, strong: 0.65, durationMs: 75 },
  rejectThud: { ms: 34, weak: 0.62, strong: 0.72, durationMs: 65 },
  shutterCommit: { ms: [22, 18, 40], weak: 0.52, strong: 0.82, durationMs: 95 },
};

class WebPlatformAdapter implements PlatformAdapter {
  readonly kind = 'web' as const;
  private lastTickMs = 0;
  private hapticsEnabled = true;

  loadState<T>(key: string): T | null {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  saveState<T>(key: string, value: T): void {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage quota/sandbox errors in restricted preview iframes.
    }
  }

  clearState(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage errors.
    }
  }

  async loadStateAsync<T>(key: string): Promise<T | null> {
    return this.loadState<T>(key);
  }

  async saveStateAsync<T>(key: string, value: T): Promise<void> {
    this.saveState<T>(key, value);
  }

  exportJsonFile(filename: string, data: unknown): void {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Ignore in headless/restricted contexts.
    }
  }

  unlockAchievement(_id: string): void {
    // No-op in pure HTML playtesting; wired to steamworks.js in packaging phase.
  }

  setHapticsEnabled(enabled: boolean): void {
    this.hapticsEnabled = enabled;
  }

  isHapticsEnabled(): boolean {
    return this.hapticsEnabled;
  }

  hapticPulse(intensity: 'light' | 'medium'): void {
    this.triggerHaptic(intensity === 'light' ? 'proximityPulse' : 'phaseSnapLock', 1.0);
  }

  triggerHaptic(pattern: HapticPattern, strength = 1.0): void {
    if (!this.hapticsEnabled) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const isTick = pattern === 'vernierTick' || pattern === 'proximityPulse' || pattern === 'detentResistance';
    if (isTick && now - this.lastTickMs < 24) return;
    if (isTick) this.lastTickMs = now;

    const spec = HAPTIC_SPECS[pattern];
    const scale = Math.max(0.15, Math.min(1.0, strength));

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        const scaled = Array.isArray(spec.ms)
          ? spec.ms.map((d, idx) => (idx % 2 === 0 ? Math.max(4, Math.round(d * scale)) : d))
          : Math.max(4, Math.round(spec.ms * scale));
        navigator.vibrate(scaled);
      }

      if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
        const pads = navigator.getGamepads();
        for (const pad of pads) {
          const act = (pad as Gamepad & { vibrationActuator?: { playEffect?: (type: string, opts: Record<string, number>) => Promise<string> } } | null)?.vibrationActuator;
          if (act && typeof act.playEffect === 'function') {
            void act.playEffect('dual-rumble', {
              startDelay: 0,
              duration: spec.durationMs,
              weakMagnitude: spec.weak * scale,
              strongMagnitude: spec.strong * scale,
            }).catch(() => {});
          }
        }
      }
    } catch {
      // Ignore restricted navigator/gamepad permissions.
    }
  }
}

export const platform: PlatformAdapter = new WebPlatformAdapter();
