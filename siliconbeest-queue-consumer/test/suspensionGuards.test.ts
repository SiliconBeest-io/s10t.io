import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    DB: { prepare: vi.fn() },
    QUEUE_INTERNAL: { send: vi.fn() },
    QUEUE_FEDERATION: { send: vi.fn() },
    INSTANCE_DOMAIN: 'local.example',
  },
  createFed: vi.fn(),
  getSuspendedDomains: vi.fn(),
  pickSignerUsername: vi.fn(),
}));

vi.mock('cloudflare:workers', () => ({ env: mocks.env }));
vi.mock('../src/fedify', () => ({ createFed: mocks.createFed }));
vi.mock('../../packages/shared/domain-blocks', () => ({
  getSuspendedDomains: mocks.getSuspendedDomains,
}));
vi.mock('../../packages/shared/services/signer', () => ({
  pickSignerUsername: mocks.pickSignerUsername,
}));

import { handleFetchRemoteStatus } from '../src/handlers/fetchRemoteStatus';
import { handleImportItem } from '../src/handlers/importItem';

beforeEach(() => {
  mocks.env.DB.prepare.mockReset();
  mocks.env.QUEUE_INTERNAL.send.mockReset();
  mocks.env.QUEUE_FEDERATION.send.mockReset();
  mocks.createFed.mockReset();
  mocks.getSuspendedDomains.mockReset();
  mocks.pickSignerUsername.mockReset();
});

describe('queue suspension guards', () => {
  it('does not create a follow request for a cached account on a suspended domain', async () => {
    mocks.env.DB.prepare.mockImplementation((sql: string) => ({
      bind: () => ({
        first: async () => {
          if (!sql.includes('FROM accounts')) {
            throw new Error(`Unexpected D1 query: ${sql}`);
          }
          return {
            id: 'remote-account',
            username: 'alice',
            domain: 'blocked.example',
            uri: 'https://blocked.example/users/alice',
            inbox_url: 'https://blocked.example/inbox',
            shared_inbox_url: null,
            locked: 0,
            manually_approves_followers: 0,
          };
        },
      }),
    }));
    mocks.getSuspendedDomains.mockResolvedValue(new Set(['blocked.example']));

    await handleImportItem({
      type: 'import_item',
      acct: 'alice@blocked.example',
      action: 'following',
      accountId: 'local-account',
    });

    expect(mocks.getSuspendedDomains).toHaveBeenCalledWith(
      mocks.env.DB,
      ['blocked.example'],
    );
    expect(mocks.env.DB.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.env.QUEUE_FEDERATION.send).not.toHaveBeenCalled();
  });

  it.each([
    ['a user-blocked target domain', {}, { actor_blocks_target_domain: 1 }],
    ['a disabled importing account', {}, { user_disabled: 1 }],
    ['a memorial target', { memorial: 1 }, {}],
    ['a migrated-away target', { moved_to_account_id: 'new-account' }, {}],
    ['a suspended target', { suspended_at: '2026-07-15T00:00:00.000Z' }, {}],
    ['a target that blocks the importer', {}, { target_blocks_actor: 1 }],
  ])('does not import a follow across %s', async (
    _label,
    targetOverrides,
    actorOverrides,
  ) => {
    mocks.env.DB.prepare.mockImplementation((sql: string) => ({
      bind: () => ({
        first: async () => {
          if (sql.includes('FROM accounts target')) {
            return {
              id: 'remote-account',
              username: 'alice',
              domain: 'remote.example',
              uri: 'https://remote.example/users/alice',
              inbox_url: 'https://remote.example/inbox',
              shared_inbox_url: null,
              locked: 0,
              manually_approves_followers: 0,
              suspended_at: null,
              memorial: 0,
              moved_to_account_id: null,
              user_approved: null,
              ...targetOverrides,
            };
          }
          if (sql.includes('FROM accounts actor')) {
            return {
              suspended_at: null,
              memorial: 0,
              user_disabled: 0,
              user_approved: 1,
              actor_blocks_target: 0,
              target_blocks_actor: 0,
              actor_blocks_target_domain: 0,
              ...actorOverrides,
            };
          }
          throw new Error(`Unexpected D1 query: ${sql}`);
        },
      }),
    }));
    mocks.getSuspendedDomains.mockResolvedValue(new Set());

    await handleImportItem({
      type: 'import_item',
      acct: 'alice@remote.example',
      action: 'following',
      accountId: 'local-account',
    });

    expect(mocks.env.QUEUE_FEDERATION.send).not.toHaveBeenCalled();
    expect(mocks.env.QUEUE_INTERNAL.send).not.toHaveBeenCalled();
    expect(mocks.env.DB.prepare).toHaveBeenCalledTimes(2);
  });

  it('does not store a cross-host status attribution', async () => {
    mocks.env.DB.prepare.mockImplementation((sql: string) => ({
      bind: () => ({
        first: async () => {
          if (!sql.includes('FROM statuses')) {
            throw new Error(`Unexpected D1 query: ${sql}`);
          }
          return null;
        },
      }),
    }));
    mocks.getSuspendedDomains.mockImplementation(
      async (_db: unknown, domains: string[]) => (
        domains.includes('blocked.example')
          ? new Set(['blocked.example'])
          : new Set<string>()
      ),
    );
    mocks.pickSignerUsername.mockResolvedValue('local-user');
    mocks.createFed.mockReturnValue({
      createContext: () => ({
        getDocumentLoader: async () => ({}),
        lookupObject: async () => ({
          toJsonLd: async () => ({
            id: 'https://status-host.example/notes/1',
            type: 'Note',
            attributedTo: 'https://blocked.example/users/alice',
            content: '<p>blocked</p>',
          }),
        }),
      }),
    });

    await handleFetchRemoteStatus({
      type: 'fetch_remote_status',
      statusUri: 'https://status-host.example/notes/1',
    });

    expect(mocks.getSuspendedDomains).toHaveBeenNthCalledWith(
      1,
      mocks.env.DB,
      ['status-host.example'],
    );
    expect(mocks.getSuspendedDomains).toHaveBeenCalledTimes(1);
    expect(mocks.env.DB.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.env.QUEUE_INTERNAL.send).not.toHaveBeenCalled();
  });
});
