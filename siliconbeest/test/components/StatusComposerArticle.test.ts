import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StatusComposer from '@/components/status/StatusComposer.vue';
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

describe('StatusComposer Article selector', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
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
});
