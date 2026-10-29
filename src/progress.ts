import { GENERATOR_VERSION, seedFor, type GeneratedLevel } from './generator';
import { validRecord } from './level';
import type { Speed } from './game';
const KEY = 'sand-bucket.progress.v2';
interface Progress { version: number; number: number; seed: number; speed: Speed; current?: GeneratedLevel; next?: GeneratedLevel }
export class ProgressStore {
  available = true;
  data: Progress = { version: GENERATOR_VERSION, number: 1, seed: seedFor(1), speed: 1 };
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>) {
    try {
      const raw = JSON.parse(storage.getItem(KEY) ?? 'null');
      if (raw && Number.isSafeInteger(raw.number) && raw.number >= 1 && raw.number < Number.MAX_SAFE_INTEGER) {
        this.data.number = raw.number;
        this.data.seed = raw.version === GENERATOR_VERSION && Number.isInteger(raw.seed) && raw.seed >= 0 && raw.seed <= 0xffffffff ? raw.seed : seedFor(raw.number);
        this.data.speed = raw.speed === 2 ? 2 : 1;
        if (raw.version === GENERATOR_VERSION) {
          if (validRecord(raw.current, raw.number, this.data.seed)) this.data.current = raw.current;
          if (validRecord(raw.next, raw.number + 1, seedFor(raw.number + 1))) this.data.next = raw.next;
        }
      }
    } catch { this.available = false; }
  }
  save(): void {
    try { this.storage.setItem(KEY, JSON.stringify(this.data)); this.available = true; }
    catch { this.available = false; }
  }
  setSpeed(speed: Speed): void { this.data.speed = speed; this.save(); }
  advance(): void {
    this.data.number++;
    this.data.seed = seedFor(this.data.number);
    this.data.current = this.data.next;
    this.data.next = undefined;
    this.save();
  }
}
