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

// Activity summary returned by ActivityWatch service
export interface ActivitySummaryItem {
  app: string;
  title: string;
  duration: number;
}

// ActivityWatch Settings
export interface AWSettings {
  apiUrl: string;
  enabled: boolean;
}

// Jira Types
export interface JiraSettings {
  apiUrl: string;      // e.g., https://your-domain.atlassian.net
  email: string;       // Atlassian account email
  apiToken: string;    // API token
  enabled: boolean;
  autoLogWorklog: boolean; // Automatically log time to Jira when stopping timer
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    status: {
      name: string;
      statusCategory: {
        key: string;
        name: string;
      };
    };
    issuetype: {
      name: string;
      iconUrl?: string;
    };
    priority?: {
      name: string;
      iconUrl?: string;
    };
    assignee?: {
      displayName: string;
      emailAddress: string;
    };
    project: {
      key: string;
      name: string;
    };
    updated: string;
    created: string;
    // Time tracking fields
    timetracking?: {
      originalEstimate?: string;
      remainingEstimate?: string;
      originalEstimateSeconds?: number;
      remainingEstimateSeconds?: number;
      timeSpentSeconds?: number;
    };
    // Custom field for customer (xve specific - customfield_10278)
    customfield_10278?: {
      value: string;
      id: string;
    };
    // Allow other custom fields
    [key: string]: unknown;
  };
}

export interface JiraSearchResult {
  issues: JiraIssue[];
  isLast?: boolean;
  // Legacy fields (may not be present in new /search/jql endpoint)
  startAt?: number;
  maxResults?: number;
  total?: number;
}

// Theme mode
export type ThemeMode = 'system' | 'light' | 'dark';

// App Settings
export interface AppSettings {
  kimai: KimaiSettings;
  activityWatch: AWSettings;
  jira: JiraSettings;
  autoStartTimer: boolean;
  useDefaults: boolean;
  defaultCustomerId: number | null;
  defaultProjectId: number | null;
  defaultActivityId: number | null;
  syncInterval: number; // minutes
  themeMode: ThemeMode;
}

// Timer State
export interface TimerState {
  isRunning: boolean;
  currentTimesheetId: number | null;
  startTime: string | null;        // Kimai's rounded start time
  actualStartTime: string | null;  // When user actually clicked Start
  projectId: number | null;
  activityId: number | null;
  description: string;
}

// View Hashes for single-window navigation
export const VIEW_HASHES = {
  TRAY: 'tray',
  SETTINGS: 'settings',
  TIME_ENTRY: 'time-entry',
  CHANGELOG: 'changelog',
  DEBUG: 'debug',
} as const;

export type ViewHash = typeof VIEW_HASHES[keyof typeof VIEW_HASHES];

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
  KIMAI_DELETE_TIMESHEET: 'kimai-delete-timesheet',
  KIMAI_UPDATE_DESCRIPTION: 'kimai-update-description',

  // ActivityWatch
  AW_GET_BUCKETS: 'aw-get-buckets',
  AW_GET_EVENTS: 'aw-get-events',
  AW_GET_ACTIVITY_SUMMARY: 'aw-get-activity-summary',

  // Jira
  JIRA_TEST_CONNECTION: 'jira-test-connection',
  JIRA_GET_MY_ISSUES: 'jira-get-my-issues',
  JIRA_SEARCH_ISSUES: 'jira-search-issues',
  JIRA_ADD_WORKLOG: 'jira-add-worklog',

  // Timer
  GET_TIMER_STATE: 'get-timer-state',

  // Reminders
  GET_REMINDERS_ENABLED: 'get-reminders-enabled',
  TOGGLE_REMINDERS: 'toggle-reminders',

  // Theme
  GET_THEME_MODE: 'get-theme-mode',
  SET_THEME_MODE: 'set-theme-mode',
  GET_SHOULD_USE_DARK_COLORS: 'get-should-use-dark-colors',

  // Window
  OPEN_SETTINGS: 'open-settings',
  OPEN_TIME_ENTRY: 'open-time-entry',
  OPEN_CHANGELOG: 'open-changelog',
  OPEN_TRAY: 'open-tray',
  OPEN_EXTERNAL: 'open-external',
  CLOSE_WINDOW: 'close-window',

  // GitHub
  GITHUB_GET_RELEASES: 'github-get-releases',

  // Debug
  DEBUG_GET_PROCESSES: 'debug-get-processes',
  DEBUG_KILL_PROCESS: 'debug-kill-process',
  DEBUG_GET_LOGS: 'debug-get-logs',
  DEBUG_CLEAR_LOGS: 'debug-clear-logs',
  OPEN_DEBUG: 'open-debug',
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
  jira: {
    apiUrl: '',
    email: '',
    apiToken: '',
    enabled: false,
    autoLogWorklog: false,
  },
  autoStartTimer: false,
  useDefaults: false,
  defaultCustomerId: null,
  defaultProjectId: null,
  defaultActivityId: null,
  syncInterval: 15,
  themeMode: 'system',
};
