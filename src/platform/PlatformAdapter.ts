/**
 * Thin platform boundary so Phases 0-5 stay 100% pure static HTML,
 * while Phase 6 swaps cleanly to Electron/Steamworks or Capacitor/Mobile.
 */
export interface PlatformAdapter {
  readonly kind: 'web' | 'steam' | 'mobile';
  loadState<T>(key: string): T | null;
  saveState<T>(key: string, value: T): void;
  clearState(key: string): void;
  unlockAchievement(id: string): void;
  hapticPulse(intensity: 'light' | 'medium'): void;
}

class WebPlatformAdapter implements PlatformAdapter {
  readonly kind = 'web' as const;

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

  unlockAchievement(_id: string): void {
    // No-op in pure HTML playtesting; wired to steamworks.js in Phase 6.
  }

  hapticPulse(intensity: 'light' | 'medium'): void {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(intensity === 'light' ? 12 : 28);
    }
  }
}

export const platform: PlatformAdapter = new WebPlatformAdapter();
