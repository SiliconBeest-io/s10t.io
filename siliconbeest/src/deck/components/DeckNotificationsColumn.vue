<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNotificationsStore } from '@/stores/notifications'
import { useAuthStore } from '@/stores/auth'
import NotificationItem from '@/components/notification/NotificationItem.vue'
import InfiniteScroll from '@/components/common/InfiniteScroll.vue'

const { t } = useI18n()
const notificationsStore = useNotificationsStore()
const auth = useAuthStore()

withDefaults(defineProps<{
  fluid?: boolean
}>(), {
  fluid: false,
})

const notifications = computed(() => notificationsStore.items)
const loading = computed(() => notificationsStore.loading)
const loadingMore = computed(() => notificationsStore.loadingMore)
const done = computed(() => !notificationsStore.hasMore)
const error = computed(() => notificationsStore.error)

async function loadNotifications() {
  if (!auth.token) return
  await notificationsStore.fetch(auth.token)
}

async function loadMore() {
  if (!auth.token) return
  await notificationsStore.fetchMore(auth.token)
}

async function markAllRead() {
  if (!auth.token) return
  await notificationsStore.markAllRead(auth.token)
  notifications.value.forEach((n: any) => { n.read = 1 })
}

async function handleMarkRead(id: string) {
  if (!auth.token) return
  await notificationsStore.markRead(id, auth.token)
  const notif = notifications.value.find(n => n.id === id) as any
  if (notif) notif.read = 1
}

watch(
  () => auth.token,
  (token) => {
    if (token) void loadNotifications()
  },
  { immediate: true },
)
</script>

<template>
  <section
    class="flex h-full min-h-0 flex-none flex-col gap-2.5"
    :class="fluid ? 'w-full' : 'w-[392px] max-w-full'"
    :aria-label="t('nav.notifications')"
  >
    <!-- Column header -->
    <div class="dk-card flex flex-none items-center gap-2.5 rounded-[14px] px-3.5 py-2.5">
      <span class="text-base" aria-hidden="true">🔔</span>
      <span class="dk-mono dk-text text-[13.5px] font-semibold">{{ t('deck.col_notifications') }}</span>
      <span v-if="notificationsStore.unreadCount > 0" class="dk-chip" style="color: var(--dk-acc); border-color: var(--dk-acc)">
        {{ notificationsStore.unreadCount > 99 ? '99+' : notificationsStore.unreadCount }}
      </span>
      <div class="flex-1" />
      <button
        v-if="notificationsStore.unreadCount > 0"
        type="button"
        class="dk-pill-btn !px-2.5 !py-1"
        @click="markAllRead"
      >
        {{ t('notification.markAllRead') }}
      </button>
    </div>

    <!-- Column body -->
    <div data-deck-scroll class="dk-card min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
      <div
        v-if="error"
        class="dk-dim-text px-4 py-3 text-center text-[13px]"
        role="alert"
      >
        {{ error }}
      </div>

      <InfiniteScroll :loading="loading || loadingMore" :done="done" @load-more="loadMore">
        <NotificationItem
          v-for="notification in notifications"
          :key="notification.id"
          :notification="notification"
          @mark-read="handleMarkRead"
        />

        <div v-if="!loading && notifications.length === 0" class="dk-dim-text px-5 py-8 text-center text-[13.5px]">
          <p class="dk-text mb-1 font-semibold">{{ t('notification.empty') }}</p>
          <p>{{ t('notification.empty_hint') }}</p>
        </div>
      </InfiniteScroll>
    </div>
  </section>
</template>
