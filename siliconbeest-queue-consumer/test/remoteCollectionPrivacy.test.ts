import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    DB: { prepare: vi.fn<(sql: string) => object>() },
    CACHE: {
      get: vi.fn<(key: string) => Promise<string | null>>(),
      put: vi.fn<(
        key: string,
        value: string,
        options?: { expirationTtl?: number },
      ) => Promise<void>>(),
    },
    INSTANCE_DOMAIN: 'local.example',
  },
  createFed: vi.fn<() => object>(),
  ensureInstanceRecord: vi.fn<() => Promise<void>>(),
  getSuspendedDomains: vi.fn<() => Promise<Set<string>>>(),
  isActor: vi.fn<(value: object) => boolean>(),
  pickSignerUsername: vi.fn<() => Promise<string | null>>(),
}));

vi.mock('cloudflare:workers', () => ({ env: mocks.env }));
vi.mock('@fedify/vocab', () => ({ isActor: mocks.isActor }));
vi.mock('../src/fedify', () => ({ createFed: mocks.createFed }));
vi.mock('../../packages/shared/services/instance', () => ({
  ensureInstanceRecord: mocks.ensureInstanceRecord,
}));
vi.mock('../../packages/shared/domain-blocks', () => ({
  getSuspendedDomains: mocks.getSuspendedDomains,
}));
vi.mock('../../packages/shared/services/signer', () => ({
  pickSignerUsername: mocks.pickSignerUsername,
}));

import { handleFetchRemoteAccount } from '../src/handlers/fetchRemoteAccount';

beforeEach(() => {
  mocks.env.DB.prepare.mockReset();
  mocks.env.CACHE.get.mockReset();
  mocks.env.CACHE.put.mockReset();
  mocks.createFed.mockReset();
  mocks.ensureInstanceRecord.mockReset();
  mocks.getSuspendedDomains.mockReset();
  mocks.isActor.mockReset();
  mocks.pickSignerUsername.mockReset();
});

describe('remote Actor collection privacy ingestion', () => {
  it.each([
    ['public collections', true, true, 0],
    ['private followers collection', false, true, 1],
    ['private following collection', true, false, 1],
  ] as const)('stores %s as hide_collections=%i', async (
    _label,
    followersPublic,
    followingPublic,
    expectedHidden,
  ) => {
    let upsertBindings: readonly unknown[] = [];
    mocks.env.DB.prepare.mockImplementation((sql: string) => ({
      bind: (...bindings: readonly unknown[]) => ({
        first: async () => {
          if (sql.includes('SELECT id, fetched_at, suspended_at')) return null;
          throw new Error(`Unexpected D1 first query: ${sql}`);
        },
        run: async () => {
          if (!sql.includes('INSERT INTO accounts')) {
            throw new Error(`Unexpected D1 run query: ${sql}`);
          }
          upsertBindings = bindings;
          return { success: true };
        },
      }),
    }));
    mocks.env.CACHE.get.mockResolvedValue('cached-nodeinfo');
    mocks.env.CACHE.put.mockResolvedValue(undefined);
    mocks.getSuspendedDomains.mockResolvedValue(new Set<string>());
    mocks.pickSignerUsername.mockResolvedValue('local-user');
    mocks.isActor.mockReturnValue(true);

    const actorUri = 'https://remote.example/users/alice';
    const followersId = new URL(`${actorUri}/followers`);
    const followingId = new URL(`${actorUri}/following`);
    const actor = {
      followersId,
      followingId,
      getFollowers: async () => followersPublic
        ? { firstId: new URL(`${followersId.href}?page=true`) }
        : { firstId: null },
      getFollowing: async () => followingPublic
        ? { firstId: new URL(`${followingId.href}?page=true`) }
        : { firstId: null },
      toJsonLd: async () => ({
        id: actorUri,
        type: 'Person',
        preferredUsername: 'alice',
        inbox: `${actorUri}/inbox`,
        outbox: `${actorUri}/outbox`,
        followers: followersId.href,
        following: followingId.href,
      }),
    };
    mocks.createFed.mockReturnValue({
      createContext: () => ({
        getDocumentLoader: async () => ({}),
        lookupObject: async () => actor,
      }),
    });

    await handleFetchRemoteAccount({
      type: 'fetch_remote_account',
      actorUri,
      forceRefresh: true,
    });

    expect(upsertBindings[12]).toBe(followersId.href);
    expect(upsertBindings[13]).toBe(followingId.href);
    expect(upsertBindings[14]).toBe(expectedHidden);
  });
});
