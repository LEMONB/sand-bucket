import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { campaignLevel, playableLevel } from '../src/campaign';
import type { CampaignCatalog } from '../src/campaign-types';
import type { Proof } from '../scripts/campaign/solver';
import { changedLevels, changedSince, playableKey, readVerified, verificationHash, verificationOptions, VERIFICATION_FILES, writeVerified } from '../scripts/campaign/verification';

const directories:string[]=[];
function temporary():string { const dir=mkdtempSync(join(tmpdir(),'sand-verify-test-'));directories.push(dir);return dir; }
afterEach(()=>{for(const dir of directories.splice(0))rmSync(dir,{recursive:true,force:true});});
const proofs=():Proof[]=>[1,2].flatMap(speed=>[0,120,1800,-1].map(pause=>({speed:speed as 1|2,pause,ticks:1,peakSlots:1,unproductive:0,nodes:0,decisions:[{bucketId:0,collected:0,completed:[],exposed:true}]})));
const catalog=():CampaignCatalog=>({version:1,fingerprint:'fixture',levels:[1,2,101,201,301].map(campaignLevel)});

it('selects explicit levels and rejects unsafe or ambiguous CLI arguments',()=>{
  expect(verificationOptions(['--verify-playable','--levels','209,6,6','--workers=2'],400)).toEqual({levels:[6,209],force:false});
  expect(verificationOptions(['--verify-playable','--changed','origin/main','--force'],400)).toEqual({changed:'origin/main',force:true});
  for(const args of [['--levels','0'],['--levels','401'],['--levels','1.5'],['--levels',''],['--levels','2,'],['--changed'],['--changed','--force'],['--levles','2'],['--levels','2','--changed','main'],['--force','--force']]){
    expect(()=>verificationOptions(['--verify-playable',...args],400)).toThrow();
  }
  expect(()=>verificationOptions(['--all','--levels','1'],400)).toThrow();
});

it('keys actual gameplay data, excluding presentation and generation metadata',()=>{
  const record=campaignLevel(1),level=playableLevel(record),key=playableKey(level);
  expect(playableKey(playableLevel({...record,seed:123,family:99,kinds:[8]}))).toBe(key);
  expect(playableKey({...level,palette:level.palette!.map(()=> '#abcdef'),walls:[...level.walls!].reverse()})).toBe(key);
  const changed=structuredClone(level);changed.cells[0]=changed.cells[0]%4+1;expect(playableKey(changed)).not.toBe(key);
  const bucket=structuredClone(level);bucket.field.find(b=>b)!.capacity++;expect(playableKey(bucket)).not.toBe(key);
  const wall=structuredClone(level);wall.walls!.push(15);expect(playableKey(wall)).not.toBe(key);
});

it('invalidates certificates on rule/checker changes, not generator or help text changes',()=>{
  const source=new Map(VERIFICATION_FILES.map(file=>[file,file]));
  const hash=()=>verificationHash(file=>source.get(file)!);
  const before=hash();source.set('src/mechanic-help.ts','new hint');source.set('src/generator.ts','new generator');expect(hash()).toBe(before);
  for(const file of VERIFICATION_FILES){source.set(file,'changed');expect(hash()).not.toBe(before);source.set(file,file);}
});

it('accepts only intact, complete certificates for the requested key',()=>{
  const dir=temporary(),file=pathToFileURL(join(dir,'proof.json'));
  expect(readVerified(file,'key')).toBeUndefined();writeVerified(file,'key',proofs());
  expect(readVerified(file,'key')).toEqual(proofs());expect(readVerified(file,'other')).toBeUndefined();
  expect(readdirSync(dir)).toEqual(['proof.json']);
  const saved=JSON.parse(readFileSync(file,'utf8'));saved.proofs[0].decisions[0].bucketId++;
  writeFileSync(file,JSON.stringify(saved));expect(readVerified(file,'key')).toBeUndefined();
  writeFileSync(file,'{');expect(readVerified(file,'key')).toBeUndefined();
  expect(()=>writeVerified(file,'key',proofs().slice(1))).toThrow();
  const duplicate=proofs();duplicate[1]=duplicate[0];expect(()=>writeVerified(file,'key',duplicate)).toThrow();
});

it('selects a changed layout and every use of a changed artwork',()=>{
  const previous=catalog(),current=structuredClone(previous);
  current.levels[1].field.find(b=>b)!.capacity++;
  expect(changedLevels(current,previous,playableLevel)).toEqual([2]);
  expect(changedLevels(previous,previous,record=>{
    const level=playableLevel(record);if(record.art===0)level.cells[0]=level.cells[0]%4+1;return level;
  })).toEqual([1,101,201,301]);
});

it('compares artwork at the Git base and selects all levels for a shared rules change',async()=>{
  const dir=temporary(),root=pathToFileURL(dir+'/'),records=catalog();
  const files=[...VERIFICATION_FILES,'src/campaign-art.ts','src/art-catalog.ts','src/art-scenes.ts'];
  for(const file of files){const destination=new URL(file,root);mkdirSync(new URL('.',destination),{recursive:true});writeFileSync(destination,readFileSync(new URL('../'+file,import.meta.url)));}
  mkdirSync(new URL('src/levels/',root),{recursive:true});writeFileSync(new URL('src/levels/campaign.json',root),JSON.stringify(records));
  const git=(args:string[])=>execFileSync('git',args,{cwd:dir,stdio:'pipe'});
  git(['init','-q']);git(['add','.']);
  const commit=()=>git(['-c','user.name=Test','-c','user.email=test@example.com','-c','commit.gpgsign=false','-c','core.hooksPath=/dev/null','commit','-qm','fixture']);
  commit();expect(await changedSince(root,records,'HEAD')).toEqual([]);
  const art=new URL('src/campaign-art.ts',root),source=readFileSync(art,'utf8');
  writeFileSync(art,source.replace('return mergeArtworkColors({ ...record, cells: catalogArtwork(record.art), palette: artworkPalette(record.art) });','const level=mergeArtworkColors({ ...record, cells: catalogArtwork(record.art), palette: artworkPalette(record.art) }); if(record.art===0)level.cells[0]=level.cells[0]%4+1; return level;'));
  git(['add','.']);commit();
  expect(await changedSince(root,records,'HEAD')).toEqual([1,101,201,301]);
  writeFileSync(new URL('src/game.ts',root),'changed rules');
  expect(await changedSince(root,records,'HEAD')).toEqual(records.levels.map(l=>l.number));
  await expect(changedSince(root,records,'missing-ref')).rejects.toThrow();
});
