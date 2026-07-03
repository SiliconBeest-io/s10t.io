<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
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
const { columns, configRows } = useDeckColumns()

const deckEl = ref<HTMLElement | null>(null)

// SSR always renders the desktop deck (isMobile is false on the server).
// Swapping v-if branches during hydration leaves the desktop branch's
// attributes on reused DOM nodes (Vue doesn't patch attributes while
// hydrating), which mangled the mobile layout — so only switch to the
// mobile branch after mount.
const hydrated = ref(false)
onMounted(() => {
  hydrated.value = true
})
const showMobile = computed(() => hydrated.value && ui.isMobile)

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
  social: 'deck.col_social',
  local: 'deck.col_local',
  federated: 'deck.col_federated',
  notifications: 'deck.col_notifications',
  search: 'deck.col_search',
  follow_requests: 'deck.col_requests',
}

// Mobile shows one column at a time. Every column type is selectable
// (enabled ones first, then the rest), regardless of the desktop deck
// config. The choice lives in the ui store so the bottom-nav deck picker
// shares it, and it persists across visits.
const mobileColumns = configRows
const activeMobile = computed<ColumnType>(() =>
  mobileColumns.value.includes(ui.mobileColumn) ? ui.mobileColumn : (mobileColumns.value[0] ?? 'home'),
)

// Columns mount lazily on first visit and stay mounted (v-show) so
// switching is instant and scroll position is preserved.
const visitedMobile = ref<Set<ColumnType>>(new Set([activeMobile.value]))
const chipStrip = ref<HTMLElement | null>(null)

watch(activeMobile, async (col) => {
  if (!visitedMobile.value.has(col)) {
    visitedMobile.value = new Set([...visitedMobile.value, col])
  }
  // Keep the active chip visible when the strip overflows
  await nextTick()
  chipStrip.value
    ?.querySelector('[aria-selected="true"]')
    ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
})
</script>

<template>
  <DeckShell>
    <!-- Desktop: horizontal multi-column deck, ordered by the user's config -->
    <div
      v-if="!showMobile"
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

    <!-- Mobile: single column + switcher chips (every column type selectable) -->
    <div v-else class="flex h-full min-h-0 flex-col">
      <div ref="chipStrip" class="flex flex-none items-center gap-1.5 overflow-x-auto px-3 py-2" role="tablist">
        <button
          v-for="key in mobileColumns"
          :key="key"
          type="button"
          role="tab"
          class="dk-pill-btn flex-none"
          :style="activeMobile === key ? 'color: var(--dk-acc); border-color: var(--dk-acc)' : ''"
          :aria-selected="activeMobile === key"
          @click="ui.setMobileColumn(key)"
        >
          {{ t(MOBILE_LABEL_KEYS[key]) }}
        </button>
      </div>
      <div class="relative min-h-0 flex-1 px-3 pb-2">
        <div
          v-for="key in mobileColumns"
          v-show="activeMobile === key"
          :key="`m-${key}`"
          class="h-full min-h-0"
        >
          <template v-if="visitedMobile.has(key)">
            <DeckNotificationsColumn v-if="key === 'notifications'" fluid />
            <DeckSearchColumn v-else-if="key === 'search'" fluid />
            <DeckFollowRequestsColumn v-else-if="key === 'follow_requests'" fluid />
            <DeckColumn v-else :type="key" fluid />
          </template>
        </div>
      </div>
    </div>
  </DeckShell>
</template>
