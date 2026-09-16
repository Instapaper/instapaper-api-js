import { ApiClient, Transport, type TransportOptions } from './http';
import { Bookmarks } from './resources/bookmarks';
import { Folders } from './resources/folders';
import { Highlights } from './resources/highlights';
import { Tags } from './resources/tags';
import type { User } from './types';

export interface InstapaperOptions extends TransportOptions {
  /** A personal access token, or one issued through the OAuth flow. */
  accessToken: string;
}

/** Client for the Instapaper API v2. */
export class Instapaper {
  readonly bookmarks: Bookmarks;
  readonly folders: Folders;
  readonly tags: Tags;
  readonly highlights: Highlights;
  private readonly api: ApiClient;

  constructor(options: InstapaperOptions) {
    if (!options || typeof options.accessToken !== 'string' || !options.accessToken) {
      throw new TypeError('accessToken is required');
    }
    this.api = new ApiClient(new Transport(options), options.accessToken);
    this.bookmarks = new Bookmarks(this.api);
    this.folders = new Folders(this.api);
    this.tags = new Tags(this.api);
    this.highlights = new Highlights(this.api);
  }

  /** The account the access token belongs to. */
  me(): Promise<User> {
    return this.api.request<User>('GET', '/me');
  }
}
