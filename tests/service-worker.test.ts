import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

const base = '/sand-bucket/';
const source = readFileSync(new URL('../scripts/service-worker.js', import.meta.url), 'utf8');
class Channel {
  port1 = { onmessage: null as ((event: { data: unknown }) => void) | null, close() {} };
  port2 = { postMessage: (data: unknown) => this.port1.onmessage?.({ data }) };
}
function worker({ broken = false, mixed = false, closed = false, clients = [] as (string | null)[] } = {}) {
  const stores = new Map<string, Map<string, string>>([
    ['sand-bucket-a', new Map([[base + 'assets/old.js', 'old code']])],
    ['sand-bucket-unused', new Map()], ['other-app', new Map()],
  ]);
  const handlers = new Map<string, (event: any) => void>();
  const skipWaiting = vi.fn().mockResolvedValue(undefined);
  const registration = { installing: null as object | null, waiting: null };
  const cacheAPI = {
    keys: async () => [...stores.keys()],
    delete: async (key: string) => stores.delete(key),
    open: async (key: string) => {
      if (!stores.has(key)) stores.set(key, new Map());
      const store = stores.get(key)!;
      return {
        addAll: async (requests: Request[]) => {
          if (broken) throw new Error('Offline');
          requests.forEach(request => {
            expect(request.cache).toBe('reload');
            store.set(new URL(request.url).pathname, `name="sand-bucket-build" content="${mixed ? 'c' : 'b'}"`);
          });
        },
        match: async (request: string | Request) => {
          const body = store.get(typeof request === 'string' ? request : new URL(request.url).pathname);
          return body === undefined ? undefined : new Response(body);
        },
      };
    },
  };
  runInNewContext(source.replace('__OFFLINE_CONFIG__', JSON.stringify({ BUILD_ID: 'b', BASE: base, FILES: [base + 'index.html'] })), {
    URL, Response, MessageChannel: Channel, setTimeout, clearTimeout,
    Request: class extends Request { constructor(url: string, options: RequestInit) { super(new URL(url, 'https://example.test'), options); } },
    caches: cacheAPI, fetch: () => { throw new Error('Network unavailable'); },
    self: {
      location: { origin: 'https://example.test' }, registration, skipWaiting,
      addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
      clients: {
        claim: async () => {},
        matchAll: async () => clients.map(build => ({ url: `https://example.test${base}`, postMessage: (_: unknown, ports: any[]) => { if (closed) throw new Error('Client closed'); ports[0].postMessage({ buildId: build }); } })),
      },
    },
  });
  const dispatch = async (name: string, data: object = {}) => {
    let pending: Promise<any> | undefined;
    handlers.get(name)!({ ...data, waitUntil: (p: Promise<any>) => { pending = p; }, respondWith: (p: Promise<any>) => { pending = p; } });
    return pending;
  };
  return { stores, skipWaiting, registration, dispatch };
}

it('activates a completely downloaded build and serves it offline', async () => {
  const w = worker(); await w.dispatch('install');
  expect(w.skipWaiting).toHaveBeenCalledOnce();
  const response = await w.dispatch('fetch', { request: { method: 'GET', mode: 'navigate', url: `https://example.test${base}` } });
  expect(await response.text()).toContain('content="b"');
});
it.each([{ broken: true }, { mixed: true }])('retains the previous version when install fails: %j', async options => {
  const w = worker(options);
  await expect(w.dispatch('install')).rejects.toThrow();
  expect(w.skipWaiting).not.toHaveBeenCalled();
  expect(w.stores.has('sand-bucket-b')).toBe(false);
  expect(w.stores.has('sand-bucket-a')).toBe(true);
});
it('keeps another open tab’s build and serves its old lazy-loaded assets offline', async () => {
  const w = worker({ clients: ['a', 'b'] }); await w.dispatch('install'); await w.dispatch('activate');
  expect(w.stores.has('sand-bucket-a')).toBe(true);
  expect(w.stores.has('sand-bucket-unused')).toBe(false);
  expect(w.stores.has('other-app')).toBe(true);
  const response = await w.dispatch('fetch', { request: { method: 'GET', mode: 'cors', url: `https://example.test${base}assets/old.js` } });
  expect(await response.text()).toBe('old code');
});
it('keeps caches for legacy clients that cannot report a build', async () => {
  const w = worker({ clients: [null] }); await w.dispatch('install'); await w.dispatch('activate');
  expect(w.stores.has('sand-bucket-a')).toBe(true);
});
it('does not delete a cache while another update is installing', async () => {
  const w = worker({ clients: ['b'] }); await w.dispatch('install'); w.registration.installing = {};
  await w.dispatch('activate'); expect(w.stores.has('sand-bucket-a')).toBe(true);
  w.registration.installing = null;
  await w.dispatch('message', { data: { type: 'CLEAN_CACHES' } });
  expect(w.stores.has('sand-bucket-a')).toBe(false);
});

it('keeps activation working if a tab closes during the cache check', async () => {
  const w = worker({ clients: ['a'], closed: true });
  await w.dispatch('install'); await w.dispatch('activate');
  expect(w.stores.has('sand-bucket-a')).toBe(true);
});
