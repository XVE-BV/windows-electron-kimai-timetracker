import React, { useEffect, useState } from 'react';
import { ArrowLeft, Clock, Magnet, Info, Play } from 'lucide-react';
import { TimerState } from '../types';

export function TimeRoundingView() {
  const [timerState, setTimerState] = useState<TimerState | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Load timer state
    const loadTimerState = async () => {
      if (!window.electronAPI) return;
      const state = await window.electronAPI.getTimerState();
      setTimerState(state);
    };

    loadTimerState();

    // Update current time every second for live preview
    const interval = setInterval(() => {
      setCurrentTime(new Date());
      loadTimerState();
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const goBack = () => {
    window.electronAPI?.openTray();
  };

  // Round up to nearest 15 minutes (for end time)
  const roundUp15 = (date: Date): Date => {
    const result = new Date(date);
    const minutes = result.getMinutes();
    const seconds = result.getSeconds();
    if (minutes % 15 === 0 && seconds === 0) {
      return result; // Already on a 15-min boundary
    }
    result.setMinutes(Math.ceil(minutes / 15) * 15);
    result.setSeconds(0);
    result.setMilliseconds(0);
    return result;
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  // Calculate live snap preview
  const now = currentTime;
  const roundedEndTime = roundUp15(now);
  const minutesUntilSnap = Math.round((roundedEndTime.getTime() - now.getTime()) / 60000);

  // Calculate billed duration if timer is running
  let billedDuration = 0;
  let actualDuration = 0;
  if (timerState?.isRunning && timerState.startTime) {
    const startTime = new Date(timerState.startTime);
    billedDuration = Math.floor((roundedEndTime.getTime() - startTime.getTime()) / 1000);
    actualDuration = Math.floor((now.getTime() - (timerState.actualStartTime ? new Date(timerState.actualStartTime).getTime() : startTime.getTime())) / 1000);
  }

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

      {/* Live Timer Preview */}
      {timerState?.isRunning && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4 text-green-600 fill-green-600" />
            <h3 className="font-medium text-green-700">Timer Running - Live Preview</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b border-green-500/20">
              <span className="text-green-700">Current time:</span>
              <span className="font-mono font-medium">{formatTime(now)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-green-500/20">
              <span className="text-green-700">If you stop now, end snaps to:</span>
              <span className="font-mono font-medium text-green-600">{formatTime(roundedEndTime)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-green-500/20">
              <span className="text-green-700">Time until next snap:</span>
              <span className="font-mono font-medium">{minutesUntilSnap} min</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-green-700">Billed duration would be:</span>
              <span className="font-mono font-medium text-green-600">{formatDuration(billedDuration)}</span>
            </div>
            {actualDuration !== billedDuration && (
              <div className="flex justify-between py-2 border-t border-green-500/20">
                <span className="text-green-700">Actual duration:</span>
                <span className="font-mono font-medium">{formatDuration(actualDuration)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main explanation */}
      <div className="bg-muted/30 rounded-lg p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Magnet className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <h2 className="font-semibold">15-Minute Rounding</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Kimai automatically rounds your start time <strong>down</strong> and end time <strong>up</strong> to the nearest 15 minutes.
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
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">You click "Stop" at:</span>
            <span className="font-mono font-medium">15:07</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Kimai records end as:</span>
            <span className="font-mono font-medium text-primary">15:15</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-muted-foreground">Billed duration:</span>
            <span className="font-mono font-medium text-green-600">1h 0m (instead of 44m)</span>
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
            <span>Stop at :00, :15, :30, or :45 to avoid extra billed time at the end</span>
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
