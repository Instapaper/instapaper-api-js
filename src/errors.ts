/** Base class for every error this SDK throws. */
export class InstapaperError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'InstapaperError';
    Object.setPrototypeOf(this, new.target.prototype);
    if (options && 'cause' in options && this.cause === undefined) {
      this.cause = options.cause;
    }
  }
}

/** The API answered with an error status. */
export class APIError extends InstapaperError {
  /** HTTP status code. */
  readonly status: number;
  /** The parsed JSON body, the raw text if it wasn't JSON, or `undefined` if empty. */
  readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.body = body;
  }
}

/** 400: the request was malformed, or an argument was missing or invalid. */
export class BadRequestError extends APIError {
  constructor(message: string, status = 400, body?: unknown) {
    super(message, status, body);
    this.name = 'BadRequestError';
  }
}

/** 401: the access token is missing, unknown, or revoked. */
export class AuthenticationError extends APIError {
  constructor(message: string, status = 401, body?: unknown) {
    super(message, status, body);
    this.name = 'AuthenticationError';
  }
}

/** 402: an external content quota is exhausted (e.g. Instaparser credits). */
export class QuotaExceededError extends APIError {
  constructor(message: string, status = 402, body?: unknown) {
    super(message, status, body);
    this.name = 'QuotaExceededError';
  }
}

/** 403: authenticated, but not allowed (unapproved or suspended app, or a Premium feature). */
export class PermissionDeniedError extends APIError {
  constructor(message: string, status = 403, body?: unknown) {
    super(message, status, body);
    this.name = 'PermissionDeniedError';
  }
}

/** 404: no such endpoint. */
export class NotFoundError extends APIError {
  constructor(message: string, status = 404, body?: unknown) {
    super(message, status, body);
    this.name = 'NotFoundError';
  }
}

/** 429: rate limited. Back off and retry later. */
export class RateLimitError extends APIError {
  constructor(message: string, status = 429, body?: unknown) {
    super(message, status, body);
    this.name = 'RateLimitError';
  }
}

/** 5xx: something went wrong on Instapaper's side. Retry with backoff. */
export class ServerError extends APIError {
  constructor(message: string, status = 500, body?: unknown) {
    super(message, status, body);
    this.name = 'ServerError';
  }
}

/** The OAuth token endpoint rejected a request (RFC 6749 error response). */
export class OAuthError extends InstapaperError {
  readonly status: number;
  /** The OAuth error code, e.g. `invalid_grant`. */
  readonly error: string;
  readonly description: string;

  constructor(status: number, error: string, description: string) {
    super(`${error}: ${description}`);
    this.name = 'OAuthError';
    this.status = status;
    this.error = error;
    this.description = description;
  }
}

/** The request never got a response: a network failure or a timeout. */
export class InstapaperConnectionError extends InstapaperError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'InstapaperConnectionError';
  }
}

const DEFAULT_MESSAGES: Record<number, string> = {
  400: 'Bad request',
  401: 'Authentication failed',
  402: 'Quota exceeded',
  403: 'Permission denied',
  404: 'Not found',
  429: 'Rate limit exceeded',
};

/** Build the right APIError subclass for a failed response. */
export function apiErrorFor(status: number, body: unknown): APIError {
  const message = errorMessage(body) ?? defaultMessage(status);
  switch (status) {
    case 400:
      return new BadRequestError(message, status, body);
    case 401:
      return new AuthenticationError(message, status, body);
    case 402:
      return new QuotaExceededError(message, status, body);
    case 403:
      return new PermissionDeniedError(message, status, body);
    case 404:
      return new NotFoundError(message, status, body);
    case 429:
      return new RateLimitError(message, status, body);
    default:
      if (status >= 500) return new ServerError(message, status, body);
      return new APIError(message, status, body);
  }
}

function defaultMessage(status: number): string {
  if (DEFAULT_MESSAGES[status]) return DEFAULT_MESSAGES[status];
  if (status >= 500) return 'Server error';
  return `Request failed with status ${status}`;
}

function errorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const error = (body as { error?: unknown }).error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return undefined;
}
