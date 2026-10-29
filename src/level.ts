import { createArtwork } from './artwork';
import shore from './levels/shore.json';
import type { Level } from './game';

export function createLevel(): Level {
  return { cells: createArtwork(), field: shore.field.map((bucket) => ({ ...bucket })) };
}
