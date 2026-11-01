import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import type { Level } from '../../src/game.ts';
import type { Proof } from './solver.ts';
import { playableKey, verificationHash } from './verification.ts';
import { measureFills, type FillTime } from './capacity-measurements.ts';

export interface AuditHashes { verification:string; measurements:string; candidates:string }
export interface AuditStats { measurementHits:number; measurementRuns:number; candidateHits:number; candidateRuns:number; proofHits:number }
export interface AuditCache { directory:URL; certificates:URL; hashes:AuditHashes; stats:AuditStats }
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function auditHashes(read:(file:string)=>string):AuditHashes {
  const verification=verificationHash(read);
  const measurements=digest([verification,...['scripts/campaign/capacity-measurements.ts','scripts/campaign/capacity-audit-cache.ts'].map(f=>[f,read(f)])]);
  const candidates=digest([measurements,read('scripts/campaign/capacity-audit.ts'),read('scripts/campaign/capacities.ts')]);
  return {verification,measurements,candidates};
}
export function auditStats():AuditStats {
  return {measurementHits:0,measurementRuns:0,candidateHits:0,candidateRuns:0,proofHits:0};
}
// Only routes affect replay; timing summaries and search metadata do not.
const routes=(proofs:Proof[])=>proofs.map(({speed,pause,decisions})=>({speed,pause,decisions})).sort((a,b)=>a.speed-b.speed||a.pause-b.pause);
export function measurementKey(level:Level, proofs:Proof[], hashes:AuditHashes):string {
  return digest([hashes.measurements,playableKey(level),routes(proofs.filter(p=>p.speed===2))]);
}
export function auditCandidateKey(level:Level, proofs:Proof[], colors:ReadonlySet<number>, hashes:AuditHashes):string {
  return digest([hashes.candidates,playableKey(level),routes(proofs),[...colors].sort((a,b)=>a-b)]);
}
export function readAuditCache<T>(directory:URL, stage:string, key:string):T|undefined {
  try {
    const saved=JSON.parse(readFileSync(new URL(`${stage}/${key}.json`,directory),'utf8'));
    if(saved.key===key&&saved.checksum===digest([key,saved.value]))return saved.value as T;
  } catch { /* Missing, interrupted or damaged entries are recomputed. */ }
}
export function writeAuditCache(directory:URL, stage:string, key:string, value:unknown):void {
  const folder=new URL(`${stage}/`,directory);mkdirSync(folder,{recursive:true});
  const file=new URL(`${key}.json`,folder),temp=new URL(`${key}.${randomUUID()}.tmp`,folder);
  writeFileSync(temp,JSON.stringify({key,value,checksum:digest([key,value])}));renameSync(temp,file);
}
export function measureLevel(level:Level, proofs:Proof[], cache?:AuditCache):FillTime[] {
  const key=cache?measurementKey(level,proofs,cache.hashes):undefined;
  if(cache&&key){
    const saved=readAuditCache<FillTime[]>(cache.directory,'measurements',key);
    if(Array.isArray(saved)){cache.stats.measurementHits++;return saved;}
    cache.stats.measurementRuns++;
  }
  const fills=proofs.filter(p=>p.speed===2).flatMap(p=>measureFills(level,p));
  if(cache&&key)writeAuditCache(cache.directory,'measurements',key,fills);
  return fills;
}
