/* Cenciss release-aware app-shell service worker.
 *
 * Every Vite build registers this worker with a unique `v` query parameter.
 * The worker pre-caches that release's generated chunks before it can become
 * active, and a fully cached waiting worker is activated automatically.
 * API requests remain owned by the POS offline queue.
 */
const CACHE_PREFIX = 'cenciss-pos-';
const EMBEDDED_BUILD_ID = '__CENCISS_BUILD_ID__';
const BUILD_ID = (
  EMBEDDED_BUILD_ID.startsWith('__CENCISS_')
    ? new URL(self.location.href).searchParams.get('v') || 'development'
    : EMBEDDED_BUILD_ID
)
  .replace(/[^a-zA-Z0-9._-]/g, '_');
const CACHE = `${CACHE_PREFIX}${BUILD_ID}`;
const APP_SHELL = '/__cenciss_app_shell__';
const CACHE_METADATA = '/__cenciss_cache_metadata__';
const SHELL_URLS = ['/index.html', '/'];
const ASSET_MANIFEST = '/asset-manifest.json';
const MAX_PREVIOUS_RELEASES = 1;

const isCacheableResponse = (response) => (
  response
  && response.ok
  && response.type !== 'opaque'
);

const contentType = (response) => response?.headers.get('content-type') || '';

const isHtmlResponse = (response) => (
  isCacheableResponse(response)
  && contentType(response).includes('text/html')
);

const isUsableAssetResponse = (requestOrUrl, response) => {
  if (!isCacheableResponse(response) || isHtmlResponse(response)) return false;

  const url = new URL(
    typeof requestOrUrl === 'string' ? requestOrUrl : requestOrUrl.url,
    self.location.origin,
  );
  const type = contentType(response).toLowerCase();

  if (/\.m?js$/i.test(url.pathname)) {
    return type.includes('javascript') || type.includes('ecmascript');
  }
  if (/\.css$/i.test(url.pathname)) return type.includes('text/css');
  if (/\.json$/i.test(url.pathname)) return type.includes('json');
  return true;
};

const extractShellAssets = (html) => {
  const assets = new Set();
  const tagPattern = /<(?:script|link)\b[^>]*>/gi;
  let match;

  while ((match = tagPattern.exec(html)) !== null) {
    const tag = match[0];
    const isScript = /^<script\b/i.test(tag);
    const relMatch = tag.match(/\brel=["']([^"']+)["']/i);
    const rels = new Set((relMatch?.[1] || '').toLowerCase().split(/\s+/));
    const isLoadableLink = rels.has('stylesheet') || rels.has('modulepreload') || rels.has('preload');
    if (!isScript && !isLoadableLink) continue;

    const assetMatch = tag.match(/\b(?:src|href)=["']([^"']+)["']/i);
    if (!assetMatch) continue;

    try {
      const url = new URL(assetMatch[1], self.location.origin);
      if (
        url.origin === self.location.origin
        && !url.pathname.startsWith('/api')
        && !url.pathname.endsWith('.map')
      ) {
        assets.add(`${url.pathname}${url.search}`);
      }
    } catch {
      // Ignore malformed and non-URL attributes.
    }
  }

  return [...assets];
};

const extractManifestAssets = (manifest) => {
  const assets = new Set();

  // Retain compatibility with the former Create React App manifest shape.
  if (manifest?.files) {
    Object.values(manifest.files).forEach((url) => {
      if (typeof url === 'string') assets.add(url);
    });
  }

  // Vite's manifest includes entry, shared, and dynamically imported chunks.
  Object.values(manifest || {}).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    [entry.file, ...(entry.css || []), ...(entry.assets || [])].forEach((url) => {
      if (typeof url === 'string') assets.add(url.startsWith('/') ? url : `/${url}`);
    });
  });

  return [...assets].filter((url) => (
    url.startsWith('/')
    && !url.endsWith('.map')
  ));
};

const fetchFresh = (url) => fetch(new Request(url, {
  cache: 'reload',
  credentials: 'same-origin',
}));

const cacheAsset = async (cache, url) => {
  const response = await fetchFresh(url);
  if (!isUsableAssetResponse(url, response)) {
    throw new Error(`Unable to cache a valid asset from ${url}: HTTP ${response.status}`);
  }
  await cache.put(url, response);
};

const cacheAppShell = async (cache) => {
  let lastError;

  for (const url of SHELL_URLS) {
    try {
      const response = await fetchFresh(url);
      if (!isHtmlResponse(response)) {
        throw new Error(`${url} did not return the application HTML`);
      }

      const html = await response.clone().text();
      await cache.put(APP_SHELL, response.clone());
      await cache.put('/index.html', response.clone());
      await cache.put('/', response.clone());
      return extractShellAssets(html);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Unable to cache the application shell');
};

const getManifestAssets = async () => {
  try {
    const response = await fetchFresh(ASSET_MANIFEST);
    if (!isUsableAssetResponse(ASSET_MANIFEST, response)) return [];
    return extractManifestAssets(await response.json());
  } catch {
    // Vite's development server has no production asset manifest. Entry files
    // are still discovered from its generated HTML.
    return [];
  }
};

const writeCacheMetadata = (cache) => cache.put(CACHE_METADATA, new Response(JSON.stringify({
  buildId: BUILD_ID,
  createdAt: Date.now(),
}), {
  headers: { 'content-type': 'application/json' },
}));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const shellAssets = await cacheAppShell(cache);
    const manifestAssets = await getManifestAssets();
    const releaseAssets = [...new Set([...shellAssets, ...manifestAssets])];

    // A new worker must not become update-ready with a partial release. This is
    // what lets an already-open tab continue loading lazy pages after a deploy.
    await Promise.all(releaseAssets.map((url) => cacheAsset(cache, url)));
    await writeCacheMetadata(cache);

    // The release is now complete and safe to use. Activating from the worker
    // itself also upgrades tabs still running an older client that only knew
    // how to show the former manual "Reload" prompt.
    await self.skipWaiting();
  })());
});

const cacheCreatedAt = async (cacheName) => {
  try {
    const cache = await caches.open(cacheName);
    const response = await cache.match(CACHE_METADATA);
    const metadata = await response?.json();
    return Number(metadata?.createdAt) || 0;
  } catch {
    return 0;
  }
};

const cleanupOldReleaseCaches = async () => {
  const keys = await caches.keys();
  const previous = keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE);
  const dated = await Promise.all(previous.map(async (key) => ({
    key,
    createdAt: await cacheCreatedAt(key),
  })));
  dated.sort((a, b) => b.createdAt - a.createdAt);

  await Promise.all(dated
    .slice(MAX_PREVIOUS_RELEASES)
    .map(({ key }) => caches.delete(key)));
};

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await cleanupOldReleaseCaches();
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

const matchReleaseCaches = async (request) => {
  const current = await caches.open(CACHE);
  // Pre-cached requests do not carry the module loader's Origin header. Some
  // static servers add `Vary: Origin`, even for same-origin files, so matching
  // that header would hide an otherwise exact content-hashed cache entry.
  const matchOptions = { ignoreSearch: true, ignoreVary: true };
  const currentMatch = await current.match(request, matchOptions);
  if (currentMatch) return currentMatch;

  const keys = await caches.keys();
  for (const key of keys) {
    if (!key.startsWith(CACHE_PREFIX) || key === CACHE) continue;
    const cache = await caches.open(key);
    const match = await cache.match(request, matchOptions);
    if (match) return match;
  }

  return null;
};

const navigationResponse = async (request) => {
  // A controlled tab must render the shell belonging to THIS worker release.
  // Fetching the newest server HTML here can mix it with an older active worker
  // during a deploy, producing an empty/black page when hashed chunks differ.
  const cache = await caches.open(CACHE);
  const releaseShell = (await cache.match(APP_SHELL))
    || (await cache.match('/index.html'))
    || (await cache.match('/'));
  if (releaseShell) return releaseShell;

  try {
    const response = await fetch(request);
    if (isHtmlResponse(response)) return response;
    throw new Error(`Navigation returned HTTP ${response.status}`);
  } catch {
    return Response.error();
  }
};

const runtimeAssetResponse = async (request) => {
  try {
    const response = await fetch(request);
    if (isUsableAssetResponse(request, response)) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
      return response;
    }

    const cached = await matchReleaseCaches(request);
    return cached || new Response('', {
      status: response.status === 200 ? 404 : response.status,
      statusText: 'Application asset unavailable',
    });
  } catch {
    return (await matchReleaseCaches(request)) || Response.error();
  }
};

const versionedAssetResponse = async (request) => {
  const cached = await matchReleaseCaches(request);
  if (cached) return cached;
  return runtimeAssetResponse(request);
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }

  // Vite content-hashes files under /assets/. Exact URLs are immutable and
  // safe to satisfy from either the current or retained previous release.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(versionedAssetResponse(request));
    return;
  }

  event.respondWith(runtimeAssetResponse(request));
});
