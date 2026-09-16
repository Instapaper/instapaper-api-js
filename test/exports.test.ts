import { describe, expect, it } from 'vitest';
import * as sdk from '../src';

describe('package exports', () => {
  it('exposes the client, OAuth helper, errors, and category constants', () => {
    expect(Object.keys(sdk).sort()).toEqual(
      [
        'APIError',
        'AuthenticationError',
        'BadRequestError',
        'BookmarkCategory',
        'Instapaper',
        'InstapaperConnectionError',
        'InstapaperError',
        'NotFoundError',
        'OAuth',
        'OAuthError',
        'PermissionDeniedError',
        'QuotaExceededError',
        'RateLimitError',
        'ServerError',
        'VERSION',
      ].sort(),
    );
    expect(sdk.BookmarkCategory).toEqual({ Article: 0, Email: 1, Video: 2, PDF: 3, Social: 4 });
  });
});
