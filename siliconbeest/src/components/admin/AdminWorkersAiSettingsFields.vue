<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type {
  WorkersAiAdminSettings,
  WorkersAiToggleSetting,
} from '@/types/workersAi'

type WorkersAiSettingKey = keyof WorkersAiAdminSettings

defineProps<{
  settings: WorkersAiAdminSettings
  available: boolean
}>()

const { t } = useI18n()

const features: ReadonlyArray<{
  key: WorkersAiSettingKey
  label: string
  help: string
}> = [
  {
    key: 'workers_ai_recommendation_enabled',
    label: 'admin_settings.workers_ai.recommendation',
    help: 'admin_settings.workers_ai.recommendation_help',
  },
  {
    key: 'workers_ai_translation_enabled',
    label: 'admin_settings.workers_ai.translation',
    help: 'admin_settings.workers_ai.translation_help',
  },
  {
    key: 'workers_ai_image_description_enabled',
    label: 'admin_settings.workers_ai.image_description',
    help: 'admin_settings.workers_ai.image_description_help',
  },
]

function setToggle(
  settings: WorkersAiAdminSettings,
  key: WorkersAiSettingKey,
  event: Event,
) {
  const value: WorkersAiToggleSetting = (event.target as HTMLInputElement).checked
    ? '1'
    : '0'
  settings[key] = value
}
</script>

<template>
  <section class="sb-card p-6" data-testid="workers-ai-admin-settings">
    <h2 class="sb-heading mb-2 text-lg text-slate-900 dark:text-white">
      {{ t('admin_settings.workers_ai.title') }}
    </h2>
    <p class="mb-4 text-sm text-slate-500 dark:text-slate-400">
      {{ t('admin_settings.workers_ai.description') }}
    </p>

    <p
      v-if="!available"
      id="workers-ai-unavailable"
      class="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
      role="status"
    >
      {{ t('admin_settings.workers_ai.unavailable') }}
    </p>

    <fieldset
      class="space-y-4"
      :disabled="!available"
      :aria-describedby="available ? undefined : 'workers-ai-unavailable'"
    >
      <legend class="sr-only">{{ t('admin_settings.workers_ai.title') }}</legend>
      <label
        v-for="feature in features"
        :key="feature.key"
        class="flex items-start gap-3"
        :class="available ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'"
      >
        <input
          type="checkbox"
          :checked="settings[feature.key] === '1'"
          :disabled="!available"
          :data-testid="feature.key"
          class="mt-0.5 h-4 w-4 rounded border-outline text-brand-600 accent-brand-600 dark:border-outline-dark dark:bg-surface-2-dark"
          @change="setToggle(settings, feature.key, $event)"
        />
        <span>
          <span class="block text-sm font-medium text-slate-900 dark:text-white">
            {{ t(feature.label) }}
          </span>
          <span class="mt-1 block text-xs text-slate-500 dark:text-slate-400">
            {{ t(feature.help) }}
          </span>
        </span>
      </label>
    </fieldset>
  </section>
</template>
