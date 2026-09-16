// Smoke test for the built ESM and CommonJS output, run against `dist` through
// the package's own `exports` map. It needs no dev dependencies, so CI can run
// it on the oldest supported Node.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function fakeFetch(status, body) {
  return async () => ({ status, ok: status >= 200 && status < 300, text: async () => body });
}

async function check(label, sdk) {
  const { Instapaper, OAuth, AuthenticationError, APIError, InstapaperError, VERSION } = sdk;

  const client = new Instapaper({
    accessToken: 'tok',
    fetch: fakeFetch(
      200,
      JSON.stringify({ id: 42, username: 'reader@example.com', premium: true }),
    ),
  });
  assert.equal((await client.me()).id, 42);

  const failing = new Instapaper({ accessToken: 'bad', fetch: fakeFetch(401, '') });
  const err = await failing.me().catch((e) => e);
  assert.ok(err instanceof AuthenticationError);
  assert.ok(err instanceof APIError);
  assert.ok(err instanceof InstapaperError);
  assert.equal(err.name, 'AuthenticationError');

  const oauth = new OAuth({
    clientId: 'id',
    clientSecret: 's',
    redirectUri: 'https://a.example.com/cb',
  });
  assert.match(oauth.authorizationUrl({ state: 'x' }), /\/oauth2\/authorize\?client_id=id/);

  console.log(`${label} ok (instapaper-api ${VERSION}, Node ${process.versions.node})`);
}

await check('ESM', await import('instapaper-api'));
await check('CJS', require('instapaper-api'));
