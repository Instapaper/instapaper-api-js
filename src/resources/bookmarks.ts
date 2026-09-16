import type { ApiClient } from '../http';
import type {
  Bookmark,
  BookmarkChanges,
  BookmarkList,
  BookmarkSection,
  ParsedArticle,
  TagChanges,
} from '../types';

export interface ListBookmarksOptions {
  /** Defaults to `home`, or to the section implied by `folderId` or `tag`. */
  section?: BookmarkSection;
  folderId?: number;
  /** Tag name. Can't be combined with `folderId`. */
  tag?: string;
  /** 1 to 500. Defaults to 25. */
  limit?: number;
  offset?: number;
}

export interface IterateBookmarksOptions {
  section?: BookmarkSection;
  folderId?: number;
  tag?: string;
  /** Bookmarks fetched per request, 1 to 500. Defaults to 100. */
  pageSize?: number;
}

export interface ChangesOptions {
  /** 1 to 500. Defaults to 500. */
  limit?: number;
  offset?: number;
}

export interface SyncOptions {
  /** Changes fetched per request, 1 to 500. Defaults to 500. */
  pageSize?: number;
}

export interface SaveBookmarkOptions {
  /** Required unless `privateSource` is set. */
  url?: string;
  /** Send it if you have it; otherwise the title is looked up, which is slower. */
  title?: string;
  description?: string;
  folderId?: number;
  archived?: boolean;
  /** `false` skips resolving redirects and canonicalizing the URL. */
  canonicalize?: boolean;
  /** Tag names. Tags that don't exist yet are created. */
  tags?: string[];
  /** Full article HTML, if you already have it. Required with `privateSource`. */
  content?: string;
  /** A short label naming where private content came from. Used instead of `url`. */
  privateSource?: string;
}

export interface UpdateBookmarkOptions {
  title?: string;
  description?: string;
  /** Reading progress from 0.0 to 1.0. */
  progress?: number;
  /** When the progress was recorded, as a Unix timestamp. Defaults to now. */
  progressTimestamp?: number;
}

export interface UpdateTagsOptions {
  /** Tag names (created if needed) or tag IDs to add. */
  add?: Array<string | number>;
  /** Tag IDs to remove. */
  remove?: number[];
}

export interface ParseOptions {
  /** `false` bypasses the parser cache. Defaults to `true`. */
  useCache?: boolean;
  /** Force a re-parse rather than serving a stored copy. Defaults to `false`. */
  force?: boolean;
  /** HTML you already have for the article, parsed instead of fetching the URL. */
  content?: string;
  /** Your Instaparser key, required for non-personal use. */
  instaparserApiKey?: string;
}

const MAX_PAGE_SIZE = 500;
const SECTIONS: readonly BookmarkSection[] = ['home', 'archive', 'liked', 'folder', 'tag'];

/** List, save, update, move, like, tag, delete, and parse bookmarks. */
export class Bookmarks {
  constructor(private readonly api: ApiClient) {}

  /** One page of bookmarks from a section. */
  async list(options: ListBookmarksOptions = {}): Promise<BookmarkList> {
    checkSection(options);
    if (options.limit !== undefined) checkPageSize(options.limit, 'limit');
    return this.api.request<BookmarkList>('GET', '/bookmarks', {
      query: {
        section: options.section,
        folder_id: options.folderId,
        tag: options.tag,
        limit: options.limit,
        offset: options.offset,
      },
    });
  }

  /** Every bookmark in a section, fetching pages as you go. */
  async *iterate(options: IterateBookmarksOptions = {}): AsyncIterableIterator<Bookmark> {
    const pageSize = options.pageSize ?? 100;
    checkPageSize(pageSize, 'pageSize');
    checkSection(options);
    let offset = 0;
    for (;;) {
      const page = await this.list({
        section: options.section,
        folderId: options.folderId,
        tag: options.tag,
        limit: pageSize,
        offset,
      });
      yield* page.bookmarks;
      offset += page.bookmarks.length;
      // A short page is the end. `total` can lag behind, so don't stop on it.
      if (page.bookmarks.length < pageSize) return;
    }
  }

  /** One page of bookmarks changed since a time, across every section, plus deleted IDs. */
  async changes(since: number | Date, options: ChangesOptions = {}): Promise<BookmarkChanges> {
    const limit = options.limit ?? MAX_PAGE_SIZE;
    checkPageSize(limit, 'limit');
    const response = await this.api.request<BookmarkChanges>('GET', '/bookmarks', {
      query: { since: toTimestamp(since), limit, offset: options.offset },
    });
    return {
      bookmarks: response.bookmarks,
      deleted_ids: response.deleted_ids ?? [],
      total: response.total,
    };
  }

  /**
   * Everything changed since a time, fetching every page. Record when you
   * started the sync and pass it as `since` next time.
   */
  async sync(since: number | Date, options: SyncOptions = {}): Promise<BookmarkChanges> {
    const pageSize = options.pageSize ?? MAX_PAGE_SIZE;
    checkPageSize(pageSize, 'pageSize');
    const result: BookmarkChanges = { bookmarks: [], deleted_ids: [], total: 0 };
    let offset = 0;
    for (;;) {
      const page = await this.changes(since, { limit: pageSize, offset });
      result.bookmarks.push(...page.bookmarks);
      result.deleted_ids.push(...page.deleted_ids);
      result.total = page.total;
      // A page holds up to `pageSize` entries, counting deleted IDs.
      const received = page.bookmarks.length + page.deleted_ids.length;
      offset += received;
      if (received < pageSize) return result;
    }
  }

  /** Save a URL, or private content. Saving a URL twice updates the existing bookmark. */
  async save(options: SaveBookmarkOptions): Promise<Bookmark> {
    if (options.url === undefined && options.privateSource === undefined) {
      throw new TypeError('url is required unless privateSource is set');
    }
    if (options.url !== undefined && options.privateSource !== undefined) {
      throw new TypeError('url and privateSource cannot be used together');
    }
    if (options.privateSource !== undefined && options.content === undefined) {
      throw new TypeError('privateSource requires content');
    }
    return this.api.request<Bookmark>('POST', '/bookmarks', {
      json: compact({
        url: options.url,
        title: options.title,
        description: options.description,
        folder_id: options.folderId,
        archived: options.archived,
        canonicalize: options.canonicalize,
        tags: options.tags?.map((name) => ({ name })),
        content: options.content,
        private_source: options.privateSource,
      }),
    });
  }

  /** Change a bookmark's title, description, or reading progress. */
  async update(bookmarkId: number, options: UpdateBookmarkOptions): Promise<Bookmark> {
    if (
      options.title === undefined &&
      options.description === undefined &&
      options.progress === undefined &&
      options.progressTimestamp === undefined
    ) {
      throw new TypeError('update needs a title, description, or progress');
    }
    if (options.progress === undefined && options.progressTimestamp !== undefined) {
      throw new TypeError('progressTimestamp requires progress');
    }
    let progress: { percentage: number; timestamp: number } | undefined;
    if (options.progress !== undefined) {
      if (!(options.progress >= 0 && options.progress <= 1)) {
        throw new RangeError('progress must be between 0 and 1');
      }
      progress = {
        percentage: options.progress,
        timestamp: options.progressTimestamp ?? Math.floor(Date.now() / 1000),
      };
    }
    return this.api.request<Bookmark>('POST', `/bookmarks/${id(bookmarkId)}`, {
      json: compact({ title: options.title, description: options.description, progress }),
    });
  }

  /** Permanently delete a bookmark. This is not the same as archiving. */
  async delete(bookmarkId: number): Promise<void> {
    await this.api.request<void>('DELETE', `/bookmarks/${id(bookmarkId)}`, { expectJson: false });
  }

  archive(bookmarkId: number): Promise<Bookmark> {
    return this.move(bookmarkId, 'archive');
  }

  /** Move a bookmark back to the home list. */
  unarchive(bookmarkId: number): Promise<Bookmark> {
    return this.move(bookmarkId, 'home');
  }

  moveToFolder(bookmarkId: number, folderId: number): Promise<Bookmark> {
    return this.move(bookmarkId, String(id(folderId)));
  }

  like(bookmarkId: number): Promise<Bookmark> {
    return this.api.request<Bookmark>('POST', `/bookmarks/${id(bookmarkId)}/like`);
  }

  unlike(bookmarkId: number): Promise<Bookmark> {
    return this.api.request<Bookmark>('DELETE', `/bookmarks/${id(bookmarkId)}/like`);
  }

  /** Add tags (by name or ID) to a bookmark and remove tags (by ID) from it. */
  async updateTags(bookmarkId: number, options: UpdateTagsOptions): Promise<TagChanges> {
    const add = options.add ?? [];
    const remove = options.remove ?? [];
    if (add.length === 0 && remove.length === 0) {
      throw new TypeError('updateTags needs at least one tag to add or remove');
    }
    for (const tag of add) {
      const validName = typeof tag === 'string' && tag.trim() !== '';
      if (!validName && !isPositiveInteger(tag)) {
        throw new TypeError('Tags to add must be non-empty names or positive integer IDs');
      }
    }
    if (!remove.every(isPositiveInteger)) {
      throw new TypeError('Tags to remove must be positive integer IDs');
    }
    return this.api.request<TagChanges>('POST', `/bookmarks/${id(bookmarkId)}/tags`, {
      json: {
        add_tags: add.map((tag) => (typeof tag === 'number' ? { id: tag } : { name: tag })),
        remove_tags: remove.map((tagId) => ({ id: tagId })),
      },
    });
  }

  /** Instapaper's parsed, reader-ready version of a saved article. */
  async parse(bookmarkId: number, options: ParseOptions = {}): Promise<ParsedArticle> {
    const path = `/bookmarks/${id(bookmarkId)}/parse`;
    const useCache = options.useCache ?? true;
    const force = options.force ?? false;
    if (options.content !== undefined) {
      return this.api.request<ParsedArticle>('POST', path, {
        json: compact({
          use_cache: useCache,
          force,
          content: options.content,
          instaparser_api_key: options.instaparserApiKey,
        }),
      });
    }
    return this.api.request<ParsedArticle>('GET', path, {
      query: {
        use_cache: useCache ? undefined : '0',
        force: force ? '1' : undefined,
        instaparser_api_key: options.instaparserApiKey,
      },
    });
  }

  private move(bookmarkId: number, section: string): Promise<Bookmark> {
    return this.api.request<Bookmark>('POST', `/bookmarks/${id(bookmarkId)}/move`, {
      json: { section },
    });
  }
}

/**
 * The API ignores folder_id and tag whenever section is sent, so a mismatched
 * section would quietly return the wrong list.
 */
function checkSection(options: { section?: string; folderId?: number; tag?: string }): void {
  const { section, folderId, tag } = options;
  if (folderId !== undefined && tag !== undefined) {
    throw new TypeError('folderId and tag cannot be used together');
  }
  if (section === undefined) return;
  if (!SECTIONS.includes(section as BookmarkSection)) {
    throw new TypeError(`section must be one of: ${SECTIONS.join(', ')}`);
  }
  if (folderId !== undefined && section !== 'folder') {
    throw new TypeError(`folderId can't be used with section "${section}"`);
  }
  if (tag !== undefined && section !== 'tag') {
    throw new TypeError(`tag can't be used with section "${section}"`);
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function checkPageSize(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new RangeError(`${name} must be an integer from 1 to ${MAX_PAGE_SIZE}`);
  }
}

function toTimestamp(since: number | Date): number {
  const value = since instanceof Date ? Math.floor(since.getTime() / 1000) : since;
  // The API treats 0 as "no timestamp" and returns a normal list instead.
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError('since must be a positive Unix timestamp or a Date');
  }
  return value;
}

/** Validate an ID used in a URL path. */
export function id(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`Expected a positive integer ID, got ${String(value)}`);
  }
  return value;
}

/** Drop keys whose value is `undefined`. */
export function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
