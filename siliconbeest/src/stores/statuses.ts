import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Status } from '@/types/mastodon';
import {
  favouriteStatus,
  unfavouriteStatus,
  reblogStatus,
  unreblogStatus,
  bookmarkStatus,
  unbookmarkStatus,
  deleteStatus as apiDeleteStatus,
  editStatus as apiEditStatus,
} from '@/api/mastodon/statuses';
import type { CreateStatusParams } from '@/api/mastodon/statuses';
import { useAuthStore } from './auth';
import { useTimelinesStore } from './timelines';

export const useStatusesStore = defineStore('statuses', () => {
  const cache = ref<Map<string, Status>>(new Map());

  // Bumped when a `reaction` stream event arrives for a status — components
  // rendering that status's reactions watch their entry and refetch.
  const reactionPings = ref<Map<string, number>>(new Map());

  function pingReaction(statusId: string) {
    const next = new Map(reactionPings.value);
    next.set(statusId, (next.get(statusId) ?? 0) + 1);
    reactionPings.value = next;
  }

  function cacheStatus(status: Status) {
    cache.value.set(status.id, status);
    if (status.reblog) {
      cache.value.set(status.reblog.id, status.reblog);
    }
  }

  function cacheStatuses(statuses: Status[]) {
    for (const status of statuses) {
      cacheStatus(status);
    }
  }

  function getCached(id: string): Status | undefined {
    return cache.value.get(id);
  }

  // Optimistic update helper
  function updateCached(id: string, update: Partial<Status>) {
    const existing = cache.value.get(id);
    if (existing) {
      cache.value.set(id, { ...existing, ...update });
    }
  }

  async function toggleFavourite(status: Status) {
    const auth = useAuthStore();
    if (!auth.token) return;

    const targetId = status.reblog?.id ?? status.id;
    const target = cache.value.get(targetId) ?? status.reblog ?? status;
    const wasFavourited = target.favourited;

    // Optimistic update
    updateCached(targetId, {
      favourited: !wasFavourited,
      favourites_count: target.favourites_count + (wasFavourited ? -1 : 1),
    });

    try {
      const { data } = wasFavourited
        ? await unfavouriteStatus(targetId, auth.token)
        : await favouriteStatus(targetId, auth.token);
      cacheStatus(data);
    } catch {
      // Revert on error
      updateCached(targetId, {
        favourited: wasFavourited,
        favourites_count: target.favourites_count,
      });
    }
  }

  async function toggleReblog(status: Status) {
    const auth = useAuthStore();
    if (!auth.token) return;

    const targetId = status.reblog?.id ?? status.id;
    const target = cache.value.get(targetId) ?? status.reblog ?? status;
    const wasReblogged = target.reblogged;

    // Optimistic update
    updateCached(targetId, {
      reblogged: !wasReblogged,
      reblogs_count: target.reblogs_count + (wasReblogged ? -1 : 1),
    });

    try {
      const { data } = wasReblogged
        ? await unreblogStatus(targetId, auth.token)
        : await reblogStatus(targetId, auth.token);
      cacheStatus(data);
      // Add reblog to home timeline immediately
      if (!wasReblogged && data.id) {
        const timelinesStore = useTimelinesStore();
        const timeline = timelinesStore.getTimeline('home');
        if (!timeline.statusIds.includes(data.id)) {
          timeline.statusIds.unshift(data.id);
        }
      } else if (wasReblogged && data.id) {
        // Remove the old reblog wrapper from timelines. The unreblog API
        // returns the ORIGINAL status, but timelines hold the wrapper (the
        // boost entry authored by us) — removing data.id alone leaves the
        // boost visible until a refresh.
        const timelinesStore = useTimelinesStore();
        timelinesStore.removeStatus(data.id);
        const myAccountId = auth.currentUser?.id;
        for (const [id, cached] of cache.value) {
          if (cached.reblog?.id === targetId && cached.account?.id === myAccountId) {
            timelinesStore.removeStatus(id);
          }
        }
      }
    } catch {
      // Revert on error
      updateCached(targetId, {
        reblogged: wasReblogged,
        reblogs_count: target.reblogs_count,
      });
    }
  }

  async function toggleBookmark(status: Status) {
    const auth = useAuthStore();
    if (!auth.token) return;

    const targetId = status.reblog?.id ?? status.id;
    const target = cache.value.get(targetId) ?? status.reblog ?? status;
    const wasBookmarked = target.bookmarked;

    // Optimistic update
    updateCached(targetId, { bookmarked: !wasBookmarked });

    try {
      const { data } = wasBookmarked
        ? await unbookmarkStatus(targetId, auth.token)
        : await bookmarkStatus(targetId, auth.token);
      cacheStatus(data);
    } catch {
      // Revert on error
      updateCached(targetId, { bookmarked: wasBookmarked });
    }
  }

  async function deleteStatus(id: string) {
    const auth = useAuthStore();
    if (!auth.token) return;

    await apiDeleteStatus(id, auth.token);
    cache.value.delete(id);
  }

  async function editStatus(id: string, params: CreateStatusParams) {
    const auth = useAuthStore();
    if (!auth.token) return;

    const { data } = await apiEditStatus(id, params, auth.token);
    cacheStatus(data);
    return data;
  }

  return {
    cache,
    reactionPings,
    pingReaction,
    cacheStatus,
    cacheStatuses,
    getCached,
    updateCached,
    toggleFavourite,
    toggleReblog,
    toggleBookmark,
    deleteStatus,
    editStatus,
  };
});
