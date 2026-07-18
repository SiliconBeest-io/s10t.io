import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import StatusContent from '@/components/status/StatusContent.vue';
import { createTestI18n } from '../helpers';

describe('StatusContent sensitive disclosure', () => {
  it('hides a sensitive Article body until the reader reveals it', async () => {
    const wrapper = mount(StatusContent, {
      props: {
        content: '<p>Sensitive Article body</p>',
        sensitive: true,
      },
      global: { plugins: [createTestI18n()] },
    });

    expect(wrapper.text()).toContain('Sensitive content');
    expect(wrapper.find('.prose').exists()).toBe(false);

    await wrapper.get('button').trigger('click');

    expect(wrapper.find('.prose').exists()).toBe(true);
    expect(wrapper.html()).toContain('Sensitive Article body');
  });
});
