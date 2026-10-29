import { expect, it } from 'vitest';
import { createPreviewArtwork, PREVIEW_GRAIN } from '../src/interface-artwork';

for (const [width, height] of [[358, 230], [288, 140], [358, 400]]) {
  it(`composes ${width}×${height} without stretching its sun`, () => {
    const cells = createPreviewArtwork(width, height);
    const columns = Math.ceil(width / PREVIEW_GRAIN);
    expect(cells.length).toBe(columns * Math.ceil(height / PREVIEW_GRAIN));
    expect(new Set(cells)).toEqual(new Set([1, 2, 3, 4]));
    const sun = [...cells].flatMap((color, i) => color === 3 ? [{ x: i % columns, y: Math.floor(i / columns) }] : []);
    const spanX = Math.max(...sun.map(p => p.x)) - Math.min(...sun.map(p => p.x));
    const spanY = Math.max(...sun.map(p => p.y)) - Math.min(...sun.map(p => p.y));
    expect(Math.abs(spanX - spanY)).toBeLessThanOrEqual(1);
    expect(createPreviewArtwork(width, height)).toEqual(cells);
  });
}
