import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification, shell, net } from 'electron';
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
import { IPC_CHANNELS, AppSettings, KimaiProject, KimaiActivity, WorkSessionState } from './types';
import {
  validateAppSettings,
  validateOptionalPositiveInt,
  validateStrictPositiveInt,
  validateOptionalString,
  validateNonEmptyString,
  validateISODateString,
  validateTimesheetCreate,
  sanitizeJql,
} from './validation';
import { ValidationError, getUserMessage } from './errors';
import { formatDurationCompact } from './utils';
import { TRAY_WINDOW_WIDTH, TRAY_WINDOW_HEIGHT, WORK_SESSION_REMINDER_INTERVAL_MS } from './constants';
import { initAutoUpdater } from './services/updater';

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
let changelogWindow: BrowserWindow | null = null;

// Cache for projects and activities
let cachedProjects: KimaiProject[] = [];
let cachedActivities: KimaiActivity[] = [];

// Timer update interval
let timerUpdateInterval: NodeJS.Timeout | null = null;

// Work session state
let workSessionState: WorkSessionState = {
  status: 'stopped',
  startedAt: null,
  remindersEnabled: true,
};

// Work session reminder interval
let workSessionReminderInterval: NodeJS.Timeout | null = null;

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

  const elapsedTime = formatDurationCompact(getElapsedSeconds());

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
      const elapsed = formatDurationCompact(getElapsedSeconds());
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

    updateTimerState({
      isRunning: false,
      currentTimesheetId: null,
      startTime: null,
    });

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

// Work Session Functions
function startWorkSession(): WorkSessionState {
  workSessionState = {
    ...workSessionState,
    status: 'active',
    startedAt: new Date().toISOString(),
  };
  startWorkSessionReminder();
  return workSessionState;
}

function pauseWorkSession(): WorkSessionState {
  workSessionState = {
    ...workSessionState,
    status: 'paused',
  };
  stopWorkSessionReminder();
  return workSessionState;
}

function stopWorkSession(): WorkSessionState {
  workSessionState = {
    ...workSessionState,
    status: 'stopped',
    startedAt: null,
  };
  stopWorkSessionReminder();
  return workSessionState;
}

function getWorkSessionState(): WorkSessionState {
  return workSessionState;
}

function startWorkSessionReminder(): void {
  stopWorkSessionReminder(); // Clear any existing interval

  // Check immediately
  checkAndRemind();

  // Then check every minute
  workSessionReminderInterval = setInterval(checkAndRemind, WORK_SESSION_REMINDER_INTERVAL_MS);
}

function stopWorkSessionReminder(): void {
  if (workSessionReminderInterval) {
    clearInterval(workSessionReminderInterval);
    workSessionReminderInterval = null;
  }
}

function checkAndRemind(): void {
  // Only remind if work session is active and reminders are enabled
  if (workSessionState.status !== 'active' || !workSessionState.remindersEnabled) {
    return;
  }

  // Check if Kimai timer is running
  const timerState = getTimerState();
  if (!timerState.isRunning) {
    showNotification('Time Tracking Reminder', 'You are not tracking time! Start a timer or pause your work session.');
  }
}

function toggleWorkSessionReminders(): WorkSessionState {
  workSessionState = {
    ...workSessionState,
    remindersEnabled: !workSessionState.remindersEnabled,
  };
  return workSessionState;
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
    resizable: false,
    minimizable: true,
    maximizable: false,
    title: 'Kimai Time Tracker',
    icon: createTrayIcon(),
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  trayWindow.loadURL(`${MAIN_WINDOW_WEBPACK_ENTRY}#tray`);
  trayWindow.setMenu(null);

  trayWindow.on('closed', () => {
    trayWindow = null;
  });
}

function toggleTrayWindow(): void {
  if (!trayWindow || trayWindow.isDestroyed()) {
    createTrayWindow();
  }

  // Guard against createTrayWindow failure
  if (!trayWindow) {
    console.error('Failed to create tray window');
    return;
  }

  if (trayWindow.isVisible()) {
    trayWindow.hide();
  } else {
    trayWindow.center();
    trayWindow.show();
    trayWindow.focus();
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
    icon: createTrayIcon(),
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
    icon: createTrayIcon(),
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

function openChangelogWindow(): void {
  if (changelogWindow && !changelogWindow.isDestroyed()) {
    changelogWindow.focus();
    return;
  }

  changelogWindow = new BrowserWindow({
    width: 450,
    height: 500,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Changelog',
    icon: createTrayIcon(),
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  changelogWindow.loadURL(`${MAIN_WINDOW_WEBPACK_ENTRY}#changelog`);
  changelogWindow.setMenu(null);

  changelogWindow.on('closed', () => {
    changelogWindow = null;
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
      .map((a) => `${a.app}: ${formatDurationCompact(a.duration)}`)
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
  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, async (_, settings: unknown) => {
    try {
      const validatedSettings = validateAppSettings(settings);
      saveSettings(validatedSettings);
      // Invalidate cached data since API credentials may have changed
      cachedProjects = [];
      cachedActivities = [];
      activityWatchAPI.clearCache();
      await updateTrayMenu();
      // Notify tray window to refresh
      if (trayWindow && !trayWindow.isDestroyed()) {
        trayWindow.webContents.send('settings-changed');
      }
      return { success: true };
    } catch (error) {
      console.error('Failed to save settings:', error);
      return { success: false, message: getUserMessage(error) };
    }
  });

  // Kimai
  ipcMain.handle(IPC_CHANNELS.KIMAI_TEST_CONNECTION, () => kimaiAPI.testConnection());
  ipcMain.handle(IPC_CHANNELS.KIMAI_GET_CUSTOMERS, () => kimaiAPI.getCustomers());
  ipcMain.handle(IPC_CHANNELS.KIMAI_GET_PROJECTS, (_, customerId?: unknown) => {
    const validated = validateOptionalPositiveInt(customerId, 'customerId');
    return kimaiAPI.getProjects(validated);
  });
  ipcMain.handle(IPC_CHANNELS.KIMAI_GET_ACTIVITIES, (_, projectId?: unknown) => {
    const validated = validateOptionalPositiveInt(projectId, 'projectId');
    return kimaiAPI.getActivities(validated);
  });
  ipcMain.handle(IPC_CHANNELS.KIMAI_GET_TIMESHEETS, (_, params) => kimaiAPI.getTimesheets(params));
  ipcMain.handle(IPC_CHANNELS.KIMAI_START_TIMER, async (_, projectId: unknown, activityId: unknown, description?: unknown) => {
    const validProjectId = validateStrictPositiveInt(projectId, 'projectId');
    const validActivityId = validateStrictPositiveInt(activityId, 'activityId');
    const validDescription = validateOptionalString(description, 'description') || '';
    updateTimerState({ projectId: validProjectId, activityId: validActivityId, description: validDescription });
    await startTimer();
    return getTimerState();
  });
  ipcMain.handle(IPC_CHANNELS.KIMAI_STOP_TIMER, async () => {
    await stopTimer();
    return getTimerState();
  });
  ipcMain.handle(IPC_CHANNELS.KIMAI_CREATE_TIMESHEET, (_, data: unknown) => {
    const validated = validateTimesheetCreate(data);
    return kimaiAPI.createTimesheet(validated);
  });
  ipcMain.handle(IPC_CHANNELS.KIMAI_DELETE_TIMESHEET, (_, id: unknown) => {
    const validated = validateStrictPositiveInt(id, 'id');
    return kimaiAPI.deleteTimesheet(validated);
  });

  // ActivityWatch
  ipcMain.handle(IPC_CHANNELS.AW_GET_BUCKETS, () => activityWatchAPI.getBuckets());
  ipcMain.handle(IPC_CHANNELS.AW_GET_EVENTS, (_, bucketId: unknown, start?: unknown, end?: unknown, limit?: unknown) => {
    const validBucketId = validateNonEmptyString(bucketId, 'bucketId');
    const validStart = start ? validateOptionalString(start, 'start') : undefined;
    const validEnd = end ? validateOptionalString(end, 'end') : undefined;
    const validLimit = validateOptionalPositiveInt(limit, 'limit');
    return activityWatchAPI.getEvents(validBucketId, validStart, validEnd, validLimit);
  });
  ipcMain.handle(IPC_CHANNELS.AW_GET_ACTIVITY_SUMMARY, (_, minutes?: unknown) => {
    const validated = validateOptionalPositiveInt(minutes, 'minutes');
    return activityWatchAPI.getRecentActivity(validated);
  });

  // Jira
  ipcMain.handle(IPC_CHANNELS.JIRA_TEST_CONNECTION, () => jiraAPI.testConnection());
  ipcMain.handle(IPC_CHANNELS.JIRA_GET_MY_ISSUES, (_, maxResults?: unknown) => {
    const validated = validateOptionalPositiveInt(maxResults, 'maxResults');
    return jiraAPI.getMyIssues(validated);
  });
  ipcMain.handle(IPC_CHANNELS.JIRA_SEARCH_ISSUES, (_, jql: unknown, maxResults?: unknown) => {
    const validJql = sanitizeJql(validateNonEmptyString(jql, 'jql'));
    const validMaxResults = validateOptionalPositiveInt(maxResults, 'maxResults');
    return jiraAPI.searchIssues(validJql, validMaxResults);
  });
  ipcMain.handle(IPC_CHANNELS.JIRA_ADD_WORKLOG, (_, issueKey: unknown, timeSpentSeconds: unknown, started: unknown, comment?: unknown) => {
    const validIssueKey = validateNonEmptyString(issueKey, 'issueKey');
    const validTimeSpent = validateStrictPositiveInt(timeSpentSeconds, 'timeSpentSeconds');
    const validStarted = validateISODateString(started, 'started');
    const validComment = validateOptionalString(comment, 'comment');
    return jiraAPI.addWorklog(validIssueKey, validTimeSpent, new Date(validStarted), validComment);
  });

  // Timer State
  ipcMain.handle(IPC_CHANNELS.GET_TIMER_STATE, () => getTimerState());

  // Work Session
  ipcMain.handle(IPC_CHANNELS.WORK_SESSION_START, () => startWorkSession());
  ipcMain.handle(IPC_CHANNELS.WORK_SESSION_PAUSE, () => pauseWorkSession());
  ipcMain.handle(IPC_CHANNELS.WORK_SESSION_STOP, () => stopWorkSession());
  ipcMain.handle(IPC_CHANNELS.WORK_SESSION_GET_STATE, () => getWorkSessionState());
  ipcMain.handle(IPC_CHANNELS.WORK_SESSION_TOGGLE_REMINDERS, () => toggleWorkSessionReminders());

  // Window
  ipcMain.handle(IPC_CHANNELS.OPEN_SETTINGS, () => {
    if (trayWindow && !trayWindow.isDestroyed()) trayWindow.hide();
    openSettingsWindow();
  });
  ipcMain.handle(IPC_CHANNELS.OPEN_TIME_ENTRY, () => {
    if (trayWindow && !trayWindow.isDestroyed()) trayWindow.hide();
    openTimeEntryWindow();
  });
  ipcMain.handle(IPC_CHANNELS.OPEN_CHANGELOG, () => {
    if (trayWindow && !trayWindow.isDestroyed()) trayWindow.hide();
    openChangelogWindow();
  });
  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, (_, url: string) => {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
      shell.openExternal(url);
    }
  });
  ipcMain.handle(IPC_CHANNELS.CLOSE_WINDOW, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });

  // GitHub
  ipcMain.handle(IPC_CHANNELS.GITHUB_GET_RELEASES, async () => {
    const repo = 'XVE-BV/windows-electron-kimai-timetracker';
    return new Promise((resolve, reject) => {
      const request = net.request({
        method: 'GET',
        url: `https://api.github.com/repos/${repo}/releases`,
      });

      request.setHeader('Accept', 'application/vnd.github.v3+json');
      request.setHeader('User-Agent', 'KimaiTimeTracker');

      let responseData = '';

      request.on('response', (response) => {
        response.on('data', (chunk) => {
          responseData += chunk.toString();
        });

        response.on('end', () => {
          if (response.statusCode === 200) {
            try {
              resolve(JSON.parse(responseData));
            } catch {
              reject(new Error('Failed to parse response'));
            }
          } else {
            reject(new Error(`GitHub API error: ${response.statusCode}`));
          }
        });

        response.on('error', (error) => {
          reject(error);
        });
      });

      request.on('error', (error) => {
        reject(error);
      });

      request.end();
    });
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

  // Initialize auto-updater (checks for updates automatically)
  initAutoUpdater();
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
