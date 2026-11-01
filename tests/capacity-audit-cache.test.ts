import { afterEach,beforeAll,expect,it } from 'vitest';
import { mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { campaignLevel,playableLevel } from '../src/campaign';
import { capacityGroups } from '../scripts/campaign/capacities';
import { auditLevel } from '../scripts/campaign/capacity-audit';
import { auditHashes,auditStats,measurementKey,auditCandidateKey,type AuditCache } from '../scripts/campaign/capacity-audit-cache';
import { certify,type Proof } from '../scripts/campaign/solver';

const record=campaignLevel(6);
const color=capacityGroups(record).get(4)!;
color[0]!.capacity=11;color[1]!.capacity=33;
const level=playableLevel(record);
let proofs:Proof[];
beforeAll(()=>{proofs=[1,2].flatMap(speed=>[0,120,1800,-1].map(pause=>certify(level,speed as 1|2,pause)));},30000);
const folders:string[]=[];
afterEach(()=>{for(const f of folders.splice(0))rmSync(f,{recursive:true,force:true});});
function cache():AuditCache {
  const path=mkdtempSync(join(tmpdir(),'sand-audit-'));folders.push(path);
  const directory=pathToFileURL(path+'/'),certificates=new URL('certificates/',directory);mkdirSync(certificates);
  return {directory,certificates,hashes:auditHashes(f=>f),stats:auditStats()};
}
it('reuses measurements and the candidate when a new threshold selects the same colors',()=>{
  const c=cache(),first=auditLevel(record,proofs,0.5,undefined,c);
  expect(first.status).toBe('simple');expect(first.colors).toContain(4);
  expect(c.stats.measurementRuns).toBe(2);expect(c.stats.candidateRuns).toBe(1);
  c.stats=auditStats();
  const second=auditLevel({...record,seed:999},proofs,1,undefined,c);
  expect(second.colors).toEqual(first.colors);
  expect(second.candidate!.seed).toBe(999);
  expect(second.candidate!.field).toEqual(first.candidate!.field);
  expect(c.stats).toEqual({measurementHits:1,measurementRuns:0,candidateHits:1,candidateRuns:0,proofHits:0});
},30000);
it('recomputes damaged entries and reuses certificates and candidate timings',()=>{
  const c=cache(),first=auditLevel(record,proofs,0.5,undefined,c);
  const mk=measurementKey(level,proofs,c.hashes),ck=auditCandidateKey(level,proofs,new Set(first.colors),c.hashes);
  const measurement=new URL(`measurements/${mk}.json`,c.directory);
  const damaged=JSON.parse(readFileSync(measurement,'utf8'));damaged.value[0].seconds=999;
  writeFileSync(measurement,JSON.stringify(damaged));c.stats=auditStats();
  expect(auditLevel(record,proofs,0.5,undefined,c).before).toEqual(first.before);
  expect(c.stats.measurementRuns).toBe(1);expect(c.stats.candidateHits).toBe(1);
  writeFileSync(new URL(`candidates/${ck}.json`,c.directory),'{');c.stats=auditStats();
  const repaired=auditLevel(record,proofs,0.5,undefined,c);
  expect(repaired.candidate).toEqual(first.candidate);
  expect(c.stats).toEqual({measurementHits:2,measurementRuns:0,candidateHits:0,candidateRuns:1,proofHits:1});
},30000);
it('keys each level, route and selected set separately, excluding report and generation metadata',()=>{
  const hashes=auditHashes(f=>f),mk=measurementKey(level,proofs,hashes),ck=auditCandidateKey(level,proofs,new Set([4]),hashes);
  const changed=structuredClone(level);changed.field.find(b=>b)!.capacity++;
  expect(measurementKey(changed,proofs,hashes)).not.toBe(mk);
  expect(auditCandidateKey(changed,proofs,new Set([4]),hashes)).not.toBe(ck);
  expect(measurementKey(level,proofs,hashes)).toBe(mk);
  expect(auditCandidateKey(level,proofs,new Set([1,4]),hashes)).not.toBe(ck);
  const metadata=proofs.map(p=>({...p,nodes:999,ticks:p.ticks+1}));
  expect(measurementKey(level,metadata,hashes)).toBe(mk);
  expect(auditCandidateKey(level,metadata,new Set([4]),hashes)).toBe(ck);
  const routes=structuredClone(proofs);routes.find(p=>p.speed===2)!.decisions[0].collected++;
  expect(measurementKey(level,routes,hashes)).not.toBe(mk);
  expect(auditHashes(f=>f==='scripts/campaign/capacity-audit-report.ts'?'changed':f)).toEqual(hashes);
  const normalization=auditHashes(f=>f==='scripts/campaign/capacities.ts'?'changed':f);
  expect(normalization.measurements).toBe(hashes.measurements);
  expect(normalization.candidates).not.toBe(hashes.candidates);
  for(const file of ['src/game.ts','scripts/campaign/solver.ts','scripts/campaign/capacity-measurements.ts']){
    const rules=auditHashes(f=>f===file?'changed':f);
    expect(measurementKey(level,proofs,rules)).not.toBe(mk);
    expect(auditCandidateKey(level,proofs,new Set([4]),rules)).not.toBe(ck);
  }
});
it('changing one level leaves another level cached',()=>{
  const c=cache();auditLevel(record,proofs,0.5,undefined,c);
  const other=structuredClone(record);other.number=7;
  other.field.find(b=>b)!.hidden=true;
  auditLevel(other,proofs,0.5,undefined,c);
  c.stats=auditStats();
  auditLevel(record,proofs,1,undefined,c);
  expect(c.stats).toEqual({measurementHits:1,measurementRuns:0,candidateHits:1,candidateRuns:0,proofHits:0});
},30000);
