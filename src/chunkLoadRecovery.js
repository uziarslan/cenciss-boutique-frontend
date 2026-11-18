import {
  activateWaitingServiceWorker,
  getOfflineServiceWorkerRegistration,
} from './serviceWorkerRegistration';

const RECOVERY_KEY = 'cenciss:chunk-recovery';
const RECOVERY_COOLDOWN_MS = 60_000;

const errorMessage = (error) => {
  if (typeof error === 'string') return error;
  return error?.message || '';
};

export const isChunkLoadError = (error) => (
  /importing a module script failed/i.test(errorMessage(error))
  || /failed to fetch dynamically imported module/i.test(errorMessage(error))
  || /error loading dynamically imported module/i.test(errorMessage(error))
  || /loading chunk [\w-]+ failed/i.test(errorMessage(error))
  || /chunkloaderror/i.test(error?.name || '')
);

export const reserveChunkRecovery = ({
  storage,
  now = Date.now(),
  path = '/',
} = {}) => {
  const targetStorage = storage || window.sessionStorage;

  try {
    const previous = JSON.parse(targetStorage.getItem(RECOVERY_KEY) || 'null');
    if (previous?.path === path && now - previous.at < RECOVERY_COOLDOWN_MS) {
      return false;
    }
    targetStorage.setItem(RECOVERY_KEY, JSON.stringify({ path, at: now }));
  } catch {
    // Safari private mode and constrained embedded browsers can deny storage.
    // A module-level reload guard still prevents a loop in the current page.
  }

  return true;
};

let reloadStarted = false;

export const reloadApplicationForUpdate = async () => {
  if (reloadStarted) return;
  reloadStarted = true;

  try {
    const registration = await getOfflineServiceWorkerRegistration();
    const activating = await activateWaitingServiceWorker(registration);

    // controllerchange normally performs the reload. Keep a timeout for Safari
    // versions that occasionally delay or omit that event in standalone mode.
    if (activating) {
      window.setTimeout(() => window.location.reload(), 1500);
      return;
    }
  } catch (error) {
    console.warn('Unable to activate the waiting application update.', error);
  }

  window.location.reload();
};

export const installChunkLoadRecovery = () => {
  window.addEventListener('vite:preloadError', (event) => {
    const error = event.payload || event.detail || new Error('A module failed to load.');
    const path = `${window.location.pathname}${window.location.search}`;

    if (!reserveChunkRecovery({ path })) return;

    event.preventDefault();
    console.error('[ChunkLoadError] Reloading the application with the latest assets.', error);
    void reloadApplicationForUpdate();
  });
};
