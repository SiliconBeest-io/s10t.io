import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigration, authHeaders, createTestUser } from './helpers';

const BASE = 'https://test.siliconbeest.local';

type AccountEntity = {
  id: string;
};

describe('status interaction participant surfaces', () => {
  let viewer: Awaited<ReturnType<typeof createTestUser>>;
  let author: Awaited<ReturnType<typeof createTestUser>>;
  let visibleActor: Awaited<ReturnType<typeof createTestUser>>;
  let mutedActor: Awaited<ReturnType<typeof createTestUser>>;
  let viewerBlockedActor: Awaited<ReturnType<typeof createTestUser>>;
  let actorBlockedViewer: Awaited<ReturnType<typeof createTestUser>>;
  let suspendedActor: Awaited<ReturnType<typeof createTestUser>>;
  const remoteActorId = 'interaction-list-remote-actor';
  const statusId = 'interaction-list-target-status';

  beforeAll(async () => {
    await applyMigration();
    viewer = await createTestUser('interaction_list_viewer');
    author = await createTestUser('interaction_list_author');
    visibleActor = await createTestUser('interaction_list_visible');
    mutedActor = await createTestUser('interaction_list_muted');
    viewerBlockedActor = await createTestUser('interaction_list_viewer_blocked');
    actorBlockedViewer = await createTestUser('interaction_list_reverse_blocked');
    suspendedActor = await createTestUser('interaction_list_suspended');

    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO accounts
        (id, username, domain, display_name, note, uri, url, created_at, updated_at)
       VALUES (?1, 'remote_actor', 'blocked.example', 'Remote actor', '', ?2, ?2, ?3, ?3)`,
    ).bind(
      remoteActorId,
      'https://blocked.example/users/remote_actor',
      now,
    ).run();

    await env.DB.prepare(
      `INSERT INTO statuses
        (id, uri, account_id, content, visibility, local, created_at, updated_at)
       VALUES (?1, ?2, ?3, '<p>target</p>', 'public', 1, ?4, ?4)`,
    ).bind(statusId, `${BASE}/statuses/${statusId}`, author.accountId, now).run();

    const participantIds = [
      visibleActor.accountId,
      mutedActor.accountId,
      viewerBlockedActor.accountId,
      actorBlockedViewer.accountId,
      suspendedActor.accountId,
      remoteActorId,
    ];
    const participantStatements: D1PreparedStatement[] = [];
    for (const [index, accountId] of participantIds.entries()) {
      participantStatements.push(
        env.DB.prepare(
          `INSERT INTO favourites (id, account_id, status_id, created_at)
           VALUES (?1, ?2, ?3, ?4)`,
        ).bind(`interaction-list-favourite-${index}`, accountId, statusId, now),
        env.DB.prepare(
          `INSERT INTO statuses
            (id, uri, account_id, reblog_of_id, visibility, local, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, 'public', 1, ?5, ?5)`,
        ).bind(
          `interaction-list-reblog-${index}`,
          `${BASE}/statuses/interaction-list-reblog-${index}`,
          accountId,
          statusId,
          now,
        ),
      );
    }
    participantStatements.push(
      env.DB.prepare(
        `INSERT INTO statuses
          (id, uri, account_id, reblog_of_id, visibility, local, created_at, updated_at)
         VALUES ('interaction-list-invalid-direct', ?1, ?2, ?3, 'direct', 1, ?4, ?4)`,
      ).bind(
        `${BASE}/statuses/interaction-list-invalid-direct`,
        visibleActor.accountId,
        statusId,
        now,
      ),
    );
    await env.DB.batch(participantStatements);

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mutes
          (id, account_id, target_account_id, hide_notifications, created_at, updated_at)
         VALUES ('interaction-list-mute', ?1, ?2, 1, ?3, ?3)`,
      ).bind(viewer.accountId, mutedActor.accountId, now),
      env.DB.prepare(
        `INSERT INTO blocks (id, account_id, target_account_id, created_at)
         VALUES ('interaction-list-viewer-block', ?1, ?2, ?3)`,
      ).bind(viewer.accountId, viewerBlockedActor.accountId, now),
      env.DB.prepare(
        `INSERT INTO blocks (id, account_id, target_account_id, created_at)
         VALUES ('interaction-list-reverse-block', ?1, ?2, ?3)`,
      ).bind(actorBlockedViewer.accountId, viewer.accountId, now),
      env.DB.prepare(
        `INSERT INTO user_domain_blocks (id, account_id, domain, created_at)
         VALUES ('interaction-list-domain-block', ?1, 'BLOCKED.EXAMPLE', ?2)`,
      ).bind(viewer.accountId, now),
      env.DB.prepare(
        'UPDATE accounts SET suspended_at = ?1 WHERE id = ?2',
      ).bind(now, suspendedActor.accountId),
    ]);
  });

  it('filters suspended and viewer-excluded actors from favourited_by and reblogged_by', async () => {
    for (const collection of ['favourited_by', 'reblogged_by']) {
      const response = await SELF.fetch(
        `${BASE}/api/v1/statuses/${statusId}/${collection}`,
        { headers: authHeaders(viewer.token) },
      );
      expect(response.status).toBe(200);
      const accounts = await response.json<AccountEntity[]>();
      expect(accounts.map((account) => account.id)).toEqual([visibleActor.accountId]);
    }
  });

  it('applies only global availability and distributable reblog visibility anonymously', async () => {
    const expectedIds = [
      actorBlockedViewer.accountId,
      mutedActor.accountId,
      remoteActorId,
      viewerBlockedActor.accountId,
      visibleActor.accountId,
    ].sort();

    for (const collection of ['favourited_by', 'reblogged_by']) {
      const response = await SELF.fetch(
        `${BASE}/api/v1/statuses/${statusId}/${collection}`,
      );
      expect(response.status).toBe(200);
      const accounts = await response.json<AccountEntity[]>();
      expect(accounts.map((account) => account.id).sort()).toEqual(expectedIds);
    }
  });
});
