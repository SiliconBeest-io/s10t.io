import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { CredentialAccount } from '@/types/mastodon';
import { getDrafts } from '@/api/mastodon/drafts';
import StatusComposer from '@/components/status/StatusComposer.vue';
import { useAuthStore } from '@/stores/auth';
import { useDraftsStore } from '@/stores/drafts';
import { createTestI18n } from '../helpers';

vi.mock('@/composables/useEmojis', () => ({
  useEmojis: () => ({
    fetchCustomEmojis: vi.fn(),
    searchEmojis: vi.fn(() => []),
  }),
}));

vi.mock('@/api/mastodon/search', () => ({
  search: vi.fn(),
}));

vi.mock('@/api/mastodon/drafts', () => ({
  getDrafts: vi.fn(async () => ({ data: [], headers: new Headers() })),
  putDraft: vi.fn(),
  deleteDraft: vi.fn(),
}));

describe('StatusComposer drafts', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    useAuthStore().currentUser = { id: 'account-1' } as CredentialAccount;
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('autosaves after typing stops and restores the draft from the menu', async () => {
    const options = { global: { plugins: [createTestI18n()] } };
    const firstComposer = mount(StatusComposer, options);
    const body = firstComposer.get<HTMLTextAreaElement>('textarea[placeholder="What\'s on your mind?"]');

    await body.setValue('This should survive closing the composer.');
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();

    expect(useDraftsStore().count).toBe(1);
    expect(firstComposer.get('[data-testid="save-draft-button"]').text()).toContain('Saved');
    firstComposer.unmount();

    const secondComposer = mount(StatusComposer, options);
    await secondComposer.get('[data-testid="draft-menu-button"]').trigger('click');
    await flushPromises();
    const modal = document.querySelector('[data-testid="drafts-modal"]');
    expect(modal).not.toBeNull();
    expect(modal?.textContent?.match(/This should survive closing the composer\./g)).toHaveLength(1);
    const savedDraft = Array.from(modal?.querySelectorAll('button') ?? []).find((button) =>
      button.textContent?.includes('This should survive closing the composer.'),
    ) as HTMLButtonElement | undefined;
    expect(savedDraft).toBeDefined();

    savedDraft?.click();
    await flushPromises();
    expect(secondComposer.get<HTMLTextAreaElement>('textarea[placeholder="What\'s on your mind?"]').element.value)
      .toBe('This should survive closing the composer.');
    secondComposer.unmount();
  });

  it('includes the selected draft id when publishing', async () => {
    const options = { global: { plugins: [createTestI18n()] } };
    const wrapper = mount(StatusComposer, options);
    await wrapper.get<HTMLTextAreaElement>('textarea[placeholder="What\'s on your mind?"]').setValue('Publish me');
    await wrapper.get('[data-testid="save-draft-button"]').trigger('click');
    await flushPromises();
    const draftId = useDraftsStore().activeDraftId;

    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      content: 'Publish me',
      draft_id: draftId,
    });
    wrapper.unmount();
  });

  it('requests server drafts when the compose view is entered', async () => {
    const auth = useAuthStore();
    auth.setToken('test-token');
    auth.currentUser = { id: 'account-1' } as CredentialAccount;

    const wrapper = mount(StatusComposer, { global: { plugins: [createTestI18n()] } });
    await flushPromises();

    expect(getDrafts).toHaveBeenCalledOnce();
    expect(getDrafts).toHaveBeenCalledWith('test-token');
    wrapper.unmount();
  });
});
