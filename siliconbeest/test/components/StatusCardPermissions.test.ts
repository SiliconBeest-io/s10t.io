import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import type { CredentialAccount, Status } from '@/types/mastodon'
import { useAuthStore } from '@/stores/auth'
import { useStatusesStore } from '@/stores/statuses'
import { useTimelinesStore } from '@/stores/timelines'
import { createTestI18n } from '../helpers'
import StatusCard from '@/components/status/StatusCard.vue'
import DeckStatusCard from '@/deck/components/DeckStatusCard.vue'
import LegacyStatusCard from '@/legacy/components/status/StatusCard.vue'

const statusApiMocks = vi.hoisted(() => ({
  deleteStatus: vi.fn(),
}))
const accountApiMocks = vi.hoisted(() => ({
  blockAccount: vi.fn(),
  muteAccount: vi.fn(),
}))

vi.mock('@/api/mastodon/statuses', () => ({
  favouriteStatus: vi.fn(),
  unfavouriteStatus: vi.fn(),
  reblogStatus: vi.fn(),
  unreblogStatus: vi.fn(),
  bookmarkStatus: vi.fn(),
  unbookmarkStatus: vi.fn(),
  editStatus: vi.fn(),
  deleteStatus: statusApiMocks.deleteStatus,
}))

vi.mock('@/api/mastodon/accounts', () => ({
  getAccount: vi.fn(),
  getRelationships: vi.fn(),
  blockAccount: accountApiMocks.blockAccount,
  muteAccount: accountApiMocks.muteAccount,
}))

function makeStatus(id: string, accountId: string, reblog: Status | null = null): Status {
  return {
    id,
    uri: `https://example.test/statuses/${id}`,
    created_at: '2026-01-01T00:00:00Z',
    account: {
      id: accountId,
      username: accountId,
      acct: accountId,
      display_name: accountId,
      locked: false,
      bot: false,
      discoverable: true,
      group: false,
      created_at: '2026-01-01T00:00:00Z',
      note: '',
      url: `https://example.test/@${accountId}`,
      uri: `https://example.test/users/${accountId}`,
      avatar: '',
      avatar_static: '',
      header: '',
      header_static: '',
      followers_count: 0,
      following_count: 0,
      statuses_count: 0,
      last_status_at: null,
      emojis: [],
      fields: [],
    },
    content: reblog ? '' : '<p>original</p>',
    visibility: 'public',
    sensitive: false,
    spoiler_text: '',
    media_attachments: [],
    application: null,
    mentions: [],
    tags: [],
    emojis: [],
    reblogs_count: 0,
    favourites_count: 0,
    replies_count: 0,
    url: `https://example.test/@${accountId}/${id}`,
    in_reply_to_id: null,
    in_reply_to_account_id: null,
    reblog,
    poll: null,
    card: null,
    language: null,
    text: null,
    edited_at: null,
    quote_policy_allows: true,
  }
}

const ActionStub = defineComponent({
  props: {
    statusId: { type: String, required: true },
    accountCanAct: Boolean,
    isOwnStatus: Boolean,
    accountId: String,
  },
  emits: ['delete', 'block', 'mute'],
  template: `
    <div>
      <button data-test="delete-status" @click="$emit('delete', statusId)">{{ statusId }}</button>
      <button data-test="block-account" @click="$emit('block', accountId)">block</button>
      <button data-test="mute-account" @click="$emit('mute', accountId)">mute</button>
    </div>
  `,
})

interface CardVariant {
  name: string
  component: Component
  actionStub: 'StatusActions' | 'DeckStatusActions'
}

const variants: CardVariant[] = [
  { name: 'Aurora', component: StatusCard, actionStub: 'StatusActions' },
  { name: 'Deck', component: DeckStatusCard, actionStub: 'DeckStatusActions' },
  { name: 'legacy', component: LegacyStatusCard, actionStub: 'StatusActions' },
]

describe.each(variants)('$name status card permissions', ({ component, actionStub }) => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  it('targets the displayed original and removes its rendered wrapper after delete', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const auth = useAuthStore()
    auth.token = 'token'
    auth.currentUser = {
      id: 'owner',
      suspended: false,
      memorial: false,
    } as CredentialAccount

    const original = makeStatus('original', 'owner')
    const wrapperStatus = makeStatus('wrapper', 'booster', original)
    const statuses = useStatusesStore()
    statuses.cacheStatus(wrapperStatus)
    const timelines = useTimelinesStore()
    timelines.getTimeline('home').statusIds = ['wrapper', 'original', 'other']
    statusApiMocks.deleteStatus.mockResolvedValue({ data: original })

    const wrapper = mount(component, {
      props: { status: wrapperStatus },
      global: {
        plugins: [pinia, router, createTestI18n()],
        stubs: {
          [actionStub]: ActionStub,
          Avatar: true,
          StatusContent: true,
          MediaGallery: true,
          PreviewCard: true,
          StatusPoll: true,
          StatusReactions: true,
          DeckStatusReactions: true,
          ReportDialog: true,
          ImageViewer: true,
          Teleport: true,
        },
      },
    })

    const deleteButton = wrapper.get('[data-test="delete-status"]')
    expect(deleteButton.text()).toBe('original')
    await deleteButton.trigger('click')
    await vi.waitFor(() => expect(statusApiMocks.deleteStatus).toHaveBeenCalledWith('original', 'token'))

    expect(wrapper.emitted('deleted')?.[0]).toEqual(['original'])
    expect(timelines.getTimeline('home').statusIds).toEqual(['other'])
    expect(statuses.getCached('original')).toBeUndefined()
    expect(statuses.getCached('wrapper')).toBeUndefined()
  })

  it('wires block and mute to the displayed author and removes hidden cards', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const auth = useAuthStore()
    auth.token = 'token'
    auth.currentUser = {
      id: 'viewer',
      suspended: false,
      memorial: false,
    } as CredentialAccount

    const hiddenOriginal = makeStatus('original', 'hidden')
    const wrapperStatus = makeStatus('wrapper', 'booster', hiddenOriginal)
    const statuses = useStatusesStore()
    statuses.cacheStatus(wrapperStatus)
    const timelines = useTimelinesStore()
    timelines.getTimeline('home').statusIds = ['wrapper', 'original', 'other']
    accountApiMocks.blockAccount.mockResolvedValue({ data: { id: 'hidden', blocking: true } })
    accountApiMocks.muteAccount.mockResolvedValue({ data: { id: 'hidden', muting: true } })

    const wrapper = mount(component, {
      props: { status: wrapperStatus },
      global: {
        plugins: [pinia, router, createTestI18n()],
        stubs: {
          [actionStub]: ActionStub,
          Avatar: true,
          StatusContent: true,
          MediaGallery: true,
          PreviewCard: true,
          StatusPoll: true,
          StatusReactions: true,
          DeckStatusReactions: true,
          ReportDialog: true,
          ImageViewer: true,
          Teleport: true,
        },
      },
    })

    await wrapper.get('[data-test="block-account"]').trigger('click')
    await vi.waitFor(() => expect(accountApiMocks.blockAccount).toHaveBeenCalledWith('hidden', 'token'))
    expect(timelines.getTimeline('home').statusIds).toEqual(['other'])

    timelines.getTimeline('home').statusIds = ['wrapper', 'original', 'other']
    await wrapper.get('[data-test="mute-account"]').trigger('click')
    await vi.waitFor(() => expect(accountApiMocks.muteAccount).toHaveBeenCalledWith('hidden', 'token'))
    expect(timelines.getTimeline('home').statusIds).toEqual(['other'])
  })

  it('does not delete a non-owned status even if a child emits delete', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const auth = useAuthStore()
    auth.token = 'token'
    auth.currentUser = {
      id: 'viewer',
      suspended: false,
      memorial: false,
    } as CredentialAccount
    const foreignStatus = makeStatus('foreign', 'other')

    const wrapper = mount(component, {
      props: { status: foreignStatus },
      global: {
        plugins: [pinia, router, createTestI18n()],
        stubs: {
          [actionStub]: ActionStub,
          Avatar: true,
          StatusContent: true,
          MediaGallery: true,
          PreviewCard: true,
          StatusPoll: true,
          StatusReactions: true,
          DeckStatusReactions: true,
          ReportDialog: true,
          ImageViewer: true,
          Teleport: true,
        },
      },
    })

    await wrapper.get('[data-test="delete-status"]').trigger('click')

    expect(statusApiMocks.deleteStatus).not.toHaveBeenCalled()
    expect(wrapper.emitted('deleted')).toBeUndefined()
    expect(confirm).not.toHaveBeenCalled()
  })
})
