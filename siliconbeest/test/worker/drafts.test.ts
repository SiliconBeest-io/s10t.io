import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigration, authHeaders, createTestUser } from './helpers';

const BASE = 'https://test.siliconbeest.local/api/v1/drafts';

function draft(content: string) {
  return {
    content,
    objectType: 'Note',
    articleTitle: '',
    articleSummary: '',
    spoilerText: '',
    showContentWarning: false,
    visibility: 'public',
    language: 'en',
    sensitive: false,
    quotePolicy: 'public',
    mediaAttachments: [],
    showPoll: false,
    pollOptions: [],
    pollExpiresIn: 86_400,
    pollMultiple: false,
    inReplyToId: null,
    inReplyToStatus: null,
    quoteId: null,
    quoteStatus: null,
  };
}

describe('Drafts API', () => {
  let alice: Awaited<ReturnType<typeof createTestUser>>;
  let bob: Awaited<ReturnType<typeof createTestUser>>;
  let readOnly: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    await applyMigration();
    alice = await createTestUser('draftAlice');
    bob = await createTestUser('draftBob');
    readOnly = await createTestUser('draftReader', { scopes: 'read:statuses' });
  });

  it('persists and lists a complete account-scoped draft', async () => {
    const save = await SELF.fetch(`${BASE}/draft-one`, {
      method: 'PUT',
      headers: authHeaders(alice.token),
      body: JSON.stringify({ revision: 1, draft: draft('First version') }),
    });

    expect(save.status).toBe(200);
    expect(await save.json()).toMatchObject({
      id: 'draft-one',
      revision: 1,
      content: 'First version',
    });

    const list = await SELF.fetch(BASE, { headers: authHeaders(alice.token) });
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([
      expect.objectContaining({ id: 'draft-one', content: 'First version' }),
    ]);
  });

  it('does not let a delayed older autosave overwrite a newer revision', async () => {
    const newer = await SELF.fetch(`${BASE}/draft-one`, {
      method: 'PUT',
      headers: authHeaders(alice.token),
      body: JSON.stringify({ revision: 3, draft: draft('Newest text') }),
    });
    expect(newer.status).toBe(200);

    const delayed = await SELF.fetch(`${BASE}/draft-one`, {
      method: 'PUT',
      headers: authHeaders(alice.token),
      body: JSON.stringify({ revision: 2, draft: draft('Stale text') }),
    });
    expect(delayed.status).toBe(200);
    expect(await delayed.json()).toMatchObject({ revision: 3, content: 'Newest text' });
  });

  it('reports a conflict when equal revisions contain different edits', async () => {
    const first = await SELF.fetch(`${BASE}/draft-conflict`, {
      method: 'PUT',
      headers: authHeaders(alice.token),
      body: JSON.stringify({ revision: 1, draft: draft('First tab') }),
    });
    expect(first.status).toBe(200);

    const conflicting = await SELF.fetch(`${BASE}/draft-conflict`, {
      method: 'PUT',
      headers: authHeaders(alice.token),
      body: JSON.stringify({ revision: 1, draft: draft('Second tab') }),
    });
    expect(conflicting.status).toBe(409);
    expect(await conflicting.json()).toMatchObject({ error: 'Draft revision conflict' });
  });

  it('accepts omitted nullable context, rejects empty ids, and drops status snapshots', async () => {
    const {
      inReplyToId: _inReplyToId,
      inReplyToStatus: _inReplyToStatus,
      quoteId: _quoteId,
      quoteStatus: _quoteStatus,
      ...sparseDraft
    } = draft('Sparse context');
    const sparse = await SELF.fetch(`${BASE}/draft-sparse`, {
      method: 'PUT',
      headers: authHeaders(alice.token),
      body: JSON.stringify({ revision: 1, draft: sparseDraft }),
    });
    expect(sparse.status).toBe(200);
    expect(await sparse.json()).toMatchObject({
      inReplyToId: null,
      inReplyToStatus: null,
      quoteId: null,
      quoteStatus: null,
    });

    const emptyId = await SELF.fetch(`${BASE}/draft-empty-id`, {
      method: 'PUT',
      headers: authHeaders(alice.token),
      body: JSON.stringify({
        revision: 1,
        draft: { ...draft('Invalid context'), inReplyToId: '' },
      }),
    });
    expect(emptyId.status).toBe(422);

    const untrustedPreview = await SELF.fetch(`${BASE}/draft-preview`, {
      method: 'PUT',
      headers: authHeaders(alice.token),
      body: JSON.stringify({
        revision: 1,
        draft: {
          ...draft('Quote safely'),
          quoteId: 'quoted-status',
          quoteStatus: { content: '<img src=x onerror=alert(1)>' },
        },
      }),
    });
    expect(untrustedPreview.status).toBe(200);
    expect(await untrustedPreview.json()).toMatchObject({
      quoteId: 'quoted-status',
      quoteStatus: null,
    });
  });

  it('requires write scope to read unpublished draft contents', async () => {
    const response = await SELF.fetch(BASE, { headers: authHeaders(readOnly.token) });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ required_scope: 'write:statuses' });
  });

  it('isolates reads and deletes by authenticated user', async () => {
    const bobList = await SELF.fetch(BASE, { headers: authHeaders(bob.token) });
    expect(await bobList.json()).toEqual([]);

    const bobDelete = await SELF.fetch(`${BASE}/draft-one`, {
      method: 'DELETE',
      headers: authHeaders(bob.token),
    });
    expect(bobDelete.status).toBe(200);

    const aliceList = await SELF.fetch(BASE, { headers: authHeaders(alice.token) });
    expect(await aliceList.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'draft-one', content: 'Newest text' }),
    ]));
  });

  it('rejects unauthenticated and malformed writes', async () => {
    expect((await SELF.fetch(BASE)).status).toBe(401);

    const malformed = await SELF.fetch(`${BASE}/invalid`, {
      method: 'PUT',
      headers: authHeaders(alice.token),
      body: JSON.stringify({ revision: 1, draft: { content: 'missing fields' } }),
    });
    expect(malformed.status).toBe(422);
  });

  it('deletes an owned draft', async () => {
    const removed = await SELF.fetch(`${BASE}/draft-one`, {
      method: 'DELETE',
      headers: authHeaders(alice.token),
    });
    expect(removed.status).toBe(200);

    const list = await SELF.fetch(BASE, { headers: authHeaders(alice.token) });
    const remaining = await list.json<Array<{ id: string }>>();
    expect(remaining.some((draft) => draft.id === 'draft-one')).toBe(false);
  });
});
