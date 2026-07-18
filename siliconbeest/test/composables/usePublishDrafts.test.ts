import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { CredentialAccount, Status } from '@/types/mastodon';
import { createStatus } from '@/api/mastodon/statuses';
import { usePublish } from '@/composables/usePublish';
import { useAuthStore } from '@/stores/auth';
import { useDraftsStore, type ComposeDraftInput } from '@/stores/drafts';

vi.mock('@/api/mastodon/statuses', () => ({
  createStatus: vi.fn(),
  editStatus: vi.fn(),
  getStatusSource: vi.fn(),
}));

vi.mock('@/utils/newPostSound', () => ({
  playComposeSound: vi.fn(),
}));

function draftInput(): ComposeDraftInput {
  return {
    content: 'Publish this draft',
    objectType: 'Note',
    articleTitle: '',
    articleSummary: '',
    spoilerText: '',
    showContentWarning: false,
    visibility: 'public',
    language: 'en',
    sensitive: false,
    quotePolicy: 'public',
    mediaAttachments: [],
    showPoll: false,
    pollOptions: [],
    pollExpiresIn: 86400,
    pollMultiple: false,
    inReplyToId: null,
    inReplyToStatus: null,
    quoteId: null,
    quoteStatus: null,
  };
}

describe('Publishing drafts', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.mocked(createStatus).mockReset();
    const auth = useAuthStore();
    auth.setToken('test-token');
    auth.currentUser = { id: 'account-1' } as CredentialAccount;
  });

  it('discards the selected draft only after a successful publish', async () => {
    const drafts = useDraftsStore();
    const draft = drafts.save(draftInput());
    vi.mocked(createStatus).mockResolvedValue({
      data: {
        id: 'published-1',
        visibility: 'public',
        object_type: 'Note',
      } as Status,
      headers: new Headers(),
    });

    await usePublish().publish({
      content: 'Publish this draft',
      draft_id: draft!.id,
    });

    expect(drafts.drafts).toEqual([]);
  });

  it('keeps the draft when publishing fails', async () => {
    const drafts = useDraftsStore();
    const draft = drafts.save(draftInput());
    vi.mocked(createStatus).mockRejectedValue(new Error('network failed'));

    await expect(usePublish().publish({
      content: 'Publish this draft',
      draft_id: draft!.id,
    })).rejects.toThrow('network failed');

    expect(drafts.drafts).toHaveLength(1);
  });
});
