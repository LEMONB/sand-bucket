import { WIDTH, HEIGHT, type Level } from './game';

export function createLossScenario(): Level {
  const cells = new Uint8Array(WIDTH * HEIGHT).fill(1);
  cells.fill(2, 0, 5);
  const remaining = cells.length - 5;
  const field = Array.from({ length: 16 }, (_, id) => ({
    id,
    color: id < 5 ? 2 : 1,
    capacity: id < 5 ? 1 : Math.floor(remaining / 11) + Number(id - 5 < remaining % 11),
  }));
  return { cells, field, columns: 4 };
}
