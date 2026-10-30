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


function play(name: PuzzleScenario, moves: number[], speed: Speed, delay: number): Game {
  const game = new Game(createPuzzleScenario(name));
  const wait = (ticks: number) => {
    for (let i = 0; i < ticks && game.status === 'playing'; i++) game.step(2 / speed);
  };
  wait(delay);
  for (const id of moves) {
    for (let i = 0; !game.slots.includes(null) && game.status === 'playing' && i < 20000; i++) wait(1);
    expect(game.launch(id)).toBe('ok');
    wait(delay);
  }
  wait(30000);
  return game;
}

for (const speed of [1, 2] as const) {
  for (const delay of [0, 137, 1800]) {
    it(`wins each puzzle without precise timing at speed ${speed}, delay ${delay}`, () => {
      expect(play('release', [0, 4], speed, delay).status).toBe('won');
      expect(play('choice', [0, 4, 2, 6], speed, delay).status).toBe('won');
      expect(play('choice', [2, 6, 0, 4], speed, delay).status).toBe('won');
      expect(play('trap', [0, 4, 8, 12, 2, 6], speed, delay).status).toBe('won');
      expect(play('trap', [2, 6, 0, 4, 8], speed, delay).status).toBe('lost');
    });
  }
}

it('requires a temporarily unproductive bucket to open the first path', () => {
  const game = new Game(createPuzzleScenario('release'));
  expect(game.launch(4)).toBe('blocked');
  expect(game.launch(0)).toBe('ok');
  for (let i = 0; i < 1800; i++) game.step();
  expect(game.collected).toBe(0);
  expect(game.status).toBe('playing');
  expect(game.launch(4)).toBe('ok');
});
