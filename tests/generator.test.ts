import { expect, it } from 'vitest';
import { asLevel, difficulty, generateLevel, replay, solve, type GeneratedLevel } from '../src/generator';
import { fallbackLevel } from '../src/level';

const seedCount = process.env.SAND_BUCKET_FULL_TESTS === '1' ? 100 : 3;
const delays = process.env.SAND_BUCKET_FULL_TESTS === '1' ? [6,12,18] : [];

it('cycles 3 easy, 3 medium, 2 hard, 1 very hard',()=>{
  expect(Array.from({length:18},(_,i)=>difficulty(i+1))).toEqual([0,0,0,1,1,1,2,2,3,0,0,0,1,1,1,2,2,3]);
});
for(const number of [1,4,7,9]) {
  it(`reproduces and certifies fallback ${number}`,()=>{
    const level=fallbackLevel(number);
    expect(replay(asLevel(level),level.solution).status).toBe('won');
    for(const delay of delays)for(const speed of [1,2] as const){
      const proof=solve(asLevel(level),delay,speed);
      expect(replay(asLevel(level),proof.solution,undefined,speed).status).toBe('won');
    }
  },30000);
  it.each(Array.from({length:seedCount},(_,i)=>i*104729+1))(`class ${number}: seed %i has a verified solution`,seed=>{
    let level: GeneratedLevel;
    try { level=generateLevel(number,seed); }
    catch(error) {
      expect((error as Error).message).toBe('Лимит генерации исчерпан');
      level=fallbackLevel(number,seed);
    }
    expect(level.columns).toBe(difficulty(number)+4);
    expect(level.field.filter(Boolean).length+level.walls.length).toBeLessThanOrEqual(level.columns**2);
    expect(replay(asLevel(level),level.solution).status).toBe('won');
  },30000);
}
it.each([1,2,3,4,5,6,7,8])('introduces mechanic %i with a certified playable level',number=>{
  const level=generateLevel(number);
  expect(level.kinds).toEqual(number===5?[]:[number-1]);
  expect(replay(asLevel(level),level.solution).status).toBe('won');
},30000);
it.each([11,14,17,20,23,26,29,32])('certifies the remaining mechanics at level %i',number=>{
 const level=generateLevel(number);expect(level.kinds).toHaveLength([29,32].includes(number)?1:2);expect(level.kinds).not.toContain(4);
 expect(replay(asLevel(level),level.solution).status).toBe('won');
},30000);
it.each([15,24])('certifies three mechanic instances, eight colors and both speeds at level %i',number=>{
 const record=generateLevel(number),level=asLevel(record);
 expect(record.kinds).toHaveLength(3);
 expect(new Set(record.cells).size).toBe(8);
 expect(record.walls.length).toBeGreaterThan(0);
 for(const speed of [1,2] as const){
   const proof=solve(level,0,speed);
   expect(replay(level,proof.solution,undefined,speed).status).toBe('won');
 }
},30000);
it('rejects invalid generation input and incomplete proofs',()=>{
  expect(()=>generateLevel(-1)).toThrow();expect(()=>generateLevel(1,-1)).toThrow();
  const level=fallbackLevel(1);expect(()=>replay(asLevel(level),level.solution.slice(1))).toThrow();
});
