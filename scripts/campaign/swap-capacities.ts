import type { Level } from '../../src/game.ts';
import { capacityGroups, normalizeCapacities, MAX_CAPACITY_RATIO as RATIO } from './capacities.ts';

// Use only when changing the shared capacity of swap partners is allowed.
export function normalizeNewLayout(source: Level, tighterColors: ReadonlySet<number> = new Set()): Level {
  const level = structuredClone(source);
  const groups = [...capacityGroups(level).values()].filter(buckets => buckets.some(b => b.swapWith !== undefined));
  if (!groups.length) return normalizeCapacities(level, tighterColors);
  const bounds = groups.map(buckets => {
    const fixed = buckets.filter(b => b.swapWith !== undefined), free = buckets.filter(b => b.swapWith === undefined);
    const total = buckets.reduce((sum,b) => sum+b.capacity,0);
    const ratio = tighterColors.has(buckets[0].color) ? 2 : RATIO;
    return { fixed, free, total, ratio, min: Math.ceil(total/(fixed.length+ratio*free.length)), max: Math.floor(ratio*total/(ratio*fixed.length+free.length)) };
  });
  const min = Math.max(...bounds.map(b => b.min)), max = Math.min(...bounds.map(b => b.max));
  const feasible = (capacity:number) => bounds.every(({fixed,free,total,ratio}) => {
    const rest=total-fixed.length*capacity;
    if (!free.length) return rest===0;
    return Math.max(1,Math.ceil(capacity/ratio),Math.ceil(rest/(ratio*free.length)))<=Math.min(capacity,Math.floor(rest/free.length));
  });
  let capacity=min;
  while(capacity<=max&&!feasible(capacity))capacity++;
  if(capacity>max)throw Error('Нет общей вместимости пары в заданных пределах');
  for(const {fixed,free,total} of bounds){
    for(const bucket of fixed)bucket.capacity=capacity;
    let remainder=total-fixed.length*capacity-free.reduce((sum,b)=>sum+b.capacity,0);
    for(const bucket of free.sort((a,b)=>b.capacity-a.capacity||a.id-b.id)){
      const delta=remainder>0?remainder:-Math.min(-remainder,bucket.capacity-1);
      bucket.capacity+=delta;remainder-=delta;
    }
    if(remainder)throw Error('Не удалось сохранить песок пары');
  }
  return normalizeCapacities(level, tighterColors);
}
