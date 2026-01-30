import React from 'react';
import { ArrowLeft, Clock, Magnet, Info } from 'lucide-react';

export function TimeRoundingView() {
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
          <Clock className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Time Rounding</h1>
          <p className="text-xs text-muted-foreground">How Kimai handles time</p>
        </div>
      </div>

      {/* Main explanation */}
      <div className="bg-muted/30 rounded-lg p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Magnet className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <h2 className="font-semibold">15-Minute Rounding</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Kimai automatically rounds your start time <strong>down</strong> to the nearest 15 minutes.
            </p>
          </div>
        </div>
      </div>

      {/* Example */}
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="font-medium flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-500" />
          Example
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">You click "Start" at:</span>
            <span className="font-mono font-medium">14:23</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Kimai records start as:</span>
            <span className="font-mono font-medium text-primary">14:15</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-muted-foreground">Extra time added:</span>
            <span className="font-mono font-medium text-green-600">+8 minutes</span>
          </div>
        </div>
      </div>

      {/* What you see */}
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="font-medium">What You See in the App</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-3 py-2">
            <div className="font-mono text-2xl font-bold">00:08:00</div>
            <div className="text-muted-foreground">Your actual elapsed time</div>
          </div>
          <div className="flex items-center gap-3 py-2 border-t">
            <div className="font-mono text-lg text-muted-foreground">Billed: 00:16:00</div>
            <div className="text-muted-foreground text-xs">What Kimai bills (rounded)</div>
          </div>
        </div>
      </div>

      {/* Why */}
      <div className="bg-blue-500/10 rounded-lg p-4">
        <h3 className="font-medium text-blue-700 mb-2">Why does this happen?</h3>
        <p className="text-sm text-blue-600">
          Many businesses bill in 15-minute increments. Kimai's rounding ensures consistent billing
          and simplifies timesheet management. The rounding is configured on your Kimai server.
        </p>
      </div>

      {/* Tips */}
      <div className="border rounded-lg p-4 space-y-2">
        <h3 className="font-medium">Tips</h3>
        <ul className="text-sm text-muted-foreground space-y-1.5">
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Start your timer at :00, :15, :30, or :45 to avoid extra billed time</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>The "Billed" time shows what will appear on your timesheet</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Your actual time is tracked separately so you know the real duration</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
