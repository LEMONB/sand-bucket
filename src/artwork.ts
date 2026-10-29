import { HEIGHT, WIDTH } from './game.ts';

export function createArtwork(seed = 0): Uint8Array {
  const cells = new Uint8Array(WIDTH * HEIGHT);
  const pattern = seed % 5;
  const offset = (seed >>> 8) % 17 - 8;
  const shift = (seed >>> 16) % 4;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let color: number;
      if (pattern === 0) {
        color = 4;
        if ((x - 89 - offset) ** 2 + (y - 28) ** 2 < 17 ** 2) color = 3;
        const ridge = Math.min(101 - 0.92 * (58 - Math.abs(x - 40 - offset)), 105 - 0.7 * (49 - Math.abs(x - 105)));
        if (y > ridge) color = 2;
        if (y >= 101 + Math.round(Math.sin(x / 14) * 2)) color = 1;
      } else if (pattern === 1) {
        color = 1 + Math.min(3, Math.max(0, Math.floor((y + Math.sin((x + offset) / 18) * 10) / 32)));
      } else if (pattern === 2) {
        color = 1 + Math.min(3, Math.floor(Math.hypot(x - 64 - offset, y - 64) / 23));
      } else if (pattern === 3) {
        color = 1 + Math.min(3, Math.floor((Math.abs(x - 64 - offset) + Math.abs(y - 64)) / 32));
      } else {
        color = 1 + Math.min(3, Math.max(0, Math.floor((y + Math.abs(x - 64) * .45 + offset) / 38)));
      }
      cells[y * WIDTH + x] = 1 + ((color - 1 + shift) % 4);
    }
  }
  return cells;
}
