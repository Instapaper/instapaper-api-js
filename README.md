# Instapaper API for JavaScript and TypeScript

The official client for the [Instapaper API v2](https://www.instapaper.com/developers). Save and organize a user's bookmarks, read and sync their library, manage folders, tags, and highlights, and fetch parsed article text.

It's written in TypeScript, ships ESM and CommonJS builds, and has no runtime dependencies.

## Installation

```bash
npm install instapaper-api
```

Requires Node 18 or newer. It also runs on Bun, Deno, and edge runtimes that provide `fetch`.

## Quick start

The quickest way to try the API is with your own account. [Register an application](https://www.instapaper.com/developers/applications/create), then [generate a personal access token](https://www.instapaper.com/developers/overview/authentication#accessing-your-own-account) on its page.

```ts
import { Instapaper } from 'instapaper-api';

const client = new Instapaper({ accessToken: process.env.INSTAPAPER_ACCESS_TOKEN! });

const { bookmarks } = await client.bookmarks.list();
for (const bookmark of bookmarks) {
  console.log(bookmark.title);
}

const saved = await client.bookmarks.save({
  url: 'https://example.com/article',
  title: 'An Article',
  tags: ['Recipes'],
});

await client.bookmarks.archive(saved.id);
```

With CommonJS:

```js
const { Instapaper } = require('instapaper-api');
```

## Authorizing other users

To act on behalf of other Instapaper users, send them through the OAuth 2 authorization code flow. Your client ID and secret come from your [application's page](https://www.instapaper.com/developers/applications), and the redirect URI must match one of its registered callback URIs exactly.

```ts
import { Instapaper, OAuth } from 'instapaper-api';

const oauth = new OAuth({
  clientId: process.env.INSTAPAPER_CLIENT_ID!,
  clientSecret: process.env.INSTAPAPER_CLIENT_SECRET!,
  redirectUri: 'https://app.example.com/callback',
});

// 1. Send the user here. Keep `state` in their session.
const url = oauth.authorizationUrl({ state });

// 2. On your callback, check `state`, then exchange the code.
const token = await oauth.exchangeCode(code);

// 3. Store the token. Access tokens don't expire.
const client = new Instapaper({ accessToken: token.access_token });
```

[`examples/oauth-server.ts`](examples/oauth-server.ts) runs the whole flow with a small local server. See [Authentication](https://www.instapaper.com/developers/overview/authentication) for how applications are approved.

## Usage

Methods and options use camelCase. The objects you get back match the API's JSON exactly, so their fields are snake_case (`folder_id`, `private_source`, `deleted_ids`). The [API reference](https://www.instapaper.com/developers/v2/reference/bookmarks) documents every field.

### Bookmarks

```ts
// One page from a section: home (the default), archive, liked, folder, or tag.
// Passing folderId or tag picks that section for you.
const { bookmarks, total } = await client.bookmarks.list({ section: 'archive', limit: 50 });
await client.bookmarks.list({ folderId: 99 });
await client.bookmarks.list({ tag: 'Recipes' });

// Save, including private content that has no public URL
await client.bookmarks.save({ url: 'https://example.com/article', folderId: 99 });
await client.bookmarks.save({ privateSource: 'Acme Reader', content: '<p>...</p>' });

// Update title, description, or reading progress (0 to 1)
await client.bookmarks.update(12345, { progress: 0.42 });

// Move and like
await client.bookmarks.archive(12345);
await client.bookmarks.unarchive(12345);
await client.bookmarks.moveToFolder(12345, 99);
await client.bookmarks.like(12345);
await client.bookmarks.unlike(12345);

// Tags: add by name (created if needed) or ID, remove by ID
await client.bookmarks.updateTags(12345, { add: ['Recipes', 7], remove: [3] });

// Delete permanently. This is not the same as archiving.
await client.bookmarks.delete(12345);
```

### Paging and syncing

`iterate` walks every bookmark in a section, fetching pages as it goes:

```ts
for await (const bookmark of client.bookmarks.iterate({ section: 'liked' })) {
  console.log(bookmark.title);
}
```

To keep a local copy up to date, record when you start a sync and pass that time next time. `sync` fetches every change across all sections since then, including the IDs of deleted bookmarks:

```ts
const startedAt = new Date();
const { bookmarks, deleted_ids } = await client.bookmarks.sync(lastSyncedAt);
// Save `startedAt` as the next `lastSyncedAt`.
```

`changes` returns a single page if you'd rather page yourself. Both accept a `Date` or a Unix timestamp in seconds.

### Parsed article text

```ts
const article = await client.bookmarks.parse(12345);
console.log(article.metadata.title, article.content.words);
console.log(article.content.body); // HTML
```

Pass `content` to parse HTML you already have instead of fetching the URL.

You can use this without a key when you're the authenticated user of your own application, like a personal script. For anyone else's account, pass your own [Instaparser](https://www.instaparser.com) key as `instaparserApiKey`. See [Non-personal use](https://www.instapaper.com/developers/v2/reference/bookmarks#non-personal-use). Parsed text is for showing an article to the user who saved it, as covered by the [API Terms of Use](https://www.instapaper.com/developers/overview/api-terms).

### Folders, tags, and highlights

```ts
const folders = await client.folders.list();
const folder = await client.folders.create('Recipes');
await client.folders.reorder({ [folder.id]: 1 }); // positions start at 1
await client.folders.delete(folder.id); // its bookmarks move back to home

const tags = await client.tags.list();
const tag = await client.tags.create('Cooking');
await client.tags.rename(tag.id, 'Baking');

const highlights = await client.highlights.list(12345);
// position 1 highlights the second time the text appears in the article.
const highlight = await client.highlights.create(12345, { text: 'A passage', position: 1 });
await client.highlights.delete(highlight.id);
```

Accounts without Premium can create five highlights a month. Past that, `highlights.create` throws a `PermissionDeniedError`.

## Errors

Every error the client throws extends `InstapaperError`. When the API returns an error status, you get an `APIError` subclass with the HTTP `status`, the server's `message`, and the response `body`:

| Error                   | Status | When                                                               |
| ----------------------- | ------ | ------------------------------------------------------------------ |
| `BadRequestError`       | 400    | A missing or invalid argument.                                     |
| `AuthenticationError`   | 401    | The access token is missing, unknown, or revoked.                  |
| `QuotaExceededError`    | 402    | An external quota ran out, such as Instaparser credits.            |
| `PermissionDeniedError` | 403    | An unapproved or suspended application, or a Premium-only feature. |
| `NotFoundError`         | 404    | No such endpoint.                                                  |
| `RateLimitError`        | 429    | Too many requests. Back off and retry.                             |
| `ServerError`           | 5xx    | Something went wrong on Instapaper's side. Retry with backoff.     |

`InstapaperConnectionError` means the request never got a response, because of a network failure or a timeout. `OAuthError` comes from `exchangeCode` and carries the OAuth `error` code and `description`.

```ts
import { AuthenticationError, RateLimitError } from 'instapaper-api';

try {
  await client.bookmarks.save({ url });
} catch (err) {
  if (err instanceof AuthenticationError) {
    // Ask the user to reconnect
  } else if (err instanceof RateLimitError) {
    // Try again later
  } else {
    throw err;
  }
}
```

Branch on the error class or `status`. Message text can change over time.

Arguments the API would reject, like `folderId` together with `tag`, or reading progress outside 0 to 1, throw a `TypeError` or `RangeError` before any request is made. The client also never follows a redirect, so your access token is only ever sent to Instapaper; a redirect response throws an `APIError`.

## Configuration

```ts
const client = new Instapaper({
  accessToken,
  timeout: 10_000, // milliseconds; 0 turns it off. Defaults to 30 seconds.
  fetch: customFetch, // defaults to the global fetch
});
```

`OAuth` takes the same `timeout` and `fetch` options.

## Runtime support

This library is meant for servers, scripts, and other trusted environments. It won't work from a web page: the API doesn't allow cross-origin browser requests, and the OAuth code exchange needs your client secret, which must never be shipped to a browser.

## License

[MIT](LICENSE)
