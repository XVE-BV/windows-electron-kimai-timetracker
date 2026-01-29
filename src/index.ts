import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification, screen } from 'electron';
import * as path from 'path';
import { kimaiAPI } from './services/kimai';
import { activityWatchAPI } from './services/activitywatch';
import { jiraAPI } from './services/jira';
import {
  getSettings,
  saveSettings,
  getTimerState,
  updateTimerState,
} from './services/store';
import { IPC_CHANNELS, AppSettings, KimaiProject, KimaiActivity } from './types';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let trayWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let timeEntryWindow: BrowserWindow | null = null;

// Cache for projects and activities
let cachedProjects: KimaiProject[] = [];
let cachedActivities: KimaiActivity[] = [];

// Timer update interval
let timerUpdateInterval: NodeJS.Timeout | null = null;

// Tray window dimensions
const TRAY_WINDOW_WIDTH = 380;
const TRAY_WINDOW_HEIGHT = 600;

function createTrayIcon(): Electron.NativeImage {
  const fs = require('fs');

  // Try multiple paths for development and production
  const possiblePaths = [
    path.join(__dirname, 'assets', 'favicon.ico'),        // Webpack dev build
    path.join(__dirname, '..', 'assets', 'favicon.ico'),  // Alternative dev path
    path.join(process.resourcesPath, 'assets', 'favicon.ico'),  // Production (extraResource)
    path.join(app.getAppPath(), 'src', 'assets', 'favicon.ico'),  // App path
  ];

  for (const iconPath of possiblePaths) {
    try {
      if (fs.existsSync(iconPath)) {
        return nativeImage.createFromPath(iconPath);
      }
    } catch (error) {
      // Try next path
    }
  }

  console.warn('Could not load tray icon, using fallback');
  // Fallback to a simple colored square
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buffer[i * 4] = 66;     // R
    buffer[i * 4 + 1] = 133; // G
    buffer[i * 4 + 2] = 244; // B
    buffer[i * 4 + 3] = 255; // A
  }
  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function getElapsedSeconds(): number {
  const timerState = getTimerState();
  if (!timerState.isRunning || !timerState.startTime) {
    return 0;
  }
  const start = new Date(timerState.startTime);
  const now = new Date();
  return Math.floor((now.getTime() - start.getTime()) / 1000);
}

async function buildContextMenu(): Promise<Menu> {
  const timerState = getTimerState();
  const settings = getSettings();

  // Fetch projects and activities if we have a valid connection
  if (settings.kimai.apiUrl && settings.kimai.apiToken) {
    try {
      cachedProjects = await kimaiAPI.getProjects();
      if (timerState.projectId) {
        cachedActivities = await kimaiAPI.getActivities(timerState.projectId);
      }
    } catch (error) {
      console.error('Failed to fetch Kimai data:', error);
    }
  }

  const projectSubmenu: Electron.MenuItemConstructorOptions[] = cachedProjects.map((project) => ({
    label: project.name,
    type: 'radio' as const,
    checked: timerState.projectId === project.id,
    click: async () => {
      updateTimerState({ projectId: project.id, activityId: null });
      cachedActivities = await kimaiAPI.getActivities(project.id);
      updateTrayMenu();
    },
  }));

  const activitySubmenu: Electron.MenuItemConstructorOptions[] = cachedActivities.map((activity) => ({
    label: activity.name,
    type: 'radio' as const,
    checked: timerState.activityId === activity.id,
    click: () => {
      updateTimerState({ activityId: activity.id });
      updateTrayMenu();
    },
  }));

  const elapsedTime = formatDuration(getElapsedSeconds());

  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    // Timer Status
    {
      label: timerState.isRunning ? `Running: ${elapsedTime}` : 'Timer Stopped',
      enabled: false,
    },
    { type: 'separator' },

    // Start/Stop Timer
    timerState.isRunning
      ? {
          label: 'Stop Timer',
          click: stopTimer,
        }
      : {
          label: 'Start Timer',
          enabled: !!(timerState.projectId && timerState.activityId),
          click: startTimer,
        },
    { type: 'separator' },

    // Project Selection
    {
      label: 'Select Project',
      submenu: projectSubmenu.length > 0 ? projectSubmenu : [{ label: 'No projects available', enabled: false }],
    },

    // Activity Selection
    {
      label: 'Select Activity',
      enabled: !!timerState.projectId,
      submenu: activitySubmenu.length > 0 ? activitySubmenu : [{ label: 'No activities available', enabled: false }],
    },
    { type: 'separator' },

    // Manual Time Entry
    {
      label: 'Add Manual Entry...',
      click: openTimeEntryWindow,
    },

    // ActivityWatch
    {
      label: 'View Activity Summary...',
      click: openActivitySummary,
    },
    { type: 'separator' },

    // Settings
    {
      label: 'Settings...',
      click: openSettingsWindow,
    },
    { type: 'separator' },

    // Quit
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ];

  return Menu.buildFromTemplate(menuTemplate);
}

async function updateTrayMenu(): Promise<void> {
  if (tray) {
    const menu = await buildContextMenu();
    tray.setContextMenu(menu);

    // Update tooltip with current status
    const timerState = getTimerState();
    if (timerState.isRunning) {
      const elapsed = formatDuration(getElapsedSeconds());
      tray.setToolTip(`Kimai Time Tracker - Running: ${elapsed}`);
    } else {
      tray.setToolTip('Kimai Time Tracker - Idle');
    }
  }
}

async function startTimer(): Promise<void> {
  const timerState = getTimerState();
  if (!timerState.projectId || !timerState.activityId) {
    showNotification('Cannot Start Timer', 'Please select a project and activity first.');
    return;
  }

  try {
    const timesheet = await kimaiAPI.startTimer(
      timerState.projectId,
      timerState.activityId,
      timerState.description
    );

    updateTimerState({
      isRunning: true,
      currentTimesheetId: timesheet.id,
      startTime: timesheet.begin,
    });

    showNotification('Timer Started', 'Time tracking has begun.');
    startTimerUpdateLoop();
    updateTrayMenu();
  } catch (error) {
    console.error('Failed to start timer:', error);
    showNotification('Error', 'Failed to start timer. Please check your settings.');
  }
}

async function stopTimer(): Promise<void> {
  const timerState = getTimerState();
  if (!timerState.currentTimesheetId) {
    return;
  }

  try {
    await kimaiAPI.stopTimer(timerState.currentTimesheetId);
    const elapsed = formatDuration(getElapsedSeconds());

    updateTimerState({
      isRunning: false,
      currentTimesheetId: null,
      startTime: null,
    });

    showNotification('Timer Stopped', `Recorded: ${elapsed}`);
    stopTimerUpdateLoop();
    updateTrayMenu();
  } catch (error) {
    console.error('Failed to stop timer:', error);
    showNotification('Error', 'Failed to stop timer. Please check your connection.');
  }
}

function startTimerUpdateLoop(): void {
  if (timerUpdateInterval) {
    clearInterval(timerUpdateInterval);
  }

  timerUpdateInterval = setInterval(() => {
    updateTrayMenu();
  }, 1000);
}

function stopTimerUpdateLoop(): void {
  if (timerUpdateInterval) {
    clearInterval(timerUpdateInterval);
    timerUpdateInterval = null;
  }
}

function showNotification(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    height: 600,
    width: 800,
    show: false, // Don't show by default (tray app)
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  mainWindow.on('close', (event) => {
    event.preventDefault();
    mainWindow?.hide();
  });
}

function createTrayWindow(): void {
  trayWindow = new BrowserWindow({
    width: TRAY_WINDOW_WIDTH,
    height: TRAY_WINDOW_HEIGHT,
    show: false,
    frame: false,
    fullscreenable: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  trayWindow.loadURL(`${MAIN_WINDOW_WEBPACK_ENTRY}#tray`);
  trayWindow.setMenu(null);

  // Hide when focus is lost
  trayWindow.on('blur', () => {
    if (trayWindow && !trayWindow.webContents.isDevToolsOpened()) {
      trayWindow.hide();
    }
  });
}

function calculateTrayWindowPosition(): { x: number; y: number } {
  if (!tray) return { x: 0, y: 0 };

  const trayBounds = tray.getBounds();
  const screenBounds = screen.getPrimaryDisplay().workArea;

  // Determine tray position (which corner of screen)
  const isTop = trayBounds.y < screenBounds.height / 2;
  const isLeft = trayBounds.x < screenBounds.width / 2;

  let x: number;
  let y: number;

  if (isLeft) {
    x = Math.floor(trayBounds.x + trayBounds.width / 2);
  } else {
    x = Math.floor(trayBounds.x - TRAY_WINDOW_WIDTH + trayBounds.width / 2);
  }

  if (isTop) {
    y = Math.floor(trayBounds.y + trayBounds.height);
  } else {
    y = Math.floor(trayBounds.y - TRAY_WINDOW_HEIGHT);
  }

  // Ensure window stays within screen bounds
  x = Math.max(screenBounds.x, Math.min(x, screenBounds.x + screenBounds.width - TRAY_WINDOW_WIDTH));
  y = Math.max(screenBounds.y, Math.min(y, screenBounds.y + screenBounds.height - TRAY_WINDOW_HEIGHT));

  return { x, y };
}

function toggleTrayWindow(): void {
  if (!trayWindow) {
    createTrayWindow();
  }

  if (trayWindow!.isVisible()) {
    trayWindow!.hide();
  } else {
    const position = calculateTrayWindowPosition();
    trayWindow!.setBounds({
      x: position.x,
      y: position.y,
      width: TRAY_WINDOW_WIDTH,
      height: TRAY_WINDOW_HEIGHT,
    });
    trayWindow!.show();
    trayWindow!.focus();
  }
}

function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 500,
    height: 600,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Settings',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadURL(`${MAIN_WINDOW_WEBPACK_ENTRY}#settings`);
  settingsWindow.setMenu(null);

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function openTimeEntryWindow(): void {
  if (timeEntryWindow && !timeEntryWindow.isDestroyed()) {
    timeEntryWindow.focus();
    return;
  }

  timeEntryWindow = new BrowserWindow({
    width: 500,
    height: 500,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Add Time Entry',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  timeEntryWindow.loadURL(`${MAIN_WINDOW_WEBPACK_ENTRY}#time-entry`);
  timeEntryWindow.setMenu(null);

  timeEntryWindow.on('closed', () => {
    timeEntryWindow = null;
  });
}

async function openActivitySummary(): Promise<void> {
  const settings = getSettings();
  if (!settings.activityWatch.enabled) {
    showNotification('ActivityWatch', 'ActivityWatch integration is disabled. Enable it in settings.');
    return;
  }

  try {
    const summary = await activityWatchAPI.getRecentActivity(60);
    if (summary.length === 0) {
      showNotification('Activity Summary', 'No activity recorded in the last hour.');
      return;
    }

    // Show top 5 activities
    const topActivities = summary.slice(0, 5);
    const message = topActivities
      .map((a) => `${a.app}: ${formatDuration(a.duration)}`)
      .join('\n');

    showNotification('Activity Summary (Last Hour)', message);
  } catch (error) {
    console.error('Failed to get activity summary:', error);
    showNotification('Error', 'Failed to get activity from ActivityWatch.');
  }
}

function setupIPC(): void {
  // Settings
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => getSettings());
  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, async (_, settings: AppSettings) => {
    saveSettings(settings);
    await updateTrayMenu();
    return { success: true };
  });

  // Kimai
  ipcMain.handle(IPC_CHANNELS.KIMAI_TEST_CONNECTION, () => kimaiAPI.testConnection());
  ipcMain.handle(IPC_CHANNELS.KIMAI_GET_CUSTOMERS, () => kimaiAPI.getCustomers());
  ipcMain.handle(IPC_CHANNELS.KIMAI_GET_PROJECTS, (_, customerId?: number) => kimaiAPI.getProjects(customerId));
  ipcMain.handle(IPC_CHANNELS.KIMAI_GET_ACTIVITIES, (_, projectId?: number) => kimaiAPI.getActivities(projectId));
  ipcMain.handle(IPC_CHANNELS.KIMAI_GET_TIMESHEETS, (_, params) => kimaiAPI.getTimesheets(params));
  ipcMain.handle(IPC_CHANNELS.KIMAI_START_TIMER, async (_, projectId: number, activityId: number, description?: string) => {
    updateTimerState({ projectId, activityId, description: description || '' });
    await startTimer();
    return getTimerState();
  });
  ipcMain.handle(IPC_CHANNELS.KIMAI_STOP_TIMER, async () => {
    await stopTimer();
    return getTimerState();
  });
  ipcMain.handle(IPC_CHANNELS.KIMAI_CREATE_TIMESHEET, (_, data) => kimaiAPI.createTimesheet(data));
  ipcMain.handle(IPC_CHANNELS.KIMAI_DELETE_TIMESHEET, (_, id: number) => kimaiAPI.deleteTimesheet(id));

  // ActivityWatch
  ipcMain.handle(IPC_CHANNELS.AW_GET_BUCKETS, () => activityWatchAPI.getBuckets());
  ipcMain.handle(IPC_CHANNELS.AW_GET_EVENTS, (_, bucketId: string, start?: string, end?: string, limit?: number) =>
    activityWatchAPI.getEvents(bucketId, start, end, limit)
  );
  ipcMain.handle(IPC_CHANNELS.AW_GET_ACTIVITY_SUMMARY, (_, minutes?: number) =>
    activityWatchAPI.getRecentActivity(minutes)
  );

  // Jira
  ipcMain.handle(IPC_CHANNELS.JIRA_TEST_CONNECTION, () => jiraAPI.testConnection());
  ipcMain.handle(IPC_CHANNELS.JIRA_GET_MY_ISSUES, (_, maxResults?: number) => jiraAPI.getMyIssues(maxResults));
  ipcMain.handle(IPC_CHANNELS.JIRA_SEARCH_ISSUES, (_, jql: string, maxResults?: number) =>
    jiraAPI.searchIssues(jql, maxResults)
  );
  ipcMain.handle(IPC_CHANNELS.JIRA_ADD_WORKLOG, (_, issueKey: string, timeSpentSeconds: number, started: string, comment?: string) =>
    jiraAPI.addWorklog(issueKey, timeSpentSeconds, new Date(started), comment)
  );

  // Timer State
  ipcMain.handle(IPC_CHANNELS.GET_TIMER_STATE, () => getTimerState());

  // Window
  ipcMain.handle(IPC_CHANNELS.OPEN_SETTINGS, () => {
    if (trayWindow) trayWindow.hide();
    openSettingsWindow();
  });
  ipcMain.handle(IPC_CHANNELS.OPEN_TIME_ENTRY, () => {
    if (trayWindow) trayWindow.hide();
    openTimeEntryWindow();
  });
  ipcMain.handle(IPC_CHANNELS.CLOSE_WINDOW, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });
}

async function initializeApp(): Promise<void> {
  // Create tray
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Kimai Time Tracker');

  // Create tray popup window
  createTrayWindow();

  // Handle tray clicks - both left and right show custom popup
  tray.on('click', () => {
    toggleTrayWindow();
  });

  tray.on('right-click', () => {
    toggleTrayWindow();
  });

  // Check if timer was running (recover state)
  const timerState = getTimerState();
  if (timerState.isRunning && timerState.currentTimesheetId) {
    // Verify the timer is still running on the server
    try {
      const active = await kimaiAPI.getActiveTimesheets();
      const isStillRunning = active.some((t) => t.id === timerState.currentTimesheetId);
      if (isStillRunning) {
        startTimerUpdateLoop();
      } else {
        // Timer was stopped elsewhere, update local state
        updateTimerState({
          isRunning: false,
          currentTimesheetId: null,
          startTime: null,
        });
      }
    } catch {
      // Unable to verify, assume still running
      startTimerUpdateLoop();
    }
  }

  // Setup IPC handlers
  setupIPC();

  // Create hidden main window (for renderer process)
  createMainWindow();
}

// This method will be called when Electron has finished initialization
app.whenReady().then(initializeApp);

// Prevent app from quitting when all windows are closed (tray app behavior)
app.on('window-all-closed', () => {
  // Don't quit - this is a tray app
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

// Clean up on quit
app.on('before-quit', () => {
  stopTimerUpdateLoop();
  if (mainWindow) {
    mainWindow.removeAllListeners('close');
    mainWindow.close();
  }
});
