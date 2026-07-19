import { computed, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useInstanceStore } from '@/stores/instance'

export function useRecommendedTimelineFeature() {
  const auth = useAuthStore()
  const instanceStore = useInstanceStore()

  const available = computed(
    () => !!auth.token
      && instanceStore.instance?.configuration.ai?.recommended_timeline === true,
  )
  const resolved = computed(
    () => instanceStore.instance !== null || instanceStore.error !== null,
  )

  return { available, resolved }
}

export function useRecommendedTimelineRoute(
  fallback: string,
  active: MaybeRefOrGetter<boolean> = true,
) {
  const router = useRouter()
  const feature = useRecommendedTimelineFeature()

  watch(
    [() => toValue(active), feature.resolved, feature.available],
    ([active, resolved, available]) => {
      if (active && resolved && !available) void router.replace(fallback)
    },
    { immediate: true },
  )

  return feature
}
