import { expect,it } from 'vitest';
import { campaignCapacityColors } from '../scripts/campaign/capacity-policy';
import { assertCapacities } from '../scripts/campaign/capacities';
import { campaignLevel,playableLevel } from '../src/campaign';

it('keeps the accepted selection independent of the current bucket capacities',()=>{
  expect([...campaignCapacityColors(1)]).toEqual([1,3]);
  expect([...campaignCapacityColors(56)]).toEqual([]);
  expect(Array.from({length:400},(_,i)=>campaignCapacityColors(i+1)).filter(colors=>colors.size)).toHaveLength(397);
  const old=playableLevel(campaignLevel(1));
  old.field.find(b=>b?.id===0)!.capacity=3324;
  old.field.find(b=>b?.id===4)!.capacity=832;
  expect(()=>assertCapacities(old)).not.toThrow();
  expect(()=>assertCapacities(old,campaignCapacityColors(1))).toThrow('2:1');
});
it('rejects invalid level numbers and isolates callers from the policy data',()=>{
  for(const number of [0,401,1.5,NaN])expect(()=>campaignCapacityColors(number)).toThrow();
  (campaignCapacityColors(1) as Set<number>).clear();
  expect([...campaignCapacityColors(1)]).toEqual([1,3]);
});
it('rejects a playable but out-of-policy catalog before accepting cached certificates',async()=>{
  const {mkdtempSync,cpSync,readFileSync,writeFileSync,mkdirSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const {pathToFileURL}=await import('node:url');
  const {execFileSync}=await import('node:child_process');
  const {createHash}=await import('node:crypto');
  const {verificationHash,playableKey,writeVerified}=await import('../scripts/campaign/verification');
  const {certify}=await import('../scripts/campaign/solver');
  const folder=mkdtempSync(join(tmpdir(),'sand-policy-')),root=pathToFileURL(folder+'/');
  try {
    for(const name of ['src','scripts'])cpSync(new URL('../'+name,import.meta.url),new URL(name,root),{recursive:true});
    writeFileSync(new URL('package.json',root),'{"type":"module"}');
    const catalog=JSON.parse(readFileSync(new URL('src/levels/campaign.json',root),'utf8'));
    const record=catalog.levels[0];
    record.field.find((b:{id:number}|null)=>b?.id===0).capacity=3324;
    record.field.find((b:{id:number}|null)=>b?.id===4).capacity=832;
    writeFileSync(new URL('src/levels/campaign.json',root),JSON.stringify(catalog));
    const level=playableLevel(record);
    const proofs=([1,2] as const).flatMap(speed=>[0,120,1800,-1].map(pause=>certify(level,speed,pause)));
    const hash=verificationHash(f=>readFileSync(new URL(f,root),'utf8'));
    const key=createHash('sha256').update(hash).update(playableKey(level)).digest('hex');
    const directory=new URL('.cache/playable/verified/',root);mkdirSync(directory,{recursive:true});
    writeVerified(new URL(`${key}.json`,directory),key,proofs);
    let output='';
    try {execFileSync(process.execPath,['--experimental-strip-types','scripts/prepare-campaign.ts','--verify-playable','--levels','1'],{cwd:folder,encoding:'utf8',stdio:'pipe'});}
    catch(error){output=String((error as {stderr:unknown}).stderr);}
    expect(output).toContain('превышают 2:1');
  }finally{rmSync(folder,{recursive:true,force:true});}
},30000);
