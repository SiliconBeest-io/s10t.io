import { defineStore } from 'pinia';
import { markRaw, ref } from 'vue';
import type { Status } from '@/types/mastodon';
import { parseLinkHeader } from '@/api/client';
import {
  getHomeTimeline,
  getSocialTimeline,
  getPublicTimeline,
  getTagTimeline,
} from '@/api/mastodon/timelines';
import { StreamingClient } from '@/api/streaming';
import { playNewPostSound } from '@/utils/newPostSound';
import { useStatusesStore } from './statuses';
import { useAccountsStore } from './accounts';

export type TimelineType = 'home' | 'social' | 'public' | 'local' | 'tag';
export type AudibleTimelineScopeOwner = string | symbol;

interface TimelineState {
  statusIds: string[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  maxId?: string;
  error: string | null;
  newStatusIds: string[];
}

function createEmptyTimeline(): TimelineState {
  return {
    statusIds: [],
    loading: false,
    loadingMore: false,
    hasMore: true,
    error: null,
    newStatusIds: [],
  };
}

export const useTimelinesStore = defineStore('timelines', () => {
  const timelines = ref<Map<string, TimelineState>>(new Map());
  // Multiple streaming connections — one per stream type
  const streamingClients = ref<Map<string, StreamingClient>>(new Map());
  // Streams the user toggled off (LIVE toggle) — connectStream respects this
  const pausedStreams = ref<Set<string>>(new Set());
  // Timeline views register which feeds are currently visible. Scopes are
  // owner-based so overlapping page transitions cannot clear another view's
  // sound policy. With no registered timelines, live updates stay silent.
  const audibleTimelineScopes = new Map<AudibleTimelineScopeOwner, Set<TimelineType>>();
  // Cache for newly discovered remote custom emojis
  const emojiCache = ref<Map<string, { shortcode: string; url: string; static_url: string }> | null>(null);

  function setAudibleTimelineScope(
    owner: AudibleTimelineScopeOwner,
    types: readonly TimelineType[],
  ) {
    audibleTimelineScopes.set(owner, new Set(types));
  }

  function clearAudibleTimelineScope(owner: AudibleTimelineScopeOwner) {
    audibleTimelineScopes.delete(owner);
  }

  function isTimelineAudible(sourceType: TimelineType): boolean {
    for (const types of audibleTimelineScopes.values()) {
      if (types.has(sourceType)) return true;
      // The social feed is a union of the home and local streams.
      if ((sourceType === 'home' || sourceType === 'local') && types.has('social')) {
        return true;
      }
    }
    return false;
  }

  function getTimelineKey(type: TimelineType, tag?: string): string {
    return type === 'tag' ? `tag:${tag}` : type;
  }

  function getTimeline(type: TimelineType, tag?: string): TimelineState {
    const key = getTimelineKey(type, tag);
    if (!timelines.value.has(key)) {
      timelines.value.set(key, createEmptyTimeline());
    }
    return timelines.value.get(key)!;
  }

  function cacheStatusesFromResponse(statuses: Status[]) {
    const statusStore = useStatusesStore();
    const accountStore = useAccountsStore();

    for (const status of statuses) {
      statusStore.cacheStatus(status);
      accountStore.cacheAccount(status.account);
      if (status.reblog) {
        accountStore.cacheAccount(status.reblog.account);
      }
    }
  }

  async function fetchTimeline(
    type: TimelineType,
    opts?: { tag?: string; token?: string },
  ) {
    const key = getTimelineKey(type, opts?.tag);
    const timeline = getTimeline(type, opts?.tag);
    if (timeline.loading) return;
    timeline.loading = true;
    timeline.error = null;

    try {
      let response;
      switch (type) {
        case 'home':
          response = await getHomeTimeline({ token: opts?.token! });
          break;
        case 'social':
          response = await getSocialTimeline({ token: opts?.token! });
          break;
        case 'public':
          response = await getPublicTimeline({ token: opts?.token });
          break;
        case 'local':
          response = await getPublicTimeline({ local: true, token: opts?.token });
          break;
        case 'tag':
          response = await getTagTimeline(opts?.tag!, { token: opts?.token });
          break;
      }

      cacheStatusesFromResponse(response.data);
      timeline.statusIds = response.data.map((s) => s.id);

      const links = parseLinkHeader(response.headers.get('Link'));
      timeline.hasMore = !!links.next;
      if (response.data.length > 0) {
        timeline.maxId = response.data[response.data.length - 1]!.id;
      }

      // Auto-connect streaming for each timeline type
      if (opts?.token) {
        if (type === 'social') {
          // Social merges home + local: live updates arrive on both streams
          // (onUpdate fans them into the social timeline as well)
          connectStream(opts.token, 'user', 'home');
          connectStream(opts.token, 'public:local', 'local');
        } else {
          const streamMap: Record<string, string> = {
            home: 'user',
            public: 'public',
            local: 'public:local',
          };
          const streamName = streamMap[type];
          if (streamName) {
            connectStream(opts.token, streamName, type);
          }
        }
      }
    } catch (e) {
      timeline.error = (e as Error).message;
    } finally {
      timeline.loading = false;
    }
  }

  async function fetchMore(
    type: TimelineType,
    opts?: { tag?: string; token?: string },
  ) {
    const timeline = getTimeline(type, opts?.tag);
    if (timeline.loadingMore || !timeline.hasMore) return;

    timeline.loadingMore = true;
    timeline.error = null;

    try {
      let response;
      const paginationOpts = { max_id: timeline.maxId, token: opts?.token };

      switch (type) {
        case 'home':
          response = await getHomeTimeline({ ...paginationOpts, token: opts?.token! });
          break;
        case 'social':
          response = await getSocialTimeline({ ...paginationOpts, token: opts?.token! });
          break;
        case 'public':
          response = await getPublicTimeline(paginationOpts);
          break;
        case 'local':
          response = await getPublicTimeline({ ...paginationOpts, local: true });
          break;
        case 'tag':
          response = await getTagTimeline(opts?.tag!, paginationOpts);
          break;
      }

      cacheStatusesFromResponse(response.data);
      timeline.statusIds.push(...response.data.map((s) => s.id));

      const links = parseLinkHeader(response.headers.get('Link'));
      timeline.hasMore = !!links.next;
      if (response.data.length > 0) {
        timeline.maxId = response.data[response.data.length - 1]!.id;
      }
    } catch (e) {
      timeline.error = (e as Error).message;
    } finally {
      timeline.loadingMore = false;
    }
  }

  function prependStatus(type: TimelineType, statusId: string, tag?: string) {
    const timeline = getTimeline(type, tag);
    // Deduplicate: skip if already in newStatusIds or statusIds
    if (timeline.newStatusIds.includes(statusId) || timeline.statusIds.includes(statusId)) return;
    timeline.newStatusIds.unshift(statusId);
  }

  function showNewStatuses(type: TimelineType, tag?: string) {
    const timeline = getTimeline(type, tag);
    const unique = timeline.newStatusIds.filter((id) => !timeline.statusIds.includes(id));
    timeline.statusIds.unshift(...unique);
    timeline.newStatusIds = [];
  }

  function removeStatus(statusId: string) {
    const statusStore = useStatusesStore();
    const removedIds = new Set([statusId]);
    for (const [cachedId, cachedStatus] of statusStore.cache) {
      if (cachedStatus.reblog?.id === statusId) removedIds.add(cachedId);
    }

    for (const timeline of timelines.value.values()) {
      timeline.statusIds = timeline.statusIds.filter((id) => !removedIds.has(id));
      timeline.newStatusIds = timeline.newStatusIds.filter((id) => !removedIds.has(id));
    }
  }

  function removeAccountStatuses(accountId: string) {
    const statusStore = useStatusesStore();
    const removedIds = new Set<string>();
    for (const [cachedId, cachedStatus] of statusStore.cache) {
      if (
        cachedStatus.account.id === accountId
        || cachedStatus.reblog?.account.id === accountId
      ) {
        removedIds.add(cachedId);
      }
    }

    for (const timeline of timelines.value.values()) {
      timeline.statusIds = timeline.statusIds.filter((id) => !removedIds.has(id));
      timeline.newStatusIds = timeline.newStatusIds.filter((id) => !removedIds.has(id));
    }
  }

  function isStreamPaused(stream: string): boolean {
    return pausedStreams.value.has(stream);
  }

  /** LIVE toggle off: remember the choice and close this feed's connection. */
  function pauseStream(stream: string) {
    pausedStreams.value = new Set([...pausedStreams.value, stream]);
    disconnectStream(stream);
  }

  /** Clear a stream's paused flag without fetching (multi-stream resumes). */
  function unpauseStream(stream: string) {
    pausedStreams.value = new Set([...pausedStreams.value].filter((s) => s !== stream));
  }

  /**
   * LIVE toggle on: refetch the timeline first so posts missed while paused
   * aren't silently skipped, then reconnect (fetchTimeline auto-connects
   * when a token is present).
   */
  async function resumeStream(
    stream: string,
    type: TimelineType,
    opts?: { tag?: string; token?: string },
  ) {
    pausedStreams.value = new Set([...pausedStreams.value].filter((s) => s !== stream));
    await fetchTimeline(type, opts);
  }

  function connectStream(token: string, stream: string = 'user', timelineType: TimelineType = 'home') {
    if (typeof window === 'undefined') return;
    if (pausedStreams.value.has(stream)) return;

    const existingClient = streamingClients.value.get(stream);
    if (existingClient?.isActive()) return;
    if (existingClient) {
      existingClient.disconnect();
      streamingClients.value.delete(stream);
    }

    const statusStore = useStatusesStore();
    const accountStore = useAccountsStore();

    const client = new StreamingClient(token, stream, {
      onUpdate(status: Status) {
        statusStore.cacheStatus(status);
        accountStore.cacheAccount(status.account);
        if (status.reblog) {
          accountStore.cacheAccount(status.reblog.account);
        }
        // Add to new status IDs queue for the correct timeline
        prependStatus(timelineType, status.id);
        // The social timeline merges home + local — fan their live updates
        // in as well (prependStatus dedupes across streams)
        if ((timelineType === 'home' || timelineType === 'local') && timelines.value.has('social')) {
          prependStatus('social', status.id);
        }
        // Check visibility before the sound helper's status-id dedupe. A
        // hidden stream must not consume the id and silence a subsequent
        // delivery to a visible timeline.
        if (isTimelineAudible(timelineType)) {
          playNewPostSound(status.id);
        }
      },
      onDelete(statusId: string) {
        removeStatus(statusId);
      },
      onStatusUpdate(status: Status) {
        statusStore.cacheStatus(status);
        accountStore.cacheAccount(status.account);
        if (status.reblog) {
          accountStore.cacheAccount(status.reblog.account);
        }
      },
      onReaction(statusId: string) {
        statusStore.pingReaction(statusId);
      },
      onEmojiUpdate(emojis) {
        // Cache new emojis and re-render affected statuses
        if (!emojiCache.value) emojiCache.value = new Map();
        for (const emoji of emojis) {
          emojiCache.value.set(emoji.shortcode, emoji);
        }
        console.log(`[streaming] ${emojis.length} new emojis cached:`, emojis.map(e => `:${e.shortcode}:`).join(', '));
      },
    });

    streamingClients.value.set(stream, markRaw(client));
    client.connect();
  }

  function disconnectStream(stream?: string) {
    if (stream) {
      const client = streamingClients.value.get(stream);
      if (client) {
        client.disconnect();
        streamingClients.value.delete(stream);
      }
    } else {
      // Disconnect all streams
      for (const client of streamingClients.value.values()) {
        client.disconnect();
      }
      streamingClients.value.clear();
    }
  }

  return {
    timelines,
    streamingClients,
    pausedStreams,
    getTimeline,
    fetchTimeline,
    fetchMore,
    prependStatus,
    showNewStatuses,
    removeStatus,
    removeAccountStatuses,
    connectStream,
    disconnectStream,
    isStreamPaused,
    pauseStream,
    unpauseStream,
    resumeStream,
    setAudibleTimelineScope,
    clearAudibleTimelineScope,
  };
});
