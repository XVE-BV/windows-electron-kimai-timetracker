/**
 * Custom error types for better error handling
 */

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NetworkError extends AppError {
  constructor(message: string, public statusCode?: number) {
    super(message, 'NETWORK_ERROR', true);
    this.name = 'NetworkError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 'AUTH_ERROR', true);
    this.name = 'AuthenticationError';
  }
}

export class TimeoutError extends AppError {
  constructor(message = 'Request timed out') {
    super(message, 'TIMEOUT_ERROR', true);
    this.name = 'TimeoutError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public field?: string) {
    super(message, 'VALIDATION_ERROR', true);
    this.name = 'ValidationError';
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR', true);
    this.name = 'ConfigurationError';
  }
}

/**
 * Type guard for checking if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Get user-friendly error message
 */
export function getUserMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

/**
 * Create error from HTTP status code
 */
export function errorFromStatus(statusCode: number, body?: string): AppError {
  switch (statusCode) {
    case 401:
    case 403:
      return new AuthenticationError('Invalid credentials or insufficient permissions');
    case 404:
      return new NetworkError('Resource not found', statusCode);
    case 408:
    case 504:
      return new TimeoutError('Request timed out');
    case 429:
      return new NetworkError('Too many requests - please try again later', statusCode);
    case 500:
    case 502:
    case 503:
      return new NetworkError('Server error - please try again later', statusCode);
    default:
      return new NetworkError(body || `Request failed with status ${statusCode}`, statusCode);
  }
}
