import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Component } from 'vue'
import type { Instance } from '@/types/mastodon'
import Sidebar from '@/components/layout/Sidebar.vue'
import MobileNav from '@/components/layout/MobileNav.vue'
import LegacySidebar from '@/legacy/components/layout/Sidebar.vue'
import LegacyMobileNav from '@/legacy/components/layout/MobileNav.vue'
import { useAuthStore } from '@/stores/auth'
import { useInstanceStore } from '@/stores/instance'
import { createTestI18n } from '../helpers'

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return {
    ...actual,
    apiFetch: vi.fn().mockResolvedValue({ data: [], headers: new Headers() }),
  }
})

const variants: Array<{
  name: string
  prefix: '/aurora' | '/old'
  sidebar: Component
  mobileNav: Component
}> = [
  { name: 'Aurora', prefix: '/aurora', sidebar: Sidebar, mobileNav: MobileNav },
  { name: 'Classic', prefix: '/old', sidebar: LegacySidebar, mobileNav: LegacyMobileNav },
]

function instance(enabled: boolean): Instance {
  return {
    configuration: {
      ai: { enabled: true, recommended_timeline: enabled, image_description: false },
    },
  } as Instance
}

async function testRouter(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push(path)
  await router.isReady()
  return router
}

describe.each(variants)('$name recommendation navigation', ({ prefix, sidebar, mobileNav }) => {
  beforeEach(() => {
    const pinia = createPinia()
    setActivePinia(pinia)
    localStorage.clear()
    document.cookie = 'siliconbeest_token=; Path=/; Max-Age=0'
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('exposes a dedicated desktop route and reacts when the feature is disabled', async () => {
    useAuthStore().setToken('navigation-token')
    const instanceStore = useInstanceStore()
    instanceStore.instance = instance(true)
    const router = await testRouter(`${prefix}/home`)
    const wrapper = mount(sidebar, {
      global: {
        plugins: [createTestI18n(), router],
        stubs: { Avatar: true },
      },
    })
    await flushPromises()

    expect(wrapper.get('[data-recommended-nav]').attributes('href'))
      .toBe(`${prefix}/recommended`)

    const aiConfiguration = instanceStore.instance.configuration.ai
    expect(aiConfiguration).toBeDefined()
    if (aiConfiguration) aiConfiguration.recommended_timeline = false
    await flushPromises()

    expect(wrapper.find('[data-recommended-nav]').exists()).toBe(false)
  })

  it('opens the same dedicated route from the mobile More menu', async () => {
    useAuthStore().setToken('navigation-token')
    useInstanceStore().instance = instance(true)
    const router = await testRouter(`${prefix}/home`)
    const wrapper = mount(mobileNav, {
      attachTo: document.body,
      global: { plugins: [createTestI18n(), router] },
    })

    await wrapper.get('button[aria-label="More"]').trigger('click')
    const link = document.body.querySelector<HTMLElement>('[data-recommended-nav]')
    expect(link).not.toBeNull()
    link?.click()
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe(`${prefix}/recommended`)
  })

  it('does not expose desktop or mobile recommendation entries when disabled', async () => {
    useAuthStore().setToken('navigation-token')
    useInstanceStore().instance = instance(false)
    const router = await testRouter(`${prefix}/home`)
    const desktop = mount(sidebar, {
      global: {
        plugins: [createTestI18n(), router],
        stubs: { Avatar: true },
      },
    })
    expect(desktop.find('[data-recommended-nav]').exists()).toBe(false)
    desktop.unmount()

    const mobile = mount(mobileNav, {
      attachTo: document.body,
      global: { plugins: [createTestI18n(), router] },
    })
    await mobile.get('button[aria-label="More"]').trigger('click')

    expect(document.body.querySelector('[data-recommended-nav]')).toBeNull()
  })
})
