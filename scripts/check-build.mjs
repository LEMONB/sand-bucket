import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const worker = readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8');
const handlers = new Map(), stored = new Map();
let skipped = false;
const cache = {
  async addAll(requests) {
    for (const request of requests) {
      assert.equal(request.cache, 'reload');
      const url = new URL(request.url).pathname;
      const path = new URL(`../dist/${url.replace('/sand-bucket/', '')}`, import.meta.url);
      assert(existsSync(path), `Missing offline asset: ${url}`);
      stored.set(url, new Response(readFileSync(path)));
    }
  },
  async match(request) {
    const key = typeof request === 'string' ? request : new URL(request.url).pathname;
    return stored.get(key)?.clone();
  },
};
runInNewContext(worker, {
  URL,
  Request: class extends Request { constructor(url, options) { super(new URL(url, 'https://example.test'), options); } },
  self: {
    location: { origin: 'https://example.test' },
    addEventListener: (name, handler) => handlers.set(name, handler),
    skipWaiting: async () => { skipped = true; },
  },
  caches: { open: async () => cache, delete: async () => {} },
  fetch: () => { throw new Error('Network unavailable'); },
});
let pending;
handlers.get('install')({ waitUntil: promise => { pending = promise; } });
await pending;
assert(skipped, 'A complete update must activate without closing the game');
assert(stored.has('/sand-bucket/index.html'), 'Offline shell must include index.html');
handlers.get('fetch')({
  request: { method: 'GET', mode: 'navigate', url: 'https://example.test/sand-bucket/' },
  respondWith: promise => { pending = promise; },
});
assert((await (await pending).text()).includes('<title>Sand Bucket</title>'));
for (const [url, response] of stored) {
  handlers.get('fetch')({
    request: { method: 'GET', mode: 'cors', url: `https://example.test${url}` },
    respondWith: promise => { pending = promise; },
  });
  assert.equal(await (await pending).text(), await response.clone().text(), `Offline cache miss: ${url}`);
}
console.log(`Offline build verified: HTML and ${stored.size - 1} assets available without network.`);
