import { net } from 'electron';
import { getSettings } from './store';
import { JiraIssue, JiraSearchResult } from '../types';

class JiraAPI {
  private getBaseUrl(): string {
    const settings = getSettings();
    return settings.jira.apiUrl.replace(/\/$/, '');
  }

  private getHeaders(): Record<string, string> {
    const settings = getSettings();
    const auth = Buffer.from(`${settings.jira.email}:${settings.jira.apiToken}`).toString('base64');
    return {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.getBaseUrl()}/rest/api/3${endpoint}`;
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
      // Use serverInfo instead of /myself since users may not grant profile permissions
      const result = await this.request<{ baseUrl: string; serverTitle: string }>('GET', '/serverInfo');
      return { success: true, message: `Connected to ${result.serverTitle}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message };
    }
  }

  async getMyIssues(maxResults: number = 20): Promise<JiraIssue[]> {
    const jql = 'assignee = currentUser() AND status != Done ORDER BY updated DESC';
    // Include customfield_10278 which contains customer info
    const fields = 'summary,status,issuetype,priority,assignee,project,updated,created,customfield_10278';

    // Use the new /search/jql endpoint (the old /search endpoint was deprecated)
    const result = await this.request<JiraSearchResult>(
      'GET',
      `/search/jql?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=${maxResults}`
    );

    return result.issues;
  }

  async searchIssues(jql: string, maxResults: number = 20): Promise<JiraIssue[]> {
    const fields = 'summary,status,issuetype,priority,assignee,project,updated,created';

    // Use the new /search/jql endpoint (the old /search endpoint was deprecated)
    const result = await this.request<JiraSearchResult>(
      'GET',
      `/search/jql?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=${maxResults}`
    );

    return result.issues;
  }
}

export const jiraAPI = new JiraAPI();
export default jiraAPI;
