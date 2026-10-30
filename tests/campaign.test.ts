import { expect,it } from 'vitest';
import { campaignLevel,playableLevel } from '../src/campaign';
import { Game } from '../src/game';
import { structuralSignature } from '../scripts/campaign/selection';

it('contains 400 valid, distinct puzzles using each artwork four times',()=>{
 const signatures=new Set<string>(),mechanics=new Set<number>();
 for(let number=1;number<=400;number++){
   const record=campaignLevel(number);
   expect(record.number).toBe(number);expect(record.art).toBe((number-1)%100);
   expect(record.family).toBe(Math.floor((number-1)/100));
   expect(new Game(playableLevel(record)).paths.size).toBeGreaterThan(0);
   const signature=structuralSignature(record);expect(signatures.has(signature)).toBe(false);signatures.add(signature);
   record.kinds.forEach(k=>mechanics.add(k));
 }
 expect([...mechanics].sort()).toEqual([0,1,2,3,4,5,6,7,8]);
});
it('isolates retries and rejects out-of-range levels',()=>{
 const first=campaignLevel(1),expected=structuredClone(first);first.walls.push(999);first.field.fill(null);
 expect(campaignLevel(1)).toEqual(expected);
 for(const number of [0,-1,401,1.5,NaN])expect(()=>campaignLevel(number)).toThrow();
});
