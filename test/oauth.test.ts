import { describe, expect, it } from 'vitest';
import { InstapaperConnectionError, InstapaperError, OAuth, OAuthError } from '../src';
import { jsonResponse, mockFetch, parsedUrl, textResponse } from './helpers';

const options = {
  clientId: 'client-key',
  clientSecret: 'client-secret',
  redirectUri: 'https://app.example.com/callback',
};

describe('OAuth', () => {
  it('requires client credentials and a redirect URI', () => {
    expect(() => new OAuth({ ...options, clientId: '' })).toThrow(/clientId/);
    expect(() => new OAuth({ ...options, clientSecret: '' })).toThrow(/clientSecret/);
    expect(() => new OAuth({ ...options, redirectUri: '' })).toThrow(/redirectUri/);
  });

  it('builds the authorization URL', () => {
    const { fetch } = mockFetch();
    const oauth = new OAuth({ ...options, fetch });

    const url = new URL(oauth.authorizationUrl({ state: 'xyz 1' }));
    expect(url.origin + url.pathname).toBe('https://www.instapaper.com/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'client-key',
      redirect_uri: 'https://app.example.com/callback',
      response_type: 'code',
      state: 'xyz 1',
    });

    const withoutState = new URL(oauth.authorizationUrl());
    expect(withoutState.searchParams.has('state')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('honors a custom base URL', () => {
    const { fetch } = mockFetch();
    const oauth = new OAuth({ ...options, fetch, baseUrl: 'http://localhost:8000' });
    expect(oauth.authorizationUrl()).toMatch(/^http:\/\/localhost:8000\/oauth2\/authorize\?/);
  });

  it('exchanges a code for a token with a form-encoded POST', async () => {
    const token = {
      token_type: 'Bearer',
      access_token: 'aabbccdd',
      user: { id: 42, username: 'reader@example.com' },
    };
    const { fetch, calls } = mockFetch(jsonResponse(200, token));
    const oauth = new OAuth({ ...options, fetch });

    expect(await oauth.exchangeCode('code-123')).toEqual(token);
    expect(calls[0]!.init.method).toBe('POST');
    expect(parsedUrl(calls[0]).href).toBe('https://www.instapaper.com/oauth2/token');
    expect(calls[0]!.init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(calls[0]!.init.headers.Authorization).toBeUndefined();
    expect(calls[0]!.init.redirect).toBe('manual');
    expect(Object.fromEntries(new URLSearchParams(calls[0]!.init.body))).toEqual({
      client_id: 'client-key',
      client_secret: 'client-secret',
      redirect_uri: 'https://app.example.com/callback',
      code: 'code-123',
    });
  });

  it.each([
    [400, 'invalid_grant', 'The authorization code is invalid, expired, or already used.'],
    [401, 'invalid_client', 'Unknown client_id, or client_secret does not match.'],
    [403, 'unauthorized_client', 'Application is suspended.'],
  ])('throws OAuthError for a %i %s', async (status, error, description) => {
    const { fetch } = mockFetch(jsonResponse(status, { error, error_description: description }));
    const err = (await new OAuth({ ...options, fetch })
      .exchangeCode('code')
      .catch((e: unknown) => e)) as OAuthError;

    expect(err).toBeInstanceOf(OAuthError);
    expect(err).toBeInstanceOf(InstapaperError);
    expect(err.name).toBe('OAuthError');
    expect(err.status).toBe(status);
    expect(err.error).toBe(error);
    expect(err.description).toBe(description);
    expect(err.message).toBe(`${error}: ${description}`);
  });

  it('refuses to follow a redirect from the token endpoint', async () => {
    const { fetch, calls } = mockFetch(textResponse(307, ''));
    const err = (await new OAuth({ ...options, fetch })
      .exchangeCode('code')
      .catch((e: unknown) => e)) as OAuthError;
    expect(calls).toHaveLength(1);
    expect(err).toBeInstanceOf(OAuthError);
    expect(err.status).toBe(307);
    expect(err.error).toBe('unexpected_redirect');
  });

  it('handles a non-JSON error response', async () => {
    const { fetch } = mockFetch(textResponse(500, 'Internal Server Error'));
    const err = (await new OAuth({ ...options, fetch })
      .exchangeCode('code')
      .catch((e: unknown) => e)) as OAuthError;
    expect(err).toBeInstanceOf(OAuthError);
    expect(err.error).toBe('unknown_error');
    expect(err.description).toBe('Token request failed with status 500');
  });

  it('rejects a success response without an access token', async () => {
    const { fetch } = mockFetch(jsonResponse(200, { token_type: 'Bearer' }));
    await expect(new OAuth({ ...options, fetch }).exchangeCode('code')).rejects.toThrow(
      /did not include an access_token/,
    );
  });

  it('requires a code and wraps network errors', async () => {
    const { fetch } = mockFetch(new TypeError('fetch failed'));
    const oauth = new OAuth({ ...options, fetch });
    await expect(oauth.exchangeCode('')).rejects.toThrow(TypeError);
    await expect(oauth.exchangeCode('code')).rejects.toThrow(InstapaperConnectionError);
  });
});
