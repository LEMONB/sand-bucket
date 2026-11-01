import assert from 'node:assert/strict';
import type { Level } from '../../src/game.ts';
import { replayDecisions, type Proof } from './solver.ts';

export interface FillTime { bucketId:number; color:number; capacity:number; pause:number; seconds:number }

export function measureFills(level:Level, proof:Proof):FillTime[] {
  assert.equal(proof.speed,2);
  const arrivals=new Map<number,number>(),fills:FillTime[]=[];
  replayDecisions(level,proof.decisions,proof.speed,proof.pause,game=>{
    for(const event of game.events){
      if(event.type==='arrive')arrivals.set(event.bucket.id,event.tick);
      if(event.type==='complete'){
        const arrival=arrivals.get(event.bucket.id);
        assert.notEqual(arrival,undefined,'Completion must follow arrival');
        fills.push({bucketId:event.bucket.id,color:event.bucket.color,capacity:event.bucket.capacity,pause:proof.pause,seconds:(event.tick-arrival!+1)/120});
      }
    }
  });
  assert.equal(fills.length,arrivals.size);
  return fills;
}
