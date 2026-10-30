const { BUILD_ID, BASE, FILES } = __OFFLINE_CONFIG__;
const CACHE = `sand-bucket-${BUILD_ID}`;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(FILES.map(url => new Request(url, { cache: 'reload' })));
      const html = await cache.match(BASE + 'index.html');
      if (!(await html.text()).includes(`name="sand-bucket-build" content="${BUILD_ID}"`)) {
        throw new Error('Deployment changed while downloading');
      }
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});

function clientBuild(client) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const done = value => { clearTimeout(timer); channel.port1.close(); resolve(value); };
    const timer = setTimeout(() => done(null), 1500);
    channel.port1.onmessage = event => done(typeof event.data?.buildId === 'string' ? event.data.buildId : null);
    try { client.postMessage({ type: 'GET_BUILD' }, [channel.port2]); }
    catch { done(null); }
  });
}

let cleaning;
function cleanCaches() {
  if (cleaning) return cleaning;
  cleaning = (async () => {
    if (self.registration.installing || self.registration.waiting) return;
    const clients = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .filter(client => new URL(client.url).pathname.startsWith(BASE));
    const builds = await Promise.all(clients.map(clientBuild));
    // An older or suspended page may not answer: retain its files until a later check.
    if (builds.includes(null)) return;
    const used = new Set([CACHE, ...builds.map(build => `sand-bucket-${build}`)]);
    const keys = await caches.keys();
    if (self.registration.installing || self.registration.waiting) return;
    await Promise.all(keys.filter(key => key.startsWith('sand-bucket-') && !used.has(key)).map(key => caches.delete(key)));
  })().finally(() => { cleaning = undefined; });
  return cleaning;
}

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim().then(cleanCaches));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'GET_BUILD') event.ports[0]?.postMessage({ buildId: BUILD_ID });
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'CLEAN_CACHES') event.waitUntil(cleanCaches());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === 'navigate') return (await cache.match(BASE + 'index.html')) || fetch(event.request);
    const current = await cache.match(event.request, { ignoreSearch: true });
    if (current) return current;
    if (url.pathname.startsWith(BASE + 'assets/')) {
      for (const key of await caches.keys()) {
        if (!key.startsWith('sand-bucket-') || key === CACHE) continue;
        const old = await (await caches.open(key)).match(event.request, { ignoreSearch: true });
        if (old) return old;
      }
    }
    return fetch(event.request);
  })());
});
