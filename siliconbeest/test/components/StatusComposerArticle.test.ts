import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StatusComposer from '@/components/status/StatusComposer.vue';
import { uploadMedia } from '@/api/mastodon/media';
import { useAuthStore } from '@/stores/auth';
import { useComposeStore } from '@/stores/compose';
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

vi.mock('@/api/mastodon/media', () => ({
  uploadMedia: vi.fn(),
}));

describe('StatusComposer Article selector', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.mocked(uploadMedia).mockReset();
  });

  it('shows an explicit post type selector and reveals Article fields', async () => {
    const wrapper = mount(StatusComposer, {
      global: { plugins: [createTestI18n()] },
    });

    const noteButton = wrapper.get('[data-testid="compose-type-note"]');
    const articleButton = wrapper.get('[data-testid="compose-type-article"]');

    expect(noteButton.attributes('aria-checked')).toBe('true');
    expect(articleButton.text()).toContain('Long-form Article');

    await articleButton.trigger('click');

    expect(articleButton.attributes('aria-checked')).toBe('true');
    expect(wrapper.get('input[placeholder="Article title"]').exists()).toBe(true);
    expect(wrapper.get('textarea[placeholder="Article summary (optional)"]').exists()).toBe(true);
    expect(wrapper.get('textarea[placeholder="Write the long-form body in Markdown..."]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Markdown headings');
  });

  it('inserts uploaded Article images into the body as Markdown', async () => {
    const auth = useAuthStore();
    auth.setToken('test-token');
    vi.mocked(uploadMedia).mockResolvedValue({
      data: {
        id: 'media-1',
        type: 'image',
        url: 'https://cdn.example/article-image.png',
        preview_url: null,
        remote_url: null,
        meta: null,
        description: null,
        blurhash: null,
      },
      headers: new Headers(),
    });

    const wrapper = mount(StatusComposer, {
      global: { plugins: [createTestI18n()] },
    });
    await wrapper.get('[data-testid="compose-type-article"]').trigger('click');

    const input = wrapper.get<HTMLInputElement>('input[type="file"]');
    const file = new File(['image'], 'diagram.png', { type: 'image/png' });
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
    await input.trigger('change');
    await flushPromises();

    const body = wrapper.get<HTMLTextAreaElement>('textarea[placeholder="Write the long-form body in Markdown..."]');
    expect(body.element.value).toBe('![diagram](https://cdn.example/article-image.png)');
    expect(useComposeStore().mediaAttachments).toEqual([]);
  });
});
