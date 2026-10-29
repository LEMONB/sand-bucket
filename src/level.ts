import fallbacks from './levels/fallbacks.json';
import { asLevel, difficulty, GENERATOR_VERSION, seedFor, type GeneratedLevel } from './generator';
import { Game } from './game';

export function fallbackLevel(number: number, seed = seedFor(number)): GeneratedLevel {
  return { ...fallbacks[difficulty(number)], number, seed, fallback: true };
}
export function createLevel() { return asLevel(fallbackLevel(1)); }
export function validRecord(record: unknown, number: number, seed: number): record is GeneratedLevel {
  try {
    const r = record as GeneratedLevel;
    if (!r || r.version !== GENERATOR_VERSION || r.number !== number || r.seed !== seed || r.columns !== difficulty(number) + 4 ||
        !Array.isArray(r.cells) || r.cells.some(c => !Number.isInteger(c) || c < 1 || c > 4)) return false;
    new Game(asLevel(r));
    return true;
  } catch { return false; }
}
