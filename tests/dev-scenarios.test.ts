import { expect, it } from 'vitest';
import { Game, LAUNCH_TICKS } from '../src/game';
import { createLossScenario } from '../src/dev-scenarios';
it('demonstrates a real deadlock immediately after arrival and can restart', () => {
  const level = createLossScenario();
  const game = new Game(level);
  for(let id=0;id<5;id++)expect(game.launch(id)).toBe('ok');
  for(let i=0;i<LAUNCH_TICKS-1;i++)game.step();
  expect(game.status).toBe('playing');game.step();expect(game.status).toBe('lost');
  expect(game.collected).toBe(0);expect(new Game(level).status).toBe('playing');
});
