import { expect, it } from 'vitest';
import { fastColors, measureFills } from '../scripts/campaign/capacity-audit';
import { certify } from '../scripts/campaign/solver';
import type { Level } from '../src/game';

it('selects strictly sub-half-second colors only when their ratio exceeds 2:1',()=>{
  const level:Level={cells:new Uint8Array(128*128),field:[
    {id:0,color:1,capacity:10},{id:1,color:1,capacity:40},
    {id:2,color:2,capacity:10},{id:3,color:2,capacity:20},
  ]};
  const fill={bucketId:0,color:1,capacity:10,pause:0,seconds:0.5};
  expect([...fastColors(level,[fill],0.5)]).toEqual([]);
  expect([...fastColors(level,[{...fill,seconds:59/120},{...fill,color:2,seconds:1/120}],0.5)]).toEqual([1]);
  expect([...fastColors(level,[fill])]).toEqual([1]);
  expect([...fastColors(level,[fill],1)]).toEqual([1]);
  expect([...fastColors(level,[{...fill,seconds:1}],1)]).toEqual([]);
});
it('counts the collection tick and excludes travel before arrival',()=>{
  const level:Level={cells:new Uint8Array(128*128),field:[{id:0,color:1,capacity:1},...Array(15).fill(null)]};
  level.cells[127*128+13]=1;
  const proof=certify(level,2,0),before=structuredClone(level);
  const fills=measureFills(level,proof);
  expect(fills).toEqual([{bucketId:0,color:1,capacity:1,pause:0,seconds:1/120}]);
  expect(level).toEqual(before);
});
