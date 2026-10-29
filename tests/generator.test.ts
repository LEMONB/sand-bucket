import { describe, expect, it } from 'vitest';
import { generateLevel, replay } from '../scripts/generator';
import { createArtwork } from '../src/artwork';
import shore from '../src/levels/shore.json';

const seeds = Array.from({ length: 20 }, (_, i) => i * 104729 + 1);

describe('offline level generation', () => {
  it('reproduces the saved level exactly from its seed', () => {
    expect(generateLevel(shore.seed)).toEqual(shore);
  });
  it.each(seeds)('generates a certified solvable layout for seed %i', (seed) => {
    const result = generateLevel(seed);
    expect(result.field).toHaveLength(16);
    expect(new Set(result.field.map((b) => b.id)).size).toBe(16);
    for (let color = 1; color <= 4; color++) {
      const buckets = result.field.filter((b) => b.color === color);
      expect(buckets.length).toBeGreaterThanOrEqual(2);
      expect(buckets.length).toBeLessThanOrEqual(6);
      expect(buckets.every((b) => Number.isInteger(b.capacity) && b.capacity > 0)).toBe(true);
    }
    const game = replay({ cells: createArtwork(), field: result.field }, result.solution);
    expect(game.status).toBe('won');
    expect(game.tick).toBe(result.victoryTick);
  });
  it('rejects an unproven or truncated route instead of silently falling back', () => {
    expect(() => replay({ cells: createArtwork(), field: shore.field }, shore.solution, 1)).toThrow(/не подтверждено/);
    const wrong = [{ tick: 0, bucketId: shore.field[15].id }];
    expect(() => replay({ cells: createArtwork(), field: shore.field }, wrong)).toThrow(/Недоступный ход/);
  });
  it('varies counts, capacities and positions across seeds', () => {
    const a = generateLevel(1);
    const b = generateLevel(2);
    expect(a.field).not.toEqual(b.field);
    const counts = (field: typeof a.field) => [1, 2, 3, 4].map((c) => field.filter((b) => b.color === c).length);
    expect(counts(a.field)).not.toEqual(counts(b.field));
  });
});
