# Multiple Concurrent Timers

**Issue**: [#9](https://github.com/XVE-BV/windows-electron-kimai-timetracker/issues/9)
**Date**: 2026-04-02
**Approach**: Multi-timer state in local store (Approach A)

## Problem

The app only supports a single running timer. Users working on parallel tasks (e.g., a meeting while monitoring a deploy) need to track time against multiple projects simultaneously.

## Decisions

- **UI pattern**: List-based — all running timers appear as cards, each with its own stop button and controls.
- **After starting a timer**: Selectors reset to empty (clean slate for the next timer).
- **Concurrent limit**: Unbounded (no artificial limit, Kimai manages the constraint).
- **Startup recovery**: Query Kimai's `getActiveTimesheets()` to discover all running timers, including ones started from the web UI.

## Data Model

The single `TimerState` gets split into two concerns:

```typescript
// One per running timer
interface ActiveTimer {
  timesheetId: number;
  projectId: number;
  activityId: number;
  customerId: number | null;
  description: string;
  startTime: string;              // Kimai's rounded start time
  actualStartTime: string | null; // When user clicked Start (null for server-discovered timers)
  jiraIssue: JiraIssue | null;
}

// What the user is configuring for the NEXT timer to start
interface TimerSelections {
  customerId: number | null;
  projectId: number | null;
  activityId: number | null;
  description: string;
  jiraIssue: JiraIssue | null;
}
```

Both are persisted in electron-store. The old `timerState` key is migrated on first load.

## Store Layer (`services/store.ts`)

Replace:
- `getTimerState()` / `updateTimerState()` / `saveTimerState()`

With:
- `getActiveTimers(): ActiveTimer[]`
- `addActiveTimer(timer: ActiveTimer): void`
- `removeActiveTimer(timesheetId: number): void`
- `updateActiveTimer(timesheetId: number, updates: Partial<ActiveTimer>): void`
- `getTimerSelections(): TimerSelections`
- `updateTimerSelections(updates: Partial<TimerSelections>): TimerSelections`
- `resetTimerSelections(): void`

The store schema changes from `timerState: TimerState` to `activeTimers: ActiveTimer[]` + `timerSelections: TimerSelections`.

## Main Process (`index.ts`)

### `startTimer()`

1. Validate that `timerSelections` has a `projectId` and `activityId`.
2. Call `kimaiAPI.startTimer(projectId, activityId, description)`.
3. Add an `ActiveTimer` to the array with the returned timesheet data.
4. Reset `timerSelections` to empty (description, jiraIssue, customer/project/activity all cleared).
5. Start the timer update loop if not already running.

### `stopTimer(timesheetId: number)`

1. Takes `timesheetId` as a parameter (no longer operates on "the" timer).
2. Call `kimaiAPI.stopTimer(timesheetId)`.
3. Remove the `ActiveTimer` from the array.
4. Stop the timer update loop if the array is now empty.

### Timer Update Loop

- Runs as long as `activeTimers.length > 0`.
- Stops when the last timer is removed.

### Startup Recovery

1. Call `kimaiAPI.getActiveTimesheets()`.
2. Load local `activeTimers` from store.
3. Merge: for each server-active timesheet, if a local `ActiveTimer` matches by `timesheetId`, keep local metadata (`actualStartTime`, `jiraIssue`). If no local match, create a new `ActiveTimer` with null metadata.
4. Remove any local `ActiveTimer` whose `timesheetId` is not in the server response (stopped externally).
5. Start timer update loop if any timers are running.

### Tray

- Tooltip shows count: "Kimai - 2 timers running" or "Kimai - Idle".
- Context menu shows running timer count in status line.

### Reminders

- Fire only when `activeTimers.length === 0`.

## IPC Changes

### Modified Channels

| Channel | Old Signature | New Signature |
|---|---|---|
| `KIMAI_START_TIMER` | `(projectId, activityId, description?)` | No change (uses selections internally) |
| `KIMAI_STOP_TIMER` | `()` | `(timesheetId: number)` |
| `GET_TIMER_STATE` | `() => TimerState` | Removed |

### New Channels

| Channel | Signature |
|---|---|
| `GET_ACTIVE_TIMERS` | `() => ActiveTimer[]` |
| `GET_TIMER_SELECTIONS` | `() => TimerSelections` |
| `SET_TIMER_SELECTIONS` | `(selections: Partial<TimerSelections>) => TimerSelections` |
| `SET_TIMER_JIRA_ISSUE` | `(jiraIssue: JiraIssue \| null) => TimerSelections` |

### Preload Bridge

The `ElectronAPI` interface updates to match:
- `kimaiStopTimer(timesheetId: number)` — now requires an ID.
- `getActiveTimers()` — replaces `getTimerState()`.
- `getTimerSelections()` / `setTimerSelections()` — for selector form state.

## UI (`TrayView.tsx`)

### Running Timers Section

When `activeTimers.length > 0`, render a list of timer cards above the selector area. Each card shows:

- **Project name** + **activity name** (resolved from cached project/activity data)
- **Elapsed time** (ticking, computed from `startTime`)
- **Description** (shown as text, editable inline)
- **Jira issue badge** (if linked, shown as a small tag)
- **Stop button** (red square icon)

Cards are ordered by `startTime` ascending (oldest first).

### Selector Area

Always visible below the timer cards. Represents the *next* timer to start. Contains:
- Customer / Project / Activity selectors (unchanged behavior)
- Description field
- Jira issue picker
- Start button

After starting a timer, all selectors reset to empty.

### State Changes

- `timerState: TimerState | null` state var becomes `activeTimers: ActiveTimer[]`
- `timerSelections: TimerSelections` added for selector form state
- `elapsedTime` / `billedTime` single strings become per-timer computed values (calculated in render from each timer's `startTime`)
- `isTimerLoading` remains a single boolean (only one start/stop operation at a time)

## Migration

On first load with the new schema:

1. Check if old `timerState` key exists in the store.
2. If `timerState.isRunning` and `timerState.currentTimesheetId`, create `activeTimers[0]` from it.
3. Migrate selector fields (`customerId`, `projectId`, `activityId`, `description`, `jiraIssue`) into `timerSelections`.
4. Delete the old `timerState` key.
5. If the old timer wasn't running, just migrate selector fields and set `activeTimers` to `[]`.

## Jira Integration

- When stopping a timer that has a `jiraIssue`, the Jira worklog logic runs for that specific timer (using its `startTime`, `description`, and `jiraIssue`).
- The Jira issue is stored per-timer in `ActiveTimer`, not globally.
- The Jira issue picker in the selector area sets the issue on `timerSelections`, which gets copied to the `ActiveTimer` when started.

## Files Changed

1. **`src/types.ts`** — Add `ActiveTimer`, `TimerSelections` types. Update `IPC_CHANNELS`. Remove old `TimerState`.
2. **`src/services/store.ts`** — New CRUD functions for `activeTimers` + `timerSelections`. Migration logic. Remove old `getTimerState`/`updateTimerState`.
3. **`src/index.ts`** — Update `startTimer`/`stopTimer` to work with arrays. Update startup recovery. Update IPC handlers. Update tray tooltip/menu.
4. **`src/preload.ts`** — Update `ElectronAPI` interface and bridge functions.
5. **`src/components/TrayView.tsx`** — Timer card list, separate selector state, per-timer elapsed time.
