import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { processCreate } from '../../server/worker/federation/inboxProcessors/create';
import { applyMigration, authHeaders, createTestUser } from './helpers';

const BASE = 'https://test.siliconbeest.local';

type TestUser = Awaited<ReturnType<typeof createTestUser>>;
type StatusPayload = { id: string };

async function hasHomeEntry(accountId: string, statusId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT 1 FROM home_timeline_entries WHERE account_id = ?1 AND status_id = ?2 LIMIT 1',
  ).bind(accountId, statusId).first();
  return row !== null;
}

describe('direct-message surface permissions', () => {
  let sender: TestUser;
  let mutedRecipient: TestUser;
  let blockedRecipient: TestUser;
  let allowedRecipient: TestUser;

  beforeAll(async () => {
    await applyMigration();
    sender = await createTestUser('dmsurfacesender');
    mutedRecipient = await createTestUser('dmsurfacemuted');
    blockedRecipient = await createTestUser('dmsurfaceblocked');
    allowedRecipient = await createTestUser('dmsurfaceallowed');
  });

  it('does not fan out a local DM to muted or blocked mentioned accounts', async () => {
    const muteResponse = await SELF.fetch(`${BASE}/api/v1/accounts/${sender.accountId}/mute`, {
      method: 'POST',
      headers: authHeaders(mutedRecipient.token),
    });
    expect(muteResponse.status).toBe(200);

    const blockResponse = await SELF.fetch(`${BASE}/api/v1/accounts/${blockedRecipient.accountId}/block`, {
      method: 'POST',
      headers: authHeaders(sender.token),
    });
    expect(blockResponse.status).toBe(200);

    const createResponse = await SELF.fetch(`${BASE}/api/v1/statuses`, {
      method: 'POST',
      headers: authHeaders(sender.token),
      body: JSON.stringify({
        status: '@dmsurfacemuted @dmsurfaceblocked @dmsurfaceallowed secret',
        visibility: 'direct',
      }),
    });
    expect(createResponse.status).toBe(200);
    const status = await createResponse.json<StatusPayload>();

    expect(await hasHomeEntry(sender.accountId, status.id)).toBe(true);
    expect(await hasHomeEntry(allowedRecipient.accountId, status.id)).toBe(true);
    expect(await hasHomeEntry(mutedRecipient.accountId, status.id)).toBe(false);
    expect(await hasHomeEntry(blockedRecipient.accountId, status.id)).toBe(false);

    for (const recipient of [mutedRecipient, blockedRecipient]) {
      const directFetch = await SELF.fetch(`${BASE}/api/v1/statuses/${status.id}`, {
        headers: authHeaders(recipient.token),
      });
      expect(directFetch.status).toBe(200);
    }
  });

  it('filters remote DM fanout per local recipient relationship', async () => {
    const remoteAccountId = crypto.randomUUID();
    const remoteActorUri = 'https://remote-dm.example/users/sender';
    const remoteStatusUri = 'https://remote-dm.example/objects/permission-dm';
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO accounts
         (id, username, domain, display_name, note, uri, url, created_at, updated_at)
       VALUES (?1, 'sender', 'remote-dm.example', 'Remote DM Sender', '', ?2, ?2, ?3, ?3)`,
    ).bind(remoteAccountId, remoteActorUri, now).run();

    const muteResponse = await SELF.fetch(`${BASE}/api/v1/accounts/${remoteAccountId}/mute`, {
      method: 'POST',
      headers: authHeaders(mutedRecipient.token),
    });
    expect(muteResponse.status).toBe(200);

    await processCreate({
      type: 'Create',
      actor: remoteActorUri,
      object: {
        type: 'Note',
        id: remoteStatusUri,
        attributedTo: remoteActorUri,
        to: [
          `${BASE}/users/dmsurfacemuted`,
          `${BASE}/users/dmsurfaceallowed`,
        ],
        content: '<p>remote permission DM</p>',
        tag: [
          { type: 'Mention', href: `${BASE}/users/dmsurfacemuted` },
          { type: 'Mention', href: `${BASE}/users/dmsurfaceallowed` },
        ],
      },
    }, mutedRecipient.accountId, { notify: false });

    const stored = await env.DB.prepare(
      'SELECT id FROM statuses WHERE uri = ?1 LIMIT 1',
    ).bind(remoteStatusUri).first<{ id: string }>();
    expect(stored).not.toBeNull();
    expect(await hasHomeEntry(mutedRecipient.accountId, stored!.id)).toBe(false);
    expect(await hasHomeEntry(allowedRecipient.accountId, stored!.id)).toBe(true);
  });
});
