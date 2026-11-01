import assert from 'node:assert/strict';
import { Game, type Level } from '../../src/game.ts';
import type { CampaignLevel } from '../../src/campaign-types.ts';
import { playableLevel } from '../../src/campaign-art.ts';
import { capacityGroups, capacityRanges, normalizeCapacities, assertCapacities } from './capacities.ts';
import { certify, replayDecisions, type Proof } from './solver.ts';

export const FAST_FILL_SECONDS = 1;
export { measureFills } from './capacity-measurements.ts';
import type { FillTime } from './capacity-measurements.ts';
import { measureLevel, auditCandidateKey, readAuditCache, writeAuditCache, type AuditCache } from './capacity-audit-cache.ts';
import { readVerified, writeVerified, validProofs, playableKey } from './verification.ts';
import { createHash } from 'node:crypto';
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

export function fastColors(level:Level, fills:FillTime[], seconds=FAST_FILL_SECONDS):Set<number> {
  const uneven=new Set(capacityRanges(level).filter(r=>r.max>2*r.min).map(r=>r.color));
  return new Set(fills.filter(f=>f.seconds<seconds&&uneven.has(f.color)).map(f=>f.color));
}

function capacities(level:Level):AuditResult['capacitiesBefore'] {
  return [...capacityGroups(level)].map(([color,buckets])=>({color,buckets:buckets.map(({id,capacity})=>({id,capacity}))}));
}

export function auditLevel(record:CampaignLevel, baseline:Proof[], seconds=FAST_FILL_SECONDS, measurements?:FillTime[], cache?:AuditCache):AuditResult {
  const source=playableLevel(record);
  assertCapacities(source);
  const before=measurements??measureLevel(source,baseline,cache);
  const colors=fastColors(source,before,seconds);
  const key=cache?auditCandidateKey(source,baseline,colors,cache.hashes):undefined;
  if(cache&&key){
    const saved=readAuditCache<AuditResult>(cache.directory,'candidates',key);
    if(saved&&['unchanged','simple','fixed-pairs','unconfirmed'].includes(saved.status)&&
      (saved.status!=='simple'||(saved.candidate&&saved.after&&validProofs(saved.proofs)))){
      cache.stats.candidateHits++;
      return {...saved,number:record.number,before,candidate:saved.candidate?{...record,field:saved.candidate.field,mechanics:saved.candidate.mechanics}:undefined};
    }
    cache.stats.candidateRuns++;
  }
  const save=(result:AuditResult):AuditResult=>{
    if(cache&&key)writeAuditCache(cache.directory,'candidates',key,result);
    return result;
  };
  const result:AuditResult={number:record.number,status:'unchanged',colors:[...colors].sort(),before,rangesBefore:capacityRanges(source),capacitiesBefore:capacities(source)};
  if(!colors.size)return save(result);
  let level:Level;
  try { level=normalizeCapacities(source,colors); }
  catch(error){
    if(!String(error).includes('фиксированные пары'))throw error;
    return save({...result,status:'fixed-pairs',reason:String(error)});
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
  const proofKey=cache?createHash('sha256').update(cache.hashes.verification).update(playableKey(level)).digest('hex'):undefined;
  const proofFile=proofKey&&cache?new URL(`${proofKey}.json`,cache.certificates):undefined;
  const cachedProofs=proofFile&&proofKey?readVerified(proofFile,proofKey):undefined;
  if(cachedProofs&&cache)cache.stats.proofHits++;
  const proofs:Proof[]=cachedProofs??[],failures:NonNullable<AuditResult['failures']>=[];
  for(const proof of cachedProofs?[]:baseline){
    try {
      try { proofs.push(replayDecisions(level,proof.decisions,proof.speed,proof.pause)); }
      catch { proofs.push(certify(level,proof.speed,proof.pause)); }
    }catch(error){failures.push({speed:proof.speed,pause:proof.pause,reason:String(error)});}
  }
  if(!failures.length&&proofFile&&proofKey&&!cachedProofs)writeVerified(proofFile,proofKey,proofs);
  const candidate={...record,field:level.field,mechanics:level.mechanics};
  return save({...result,status:failures.length?'unconfirmed':'simple',candidate,proofs,failures,rangesAfter:capacityRanges(level),capacitiesAfter:capacities(level),after:failures.length?undefined:measureLevel(level,proofs,cache)});
}
