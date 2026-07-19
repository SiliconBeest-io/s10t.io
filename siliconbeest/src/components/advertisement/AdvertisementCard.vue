<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Advertisement } from '@/types/advertisement'

const props = withDefaults(defineProps<{
  advertisement: Advertisement
  variant?: 'aurora' | 'classic' | 'deck'
}>(), {
  variant: 'aurora',
})

const { t } = useI18n()
const hasAdvertisedStatus = computed(() => props.advertisement.format === 'status')
const canLink = computed(() => !hasAdvertisedStatus.value && !!props.advertisement.link_url)
const cardClass = computed(() => {
  if (props.variant === 'deck') return 'dk-card overflow-hidden'
  if (props.variant === 'classic') {
    return 'overflow-hidden border-b border-amber-200 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/15'
  }
  return 'overflow-hidden border-b border-outline bg-amber-50/35 dark:border-outline-dark dark:bg-amber-950/10'
})
</script>

<template>
  <article :class="cardClass" :aria-label="t('advertisement.label')">
    <div
      class="flex items-center gap-1.5 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300"
    >
      <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535" />
      </svg>
      {{ t('advertisement.label') }}
    </div>

    <slot v-if="hasAdvertisedStatus" name="status" />

    <component
      :is="canLink ? 'a' : 'div'"
      v-else
      :href="canLink ? advertisement.link_url ?? undefined : undefined"
      :target="canLink ? '_blank' : undefined"
      :rel="canLink ? 'sponsored noopener noreferrer' : undefined"
      class="block no-underline"
    >
      <img
        v-if="advertisement.image_url"
        :src="advertisement.image_url"
        :alt="advertisement.image_alt_text"
        class="max-h-96 w-full object-cover"
        loading="lazy"
      />
      <p
        v-if="advertisement.text"
        class="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-slate-800 dark:text-slate-100"
      >{{ advertisement.text }}</p>
      <span
        v-if="canLink"
        class="block px-4 pb-3 text-xs font-semibold text-amber-700 dark:text-amber-300"
      >{{ t('advertisement.open_link') }} ↗</span>
    </component>
  </article>
</template>
