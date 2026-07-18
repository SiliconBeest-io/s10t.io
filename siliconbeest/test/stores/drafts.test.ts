import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import type { CredentialAccount } from '@/types/mastodon';
import type { ServerComposeDraft } from '@/types/drafts';
import { useAuthStore } from '@/stores/auth';
import { deleteDraft, getDrafts, putDraft } from '@/api/mastodon/drafts';
import {
  hasDraftContent,
  useDraftsStore,
  type ComposeDraftInput,
} from '@/stores/drafts';

vi.mock('@/api/mastodon/drafts', () => ({
  getDrafts: vi.fn(async () => ({ data: [], headers: new Headers() })),
  putDraft: vi.fn(async (id: string, revision: number, draft: ComposeDraftInput) => ({
    data: {
      ...draft,
      id,
      revision,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    headers: new Headers(),
  })),
  deleteDraft: vi.fn(async () => ({ data: {}, headers: new Headers() })),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function input(content = 'A saved thought'): ComposeDraftInput {
  return {
    content,
    objectType: 'Article',
    articleTitle: 'Draft article',
    articleSummary: 'Summary',
    spoilerText: '',
    showContentWarning: false,
    visibility: 'private',
    language: 'ko',
    sensitive: false,
    quotePolicy: 'followers',
    mediaAttachments: [],
    showPoll: true,
    pollOptions: ['Yes', 'No'],
    pollExpiresIn: 3600,
    pollMultiple: false,
    inReplyToId: null,
    inReplyToStatus: null,
    quoteId: null,
    quoteStatus: null,
  };
}

function serverDraft(
  id: string,
  revision: number,
  content = 'A saved thought',
): ServerComposeDraft {
  return {
    ...input(content),
    id,
    revision,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function authenticate(id: string) {
  const auth = useAuthStore();
  auth.currentUser = { id } as CredentialAccount;
}

describe('Drafts store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('persists complete drafts per account and updates the active draft', async () => {
    authenticate('account-1');
    const drafts = useDraftsStore();

    const first = await drafts.save(input());
    expect(first).not.toBeNull();
    expect(drafts.count).toBe(1);
    expect(drafts.activeDraftId).toBe(first?.id);

    await drafts.save({ ...input('Updated body'), articleTitle: 'Updated title' });
    expect(drafts.count).toBe(1);
    expect(drafts.drafts[0]).toMatchObject({
      content: 'Updated body',
      articleTitle: 'Updated title',
      visibility: 'private',
      language: 'ko',
      pollOptions: ['Yes', 'No'],
    });

    setActivePinia(createPinia());
    authenticate('account-1');
    const restored = useDraftsStore();
    expect(restored.drafts[0]).toMatchObject({ content: 'Updated body', articleTitle: 'Updated title' });
  });

  it('does not expose one account drafts to another account', async () => {
    authenticate('account-1');
    await useDraftsStore().save(input());

    setActivePinia(createPinia());
    authenticate('account-2');
    expect(useDraftsStore().drafts).toEqual([]);
  });

  it('removes the active draft when its composition becomes empty', async () => {
    authenticate('account-1');
    const drafts = useDraftsStore();
    await drafts.save(input());

    const empty = input('');
    empty.objectType = 'Note';
    empty.articleTitle = '';
    empty.articleSummary = '';
    empty.showPoll = false;
    empty.pollOptions = [];

    expect(hasDraftContent(empty)).toBe(false);
    expect(await drafts.save(empty)).toBeNull();
    expect(drafts.drafts).toEqual([]);
    expect(drafts.activeDraftId).toBeNull();
  });

  it('loads remote drafts only when a compose session explicitly refreshes them', async () => {
    const auth = useAuthStore();
    auth.setToken('test-token');
    auth.currentUser = { id: 'account-1' } as CredentialAccount;
    const drafts = useDraftsStore();

    expect(getDrafts).not.toHaveBeenCalled();

    await drafts.refresh();

    expect(getDrafts).toHaveBeenCalledOnce();
    expect(getDrafts).toHaveBeenCalledWith('test-token');
  });

  it('fully validates local drafts and drops stored status preview objects', () => {
    const invalid = { ...serverDraft('invalid', 1) } as Record<string, unknown>;
    delete invalid.articleTitle;
    const safe = {
      ...serverDraft('safe', 1),
      quoteId: 'quoted-status',
      quoteStatus: { content: '<img src=x onerror=alert(1)>' },
    };
    localStorage.setItem('siliconbeest_post_drafts:account-1', JSON.stringify({
      drafts: [invalid, safe],
      pendingDeleteIds: [],
    }));

    authenticate('account-1');
    const drafts = useDraftsStore();

    expect(drafts.drafts).toHaveLength(1);
    expect(drafts.drafts[0]).toMatchObject({ id: 'safe', quoteId: 'quoted-status' });
    expect(drafts.drafts[0]?.quoteStatus).toBeNull();
  });

  it('ignores an autosave response after switching accounts', async () => {
    const pending = deferred<{ data: ServerComposeDraft; headers: Headers }>();
    vi.mocked(putDraft).mockReturnValueOnce(pending.promise);
    const auth = useAuthStore();
    auth.setToken('account-1-token');
    auth.currentUser = { id: 'account-1' } as CredentialAccount;
    const drafts = useDraftsStore();

    const savePromise = drafts.save(input());
    const draftId = drafts.activeDraftId!;
    auth.currentUser = { id: 'account-2' } as CredentialAccount;
    await nextTick();

    pending.resolve({ data: serverDraft(draftId, 1), headers: new Headers() });
    await savePromise;

    expect(drafts.accountId).toBe('account-2');
    expect(drafts.drafts).toEqual([]);
  });

  it('does not reinsert a discarded draft when its autosave finishes later', async () => {
    const pending = deferred<{ data: ServerComposeDraft; headers: Headers }>();
    vi.mocked(putDraft).mockReturnValueOnce(pending.promise);
    const auth = useAuthStore();
    auth.setToken('test-token');
    auth.currentUser = { id: 'account-1' } as CredentialAccount;
    const drafts = useDraftsStore();

    const savePromise = drafts.save(input());
    const draftId = drafts.activeDraftId!;
    await drafts.remove(draftId);
    pending.resolve({ data: serverDraft(draftId, 1), headers: new Headers() });
    await savePromise;

    expect(deleteDraft).toHaveBeenCalledWith(draftId, 'test-token');
    expect(drafts.drafts).toEqual([]);
  });

  it('shows merged drafts while pending local changes sync in the background', async () => {
    const auth = useAuthStore();
    auth.clearToken();
    auth.currentUser = { id: 'account-1' } as CredentialAccount;
    const drafts = useDraftsStore();
    await drafts.save(input());

    const pending = deferred<{ data: ServerComposeDraft; headers: Headers }>();
    vi.mocked(putDraft).mockReturnValueOnce(pending.promise);
    auth.setToken('test-token');
    auth.currentUser = { id: 'account-1' } as CredentialAccount;
    await nextTick();
    const refreshPromise = drafts.refresh();

    await vi.waitFor(() => expect(putDraft).toHaveBeenCalled());
    expect(drafts.loading).toBe(false);

    const draft = drafts.drafts[0]!;
    pending.resolve({ data: serverDraft(draft.id, draft.revision), headers: new Headers() });
    await refreshPromise;
  });
});
