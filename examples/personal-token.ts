// Quick start with a personal access token.
//
// Generate a token on your application's page at
// https://www.instapaper.com/developers/applications, then run:
//
//   npm run build
//   INSTAPAPER_ACCESS_TOKEN=... node examples/personal-token.ts
//
// (Running a .ts file directly needs Node 22.18 or newer.)

import { AuthenticationError, Instapaper } from 'instapaper-api';

const accessToken = process.env.INSTAPAPER_ACCESS_TOKEN;
if (!accessToken) {
  console.error('Set INSTAPAPER_ACCESS_TOKEN to your personal access token.');
  process.exit(1);
}

const client = new Instapaper({ accessToken });

try {
  const { bookmarks, total } = await client.bookmarks.list({ limit: 5 });
  console.log(`${total} bookmarks in your home list. The latest few:`);
  for (const bookmark of bookmarks) {
    console.log(`- ${bookmark.title ?? bookmark.url}`);
  }

  const folders = await client.folders.list();
  console.log(`\nFolders: ${folders.map((f) => f.title).join(', ') || 'none'}`);
} catch (err) {
  if (err instanceof AuthenticationError) {
    console.error('That access token was rejected. Generate a new one and try again.');
    process.exit(1);
  }
  throw err;
}
