import * as Sentry from '@sentry/vue';
import { watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useInstanceStore } from '@/stores/instance';
import { useNotificationsStore } from '@/stores/notifications';
import { useTimelinesStore } from '@/stores/timelines';

export default defineNuxtPlugin((nuxtApp) => {
  const auth = useAuthStore();
  const instance = useInstanceStore();
  const notifications = useNotificationsStore();
  const timelines = useTimelinesStore();
  const config = useRuntimeConfig();

  function connectDefaultStreams() {
    if (!auth.token) return;

    timelines.connectStream(auth.token, 'user', 'home');
    notifications.connectStream(auth.token);
  }

  const sentryDsn = config.public.sentryDsn;
  if (sentryDsn) {
    Sentry.init({
      app: nuxtApp.vueApp,
      dsn: sentryDsn,
      tracesSampleRate: 0.1,
    });
  }

  auth.syncTokenFromCookie();
  auth.setReady(true);

  const backgroundTasks: Promise<void>[] = [instance.init()];
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
    connectDefaultStreams();

    watch(
      () => auth.token,
      (token) => {
        if (token) {
          connectDefaultStreams();
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
