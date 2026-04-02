import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification, shell, net, screen, nativeTheme, safeStorage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { kimaiAPI, KimaiAPI } from './services/kimai';
import { activityWatchAPI } from './services/activitywatch';
import { jiraAPI } from './services/jira';
import {
  getSettings,
  saveSettings,
  getActiveTimers,
  addActiveTimer,
  removeActiveTimer,
  updateActiveTimer,
  setActiveTimers,
  getTimerSelections,
  updateTimerSelections,
  resetTimerSelections,
  didDecryptionFail,
  clearDecryptionFailedFlag,
  isUsingPlaintextFallback,
} from './services/store';
import { IPC_CHANNELS, VIEW_HASHES, KimaiProject, KimaiActivity, ActiveTimer, TimerSelections, ThemeMode, JiraIssue } from './types';
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
import { getUserMessage } from './errors';
import { formatDurationCompact } from './utils';
import { REMINDER_INTERVAL_MS } from './constants';
import { initAutoUpdater, getUpdateStatus, checkForUpdates, quitAndInstall } from './services/updater';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (process.platform === 'win32' && require('electron-squirrel-startup')) {
  app.quit();
}

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let trayWindow: BrowserWindow | null = null;

// Debug log buffer
interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}
const logBuffer: LogEntry[] = [];
const MAX_LOG_ENTRIES = 500;

function addLog(level: 'info' | 'warn' | 'error', message: string): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
    level,
    message,
  };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer.shift();
  }
}

// Cache for projects and activities
let cachedProjects: KimaiProject[] = [];
let cachedActivities: KimaiActivity[] = [];

// Timer update interval
let timerUpdateInterval: NodeJS.Timeout | null = null;

// Reminders state
let remindersEnabled = true;

// Reminder interval
let reminderInterval: NodeJS.Timeout | null = null;

function createTrayIcon(): Electron.NativeImage {
  // Use platform-appropriate icon format
  const isMac = process.platform === 'darwin';
  const iconExt = isMac ? 'png' : 'ico';
  const iconFile = `favicon.${iconExt}`;

  // Try multiple paths for development and production
  const possiblePaths = [
    path.join(__dirname, 'assets', iconFile),        // Webpack dev build
    path.join(__dirname, '..', 'assets', iconFile),  // Alternative dev path
    path.join(process.resourcesPath, 'assets', iconFile),  // Production (extraResource)
    path.join(app.getAppPath(), 'src', 'assets', iconFile),  // App path
    // Fallback to ico on macOS if png not found
    ...(isMac ? [
      path.join(__dirname, 'assets', 'favicon.ico'),
      path.join(__dirname, '..', 'assets', 'favicon.ico'),
      path.join(process.resourcesPath, 'assets', 'favicon.ico'),
      path.join(app.getAppPath(), 'src', 'assets', 'favicon.ico'),
    ] : []),
  ];

  for (const iconPath of possiblePaths) {
    try {
      if (fs.existsSync(iconPath)) {
        const icon = nativeImage.createFromPath(iconPath);
        // For macOS tray, resize to 16x16 (template size)
        if (isMac && !icon.isEmpty()) {
          return icon.resize({ width: 16, height: 16 });
        }
        return icon;
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

function getElapsedSeconds(timer: ActiveTimer): number {
  const start = new Date(timer.startTime);
  const now = new Date();
  return Math.floor((now.getTime() - start.getTime()) / 1000);
}

async function buildContextMenu(): Promise<Menu> {
  const activeTimers = getActiveTimers();
  const selections = getTimerSelections();
  const isRunning = activeTimers.length > 0;
  const settings = getSettings();

  // Fetch projects and activities if we have a valid connection
  if (settings.kimai.apiUrl && settings.kimai.apiToken) {
    try {
      cachedProjects = await kimaiAPI.getProjects();
      if (selections.projectId) {
        cachedActivities = await kimaiAPI.getActivities(selections.projectId);
      }
    } catch (error) {
      console.error('Failed to fetch Kimai data:', error);
    }
  }

  const projectSubmenu: Electron.MenuItemConstructorOptions[] = cachedProjects.map((project) => ({
    label: project.name,
    type: 'radio' as const,
    checked: selections.projectId === project.id,
    click: async () => {
      updateTimerSelections({ projectId: project.id, activityId: null });
      cachedActivities = await kimaiAPI.getActivities(project.id);
      updateTrayMenu();
    },
  }));

  const activitySubmenu: Electron.MenuItemConstructorOptions[] = cachedActivities.map((activity) => ({
    label: activity.name,
    type: 'radio' as const,
    checked: selections.activityId === activity.id,
    click: () => {
      updateTimerSelections({ activityId: activity.id });
      updateTrayMenu();
    },
  }));

  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    // Timer Status
    {
      label: isRunning ? `Running: ${activeTimers.length} timer${activeTimers.length !== 1 ? 's' : ''}` : 'Timer Stopped',
      enabled: false,
    },
    { type: 'separator' },

    // Start/Stop Timer
    isRunning
      ? {
          label: 'Stop All Timers',
          click: stopAllTimers,
        }
      : {
          label: 'Start Timer',
          enabled: !!(selections.projectId && selections.activityId),
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
      enabled: !!selections.projectId,
      submenu: activitySubmenu.length > 0 ? activitySubmenu : [{ label: 'No activities available', enabled: false }],
    },
    { type: 'separator' },

    // Manual Time Entry
    {
      label: 'Add Manual Entry...',
      click: () => navigateTrayWindow(VIEW_HASHES.TIME_ENTRY),
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
      click: () => navigateTrayWindow(VIEW_HASHES.SETTINGS),
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

    const activeTimers = getActiveTimers();
    if (activeTimers.length > 0) {
      const count = activeTimers.length;
      const firstElapsed = formatDurationCompact(getElapsedSeconds(activeTimers[0]));
      tray.setToolTip(
        count === 1
          ? `Kimai Time Tracker - Running: ${firstElapsed}`
          : `Kimai Time Tracker - ${count} timers running`
      );
    } else {
      tray.setToolTip('Kimai Time Tracker - Idle');
    }
  }
}

async function startTimer(): Promise<void> {
  const selections = getTimerSelections();
  if (!selections.projectId || !selections.activityId) {
    showNotification('Cannot Start Timer', 'Please select a project and activity first.');
    return;
  }

  const actualStartTime = new Date().toISOString();

  try {
    const timesheet = await kimaiAPI.startTimer(
      selections.projectId,
      selections.activityId,
      selections.description
    );

    const activeTimer: ActiveTimer = {
      timesheetId: timesheet.id,
      projectId: selections.projectId,
      activityId: selections.activityId,
      customerId: selections.customerId,
      description: selections.description,
      startTime: timesheet.begin,
      actualStartTime: actualStartTime,
      jiraIssue: selections.jiraIssue,
    };

    addActiveTimer(activeTimer);
    resetTimerSelections();
    startTimerUpdateLoop();
    updateTrayMenu();
  } catch (error) {
    console.error('Failed to start timer:', error);
    showNotification('Error', 'Failed to start timer. Please check your settings.');
  }
}

async function stopTimer(timesheetId: number): Promise<void> {
  try {
    await kimaiAPI.stopTimer(timesheetId);
    removeActiveTimer(timesheetId);

    const remaining = getActiveTimers();
    if (remaining.length === 0) {
      stopTimerUpdateLoop();
    }
    updateTrayMenu();
  } catch (error) {
    console.error('Failed to stop timer:', error);
    showNotification('Error', 'Failed to stop timer. Please check your connection.');
  }
}

async function stopAllTimers(): Promise<void> {
  const timers = getActiveTimers();
  for (const timer of timers) {
    try {
      await kimaiAPI.stopTimer(timer.timesheetId);
      removeActiveTimer(timer.timesheetId);
    } catch (error) {
      console.error(`Failed to stop timer ${timer.timesheetId}:`, error);
    }
  }
  stopTimerUpdateLoop();
  updateTrayMenu();
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

// Reminder Functions
function startReminderInterval(): void {
  stopReminderInterval(); // Clear any existing interval

  // Check every interval
  reminderInterval = setInterval(checkAndRemind, REMINDER_INTERVAL_MS);
}

function stopReminderInterval(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}

function checkAndRemind(): void {
  // Only remind if reminders are enabled
  if (!remindersEnabled) {
    return;
  }

  // Check if Kimai timer is running
  const activeTimers = getActiveTimers();
  if (activeTimers.length === 0) {
    showNotification('Time Tracking', 'Don\'t forget to start your timer');
  }
}

function getRemindersEnabled(): boolean {
  return remindersEnabled;
}

function toggleReminders(): boolean {
  remindersEnabled = !remindersEnabled;
  return remindersEnabled;
}

function showNotification(title: string, body: string): void {
  console.log('[notification] isSupported:', Notification.isSupported());
  console.log('[notification] Showing:', title, body);
  if (Notification.isSupported()) {
    const notification = new Notification({ title, body });
    notification.on('click', () => {
      navigateTrayWindow(VIEW_HASHES.TRAY);
    });
    notification.show();
    notification.on('show', () => console.log('[notification] Shown successfully'));
    notification.on('failed', (e) => console.error('[notification] Failed:', e));
  } else {
    console.warn('[notification] Notifications not supported on this platform');
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
  // Get primary display dimensions for full height
  const primaryDisplay = screen.getPrimaryDisplay();
  const { height: screenHeight } = primaryDisplay.workAreaSize;

  trayWindow = new BrowserWindow({
    width: 600,
    height: screenHeight,
    minWidth: 400,
    minHeight: 400,
    show: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
    title: 'Kimai Time Tracker',
    icon: createTrayIcon(),
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  trayWindow.loadURL(`${MAIN_WINDOW_WEBPACK_ENTRY}#${VIEW_HASHES.TRAY}`);
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

function navigateTrayWindow(hash: string): void {
  if (!trayWindow || trayWindow.isDestroyed()) {
    createTrayWindow();
  }

  if (trayWindow) {
    trayWindow.loadURL(`${MAIN_WINDOW_WEBPACK_ENTRY}#${hash}`);
    if (!trayWindow.isVisible()) {
      trayWindow.center();
      trayWindow.show();
    }
    trayWindow.focus();
  }
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
      // Clear decryption failed flag since credentials were re-saved
      clearDecryptionFailedFlag();
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
    updateTimerSelections({ projectId: validProjectId, activityId: validActivityId, description: validDescription });
    await startTimer();
    return { activeTimers: getActiveTimers(), selections: getTimerSelections() };
  });
  ipcMain.handle(IPC_CHANNELS.KIMAI_STOP_TIMER, async (_, timesheetId: unknown) => {
    const validId = validateStrictPositiveInt(timesheetId, 'timesheetId');
    await stopTimer(validId);
    return { activeTimers: getActiveTimers(), selections: getTimerSelections() };
  });
  ipcMain.handle(IPC_CHANNELS.KIMAI_CREATE_TIMESHEET, (_, data: unknown) => {
    const validated = validateTimesheetCreate(data);
    return kimaiAPI.createTimesheet(validated);
  });
  ipcMain.handle(IPC_CHANNELS.KIMAI_DELETE_TIMESHEET, (_, id: unknown) => {
    const validated = validateStrictPositiveInt(id, 'id');
    return kimaiAPI.deleteTimesheet(validated);
  });
  ipcMain.handle(IPC_CHANNELS.KIMAI_UPDATE_DESCRIPTION, async (_, id: unknown, description: unknown) => {
    const validId = validateStrictPositiveInt(id, 'id');
    const validDescription = validateOptionalString(description, 'description') || '';
    const activeTimers = getActiveTimers();
    const isTracking = activeTimers.some(t => t.timesheetId === validId);
    const finalDescription = isTracking
      ? KimaiAPI.addTrackingPrefix(validDescription)
      : validDescription;
    const result = await kimaiAPI.updateTimesheet(validId, { description: finalDescription });
    if (isTracking) {
      updateActiveTimer(validId, { description: validDescription });
    }
    return result;
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
  ipcMain.handle(IPC_CHANNELS.JIRA_TRANSITION_TO_IN_PROGRESS, (_, issueKey: unknown) => {
    const validIssueKey = validateNonEmptyString(issueKey, 'issueKey');
    return jiraAPI.transitionToInProgress(validIssueKey);
  });

  // Active Timers
  ipcMain.handle(IPC_CHANNELS.GET_ACTIVE_TIMERS, () => getActiveTimers());

  // Timer Selections
  ipcMain.handle(IPC_CHANNELS.GET_TIMER_SELECTIONS, () => getTimerSelections());
  ipcMain.handle(IPC_CHANNELS.SET_TIMER_SELECTIONS, (_, selections: unknown) => {
    if (!selections || typeof selections !== 'object') {
      throw new Error('selections must be an object');
    }
    const sel = selections as Record<string, unknown>;
    const validated: Partial<TimerSelections> = {};
    if ('customerId' in sel) validated.customerId = sel.customerId === null ? null : validateOptionalPositiveInt(sel.customerId, 'customerId') ?? null;
    if ('projectId' in sel) validated.projectId = sel.projectId === null ? null : validateOptionalPositiveInt(sel.projectId, 'projectId') ?? null;
    if ('activityId' in sel) validated.activityId = sel.activityId === null ? null : validateOptionalPositiveInt(sel.activityId, 'activityId') ?? null;
    if ('description' in sel) validated.description = validateOptionalString(sel.description, 'description') || '';
    if ('jiraIssue' in sel) validated.jiraIssue = sel.jiraIssue === null ? null : sel.jiraIssue as JiraIssue;
    return updateTimerSelections(validated);
  });
  ipcMain.handle(IPC_CHANNELS.SET_TIMER_JIRA_ISSUE, (_, jiraIssue: unknown) => {
    if (jiraIssue !== null && (typeof jiraIssue !== 'object' || !jiraIssue)) {
      throw new Error('jiraIssue must be an object or null');
    }
    return updateTimerSelections({ jiraIssue: jiraIssue as JiraIssue | null });
  });

  // Work Session
  ipcMain.handle(IPC_CHANNELS.GET_REMINDERS_ENABLED, () => getRemindersEnabled());
  ipcMain.handle(IPC_CHANNELS.TOGGLE_REMINDERS, () => toggleReminders());

  // Theme
  ipcMain.handle(IPC_CHANNELS.GET_THEME_MODE, () => {
    return nativeTheme.themeSource;
  });
  ipcMain.handle(IPC_CHANNELS.SET_THEME_MODE, (_, mode: ThemeMode) => {
    nativeTheme.themeSource = mode;
    // Save to settings
    const settings = getSettings();
    settings.themeMode = mode;
    saveSettings(settings);
    return mode;
  });
  ipcMain.handle(IPC_CHANNELS.GET_SHOULD_USE_DARK_COLORS, () => {
    return nativeTheme.shouldUseDarkColors;
  });

  // Window
  ipcMain.handle(IPC_CHANNELS.OPEN_SETTINGS, () => {
    navigateTrayWindow(VIEW_HASHES.SETTINGS);
  });
  ipcMain.handle(IPC_CHANNELS.OPEN_TIME_ENTRY, () => {
    navigateTrayWindow(VIEW_HASHES.TIME_ENTRY);
  });
  ipcMain.handle(IPC_CHANNELS.OPEN_CHANGELOG, () => {
    navigateTrayWindow(VIEW_HASHES.CHANGELOG);
  });
  ipcMain.handle(IPC_CHANNELS.OPEN_TRAY, () => {
    navigateTrayWindow(VIEW_HASHES.TRAY);
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

  // Debug
  ipcMain.handle(IPC_CHANNELS.DEBUG_GET_PROCESSES, async () => {
    const currentPid = process.pid;
    const isWindows = process.platform === 'win32';

    return new Promise((resolve) => {
      if (isWindows) {
        // Use WMI to get processes with command lines - filter for main processes only
        // Electron child processes have --type= in their command line (renderer, gpu, utility, etc.)
        const cmd = `powershell -Command "Get-CimInstance Win32_Process | Where-Object {$_.Name -match 'kimai|electron'} | Select-Object ProcessId,Name,WorkingSetSize,CommandLine | ConvertTo-Json"`;

        exec(cmd, (error: Error | null, stdout: string) => {
          if (error) {
            addLog('error', `Failed to get processes: ${error.message}`);
            resolve([]);
            return;
          }

          try {
            let processes = JSON.parse(stdout || '[]');
            // Handle single process (not array)
            if (!Array.isArray(processes)) {
              processes = [processes];
            }

            const result = processes
              .filter((p: { Name: string; CommandLine: string | null }) => {
                const name = p.Name?.toLowerCase() || '';
                const cmdLine = p.CommandLine || '';

                // Must be electron or kimai process
                if (!name.includes('kimai') && name !== 'electron.exe') {
                  return false;
                }

                // Filter out Electron child processes (they have --type= argument)
                // Main processes don't have this
                if (cmdLine.includes('--type=')) {
                  return false;
                }

                return true;
              })
              .map((p: { ProcessId: number; Name: string; WorkingSetSize: number }) => ({
                pid: p.ProcessId,
                name: p.Name,
                memory: p.WorkingSetSize || 0,
                isCurrent: p.ProcessId === currentPid,
              }));

            resolve(result);
          } catch (parseError) {
            addLog('error', `Failed to parse process list: ${parseError}`);
            resolve([]);
          }
        });
      } else {
        // macOS/Linux: Use ps command
        const cmd = `ps aux | grep -i -E 'kimai|electron' | grep -v grep`;

        exec(cmd, (error: Error | null, stdout: string) => {
          if (error) {
            // grep returns exit code 1 when no matches found
            if (error.message.includes('exit code 1')) {
              resolve([]);
              return;
            }
            addLog('error', `Failed to get processes: ${error.message}`);
            resolve([]);
            return;
          }

          try {
            const lines = stdout.trim().split('\n').filter(Boolean);
            const result = lines
              .map((line: string) => {
                const parts = line.trim().split(/\s+/);
                const pid = parseInt(parts[1], 10);
                const memory = parseInt(parts[5], 10) * 1024; // RSS in KB -> bytes
                const name = parts.slice(10).join(' ').split('/').pop() || 'Unknown';
                const cmdLine = parts.slice(10).join(' ');

                return { pid, name, memory, cmdLine };
              })
              .filter((p: { pid: number; name: string; memory: number; cmdLine: string }) => {
                // Filter out Electron child processes (they have --type= argument)
                if (p.cmdLine.includes('--type=')) {
                  return false;
                }
                return true;
              })
              .map((p: { pid: number; name: string; memory: number }) => ({
                pid: p.pid,
                name: p.name,
                memory: p.memory,
                isCurrent: p.pid === currentPid,
              }));

            resolve(result);
          } catch (parseError) {
            addLog('error', `Failed to parse process list: ${parseError}`);
            resolve([]);
          }
        });
      }
    });
  });

  ipcMain.handle(IPC_CHANNELS.DEBUG_KILL_PROCESS, async (_, pid: number) => {
    const currentPid = process.pid;
    const isWindows = process.platform === 'win32';

    if (pid === currentPid) {
      addLog('warn', 'Attempted to kill current process - ignored');
      return { success: false, message: 'Cannot kill current process' };
    }

    return new Promise((resolve) => {
      const cmd = isWindows ? `taskkill /PID ${pid} /F` : `kill -9 ${pid}`;

      exec(cmd, (error: Error | null) => {
        if (error) {
          addLog('error', `Failed to kill PID ${pid}: ${error.message}`);
          resolve({ success: false, message: error.message });
        } else {
          addLog('info', `Killed process PID ${pid}`);
          resolve({ success: true });
        }
      });
    });
  });

  ipcMain.handle(IPC_CHANNELS.DEBUG_GET_LOGS, () => {
    return logBuffer;
  });

  ipcMain.handle(IPC_CHANNELS.DEBUG_CLEAR_LOGS, () => {
    logBuffer.length = 0;
    addLog('info', 'Logs cleared');
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_DEBUG, () => {
    navigateTrayWindow(VIEW_HASHES.DEBUG);
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_TIME_ROUNDING, () => {
    navigateTrayWindow(VIEW_HASHES.TIME_ROUNDING);
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_DEVTOOLS, () => {
    if (trayWindow && !trayWindow.isDestroyed()) {
      trayWindow.webContents.openDevTools();
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_ENCRYPTION_STATUS, () => {
    const { safeStorage } = require('electron');
    return {
      isAvailable: safeStorage.isEncryptionAvailable(),
      platform: process.platform,
      usingPlaintextFallback: isUsingPlaintextFallback(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.DID_CREDENTIALS_NEED_REENTRY, () => {
    return didDecryptionFail();
  });

  // Notifications
  ipcMain.handle(IPC_CHANNELS.SHOW_NOTIFICATION, (_, title: string, body: string) => {
    showNotification(title, body);
  });

  // Updates
  ipcMain.handle(IPC_CHANNELS.GET_UPDATE_STATUS, () => getUpdateStatus());
  ipcMain.handle(IPC_CHANNELS.CHECK_FOR_UPDATES, () => {
    checkForUpdates();
    return getUpdateStatus();
  });
  ipcMain.handle(IPC_CHANNELS.QUIT_AND_INSTALL, () => {
    quitAndInstall();
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
  // Setup IPC handlers FIRST (before any windows load)
  setupIPC();

  // Create tray
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Kimai Time Tracker');

  // Create tray popup window BEFORE accessing safeStorage
  // On macOS, safeStorage requires a BrowserWindow to exist first
  // See: https://github.com/electron/electron/issues/34614
  createTrayWindow();

  // Apply saved theme setting (now safe to call getSettings which uses safeStorage)
  const settings = getSettings();
  nativeTheme.themeSource = settings.themeMode || 'system';

  // Listen for system theme changes and notify renderer
  nativeTheme.on('updated', () => {
    const shouldUseDark = nativeTheme.shouldUseDarkColors;
    // Notify all windows
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('theme-changed', shouldUseDark);
    });
  });

  // Handle tray clicks
  tray.on('click', () => {
    toggleTrayWindow();
  });

  // Right-click shows context menu
  tray.on('right-click', () => {
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Settings', click: () => navigateTrayWindow(VIEW_HASHES.SETTINGS) },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]);
    tray.popUpContextMenu(contextMenu);
  });

  // Recover active timers — sync with Kimai server
  try {
    const serverActive = await kimaiAPI.getActiveTimesheets();
    const localTimers = getActiveTimers();

    const merged: ActiveTimer[] = serverActive.map(serverTs => {
      const local = localTimers.find(lt => lt.timesheetId === serverTs.id);
      if (local) {
        return {
          ...local,
          startTime: serverTs.begin,
          projectId: serverTs.project,
          activityId: serverTs.activity,
          description: KimaiAPI.stripTrackingPrefix(serverTs.description || ''),
        };
      }
      return {
        timesheetId: serverTs.id,
        projectId: serverTs.project,
        activityId: serverTs.activity,
        customerId: null,
        description: KimaiAPI.stripTrackingPrefix(serverTs.description || ''),
        startTime: serverTs.begin,
        actualStartTime: null,
        jiraIssue: null,
      };
    });

    setActiveTimers(merged);

    if (merged.length > 0) {
      startTimerUpdateLoop();
    }
  } catch {
    if (getActiveTimers().length > 0) {
      startTimerUpdateLoop();
    }
  }

  // Create hidden main window (for renderer process)
  createMainWindow();

  // Initialize auto-updater (checks for updates automatically)
  initAutoUpdater();

  // Start reminder interval (checks if not tracking time)
  startReminderInterval();
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
