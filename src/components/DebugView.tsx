import React, { useEffect, useState } from 'react';
import { RefreshCw, Trash2, AlertTriangle, Bug, Copy, Check, ArrowLeft, Terminal } from 'lucide-react';
import { Button } from './ui/button';

interface ProcessInfo {
  pid: number;
  name: string;
  memory: number;
  isCurrent: boolean;
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export function DebugView() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'processes' | 'logs'>('processes');
  const [encryptionStatus, setEncryptionStatus] = useState<{ isAvailable: boolean; platform: string; usingPlaintextFallback: boolean } | null>(null);

  const loadProcesses = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    setError(null);
    try {
      const procs = await window.electronAPI.debugGetProcesses();
      setProcesses(procs);
    } catch (err) {
      setError('Failed to load processes');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    if (!window.electronAPI) return;
    try {
      const entries = await window.electronAPI.debugGetLogs();
      setLogs(entries);
    } catch (err) {
      console.error('Failed to load logs:', err);
    }
  };

  const clearLogs = async () => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.debugClearLogs();
      setLogs([]);
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  const killProcess = async (pid: number) => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.debugKillProcess(pid);
      await loadProcesses();
    } catch (err) {
      setError('Failed to kill process');
      console.error(err);
    }
  };

  const killAllExceptCurrent = async () => {
    if (!window.electronAPI) return;
    const otherProcesses = processes.filter(p => !p.isCurrent);
    for (const proc of otherProcesses) {
      try {
        await window.electronAPI.debugKillProcess(proc.pid);
      } catch (err) {
        console.error(`Failed to kill PID ${proc.pid}:`, err);
      }
    }
    await loadProcesses();
  };

  const copyLogs = () => {
    const text = logs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const loadEncryptionStatus = async () => {
    if (!window.electronAPI) return;
    try {
      const status = await window.electronAPI.getEncryptionStatus();
      setEncryptionStatus(status);
    } catch (err) {
      console.error('Failed to get encryption status:', err);
    }
  };

  useEffect(() => {
    loadProcesses();
    loadLogs();
    loadEncryptionStatus();

    // Refresh logs periodically
    const interval = setInterval(loadLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatMemory = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const otherProcessCount = processes.filter(p => !p.isCurrent).length;
  const errorCount = logs.filter(l => l.level === 'error').length;

  const goBack = () => {
    window.electronAPI?.openTray();
  };

  return (
    <div className="w-full h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={goBack}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5 text-muted-foreground" />
            </button>
            <Bug className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">Debug View</h1>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.electronAPI?.openDevTools()}
            >
              <Terminal className="h-4 w-4 mr-2" />
              DevTools
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { loadProcesses(); loadLogs(); }}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab('processes')}
          className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'processes'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Processes
          {otherProcessCount > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs bg-yellow-500 text-white rounded">
              {otherProcessCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('logs')}
          className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'logs'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Logs
          {errorCount > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded">
              {errorCount}
            </span>
          )}
        </button>
      </div>

      {/* Processes Tab */}
      {tab === 'processes' && (
        <>
          {/* Warning Banner */}
          {otherProcessCount > 0 && (
            <div className="mx-4 mt-4 p-3 bg-yellow-500/10 border-2 border-yellow-500/30 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <span className="text-sm text-yellow-700">
                  {otherProcessCount} other instance{otherProcessCount > 1 ? 's' : ''} running
                </span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={killAllExceptCurrent}
              >
                Kill All Others
              </Button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Process List */}
          <div className="flex-1 overflow-auto p-4">
            <div className="space-y-2">
              {processes.map((proc) => (
                <div
                  key={proc.pid}
                  className={`p-3 rounded-lg border-2 flex items-center justify-between ${
                    proc.isCurrent
                      ? 'border-green-500/50 bg-green-500/5'
                      : 'border-border bg-muted/20'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">PID {proc.pid}</span>
                      {proc.isCurrent && (
                        <span className="text-xs px-2 py-0.5 bg-green-500 text-white rounded">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {proc.name} • {formatMemory(proc.memory)}
                    </div>
                  </div>
                  {!proc.isCurrent && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => killProcess(proc.pid)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {processes.length === 0 && !loading && (
                <div className="text-center text-muted-foreground py-8">
                  No processes found
                </div>
              )}
              {loading && processes.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  Loading...
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border text-xs text-muted-foreground space-y-1">
            <div>Current PID: {processes.find(p => p.isCurrent)?.pid || 'Unknown'}</div>
            {encryptionStatus && (
              <>
                <div className={encryptionStatus.isAvailable ? 'text-green-600' : 'text-yellow-600'}>
                  Encryption: {encryptionStatus.isAvailable ? 'Available ✓' : 'Using fallback ⚠'} ({encryptionStatus.platform})
                </div>
                {encryptionStatus.usingPlaintextFallback && (
                  <div className="text-yellow-600">
                    Tokens stored with base64 encoding (dev mode)
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Logs Tab */}
      {tab === 'logs' && (
        <>
          {/* Log Actions */}
          <div className="px-4 py-2 border-b border-border flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {logs.length} log entries
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={copyLogs}>
                {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button variant="secondary" size="sm" onClick={clearLogs}>
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
          </div>

          {/* Log List */}
          <div className="flex-1 overflow-auto p-4 font-mono text-xs">
            {logs.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No logs yet
              </div>
            ) : (
              <div className="space-y-1">
                {logs.map((log, i) => (
                  <div
                    key={i}
                    className={`p-2 rounded ${
                      log.level === 'error'
                        ? 'bg-red-500/10 text-red-600'
                        : log.level === 'warn'
                        ? 'bg-yellow-500/10 text-yellow-700'
                        : 'bg-muted/30 text-muted-foreground'
                    }`}
                  >
                    <span className="text-muted-foreground">[{log.timestamp}]</span>{' '}
                    <span className={`font-semibold ${
                      log.level === 'error' ? 'text-red-500' :
                      log.level === 'warn' ? 'text-yellow-600' : 'text-blue-500'
                    }`}>
                      [{log.level.toUpperCase()}]
                    </span>{' '}
                    {log.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
