import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import StatusContent from '@/legacy/components/status/StatusContent.vue'
import { createTestI18n } from '../helpers'

describe('Classic StatusContent sensitive disclosure', () => {
  it('hides a sensitive body without a content warning until the reader reveals it', async () => {
    const wrapper = mount(StatusContent, {
      props: {
        content: '<p>Classic sensitive body</p>',
        sensitive: true,
      },
      global: { plugins: [createTestI18n()] },
    })

    expect(wrapper.text()).toContain('Sensitive content')
    expect(wrapper.find('.prose').exists()).toBe(false)

    await wrapper.get('button').trigger('click')

    expect(wrapper.find('.prose').exists()).toBe(true)
    expect(wrapper.html()).toContain('Classic sensitive body')
  })

  it('continues to render a non-sensitive body immediately', () => {
    const wrapper = mount(StatusContent, {
      props: {
        content: '<p>Classic public body</p>',
        sensitive: false,
      },
      global: { plugins: [createTestI18n()] },
    })

    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.find('.prose').exists()).toBe(true)
    expect(wrapper.html()).toContain('Classic public body')
  })
})
