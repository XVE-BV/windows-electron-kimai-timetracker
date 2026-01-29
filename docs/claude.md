# Kimai Time Tracker - Windows Electron Tray App

A lightweight Windows system tray application for time tracking with [Kimai](https://www.kimai.org/), an open-source time tracking server. This app provides quick access to start/stop timers and log time entries without leaving your workflow.

## Overview

This application runs as a system tray icon in the Windows taskbar, providing instant access to time tracking features through a context menu. It integrates with a self-hosted or cloud Kimai instance via its REST API and optionally connects to ActivityWatch for automatic activity tracking suggestions.

### Key Features

- **System Tray Integration**: Minimal footprint, always accessible from taskbar
- **One-Click Timer**: Start/stop time tracking with a single click
- **Project & Activity Selection**: Full access to your Kimai projects and activities
- **Manual Time Entry**: Log historical time entries with a dedicated form
- **ActivityWatch Integration**: Get activity suggestions based on your computer usage
- **State Persistence**: Timer state survives app restarts and syncs with server
- **Real-Time Display**: Elapsed time shown in tray tooltip and menu

---

## Architecture

### Tech Stack

| Component | Technology |
|-----------|------------|
| Desktop Framework | Electron 40.0.0 |
| UI Framework | React 19.2.4 |
| Language | TypeScript 5.3.3 |
| Styling | Tailwind CSS 4.1.18 |
| UI Components | Radix UI primitives |
| Icons | Lucide React |
| Build System | Electron Forge + Webpack |
| Data Storage | electron-store |

### Process Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Main Process                            │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐    │
│  │  Tray Icon  │  │   Menus     │  │   IPC Handlers   │    │
│  └─────────────┘  └─────────────┘  └──────────────────┘    │
│                                            │                │
│  ┌─────────────────────────────────────────┴───────────┐   │
│  │                  Services Layer                      │   │
│  │  ┌────────────┐  ┌─────────────────┐  ┌──────────┐  │   │
│  │  │   Kimai    │  │  ActivityWatch  │  │  Store   │  │   │
│  │  │   API      │  │      API        │  │          │  │   │
│  │  └────────────┘  └─────────────────┘  └──────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                     Context Bridge
                     (preload.ts)
                            │
┌─────────────────────────────────────────────────────────────┐
│                   Renderer Process                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    React App                         │   │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────┐   │   │
│  │  │  Settings  │  │ TimeEntry  │  │   MainView   │   │   │
│  │  │    View    │  │    View    │  │              │   │   │
│  │  └────────────┘  └────────────┘  └──────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
src/
├── index.ts              # Main process: tray, menus, IPC handlers
├── preload.ts            # Context bridge for secure IPC
├── renderer.tsx          # React entry point
├── types.ts              # TypeScript interfaces and constants
├── index.css             # Tailwind + custom styles
├── index.html            # HTML template
├── services/
│   ├── kimai.ts          # Kimai REST API wrapper
│   ├── activitywatch.ts  # ActivityWatch API wrapper
│   └── store.ts          # Persistent storage wrapper
├── lib/
│   └── utils.ts          # Tailwind/clsx utilities
└── components/
    ├── App.tsx           # Hash-based router
    ├── MainView.tsx      # Home/welcome screen
    ├── SettingsView.tsx  # Settings configuration UI
    ├── TimeEntryView.tsx # Manual time entry form
    └── ui/               # Reusable Radix UI components
        ├── button.tsx
        ├── card.tsx
        ├── input.tsx
        ├── label.tsx
        ├── select.tsx
        ├── switch.tsx
        └── textarea.tsx
```

---

## Core Features

### 1. System Tray Integration

The app runs as a system tray icon with no visible main window. All interactions happen through:

- **Right-click context menu**: Access all features
- **Tooltip**: Shows current timer status and elapsed time
- **Tray icon**: Visual indicator that the app is running

The tray menu is built dynamically based on:
- Current timer state (running/stopped)
- Cached projects and activities from Kimai
- Selected project and activity

### 2. Timer Management

#### Starting a Timer

1. Select a project from the Projects submenu
2. Select an activity from the Activities submenu
3. Click "Start Timer"

The app sends a POST request to Kimai's `/timesheets` endpoint with:
- `begin`: Current ISO timestamp
- `project`: Selected project ID
- `activity`: Selected activity ID
- `description`: Optional description text

#### Stopping a Timer

1. Click "Stop Timer" in the tray menu
2. The app sends a PATCH request to `/timesheets/{id}/stop`
3. A notification shows the total recorded time

#### State Persistence

Timer state is persisted locally and includes:
- Running status
- Timesheet ID from Kimai
- Start timestamp
- Selected project and activity
- Description

On app startup, the app:
1. Checks local timer state
2. Queries Kimai for active timesheets
3. Reconciles local state with server state
4. Resumes timer display if still running

### 3. Manual Time Entry

The time entry window allows logging historical time:

| Field | Description |
|-------|-------------|
| Project | Required - Select from your Kimai projects |
| Activity | Required - Select based on chosen project |
| Date | Date for the time entry (defaults to today) |
| Start Time | When the work began |
| End Time | When the work ended |
| Description | Optional notes about the work |

The form sends a complete timesheet to Kimai with both `begin` and `end` timestamps.

### 4. ActivityWatch Integration

[ActivityWatch](https://activitywatch.net/) is an open-source automatic time tracker. When enabled, this app:

1. Connects to your local ActivityWatch server
2. Retrieves activity buckets (window tracking, AFK status)
3. Aggregates recent activity by application and window title
4. Displays activity suggestions in the time entry form

**Activity Suggestions** show:
- Application name (e.g., "VS Code", "Chrome")
- Window title (e.g., "project/file.ts", "GitHub - Pull Request")
- Duration spent in each window

Click a suggestion to insert it into the description field.

---

## Configuration

### Settings Storage

Settings are stored using `electron-store` in the user's AppData directory as JSON.

### Settings Schema

```typescript
interface AppSettings {
  kimai: {
    apiUrl: string;        // Kimai server URL (e.g., https://kimai.example.com)
    apiToken: string;      // API authentication token
  };
  activityWatch: {
    apiUrl: string;        // ActivityWatch URL (default: http://localhost:5600)
    enabled: boolean;      // Toggle ActivityWatch integration
  };
  autoStartTimer: boolean;         // Reserved for future use
  defaultProjectId: number | null; // Pre-select a default project
  defaultActivityId: number | null;// Pre-select a default activity
  syncInterval: number;            // Sync interval in minutes (default: 15)
}
```

### Timer State Schema

```typescript
interface TimerState {
  isRunning: boolean;           // Is timer currently active?
  currentTimesheetId: number;   // Active timesheet ID on Kimai server
  startTime: string;            // ISO timestamp when timer started
  projectId: number;            // Selected project ID
  activityId: number;           // Selected activity ID
  description: string;          // Work description
}
```

---

## API Integrations

### Kimai REST API

**Base URL**: Configured in settings (e.g., `https://kimai.example.com`)

**Authentication**: Bearer token in Authorization header

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/customers?visible=1` | GET | List visible customers |
| `/api/projects` | GET | List projects (optional customer filter) |
| `/api/activities` | GET | List activities (optional project filter) |
| `/api/timesheets` | GET | List timesheets with filters |
| `/api/timesheets/active` | GET | Get currently running timesheets |
| `/api/timesheets` | POST | Create new timesheet (start timer) |
| `/api/timesheets/{id}/stop` | PATCH | Stop running timesheet |

### ActivityWatch API

**Base URL**: Configurable (default: `http://localhost:5600`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/0/buckets/` | GET | List all activity buckets |
| `/api/0/buckets/{id}/events` | GET | Get events with optional time range |

**Bucket Types**:
- `currentwindow`: Active window tracking
- `afkstatus`: Away-from-keyboard detection

---

## IPC Communication

The preload script exposes a secure API to the renderer process:

### Settings API
- `getSettings()` - Retrieve all settings
- `saveSettings(settings)` - Persist settings

### Kimai API
- `kimaiTestConnection()` - Validate credentials
- `kimaiGetCustomers()` - Fetch customer list
- `kimaiGetProjects(customerId?)` - Fetch projects
- `kimaiGetActivities(projectId?)` - Fetch activities
- `kimaiGetTimesheets(params)` - Fetch timesheets with filters
- `kimaiStartTimer(projectId, activityId, description?)` - Start tracking
- `kimaiStopTimer()` - Stop tracking
- `kimaiCreateTimesheet(data)` - Create manual entry

### ActivityWatch API
- `awGetBuckets()` - Get activity buckets
- `awGetEvents(bucketId, start?, end?, limit?)` - Get events
- `awGetActivitySummary(minutes?)` - Get aggregated activity

### Window Management
- `openSettings()` - Open settings window
- `openTimeEntry()` - Open time entry window
- `closeWindow()` - Close current window
- `getTimerState()` - Get current timer state

---

## Security

### Electron Security Measures

- **Context Isolation**: Enabled - renderer cannot access Node.js
- **Node Integration**: Disabled - no direct Node.js access in renderer
- **Preload Bridge**: Only safe methods exposed via contextBridge
- **ASAR Integrity**: Validation enabled for packaged app

### API Security

- API tokens stored locally in electron-store
- All API requests made from main process (not exposed to web context)
- HTTPS recommended for Kimai server connection

---

## UI Components

### Component Library

The app uses a custom component library built on Radix UI primitives:

| Component | Purpose |
|-----------|---------|
| Button | Multi-variant button with primary, secondary, outline, ghost styles |
| Card | Container with header, content, footer sections |
| Input | Text input with consistent styling |
| Label | Accessible form labels |
| Select | Dropdown selection with Radix primitives |
| Switch | Toggle switches for boolean settings |
| Textarea | Multi-line text input |

### Views

| View | Route | Purpose |
|------|-------|---------|
| MainView | `#main` or none | Welcome screen, instructs to use tray |
| SettingsView | `#settings` | Configuration interface |
| TimeEntryView | `#time-entry` | Manual time entry form |

### Styling

- **Tailwind CSS** for utility-first styling
- **CSS Variables** for theming (light/dark mode support)
- **Custom scrollbars** for consistent cross-platform appearance
- **Fade-in animations** for smooth view transitions

---

## Development

### Prerequisites

- Node.js 18+
- npm or yarn
- Windows (primary target platform)

### Commands

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run make

# Package without building installer
npm run package
```

### Build Configuration

- **Electron Forge**: Handles packaging and distribution
- **Webpack**: Bundles main and renderer processes
- **TypeScript**: Strict type checking enabled
- **PostCSS + Tailwind**: CSS processing pipeline

---

## Data Flow

### Timer Start Flow

```
User clicks "Start Timer"
         │
         ▼
    Tray Menu Handler
         │
         ▼
    kimaiService.startTimer()
         │
         ▼
    POST /api/timesheets ──────► Kimai Server
         │                            │
         ▼                            ▼
    Store timesheet ID           Create timesheet
         │                            │
         ▼                            │
    Update timer state ◄──────────────┘
         │
         ▼
    Start 1-second interval
         │
         ▼
    Update tray tooltip & menu
```

### Settings Save Flow

```
User clicks "Save" in Settings
         │
         ▼
    React State → IPC Bridge
         │
         ▼
    Main Process Handler
         │
         ▼
    storeService.setSettings()
         │
         ▼
    electron-store writes to disk
         │
         ▼
    Rebuild tray menu with new settings
```

---

## Troubleshooting

### Timer Not Syncing

1. Check Kimai API URL in settings
2. Verify API token is valid
3. Test connection in settings
4. Check network connectivity to Kimai server

### ActivityWatch Not Working

1. Ensure ActivityWatch is running locally
2. Check ActivityWatch URL (default: `http://localhost:5600`)
3. Verify ActivityWatch has window tracking enabled
4. Test connection in settings

### Tray Icon Not Visible

1. Check Windows system tray settings
2. May need to enable "show all icons" in taskbar
3. Restart the application

---

## License

This project is a private application. See LICENSE file for details.
