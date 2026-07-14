import { onUnmounted, watch } from 'vue';
import { useTimelinesStore, type TimelineType } from '@/stores/timelines';

/** Register the live timelines a mounted view is actually showing. */
export function useAudibleTimelineScope(
  owner: string,
  getTypes: () => readonly TimelineType[],
) {
  const timelinesStore = useTimelinesStore();
  // The human-readable owner can be shared by two component instances during
  // a route transition. Keep the store registration instance-specific so the
  // older instance cannot clear the newer instance's sound scope on unmount.
  const scopeKey = Symbol(owner);

  watch(
    getTypes,
    (types) => timelinesStore.setAudibleTimelineScope(scopeKey, types),
    { immediate: true },
  );

  onUnmounted(() => {
    timelinesStore.clearAudibleTimelineScope(scopeKey);
  });
}
