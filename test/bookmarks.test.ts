import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError, Instapaper } from '../src';
import {
  bookmark,
  jsonBody,
  jsonResponse,
  mockFetch,
  parsedUrl,
  tag,
  textResponse,
} from './helpers';

function setup(...replies: Parameters<typeof mockFetch>) {
  const mock = mockFetch(...replies);
  return { ...mock, client: new Instapaper({ accessToken: 'tok', fetch: mock.fetch }) };
}

function pages(count: number, startId = 1) {
  return Array.from({ length: count }, (_, i) => bookmark({ id: startId + i }));
}

describe('bookmarks', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('list', () => {
    it('lists the home section by default', async () => {
      const response = { bookmarks: [bookmark()], total: 214 };
      const { client, calls } = setup(jsonResponse(200, response));

      expect(await client.bookmarks.list()).toEqual(response);
      const url = parsedUrl(calls[0]);
      expect(calls[0]!.init.method).toBe('GET');
      expect(url.pathname).toBe('/api/2/bookmarks');
      expect(url.search).toBe('');
    });

    it('sends section, folder, pagination, and tag as query parameters', async () => {
      const { client, calls } = setup(
        jsonResponse(200, { bookmarks: [], total: 0 }),
        jsonResponse(200, { bookmarks: [], total: 0 }),
      );
      await client.bookmarks.list({ section: 'folder', folderId: 99, limit: 50, offset: 100 });
      await client.bookmarks.list({ tag: 'Recipes & more' });

      expect(Object.fromEntries(parsedUrl(calls[0]).searchParams)).toEqual({
        section: 'folder',
        folder_id: '99',
        limit: '50',
        offset: '100',
      });
      expect(parsedUrl(calls[1]).searchParams.get('tag')).toBe('Recipes & more');
    });

    it('only sends section when you pass it, so the API can infer it', async () => {
      const { client, calls } = setup(
        jsonResponse(200, { bookmarks: [], total: 0 }),
        jsonResponse(200, { bookmarks: [], total: 0 }),
      );
      await client.bookmarks.list({ folderId: 99 });
      await client.bookmarks.list({ section: 'liked' });

      expect(Object.fromEntries(parsedUrl(calls[0]).searchParams)).toEqual({ folder_id: '99' });
      expect(Object.fromEntries(parsedUrl(calls[1]).searchParams)).toEqual({ section: 'liked' });
    });

    it('rejects a section that would make the API ignore folderId or tag', async () => {
      const { client, fetch } = setup();
      await expect(client.bookmarks.list({ section: 'home', folderId: 99 })).rejects.toThrow(
        /folderId can't be used with section "home"/,
      );
      await expect(client.bookmarks.list({ section: 'folder', tag: 'x' })).rejects.toThrow(
        /tag can't be used with section "folder"/,
      );
      await expect(
        // @ts-expect-error not a valid section
        client.bookmarks.list({ section: 'starred' }),
      ).rejects.toThrow(/section must be one of/);
      const iterator = client.bookmarks.iterate({ section: 'archive', tag: 'x' });
      await expect(iterator.next()).rejects.toThrow(TypeError);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('rejects folderId with tag, and out-of-range limits, before any request', async () => {
      const { client, fetch } = setup();
      await expect(client.bookmarks.list({ folderId: 1, tag: 'x' })).rejects.toThrow(TypeError);
      await expect(client.bookmarks.list({ limit: 0 })).rejects.toThrow(RangeError);
      await expect(client.bookmarks.list({ limit: 501 })).rejects.toThrow(RangeError);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('iterate', () => {
    it('walks every page and stops on a short page', async () => {
      const { client, calls } = setup(
        jsonResponse(200, { bookmarks: pages(2, 1), total: 5 }),
        jsonResponse(200, { bookmarks: pages(2, 3), total: 5 }),
        jsonResponse(200, { bookmarks: pages(1, 5), total: 5 }),
      );
      const ids: number[] = [];
      for await (const bm of client.bookmarks.iterate({ section: 'archive', pageSize: 2 })) {
        ids.push(bm.id);
      }

      expect(ids).toEqual([1, 2, 3, 4, 5]);
      expect(calls.map((c) => Object.fromEntries(parsedUrl(c).searchParams))).toEqual([
        { section: 'archive', limit: '2', offset: '0' },
        { section: 'archive', limit: '2', offset: '2' },
        { section: 'archive', limit: '2', offset: '4' },
      ]);
    });

    it('ends on an empty page when the total is an exact multiple', async () => {
      const { client, calls } = setup(
        jsonResponse(200, { bookmarks: pages(2), total: 2 }),
        jsonResponse(200, { bookmarks: [], total: 2 }),
      );
      const all = [];
      for await (const bm of client.bookmarks.iterate({ pageSize: 2 })) all.push(bm);
      expect(all).toHaveLength(2);
      expect(calls).toHaveLength(2);
    });

    it('defaults to pages of 100 and validates pageSize', async () => {
      const { client, calls } = setup(jsonResponse(200, { bookmarks: [], total: 0 }));
      for await (const bm of client.bookmarks.iterate()) expect(bm).toBeUndefined();
      expect(parsedUrl(calls[0]).searchParams.get('limit')).toBe('100');

      const iterator = client.bookmarks.iterate({ pageSize: 1000 });
      await expect(iterator.next()).rejects.toThrow(RangeError);
    });
  });

  describe('changes and sync', () => {
    it('fetches one page of changes with deleted IDs', async () => {
      const response = { bookmarks: [bookmark()], deleted_ids: [7, 8], total: 3 };
      const { client, calls } = setup(jsonResponse(200, response));

      expect(await client.bookmarks.changes(1755000000)).toEqual(response);
      expect(Object.fromEntries(parsedUrl(calls[0]).searchParams)).toEqual({
        since: '1755000000',
        limit: '500',
      });
    });

    it('accepts a Date and fills in missing deleted_ids', async () => {
      const { client, calls } = setup(jsonResponse(200, { bookmarks: [], total: 0 }));
      const result = await client.bookmarks.changes(new Date(1755000000_500), {
        limit: 10,
        offset: 20,
      });
      expect(result.deleted_ids).toEqual([]);
      expect(Object.fromEntries(parsedUrl(calls[0]).searchParams)).toEqual({
        since: '1755000000',
        limit: '10',
        offset: '20',
      });
    });

    it('rejects a zero or invalid since', async () => {
      const { client, fetch } = setup();
      await expect(client.bookmarks.changes(0)).rejects.toThrow(RangeError);
      await expect(client.bookmarks.changes(1.5)).rejects.toThrow(RangeError);
      await expect(client.bookmarks.sync(new Date(NaN))).rejects.toThrow(RangeError);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('syncs every page, counting deleted IDs toward the page size', async () => {
      const { client, calls } = setup(
        jsonResponse(200, { bookmarks: pages(2, 1), deleted_ids: [90], total: 6 }),
        jsonResponse(200, { bookmarks: pages(1, 3), deleted_ids: [91, 92], total: 6 }),
        jsonResponse(200, { bookmarks: pages(1, 4), deleted_ids: [], total: 6 }),
      );
      const result = await client.bookmarks.sync(1755000000, { pageSize: 3 });

      expect(result.bookmarks.map((b) => b.id)).toEqual([1, 2, 3, 4]);
      expect(result.deleted_ids).toEqual([90, 91, 92]);
      expect(result.total).toBe(6);
      expect(calls.map((c) => parsedUrl(c).searchParams.get('offset'))).toEqual(['0', '3', '6']);
    });

    it('stops after a single empty page', async () => {
      const { client, calls } = setup(
        jsonResponse(200, { bookmarks: [], deleted_ids: [], total: 0 }),
      );
      const result = await client.bookmarks.sync(1755000000);
      expect(result).toEqual({ bookmarks: [], deleted_ids: [], total: 0 });
      expect(calls).toHaveLength(1);
      expect(parsedUrl(calls[0]).searchParams.get('limit')).toBe('500');
    });
  });

  describe('save', () => {
    it('posts only the fields you pass, as JSON', async () => {
      const { client, calls } = setup(jsonResponse(200, bookmark()));
      const saved = await client.bookmarks.save({
        url: 'https://example.com/article',
        title: 'An Article',
        folderId: 99,
        archived: true,
        canonicalize: false,
        tags: ['Recipes', 'Later'],
      });

      expect(saved).toEqual(bookmark());
      expect(calls[0]!.init.method).toBe('POST');
      expect(parsedUrl(calls[0]).pathname).toBe('/api/2/bookmarks');
      expect(calls[0]!.init.headers['Content-Type']).toBe('application/json');
      expect(jsonBody(calls[0])).toEqual({
        url: 'https://example.com/article',
        title: 'An Article',
        folder_id: 99,
        archived: true,
        canonicalize: false,
        tags: [{ name: 'Recipes' }, { name: 'Later' }],
      });
    });

    it('saves private content', async () => {
      const { client, calls } = setup(jsonResponse(200, bookmark({ url: null })));
      await client.bookmarks.save({
        privateSource: 'Acme Reader',
        content: '<p>Hi</p>',
        description: 'Private',
      });
      expect(jsonBody(calls[0])).toEqual({
        private_source: 'Acme Reader',
        content: '<p>Hi</p>',
        description: 'Private',
      });
    });

    it('validates url and privateSource locally', async () => {
      const { client, fetch } = setup();
      await expect(client.bookmarks.save({})).rejects.toThrow(/url is required/);
      await expect(
        client.bookmarks.save({ url: 'https://x.com', privateSource: 'A', content: 'c' }),
      ).rejects.toThrow(/cannot be used together/);
      await expect(client.bookmarks.save({ privateSource: 'A' })).rejects.toThrow(
        /requires content/,
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it('surfaces API validation errors', async () => {
      const { client } = setup(
        jsonResponse(400, { error: { code: 400, message: 'Invalid URL specified' } }),
      );
      await expect(client.bookmarks.save({ url: 'nope' })).rejects.toThrow(BadRequestError);
    });
  });

  describe('update', () => {
    it('updates title and description', async () => {
      const { client, calls } = setup(jsonResponse(200, bookmark({ title: 'New' })));
      const updated = await client.bookmarks.update(12345, { title: 'New', description: 'D' });
      expect(updated.title).toBe('New');
      expect(calls[0]!.init.method).toBe('POST');
      expect(parsedUrl(calls[0]).pathname).toBe('/api/2/bookmarks/12345');
      expect(jsonBody(calls[0])).toEqual({ title: 'New', description: 'D' });
    });

    it('sends progress with an explicit timestamp', async () => {
      const { client, calls } = setup(jsonResponse(200, bookmark()));
      await client.bookmarks.update(1, { progress: 0.42, progressTimestamp: 1755000000 });
      expect(jsonBody(calls[0])).toEqual({
        progress: { percentage: 0.42, timestamp: 1755000000 },
      });
    });

    it('defaults the progress timestamp to now', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(1758000000_900));
      const { client, calls } = setup(jsonResponse(200, bookmark()));
      await client.bookmarks.update(1, { progress: 1 });
      expect(jsonBody(calls[0])).toEqual({ progress: { percentage: 1, timestamp: 1758000000 } });
    });

    it('validates progress locally', async () => {
      const { client, fetch } = setup();
      await expect(client.bookmarks.update(1, { progress: 1.5 })).rejects.toThrow(RangeError);
      await expect(client.bookmarks.update(1, { progress: NaN })).rejects.toThrow(RangeError);
      await expect(client.bookmarks.update(1, { progressTimestamp: 5 })).rejects.toThrow(TypeError);
      await expect(client.bookmarks.update(0, { title: 'x' })).rejects.toThrow(TypeError);
      await expect(client.bookmarks.update(1, {})).rejects.toThrow(/needs a title/);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  it('does not require a body from delete', async () => {
    const { client } = setup(jsonResponse(200, {}));
    await expect(client.bookmarks.delete(1)).resolves.toBeUndefined();
  });

  it('deletes with an empty 200 response', async () => {
    const { client, calls } = setup(textResponse(200, ''));
    await expect(client.bookmarks.delete(12345)).resolves.toBeUndefined();
    expect(calls[0]!.init.method).toBe('DELETE');
    expect(parsedUrl(calls[0]).pathname).toBe('/api/2/bookmarks/12345');
  });

  it.each([
    ['archive', 'archive'],
    ['unarchive', 'home'],
  ] as const)('%s moves to %s', async (method, section) => {
    const { client, calls } = setup(jsonResponse(200, bookmark()));
    await client.bookmarks[method](12345);
    expect(calls[0]!.init.method).toBe('POST');
    expect(parsedUrl(calls[0]).pathname).toBe('/api/2/bookmarks/12345/move');
    expect(jsonBody(calls[0])).toEqual({ section });
  });

  it('moves to a folder by sending the ID as a string', async () => {
    const { client, calls } = setup(jsonResponse(200, bookmark({ folder_id: 99 })));
    const moved = await client.bookmarks.moveToFolder(12345, 99);
    expect(moved.folder_id).toBe(99);
    expect(jsonBody(calls[0])).toEqual({ section: '99' });
  });

  it.each([
    ['like', 'POST'],
    ['unlike', 'DELETE'],
  ] as const)('%s sends %s to the like endpoint', async (method, httpMethod) => {
    const { client, calls } = setup(jsonResponse(200, bookmark({ liked: method === 'like' })));
    const result = await client.bookmarks[method](12345);
    expect(result.liked).toBe(method === 'like');
    expect(calls[0]!.init.method).toBe(httpMethod);
    expect(parsedUrl(calls[0]).pathname).toBe('/api/2/bookmarks/12345/like');
    expect(calls[0]!.init.body).toBeUndefined();
  });

  describe('updateTags', () => {
    it('adds by name or ID and removes by ID', async () => {
      const response = { created_tags: [tag()], tags: [tag(), tag({ id: 7, name: 'Old' })] };
      const { client, calls } = setup(jsonResponse(200, response));
      const result = await client.bookmarks.updateTags(12345, {
        add: ['Recipes', 7],
        remove: [3],
      });

      expect(result).toEqual(response);
      expect(parsedUrl(calls[0]).pathname).toBe('/api/2/bookmarks/12345/tags');
      expect(jsonBody(calls[0])).toEqual({
        add_tags: [{ name: 'Recipes' }, { id: 7 }],
        remove_tags: [{ id: 3 }],
      });
    });

    it('rejects tags of the wrong type', async () => {
      const { client, fetch } = setup();
      await expect(client.bookmarks.updateTags(1, { add: [''] })).rejects.toThrow(TypeError);
      await expect(client.bookmarks.updateTags(1, { add: [1.5] })).rejects.toThrow(TypeError);
      await expect(
        // @ts-expect-error not a tag
        client.bookmarks.updateTags(1, { add: [{ name: 'x' }] }),
      ).rejects.toThrow(TypeError);
      await expect(
        // @ts-expect-error remove takes IDs only
        client.bookmarks.updateTags(1, { remove: ['Recipes'] }),
      ).rejects.toThrow(/remove must be positive integer IDs/);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('requires at least one change', async () => {
      const { client, fetch } = setup();
      await expect(client.bookmarks.updateTags(1, {})).rejects.toThrow(TypeError);
      await expect(client.bookmarks.updateTags(1, { add: [], remove: [] })).rejects.toThrow(
        TypeError,
      );
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('parse', () => {
    const parsed = {
      metadata: {
        title: 'An Article',
        author: { name: 'Jane Doe', url: null },
        pubtime: 1705276800,
        thumbnail: null,
        description: null,
        private_source: null,
        category: 0,
      },
      content: {
        body: '<p>Hi</p>',
        images: [],
        words: 1,
        paywalled: false,
        direction: 'ltr',
      },
    };

    it('uses GET with no parameters by default', async () => {
      const { client, calls } = setup(jsonResponse(200, parsed));
      expect(await client.bookmarks.parse(12345)).toEqual(parsed);
      expect(calls[0]!.init.method).toBe('GET');
      const url = parsedUrl(calls[0]);
      expect(url.pathname).toBe('/api/2/bookmarks/12345/parse');
      expect(url.search).toBe('');
    });

    it('maps options onto GET query parameters', async () => {
      const { client, calls } = setup(jsonResponse(200, parsed));
      await client.bookmarks.parse(12345, {
        useCache: false,
        force: true,
        instaparserApiKey: 'ip-key',
      });
      expect(Object.fromEntries(parsedUrl(calls[0]).searchParams)).toEqual({
        use_cache: '0',
        force: '1',
        instaparser_api_key: 'ip-key',
      });
    });

    it('uses POST when you supply content', async () => {
      const { client, calls } = setup(jsonResponse(200, parsed));
      await client.bookmarks.parse(12345, { content: '<p>Hi</p>', instaparserApiKey: 'ip-key' });
      expect(calls[0]!.init.method).toBe('POST');
      expect(jsonBody(calls[0])).toEqual({
        use_cache: true,
        force: false,
        content: '<p>Hi</p>',
        instaparser_api_key: 'ip-key',
      });
    });
  });
});
