import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { applyMigration, createTestUser, authHeaders } from './helpers';

const BASE = 'https://test.siliconbeest.local';

describe('GET /api/v1/timelines/social', () => {
  let viewer: { accountId: string; userId: string; token: string };
  let poster: { accountId: string; userId: string; token: string };

  async function post(token: string, status: string, visibility: string): Promise<{ id: string }> {
    const res = await SELF.fetch(`${BASE}/api/v1/statuses`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ status, visibility }),
    });
    expect(res.status).toBe(200);
    return res.json();
  }

  beforeAll(async () => {
    await applyMigration();
    viewer = await createTestUser('socialviewer');
    poster = await createTestUser('socialposter');
  });

  it('requires authentication', async () => {
    const res = await SELF.fetch(`${BASE}/api/v1/timelines/social`);
    expect(res.status).toBe(401);
  });

  it('merges local public posts with home timeline entries', async () => {
    // Local public post by someone the viewer does NOT follow → local branch
    const localPublic = await post(poster.token, 'hello social timeline', 'public');

    // Private post: only visible via a home timeline entry (fanout).
    // The queue consumer does the fanout in prod — simulate its insert here.
    const homePrivate = await post(poster.token, 'private but in home', 'private');
    await env.DB.prepare(
      `INSERT INTO home_timeline_entries (id, account_id, status_id, created_at)
       VALUES (?1, ?2, ?3, ?4)`,
    ).bind('hte-social-1', viewer.accountId, homePrivate.id, new Date().toISOString()).run();

    // Private post with no home entry → must NOT appear
    const hiddenPrivate = await post(poster.token, 'private and hidden', 'private');

    const res = await SELF.fetch(`${BASE}/api/v1/timelines/social`, {
      headers: authHeaders(viewer.token),
    });
    expect(res.status).toBe(200);
    const ids = ((await res.json()) as { id: string }[]).map((s) => s.id);

    expect(ids).toContain(localPublic.id);
    expect(ids).toContain(homePrivate.id);
    expect(ids).not.toContain(hiddenPrivate.id);
  });

  it('paginates with max_id', async () => {
    const a = await post(poster.token, 'social page one', 'public');
    const res = await SELF.fetch(`${BASE}/api/v1/timelines/social?max_id=${a.id}`, {
      headers: authHeaders(viewer.token),
    });
    expect(res.status).toBe(200);
    const ids = ((await res.json()) as { id: string }[]).map((s) => s.id);
    expect(ids).not.toContain(a.id);
    for (const id of ids) {
      expect(id < a.id).toBe(true);
    }
  });
});
