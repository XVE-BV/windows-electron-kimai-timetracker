import { net } from 'electron';
import { getSettings } from './store';
import { JiraIssue, JiraSearchResult } from '../types';
import { REQUEST_TIMEOUT_MS } from '../constants';
import { NetworkError, AuthenticationError, TimeoutError, errorFromStatus } from '../errors';

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
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      throw new NetworkError('Jira API URL not configured');
    }

    const url = `${baseUrl}/rest/api/3${endpoint}`;
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
        reject(new TimeoutError('Jira request timed out'));
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
            reject(new AuthenticationError('Invalid Jira credentials'));
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
      // Use serverInfo instead of /myself since users may not grant profile permissions
      const result = await this.request<{ baseUrl: string; serverTitle: string }>('GET', '/serverInfo');
      return { success: true, message: `Connected to ${result.serverTitle}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message };
    }
  }

  async getMyIssues(maxResults = 20): Promise<JiraIssue[]> {
    // Use statusCategory instead of status to handle different status names across Jira instances
    // statusCategory groups statuses: "To Do", "In Progress", "Done" (regardless of actual status name)
    const jql = 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC';
    // Include customfield_10278 (customer) and timetracking (estimates)
    const fields = 'summary,status,issuetype,priority,assignee,project,updated,created,customfield_10278,timetracking';

    // Use the new /search/jql endpoint (the old /search endpoint was deprecated)
    const result = await this.request<JiraSearchResult>(
      'GET',
      `/search/jql?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=${maxResults}`
    );

    return result.issues;
  }

  async searchIssues(jql: string, maxResults = 20): Promise<JiraIssue[]> {
    const fields = 'summary,status,issuetype,priority,assignee,project,updated,created,customfield_10278,timetracking';

    // Use the new /search/jql endpoint (the old /search endpoint was deprecated)
    const result = await this.request<JiraSearchResult>(
      'GET',
      `/search/jql?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=${maxResults}`
    );

    return result.issues;
  }

  async addWorklog(
    issueKey: string,
    timeSpentSeconds: number,
    started: Date,
    comment?: string
  ): Promise<{ id: string }> {
    const body: {
      timeSpentSeconds: number;
      started: string;
      comment?: { type: string; version: number; content: { type: string; content: { type: string; text: string }[] }[] };
    } = {
      timeSpentSeconds,
      started: started.toISOString().replace('Z', '+0000'),
    };

    if (comment) {
      body.comment = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: comment }],
          },
        ],
      };
    }

    return this.request<{ id: string }>('POST', `/issue/${issueKey}/worklog`, body);
  }

  async getTransitions(issueKey: string): Promise<{ id: string; name: string; to: { name: string } }[]> {
    const result = await this.request<{ transitions: { id: string; name: string; to: { name: string } }[] }>(
      'GET',
      `/issue/${issueKey}/transitions`
    );
    return result.transitions;
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    await this.request<void>('POST', `/issue/${issueKey}/transitions`, {
      transition: { id: transitionId },
    });
  }

  async transitionToInProgress(issueKey: string): Promise<{ success: boolean; message: string }> {
    try {
      const transitions = await this.getTransitions(issueKey);
      // Find a transition that leads to "In Progress"
      const inProgressTransition = transitions.find(t =>
        t.to.name.toLowerCase() === 'in progress'
      );

      if (!inProgressTransition) {
        return { success: false, message: 'No transition to "In Progress" available' };
      }

      await this.transitionIssue(issueKey, inProgressTransition.id);
      return { success: true, message: `Transitioned to ${inProgressTransition.to.name}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message };
    }
  }
}

export const jiraAPI = new JiraAPI();
export default jiraAPI;
