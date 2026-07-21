<script setup lang="ts">
import AdminReportDetailView from '@/views/AdminReportDetailView.vue';

definePageMeta({ name: 'aurora-admin-report-detail' });

const route = useRoute();
const id = computed(() => String(route.params.id));
</script>

<template>
  <AdminReportDetailView :id="id" />
</template>
