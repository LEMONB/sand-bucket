import { expect,it } from 'vitest';
import { campaignLevel,playableLevel } from '../src/campaign';
import { Game } from '../src/game';
import { assertCapacities } from '../scripts/campaign/capacities';
import { structuralSignature } from '../scripts/campaign/selection';

it('contains 400 valid, distinct puzzles using each artwork four times',()=>{
 const signatures=new Set<string>(),mechanics=new Set<number>();
 for(let number=1;number<=400;number++){
   const record=campaignLevel(number);
   expect(record.kinds).not.toContain(4);expect(record.mechanics?.bridges??[]).toEqual([]);
   expect(record.number).toBe(number);expect(record.art).toBe((number-1)%100);
   expect(record.family).toBe(Math.floor((number-1)/100));
   const level=playableLevel(record);
   assertCapacities(level);
   expect(new Game(level).paths.size).toBeGreaterThan(0);
   const signature=structuralSignature({...record,...level});expect(signatures.has(signature)).toBe(false);signatures.add(signature);
   record.kinds.forEach(k=>mechanics.add(k));
 }
 expect([...mechanics].sort()).toEqual([0,1,2,3,5,6,7,8]);
});
it('isolates retries and rejects out-of-range levels',()=>{
 const first=campaignLevel(1),expected=structuredClone(first);first.walls.push(999);first.field.fill(null);
 expect(campaignLevel(1)).toEqual(expected);
 for(const number of [0,-1,401,1.5,NaN])expect(()=>campaignLevel(number)).toThrow();
});

it('merges accent sand and all bucket sources without changing capacities or the catalog', () => {
  for (let number = 1; number <= 400; number++) {
    const record = campaignLevel(number), before = structuredClone(record);
    const level = playableLevel(record);
    expect([...new Set(level.cells)].sort()).toEqual([1, 2, 3, 4]);
    const buckets = (l: typeof level) => [...l.field, ...(l.mechanics?.queues.flatMap(q => q.buckets) ?? []), ...(l.mechanics?.platforms.flatMap(p => p.next) ?? [])];
    const original = buckets({ ...record, cells: level.cells });
    expect(buckets(level)).toEqual(original.map(b => b ? { ...b, color: b.color > 4 ? b.color - 4 : b.color } : null));
    expect(record).toEqual(before);
    expect(() => new Game(level)).not.toThrow();
  }
});
