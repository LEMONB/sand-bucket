import type { BucketSpec, Level } from '../../src/game.ts';

export const MAX_CAPACITY_RATIO = 4;
export function capacityGroups(level: Pick<Level, 'field' | 'mechanics'>): Map<number, BucketSpec[]> {
  const groups = new Map<number, BucketSpec[]>();
  const buckets = [...level.field, ...(level.mechanics?.queues.flatMap(q => q.buckets) ?? []), ...(level.mechanics?.platforms.flatMap(p => p.next) ?? [])];
  for (const bucket of buckets) {
    if (!bucket) continue;
    if (!Number.isSafeInteger(bucket.capacity) || bucket.capacity < 1) throw Error('Неверная вместимость');
    const group = groups.get(bucket.color) ?? [];
    group.push(bucket); groups.set(bucket.color, group);
  }
  return groups;
}
export function capacityRanges(level: Pick<Level, 'field' | 'mechanics'>): { color: number; min: number; max: number }[] {
  return [...capacityGroups(level)].map(([color, buckets]) => ({ color, min: Math.min(...buckets.map(b => b.capacity)), max: Math.max(...buckets.map(b => b.capacity)) }));
}
export function assertCapacities(level: Pick<Level, 'field' | 'mechanics'>): void {
  for (const range of capacityRanges(level)) {
    if (range.max > MAX_CAPACITY_RATIO * range.min) throw Error(`Цвет ${range.color}: вместимости ${range.min}–${range.max} превышают 4:1`);
  }
}

// Work on a copy: an impossible fixed swap pair must not leave a half-rebalanced level.
export function normalizeCapacities(source: Level): Level {
  const level = structuredClone(source);
  for (const [color, buckets] of capacityGroups(level)) {
    const capacities = buckets.map(b => b.capacity);
    if (Math.max(...capacities) <= MAX_CAPACITY_RATIO * Math.min(...capacities)) continue;
    const free = buckets.filter(b => b.swapWith === undefined).sort((a, b) => a.id - b.id);
    const fixed = buckets.filter(b => b.swapWith !== undefined);
    if (!free.length) throw Error(`Цвет ${color}: фиксированные пары не допускают 4:1`);
    const total = free.reduce((sum, b) => sum + b.capacity, 0);
    const lower = Math.max(1, Math.ceil(total / (MAX_CAPACITY_RATIO * free.length)), ...fixed.map(b => Math.ceil(b.capacity / MAX_CAPACITY_RATIO)));
    const upper = Math.min(Math.floor(total / free.length), ...fixed.map(b => b.capacity));
    if (lower > upper) throw Error(`Цвет ${color}: фиксированные пары не допускают 4:1`);
    const clamped = (capacity:number, low:number) => Math.max(low, Math.min(low * MAX_CAPACITY_RATIO, capacity));
    // Find the interval that needs the least extra redistribution after clipping extremes.
    let lo=lower,hi=upper;
    while(lo<hi){const mid=Math.floor((lo+hi)/2);if(free.reduce((sum,b)=>sum+clamped(b.capacity,mid),0)<total)lo=mid+1;else hi=mid;}
    const cost=(low:number)=>free.reduce((sum,b)=>sum+Math.abs(clamped(b.capacity,low)-b.capacity),0)+Math.abs(total-free.reduce((sum,b)=>sum+clamped(b.capacity,low),0));
    const low=lo>lower&&cost(lo-1)<=cost(lo)?lo-1:lo,high=low*MAX_CAPACITY_RATIO;
    for (const bucket of free) bucket.capacity = clamped(bucket.capacity,low);
    let remainder = total - free.reduce((sum, b) => sum + b.capacity, 0);
    for (const bucket of free) {
      const delta = remainder > 0 ? Math.min(remainder, high - bucket.capacity) : -Math.min(-remainder, bucket.capacity - low);
      bucket.capacity += delta; remainder -= delta;
    }
    if (remainder) throw Error('Не удалось сохранить сумму вместимостей');
  }
  assertCapacities(level);
  return level;
}
