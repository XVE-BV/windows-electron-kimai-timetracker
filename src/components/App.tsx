import React, { useEffect, useState } from 'react';
import { SettingsView } from './SettingsView';
import { TimeEntryView } from './TimeEntryView';
import { MainView } from './MainView';
import { TrayView } from './TrayView';
import { ChangelogView } from './ChangelogView';
import { DebugView } from './DebugView';
import { TimeRoundingView } from './TimeRoundingView';
import { ErrorBoundary } from './ErrorBoundary';
import { VIEW_HASHES, ViewHash } from '../types';

type View = ViewHash | 'main';

export function App() {
  const [view, setView] = useState<View>('main');

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // Remove the # prefix
      if (hash === VIEW_HASHES.SETTINGS) {
        setView(VIEW_HASHES.SETTINGS);
      } else if (hash === VIEW_HASHES.TIME_ENTRY) {
        setView(VIEW_HASHES.TIME_ENTRY);
      } else if (hash === VIEW_HASHES.TRAY) {
        setView(VIEW_HASHES.TRAY);
      } else if (hash === VIEW_HASHES.CHANGELOG) {
        setView(VIEW_HASHES.CHANGELOG);
      } else if (hash === VIEW_HASHES.DEBUG) {
        setView(VIEW_HASHES.DEBUG);
      } else if (hash === VIEW_HASHES.TIME_ROUNDING) {
        setView(VIEW_HASHES.TIME_ROUNDING);
      } else {
        setView('main');
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <ErrorBoundary>
      <div className={`${view === VIEW_HASHES.TRAY ? '' : 'min-h-screen'} bg-background animate-fade-in`}>
        {view === VIEW_HASHES.SETTINGS && <SettingsView />}
        {view === VIEW_HASHES.TIME_ENTRY && <TimeEntryView />}
        {view === VIEW_HASHES.TRAY && <TrayView />}
        {view === VIEW_HASHES.CHANGELOG && <ChangelogView />}
        {view === VIEW_HASHES.DEBUG && <DebugView />}
        {view === VIEW_HASHES.TIME_ROUNDING && <TimeRoundingView />}
        {view === 'main' && <MainView />}
      </div>
    </ErrorBoundary>
  );
}
