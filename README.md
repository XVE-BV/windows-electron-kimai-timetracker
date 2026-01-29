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

### Kimai
- **API URL**: Your Kimai instance URL (e.g., `https://kimai.example.com`)
- **API Token**: Generate from Kimai → Settings → API

### ActivityWatch (Optional)
- **API URL**: Default `http://localhost:5600`
- Enable to see activity summaries

### Jira (Optional)
- **API URL**: Your Atlassian URL (e.g., `https://company.atlassian.net`)
- **Email**: Your Atlassian account email
- **API Token**: Generate from [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)

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
