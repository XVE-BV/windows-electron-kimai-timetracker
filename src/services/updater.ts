import { autoUpdater, UpdateInfo as ElectronUpdateInfo, ProgressInfo } from 'electron-updater';
import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { UpdateStatus } from '../types';

type UpdateStatusCallback = (status: UpdateStatus) => void;

class Updater {
  private statusCallback: UpdateStatusCallback | null = null;
  private currentStatus: UpdateStatus = { status: 'idle' };

  constructor() {
    // Configure logging
    autoUpdater.logger = log;

    // Don't auto-download, let user choose
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // Configure GitHub as the update provider
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'XVE-BV',
      repo: 'windows-electron-kimai-timetracker',
    });

    this.setupEventHandlers();
  }

  private convertUpdateInfo(info: ElectronUpdateInfo) {
    return {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseName: info.releaseName,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
    };
  }

  private setupEventHandlers(): void {
    autoUpdater.on('checking-for-update', () => {
      this.updateStatus({ status: 'checking' });
    });

    autoUpdater.on('update-available', (info: ElectronUpdateInfo) => {
      this.updateStatus({ status: 'available', info: this.convertUpdateInfo(info) });
    });

    autoUpdater.on('update-not-available', (info: ElectronUpdateInfo) => {
      this.updateStatus({ status: 'not-available', info: this.convertUpdateInfo(info) });
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.updateStatus({
        status: 'downloading',
        progress,
        info: this.currentStatus.info
      });
    });

    autoUpdater.on('update-downloaded', (info: ElectronUpdateInfo) => {
      this.updateStatus({ status: 'downloaded', info: this.convertUpdateInfo(info) });
    });

    autoUpdater.on('error', (error: Error) => {
      this.updateStatus({ status: 'error', error: error.message });
    });
  }

  private updateStatus(status: UpdateStatus): void {
    this.currentStatus = status;
    if (this.statusCallback) {
      this.statusCallback(status);
    }
  }

  setStatusCallback(callback: UpdateStatusCallback | null): void {
    this.statusCallback = callback;
  }

  getStatus(): UpdateStatus {
    return this.currentStatus;
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    try {
      await autoUpdater.checkForUpdates();
      return this.currentStatus;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.updateStatus({ status: 'error', error: errorMessage });
      return this.currentStatus;
    }
  }

  async downloadUpdate(): Promise<void> {
    if (this.currentStatus.status === 'available') {
      await autoUpdater.downloadUpdate();
    }
  }

  quitAndInstall(): void {
    if (this.currentStatus.status === 'downloaded') {
      autoUpdater.quitAndInstall();
    }
  }

  // Send status updates to all renderer windows
  broadcastStatus(windows: BrowserWindow[]): void {
    windows.forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('update-status', this.currentStatus);
      }
    });
  }
}

export const updater = new Updater();
export default updater;
