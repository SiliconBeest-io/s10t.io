import { describe, expect, it, vi } from 'vitest';
import {
  cacheWorkersAiFeatureFlags,
  getWorkersAiFeatureFlags,
  hydrateWorkersAiFeatureFlagsCache,
  parseWorkersAiFeatureSettings,
} from '../../server/worker/services/workersAiFeatures';

function enabledBindings(cache?: Record<string, unknown>): Record<string, unknown> {
  return {
    WORKERS_AI_ENABLED: true,
    AI: { run: vi.fn() },
    ...(cache ? { CACHE: cache } : {}),
  };
}

describe('Workers AI admin feature flags', () => {
  it('treats missing and malformed setting values as disabled', () => {
    expect(parseWorkersAiFeatureSettings({})).toEqual({
      recommendation: false,
      translation: false,
      imageDescription: false,
    });
    expect(parseWorkersAiFeatureSettings({
      workers_ai_recommendation_enabled: 'true',
      workers_ai_translation_enabled: '1',
      workers_ai_image_description_enabled: '0',
    })).toEqual({
      recommendation: false,
      translation: true,
      imageDescription: false,
    });
  });

  it('does not read the cache when the deployment master switch is unavailable', async () => {
    const get = vi.fn(async () => ({
      recommendation: true,
      translation: true,
      imageDescription: true,
    }));

    await expect(getWorkersAiFeatureFlags({ CACHE: { get } })).resolves.toEqual({
      recommendation: false,
      translation: false,
      imageDescription: false,
    });
    expect(get).not.toHaveBeenCalled();
  });

  it('preserves independent switches from the write-through snapshot', async () => {
    const cache = {
      get: vi.fn(async () => ({
        recommendation: true,
        translation: false,
        imageDescription: true,
      })),
    };

    await expect(getWorkersAiFeatureFlags(enabledBindings(cache))).resolves.toEqual({
      recommendation: true,
      translation: false,
      imageDescription: true,
    });
  });

  it('uses and writes the single KV snapshot without a settings query', async () => {
    const state = new Map<string, string>();
    const cache = {
      get: vi.fn(async (key: string, type?: string) => {
        const value = state.get(key);
        return type === 'json' && value ? JSON.parse(value) : value ?? null;
      }),
      put: vi.fn(async (key: string, value: string) => {
        state.set(key, value);
      }),
    };
    const bindings = enabledBindings(cache);

    await cacheWorkersAiFeatureFlags({
      workers_ai_recommendation_enabled: '0',
      workers_ai_translation_enabled: '1',
      workers_ai_image_description_enabled: '0',
    }, bindings);

    await expect(getWorkersAiFeatureFlags(bindings)).resolves.toEqual({
      recommendation: false,
      translation: true,
      imageDescription: false,
    });
    expect(cache.put).toHaveBeenCalledWith(
      'instance:workers-ai-features:v1',
      expect.any(String),
    );
  });

  it('fails closed when no valid cache snapshot exists', async () => {
    await expect(getWorkersAiFeatureFlags(enabledBindings())).resolves.toEqual({
      recommendation: false,
      translation: false,
      imageDescription: false,
    });
  });

  it('hydrates only a missing snapshot from an existing instance settings batch', async () => {
    const put = vi.fn(async () => undefined);
    const get = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        recommendation: false,
        translation: true,
        imageDescription: false,
      });
    const bindings = enabledBindings({ get, put });

    await hydrateWorkersAiFeatureFlagsCache({
      workers_ai_recommendation_enabled: '1',
      workers_ai_translation_enabled: '0',
      workers_ai_image_description_enabled: '1',
    }, bindings);
    expect(put).toHaveBeenCalledOnce();

    put.mockClear();
    await hydrateWorkersAiFeatureFlagsCache({
      workers_ai_recommendation_enabled: '0',
      workers_ai_translation_enabled: '1',
      workers_ai_image_description_enabled: '0',
    }, bindings);
    expect(put).not.toHaveBeenCalled();
  });
});
