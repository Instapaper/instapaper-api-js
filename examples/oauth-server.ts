// The OAuth 2 authorization code flow, with a tiny local callback server.
//
// 1. Add http://localhost:3000/callback to your application's callback URIs.
//    Local http callbacks work while an application is Owner Only.
// 2. Run:
//
//      npm run build
//      INSTAPAPER_CLIENT_ID=... INSTAPAPER_CLIENT_SECRET=... node examples/oauth-server.ts
//
// 3. Open http://localhost:3000 and approve the request.
//
// (Running a .ts file directly needs Node 22.18 or newer.)

import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Instapaper, OAuth, OAuthError } from 'instapaper-api';

const clientId = process.env.INSTAPAPER_CLIENT_ID;
const clientSecret = process.env.INSTAPAPER_CLIENT_SECRET;
const port = Number(process.env.PORT ?? 3000);
const redirectUri = `http://localhost:${port}/callback`;

if (!clientId || !clientSecret) {
  console.error('Set INSTAPAPER_CLIENT_ID and INSTAPAPER_CLIENT_SECRET.');
  process.exit(1);
}

const oauth = new OAuth({ clientId, clientSecret, redirectUri });
// One pending state is enough for a local demo. A real app would store it in
// the user's session.
let expectedState: string | undefined;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);

  if (url.pathname === '/') {
    expectedState = randomUUID();
    res.writeHead(302, { Location: oauth.authorizationUrl({ state: expectedState }) });
    res.end();
    return;
  }

  if (url.pathname !== '/callback') {
    res.writeHead(404).end('Not found');
    return;
  }

  const send = (status: number, message: string) => {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(message);
  };

  if (url.searchParams.get('error')) {
    send(400, `Authorization was not granted: ${url.searchParams.get('error_description')}`);
    return;
  }
  if (!expectedState || url.searchParams.get('state') !== expectedState) {
    send(400, 'State did not match. Start again at /.');
    return;
  }
  expectedState = undefined;

  const code = url.searchParams.get('code');
  if (!code) {
    send(400, 'No authorization code in the callback.');
    return;
  }

  try {
    const token = await oauth.exchangeCode(code);
    const client = new Instapaper({ accessToken: token.access_token });
    const { total } = await client.bookmarks.list({ limit: 1 });
    send(200, `Connected as ${token.user.username}. You have ${total} bookmarks in home.`);
    console.log('Access token:', token.access_token);
  } catch (err) {
    const message = err instanceof OAuthError ? err.description : String(err);
    send(500, `Token exchange failed: ${message}`);
  }
});

server.listen(port, () => {
  console.log(`Open http://localhost:${port} to connect your Instapaper account.`);
});
