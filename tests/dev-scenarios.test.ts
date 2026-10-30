import { expect, it } from 'vitest';
import { Game, LAUNCH_TICKS, type Speed } from '../src/game';
import { createLossScenario, createPuzzleScenario, type PuzzleScenario } from '../src/dev-scenarios';
it('demonstrates a real deadlock immediately after arrival and can restart', () => {
  const level = createLossScenario();
  const game = new Game(level);
  for(let id=0;id<5;id++)expect(game.launch(id)).toBe('ok');
  for(let i=0;i<LAUNCH_TICKS-1;i++)game.step();
  expect(game.status).toBe('playing');game.step();expect(game.status).toBe('lost');
  expect(game.collected).toBe(0);expect(new Game(level).status).toBe('playing');
});

const solutions: Record<PuzzleScenario, number[][]> = {
  release: [[2, 7, 12, 6, 8, 17, 5, 9, 16, 21, 15, 22, 23, 18, 19]],
  choice: [
    [0, 5, 10, 15, 3, 8, 13, 18, 9, 14, 20, 16, 23, 19, 21],
    [3, 8, 0, 5, 10, 13, 14, 15, 18, 9, 20, 16, 23, 21, 19],
  ],
  trap: [[0, 5, 10, 3, 1, 11, 8, 12, 9, 14, 19, 17, 22, 21, 20]],
};

function waitForSand(game: Game, speed: Speed, delay = 0): void {
  // Allow collection before the next decision, including a full circuit without progress.
  let idle = 0;
  for (let i = 0; i < 20000 && game.status === 'playing' && idle < 500; i++) {
    const collected = game.collected;
    game.step(2 / speed);
    idle = collected === game.collected ? idle + 1 : 0;
  }
  // Negative seeds vary the thinking pause after each move.
  for (let i = 0; i < (delay >= 0 ? delay : (-delay + game.turns * 137) % 2000); i++) game.step(2 / speed);
}

function play(name: PuzzleScenario, moves: number[], speed: Speed, delay: number): Game {
  const game = new Game(createPuzzleScenario(name));
  waitForSand(game, speed, delay);
  for (const id of moves) {
    if (game.status === 'lost') break;
    expect(game.launch(id), `${name}: bucket ${id}`).toBe('ok');
    waitForSand(game, speed, delay);
  }
  return game;
}

for (const speed of [1, 2] as const) {
  for (const delay of [0, 137, 1800, -73, -251, -617]) {
    it(`wins all three full levels and both choices at speed ${speed}, pause ${delay}`, () => {
      for (const name of ['release', 'choice', 'trap'] as const) {
        for (const moves of solutions[name]) {
          const game = play(name, moves, speed, delay);
          expect(game.status).toBe('won');
          expect(game.turns).toBe(15);
          expect(game.collected).toBe(game.total);
        }
      }
    });
  }
}

it('opens a single entrance into a branching room', () => {
  const game = new Game(createPuzzleScenario('release'));
  expect(game.columns).toBe(5);
  expect(game.field.filter(Boolean)).toHaveLength(15);
  expect(new Set(game.field.filter(Boolean).map(b => b!.color)).size).toBe(5);
  expect([...game.paths.keys()]).toEqual([2]);
  expect(game.launch(7)).toBe('blocked');
  expect(game.launch(2)).toBe('ok');
  waitForSand(game, 1, 1800);
  expect(game.collected).toBe(0);
  expect(game.status).toBe('playing');
  expect(game.launch(7)).toBe('ok');
  expect([...game.paths.keys()].sort((a, b) => a - b)).toEqual([6, 8, 12]);
  waitForSand(game, 1);
  expect(game.collected).toBeGreaterThan(0);
  expect(game.status).toBe('playing');
  expect(game.launch(21)).toBe('blocked');
});

it('offers different opening costs on opposite sides of an island', () => {
  const red = new Game(createPuzzleScenario('choice'));
  expect([...red.paths.keys()]).toEqual([0, 3]);
  expect(red.launch(10)).toBe('blocked');
  red.launch(0); red.launch(5);
  waitForSand(red, 1);
  expect(red.buckets).toHaveLength(2);
  expect(red.collected).toBe(0);
  expect(red.launch(10)).toBe('ok');
  waitForSand(red, 1);
  expect(red.collected).toBeGreaterThan(0);
  const mint = new Game(createPuzzleScenario('choice'));
  mint.launch(3);
  waitForSand(mint, 1);
  expect(mint.buckets).toHaveLength(1);
  expect(mint.collected).toBe(0);
  expect(mint.launch(8)).toBe('ok');
  waitForSand(mint, 1);
  expect(mint.collected).toBeGreaterThan(0);
  expect(mint.field[10]!.capacity).toBe(mint.field[14]!.capacity * 2);
});

it('uses distinct wall plans and leaves actual passages instead of filling every empty cell', () => {
  const levels = ['release', 'choice', 'trap'].map(name => createPuzzleScenario(name as PuzzleScenario));
  expect(new Set(levels.map(level => level.walls!.join(','))).size).toBe(3);
  for (const level of levels) {
    expect(level.field.some((bucket, i) => !bucket && !level.walls!.includes(i))).toBe(true);
    expect(level.walls!.some(i => i % 5 < 4 && level.walls!.includes(i + 1))).toBe(true);
    expect(new Game(level).field.filter(Boolean)).toHaveLength(15);
  }
});

it.each([1, 2] as const)('can lose late in the trap after collecting over a quarter of the sand at speed %i', speed => {
  for (const delay of [0, 137, 1800, -73, -251, -617]) {
    const game = play('trap', [0, 5, 10, 3, 1, 11, 8, 12, 17, 9, 14, 22], speed, delay);
    expect(game.status).toBe('lost');
    expect(game.collected).toBeGreaterThan(game.total / 4);
    expect(game.turns).toBeGreaterThan(5);
    expect(game.field.some(Boolean)).toBe(true);
  }
});
