export const WIDTH = 128;
export const HEIGHT = 112;
export const FIELD_COLUMNS = 4;
export const FIELD_SIZE = 16;
export const BELT_LIMIT = 5;
export const LOOP_TICKS = 360;
export const COLLECTION_DEPTH = 5;
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
}

export interface Bucket extends BucketSpec {
  filled: number;
}

export type Status = 'playing' | 'won' | 'lost';
export type LaunchResult = 'ok' | 'full' | 'blocked' | 'empty' | 'finished';
export type Speed = 1 | 2;

/** Flood the empty cells from the top edge; occupied frontier cells can exit. */
export function accessibleCells(field: readonly (BucketSpec | null)[]): Set<number> {
  const accessible = new Set<number>();
  const visited = new Set<number>();
  const pending = [0, 1, 2, 3];
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const index = pending[cursor];
    if (visited.has(index)) {
      continue;
    }
    visited.add(index);
    if (field[index]) {
      accessible.add(index);
      continue;
    }
    const x = index % FIELD_COLUMNS;
    if (index >= FIELD_COLUMNS) pending.push(index - FIELD_COLUMNS);
    if (index + FIELD_COLUMNS < FIELD_SIZE) pending.push(index + FIELD_COLUMNS);
    if (x > 0) pending.push(index - 1);
    if (x < FIELD_COLUMNS - 1) pending.push(index + 1);
  }
  return accessible;
}

export class Game {
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
    if (level.cells.length !== WIDTH * HEIGHT || level.field.length !== FIELD_SIZE) {
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
    if (!accessibleCells(this.field).has(index)) return 'blocked';
    const slot = this.slots.indexOf(null);
    if (slot < 0) return 'full';
    this.slots[slot] = { ...this.field[index]!, filled: 0 };
    this.field[index] = null;
    this.quietTicks = 0;
    return 'ok';
  }

  step(): void {
    if (this.status !== 'playing') return;
    this.tick++;
    let changed = false;
    for (let slot = 0; slot < BELT_LIMIT; slot++) {
      const bucket = this.slots[slot];
      if (!bucket) continue;
      const center = Math.floor(this.slotPosition(slot) * WIDTH);
      for (let y = HEIGHT - 1; y >= HEIGHT - COLLECTION_DEPTH && bucket.filled < bucket.capacity; y--) {
        for (let x = Math.max(0, center - 7); x <= Math.min(WIDTH - 1, center + 7) && bucket.filled < bucket.capacity; x++) {
          const index = y * WIDTH + x;
          if (this.cells[index] === bucket.color) {
            this.cells[index] = 0;
            bucket.filled++;
            this.collected++;
            changed = true;
          }
        }
      }
      if (bucket.filled === bucket.capacity) this.slots[slot] = null;
    }

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
    } else if (this.quietTicks >= LOOP_TICKS &&
        (this.slots.every(Boolean) || accessibleCells(this.field).size === 0)) {
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
