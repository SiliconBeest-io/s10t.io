/**
 * Emoji Fetching Utilities
 *
 * Pure functions for fetching custom emoji data from DB rows.
 * Emoji tags are stored as JSON arrays in the `emoji_tags` column
 * of both statuses and accounts tables.
 */

import type { CustomEmoji } from '../types/mastodon-base';
import { emojiTagToCustomEmoji, parseCustomEmojiTagsJson } from './customEmoji';

/**
 * Fetch emojis referenced in a status's content from its emoji_tags JSON column.
 * Only returns emojis whose shortcodes actually appear in the content or CW.
 * URLs are proxied through the instance's proxy endpoint.
 */
export async function fetchEmojisForStatus(
  db: D1Database,
  statusId: string,
  instanceDomain: string,
): Promise<CustomEmoji[]> {
  const row = await db
    .prepare('SELECT emoji_tags, content, content_warning FROM statuses WHERE id = ?')
    .bind(statusId)
    .first();
  if (!row) return [];

  const tagsJson = row.emoji_tags as string | null;
  if (!tagsJson) return [];

  let tags: Array<Record<string, unknown>> = [];
  try {
    tags = JSON.parse(tagsJson);
  } catch {
    return [];
  }

  // Extract shortcodes actually used in content
  const text = ((row.content as string) || '') + ' ' + ((row.content_warning as string) || '');
  const shortcodesInContent = new Set<string>();
  const regex = /:([a-zA-Z0-9_]+):/g;
  let m;
  while ((m = regex.exec(text)) !== null) shortcodesInContent.add(m[1]);

  return tags
    .map((t) => {
      const emoji = emojiTagToCustomEmoji(t, instanceDomain);
      if (!emoji || !shortcodesInContent.has(emoji.shortcode)) return null;
      return emoji;
    })
    .filter(Boolean) as CustomEmoji[];
}

/**
 * Fetch emojis from an account's emoji_tags JSON column.
 * URLs are proxied through the instance's proxy endpoint.
 */
export async function fetchAccountEmojis(
  db: D1Database,
  accountId: string,
  instanceDomain: string,
): Promise<CustomEmoji[]> {
  const row = await db
    .prepare('SELECT emoji_tags FROM accounts WHERE id = ?')
    .bind(accountId)
    .first();
  if (!row) return [];

  const tagsJson = row.emoji_tags as string | null;
  if (!tagsJson) return [];

  return parseCustomEmojiTagsJson(tagsJson, instanceDomain);
}
