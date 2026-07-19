<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore, type ColumnType } from '@/stores/ui'
import { useNotificationsStore } from '@/stores/notifications'
import { useAnnouncementsStore } from '@/stores/announcements'
import { useDeckColumns } from '../composables/useDeckColumns'
import { useRecommendedTimelineFeature } from '@/composables/useRecommendedTimelineFeature'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()
const notifStore = useNotificationsStore()
const announcementsStore = useAnnouncementsStore()
const { available: recommendedAvailable } = useRecommendedTimelineFeature()
const { configRows } = useDeckColumns()
const moreOpen = ref(false)

interface MobileMenuEntry {
  path: string
  label: string
  emoji: string
  badge?: string
}

const unreadBadge = computed(() => {
  const n = notifStore.unreadCount
  return n > 99 ? '99+' : n > 0 ? String(n) : ''
})

const announcementBadge = computed(() => {
  if (!auth.isAuthenticated) return ''
  const count = announcementsStore.unreadCount
  return count > 99 ? '99+' : count > 0 ? String(count) : ''
})

const timelineEntries = computed<MobileMenuEntry[]>(() => [
  ...(recommendedAvailable.value
    ? [{ path: '/timelines/recommended', label: t('timeline.ai_recommended_nav'), emoji: '✨' }]
    : []),
  { path: '/timelines/home', label: t('deck.nav_home'), emoji: '🏠' },
  { path: '/timelines/local', label: t('deck.nav_local'), emoji: '🦬' },
  { path: '/timelines/social', label: t('deck.nav_social'), emoji: '🫂' },
  { path: '/timelines/federated', label: t('deck.nav_federated'), emoji: '📡' },
])

const mainMenuEntries = computed<MobileMenuEntry[]>(() => [
  { path: '/home', label: t('deck.deck'), emoji: '🗂️' },
  ...timelineEntries.value,
  ...(auth.isAuthenticated ? [
    { path: '/announcements', label: t('nav.announcements'), emoji: '📢', badge: announcementBadge.value },
    { path: '/notifications', label: t('deck.nav_alerts'), emoji: '🔔', badge: unreadBadge.value },
  ] : []),
  { path: '/search', label: t('nav.search'), emoji: '🔭' },
])

const utilityMenuEntries = computed<MobileMenuEntry[]>(() => [
  ...(auth.isAuthenticated
    ? [{ path: '/invitations', label: t('settings.invitations'), emoji: '✉️' }]
    : []),
  { path: '/bookmarks', label: t('nav.bookmarks'), emoji: '🔖' },
  { path: '/favourites', label: t('nav.favourites'), emoji: '⭐' },
  { path: '/lists', label: t('nav.lists'), emoji: '📋' },
  { path: '/followed_tags', label: t('nav.followed_tags'), emoji: '#️⃣' },
  { path: '/directory', label: t('nav.directory'), emoji: '📖' },
  { path: '/follow-requests', label: t('nav.follow_requests'), emoji: '🤝' },
  { path: '/about', label: t('nav.about'), emoji: 'ℹ️' },
  ...(auth.isAuthenticated
    ? [{ path: '/settings', label: t('nav.settings'), emoji: '⚙️' }]
    : [{ path: '/login', label: t('auth.login'), emoji: '🔑' }]),
  ...(auth.isAdmin || auth.isModerator
    ? [{ path: '/admin', label: t('nav.admin'), emoji: '🛡️' }]
    : []),
])

const myProfilePath = computed(() => {
  const acct = auth.currentUser?.acct || auth.currentUser?.username
  return acct ? `/@${acct}` : '/settings/profile'
})

function isActive(path: string): boolean {
  return path === '/home' ? route.name === 'home' : route.path.startsWith(path)
}

const isOnDeck = computed(() => route.name === 'home')

const COLUMN_EMOJI: Record<ColumnType, string> = {
  recommended: '✨',
  home: '🏠',
  social: '🫂',
  local: '🦬',
  federated: '📡',
  notifications: '🔔',
  search: '🔭',
  follow_requests: '🤝',
}

const COLUMN_LABEL_KEYS: Record<ColumnType, string> = {
  recommended: 'timeline.ai_recommended_nav',
  home: 'deck.col_home',
  social: 'deck.col_social',
  local: 'deck.col_local',
  federated: 'deck.col_federated',
  notifications: 'deck.col_notifications',
  search: 'deck.col_search',
  follow_requests: 'deck.col_requests',
}

// Tapping the deck tab while already on the deck opens the column picker
function handleDeckTab(event: Event) {
  moreOpen.value = false
  if (isOnDeck.value) {
    event.preventDefault()
    ui.toggleDeckMenu()
  } else {
    ui.closeDeckMenu()
  }
}

async function selectColumn(type: ColumnType) {
  ui.setMobileColumn(type)
  if (!isOnDeck.value) {
    try {
      await router.push('/home')
    } catch {
      // Ignore duplicated navigations
    }
  }
}

function closeMenus() {
  moreOpen.value = false
  ui.closeDeckMenu()
}

function toggleMore() {
  ui.closeDeckMenu()
  moreOpen.value = !moreOpen.value
}

function openColumnPicker() {
  moreOpen.value = false
  ui.toggleDeckMenu()
}

async function logout() {
  closeMenus()
  await auth.logout()
  void router.push('/')
}

watch(() => route.fullPath, closeMenus)
</script>

<template>
  <nav class="dk-hairline-t flex flex-none items-center justify-around px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]" :aria-label="t('nav.main_navigation')">
    <router-link
      to="/home"
      class="dk-dim-text relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-1 no-underline"
      :class="{ 'dk-text': isActive('/home') }"
      :aria-label="t('deck.deck')"
      :aria-expanded="isOnDeck ? ui.deckMenuOpen : undefined"
      @click="handleDeckTab"
    >
      <span class="text-lg" aria-hidden="true">🗂️</span>
      <span class="dk-rail-label">{{ t('deck.deck') }}</span>
      <!-- Hint: re-tapping opens the column picker -->
      <span
        v-if="isOnDeck"
        class="dk-mono absolute -top-0.5 right-0.5 text-[9px] leading-none transition-transform"
        :class="ui.deckMenuOpen ? 'rotate-180' : ''"
        aria-hidden="true"
      >▲</span>
    </router-link>

    <router-link
      v-if="auth.isAuthenticated"
      to="/notifications"
      class="dk-dim-text relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-1 no-underline"
      :class="{ 'dk-text': isActive('/notifications') }"
      :aria-label="t('nav.notifications')"
      @click="closeMenus()"
    >
      <span class="text-lg" aria-hidden="true">🔔</span>
      <span class="dk-rail-label">{{ t('deck.nav_alerts') }}</span>
      <span v-if="unreadBadge" class="dk-rail-badge">{{ unreadBadge }}</span>
    </router-link>

    <button
      v-if="auth.isAuthenticated"
      type="button"
      class="dk-btn-accent -mt-4 h-12 w-12 rounded-full !p-0"
      :aria-label="t('deck.note')"
      @click="closeMenus(); ui.openComposeModal()"
    >
      <svg class="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
      </svg>
    </button>

    <button
      type="button"
      class="dk-dim-text relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-1 no-underline"
      :class="{ 'dk-text': moreOpen }"
      :aria-label="t('nav.more')"
      :aria-expanded="moreOpen"
      @click="toggleMore"
    >
      <span class="text-lg" aria-hidden="true">⋯</span>
      <span class="dk-rail-label">{{ t('nav.more') }}</span>
      <span v-if="announcementBadge" class="dk-rail-badge">{{ announcementBadge }}</span>
    </button>

    <!-- Full navigation menu, mirroring the desktop rail -->
    <Teleport to="body">
      <div
        v-if="moreOpen"
        class="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm md:hidden"
        aria-hidden="true"
        @click="moreOpen = false"
      />
      <div
        v-if="moreOpen"
        class="dk-app dk-card fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+3.9rem)] z-[61] max-h-[calc(100dvh-6.5rem)] overflow-y-auto overscroll-contain p-2 md:hidden"
        role="menu"
        :aria-label="t('nav.more')"
      >
        <div v-if="auth.currentUser" class="dk-hairline-b mb-1 px-3 py-3">
          <p class="dk-text truncate text-sm font-semibold">
            {{ auth.currentUser.display_name || auth.currentUser.username }}
          </p>
          <p class="dk-dim-text truncate text-xs">@{{ auth.currentUser.acct }}</p>
        </div>

        <p class="dk-mono dk-dim-text px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide">
          {{ t('nav.main_navigation') }}
        </p>
        <router-link
          v-for="entry in mainMenuEntries"
          :key="entry.path"
          :to="entry.path"
          class="dk-menu-item w-full no-underline !py-3"
          :style="isActive(entry.path) ? 'color: var(--dk-acc)' : ''"
          :data-mobile-menu-path="entry.path"
          role="menuitem"
          @click="closeMenus"
        >
          <span aria-hidden="true">{{ entry.emoji }}</span>
          <span class="flex-1 text-left">{{ entry.label }}</span>
          <span v-if="entry.badge" class="dk-rail-badge !static">{{ entry.badge }}</span>
        </router-link>
        <button
          type="button"
          class="dk-menu-item w-full !py-3"
          role="menuitem"
          @click="openColumnPicker"
        >
          <span aria-hidden="true">⚏</span>
          <span class="flex-1 text-left">{{ t('deck.columns_title') }}</span>
        </button>

        <div class="dk-hairline-b my-1" aria-hidden="true" />
        <router-link
          v-for="entry in utilityMenuEntries"
          :key="entry.path"
          :to="entry.path"
          class="dk-menu-item w-full no-underline !py-3"
          :style="isActive(entry.path) ? 'color: var(--dk-acc)' : ''"
          :data-mobile-menu-path="entry.path"
          role="menuitem"
          @click="closeMenus"
        >
          <span aria-hidden="true">{{ entry.emoji }}</span>
          <span class="flex-1 text-left">{{ entry.label }}</span>
        </router-link>

        <template v-if="auth.isAuthenticated">
          <div class="dk-hairline-b my-1" aria-hidden="true" />
          <router-link
            :to="myProfilePath"
            class="dk-menu-item w-full no-underline !py-3"
            :data-mobile-menu-path="myProfilePath"
            role="menuitem"
            @click="closeMenus"
          >
            <span aria-hidden="true">👤</span><span>{{ t('nav.profile') }}</span>
          </router-link>
          <router-link
            to="/aurora/home"
            class="dk-menu-item w-full no-underline !py-3"
            data-mobile-menu-path="/aurora/home"
            role="menuitem"
            @click="closeMenus"
          >
            <span aria-hidden="true">🌌</span><span>{{ t('deck.design_aurora') }}</span>
          </router-link>
          <a href="/old/" class="dk-menu-item w-full no-underline !py-3" data-mobile-menu-path="/old/" role="menuitem">
            <span aria-hidden="true">🕰️</span><span>{{ t('deck.design_classic') }}</span>
          </a>
          <button type="button" class="dk-menu-item w-full !py-3" role="menuitem" @click="logout">
            <span aria-hidden="true">🚪</span><span>{{ t('auth.logout') }}</span>
          </button>
        </template>
      </div>
    </Teleport>

    <!-- Deck column picker (opens when the deck tab is tapped again) -->
    <Teleport to="body">
      <div
        v-if="ui.deckMenuOpen"
        class="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm md:hidden"
        aria-hidden="true"
        @click="ui.closeDeckMenu()"
      />
      <div
        v-if="ui.deckMenuOpen"
        class="dk-app dk-card fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+3.9rem)] z-[61] max-h-[calc(100dvh-6.5rem)] overflow-y-auto overscroll-contain p-2 md:hidden"
        role="menu"
        :aria-label="t('settings.columns')"
      >
        <p class="dk-mono dk-dim-text px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide">
          {{ t('settings.columns') }}
        </p>
        <button
          v-for="type in configRows"
          :key="type"
          type="button"
          class="dk-menu-item w-full touch-manipulation !py-3"
          :style="ui.mobileColumn === type ? 'color: var(--dk-acc)' : ''"
          role="menuitemradio"
          :aria-checked="ui.mobileColumn === type"
          @click="selectColumn(type)"
        >
          <span aria-hidden="true">{{ COLUMN_EMOJI[type] }}</span>
          <span class="flex-1 text-left">{{ t(COLUMN_LABEL_KEYS[type]) }}</span>
          <span v-if="type === 'notifications' && unreadBadge" class="dk-rail-badge !static">{{ unreadBadge }}</span>
          <span v-if="ui.mobileColumn === type" aria-hidden="true">✓</span>
        </button>
      </div>
    </Teleport>
  </nav>
</template>
