import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import type {
  MediaAttachment,
  QuotePolicy,
  Status,
  StatusVisibility,
} from '@/types/mastodon';
import { useAuthStore } from './auth';

const STORAGE_PREFIX = 'siliconbeest_post_drafts';
const MAX_DRAFTS = 50;

export interface ComposeDraftInput {
  content: string;
  objectType: 'Note' | 'Article';
  articleTitle: string;
  articleSummary: string;
  spoilerText: string;
  showContentWarning: boolean;
  visibility: StatusVisibility;
  language: string;
  sensitive: boolean;
  quotePolicy: QuotePolicy;
  mediaAttachments: MediaAttachment[];
  showPoll: boolean;
  pollOptions: string[];
  pollExpiresIn: number;
  pollMultiple: boolean;
  inReplyToId: string | null;
  inReplyToStatus: Status | null;
  quoteId: string | null;
  quoteStatus: Status | null;
}

export interface ComposeDraft extends ComposeDraftInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

function storageKey(accountId: string): string {
  return `${STORAGE_PREFIX}:${accountId}`;
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isDraft(value: unknown): value is ComposeDraft {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ComposeDraft>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.content === 'string' &&
    (candidate.objectType === 'Note' || candidate.objectType === 'Article') &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
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
  const activeDraftId = ref<string | null>(null);
  const loadedAccountId = ref<string | null>(null);

  const count = computed(() => drafts.value.length);
  const accountId = computed(() => loadedAccountId.value);
  const activeDraft = computed(
    () => drafts.value.find((draft) => draft.id === activeDraftId.value) ?? null,
  );

  function load(accountId: string | null) {
    loadedAccountId.value = accountId;
    activeDraftId.value = null;

    if (!accountId || typeof localStorage === 'undefined') {
      drafts.value = [];
      return;
    }

    try {
      const stored = JSON.parse(localStorage.getItem(storageKey(accountId)) ?? '[]') as unknown;
      drafts.value = Array.isArray(stored)
        ? stored.filter(isDraft).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_DRAFTS)
        : [];
    } catch {
      drafts.value = [];
    }
  }

  function persist() {
    if (!loadedAccountId.value || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(storageKey(loadedAccountId.value), JSON.stringify(drafts.value));
    } catch {
      // A full or unavailable browser storage area must not interrupt composing.
    }
  }

  function save(input: ComposeDraftInput): ComposeDraft | null {
    if (!loadedAccountId.value) return null;

    if (!hasDraftContent(input)) {
      if (activeDraftId.value) remove(activeDraftId.value);
      return null;
    }

    const existing = drafts.value.find((draft) => draft.id === activeDraftId.value);
    const now = new Date().toISOString();
    const draft: ComposeDraft = {
      ...input,
      mediaAttachments: input.mediaAttachments.map((media) => ({ ...media })),
      pollOptions: [...input.pollOptions],
      id: existing?.id ?? createId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    drafts.value = [
      draft,
      ...drafts.value.filter((item) => item.id !== draft.id),
    ].slice(0, MAX_DRAFTS);
    activeDraftId.value = draft.id;
    persist();
    return draft;
  }

  function remove(id: string) {
    drafts.value = drafts.value.filter((draft) => draft.id !== id);
    if (activeDraftId.value === id) activeDraftId.value = null;
    persist();
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
    (accountId) => load(accountId),
    { immediate: true },
  );

  return {
    drafts,
    activeDraftId,
    activeDraft,
    count,
    accountId,
    save,
    remove,
    select,
    startFresh,
  };
});
