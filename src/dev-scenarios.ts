import { WIDTH, HEIGHT, type Level } from './game.ts';

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

export const PUZZLE_DESCRIPTIONS: Record<PuzzleScenario, string> = {
  release: 'Открой единственный вход, затем освобождай проходы в широкое поле. Ведро может ждать своего песка на ленте, но мест всего пять. Числа на вёдрах показывают вместимость в песчинках.',
  choice: 'Снизу доступны два цвета. Слева два ведра закрывают большое коралловое, справа одно — большое мятное. Пути огибают стену и соединяются внизу. Оба начала ведут к победе, но требуют разного продолжения. Числа — вместимость в песчинках.',
  trap: 'Боковые карманы и нижний отсек открываются через узкие проходы. Сохраняй место для вёдер, которые их закрывают. Даже после удачного начала можно заблокировать ленту. Числа — вместимость в песчинках.',
};

// -1 is a wall, 0 is an open passage; positive values are bucket colors.
const PUZZLE_LAYOUTS: Record<PuzzleScenario, number[][]> = {
  release: [
    [-1, -1, 5, -1, -1],
    [ 2,  1, 2,  3,  1],
    [ 0, -1, 2, -1,  0],
    [ 1,  5, 4,  3,  5],
    [-1,  4, 3,  4, -1],
  ],
  choice: [
    [5, -1, -1, 3, -1],
    [4, -1, -1, 1,  4],
    [2, -1, -1, 5,  2],
    [1,  4, -1, 1,  5],
    [3,  2,  0, 3,  0],
  ],
  trap: [
    [ 5,  4, -1,  3, -1],
    [ 2, -1, -1,  2,  5],
    [ 1,  1,  2, -1,  1],
    [-1, -1,  3, -1,  4],
    [ 4,  3,  5,  0,  0],
  ],
};

export function createPuzzleScenario(name: PuzzleScenario): Level {
  const cells = new Uint8Array(WIDTH * HEIGHT);
  const colors = [2, 1, 5, 3, 4];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const depth = HEIGHT - 1 - y;
      const band = Math.min(4, Math.floor(depth / 26));
      // Choice starts with two useful colors, so either route can make progress.
      cells[y * WIDTH + x] = name === 'choice' && x >= WIDTH / 2 && band < 2
        ? colors[1 - band] : colors[band];
    }
  }
  const layout = PUZZLE_LAYOUTS[name].flat();
  const field: Level['field'] = layout.map((color, id) => color > 0 ? { id, color, capacity: 1 } : null);
  for (const color of colors) {
    const buckets = field.filter(bucket => bucket?.color === color);
    const count = cells.reduce((sum, grain) => sum + Number(grain === color), 0);
    const weighted = name === 'choice' && (color === 2 || color === 1);
    const main = color === 2 ? 10 : 8;
    const units = buckets.length + Number(weighted);
    let remaining = count;
    buckets.forEach((bucket, i) => {
      const weight = weighted && bucket!.id === main ? 2 : 1;
      bucket!.capacity = i === buckets.length - 1 ? remaining : Math.floor(count * weight / units);
      remaining -= bucket!.capacity;
    });
  }
  return { cells, field, columns: 5, walls: layout.flatMap((color, i) => color === -1 ? [i] : []) };
}
