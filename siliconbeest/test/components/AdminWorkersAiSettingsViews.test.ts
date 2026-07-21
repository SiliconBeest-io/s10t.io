import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import type { Instance } from '@/types/mastodon'
import AdminSettingsView from '@/views/AdminSettingsView.vue'
import LegacyAdminSettingsView from '@/legacy/views/AdminSettingsView.vue'
import DeckAdminSettingsView from '@/deck/views/AdminSettingsView.vue'
import { useAuthStore } from '@/stores/auth'
import { useInstanceStore } from '@/stores/instance'
import { createTestI18n } from '../helpers'

const adminApi = vi.hoisted(() => ({
  getAdminSettings: vi.fn(),
  updateAdminSettings: vi.fn(),
  testSmtp: vi.fn(),
}))

vi.mock('@/api/mastodon/admin', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/mastodon/admin')>(),
  ...adminApi,
}))

const variants: Array<{ name: string; component: Component }> = [
  { name: 'Aurora', component: AdminSettingsView },
  { name: 'Classic', component: LegacyAdminSettingsView },
  { name: 'Deck', component: DeckAdminSettingsView },
]

describe.each(variants)('$name admin Workers AI settings', ({ component }) => {
  beforeEach(() => {
    localStorage.clear()
    document.cookie = 'siliconbeest_token=; Path=/; Max-Age=0'
    vi.clearAllMocks()
    adminApi.getAdminSettings.mockResolvedValue({
      data: {
        instance_languages: 'ko, en',
        workers_ai_translation_enabled: '1',
      },
    })
    adminApi.updateAdminSettings.mockResolvedValue({ data: {} })
  })

  it('saves all feature defaults and refreshes public capabilities', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore().setToken('admin-ai-token')
    const instanceStore = useInstanceStore()
    instanceStore.instance = {
      configuration: {
        translation: { enabled: false },
        ai: {
          enabled: true,
          recommended_timeline: false,
          image_description: false,
        },
      },
    } as Instance
    const fetchInstance = vi.spyOn(instanceStore, 'fetchInstance').mockResolvedValue()

    const wrapper = mount(component, {
      global: {
        plugins: [pinia, createTestI18n()],
        stubs: {
          AdminLayout: { template: '<div><slot /></div>' },
          DeckAdminLayout: { template: '<div><slot /></div>' },
          AdminInvitationSettingsFields: true,
          AdminWorkersAiSettingsFields: true,
        },
      },
    })
    await flushPromises()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(adminApi.updateAdminSettings).toHaveBeenCalledWith(
      'admin-ai-token',
      expect.objectContaining({
        instance_languages: 'ko, en',
        workers_ai_recommendation_enabled: '0',
        workers_ai_translation_enabled: '1',
        workers_ai_image_description_enabled: '0',
      }),
    )
    expect(fetchInstance).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('Settings saved.')
  })
})
