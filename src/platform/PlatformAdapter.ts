/**
 * Thin platform boundary so web prototypes stay 100% pure static HTML,
 * while Steam (Electron/steamworks.js) or Mobile/Switch swaps cleanly behind
 * synchronous/async storage, export, achievement, and haptic hooks.
 */
export interface PlatformAdapter {
  readonly kind: 'web' | 'steam' | 'mobile';
  loadState<T>(key: string): T | null;
  saveState<T>(key: string, value: T): void;
  clearState(key: string): void;
  loadStateAsync<T>(key: string): Promise<T | null>;
  saveStateAsync<T>(key: string, value: T): Promise<void>;
  exportJsonFile(filename: string, data: unknown): void;
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

  hapticPulse(intensity: 'light' | 'medium'): void {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(intensity === 'light' ? 12 : 28);
    }
  }
}

export const platform: PlatformAdapter = new WebPlatformAdapter();
