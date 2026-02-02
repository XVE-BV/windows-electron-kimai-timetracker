import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Play, Square, Settings, Plus, Activity, ChevronRight, Timer,
  Calendar, TrendingUp, Zap, RefreshCw, Monitor, Layers, Briefcase,
  FileText, Search, X, Users, Ticket, Trash2, AlertCircle, ScrollText,
  Bell, BellOff, Bug, PanelRightClose, Moon, Sun, Laptop, Star, Download,
  Clock
} from 'lucide-react';
import { Button } from './ui/button';
import { TimerState, KimaiProject, KimaiActivity, KimaiTimesheet, KimaiCustomer, JiraIssue, ActivitySummaryItem, ThemeMode } from '../types';
import { formatDurationHuman } from '../utils';
import { DATA_REFRESH_INTERVAL_MS, TIMER_UPDATE_INTERVAL_MS, MAX_RECENT_TIMESHEETS, MAX_ACTIVITY_SUMMARY_ITEMS, MAX_JIRA_ISSUES } from '../constants';

export function TrayView() {
  const [timerState, setTimerState] = useState<TimerState | null>(null);
  const timerStateRef = useRef<TimerState | null>(null);
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const [billedTime, setBilledTime] = useState('00:00:00');
  const [projects, setProjects] = useState<KimaiProject[]>([]);
  const [allProjects, setAllProjects] = useState<KimaiProject[]>([]);
  const [activities, setActivities] = useState<KimaiActivity[]>([]);
  const [customers, setCustomers] = useState<KimaiCustomer[]>([]);
  const [selectedProject, setSelectedProject] = useState<KimaiProject | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<KimaiActivity | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<KimaiCustomer | null>(null);
  const [view, setView] = useState<'main' | 'customers' | 'projects' | 'activities' | 'jira'>('main');
  const [todayTimesheets, setTodayTimesheets] = useState<KimaiTimesheet[]>([]);
  const [todayTotal, setTodayTotal] = useState(0);
  const [weekTotal, setWeekTotal] = useState(0);
  const [activitySummary, setActivitySummary] = useState<ActivitySummaryItem[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [awStatus, setAwStatus] = useState<'connected' | 'disconnected' | 'disabled'>('disconnected');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTimerLoading, setIsTimerLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [description, setDescription] = useState('');
  const [savedDescription, setSavedDescription] = useState('');
  const [isUpdatingDescription, setIsUpdatingDescription] = useState(false);

  // Jira state
  const [jiraEnabled, setJiraEnabled] = useState(false);
  const [jiraAutoLogWorklog, setJiraAutoLogWorklog] = useState(false);
  const [jiraIssues, setJiraIssues] = useState<JiraIssue[]>([]);
  const [selectedJiraIssue, setSelectedJiraIssue] = useState<JiraIssue | null>(null);
  const [jiraStatus, setJiraStatus] = useState<'connected' | 'disconnected' | 'disabled'>('disabled');
  const [jiraSearchQuery, setJiraSearchQuery] = useState('');

  // Reminders state
  const [remindersEnabled, setRemindersEnabled] = useState(true);

  // Favorite customers
  const [favoriteCustomerIds, setFavoriteCustomerIds] = useState<number[]>([]);

  // Update status
  const [updateStatus, setUpdateStatus] = useState<{ status: string; version?: string }>({ status: 'idle' });

  // Panel states
  const [recentEntriesOpen, setRecentEntriesOpen] = useState(false);
  const [activityPanelOpen, setActivityPanelOpen] = useState(false);

  // Theme state (using Electron's nativeTheme)
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [isDark, setIsDark] = useState(false);

  // Initialize theme from Electron's nativeTheme
  useEffect(() => {
    const initTheme = async () => {
      if (!window.electronAPI) return;
      const mode = await window.electronAPI.getThemeMode();
      const shouldUseDark = await window.electronAPI.getShouldUseDarkColors();
      setThemeMode(mode);
      setIsDark(shouldUseDark);
    };
    initTheme();

    // Listen for theme changes
    const unsubscribe = window.electronAPI?.onThemeChanged?.((shouldUseDark) => {
      setIsDark(shouldUseDark);
    });

    return () => unsubscribe?.();
  }, []);

  // Apply dark mode class to document
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Handle theme mode change
  const handleThemeModeChange = async (mode: ThemeMode) => {
    if (!window.electronAPI) return;
    await window.electronAPI.setThemeMode(mode);
    setThemeMode(mode);
    // Update dark state after changing mode
    const shouldUseDark = await window.electronAPI.getShouldUseDarkColors();
    setIsDark(shouldUseDark);
  };

  // Error notification state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Show error message with auto-dismiss
  const showError = useCallback((message: string) => {
    // Clear any existing timeout
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
    setErrorMessage(message);
    // Auto-dismiss after 5 seconds
    errorTimeoutRef.current = setTimeout(() => {
      setErrorMessage(null);
      errorTimeoutRef.current = null;
    }, 5000);
  }, []);

  const dismissError = useCallback(() => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
    setErrorMessage(null);
  }, []);

  // Use imported formatDurationHuman for display
  const formatDuration = formatDurationHuman;

  const formatTimesheetTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateForAPI = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  };

  const loadData = useCallback(async () => {
    if (!window.electronAPI) return;
    setIsRefreshing(true);
    try {
      // Load reminders state
      const reminders = await window.electronAPI.getRemindersEnabled();
      setRemindersEnabled(reminders);

      // Load timer state
      const state = await window.electronAPI.getTimerState();
      setTimerState(state);

      // Load description and Jira issue from timer state
      if (state.description) {
        setDescription(state.description);
        setSavedDescription(state.description);
      }
      if (state.jiraIssue) {
        setSelectedJiraIssue(state.jiraIssue);
      }

      // Load customers
      const custs = await window.electronAPI.kimaiGetCustomers();
      setCustomers(custs);

      // Load favorite customer IDs from settings
      const settingsForFavorites = await window.electronAPI.getSettings();
      setFavoriteCustomerIds(settingsForFavorites.favoriteCustomerIds || []);

      // Load all projects
      const projs = await window.electronAPI.kimaiGetProjects();
      setAllProjects(projs);
      setConnectionStatus('connected');

      if (state.isRunning && state.projectId) {
        // Timer is running - load from timer state
        const proj = projs.find(p => p.id === state.projectId);
        setSelectedProject(proj || null);

        if (proj) {
          const cust = custs.find(c => c.id === proj.customer);
          setSelectedCustomer(cust || null);
          // Filter projects by customer
          setProjects(projs.filter(p => p.customer === proj.customer));
        }

        const acts = await window.electronAPI.kimaiGetActivities(state.projectId);
        setActivities(acts);

        if (state.activityId) {
          const act = acts.find(a => a.id === state.activityId);
          setSelectedActivity(act || null);
        }
      } else {
        // Timer not running - load defaults from settings if enabled
        const settings = await window.electronAPI.getSettings();
        if (settings.useDefaults) {
          if (settings.defaultCustomerId) {
            const cust = custs.find(c => c.id === settings.defaultCustomerId);
            if (cust) {
              setSelectedCustomer(cust);
              setProjects(projs.filter(p => p.customer === cust.id));
            }
          }
          if (settings.defaultProjectId) {
            const proj = projs.find(p => p.id === settings.defaultProjectId);
            setSelectedProject(proj || null);

            if (proj) {
              const acts = await window.electronAPI.kimaiGetActivities(settings.defaultProjectId);
              setActivities(acts);

              if (settings.defaultActivityId) {
                const act = acts.find(a => a.id === settings.defaultActivityId);
                setSelectedActivity(act || null);
              }
            }
          }
        } else {
          // Defaults disabled - clear selections
          setSelectedCustomer(null);
          setSelectedProject(null);
          setSelectedActivity(null);
          setProjects([]);
          setActivities([]);
        }
      }

      // Load today's timesheets
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const timesheets = await window.electronAPI.kimaiGetTimesheets({
        begin: formatDateForAPI(today),
      });

      setTodayTimesheets(timesheets.slice(0, MAX_RECENT_TIMESHEETS));

      // Calculate today's total
      const totalSeconds = timesheets.reduce((acc, ts) => acc + (ts.duration || 0), 0);
      setTodayTotal(totalSeconds);

      // Calculate week total
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekTimesheets = await window.electronAPI.kimaiGetTimesheets({
        begin: formatDateForAPI(weekStart),
      });
      const weekSeconds = weekTimesheets.reduce((acc, ts) => acc + (ts.duration || 0), 0);
      setWeekTotal(weekSeconds);

    } catch (error) {
      console.error('Failed to load data:', error);
      setConnectionStatus('disconnected');
    }

    // Load ActivityWatch summary
    try {
      const summary = await window.electronAPI.awGetActivitySummary(60);
      setActivitySummary(summary.slice(0, MAX_ACTIVITY_SUMMARY_ITEMS));
      setAwStatus('connected');
    } catch (error) {
      console.error('Failed to load AW summary:', error);
      setAwStatus('disconnected');
    }

    // Load Jira settings (but not issues - those are fetched when opening the picker)
    try {
      const settings = await window.electronAPI.getSettings();
      if (settings.jira?.enabled) {
        setJiraEnabled(true);
        setJiraAutoLogWorklog(settings.jira?.autoLogWorklog || false);
        setJiraStatus('connected');
      } else {
        setJiraEnabled(false);
        setJiraAutoLogWorklog(false);
        setJiraStatus('disabled');
      }
    } catch (error) {
      console.error('Failed to load Jira settings:', error);
      setJiraStatus('disconnected');
    }

    setIsRefreshing(false);
  }, []); // Empty dependency array - all setters are stable

  useEffect(() => {
    loadData();
    const interval = setInterval(updateElapsedTime, TIMER_UPDATE_INTERVAL_MS);
    const dataInterval = setInterval(loadData, DATA_REFRESH_INTERVAL_MS);

    // Listen for settings changes
    const unsubscribe = window.electronAPI?.onSettingsChanged?.(() => {
      loadData();
    });

    // Load update status
    window.electronAPI?.getUpdateStatus?.().then(setUpdateStatus);

    // Listen for update status changes
    const unsubscribeUpdate = window.electronAPI?.onUpdateStatusChanged?.((status) => {
      setUpdateStatus(status);
    });

    return () => {
      clearInterval(interval);
      clearInterval(dataInterval);
      unsubscribe?.();
      unsubscribeUpdate?.();
      // Clean up error timeout
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, [loadData]);

  // Keep ref in sync with state for interval access
  useEffect(() => {
    timerStateRef.current = timerState;
    updateElapsedTime();
  }, [timerState]);

  const formatSeconds = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const updateElapsedTime = () => {
    const currentState = timerStateRef.current;

    if (!currentState?.isRunning || !currentState.startTime) {
      setElapsedTime('00:00:00');
      setBilledTime('00:00:00');
      return;
    }

    const now = new Date();

    // Billed time (from Kimai's rounded start time)
    const billedStart = new Date(currentState.startTime);
    const billedSeconds = Math.floor((now.getTime() - billedStart.getTime()) / 1000);
    setBilledTime(formatSeconds(billedSeconds));

    // Actual time (from when user clicked Start, or fallback to billed)
    const actualSeconds = currentState.actualStartTime
      ? Math.floor((now.getTime() - new Date(currentState.actualStartTime).getTime()) / 1000)
      : billedSeconds;
    setElapsedTime(formatSeconds(actualSeconds));
  };

  const handleStartStop = async () => {
    if (!window.electronAPI || isTimerLoading) return;

    setIsTimerLoading(true);
    try {
      if (timerState?.isRunning) {
        // Store Jira issue before clearing state
        const jiraIssueToLog = selectedJiraIssue;
        const timerStartTime = timerState.startTime;

        await window.electronAPI.kimaiStopTimer();

        // Log to Jira if a ticket was linked and auto-log is enabled
        let jiraSuccess = true;
        if (jiraIssueToLog && timerStartTime && jiraEnabled && jiraAutoLogWorklog) {
          try {
            const startDate = new Date(timerStartTime);
            const endDate = new Date();
            let durationSeconds = Math.floor((endDate.getTime() - startDate.getTime()) / 1000);

            // Enforce minimum 15 minutes (same as Kimai)
            if (durationSeconds < 900) {
              durationSeconds = 900;
            }

            await window.electronAPI.jiraAddWorklog(
              jiraIssueToLog.key,
              durationSeconds,
              startDate.toISOString(),
              description || undefined
            );
          } catch (error) {
            console.error('Failed to log to Jira:', error);
            showError(`Failed to log time to Jira ${jiraIssueToLog.key}. Time was logged to Kimai only.`);
            jiraSuccess = false;
          }
        }

        // Only clear description/Jira issue if Jira logged successfully (or wasn't needed)
        if (jiraSuccess) {
          setDescription('');
          setSavedDescription('');
          setSelectedJiraIssue(null);
          window.electronAPI.setTimerJiraIssue(null);
        }
      } else if (selectedProject && selectedActivity) {
        await window.electronAPI.kimaiStartTimer(selectedProject.id, selectedActivity.id, description);
        setSavedDescription(description);

        // Transition Jira issue to "In Progress" if it's currently "To Do"
        if (selectedJiraIssue && selectedJiraIssue.fields.status.name.toLowerCase() === 'to do') {
          try {
            const result = await window.electronAPI.jiraTransitionToInProgress(selectedJiraIssue.key);
            if (result.success) {
              // Update the local issue status and persist to timer state
              const updatedIssue = {
                ...selectedJiraIssue,
                fields: {
                  ...selectedJiraIssue.fields,
                  status: { ...selectedJiraIssue.fields.status, name: 'In Progress' },
                },
              };
              setSelectedJiraIssue(updatedIssue);
              window.electronAPI.setTimerJiraIssue(updatedIssue);
            } else {
              console.warn('Failed to transition Jira issue:', result.message);
            }
          } catch (error) {
            console.error('Failed to transition Jira issue:', error);
          }
        }
      }
      await loadData();
    } catch (error) {
      console.error('Timer operation failed:', error);
    } finally {
      setIsTimerLoading(false);
    }
  };

  const handleDeleteTimesheet = async (id: number) => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.kimaiDeleteTimesheet(id);
      await loadData(); // Refresh the list
    } catch (error) {
      console.error('Failed to delete timesheet:', error);
      showError('Failed to delete time entry');
    }
  };

  const handleToggleReminders = async () => {
    if (!window.electronAPI) return;
    try {
      const enabled = await window.electronAPI.toggleReminders();
      setRemindersEnabled(enabled);
    } catch (error) {
      console.error('Failed to toggle reminders:', error);
    }
  };

  const handleUpdateDescription = async () => {
    if (!window.electronAPI || !timerState?.currentTimesheetId) return;
    setIsUpdatingDescription(true);
    try {
      await window.electronAPI.kimaiUpdateDescription(timerState.currentTimesheetId, description);
      setSavedDescription(description);
    } catch (error) {
      console.error('Failed to update description:', error);
      showError('Failed to update description');
    } finally {
      setIsUpdatingDescription(false);
    }
  };

  const handleSelectCustomer = async (customer: KimaiCustomer) => {
    setSelectedCustomer(customer);
    setSelectedProject(null);
    setSelectedActivity(null);
    const filteredProjects = allProjects.filter(p => p.customer === customer.id);
    setProjects(filteredProjects);
    setSearchQuery('');
    setView('projects');
  };

  const handleToggleFavoriteCustomer = async (customerId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.electronAPI) return;

    const newFavorites = favoriteCustomerIds.includes(customerId)
      ? favoriteCustomerIds.filter(id => id !== customerId)
      : [...favoriteCustomerIds, customerId];

    setFavoriteCustomerIds(newFavorites);

    // Save to settings
    try {
      const settings = await window.electronAPI.getSettings();
      settings.favoriteCustomerIds = newFavorites;
      await window.electronAPI.saveSettings(settings);
    } catch (error) {
      console.error('Failed to save favorite:', error);
    }
  };

  const handleSelectProject = async (project: KimaiProject) => {
    if (!window.electronAPI) return;
    setSelectedProject(project);
    setSelectedActivity(null);
    try {
      const acts = await window.electronAPI.kimaiGetActivities(project.id);
      setActivities(acts);
    } catch (error) {
      console.error('Failed to load activities:', error);
      showError('Failed to load activities');
      setActivities([]);
    }
    setSearchQuery('');
    setView('activities');
  };

  const handleSelectActivity = (activity: KimaiActivity) => {
    setSelectedActivity(activity);
    setSearchQuery('');
    setView('main');
  };

  const handleSelectJiraIssue = async (issue: JiraIssue) => {
    setSelectedJiraIssue(issue);
    // Always set description from Jira ticket
    setDescription(`${issue.key}: ${issue.fields.summary}`);
    setJiraSearchQuery('');

    // Always try to match and set customer/project/activity from Jira ticket
    if (customers.length > 0) {
      // Try to match customfield_10278 (customer field) first
      const jiraCustomerName = (issue.fields.customfield_10278 as { value?: string } | undefined)?.value;
      const jiraProjectName = issue.fields.project?.name;

      let matchedCustomer: KimaiCustomer | undefined;

      // Helper to find best matching customer (prefers longer names for more specific matches)
      const findBestMatch = (searchTerm: string): KimaiCustomer | undefined => {
        const term = searchTerm.toLowerCase();
        // First try exact match
        const exact = customers.find(c => c.name.toLowerCase() === term);
        if (exact) return exact;

        // Find all partial matches and pick the longest (most specific)
        const partialMatches = customers.filter(c =>
          c.name.toLowerCase().includes(term) || term.includes(c.name.toLowerCase())
        );
        if (partialMatches.length > 0) {
          // Sort by name length descending, pick longest
          return partialMatches.sort((a, b) => b.name.length - a.name.length)[0];
        }
        return undefined;
      };

      // First try to match customfield_10278 (customer field)
      if (jiraCustomerName) {
        matchedCustomer = findBestMatch(jiraCustomerName);
      }

      // Fallback to project name
      if (!matchedCustomer && jiraProjectName) {
        matchedCustomer = findBestMatch(jiraProjectName);
      }

      // Set the matched customer and load projects
      if (matchedCustomer) {
        setSelectedCustomer(matchedCustomer);
        const filteredProjects = allProjects.filter(p => p.customer === matchedCustomer.id);
        setProjects(filteredProjects);

        // Auto-select project: prefer "Regiewerk", otherwise first if only one
        let selectedProj: KimaiProject | null = null;
        if (filteredProjects.length === 1) {
          selectedProj = filteredProjects[0];
        } else if (filteredProjects.length > 1) {
          // Try to find "Regiewerk" project
          const regiewerkProject = filteredProjects.find(p =>
            p.name.toLowerCase() === 'regiewerk' ||
            p.name.toLowerCase().includes('regiewerk')
          );
          selectedProj = regiewerkProject || null;
        }

        if (selectedProj) {
          setSelectedProject(selectedProj);

          // Load activities for this project
          if (window.electronAPI) {
            try {
              const acts = await window.electronAPI.kimaiGetActivities(selectedProj.id);
              setActivities(acts);

              // Auto-select activity: prefer "werk"/"work", otherwise first if only one
              if (acts.length === 1) {
                setSelectedActivity(acts[0]);
              } else if (acts.length > 1) {
                // Try to find a "work" activity
                const workActivity = acts.find(a =>
                  a.name.toLowerCase() === 'werk' ||
                  a.name.toLowerCase() === 'work' ||
                  a.name.toLowerCase().includes('werk') ||
                  a.name.toLowerCase().includes('work')
                );
                setSelectedActivity(workActivity || null);
              } else {
                setSelectedActivity(null);
              }
            } catch (error) {
              console.error('Failed to load activities:', error);
              setActivities([]);
              setSelectedActivity(null);
            }
          }
        } else {
          setSelectedProject(null);
          setSelectedActivity(null);
          setActivities([]);
        }
      } else {
        // No matching customer found - clear selections and show notification
        setSelectedCustomer(null);
        setSelectedProject(null);
        setSelectedActivity(null);
        setProjects([]);
        setActivities([]);

        // Show desktop notification about missing customer
        const customerFieldValue = (issue.fields.customfield_10278 as { value?: string } | undefined)?.value;
        const projectName = issue.fields.project?.name;
        const searchedValue = customerFieldValue || projectName || 'unknown';
        window.electronAPI?.showNotification(
          'No Customer Found',
          `Could not find a matching customer for "${searchedValue}". Please select customer/project manually.`
        );
      }
    }

    // Save Jira issue to timer state so it persists across navigation
    window.electronAPI?.setTimerJiraIssue(issue);

    setView('main');
  };

  const clearJiraIssue = () => {
    setSelectedJiraIssue(null);
    window.electronAPI?.setTimerJiraIssue(null);
  };

  const openSettings = () => {
    window.electronAPI?.openSettings();
  };

  const openTimeEntry = () => {
    window.electronAPI?.openTimeEntry();
  };

  const getProjectName = (projectId: number) => {
    const proj = allProjects.find(p => p.id === projectId);
    return proj?.name || 'Unknown';
  };

  // Filtered lists based on search query
  const filteredCustomers = useMemo(() => {
    let filtered = customers;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = customers.filter(c => c.name.toLowerCase().includes(query));
    }
    return filtered;
  }, [customers, searchQuery]);

  // Separate favorite and non-favorite customers
  const { favoriteCustomers, otherCustomers } = useMemo(() => {
    const favorites = filteredCustomers.filter(c => favoriteCustomerIds.includes(c.id));
    const others = filteredCustomers.filter(c => !favoriteCustomerIds.includes(c.id));
    return { favoriteCustomers: favorites, otherCustomers: others };
  }, [filteredCustomers, favoriteCustomerIds]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery) return projects;
    const query = searchQuery.toLowerCase();
    return projects.filter(p => p.name.toLowerCase().includes(query));
  }, [projects, searchQuery]);

  const filteredActivities = useMemo(() => {
    if (!searchQuery) return activities;
    const query = searchQuery.toLowerCase();
    return activities.filter(a => a.name.toLowerCase().includes(query));
  }, [activities, searchQuery]);

  const filteredJiraIssues = useMemo(() => {
    if (!jiraSearchQuery) return jiraIssues;
    const query = jiraSearchQuery.toLowerCase();
    return jiraIssues.filter(issue =>
      issue.key.toLowerCase().includes(query) ||
      issue.fields.summary.toLowerCase().includes(query)
    );
  }, [jiraIssues, jiraSearchQuery]);

  // Customers list view with search
  if (view === 'customers') {
    return (
      <div className="w-full bg-background overflow-hidden">
        <div className="p-3 border-b border-border bg-muted/30">
          <button
            onClick={() => { setView('main'); setSearchQuery(''); }}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            ← Back
          </button>
          <h3 className="font-semibold mt-1">Select Customer</h3>
        </div>
        {/* Search Input */}
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm bg-background border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredCustomers.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              {searchQuery ? 'No matching customers' : 'No customers available'}
            </div>
          ) : (
            <>
              {/* Favorites Section */}
              {favoriteCustomers.length > 0 && (
                <>
                  <div className="px-4 py-2 text-xs font-medium text-muted-foreground flex items-center gap-1 bg-muted/30">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    Favorites
                  </div>
                  {favoriteCustomers.map((customer) => (
                    <div
                      key={customer.id}
                      className={`w-full px-4 py-3 hover:bg-accent flex items-center justify-between border-b border-border/50 ${selectedCustomer?.id === customer.id ? 'bg-accent' : ''}`}
                    >
                      <button
                        onClick={() => handleSelectCustomer(customer)}
                        className="flex items-center gap-2 flex-1 text-left"
                      >
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{customer.name}</span>
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => handleToggleFavoriteCustomer(customer.id, e)}
                          className="p-1 hover:bg-muted rounded"
                          title="Remove from favorites"
                        >
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        </button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </>
              )}
              {/* Other Customers Section */}
              {otherCustomers.length > 0 && (
                <>
                  {favoriteCustomers.length > 0 && (
                    <div className="px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/30">
                      All Customers
                    </div>
                  )}
                  {otherCustomers.map((customer) => (
                    <div
                      key={customer.id}
                      className={`w-full px-4 py-3 hover:bg-accent flex items-center justify-between border-b border-border/50 last:border-0 ${selectedCustomer?.id === customer.id ? 'bg-accent' : ''}`}
                    >
                      <button
                        onClick={() => handleSelectCustomer(customer)}
                        className="flex items-center gap-2 flex-1 text-left"
                      >
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{customer.name}</span>
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => handleToggleFavoriteCustomer(customer.id, e)}
                          className="p-1 hover:bg-muted rounded"
                          title="Add to favorites"
                        >
                          <Star className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Projects list view with search
  if (view === 'projects') {
    return (
      <div className="w-full bg-background overflow-hidden">
        <div className="p-3 border-b border-border bg-muted/30">
          <button
            onClick={() => { setView('customers'); setSearchQuery(''); }}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            ← Back
          </button>
          <h3 className="font-semibold mt-1">Select Project</h3>
          {selectedCustomer && (
            <p className="text-xs text-muted-foreground">{selectedCustomer.name}</p>
          )}
        </div>
        {/* Search Input */}
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm bg-background border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {filteredProjects.map((project) => (
            <button
              key={project.id}
              onClick={() => handleSelectProject(project)}
              className={`w-full px-4 py-3 text-left hover:bg-accent flex items-center justify-between border-b border-border/50 last:border-0 ${selectedProject?.id === project.id ? 'bg-accent' : ''}`}
            >
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <span className="text-sm">{project.name}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
          {filteredProjects.length === 0 && (
            <div className="p-4 text-center text-muted-foreground text-sm">
              {searchQuery ? 'No matching projects' : 'No projects available'}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Activities list view with search
  if (view === 'activities') {
    return (
      <div className="w-full bg-background overflow-hidden">
        <div className="p-3 border-b border-border bg-muted/30">
          <button
            onClick={() => { setView('projects'); setSearchQuery(''); }}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            ← Back
          </button>
          <h3 className="font-semibold mt-1">Select Activity</h3>
          <p className="text-xs text-muted-foreground">{selectedProject?.name}</p>
        </div>
        {/* Search Input */}
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search activities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm bg-background border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {filteredActivities.map((activity) => (
            <button
              key={activity.id}
              onClick={() => handleSelectActivity(activity)}
              className={`w-full px-4 py-3 text-left hover:bg-accent flex items-center justify-between border-b border-border/50 last:border-0 ${selectedActivity?.id === activity.id ? 'bg-accent' : ''}`}
            >
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm truncate">{activity.name}</span>
              </div>
              {selectedActivity?.id === activity.id && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </button>
          ))}
          {filteredActivities.length === 0 && (
            <div className="p-4 text-center text-muted-foreground text-sm">
              {searchQuery ? 'No matching activities' : 'No activities available'}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Jira issues list view with search
  if (view === 'jira') {
    return (
      <div className="w-full bg-background overflow-hidden">
        <div className="p-3 border-b border-border bg-muted/30">
          <button
            onClick={() => { setView('main'); setJiraSearchQuery(''); }}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            ← Back
          </button>
          <h3 className="font-semibold mt-1">Select Jira Ticket</h3>
          <p className="text-xs text-muted-foreground">Your assigned issues</p>
        </div>
        {/* Search Input */}
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tickets..."
              value={jiraSearchQuery}
              onChange={(e) => setJiraSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm bg-background border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              autoFocus
            />
            {jiraSearchQuery && (
              <button
                onClick={() => setJiraSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {filteredJiraIssues.map((issue) => (
            <button
              key={issue.id}
              onClick={() => handleSelectJiraIssue(issue)}
              className={`w-full px-4 py-3 text-left hover:bg-accent border-b border-border/50 last:border-0 ${selectedJiraIssue?.id === issue.id ? 'bg-accent' : ''}`}
            >
              <div className="flex items-center gap-2">
                <Ticket className="h-4 w-4 text-blue-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-medium text-blue-600">{issue.key}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {issue.fields.status.name}
                    </span>
                    {issue.fields.timetracking?.originalEstimate && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                        {issue.fields.timetracking.originalEstimate}
                      </span>
                    )}
                  </div>
                  <div className="text-sm truncate mt-0.5">{issue.fields.summary}</div>
                </div>
              </div>
            </button>
          ))}
          {filteredJiraIssues.length === 0 && (
            <div className="p-4 text-center text-muted-foreground text-sm">
              {jiraSearchQuery ? 'No matching tickets' : 'No assigned tickets'}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main view - comprehensive
  return (
    <div className="w-full h-screen bg-background flex flex-col overflow-hidden relative">
      {/* Error Toast */}
      {errorMessage && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
            <span className="text-xs text-red-600 truncate">{errorMessage}</span>
          </div>
          <button
            onClick={dismissError}
            className="p-0.5 hover:bg-red-500/20 rounded flex-shrink-0"
            aria-label="Dismiss error"
          >
            <X className="h-3 w-3 text-red-500" />
          </button>
        </div>
      )}

      {/* Status Bar */}
      <div className="px-3 py-2 border-b border-border bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={openSettings}
              className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md border border-border flex items-center gap-1.5"
            >
              <Settings className="h-3.5 w-3.5" />
              Settings
            </button>
            {remindersEnabled && !timerState?.isRunning && (
              <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-600 rounded animate-pulse">
                Not tracking!
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // Cycle through: system -> light -> dark -> system
                const nextMode: ThemeMode = themeMode === 'system' ? 'light' : themeMode === 'light' ? 'dark' : 'system';
                handleThemeModeChange(nextMode);
              }}
              className="p-1.5 hover:bg-muted rounded border border-border"
              title={`Theme: ${themeMode} (click to change)`}
            >
              {themeMode === 'system' ? (
                <Laptop className="h-4 w-4 text-muted-foreground" />
              ) : themeMode === 'dark' ? (
                <Moon className="h-4 w-4 text-blue-500" />
              ) : (
                <Sun className="h-4 w-4 text-yellow-500" />
              )}
            </button>
            <button
              onClick={handleToggleReminders}
              className={`p-1.5 rounded border ${remindersEnabled ? 'text-primary border-primary/50 bg-primary/10' : 'text-muted-foreground border-border hover:bg-muted'}`}
              title={remindersEnabled ? 'Reminders on - click to disable' : 'Reminders off - click to enable'}
            >
              {remindersEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </button>
            <button
              onClick={loadData}
              disabled={isRefreshing}
              className="p-1.5 hover:bg-muted rounded border border-border"
              aria-label="Refresh data"
            >
              <RefreshCw className={`h-4 w-4 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <div className="flex items-center gap-1.5 ml-1">
              <div title={`Kimai: ${connectionStatus}`} className={`h-2.5 w-2.5 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : connectionStatus === 'disconnected' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
              <div title={`ActivityWatch: ${awStatus}`} className={`h-2.5 w-2.5 rounded-full ${awStatus === 'connected' ? 'bg-blue-500' : awStatus === 'disabled' ? 'bg-gray-400' : 'bg-red-500'}`} />
              {jiraEnabled && (
                <div title={`Jira: ${jiraStatus}`} className={`h-2.5 w-2.5 rounded-full ${jiraStatus === 'connected' ? 'bg-purple-500' : jiraStatus === 'disabled' ? 'bg-gray-400' : 'bg-red-500'}`} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Timer Display */}
      <div className="p-4 text-center border-b border-border bg-gradient-to-b from-background to-muted/20">
        <div className={`text-4xl font-mono font-bold tracking-wider ${timerState?.isRunning ? 'text-primary' : 'text-muted-foreground'}`}>
          {elapsedTime}
        </div>
        {timerState?.isRunning && elapsedTime !== billedTime && (
          <div
            className="text-sm font-mono text-muted-foreground mt-1 cursor-help"
            title="Kimai rounds start time down to the nearest 15 minutes"
          >
            Billed: {billedTime}
          </div>
        )}
        <div className="flex items-center justify-center gap-1 mt-2">
          <div className={`h-2 w-2 rounded-full ${timerState?.isRunning ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30'}`} />
          <p className="text-xs text-muted-foreground">
            {timerState?.isRunning ? 'Timer running' : 'Timer stopped'}
          </p>
        </div>

        {/* Current Selection Info */}
        {(selectedProject || selectedActivity || selectedCustomer) && (
          <div className="mt-3 p-2 bg-muted/50 rounded-lg text-left">
            {selectedCustomer && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Briefcase className="h-3 w-3" />
                <span className="truncate">{selectedCustomer.name}</span>
              </div>
            )}
            {selectedProject && (
              <div className="flex items-center gap-2 text-xs mt-1">
                <Layers className="h-3 w-3 text-primary" />
                <span className="truncate font-medium">{selectedProject.name}</span>
              </div>
            )}
            {selectedActivity && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <Activity className="h-3 w-3" />
                <span className="truncate">{selectedActivity.name}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Today's Stats */}
      <div className="grid grid-cols-2 gap-px bg-border">
        <div className="bg-background p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
            <Calendar className="h-3 w-3" />
            <span className="text-xs">Today</span>
          </div>
          <div className="text-lg font-semibold text-foreground">
            {formatDuration(todayTotal)}
          </div>
        </div>
        <div className="bg-background p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
            <TrendingUp className="h-3 w-3" />
            <span className="text-xs">This Week</span>
          </div>
          <div className="text-lg font-semibold text-foreground">
            {formatDuration(weekTotal)}
          </div>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-auto">
        {/* Customer/Project/Activity Selection */}
        <div className="p-2 border-t border-border space-y-1">
        <button
          onClick={() => setView('customers')}
          className="w-full px-3 py-2 text-left bg-muted/50 hover:bg-muted rounded-md flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm truncate">
              {selectedCustomer ? selectedCustomer.name : 'Select customer...'}
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>

        <button
          onClick={() => selectedCustomer && setView('projects')}
          disabled={!selectedCustomer}
          className="w-full px-3 py-2 text-left bg-muted/50 hover:bg-muted rounded-md flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm truncate">
              {selectedProject ? selectedProject.name : 'Select project...'}
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>

        <button
          onClick={() => selectedProject && setView('activities')}
          disabled={!selectedProject}
          className="w-full px-3 py-2 text-left bg-muted/50 hover:bg-muted rounded-md flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm truncate">
              {selectedActivity ? selectedActivity.name : 'Select activity...'}
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Jira Ticket Selection */}
        {jiraEnabled && (
          <div className="mt-1">
            {selectedJiraIssue ? (
              <div className="px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Ticket className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-mono font-medium text-blue-600">{selectedJiraIssue.key}</span>
                      <span className="text-xs text-muted-foreground ml-2 truncate">{selectedJiraIssue.fields.summary}</span>
                    </div>
                  </div>
                  <button
                    onClick={clearJiraIssue}
                    disabled={timerState?.isRunning}
                    className="p-1 hover:bg-muted rounded disabled:opacity-50"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
                {selectedJiraIssue.fields.timetracking?.originalEstimate && (
                  <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
                    <Timer className="h-3 w-3" />
                    <span>Estimate: {selectedJiraIssue.fields.timetracking.originalEstimate}</span>
                    {selectedJiraIssue.fields.timetracking.remainingEstimate &&
                      selectedJiraIssue.fields.timetracking.remainingEstimate !== selectedJiraIssue.fields.timetracking.originalEstimate && (
                      <span className="text-yellow-600">({selectedJiraIssue.fields.timetracking.remainingEstimate} remaining)</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={async () => {
                  // Fetch Jira issues when opening the picker
                  if (window.electronAPI) {
                    try {
                      const issues = await window.electronAPI.jiraGetMyIssues(MAX_JIRA_ISSUES);
                      setJiraIssues(issues);
                    } catch (error) {
                      console.error('Failed to fetch Jira issues:', error);
                    }
                  }
                  setView('jira');
                }}
                disabled={timerState?.isRunning}
                className="w-full px-3 py-2 text-left bg-muted/50 hover:bg-muted rounded-md flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2">
                  <Ticket className="h-4 w-4 text-blue-500" />
                  <span className="text-sm text-muted-foreground">Link Jira ticket...</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        )}

        {/* Description Input */}
        <div className="mt-1">
          <textarea
            placeholder="What are you working on?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm bg-background border-2 border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder:text-muted-foreground/60 resize-none"
          />
          {/* Update button when description is dirty while timer is running */}
          {timerState?.isRunning && description !== savedDescription && (
            <Button
              onClick={handleUpdateDescription}
              disabled={isUpdatingDescription}
              variant="secondary"
              size="sm"
              className="mt-1 w-full"
            >
              {isUpdatingDescription ? (
                <>
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Description'
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Start/Stop Button */}
      <div className="px-2 pb-2">
        <Button
          onClick={handleStartStop}
          disabled={isTimerLoading || (!timerState?.isRunning && (!selectedProject || !selectedActivity))}
          className={`w-full ${timerState?.isRunning ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
          size="lg"
        >
          {isTimerLoading ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              {timerState?.isRunning ? 'Stopping...' : 'Starting...'}
            </>
          ) : timerState?.isRunning ? (
            <>
              <Square className="h-4 w-4 mr-2" />
              Stop Timer
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Start Timer
            </>
          )}
        </Button>
      </div>

      </div>

      {/* Recent Entries Panel */}
      {recentEntriesOpen && (
        <div className="absolute inset-0 bg-background z-10 flex flex-col">
          <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Recent Entries</span>
            </div>
            <button
              onClick={() => setRecentEntriesOpen(false)}
              className="p-1 hover:bg-muted rounded"
              title="Close"
            >
              <PanelRightClose className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {todayTimesheets.length > 0 ? (
              todayTimesheets.map((ts) => (
                <div key={ts.id} className="px-3 py-3 border-b border-border/50 last:border-0 flex items-center justify-between group">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{ts.description || getProjectName(ts.project)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatTimesheetTime(ts.begin)}
                      {ts.end && ` - ${formatTimesheetTime(ts.end)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-mono text-primary">
                      {ts.duration ? formatDuration(ts.duration) : '--'}
                    </div>
                    <button
                      onClick={() => handleDeleteTimesheet(ts.id)}
                      className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition-opacity"
                      title="Delete entry"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No entries today
              </div>
            )}
          </div>
        </div>
      )}

      {/* ActivityWatch Panel */}
      {activityPanelOpen && (
        <div className="absolute inset-0 bg-background z-10 flex flex-col">
          <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Activity (Last Hour)</span>
            </div>
            <button
              onClick={() => setActivityPanelOpen(false)}
              className="p-1 hover:bg-muted rounded"
              title="Close"
            >
              <PanelRightClose className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {activitySummary.length > 0 ? (
              activitySummary.map((item) => (
                <div key={`${item.app}:${item.title}`} className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <Zap className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{item.title || item.app}</div>
                      <div className="text-xs text-muted-foreground truncate">{item.app}</div>
                    </div>
                  </div>
                  <span className="text-sm font-mono text-muted-foreground flex-shrink-0">
                    {formatDuration(item.duration)}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No activity recorded
              </div>
            )}
          </div>
        </div>
      )}

      {/* Update Available Banner */}
      {updateStatus.status === 'ready' && (
        <div className="px-3 py-2 bg-green-500/10 border-t border-green-500/30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-green-600" />
            <span className="text-xs text-green-700">
              Update {updateStatus.version || 'available'}
            </span>
          </div>
          <button
            onClick={() => window.electronAPI?.quitAndInstall()}
            className="px-2 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700"
          >
            Update Now
          </button>
        </div>
      )}
      {updateStatus.status === 'downloading' && (
        <div className="px-3 py-2 bg-blue-500/10 border-t border-blue-500/30 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
          <span className="text-xs text-blue-700">Downloading update...</span>
        </div>
      )}

      {/* Quick Actions */}
      <div className="p-2 border-t border-border flex flex-col gap-1">
        <div className="flex gap-1">
          <button
            onClick={() => setRecentEntriesOpen(true)}
            className={`flex-1 px-2 py-2 text-xs rounded-md flex items-center justify-center gap-1 ${todayTimesheets.length > 0 ? 'text-muted-foreground hover:text-foreground hover:bg-muted' : 'text-muted-foreground/50 cursor-not-allowed'}`}
            disabled={todayTimesheets.length === 0}
          >
            <FileText className="h-3 w-3" />
            Recent Entries
          </button>
          <button
            onClick={() => setActivityPanelOpen(true)}
            className={`flex-1 px-2 py-2 text-xs rounded-md flex items-center justify-center gap-1 ${activitySummary.length > 0 ? 'text-muted-foreground hover:text-foreground hover:bg-muted' : 'text-muted-foreground/50 cursor-not-allowed'}`}
            disabled={activitySummary.length === 0}
          >
            <Monitor className="h-3 w-3" />
            Activity
          </button>
        </div>
        <div className="flex gap-1">
        <button
          onClick={openTimeEntry}
          className="flex-1 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md flex items-center justify-center gap-1"
        >
          <Plus className="h-3 w-3" />
          Manual Entry
        </button>
        <button
          onClick={() => window.electronAPI?.openTimeRounding()}
          className="px-2 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md flex items-center justify-center"
          title="Time Rounding Info"
        >
          <Clock className="h-3 w-3" />
        </button>
        <button
          onClick={() => window.electronAPI?.openChangelog()}
          className="px-2 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md flex items-center justify-center"
          title="Changelog"
        >
          <ScrollText className="h-3 w-3" />
        </button>
        <button
          onClick={() => window.electronAPI?.openDebug()}
          className="px-2 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md flex items-center justify-center"
          title="Debug"
        >
          <Bug className="h-3 w-3" />
        </button>
        </div>
      </div>
    </div>
  );
}
