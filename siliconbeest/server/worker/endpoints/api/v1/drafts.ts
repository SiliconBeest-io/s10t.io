import { Hono } from 'hono';
import type { AppVariables } from '../../../types';
import { authRequired } from '../../../middleware/auth';
import { requireScope } from '../../../middleware/scopeCheck';
import { listDrafts, removeDraft, upsertDraft } from '../../../services/draft';

const MAX_REQUEST_BYTES = 300_000;
const MAX_PAYLOAD_CHARACTERS = 262_144;
const MAX_DRAFT_ID_CHARACTERS = 128;

type DraftInput = {
  content: string;
  objectType: 'Note' | 'Article';
  articleTitle: string;
  articleSummary: string;
  spoilerText: string;
  showContentWarning: boolean;
  visibility: 'public' | 'unlisted' | 'private' | 'direct';
  language: string;
  sensitive: boolean;
  quotePolicy: 'public' | 'followers' | 'nobody';
  mediaAttachments: Record<string, unknown>[];
  showPoll: boolean;
  pollOptions: string[];
  pollExpiresIn: number;
  pollMultiple: boolean;
  inReplyToId: string | null;
  inReplyToStatus: Record<string, unknown> | null;
  quoteId: string | null;
  quoteStatus: Record<string, unknown> | null;
};

type DraftRequest = {
  revision: number;
  draft: DraftInput;
};

type BoundedBody =
  | { ok: true; text: string }
  | { ok: false };

type ParsedJson =
  | { ok: true; value: unknown }
  | { ok: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNullableId(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length <= MAX_DRAFT_ID_CHARACTERS);
}

function isDraftInput(value: unknown): value is DraftInput {
  if (!isRecord(value)) return false;
  return (
    typeof value.content === 'string' && value.content.length <= 100_000 &&
    (value.objectType === 'Note' || value.objectType === 'Article') &&
    typeof value.articleTitle === 'string' && value.articleTitle.length <= 200 &&
    typeof value.articleSummary === 'string' && value.articleSummary.length <= 500 &&
    typeof value.spoilerText === 'string' && value.spoilerText.length <= 500 &&
    typeof value.showContentWarning === 'boolean' &&
    ['public', 'unlisted', 'private', 'direct'].includes(String(value.visibility)) &&
    typeof value.language === 'string' && value.language.length > 0 && value.language.length <= 16 &&
    typeof value.sensitive === 'boolean' &&
    ['public', 'followers', 'nobody'].includes(String(value.quotePolicy)) &&
    Array.isArray(value.mediaAttachments) && value.mediaAttachments.length <= 4 && value.mediaAttachments.every(isRecord) &&
    typeof value.showPoll === 'boolean' &&
    Array.isArray(value.pollOptions) && value.pollOptions.length <= 4 && value.pollOptions.every((option) => typeof option === 'string' && option.length <= 50) &&
    Number.isInteger(value.pollExpiresIn) && Number(value.pollExpiresIn) >= 300 && Number(value.pollExpiresIn) <= 604_800 &&
    typeof value.pollMultiple === 'boolean' &&
    isNullableId(value.inReplyToId) &&
    (value.inReplyToStatus === null || isRecord(value.inReplyToStatus)) &&
    isNullableId(value.quoteId) &&
    (value.quoteStatus === null || isRecord(value.quoteStatus))
  );
}

function isDraftRequest(value: unknown): value is DraftRequest {
  return isRecord(value)
    && Number.isSafeInteger(value.revision)
    && Number(value.revision) > 0
    && isDraftInput(value.draft);
}

async function readBoundedBody(request: Request): Promise<BoundedBody> {
  const contentLength = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) return { ok: false };
  if (!request.body) return { ok: true, text: '' };

  const reader = request.body.getReader();
  const decoder = new TextDecoder();

  async function readNext(size: number, text: string): Promise<BoundedBody> {
    const result = await reader.read();
    if (result.done) return { ok: true, text: text + decoder.decode() };

    const nextSize = size + result.value.byteLength;
    if (nextSize > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return { ok: false };
    }
    return readNext(nextSize, text + decoder.decode(result.value, { stream: true }));
  }

  return readNext(0, '');
}

function parseJson(text: string): ParsedJson {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

const app = new Hono<{ Variables: AppVariables }>();

app.get('/', authRequired, requireScope('read:statuses'), async (c) => {
  const user = c.get('currentUser');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  return c.json(await listDrafts(user.id));
});

app.put('/:id', authRequired, requireScope('write:statuses'), async (c) => {
  const id = c.req.param('id');
  if (!id || id.length > MAX_DRAFT_ID_CHARACTERS) {
    return c.json({ error: 'Invalid draft id' }, 422);
  }

  const bodyResult = await readBoundedBody(c.req.raw);
  if (!bodyResult.ok) return c.json({ error: 'Draft is too large' }, 413);

  const parsed = parseJson(bodyResult.text);
  if (!parsed.ok) return c.json({ error: 'Invalid JSON body' }, 422);
  if (!isDraftRequest(parsed.value)) return c.json({ error: 'Invalid draft data' }, 422);

  const payload = JSON.stringify(parsed.value.draft);
  if (payload.length > MAX_PAYLOAD_CHARACTERS) {
    return c.json({ error: 'Draft is too large' }, 413);
  }

  const user = c.get('currentUser');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const saved = await upsertDraft(user.id, id, parsed.value.revision, payload);
  return saved ? c.json(saved) : c.json({ error: 'Draft was not persisted' }, 500);
});

app.delete('/:id', authRequired, requireScope('write:statuses'), async (c) => {
  const id = c.req.param('id');
  if (!id || id.length > MAX_DRAFT_ID_CHARACTERS) {
    return c.json({ error: 'Invalid draft id' }, 422);
  }
  const user = c.get('currentUser');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  await removeDraft(user.id, id);
  return c.json({});
});

export default app;
