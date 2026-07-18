import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { CredentialAccount } from '@/types/mastodon';
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

describe('StatusComposer drafts', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    useAuthStore().currentUser = { id: 'account-1' } as CredentialAccount;
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

    expect(useDraftsStore().count).toBe(1);
    expect(firstComposer.get('[data-testid="save-draft-button"]').text()).toContain('Saved');
    firstComposer.unmount();

    const secondComposer = mount(StatusComposer, options);
    await secondComposer.get('[data-testid="draft-menu-button"]').trigger('click');
    const savedDraft = secondComposer.findAll('button').find((button) =>
      button.text().includes('This should survive closing the composer.'),
    );
    expect(savedDraft).toBeDefined();

    await savedDraft!.trigger('click');
    expect(secondComposer.get<HTMLTextAreaElement>('textarea[placeholder="What\'s on your mind?"]').element.value)
      .toBe('This should survive closing the composer.');
    secondComposer.unmount();
  });

  it('includes the selected draft id when publishing', async () => {
    const options = { global: { plugins: [createTestI18n()] } };
    const wrapper = mount(StatusComposer, options);
    await wrapper.get<HTMLTextAreaElement>('textarea[placeholder="What\'s on your mind?"]').setValue('Publish me');
    await wrapper.get('[data-testid="save-draft-button"]').trigger('click');
    const draftId = useDraftsStore().activeDraftId;

    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      content: 'Publish me',
      draft_id: draftId,
    });
    wrapper.unmount();
  });
});
