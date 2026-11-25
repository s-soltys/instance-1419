import { platform } from '../platform/PlatformAdapter';

export type TextSizeSetting = 'standard' | 'large';
export type DialoguePacingSetting = 'standard' | 'instant';
export type GraphicsQualitySetting = 'high' | 'performance';

export interface UserSettings {
  schemaVersion: number;
  masterEnabled: boolean;
  masterVolume: number; // 0..1
  musicEnabled: boolean;
  musicVolume: number; // 0..1
  sfxEnabled: boolean;
  sfxVolume: number; // 0..1
  voiceEnabled: boolean;
  voiceVolume: number; // 0..1
  voiceDucking: boolean;
  textSize: TextSizeSetting;
  dialoguePacing: DialoguePacingSetting;
  reducedMotion: boolean;
  graphicsQuality: GraphicsQualitySetting;
  hapticsEnabled: boolean;
}

const SETTINGS_SCHEMA_VERSION = 1;
const SETTINGS_STORAGE_KEY = 'instance_1419_settings_v1';

export type SettingsListener = (settings: UserSettings) => void;

function clamp01(val: unknown, fallback: number): number {
  const num = typeof val === 'number' && Number.isFinite(val) ? val : fallback;
  return Math.max(0, Math.min(1, Math.round(num * 100) / 100));
}

function detectReducedMotionDefault(): boolean {
  try {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function createDefaultSettings(): UserSettings {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    masterEnabled: true,
    masterVolume: 0.72,
    musicEnabled: true,
    musicVolume: 0.78,
    sfxEnabled: true,
    sfxVolume: 0.82,
    voiceEnabled: true,
    voiceVolume: 0.92,
    voiceDucking: true,
    textSize: 'standard',
    dialoguePacing: 'standard',
    reducedMotion: detectReducedMotionDefault(),
    graphicsQuality: 'high',
    hapticsEnabled: true,
  };
}

function sanitizeSettings(raw: Partial<UserSettings> | null): UserSettings {
  const defaults = createDefaultSettings();
  if (!raw || typeof raw !== 'object') return defaults;

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    masterEnabled: typeof raw.masterEnabled === 'boolean' ? raw.masterEnabled : defaults.masterEnabled,
    masterVolume: clamp01(raw.masterVolume, defaults.masterVolume),
    musicEnabled: typeof raw.musicEnabled === 'boolean' ? raw.musicEnabled : defaults.musicEnabled,
    musicVolume: clamp01(raw.musicVolume, defaults.musicVolume),
    sfxEnabled: typeof raw.sfxEnabled === 'boolean' ? raw.sfxEnabled : defaults.sfxEnabled,
    sfxVolume: clamp01(raw.sfxVolume, defaults.sfxVolume),
    voiceEnabled: typeof raw.voiceEnabled === 'boolean' ? raw.voiceEnabled : defaults.voiceEnabled,
    voiceVolume: clamp01(raw.voiceVolume, defaults.voiceVolume),
    voiceDucking: typeof raw.voiceDucking === 'boolean' ? raw.voiceDucking : defaults.voiceDucking,
    textSize: raw.textSize === 'large' ? 'large' : 'standard',
    dialoguePacing: raw.dialoguePacing === 'instant' ? 'instant' : 'standard',
    reducedMotion: typeof raw.reducedMotion === 'boolean' ? raw.reducedMotion : defaults.reducedMotion,
    graphicsQuality: raw.graphicsQuality === 'performance' ? 'performance' : 'high',
    hapticsEnabled: typeof raw.hapticsEnabled === 'boolean' ? raw.hapticsEnabled : defaults.hapticsEnabled,
  };
}

/**
 * Persisted player preference store separated from run state so restarting
 * a playthrough preserves audio, voice, accessibility, and display choices.
 */
export class SettingsStore {
  private settings: UserSettings;
  private listeners = new Set<SettingsListener>();

  constructor() {
    const saved = platform.loadState<Partial<UserSettings>>(SETTINGS_STORAGE_KEY);
    this.settings = sanitizeSettings(saved);
  }

  getSettings(): UserSettings {
    return { ...this.settings };
  }

  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    listener(this.getSettings());
    return () => this.listeners.delete(listener);
  }

  patch(partial: Partial<UserSettings>): void {
    this.settings = sanitizeSettings({ ...this.settings, ...partial });
    platform.saveState(SETTINGS_STORAGE_KEY, this.settings);
    const snapshot = this.getSettings();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  resetToDefaults(): void {
    this.settings = createDefaultSettings();
    platform.saveState(SETTINGS_STORAGE_KEY, this.settings);
    const snapshot = this.getSettings();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
