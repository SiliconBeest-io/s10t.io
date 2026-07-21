import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Instance } from '@/types/mastodon'
import RecommendedTimelineView from '@/views/RecommendedTimelineView.vue'
import LegacyRecommendedTimelineView from '@/legacy/views/RecommendedTimelineView.vue'
import DeckTimelineView from '@/deck/views/DeckTimelineView.vue'
import { useAuthStore } from '@/stores/auth'
import { useInstanceStore } from '@/stores/instance'
import { createTestI18n } from '../helpers'

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
    routes: [
      { path: '/aurora/home', component: { template: '<div />' } },
      { path: '/aurora/recommended', component: { template: '<div />' } },
      { path: '/old/home', component: { template: '<div />' } },
      { path: '/old/recommended', component: { template: '<div />' } },
      { path: '/timelines/:type', name: 'timeline', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  return router
}

describe('dedicated recommendation routes', () => {
  beforeEach(() => {
    const pinia = createPinia()
    setActivePinia(pinia)
    localStorage.clear()
    useAuthStore().setToken('route-token')
  })

  it.each([
    ['Aurora', RecommendedTimelineView, '/aurora/recommended', '/aurora/home'],
    ['Classic', LegacyRecommendedTimelineView, '/old/recommended', '/old/home'],
  ] as const)('redirects disabled %s recommendations to home', async (_name, component, path, fallback) => {
    useInstanceStore().instance = instance(false)
    const router = await testRouter(path)
    mount(component, {
      global: {
        plugins: [createTestI18n(), router],
        stubs: {
          AppShell: { template: '<div><slot /></div>' },
          RecommendedColumn: true,
        },
      },
    })
    await flushPromises()

    expect(router.currentRoute.value.path).toBe(fallback)
  })

  it('renders a separate Deck recommendation column without mounting the home column', async () => {
    useInstanceStore().instance = instance(true)
    const router = await testRouter('/timelines/recommended')
    const wrapper = mount(DeckTimelineView, {
      global: {
        plugins: [createTestI18n(), router],
        stubs: {
          DeckPageShell: { template: '<div><slot /></div>' },
          DeckRecommendedColumn: { template: '<div data-recommended-column />' },
          DeckColumn: { template: '<div data-home-column />' },
        },
      },
    })
    await flushPromises()

    expect(wrapper.find('[data-recommended-column]').exists()).toBe(true)
    expect(wrapper.find('[data-home-column]').exists()).toBe(false)
  })

  it('redirects a disabled Deck recommendation route to the ordinary home timeline', async () => {
    useInstanceStore().instance = instance(false)
    const router = await testRouter('/timelines/recommended')
    mount(DeckTimelineView, {
      global: {
        plugins: [createTestI18n(), router],
        stubs: {
          DeckPageShell: { template: '<div><slot /></div>' },
          DeckRecommendedColumn: true,
          DeckColumn: true,
        },
      },
    })
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/timelines/home')
  })
})
