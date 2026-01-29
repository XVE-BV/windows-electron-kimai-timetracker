import React from 'react';
import { ScrollText, X, Sparkles, Bug, Wrench } from 'lucide-react';
import { Button } from './ui/button';

interface ChangelogEntry {
  version: string;
  date: string;
  changes: {
    type: 'feature' | 'fix' | 'improvement';
    text: string;
  }[];
}

const changelog: ChangelogEntry[] = [
  {
    version: '1.1.0',
    date: '2026-01-29',
    changes: [
      { type: 'feature', text: 'Redesigned manual time entry with drill-down selection (Customer → Project → Activity)' },
      { type: 'feature', text: 'Added search functionality to all selection views' },
      { type: 'feature', text: 'Added Jira ticket linking to manual time entries with auto-match' },
      { type: 'feature', text: 'Added toggle to override Jira auto-log per entry' },
      { type: 'improvement', text: 'Start time now rounds to 15-minute intervals for Kimai compatibility' },
      { type: 'improvement', text: 'Time inputs use 15-minute steps' },
      { type: 'fix', text: 'Fixed "Object has been destroyed" error when closing tray window' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-01-28',
    changes: [
      { type: 'feature', text: 'Initial release with Kimai time tracking integration' },
      { type: 'feature', text: 'ActivityWatch integration for activity monitoring' },
      { type: 'feature', text: 'Jira integration with automatic worklog posting' },
      { type: 'feature', text: 'Work session tracking with reminders' },
      { type: 'feature', text: 'System tray application with quick access' },
      { type: 'feature', text: 'Customer → Project → Activity hierarchy' },
      { type: 'feature', text: 'Default customer/project/activity settings' },
    ],
  },
];

const typeIcons = {
  feature: Sparkles,
  fix: Bug,
  improvement: Wrench,
};

const typeColors = {
  feature: 'text-green-500 bg-green-500/10',
  fix: 'text-red-500 bg-red-500/10',
  improvement: 'text-blue-500 bg-blue-500/10',
};

const typeLabels = {
  feature: 'New',
  fix: 'Fix',
  improvement: 'Improved',
};

export function ChangelogView() {
  return (
    <div className="w-full bg-background overflow-hidden h-screen flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border bg-gradient-to-r from-primary/10 to-primary/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/20 rounded-lg">
            <ScrollText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Changelog</h1>
            <p className="text-xs text-muted-foreground">What's new in Kimai Tracker</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => window.electronAPI.closeWindow()}
          className="h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Changelog content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {changelog.map((entry) => (
          <div key={entry.version} className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-primary">v{entry.version}</span>
              <span className="text-sm text-muted-foreground">{entry.date}</span>
            </div>
            <div className="space-y-2 pl-2 border-l-2 border-border">
              {entry.changes.map((change, idx) => {
                const Icon = typeIcons[change.type];
                return (
                  <div key={idx} className="flex items-start gap-2 pl-3">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${typeColors[change.type]}`}>
                      <Icon className="h-3 w-3" />
                      {typeLabels[change.type]}
                    </span>
                    <span className="text-sm text-foreground/90">{change.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border bg-muted/20">
        <Button
          variant="outline"
          onClick={() => window.electronAPI.closeWindow()}
          className="w-full"
        >
          Close
        </Button>
      </div>
    </div>
  );
}
