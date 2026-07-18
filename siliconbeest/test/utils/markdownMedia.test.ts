import { describe, expect, it } from 'vitest';
import type { MediaAttachment } from '@/types/mastodon';
import { articleMediaMarkdown } from '@/utils/markdownMedia';

function media(overrides: Partial<MediaAttachment> = {}): MediaAttachment {
  return {
    id: 'media-1',
    type: 'image',
    url: 'https://cdn.example/image.png',
    preview_url: null,
    remote_url: null,
    meta: null,
    description: null,
    blurhash: null,
    ...overrides,
  };
}

describe('articleMediaMarkdown', () => {
  it('formats images with Markdown image syntax and a filename fallback', () => {
    expect(articleMediaMarkdown(media(), 'architecture.png')).toBe(
      '![architecture](https://cdn.example/image.png)',
    );
  });

  it('uses accessible alt text and escapes Markdown brackets', () => {
    expect(articleMediaMarkdown(media({ description: 'Flow [overview]' }))).toBe(
      '![Flow \\[overview\\]](https://cdn.example/image.png)',
    );
  });

  it('formats non-image media as an inline Markdown link', () => {
    expect(articleMediaMarkdown(media({ type: 'video', url: 'https://cdn.example/demo.mp4' }), 'demo.mp4')).toBe(
      '[demo](https://cdn.example/demo.mp4)',
    );
  });
});
