import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Status } from '@/types/mastodon'
import StatusComposer from '@/components/status/StatusComposer.vue'
import { useComposeStore } from '@/stores/compose'
import { createTestI18n } from '../helpers'

vi.mock('@/composables/useEmojis', () => ({
  useEmojis: () => ({
    fetchCustomEmojis: vi.fn(),
    searchEmojis: vi.fn(() => []),
  }),
}))

vi.mock('@/api/mastodon/search', () => ({
  search: vi.fn(),
}))

function editableArticle(): Status {
  return {
    id: 'article-1',
    object_type: 'Article',
    title: 'Original title',
    article_summary: 'Original summary',
    text: 'Original body',
    content: '<p>Original body</p>',
    spoiler_text: '',
    sensitive: false,
    visibility: 'private',
    language: 'ko',
    quote_policy: 'followers',
    media_attachments: [],
  } as Status
}

describe('StatusComposer edit mode', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('loads the existing content, locks post settings, and labels the action Edit', async () => {
    const compose = useComposeStore()
    compose.setEditing(editableArticle())

    const wrapper = mount(StatusComposer, {
      global: { plugins: [createTestI18n()] },
    })

    expect(wrapper.get<HTMLInputElement>('input[placeholder="Article title"]').element.value).toBe('Original title')
    expect(wrapper.get<HTMLTextAreaElement>('textarea[placeholder="Article summary (optional)"]').element.value).toBe('Original summary')
    expect(wrapper.get<HTMLTextAreaElement>('textarea[placeholder="Write the long-form body in Markdown..."]').element.value).toBe('Original body')
    expect(wrapper.get<HTMLButtonElement>('[data-testid="compose-type-note"]').element.disabled).toBe(true)
    expect(wrapper.get<HTMLButtonElement>('[data-testid="compose-type-article"]').element.disabled).toBe(true)
    expect(wrapper.findAll('button[disabled]').length).toBeGreaterThanOrEqual(3)
    expect(wrapper.get('button[type="submit"]').text()).toContain('Edit')

    await wrapper.get<HTMLTextAreaElement>('textarea[placeholder="Write the long-form body in Markdown..."]').setValue('Updated body')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      content: 'Updated body',
      object_type: 'Article',
      title: 'Original title',
      summary: 'Original summary',
      visibility: 'private',
      language: 'ko',
      quote_policy: 'followers',
    })
  })

  it('keeps all rendered text as a fallback when raw source text is unavailable', () => {
    const compose = useComposeStore()
    compose.setEditing({
      ...editableArticle(),
      object_type: 'Note',
      title: '',
      article_summary: '',
      text: null,
      content: '<p>First &amp; second<br>Next line</p><p>Final paragraph</p>',
      spoiler_text: 'Existing CW',
    })

    expect(compose.text).toBe('First & second\nNext line\n\nFinal paragraph')
    expect(compose.contentWarning).toBe('Existing CW')
  })
})
