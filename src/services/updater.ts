import { autoUpdater, BrowserWindow, app } from 'electron';
import log from 'electron-log';

export interface UpdateStatus {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'dev-mode';
  version?: string;
  error?: string;
}

let currentStatus: UpdateStatus = { status: 'idle' };
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

// Check if running in development mode
const isDev = !app.isPackaged;

function notifyRenderer(): void {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('update-status-changed', currentStatus);
  });
}

export function getUpdateStatus(): UpdateStatus {
  return currentStatus;
}

export function checkForUpdates(): void {
  if (isDev) {
    log.info('Skipping update check in development mode');
    currentStatus = { status: 'dev-mode' };
    return;
  }

  if (currentStatus.status === 'checking' || currentStatus.status === 'downloading') {
    return; // Already in progress
  }

  try {
    currentStatus = { status: 'checking' };
    notifyRenderer();
    autoUpdater.checkForUpdates();
  } catch (error) {
    log.error('Failed to check for updates:', error);
    currentStatus = { status: 'error', error: 'Failed to check for updates' };
    notifyRenderer();
  }
}

export function quitAndInstall(): void {
  if (currentStatus.status === 'ready') {
    autoUpdater.quitAndInstall();
  }
}

export function initAutoUpdater(): void {
  if (isDev) {
    log.info('Auto-updater disabled in development mode');
    currentStatus = { status: 'dev-mode' };
    return;
  }

  const repo = 'XVE-BV/windows-electron-kimai-timetracker';
  const feedURL = `https://update.electronjs.org/${repo}/${process.platform}-${process.arch}/${app.getVersion()}`;

  try {
    autoUpdater.setFeedURL({ url: feedURL });
  } catch (error) {
    log.error('Failed to set feed URL:', error);
    return;
  }

  autoUpdater.on('error', (error) => {
    log.error('Auto-updater error:', error);
    currentStatus = { status: 'error', error: error.message };
    notifyRenderer();
  });

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
    currentStatus = { status: 'checking' };
    notifyRenderer();
  });

  autoUpdater.on('update-available', () => {
    log.info('Update available, downloading...');
    currentStatus = { status: 'downloading' };
    notifyRenderer();
  });

  autoUpdater.on('update-not-available', () => {
    log.info('No updates available');
    currentStatus = { status: 'idle' };
    notifyRenderer();
  });

  autoUpdater.on('update-downloaded', (_event, releaseNotes, releaseName) => {
    log.info('Update downloaded:', releaseName);
    currentStatus = { status: 'ready', version: releaseName || 'new version' };
    notifyRenderer();
  });

  // Check for updates on startup (after a short delay)
  setTimeout(() => {
    checkForUpdates();
  }, 10000);

  // Check periodically
  setInterval(() => {
    checkForUpdates();
  }, UPDATE_CHECK_INTERVAL);
}
