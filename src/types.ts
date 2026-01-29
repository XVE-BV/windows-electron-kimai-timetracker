// Kimai Types
export interface KimaiSettings {
  apiUrl: string;
  apiToken: string;
}

export interface KimaiCustomer {
  id: number;
  name: string;
  visible: boolean;
}

export interface KimaiProject {
  id: number;
  name: string;
  customer: number;
  visible: boolean;
  globalActivities: boolean;
}

export interface KimaiActivity {
  id: number;
  name: string;
  project: number | null;
  visible: boolean;
}

export interface KimaiTimesheet {
  id: number;
  begin: string;
  end: string | null;
  duration: number;
  project: number;
  activity: number;
  description: string;
  user: number;
  tags: string[];
  exported: boolean;
  billable: boolean;
}

export interface KimaiTimesheetCreate {
  begin: string;
  end?: string;
  project: number;
  activity: number;
  description?: string;
  tags?: string[];
  billable?: boolean;
}

// ActivityWatch Types
export interface AWBucket {
  id: string;
  name?: string;
  type: string;
  client: string;
  hostname: string;
  created: string;
}

export interface AWEvent {
  id?: number;
  timestamp: string;
  duration: number;
  data: Record<string, unknown>;
}

export interface AWBuckets {
  [key: string]: AWBucket;
}

// ActivityWatch Settings
export interface AWSettings {
  apiUrl: string;
  enabled: boolean;
}

// App Settings
export interface AppSettings {
  kimai: KimaiSettings;
  activityWatch: AWSettings;
  autoStartTimer: boolean;
  defaultCustomerId: number | null;
  defaultProjectId: number | null;
  defaultActivityId: number | null;
  syncInterval: number; // minutes
}

// Timer State
export interface TimerState {
  isRunning: boolean;
  currentTimesheetId: number | null;
  startTime: string | null;
  projectId: number | null;
  activityId: number | null;
  description: string;
}

// IPC Channel Names
export const IPC_CHANNELS = {
  // Settings
  GET_SETTINGS: 'get-settings',
  SAVE_SETTINGS: 'save-settings',

  // Kimai
  KIMAI_TEST_CONNECTION: 'kimai-test-connection',
  KIMAI_GET_CUSTOMERS: 'kimai-get-customers',
  KIMAI_GET_PROJECTS: 'kimai-get-projects',
  KIMAI_GET_ACTIVITIES: 'kimai-get-activities',
  KIMAI_GET_TIMESHEETS: 'kimai-get-timesheets',
  KIMAI_START_TIMER: 'kimai-start-timer',
  KIMAI_STOP_TIMER: 'kimai-stop-timer',
  KIMAI_CREATE_TIMESHEET: 'kimai-create-timesheet',

  // ActivityWatch
  AW_GET_BUCKETS: 'aw-get-buckets',
  AW_GET_EVENTS: 'aw-get-events',
  AW_GET_ACTIVITY_SUMMARY: 'aw-get-activity-summary',

  // Timer
  GET_TIMER_STATE: 'get-timer-state',

  // Window
  OPEN_SETTINGS: 'open-settings',
  OPEN_TIME_ENTRY: 'open-time-entry',
  CLOSE_WINDOW: 'close-window',
} as const;

// Default Settings
export const DEFAULT_SETTINGS: AppSettings = {
  kimai: {
    apiUrl: '',
    apiToken: '',
  },
  activityWatch: {
    apiUrl: 'http://localhost:5600',
    enabled: true,
  },
  autoStartTimer: false,
  defaultCustomerId: null,
  defaultProjectId: null,
  defaultActivityId: null,
  syncInterval: 15,
};
