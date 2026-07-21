import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Status } from '@/types/mastodon'
import DeckStatusDetailView from '@/deck/views/StatusDetailView.vue'
import { useAuthStore } from '@/stores/auth'
import { createTestI18n } from '../helpers'

const apiMocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  getStatusContext: vi.fn(),
}))

vi.mock('@/api/mastodon/statuses', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/mastodon/statuses')>(),
  getStatus: apiMocks.getStatus,
  getStatusContext: apiMocks.getStatusContext,
}))

function status(): Status {
  return {
    id: 'status-detail-1',
    content: '<p>본문</p>',
    object_type: 'Note',
    title: '',
    account: {
      id: 'author-1',
      username: 'author',
      acct: 'author',
      display_name: 'Author',
    },
  } as Status
}

describe('Deck status detail', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    apiMocks.getStatus.mockResolvedValue({ data: status() })
    apiMocks.getStatusContext.mockResolvedValue({
      data: { ancestors: [], descendants: [] },
    })
  })

  it('uses the same DeckStatusCard implementation as Deck timeline columns', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore().setToken('deck-detail-token')
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:acct/:statusId', component: { template: '<div />' } }],
    })
    await router.push('/author/status-detail-1')
    await router.isReady()

    const wrapper = mount(DeckStatusDetailView, {
      global: {
        plugins: [pinia, router, createTestI18n()],
        stubs: {
          DeckPageShell: { template: '<main><slot /></main>' },
          DeckStatusCard: {
            props: {
              status: { type: Object, required: true },
              expanded: { type: Boolean, default: false },
            },
            template: '<article data-testid="deck-status-card" :data-expanded="expanded ? `true` : `false`" />',
          },
          LoadingSpinner: true,
        },
      },
    })
    await flushPromises()

    const card = wrapper.get('[data-testid="deck-status-card"]')
    expect(card.attributes('data-expanded')).toBe('true')
    expect(wrapper.find('status-card-stub').exists()).toBe(false)
  })
})
