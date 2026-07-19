import { defineStore } from 'pinia';
import { ref, computed, markRaw } from 'vue';
import type { Notification } from '@/types/mastodon';
import type { ApiResponse } from '@/api/client';
import {
  getNotifications as fetchNotifications,
  clearNotifications as apiClearNotifications,
  dismissNotification as apiDismissNotification,
} from '@/api/mastodon/notifications';
import { parseLinkHeader, apiFetch } from '@/api/client';
import { StreamingClient } from '@/api/streaming';
import { useStatusesStore } from './statuses';
import { useAccountsStore } from './accounts';
import {
  registerNotificationMutationHandler,
  type NotificationMutation,
} from './notificationPrefetchInvalidation';

type NotificationPagePrefetchResult =
  | { ok: true; response: ApiResponse<Notification[]> }
  | { ok: false; error: unknown };

interface NotificationPagePrefetch {
  token: string;
  maxId: string;
  requestGeneration: number;
  controller: AbortController;
  invalidators: NotificationPredicate[];
  refreshAfterSettle: boolean;
  promise: Promise<NotificationPagePrefetchResult>;
}

type NotificationPredicate = (notification: Notification) => boolean;

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<Notification[]>([]);
  const loading = ref(false);
  const loadingMore = ref(false);
  const hasMore = ref(true);
  const maxId = ref<string>();
  const error = ref<string | null>(null);
  const lastReadId = ref<string | null>(null);
  const streamingClient = ref<StreamingClient | null>(null);
  const serverUnreadCount = ref(0);
  let requestGeneration = 0;
  let activeToken: string | undefined;
  let pagePrefetch: NotificationPagePrefetch | undefined;
  let queuedPrefetchRestart: NotificationPagePrefetch | undefined;
  let prefetchRestartQueued = false;

  const unreadCount = computed(() => serverUnreadCount.value);

  function cacheFromNotifications(notifications: Notification[]) {
    const statusStore = useStatusesStore();
    const accountStore = useAccountsStore();

    for (const notification of notifications) {
      accountStore.cacheAccount(notification.account);
      if (notification.status) {
        statusStore.cacheStatus(notification.status);
        accountStore.cacheAccount(notification.status.account);
      }
    }
  }

  function clearPagePrefetch() {
    pagePrefetch?.controller.abort();
    pagePrefetch = undefined;
  }

  function startPagePrefetchAt(
    token: string,
    cursor: string,
    generation: number,
    force = false,
  ) {
    if (
      !force
      && pagePrefetch?.token === token
      && pagePrefetch.maxId === cursor
      && pagePrefetch.requestGeneration === generation
    ) return;

    clearPagePrefetch();
    const controller = new AbortController();
    const promise = fetchNotifications({
      token,
      max_id: cursor,
      signal: controller.signal,
    }).then(
      (response): NotificationPagePrefetchResult => ({ ok: true, response }),
      (prefetchError): NotificationPagePrefetchResult => ({
        ok: false,
        error: prefetchError,
      }),
    );
    pagePrefetch = {
      token,
      maxId: cursor,
      requestGeneration: generation,
      controller,
      invalidators: [],
      refreshAfterSettle: false,
      promise,
    };
  }

  function startPagePrefetch(token: string, force = false) {
    const cursor = maxId.value;
    if (!hasMore.value || !cursor) {
      clearPagePrefetch();
      return;
    }
    startPagePrefetchAt(token, cursor, requestGeneration, force);
  }

  function restartPagePrefetch(expected: NotificationPagePrefetch) {
    if (
      pagePrefetch !== expected
      || requestGeneration !== expected.requestGeneration
    ) return;
    startPagePrefetchAt(
      expected.token,
      expected.maxId,
      expected.requestGeneration,
      true,
    );
  }

  function queuePagePrefetchRestart(expected: NotificationPagePrefetch) {
    queuedPrefetchRestart = expected;
    if (prefetchRestartQueued) return;
    prefetchRestartQueued = true;
    queueMicrotask(() => {
      prefetchRestartQueued = false;
      const current = queuedPrefetchRestart;
      queuedPrefetchRestart = undefined;
      if (current) restartPagePrefetch(current);
    });
  }

  function responseNeedsRefresh(
    entry: NotificationPagePrefetch,
    notifications: readonly Notification[],
  ) {
    return entry.invalidators.some((predicate) => notifications.some(predicate));
  }

  function refreshAffectedPagePrefetch(
    predicate: NotificationPredicate,
    force: boolean,
  ) {
    const entry = pagePrefetch;
    if (!entry) {
      if (force && activeToken) startPagePrefetch(activeToken, true);
      return;
    }
    entry.invalidators.push(predicate);
    if (force) {
      entry.refreshAfterSettle = true;
      queuePagePrefetchRestart(entry);
      return;
    }
    void entry.promise.then((result) => {
      if (
        result.ok
        && pagePrefetch === entry
        && responseNeedsRefresh(entry, result.response.data)
      ) queuePagePrefetchRestart(entry);
    });
  }

  function applyNotificationMutation(mutation: NotificationMutation) {
    const predicate: NotificationPredicate = mutation.type === 'statuses'
      ? (notification) => {
          const status = notification.status;
          return !!status && (
            mutation.statusIds.has(status.id)
            || !!status.reblog && mutation.statusIds.has(status.reblog.id)
          );
        }
      : (notification) => (
          notification.account.id === mutation.accountId
          || notification.status?.account.id === mutation.accountId
          || notification.status?.reblog?.account.id === mutation.accountId
        );
    const previousLength = items.value.length;
    items.value = items.value.filter((notification) => !predicate(notification));
    refreshAffectedPagePrefetch(predicate, items.value.length !== previousLength);
  }

  // A module-level bridge is useful only for the browser's singleton Pinia.
  // Never retain a request-scoped SSR store in a Worker isolate.
  if (typeof window !== 'undefined') {
    registerNotificationMutationHandler(applyNotificationMutation);
  }

  async function consumePagePrefetch(
    token: string,
    cursor: string,
    generation: number,
    retryAfterPrefetchFailure?: boolean,
  ): Promise<ApiResponse<Notification[]> | undefined> {
    if (requestGeneration !== generation) return undefined;
    let entry = pagePrefetch;
    if (!entry) {
      startPagePrefetchAt(token, cursor, generation);
      entry = pagePrefetch;
      retryAfterPrefetchFailure = false;
      if (!entry) return undefined;
    } else if (retryAfterPrefetchFailure === undefined) {
      retryAfterPrefetchFailure = true;
    }
    if (
      entry.token !== token
      || entry.maxId !== cursor
      || entry.requestGeneration !== generation
    ) {
      clearPagePrefetch();
      return consumePagePrefetch(token, cursor, generation, false);
    }

    const result = await entry.promise;
    if (requestGeneration !== generation) return undefined;
    if (pagePrefetch !== entry) {
      return consumePagePrefetch(token, cursor, generation, retryAfterPrefetchFailure);
    }
    if (!result.ok) {
      pagePrefetch = undefined;
      if (retryAfterPrefetchFailure) {
        return consumePagePrefetch(token, cursor, generation, false);
      }
      throw result.error;
    }
    if (
      entry.refreshAfterSettle
      || responseNeedsRefresh(entry, result.response.data)
    ) {
      restartPagePrefetch(entry);
      return consumePagePrefetch(token, cursor, generation, retryAfterPrefetchFailure);
    }
    pagePrefetch = undefined;
    return result.response;
  }

  async function fetch(token: string) {
    const generation = ++requestGeneration;
    activeToken = token;
    clearPagePrefetch();
    loadingMore.value = false;
    loading.value = true;
    error.value = null;

    try {
      const { data, headers } = await fetchNotifications({ token });
      if (requestGeneration !== generation) return;
      cacheFromNotifications(data);
      items.value = data;

      const links = parseLinkHeader(headers.get('Link'));
      hasMore.value = !!links.next;
      if (data.length > 0) {
        maxId.value = data[data.length - 1]!.id;
      } else {
        maxId.value = undefined;
      }

      // Keep exactly one raw API page ready for infinite scroll. It is not
      // cached or exposed until fetchMore consumes it.
      startPagePrefetch(token);

      // Fetch unread count from server
      await fetchUnreadCount(token);
      if (requestGeneration !== generation) return;

      // Auto-connect streaming for notifications
      connectStream(token);
    } catch (e) {
      if (requestGeneration === generation) {
        error.value = (e as Error).message;
      }
    } finally {
      if (requestGeneration === generation) {
        loading.value = false;
      }
    }
  }

  async function fetchMore(token: string) {
    if (loadingMore.value || !hasMore.value) return;

    const generation = requestGeneration;
    const cursor = maxId.value;
    if (!cursor) {
      hasMore.value = false;
      return;
    }

    loadingMore.value = true;
    error.value = null;

    try {
      const response = await consumePagePrefetch(token, cursor, generation);
      if (!response) return;
      if (requestGeneration !== generation) return;

      const { data, headers } = response;
      cacheFromNotifications(data);
      items.value.push(...data);

      const links = parseLinkHeader(headers.get('Link'));
      hasMore.value = !!links.next;
      if (data.length > 0) {
        maxId.value = data[data.length - 1]!.id;
      }
      startPagePrefetch(token);
    } catch (e) {
      if (requestGeneration === generation) {
        error.value = (e as Error).message;
      }
    } finally {
      if (requestGeneration === generation) {
        loadingMore.value = false;
      }
    }
  }

  async function clearAll(token: string) {
    const generation = ++requestGeneration;
    clearPagePrefetch();
    loading.value = false;
    loadingMore.value = false;
    await apiClearNotifications(token);
    if (requestGeneration !== generation) return;
    items.value = [];
    maxId.value = undefined;
    hasMore.value = false;
    lastReadId.value = null;
  }

  async function dismiss(id: string, token: string) {
    const generation = ++requestGeneration;
    clearPagePrefetch();
    loading.value = false;
    loadingMore.value = false;
    await apiDismissNotification(id, token);
    if (requestGeneration !== generation) return;
    items.value = items.value.filter((n) => n.id !== id);
    maxId.value = items.value.at(-1)?.id;
    startPagePrefetch(token);
  }

  async function fetchUnreadCount(token: string) {
    const generation = requestGeneration;
    try {
      const { data } = await apiFetch<{ count: number }>('/v1/notifications/unread_count', { token });
      if (requestGeneration === generation) {
        serverUnreadCount.value = data.count;
      }
    } catch { /* ignore */ }
  }

  async function markAllRead(token?: string) {
    if (!token) return;
    const generation = requestGeneration;
    try {
      const { data } = await apiFetch<{ count: number }>('/v1/notifications/read', {
        method: 'POST',
        token,
        body: {},
      });
      if (requestGeneration === generation) {
        serverUnreadCount.value = data.count;
      }
    } catch { /* ignore */ }
  }

  async function markRead(id: string, token: string) {
    const generation = requestGeneration;
    try {
      const { data } = await apiFetch<{ count: number }>('/v1/notifications/read', {
        method: 'POST',
        token,
        body: { id },
      });
      if (requestGeneration === generation) {
        serverUnreadCount.value = data.count;
      }
    } catch { /* ignore */ }
  }

  async function loadMarker(token: string) {
    await fetchUnreadCount(token);
  }

  function prepend(notification: Notification) {
    items.value.unshift(notification);
  }

  function connectStream(token: string) {
    if (typeof window === 'undefined') return;
    if (streamingClient.value?.isActive()) return;
    if (streamingClient.value) {
      streamingClient.value.disconnect();
      streamingClient.value = null;
    }

    streamingClient.value = markRaw(new StreamingClient(token, 'user:notification', {
      onNotification(notification: Notification) {
        try {
          cacheFromNotifications([notification]);
          // Deduplicate: don't add if already in list
          if (!items.value.some(n => n.id === notification.id)) {
            prepend(notification);
            serverUnreadCount.value++;
          }
        } catch (e) {
          console.error('[notifications streaming] Error processing notification:', e);
          // Still try to prepend even if caching fails
          if (!items.value.some(n => n.id === notification.id)) {
            prepend(notification);
            serverUnreadCount.value++;
          }
        }
      },
      onNotificationsRead(count: number) {
        serverUnreadCount.value = count;
        // Also update local read state for items that should now be read
        if (count === 0) {
          items.value.forEach((n: any) => { n.read = 1; });
        }
      },
    }));

    streamingClient.value.connect();
  }

  function disconnectStream() {
    if (streamingClient.value) {
      streamingClient.value.disconnect();
      streamingClient.value = null;
    }
  }

  function reset() {
    requestGeneration += 1;
    clearPagePrefetch();
    queuedPrefetchRestart = undefined;
    activeToken = undefined;
    disconnectStream();
    items.value = [];
    loading.value = false;
    loadingMore.value = false;
    hasMore.value = true;
    maxId.value = undefined;
    error.value = null;
    lastReadId.value = null;
    serverUnreadCount.value = 0;
  }

  return {
    items,
    loading,
    loadingMore,
    hasMore,
    error,
    unreadCount,
    lastReadId,
    streamingClient,
    reset,
    fetch,
    fetchMore,
    clearAll,
    dismiss,
    serverUnreadCount,
    markAllRead,
    markRead,
    fetchUnreadCount,
    loadMarker,
    prepend,
    connectStream,
    disconnectStream,
  };
});
