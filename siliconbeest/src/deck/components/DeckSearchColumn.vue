<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import type { Status, Account } from '@/types/mastodon'
import { search } from '@/api/mastodon/search'
import { useAuthStore } from '@/stores/auth'
import { useStatusesStore } from '@/stores/statuses'
import Avatar from '@/components/common/Avatar.vue'
import DeckStatusCard from './DeckStatusCard.vue'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const statusesStore = useStatusesStore()

withDefaults(defineProps<{
  fluid?: boolean
}>(), {
  fluid: false,
})

const query = ref('')
const loading = ref(false)
const searched = ref(false)
const error = ref<string | null>(null)
const statuses = ref<Status[]>([])
const accounts = ref<Account[]>([])

async function runSearch() {
  const q = query.value.trim()
  if (!q || loading.value) return
  loading.value = true
  error.value = null
  try {
    const { data } = await search(q, { resolve: true, limit: 20, token: auth.token ?? undefined })
    accounts.value = data.accounts ?? []
    statuses.value = data.statuses ?? []
    for (const s of statuses.value) statusesStore.cacheStatus(s)
    searched.value = true
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

function navigate(status: Status) {
  void router.push(`/@${status.account.acct}/${status.id}`)
}
</script>

<template>
  <section
    class="flex h-full min-h-0 flex-none flex-col gap-2.5"
    :class="fluid ? 'w-full' : 'w-[392px] max-w-full'"
    :aria-label="t('nav.search')"
  >
    <!-- Column header -->
    <div class="dk-card flex flex-none items-center gap-2.5 rounded-[14px] px-3.5 py-2.5">
      <span class="text-base" aria-hidden="true">🔭</span>
      <span class="dk-mono dk-text text-[13.5px] font-semibold">{{ t('deck.col_search') }}</span>
      <span class="dk-chip">{{ t('deck.scope_search') }}</span>
    </div>

    <!-- Search input -->
    <form class="flex flex-none gap-2" @submit.prevent="runSearch">
      <input
        v-model="query"
        type="search"
        class="dk-input flex-1"
        :placeholder="t('search.placeholder')"
        :aria-label="t('nav.search')"
      />
      <button type="submit" class="dk-btn-accent flex-none !px-4 !text-[13px]" :disabled="loading || !query.trim()">
        {{ t('nav.search') }}
      </button>
    </form>

    <!-- Results -->
    <div data-deck-scroll class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain pb-1.5">
      <div v-if="error" class="dk-card dk-dim-text mb-2.5 px-4 py-3 text-center text-[13px]" role="alert">
        {{ error }}
      </div>

      <div class="flex flex-col" style="gap: var(--dk-gap)">
        <!-- Account results -->
        <div v-if="accounts.length" class="dk-card overflow-hidden">
          <router-link
            v-for="account in accounts"
            :key="account.id"
            :to="`/@${account.acct}`"
            class="dk-hairline-b flex items-center gap-2.5 px-3.5 py-2.5 no-underline last:border-b-0 hover:bg-[var(--dk-surface2)]"
          >
            <span class="dk-avatar block h-9 w-9 flex-none overflow-hidden rounded-[11px]">
              <Avatar :src="account.avatar" :alt="account.display_name" size="sm" />
            </span>
            <span class="flex min-w-0 flex-col">
              <span class="dk-text truncate text-[13.5px] font-bold">{{ account.display_name || account.username }}</span>
              <span class="dk-mono dk-dim-text truncate text-[11px]">@{{ account.acct }}</span>
            </span>
          </router-link>
        </div>

        <!-- Status results -->
        <DeckStatusCard
          v-for="status in statuses"
          :key="status.id"
          :status="status"
          @navigate="navigate"
        />

        <div
          v-if="searched && !loading && statuses.length === 0 && accounts.length === 0"
          class="dk-card dk-dim-text px-5 py-8 text-center text-[13.5px]"
        >
          {{ t('search.no_results') }}
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dk-avatar :deep(img) {
  border-radius: 11px;
  height: 100%;
  width: 100%;
}
</style>
