/**
 * Response types for the Instapaper API v2.
 *
 * Field names match the JSON the API returns exactly (snake_case), so there is
 * no mapping layer between what the server sends and what you get back.
 */

/** Which list of bookmarks to read. */
export type BookmarkSection = 'home' | 'archive' | 'liked' | 'folder' | 'tag';

/**
 * Known values of `Bookmark.category`. New categories may be added, so treat
 * an unknown value as an article.
 */
export const BookmarkCategory = {
  Article: 0,
  Email: 1,
  Video: 2,
  PDF: 3,
  Social: 4,
} as const;

export type BookmarkCategory = (typeof BookmarkCategory)[keyof typeof BookmarkCategory];

export interface User {
  /** Stable numeric ID. Store this as your reference to the user. */
  id: number;
  /** Usually an email address. Display only; it can change. */
  username: string;
  /** Whether the account has an active Instapaper Premium subscription. */
  premium: boolean;
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
  count: number;
  /** Reserved for Instapaper's own clients; always `null` here. */
  baton: string | null;
}

export interface Progress {
  /** Reading progress from 0.0 to 1.0. */
  percentage: number;
  /** When the progress was recorded, as a Unix timestamp. */
  timestamp: number;
}

export interface Bookmark {
  id: number;
  /** `null` for private content saved without a URL. */
  url: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
  progress: Progress;
  liked: boolean;
  archived: boolean;
  /** When the bookmark was saved, as a Unix timestamp. */
  time: number;
  /** When the article was published, as a Unix timestamp, if known. */
  pubtime: number | null;
  author: string | null;
  /** The folder it's in, or `null` when it's in the home list. */
  folder_id: number | null;
  tags: Tag[];
  private_source: string | null;
  /** See {@link BookmarkCategory}. May hold values this SDK doesn't know yet. */
  category: number;
}

export interface Folder {
  id: number;
  title: string;
  slug: string;
  position: number;
  public: boolean;
  count: number;
}

export interface Highlight {
  id: number;
  bookmark_id: number;
  text: string;
  note: string | null;
  /** Which occurrence of `text` in the article body this highlight marks, counting from 0. */
  position: number;
  /** When it was created, as a Unix timestamp. */
  time: number;
}

export interface ArticleAuthor {
  name: string;
  url: string | null;
}

export interface ArticleMetadata {
  title: string | null;
  author: ArticleAuthor | null;
  pubtime: number | null;
  thumbnail: string | null;
  description: string | null;
  private_source: string | null;
  category: number;
}

export interface ArticleContent {
  /** Article HTML, UTF-8, with scripts stripped. */
  body: string | null;
  images: string[];
  words: number | null;
  paywalled: boolean;
  /** `ltr` or `rtl`. */
  direction: string | null;
}

export interface ParsedArticle {
  metadata: ArticleMetadata;
  content: ArticleContent;
}

export interface BookmarkList {
  bookmarks: Bookmark[];
  /** Size of the whole section, not of this page. */
  total: number;
}

export interface BookmarkChanges {
  bookmarks: Bookmark[];
  /** IDs of bookmarks deleted since the timestamp. */
  deleted_ids: number[];
  /** Number of changed bookmarks. */
  total: number;
}

export interface TagChanges {
  /** Tags this call created. */
  created_tags: Tag[];
  /** The bookmark's full tag list afterwards. */
  tags: Tag[];
}

/** The user included in a token response. */
export interface TokenUser {
  id: number;
  username: string;
}

export interface AccessToken {
  access_token: string;
  token_type: string;
  user: TokenUser;
}
