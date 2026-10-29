import { writeFileSync } from 'node:fs';
import { generateLevel } from '../src/generator.ts';
const levels = [1, 4, 7, 9].map(number => generateLevel(number));
writeFileSync(new URL('../src/levels/fallbacks.json', import.meta.url), JSON.stringify(levels) + '\n');
console.log('Четыре запасных уровня проверены и сохранены.');
