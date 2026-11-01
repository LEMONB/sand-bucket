import { readFileSync } from 'node:fs';
import { CAMPAIGN_COUNT } from '../../src/campaign-rules.ts';

// Accepted colors are fixed; measuring repaired levels again would lose the original selection.
const targets:unknown=JSON.parse(readFileSync(new URL('./capacity-targets.json',import.meta.url),'utf8'));
if(!Array.isArray(targets)||targets.length!==CAMPAIGN_COUNT||targets.some(colors=>
  !Array.isArray(colors)||new Set(colors).size!==colors.length||colors.some(c=>!Number.isInteger(c)||c<1||c>4))) {
  throw Error('Неверные ограничения вместимости кампании');
}
export function campaignCapacityColors(number:number):ReadonlySet<number> {
  if(!Number.isSafeInteger(number)||number<1||number>CAMPAIGN_COUNT)throw Error('Неверный номер уровня');
  return new Set((targets as number[][])[number-1]);
}
