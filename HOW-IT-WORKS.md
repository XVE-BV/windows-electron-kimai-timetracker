# How Time Tracking Works

The Electron app acts as a **remote control** for Kimai - it doesn't track time locally. All time data lives on Kimai's server.

## Architecture Overview

```mermaid
flowchart LR
    subgraph Local["Your Computer"]
        E[Electron App]
        AW[ActivityWatch]
    end

    subgraph Remote["Cloud"]
        K[(Kimai Server)]
    end

    E -->|API Calls| K
    AW -.->|Activity Data| E
```

## Starting a Timer

```mermaid
sequenceDiagram
    participant U as User
    participant E as Electron App
    participant K as Kimai Server

    U->>E: Click "Start Timer"
    E->>K: POST /api/timesheets<br/>{ begin, project, activity }
    K-->>E: { id: 10724, begin: "10:00:00" }
    E->>E: Store locally:<br/>timesheetId, startTime

    loop Every Second
        E->>E: Calculate elapsed time
        E->>E: Update tray: "Running: 0:05"
    end
```

### What Gets Sent to Kimai

```json
{
  "begin": "2026-01-29T10:00:00",
  "project": 7,
  "activity": 1,
  "description": "Working on feature X"
}
```

Note: **No `end` time** = timer is running on Kimai

## Stopping a Timer

```mermaid
sequenceDiagram
    participant U as User
    participant E as Electron App
    participant K as Kimai Server

    U->>E: Click "Stop Timer"
    E->>K: PATCH /api/timesheets/10724/stop
    K->>K: Set end time<br/>Calculate duration
    K-->>E: { id: 10724, duration: 3600 }
    E->>E: Clear local state
    E->>U: Notification: "Recorded: 1:00:00"
```

## Manual Time Entry

```mermaid
sequenceDiagram
    participant U as User
    participant E as Electron App
    participant AW as ActivityWatch
    participant K as Kimai Server

    U->>E: Open "Add Manual Entry"
    E->>AW: GET /api/0/buckets/.../events
    AW-->>E: Recent activity data
    E->>U: Show activity suggestions
    U->>E: Fill form & submit
    E->>K: POST /api/timesheets<br/>{ begin, end, project, activity }
    K-->>E: { id: 10725 }
    E->>U: Success! Close window
```

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                        ELECTRON APP                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Tray Menu  │    │  Settings   │    │ Time Entry  │         │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│         │                  │                  │                 │
│         └────────────┬─────┴─────┬────────────┘                 │
│                      │           │                              │
│              ┌───────▼───────┐   │                              │
│              │  electron-    │   │                              │
│              │  store        │   │                              │
│              │  (settings,   │   │                              │
│              │   timer state)│   │                              │
│              └───────────────┘   │                              │
│                                  │                              │
│         ┌────────────────────────┼────────────────────┐        │
│         │                        │                    │        │
│  ┌──────▼──────┐          ┌──────▼──────┐    ┌───────▼──────┐  │
│  │ kimai.ts    │          │ activitywatch│    │  store.ts   │  │
│  │ (API calls) │          │ .ts          │    │  (persist)  │  │
│  └──────┬──────┘          └──────┬───────┘    └─────────────┘  │
└─────────┼────────────────────────┼──────────────────────────────┘
          │                        │
          ▼                        ▼
   ┌──────────────┐        ┌───────────────┐
   │    KIMAI     │        │ ACTIVITYWATCH │
   │   (Cloud)    │        │   (Local)     │
   │              │        │               │
   │ - Timesheets │        │ - Window logs │
   │ - Projects   │        │ - AFK status  │
   │ - Activities │        │ - App usage   │
   └──────────────┘        └───────────────┘
```

## What's Stored Where

| Location | Data |
|----------|------|
| **Kimai Server** | Timesheets, projects, activities, customers, rates |
| **Electron Store** (local) | API credentials, timer state, default project/activity |
| **ActivityWatch** (local) | App usage, window titles, AFK status |

## Key Behavior

1. **App closes while timer running?** Timer keeps running on Kimai. When you reopen, app syncs with server.

2. **No internet?** App won't work - it needs Kimai connection for all operations.

3. **Multiple devices?** Timer started on one device shows on all (it's server-side).
