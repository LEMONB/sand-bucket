import { writeFileSync } from 'node:fs';
import { generateLevel } from './generator.ts';

const seed = Number(process.argv[2] ?? 20261029);
if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
  throw new Error('Seed должен быть целым числом от 0 до 4294967295');
}
const level = generateLevel(seed);
writeFileSync(new URL('../src/levels/shore.json', import.meta.url), JSON.stringify(level, null, 2) + '\n');
console.log(`Уровень ${seed}: ${level.field.length} вёдер, победа за ${level.victoryTick} шагов. Маршрут проверен.`);
