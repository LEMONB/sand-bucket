import { describe, expect, it } from 'vitest';
import { demoField, exitPath } from '../src/interface-model';
describe('interface fixtures', () => {
  for (const size of [4, 5, 6, 7]) it(`${size}×${size} has connected buckets and intended walls`, () => {
    const field = demoField(size);
    expect(field).toHaveLength(size * size);
    expect(field.filter(c => c === 'wall')).toHaveLength((size - 4) * 2);
    let removed = 0;
    for (;;) {
      const next = field.findIndex((cell, i) => typeof cell === 'number' && exitPath(field, size, i));
      if (next < 0) break;
      const path = exitPath(field, size, next)!;
      expect(path.at(-1)).toBeLessThan(size);
      field[next] = null; removed++;
    }
    expect(removed).toBe(size * size - (size - 4) * 2);
  });
  it('routes through empty cells and does not cross walls', () => {
    expect(exitPath([null, 'wall', 2, 1, 'wall', 3, 4, 2, 1], 3, 3)).toEqual([3, 0]);
    expect(exitPath([1, 'wall', 2, 3, 'wall', 4, 1, 2, 3], 3, 6)).toBeNull();
  });
});
