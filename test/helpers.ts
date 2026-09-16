import { vi } from 'vitest';
import type { FetchInit, FetchLike, FetchResponse } from '../src/http';
import type { Bookmark, Folder, Highlight, Tag, User } from '../src/types';

export interface RecordedCall {
  url: string;
  init: FetchInit;
}

type Reply = FetchResponse | Error | (() => Promise<FetchResponse>);

export function jsonResponse(status: number, body: unknown): FetchResponse {
  return textResponse(status, JSON.stringify(body));
}

export function textResponse(status: number, text: string): FetchResponse {
  return { status, ok: status >= 200 && status < 300, text: async () => text };
}

/** A fetch mock that replays queued responses and records every call. */
export function mockFetch(...replies: Reply[]) {
  const calls: RecordedCall[] = [];
  const queue = [...replies];
  const fetch = vi.fn<FetchLike>(async (url, init) => {
    calls.push({ url, init });
    const reply = queue.shift();
    if (reply === undefined) throw new Error(`Unexpected request: ${init.method} ${url}`);
    if (reply instanceof Error) throw reply;
    if (typeof reply === 'function') return reply();
    return reply;
  });
  return { fetch, calls };
}

export function parsedUrl(call: RecordedCall | undefined): URL {
  if (!call) throw new Error('No request was made');
  return new URL(call.url);
}

export function jsonBody(call: RecordedCall | undefined): unknown {
  if (!call?.init.body) throw new Error('Request had no body');
  return JSON.parse(call.init.body);
}

export function tag(overrides: Partial<Tag> = {}): Tag {
  return { id: 9, name: 'Recipes', slug: 'recipes', count: 12, baton: null, ...overrides };
}

export function bookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: 12345,
    url: 'https://example.com/article',
    title: 'An Article',
    description: 'The opening lines.',
    image: null,
    progress: { percentage: 0, timestamp: 0 },
    liked: false,
    archived: false,
    time: 1755000000,
    pubtime: null,
    author: null,
    folder_id: null,
    tags: [],
    private_source: null,
    category: 0,
    ...overrides,
  };
}

export function folder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 99,
    title: 'Recipes',
    slug: 'recipes',
    position: 1,
    public: false,
    count: 12,
    ...overrides,
  };
}

export function highlight(overrides: Partial<Highlight> = {}): Highlight {
  return {
    id: 501,
    bookmark_id: 12345,
    text: 'The passage.',
    note: null,
    position: 0,
    time: 1755000000,
    ...overrides,
  };
}

export function user(overrides: Partial<User> = {}): User {
  return { id: 42, username: 'reader@example.com', premium: true, ...overrides };
}
