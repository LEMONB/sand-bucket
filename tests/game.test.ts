import { describe, expect, it } from 'vitest';
import {
  BELT_LIMIT, COLLECTION_DEPTH, FIELD_SIZE, Game, HEIGHT, LOOP_TICKS, WIDTH,
  accessibleCells, advanceFrame, type BucketSpec, type Level,
} from '../src/game';
import { createLevel } from '../src/level';
import shore from '../src/levels/shore.json';
import { replay } from '../scripts/generator';

function run(game: Game, ticks: number): void {
  for (let i = 0; i < ticks; i++) game.step();
}
function board(): BucketSpec[] {
  return Array.from({ length: FIELD_SIZE }, (_, id) => ({ id, color: 1, capacity: 1 }));
}
function fixture(cells: Uint8Array, buckets: BucketSpec[]): Level {
  return { cells, field: Array.from({ length: FIELD_SIZE }, (_, i) => buckets[i] ?? null) };
}
function deadlock(): Game {
  const cells = new Uint8Array(WIDTH * HEIGHT);
  cells.fill(1, (HEIGHT - COLLECTION_DEPTH) * WIDTH);
  cells.fill(2, (HEIGHT - COLLECTION_DEPTH - 1) * WIDTH, (HEIGHT - COLLECTION_DEPTH) * WIDTH);
  const buckets = Array.from({ length: 5 }, (_, id) => ({ id, color: 2, capacity: 25 + Number(id < 3) }));
  buckets.push({ id: 5, color: 1, capacity: WIDTH * COLLECTION_DEPTH });
  const game = new Game(fixture(cells, buckets));
  for (let id = 0; id < 5; id++) expect(game.launch(id)).toBe('ok');
  return game;
}

describe('paths through the bucket field', () => {
  it('initially exposes only the four top cells', () => {
    expect([...accessibleCells(board())].sort()).toEqual([0, 1, 2, 3]);
  });
  it('finds winding paths including a downward segment, without passing through buckets', () => {
    const field: (BucketSpec | null)[] = board();
    for (const index of [0, 4, 8, 9, 10, 6]) field[index] = null;
    const available = accessibleCells(field);
    expect(available.has(7)).toBe(true); // 0 → 4 → 8 → 9 → 10 → 6 → 7
    expect(available.has(15)).toBe(false);
    expect(available.has(5)).toBe(true);
  });
  it('does not use diagonal gaps or disconnected empty pockets', () => {
    const field: (BucketSpec | null)[] = board();
    field[0] = null;
    field[5] = null;
    expect(accessibleCells(field).has(9)).toBe(false);
    field[4] = null;
    expect(accessibleCells(field).has(9)).toBe(true);
  });
  it('launches by ID, opens paths and leaves remaining buckets in place', () => {
    const game = new Game(createLevel());
    const buried = game.field[7]!;
    const front = game.field[3]!;
    expect(game.launch(buried.id)).toBe('blocked');
    expect(game.launch(front.id)).toBe('ok');
    expect(game.field[3]).toBeNull();
    expect(game.field[7]?.id).toBe(buried.id);
    expect(game.launch(buried.id)).toBe('ok');
    expect(game.launch(front.id)).toBe('empty');
    expect(game.launch(-1)).toBe('empty');
  });
});

describe('slots and collection', () => {
  it('has five evenly spaced slots and preserves buckets over a wrap', () => {
    const game = new Game(createLevel());
    const id = game.field[0]!.id; // Coral is initially above the collection zone.
    expect(game.launch(id)).toBe('ok');
    const bucket = game.slots[0];
    const positions = game.slots.map((_, i) => game.slotPosition(i));
    run(game, LOOP_TICKS);
    expect(game.slots).toHaveLength(BELT_LIMIT);
    expect(game.slots[0]).toBe(bucket);
    expect(game.collected).toBe(0);
    expect(game.slots.map((_, i) => game.slotPosition(i))).toEqual(positions);
    for (let i = 1; i < positions.length; i++) expect(positions[i] - positions[i - 1]).toBeCloseTo(0.2);
  });
  it('launches into the first free slot without waiting for the entrance', () => {
    const game = new Game(createLevel());
    const ids = game.field.slice(0, 4).map((b) => b!.id);
    ids.forEach((id) => expect(game.launch(id)).toBe('ok'));
    expect(game.slots.slice(0, 4).map((b) => b!.id)).toEqual(ids);
  });
  it('collects from the fifth row through foreign sand, but not the sixth', () => {
    const cells = new Uint8Array(WIDTH * HEIGHT);
    for (let y = HEIGHT - 4; y < HEIGHT; y++) cells[y * WIDTH] = 2;
    cells[(HEIGHT - 5) * WIDTH] = 1;
    cells[(HEIGHT - 6) * WIDTH] = 1;
    const game = new Game(fixture(cells, [{ id: 0, color: 1, capacity: 2 }, { id: 1, color: 2, capacity: 4 }]));
    game.launch(0);
    game.step();
    expect(game.collected).toBe(1);
    expect(game.slots[0]?.filled).toBe(1);
    expect([...game.cells].filter((color) => color === 2)).toHaveLength(4);
    expect([...game.cells].filter((color) => color === 1)).toHaveLength(1);
  });
  it('never exceeds capacity, frees its slot and wins on the last grain', () => {
    const cells = new Uint8Array(WIDTH * HEIGHT);
    cells[(HEIGHT - 1) * WIDTH] = 1;
    cells[(HEIGHT - 1) * WIDTH + 1] = 1;
    const game = new Game(fixture(cells, [{ id: 0, color: 1, capacity: 1 }, { id: 1, color: 1, capacity: 1 }]));
    game.launch(0);
    game.step();
    expect(game.collected).toBe(1);
    expect(game.slots[0]).toBeNull();
    game.launch(1);
    expect(game.slots[0]?.id).toBe(1);
    game.step();
    expect(game.status).toBe('won');
    expect(game.collected).toBe(2);
    expect(game.buckets).toHaveLength(0);
    expect(game.launch(0)).toBe('finished');
  });
  it('conserves grains after simultaneous collection and settling', () => {
    const game = new Game(createLevel());
    game.field.slice(0, 4).forEach((bucket) => game.launch(bucket!.id));
    run(game, LOOP_TICKS * 2);
    const remaining = game.cells.reduce((count, color) => count + Number(color !== 0), 0);
    expect(remaining + game.collected).toBe(game.total);
    expect(game.collected).toBeGreaterThan(0);
    expect(game.buckets.every((b) => b.filled <= b.capacity)).toBe(true);
  });
  it('requires an entire quiet lap before declaring a full belt deadlocked', () => {
    const game = deadlock();
    expect(game.launch(5)).toBe('full');
    run(game, LOOP_TICKS - 1);
    expect(game.status).toBe('playing');
    game.step();
    expect(game.status).toBe('lost');
    const tick = game.tick;
    game.step();
    expect(game.tick).toBe(tick);
  });
  it('continues with room for another color rather than falsely declaring defeat', () => {
    const game = new Game(createLevel());
    game.launch(game.field[0]!.id);
    run(game, LOOP_TICKS * 3);
    expect(game.status).toBe('playing');
  });
  it('rejects malformed levels and does not mutate the source level', () => {
    const level = createLevel();
    const initial = createLevel();
    const game = new Game(level);
    game.launch(game.field[3]!.id);
    run(game, 200);
    expect(level).toEqual(initial);
    expect(new Game(level).field).toEqual(initial.field);
    level.field[0]!.capacity++;
    expect(() => new Game(level)).toThrow(/вместимостью/);
    expect(() => new Game({ cells: new Uint8Array(1), field: [] })).toThrow(/размер/);
    const invalid = createLevel();
    invalid.cells[0] = 99;
    expect(() => new Game(invalid)).toThrow(/цвет/);
    const duplicated = createLevel();
    duplicated.field[1]!.id = duplicated.field[0]!.id;
    expect(() => new Game(duplicated)).toThrow(/ведра/);
  });
});

describe('speed and solution', () => {
  it('advances twice as many fixed steps at ×2 for the same elapsed time', () => {
    const normal = new Game(createLevel());
    const fast = new Game(createLevel());
    let a = 0, b = 0;
    for (let frame = 0; frame < 60; frame++) {
      a = advanceFrame(normal, 1 / 60, 1, a);
      b = advanceFrame(fast, 1 / 60, 2, b);
    }
    expect(normal.tick).toBe(60);
    expect(fast.tick).toBe(120);
    // Switching speed has no effect until simulation time actually passes.
    const tick = fast.tick;
    advanceFrame(fast, 0, 1, b);
    expect(fast.tick).toBe(tick);
  });
  it('has the same winning states at ×1 and ×2 for the same simulation-timed actions', () => {
    const normal = new Game(createLevel());
    const fast = new Game(createLevel());
    let a = 0, b = 0, move = 0;
    for (let tick = 0; tick < shore.victoryTick; tick++) {
      while (move < shore.solution.length && shore.solution[move].tick === tick) {
        expect(normal.launch(shore.solution[move].bucketId)).toBe('ok');
        expect(fast.launch(shore.solution[move].bucketId)).toBe('ok');
        move++;
      }
      a = advanceFrame(normal, 1 / 60, 1, a);
      b = advanceFrame(fast, 1 / 120, 2, b);
    }
    expect(normal.status).toBe('won');
    expect(fast.status).toBe('won');
    expect(fast.cells).toEqual(normal.cells);
    expect(fast.slots).toEqual(normal.slots);
    expect(fast.collected).toBe(normal.total);
    expect(fast.tick).toBe(normal.tick);
  });
  it('replays the shipped certificate to victory', () => {
    const result = replay(createLevel(), shore.solution);
    expect(result.tick).toBe(shore.victoryTick);
    expect(result.cells.every((color) => color === 0)).toBe(true);
  });
});
