# Multiple Concurrent Timers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to run multiple Kimai timers concurrently, displayed as individual cards with independent controls.

**Architecture:** Split the single `TimerState` into `ActiveTimer[]` (running timers) + `TimerSelections` (next-timer form state). Each running timer is a card in the UI with its own stop button, description, and Jira badge. On startup, sync with Kimai's `getActiveTimesheets()` to discover all running timers.

**Tech Stack:** TypeScript, Electron IPC, React, electron-store, Kimai REST API

**Spec:** `docs/superpowers/specs/2026-04-02-multiple-concurrent-timers-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/types.ts` | Modify | Add `ActiveTimer`, `TimerSelections` types; update `IPC_CHANNELS`; keep `TimerState` temporarily for migration |
| `src/services/store.ts` | Modify | CRUD for `activeTimers` + `timerSelections`; migration from old `timerState` |
| `src/index.ts` | Modify | Multi-timer `startTimer`/`stopTimer`; startup recovery; IPC handlers; tray tooltip |
| `src/preload.ts` | Modify | Update bridge functions and `ElectronAPI` interface |
| `src/components/TrayView.tsx` | Modify | Timer card list; separated selector state; per-timer elapsed time |

---

### Task 1: Add new types and IPC channels

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add `ActiveTimer` and `TimerSelections` interfaces**

Add these after the existing `TimerState` interface (keep `TimerState` for now — it's needed by migration code in Task 2):

```typescript
// Active timer - one per running timesheet
export interface ActiveTimer {
  timesheetId: number;
  projectId: number;
  activityId: number;
  customerId: number | null;
  description: string;
  startTime: string;              // Kimai's rounded start time
  actualStartTime: string | null; // When user clicked Start (null for server-discovered timers)
  jiraIssue: JiraIssue | null;
}

// Selector state for the next timer to start
export interface TimerSelections {
  customerId: number | null;
  projectId: number | null;
  activityId: number | null;
  description: string;
  jiraIssue: JiraIssue | null;
}
```

- [ ] **Step 2: Update `IPC_CHANNELS`**

Replace the Timer section of `IPC_CHANNELS` with:

```typescript
  // Timer
  GET_ACTIVE_TIMERS: 'get-active-timers',
  GET_TIMER_SELECTIONS: 'get-timer-selections',
  SET_TIMER_SELECTIONS: 'set-timer-selections',
  SET_TIMER_JIRA_ISSUE: 'set-timer-jira-issue',
```

Remove the old `GET_TIMER_STATE` channel. The `KIMAI_START_TIMER` and `KIMAI_STOP_TIMER` channels stay in the Kimai section unchanged (stop will get a parameter change at the IPC handler level).

- [ ] **Step 3: Verify build**

Run: `cd /Users/xve/.polyscope/clones/65bcdbf2/steady-horse && npx tsc --noEmit 2>&1 | head -30`

Expected: Type errors in `store.ts`, `index.ts`, `preload.ts`, and `TrayView.tsx` referencing the removed `GET_TIMER_STATE` channel and `TimerState` usage. This is expected — we'll fix these in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat: add ActiveTimer and TimerSelections types for multi-timer support"
```

---

### Task 2: Update store layer with multi-timer CRUD and migration

**Files:**
- Modify: `src/services/store.ts`

- [ ] **Step 1: Update store schema and defaults**

Replace the `StoreSchema` interface and store initialization:

```typescript
import { AppSettings, TimerState, ActiveTimer, TimerSelections, DEFAULT_SETTINGS } from '../types';

interface StoreSchema {
  settings: AppSettings;
  // Legacy — only used for migration, then deleted
  timerState?: TimerState;
  // New multi-timer state
  activeTimers: ActiveTimer[];
  timerSelections: TimerSelections;
  // Encrypted tokens stored separately
  encryptedTokens?: {
    kimaiToken?: string;
    jiraToken?: string;
  };
}

const DEFAULT_TIMER_SELECTIONS: TimerSelections = {
  customerId: null,
  projectId: null,
  activityId: null,
  description: '',
  jiraIssue: null,
};

const store = new Store<StoreSchema>({
  defaults: {
    settings: DEFAULT_SETTINGS,
    activeTimers: [],
    timerSelections: DEFAULT_TIMER_SELECTIONS,
  },
});
```

- [ ] **Step 2: Add migration function**

Add after the store initialization, before the encryption functions:

```typescript
/**
 * Migrate from single TimerState to multi-timer schema.
 * Runs once on first load after upgrade.
 */
function migrateTimerState(): void {
  try {
    const legacy = store.get('timerState') as TimerState | undefined;
    if (!legacy) return;

    // Migrate running timer into activeTimers array
    if (legacy.isRunning && legacy.currentTimesheetId && legacy.projectId && legacy.activityId) {
      const activeTimer: ActiveTimer = {
        timesheetId: legacy.currentTimesheetId,
        projectId: legacy.projectId,
        activityId: legacy.activityId,
        customerId: legacy.customerId,
        description: legacy.description || '',
        startTime: legacy.startTime || new Date().toISOString(),
        actualStartTime: legacy.actualStartTime || null,
        jiraIssue: legacy.jiraIssue || null,
      };
      store.set('activeTimers', [activeTimer]);
    }

    // Migrate selector fields into timerSelections
    const selections: TimerSelections = {
      customerId: legacy.customerId,
      projectId: legacy.projectId,
      activityId: legacy.activityId,
      description: legacy.isRunning ? '' : (legacy.description || ''),
      jiraIssue: legacy.isRunning ? null : (legacy.jiraIssue || null),
    };
    store.set('timerSelections', selections);

    // Delete legacy key
    store.delete('timerState');
    console.log('Migrated legacy timerState to multi-timer schema');
  } catch (error) {
    console.error('Failed to migrate timer state:', error);
  }
}

// Run migration on module load
migrateTimerState();
```

- [ ] **Step 3: Replace timer state functions with multi-timer CRUD**

Remove the old `DEFAULT_TIMER_STATE`, `getTimerState()`, `saveTimerState()`, and `updateTimerState()` functions. Replace with:

```typescript
// --- Active Timers ---

export function getActiveTimers(): ActiveTimer[] {
  try {
    return store.get('activeTimers') || [];
  } catch (error) {
    console.error('Failed to read active timers from store:', error);
    return [];
  }
}

export function addActiveTimer(timer: ActiveTimer): void {
  const timers = getActiveTimers();
  timers.push(timer);
  store.set('activeTimers', timers);
}

export function removeActiveTimer(timesheetId: number): void {
  const timers = getActiveTimers().filter(t => t.timesheetId !== timesheetId);
  store.set('activeTimers', timers);
}

export function updateActiveTimer(timesheetId: number, updates: Partial<ActiveTimer>): void {
  const timers = getActiveTimers().map(t =>
    t.timesheetId === timesheetId ? { ...t, ...updates } : t
  );
  store.set('activeTimers', timers);
}

export function setActiveTimers(timers: ActiveTimer[]): void {
  store.set('activeTimers', timers);
}

// --- Timer Selections ---

export function getTimerSelections(): TimerSelections {
  try {
    return store.get('timerSelections') || { ...DEFAULT_TIMER_SELECTIONS };
  } catch (error) {
    console.error('Failed to read timer selections from store:', error);
    return { ...DEFAULT_TIMER_SELECTIONS };
  }
}

export function updateTimerSelections(updates: Partial<TimerSelections>): TimerSelections {
  const current = getTimerSelections();
  const updated = { ...current, ...updates };
  store.set('timerSelections', updated);
  return updated;
}

export function resetTimerSelections(): void {
  store.set('timerSelections', { ...DEFAULT_TIMER_SELECTIONS });
}
```

- [ ] **Step 4: Update exports**

Make sure the module exports are updated. The old exports `getTimerState`, `updateTimerState` should no longer be exported. The new exports are:

```typescript
export {
  getSettings,
  saveSettings,
  getActiveTimers,
  addActiveTimer,
  removeActiveTimer,
  updateActiveTimer,
  setActiveTimers,
  getTimerSelections,
  updateTimerSelections,
  resetTimerSelections,
  didDecryptionFail,
  clearDecryptionFailedFlag,
  isSecureStorageAvailable,
  isUsingPlaintextFallback,
};
```

(These are already individually exported with the `export function` keyword — just verify the old ones are removed.)

- [ ] **Step 5: Commit**

```bash
git add src/services/store.ts
git commit -m "feat: multi-timer store with CRUD operations and migration from legacy schema"
```

---

### Task 3: Update main process for multi-timer support

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update imports**

Replace the store imports:

```typescript
import {
  getSettings,
  saveSettings,
  getActiveTimers,
  addActiveTimer,
  removeActiveTimer,
  updateActiveTimer,
  setActiveTimers,
  getTimerSelections,
  updateTimerSelections,
  resetTimerSelections,
  didDecryptionFail,
  clearDecryptionFailedFlag,
  isUsingPlaintextFallback,
} from './services/store';
```

Update the types import to include the new types:

```typescript
import { IPC_CHANNELS, VIEW_HASHES, KimaiProject, KimaiActivity, ActiveTimer, TimerSelections, ThemeMode, JiraIssue } from './types';
```

- [ ] **Step 2: Update `getElapsedSeconds` to accept a timer**

Replace the `getElapsedSeconds` function:

```typescript
function getElapsedSeconds(timer: ActiveTimer): number {
  const start = new Date(timer.startTime);
  const now = new Date();
  return Math.floor((now.getTime() - start.getTime()) / 1000);
}
```

- [ ] **Step 3: Update `buildContextMenu`**

Replace the timer status and start/stop sections of the context menu. Change the function to use `getActiveTimers()` and `getTimerSelections()` instead of `getTimerState()`:

Replace the line:
```typescript
const timerState = getTimerState();
```
with:
```typescript
const activeTimers = getActiveTimers();
const selections = getTimerSelections();
const isRunning = activeTimers.length > 0;
```

Replace the menu template timer status line:
```typescript
{
  label: isRunning ? `Running: ${activeTimers.length} timer${activeTimers.length !== 1 ? 's' : ''}` : 'Timer Stopped',
  enabled: false,
},
```

Replace the start/stop section:
```typescript
isRunning
  ? {
      label: 'Stop All Timers',
      click: stopAllTimers,
    }
  : {
      label: 'Start Timer',
      enabled: !!(selections.projectId && selections.activityId),
      click: startTimer,
    },
```

Replace the project/activity selection references from `timerState.projectId` / `timerState.activityId` to `selections.projectId` / `selections.activityId`.

In the project submenu click handler, replace:
```typescript
updateTimerState({ projectId: project.id, activityId: null });
```
with:
```typescript
updateTimerSelections({ projectId: project.id, activityId: null });
```

In the activity submenu click handler, replace:
```typescript
updateTimerState({ activityId: activity.id });
```
with:
```typescript
updateTimerSelections({ activityId: activity.id });
```

- [ ] **Step 4: Update `updateTrayMenu`**

Replace the tooltip logic:

```typescript
async function updateTrayMenu(): Promise<void> {
  if (tray) {
    const menu = await buildContextMenu();
    tray.setContextMenu(menu);

    const activeTimers = getActiveTimers();
    if (activeTimers.length > 0) {
      const count = activeTimers.length;
      const firstElapsed = formatDurationCompact(getElapsedSeconds(activeTimers[0]));
      tray.setToolTip(
        count === 1
          ? `Kimai Time Tracker - Running: ${firstElapsed}`
          : `Kimai Time Tracker - ${count} timers running`
      );
    } else {
      tray.setToolTip('Kimai Time Tracker - Idle');
    }
  }
}
```

- [ ] **Step 5: Rewrite `startTimer` and `stopTimer`**

Replace both functions:

```typescript
async function startTimer(): Promise<void> {
  const selections = getTimerSelections();
  if (!selections.projectId || !selections.activityId) {
    showNotification('Cannot Start Timer', 'Please select a project and activity first.');
    return;
  }

  const actualStartTime = new Date().toISOString();

  try {
    const timesheet = await kimaiAPI.startTimer(
      selections.projectId,
      selections.activityId,
      selections.description
    );

    const activeTimer: ActiveTimer = {
      timesheetId: timesheet.id,
      projectId: selections.projectId,
      activityId: selections.activityId,
      customerId: selections.customerId,
      description: selections.description,
      startTime: timesheet.begin,
      actualStartTime: actualStartTime,
      jiraIssue: selections.jiraIssue,
    };

    addActiveTimer(activeTimer);
    resetTimerSelections();
    startTimerUpdateLoop();
    updateTrayMenu();
  } catch (error) {
    console.error('Failed to start timer:', error);
    showNotification('Error', 'Failed to start timer. Please check your settings.');
  }
}

async function stopTimer(timesheetId: number): Promise<void> {
  try {
    await kimaiAPI.stopTimer(timesheetId);
    removeActiveTimer(timesheetId);

    const remaining = getActiveTimers();
    if (remaining.length === 0) {
      stopTimerUpdateLoop();
    }
    updateTrayMenu();
  } catch (error) {
    console.error('Failed to stop timer:', error);
    showNotification('Error', 'Failed to stop timer. Please check your connection.');
  }
}

async function stopAllTimers(): Promise<void> {
  const timers = getActiveTimers();
  for (const timer of timers) {
    try {
      await kimaiAPI.stopTimer(timer.timesheetId);
      removeActiveTimer(timer.timesheetId);
    } catch (error) {
      console.error(`Failed to stop timer ${timer.timesheetId}:`, error);
    }
  }
  stopTimerUpdateLoop();
  updateTrayMenu();
}
```

- [ ] **Step 6: Update `checkAndRemind`**

Replace:
```typescript
const timerState = getTimerState();
if (!timerState.isRunning) {
```
with:
```typescript
const activeTimers = getActiveTimers();
if (activeTimers.length === 0) {
```

- [ ] **Step 7: Update IPC handlers in `setupIPC`**

Replace the timer-related IPC handlers. Remove old ones and add new ones.

Replace the `KIMAI_START_TIMER` handler:
```typescript
ipcMain.handle(IPC_CHANNELS.KIMAI_START_TIMER, async (_, projectId: unknown, activityId: unknown, description?: unknown) => {
  const validProjectId = validateStrictPositiveInt(projectId, 'projectId');
  const validActivityId = validateStrictPositiveInt(activityId, 'activityId');
  const validDescription = validateOptionalString(description, 'description') || '';
  updateTimerSelections({ projectId: validProjectId, activityId: validActivityId, description: validDescription });
  await startTimer();
  return { activeTimers: getActiveTimers(), selections: getTimerSelections() };
});
```

Replace the `KIMAI_STOP_TIMER` handler:
```typescript
ipcMain.handle(IPC_CHANNELS.KIMAI_STOP_TIMER, async (_, timesheetId: unknown) => {
  const validId = validateStrictPositiveInt(timesheetId, 'timesheetId');
  await stopTimer(validId);
  return { activeTimers: getActiveTimers(), selections: getTimerSelections() };
});
```

Replace the `KIMAI_UPDATE_DESCRIPTION` handler — update the tracking prefix logic:
```typescript
ipcMain.handle(IPC_CHANNELS.KIMAI_UPDATE_DESCRIPTION, async (_, id: unknown, description: unknown) => {
  const validId = validateStrictPositiveInt(id, 'id');
  const validDescription = validateOptionalString(description, 'description') || '';
  const activeTimers = getActiveTimers();
  const isTracking = activeTimers.some(t => t.timesheetId === validId);
  const finalDescription = isTracking
    ? KimaiAPI.addTrackingPrefix(validDescription)
    : validDescription;
  const result = await kimaiAPI.updateTimesheet(validId, { description: finalDescription });
  if (isTracking) {
    updateActiveTimer(validId, { description: validDescription });
  }
  return result;
});
```

Remove the old `GET_TIMER_STATE` handler and replace with new handlers:
```typescript
// Active Timers
ipcMain.handle(IPC_CHANNELS.GET_ACTIVE_TIMERS, () => getActiveTimers());

// Timer Selections
ipcMain.handle(IPC_CHANNELS.GET_TIMER_SELECTIONS, () => getTimerSelections());
ipcMain.handle(IPC_CHANNELS.SET_TIMER_SELECTIONS, (_, selections: Partial<TimerSelections>) => {
  return updateTimerSelections(selections);
});
ipcMain.handle(IPC_CHANNELS.SET_TIMER_JIRA_ISSUE, (_, jiraIssue: JiraIssue | null) => {
  return updateTimerSelections({ jiraIssue });
});
```

- [ ] **Step 8: Update startup recovery in `initializeApp`**

Replace the timer recovery block:
```typescript
// Recover active timers — sync with Kimai server
try {
  const serverActive = await kimaiAPI.getActiveTimesheets();
  const localTimers = getActiveTimers();

  // Build merged list: keep local metadata where IDs match, add server-only timers
  const merged: ActiveTimer[] = serverActive.map(serverTs => {
    const local = localTimers.find(lt => lt.timesheetId === serverTs.id);
    if (local) {
      // Keep local metadata (actualStartTime, jiraIssue), update server fields
      return {
        ...local,
        startTime: serverTs.begin,
        projectId: serverTs.project,
        activityId: serverTs.activity,
        description: KimaiAPI.stripTrackingPrefix(serverTs.description || ''),
      };
    }
    // Server-only timer (started from web UI or another client)
    return {
      timesheetId: serverTs.id,
      projectId: serverTs.project,
      activityId: serverTs.activity,
      customerId: null,
      description: KimaiAPI.stripTrackingPrefix(serverTs.description || ''),
      startTime: serverTs.begin,
      actualStartTime: null,
      jiraIssue: null,
    };
  });

  setActiveTimers(merged);

  if (merged.length > 0) {
    startTimerUpdateLoop();
  }
} catch {
  // Unable to reach Kimai, keep local state and start loop if we have local timers
  if (getActiveTimers().length > 0) {
    startTimerUpdateLoop();
  }
}
```

- [ ] **Step 9: Update `remindersEnabled` check in status bar notification**

In the status bar section of `initializeApp`, the "Not tracking!" check references `timerState?.isRunning`. This is in the TrayView component, not here — that will be fixed in Task 5. No change needed in `index.ts` for this.

- [ ] **Step 10: Verify build compiles (types/main process)**

Run: `cd /Users/xve/.polyscope/clones/65bcdbf2/steady-horse && npx tsc --noEmit 2>&1 | head -40`

Expected: Errors only in `preload.ts` and `TrayView.tsx` (not yet updated). No errors in `index.ts` or `store.ts`.

- [ ] **Step 11: Commit**

```bash
git add src/index.ts src/services/store.ts
git commit -m "feat: multi-timer main process - start/stop/recover multiple concurrent timers"
```

---

### Task 4: Update preload bridge

**Files:**
- Modify: `src/preload.ts`

- [ ] **Step 1: Update imports**

Replace the types import:

```typescript
import {
  IPC_CHANNELS,
  AppSettings,
  KimaiTimesheetCreate,
  KimaiCustomer,
  KimaiProject,
  KimaiActivity,
  KimaiTimesheet,
  ActiveTimer,
  TimerSelections,
  AWBuckets,
  AWEvent,
  JiraIssue,
  ActivitySummaryItem,
  ThemeMode,
} from './types';
```

Remove `TimerState` from the import.

- [ ] **Step 2: Update the `contextBridge.exposeInMainWorld` block**

Replace the Kimai stop timer bridge:
```typescript
kimaiStopTimer: (timesheetId: number) =>
  ipcRenderer.invoke(IPC_CHANNELS.KIMAI_STOP_TIMER, timesheetId),
```

Replace the Timer State section:
```typescript
// Active Timers & Selections
getActiveTimers: () => ipcRenderer.invoke(IPC_CHANNELS.GET_ACTIVE_TIMERS),
getTimerSelections: () => ipcRenderer.invoke(IPC_CHANNELS.GET_TIMER_SELECTIONS),
setTimerSelections: (selections: Partial<TimerSelections>) =>
  ipcRenderer.invoke(IPC_CHANNELS.SET_TIMER_SELECTIONS, selections),
setTimerJiraIssue: (jiraIssue: JiraIssue | null) =>
  ipcRenderer.invoke(IPC_CHANNELS.SET_TIMER_JIRA_ISSUE, jiraIssue),
```

Remove the old `getTimerState` and `setTimerSelections` (old signature) entries.

- [ ] **Step 3: Update the `ElectronAPI` interface**

Replace the timer-related type definitions:

```typescript
kimaiStartTimer: (projectId: number, activityId: number, description?: string) => Promise<{ activeTimers: ActiveTimer[]; selections: TimerSelections }>;
kimaiStopTimer: (timesheetId: number) => Promise<{ activeTimers: ActiveTimer[]; selections: TimerSelections }>;
```

Replace the Timer State section:
```typescript
getActiveTimers: () => Promise<ActiveTimer[]>;
getTimerSelections: () => Promise<TimerSelections>;
setTimerSelections: (selections: Partial<TimerSelections>) => Promise<TimerSelections>;
setTimerJiraIssue: (jiraIssue: JiraIssue | null) => Promise<TimerSelections>;
```

Remove the old `getTimerState` type definition.

- [ ] **Step 4: Update the `Window` interface**

No change needed — it already references `ElectronAPI`.

- [ ] **Step 5: Verify build compiles (preload)**

Run: `cd /Users/xve/.polyscope/clones/65bcdbf2/steady-horse && npx tsc --noEmit 2>&1 | head -30`

Expected: Errors only in `TrayView.tsx` (the last file to update).

- [ ] **Step 6: Commit**

```bash
git add src/preload.ts
git commit -m "feat: update preload bridge for multi-timer IPC channels"
```

---

### Task 5: Update TrayView for multi-timer UI

**Files:**
- Modify: `src/components/TrayView.tsx`

This is the largest task. The changes are:
1. Replace single `timerState` with `activeTimers` array + `timerSelections`
2. Replace single elapsed/billed time with per-timer computed values
3. Add timer cards section above selectors
4. Update start/stop handler
5. Update all references from `timerState` to new state

- [ ] **Step 1: Update state declarations**

Replace the timer-related state at the top of the component. Remove:

```typescript
const [timerState, setTimerState] = useState<TimerState | null>(null);
const timerStateRef = useRef<TimerState | null>(null);
const [elapsedTime, setElapsedTime] = useState('00:00:00');
const [billedTime, setBilledTime] = useState('00:00:00');
```

Add:

```typescript
const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([]);
const activeTimersRef = useRef<ActiveTimer[]>([]);
const [timerSelections, setTimerSelections] = useState<TimerSelections | null>(null);
const [elapsedTimes, setElapsedTimes] = useState<Record<number, string>>({});
const [billedTimes, setBilledTimes] = useState<Record<number, string>>({});
```

Update the import from `../types`:
```typescript
import { ActiveTimer, TimerSelections, KimaiProject, KimaiActivity, KimaiTimesheet, KimaiCustomer, JiraIssue, ActivitySummaryItem, ThemeMode } from '../types';
```

- [ ] **Step 2: Update `updateElapsedTime`**

Replace the function:

```typescript
const updateElapsedTime = () => {
  const timers = activeTimersRef.current;
  const newElapsed: Record<number, string> = {};
  const newBilled: Record<number, string> = {};

  for (const timer of timers) {
    const now = new Date();
    const billedStart = new Date(timer.startTime);
    const billedSeconds = Math.floor((now.getTime() - billedStart.getTime()) / 1000);
    newBilled[timer.timesheetId] = formatSeconds(billedSeconds);

    const actualSeconds = timer.actualStartTime
      ? Math.floor((now.getTime() - new Date(timer.actualStartTime).getTime()) / 1000)
      : billedSeconds;
    newElapsed[timer.timesheetId] = formatSeconds(actualSeconds);
  }

  setElapsedTimes(newElapsed);
  setBilledTimes(newBilled);
};
```

- [ ] **Step 3: Update `loadData`**

In the `loadData` callback, replace all `timerState` / `getTimerState` references.

Replace:
```typescript
const state = await window.electronAPI.getTimerState();
setTimerState(state);
```
with:
```typescript
const timers = await window.electronAPI.getActiveTimers();
setActiveTimers(timers);
const selections = await window.electronAPI.getTimerSelections();
setTimerSelections(selections);
```

Replace the description/Jira restoration from timer state:
```typescript
if (state.description) {
  setDescription(state.description);
  setSavedDescription(state.description);
}
if (state.jiraIssue) {
  setSelectedJiraIssue(state.jiraIssue);
}
```
with:
```typescript
if (selections.description) {
  setDescription(selections.description);
  setSavedDescription(selections.description);
}
if (selections.jiraIssue) {
  setSelectedJiraIssue(selections.jiraIssue);
}
```

Replace the timer-running branch (`if (state.isRunning && state.projectId)`) with:
```typescript
if (timers.length > 0 && !selections.projectId) {
  // Timers running but no selection — leave selectors empty (ready for next timer)
  setSelectedCustomer(null);
  setSelectedProject(null);
  setSelectedActivity(null);
  setProjects([]);
  setActivities([]);
} else if (selections.jiraIssue) {
```

Keep the rest of the `else if (state.jiraIssue)` branch but replace `state.customerId`, `state.projectId`, `state.activityId` with `selections.customerId`, `selections.projectId`, `selections.activityId`. Similarly in the defaults branch.

- [ ] **Step 4: Update the ref sync effect**

Replace:
```typescript
useEffect(() => {
  timerStateRef.current = timerState;
  updateElapsedTime();
}, [timerState]);
```
with:
```typescript
useEffect(() => {
  activeTimersRef.current = activeTimers;
  updateElapsedTime();
}, [activeTimers]);
```

- [ ] **Step 5: Update `handleStartStop` to only handle starting**

Rename to `handleStart` and simplify — it only starts a new timer now. Each timer card has its own stop button.

```typescript
const handleStart = async () => {
  if (!window.electronAPI || isTimerLoading) return;
  if (!selectedProject || !selectedActivity) return;

  setIsTimerLoading(true);
  try {
    await window.electronAPI.kimaiStartTimer(selectedProject.id, selectedActivity.id, description);

    // Transition Jira issue to "In Progress" if applicable
    if (selectedJiraIssue && selectedJiraIssue.fields.status.name.toLowerCase() === 'to do') {
      try {
        const result = await window.electronAPI.jiraTransitionToInProgress(selectedJiraIssue.key);
        if (!result.success) {
          console.warn('Failed to transition Jira issue:', result.message);
        }
      } catch (error) {
        console.error('Failed to transition Jira issue:', error);
      }
    }

    // Reset local selector state (server already reset via resetTimerSelections)
    setDescription('');
    setSavedDescription('');
    setSelectedJiraIssue(null);
    setSelectedCustomer(null);
    setSelectedProject(null);
    setSelectedActivity(null);
    setProjects([]);
    setActivities([]);

    await loadData();
  } catch (error) {
    console.error('Start timer failed:', error);
  } finally {
    setIsTimerLoading(false);
  }
};
```

- [ ] **Step 6: Add `handleStopTimer` for individual timer cards**

```typescript
const [stoppingTimerId, setStoppingTimerId] = useState<number | null>(null);

const handleStopTimer = async (timer: ActiveTimer) => {
  if (!window.electronAPI || stoppingTimerId !== null) return;

  setStoppingTimerId(timer.timesheetId);
  try {
    // Log to Jira if applicable
    if (timer.jiraIssue && timer.startTime && jiraEnabled && jiraAutoLogWorklog) {
      try {
        const startDate = new Date(timer.startTime);
        const endDate = new Date();
        let durationSeconds = Math.floor((endDate.getTime() - startDate.getTime()) / 1000);
        if (durationSeconds < 900) {
          durationSeconds = 900;
        }
        await window.electronAPI.jiraAddWorklog(
          timer.jiraIssue.key,
          durationSeconds,
          startDate.toISOString(),
          timer.description || undefined
        );
      } catch (error) {
        console.error('Failed to log to Jira:', error);
        showError(`Failed to log time to Jira ${timer.jiraIssue.key}. Time was logged to Kimai only.`);
      }
    }

    await window.electronAPI.kimaiStopTimer(timer.timesheetId);
    await loadData();
  } catch (error) {
    console.error('Stop timer failed:', error);
    showError('Failed to stop timer');
  } finally {
    setStoppingTimerId(null);
  }
};
```

- [ ] **Step 7: Update `handleUpdateDescription` for multi-timer**

The description field in the selector area is for the next timer. For running timers, description editing happens inline on each card. Update:

```typescript
const handleUpdateTimerDescription = async (timesheetId: number, newDescription: string) => {
  if (!window.electronAPI) return;
  setIsUpdatingDescription(true);
  try {
    await window.electronAPI.kimaiUpdateDescription(timesheetId, newDescription);
  } catch (error) {
    console.error('Failed to update description:', error);
    showError('Failed to update description');
  } finally {
    setIsUpdatingDescription(false);
  }
};
```

- [ ] **Step 8: Update all `timerState?.isRunning` references**

Throughout the JSX, replace:
- `timerState?.isRunning` with `activeTimers.length > 0`
- `timerState?.currentTimesheetId` with specific timer lookups where needed

Key locations:
- Status bar "Not tracking!" badge: `remindersEnabled && activeTimers.length === 0`
- Jira ticket picker disabled state: remove `disabled={timerState?.isRunning}` — users can always pick a Jira issue for the next timer since selectors are independent
- Clear Jira issue button: remove `disabled={timerState?.isRunning}` 

- [ ] **Step 9: Replace the Timer Display section with Timer Cards**

Replace the entire Timer Display `<div>` (from `{/* Timer Display */}` to the closing `</div>` before `{/* Today's Stats */}`) with:

```tsx
{/* Running Timer Cards */}
{activeTimers.length > 0 && (
  <div className="border-b border-border">
    {activeTimers.map((timer) => (
      <div key={timer.timesheetId} className="p-3 border-b border-border/50 last:border-b-0 bg-gradient-to-r from-green-500/5 to-transparent">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
              <span className="text-sm font-medium truncate">
                {allProjects.find(p => p.id === timer.projectId)?.name || 'Unknown Project'}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 ml-4">
              <span className="text-xs text-muted-foreground truncate">
                {customers.find(c => c.id === timer.customerId)?.name}
                {timer.customerId && ' / '}
                {activities.length > 0
                  ? activities.find(a => a.id === timer.activityId)?.name || `Activity #${timer.activityId}`
                  : `Activity #${timer.activityId}`}
              </span>
            </div>
            {timer.description && (
              <div className="text-xs text-muted-foreground mt-1 ml-4 truncate">
                {timer.description}
              </div>
            )}
            {timer.jiraIssue && (
              <div className="mt-1 ml-4">
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-blue-500/10 text-blue-600 rounded">
                  {timer.jiraIssue.key}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right">
              <div className="text-lg font-mono font-bold text-primary">
                {elapsedTimes[timer.timesheetId] || '00:00:00'}
              </div>
              {elapsedTimes[timer.timesheetId] !== billedTimes[timer.timesheetId] && (
                <div className="text-[10px] font-mono text-muted-foreground" title="Billed time (Kimai rounds to 15min)">
                  Billed: {billedTimes[timer.timesheetId] || '00:00:00'}
                </div>
              )}
            </div>
            <Button
              onClick={() => handleStopTimer(timer)}
              disabled={stoppingTimerId !== null}
              size="sm"
              className="bg-red-500 hover:bg-red-600 h-8 w-8 p-0"
              title="Stop timer"
            >
              {stoppingTimerId === timer.timesheetId ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    ))}
  </div>
)}

{/* Idle State */}
{activeTimers.length === 0 && (
  <div className="p-4 text-center border-b border-border bg-gradient-to-b from-background to-muted/20">
    <div className="text-4xl font-mono font-bold tracking-wider text-muted-foreground">
      00:00:00
    </div>
    <div className="flex items-center justify-center gap-1 mt-2">
      <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
      <p className="text-xs text-muted-foreground">No timers running</p>
    </div>
  </div>
)}
```

- [ ] **Step 10: Update the Start button**

Replace the Start/Stop button section. It's now always a Start button:

```tsx
{/* Start Button */}
<div className="px-2 pb-2">
  <Button
    onClick={handleStart}
    disabled={isTimerLoading || !selectedProject || !selectedActivity}
    className="w-full bg-green-500 hover:bg-green-600"
    size="lg"
  >
    {isTimerLoading ? (
      <>
        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
        Starting...
      </>
    ) : (
      <>
        <Play className="h-4 w-4 mr-2" />
        Start Timer
      </>
    )}
  </Button>
</div>
```

- [ ] **Step 11: Remove `Square` import if no longer used elsewhere, and remove unused state**

Remove `savedDescription` state and `handleUpdateDescription` (replaced by `handleUpdateTimerDescription`). Check if the `description !== savedDescription` update button is still needed — it's not, since the description field is now only for the next timer, not for updating a running timer. Remove the "Update Description" button from the JSX.

Remove the import of `Square` from lucide-react if it's only used in timer cards now — actually it IS still used in timer cards, so keep it.

- [ ] **Step 12: Verify full build**

Run: `cd /Users/xve/.polyscope/clones/65bcdbf2/steady-horse && npx tsc --noEmit 2>&1 | head -50`

Expected: No errors. If there are errors, fix them — they'll likely be missed references to old `timerState` properties.

- [ ] **Step 13: Smoke test the app**

Run: `cd /Users/xve/.polyscope/clones/65bcdbf2/steady-horse && npm start`

Verify:
1. App starts without errors in the console
2. The tray window opens and shows the selector area
3. No running timers shown if none are active on Kimai

If Kimai credentials are configured:
4. Select customer, project, activity and click Start — a timer card appears
5. Start a second timer with different selections — two cards appear
6. Stop one timer — only one card remains
7. Stop the last timer — idle state shows "00:00:00"

- [ ] **Step 14: Commit**

```bash
git add src/components/TrayView.tsx
git commit -m "feat: multi-timer UI with individual timer cards and independent controls"
```

---

### Task 6: Clean up old `TimerState` type

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Remove `TimerState` interface**

Now that migration code in `store.ts` references it via the inline cast (`as TimerState`), we should keep a minimal version or use a plain type. Since the migration already ran (or will run once), and the type is only used in the migration cast in `store.ts`, replace the `TimerState` interface with a comment and use `unknown` in the migration cast:

In `src/services/store.ts`, change the migration line:
```typescript
const legacy = store.get('timerState') as TimerState | undefined;
```
to:
```typescript
const legacy = store.get('timerState') as {
  isRunning: boolean;
  currentTimesheetId: number | null;
  startTime: string | null;
  actualStartTime: string | null;
  customerId: number | null;
  projectId: number | null;
  activityId: number | null;
  description: string;
  jiraIssue: JiraIssue | null;
} | undefined;
```

Then remove the `TimerState` interface and its import from `types.ts`. Remove `TimerState` from the `store.ts` import.

- [ ] **Step 2: Verify build**

Run: `cd /Users/xve/.polyscope/clones/65bcdbf2/steady-horse && npx tsc --noEmit`

Expected: Clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts src/services/store.ts
git commit -m "chore: remove legacy TimerState type, inline migration shape"
```
