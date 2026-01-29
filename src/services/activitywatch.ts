import { net } from 'electron';
import { getSettings } from './store';
import { AWBucket, AWBuckets, AWEvent } from '../types';

interface ActivitySummary {
  app: string;
  title: string;
  duration: number;
}

class ActivityWatchAPI {
  private getBaseUrl(): string {
    const settings = getSettings();
    return settings.activityWatch.apiUrl.replace(/\/$/, '');
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.getBaseUrl()}/api${endpoint}`;

    return new Promise((resolve, reject) => {
      const request = net.request({
        method,
        url,
      });

      request.setHeader('Content-Type', 'application/json');
      request.setHeader('Accept', 'application/json');

      let responseData = '';

      request.on('response', (response) => {
        response.on('data', (chunk) => {
          responseData += chunk.toString();
        });

        response.on('end', () => {
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
            try {
              const parsed = responseData ? JSON.parse(responseData) : null;
              resolve(parsed as T);
            } catch {
              resolve(responseData as unknown as T);
            }
          } else {
            reject(new Error(`HTTP ${response.statusCode}: ${responseData}`));
          }
        });

        response.on('error', (error) => {
          reject(error);
        });
      });

      request.on('error', (error) => {
        reject(error);
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

    try {
      return await this.request<AWBuckets>('GET', '/0/buckets/');
    } catch {
      console.error('Failed to get ActivityWatch buckets');
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
    } catch {
      console.error(`Failed to get events for bucket: ${bucketId}`);
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
      await this.getBuckets();
      return { success: true, message: 'ActivityWatch connection successful!' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message };
    }
  }
}

export const activityWatchAPI = new ActivityWatchAPI();
export default activityWatchAPI;
