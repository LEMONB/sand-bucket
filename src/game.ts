export const WIDTH = 128;
export const HEIGHT = 128;
export const FIELD_COLUMNS = 4;
export const BELT_LIMIT = 5;
export const LOOP_TICKS = 360;
export const COLLECTION_DEPTH = 5;
export const LAUNCH_TICKS = 18;
export const PALETTE = ['#000000', '#51b8ad', '#ed846e', '#f4cf73', '#b8acd6'];
export const COLOR_NAMES = ['', 'Мятное', 'Коралловое', 'Золотое', 'Сиреневое'];

export interface BucketSpec {
  id: number;
  color: number;
  capacity: number;
}

export interface Level {
  cells: Uint8Array;
  field: (BucketSpec | null)[];
  columns?: number;
  walls?: number[];
}

export interface Bucket extends BucketSpec {
  filled: number;
  arrivalTick: number;
}

export type Status = 'playing' | 'won' | 'lost';
export type LaunchResult = 'ok' | 'full' | 'blocked' | 'empty' | 'finished';
export type Speed = 1 | 2;

export interface GameEvent {
  type: 'launch' | 'arrive' | 'complete' | 'collect';
  tick: number;
  slot: number;
  bucket: Bucket;
  path?: number[];
  from?: { x: number; y: number };
  amount?: number;
}

export function exitPaths(field: readonly (BucketSpec | null)[], columns = FIELD_COLUMNS, walls: ReadonlySet<number> = new Set()): Map<number, number[]> {
  const paths = new Map<number, number[]>();
  const parents = new Int16Array(field.length).fill(-2);
  const pending: number[] = [];
  for (let i = 0; i < columns; i++) { pending.push(i); parents[i] = -1; }
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const index = pending[cursor];
    if (walls.has(index)) continue;
    if (field[index]) {
      const path = [index];
      while (parents[path[path.length - 1]] !== -1) path.push(parents[path[path.length - 1]]);
      paths.set(index, path);
      continue;
    }
    const x = index % columns;
    for (const next of [index - columns, index + columns, x > 0 ? index - 1 : -1, x < columns - 1 ? index + 1 : -1]) {
      if (next >= 0 && next < field.length && parents[next] === -2) {
        parents[next] = index; pending.push(next);
      }
    }
  }
  return paths;
}

export function accessibleCells(field: readonly (BucketSpec | null)[], columns = FIELD_COLUMNS, walls: ReadonlySet<number> = new Set()): Set<number> {
  return new Set(exitPaths(field, columns, walls).keys());
}

export class Game {
  readonly columns: number;
  readonly walls: ReadonlySet<number>;
  readonly events: GameEvent[] = [];
  paths: Map<number, number[]>;
  private settled = false;
  readonly cells: Uint8Array;
  readonly field: (BucketSpec | null)[];
  readonly slots: (Bucket | null)[] = Array(BELT_LIMIT).fill(null);
  readonly total: number;
  collected = 0;
  tick = 0;
  status: Status = 'playing';
  revision = 0;
  private quietTicks = 0;

  constructor(level: Level) {
    this.columns = level.columns ?? FIELD_COLUMNS;
    this.walls = new Set(level.walls ?? []);
    if (!Number.isInteger(this.columns) || this.columns < 4 || this.columns > 7 ||
        level.cells.length !== WIDTH * HEIGHT || level.field.length !== this.columns ** 2) {
      throw new Error('Неверный размер уровня');
    }
    if ([...this.walls].some(i => !Number.isInteger(i) || i < 0 || i >= level.field.length || level.field[i] !== null)) {
      throw new Error('Неверные стены уровня');
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
    for (const bucket of level.field) {
      if (!bucket) continue;
      if (!Number.isInteger(bucket.id) || bucket.id < 0 || ids.has(bucket.id) ||
          !Number.isInteger(bucket.color) || bucket.color < 1 || bucket.color >= PALETTE.length ||
          !Number.isInteger(bucket.capacity) || bucket.capacity <= 0) {
        throw new Error('Неверные параметры ведра');
      }
      ids.add(bucket.id);
      space[bucket.color] += bucket.capacity;
    }
    if (sand.slice(1).some((count, i) => count !== space[i + 1])) {
      throw new Error('Количество песка не совпадает с вместимостью вёдер');
    }
    this.cells = level.cells.slice();
    this.field = level.field.map((bucket) => bucket ? { ...bucket } : null);
    this.paths = exitPaths(this.field, this.columns, this.walls);
    this.total = sand.slice(1).reduce((a, b) => a + b, 0);
    if (!this.total) this.status = 'won';
  }

  get buckets(): Bucket[] {
    return this.slots.filter((bucket): bucket is Bucket => bucket !== null);
  }

  /** Shared phase and fixed offsets keep all five slots evenly spaced. */
  slotPosition(slot: number): number {
    return ((this.tick % LOOP_TICKS) / LOOP_TICKS + slot / BELT_LIMIT) % 1;
  }

  launch(bucketId: number): LaunchResult {
    if (this.status !== 'playing') return 'finished';
    const index = this.field.findIndex((bucket) => bucket?.id === bucketId);
    if (index < 0) return 'empty';
    if (!this.paths.has(index)) return 'blocked';
    const slot = this.slots.indexOf(null);
    if (slot < 0) return 'full';
    this.slots[slot] = { ...this.field[index]!, filled: 0, arrivalTick: this.tick + LAUNCH_TICKS };
    this.events.push({ type: 'launch', tick: this.tick, slot, bucket: { ...this.slots[slot] }, path: this.paths.get(index)! });
    this.field[index] = null;
    this.paths = exitPaths(this.field, this.columns, this.walls);
    this.quietTicks = 0;
    return 'ok';
  }

  step(): void {
    if (this.status !== 'playing') return;
    this.tick++;
    let changed = false;
    for (let slot = 0; slot < BELT_LIMIT; slot++) {
      const bucket = this.slots[slot];
      if (!bucket || this.tick < bucket.arrivalTick) continue;
      if (this.tick === bucket.arrivalTick) this.events.push({ type: 'arrive', tick: this.tick, slot, bucket: { ...bucket } });
      const beforeFill = bucket.filled;
      let sourceX = 0, sourceY = 0;
      const center = Math.floor(this.slotPosition(slot) * WIDTH);
      for (let y = HEIGHT - 1; y >= HEIGHT - COLLECTION_DEPTH && bucket.filled < bucket.capacity; y--) {
        for (let x = Math.max(0, center - 7); x <= Math.min(WIDTH - 1, center + 7) && bucket.filled < bucket.capacity; x++) {
          const index = y * WIDTH + x;
          if (this.cells[index] === bucket.color) {
            sourceX += x; sourceY += y;
            this.cells[index] = 0;
            bucket.filled++;
            this.collected++;
            changed = true;
          }
        }
      }
      const amount = bucket.filled - beforeFill;
      if (amount) this.events.push({ type: 'collect', tick: this.tick, slot, bucket: { ...bucket }, amount, from: { x: (sourceX / amount + .5) / WIDTH, y: (sourceY / amount + .5) / HEIGHT } });
      if (bucket.filled === bucket.capacity) {
        this.events.push({ type: 'complete', tick: this.tick, slot, bucket: { ...bucket } });
        this.slots[slot] = null;
      }
    }

    const collected = changed;
    let moved = false;
    if (!this.settled || collected) {
      // Bottom-up traversal lets each grain move at most one row per simulation tick.
      for (let y = HEIGHT - 2; y >= 0; y--) {
        for (let i = 0; i < WIDTH; i++) {
          const x = this.tick % 2 ? i : WIDTH - 1 - i;
          const index = y * WIDTH + x;
          if (this.cells[index] === 0) continue;
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
          moved = true;
        }
      }
      this.settled = !moved;
    }
    if (changed) {
      this.revision++;
      this.quietTicks = 0;
    } else {
      this.quietTicks++;
    }
    if (this.collected === this.total) {
      this.status = 'won';
    } else if (this.quietTicks >= LOOP_TICKS &&
        (this.slots.every(Boolean) || this.paths.size === 0) && !this.slots.some(b => b && b.arrivalTick > this.tick)) {
      this.status = 'lost';
    }
  }
}

/** Both speed modes execute the same fixed simulation steps, never larger steps. */
export function advanceFrame(game: Game, seconds: number, speed: Speed, remainder: number): number {
  remainder += Math.max(0, Math.min(seconds, 0.1)) * speed;
  while (remainder + 1e-10 >= 1 / 60) {
    game.step();
    remainder -= 1 / 60;
  }
  return Math.max(0, remainder);
}
