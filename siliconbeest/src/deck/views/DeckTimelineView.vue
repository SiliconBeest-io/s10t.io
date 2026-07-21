<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import type { TimelineType } from '@/stores/timelines'
import { useAudibleTimelineScope } from '@/composables/useAudibleTimelineScope'
import { useRecommendedTimelineRoute } from '@/composables/useRecommendedTimelineFeature'
import DeckPageShell from '../layout/DeckPageShell.vue'
import DeckColumn from '../components/DeckColumn.vue'
import DeckRecommendedColumn from '../components/DeckRecommendedColumn.vue'

type DeckTimelineColumnType = 'home' | 'social' | 'local' | 'federated'
type DeckTimelineRouteType = DeckTimelineColumnType | 'recommended'

const route = useRoute()
const SOUND_SCOPE = 'deck-single-timeline'

const routeType = computed<DeckTimelineRouteType>(() => {
  const param = String(route.params.type ?? 'home')
  return param === 'recommended' || param === 'social' || param === 'local' || param === 'federated'
    ? param
    : 'home'
})

const standardType = computed<DeckTimelineColumnType | null>(() =>
  routeType.value === 'recommended' ? null : routeType.value,
)

const isRecommended = computed(() => routeType.value === 'recommended')
const { available: recommendedAvailable } = useRecommendedTimelineRoute(
  '/timelines/home',
  isRecommended,
)

const audibleTimelineType = computed<TimelineType>(() => {
  if (routeType.value === 'recommended') return 'recommended'
  if (routeType.value === 'federated') return 'public'
  return routeType.value
})

useAudibleTimelineScope(SOUND_SCOPE, () => [audibleTimelineType.value])
</script>

<template>
  <DeckPageShell contained-main>
    <div class="mx-auto h-full min-h-0 w-full max-w-2xl px-3 py-2.5 md:px-4 md:py-3.5">
      <DeckRecommendedColumn v-if="isRecommended && recommendedAvailable" fluid />
      <div v-else-if="isRecommended" class="h-full" aria-busy="true" />
      <DeckColumn v-else-if="standardType" :key="routeType" :type="standardType" fluid />
    </div>
  </DeckPageShell>
</template>
