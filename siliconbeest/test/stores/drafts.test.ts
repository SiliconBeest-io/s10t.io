import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { CredentialAccount } from '@/types/mastodon';
import { useAuthStore } from '@/stores/auth';
import {
  hasDraftContent,
  useDraftsStore,
  type ComposeDraftInput,
} from '@/stores/drafts';

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

function authenticate(id: string) {
  const auth = useAuthStore();
  auth.currentUser = { id } as CredentialAccount;
}

describe('Drafts store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('persists complete drafts per account and updates the active draft', () => {
    authenticate('account-1');
    const drafts = useDraftsStore();

    const first = drafts.save(input());
    expect(first).not.toBeNull();
    expect(drafts.count).toBe(1);
    expect(drafts.activeDraftId).toBe(first?.id);

    drafts.save({ ...input('Updated body'), articleTitle: 'Updated title' });
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

  it('does not expose one account drafts to another account', () => {
    authenticate('account-1');
    useDraftsStore().save(input());

    setActivePinia(createPinia());
    authenticate('account-2');
    expect(useDraftsStore().drafts).toEqual([]);
  });

  it('removes the active draft when its composition becomes empty', () => {
    authenticate('account-1');
    const drafts = useDraftsStore();
    drafts.save(input());

    const empty = input('');
    empty.objectType = 'Note';
    empty.articleTitle = '';
    empty.articleSummary = '';
    empty.showPoll = false;
    empty.pollOptions = [];

    expect(hasDraftContent(empty)).toBe(false);
    expect(drafts.save(empty)).toBeNull();
    expect(drafts.drafts).toEqual([]);
    expect(drafts.activeDraftId).toBeNull();
  });
});
