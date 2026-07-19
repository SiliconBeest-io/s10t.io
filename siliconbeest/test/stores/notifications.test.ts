import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Notification } from '@/types/mastodon';
import { useAccountsStore } from '@/stores/accounts';
import { useNotificationsStore } from '@/stores/notifications';
import {
  clearNotifications,
  dismissNotification,
  getNotifications,
} from '@/api/mastodon/notifications';
import { apiFetch, parseLinkHeader } from '@/api/client';
import {
  refreshNotificationsForRemovedAccount,
  refreshNotificationsForRemovedStatuses,
} from '@/stores/notificationPrefetchInvalidation';

vi.mock('@/api/mastodon/notifications', () => ({
  getNotifications: vi.fn(),
  clearNotifications: vi.fn(),
  dismissNotification: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  apiFetch: vi.fn(),
  parseLinkHeader: vi.fn(),
}));

vi.mock('@/api/streaming', () => ({
  StreamingClient: vi.fn(function (this: Record<string, unknown>) {
    this.connect = vi.fn();
    this.disconnect = vi.fn();
    this.isActive = vi.fn(() => true);
  }),
}));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function notification(id: string, accountId = `account-${id}`): Notification {
  return {
    id,
    type: 'mention',
    created_at: '2026-07-19T00:00:00.000Z',
    account: { id: accountId } as Notification['account'],
  };
}

function statusNotification(
  id: string,
  statusId: string,
  statusAccountId: string,
  reblog?: { id: string; accountId: string },
): Notification {
  return {
    ...notification(id),
    status: {
      id: statusId,
      account: { id: statusAccountId },
      reblog: reblog
        ? { id: reblog.id, account: { id: reblog.accountId }, reblog: null }
        : null,
    } as Notification['status'],
  };
}

function page(data: Notification[], link: string | null = null) {
  return {
    data,
    headers: new Headers(link ? { Link: link } : undefined),
  };
}

describe('Notifications Store next-page prefetch', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockResolvedValue({
      data: { count: 0 },
      headers: new Headers(),
    });
    vi.mocked(clearNotifications).mockResolvedValue({
      data: {},
      headers: new Headers(),
    });
    vi.mocked(dismissNotification).mockResolvedValue({
      data: {},
      headers: new Headers(),
    });
    vi.mocked(parseLinkHeader).mockImplementation((header) => (
      header === 'next-page' ? { next: '/api/v1/notifications?max_id=first' } : {}
    ));
  });

  it('loads one raw page ahead and lets fetchMore reuse the pending response', async () => {
    const prefetchedPage = deferred<ReturnType<typeof page>>();
    vi.mocked(getNotifications)
      .mockResolvedValueOnce(page([notification('first')], 'next-page'))
      .mockReturnValueOnce(prefetchedPage.promise);

    const store = useNotificationsStore();
    const accounts = useAccountsStore();
    await store.fetch('token');

    expect(getNotifications).toHaveBeenCalledTimes(2);
    expect(getNotifications).toHaveBeenLastCalledWith({
      token: 'token',
      max_id: 'first',
      signal: expect.any(AbortSignal),
    });
    expect(store.items.map(({ id }) => id)).toEqual(['first']);
    expect(accounts.cache.has('account-next')).toBe(false);

    const loadMore = store.fetchMore('token');
    await Promise.resolve();
    expect(getNotifications).toHaveBeenCalledTimes(2);

    prefetchedPage.resolve(page([notification('next', 'account-next')]));
    await loadMore;

    expect(store.items.map(({ id }) => id)).toEqual(['first', 'next']);
    expect(accounts.cache.has('account-next')).toBe(true);
  });

  it('keeps a prefetch failure silent and retries on fetchMore', async () => {
    vi.mocked(getNotifications)
      .mockResolvedValueOnce(page([notification('first')], 'next-page'))
      .mockRejectedValueOnce(new Error('background failure'))
      .mockResolvedValueOnce(page([notification('retried')]));

    const store = useNotificationsStore();
    await store.fetch('token');
    await Promise.resolve();

    expect(store.error).toBeNull();
    await store.fetchMore('token');

    expect(getNotifications).toHaveBeenCalledTimes(3);
    expect(getNotifications).toHaveBeenLastCalledWith({
      token: 'token',
      max_id: 'first',
      signal: expect.any(AbortSignal),
    });
    expect(store.items.map(({ id }) => id)).toEqual(['first', 'retried']);
  });

  it('aborts and rebuilds only the notification prefetch after dismiss', async () => {
    const stalePrefetch = deferred<ReturnType<typeof page>>();
    vi.mocked(getNotifications)
      .mockResolvedValueOnce(page([
        notification('newer'),
        notification('dismissed'),
      ], 'next-page'))
      .mockReturnValueOnce(stalePrefetch.promise)
      .mockResolvedValueOnce(page([notification('fresh-next')]));

    const store = useNotificationsStore();
    await store.fetch('token');
    const staleSignal = vi.mocked(getNotifications).mock.calls[1]![0].signal!;
    const staleLoadMore = store.fetchMore('token');
    await Promise.resolve();

    await store.dismiss('dismissed', 'token');

    expect(staleSignal.aborted).toBe(true);
    expect(store.items.map(({ id }) => id)).toEqual(['newer']);
    expect(getNotifications).toHaveBeenLastCalledWith({
      token: 'token',
      max_id: 'newer',
      signal: expect.any(AbortSignal),
    });

    stalePrefetch.resolve(page([notification('stale-next')]));
    await staleLoadMore;
    expect(store.items.map(({ id }) => id)).toEqual(['newer']);

    await store.fetchMore('token');
    expect(store.items.map(({ id }) => id)).toEqual(['newer', 'fresh-next']);
  });

  it('aborts the stale page and ends pagination when all notifications are cleared', async () => {
    const stalePrefetch = deferred<ReturnType<typeof page>>();
    vi.mocked(getNotifications)
      .mockResolvedValueOnce(page([notification('first')], 'next-page'))
      .mockReturnValueOnce(stalePrefetch.promise);

    const store = useNotificationsStore();
    await store.fetch('token');
    const staleSignal = vi.mocked(getNotifications).mock.calls[1]![0].signal!;

    await store.clearAll('token');

    expect(staleSignal.aborted).toBe(true);
    expect(store.items).toEqual([]);
    expect(store.hasMore).toBe(false);
    expect(getNotifications).toHaveBeenCalledTimes(2);
  });

  it('drops account-scoped state and aborts its prefetch on reset', async () => {
    const stalePrefetch = deferred<ReturnType<typeof page>>();
    vi.mocked(getNotifications)
      .mockResolvedValueOnce(page([notification('old-account')], 'next-page'))
      .mockReturnValueOnce(stalePrefetch.promise);

    const store = useNotificationsStore();
    await store.fetch('old-token');
    const staleSignal = vi.mocked(getNotifications).mock.calls[1]![0].signal!;

    store.reset();

    expect(staleSignal.aborted).toBe(true);
    expect(store.items).toEqual([]);
    expect(store.hasMore).toBe(true);
    expect(store.error).toBeNull();
  });

  it('filters every account-bearing notification field and refetches the same cursor', async () => {
    const stalePrefetch = deferred<ReturnType<typeof page>>();
    vi.mocked(getNotifications)
      .mockResolvedValueOnce(page([
        notification('safe', 'safe-sender'),
        notification('sender', 'blocked'),
        statusNotification('status-author', 'status-1', 'blocked'),
        statusNotification('via-reblog', 'wrapper', 'safe-author', {
          id: 'original',
          accountId: 'blocked',
        }),
      ], 'next-page'))
      .mockReturnValueOnce(stalePrefetch.promise)
      .mockResolvedValueOnce(page([notification('fresh-next')]));

    const store = useNotificationsStore();
    await store.fetch('token');
    const staleSignal = vi.mocked(getNotifications).mock.calls[1]![0].signal!;

    refreshNotificationsForRemovedAccount('blocked');
    await Promise.resolve();

    expect(store.items.map(({ id }) => id)).toEqual(['safe']);
    expect(staleSignal.aborted).toBe(true);
    expect(getNotifications).toHaveBeenLastCalledWith({
      token: 'token',
      max_id: 'via-reblog',
      signal: expect.any(AbortSignal),
    });
  });

  it('removes notifications whose status or reblog target was deleted', async () => {
    vi.mocked(getNotifications)
      .mockResolvedValueOnce(page([
        statusNotification('direct', 'deleted-direct', 'author-1'),
        statusNotification('wrapper', 'wrapper-status', 'author-2', {
          id: 'deleted-original',
          accountId: 'author-3',
        }),
        statusNotification('safe', 'safe-status', 'author-4'),
      ], 'next-page'))
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([]));

    const store = useNotificationsStore();
    await store.fetch('token');
    refreshNotificationsForRemovedStatuses(new Set([
      'deleted-direct',
      'deleted-original',
    ]));
    await Promise.resolve();

    expect(store.items.map(({ id }) => id)).toEqual(['safe']);
  });

  it('tracks the post-failure fallback so a raw blocked result is replaced before use', async () => {
    const fallbackPage = deferred<ReturnType<typeof page>>();
    vi.mocked(getNotifications)
      .mockResolvedValueOnce(page([notification('first', 'safe')], 'next-page'))
      .mockRejectedValueOnce(new Error('speculative failure'))
      .mockReturnValueOnce(fallbackPage.promise)
      .mockResolvedValueOnce(page([notification('fresh', 'safe')]));

    const store = useNotificationsStore();
    await store.fetch('token');
    const loadMore = store.fetchMore('token');
    await vi.waitFor(() => expect(getNotifications).toHaveBeenCalledTimes(3));

    refreshNotificationsForRemovedAccount('blocked');
    fallbackPage.resolve(page([notification('blocked-raw', 'blocked')]));
    await vi.waitFor(() => expect(getNotifications).toHaveBeenCalledTimes(4));
    await loadMore;

    expect(store.items.map(({ id }) => id)).toEqual(['first', 'fresh']);
    expect(store.items.map(({ id }) => id)).not.toContain('blocked-raw');
    expect(getNotifications).toHaveBeenLastCalledWith({
      token: 'token',
      max_id: 'first',
      signal: expect.any(AbortSignal),
    });
  });
});
