import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, AppSettings, KimaiTimesheetCreate } from './types';

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

  // Window
  openSettings: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_SETTINGS),
  openTimeEntry: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_TIME_ENTRY),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.CLOSE_WINDOW),
});

// Type definitions for the exposed API
export interface ElectronAPI {
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<{ success: boolean }>;
  kimaiTestConnection: () => Promise<{ success: boolean; message: string }>;
  kimaiGetCustomers: () => Promise<unknown[]>;
  kimaiGetProjects: (customerId?: number) => Promise<unknown[]>;
  kimaiGetActivities: (projectId?: number) => Promise<unknown[]>;
  kimaiGetTimesheets: (params?: { user?: string; begin?: string; end?: string; active?: boolean }) => Promise<unknown[]>;
  kimaiStartTimer: (projectId: number, activityId: number, description?: string) => Promise<unknown>;
  kimaiStopTimer: () => Promise<unknown>;
  kimaiCreateTimesheet: (data: KimaiTimesheetCreate) => Promise<unknown>;
  awGetBuckets: () => Promise<unknown>;
  awGetEvents: (bucketId: string, start?: string, end?: string, limit?: number) => Promise<unknown[]>;
  awGetActivitySummary: (minutes?: number) => Promise<unknown[]>;
  jiraTestConnection: () => Promise<{ success: boolean; message: string }>;
  jiraGetMyIssues: (maxResults?: number) => Promise<unknown[]>;
  jiraSearchIssues: (jql: string, maxResults?: number) => Promise<unknown[]>;
  jiraAddWorklog: (issueKey: string, timeSpentSeconds: number, started: string, comment?: string) => Promise<{ id: string }>;
  getTimerState: () => Promise<unknown>;
  openSettings: () => Promise<void>;
  openTimeEntry: () => Promise<void>;
  closeWindow: () => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
