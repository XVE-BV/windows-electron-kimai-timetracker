import React, { useEffect, useState } from 'react';
import { ScrollText, Loader2, ExternalLink, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import ReactMarkdown from 'react-markdown';

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

  const goBack = () => {
    window.electronAPI?.openTray();
  };

  return (
    <div className="w-full bg-background overflow-hidden h-screen flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <div className="p-2 bg-primary/20 rounded-lg">
            <ScrollText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Changelog</h1>
            <p className="text-xs text-muted-foreground">What's new in Kimai Tracker</p>
          </div>
        </div>
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
                <div className="pl-3 border-l-2 border-border prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => <h3 className="text-base font-bold mt-3 mb-1">{children}</h3>,
                      h2: ({ children }) => <h4 className="text-sm font-bold mt-3 mb-1">{children}</h4>,
                      h3: ({ children }) => <h5 className="text-sm font-semibold mt-2 mb-1">{children}</h5>,
                      p: ({ children }) => <p className="text-sm text-foreground/90 my-1">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1">{children}</ol>,
                      li: ({ children }) => <li className="text-sm text-foreground/90">{children}</li>,
                      a: ({ href, children }) => (
                        <a
                          href={href}
                          className="text-primary hover:underline cursor-pointer"
                          onClick={(e) => {
                            e.preventDefault();
                            if (href) window.electronAPI?.openExternal(href);
                          }}
                        >
                          {children}
                        </a>
                      ),
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      em: ({ children }) => <em className="italic">{children}</em>,
                      code: ({ children }) => (
                        <code className="px-1 py-0.5 bg-muted rounded text-xs">{children}</code>
                      ),
                    }}
                  >
                    {release.body || 'No release notes.'}
                  </ReactMarkdown>
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
          onClick={goBack}
          className="w-full"
        >
          Back
        </Button>
      </div>
    </div>
  );
}
