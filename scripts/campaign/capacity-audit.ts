import assert from 'node:assert/strict';
import { Game, type Level } from '../../src/game.ts';
import type { CampaignLevel } from '../../src/campaign-types.ts';
import { playableLevel } from '../../src/campaign-art.ts';
import { capacityGroups, capacityRanges, normalizeCapacities, assertCapacities } from './capacities.ts';
import { certify, replayDecisions, type Proof } from './solver.ts';

export const FAST_FILL_SECONDS = 1;
export interface FillTime { bucketId:number; color:number; capacity:number; pause:number; seconds:number }
export interface AuditResult {
  number:number;
  status:'unchanged'|'simple'|'fixed-pairs'|'unconfirmed';
  colors:number[];
  before:FillTime[];
  after?:FillTime[];
  rangesBefore:ReturnType<typeof capacityRanges>;
  rangesAfter?:ReturnType<typeof capacityRanges>;
  capacitiesBefore:{color:number; buckets:{id:number;capacity:number}[]}[];
  capacitiesAfter?:AuditResult['capacitiesBefore'];
  candidate?:CampaignLevel;
  proofs?:Proof[];
  failures?:{speed:number;pause:number;reason:string}[];
  reason?:string;
}

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
  assert.equal(fills.length,[...capacityGroups(level).values()].flat().length);
  return fills;
}

export function fastColors(level:Level, fills:FillTime[], seconds=FAST_FILL_SECONDS):Set<number> {
  const uneven=new Set(capacityRanges(level).filter(r=>r.max>2*r.min).map(r=>r.color));
  return new Set(fills.filter(f=>f.seconds<seconds&&uneven.has(f.color)).map(f=>f.color));
}

function capacities(level:Level):AuditResult['capacitiesBefore'] {
  return [...capacityGroups(level)].map(([color,buckets])=>({color,buckets:buckets.map(({id,capacity})=>({id,capacity}))}));
}

export function auditLevel(record:CampaignLevel, baseline:Proof[], seconds=FAST_FILL_SECONDS, measurements?:FillTime[]):AuditResult {
  const source=playableLevel(record);
  assertCapacities(source);
  const before=measurements??baseline.filter(p=>p.speed===2).flatMap(p=>measureFills(source,p));
  const colors=fastColors(source,before,seconds);
  const result:AuditResult={number:record.number,status:'unchanged',colors:[...colors].sort(),before,rangesBefore:capacityRanges(source),capacitiesBefore:capacities(source)};
  if(!colors.size)return result;
  let level:Level;
  try { level=normalizeCapacities(source,colors); }
  catch(error){
    if(!String(error).includes('фиксированные пары'))throw error;
    return {...result,status:'fixed-pairs',reason:String(error)};
  }
  assertCapacities(level,colors);
  const original=capacityGroups(source);
  for(const [color,buckets] of capacityGroups(level)){
    const prior=original.get(color)!;
    assert.equal(buckets.reduce((s,b)=>s+b.capacity,0),prior.reduce((s,b)=>s+b.capacity,0));
    if(!colors.has(color))assert.deepEqual(buckets,prior);
    for(let i=0;i<buckets.length;i++){
      assert.deepEqual({...buckets[i],capacity:prior[i].capacity},prior[i]);
      if(prior[i].swapWith!==undefined)assert.equal(buckets[i].capacity,prior[i].capacity);
    }
  }
  new Game(level);
  const proofs:Proof[]=[],failures:NonNullable<AuditResult['failures']>=[];
  for(const proof of baseline){
    try {
      try { proofs.push(replayDecisions(level,proof.decisions,proof.speed,proof.pause)); }
      catch { proofs.push(certify(level,proof.speed,proof.pause)); }
    }catch(error){failures.push({speed:proof.speed,pause:proof.pause,reason:String(error)});}
  }
  const candidate={...record,field:level.field,mechanics:level.mechanics};
  return {...result,status:failures.length?'unconfirmed':'simple',candidate,proofs,failures,rangesAfter:capacityRanges(level),capacitiesAfter:capacities(level),after:failures.length?undefined:proofs.filter(p=>p.speed===2).flatMap(p=>measureFills(level,p))};
}
