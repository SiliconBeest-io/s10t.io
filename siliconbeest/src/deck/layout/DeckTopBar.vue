<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { useInstanceStore } from '@/stores/instance'

const { t } = useI18n()
const ui = useUiStore()
const auth = useAuthStore()
const instanceStore = useInstanceStore()

// Instance branding only — same-origin URLs the worker always serves
// (/thumbnail.png falls back to a generated SVG server-side). Never a
// bundled placeholder. Last resort: the instance title's initial letter.
const LOGO_CANDIDATES = ['/thumbnail.png', '/favicon.ico']
const logoIndex = ref(0)
const logoSrc = computed(() => LOGO_CANDIDATES[logoIndex.value] ?? null)

function onLogoError() {
  logoIndex.value += 1
}

function toggleTheme() {
  ui.setTheme(ui.isDark ? 'light' : 'dark')
}
</script>

<template>
  <header class="dk-hairline-b flex flex-none items-center gap-3 px-4 py-2.5 sm:px-[18px]">
    <router-link to="/" class="dk-text flex min-w-0 items-center gap-3.5 no-underline">
      <span
        class="grid h-[38px] w-[38px] flex-none place-items-center overflow-hidden rounded-xl"
        style="background: var(--dk-acc)"
      >
        <img v-if="logoSrc" :src="logoSrc" alt="" class="h-7 w-7 object-contain" @error="onLogoError" />
        <span v-else class="text-[18px] font-extrabold" style="color: var(--dk-acc-ink, #ffffff)">
          {{ (instanceStore.instance?.title || 'S').slice(0, 1) }}
        </span>
      </span>
      <span class="truncate text-[17px] font-extrabold tracking-[-0.3px]">
        {{ instanceStore.instance?.title }}
      </span>
    </router-link>

    <div class="flex-1" />

    <button type="button" class="dk-pill-btn" :aria-label="t('settings.theme')" @click="toggleTheme">
      <span aria-hidden="true">{{ ui.isDark ? '☀' : '☾' }}</span>
      <span class="hidden sm:inline">{{ ui.isDark ? t('settings.themeLight') : t('settings.themeDark') }}</span>
    </button>

    <button
      v-if="auth.isAuthenticated"
      type="button"
      class="dk-btn-accent"
      @click="ui.openComposeModal()"
    >
      <span aria-hidden="true">＋</span>{{ t('deck.note') }}
    </button>
    <router-link v-else to="/login" class="dk-btn-accent no-underline">
      {{ t('auth.login') }}
    </router-link>
  </header>
</template>
