import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GameUpdates, readUpdateResume, updateURL, type UpdateDestination } from '../src/updates';

class Channel {
  port1 = { onmessage: null as ((event: { data: unknown }) => void) | null, close() {} };
  port2 = { postMessage: (data: unknown) => this.port1.onmessage?.({ data }) };
}
let current: string;
let destination: UpdateDestination | null;
let registration: { update: ReturnType<typeof vi.fn>; waiting: null };
let serviceWorker: EventTarget & { controller: { postMessage: ReturnType<typeof vi.fn> }; register: ReturnType<typeof vi.fn>; ready: Promise<unknown> };
let page: EventTarget & { hidden: boolean };
let replace: ReturnType<typeof vi.fn>;
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('BASE_URL', '/sand-bucket/');
  current = __BUILD_ID__; destination = { level: 12, play: false };
  registration = { update: vi.fn().mockResolvedValue(undefined), waiting: null };
  serviceWorker = Object.assign(new EventTarget(), {
    controller: { postMessage: vi.fn((message, ports) => {
      if (message.type === 'GET_BUILD') ports[0].postMessage({ buildId: current });
    }) },
    register: vi.fn().mockResolvedValue(registration), ready: Promise.resolve(registration),
  });
  page = Object.assign(new EventTarget(), { hidden: false });
  replace = vi.fn();
  vi.stubGlobal('navigator', { serviceWorker });
  vi.stubGlobal('document', page);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('location', { href: 'https://example.test/sand-bucket/', replace });
  vi.stubGlobal('MessageChannel', Channel);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const updater = (attempted: string | null = null) => new GameUpdates(() => destination, attempted, () => {});

it('does not reload on first install and bypasses the worker HTTP cache', async () => {
  await updater().start();
  expect(replace).not.toHaveBeenCalled();
  expect(serviceWorker.register).toHaveBeenCalledWith('/sand-bucket/sw.js', { scope: '/sand-bucket/', updateViaCache: 'none' });
});
it('updates the menu once without touching progress storage', async () => {
  const storage = { getItem: vi.fn(), setItem: vi.fn(), clear: vi.fn(), removeItem: vi.fn() };
  vi.stubGlobal('localStorage', storage);
  current = 'release-b';
  const updates = updater(); await updates.start();
  serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(replace).toHaveBeenCalledTimes(1);
  expect(new URL(replace.mock.calls[0][0]).searchParams.get('_sb_level')).toBe('12');
  Object.values(storage).forEach(method => expect(method).not.toHaveBeenCalled());
});
it.each(['active level', 'pause', 'result'])('defers an update during %s until an explicit transition', async () => {
  destination = null; current = 'release-b';
  const updates = updater(); await updates.start();
  expect(replace).not.toHaveBeenCalled();
  expect(updates.apply({ level: 13, play: true })).toBe(true);
  const url = new URL(replace.mock.calls[0][0]);
  expect(readUpdateResume(url, 13).destination).toEqual({ level: 13, play: true });
  expect(url.search).toBe('');
});
it('does not loop if a reload unexpectedly serves the old page', async () => {
  current = 'release-b';
  const updates = updater('release-b'); await updates.start();
  expect(updates.apply({ level: 12, play: true })).toBe(false);
  expect(replace).not.toHaveBeenCalled();
});
it('retries registration after reconnect and checks on return to the app', async () => {
  serviceWorker.register.mockRejectedValueOnce(new Error('offline'));
  await updater().start();
  window.dispatchEvent(new Event('online')); await settle();
  expect(serviceWorker.register).toHaveBeenCalledTimes(2);
  const count = registration.update.mock.calls.length;
  page.hidden = true; await vi.advanceTimersByTimeAsync(60_000);
  expect(registration.update).toHaveBeenCalledTimes(count);
  page.hidden = false; page.dispatchEvent(new Event('visibilitychange')); await settle();
  expect(registration.update).toHaveBeenCalledTimes(count + 1);
});
it('coalesces overlapping checks and keeps the old app after a failed download', async () => {
  await updater().start();
  let reject!: (reason: Error) => void;
  registration.update.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  window.dispatchEvent(new Event('online'));
  page.dispatchEvent(new Event('visibilitychange'));
  expect(registration.update).toHaveBeenCalledTimes(2);
  reject(new Error('partial deployment')); await settle();
  expect(replace).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(registration.update).toHaveBeenCalledTimes(3);
});
it('restores replay, next-level and menu destinations without unlocking levels', () => {
  for (const target of [{ level: 5, play: true }, { level: 13, play: true }, { level: 12, play: false }]) {
    const url = new URL(updateURL(new URL('https://example.test/sand-bucket/?other=1#anchor'), 'b', target));
    expect(readUpdateResume(url, 13).destination).toEqual(target);
    expect(url.search).toBe('?other=1'); expect(url.hash).toBe('#anchor');
  }
  expect(readUpdateResume(new URL('https://example.test/?_sb_update=b&_sb_level=400'), 13).destination).toBeNull();
});
