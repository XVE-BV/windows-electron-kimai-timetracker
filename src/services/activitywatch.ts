import { net } from 'electron';
import { getSettings } from './store';
import { AWBucket, AWBuckets, AWEvent } from '../types';
import { REQUEST_TIMEOUT_MS } from '../constants';
import { NetworkError, TimeoutError, errorFromStatus } from '../errors';

interface ActivitySummary {
  app: string;
  title: string;
  duration: number;
}

class ActivityWatchAPI {
  // Cache buckets to avoid repeated lookups
  private bucketsCache: AWBuckets | null = null;
  private bucketsCacheTime: number = 0;
  private readonly CACHE_TTL_MS = 60000; // 1 minute

  private getBaseUrl(): string {
    const settings = getSettings();
    return settings.activityWatch.apiUrl.replace(/\/$/, '');
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      throw new NetworkError('ActivityWatch API URL not configured');
    }

    const url = `${baseUrl}/api${endpoint}`;

    return new Promise((resolve, reject) => {
      const request = net.request({
        method,
        url,
      });

      // Set timeout
      let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
        timeoutId = null;
        request.abort();
        reject(new TimeoutError('ActivityWatch request timed out'));
      }, REQUEST_TIMEOUT_MS);

      const clearTimeoutSafe = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      request.setHeader('Content-Type', 'application/json');
      request.setHeader('Accept', 'application/json');

      let responseData = '';

      request.on('response', (response) => {
        response.on('data', (chunk) => {
          responseData += chunk.toString();
        });

        response.on('end', () => {
          clearTimeoutSafe();
          const statusCode = response.statusCode || 0;

          if (statusCode >= 200 && statusCode < 300) {
            try {
              const parsed = responseData ? JSON.parse(responseData) : null;
              resolve(parsed as T);
            } catch {
              resolve(responseData as unknown as T);
            }
          } else {
            reject(errorFromStatus(statusCode, responseData));
          }
        });

        response.on('error', (error) => {
          clearTimeoutSafe();
          reject(new NetworkError(error.message));
        });
      });

      request.on('error', (error) => {
        clearTimeoutSafe();
        reject(new NetworkError(error.message));
      });

      if (body) {
        request.write(JSON.stringify(body));
      }

      request.end();
    });
  }

  async getBuckets(): Promise<AWBuckets> {
    const settings = getSettings();
    if (!settings.activityWatch.enabled) {
      return {};
    }

    // Check cache
    const now = Date.now();
    if (this.bucketsCache && (now - this.bucketsCacheTime) < this.CACHE_TTL_MS) {
      return this.bucketsCache;
    }

    try {
      const buckets = await this.request<AWBuckets>('GET', '/0/buckets/');
      this.bucketsCache = buckets;
      this.bucketsCacheTime = now;
      return buckets;
    } catch (error) {
      console.error('Failed to get ActivityWatch buckets:', error instanceof Error ? error.message : error);
      return {};
    }
  }

  async getEvents(
    bucketId: string,
    start?: string,
    end?: string,
    limit?: number
  ): Promise<AWEvent[]> {
    const settings = getSettings();
    if (!settings.activityWatch.enabled) {
      return [];
    }

    const params = new URLSearchParams();
    if (start) params.append('start', start);
    if (end) params.append('end', end);
    if (limit) params.append('limit', String(limit));

    const query = params.toString();
    const endpoint = `/0/buckets/${encodeURIComponent(bucketId)}/events${query ? `?${query}` : ''}`;

    try {
      return await this.request<AWEvent[]>('GET', endpoint);
    } catch (error) {
      console.error(`Failed to get events for bucket ${bucketId}:`, error instanceof Error ? error.message : error);
      return [];
    }
  }

  async getWindowBucket(): Promise<AWBucket | null> {
    const buckets = await this.getBuckets();
    const windowBuckets = Object.values(buckets).filter(
      (b) => b.type === 'currentwindow'
    );
    return windowBuckets[0] || null;
  }

  async getAfkBucket(): Promise<AWBucket | null> {
    const buckets = await this.getBuckets();
    const afkBuckets = Object.values(buckets).filter(
      (b) => b.type === 'afkstatus'
    );
    return afkBuckets[0] || null;
  }

  async getActivitySummary(
    start: Date,
    end: Date
  ): Promise<ActivitySummary[]> {
    const windowBucket = await this.getWindowBucket();
    if (!windowBucket) {
      return [];
    }

    const events = await this.getEvents(
      windowBucket.id,
      start.toISOString(),
      end.toISOString()
    );

    // Aggregate by app and title
    const aggregated = new Map<string, ActivitySummary>();

    for (const event of events) {
      const data = event.data as { app?: string; title?: string };
      const app = data.app || 'Unknown';
      const title = data.title || 'Unknown';
      const key = `${app}|||${title}`;

      if (aggregated.has(key)) {
        const existing = aggregated.get(key)!;
        existing.duration += event.duration;
      } else {
        aggregated.set(key, {
          app,
          title,
          duration: event.duration,
        });
      }
    }

    // Sort by duration descending
    return Array.from(aggregated.values()).sort(
      (a, b) => b.duration - a.duration
    );
  }

  async getRecentActivity(minutes = 60): Promise<ActivitySummary[]> {
    const end = new Date();
    const start = new Date(end.getTime() - minutes * 60 * 1000);
    return this.getActivitySummary(start, end);
  }

  async isUserActive(): Promise<boolean> {
    const afkBucket = await this.getAfkBucket();
    if (!afkBucket) {
      return true; // Assume active if no AFK bucket
    }

    const events = await this.getEvents(afkBucket.id, undefined, undefined, 1);
    if (events.length === 0) {
      return true;
    }

    const latestEvent = events[0];
    const data = latestEvent.data as { status?: string };
    return data.status !== 'afk';
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // Clear cache to force fresh request
      this.bucketsCache = null;
      await this.getBuckets();
      return { success: true, message: 'ActivityWatch connection successful!' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message };
    }
  }

  /**
   * Clear the buckets cache (useful when settings change)
   */
  clearCache(): void {
    this.bucketsCache = null;
    this.bucketsCacheTime = 0;
  }
}

export const activityWatchAPI = new ActivityWatchAPI();
export default activityWatchAPI;
