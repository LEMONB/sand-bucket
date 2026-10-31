import type { Level } from '../../src/game.ts';
import { capacityGroups, normalizeCapacities, MAX_CAPACITY_RATIO as RATIO } from './capacities.ts';

// New layouts may choose a new shared swap capacity; existing layouts keep theirs.
export function normalizeNewLayout(source: Level): Level {
  const level = structuredClone(source);
  const groups = [...capacityGroups(level).values()].filter(buckets => buckets.some(b => b.swapWith !== undefined));
  if (!groups.length) return normalizeCapacities(level);
  const bounds = groups.map(buckets => {
    const fixed = buckets.filter(b => b.swapWith !== undefined), free = buckets.filter(b => b.swapWith === undefined);
    const total = buckets.reduce((sum,b) => sum+b.capacity,0);
    return { fixed, free, total, min: Math.ceil(total/(fixed.length+RATIO*free.length)), max: Math.floor(RATIO*total/(RATIO*fixed.length+free.length)) };
  });
  const min = Math.max(...bounds.map(b => b.min)), max = Math.min(...bounds.map(b => b.max));
  const feasible = (capacity:number) => bounds.every(({fixed,free,total}) => {
    const rest=total-fixed.length*capacity;
    if (!free.length) return rest===0;
    return Math.max(1,Math.ceil(capacity/RATIO),Math.ceil(rest/(RATIO*free.length)))<=Math.min(capacity,Math.floor(rest/free.length));
  });
  let capacity=min;
  while(capacity<=max&&!feasible(capacity))capacity++;
  if(capacity>max)throw Error('Нет общей вместимости пары в пределах 4:1');
  for(const {fixed,free,total} of bounds){
    for(const bucket of fixed)bucket.capacity=capacity;
    let remainder=total-fixed.length*capacity-free.reduce((sum,b)=>sum+b.capacity,0);
    for(const bucket of free.sort((a,b)=>b.capacity-a.capacity||a.id-b.id)){
      const delta=remainder>0?remainder:-Math.min(-remainder,bucket.capacity-1);
      bucket.capacity+=delta;remainder-=delta;
    }
    if(remainder)throw Error('Не удалось сохранить песок пары');
  }
  return normalizeCapacities(level);
}
