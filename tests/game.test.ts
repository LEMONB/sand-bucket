import { describe, expect, it } from 'vitest';
import { BELT_LIMIT, Game, HEIGHT, LOOP_TICKS, WIDTH, createLevel, type Level } from '../src/game';

function run(game: Game, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    game.step();
  }
}

describe('sand simulation', () => {
  it('conserves every grain while falling and collecting', () => {
    const game = new Game();
    expect(game.launch(0)).toBe('ok');
    run(game, LOOP_TICKS);
    const remaining = game.cells.reduce((count, color) => count + Number(color !== 0), 0);
    expect(remaining + game.collected).toBe(game.total);
    expect(game.collected).toBeGreaterThan(0);
    expect(game.buckets.every((b) => b.filled <= b.capacity)).toBe(true);
  });

  it('does not collect an inaccessible color', () => {
    const level = createLevel();
    level.queues[0].reverse();
    const game = new Game(level);
    game.launch(0);
    run(game, LOOP_TICKS * 2);
    expect(game.collected).toBe(0);
    expect(game.status).toBe('playing');
  });

  it('rejects double launches at the entrance without consuming a bucket', () => {
    const game = new Game();
    expect(game.launch(0)).toBe('ok');
    expect(game.launch(0)).toBe('entrance');
    expect(game.queues[0]).toHaveLength(3);
    expect(game.launch(-1)).toBe('empty');
  });

  it('detects a proven deadlock, not merely a full conveyor', () => {
    const level = createLevel();
    const buckets = level.queues.flat();
    level.queues = [buckets.filter((b) => b.color === 4 || b.color === 3), buckets.filter((b) => b.color < 3)];
    const game = new Game(level);
    for (let i = 0; i < BELT_LIMIT; i++) {
      expect(game.launch(0)).toBe('ok');
      run(game, 60);
    }
    expect(game.status).toBe('playing');
    expect(game.launch(1)).toBe('full');
    run(game, LOOP_TICKS + 1);
    expect(game.status).toBe('lost');
    const tick = game.tick;
    game.step();
    expect(game.tick).toBe(tick);
    expect(game.launch(1)).toBe('finished');
  });

  it('removes full buckets and wins after the last grain', () => {
    const cells = new Uint8Array(WIDTH * HEIGHT);
    cells[(HEIGHT - 1) * WIDTH + 1] = 1;
    const game = new Game({ cells, queues: [[{ id: 0, color: 1, capacity: 1 }]] });
    game.launch(0);
    game.step();
    expect(game.status).toBe('won');
    expect(game.buckets).toHaveLength(0);
    expect(game.collected).toBe(1);
  });

  it('starts a new run without mutating the level definition', () => {
    const level = createLevel();
    const first = new Game(level);
    first.launch(0);
    run(first, 100);
    const second = new Game(level);
    expect(second.collected).toBe(0);
    expect(second.queues[0]).toHaveLength(4);
    expect(second.cells).toEqual(createLevel().cells);
  });

  it('rejects invalid level data', () => {
    const level = createLevel();
    level.queues[0][0].capacity++;
    expect(() => new Game(level)).toThrow(/вместимостью/);
    expect(() => new Game({ cells: new Uint8Array(1), queues: [] })).toThrow(/размер/);
    const invalid: Level = createLevel();
    invalid.cells[0] = 99;
    expect(() => new Game(invalid)).toThrow(/цвет/);
  });

  it('the shipped level has a complete reproducible solution', () => {
    const game = new Game();
    // Overlap shoreline/mountain buckets, then release sun/sky pairs.
    const moves = [0, 1, 2, 0, 1, 2, 0, 0, 1, 1, 2, 2];
    let move = 0;
    for (let tick = 0; tick < 60 * 240 && game.status === 'playing'; tick++) {
      if (move < moves.length) {
        if (game.launch(moves[move]) === 'ok') {
          move++;
        }
      }
      game.step();
    }
    expect(move).toBe(moves.length);
    expect(game.status).toBe('won');
    expect(game.collected).toBe(game.total);
    expect(game.cells.every((color) => color === 0)).toBe(true);
  });

  it('the shipped level can lose from blocking access to the sky buckets', () => {
    const game = new Game();
    const moves = [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2];
    let move = 0;
    for (let tick = 0; tick < 60 * 240 && game.status === 'playing'; tick++) {
      if (move < moves.length && game.launch(moves[move]) === 'ok') {
        move++;
      }
      game.step();
    }
    expect(game.status).toBe('lost');
    expect(game.buckets).toHaveLength(BELT_LIMIT);
    expect(game.collected).toBeLessThan(game.total);
  });
});
