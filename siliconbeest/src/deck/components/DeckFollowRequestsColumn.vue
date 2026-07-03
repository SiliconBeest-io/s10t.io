<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Account } from '@/types/mastodon'
import { apiFetch } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import Avatar from '@/components/common/Avatar.vue'

const { t } = useI18n()
const auth = useAuthStore()
const notifStore = useNotificationsStore()

withDefaults(defineProps<{
  fluid?: boolean
}>(), {
  fluid: false,
})

const requests = ref<Account[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// The user:notification websocket delivers follow_request notifications —
// live while that stream client exists
const live = computed(() => !!notifStore.streamingClient)

async function loadRequests() {
  if (!auth.token) return
  loading.value = true
  error.value = null
  try {
    const { data } = await apiFetch<Account[]>('/v1/follow_requests', { token: auth.token })
    requests.value = data
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function handleAction(accountId: string, action: 'authorize' | 'reject') {
  try {
    await apiFetch(`/v1/follow_requests/${accountId}/${action}`, {
      method: 'POST',
      token: auth.token ?? undefined,
    })
    requests.value = requests.value.filter((r) => r.id !== accountId)
  } catch (e) {
    error.value = (e as Error).message
  }
}

watch(
  () => auth.token,
  (token) => {
    if (token) {
      void loadRequests()
      // Follow requests arrive as notifications — ensure that socket is up
      notifStore.connectStream(token)
    }
  },
  { immediate: true },
)

// Refresh when a follow_request notification arrives over the websocket
watch(
  () => notifStore.items[0],
  (latest) => {
    if (latest?.type === 'follow_request') void loadRequests()
  },
)
</script>

<template>
  <section
    class="flex h-full min-h-0 flex-none flex-col gap-2.5"
    :class="fluid ? 'w-full' : 'w-[392px] max-w-full'"
    :aria-label="t('settings.follow_requests')"
  >
    <!-- Column header -->
    <div class="dk-card flex flex-none items-center gap-2.5 rounded-[14px] px-3.5 py-2.5">
      <span class="text-base" aria-hidden="true">🤝</span>
      <span class="dk-mono dk-text text-[13.5px] font-semibold">{{ t('deck.col_requests') }}</span>
      <span class="dk-chip">{{ t('deck.scope_requests') }}</span>
      <span v-if="requests.length" class="dk-chip" style="color: var(--dk-acc); border-color: var(--dk-acc)">
        {{ requests.length }}
      </span>
      <div class="flex-1" />
      <span v-if="live" class="dk-live">
        <span class="dk-dot !h-1.5 !w-1.5" aria-hidden="true" />{{ t('deck.live') }}
      </span>
    </div>

    <!-- Column body -->
    <div data-deck-scroll class="dk-card min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
      <div v-if="error" class="dk-dim-text px-4 py-3 text-center text-[13px]" role="alert">
        {{ error }}
      </div>

      <div
        v-for="request in requests"
        :key="request.id"
        class="dk-hairline-b flex items-center gap-2.5 px-3.5 py-2.5 last:border-b-0"
      >
        <router-link :to="`/@${request.acct}`" class="dk-avatar block h-10 w-10 flex-none overflow-hidden rounded-[12px]">
          <Avatar :src="request.avatar" :alt="request.display_name" size="sm" />
        </router-link>
        <router-link :to="`/@${request.acct}`" class="flex min-w-0 flex-1 flex-col no-underline">
          <span class="dk-text truncate text-[13.5px] font-bold">{{ request.display_name || request.username }}</span>
          <span class="dk-mono dk-dim-text truncate text-[11px]">@{{ request.acct }}</span>
        </router-link>
        <button
          type="button"
          class="dk-btn-accent !px-3 !py-1.5 !text-[12px]"
          :aria-label="t('settings.approve')"
          @click="handleAction(request.id, 'authorize')"
        >
          ✓ {{ t('settings.approve') }}
        </button>
        <button
          type="button"
          class="dk-pill-btn !px-3 !py-1.5"
          :aria-label="t('settings.reject')"
          @click="handleAction(request.id, 'reject')"
        >
          ✕
        </button>
      </div>

      <div v-if="!loading && requests.length === 0 && !error" class="dk-dim-text px-5 py-8 text-center text-[13.5px]">
        {{ t('settings.no_follow_requests') }}
      </div>
    </div>
  </section>
</template>

<style scoped>
.dk-avatar :deep(img) {
  border-radius: 12px;
  height: 100%;
  width: 100%;
}
</style>
