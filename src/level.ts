import fallbackData from './levels/art-fallbacks.json';
import { asLevel, difficulty, GENERATOR_VERSION, seedFor, type GeneratedLevel } from './generator';
import { Game } from './game';
import { artworkIndex, catalogArtwork } from './art-catalog';
const fallbacks=fallbackData as unknown as Omit<GeneratedLevel,'cells'>[];

export function fallbackLevel(number: number, seed = seedFor(number)): GeneratedLevel {
  const art=artworkIndex(number);
  return { ...structuredClone(fallbacks[art*4+difficulty(number)]), cells:[...catalogArtwork(art)], number, seed, fallback: true };
}
export function createLevel() { return asLevel(fallbackLevel(1)); }
export function validRecord(record: unknown, number: number, seed: number): record is GeneratedLevel {
  try {
    const r = record as GeneratedLevel;
    if (!r || r.version !== GENERATOR_VERSION || r.number !== number || r.seed !== seed || r.columns !== difficulty(number) + 4 || r.art!==artworkIndex(number) ||
        !Array.isArray(r.kinds) || r.kinds.length>2 || r.kinds.some(k=>!Number.isInteger(k)||k<0||k>7) ||
        !Array.isArray(r.cells) || r.cells.some(c => !Number.isInteger(c) || c < 1 || c > 4)) return false;
    new Game(asLevel(r));
    return true;
  } catch { return false; }
}
