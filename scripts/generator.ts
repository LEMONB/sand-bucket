import { Game, WIDTH, HEIGHT, COLLECTION_DEPTH, FIELD_SIZE, accessibleCells, type BucketSpec, type Level } from '../src/game.ts';
import { createArtwork } from '../src/artwork.ts';

export const MAX_STEPS = 30_000;
export interface Move { tick: number; bucketId: number }
export interface GeneratedLevel {
  seed: number;
  field: BucketSpec[];
  solution: Move[];
  victoryTick: number;
}

function randomFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function replay(level: Level, solution: readonly Move[], maxSteps = MAX_STEPS): Game {
  const game = new Game(level);
  let move = 0;
  while (game.status === 'playing' && game.tick < maxSteps) {
    while (move < solution.length && solution[move].tick === game.tick) {
      if (game.launch(solution[move].bucketId) !== 'ok') {
        throw new Error(`Недоступный ход ${move} на шаге ${game.tick}`);
      }
      move++;
    }
    game.step();
  }
  if (game.status !== 'won' || move !== solution.length) {
    throw new Error('Решение не подтверждено за отведённое число шагов');
  }
  return game;
}

export function generateLevel(seed: number): GeneratedLevel {
  const random = randomFrom(seed);
  const cells = createArtwork();
  const counts = [0, 0, 0, 0, 0];
  for (const color of cells) counts[color]++;
  const quantities = [0, 2, 2, 2, 2];
  for (let extra = 0; extra < 8; extra++) {
    const choices = [1, 2, 3, 4].filter((color) => quantities[color] < 6);
    quantities[choices[Math.floor(random() * choices.length)]]++;
  }
  const specs: BucketSpec[] = [];
  for (let color = 1; color <= 4; color++) {
    let remaining = counts[color];
    for (let left = quantities[color]; left > 0; left--) {
      const capacity = left === 1 ? remaining : Math.max(1, Math.min(remaining - left + 1,
        Math.round(remaining / left * (0.75 + random() * 0.5))));
      specs.push({ id: specs.length, color, capacity });
      remaining -= capacity;
    }
  }

  // Build a winning trace before assigning spatial constraints. Swapping a chosen
  // bucket into the top cell changes only availability, never physics or slots.
  const game = new Game({ cells, field: specs });
  const solution: Move[] = [];
  while (game.status === 'playing' && game.tick < MAX_STEPS) {
    const exposed = [0, 0, 0, 0, 0];
    for (let y = HEIGHT - COLLECTION_DEPTH; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) exposed[game.cells[y * WIDTH + x]]++;
    }
    const active = new Set(game.buckets.map((bucket) => bucket.color));
    const choices = game.field.filter((bucket): bucket is BucketSpec =>
      bucket !== null && exposed[bucket.color] > 0 && !active.has(bucket.color));
    choices.sort((a, b) => exposed[b.color] - exposed[a.color] || a.color - b.color || a.id - b.id);
    for (const bucket of choices) {
      if (active.has(bucket.color)) continue;
      const index = game.field.findIndex((item) => item?.id === bucket.id);
      [game.field[0], game.field[index]] = [game.field[index], game.field[0]];
      if (game.launch(bucket.id) !== 'ok') throw new Error('Ошибка построения маршрута');
      solution.push({ tick: game.tick, bucketId: bucket.id });
      active.add(bucket.color);
    }
    game.step();
  }
  if (game.status !== 'won' || solution.length !== FIELD_SIZE) {
    throw new Error('Генератор не нашёл решение в пределах лимита');
  }

  // Carve a connected route through an initially full board, in trace order.
  const occupancy: (BucketSpec | null)[] = specs.map((bucket) => ({ ...bucket }));
  const field: BucketSpec[] = Array(FIELD_SIZE);
  for (const move of solution) {
    const frontier = [...accessibleCells(occupancy)];
    const position = frontier[Math.floor(random() * frontier.length)];
    field[position] = { ...specs[move.bucketId] };
    occupancy[position] = null;
  }
  const checked = replay({ cells, field }, solution);
  return { seed, field, solution, victoryTick: checked.tick };
}
