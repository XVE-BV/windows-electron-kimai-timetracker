import React, { useEffect, useState } from 'react';
import { Settings, Link, Activity, CheckCircle, XCircle, Loader2, Ticket, ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Combobox } from './ui/combobox';
import { AppSettings, KimaiCustomer, KimaiProject, KimaiActivity } from '../types';

type ConnectionStatus = 'idle' | 'loading' | 'success' | 'error';

export function SettingsView() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [kimaiUrl, setKimaiUrl] = useState('');
  const [kimaiToken, setKimaiToken] = useState('');
  const [awEnabled, setAwEnabled] = useState(true);
  const [awUrl, setAwUrl] = useState('http://localhost:5600');
  const [useDefaults, setUseDefaults] = useState(false);
  const [defaultCustomer, setDefaultCustomer] = useState('none');
  const [defaultProject, setDefaultProject] = useState('none');
  const [defaultActivity, setDefaultActivity] = useState('none');

  const [kimaiStatus, setKimaiStatus] = useState<ConnectionStatus>('idle');
  const [kimaiMessage, setKimaiMessage] = useState('');
  const [awStatus, setAwStatus] = useState<ConnectionStatus>('idle');
  const [awMessage, setAwMessage] = useState('');

  // Jira state
  const [jiraEnabled, setJiraEnabled] = useState(false);
  const [jiraUrl, setJiraUrl] = useState('');
  const [jiraEmail, setJiraEmail] = useState('');
  const [jiraToken, setJiraToken] = useState('');
  const [jiraAutoLogWorklog, setJiraAutoLogWorklog] = useState(false);
  const [jiraStatus, setJiraStatus] = useState<ConnectionStatus>('idle');
  const [jiraMessage, setJiraMessage] = useState('');

  const [customers, setCustomers] = useState<KimaiCustomer[]>([]);
  const [projects, setProjects] = useState<KimaiProject[]>([]);
  const [activities, setActivities] = useState<KimaiActivity[]>([]);

  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && window.electronAPI;

  useEffect(() => {
    if (isElectron) {
      loadSettings();
    }
  }, [isElectron]);

  const loadSettings = async () => {
    if (!window.electronAPI) return;
    try {
      const s = await window.electronAPI.getSettings();
      setSettings(s);
      setKimaiUrl(s.kimai.apiUrl);
      setKimaiToken(s.kimai.apiToken);
      setAwEnabled(s.activityWatch.enabled);
      setAwUrl(s.activityWatch.apiUrl);
      setJiraEnabled(s.jira?.enabled || false);
      setJiraUrl(s.jira?.apiUrl || '');
      setJiraEmail(s.jira?.email || '');
      setJiraToken(s.jira?.apiToken || '');
      setJiraAutoLogWorklog(s.jira?.autoLogWorklog || false);
      setUseDefaults(s.useDefaults || false);
      setDefaultCustomer(s.defaultCustomerId?.toString() || 'none');
      setDefaultProject(s.defaultProjectId?.toString() || 'none');
      setDefaultActivity(s.defaultActivityId?.toString() || 'none');

      if (s.kimai.apiUrl && s.kimai.apiToken) {
        await loadCustomers();
        // Load projects for saved customer
        if (s.defaultCustomerId) {
          await loadProjects(s.defaultCustomerId);
        }
        // Load activities for saved project
        if (s.defaultProjectId) {
          await loadActivities(s.defaultProjectId);
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadCustomers = async () => {
    if (!window.electronAPI) return;
    try {
      const c = await window.electronAPI.kimaiGetCustomers() as KimaiCustomer[];
      setCustomers(c);
    } catch (error) {
      console.error('Failed to load customers:', error);
    }
  };

  const loadProjects = async (customerId: number) => {
    if (!window.electronAPI) return;
    try {
      const p = await window.electronAPI.kimaiGetProjects(customerId) as KimaiProject[];
      setProjects(p);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadActivities = async (projectId: number) => {
    if (!window.electronAPI) return;
    try {
      const a = await window.electronAPI.kimaiGetActivities(projectId) as KimaiActivity[];
      setActivities(a);
    } catch (error) {
      console.error('Failed to load activities:', error);
    }
  };

  const testKimaiConnection = async () => {
    if (!window.electronAPI || !settings) return;
    setKimaiStatus('loading');
    setKimaiMessage('');

    // Save temporarily to test
    const tempSettings: AppSettings = {
      ...settings,
      kimai: { apiUrl: kimaiUrl, apiToken: kimaiToken },
      jira: settings.jira || { apiUrl: '', email: '', apiToken: '', enabled: false, autoLogWorklog: false },
    };
    await window.electronAPI.saveSettings(tempSettings);

    try {
      const result = await window.electronAPI.kimaiTestConnection();
      if (result.success) {
        setKimaiStatus('success');
        setKimaiMessage('Connected successfully!');
        loadCustomers();
      } else {
        setKimaiStatus('error');
        setKimaiMessage(result.message);
      }
    } catch (error) {
      setKimaiStatus('error');
      setKimaiMessage('Connection failed');
    }
  };

  const testAwConnection = async () => {
    if (!window.electronAPI || !settings) return;
    setAwStatus('loading');
    setAwMessage('');

    const tempSettings: AppSettings = {
      ...settings,
      activityWatch: { apiUrl: awUrl, enabled: awEnabled },
      jira: settings.jira || { apiUrl: '', email: '', apiToken: '', enabled: false, autoLogWorklog: false },
    };
    await window.electronAPI.saveSettings(tempSettings);

    try {
      const buckets = await window.electronAPI.awGetBuckets() as Record<string, unknown>;
      const count = Object.keys(buckets).length;
      setAwStatus('success');
      setAwMessage(`Connected! Found ${count} buckets`);
    } catch (error) {
      setAwStatus('error');
      setAwMessage('Connection failed');
    }
  };

  const testJiraConnection = async () => {
    if (!window.electronAPI || !settings) return;
    setJiraStatus('loading');
    setJiraMessage('');

    const tempSettings: AppSettings = {
      ...settings,
      jira: { apiUrl: jiraUrl, email: jiraEmail, apiToken: jiraToken, enabled: jiraEnabled, autoLogWorklog: jiraAutoLogWorklog },
    };
    await window.electronAPI.saveSettings(tempSettings);

    try {
      const result = await window.electronAPI.jiraTestConnection();
      if (result.success) {
        setJiraStatus('success');
        setJiraMessage(result.message);
      } else {
        setJiraStatus('error');
        setJiraMessage(result.message);
      }
    } catch (error) {
      setJiraStatus('error');
      setJiraMessage('Connection failed');
    }
  };

  const saveSettings = async () => {
    if (!settings || !window.electronAPI) return;

    const newSettings: AppSettings = {
      kimai: {
        apiUrl: kimaiUrl.replace(/\/$/, ''),
        apiToken: kimaiToken,
      },
      activityWatch: {
        apiUrl: awUrl.replace(/\/$/, ''),
        enabled: awEnabled,
      },
      jira: {
        apiUrl: jiraUrl.replace(/\/$/, ''),
        email: jiraEmail,
        apiToken: jiraToken,
        enabled: jiraEnabled,
        autoLogWorklog: jiraAutoLogWorklog,
      },
      autoStartTimer: settings.autoStartTimer,
      useDefaults,
      defaultCustomerId: defaultCustomer && defaultCustomer !== 'none' ? parseInt(defaultCustomer) : null,
      defaultProjectId: defaultProject && defaultProject !== 'none' ? parseInt(defaultProject) : null,
      defaultActivityId: defaultActivity && defaultActivity !== 'none' ? parseInt(defaultActivity) : null,
      syncInterval: settings.syncInterval,
      themeMode: settings.themeMode,
    };

    await window.electronAPI.saveSettings(newSettings);
    window.electronAPI.openTray();
  };

  const handleUseDefaultsChange = (checked: boolean) => {
    setUseDefaults(checked);
    if (checked && customers.length === 0) {
      loadCustomers();
    }
  };

  const handleCustomerChange = (value: string) => {
    setDefaultCustomer(value);
    setDefaultProject('none');
    setDefaultActivity('none');
    setProjects([]);
    setActivities([]);
    if (value && value !== 'none') {
      loadProjects(parseInt(value));
    }
  };

  const handleProjectChange = (value: string) => {
    setDefaultProject(value);
    setDefaultActivity('none');
    setActivities([]);
    if (value && value !== 'none') {
      loadActivities(parseInt(value));
    }
  };

  const StatusIcon = ({ status }: { status: ConnectionStatus }) => {
    switch (status) {
      case 'loading':
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const goBack = () => {
    window.electronAPI?.openTray();
  };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 h-screen overflow-auto">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={goBack}
          className="p-2 hover:bg-muted rounded-lg transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="p-2 bg-primary/10 rounded-lg">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Settings</h1>
          <p className="text-xs text-muted-foreground">Configure your time tracking</p>
        </div>
      </div>

      {/* Kimai Connection */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Link className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Kimai Connection</CardTitle>
          </div>
          <CardDescription>Connect to your Kimai time tracking server</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="kimai-url">API URL</Label>
            <Input
              id="kimai-url"
              type="url"
              placeholder="https://your-kimai-instance.com"
              value={kimaiUrl}
              onChange={(e) => setKimaiUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Your Kimai instance URL (without /api)</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="kimai-token">API Token</Label>
            <Input
              id="kimai-token"
              type="password"
              placeholder="Your API token"
              value={kimaiToken}
              onChange={(e) => setKimaiToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Generate in your Kimai profile settings</p>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={testKimaiConnection}>
              Test Connection
            </Button>
            <StatusIcon status={kimaiStatus} />
            {kimaiMessage && (
              <span className={`text-sm ${kimaiStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {kimaiMessage}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ActivityWatch */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">ActivityWatch</CardTitle>
            </div>
            <Switch checked={awEnabled} onCheckedChange={setAwEnabled} />
          </div>
          <CardDescription>Track your computer activity for suggestions</CardDescription>
        </CardHeader>
        {awEnabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="aw-url">API URL</Label>
              <Input
                id="aw-url"
                type="url"
                placeholder="http://localhost:5600"
                value={awUrl}
                onChange={(e) => setAwUrl(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" onClick={testAwConnection}>
                Test Connection
              </Button>
              <StatusIcon status={awStatus} />
              {awMessage && (
                <span className={`text-sm ${awStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {awMessage}
                </span>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Jira Cloud */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Jira Cloud</CardTitle>
            </div>
            <Switch checked={jiraEnabled} onCheckedChange={setJiraEnabled} />
          </div>
          <CardDescription>Connect to Jira Cloud for ticket suggestions</CardDescription>
        </CardHeader>
        {jiraEnabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="jira-url">Jira Cloud URL</Label>
              <Input
                id="jira-url"
                type="url"
                placeholder="https://your-domain.atlassian.net"
                value={jiraUrl}
                onChange={(e) => setJiraUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Your Atlassian Cloud URL</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="jira-email">Email</Label>
              <Input
                id="jira-email"
                type="email"
                placeholder="you@example.com"
                value={jiraEmail}
                onChange={(e) => setJiraEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Your Atlassian account email</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="jira-token">API Token</Label>
              <Input
                id="jira-token"
                type="password"
                placeholder="Your API token"
                value={jiraToken}
                onChange={(e) => setJiraToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Generate at{' '}
                <a
                  href="https://id.atlassian.com/manage-profile/security/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Atlassian API Tokens
                </a>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" onClick={testJiraConnection}>
                Test Connection
              </Button>
              <StatusIcon status={jiraStatus} />
              {jiraMessage && (
                <span className={`text-sm ${jiraStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {jiraMessage}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                <Label>Auto-log time to Jira</Label>
                <p className="text-xs text-muted-foreground">Automatically log work to Jira when stopping timer</p>
              </div>
              <Switch checked={jiraAutoLogWorklog} onCheckedChange={setJiraAutoLogWorklog} />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Defaults */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Defaults</CardTitle>
              <CardDescription>Pre-fill customer, project and activity in tray</CardDescription>
            </div>
            <Switch checked={useDefaults} onCheckedChange={handleUseDefaultsChange} />
          </div>
        </CardHeader>
        {useDefaults && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Default Customer</Label>
              <Combobox
                options={[
                  { value: 'none', label: 'None' },
                  ...customers.map((c) => ({ value: c.id.toString(), label: c.name }))
                ]}
                value={defaultCustomer}
                onValueChange={handleCustomerChange}
                placeholder="Select a customer..."
                searchPlaceholder="Search customers..."
                emptyText="No customers found."
              />
            </div>

            <div className="space-y-2">
              <Label>Default Project</Label>
              <Combobox
                options={[
                  { value: 'none', label: 'None' },
                  ...projects.map((p) => ({ value: p.id.toString(), label: p.name }))
                ]}
                value={defaultProject}
                onValueChange={handleProjectChange}
                placeholder="Select a project..."
                searchPlaceholder="Search projects..."
                emptyText="No projects found."
                disabled={!defaultCustomer || defaultCustomer === 'none'}
              />
            </div>

            <div className="space-y-2">
              <Label>Default Activity</Label>
              <Combobox
                options={[
                  { value: 'none', label: 'None' },
                  ...activities.map((a) => ({ value: a.id.toString(), label: a.name }))
                ]}
                value={defaultActivity}
                onValueChange={setDefaultActivity}
                placeholder="Select an activity..."
                searchPlaceholder="Search activities..."
                emptyText="No activities found."
                disabled={!defaultProject || defaultProject === 'none'}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 pb-4">
        <Button variant="outline" onClick={goBack}>
          Cancel
        </Button>
        <Button onClick={saveSettings}>
          Save Settings
        </Button>
      </div>
    </div>
  );
}
