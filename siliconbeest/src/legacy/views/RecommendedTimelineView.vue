<script setup lang="ts">
import AppShell from '@/legacy/components/layout/AppShell.vue'
import RecommendedColumn from '@/legacy/components/timeline/RecommendedColumn.vue'
import { useRecommendedTimelineRoute } from '@/composables/useRecommendedTimelineFeature'

const { available } = useRecommendedTimelineRoute('/old/home')
</script>

<template>
  <AppShell contained-main>
    <div class="mx-auto h-full min-h-0 w-full max-w-2xl">
      <RecommendedColumn v-if="available" />
      <div v-else class="h-full" aria-busy="true" />
    </div>
  </AppShell>
</template>
