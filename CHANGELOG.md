# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-29

### Changed

- Declared the public API stable for the first major release. There are no API changes from 0.1.0.

## [0.1.0] - 2026-09-16

### Added

- `Instapaper` client for the Instapaper API v2: bookmarks, folders, tags, highlights, and the current user.
- Helpers for paging through bookmarks (`iterate`) and syncing changes (`changes`, `sync`).
- Parsed article text with `bookmarks.parse`, including your own Instaparser key for non-personal use.
- `OAuth` helper for the authorization code flow: building the authorization URL and exchanging a code for a token.
- Typed errors for each kind of API failure, plus timeouts and network errors.
- ESM and CommonJS builds with TypeScript declarations, and no runtime dependencies.

[1.0.0]: https://github.com/Instapaper/instapaper-api-js/releases/tag/v1.0.0
[0.1.0]: https://github.com/Instapaper/instapaper-api-js/releases/tag/v0.1.0
