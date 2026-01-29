import React from 'react';
import { Clock, MousePointerClick } from 'lucide-react';

export function MainView() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center space-y-6 max-w-md">
        <div className="inline-flex p-4 bg-primary/10 rounded-full">
          <Clock className="h-12 w-12 text-primary" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Kimai Time Tracker</h1>
          <p className="text-muted-foreground">
            This app runs in your system tray for quick access to time tracking.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-muted rounded-lg p-4">
          <MousePointerClick className="h-5 w-5" />
          <span>Right-click the tray icon to access features</span>
        </div>
      </div>
    </div>
  );
}
