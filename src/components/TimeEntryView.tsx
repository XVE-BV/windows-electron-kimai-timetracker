import React, { useEffect, useState } from 'react';
import { Clock, Calendar, FileText, Sparkles, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { AppSettings, KimaiProject, KimaiActivity, ActivitySummaryItem } from '../types';
import { formatDurationHuman } from '../utils';

export function TimeEntryView() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [projects, setProjects] = useState<KimaiProject[]>([]);
  const [activities, setActivities] = useState<KimaiActivity[]>([]);
  const [suggestions, setSuggestions] = useState<ActivitySummaryItem[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedProject, setSelectedProject] = useState('');
  const [selectedActivity, setSelectedActivity] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    initializeForm();
  }, []);

  const initializeForm = async () => {
    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    setDate(today);

    // Set current time
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    setStartTime(`${hours}:${minutes}`);

    try {
      const s = await window.electronAPI.getSettings();
      setSettings(s);

      if (s.kimai.apiUrl && s.kimai.apiToken) {
        const p = await window.electronAPI.kimaiGetProjects() as KimaiProject[];
        setProjects(p);

        if (s.defaultProjectId) {
          setSelectedProject(s.defaultProjectId.toString());
          const a = await window.electronAPI.kimaiGetActivities(s.defaultProjectId) as KimaiActivity[];
          setActivities(a);

          if (s.defaultActivityId) {
            setSelectedActivity(s.defaultActivityId.toString());
          }
        }
      }

      // Load activity suggestions
      if (s.activityWatch.enabled) {
        loadSuggestions();
      } else {
        setLoadingSuggestions(false);
      }
    } catch (error) {
      console.error('Failed to initialize:', error);
      setLoadingSuggestions(false);
    }
  };

  const loadSuggestions = async () => {
    try {
      const summary = await window.electronAPI.awGetActivitySummary(60) as ActivitySummaryItem[];
      setSuggestions(summary.slice(0, 8));
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleProjectChange = async (value: string) => {
    setSelectedProject(value);
    setSelectedActivity('');
    if (value) {
      const a = await window.electronAPI.kimaiGetActivities(parseInt(value)) as KimaiActivity[];
      setActivities(a);
    } else {
      setActivities([]);
    }
  };

  const handleSuggestionClick = (suggestion: ActivitySummaryItem) => {
    setDescription(`${suggestion.app}: ${suggestion.title}`);
  };

  const saveEntry = async () => {
    if (!selectedProject || !selectedActivity || !date || !startTime || !endTime) {
      alert('Please fill in all required fields');
      return;
    }

    // Validate end time is after start time
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
        project: parseInt(selectedProject),
        activity: parseInt(selectedActivity),
        description,
      });

      window.electronAPI.closeWindow();
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save time entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Clock className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Add Time Entry</h1>
          <p className="text-sm text-muted-foreground">Log your work manually</p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label>Project</Label>
            <Select value={selectedProject} onValueChange={handleProjectChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Activity</Label>
            <Select
              value={selectedActivity}
              onValueChange={setSelectedActivity}
              disabled={!selectedProject}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an activity" />
              </SelectTrigger>
              <SelectContent>
                {activities.map((a) => (
                  <SelectItem key={a.id} value={a.id.toString()}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Date
            </Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Description
            </Label>
            <Textarea
              placeholder="What did you work on?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Activity Suggestions */}
      {settings?.activityWatch.enabled && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Activity Suggestions</CardTitle>
            </div>
            <CardDescription>Based on your recent activity (last hour)</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingSuggestions ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading activity data...
              </div>
            ) : suggestions.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                No activity recorded in the last hour
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {suggestions.map((s) => (
                  <button
                    key={`${s.app}:${s.title}`}
                    onClick={() => handleSuggestionClick(s)}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
                  >
                    <div className="min-w-0 flex-1 mr-4">
                      <p className="font-medium text-sm truncate">{s.app}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.title}</p>
                    </div>
                    <span className="text-sm font-medium text-primary whitespace-nowrap">
                      {formatDurationHuman(s.duration)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={() => window.electronAPI.closeWindow()}>
          Cancel
        </Button>
        <Button onClick={saveEntry} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Entry
        </Button>
      </div>
    </div>
  );
}
