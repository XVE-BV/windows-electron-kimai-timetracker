import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  AppSettings,
  KimaiTimesheetCreate,
  WorkSessionState,
  KimaiCustomer,
  KimaiProject,
  KimaiActivity,
  KimaiTimesheet,
  TimerState,
  AWBuckets,
  AWEvent,
  JiraIssue,
  ActivitySummaryItem,
} from './types';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, settings),

  // Kimai
  kimaiTestConnection: () => ipcRenderer.invoke(IPC_CHANNELS.KIMAI_TEST_CONNECTION),
  kimaiGetCustomers: () => ipcRenderer.invoke(IPC_CHANNELS.KIMAI_GET_CUSTOMERS),
  kimaiGetProjects: (customerId?: number) => ipcRenderer.invoke(IPC_CHANNELS.KIMAI_GET_PROJECTS, customerId),
  kimaiGetActivities: (projectId?: number) => ipcRenderer.invoke(IPC_CHANNELS.KIMAI_GET_ACTIVITIES, projectId),
  kimaiGetTimesheets: (params?: { user?: string; begin?: string; end?: string; active?: boolean }) =>
    ipcRenderer.invoke(IPC_CHANNELS.KIMAI_GET_TIMESHEETS, params),
  kimaiStartTimer: (projectId: number, activityId: number, description?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.KIMAI_START_TIMER, projectId, activityId, description),
  kimaiStopTimer: () => ipcRenderer.invoke(IPC_CHANNELS.KIMAI_STOP_TIMER),
  kimaiCreateTimesheet: (data: KimaiTimesheetCreate) =>
    ipcRenderer.invoke(IPC_CHANNELS.KIMAI_CREATE_TIMESHEET, data),
  kimaiDeleteTimesheet: (id: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.KIMAI_DELETE_TIMESHEET, id),

  // ActivityWatch
  awGetBuckets: () => ipcRenderer.invoke(IPC_CHANNELS.AW_GET_BUCKETS),
  awGetEvents: (bucketId: string, start?: string, end?: string, limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.AW_GET_EVENTS, bucketId, start, end, limit),
  awGetActivitySummary: (minutes?: number) => ipcRenderer.invoke(IPC_CHANNELS.AW_GET_ACTIVITY_SUMMARY, minutes),

  // Jira
  jiraTestConnection: () => ipcRenderer.invoke(IPC_CHANNELS.JIRA_TEST_CONNECTION),
  jiraGetMyIssues: (maxResults?: number) => ipcRenderer.invoke(IPC_CHANNELS.JIRA_GET_MY_ISSUES, maxResults),
  jiraSearchIssues: (jql: string, maxResults?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.JIRA_SEARCH_ISSUES, jql, maxResults),
  jiraAddWorklog: (issueKey: string, timeSpentSeconds: number, started: string, comment?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.JIRA_ADD_WORKLOG, issueKey, timeSpentSeconds, started, comment),

  // Timer State
  getTimerState: () => ipcRenderer.invoke(IPC_CHANNELS.GET_TIMER_STATE),

  // Work Session
  workSessionStart: () => ipcRenderer.invoke(IPC_CHANNELS.WORK_SESSION_START),
  workSessionPause: () => ipcRenderer.invoke(IPC_CHANNELS.WORK_SESSION_PAUSE),
  workSessionStop: () => ipcRenderer.invoke(IPC_CHANNELS.WORK_SESSION_STOP),
  workSessionGetState: () => ipcRenderer.invoke(IPC_CHANNELS.WORK_SESSION_GET_STATE),
  workSessionToggleReminders: () => ipcRenderer.invoke(IPC_CHANNELS.WORK_SESSION_TOGGLE_REMINDERS),

  // Window
  openSettings: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_SETTINGS),
  openTimeEntry: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_TIME_ENTRY),
  openChangelog: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_CHANGELOG),
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL, url),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.CLOSE_WINDOW),

  // GitHub
  githubGetReleases: () => ipcRenderer.invoke(IPC_CHANNELS.GITHUB_GET_RELEASES),

  // Debug
  debugGetProcesses: () => ipcRenderer.invoke(IPC_CHANNELS.DEBUG_GET_PROCESSES),
  debugKillProcess: (pid: number) => ipcRenderer.invoke(IPC_CHANNELS.DEBUG_KILL_PROCESS, pid),
  debugGetLogs: () => ipcRenderer.invoke(IPC_CHANNELS.DEBUG_GET_LOGS),
  debugClearLogs: () => ipcRenderer.invoke(IPC_CHANNELS.DEBUG_CLEAR_LOGS),
  openDebug: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_DEBUG),

  // Events
  onSettingsChanged: (callback: () => void) => {
    ipcRenderer.on('settings-changed', callback);
    return () => ipcRenderer.removeListener('settings-changed', callback);
  },
});

// Type definitions for the exposed API
export interface ElectronAPI {
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<{ success: boolean; message?: string }>;
  kimaiTestConnection: () => Promise<{ success: boolean; message: string }>;
  kimaiGetCustomers: () => Promise<KimaiCustomer[]>;
  kimaiGetProjects: (customerId?: number) => Promise<KimaiProject[]>;
  kimaiGetActivities: (projectId?: number) => Promise<KimaiActivity[]>;
  kimaiGetTimesheets: (params?: { user?: string; begin?: string; end?: string; active?: boolean }) => Promise<KimaiTimesheet[]>;
  kimaiStartTimer: (projectId: number, activityId: number, description?: string) => Promise<TimerState>;
  kimaiStopTimer: () => Promise<TimerState>;
  kimaiCreateTimesheet: (data: KimaiTimesheetCreate) => Promise<KimaiTimesheet>;
  kimaiDeleteTimesheet: (id: number) => Promise<void>;
  awGetBuckets: () => Promise<AWBuckets>;
  awGetEvents: (bucketId: string, start?: string, end?: string, limit?: number) => Promise<AWEvent[]>;
  awGetActivitySummary: (minutes?: number) => Promise<ActivitySummaryItem[]>;
  jiraTestConnection: () => Promise<{ success: boolean; message: string }>;
  jiraGetMyIssues: (maxResults?: number) => Promise<JiraIssue[]>;
  jiraSearchIssues: (jql: string, maxResults?: number) => Promise<JiraIssue[]>;
  jiraAddWorklog: (issueKey: string, timeSpentSeconds: number, started: string, comment?: string) => Promise<{ id: string }>;
  getTimerState: () => Promise<TimerState>;
  workSessionStart: () => Promise<WorkSessionState>;
  workSessionPause: () => Promise<WorkSessionState>;
  workSessionStop: () => Promise<WorkSessionState>;
  workSessionGetState: () => Promise<WorkSessionState>;
  workSessionToggleReminders: () => Promise<WorkSessionState>;
  openSettings: () => Promise<void>;
  openTimeEntry: () => Promise<void>;
  openChangelog: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  closeWindow: () => Promise<void>;
  githubGetReleases: () => Promise<Array<{
    id: number;
    tag_name: string;
    name: string;
    body: string;
    published_at: string;
    html_url: string;
  }>>;
  debugGetProcesses: () => Promise<Array<{
    pid: number;
    name: string;
    memory: number;
    isCurrent: boolean;
  }>>;
  debugKillProcess: (pid: number) => Promise<{ success: boolean; message?: string }>;
  debugGetLogs: () => Promise<Array<{
    timestamp: string;
    level: 'info' | 'warn' | 'error';
    message: string;
  }>>;
  debugClearLogs: () => Promise<{ success: boolean }>;
  openDebug: () => Promise<void>;
  onSettingsChanged: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
