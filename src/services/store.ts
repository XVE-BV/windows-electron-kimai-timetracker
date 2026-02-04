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
    themeMode: stored.themeMode ?? DEFAULT_SETTINGS.themeMode,
    favoriteCustomerIds: stored.favoriteCustomerIds ?? DEFAULT_SETTINGS.favoriteCustomerIds,
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
      actualStartTime: null,
      customerId: null,
      projectId: null,
      activityId: null,
      description: '',
      jiraIssue: null,
    },
  },
});

// Track if we're using plaintext fallback (for development without Keychain)
let usingPlaintextFallback = false;

/**
 * Encrypt a string using Electron's safeStorage
 * Falls back to base64 encoding if encryption is not available (development only)
 */
function encryptString(value: string): string {
  if (!value) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback for development: use base64 with a marker prefix
    console.warn('safeStorage not available, using plaintext fallback (development only)');
    usingPlaintextFallback = true;
    return 'PLAINTEXT:' + Buffer.from(value).toString('base64');
  }
  const encrypted = safeStorage.encryptString(value);
  return encrypted.toString('base64');
}

/**
 * Decrypt a string using Electron's safeStorage
 * Returns empty string if decryption fails for security
 * Sets flag if decryption failed (likely due to app identity change)
 */
let decryptionFailed = false;

function decryptString(value: string): string {
  if (!value) return '';

  // Handle plaintext fallback (development mode)
  if (value.startsWith('PLAINTEXT:')) {
    usingPlaintextFallback = true;
    return Buffer.from(value.slice(10), 'base64').toString('utf-8');
  }

  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('Secure storage not available, cannot decrypt credentials');
    return '';
  }
  try {
    const buffer = Buffer.from(value, 'base64');
    return safeStorage.decryptString(buffer);
  } catch (error) {
    // Decryption failed - likely app identity changed (dev vs prod build)
    console.warn('Failed to decrypt credential - app identity may have changed');
    decryptionFailed = true;
    return '';
  }
}

/**
 * Check if decryption failed (useful for showing re-auth prompt)
 */
export function didDecryptionFail(): boolean {
  return decryptionFailed;
}

/**
 * Clear the decryption failed flag after user re-enters credentials
 */
export function clearDecryptionFailedFlag(): void {
  decryptionFailed = false;
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

      // If decryption failed, clear the invalid encrypted tokens
      // so they can be re-saved with the new app identity
      if (decryptionFailed) {
        console.warn('Clearing encrypted tokens due to decryption failure (app identity changed)');
        store.delete('encryptedTokens');
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
  actualStartTime: null,
  customerId: null,
  projectId: null,
  activityId: null,
  description: '',
  jiraIssue: null,
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

/**
 * Check if using plaintext fallback (for development without Keychain)
 */
export function isUsingPlaintextFallback(): boolean {
  return usingPlaintextFallback;
}

export default store;
