/* oxlint-disable fp/no-classes, fp/no-this-expressions, fp/no-throw-statements, fp/no-try-statements */
import { env } from 'cloudflare:workers';
import { isWorkersAiEnabled } from './workersAi';

export const WORKERS_AI_FEATURE_SETTING_KEYS = {
  recommendation: 'workers_ai_recommendation_enabled',
  translation: 'workers_ai_translation_enabled',
  imageDescription: 'workers_ai_image_description_enabled',
} as const;

export type WorkersAiFeature = keyof typeof WORKERS_AI_FEATURE_SETTING_KEYS;

export type WorkersAiFeatureFlags = Readonly<Record<WorkersAiFeature, boolean>>;

export class WorkersAiFeatureCacheError extends Error {
  constructor() {
    super('Workers AI feature settings could not be synchronized');
    this.name = 'WorkersAiFeatureCacheError';
  }
}

const CACHE_KEY = 'instance:workers-ai-features:v1';
const DISABLED_FLAGS: WorkersAiFeatureFlags = {
  recommendation: false,
  translation: false,
  imageDescription: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Missing and malformed values are deliberately fail-closed. */
export function parseWorkersAiFeatureSettings(
  settings: Readonly<Record<string, string>>,
): WorkersAiFeatureFlags {
  return {
    recommendation: settings[WORKERS_AI_FEATURE_SETTING_KEYS.recommendation] === '1',
    translation: settings[WORKERS_AI_FEATURE_SETTING_KEYS.translation] === '1',
    imageDescription: settings[WORKERS_AI_FEATURE_SETTING_KEYS.imageDescription] === '1',
  };
}

function parseCachedFlags(value: unknown): WorkersAiFeatureFlags | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.recommendation !== 'boolean'
    || typeof value.translation !== 'boolean'
    || typeof value.imageDescription !== 'boolean'
  ) {
    return null;
  }
  return {
    recommendation: value.recommendation,
    translation: value.translation,
    imageDescription: value.imageDescription,
  };
}

async function readCachedFlags(bindings: object): Promise<WorkersAiFeatureFlags | null> {
  const cache = Reflect.get(bindings, 'CACHE') as unknown;
  if (!isRecord(cache)) return null;
  const get = Reflect.get(cache, 'get') as unknown;
  if (typeof get !== 'function') return null;

  try {
    const value = await Promise.resolve(
      Reflect.apply(get, cache, [CACHE_KEY, 'json']) as Promise<unknown>,
    );
    return parseCachedFlags(value);
  } catch {
    return null;
  }
}

async function writeCachedFlags(
  flags: WorkersAiFeatureFlags,
  bindings: object,
): Promise<boolean> {
  const cache = Reflect.get(bindings, 'CACHE') as unknown;
  if (!isRecord(cache)) return false;
  const put = Reflect.get(cache, 'put') as unknown;
  if (typeof put !== 'function') return false;

  try {
    await Promise.resolve(Reflect.apply(put, cache, [
      CACHE_KEY,
      JSON.stringify(flags),
    ]) as Promise<unknown>);
    return true;
  } catch {
    return false;
  }
}

function flagsEqual(
  left: WorkersAiFeatureFlags,
  right: WorkersAiFeatureFlags,
): boolean {
  return left.recommendation === right.recommendation
    && left.translation === right.translation
    && left.imageDescription === right.imageDescription;
}

/**
 * Resolve the three independent admin switches from the write-through KV
 * snapshot. This hot-path reader intentionally performs no D1 query. The
 * public instance endpoint hydrates the snapshot from its existing batched
 * settings read, and the admin endpoint updates it immediately after a save.
 */
export async function getWorkersAiFeatureFlags(
  bindings: object = env,
): Promise<WorkersAiFeatureFlags> {
  if (!isWorkersAiEnabled(bindings)) return DISABLED_FLAGS;
  return await readCachedFlags(bindings) ?? DISABLED_FLAGS;
}

export async function isWorkersAiFeatureEnabled(
  feature: WorkersAiFeature,
  bindings: object = env,
): Promise<boolean> {
  const flags = await getWorkersAiFeatureFlags(bindings);
  return flags[feature];
}

/** Write-through after the existing admin settings batch has completed. */
export async function cacheWorkersAiFeatureFlags(
  settings: Readonly<Record<string, string>>,
  bindings: object = env,
): Promise<void> {
  if (!isWorkersAiEnabled(bindings)) return;
  const expected = parseWorkersAiFeatureSettings(settings);
  const cached = await readCachedFlags(bindings);
  if (cached && flagsEqual(cached, expected)) return;
  if (!await writeCachedFlags(expected, bindings)) {
    // eslint-disable-next-line functional/no-throw-statements -- Admin saves must not report success while enforcement still has stale flags.
    throw new WorkersAiFeatureCacheError();
  }
}

/**
 * Synchronize the snapshot from `/api/v2/instance`'s existing settings batch.
 * Admin saves also write through immediately, so normal feature requests never
 * need to query D1 and stale values are corrected whenever instance metadata
 * is refreshed.
 */
export async function hydrateWorkersAiFeatureFlagsCache(
  settings: Readonly<Record<string, string>>,
  bindings: object = env,
): Promise<boolean> {
  if (!isWorkersAiEnabled(bindings)) return true;
  const expected = parseWorkersAiFeatureSettings(settings);
  const cached = await readCachedFlags(bindings);
  if (cached && flagsEqual(cached, expected)) return true;
  return writeCachedFlags(expected, bindings);
}
