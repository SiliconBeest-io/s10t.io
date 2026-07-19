/**
 * The previous UI is preserved under /old/* (see pages/old/ and src/legacy/).
 * These helpers let auth middleware treat /old/x like /x and let the app
 * translate between the two trees.
 */
export const OLD_DESIGN_PREFIX = '/old';

export function isOldDesignPath(path: string): boolean {
  return path === OLD_DESIGN_PREFIX || path.startsWith(`${OLD_DESIGN_PREFIX}/`);
}

/** Map an /old/* path (or fullPath with query/hash) to its new-design equivalent. */
export function stripOldPrefix(fullPath: string): string {
  if (fullPath === OLD_DESIGN_PREFIX) return '/';
  if (
    fullPath.startsWith(`${OLD_DESIGN_PREFIX}/`) ||
    fullPath.startsWith(`${OLD_DESIGN_PREFIX}?`) ||
    fullPath.startsWith(`${OLD_DESIGN_PREFIX}#`)
  ) {
    const rest = fullPath.slice(OLD_DESIGN_PREFIX.length);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return fullPath;
}

/** Map a new-design fullPath to its /old/* equivalent. */
export function toOldPath(fullPath: string): string {
  if (isOldDesignPath(fullPath)) return fullPath;
  return fullPath === '/' ? OLD_DESIGN_PREFIX : `${OLD_DESIGN_PREFIX}${fullPath}`;
}

/**
 * The Aurora UI (the design Deck replaced as default) is preserved under
 * /aurora/* (see pages/aurora/ and src/views/), mirroring how the classic
 * design lives under /old/*.
 */
export const AURORA_DESIGN_PREFIX = '/aurora';

export function isAuroraDesignPath(path: string): boolean {
  return path === AURORA_DESIGN_PREFIX || path.startsWith(`${AURORA_DESIGN_PREFIX}/`);
}

/** Map an /aurora/* path (or fullPath with query/hash) to its canonical equivalent. */
export function stripAuroraPrefix(fullPath: string): string {
  if (fullPath === AURORA_DESIGN_PREFIX) return '/';
  if (
    fullPath.startsWith(`${AURORA_DESIGN_PREFIX}/`) ||
    fullPath.startsWith(`${AURORA_DESIGN_PREFIX}?`) ||
    fullPath.startsWith(`${AURORA_DESIGN_PREFIX}#`)
  ) {
    const rest = fullPath.slice(AURORA_DESIGN_PREFIX.length);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return fullPath;
}

/** Map a canonical fullPath to its /aurora/* equivalent. */
export function toAuroraPath(fullPath: string): string {
  if (isAuroraDesignPath(fullPath)) return fullPath;
  return fullPath === '/' ? AURORA_DESIGN_PREFIX : `${AURORA_DESIGN_PREFIX}${fullPath}`;
}

/** Map an Aurora/Classic URL to its canonical Deck equivalent. */
export function toDeckPath(fullPath: string): string {
  // The banner receives route.fullPath, so design roots can include a query
  // or hash (`/old?x=1`) that route.path-based predicates intentionally ignore.
  const canonicalPath = stripAuroraPrefix(stripOldPrefix(fullPath));

  if (canonicalPath.startsWith('/recommended')) {
    const suffix = canonicalPath.slice('/recommended'.length);
    if (suffix === '' || suffix === '/') return '/timelines/recommended';
    if (suffix.startsWith('?') || suffix.startsWith('#')) {
      return `/timelines/recommended${suffix}`;
    }
    if (suffix.startsWith('/?') || suffix.startsWith('/#')) {
      return `/timelines/recommended${suffix.slice(1)}`;
    }
  }

  return canonicalPath;
}
