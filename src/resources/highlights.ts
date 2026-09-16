import type { ApiClient } from '../http';
import type { Highlight } from '../types';
import { compact, id } from './bookmarks';

export interface CreateHighlightOptions {
  /** The highlighted text. Leading and trailing whitespace is trimmed by the API. */
  text: string;
  note?: string;
  /**
   * Which occurrence of `text` in the article body to highlight, counting
   * from 0. Defaults to 0, the first occurrence.
   */
  position?: number;
}

/** Read, create, and delete highlights on a bookmark. */
export class Highlights {
  constructor(private readonly api: ApiClient) {}

  async list(bookmarkId: number): Promise<Highlight[]> {
    const response = await this.api.request<{ highlights: Highlight[] }>(
      'GET',
      `/bookmarks/${id(bookmarkId)}/highlights`,
    );
    return response.highlights;
  }

  /**
   * Create a highlight. Accounts without Premium can create five per month;
   * past that this throws a `PermissionDeniedError`.
   */
  async create(bookmarkId: number, options: CreateHighlightOptions): Promise<Highlight> {
    if (typeof options?.text !== 'string' || options.text.trim() === '') {
      throw new TypeError('Highlight text cannot be blank');
    }
    return this.api.request<Highlight>('POST', `/bookmarks/${id(bookmarkId)}/highlights`, {
      json: compact({ text: options.text, note: options.note, position: options.position }),
    });
  }

  /**
   * Delete a highlight. Throws `BadRequestError` if the highlight doesn't
   * exist, belongs to someone else, or was already deleted.
   */
  async delete(highlightId: number): Promise<void> {
    await this.api.request<void>('DELETE', `/highlights/${id(highlightId)}`, {
      expectJson: false,
    });
  }
}
