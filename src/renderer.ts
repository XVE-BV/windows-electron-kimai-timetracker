import './index.css';
import { AppSettings, KimaiProject, KimaiActivity } from './types';

// Type for activity summary from ActivityWatch
interface ActivitySummary {
  app: string;
  title: string;
  duration: number;
}

// DOM Elements - Settings
const settingsView = document.getElementById('settings-view') as HTMLDivElement;
const kimaiUrlInput = document.getElementById('kimai-url') as HTMLInputElement;
const kimaiTokenInput = document.getElementById('kimai-token') as HTMLInputElement;
const testKimaiBtn = document.getElementById('test-kimai-btn') as HTMLButtonElement;
const kimaiStatus = document.getElementById('kimai-status') as HTMLSpanElement;
const awEnabledCheckbox = document.getElementById('aw-enabled') as HTMLInputElement;
const awUrlInput = document.getElementById('aw-url') as HTMLInputElement;
const testAwBtn = document.getElementById('test-aw-btn') as HTMLButtonElement;
const awStatus = document.getElementById('aw-status') as HTMLSpanElement;
const defaultProjectSelect = document.getElementById('default-project') as HTMLSelectElement;
const defaultActivitySelect = document.getElementById('default-activity') as HTMLSelectElement;
const saveSettingsBtn = document.getElementById('save-settings-btn') as HTMLButtonElement;
const cancelSettingsBtn = document.getElementById('cancel-settings-btn') as HTMLButtonElement;

// DOM Elements - Time Entry
const timeEntryView = document.getElementById('time-entry-view') as HTMLDivElement;
const entryProjectSelect = document.getElementById('entry-project') as HTMLSelectElement;
const entryActivitySelect = document.getElementById('entry-activity') as HTMLSelectElement;
const entryDateInput = document.getElementById('entry-date') as HTMLInputElement;
const entryStartInput = document.getElementById('entry-start') as HTMLInputElement;
const entryEndInput = document.getElementById('entry-end') as HTMLInputElement;
const entryDescriptionInput = document.getElementById('entry-description') as HTMLTextAreaElement;
const activitySuggestions = document.getElementById('activity-suggestions') as HTMLDivElement;
const saveEntryBtn = document.getElementById('save-entry-btn') as HTMLButtonElement;
const cancelEntryBtn = document.getElementById('cancel-entry-btn') as HTMLButtonElement;

// DOM Elements - Main
const mainView = document.getElementById('main-view') as HTMLDivElement;

// Current settings
let currentSettings: AppSettings | null = null;
let projects: KimaiProject[] = [];
let activities: KimaiActivity[] = [];

// Utility functions
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function showView(viewId: string): void {
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.add('hidden');
  });

  const view = document.getElementById(viewId);
  if (view) {
    view.classList.remove('hidden');
  }
}

function setStatus(element: HTMLSpanElement, message: string, type: 'success' | 'error' | 'loading'): void {
  element.textContent = message;
  element.className = `status ${type}`;
}

// Settings functions
async function loadSettings(): Promise<void> {
  try {
    currentSettings = await window.electronAPI.getSettings();

    kimaiUrlInput.value = currentSettings.kimai.apiUrl;
    kimaiTokenInput.value = currentSettings.kimai.apiToken;
    awEnabledCheckbox.checked = currentSettings.activityWatch.enabled;
    awUrlInput.value = currentSettings.activityWatch.apiUrl;

    // Load projects for default selection
    if (currentSettings.kimai.apiUrl && currentSettings.kimai.apiToken) {
      await loadProjects();
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

async function loadProjects(): Promise<void> {
  try {
    projects = (await window.electronAPI.kimaiGetProjects()) as KimaiProject[];

    // Update default project select
    defaultProjectSelect.innerHTML = '<option value="">None</option>';
    entryProjectSelect.innerHTML = '<option value="">Select a project</option>';

    projects.forEach((project) => {
      const option1 = document.createElement('option');
      option1.value = String(project.id);
      option1.textContent = project.name;
      defaultProjectSelect.appendChild(option1);

      const option2 = document.createElement('option');
      option2.value = String(project.id);
      option2.textContent = project.name;
      entryProjectSelect.appendChild(option2);
    });

    // Set current default if exists
    if (currentSettings?.defaultProjectId) {
      defaultProjectSelect.value = String(currentSettings.defaultProjectId);
      await loadActivities(currentSettings.defaultProjectId);
    }
  } catch (error) {
    console.error('Failed to load projects:', error);
  }
}

async function loadActivities(projectId: number): Promise<void> {
  try {
    activities = (await window.electronAPI.kimaiGetActivities(projectId)) as KimaiActivity[];

    // Update activity selects
    defaultActivitySelect.innerHTML = '<option value="">None</option>';
    entryActivitySelect.innerHTML = '<option value="">Select an activity</option>';

    activities.forEach((activity) => {
      const option1 = document.createElement('option');
      option1.value = String(activity.id);
      option1.textContent = activity.name;
      defaultActivitySelect.appendChild(option1);

      const option2 = document.createElement('option');
      option2.value = String(activity.id);
      option2.textContent = activity.name;
      entryActivitySelect.appendChild(option2);
    });

    // Set current default if exists
    if (currentSettings?.defaultActivityId) {
      defaultActivitySelect.value = String(currentSettings.defaultActivityId);
    }
  } catch (error) {
    console.error('Failed to load activities:', error);
  }
}

async function testKimaiConnection(): Promise<void> {
  setStatus(kimaiStatus, 'Testing...', 'loading');
  testKimaiBtn.disabled = true;

  // Temporarily save the current values
  const tempSettings: AppSettings = {
    ...currentSettings!,
    kimai: {
      apiUrl: kimaiUrlInput.value,
      apiToken: kimaiTokenInput.value,
    },
  };

  await window.electronAPI.saveSettings(tempSettings);

  try {
    const result = await window.electronAPI.kimaiTestConnection();
    if (result.success) {
      setStatus(kimaiStatus, 'Connected!', 'success');
      await loadProjects();
    } else {
      setStatus(kimaiStatus, result.message, 'error');
    }
  } catch (error) {
    setStatus(kimaiStatus, 'Connection failed', 'error');
  } finally {
    testKimaiBtn.disabled = false;
  }
}

async function testAwConnection(): Promise<void> {
  setStatus(awStatus, 'Testing...', 'loading');
  testAwBtn.disabled = true;

  // Temporarily save the current values
  const tempSettings: AppSettings = {
    ...currentSettings!,
    activityWatch: {
      apiUrl: awUrlInput.value,
      enabled: awEnabledCheckbox.checked,
    },
  };

  await window.electronAPI.saveSettings(tempSettings);

  try {
    const buckets = await window.electronAPI.awGetBuckets();
    const bucketCount = Object.keys(buckets as object).length;
    if (bucketCount > 0) {
      setStatus(awStatus, `Connected! (${bucketCount} buckets)`, 'success');
    } else {
      setStatus(awStatus, 'Connected but no buckets found', 'success');
    }
  } catch (error) {
    setStatus(awStatus, 'Connection failed', 'error');
  } finally {
    testAwBtn.disabled = false;
  }
}

async function saveSettings(): Promise<void> {
  if (!currentSettings) return;

  const newSettings: AppSettings = {
    kimai: {
      apiUrl: kimaiUrlInput.value.replace(/\/$/, ''),
      apiToken: kimaiTokenInput.value,
    },
    activityWatch: {
      apiUrl: awUrlInput.value.replace(/\/$/, ''),
      enabled: awEnabledCheckbox.checked,
    },
    autoStartTimer: currentSettings.autoStartTimer,
    defaultProjectId: defaultProjectSelect.value ? parseInt(defaultProjectSelect.value, 10) : null,
    defaultActivityId: defaultActivitySelect.value ? parseInt(defaultActivitySelect.value, 10) : null,
    syncInterval: currentSettings.syncInterval,
  };

  try {
    await window.electronAPI.saveSettings(newSettings);
    window.electronAPI.closeWindow();
  } catch (error) {
    console.error('Failed to save settings:', error);
    alert('Failed to save settings');
  }
}

// Time Entry functions
async function loadActivitySuggestions(): Promise<void> {
  activitySuggestions.innerHTML = '<p class="loading">Loading activity data...</p>';

  try {
    const summary = (await window.electronAPI.awGetActivitySummary(60)) as ActivitySummary[];

    if (summary.length === 0) {
      activitySuggestions.innerHTML = '<p class="no-data">No activity recorded in the last hour</p>';
      return;
    }

    activitySuggestions.innerHTML = '';

    summary.slice(0, 10).forEach((activity) => {
      const item = document.createElement('div');
      item.className = 'activity-item';
      item.innerHTML = `
        <div>
          <div class="activity-app">${escapeHtml(activity.app)}</div>
          <div class="activity-title">${escapeHtml(activity.title)}</div>
        </div>
        <div class="activity-duration">${formatDuration(activity.duration)}</div>
      `;

      item.addEventListener('click', () => {
        entryDescriptionInput.value = `${activity.app}: ${activity.title}`;
      });

      activitySuggestions.appendChild(item);
    });
  } catch (error) {
    console.error('Failed to load activity suggestions:', error);
    activitySuggestions.innerHTML = '<p class="no-data">Failed to load activity data</p>';
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function saveTimeEntry(): Promise<void> {
  const projectId = parseInt(entryProjectSelect.value, 10);
  const activityId = parseInt(entryActivitySelect.value, 10);
  const date = entryDateInput.value;
  const startTime = entryStartInput.value;
  const endTime = entryEndInput.value;
  const description = entryDescriptionInput.value;

  if (!projectId || !activityId || !date || !startTime || !endTime) {
    alert('Please fill in all required fields');
    return;
  }

  const begin = `${date}T${startTime}:00`;
  const end = `${date}T${endTime}:00`;

  saveEntryBtn.disabled = true;
  saveEntryBtn.textContent = 'Saving...';

  try {
    await window.electronAPI.kimaiCreateTimesheet({
      begin,
      end,
      project: projectId,
      activity: activityId,
      description,
    });

    window.electronAPI.closeWindow();
  } catch (error) {
    console.error('Failed to save time entry:', error);
    alert('Failed to save time entry');
  } finally {
    saveEntryBtn.disabled = false;
    saveEntryBtn.textContent = 'Save Entry';
  }
}

// Initialize based on URL hash
function initializeView(): void {
  const hash = window.location.hash;

  if (hash === '#settings') {
    showView('settings-view');
    loadSettings();
  } else if (hash === '#time-entry') {
    showView('time-entry-view');
    initTimeEntryView();
  } else {
    showView('main-view');
  }
}

async function initTimeEntryView(): Promise<void> {
  // Set today's date
  const today = new Date().toISOString().split('T')[0];
  entryDateInput.value = today;

  // Set current time as start
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  entryStartInput.value = `${hours}:${minutes}`;

  // Load projects
  await loadSettings();

  if (currentSettings?.kimai.apiUrl && currentSettings?.kimai.apiToken) {
    await loadProjects();

    // Set default project if exists
    if (currentSettings.defaultProjectId) {
      entryProjectSelect.value = String(currentSettings.defaultProjectId);
      await loadActivities(currentSettings.defaultProjectId);

      // Set default activity if exists
      if (currentSettings.defaultActivityId) {
        entryActivitySelect.value = String(currentSettings.defaultActivityId);
      }
    }
  }

  // Load activity suggestions
  if (currentSettings?.activityWatch.enabled) {
    loadActivitySuggestions();
  } else {
    activitySuggestions.innerHTML = '<p class="no-data">ActivityWatch integration is disabled</p>';
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  initializeView();

  // Settings listeners
  testKimaiBtn?.addEventListener('click', testKimaiConnection);
  testAwBtn?.addEventListener('click', testAwConnection);
  saveSettingsBtn?.addEventListener('click', saveSettings);
  cancelSettingsBtn?.addEventListener('click', () => window.electronAPI.closeWindow());

  defaultProjectSelect?.addEventListener('change', async () => {
    const projectId = parseInt(defaultProjectSelect.value, 10);
    if (projectId) {
      await loadActivities(projectId);
    } else {
      defaultActivitySelect.innerHTML = '<option value="">None</option>';
    }
  });

  // Time Entry listeners
  entryProjectSelect?.addEventListener('change', async () => {
    const projectId = parseInt(entryProjectSelect.value, 10);
    if (projectId) {
      activities = (await window.electronAPI.kimaiGetActivities(projectId)) as KimaiActivity[];
      entryActivitySelect.innerHTML = '<option value="">Select an activity</option>';
      activities.forEach((activity) => {
        const option = document.createElement('option');
        option.value = String(activity.id);
        option.textContent = activity.name;
        entryActivitySelect.appendChild(option);
      });
    } else {
      entryActivitySelect.innerHTML = '<option value="">Select an activity</option>';
    }
  });

  saveEntryBtn?.addEventListener('click', saveTimeEntry);
  cancelEntryBtn?.addEventListener('click', () => window.electronAPI.closeWindow());
});

// Handle hash changes
window.addEventListener('hashchange', initializeView);
