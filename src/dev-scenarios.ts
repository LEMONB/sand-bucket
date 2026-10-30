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

export const PUZZLE_TITLES = {
  release: 'Освобождение',
  choice: 'Два пути',
  trap: 'Ловушка',
};
export type PuzzleScenario = keyof typeof PUZZLE_TITLES;

export function createPuzzleScenario(name: PuzzleScenario): Level {
  const cells = new Uint8Array(WIDTH * HEIGHT);
  // Full-width layers keep the opening color independent of belt phase.
  cells.fill(5, WIDTH * (HEIGHT - 64), WIDTH * (HEIGHT - 32));
  cells.fill(2, WIDTH * (HEIGHT - 32));
  const blue = name === 'release' ? [0] : name === 'choice' ? [0, 2] : [0, 4, 8, 2, 6];
  const red = name === 'release' ? [4] : name === 'choice' ? [4, 6] : [12];
  const field: Level['field'] = Array(16).fill(null);
  for (const [positions, color] of [[blue, 5], [red, 2]] as const) {
    positions.forEach((position, index) => {
      field[position] = {
        id: position, color,
        capacity: Math.floor(32 * WIDTH / positions.length) + Number(index < 32 * WIDTH % positions.length),
      };
    });
  }
  return { cells, field, columns: 4, walls: field.flatMap((bucket, i) => bucket ? [] : [i]) };
}
