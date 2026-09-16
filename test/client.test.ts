import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  APIError,
  AuthenticationError,
  BadRequestError,
  Instapaper,
  InstapaperConnectionError,
  InstapaperError,
  NotFoundError,
  PermissionDeniedError,
  QuotaExceededError,
  RateLimitError,
  ServerError,
  VERSION,
} from '../src';
import { jsonResponse, mockFetch, parsedUrl, textResponse, user } from './helpers';
import pkg from '../package.json';

function client(fetch: ReturnType<typeof mockFetch>['fetch'], extra = {}) {
  return new Instapaper({ accessToken: 'tok-123', fetch, ...extra });
}

describe('Instapaper client', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('requires an access token', () => {
    expect(() => new Instapaper({ accessToken: '' })).toThrow(TypeError);
    // @ts-expect-error missing options
    expect(() => new Instapaper()).toThrow(TypeError);
  });

  it('fetches the current user with bearer auth and standard headers', async () => {
    const { fetch, calls } = mockFetch(jsonResponse(200, user()));
    const me = await client(fetch).me();

    expect(me).toEqual(user());
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://www.instapaper.com/api/2/me');
    expect(calls[0]!.init.method).toBe('GET');
    expect(calls[0]!.init.headers).toMatchObject({
      Authorization: 'Bearer tok-123',
      Accept: 'application/json',
      'User-Agent': `instapaper-api-js/${VERSION}`,
    });
    expect(calls[0]!.init.body).toBeUndefined();
    expect(calls[0]!.init.headers['Content-Type']).toBeUndefined();
  });

  it('keeps VERSION in step with package.json', () => {
    expect(VERSION).toBe(pkg.version);
  });

  it('uses a custom base URL without doubling slashes', async () => {
    const { fetch, calls } = mockFetch(jsonResponse(200, user()));
    await client(fetch, { baseUrl: 'http://localhost:8000/' }).me();
    expect(calls[0]!.url).toBe('http://localhost:8000/api/2/me');
  });

  it('skips the User-Agent header in browsers', async () => {
    vi.stubGlobal('document', {});
    const { fetch, calls } = mockFetch(jsonResponse(200, user()));
    await client(fetch).me();
    expect(calls[0]!.init.headers['User-Agent']).toBeUndefined();
  });

  it('falls back to the global fetch', async () => {
    const { fetch, calls } = mockFetch(jsonResponse(200, user()));
    vi.stubGlobal('fetch', fetch);
    await new Instapaper({ accessToken: 'tok-123' }).me();
    expect(calls).toHaveLength(1);
  });

  it('explains when no fetch is available', () => {
    vi.stubGlobal('fetch', undefined);
    expect(() => new Instapaper({ accessToken: 'tok-123' })).toThrow(/No fetch implementation/);
  });

  describe('errors', () => {
    it.each([
      [400, BadRequestError],
      [401, AuthenticationError],
      [402, QuotaExceededError],
      [403, PermissionDeniedError],
      [404, NotFoundError],
      [429, RateLimitError],
      [500, ServerError],
      [503, ServerError],
    ])('maps %i to %s with the server message', async (status, ErrorClass) => {
      const body = { error: { code: status, message: `Message for ${status}` } };
      const { fetch } = mockFetch(jsonResponse(status, body));
      const err = await client(fetch)
        .me()
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ErrorClass);
      expect(err).toBeInstanceOf(APIError);
      expect(err).toBeInstanceOf(InstapaperError);
      expect(err).toBeInstanceOf(Error);
      const apiError = err as APIError;
      expect(apiError.name).toBe(ErrorClass.name);
      expect(apiError.status).toBe(status);
      expect(apiError.message).toBe(`Message for ${status}`);
      expect(apiError.body).toEqual(body);
    });

    it('handles the empty-body 401 a bad token gets', async () => {
      const { fetch } = mockFetch(textResponse(401, ''));
      const err = (await client(fetch)
        .me()
        .catch((e: unknown) => e)) as AuthenticationError;
      expect(err).toBeInstanceOf(AuthenticationError);
      expect(err.message).toBe('Authentication failed');
      expect(err.body).toBeUndefined();
    });

    it('keeps a non-JSON error body as text', async () => {
      const { fetch } = mockFetch(textResponse(502, '<html>Bad Gateway</html>'));
      const err = (await client(fetch)
        .me()
        .catch((e: unknown) => e)) as ServerError;
      expect(err).toBeInstanceOf(ServerError);
      expect(err.message).toBe('Server error');
      expect(err.body).toBe('<html>Bad Gateway</html>');
    });

    it('uses a generic APIError for other statuses', async () => {
      const { fetch } = mockFetch(jsonResponse(409, { unexpected: true }));
      const err = (await client(fetch)
        .me()
        .catch((e: unknown) => e)) as APIError;
      expect(err.constructor).toBe(APIError);
      expect(err.message).toBe('Request failed with status 409');
    });

    it.each([
      ['non-JSON text', textResponse(200, 'not json'), 'not json'],
      ['an empty body', textResponse(200, ''), undefined],
      ['a JSON array', jsonResponse(200, [1, 2]), [1, 2]],
    ])('throws APIError when a success response is %s', async (_label, response, body) => {
      const { fetch } = mockFetch(response);
      const err = (await client(fetch)
        .me()
        .catch((e: unknown) => e)) as APIError;
      expect(err.constructor).toBe(APIError);
      expect(err.status).toBe(200);
      expect(err.message).toBe('Expected a JSON object in the response');
      expect(err.body).toEqual(body);
    });

    it('never follows redirects, so the token stays on this host', async () => {
      const { fetch, calls } = mockFetch(textResponse(302, ''));
      const err = (await client(fetch)
        .me()
        .catch((e: unknown) => e)) as APIError;

      expect(calls).toHaveLength(1);
      expect(calls[0]!.init.redirect).toBe('manual');
      expect(err.constructor).toBe(APIError);
      expect(err.status).toBe(302);
      expect(err.message).toMatch(/Unexpected redirect/);
    });

    it('treats an opaque redirect (status 0) as an error too', async () => {
      const { fetch } = mockFetch({ status: 0, ok: false, text: async () => '' });
      const err = (await client(fetch)
        .me()
        .catch((e: unknown) => e)) as APIError;
      expect(err).toBeInstanceOf(APIError);
      expect(err.status).toBe(0);
    });

    it('wraps network failures', async () => {
      const cause = new TypeError('fetch failed');
      const { fetch } = mockFetch(cause);
      const err = (await client(fetch)
        .me()
        .catch((e: unknown) => e)) as InstapaperConnectionError;
      expect(err).toBeInstanceOf(InstapaperConnectionError);
      expect(err).toBeInstanceOf(InstapaperError);
      expect(err.message).toBe('Network error: fetch failed');
      expect(err.cause).toBe(cause);
    });

    it('times out a request that never answers', async () => {
      vi.useFakeTimers();
      const { fetch } = mockFetch();
      fetch.mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      );
      const pending = client(fetch, { timeout: 50 })
        .me()
        .catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(50);
      const err = (await pending) as InstapaperConnectionError;
      expect(err).toBeInstanceOf(InstapaperConnectionError);
      expect(err.message).toBe('Request timed out after 50ms');
      expect(err.cause).toBeInstanceOf(DOMException);
    });

    it('can disable the timeout', async () => {
      const { fetch, calls } = mockFetch(jsonResponse(200, user()));
      await client(fetch, { timeout: 0 }).me();
      expect(calls[0]!.init.signal).toBeUndefined();
    });

    it('passes an abort signal when a timeout is set', async () => {
      const { fetch, calls } = mockFetch(jsonResponse(200, user()));
      await client(fetch).me();
      expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
      expect(parsedUrl(calls[0]).pathname).toBe('/api/2/me');
    });
  });
});
