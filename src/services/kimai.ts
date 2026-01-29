import { net } from 'electron';
import { getSettings } from './store';
import {
  KimaiCustomer,
  KimaiProject,
  KimaiActivity,
  KimaiTimesheet,
  KimaiTimesheetCreate,
} from '../types';

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
    const url = `${this.getBaseUrl()}/api${endpoint}`;
    const headers = this.getHeaders();

    return new Promise((resolve, reject) => {
      const request = net.request({
        method,
        url,
      });

      Object.entries(headers).forEach(([key, value]) => {
        request.setHeader(key, value);
      });

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
    const begin = this.formatDateTime(now);

    return this.createTimesheet({
      begin,
      project: projectId,
      activity: activityId,
      description: description || '',
    });
  }

  async stopTimer(timesheetId: number): Promise<KimaiTimesheet> {
    // Stop the timer first
    const stoppedTimesheet = await this.stopTimesheet(timesheetId);

    // Enforce minimum 15 minute duration
    const minDurationSeconds = 15 * 60; // 15 minutes
    if (stoppedTimesheet.duration < minDurationSeconds) {
      // Calculate new end time: begin + 15 minutes
      const beginDate = new Date(stoppedTimesheet.begin);
      const newEndDate = new Date(beginDate.getTime() + minDurationSeconds * 1000);

      // Update the timesheet with new end time
      return this.updateTimesheet(timesheetId, {
        end: this.formatDateTime(newEndDate),
      });
    }

    return stoppedTimesheet;
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
