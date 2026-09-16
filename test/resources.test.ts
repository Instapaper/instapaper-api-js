import { describe, expect, it } from 'vitest';
import { BadRequestError, Instapaper, PermissionDeniedError } from '../src';
import {
  folder,
  highlight,
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

describe('folders', () => {
  it('lists folders', async () => {
    const { client, calls } = setup(jsonResponse(200, { folders: [folder()] }));
    expect(await client.folders.list()).toEqual([folder()]);
    expect(calls[0]!.init.method).toBe('GET');
    expect(parsedUrl(calls[0]).pathname).toBe('/api/2/folders');
  });

  it('creates a folder', async () => {
    const { client, calls } = setup(jsonResponse(200, folder()));
    expect(await client.folders.create('Recipes')).toEqual(folder());
    expect(calls[0]!.init.method).toBe('POST');
    expect(parsedUrl(calls[0]).pathname).toBe('/api/2/folders');
    expect(jsonBody(calls[0])).toEqual({ title: 'Recipes' });
  });

  it('deletes a folder with an empty response', async () => {
    const { client, calls } = setup(textResponse(200, ''));
    await expect(client.folders.delete(99)).resolves.toBeUndefined();
    expect(calls[0]!.init.method).toBe('DELETE');
    expect(parsedUrl(calls[0]).pathname).toBe('/api/2/folders/99');
  });

  it('reorders from a map or a list', async () => {
    const response = { folders: [folder({ id: 100, position: 1 }), folder({ position: 2 })] };
    const { client, calls } = setup(jsonResponse(200, response), jsonResponse(200, response));

    expect(await client.folders.reorder({ 99: 2, 100: 1 })).toEqual(response.folders);
    await client.folders.reorder([{ folderId: 99, position: 5 }]);

    expect(parsedUrl(calls[0]).pathname).toBe('/api/2/folders/reorder');
    expect(jsonBody(calls[0])).toEqual({
      order: [
        { folder_id: 99, position: 2 },
        { folder_id: 100, position: 1 },
      ],
    });
    expect(jsonBody(calls[1])).toEqual({ order: [{ folder_id: 99, position: 5 }] });
  });

  it('validates reorder input locally', async () => {
    const { client, fetch } = setup();
    await expect(client.folders.reorder([])).rejects.toThrow(TypeError);
    await expect(client.folders.reorder({ 99: 0 })).rejects.toThrow(RangeError);
    await expect(client.folders.reorder([{ folderId: -1, position: 1 }])).rejects.toThrow(
      TypeError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('tags', () => {
  it('lists tags', async () => {
    const { client, calls } = setup(jsonResponse(200, { tags: [tag()] }));
    expect(await client.tags.list()).toEqual([tag()]);
    expect(calls[0]!.init.method).toBe('GET');
    expect(parsedUrl(calls[0]).pathname).toBe('/api/2/tags');
  });

  it('creates a tag', async () => {
    const { client, calls } = setup(jsonResponse(200, tag()));
    expect(await client.tags.create('Recipes')).toEqual(tag());
    expect(calls[0]!.init.method).toBe('POST');
    expect(jsonBody(calls[0])).toEqual({ name: 'Recipes' });
  });

  it('renames a tag', async () => {
    const { client, calls } = setup(jsonResponse(200, tag({ name: 'Cooking', slug: 'cooking' })));
    const renamed = await client.tags.rename(9, 'Cooking');
    expect(renamed.slug).toBe('cooking');
    expect(calls[0]!.init.method).toBe('POST');
    expect(parsedUrl(calls[0]).pathname).toBe('/api/2/tags/9');
    expect(jsonBody(calls[0])).toEqual({ name: 'Cooking' });
  });
});

describe('highlights', () => {
  it("lists a bookmark's highlights", async () => {
    const { client, calls } = setup(jsonResponse(200, { highlights: [highlight()] }));
    expect(await client.highlights.list(12345)).toEqual([highlight()]);
    expect(calls[0]!.init.method).toBe('GET');
    expect(parsedUrl(calls[0]).pathname).toBe('/api/2/bookmarks/12345/highlights');
  });

  it('creates a highlight with only the fields given', async () => {
    const { client, calls } = setup(
      jsonResponse(200, highlight()),
      jsonResponse(200, highlight({ note: 'Worth it' })),
    );
    await client.highlights.create(12345, { text: 'The passage.' });
    await client.highlights.create(12345, {
      text: 'The passage.',
      note: 'Worth it',
      position: 1,
    });

    expect(calls[0]!.init.method).toBe('POST');
    expect(parsedUrl(calls[0]).pathname).toBe('/api/2/bookmarks/12345/highlights');
    expect(jsonBody(calls[0])).toEqual({ text: 'The passage.' });
    expect(jsonBody(calls[1])).toEqual({ text: 'The passage.', note: 'Worth it', position: 1 });
  });

  it('rejects blank highlight text before sending', async () => {
    const { client, fetch } = setup();
    await expect(client.highlights.create(1, { text: '   ' })).rejects.toThrow(/cannot be blank/);
    // @ts-expect-error text is required
    await expect(client.highlights.create(1, {})).rejects.toThrow(TypeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports the monthly highlight limit as a permission error', async () => {
    const message = 'Non-subscribers are limited to 5 highlights per month';
    const { client } = setup(jsonResponse(403, { error: { code: 403, message } }));
    const err = await client.highlights.create(1, { text: 'x' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PermissionDeniedError);
    expect((err as PermissionDeniedError).message).toBe(message);
  });

  it('deletes a highlight with a DELETE and an empty response', async () => {
    const { client, calls } = setup(textResponse(200, ''));
    await expect(client.highlights.delete(501)).resolves.toBeUndefined();
    expect(calls[0]!.init.method).toBe('DELETE');
    expect(parsedUrl(calls[0]).pathname).toBe('/api/2/highlights/501');
    expect(calls[0]!.init.body).toBeUndefined();
  });

  it('reports a missing or already-deleted highlight as a bad request', async () => {
    const message = 'Invalid or missing highlight_id';
    const { client } = setup(jsonResponse(400, { error: { code: 400, message } }));
    const err = await client.highlights.delete(99999).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestError);
    expect((err as BadRequestError).message).toBe(message);
  });
});
