import Store from 'electron-store';
import { safeStorage } from 'electron';
import { AppSettings, TimerState, DEFAULT_SETTINGS } from '../types';

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
 */
function encryptString(value: string): string {
  if (!value) return '';
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(value);
    return encrypted.toString('base64');
  }
  // Fallback to plain storage if encryption not available
  console.warn('safeStorage encryption not available, storing in plain text');
  return value;
}

/**
 * Decrypt a string using Electron's safeStorage
 */
function decryptString(value: string): string {
  if (!value) return '';
  if (safeStorage.isEncryptionAvailable()) {
    try {
      const buffer = Buffer.from(value, 'base64');
      return safeStorage.decryptString(buffer);
    } catch (error) {
      // Might be an old unencrypted value, try using as-is
      console.warn('Failed to decrypt, using value as-is');
      return value;
    }
  }
  return value;
}

export function getSettings(): AppSettings {
  const settings = store.get('settings');
  const encryptedTokens = store.get('encryptedTokens');

  // Decrypt tokens
  if (encryptedTokens) {
    if (encryptedTokens.kimaiToken) {
      settings.kimai.apiToken = decryptString(encryptedTokens.kimaiToken);
    }
    if (encryptedTokens.jiraToken && settings.jira) {
      settings.jira.apiToken = decryptString(encryptedTokens.jiraToken);
    }
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

export function getTimerState(): TimerState {
  return store.get('timerState');
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
