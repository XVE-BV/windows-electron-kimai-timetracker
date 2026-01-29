import Store from 'electron-store';
import { AppSettings, TimerState, DEFAULT_SETTINGS } from '../types';

interface StoreSchema {
  settings: AppSettings;
  timerState: TimerState;
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

export function getSettings(): AppSettings {
  return store.get('settings');
}

export function saveSettings(settings: AppSettings): void {
  store.set('settings', settings);
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

export default store;
