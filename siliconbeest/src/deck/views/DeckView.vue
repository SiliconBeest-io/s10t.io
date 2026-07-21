<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore, type ColumnType } from '@/stores/ui'
import type { TimelineType } from '@/stores/timelines'
import { useAudibleTimelineScope } from '@/composables/useAudibleTimelineScope'

import DeckShell from '../layout/DeckShell.vue'
import DeckColumn from '../components/DeckColumn.vue'
import DeckNotificationsColumn from '../components/DeckNotificationsColumn.vue'
import DeckSearchColumn from '../components/DeckSearchColumn.vue'
import DeckFollowRequestsColumn from '../components/DeckFollowRequestsColumn.vue'
import DeckRecommendedColumn from '../components/DeckRecommendedColumn.vue'
import { useDeckColumns } from '../composables/useDeckColumns'

const { t } = useI18n()
const ui = useUiStore()
const { columns, configRows } = useDeckColumns()

const deckEl = ref<HTMLElement | null>(null)

// SSR always renders the desktop deck (isMobile is false on the server). CSS
// hides that branch below md, and we only switch markup after mount: swapping
// v-if branches during hydration leaves desktop attributes on reused DOM
// nodes because Vue does not patch those attributes while hydrating.
const hydrated = ref(false)
onMounted(() => {
  hydrated.value = true
})
const showMobileDeck = computed(() => hydrated.value && ui.isMobile)

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
  recommended: 'timeline.ai_recommended_nav',
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
  mobileColumns.value.includes(ui.mobileColumn)
    ? ui.mobileColumn
    : mobileColumns.value.includes('home')
      ? 'home'
      : (mobileColumns.value[0] ?? 'home'),
)

const SOUND_SCOPE = 'deck-home'

function toTimelineType(column: ColumnType): TimelineType | null {
  if (column === 'federated') return 'public'
  if (
    column === 'recommended'
    || column === 'home'
    || column === 'social'
    || column === 'local'
  ) return column
  return null
}

// Streams stay connected after a mobile column has been visited. Register the
// feeds that are actually visible so hidden columns cannot trigger the chime.
// On desktop every configured deck column is considered visible, including
// columns currently outside the horizontal scroll viewport.
const audibleTimelineTypes = computed<TimelineType[]>(() => {
  const visibleColumns = showMobileDeck.value ? [activeMobile.value] : columns.value
  return visibleColumns
    .map(toTimelineType)
    .filter((type): type is TimelineType => type !== null)
})

useAudibleTimelineScope(SOUND_SCOPE, () => audibleTimelineTypes.value)

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
  <DeckShell :show-mobile-deck="showMobileDeck">
    <!-- Desktop: horizontal multi-column deck, ordered by the user's config -->
    <div
      v-if="!showMobileDeck"
      ref="deckEl"
      class="hidden h-full min-h-0 gap-3.5 overflow-x-auto overflow-y-hidden px-[18px] pb-2.5 pt-3.5 md:flex"
      tabindex="0"
      @wheel="onDeckWheel"
    >
      <template v-for="key in columns" :key="key">
        <DeckRecommendedColumn v-if="key === 'recommended'" />
        <DeckNotificationsColumn v-else-if="key === 'notifications'" />
        <DeckSearchColumn v-else-if="key === 'search'" />
        <DeckFollowRequestsColumn v-else-if="key === 'follow_requests'" />
        <DeckColumn v-else :type="key" />
      </template>

      <div v-if="columns.length === 0" class="relative h-full min-w-full">
        <div class="dk-card dk-dim-text absolute left-2 top-8 flex max-w-sm items-start gap-2.5 px-4 py-3 text-[13.5px]">
          <span
            class="dk-mono select-none text-2xl leading-5"
            style="color: var(--dk-acc)"
            aria-hidden="true"
          >←</span>
          <p id="deck-empty-columns-guidance" class="m-0 leading-relaxed">
            {{ t('deck.columns_empty') }}
          </p>
        </div>
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
            <DeckRecommendedColumn v-if="key === 'recommended'" fluid />
            <DeckNotificationsColumn v-else-if="key === 'notifications'" fluid />
            <DeckSearchColumn v-else-if="key === 'search'" fluid />
            <DeckFollowRequestsColumn v-else-if="key === 'follow_requests'" fluid />
            <DeckColumn v-else :type="key" fluid />
          </template>
        </div>
      </div>
    </div>
  </DeckShell>
</template>
