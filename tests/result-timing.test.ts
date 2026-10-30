import { expect, it } from 'vitest';
import { Game, advanceFrame } from '../src/game';
import { createLossScenario } from '../src/dev-scenarios';
import { resultReady } from '../src/result-timing';

it.each([1, 2] as const)('holds the loss screen for a real second after deadlock at speed %i', speed => {
  const game = new Game(createLossScenario());
  for (let id = 0; id < 5; id++) game.launch(id);
  let remainder = 0;
  for (let frame = 0; frame < 60 && game.status === 'playing'; frame++) {
    remainder = advanceFrame(game, 1 / 60, speed, remainder);
    expect(resultReady(game.status, false, 0)).toBe(false);
  }
  expect(game.status).toBe('lost');
  expect(game.launch(5)).toBe('finished');
  expect(resultReady(game.status, false, .999)).toBe(false);
  expect(resultReady(game.status, false, 1)).toBe(true);
  expect(resultReady(game.status, false, 2)).toBe(true);
});

it('keeps victory tied to animations and never shows a stale result during a new game', () => {
  expect(resultReady('won', true, 10)).toBe(false);
  expect(resultReady('won', false, 0)).toBe(true);
  expect(resultReady('playing', false, 10)).toBe(false);
  expect(resultReady('lost', false, 0)).toBe(false);
});
