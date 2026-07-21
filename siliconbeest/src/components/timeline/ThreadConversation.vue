<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Status } from '@/types/mastodon'
import StatusCard from '@/components/status/StatusCard.vue'
import DeckStatusCard from '@/deck/components/DeckStatusCard.vue'
import ThreadBranch from './ThreadBranch.vue'
import { buildThreadTree } from './threadTree'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  status: Status
  ancestors: Status[]
  descendants: Status[]
  variant?: 'aurora' | 'deck'
}>(), {
  variant: 'aurora',
})

const emit = defineEmits<{
  navigate: [status: Status]
  deleted: [statusId: string]
}>()

const cardComponent = computed(() => props.variant === 'deck' ? DeckStatusCard : StatusCard)
const replyTree = computed(() => buildThreadTree(props.descendants))
const ancestorOverlayId = ref<string | null>(null)

function handleAncestorOverlay(ancestorId: string, open: boolean) {
  if (open) ancestorOverlayId.value = ancestorId
  else if (ancestorOverlayId.value === ancestorId) ancestorOverlayId.value = null
}
</script>

<template>
  <div
    class="thread-conversation"
    :class="`thread-conversation--${variant}`"
  >
    <section
      v-if="ancestors.length"
      class="thread-context"
      :aria-label="t('status.earlier_conversation')"
    >
      <div class="thread-section-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2m5-2a9 9 0 1 1-9-9" />
        </svg>
        <span>{{ t('status.earlier_conversation') }}</span>
      </div>

      <div class="thread-ancestor-list">
        <div
          v-for="ancestor in ancestors"
          :key="ancestor.id"
          class="thread-ancestor"
          :class="{ 'thread-ancestor--overlay': ancestorOverlayId === ancestor.id }"
        >
          <span class="thread-ancestor-dot" aria-hidden="true" />
          <div class="thread-ancestor-card">
            <component
              :is="cardComponent"
              :status="ancestor"
              @navigate="emit('navigate', $event)"
              @deleted="emit('deleted', $event)"
              @overlay="handleAncestorOverlay(ancestor.id, $event)"
            />
          </div>
        </div>
      </div>
    </section>

    <section class="thread-current" :aria-label="t('status.current_post')">
      <div class="thread-current-label">
        <span class="thread-current-pulse" aria-hidden="true" />
        {{ t('status.current_post') }}
      </div>
      <div class="thread-current-card">
        <component
          :is="cardComponent"
          :status="status"
          expanded
          @navigate="emit('navigate', $event)"
          @deleted="emit('deleted', $event)"
        />
      </div>
    </section>

    <section
      v-if="replyTree.length"
      class="thread-replies"
      :aria-label="t('status.replies_count', { count: descendants.length })"
    >
      <div class="thread-section-label thread-section-label--replies">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm3.75 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm3.75 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM21 12c0 4.556-4.03 8.25-9 8.25a9.76 9.76 0 0 1-2.555-.337A5.97 5.97 0 0 1 5.41 20.97a5.9 5.9 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25S21 7.444 21 12Z" />
        </svg>
        <span>{{ t('status.replies_count', { count: descendants.length }) }}</span>
      </div>

      <ThreadBranch
        :nodes="replyTree"
        :variant="variant"
        @navigate="emit('navigate', $event)"
        @deleted="emit('deleted', $event)"
      />
    </section>
  </div>
</template>

<style scoped>
.thread-conversation {
  --thread-line: color-mix(in oklab, var(--color-brand-500) 52%, var(--color-outline));
  --thread-dot: var(--color-brand-500);
  --thread-dot-ring: var(--color-surface);
  --thread-page: var(--color-canvas);
  --thread-card: var(--color-surface);
  --thread-card-border: var(--color-outline);
  --thread-card-shadow: 0 8px 24px -18px rgb(15 23 42 / 0.38);
}

:global(.dark) .thread-conversation {
  --thread-line: color-mix(in oklab, var(--color-brand-400) 52%, var(--color-outline-dark));
  --thread-dot: var(--color-brand-400);
  --thread-dot-ring: var(--color-surface-dark);
  --thread-page: var(--color-canvas-dark);
  --thread-card: var(--color-surface-dark);
  --thread-card-border: var(--color-outline-dark);
}

.thread-conversation--deck {
  --thread-line: color-mix(in oklab, var(--dk-acc) 54%, var(--dk-border));
  --thread-dot: var(--dk-acc);
  --thread-dot-ring: var(--dk-surface);
  --thread-page: var(--dk-bg);
  --thread-card: var(--dk-surface);
  --thread-card-border: var(--dk-border);
  --thread-card-shadow: none;
}

.thread-section-label,
.thread-current-label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: fit-content;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: color-mix(in oklab, var(--thread-dot) 76%, currentColor);
}

.thread-section-label svg {
  width: 1rem;
  height: 1rem;
}

.thread-context {
  margin-bottom: 1rem;
}

.thread-context > .thread-section-label {
  margin: 0 0 0.6rem 0.4rem;
}

.thread-ancestor-list {
  position: relative;
  margin-left: 1rem;
  padding-left: 1.15rem;
  border-left: 2px solid var(--thread-line);
}

.thread-ancestor {
  position: relative;
}

.thread-ancestor--overlay {
  z-index: 3;
}

.thread-ancestor + .thread-ancestor {
  margin-top: 0.55rem;
}

.thread-ancestor::before {
  position: absolute;
  top: 1.65rem;
  left: -1.15rem;
  width: 1.15rem;
  border-top: 2px solid var(--thread-line);
  content: '';
}

.thread-ancestor-dot {
  position: absolute;
  z-index: 2;
  top: 1.4rem;
  left: calc(-1.15rem - 5px);
  width: 0.55rem;
  height: 0.55rem;
  border: 2px solid var(--thread-dot-ring);
  border-radius: 999px;
  background: var(--thread-dot);
}

.thread-ancestor-card {
  border: 1px solid var(--thread-card-border);
  border-radius: 0.9rem;
  background: var(--thread-card);
  opacity: 0.86;
}

.thread-conversation--aurora .thread-ancestor-card :deep(article) {
  border-bottom: 0;
  border-radius: inherit;
}

.thread-conversation--deck .thread-ancestor-card {
  border: 0;
  background: transparent;
}

.thread-current {
  position: relative;
  margin: 1rem 0 1.35rem;
}

.thread-current-label {
  position: relative;
  z-index: 2;
  margin: 0 0 -0.55rem 1rem;
  padding: 0.35rem 0.7rem;
  border: 1px solid color-mix(in oklab, var(--thread-dot) 42%, var(--thread-card-border));
  border-radius: 999px;
  background: var(--thread-card);
  box-shadow: 0 5px 16px -10px var(--thread-dot);
  text-transform: none;
}

.thread-current-pulse {
  width: 0.48rem;
  height: 0.48rem;
  border-radius: 999px;
  background: var(--thread-dot);
  box-shadow: 0 0 0 4px color-mix(in oklab, var(--thread-dot) 18%, transparent);
}

.thread-current-card {
  position: relative;
  overflow: visible;
  border: 1px solid color-mix(in oklab, var(--thread-dot) 46%, var(--thread-card-border));
  border-radius: 1rem;
  background: var(--thread-card);
  box-shadow:
    0 0 0 3px color-mix(in oklab, var(--thread-dot) 9%, transparent),
    0 18px 40px -28px var(--thread-dot);
}

.thread-current-card::before {
  position: absolute;
  z-index: 2;
  top: 1rem;
  bottom: 1rem;
  left: -1px;
  width: 3px;
  border-radius: 0 999px 999px 0;
  background: linear-gradient(180deg, var(--thread-dot), color-mix(in oklab, var(--thread-dot) 45%, transparent));
  content: '';
  pointer-events: none;
}

.thread-conversation--aurora .thread-current-card :deep(article) {
  border-bottom: 0;
  border-radius: inherit;
}

.thread-conversation--deck .thread-current-card :deep(.dk-card) {
  border-color: transparent;
}

.thread-replies > .thread-section-label {
  margin: 0 0 0.75rem 0.4rem;
}

@media (max-width: 520px) {
  .thread-ancestor-list {
    margin-left: 0.45rem;
    padding-left: 0.85rem;
  }

  .thread-ancestor::before {
    left: -0.85rem;
    width: 0.85rem;
  }

  .thread-ancestor-dot {
    left: calc(-0.85rem - 5px);
  }
}
</style>
