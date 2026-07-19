import { describe, expect, it } from 'vitest';
import {
  localizeStatusFields,
  parseAcceptLanguage,
  selectNaturalLanguage,
} from '../../../packages/shared/utils/naturalLanguage';

describe('ActivityStreams natural-language maps', () => {
  const contentMap = {
    en: 'English',
    'ko-hang-kr': '한국어',
    'ko-kore': '韓國語',
    ja: '日本語',
  };

  it('matches a base Korean preference to the Hangul Korean variant', () => {
    expect(selectNaturalLanguage(contentMap, ['ko'])).toEqual({
      language: 'ko-hang-kr',
      value: '한국어',
    });
  });

  it('honours Accept-Language quality values', () => {
    expect(parseAcceptLanguage('en;q=0.4, ja;q=0.8, ko;q=0')).toEqual(['ja', 'en']);
  });

  it('keeps the stored fallback when no preferred variant matches', () => {
    expect(localizeStatusFields({
      title: 'Default title',
      title_map: JSON.stringify({ en: 'English title', ko: '한국어 제목' }),
      content: 'Default body',
      content_map: JSON.stringify(contentMap),
      content_warning: 'Default summary',
      content_warning_map: JSON.stringify({ en: 'English summary', ko: '한국어 요약' }),
      language: 'en',
    }, ['fr'])).toEqual({
      title: 'Default title',
      content: 'Default body',
      contentWarning: 'Default summary',
      language: 'en',
    });
  });
});
