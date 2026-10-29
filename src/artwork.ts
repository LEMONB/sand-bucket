import { HEIGHT, WIDTH } from './game.ts';

export function createArtwork(): Uint8Array {
  const cells = new Uint8Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let color = 4;
      if ((x - 89) ** 2 + (y - 28) ** 2 < 18 ** 2) color = 3;
      const ridge = Math.min(89 - 0.92 * (48 - Math.abs(x - 40)), 91 - 0.7 * (39 - Math.abs(x - 105)));
      if (y > ridge) color = 2;
      if (y >= 87 + Math.round(Math.sin(x / 14) * 2)) color = 1;
      cells[y * WIDTH + x] = color;
    }
  }
  return cells;
}
