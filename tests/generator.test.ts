import { expect, it } from 'vitest';
import { asLevel, difficulty, generateLevel, replay, replayOrder, type GeneratedLevel } from '../src/generator';
import { fallbackLevel } from '../src/level';

it('cycles 3 easy, 3 medium, 2 hard, 1 very hard',()=>{
  expect(Array.from({length:18},(_,i)=>difficulty(i+1))).toEqual([0,0,0,1,1,1,2,2,3,0,0,0,1,1,1,2,2,3]);
});
for(const number of [1,4,7,9]) {
  it(`reproduces and certifies fallback ${number}`,()=>{
    const level=fallbackLevel(number); const generated=generateLevel(number);
    const {fallback:_,...saved}=level;expect(generated).toEqual(saved);
    expect(replay(asLevel(level),level.solution).status).toBe('won');
    for(const delay of [6,12,18])expect(replayOrder(asLevel(level),level.solution.map(m=>m.bucketId),delay).game.status).toBe('won');
  },30000);
  it.each(Array.from({length:100},(_,i)=>i*104729+1))(`class ${number}: seed %i has a verified solution`,seed=>{
    let level: GeneratedLevel;
    try { level=generateLevel(number,seed); }
    catch(error) {
      expect((error as Error).message).toBe('Лимит генерации исчерпан');
      level=fallbackLevel(number,seed);
    }
    expect(level.columns).toBe(difficulty(number)+4);
    expect(level.field.filter(Boolean).length+level.walls.length).toBe(level.columns**2);
    expect(replay(asLevel(level),level.solution).status).toBe('won');
  },30000);
}
it('rejects invalid generation input and incomplete proofs',()=>{
  expect(()=>generateLevel(-1)).toThrow();expect(()=>generateLevel(1,-1)).toThrow();
  const level=fallbackLevel(1);expect(()=>replay(asLevel(level),level.solution.slice(1))).toThrow();
});
