let registrationPromise = null;
const buildId = typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : 'development';

export const getOfflineServiceWorkerRegistration = async () => {
  if (!('serviceWorker' in navigator)) return null;
  if (registrationPromise) return registrationPromise;
  return navigator.serviceWorker.getRegistration();
};

export const activateWaitingServiceWorker = async (registration) => {
  const currentRegistration = registration || await getOfflineServiceWorkerRegistration();
  if (!currentRegistration?.waiting) return false;

  currentRegistration.waiting.postMessage('SKIP_WAITING');
  return true;
};

// Vite development serves a live module graph whose stable /src URLs are not
// compatible with production-style offline caching. Clean up workers left by a
// previous build/preview run so a normal localhost reload always uses Vite.
export const clearOfflineServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('cenciss-pos-'))
      .map((key) => caches.delete(key)));
  }
};

export const registerOfflineServiceWorker = () => {
  if (!('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }

  if (registrationPromise) {
    return registrationPromise;
  }

  const publicUrl = process.env.PUBLIC_URL || '';
  const workerUrl = `${publicUrl}/sw.js?v=${encodeURIComponent(buildId)}`;

  // Completed updates activate automatically. Once the new worker controls the
  // page, reload exactly once so its matching app shell and chunks render.
  const hadControllerAtStartup = Boolean(navigator.serviceWorker.controller);
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadControllerAtStartup || reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });

  registrationPromise = navigator.serviceWorker
    .register(workerUrl, { updateViaCache: 'none' })
    .then((registration) => {
      // This also covers an update that finished installing before this page
      // subscribed to updatefound (for example, while another tab was open).
      void activateWaitingServiceWorker(registration);

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;

        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') {
            void activateWaitingServiceWorker(registration);
          }
        });
      });

      window.addEventListener('online', () => {
        registration.update().catch(() => {});
      });

      return registration;
    })
    .catch((error) => {
      registrationPromise = null;
      // Registration failures should be visible during terminal setup instead
      // of silently leaving the POS without offline refresh support.
      console.warn('POS offline service worker registration failed.', error);
      return null;
    });

  return registrationPromise;
};
