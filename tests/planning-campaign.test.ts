import { expect, it } from 'vitest';
import { Game, WIDTH, HEIGHT, type Level } from '../src/game';
import { MECHANIC_UNLOCKS, planningKinds, planningProfile } from '../scripts/campaign/planning-profile';
import { openingDepth, assessPlanning } from '../scripts/campaign/planning-analysis';
import { certify } from '../scripts/campaign/solver';

it('unlocks mechanics once and keeps the difficulty scale independent of campaign progress', () => {
  for (const [kind, first] of MECHANIC_UNLOCKS) {
    expect(planningKinds(first)).toEqual([kind]);
    for (let n = 6; n < first; n++) expect(planningKinds(n)).not.toContain(kind);
  }
  for (let n = 6; n <= 400; n++) {
    const difficulty = (n - 1) % 5;
    const allowed = difficulty === 0 ? [6, 7] : difficulty < 3 ? [6, 7, 8] : [8, 9];
    for (let attempt = 0; attempt < 12; attempt++) {
      const profile = planningProfile(n, attempt);
      expect(profile.difficulty).toBe(difficulty);
      expect(allowed).toContain(profile.columns);
      expect(profile.rows).toBe(profile.columns - 3);
      expect(profile.walls.every(i => i >= 0 && i < profile.columns * profile.rows)).toBe(true);
    }
    expect(planningKinds(n).length).toBeGreaterThan(0);
  }
});

function blocked(depth: number): Level {
  const cells = new Uint8Array(WIDTH * HEIGHT);
  cells.fill(2, (HEIGHT - 5 * (depth + 1)) * WIDTH, (HEIGHT - 5) * WIDTH);
  cells.fill(1, (HEIGHT - 5) * WIDTH);
  const field: Level['field'] = Array(16).fill(null);
  for (let i = 0; i < depth; i++) field[i * 4] = { id: i, color: 2, capacity: WIDTH * 5 };
  field[depth * 4] = { id: depth, color: 1, capacity: WIDTH * 5 };
  return { cells, field, walls: [1, 5, 9, 13] };
}

it('counts required preliminary departures using the real simulation', () => {
  expect(openingDepth(new Game(blocked(0)))).toBe(0);
  expect(openingDepth(new Game(blocked(1)))).toBe(1);
  expect(openingDepth(new Game(blocked(2)))).toBe(2);
});

it('does not label a stalled reactive player as an actual losing continuation', () => {
  const level = blocked(1);
  const proofs = [certify(level, 1, 0)];
  expect(assessPlanning(level, 2, proofs).accepted).toBe(true);
  expect(assessPlanning(level, 3, proofs).accepted).toBe(false);
}, 30000);
