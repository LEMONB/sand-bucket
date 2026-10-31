import { catalogArtwork, artworkPalette } from './art-catalog.ts';
import type { CampaignLevel } from './campaign-types.ts';
import type { Level } from './game.ts';

export function mergeArtworkColors(source: Level): Level {
  const level = structuredClone(source);
  const cells = level.cells;
  const originalColor = (color: number): number => color > 4 ? color - 4 : color;
  for (let i = 0; i < cells.length; i++) cells[i] = originalColor(cells[i]);
  const buckets = [...level.field, ...(level.mechanics?.queues.flatMap(q => q.buckets) ?? []), ...(level.mechanics?.platforms.flatMap(p => p.next) ?? [])];
  for (const bucket of buckets) if (bucket) bucket.color = originalColor(bucket.color);
  return level;
}

export function playableLevel(record: CampaignLevel): Level {
  return mergeArtworkColors({ ...record, cells: catalogArtwork(record.art), palette: artworkPalette(record.art) });
}
