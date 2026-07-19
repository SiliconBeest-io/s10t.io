/* oxlint-disable fp/no-try-statements */
import { env } from 'cloudflare:workers';

export const WORKERS_AI_RATE_LIMIT_FEATURES = {
  recommendation: {
    binding: 'AI_RECOMMENDATION_RATE_LIMITER',
    periodVariable: 'WORKERS_AI_RECOMMENDATION_RATE_LIMIT_PERIOD_SECONDS',
  },
  translation: {
    binding: 'AI_TRANSLATION_RATE_LIMITER',
    periodVariable: 'WORKERS_AI_TRANSLATION_RATE_LIMIT_PERIOD_SECONDS',
  },
  imageDescription: {
    binding: 'AI_IMAGE_DESCRIPTION_RATE_LIMITER',
    periodVariable: 'WORKERS_AI_IMAGE_DESCRIPTION_RATE_LIMIT_PERIOD_SECONDS',
  },
} as const;

export type WorkersAiRateLimitFeature = keyof typeof WORKERS_AI_RATE_LIMIT_FEATURES;

export type WorkersAiRateLimitResult =
  | { readonly allowed: true; readonly retryAfterSeconds: 0 }
  | {
    readonly allowed: false;
    readonly retryAfterSeconds: number;
    readonly reason: 'limited' | 'unavailable';
  };

type RateLimitBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

// This value is used only when an enabled deployment has malformed policy
// variables and therefore has no configured period to expose in Retry-After.
// It does not configure or otherwise change Cloudflare's native counter.
const UNAVAILABLE_RETRY_AFTER_SECONDS = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBinding(bindings: object, name: string): unknown {
  return Reflect.get(bindings, name);
}

function isRateLimitingDisabled(bindings: object): boolean {
  const value = readBinding(bindings, 'WORKERS_AI_RATE_LIMITS');
  return value === false
    || (typeof value === 'string' && value.trim().toLowerCase() === 'false');
}

function readPositiveIntegerBinding(bindings: object, name: string): number | null {
  const value = readBinding(bindings, name);
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function readConfiguredPeriodSeconds(
  bindings: object,
  variableName: string,
): number | null {
  const value = readPositiveIntegerBinding(bindings, variableName);
  // Cloudflare's native simple rate-limit binding currently accepts only
  // 10-second and 60-second periods.
  return value === 10 || value === 60 ? value : null;
}

function getRateLimitBinding(
  bindings: object,
  bindingName: string,
): RateLimitBinding | null {
  const binding = Reflect.get(bindings, bindingName) as unknown;
  if (!isRecord(binding)) return null;
  const limit = Reflect.get(binding, 'limit') as unknown;
  if (typeof limit !== 'function') return null;

  return {
    limit: async (options) => Promise.resolve(
      Reflect.apply(limit, binding, [options]) as Promise<{ success: boolean }>,
    ),
  };
}

/**
 * Consume one account-bound inference allowance from Cloudflare's native Rate
 * Limiting binding. The binding is deliberately resolved through reflection so
 * the same source compiles when optional AI bindings are absent. A missing or
 * failing guard is fail-closed; it must never turn into an unbounded paid path.
 *
 * Cloudflare's counter is a best-effort, per-location abuse brake rather than
 * an exact global billing ledger. Input-size limits remain the primary cost
 * bound for an individual inference.
 */
export async function consumeWorkersAiRateLimit(
  feature: WorkersAiRateLimitFeature,
  accountId: string,
  bindings: object = env,
): Promise<WorkersAiRateLimitResult> {
  // Rate limiting is enabled by default for safety. Only an explicit false
  // opts out, in which case no optional limiter binding is inspected/called.
  if (isRateLimitingDisabled(bindings)) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const config = WORKERS_AI_RATE_LIMIT_FEATURES[feature];
  const configuredPeriodSeconds = readConfiguredPeriodSeconds(bindings, config.periodVariable);
  const retryAfterSeconds = configuredPeriodSeconds ?? UNAVAILABLE_RETRY_AFTER_SECONDS;

  if (accountId.length === 0) {
    return {
      allowed: false,
      retryAfterSeconds,
      reason: 'unavailable',
    };
  }

  const limiter = getRateLimitBinding(bindings, config.binding);
  if (!limiter) {
    return {
      allowed: false,
      retryAfterSeconds,
      reason: 'unavailable',
    };
  }

  try {
    // The generated Wrangler `ratelimits[].simple` block is the sole source of
    // enforcement policy. Runtime code supplies only the account-scoped key.
    const result = await limiter.limit({ key: accountId });
    return result.success
      ? { allowed: true, retryAfterSeconds: 0 }
      : {
        allowed: false,
        retryAfterSeconds,
        reason: 'limited',
      };
  } catch {
    return {
      allowed: false,
      retryAfterSeconds,
      reason: 'unavailable',
    };
  }
}
