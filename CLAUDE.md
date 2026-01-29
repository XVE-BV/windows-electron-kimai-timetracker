# Kimai Time Tracker - Electron App

Windows tray application for Kimai time tracking with ActivityWatch integration.

## Project Overview

This is an Electron app that:
- Runs in the Windows system tray
- Integrates with Kimai time tracking API for managing timesheets
- Integrates with ActivityWatch for automatic activity monitoring
- Uses React + Tailwind CSS for the UI
- Uses TypeScript throughout

## Tech Stack

- **Electron**: Desktop app framework
- **React 19**: UI components
- **TypeScript**: Type safety
- **Tailwind CSS v4**: Styling
- **Radix UI**: Accessible UI primitives (shadcn/ui components)
- **Electron Forge**: Build tooling

## API Integrations

### Kimai Time Tracking
- Base URL: `https://clockit.xve-web.eu/api`
- Authentication: Bearer token
- See `.claude/skills/timetracking-apis.md` for full API reference

### ActivityWatch
- Base URL: `http://localhost:5600/api`
- No authentication required (local only)
- See `.claude/skills/timetracking-apis.md` for full API reference

## Project Structure

```
src/
├── index.ts           # Main process (Electron)
├── preload.ts         # Preload script (IPC bridge)
├── renderer.tsx       # React entry point
├── types.ts           # TypeScript types & IPC channels
├── index.css          # Tailwind CSS styles
├── components/
│   ├── App.tsx        # Main app with hash-based routing
│   ├── MainView.tsx   # Welcome/main screen
│   ├── SettingsView.tsx   # Settings form
│   ├── TimeEntryView.tsx  # Manual time entry
│   └── ui/            # Shadcn UI components
└── services/          # Business logic
```

## Window Architecture

The app uses hash-based routing with a single React app:
- Main window: `MAIN_WINDOW_WEBPACK_ENTRY` (hidden, tray only)
- Settings: `MAIN_WINDOW_WEBPACK_ENTRY#settings`
- Time Entry: `MAIN_WINDOW_WEBPACK_ENTRY#time-entry`

## Development Commands

```bash
npm start      # Start development server
npm run package   # Package for distribution
npm run make      # Create installers
```

## Skills Reference

For API documentation, see:
- `.claude/skills/timetracking-apis.md` - Complete Kimai and ActivityWatch API reference
