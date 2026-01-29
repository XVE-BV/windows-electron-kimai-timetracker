import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Play, Square, Settings, Plus, Activity, ChevronRight, Timer,
  Calendar, TrendingUp, Zap, CheckCircle2, XCircle, RefreshCw, Coffee,
  Monitor, Layers, Briefcase, FileText, Search, X, Users, Ticket, Trash2
} from 'lucide-react';
import { Button } from './ui/button';
import { TimerState, KimaiProject, KimaiActivity, KimaiTimesheet, KimaiCustomer, JiraIssue, AppSettings } from '../types';

interface ActivitySummaryItem {
  app: string;
  title: string;
  duration: number;
}

export function TrayView() {
  const [timerState, setTimerState] = useState<TimerState | null>(null);
  const timerStateRef = useRef<TimerState | null>(null);
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
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
  const [awStatus, setAwStatus] = useState<'connected' | 'disconnected' | 'disabled'>('checking' as any);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [description, setDescription] = useState('');

  // Jira state
  const [jiraEnabled, setJiraEnabled] = useState(false);
  const [jiraIssues, setJiraIssues] = useState<JiraIssue[]>([]);
  const [selectedJiraIssue, setSelectedJiraIssue] = useState<JiraIssue | null>(null);
  const [jiraStatus, setJiraStatus] = useState<'connected' | 'disconnected' | 'disabled'>('disabled');
  const [jiraSearchQuery, setJiraSearchQuery] = useState('');

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

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
      // Load timer state
      const state = await window.electronAPI.getTimerState() as TimerState;
      setTimerState(state);

      // Load description from running timer
      if (state.isRunning && state.description) {
        setDescription(state.description);
      }

      // Load customers
      const custs = await window.electronAPI.kimaiGetCustomers() as KimaiCustomer[];
      setCustomers(custs);

      // Load all projects
      const projs = await window.electronAPI.kimaiGetProjects() as KimaiProject[];
      setAllProjects(projs);
      setConnectionStatus('connected');

      if (state.projectId) {
        const proj = projs.find(p => p.id === state.projectId);
        setSelectedProject(proj || null);

        if (proj) {
          const cust = custs.find(c => c.id === proj.customer);
          setSelectedCustomer(cust || null);
          // Filter projects by customer
          setProjects(projs.filter(p => p.customer === proj.customer));
        }

        const acts = await window.electronAPI.kimaiGetActivities(state.projectId) as KimaiActivity[];
        setActivities(acts);

        if (state.activityId) {
          const act = acts.find(a => a.id === state.activityId);
          setSelectedActivity(act || null);
        }
      }

      // Load today's timesheets
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const timesheets = await window.electronAPI.kimaiGetTimesheets({
        begin: formatDateForAPI(today),
      }) as KimaiTimesheet[];

      setTodayTimesheets(timesheets.slice(0, 5)); // Last 5 entries

      // Calculate today's total
      const totalSeconds = timesheets.reduce((acc, ts) => acc + (ts.duration || 0), 0);
      setTodayTotal(totalSeconds);

      // Calculate week total
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekTimesheets = await window.electronAPI.kimaiGetTimesheets({
        begin: formatDateForAPI(weekStart),
      }) as KimaiTimesheet[];
      const weekSeconds = weekTimesheets.reduce((acc, ts) => acc + (ts.duration || 0), 0);
      setWeekTotal(weekSeconds);

    } catch (error) {
      console.error('Failed to load data:', error);
      setConnectionStatus('disconnected');
    }

    // Load ActivityWatch summary
    try {
      const summary = await window.electronAPI.awGetActivitySummary(60) as ActivitySummaryItem[];
      setActivitySummary(summary.slice(0, 4));
      setAwStatus('connected');
    } catch (error) {
      console.error('Failed to load AW summary:', error);
      setAwStatus('disconnected');
    }

    // Load Jira issues if enabled
    try {
      const settings = await window.electronAPI.getSettings() as AppSettings;
      if (settings.jira?.enabled) {
        setJiraEnabled(true);
        const issues = await window.electronAPI.jiraGetMyIssues(10) as JiraIssue[];
        setJiraIssues(issues);
        setJiraStatus('connected');
      } else {
        setJiraEnabled(false);
        setJiraStatus('disabled');
      }
    } catch (error) {
      console.error('Failed to load Jira issues:', error);
      if (jiraEnabled) {
        setJiraStatus('disconnected');
      }
    }

    setIsRefreshing(false);
  }, [jiraEnabled]);

  useEffect(() => {
    loadData();
    const interval = setInterval(updateElapsedTime, 1000);
    const dataInterval = setInterval(loadData, 60000); // Refresh data every minute
    return () => {
      clearInterval(interval);
      clearInterval(dataInterval);
    };
  }, [loadData]);

  // Keep ref in sync with state for interval access
  useEffect(() => {
    timerStateRef.current = timerState;
    updateElapsedTime();
  }, [timerState]);

  const updateElapsedTime = () => {
    const currentState = timerStateRef.current;
    if (!currentState?.isRunning || !currentState.startTime) {
      setElapsedTime('00:00:00');
      return;
    }

    const start = new Date(currentState.startTime);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - start.getTime()) / 1000);

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    setElapsedTime(
      `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    );
  };

  const handleStartStop = async () => {
    if (!window.electronAPI) return;
    if (timerState?.isRunning) {
      // Store Jira issue before clearing state
      const jiraIssueToLog = selectedJiraIssue;
      const timerStartTime = timerState.startTime;

      await window.electronAPI.kimaiStopTimer();

      // Log to Jira if a ticket was linked
      if (jiraIssueToLog && timerStartTime && jiraEnabled) {
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
          console.log(`Logged ${durationSeconds}s to Jira ${jiraIssueToLog.key}`);
        } catch (error) {
          console.error('Failed to log to Jira:', error);
        }
      }

      setDescription(''); // Clear description after stopping
      setSelectedJiraIssue(null); // Clear Jira issue after stopping
    } else if (selectedProject && selectedActivity) {
      await window.electronAPI.kimaiStartTimer(selectedProject.id, selectedActivity.id, description);
    }
    loadData();
  };

  const handleDeleteTimesheet = async (id: number) => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.kimaiDeleteTimesheet(id);
      loadData(); // Refresh the list
    } catch (error) {
      console.error('Failed to delete timesheet:', error);
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

  const handleSelectProject = async (project: KimaiProject) => {
    if (!window.electronAPI) return;
    setSelectedProject(project);
    setSelectedActivity(null);
    const acts = await window.electronAPI.kimaiGetActivities(project.id) as KimaiActivity[];
    setActivities(acts);
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
    // Prefill description if empty
    if (!description) {
      setDescription(`${issue.key}: ${issue.fields.summary}`);
    }
    setJiraSearchQuery('');

    // Auto-select customer if none selected
    if (!selectedCustomer && customers.length > 0) {
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

      // Auto-select the matched customer, project, and activity
      if (matchedCustomer) {
        setSelectedCustomer(matchedCustomer);
        const filteredProjects = allProjects.filter(p => p.customer === matchedCustomer.id);
        setProjects(filteredProjects);

        // Auto-select project matching "regiewerk"
        const matchedProject = filteredProjects.find(p =>
          p.name.toLowerCase().includes('regiewerk')
        );
        if (matchedProject) {
          setSelectedProject(matchedProject);

          // Load activities for this project and auto-select one matching "werk"
          if (window.electronAPI) {
            try {
              const acts = await window.electronAPI.kimaiGetActivities(matchedProject.id) as KimaiActivity[];
              setActivities(acts);

              const matchedActivity = acts.find(a =>
                a.name.toLowerCase().includes('werk')
              );
              if (matchedActivity) {
                setSelectedActivity(matchedActivity);
              }
            } catch (error) {
              console.error('Failed to load activities:', error);
            }
          }
        }
      }
    }

    setView('main');
  };

  const clearJiraIssue = () => {
    setSelectedJiraIssue(null);
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

  const getActivityName = (activityId: number) => {
    // Note: activities are loaded when a project is selected
    // For timesheets, we might need to cache activities globally
    return activities.find(a => a.id === activityId)?.name || '';
  };

  // Filtered lists based on search query
  const filteredCustomers = useMemo(() => {
    if (!searchQuery) return customers;
    const query = searchQuery.toLowerCase();
    return customers.filter(c => c.name.toLowerCase().includes(query));
  }, [customers, searchQuery]);

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
      <div className="w-full bg-background border border-border rounded-lg shadow-2xl overflow-hidden">
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
              className="w-full pl-9 pr-8 py-2 text-sm bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
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
          {filteredCustomers.map((customer) => (
            <button
              key={customer.id}
              onClick={() => handleSelectCustomer(customer)}
              className={`w-full px-4 py-3 text-left hover:bg-accent flex items-center justify-between border-b border-border/50 last:border-0 ${selectedCustomer?.id === customer.id ? 'bg-accent' : ''}`}
            >
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{customer.name}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
          {filteredCustomers.length === 0 && (
            <div className="p-4 text-center text-muted-foreground text-sm">
              {searchQuery ? 'No matching customers' : 'No customers available'}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Projects list view with search
  if (view === 'projects') {
    return (
      <div className="w-full bg-background border border-border rounded-lg shadow-2xl overflow-hidden">
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
              className="w-full pl-9 pr-8 py-2 text-sm bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
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
      <div className="w-full bg-background border border-border rounded-lg shadow-2xl overflow-hidden">
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
              className="w-full pl-9 pr-8 py-2 text-sm bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
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
      <div className="w-full bg-background border border-border rounded-lg shadow-2xl overflow-hidden">
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
              className="w-full pl-9 pr-8 py-2 text-sm bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
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
    <div className="w-full bg-background border border-border rounded-lg shadow-2xl overflow-hidden">
      {/* Header with Status */}
      <div className="p-3 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/20 rounded-md">
              <Timer className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-sm">Kimai Tracker</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={isRefreshing}
              className="p-1 hover:bg-muted rounded"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <div className="flex items-center gap-1">
              <div title={`Kimai: ${connectionStatus}`} className={`h-2 w-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : connectionStatus === 'disconnected' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
              <div title={`ActivityWatch: ${awStatus}`} className={`h-2 w-2 rounded-full ${awStatus === 'connected' ? 'bg-blue-500' : awStatus === 'disabled' ? 'bg-gray-400' : 'bg-red-500'}`} />
            </div>
          </div>
        </div>
      </div>

      {/* Timer Display */}
      <div className="p-4 text-center border-b border-border bg-gradient-to-b from-background to-muted/20">
        <div className={`text-4xl font-mono font-bold tracking-wider ${timerState?.isRunning ? 'text-primary' : 'text-muted-foreground'}`}>
          {elapsedTime}
        </div>
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
                onClick={() => setView('jira')}
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
          <input
            type="text"
            placeholder="What are you working on?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={timerState?.isRunning}
            className="w-full px-3 py-2 text-sm bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      {/* Start/Stop Button */}
      <div className="px-2 pb-2">
        <Button
          onClick={handleStartStop}
          disabled={!timerState?.isRunning && (!selectedProject || !selectedActivity)}
          className={`w-full ${timerState?.isRunning ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
          size="lg"
        >
          {timerState?.isRunning ? (
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

      {/* Recent Entries */}
      {todayTimesheets.length > 0 && (
        <div className="border-t border-border">
          <div className="px-3 py-2 bg-muted/30 flex items-center gap-2">
            <FileText className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Recent Entries</span>
          </div>
          <div className="max-h-28 overflow-y-auto">
            {todayTimesheets.map((ts) => (
              <div key={ts.id} className="px-3 py-2 border-b border-border/50 last:border-0 flex items-center justify-between group">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{getProjectName(ts.project)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatTimesheetTime(ts.begin)}
                    {ts.end && ` - ${formatTimesheetTime(ts.end)}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-xs font-mono text-primary">
                    {ts.duration ? formatDuration(ts.duration) : '--'}
                  </div>
                  <button
                    onClick={() => handleDeleteTimesheet(ts.id)}
                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition-opacity"
                    title="Delete entry"
                  >
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ActivityWatch Summary */}
      {activitySummary.length > 0 && (
        <div className="border-t border-border">
          <div className="px-3 py-2 bg-muted/30 flex items-center gap-2">
            <Monitor className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Activity (Last Hour)</span>
          </div>
          <div className="px-3 py-2 space-y-2">
            {activitySummary.map((item, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <Zap className="h-3 w-3 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{item.title || item.app}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{item.app}</div>
                  </div>
                </div>
                <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                  {formatDuration(item.duration)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="p-2 border-t border-border flex gap-1">
        <button
          onClick={openTimeEntry}
          className="flex-1 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md flex items-center justify-center gap-1"
        >
          <Plus className="h-3 w-3" />
          Manual Entry
        </button>
        <button
          onClick={openSettings}
          className="flex-1 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md flex items-center justify-center gap-1"
        >
          <Settings className="h-3 w-3" />
          Settings
        </button>
      </div>

      {/* Connection Status Footer */}
      <div className="px-3 py-1.5 bg-muted/20 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          {connectionStatus === 'connected' ? (
            <CheckCircle2 className="h-3 w-3 text-green-500" />
          ) : (
            <XCircle className="h-3 w-3 text-red-500" />
          )}
          <span>Kimai</span>
        </div>
        <div className="flex items-center gap-1">
          {awStatus === 'connected' ? (
            <CheckCircle2 className="h-3 w-3 text-blue-500" />
          ) : awStatus === 'disabled' ? (
            <Coffee className="h-3 w-3 text-gray-400" />
          ) : (
            <XCircle className="h-3 w-3 text-red-500" />
          )}
          <span>AW</span>
        </div>
        {jiraEnabled && (
          <div className="flex items-center gap-1">
            {jiraStatus === 'connected' ? (
              <CheckCircle2 className="h-3 w-3 text-blue-500" />
            ) : jiraStatus === 'disabled' ? (
              <Coffee className="h-3 w-3 text-gray-400" />
            ) : (
              <XCircle className="h-3 w-3 text-red-500" />
            )}
            <span>Jira</span>
          </div>
        )}
      </div>
    </div>
  );
}
