import React, { useEffect, useState } from 'react';
import { ScrollText, X, Loader2, ExternalLink, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';

interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

export function ChangelogView() {
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReleases();
  }, []);

  const fetchReleases = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await window.electronAPI.githubGetReleases();
      setReleases(data);
    } catch (err) {
      console.error('Failed to fetch releases:', err);
      setError('Could not load changelog. Check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Simple markdown-like rendering for release body
  const renderBody = (body: string) => {
    if (!body) return <p className="text-sm text-muted-foreground">No release notes.</p>;

    return body.split('\n').map((line, idx) => {
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) return null;

      // Headers (## What's Changed, etc.)
      if (trimmed.startsWith('## ')) {
        return (
          <h4 key={idx} className="text-sm font-semibold mt-3 mb-1">
            {trimmed.replace('## ', '')}
          </h4>
        );
      }

      // List items with links (* item by @user in url)
      if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        const content = trimmed.slice(2);
        // Parse markdown links [text](url)
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        let match;

        while ((match = linkRegex.exec(content)) !== null) {
          // Add text before the link
          if (match.index > lastIndex) {
            parts.push(content.slice(lastIndex, match.index));
          }
          // Add the link
          const url = match[2];
          parts.push(
            <a
              key={match.index}
              href={url}
              className="text-primary hover:underline cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                window.electronAPI?.openExternal(url);
              }}
            >
              {match[1]}
            </a>
          );
          lastIndex = match.index + match[0].length;
        }
        // Add remaining text
        if (lastIndex < content.length) {
          parts.push(content.slice(lastIndex));
        }

        return (
          <li key={idx} className="text-sm text-foreground/90 ml-4 list-disc">
            {parts.length > 0 ? parts : content}
          </li>
        );
      }

      // Regular text
      return (
        <p key={idx} className="text-sm text-muted-foreground">
          {trimmed}
        </p>
      );
    });
  };

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

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading releases...</span>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchReleases} className="mt-4">
              Try again
            </Button>
          </div>
        )}

        {!loading && !error && releases.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">No releases found.</p>
          </div>
        )}

        {!loading && !error && releases.length > 0 && (
          <div className="space-y-6">
            {releases.map((release) => (
              <div key={release.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-primary">{release.tag_name}</span>
                    {release.name && release.name !== release.tag_name && (
                      <span className="text-sm text-muted-foreground">— {release.name}</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(release.published_at)}
                  </span>
                </div>
                <div className="pl-2 border-l-2 border-border space-y-1">
                  {renderBody(release.body)}
                </div>
                <a
                  href={release.html_url}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault();
                    window.electronAPI?.openExternal(release.html_url);
                  }}
                >
                  <ExternalLink className="h-3 w-3" />
                  View on GitHub
                </a>
              </div>
            ))}
          </div>
        )}
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
