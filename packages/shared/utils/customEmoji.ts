import type { CustomEmoji } from '../types/mastodon-base';

type EmojiTagLike = Record<string, unknown>;

function firstStringUrl(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof URL) return value.href;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstStringUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return firstStringUrl(obj.url) ?? firstStringUrl(obj.href) ?? firstStringUrl(obj.id);
  }
  return null;
}

export function emojiShortcodeFromName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const shortcode = name.replace(/^:+|:+$/g, '');
  return /^[A-Za-z0-9_]+$/.test(shortcode) ? shortcode : null;
}

export function proxyCustomEmojiUrl(url: string, instanceDomain?: string): string {
  if (!url || !instanceDomain) return url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === instanceDomain) return url;
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url;
    return `https://${instanceDomain}/proxy?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}

export function emojiTagToCustomEmoji(tag: EmojiTagLike, instanceDomain?: string): CustomEmoji | null {
  const shortcode = emojiShortcodeFromName(tag.shortcode) ?? emojiShortcodeFromName(tag.name);
  const rawUrl = firstStringUrl(tag.url) ?? firstStringUrl(tag.icon);
  if (!shortcode || !rawUrl) return null;

  const rawStaticUrl = firstStringUrl(tag.static_url) ?? firstStringUrl(tag.staticUrl) ?? rawUrl;
  return {
    shortcode,
    url: proxyCustomEmojiUrl(rawUrl, instanceDomain),
    static_url: proxyCustomEmojiUrl(rawStaticUrl, instanceDomain),
    visible_in_picker: Boolean(tag.visible_in_picker ?? tag.visibleInPicker ?? false),
  };
}

export function parseCustomEmojiTagsJson(tagsJson: string | null | undefined, instanceDomain?: string): CustomEmoji[] {
  if (!tagsJson) return [];
  try {
    const tags = JSON.parse(tagsJson);
    if (!Array.isArray(tags)) return [];
    return dedupeCustomEmojis(tags.map((tag) => emojiTagToCustomEmoji(tag, instanceDomain)).filter(Boolean) as CustomEmoji[]);
  } catch {
    return [];
  }
}

export function dedupeCustomEmojis(emojis: CustomEmoji[]): CustomEmoji[] {
  const seen = new Set<string>();
  const result: CustomEmoji[] = [];
  for (const emoji of emojis) {
    if (!emoji.shortcode || !emoji.url || seen.has(emoji.shortcode)) continue;
    seen.add(emoji.shortcode);
    result.push(emoji);
  }
  return result;
}

export function customEmojiTagDomain(tag: EmojiTagLike, fallbackUri?: string): string | null {
  const candidates = [firstStringUrl(tag.id), firstStringUrl(tag.url), firstStringUrl(tag.icon), fallbackUri];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return new URL(candidate).hostname;
    } catch {
      // keep looking
    }
  }
  return null;
}

