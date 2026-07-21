import type { MediaAttachment } from '@/types/mastodon';

function escapeMarkdownLabel(label: string): string {
  return label.replace(/([\\[\]])/g, '\\$1');
}

function fallbackLabel(media: MediaAttachment, fileName?: string): string {
  const nameWithoutExtension = fileName?.replace(/\.[^.]+$/, '').trim();
  if (nameWithoutExtension) return nameWithoutExtension;
  if (media.type === 'video') return 'video';
  if (media.type === 'audio') return 'audio';
  return 'image';
}

/** Format uploaded Article media as body Markdown instead of a status attachment. */
export function articleMediaMarkdown(media: MediaAttachment, fileName?: string): string {
  const label = escapeMarkdownLabel(
    media.description?.trim() || fallbackLabel(media, fileName),
  );

  if (media.type === 'image' || media.type === 'gifv') {
    return `![${label}](${media.url})`;
  }

  return `[${label}](${media.url})`;
}
