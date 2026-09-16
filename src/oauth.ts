import { InstapaperError, OAuthError } from './errors';
import { Transport, isRedirect, parseBody, type TransportOptions } from './http';
import type { AccessToken } from './types';

export interface OAuthOptions extends TransportOptions {
  clientId: string;
  clientSecret: string;
  /** Must match one of the application's registered callback URIs exactly. */
  redirectUri: string;
}

export interface AuthorizationUrlOptions {
  /** An opaque value echoed back to your redirect URI. Use it to defend against CSRF. */
  state?: string;
}

/** Helpers for the OAuth 2 authorization code flow. */
export class OAuth {
  readonly clientId: string;
  readonly redirectUri: string;
  private readonly clientSecret: string;
  private readonly transport: Transport;

  constructor(options: OAuthOptions) {
    for (const key of ['clientId', 'clientSecret', 'redirectUri'] as const) {
      if (!options || typeof options[key] !== 'string' || !options[key]) {
        throw new TypeError(`${key} is required`);
      }
    }
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.redirectUri = options.redirectUri;
    this.transport = new Transport(options);
  }

  /** The URL to send the user to so they can authorize your application. */
  authorizationUrl(options: AuthorizationUrlOptions = {}): string {
    return this.transport.url('/oauth2/authorize', {
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      state: options.state,
    });
  }

  /** Exchange the code from your redirect URI for an access token. Codes work once. */
  async exchangeCode(code: string): Promise<AccessToken> {
    if (typeof code !== 'string' || !code) throw new TypeError('code is required');
    const response = await this.transport.send('POST', '/oauth2/token', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        code,
      }).toString(),
    });
    const body = parseBody(response.text);

    if (isRedirect(response.status)) {
      // Never follow: the redirect would carry the client secret somewhere else.
      throw new OAuthError(
        response.status,
        'unexpected_redirect',
        `The token endpoint redirected (status ${response.status}); the request was not followed`,
      );
    }
    if (!response.ok) {
      const fields = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
      const error = typeof fields.error === 'string' ? fields.error : 'unknown_error';
      const description =
        typeof fields.error_description === 'string'
          ? fields.error_description
          : `Token request failed with status ${response.status}`;
      throw new OAuthError(response.status, error, description);
    }

    const token = body as Partial<AccessToken> | undefined;
    if (!token || typeof token !== 'object' || typeof token.access_token !== 'string') {
      throw new InstapaperError('The token response did not include an access_token');
    }
    return token as AccessToken;
  }
}
