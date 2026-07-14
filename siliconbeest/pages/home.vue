<script setup lang="ts">
import DeckView from '@/deck/views/DeckView.vue';
import { useAuthStore } from '@/stores/auth';
import {
  useUiStore,
  type ServerUiPreferences,
} from '@/stores/ui';
import type { Preferences } from '@/api/mastodon/preferences';

definePageMeta({ name: 'home' });

const auth = useAuthStore();
const ui = useUiStore();
const nuxtApp = useNuxtApp();

interface HomeUiPreferencesState {
  tokenFingerprint: string;
  preferences: ServerUiPreferences | null;
}

async function fingerprintAccessToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(`home-ui:${token}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

const initialUiPreferences = useState<HomeUiPreferencesState | undefined>(
  'home-ui-preferences',
  () => undefined,
);

const requestToken = auth.token;

if (requestToken) {
  // Bind the SSR payload to the session without serializing the bearer token
  // itself into Nuxt's page payload.
  const requestTokenFingerprint = await fingerprintAccessToken(requestToken);
  // SSR always refreshes this request-scoped state. During initial hydration
  // the client reuses that payload; later SPA visits fetch for the current
  // account instead of reusing a previous session's value.
  const shouldFetch =
    import.meta.server ||
    !nuxtApp.isHydrating ||
    initialUiPreferences.value?.tokenFingerprint !== requestTokenFingerprint;
  if (shouldFetch) {
    const requestFetch = useRequestFetch();
    try {
      const preferences = await requestFetch<Preferences>('/api/v1/preferences', {
        headers: { Authorization: `Bearer ${requestToken}` },
      });
      if (auth.token === requestToken) {
        initialUiPreferences.value = {
          tokenFingerprint: requestTokenFingerprint,
          preferences: {
            'ui:columns': preferences['ui:columns'],
            'ui:show_trending': preferences['ui:show_trending'],
          },
        };
      }
    } catch {
      if (auth.token === requestToken) {
        initialUiPreferences.value = {
          tokenFingerprint: requestTokenFingerprint,
          preferences: null,
        };
      }
    }
  }

  if (
    auth.token === requestToken &&
    initialUiPreferences.value?.tokenFingerprint === requestTokenFingerprint
  ) {
    ui.hydrateFromServer(
      requestToken,
      initialUiPreferences.value.preferences,
    );
  }
}
</script>

<template>
  <DeckView />
</template>
