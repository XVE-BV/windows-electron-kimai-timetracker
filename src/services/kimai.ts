import { net } from 'electron';
import { getSettings } from './store';
import {
  KimaiCustomer,
  KimaiProject,
  KimaiActivity,
  KimaiTimesheet,
  KimaiTimesheetCreate,
} from '../types';
import { REQUEST_TIMEOUT_MS, KIMAI_MIN_DURATION_SECONDS } from '../constants';
import { NetworkError, AuthenticationError, TimeoutError, errorFromStatus } from '../errors';

class KimaiAPI {
  private getBaseUrl(): string {
    const settings = getSettings();
    return settings.kimai.apiUrl.replace(/\/$/, '');
  }

  private getHeaders(): Record<string, string> {
    const settings = getSettings();
    return {
      Authorization: `Bearer ${settings.kimai.apiToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      throw new NetworkError('Kimai API URL not configured');
    }

    const url = `${baseUrl}/api${endpoint}`;
    const headers = this.getHeaders();

    return new Promise((resolve, reject) => {
      const request = net.request({
        method,
        url,
      });

      // Set timeout
      let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
        timeoutId = null;
        request.abort();
        reject(new TimeoutError('Kimai request timed out'));
      }, REQUEST_TIMEOUT_MS);

      const clearTimeoutSafe = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      Object.entries(headers).forEach(([key, value]) => {
        request.setHeader(key, value);
      });

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
          } else if (statusCode === 401 || statusCode === 403) {
            reject(new AuthenticationError('Invalid Kimai credentials'));
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

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.request<KimaiCustomer[]>('GET', '/customers?visible=1');
      return { success: true, message: 'Connection successful!' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message };
    }
  }

  async getCustomers(): Promise<KimaiCustomer[]> {
    return this.request<KimaiCustomer[]>('GET', '/customers?visible=1');
  }

  async getProjects(customerId?: number): Promise<KimaiProject[]> {
    const params = customerId ? `?customer=${customerId}&visible=1` : '?visible=1';
    return this.request<KimaiProject[]>('GET', `/projects${params}`);
  }

  async getActivities(projectId?: number): Promise<KimaiActivity[]> {
    const params = projectId ? `?project=${projectId}&visible=1` : '?visible=1&globals=true';
    return this.request<KimaiActivity[]>('GET', `/activities${params}`);
  }

  async getTimesheets(params?: {
    user?: string;
    begin?: string;
    end?: string;
    active?: boolean;
  }): Promise<KimaiTimesheet[]> {
    const queryParams = new URLSearchParams();
    if (params?.user) queryParams.append('user', params.user);
    if (params?.begin) queryParams.append('begin', params.begin);
    if (params?.end) queryParams.append('end', params.end);
    if (params?.active !== undefined) queryParams.append('active', params.active ? '1' : '0');

    const query = queryParams.toString();
    return this.request<KimaiTimesheet[]>('GET', `/timesheets${query ? `?${query}` : ''}`);
  }

  async getActiveTimesheets(): Promise<KimaiTimesheet[]> {
    return this.request<KimaiTimesheet[]>('GET', '/timesheets/active');
  }

  async createTimesheet(data: KimaiTimesheetCreate): Promise<KimaiTimesheet> {
    return this.request<KimaiTimesheet>('POST', '/timesheets', data);
  }

  async stopTimesheet(id: number): Promise<KimaiTimesheet> {
    return this.request<KimaiTimesheet>('PATCH', `/timesheets/${id}/stop`);
  }

  async startTimer(
    projectId: number,
    activityId: number,
    description?: string
  ): Promise<KimaiTimesheet> {
    const now = new Date();
    // Round down to nearest 15-minute interval
    const roundedMinutes = Math.floor(now.getMinutes() / 15) * 15;
    now.setMinutes(roundedMinutes, 0, 0);
    const begin = this.formatDateTime(now);

    return this.createTimesheet({
      begin,
      project: projectId,
      activity: activityId,
      description: description || '',
    });
  }

  async stopTimer(timesheetId: number): Promise<KimaiTimesheet> {
    // Round end time to nearest 15-minute interval
    const now = new Date();
    const roundedMinutes = Math.round(now.getMinutes() / 15) * 15;
    now.setMinutes(roundedMinutes, 0, 0);
    // Handle overflow when rounding 53-59 minutes → 60 → next hour
    const end = this.formatDateTime(now);

    return this.updateTimesheet(timesheetId, { end });
  }

  async updateTimesheet(id: number, data: Partial<KimaiTimesheetCreate> & { end?: string }): Promise<KimaiTimesheet> {
    return this.request<KimaiTimesheet>('PATCH', `/timesheets/${id}`, data);
  }

  async deleteTimesheet(id: number): Promise<void> {
    await this.request<void>('DELETE', `/timesheets/${id}`);
  }

  private formatDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }
}

export const kimaiAPI = new KimaiAPI();
export default kimaiAPI;
