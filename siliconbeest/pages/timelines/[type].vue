<script setup lang="ts">
import DeckTimelineView from '@/deck/views/DeckTimelineView.vue';

definePageMeta({
  name: 'timeline',
  validate: (route) => ['home', 'local', 'federated'].includes(String(route.params.type)),
});
</script>

<template>
  <DeckTimelineView />
</template>
