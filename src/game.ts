export const WIDTH = 128;
export const HEIGHT = 112;
export const BELT_LIMIT = 5;
export const LOOP_TICKS = 720;
export const BELT_LENGTH = 788;
export const TOP_LENGTH = 320;
export const PALETTE = ['#000000', '#51b8ad', '#ed846e', '#f4cf73', '#b8acd6'];
export const COLOR_NAMES = ['', 'Мятное', 'Коралловое', 'Золотое', 'Сиреневое'];

export interface BucketSpec {
  id: number;
  color: number;
  capacity: number;
}

export interface Level {
  cells: Uint8Array;
  queues: BucketSpec[][];
}

export interface Bucket extends BucketSpec {
  filled: number;
  distance: number;
}

export type Status = 'playing' | 'won' | 'lost';
export type LaunchResult = 'ok' | 'full' | 'entrance' | 'empty' | 'finished';

export function createLevel(): Level {
  const cells = new Uint8Array(WIDTH * HEIGHT);
  const counts = [0, 0, 0, 0, 0];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let color = 4;
      if ((x - 89) ** 2 + (y - 28) ** 2 < 18 ** 2) {
        color = 3;
      }
      const ridge = Math.min(89 - 0.92 * (48 - Math.abs(x - 40)), 91 - 0.7 * (39 - Math.abs(x - 105)));
      if (y > ridge) {
        color = 2;
      }
      if (y >= 87 + Math.round(Math.sin(x / 14) * 2)) {
        color = 1;
      }
      cells[y * WIDTH + x] = color;
      counts[color]++;
    }
  }
  const queues = Array.from({ length: 3 }, (_, lane) =>
    [1, 2, 3, 4].map((color, depth) => ({
      id: lane * 4 + depth,
      color,
      capacity: Math.floor(counts[color] / 3) + (lane < counts[color] % 3 ? 1 : 0),
    })),
  );
  return { cells, queues };
}

export class Game {
  readonly cells: Uint8Array;
  readonly queues: BucketSpec[][];
  readonly total: number;
  buckets: Bucket[] = [];
  collected = 0;
  tick = 0;
  status: Status = 'playing';
  revision = 0;
  private quietTicks = 0;

  constructor(level: Level = createLevel()) {
    if (level.cells.length !== WIDTH * HEIGHT) {
      throw new Error('Неверный размер уровня');
    }
    const sand = [0, 0, 0, 0, 0];
    const space = [0, 0, 0, 0, 0];
    const ids = new Set<number>();
    for (const color of level.cells) {
      if (color >= PALETTE.length) {
        throw new Error('Неизвестный цвет песка');
      }
      sand[color]++;
    }
    for (const bucket of level.queues.flat()) {
      if (!Number.isInteger(bucket.color) || bucket.color < 1 || bucket.color >= PALETTE.length ||
          !Number.isInteger(bucket.capacity) || bucket.capacity <= 0 || ids.has(bucket.id)) {
        throw new Error('Неверные параметры ведра');
      }
      ids.add(bucket.id);
      space[bucket.color] += bucket.capacity;
    }
    if (sand.slice(1).some((count, i) => count !== space[i + 1])) {
      throw new Error('Количество песка не совпадает с вместимостью вёдер');
    }
    this.cells = level.cells.slice();
    this.queues = level.queues.map((queue) => queue.map((bucket) => ({ ...bucket })));
    this.total = sand.slice(1).reduce((a, b) => a + b, 0);
    if (!this.total) {
      this.status = 'won';
    }
  }

  launch(lane: number): LaunchResult {
    if (this.status !== 'playing') {
      return 'finished';
    }
    if (!this.queues[lane]?.length) {
      return 'empty';
    }
    if (this.buckets.length >= BELT_LIMIT) {
      return 'full';
    }
    if (this.buckets.some((bucket) => Math.min(bucket.distance, BELT_LENGTH - bucket.distance) < 59)) {
      return 'entrance';
    }
    const spec = this.queues[lane].shift()!;
    this.buckets.push({ ...spec, filled: 0, distance: 0 });
    this.quietTicks = 0;
    return 'ok';
  }

  step(): void {
    if (this.status !== 'playing') {
      return;
    }
    this.tick++;
    let changed = false;
    for (const bucket of this.buckets) {
      bucket.distance = (bucket.distance + BELT_LENGTH / LOOP_TICKS) % BELT_LENGTH;
      if (bucket.distance > TOP_LENGTH) {
        continue;
      }
      const center = Math.round(bucket.distance / TOP_LENGTH * (WIDTH - 1));
      for (let x = Math.max(0, center - 7); x <= Math.min(WIDTH - 1, center + 7); x++) {
        const index = (HEIGHT - 1) * WIDTH + x;
        if (this.cells[index] === bucket.color && bucket.filled < bucket.capacity) {
          this.cells[index] = 0;
          bucket.filled++;
          this.collected++;
          changed = true;
        }
      }
    }
    this.buckets = this.buckets.filter((bucket) => bucket.filled < bucket.capacity);

    // Bottom-up traversal lets each grain move at most one row per simulation tick.
    for (let y = HEIGHT - 2; y >= 0; y--) {
      for (let i = 0; i < WIDTH; i++) {
        const x = this.tick % 2 ? i : WIDTH - 1 - i;
        const index = y * WIDTH + x;
        if (this.cells[index] === 0) {
          continue;
        }
        let target = index + WIDTH;
        if (this.cells[target] !== 0) {
          const direction = (x + this.tick) % 2 ? 1 : -1;
          if (x + direction >= 0 && x + direction < WIDTH && this.cells[target + direction] === 0) {
            target += direction;
          } else if (x - direction >= 0 && x - direction < WIDTH && this.cells[target - direction] === 0) {
            target -= direction;
          } else {
            continue;
          }
        }
        this.cells[target] = this.cells[index];
        this.cells[index] = 0;
        changed = true;
      }
    }
    if (changed) {
      this.revision++;
      this.quietTicks = 0;
    } else {
      this.quietTicks++;
    }
    if (this.collected === this.total) {
      this.status = 'won';
    } else if (this.quietTicks > LOOP_TICKS &&
        (this.buckets.length === BELT_LIMIT || this.queues.every((queue) => queue.length === 0))) {
      // A full lap without any collection or settling proves that waiting cannot help.
      this.status = 'lost';
    }
  }
}
