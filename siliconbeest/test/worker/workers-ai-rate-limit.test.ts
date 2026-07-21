import { describe, expect, it, vi } from 'vitest';
import {
  WORKERS_AI_RATE_LIMIT_FEATURES,
  consumeWorkersAiRateLimit,
  type WorkersAiRateLimitFeature,
} from '../../server/worker/services/workersAiRateLimit';

function configuredRateLimitBindings(
  feature: WorkersAiRateLimitFeature,
  limit: (options: { key: string }) => Promise<{ success: boolean }>,
  periodSeconds: 10 | 60 = 60,
): Record<string, unknown> {
  const config = WORKERS_AI_RATE_LIMIT_FEATURES[feature];
  return {
    WORKERS_AI_RATE_LIMITS: true,
    [config.periodVariable]: periodSeconds,
    [config.binding]: { limit },
  };
}

describe('Workers AI native rate-limit adapter', () => {
  it.each([
    ['recommendation', 'AI_RECOMMENDATION_RATE_LIMITER'],
    ['translation', 'AI_TRANSLATION_RATE_LIMITER'],
    ['imageDescription', 'AI_IMAGE_DESCRIPTION_RATE_LIMITER'],
  ] as const)('uses the feature-specific binding for %s', async (feature, bindingName) => {
    const limit = vi.fn(async () => ({ success: true }));

    await expect(consumeWorkersAiRateLimit(
      feature,
      'account-1',
      configuredRateLimitBindings(feature, limit),
    )).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(WORKERS_AI_RATE_LIMIT_FEATURES[feature].binding).toBe(bindingName);
    expect(limit).toHaveBeenCalledWith({ key: 'account-1' });
  });

  it('bypasses the optional binding when rate limiting is disabled', async () => {
    const limit = vi.fn(async () => ({ success: false }));

    await expect(consumeWorkersAiRateLimit(
      'recommendation',
      'account-2',
      {
        ...configuredRateLimitBindings('recommendation', limit),
        WORKERS_AI_RATE_LIMITS: false,
      },
    )).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limit).not.toHaveBeenCalled();
  });

  it('returns the configured period when the native counter is exhausted', async () => {
    await expect(consumeWorkersAiRateLimit(
      'recommendation',
      'account-2',
      configuredRateLimitBindings('recommendation', async () => ({ success: false }), 10),
    )).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 10,
      reason: 'limited',
    });
  });

  it.each([
    ['a missing optional binding', undefined],
    ['a malformed optional binding', { limit: true }],
  ])('fails closed for %s', async (_label, bindingValue) => {
    const bindings = configuredRateLimitBindings(
      'translation',
      async () => ({ success: true }),
    );
    bindings.AI_TRANSLATION_RATE_LIMITER = bindingValue;

    await expect(consumeWorkersAiRateLimit(
      'translation',
      'account-3',
      bindings,
    )).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60,
      reason: 'unavailable',
    });
  });

  it('fails closed when the platform binding rejects', async () => {
    await expect(consumeWorkersAiRateLimit(
      'imageDescription',
      'account-4',
      configuredRateLimitBindings('imageDescription', async () => {
        throw new Error('rate limiter unavailable');
      }),
    )).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60,
      reason: 'unavailable',
    });
  });

});
