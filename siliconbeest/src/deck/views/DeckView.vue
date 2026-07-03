<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore, type ColumnType } from '@/stores/ui'

import DeckShell from '../layout/DeckShell.vue'
import DeckColumn from '../components/DeckColumn.vue'
import DeckNotificationsColumn from '../components/DeckNotificationsColumn.vue'
import DeckSearchColumn from '../components/DeckSearchColumn.vue'
import DeckFollowRequestsColumn from '../components/DeckFollowRequestsColumn.vue'
import { useDeckColumns } from '../composables/useDeckColumns'

const { t } = useI18n()
const ui = useUiStore()
const { columns } = useDeckColumns()

const deckEl = ref<HTMLElement | null>(null)

/**
 * Plain vertical mouse wheels have no horizontal axis; when the pointer is
 * over deck chrome (headers, gaps) rather than a scrolling feed, translate
 * vertical wheel motion into horizontal deck panning (TweetDeck-style).
 */
function onDeckWheel(event: WheelEvent) {
  const el = deckEl.value
  if (!el || el.scrollWidth <= el.clientWidth) return
  if (event.deltaX !== 0) return // trackpad already scrolls horizontally
  const target = event.target as HTMLElement | null
  if (target?.closest('[data-deck-scroll]')) return // feed handles its own wheel
  el.scrollLeft += event.deltaY
  event.preventDefault()
}

const MOBILE_LABEL_KEYS: Record<ColumnType, string> = {
  home: 'deck.col_home',
  local: 'deck.col_local',
  federated: 'deck.col_federated',
  notifications: 'deck.col_notifications',
  search: 'deck.col_search',
  follow_requests: 'deck.col_requests',
}

// Mobile shows one column at a time
const activeMobile = ref<ColumnType>(columns.value[0] ?? 'home')

watch(columns, (cols) => {
  if (cols.length > 0 && !cols.includes(activeMobile.value)) {
    activeMobile.value = cols[0]!
  }
})
</script>

<template>
  <DeckShell>
    <!-- Desktop: horizontal multi-column deck, ordered by the user's config -->
    <div
      v-if="!ui.isMobile"
      ref="deckEl"
      class="flex h-full min-h-0 gap-3.5 overflow-x-auto overflow-y-hidden px-[18px] pb-2.5 pt-3.5"
      tabindex="0"
      @wheel="onDeckWheel"
    >
      <template v-for="key in columns" :key="key">
        <DeckNotificationsColumn v-if="key === 'notifications'" />
        <DeckSearchColumn v-else-if="key === 'search'" />
        <DeckFollowRequestsColumn v-else-if="key === 'follow_requests'" />
        <DeckColumn v-else :type="key" />
      </template>

      <div v-if="columns.length === 0" class="dk-card dk-dim-text m-auto max-w-md px-6 py-8 text-center text-[13.5px]">
        {{ t('deck.columns_empty') }}
      </div>
    </div>

    <!-- Mobile: single column + switcher chips -->
    <div v-else class="flex h-full min-h-0 flex-col">
      <div class="flex flex-none gap-1.5 overflow-x-auto px-3 py-2" role="tablist">
        <button
          v-for="key in columns"
          :key="key"
          type="button"
          role="tab"
          class="dk-pill-btn flex-none"
          :style="activeMobile === key ? 'color: var(--dk-acc); border-color: var(--dk-acc)' : ''"
          :aria-selected="activeMobile === key"
          @click="activeMobile = key"
        >
          {{ t(MOBILE_LABEL_KEYS[key]) }}
        </button>
      </div>
      <div class="min-h-0 flex-1 px-3 pb-2">
        <div v-if="columns.length === 0" class="dk-card dk-dim-text mx-auto mt-6 max-w-md px-6 py-8 text-center text-[13.5px]">
          {{ t('deck.columns_empty') }}
        </div>
        <DeckNotificationsColumn v-else-if="activeMobile === 'notifications'" :key="activeMobile" fluid />
        <DeckSearchColumn v-else-if="activeMobile === 'search'" :key="activeMobile" fluid />
        <DeckFollowRequestsColumn v-else-if="activeMobile === 'follow_requests'" :key="activeMobile" fluid />
        <DeckColumn v-else :key="activeMobile" :type="activeMobile" fluid />
      </div>
    </div>
  </DeckShell>
</template>
