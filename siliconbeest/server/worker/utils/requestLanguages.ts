import { parseAcceptLanguage } from '../../../../packages/shared/utils/naturalLanguage';

const DISPLAY_LOCALE_COOKIE = 'siliconbeest_display_locale';

function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const part = cookieHeader.split(';').find((candidate) => {
    const separator = candidate.indexOf('=');
    return separator >= 0 && candidate.slice(0, separator).trim() === name;
  });
  if (!part) return null;

  const rawValue = part.slice(part.indexOf('=') + 1).trim();
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

export function getPreferredRequestLanguages(input: {
  cookie?: string | null;
  userLocale?: string | null;
  acceptLanguage?: string | null;
}): string[] {
  const candidates = [
    readCookie(input.cookie, DISPLAY_LOCALE_COOKIE),
    input.userLocale,
    ...parseAcceptLanguage(input.acceptLanguage),
  ];

  return candidates.reduce<string[]>((result, candidate) => {
    const language = candidate?.trim().replaceAll('_', '-').toLowerCase();
    if (!language || language === '*' || result.includes(language)) return result;
    return [...result, language];
  }, []);
}
