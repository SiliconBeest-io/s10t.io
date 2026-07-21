import { describe, expect, it } from 'vitest';
import {
  statusHtmlToTranslationText,
  translatedStatusTextToHtml,
} from '../../server/worker/endpoints/api/v1/statuses/translate';

describe('status translation text boundaries', () => {
  it('strips markup and decodes HTML entities before inference', () => {
    expect(statusHtmlToTranslationText(
      '<p>Hello &amp; <strong>world</strong></p><script>ignored()</script>',
    )).toBe('Hello & world');
  });

  it('preserves HTML block boundaries as paragraphs for translation batching', () => {
    expect(statusHtmlToTranslationText(
      '<p>First line<br>continued</p><blockquote>Second paragraph</blockquote>',
    )).toBe('First line\ncontinued\n\nSecond paragraph');
  });

  it('renders translated model output as safe status HTML', () => {
    const html = translatedStatusTextToHtml(
      '<script>alert(1)</script> & translated',
      'social.example',
    );

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&amp; translated');
  });
});
