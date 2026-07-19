import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getAdvertisements } from '@/api/mastodon/advertisements';
import type { Advertisement } from '@/types/advertisement';
import { useStatusesStore } from './statuses';

export const useAdvertisementsStore = defineStore('advertisements', () => {
  const advertisements = ref<Advertisement[]>([]);
  const loading = ref(false);
  const loadedForViewer = ref<string | null>(null);

  async function load(token?: string, force = false) {
    const viewerKey = token ?? 'anonymous';
    if (!force && (loading.value || loadedForViewer.value === viewerKey)) return;

    loading.value = true;
    try {
      const { data } = await getAdvertisements(token);
      advertisements.value = data;
      loadedForViewer.value = viewerKey;
      const statuses = useStatusesStore();
      for (const advertisement of data) {
        if (advertisement.status) statuses.cacheStatus(advertisement.status);
      }
    } catch {
      // Advertising is optional feed content. A failed request must never make
      // the underlying timeline unavailable or display a persistent error.
      advertisements.value = [];
      loadedForViewer.value = viewerKey;
    } finally {
      loading.value = false;
    }
  }

  function invalidate() {
    loadedForViewer.value = null;
  }

  return { advertisements, loading, load, invalidate };
});
