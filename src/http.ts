import { APIError, InstapaperConnectionError, InstapaperError, apiErrorFor } from './errors';
import { VERSION } from './version';

export const DEFAULT_BASE_URL = 'https://www.instapaper.com';
export const DEFAULT_TIMEOUT = 30_000;

/** The subset of `RequestInit` this SDK passes to `fetch`. */
export interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  /** Always `manual`, so credentials are never resent to wherever a redirect points. */
  redirect: 'manual';
}

/** The subset of `Response` this SDK reads. */
export interface FetchResponse {
  status: number;
  ok: boolean;
  text(): Promise<string>;
}

/** A `fetch`-compatible function. The global `fetch` satisfies this. */
export type FetchLike = (url: string, init: FetchInit) => Promise<FetchResponse>;

export type QueryValue = string | number | boolean | undefined | null;

export interface TransportOptions {
  baseUrl?: string;
  /** Request timeout in milliseconds. `0` disables it. Defaults to 30 seconds. */
  timeout?: number;
  /** A custom `fetch`. Defaults to the global one. */
  fetch?: FetchLike;
}

interface SendOptions {
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  body?: string;
}

interface RawResponse {
  status: number;
  ok: boolean;
  text: string;
}

/** Low-level request plumbing shared by the API client and the OAuth helper. */
export class Transport {
  readonly baseUrl: string;
  readonly timeout: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: TransportOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
    const fetchImpl = options.fetch ?? (globalFetch ? globalFetch.bind(globalThis) : undefined);
    if (!fetchImpl) {
      throw new InstapaperError(
        'No fetch implementation is available. Use Node 18 or newer, or pass options.fetch.',
      );
    }
    this.fetchImpl = fetchImpl;
  }

  url(path: string, query?: Record<string, QueryValue>): string {
    let url = `${this.baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        params.append(key, String(value));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }
    return url;
  }

  async send(method: string, path: string, options: SendOptions = {}): Promise<RawResponse> {
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    if (canSetUserAgent()) headers['User-Agent'] = `instapaper-api-js/${VERSION}`;

    const controller = this.timeout > 0 ? new AbortController() : undefined;
    let timedOut = false;
    const timer = controller
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, this.timeout)
      : undefined;

    try {
      const init: FetchInit = { method, headers, redirect: 'manual' };
      if (options.body !== undefined) init.body = options.body;
      if (controller) init.signal = controller.signal;
      const response = await this.fetchImpl(this.url(path, options.query), init);
      // Read the body inside the timeout too, so a stalled body can't hang forever.
      const text = await response.text();
      return { status: response.status, ok: response.ok, text };
    } catch (err) {
      if (timedOut) {
        throw new InstapaperConnectionError(`Request timed out after ${this.timeout}ms`, {
          cause: err,
        });
      }
      const detail = err instanceof Error ? err.message : String(err);
      throw new InstapaperConnectionError(`Network error: ${detail}`, { cause: err });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}

/** Parse a body as JSON, returning the raw text if it isn't JSON and `undefined` if empty. */
export function parseBody(text: string): unknown {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  json?: unknown;
  /** Whether a successful response must be a JSON object. `false` for empty-body endpoints. */
  expectJson?: boolean;
}

/** JSON API requests with bearer auth and error mapping. */
export class ApiClient {
  constructor(
    private readonly transport: Transport,
    private readonly accessToken: string,
  ) {}

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.accessToken}` };
    let body: string | undefined;
    if (options.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.json);
    }

    const response = await this.transport.send(method, `/api/2${path}`, {
      query: options.query,
      headers,
      body,
    });
    const parsed = parseBody(response.text);

    if (isRedirect(response.status)) {
      // We never follow redirects: that would resend the bearer token elsewhere.
      throw new APIError(
        `Unexpected redirect (status ${response.status}); the request was not followed`,
        response.status,
        parsed,
      );
    }
    if (!response.ok) throw apiErrorFor(response.status, parsed);
    if (options.expectJson === false) return undefined as T;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new APIError('Expected a JSON object in the response', response.status, parsed);
    }
    return parsed as T;
  }
}

/**
 * With `redirect: 'manual'`, Node and most runtimes hand back the 3xx response
 * itself, while browsers return an opaque response with status 0.
 */
export function isRedirect(status: number): boolean {
  return status === 0 || (status >= 300 && status < 400);
}

function canSetUserAgent(): boolean {
  // Browsers either forbid or ignore a custom User-Agent; everywhere else it's fine.
  return typeof (globalThis as { document?: unknown }).document === 'undefined';
}
