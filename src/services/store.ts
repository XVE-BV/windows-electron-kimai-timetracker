import Store from 'electron-store';
import { safeStorage } from 'electron';
import { AppSettings, TimerState, DEFAULT_SETTINGS } from '../types';

/**
 * Merge stored settings with defaults, ensuring all required fields exist
 * Stored values take precedence over defaults
 */
function mergeSettings(stored: Partial<AppSettings> | null | undefined): AppSettings {
  if (!stored) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    kimai: {
      ...DEFAULT_SETTINGS.kimai,
      ...stored.kimai,
    },
    activityWatch: {
      ...DEFAULT_SETTINGS.activityWatch,
      ...stored.activityWatch,
    },
    jira: {
      ...DEFAULT_SETTINGS.jira,
      ...stored.jira,
    },
    autoStartTimer: stored.autoStartTimer ?? DEFAULT_SETTINGS.autoStartTimer,
    useDefaults: stored.useDefaults ?? DEFAULT_SETTINGS.useDefaults,
    defaultCustomerId: stored.defaultCustomerId ?? DEFAULT_SETTINGS.defaultCustomerId,
    defaultProjectId: stored.defaultProjectId ?? DEFAULT_SETTINGS.defaultProjectId,
    defaultActivityId: stored.defaultActivityId ?? DEFAULT_SETTINGS.defaultActivityId,
    syncInterval: stored.syncInterval ?? DEFAULT_SETTINGS.syncInterval,
  };
}

// Store schema - tokens are stored encrypted
interface StoreSchema {
  settings: AppSettings;
  timerState: TimerState;
  // Encrypted tokens stored separately
  encryptedTokens?: {
    kimaiToken?: string;
    jiraToken?: string;
  };
}

const store = new Store<StoreSchema>({
  defaults: {
    settings: DEFAULT_SETTINGS,
    timerState: {
      isRunning: false,
      currentTimesheetId: null,
      startTime: null,
      projectId: null,
      activityId: null,
      description: '',
    },
  },
});

/**
 * Encrypt a string using Electron's safeStorage
 * Throws if encryption is not available to prevent plaintext credential storage
 */
function encryptString(value: string): string {
  if (!value) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure storage not available. Cannot save credentials safely.');
  }
  const encrypted = safeStorage.encryptString(value);
  return encrypted.toString('base64');
}

/**
 * Decrypt a string using Electron's safeStorage
 * Returns empty string if decryption fails for security
 */
function decryptString(value: string): string {
  if (!value) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('Secure storage not available, cannot decrypt credentials');
    return '';
  }
  try {
    const buffer = Buffer.from(value, 'base64');
    return safeStorage.decryptString(buffer);
  } catch (error) {
    // Decryption failed - return empty for security (don't leak potentially corrupted data)
    console.warn('Failed to decrypt credential, returning empty string');
    return '';
  }
}

export function getSettings(): AppSettings {
  let storedSettings: Partial<AppSettings> | null = null;

  try {
    storedSettings = store.get('settings') as Partial<AppSettings>;
  } catch (error) {
    console.error('Failed to read settings from store, using defaults:', error);
  }

  // Merge stored settings with defaults to handle schema changes
  // This ensures new fields added to DEFAULT_SETTINGS are always present
  const settings = mergeSettings(storedSettings);

  // Decrypt tokens
  try {
    const encryptedTokens = store.get('encryptedTokens');
    if (encryptedTokens) {
      if (encryptedTokens.kimaiToken) {
        settings.kimai.apiToken = decryptString(encryptedTokens.kimaiToken);
      }
      if (encryptedTokens.jiraToken && settings.jira) {
        settings.jira.apiToken = decryptString(encryptedTokens.jiraToken);
      }
    }
  } catch (error) {
    console.error('Failed to decrypt tokens:', error);
    // Leave tokens as empty strings (from defaults)
  }

  return settings;
}

export function saveSettings(settings: AppSettings): void {
  // Extract and encrypt tokens
  const kimaiToken = settings.kimai.apiToken;
  const jiraToken = settings.jira?.apiToken || '';

  // Store encrypted tokens separately
  store.set('encryptedTokens', {
    kimaiToken: encryptString(kimaiToken),
    jiraToken: encryptString(jiraToken),
  });

  // Store settings with placeholder tokens (don't store actual tokens in plain text)
  const settingsWithoutTokens: AppSettings = {
    ...settings,
    kimai: {
      ...settings.kimai,
      apiToken: '', // Don't store in plain text
    },
    jira: {
      ...settings.jira,
      apiToken: '', // Don't store in plain text
    },
  };

  store.set('settings', settingsWithoutTokens);
}

const DEFAULT_TIMER_STATE: TimerState = {
  isRunning: false,
  currentTimesheetId: null,
  startTime: null,
  projectId: null,
  activityId: null,
  description: '',
};

export function getTimerState(): TimerState {
  try {
    const stored = store.get('timerState') as Partial<TimerState> | undefined;
    if (!stored) {
      return DEFAULT_TIMER_STATE;
    }
    // Merge with defaults to ensure all fields are present
    return { ...DEFAULT_TIMER_STATE, ...stored };
  } catch (error) {
    console.error('Failed to read timer state from store:', error);
    return DEFAULT_TIMER_STATE;
  }
}

export function saveTimerState(state: TimerState): void {
  store.set('timerState', state);
}

export function updateTimerState(updates: Partial<TimerState>): TimerState {
  const current = getTimerState();
  const updated = { ...current, ...updates };
  saveTimerState(updated);
  return updated;
}

/**
 * Check if secure storage is available
 */
export function isSecureStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export default store;
