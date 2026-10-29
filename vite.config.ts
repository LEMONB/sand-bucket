import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const base = '/sand-bucket/';

function offline(): Plugin {
  return {
    name: 'offline-game',
    apply: 'build',
    generateBundle(_, bundle) {
      const publicFiles = ['icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'];
      // Vite emits index.html after this hook; include it explicitly in the offline shell.
      const files = [...new Set(['index.html', ...Object.keys(bundle), ...publicFiles])];
      const version = createHash('sha256');
      version.update(readFileSync(new URL('./index.html', import.meta.url)));
      for (const entry of Object.values(bundle)) {
        version.update(entry.type === 'chunk' ? entry.code : entry.source);
      }
      for (const file of publicFiles) {
        version.update(readFileSync(new URL(`./public/${file}`, import.meta.url)));
      }
      const cache = `sand-bucket-${version.digest('hex').slice(0, 12)}`;
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `
const CACHE = ${JSON.stringify(cache)};
const BASE = ${JSON.stringify(base)};
const FILES = ${JSON.stringify(files.map((file) => base + file))};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('sand-bucket-') && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    if (event.request.mode === 'navigate') return (await cache.match(BASE + 'index.html')) || fetch(event.request);
    return (await cache.match(event.request, {ignoreSearch: true})) || fetch(event.request);
  }));
});
`,
      });
    },
  };
}

export default defineConfig({ base, plugins: [offline()] });
