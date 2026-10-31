import { expect, it } from 'vitest';
import { Game, WIDTH, HEIGHT } from '../src/game';
import { bucketMarks, keyColor } from '../src/game-icons';

function fixture(): Game {
  const cells = new Uint8Array(WIDTH * HEIGHT);
  cells.fill(1, cells.length - 16);
  return new Game({ cells, field: Array.from({ length: 16 }, (_, id) => ({ id, color: 1, capacity: 1, hidden: true })) });
}

it('keeps both key and lid marks and masks a hidden key color', () => {
  const game = fixture(), bucket = game.field[15]!;
  game.mechanics.gates.push({ cells: [1], key: bucket.id });
  game.mechanics.lids.push({ key: bucket.id, x: 0, y: 0, width: 8, height: 8 });
  const marks = bucketMarks(game, bucket, true);
  expect(marks).toContain('icon-key');
  expect(marks).toContain('icon-lid');
  expect(marks).not.toContain(game.palette[bucket.color]);
  expect(keyColor(game, bucket.id)).toBe('#9ba49e');
});

it('does not expose a hidden swap partner through its arrow color', () => {
  const game = fixture(), bucket = { ...game.field[0]!, swapWith: 15, color: 2 };
  expect(bucketMarks(game, bucket)).toContain('icon-swap');
  expect(bucketMarks(game, bucket)).not.toContain(game.palette[1]);
});
