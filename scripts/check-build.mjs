import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const worker = readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8');
const handlers = new Map();
const stored = new Map();
const cache = {
  async addAll(files) {
    for (const url of files) {
      const path = new URL(`../dist/${url.replace('/sand-bucket/', '')}`, import.meta.url);
      assert(existsSync(path), `Missing offline asset: ${url}`);
      stored.set(url, readFileSync(path));
    }
  },
  async match(request) {
    return stored.get(typeof request === 'string' ? request : new URL(request.url).pathname);
  },
};
runInNewContext(worker, {
  URL,
  self: { location: { origin: 'https://example.test' }, addEventListener: (name, handler) => handlers.set(name, handler) },
  caches: { open: async () => cache },
  fetch: () => { throw new Error('Network unavailable'); },
});
let pending;
handlers.get('install')({ waitUntil: (promise) => { pending = promise; } });
await pending;
assert(stored.has('/sand-bucket/index.html'), 'Offline shell must include index.html');
handlers.get('fetch')({
  request: { method: 'GET', mode: 'navigate', url: 'https://example.test/sand-bucket/' },
  respondWith: (promise) => { pending = promise; },
});
assert((await pending).toString().includes('<title>Sand Bucket</title>'));
for (const [url, bytes] of stored) {
  handlers.get('fetch')({
    request: { method: 'GET', mode: 'cors', url: `https://example.test${url}` },
    respondWith: (promise) => { pending = promise; },
  });
  assert.equal(await pending, bytes, `Offline cache miss: ${url}`);
}
console.log(`Offline build verified: HTML and ${stored.size - 1} assets available without network.`);
