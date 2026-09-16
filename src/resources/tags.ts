import type { ApiClient } from '../http';
import type { Tag } from '../types';
import { id } from './bookmarks';

/** List, create, and rename a user's tags. */
export class Tags {
  constructor(private readonly api: ApiClient) {}

  async list(): Promise<Tag[]> {
    const response = await this.api.request<{ tags: Tag[] }>('GET', '/tags');
    return response.tags;
  }

  create(name: string): Promise<Tag> {
    return this.api.request<Tag>('POST', '/tags', { json: { name } });
  }

  rename(tagId: number, name: string): Promise<Tag> {
    return this.api.request<Tag>('POST', `/tags/${id(tagId)}`, { json: { name } });
  }
}
