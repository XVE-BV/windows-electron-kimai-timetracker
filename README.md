# Kimai Time Tracker

A cross-platform desktop tray application for [Kimai](https://www.kimai.org/) time tracking with ActivityWatch and Jira integration.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **System Tray App** - Quick access from your taskbar/menu bar
- **Kimai Integration** - Start/stop timers, log time entries
- **Customer → Project → Activity** - Hierarchical selection with search
- **Jira Integration** - Link tickets and auto-log worklogs
- **ActivityWatch Integration** - See what apps you've been using
- **Work Session Tracking** - Get reminders when not tracking time
- **15-Minute Rounding** - Automatic alignment to Kimai's time intervals
- **Cross-Platform** - Works on Windows, macOS, and Linux

## Screenshots

*Coming soon*

## Installation

Download the latest release for your platform:

| Platform | Download |
|----------|----------|
| Windows | `.exe` installer |
| macOS | `.dmg` or `.zip` |
| Linux (Debian/Ubuntu) | `.deb` package |
| Linux (Fedora/RHEL) | `.rpm` package |

[**Download Latest Release →**](https://github.com/XVE-BV/windows-electron-kimai-timetracker/releases/latest)

### Linux Note

On Ubuntu/GNOME, you may need the [AppIndicator extension](https://extensions.gnome.org/extension/615/appindicator-support/) to see tray icons.

## Configuration

1. Open the app from the system tray
2. Click **Settings**
3. Configure your connections:

### Kimai Setup

1. Log in to your Kimai instance
2. Go to **Settings** (gear icon) → **API**
3. Click **Create** to generate a new API token
4. Copy the token (you won't see it again)

**In the app:**
- **API URL**: Your Kimai URL with `/api` (e.g., `https://kimai.example.com`)
- **API Token**: Paste your token

### ActivityWatch Setup (Optional)

[ActivityWatch](https://activitywatch.net/) tracks your computer activity locally.

1. Download and install ActivityWatch from https://activitywatch.net/
2. Start ActivityWatch (runs in system tray)

**In the app:**
- **API URL**: `http://localhost:5600` (default)
- Enable the toggle to see activity summaries

### Jira Setup (Optional)

**Step 1: Create an API Token**

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **Create API token**
3. Give it a label (e.g., "Kimai Time Tracker")
4. Click **Create** and copy the token

**Step 2: Find your Jira URL**

Your Jira URL is typically `https://yourcompany.atlassian.net`

**In the app:**
- **API URL**: Your Atlassian URL (e.g., `https://company.atlassian.net`)
- **Email**: Your Atlassian account email (the one you log in with)
- **API Token**: Paste the token you created

**Note:** The API token uses Basic Authentication. No special scopes or permissions are needed beyond your normal Jira access.

## Development

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
git clone https://github.com/XVE-BV/windows-electron-kimai-timetracker.git
cd windows-electron-kimai-timetracker
npm install
```

### Run

```bash
npm start
```

### Build

```bash
npm run make
```

Outputs are in `out/make/`.

## Tech Stack

- **Electron** - Desktop framework
- **React 19** - UI components
- **TypeScript** - Type safety
- **Tailwind CSS v4** - Styling
- **Radix UI** - Accessible primitives
- **Electron Forge** - Build tooling

## License

MIT
