<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import DeckPageShell from '../layout/DeckPageShell.vue'
import DeckColumn from '../components/DeckColumn.vue'

type DeckTimelineColumnType = 'home' | 'social' | 'local' | 'federated'

const route = useRoute()

const type = computed<DeckTimelineColumnType>(() => {
  const param = String(route.params.type ?? 'home')
  return param === 'social' || param === 'local' || param === 'federated' ? param : 'home'
})
</script>

<template>
  <DeckPageShell contained-main>
    <div class="mx-auto h-full min-h-0 w-full max-w-2xl px-3 py-2.5 md:px-4 md:py-3.5">
      <DeckColumn :key="type" :type="type" fluid />
    </div>
  </DeckPageShell>
</template>
