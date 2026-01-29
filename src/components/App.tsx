import React, { useEffect, useState } from 'react';
import { SettingsView } from './SettingsView';
import { TimeEntryView } from './TimeEntryView';
import { MainView } from './MainView';
import { TrayView } from './TrayView';
import { ChangelogView } from './ChangelogView';
import { DebugView } from './DebugView';
import { ErrorBoundary } from './ErrorBoundary';

type View = 'main' | 'settings' | 'time-entry' | 'tray' | 'changelog' | 'debug';

export function App() {
  const [view, setView] = useState<View>('main');

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#settings') {
        setView('settings');
      } else if (hash === '#time-entry') {
        setView('time-entry');
      } else if (hash === '#tray') {
        setView('tray');
      } else if (hash === '#changelog') {
        setView('changelog');
      } else if (hash === '#debug') {
        setView('debug');
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
      <div className={`${view === 'tray' ? '' : 'min-h-screen'} bg-background animate-fade-in`}>
        {view === 'settings' && <SettingsView />}
        {view === 'time-entry' && <TimeEntryView />}
        {view === 'tray' && <TrayView />}
        {view === 'changelog' && <ChangelogView />}
        {view === 'debug' && <DebugView />}
        {view === 'main' && <MainView />}
      </div>
    </ErrorBoundary>
  );
}
