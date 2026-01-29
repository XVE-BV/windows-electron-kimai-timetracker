import { updateElectronApp, UpdateSourceType } from 'update-electron-app';
import log from 'electron-log';

export function initAutoUpdater(): void {
  updateElectronApp({
    updateSource: {
      type: UpdateSourceType.ElectronPublicUpdateService,
      repo: 'XVE-BV/windows-electron-kimai-timetracker',
    },
    updateInterval: '1 hour',
    logger: log,
    notifyUser: true,
  });
}
