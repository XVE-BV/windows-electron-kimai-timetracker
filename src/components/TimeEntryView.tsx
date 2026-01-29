import React, { useEffect, useState, useMemo } from 'react';
import {
  Clock, Calendar, FileText, Loader2, ChevronRight, Search, X,
  Users, Layers, Activity, Ticket, Briefcase, Timer, Check, ArrowLeft
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  KimaiProject, KimaiActivity, KimaiCustomer, JiraIssue
} from '../types';
import { MAX_JIRA_ISSUES } from '../constants';

type ViewType = 'main' | 'customers' | 'projects' | 'activities' | 'jira';

export function TimeEntryView() {
  const [view, setView] = useState<ViewType>('main');
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Data
  const [customers, setCustomers] = useState<KimaiCustomer[]>([]);
  const [allProjects, setAllProjects] = useState<KimaiProject[]>([]);
  const [projects, setProjects] = useState<KimaiProject[]>([]);
  const [activities, setActivities] = useState<KimaiActivity[]>([]);
  const [jiraIssues, setJiraIssues] = useState<JiraIssue[]>([]);

  // Selections
  const [selectedCustomer, setSelectedCustomer] = useState<KimaiCustomer | null>(null);
  const [selectedProject, setSelectedProject] = useState<KimaiProject | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<KimaiActivity | null>(null);
  const [selectedJiraIssue, setSelectedJiraIssue] = useState<JiraIssue | null>(null);

  // Form
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [description, setDescription] = useState('');

  // Jira state
  const [jiraEnabled, setJiraEnabled] = useState(false);
  const [jiraSearchQuery, setJiraSearchQuery] = useState('');
  const [logToJira, setLogToJira] = useState(false);

  useEffect(() => {
    initializeForm();
  }, []);

  // Round minutes to nearest 15-minute interval
  const roundTo15Min = (minutes: number): number => {
    return Math.round(minutes / 15) * 15;
  };

  const formatTime = (hours: number, minutes: number): string => {
    // Handle minute overflow (60 -> next hour)
    if (minutes >= 60) {
      hours += 1;
      minutes = 0;
    }
    // Handle hour overflow
    if (hours >= 24) hours = 23;
    if (hours < 0) hours = 0;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  };

  const initializeForm = async () => {
    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    setDate(today);

    // Set times rounded to 15-minute intervals
    const now = new Date();
    const roundedMinutes = roundTo15Min(now.getMinutes());
    setEndTime(formatTime(now.getHours(), roundedMinutes));
    setStartTime(formatTime(now.getHours() - 1, roundedMinutes));

    try {
      const s = await window.electronAPI.getSettings();

      if (s.kimai.apiUrl && s.kimai.apiToken) {
        // Load customers
        const custs = await window.electronAPI.kimaiGetCustomers() as KimaiCustomer[];
        setCustomers(custs);

        // Load all projects
        const projs = await window.electronAPI.kimaiGetProjects() as KimaiProject[];
        setAllProjects(projs);

        // Load defaults if enabled
        if (s.useDefaults) {
          if (s.defaultCustomerId) {
            const cust = custs.find(c => c.id === s.defaultCustomerId);
            if (cust) {
              setSelectedCustomer(cust);
              const filteredProjects = projs.filter(p => p.customer === cust.id);
              setProjects(filteredProjects);
            }
          }
          if (s.defaultProjectId) {
            const proj = projs.find(p => p.id === s.defaultProjectId);
            if (proj) {
              setSelectedProject(proj);
              const acts = await window.electronAPI.kimaiGetActivities(s.defaultProjectId) as KimaiActivity[];
              setActivities(acts);

              if (s.defaultActivityId) {
                const act = acts.find(a => a.id === s.defaultActivityId);
                setSelectedActivity(act || null);
              }
            }
          }
        }
      }

      // Load Jira issues if enabled
      if (s.jira?.enabled) {
        setJiraEnabled(true);
        setLogToJira(s.jira?.autoLogWorklog || false);
        try {
          const issues = await window.electronAPI.jiraGetMyIssues(MAX_JIRA_ISSUES) as JiraIssue[];
          setJiraIssues(issues);
        } catch (error) {
          console.error('Failed to load Jira issues:', error);
        }
      }
    } catch (error) {
      console.error('Failed to initialize:', error);
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
    setSelectedProject(project);
    setSelectedActivity(null);
    try {
      const acts = await window.electronAPI.kimaiGetActivities(project.id) as KimaiActivity[];
      setActivities(acts);
    } catch (error) {
      console.error('Failed to load activities:', error);
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
    setDescription(`${issue.key}: ${issue.fields.summary}`);
    setJiraSearchQuery('');

    // Try to match customer/project from Jira ticket
    if (customers.length > 0) {
      const jiraCustomerName = (issue.fields.customfield_10278 as { value?: string } | undefined)?.value;
      const jiraProjectName = issue.fields.project?.name;

      let matchedCustomer: KimaiCustomer | undefined;

      const findBestMatch = (searchTerm: string): KimaiCustomer | undefined => {
        const term = searchTerm.toLowerCase();
        const exact = customers.find(c => c.name.toLowerCase() === term);
        if (exact) return exact;

        const partialMatches = customers.filter(c =>
          c.name.toLowerCase().includes(term) || term.includes(c.name.toLowerCase())
        );
        if (partialMatches.length > 0) {
          return partialMatches.sort((a, b) => b.name.length - a.name.length)[0];
        }
        return undefined;
      };

      if (jiraCustomerName) {
        matchedCustomer = findBestMatch(jiraCustomerName);
      }
      if (!matchedCustomer && jiraProjectName) {
        matchedCustomer = findBestMatch(jiraProjectName);
      }

      if (matchedCustomer) {
        setSelectedCustomer(matchedCustomer);
        const filteredProjects = allProjects.filter(p => p.customer === matchedCustomer.id);
        setProjects(filteredProjects);

        if (filteredProjects.length === 1) {
          const proj = filteredProjects[0];
          setSelectedProject(proj);

          try {
            const acts = await window.electronAPI.kimaiGetActivities(proj.id) as KimaiActivity[];
            setActivities(acts);

            if (acts.length === 1) {
              setSelectedActivity(acts[0]);
            } else if (acts.length > 1) {
              const workActivity = acts.find(a =>
                a.name.toLowerCase() === 'werk' ||
                a.name.toLowerCase() === 'work' ||
                a.name.toLowerCase().includes('werk') ||
                a.name.toLowerCase().includes('work')
              );
              setSelectedActivity(workActivity || null);
            }
          } catch (error) {
            console.error('Failed to load activities:', error);
          }
        }
      }
    }

    setView('main');
  };

  const clearJiraIssue = () => {
    setSelectedJiraIssue(null);
    setDescription('');
  };

  const saveEntry = async () => {
    if (!selectedProject || !selectedActivity || !date || !startTime || !endTime) {
      alert('Please fill in all required fields');
      return;
    }

    const startDateTime = new Date(`${date}T${startTime}:00`);
    const endDateTime = new Date(`${date}T${endTime}:00`);
    if (endDateTime <= startDateTime) {
      alert('End time must be after start time');
      return;
    }

    setSaving(true);

    try {
      await window.electronAPI.kimaiCreateTimesheet({
        begin: `${date}T${startTime}:00`,
        end: `${date}T${endTime}:00`,
        project: selectedProject.id,
        activity: selectedActivity.id,
        description,
      });

      // Log to Jira if a ticket was linked and toggle is enabled
      if (selectedJiraIssue && jiraEnabled && logToJira) {
        try {
          const durationSeconds = Math.floor((endDateTime.getTime() - startDateTime.getTime()) / 1000);
          await window.electronAPI.jiraAddWorklog(
            selectedJiraIssue.key,
            durationSeconds,
            startDateTime.toISOString(),
            description || undefined
          );
        } catch (error) {
          console.error('Failed to log to Jira:', error);
          alert(`Time was saved to Kimai, but failed to log to Jira ${selectedJiraIssue.key}`);
        }
      }

      window.electronAPI.openTray();
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save time entry');
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    window.electronAPI?.openTray();
  };

  // Filtered lists
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

  // Customer selection view
  if (view === 'customers') {
    return (
      <div className="w-full bg-background overflow-hidden h-screen flex flex-col">
        <div className="p-3 border-b border-border bg-muted/30">
          <button
            onClick={() => { setView('main'); setSearchQuery(''); }}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            ← Back
          </button>
          <h3 className="font-semibold mt-1">Select Customer</h3>
        </div>
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
        <div className="flex-1 overflow-y-auto">
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

  // Project selection view
  if (view === 'projects') {
    return (
      <div className="w-full bg-background overflow-hidden h-screen flex flex-col">
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
        <div className="flex-1 overflow-y-auto">
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

  // Activity selection view
  if (view === 'activities') {
    return (
      <div className="w-full bg-background overflow-hidden h-screen flex flex-col">
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
        <div className="flex-1 overflow-y-auto">
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

  // Jira selection view
  if (view === 'jira') {
    return (
      <div className="w-full bg-background overflow-hidden h-screen flex flex-col">
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
        <div className="flex-1 overflow-y-auto">
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

  // Main form view
  return (
    <div className="w-full bg-background overflow-hidden h-screen flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <div className="p-2 bg-primary/20 rounded-lg">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Add Time Entry</h1>
            <p className="text-xs text-muted-foreground">Log your work manually</p>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Selection Buttons */}
        <div className="p-3 space-y-2 border-b border-border">
          <button
            onClick={() => setView('customers')}
            className="w-full px-3 py-2.5 text-left bg-muted/50 hover:bg-muted rounded-md flex items-center justify-between"
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
            className="w-full px-3 py-2.5 text-left bg-muted/50 hover:bg-muted rounded-md flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span className="text-sm truncate">
                {selectedProject ? selectedProject.name : 'Select project...'}
              </span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>

          <button
            onClick={() => selectedProject && setView('activities')}
            disabled={!selectedProject}
            className="w-full px-3 py-2.5 text-left bg-muted/50 hover:bg-muted rounded-md flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="mt-1 space-y-2">
              {selectedJiraIssue ? (
                <div className="px-3 py-2.5 bg-blue-500/10 border border-blue-500/30 rounded-md">
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
                      className="p-1 hover:bg-muted rounded"
                    >
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                  {selectedJiraIssue.fields.timetracking?.originalEstimate && (
                    <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
                      <Timer className="h-3 w-3" />
                      <span>Estimate: {selectedJiraIssue.fields.timetracking.originalEstimate}</span>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setView('jira')}
                  className="w-full px-3 py-2.5 text-left bg-muted/50 hover:bg-muted rounded-md flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Ticket className="h-4 w-4 text-blue-500" />
                    <span className="text-sm text-muted-foreground">Link Jira ticket...</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              )}

              {/* Log to Jira toggle */}
              {selectedJiraIssue && (
                <button
                  onClick={() => setLogToJira(!logToJira)}
                  className="w-full px-3 py-2 text-left bg-muted/50 hover:bg-muted rounded-md flex items-center justify-between"
                >
                  <span className="text-sm">Log worklog to Jira</span>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${logToJira ? 'bg-blue-500 border-blue-500' : 'border-muted-foreground/50'}`}>
                    {logToJira && <Check className="h-3 w-3 text-white" />}
                  </div>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Date/Time inputs */}
        <div className="p-3 space-y-3 border-b border-border">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-xs">
              <Calendar className="h-3.5 w-3.5" />
              Date
            </Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Start Time</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                step="900"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End Time</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                step="900"
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-xs">
              <FileText className="h-3.5 w-3.5" />
              Description
            </Label>
            <Textarea
              placeholder="What did you work on?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-3 border-t border-border bg-muted/20 flex gap-2">
        <Button
          variant="outline"
          onClick={goBack}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          onClick={saveEntry}
          disabled={saving || !selectedProject || !selectedActivity}
          className="flex-1"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Entry
        </Button>
      </div>
    </div>
  );
}
