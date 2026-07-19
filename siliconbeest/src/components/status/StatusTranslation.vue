<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Status } from '@/types/mastodon'
import { translateStatus, type StatusTranslation as TranslationResponse } from '@/api/mastodon/statuses'
import { useAuthStore } from '@/stores/auth'
import { useInstanceStore } from '@/stores/instance'
import { htmlToPlainText } from '@/utils/html'

const props = withDefaults(defineProps<{
  status: Status
  variant?: 'aurora' | 'classic' | 'deck'
}>(), {
  variant: 'aurora',
})

const { t, locale } = useI18n()
const auth = useAuthStore()
const instanceStore = useInstanceStore()

const translation = ref<TranslationResponse | null>(null)
const translatedForLanguage = ref<string | null>(null)
const showingTranslation = ref(false)
const loading = ref(false)
const failed = ref(false)

function baseLanguage(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? ''
}

const targetLanguage = computed(() => baseLanguage(String(locale.value)))
const sourceLanguage = computed(() => baseLanguage(props.status.language))
const sourceText = computed(() => htmlToPlainText(props.status.content))
const requestContext = computed(() => JSON.stringify([
  props.status.id,
  targetLanguage.value,
  props.status.edited_at,
  props.status.content,
  props.status.spoiler_text,
  props.status.language,
  props.status.visibility,
  props.status.sensitive,
  auth.token,
]))

const requestGeneration = ref(0)

const canTranslate = computed(() => {
  if (!instanceStore.instance?.configuration.translation.enabled) return false
  if (!auth.isAuthenticated || !auth.token || !targetLanguage.value || !sourceText.value) return false
  if (props.status.visibility !== 'public' && props.status.visibility !== 'unlisted') return false
  if (props.status.sensitive || props.status.spoiler_text?.trim()) return false
  return !!sourceLanguage.value && sourceLanguage.value !== targetLanguage.value
})

const translatedContent = computed(() => htmlToPlainText(translation.value?.content ?? ''))
const translatedSpoiler = computed(() => htmlToPlainText(translation.value?.spoiler_text ?? ''))
const translationModel = computed(() => translation.value?.model?.trim() ?? '')

const buttonClass = computed(() => [
  'inline-flex min-h-5 appearance-none items-center border-0 bg-transparent p-0 text-xs font-medium leading-5 underline-offset-2 transition-colors hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-wait disabled:opacity-60 disabled:no-underline',
  ({
    aurora: 'text-brand-600 hover:text-brand-700 focus-visible:ring-brand-400 dark:text-brand-400 dark:hover:text-brand-300',
    classic: 'text-indigo-600 hover:text-indigo-700 focus-visible:ring-indigo-400 dark:text-indigo-400 dark:hover:text-indigo-300',
    deck: 'text-[color:var(--dk-acc)] hover:text-[color:var(--dk-text)] focus-visible:ring-[color:var(--dk-acc)]',
  })[props.variant],
])

const translatedContentClass = computed(() => ({
  aurora: 'status-content mt-1 break-words whitespace-pre-wrap text-sm leading-relaxed text-slate-900 dark:text-slate-100',
  classic: 'status-content mt-1 break-words whitespace-pre-wrap text-sm leading-relaxed text-gray-900 dark:text-gray-100',
  deck: 'dk-text mt-2.5 break-words whitespace-pre-wrap text-[length:var(--dk-fs)] leading-relaxed',
})[props.variant])

const disclosureClass = computed(() => ({
  aurora: 'mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400',
  classic: 'mt-1 text-[11px] leading-snug text-gray-500 dark:text-gray-400',
  deck: 'dk-muted mt-1 text-[11px] leading-snug',
})[props.variant])

async function toggleTranslation() {
  const token = auth.token
  if (!canTranslate.value || !token || loading.value) return

  if (showingTranslation.value) {
    showingTranslation.value = false
    return
  }

  if (translation.value && translatedForLanguage.value === targetLanguage.value) {
    showingTranslation.value = true
    return
  }

  const generation = requestGeneration.value
  const context = requestContext.value
  const statusId = props.status.id
  const requestedLanguage = targetLanguage.value
  const isCurrentRequest = () => (
    generation === requestGeneration.value
    && context === requestContext.value
  )

  loading.value = true
  failed.value = false
  try {
    const { data } = await translateStatus(statusId, requestedLanguage, token)
    if (!isCurrentRequest() || !canTranslate.value) return

    translation.value = data
    translatedForLanguage.value = requestedLanguage
    showingTranslation.value = true
  } catch {
    if (!isCurrentRequest() || !canTranslate.value) return

    translation.value = null
    translatedForLanguage.value = null
    showingTranslation.value = false
    failed.value = true
  } finally {
    if (isCurrentRequest()) loading.value = false
  }
}

watch(
  requestContext,
  () => {
    requestGeneration.value += 1
    translation.value = null
    translatedForLanguage.value = null
    showingTranslation.value = false
    loading.value = false
    failed.value = false
  },
  { flush: 'sync' },
)
</script>

<template>
  <div data-testid="status-translation-container">
    <div
      v-if="showingTranslation && translatedContent"
      :class="translatedContentClass"
      data-testid="translated-content"
    >
      <!-- AI output is converted to plain text and interpolated, never injected as HTML. -->
      <p v-if="translatedSpoiler" class="mb-1 font-semibold whitespace-pre-wrap">{{ translatedSpoiler }}</p>
      <p class="whitespace-pre-wrap">{{ translatedContent }}</p>
    </div>
    <slot v-else />

    <div v-if="canTranslate" class="mt-1.5 leading-none" data-testid="status-translation" @click.stop>
      <button
        type="button"
        :class="buttonClass"
        :aria-busy="loading"
        :aria-pressed="showingTranslation"
        :disabled="loading"
        @click="toggleTranslation"
      >
        {{ loading
          ? t('status.translating')
          : showingTranslation
            ? t('status.show_original')
            : t('status.translate') }}
      </button>
    </div>

    <p
      v-if="showingTranslation && translatedContent && translationModel"
      :class="disclosureClass"
      data-testid="translation-disclosure"
    >
      {{ t('status.translation_disclosure', { model: translationModel }) }}
    </p>

    <p v-if="failed" class="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
      {{ t('status.translation_failed') }}
    </p>
  </div>
</template>
