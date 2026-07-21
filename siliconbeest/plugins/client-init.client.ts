import * as Sentry from '@sentry/vue';
import { watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useInstanceStore } from '@/stores/instance';
import { applyAccent } from '@/utils/accent';
import { useNotificationsStore } from '@/stores/notifications';
import { useTimelinesStore } from '@/stores/timelines';

export default defineNuxtPlugin((nuxtApp) => {
  const auth = useAuthStore();
  const instance = useInstanceStore();
  const notifications = useNotificationsStore();
  const timelines = useTimelinesStore();
  const config = useRuntimeConfig();

  function connectNotificationStream() {
    if (!auth.token) return;

    notifications.connectStream(auth.token);
  }

  const sentryDsn = config.public.sentryDsn;
  if (sentryDsn) {
    const feedbackEnabled = String(config.public.sentryFeedback) === 'true';
    Sentry.init({
      app: nuxtApp.vueApp,
      dsn: sentryDsn,
      tracesSampleRate: 0.1,
      integrations: feedbackEnabled
        ? [Sentry.feedbackIntegration({ colorScheme: 'system' })]
        : [],
    });
  }

  auth.syncTokenFromCookie();
  auth.setReady(true);

  const backgroundTasks: Promise<void>[] = [
    instance.init().then(() => {
      // Deck accent color — instance-wide, admin-selected (defaults inside)
      applyAccent(instance.instance?.accent_color);
    }),
  ];
  if (auth.isAuthenticated && auth.token) {
    backgroundTasks.push(
      auth.fetchCurrentUser().then(async () => {
        if (!auth.token) return;
        await Promise.allSettled([
          notifications.fetch(auth.token),
          notifications.loadMarker(auth.token),
        ]);
      }),
    );
  }
  void Promise.allSettled(backgroundTasks);

  nuxtApp.hook('app:mounted', () => {
    connectNotificationStream();

    watch(
      () => auth.token,
      (token) => {
        if (token) {
          connectNotificationStream();
          return;
        }

        timelines.disconnectStream();
        notifications.disconnectStream();
      },
      { flush: 'post' },
    );
  });

  const title = instance.instance?.title || config.public.instanceTitle;
  useHead({
    ...(title ? { title } : {}),
    link: [{ rel: 'icon', href: '/favicon.ico' }],
  });

  const currentVersion = config.public.appVersion || __APP_VERSION__;
  if (currentVersion) {
    const storedVersion = localStorage.getItem('siliconbeest_app_version');
    if (storedVersion && storedVersion !== currentVersion) {
      caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))));
    }
    localStorage.setItem('siliconbeest_app_version', currentVersion);
  }

  if (import.meta.dev) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => {});
    }
    if ('caches' in window) {
      caches.keys()
        .then((names) => Promise.all(names.map((name) => caches.delete(name))))
        .catch(() => {});
    }
    return;
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      setInterval(() => registration.update(), 60 * 60 * 1000);
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    }).catch(() => {});

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }
});
