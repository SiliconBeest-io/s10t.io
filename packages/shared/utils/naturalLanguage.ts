export type NaturalLanguageMap = Record<string, string>;

function normalizeLanguageTag(tag: string): string {
  return tag.trim().replaceAll('_', '-').toLowerCase();
}

/** Parse a JSON-backed or in-memory ActivityStreams natural-language map. */
export function parseNaturalLanguageMap(value: unknown): NaturalLanguageMap | null {
  let candidate = value;
  if (typeof candidate === 'string') {
    if (!candidate.trim()) return null;
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;

  const result = Object.entries(candidate as Record<string, unknown>)
    .reduce<NaturalLanguageMap>((map, [language, text]) => {
      if (typeof text !== 'string') return map;
      const normalizedLanguage = normalizeLanguageTag(language);
      return normalizedLanguage ? { ...map, [normalizedLanguage]: text } : map;
    }, {});
  return Object.keys(result).length > 0 ? result : null;
}

/** Sanitize and serialize an ActivityStreams natural-language map for storage. */
export function serializeNaturalLanguageMap(
  value: unknown,
  transform: (text: string) => string = (text) => text,
): string | null {
  const map = parseNaturalLanguageMap(value);
  if (!map) return null;

  const transformed = Object.fromEntries(
    Object.entries(map).map(([language, text]) => [language, transform(text)]),
  );
  return JSON.stringify(transformed);
}

/** Parse an HTTP Accept-Language value in descending quality order. */
export function parseAcceptLanguage(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part, index) => {
      const [rawTag = '', ...parameters] = part.trim().split(';');
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith('q='));
      const quality = qualityParameter
        ? Number.parseFloat(qualityParameter.trim().slice(2))
        : 1;
      return {
        tag: normalizeLanguageTag(rawTag),
        quality: Number.isFinite(quality) ? quality : 0,
        index,
      };
    })
    .filter(({ tag, quality }) => tag !== '*' && tag.length > 0 && quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map(({ tag }) => tag);
}

function matchScore(preferred: string, available: string): number {
  if (preferred === available) return 1000;

  const preferredParts = preferred.split('-');
  const availableParts = available.split('-');
  if (preferredParts[0] !== availableParts[0]) return -1;

  // Prefer a variant sharing explicit script/region subtags (e.g. ko-KR -> ko-Hang-KR).
  const sharedSubtagScore = preferredParts
    .slice(1)
    .filter((subtag) => availableParts.includes(subtag))
    .length * 10;
  return 100
    + (available.startsWith(`${preferred}-`) ? 200 : 0)
    + (preferred.startsWith(`${available}-`) ? 150 : 0)
    + sharedSubtagScore;
}

export function selectNaturalLanguage(
  value: unknown,
  preferredLanguages: readonly string[],
): { language: string; value: string } | null {
  const map = parseNaturalLanguageMap(value);
  if (!map || preferredLanguages.length === 0) return null;

  const available = Object.keys(map);
  return preferredLanguages.reduce<{ language: string; value: string } | null>((match, rawPreferred) => {
    if (match) return match;
    const preferred = normalizeLanguageTag(rawPreferred);
    if (!preferred || preferred === '*') return null;

    const selected = available.reduce<{ language: string | null; score: number }>((best, language) => {
      const score = matchScore(preferred, language);
      return score > best.score ? { language, score } : best;
    }, { language: null, score: -1 });

    return selected.language && selected.score >= 0
      ? { language: selected.language, value: map[selected.language] ?? '' }
      : null;
  }, null);
}

export function localizeStatusFields(
  row: {
    title?: unknown;
    title_map?: unknown;
    content?: unknown;
    content_map?: unknown;
    content_warning?: unknown;
    content_warning_map?: unknown;
    language?: unknown;
  },
  preferredLanguages: readonly string[],
): { title: string; content: string; contentWarning: string; language: string | null } {
  const content = selectNaturalLanguage(row.content_map, preferredLanguages);
  const title = selectNaturalLanguage(
    row.title_map,
    content ? [content.language, ...preferredLanguages] : preferredLanguages,
  );
  const contentWarning = selectNaturalLanguage(
    row.content_warning_map,
    content ? [content.language, ...preferredLanguages] : preferredLanguages,
  );

  return {
    title: title?.value ?? (typeof row.title === 'string' ? row.title : ''),
    content: content?.value ?? (typeof row.content === 'string' ? row.content : ''),
    contentWarning: contentWarning?.value
      ?? (typeof row.content_warning === 'string' ? row.content_warning : ''),
    language: content?.language ?? (typeof row.language === 'string' ? row.language : null),
  };
}
