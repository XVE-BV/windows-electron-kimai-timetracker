/**
 * Runtime validation utilities for IPC parameters
 */

import { ValidationError } from './errors';
import { AppSettings, KimaiTimesheetCreate } from './types';

/**
 * Validate that a value is a non-negative integer
 */
export function validatePositiveInt(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ValidationError(`${fieldName} must be a non-negative integer`, fieldName);
  }
  return value;
}

/**
 * Validate that a value is a positive integer (> 0)
 */
export function validateStrictPositiveInt(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${fieldName} must be a positive integer`, fieldName);
  }
  return value;
}

/**
 * Validate that a value is a non-empty string
 */
export function validateNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} must be a non-empty string`, fieldName);
  }
  return value.trim();
}

/**
 * Validate that a value is a string (can be empty)
 */
export function validateString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`, fieldName);
  }
  return value;
}

/**
 * Validate optional string
 */
export function validateOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return validateString(value, fieldName);
}

/**
 * Validate optional positive integer
 */
export function validateOptionalPositiveInt(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return validatePositiveInt(value, fieldName);
}

/**
 * Validate URL format
 */
export function validateUrl(value: unknown, fieldName: string): string {
  const str = validateNonEmptyString(value, fieldName);
  try {
    const url = new URL(str);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new ValidationError(`${fieldName} must be an HTTP or HTTPS URL`, fieldName);
    }
    return str;
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    throw new ValidationError(`${fieldName} must be a valid URL`, fieldName);
  }
}

/**
 * Validate ISO date string
 */
export function validateISODateString(value: unknown, fieldName: string): string {
  const str = validateNonEmptyString(value, fieldName);
  const date = new Date(str);
  if (isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid ISO date string`, fieldName);
  }
  return str;
}

/**
 * Validate AppSettings structure
 */
export function validateAppSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') {
    throw new ValidationError('Settings must be an object');
  }

  const settings = value as Record<string, unknown>;

  // Validate kimai settings
  if (!settings.kimai || typeof settings.kimai !== 'object') {
    throw new ValidationError('Settings must include kimai configuration');
  }
  const kimai = settings.kimai as Record<string, unknown>;
  if (typeof kimai.apiUrl !== 'string') {
    throw new ValidationError('Kimai API URL must be a string');
  }
  if (typeof kimai.apiToken !== 'string') {
    throw new ValidationError('Kimai API token must be a string');
  }

  // Validate activityWatch settings
  if (!settings.activityWatch || typeof settings.activityWatch !== 'object') {
    throw new ValidationError('Settings must include activityWatch configuration');
  }
  const aw = settings.activityWatch as Record<string, unknown>;
  if (typeof aw.apiUrl !== 'string') {
    throw new ValidationError('ActivityWatch API URL must be a string');
  }
  if (typeof aw.enabled !== 'boolean') {
    throw new ValidationError('ActivityWatch enabled must be a boolean');
  }

  // Validate jira settings (optional but must be valid if present)
  if (settings.jira && typeof settings.jira === 'object') {
    const jira = settings.jira as Record<string, unknown>;
    if (typeof jira.apiUrl !== 'string') {
      throw new ValidationError('Jira API URL must be a string');
    }
    if (typeof jira.email !== 'string') {
      throw new ValidationError('Jira email must be a string');
    }
    if (typeof jira.apiToken !== 'string') {
      throw new ValidationError('Jira API token must be a string');
    }
  }

  return value as AppSettings;
}

/**
 * Validate KimaiTimesheetCreate structure
 */
export function validateTimesheetCreate(value: unknown): KimaiTimesheetCreate {
  if (!value || typeof value !== 'object') {
    throw new ValidationError('Timesheet data must be an object');
  }

  const data = value as Record<string, unknown>;

  validateNonEmptyString(data.begin, 'begin');
  validateStrictPositiveInt(data.project, 'project');
  validateStrictPositiveInt(data.activity, 'activity');

  return value as KimaiTimesheetCreate;
}

/**
 * Sanitize JQL query (basic protection against injection)
 */
export function sanitizeJql(jql: string): string {
  // Remove potentially dangerous characters but allow normal JQL syntax
  // JQL uses quotes, operators like =, !=, ~, IN, NOT IN, etc.
  // We'll just ensure it doesn't contain obvious script injection
  const sanitized = jql
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .trim();

  if (sanitized.length > 1000) {
    throw new ValidationError('JQL query too long', 'jql');
  }

  return sanitized;
}
