import { describe, expect, it } from 'vitest';
import { createScene, SCENES } from '../src/art-scenes';

describe('original scene samples', () => {
  it('keeps every composition square, deterministic, and within four sand colors', () => {
    const signatures = new Set<string>();
    SCENES.forEach((_, scene) => {
      for (let variant = 0; variant < 3; variant++) {
        const cells = createScene(scene, variant);
        expect(cells.length).toBe(128 * 128);
        expect([...new Set(cells)].sort()).toEqual([1, 2, 3, 4]);
        expect(cells).toEqual(createScene(scene, variant));
        signatures.add(cells.join(''));
      }
    });
    expect(signatures.size).toBe(9);
  });
});
