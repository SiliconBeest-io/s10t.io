import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WORKERS_AI_MODELS,
  MAX_WORKERS_AI_ALT_TEXT_CHARACTERS,
  MAX_WORKERS_AI_LEGACY_IMAGE_BYTES,
  MAX_WORKERS_AI_TRANSLATION_CHARACTERS,
  WorkersAiServiceError,
  generateImageAltText,
  getWorkersAiModels,
  isWorkersAiEnabled,
  runWorkersAiModel,
  splitWorkersAiTranslationText,
  translateWithWorkersAi,
} from '../../server/worker/services/workersAi';

type RunModel = (model: string, input: Record<string, unknown>) => Promise<unknown>;

function bindings(
  run: RunModel,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    WORKERS_AI_ENABLED: true,
    WORKERS_AI_RECOMMENDATION_MODEL: DEFAULT_WORKERS_AI_MODELS.recommendation,
    WORKERS_AI_TRANSLATION_MODEL: DEFAULT_WORKERS_AI_MODELS.translation,
    WORKERS_AI_IMAGE_CAPTION_MODEL: DEFAULT_WORKERS_AI_MODELS.imageCaption,
    AI: { run },
    ...overrides,
  };
}

async function expectServiceError(
  promise: Promise<unknown>,
  code: WorkersAiServiceError['code'],
): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    name: 'WorkersAiServiceError',
    code,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('optional Workers AI binding', () => {
  it('requires both the feature flag and a callable binding', () => {
    const run = vi.fn();

    expect(isWorkersAiEnabled({ WORKERS_AI_ENABLED: true })).toBe(false);
    expect(isWorkersAiEnabled({ WORKERS_AI_ENABLED: false, AI: { run } })).toBe(false);
    expect(isWorkersAiEnabled({ WORKERS_AI_ENABLED: 'false', AI: { run } })).toBe(false);
    expect(isWorkersAiEnabled({ WORKERS_AI_ENABLED: 'true', AI: { run } })).toBe(true);
    expect(isWorkersAiEnabled({ WORKERS_AI_ENABLED: 'TRUE', AI: { run } })).toBe(false);
    expect(isWorkersAiEnabled({ WORKERS_AI_ENABLED: ' true ', AI: { run } })).toBe(false);
    expect(isWorkersAiEnabled({ WORKERS_AI_ENABLED: true, AI: { run: 'invalid' } })).toBe(false);
  });

  it('uses stable model defaults for absent or blank variables', () => {
    expect(getWorkersAiModels({})).toEqual(DEFAULT_WORKERS_AI_MODELS);
    expect(getWorkersAiModels({
      WORKERS_AI_RECOMMENDATION_MODEL: ' ',
      WORKERS_AI_TRANSLATION_MODEL: '',
      WORKERS_AI_IMAGE_CAPTION_MODEL: null,
    })).toEqual(DEFAULT_WORKERS_AI_MODELS);
  });

  it('invokes a dynamic model through the narrow binding adapter', async () => {
    const run = vi.fn(async () => ({ response: [{ id: 1, score: 0.8 }] }));
    const input = { query: 'federated social web', contexts: [{ text: 'post' }] };

    await expect(runWorkersAiModel('@cf/test/ranker', input, bindings(run)))
      .resolves.toEqual({ response: [{ id: 1, score: 0.8 }] });
    expect(run).toHaveBeenCalledWith('@cf/test/ranker', input);
  });

  it('unwraps the REST-style result envelope returned by remote bindings', async () => {
    const run = vi.fn(async () => ({
      result: { caption: 'A small cat.' },
      usage: { total_tokens: 100 },
    }));

    await expect(runWorkersAiModel('@cf/test/captioner', {}, bindings(run)))
      .resolves.toEqual({ caption: 'A small cat.' });
  });

  it('fails predictably when disabled or when a model returns a non-object', async () => {
    await expectServiceError(
      runWorkersAiModel('@cf/test/model', {}, { WORKERS_AI_ENABLED: false }),
      'disabled',
    );
    await expectServiceError(
      runWorkersAiModel('@cf/test/model', {}, bindings(async () => ['invalid'])),
      'invalid_response',
    );
  });
});

describe('Workers AI translation adapters', () => {
  it('splits oversized input at the last paragraph before the character limit', () => {
    const first = 'a'.repeat(6_000);
    const second = 'b'.repeat(4_000);
    const third = 'c'.repeat(5_000);

    expect(splitWorkersAiTranslationText(`${first}\n\n${second}\n\n${third}`))
      .toEqual([first, `${second}\n\n${third}`]);
  });

  it('hard-splits a single oversized paragraph so no batch exceeds the limit', () => {
    const batches = splitWorkersAiTranslationText(
      '가'.repeat(MAX_WORKERS_AI_TRANSLATION_CHARACTERS * 2 + 1),
    );

    expect(batches.map((batch) => batch.length)).toEqual([
      MAX_WORKERS_AI_TRANSLATION_CHARACTERS,
      MAX_WORKERS_AI_TRANSLATION_CHARACTERS,
      1,
    ]);
  });

  it('uses the m2m100-compatible request and response shape', async () => {
    const run = vi.fn(async () => ({ translated_text: '  Hello world  ' }));
    const configuredModel = '@cf/test/future-m2m-compatible-model';

    await expect(translateWithWorkersAi(
      '  안녕하세요  ',
      'ko-KR',
      'en-US',
      bindings(run, { WORKERS_AI_TRANSLATION_MODEL: configuredModel }),
    )).resolves.toEqual({
      translatedText: 'Hello world',
      model: configuredModel,
    });
    expect(run).toHaveBeenCalledWith(configuredModel, {
      text: '안녕하세요',
      source_lang: 'ko',
      target_lang: 'en',
    });
  });

  it('translates paragraph batches in order and combines their results', async () => {
    const first = '가'.repeat(6_000);
    const second = '나'.repeat(4_001);
    const run = vi.fn(async (_model: string, input: Record<string, unknown>) => ({
      translated_text: input.text === first ? 'First batch' : 'Second batch',
    }));

    await expect(translateWithWorkersAi(
      `${first}\n\n${second}`,
      'ko',
      'en',
      bindings(run),
    )).resolves.toEqual({
      translatedText: 'First batch\n\nSecond batch',
      model: DEFAULT_WORKERS_AI_MODELS.translation,
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls.map(([, input]) => input.text)).toEqual([first, second]);
  });

  it('uses the distinct IndicTrans2 request and response shape', async () => {
    const run = vi.fn(async () => ({ translations: ['  नमस्ते  '] }));
    const model = '@cf/ai4bharat/indictrans2-en-indic-1B';

    await expect(translateWithWorkersAi(
      ' Hello ',
      'en-US',
      'hi-IN',
      bindings(run, { WORKERS_AI_TRANSLATION_MODEL: model }),
    )).resolves.toEqual({ translatedText: 'नमस्ते', model });
    expect(run).toHaveBeenCalledWith(model, {
      text: 'Hello',
      target_language: 'hin_Deva',
    });
  });

  it('rejects unsupported IndicTrans2 language directions before inference', async () => {
    const run = vi.fn(async () => ({ translations: ['unused'] }));
    const configured = bindings(run, {
      WORKERS_AI_TRANSLATION_MODEL: '@cf/ai4bharat/indictrans2-en-indic-1B',
    });

    await expectServiceError(
      translateWithWorkersAi('Bonjour', 'fr', 'hi', configured),
      'unsupported_language',
    );
    await expectServiceError(
      translateWithWorkersAi('Hello', 'en', 'ko', configured),
      'unsupported_language',
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects invalid input and malformed translation responses', async () => {
    const run = vi.fn(async () => ({ translated_text: ' ' }));
    const configured = bindings(run);

    await expectServiceError(
      translateWithWorkersAi('', 'ko', 'en', configured),
      'invalid_input',
    );
    await expectServiceError(
      translateWithWorkersAi('안녕하세요', 'ko', 'en', configured),
      'invalid_response',
    );
  });
});

describe('Workers AI image caption adapters', () => {
  it('returns silently before model resolution when optional AI is disabled', async () => {
    const run = vi.fn(async () => ({ caption: 'unused' }));
    const readModel = vi.fn(() => DEFAULT_WORKERS_AI_MODELS.imageCaption);
    const configured = {
      WORKERS_AI_ENABLED: false,
      AI: { run },
      get WORKERS_AI_IMAGE_CAPTION_MODEL() {
        return readModel();
      },
    };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(generateImageAltText(
      new ArrayBuffer(0),
      'image/png',
      configured,
    )).resolves.toBeNull();
    expect(readModel).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('uses Moondream caption input and normalizes its response', async () => {
    const run = vi.fn(async () => ({
      caption: '  A small cat\n sitting   on a windowsill.  ',
    }));
    const image = Uint8Array.from([1, 2, 3]).buffer;

    await expect(generateImageAltText(image, 'image/png', bindings(run)))
      .resolves.toBe('A small cat sitting on a windowsill.');
    expect(run).toHaveBeenCalledWith(DEFAULT_WORKERS_AI_MODELS.imageCaption, {
      image: 'data:image/png;base64,AQID',
      task: 'caption',
      caption_length: 'short',
      stream: false,
    });
  });

  it('reads a Moondream caption from the remote binding result envelope', async () => {
    const run = vi.fn(async () => ({
      result: { caption: '  A black square.  ' },
      usage: { total_tokens: 741 },
    }));

    await expect(generateImageAltText(
      Uint8Array.from([1, 2, 3]).buffer,
      'image/png',
      bindings(run),
    )).resolves.toBe('A black square.');
  });

  it('passes an HTTPS image URL to Moondream without embedding bytes', async () => {
    const run = vi.fn(async () => ({ caption: 'A landscape.' }));
    const imageUrl = 'https://social.example/media/image.png';

    await generateImageAltText(
      new ArrayBuffer(MAX_WORKERS_AI_LEGACY_IMAGE_BYTES + 1),
      'image/png',
      bindings(run),
      imageUrl,
    );

    expect(run).toHaveBeenCalledWith(
      DEFAULT_WORKERS_AI_MODELS.imageCaption,
      expect.objectContaining({ image: imageUrl }),
    );
  });

  it.each([
    '@cf/llava-hf/llava-1.5-7b-hf',
    '@cf/unum/uform-gen2-qwen-500m',
  ])('uses the byte-array request shape for %s', async (model) => {
    const run = vi.fn(async () => ({ description: 'An accessible caption.' }));
    const configured = bindings(run, { WORKERS_AI_IMAGE_CAPTION_MODEL: model });

    await expect(generateImageAltText(
      Uint8Array.from([4, 5, 6]).buffer,
      'image/jpeg',
      configured,
    )).resolves.toBe('An accessible caption.');
    expect(run).toHaveBeenCalledWith(model, {
      image: [4, 5, 6],
      prompt: 'Write one concise, objective sentence describing this image for accessible ALT text.',
      max_tokens: 128,
    });
  });

  it('enforces the legacy byte-array model limit at its exact boundary', async () => {
    const run = vi.fn(async () => ({ description: 'A bounded caption.' }));
    const configured = bindings(run, {
      WORKERS_AI_IMAGE_CAPTION_MODEL: '@cf/llava-hf/llava-1.5-7b-hf',
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(generateImageAltText(
      new ArrayBuffer(MAX_WORKERS_AI_LEGACY_IMAGE_BYTES),
      'image/png',
      configured,
    )).resolves.toBe('A bounded caption.');
    await expect(generateImageAltText(
      new ArrayBuffer(MAX_WORKERS_AI_LEGACY_IMAGE_BYTES + 1),
      'image/png',
      configured,
    )).resolves.toBeNull();
    expect(run).toHaveBeenCalledOnce();
  });

  it('caps generated ALT text to the API description limit', async () => {
    const run = vi.fn(async () => ({ caption: 'x'.repeat(2_000) }));

    const result = await generateImageAltText(
      new ArrayBuffer(0),
      'image/png',
      bindings(run),
    );

    expect(result).toHaveLength(MAX_WORKERS_AI_ALT_TEXT_CHARACTERS);
  });

  it.each([
    ['a rejected inference', async () => { throw new Error('inference failed'); }],
    ['a malformed response', async () => ({ caption: ' ' })],
  ] as const)('falls back to null after %s', async (_label, run) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(generateImageAltText(
      new ArrayBuffer(0),
      'image/png',
      bindings(run),
    )).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      '[workers-ai]',
      expect.stringContaining('image_alt_generation_failed'),
    );
  });

  it('falls back without invoking AI for an unsupported caption model', async () => {
    const run = vi.fn(async () => ({ description: 'unused' }));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(generateImageAltText(
      new ArrayBuffer(0),
      'image/png',
      bindings(run, { WORKERS_AI_IMAGE_CAPTION_MODEL: '@cf/test/unsupported' }),
    )).resolves.toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});
