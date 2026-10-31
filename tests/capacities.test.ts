import { expect, it } from 'vitest';
import type { Level } from '../src/game';
import { emptyMechanics } from '../src/mechanics';
import { normalizeCapacities, capacityGroups, assertCapacities } from '../scripts/campaign/capacities';

const fixture=(capacities:number[]):Level=>({cells:new Uint8Array(128*128),field:capacities.map((capacity,id)=>({id,color:1,capacity}))});
it('removes extremes while preserving integer totals, IDs and the original input',()=>{
  const source=fixture([1,127,2820]),before=structuredClone(source),level=normalizeCapacities(source);
  assertCapacities(level);
  expect(level.field.map(b=>b!.capacity)).toEqual([493,491,1964]);
  expect(level.field.reduce((sum,b)=>sum+b!.capacity,0)).toBe(2948);
  expect(level.field.map(b=>b!.id)).toEqual([0,1,2]);
  expect(source).toEqual(before);
});
it('leaves already acceptable colors and single buckets unchanged',()=>{
  const source=fixture([10,40,20]);source.field.push({id:3,color:2,capacity:1});
  expect(normalizeCapacities(source)).toEqual(source);
});
it('includes dispenser and platform contents in their gameplay color group',()=>{
  const source=fixture([1]);source.mechanics=emptyMechanics();
  source.mechanics.queues.push({cell:0,buckets:[{id:1,color:1,capacity:127}]});
  source.mechanics.platforms.push({cells:[1,2,3,4],next:[{id:2,color:1,capacity:2820}]});
  const result=normalizeCapacities(source);assertCapacities(result);
  expect(capacityGroups(result).get(1)!.reduce((sum,b)=>sum+b.capacity,0)).toBe(2948);
});
it('keeps fixed swap capacities and their equality across colors',()=>{
  const source=fixture([100,1,299]);source.field[0]!.swapWith=3;
  source.field.push({id:3,color:2,capacity:100,swapWith:0},{id:4,color:2,capacity:1},{id:5,color:2,capacity:299});
  const result=normalizeCapacities(source);assertCapacities(result);
  expect(result.field[0]!.capacity).toBe(100);expect(result.field[3]!.capacity).toBe(100);
  for(const buckets of capacityGroups(result).values())expect(buckets.reduce((s,b)=>s+b.capacity,0)).toBe(400);
});
it('fails impossible fixed pairs atomically instead of weakening the ratio',()=>{
  const source=fixture([1,1000]);source.field[0]!.swapWith=7;const before=structuredClone(source);
  expect(()=>normalizeCapacities(source)).toThrow('фиксированные пары');expect(source).toEqual(before);
});
it('handles rounding deterministically and rejects invalid capacities',()=>{
  for(const counts of [[1,1,9],[1,100],[1,6,21,70],[2,3,19,1000]]){
    const level=normalizeCapacities(fixture(counts));assertCapacities(level);
    expect(level).toEqual(normalizeCapacities(fixture(counts)));
    expect(level.field.every(b=>Number.isSafeInteger(b!.capacity)&&b!.capacity>0)).toBe(true);
    expect(level.field.reduce((s,b)=>s+b!.capacity,0)).toBe(counts.reduce((a,b)=>a+b,0));
  }
  for(const capacity of [0,-1,1.5,NaN])expect(()=>normalizeCapacities(fixture([capacity]))).toThrow('Неверная вместимость');
});

it('chooses equal feasible swap capacities only when preparing a new layout',async()=>{
  const {normalizeNewLayout}=await import('../scripts/campaign/swap-capacities');
  const source=fixture([1,1000]);source.field[0]!.swapWith=2;
  source.field.push({id:2,color:2,capacity:1,swapWith:0},{id:3,color:2,capacity:500});
  const result=normalizeNewLayout(source);assertCapacities(result);
  expect(result.field[0]!.capacity).toBe(result.field[2]!.capacity);
  expect(result.field[0]!.capacity).toBeGreaterThan(1);
  expect([...capacityGroups(result).values()].map(bs=>bs.reduce((s,b)=>s+b.capacity,0))).toEqual([1001,501]);
  expect(source.field[0]!.capacity).toBe(1);
});
it('rejects incompatible swap colors rather than losing sand',async()=>{
  const {normalizeNewLayout}=await import('../scripts/campaign/swap-capacities');
  const source=fixture([1,1000]);source.field[0]!.swapWith=2;
  source.field.push({id:2,color:2,capacity:1,swapWith:0});
  expect(()=>normalizeNewLayout(source)).toThrow('Нет общей вместимости');
});
