/* oxlint-disable fp/no-classes, fp/no-class-inheritance, fp/no-this-expressions, fp/no-throw-statements, fp/no-promise-reject, fp/no-let, fp/no-loop-statements, fp/no-try-statements */
import { env } from 'cloudflare:workers';

export const DEFAULT_WORKERS_AI_MODELS = {
  recommendation: '@cf/baai/bge-m3',
  translation: '@cf/meta/m2m100-1.2b',
  imageCaption: '@cf/moondream/moondream3.1-9B-A2B',
} as const;

export const MAX_WORKERS_AI_TRANSLATION_CHARACTERS = 10_000;
export const MAX_WORKERS_AI_ALT_TEXT_CHARACTERS = 1_500;
export const MAX_WORKERS_AI_LEGACY_IMAGE_BYTES = 4 * 1024 * 1024;

const INDIC_TRANSLATION_MODEL = '@cf/ai4bharat/indictrans2-en-indic-1B';
const LLAVA_IMAGE_CAPTION_MODEL = '@cf/llava-hf/llava-1.5-7b-hf';
const UFORM_IMAGE_CAPTION_MODEL = '@cf/unum/uform-gen2-qwen-500m';

export type WorkersAiModels = {
  readonly recommendation: string;
  readonly translation: string;
  readonly imageCaption: string;
};

export type WorkersAiServiceErrorCode =
  | 'disabled'
  | 'invalid_input'
  | 'invalid_response'
  | 'unsupported_language'
  | 'unsupported_model';

export class WorkersAiServiceError extends Error {
  readonly code: WorkersAiServiceErrorCode;

  constructor(code: WorkersAiServiceErrorCode, message: string) {
    super(message);
    this.name = 'WorkersAiServiceError';
    this.code = code;
  }
}

export type WorkersAiTranslation = {
  readonly translatedText: string;
  readonly model: string;
};

type AiRunner = (
  model: string,
  input: Record<string, unknown>,
) => Promise<unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBinding(bindings: object, name: string): unknown {
  return Reflect.get(bindings, name);
}

function readStringBinding(bindings: object, name: string, fallback: string): string {
  const value = readBinding(bindings, name);
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function isEnabledValue(value: unknown): boolean {
  return value === true || value === 'true';
}

function getAiRunner(bindings: object): AiRunner | null {
  const binding = readBinding(bindings, 'AI');
  if (!isRecord(binding)) return null;

  const run = Reflect.get(binding, 'run');
  if (typeof run !== 'function') return null;

  return async (model, input) => Promise.resolve(
    Reflect.apply(run, binding, [model, input]),
  );
}

/** True only when the feature flag and a callable Workers AI binding are present. */
export function isWorkersAiEnabled(bindings: object = env): boolean {
  return isEnabledValue(readBinding(bindings, 'WORKERS_AI_ENABLED'))
    && getAiRunner(bindings) !== null;
}

/** Resolve configured model IDs without exposing them through instance metadata. */
export function getWorkersAiModels(bindings: object = env): WorkersAiModels {
  return {
    recommendation: readStringBinding(
      bindings,
      'WORKERS_AI_RECOMMENDATION_MODEL',
      DEFAULT_WORKERS_AI_MODELS.recommendation,
    ),
    translation: readStringBinding(
      bindings,
      'WORKERS_AI_TRANSLATION_MODEL',
      DEFAULT_WORKERS_AI_MODELS.translation,
    ),
    imageCaption: readStringBinding(
      bindings,
      'WORKERS_AI_IMAGE_CAPTION_MODEL',
      DEFAULT_WORKERS_AI_MODELS.imageCaption,
    ),
  };
}

/**
 * Run a dynamically configured model and validate the shared object response
 * boundary. This avoids coupling optional AI support to generated Env types.
 */
export async function runWorkersAiModel(
  model: string,
  input: Record<string, unknown>,
  bindings: object = env,
): Promise<Record<string, unknown>> {
  if (!isWorkersAiEnabled(bindings)) {
    throw new WorkersAiServiceError('disabled', 'Workers AI is not enabled');
  }
  if (model.trim().length === 0) {
    throw new WorkersAiServiceError('invalid_input', 'A Workers AI model is required');
  }

  const runner = getAiRunner(bindings);
  if (!runner) {
    throw new WorkersAiServiceError('disabled', 'Workers AI binding is unavailable');
  }

  const response = await runner(model, input);
  if (!isRecord(response)) {
    throw new WorkersAiServiceError('invalid_response', 'Workers AI returned an invalid response');
  }
  return response;
}

export function isWorkersAiTranslationEnabled(bindings: object = env): boolean {
  return isWorkersAiEnabled(bindings)
    && getWorkersAiModels(bindings).translation.length > 0;
}

function normalizeM2mLanguage(language: string): string {
  return language.trim().toLowerCase().split(/[-_]/, 1)[0] || 'en';
}

const INDIC_TARGET_LANGUAGES: Readonly<Record<string, string>> = {
  as: 'asm_Beng',
  awa: 'awa_Deva',
  bn: 'ben_Beng',
  bho: 'bho_Deva',
  brx: 'brx_Deva',
  doi: 'doi_Deva',
  en: 'eng_Latn',
  kok: 'gom_Deva',
  gon: 'gon_Deva',
  gu: 'guj_Gujr',
  hi: 'hin_Deva',
  hne: 'hne_Deva',
  kn: 'kan_Knda',
  ks: 'kas_Arab',
  kha: 'kha_Latn',
  lus: 'lus_Latn',
  mag: 'mag_Deva',
  mai: 'mai_Deva',
  ml: 'mal_Mlym',
  mr: 'mar_Deva',
  mni: 'mni_Beng',
  ne: 'npi_Deva',
  or: 'ory_Orya',
  pa: 'pan_Guru',
  sa: 'san_Deva',
  sat: 'sat_Olck',
  sd: 'snd_Arab',
  ta: 'tam_Taml',
  te: 'tel_Telu',
  ur: 'urd_Arab',
  unr: 'unr_Deva',
};

function resolveIndicTargetLanguage(language: string): string | null {
  const normalized = language.trim().replace(/_/g, '-').toLowerCase();
  if (normalized === 'ks-deva') return 'kas_Deva';
  if (normalized === 'mni-mtei') return 'mni_Mtei';
  if (normalized === 'sd-deva') return 'snd_Deva';
  return INDIC_TARGET_LANGUAGES[normalized.split('-', 1)[0]] ?? null;
}

function requireTranslationInput(text: string): string {
  const normalized = text.trim();
  if (normalized.length === 0) {
    throw new WorkersAiServiceError('invalid_input', 'Translation text is required');
  }
  if (normalized.length > MAX_WORKERS_AI_TRANSLATION_CHARACTERS) {
    throw new WorkersAiServiceError(
      'invalid_input',
      `Translation text exceeds ${MAX_WORKERS_AI_TRANSLATION_CHARACTERS} characters`,
    );
  }
  return normalized;
}

/** Translate text with the configured m2m100-compatible or IndicTrans2 adapter. */
export async function translateWithWorkersAi(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  bindings: object = env,
): Promise<WorkersAiTranslation> {
  const normalizedText = requireTranslationInput(text);
  if (targetLanguage.trim().length === 0) {
    throw new WorkersAiServiceError('invalid_input', 'A target language is required');
  }
  const model = getWorkersAiModels(bindings).translation;

  if (model === INDIC_TRANSLATION_MODEL) {
    if (normalizeM2mLanguage(sourceLanguage) !== 'en') {
      throw new WorkersAiServiceError(
        'unsupported_language',
        'IndicTrans2 supports English source text only',
      );
    }
    const target = resolveIndicTargetLanguage(targetLanguage);
    if (!target) {
      throw new WorkersAiServiceError(
        'unsupported_language',
        `IndicTrans2 does not support target language ${targetLanguage}`,
      );
    }
    const response = await runWorkersAiModel(model, {
      text: normalizedText,
      target_language: target,
    }, bindings);
    const translations = response.translations;
    const translatedText = Array.isArray(translations) && typeof translations[0] === 'string'
      ? translations[0].trim()
      : '';
    if (!translatedText) {
      throw new WorkersAiServiceError('invalid_response', 'IndicTrans2 returned no translation');
    }
    return { translatedText, model };
  }

  const response = await runWorkersAiModel(model, {
    text: normalizedText,
    source_lang: normalizeM2mLanguage(sourceLanguage),
    target_lang: normalizeM2mLanguage(targetLanguage),
  }, bindings);
  const translatedText = typeof response.translated_text === 'string'
    ? response.translated_text.trim()
    : '';
  if (!translatedText) {
    throw new WorkersAiServiceError('invalid_response', 'Translation model returned no translation');
  }
  return { translatedText, model };
}

function arrayBufferToDataUri(bytes: ArrayBuffer, mime: string): string {
  const data = new Uint8Array(bytes);
  let binary = '';
  const chunkSize = 32_768;
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    binary += String.fromCharCode(...data.subarray(offset, offset + chunkSize));
  }
  const safeMime = /^image\/[a-z0-9.+-]+$/i.test(mime) ? mime.toLowerCase() : 'application/octet-stream';
  return `data:${safeMime};base64,${btoa(binary)}`;
}

function imageDescriptionFromResponse(response: Record<string, unknown>): string | null {
  for (const key of ['description', 'caption', 'response', 'text'] as const) {
    const value = response[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return null;
}

function normalizeAltText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_WORKERS_AI_ALT_TEXT_CHARACTERS).trim();
}

function logImageCaptionFailure(model: string, error: unknown): void {
  const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error';
  console.warn('[workers-ai]', JSON.stringify({
    event: 'image_alt_generation_failed',
    model,
    reason,
  }));
}

/**
 * Generate optional accessible image ALT text. Failures are deliberately
 * isolated so an upload can still succeed without an AI-generated caption.
 */
export async function generateImageAltText(
  bytes: ArrayBuffer,
  mime: string,
  bindings: object = env,
  imageUrl?: string,
): Promise<string | null> {
  if (!isWorkersAiEnabled(bindings)) return null;

  const model = getWorkersAiModels(bindings).imageCaption;
  try {
    let response: Record<string, unknown>;
    if (model.toLowerCase().includes('/moondream/')) {
      response = await runWorkersAiModel(model, {
        image: imageUrl && /^https:\/\//i.test(imageUrl)
          ? imageUrl
          : arrayBufferToDataUri(bytes, mime),
        task: 'caption',
        caption_length: 'short',
        stream: false,
      }, bindings);
    } else if (model === LLAVA_IMAGE_CAPTION_MODEL || model === UFORM_IMAGE_CAPTION_MODEL) {
      if (bytes.byteLength > MAX_WORKERS_AI_LEGACY_IMAGE_BYTES) {
        throw new WorkersAiServiceError(
          'invalid_input',
          `Legacy image caption input exceeds ${MAX_WORKERS_AI_LEGACY_IMAGE_BYTES} bytes`,
        );
      }
      response = await runWorkersAiModel(model, {
        image: Array.from(new Uint8Array(bytes)),
        prompt: 'Write one concise, objective sentence describing this image for accessible ALT text.',
        max_tokens: 128,
      }, bindings);
    } else {
      throw new WorkersAiServiceError(
        'unsupported_model',
        `Unsupported image caption model: ${model}`,
      );
    }

    const description = imageDescriptionFromResponse(response);
    if (!description) {
      throw new WorkersAiServiceError('invalid_response', 'Image caption model returned no description');
    }
    const normalized = normalizeAltText(description);
    return normalized.length > 0 ? normalized : null;
  } catch (error) {
    logImageCaptionFailure(model, error);
    return null;
  }
}
