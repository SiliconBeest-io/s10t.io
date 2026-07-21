import { reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AdminWorkersAiSettingsFields from '@/components/admin/AdminWorkersAiSettingsFields.vue'
import { createDefaultWorkersAiAdminSettings } from '@/types/workersAi'
import { createTestI18n } from '../helpers'

function mountFields(available: boolean) {
  const settings = reactive(createDefaultWorkersAiAdminSettings())
  const wrapper = mount(AdminWorkersAiSettingsFields, {
    props: { settings, available },
    global: { plugins: [createTestI18n()] },
  })
  return { settings, wrapper }
}

describe('AdminWorkersAiSettingsFields', () => {
  it('updates the three feature settings independently', async () => {
    const { settings, wrapper } = mountFields(true)

    const recommendation = wrapper.get('[data-testid="workers_ai_recommendation_enabled"]')
    const translation = wrapper.get('[data-testid="workers_ai_translation_enabled"]')
    const imageDescription = wrapper.get('[data-testid="workers_ai_image_description_enabled"]')

    await recommendation.setValue(true)
    await imageDescription.setValue(true)

    expect(settings).toEqual({
      workers_ai_recommendation_enabled: '1',
      workers_ai_translation_enabled: '0',
      workers_ai_image_description_enabled: '1',
    })
    expect((translation.element as HTMLInputElement).checked).toBe(false)
  })

  it('keeps every toggle visible but disabled when Workers AI is unavailable', () => {
    const { wrapper } = mountFields(false)
    const toggles = wrapper.findAll('input[type="checkbox"]')

    expect(toggles).toHaveLength(3)
    expect(toggles.every(toggle => (toggle.element as HTMLInputElement).disabled)).toBe(true)
    expect(wrapper.get('[role="status"]').text()).toContain('Workers AI is unavailable')
  })
})
