import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Instance, Status } from '@/types/mastodon'
import StatusTranslation from '@/components/status/StatusTranslation.vue'
import { useAuthStore } from '@/stores/auth'
import { useInstanceStore } from '@/stores/instance'
import { createTestI18n } from '../helpers'

const apiMocks = vi.hoisted(() => ({
  translateStatus: vi.fn(),
}))

vi.mock('@/api/mastodon/statuses', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/mastodon/statuses')>(),
  translateStatus: apiMocks.translateStatus,
}))

function status(overrides: Partial<Status> = {}): Status {
  return {
    id: 'status-1',
    content: '<p>안녕하세요</p>',
    language: 'ko-KR',
    visibility: 'public',
    sensitive: false,
    spoiler_text: '',
    ...overrides,
  } as Status
}

function enabledInstance(): Instance {
  return {
    configuration: {
      translation: { enabled: true },
      ai: {
        enabled: true,
        recommended_timeline: true,
        image_description: true,
      },
    },
  } as Instance
}

function deferred<T>() {
  const { promise, resolve } = Promise.withResolvers<T>()
  return { promise, resolve }
}

function translationResponse(content: string) {
  return {
    data: {
      content,
      spoiler_text: '',
      detected_source_language: 'ko',
      provider: 'Cloudflare Workers AI',
      model: '@cf/meta/m2m100-1.2b',
    },
    headers: new Headers(),
  }
}

function mountTranslation(
  input = status(),
  i18n = createTestI18n(),
  variant: 'aurora' | 'classic' | 'deck' = 'aurora',
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.setToken('translation-token')
  useInstanceStore().instance = enabledInstance()

  return mount(StatusTranslation, {
    props: { status: input, variant },
    slots: {
      default: '<div data-testid="original-content">안녕하세요</div>',
    },
    global: { plugins: [pinia, i18n] },
  })
}

describe('StatusTranslation', () => {
  beforeEach(() => {
    localStorage.clear()
    document.cookie = 'siliconbeest_token=; Path=/; Max-Age=0'
    vi.clearAllMocks()
  })

  it('requests the current locale and renders AI output as inert text', async () => {
    apiMocks.translateStatus.mockResolvedValue({
      data: {
        content: '<p>Hello world</p><img src=x onerror=alert(1)><script>alert(2)</script>',
        spoiler_text: '',
        detected_source_language: 'ko',
        provider: 'Cloudflare Workers AI',
        model: '@cf/test/translation-model',
      },
      headers: new Headers(),
    })
    const wrapper = mountTranslation()
    expect(wrapper.get('[data-testid="original-content"]').text()).toBe('안녕하세요')

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(apiMocks.translateStatus).toHaveBeenCalledWith(
      'status-1',
      'en',
      'translation-token',
    )
    const translated = wrapper.get('[data-testid="translated-content"]')
    expect(translated.text()).toBe('Hello world')
    expect(translated.classes()).not.toContain('border')
    expect(translated.classes()).not.toContain('rounded-xl')
    expect(translated.classes()).not.toContain('dk-card')
    expect(wrapper.find('[data-testid="original-content"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="translation-disclosure"]').text()).toBe(
      'AI translations may be inaccurate. Model: @cf/test/translation-model',
    )
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('script').exists()).toBe(false)

    await wrapper.get('button').trigger('click')
    expect(wrapper.find('[data-testid="translated-content"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="translation-disclosure"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="original-content"]').text()).toBe('안녕하세요')
    expect(apiMocks.translateStatus).toHaveBeenCalledOnce()
  })

  it.each(['aurora', 'classic', 'deck'] as const)(
    'uses the same lightweight inline action geometry for %s',
    (variant) => {
      const wrapper = mountTranslation(status(), createTestI18n(), variant)
      const classes = wrapper.get('button').classes()

      expect(classes).toEqual(expect.arrayContaining([
        'inline-flex',
        'min-h-5',
        'appearance-none',
        'border-0',
        'bg-transparent',
        'p-0',
        'text-xs',
        'font-medium',
        'leading-5',
        'hover:underline',
        'disabled:cursor-wait',
        'disabled:opacity-60',
      ]))
      expect(classes).not.toContain('rounded-full')
      expect(classes).not.toContain('dk-pill-btn')
      expect(wrapper.get('[data-testid="status-translation"]').classes()).toContain('mt-1.5')
      wrapper.unmount()
    },
  )

  it('keeps the original body in place while translation is loading', async () => {
    const pending = deferred<ReturnType<typeof translationResponse>>()
    apiMocks.translateStatus.mockReturnValueOnce(pending.promise)
    const wrapper = mountTranslation()

    await wrapper.get('button').trigger('click')

    expect(wrapper.get('[data-testid="original-content"]').text()).toBe('안녕하세요')
    expect(wrapper.get('button').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="translated-content"]').exists()).toBe(false)

    pending.resolve(translationResponse('<p>Hello</p>'))
    await flushPromises()
    expect(wrapper.get('[data-testid="translated-content"]').text()).toBe('Hello')
  })

  it('stays hidden when the feature is disabled or the source language matches', async () => {
    const disabled = mountTranslation()
    useInstanceStore().instance = {
      ...enabledInstance(),
      configuration: {
        ...enabledInstance().configuration,
        translation: { enabled: false },
      },
    }
    await disabled.vm.$nextTick()
    expect(disabled.find('[data-testid="status-translation"]').exists()).toBe(false)

    disabled.unmount()
    const sameLanguage = mountTranslation(status({ language: 'en-US' }))
    expect(sameLanguage.find('[data-testid="status-translation"]').exists()).toBe(false)
  })

  it('stays hidden for unsupported visibility, unknown language, and concealed content', () => {
    const privateStatus = mountTranslation(status({ visibility: 'private' }))
    expect(privateStatus.find('[data-testid="status-translation"]').exists()).toBe(false)
    privateStatus.unmount()

    const unknownLanguage = mountTranslation(status({ language: null }))
    expect(unknownLanguage.find('[data-testid="status-translation"]').exists()).toBe(false)
    unknownLanguage.unmount()

    const contentWarning = mountTranslation(status({ spoiler_text: 'CW' }))
    expect(contentWarning.find('[data-testid="status-translation"]').exists()).toBe(false)
    contentWarning.unmount()

    const sensitive = mountTranslation(status({ sensitive: true }))
    expect(sensitive.find('[data-testid="status-translation"]').exists()).toBe(false)
  })

  it.each([
    ['status id', { id: 'status-2' }],
    ['content', { content: '<p>수정된 본문</p>' }],
    ['edit version', { edited_at: '2026-07-19T12:00:00.000Z' }],
  ])('discards a stale response after the %s changes', async (_label, changes) => {
    const pending = deferred<ReturnType<typeof translationResponse>>()
    apiMocks.translateStatus.mockReturnValueOnce(pending.promise)
    const wrapper = mountTranslation()

    await wrapper.get('button').trigger('click')
    await wrapper.setProps({ status: status(changes) })

    pending.resolve(translationResponse('<p>stale translation</p>'))
    await flushPromises()

    expect(wrapper.find('[data-testid="translated-content"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('stale translation')

    apiMocks.translateStatus.mockResolvedValueOnce(translationResponse('<p>fresh translation</p>'))
    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="translated-content"]').text()).toBe('fresh translation')
  })

  it('discards a stale response after the target locale changes', async () => {
    const pending = deferred<ReturnType<typeof translationResponse>>()
    apiMocks.translateStatus.mockReturnValueOnce(pending.promise)
    const i18n = createTestI18n()
    const wrapper = mountTranslation(status(), i18n)

    await wrapper.get('button').trigger('click')
    ;(i18n.global.locale as { value: string }).value = 'ja'
    await wrapper.vm.$nextTick()

    pending.resolve(translationResponse('<p>stale translation</p>'))
    await flushPromises()

    expect(wrapper.find('[data-testid="translated-content"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('stale translation')

    apiMocks.translateStatus.mockResolvedValueOnce(translationResponse('<p>fresh translation</p>'))
    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(apiMocks.translateStatus).toHaveBeenLastCalledWith(
      'status-1',
      'ja',
      'translation-token',
    )
    expect(wrapper.get('[data-testid="translated-content"]').text()).toBe('fresh translation')
  })
})
