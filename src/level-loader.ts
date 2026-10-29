import { fallbackLevel, validRecord } from './level';
import { seedFor, type GeneratedLevel } from './generator';
import type { ProgressStore } from './progress';

export class LevelLoader {
  private pending = new Map<number, Promise<GeneratedLevel>>();
  constructor(private progress: ProgressStore) {}
  get(number: number): Promise<GeneratedLevel> {
    const data = this.progress.data;
    const seed = number === data.number ? data.seed : seedFor(number);
    const cached = number === data.number ? data.current : data.next;
    if (validRecord(cached, number, seed)) return Promise.resolve(cached);
    const pending = this.pending.get(number);
    if (pending) return pending;
    const promise = new Promise<GeneratedLevel>(resolve => {
      let worker: Worker | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let finished = false;
      const finish = (record?: GeneratedLevel) => {
        if (finished) return;
        finished = true; clearTimeout(timer); worker?.terminate();
        const result = validRecord(record, number, seed) ? record : fallbackLevel(number, seed);
        const current = this.progress.data;
        if (current.number === number) current.current = result;
        else if (current.number + 1 === number) current.next = result;
        this.progress.save(); resolve(result);
      };
      try {
        worker = new Worker(new URL('./level.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = event => finish(event.data.level);
        worker.onerror = () => finish();
        timer = setTimeout(() => finish(), 15_000);
        worker.postMessage({ number, seed });
      } catch { finish(); }
    });
    this.pending.set(number, promise);
    void promise.then(() => this.pending.delete(number));
    return promise;
  }
}
