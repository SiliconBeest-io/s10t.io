import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { deleteDraft, getDrafts, putDraft } from '@/api/mastodon/drafts';
import type {
  ComposeDraft,
  ComposeDraftInput,
  ServerComposeDraft,
} from '@/types/drafts';
import { useAuthStore } from './auth';

export type { ComposeDraft, ComposeDraftInput } from '@/types/drafts';

const STORAGE_PREFIX = 'siliconbeest_post_drafts';
const MAX_DRAFTS = 50;

type LocalDraftState = {
  drafts: ComposeDraft[];
  pendingDeleteIds: string[];
};

function storageKey(accountId: string): string {
  return `${STORAGE_PREFIX}:${accountId}`;
}

function createId(): string {
  return crypto.randomUUID();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDraft(value: unknown): ComposeDraft | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string' ||
    typeof value.content !== 'string' ||
    (value.objectType !== 'Note' && value.objectType !== 'Article') ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) return null;

  return {
    ...(value as ServerComposeDraft),
    revision: Number.isSafeInteger(value.revision) && Number(value.revision) > 0
      ? Number(value.revision)
      : 1,
    pendingSync: typeof value.pendingSync === 'boolean' ? value.pendingSync : true,
  };
}

function fromServer(draft: ServerComposeDraft): ComposeDraft {
  return { ...draft, pendingSync: false };
}

function sorted(drafts: ComposeDraft[]): ComposeDraft[] {
  return [...drafts]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_DRAFTS);
}

function toDraftInput(draft: ComposeDraft): ComposeDraftInput {
  return {
    content: draft.content,
    objectType: draft.objectType,
    articleTitle: draft.articleTitle,
    articleSummary: draft.articleSummary,
    spoilerText: draft.spoilerText,
    showContentWarning: draft.showContentWarning,
    visibility: draft.visibility,
    language: draft.language,
    sensitive: draft.sensitive,
    quotePolicy: draft.quotePolicy,
    mediaAttachments: draft.mediaAttachments,
    showPoll: draft.showPoll,
    pollOptions: draft.pollOptions,
    pollExpiresIn: draft.pollExpiresIn,
    pollMultiple: draft.pollMultiple,
    inReplyToId: draft.inReplyToId,
    inReplyToStatus: draft.inReplyToStatus,
    quoteId: draft.quoteId,
    quoteStatus: draft.quoteStatus,
  };
}

export function hasDraftContent(input: ComposeDraftInput): boolean {
  return Boolean(
    input.content.trim() ||
    input.articleTitle.trim() ||
    input.articleSummary.trim() ||
    input.spoilerText.trim() ||
    input.mediaAttachments.length ||
    input.inReplyToId ||
    input.quoteId ||
    input.pollOptions.some((option) => option.trim()),
  );
}

export const useDraftsStore = defineStore('drafts', () => {
  const auth = useAuthStore();
  const drafts = ref<ComposeDraft[]>([]);
  const pendingDeleteIds = ref<string[]>([]);
  const activeDraftId = ref<string | null>(null);
  const loadedAccountId = ref<string | null>(null);
  const loading = ref(false);
  const savingRequests = ref(0);
  const error = ref<string | null>(null);
  let loadGeneration = 0;

  const count = computed(() => drafts.value.length);
  const accountId = computed(() => loadedAccountId.value);
  const saving = computed(() => savingRequests.value > 0);
  const activeDraft = computed(
    () => drafts.value.find((draft) => draft.id === activeDraftId.value) ?? null,
  );

  function persist() {
    if (!loadedAccountId.value || typeof localStorage === 'undefined') return;
    const state: LocalDraftState = {
      drafts: drafts.value,
      pendingDeleteIds: pendingDeleteIds.value,
    };
    try {
      localStorage.setItem(storageKey(loadedAccountId.value), JSON.stringify(state));
    } catch {
      // A full or unavailable browser storage area must not interrupt composing.
    }
  }

  function loadLocal(nextAccountId: string | null) {
    loadedAccountId.value = nextAccountId;
    activeDraftId.value = null;
    error.value = null;

    if (!nextAccountId || typeof localStorage === 'undefined') {
      drafts.value = [];
      pendingDeleteIds.value = [];
      return;
    }

    try {
      const stored: unknown = JSON.parse(localStorage.getItem(storageKey(nextAccountId)) ?? 'null');
      const legacyDrafts = Array.isArray(stored) ? stored : null;
      const stateDrafts = isRecord(stored) && Array.isArray(stored.drafts) ? stored.drafts : legacyDrafts;
      const deletes = isRecord(stored) && Array.isArray(stored.pendingDeleteIds)
        ? stored.pendingDeleteIds.filter((id): id is string => typeof id === 'string')
        : [];
      drafts.value = sorted((stateDrafts ?? []).flatMap((value) => {
        const draft = normalizeDraft(value);
        return draft ? [draft] : [];
      }));
      pendingDeleteIds.value = [...new Set(deletes)];
    } catch {
      drafts.value = [];
      pendingDeleteIds.value = [];
    }
  }

  async function syncDraft(draft: ComposeDraft, token: string): Promise<ComposeDraft> {
    savingRequests.value += 1;
    try {
      const { data } = await putDraft(draft.id, draft.revision, toDraftInput(draft), token);
      if (loadedAccountId.value !== auth.currentUser?.id) return draft;

      const current = drafts.value.find((item) => item.id === draft.id);
      if (!current || current.revision <= data.revision) {
        const synced = fromServer(data);
        drafts.value = sorted([synced, ...drafts.value.filter((item) => item.id !== draft.id)]);
        persist();
        error.value = null;
        return synced;
      }
      return current;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not save draft';
      return drafts.value.find((item) => item.id === draft.id) ?? draft;
    } finally {
      savingRequests.value -= 1;
    }
  }

  async function syncDelete(id: string, token: string): Promise<void> {
    savingRequests.value += 1;
    try {
      await deleteDraft(id, token);
      pendingDeleteIds.value = pendingDeleteIds.value.filter((item) => item !== id);
      persist();
      error.value = null;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not discard draft';
    } finally {
      savingRequests.value -= 1;
    }
  }

  async function loadRemote(nextAccountId: string, token: string, generation: number) {
    loading.value = true;
    try {
      const { data } = await getDrafts(token);
      if (generation !== loadGeneration || loadedAccountId.value !== nextAccountId) return;

      const remoteById = new Map(data.map((draft) => [draft.id, fromServer(draft)]));
      drafts.value.forEach((local) => {
        const remote = remoteById.get(local.id);
        if (local.pendingSync && (!remote || local.revision > remote.revision)) {
          remoteById.set(local.id, local);
        }
      });
      pendingDeleteIds.value.forEach((id) => remoteById.delete(id));
      drafts.value = sorted([...remoteById.values()]);
      persist();

      error.value = null;
      const pendingDrafts = drafts.value.filter((draft) => draft.pendingSync);
      await Promise.allSettled([
        ...pendingDrafts.map((draft) => syncDraft(draft, token)),
        ...pendingDeleteIds.value.map((id) => syncDelete(id, token)),
      ]);
    } catch (cause) {
      if (generation === loadGeneration) {
        error.value = cause instanceof Error ? cause.message : 'Could not load drafts';
      }
    } finally {
      if (generation === loadGeneration) loading.value = false;
    }
  }

  async function refresh(): Promise<void> {
    const nextAccountId = auth.currentUser?.id ?? null;
    const token = auth.token;
    if (!nextAccountId || !token) return;

    if (loadedAccountId.value !== nextAccountId) loadLocal(nextAccountId);
    const generation = ++loadGeneration;
    await loadRemote(nextAccountId, token, generation);
  }

  async function save(input: ComposeDraftInput): Promise<ComposeDraft | null> {
    if (!loadedAccountId.value) return null;

    if (!hasDraftContent(input)) {
      if (activeDraftId.value) await remove(activeDraftId.value);
      return null;
    }

    const existing = drafts.value.find((draft) => draft.id === activeDraftId.value);
    const now = new Date().toISOString();
    const draft: ComposeDraft = {
      ...input,
      mediaAttachments: input.mediaAttachments.map((media) => ({ ...media })),
      pollOptions: [...input.pollOptions],
      id: existing?.id ?? createId(),
      revision: (existing?.revision ?? 0) + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      pendingSync: true,
    };

    pendingDeleteIds.value = pendingDeleteIds.value.filter((id) => id !== draft.id);
    drafts.value = sorted([draft, ...drafts.value.filter((item) => item.id !== draft.id)]);
    activeDraftId.value = draft.id;
    persist();

    return auth.token ? syncDraft(draft, auth.token) : draft;
  }

  async function remove(id: string): Promise<void> {
    drafts.value = drafts.value.filter((draft) => draft.id !== id);
    pendingDeleteIds.value = [...new Set([...pendingDeleteIds.value, id])];
    if (activeDraftId.value === id) activeDraftId.value = null;
    persist();
    if (auth.token) await syncDelete(id, auth.token);
  }

  function select(id: string): ComposeDraft | null {
    const draft = drafts.value.find((item) => item.id === id) ?? null;
    activeDraftId.value = draft?.id ?? null;
    return draft;
  }

  function startFresh() {
    activeDraftId.value = null;
  }

  watch(
    () => auth.currentUser?.id ?? null,
    (nextAccountId) => {
      ++loadGeneration;
      loadLocal(nextAccountId);
    },
    { immediate: true },
  );

  return {
    drafts,
    activeDraftId,
    activeDraft,
    count,
    accountId,
    loading,
    saving,
    error,
    refresh,
    save,
    remove,
    select,
    startFresh,
  };
});
