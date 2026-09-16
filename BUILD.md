# Build Instructions

## Prerequisites

- Node 20.19 or newer for development. The published package supports Node 18 and up, but the test and lint tooling needs a newer Node.
- npm

## Setup

```sh
npm install
```

## Checks

```sh
npm test               # unit tests (vitest)
npm run test:coverage  # tests with a coverage report
npm run lint           # ESLint
npm run format:check   # Prettier (npm run format to fix)
npm run typecheck      # tsc
```

## Building

```sh
npm run build   # ESM, CommonJS, and type declarations in dist/
npm run smoke   # load the built package both ways and make a few calls
```

## Running the examples

Build first, then run an example with Node 22.18 or newer, which can run TypeScript files directly:

```sh
INSTAPAPER_ACCESS_TOKEN=... node examples/personal-token.ts
INSTAPAPER_CLIENT_ID=... INSTAPAPER_CLIENT_SECRET=... node examples/oauth-server.ts
```

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:

- Lint, format check, typecheck, tests, build, and the smoke test on Node 22.
- Tests on Node 20, 22, and 24.
- The smoke test against the built package on Node 18, the oldest supported runtime.

## Releasing

Releases publish to npm from GitHub Actions when you push a version tag.

1. Update `version` in `package.json` and `VERSION` in `src/version.ts` (a test checks they match).
2. Add the release to `CHANGELOG.md`.
3. Commit, then tag and push:

   ```sh
   git tag v0.1.0
   git push origin main --tags
   ```

`.github/workflows/release.yml` checks that the tag matches `package.json`, runs the tests and build, and runs `npm publish --provenance --access public`.

### One-time setup

1. On npmjs.com, sign in as the account that owns the `instapaper-api` package (the same one that publishes `instaparser-api`).
2. Create a granular access token with read and write access to `instapaper-api`. For the very first publish the package doesn't exist yet, so allow publishing new packages, then narrow the token afterwards.
3. In the GitHub repository, go to **Settings > Secrets and variables > Actions** and add it as `NPM_TOKEN`.

Provenance needs the repository to be public and the workflow's `id-token: write` permission, which is already set.
