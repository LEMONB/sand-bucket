export interface UpdateDestination { level: number; play: boolean }
const PARAMS = ['_sb_update', '_sb_level', '_sb_play'] as const;

export function readUpdateResume(url: URL, unlocked: number): { attempted: string | null; destination: UpdateDestination | null } {
  const attempted = url.searchParams.get(PARAMS[0]);
  const level = Number(url.searchParams.get(PARAMS[1]));
  const destination = attempted && Number.isSafeInteger(level) && level >= 1 && level <= unlocked
    ? { level, play: url.searchParams.get(PARAMS[2]) === '1' } : null;
  PARAMS.forEach(key => url.searchParams.delete(key));
  return { attempted, destination };
}

export function updateURL(url: URL, build: string, destination: UpdateDestination): string {
  url.searchParams.set(PARAMS[0], build);
  url.searchParams.set(PARAMS[1], String(destination.level));
  url.searchParams.set(PARAMS[2], destination.play ? '1' : '0');
  return url.href;
}

export class GameUpdates {
  private pending: string | null = null;
  private reloading = false;
  private checking: Promise<void> | null = null;
  private registration?: ServiceWorkerRegistration;
  constructor(private idleDestination: () => UpdateDestination | null, private attempted: string | null, private status: (text: string) => void) {}

  apply(destination: UpdateDestination): boolean {
    if (this.reloading) return true;
    if (!this.pending || this.pending === this.attempted) return false;
    this.reloading = true;
    location.replace(updateURL(new URL(location.href), this.pending, destination));
    return true;
  }

  private inspectController = (): void => {
    const controller = navigator.serviceWorker.controller;
    if (!controller) return;
    const channel = new MessageChannel();
    const timer = setTimeout(() => channel.port1.close(), 3000);
    channel.port1.onmessage = event => {
      clearTimeout(timer); channel.port1.close();
      if (controller !== navigator.serviceWorker.controller || typeof event.data?.buildId !== 'string') return;
      this.pending = event.data.buildId === __BUILD_ID__ ? null : event.data.buildId;
      const destination = this.idleDestination();
      if (!document.hidden && destination) this.apply(destination);
    };
    controller.postMessage({ type: 'GET_BUILD' }, [channel.port2]);
  };

  private check = (): Promise<void> => {
    if (document.hidden) return Promise.resolve();
    if (this.checking) return this.checking;
    this.inspectController();
    this.checking = (async () => {
      this.registration ??= await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL, updateViaCache: 'none',
      });
      this.registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
      await this.registration.update();
      navigator.serviceWorker.controller?.postMessage({ type: 'CLEAN_CACHES' });
    })().catch(() => {
      if (!this.registration) this.status('Офлайн-загрузка недоступна. Пока играй с интернетом.');
    }).finally(() => { this.checking = null; });
    return this.checking;
  };

  async start(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'GET_BUILD') event.ports[0]?.postMessage({ buildId: __BUILD_ID__ });
    });
    navigator.serviceWorker.addEventListener('controllerchange', this.inspectController);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void this.check(); });
    window.addEventListener('online', () => { void this.check(); });
    setInterval(() => { void this.check(); }, 60_000);
    void navigator.serviceWorker.ready.then(() => {
      this.status('Можно играть без интернета');
      this.inspectController();
    });
    await this.check();
  }
}
