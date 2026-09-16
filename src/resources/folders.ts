import type { ApiClient } from '../http';
import type { Folder } from '../types';
import { id } from './bookmarks';

export interface FolderPosition {
  folderId: number;
  position: number;
}

/** List, create, reorder, and delete a user's folders. */
export class Folders {
  constructor(private readonly api: ApiClient) {}

  /** The user's folders, in their own order. */
  async list(): Promise<Folder[]> {
    const response = await this.api.request<{ folders: Folder[] }>('GET', '/folders');
    return response.folders;
  }

  create(title: string): Promise<Folder> {
    return this.api.request<Folder>('POST', '/folders', { json: { title } });
  }

  /** Delete a folder. Its bookmarks move back to the home list. */
  async delete(folderId: number): Promise<void> {
    await this.api.request<void>('DELETE', `/folders/${id(folderId)}`, { expectJson: false });
  }

  /**
   * Set folder positions, as a `{ folderId: position }` map or a list. Folders
   * you leave out keep their positions. Returns every folder in its new order.
   */
  async reorder(positions: Record<number, number> | FolderPosition[]): Promise<Folder[]> {
    const entries: FolderPosition[] = Array.isArray(positions)
      ? positions
      : Object.entries(positions).map(([folderId, position]) => ({
          folderId: Number(folderId),
          position,
        }));
    if (entries.length === 0) throw new TypeError('reorder needs at least one folder');
    const order = entries.map(({ folderId, position }) => {
      // The API skips a position of 0, so positions start at 1.
      if (!Number.isInteger(position) || position < 1) {
        throw new RangeError('Folder positions must be positive integers');
      }
      return { folder_id: id(folderId), position };
    });
    const response = await this.api.request<{ folders: Folder[] }>('POST', '/folders/reorder', {
      json: { order },
    });
    return response.folders;
  }
}
