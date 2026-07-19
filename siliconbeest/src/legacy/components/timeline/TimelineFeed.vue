<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Status } from '@/types/mastodon'
import InfiniteScroll from '../common/InfiniteScroll.vue'
import StatusCard from '../status/StatusCard.vue'
import AdvertisementCard from '@/components/advertisement/AdvertisementCard.vue'
import { useAuthStore } from '@/stores/auth'
import { useAdvertisementsStore } from '@/stores/advertisements'
import { mixAdvertisements } from '@/utils/advertisementFeed'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  statuses: Status[]
  loading?: boolean
  done?: boolean
  hasNewPosts?: boolean
  newPostsCount?: number
  autoInsert?: boolean
  timelineKey?: string
  showAdvertisements?: boolean
}>(), {
  timelineKey: 'timeline',
})

const auth = useAuthStore()
const advertisementsStore = useAdvertisementsStore()
const feedItems = computed(() => mixAdvertisements(
  props.statuses,
  props.showAdvertisements ? advertisementsStore.advertisements : [],
  `classic:${props.timelineKey}`,
))

watch(
  () => auth.token,
  (token) => {
    if (props.showAdvertisements) void advertisementsStore.load(token ?? undefined)
  },
  { immediate: true },
)

const emit = defineEmits<{
  'load-more': []
  'load-new': []
  'navigate': [status: Status]
}>()
</script>

<template>
  <div>
    <!-- New posts banner -->
    <button
      v-if="hasNewPosts"
      @click="emit('load-new')"
      class="w-full py-3 text-center text-sm font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border-b border-gray-200 dark:border-gray-700 transition-colors"
    >
      {{ t('timeline.new_posts', { count: props.newPostsCount ?? 0 }) }}
    </button>

    <InfiniteScroll :loading="loading" :done="done" @load-more="emit('load-more')">
      <template v-for="item in feedItems" :key="item.key">
        <StatusCard
          v-if="item.kind === 'status'"
          :status="item.status"
          @navigate="(s: Status) => emit('navigate', s)"
        />
        <AdvertisementCard
          v-else
          :advertisement="item.advertisement"
          variant="classic"
        >
          <template #status>
            <StatusCard
              v-if="item.advertisement.status"
              :status="item.advertisement.status"
              @navigate="(s: Status) => emit('navigate', s)"
            />
          </template>
        </AdvertisementCard>
      </template>

      <!-- Empty state -->
      <div v-if="!loading && statuses.length === 0" class="p-8 text-center text-gray-500 dark:text-gray-400">
        <p class="text-lg font-medium">{{ t('timeline.empty') }}</p>
        <p class="text-sm mt-1">{{ t('timeline.empty_hint') }}</p>
      </div>
    </InfiniteScroll>
  </div>
</template>
