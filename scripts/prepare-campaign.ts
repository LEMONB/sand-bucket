import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { CAMPAIGN_COUNT, CAMPAIGN_VERSION } from '../src/campaign-rules.ts';
import { playableLevel } from '../src/campaign-art.ts';
import type { CandidateResult } from './campaign/candidate.ts';
import type { CampaignCatalog } from '../src/campaign-types.ts';
import { Game } from '../src/game.ts';
import { topology } from './campaign/candidate.ts';
import type { Proof } from './campaign/solver.ts';
import { structuralSignature } from './campaign/selection.ts';
import { FAMILIES } from './campaign/layout.ts';
import { MECHANIC_NAMES } from '../src/mechanic-help.ts';
import { changedSince, playableKey, readVerified, verificationHash, verificationOptions, writeVerified, validProofs } from './campaign/verification.ts';

import { assertCapacities, capacityRanges, normalizeCapacities } from './campaign/capacities.ts';
const root=new URL('../',import.meta.url);
const args=process.argv.slice(2),rebalance=args.includes('--rebalance-capacities'),refreshSwaps=args.includes('--refresh-swaps');
const source=rebalance||refreshSwaps?JSON.parse(readFileSync(new URL('src/levels/campaign.json',root),'utf8')) as CampaignCatalog:undefined;
if(source&&(source.version!==CAMPAIGN_VERSION||source.levels.length!==CAMPAIGN_COUNT||source.levels.some((l,i)=>l.number!==i+1||l.art!==i%100)))throw Error('Исходный каталог неполон');
const files=['src/game.ts','src/mechanics.ts','src/art-catalog.ts','src/campaign-art.ts','src/art-scenes.ts','src/generator.ts','src/level-mechanics.ts','src/campaign-rules.ts','scripts/campaign/layout.ts','scripts/campaign/candidate.ts','scripts/campaign/solver.ts','scripts/campaign/capacities.ts','scripts/campaign/swap-capacities.ts'];
const fingerprint=createHash('sha256');for(const file of files)fingerprint.update(file).update(readFileSync(new URL(file,root)));
const hash=fingerprint.digest('hex');
const migrationHash=source?createHash('sha256').update(hash).update(JSON.stringify(source)).update(String(refreshSwaps)).update(readFileSync(new URL('scripts/prepare-campaign.ts',root))).update(readFileSync(new URL('scripts/campaign-worker.ts',root))).update(readFileSync(new URL('scripts/campaign/selection.ts',root))).update(readFileSync(new URL('scripts/campaign/verification.ts',root))).digest('hex'):undefined;
const directory=new URL(migrationHash?`.cache/capacities/${migrationHash}/`:`.cache/campaign/${hash}/`,root);
const catalogFingerprint=createHash('sha256').update(hash).update(readFileSync(new URL('scripts/campaign/selection.ts',root))).digest('hex');
mkdirSync(directory,{recursive:true});
const pilot=args.includes('--pilot'),mergedColors=args.includes('--verify-playable'),verify=args.includes('--verify')||mergedColors;
const options=verificationOptions(args.filter(arg=>arg!=='--refresh-swaps'),CAMPAIGN_COUNT);
if(args.filter(arg=>['--pilot','--verify','--verify-playable','--all','--rebalance-capacities','--refresh-swaps'].includes(arg)).length!==1)throw Error('Выберите один режим проверки или генерации');
if(!pilot&&!verify&&!rebalance&&!refreshSwaps&&!args.includes('--all'))throw Error('Укажите --pilot, --all, --verify или --verify-playable');
const proofDirectory=new URL(`.cache/playable/${hash}/`,root);
const certificateDirectory=new URL('.cache/playable/verified/',root);
const checkerHash=verificationHash(file=>readFileSync(new URL(file,root),'utf8'));
if(mergedColors||!verify){mkdirSync(proofDirectory,{recursive:true});mkdirSync(certificateDirectory,{recursive:true});}
const workerArg=args.find(arg=>arg.startsWith('--workers='));
const workers=workerArg?Number(workerArg.split('=')[1]):Math.min(4,Math.max(1,availableParallelism()-1));
if(!Number.isInteger(workers)||workers<1||workers>8)throw Error('Число workers должно быть от 1 до 8');
let numbers=pilot?[1,6,11,16,21,26,31,36,41,46,103,104,154,203,204,254,304,354,399,400]:Array.from({length:CAMPAIGN_COUNT},(_,i)=>i+1);
const started=performance.now(),accepted=new Map<number,CandidateResult>(),failures:unknown[]=[],signatures=new Set<string>();
let jobs=0,cached=0,processed=0,verified=0,certificateHits=0;
const originalSignatures=new Map(source?.levels.map(l=>[structuralSignature({...l,...playableLevel(l)}),l.number]));
const duplicate=(r:CandidateResult):boolean=>signatures.has(r.signature!)||(rebalance&&originalSignatures.has(r.signature!)&&originalSignatures.get(r.signature!)!==r.level!.number);
const startWorker=()=>new Worker(new URL('./campaign-worker.ts',import.meta.url));
const pool:Worker[]=[];
const idle:Worker[]=[];
const waiting:Array<(worker:Worker)=>void>=[];
async function work<T>(message:unknown):Promise<T>{
  if(!idle.length&&pool.length<workers){const worker=startWorker();pool.push(worker);idle.push(worker);}
  let worker=idle.pop()??await new Promise<Worker>(resolve=>waiting.push(resolve));
  try{
    const result=await new Promise<T>((resolve,reject)=>{
      const clean=()=>{worker.off('message',done);worker.off('error',fail);worker.off('exit',exit);};
      const done=(data:{result:T})=>{clean();resolve(data.result);};
      const fail=(error:Error)=>{clean();reject(error);};
      const exit=(code:number)=>fail(Error(`Worker exited (${code})`));
      worker.once('message',done);worker.once('error',fail);worker.once('exit',exit);worker.postMessage(message);
    });
    const candidate=result as Partial<CandidateResult>;
    // Search clones deoptimize Game's hot methods in V8; do not carry that cost to the next job.
    if(candidate.error||candidate.proofs?.some(proof=>proof.nodes>0)){
      const index=pool.indexOf(worker);await worker.terminate();worker=startWorker();pool[index]=worker;
    }
    return result;
  }finally{const next=waiting.shift();if(next)next(worker);else idle.push(worker);}
}
function selected(result:CandidateResult):CandidateResult {
  if(result.level)result.signature=structuralSignature(result.level);return result;
}
async function run(number:number,attempt:number):Promise<CandidateResult>{
  const file=new URL(`${number}-${attempt}.json`,directory);
  if(existsSync(file)){
    try{
      const saved=JSON.parse(readFileSync(file,'utf8')) as CandidateResult;
      if(typeof saved.error==='string'){cached++;return saved;}
      if(saved.level?.number===number&&saved.level.art===(number-1)%100&&validProofs(saved.proofs)&&saved.signature===topology(saved.level)){
        new Game(playableLevel(saved.level));assertCapacities(playableLevel(saved.level));
        cached++;return selected(saved);
      }
    }catch{/* Recompute an interrupted cache record. */}
  }
  let result:CandidateResult|undefined;
  if(attempt===-1){
    try{
      const original=source!.levels[number-1],playable=refreshSwaps?playableLevel(original):normalizeCapacities(playableLevel(original));
      const key=createHash('sha256').update(checkerHash).update(playableKey(playable)).digest('hex');
      const proofs=readVerified(new URL(key+'.json',certificateDirectory),key);
      if(proofs){const level={...original,field:playable.field,mechanics:playable.mechanics};result={level,proofs,signature:topology(level),retainedLayout:true,generationMs:0,certificationMs:0,pressure:Math.max(...proofs.map(p=>p.peakSlots))};certificateHits++;}
    }catch{/* A fixed pair can make preservation impossible; the worker reports the failure. */}
  }
  if(!result){jobs++;result=await work<CandidateResult>({number,attempt,source:attempt===-1?source!.levels[number-1]:undefined});}
  if(result.level){
    const playable=playableLevel(result.level);new Game(playable);assertCapacities(playable);
    const original=source?.levels[number-1];
    if(original&&(['art','columns','family','kinds'] as const).some(key=>JSON.stringify(original[key])!==JSON.stringify(result!.level![key])))result={error:'Изменён профиль уровня',generationMs:result.generationMs,certificationMs:result.certificationMs};
    else{
      const key=createHash('sha256').update(checkerHash).update(playableKey(playable)).digest('hex');
      writeVerified(new URL(key+'.json',certificateDirectory),key,result.proofs!);
    }
  }
  if(++processed%20===0)console.log(`Обработано ${processed} кандидатов`);
  writeFileSync(new URL(`${number}-${attempt}.tmp`,directory),JSON.stringify(result));
  renameSync(new URL(`${number}-${attempt}.tmp`,directory),file);return selected(result);
}
try{
  if(verify){
    const catalog=JSON.parse(readFileSync(new URL('src/levels/campaign.json',root),'utf8')) as CampaignCatalog;
    if((!mergedColors&&catalog.fingerprint!==catalogFingerprint)||catalog.version!==CAMPAIGN_VERSION||catalog.levels.length!==400)throw Error('Каталог устарел или неполон');
    for(const [index,level] of catalog.levels.entries()){
      if(level.number!==index+1||level.art!==(level.number-1)%100)throw Error('Нарушен порядок каталога');
    }
    if(mergedColors){
      for(const level of catalog.levels){
        const playable=playableLevel(level);new Game(playable);
        const signature=structuralSignature({...level,...playable});
        if(signatures.has(signature))throw Error(`Повтор планировки ${level.number}`);signatures.add(signature);
      }
      numbers=options.levels??(options.changed?await changedSince(root,catalog,options.changed):numbers);
      console.log(`Выбрано ${numbers.length}/${catalog.levels.length} уровней; остальные не симулируются.`);
    }
    const selectedLevels=numbers.map(number=>catalog.levels[number-1]);
    for(let offset=0;offset<selectedLevels.length;offset+=workers){
    await Promise.all(selectedLevels.slice(offset,offset+workers).map(async level=>{
      const key=createHash('sha256').update(checkerHash).update(playableKey(playableLevel(level))).digest('hex');
      const certificate=new URL(`${key}.json`,certificateDirectory);
      const certified=mergedColors&&!options.force?readVerified(certificate,key):undefined;
      if(certified){certificateHits++;accepted.set(level.number,{level,proofs:certified,generationMs:0,certificationMs:0});return;}
      let record:CandidateResult|undefined;
      for(let attempt=0;!mergedColors&&attempt<24;attempt++){
        const file=new URL(`${level.number}-${attempt}.json`,directory);
        if(existsSync(file)){const candidate=JSON.parse(readFileSync(file,'utf8')) as CandidateResult;if(candidate.level&&JSON.stringify(candidate.level)===JSON.stringify(level)){record=candidate;break;}}
      }
      if(mergedColors||!record){
        record={level,proofs:[],generationMs:0,certificationMs:0,signature:topology(level)};
        const savedProofs=new URL('.cache/playable/',root);
        if(existsSync(savedProofs))for(const folder of readdirSync(savedProofs)){
          const file=new URL(`${folder}/${level.number}.json`,savedProofs);
          if(!existsSync(file))continue;
          try{
            const saved=JSON.parse(readFileSync(file,'utf8'));
            if(JSON.stringify(saved.level)===JSON.stringify(level)&&saved.proofs?.length===8&&new Set(saved.proofs.map((p:Proof)=>`${p.speed}:${p.pause}`)).size===8&&saved.proofs.every((p:Proof)=>[1,2].includes(p.speed)&&[0,120,1800,-1].includes(p.pause)&&Array.isArray(p.decisions))){record.proofs=saved.proofs;break;}
          }catch{/* Ignore interrupted proof files; certify this level again. */}
        }
      }
      if(!record||(!mergedColors&&(!record.proofs||record.proofs.length!==8||new Set(record.proofs.map(p=>`${p.speed}:${p.pause}`)).size!==8||record.proofs.some(p=>![1,2].includes(p.speed)||![0,120,1800,-1].includes(p.pause)))))throw Error(`Нет доказательств для ${level.number}`);
      const playable=playableLevel(level);
      new Game(playable);
      record.signature=structuralSignature({...level,...playable});
      if(!mergedColors){if(signatures.has(record.signature))throw Error(`Повтор или неверная подпись планировки ${level.number}`);signatures.add(record.signature);}
      verified++;
      const checked=await work<{error?:string;proofs?:Proof[]}>({level,proofs:record.proofs,mergedColors});
      if(checked.error){
        if(!mergedColors)throw Error(`Уровень ${level.number}: ${checked.error}`);
        failures.push({number:level.number,error:checked.error});
        console.error(`Уровень ${level.number}: ${checked.error}`);
        return;
      }
      if(mergedColors){
        if(!checked.proofs)throw Error(`Нет доказательств для ${level.number}`);
        writeVerified(certificate,key,checked.proofs);
        const saved=new URL(`${level.number}.json`,proofDirectory),temp=new URL(`${level.number}.${process.pid}.tmp`,proofDirectory);
        writeFileSync(temp,JSON.stringify({level,proofs:checked.proofs}));renameSync(temp,saved);
      }
      record.proofs=checked.proofs;
      accepted.set(level.number,record);
      if(level.number%20===0)console.log(`Проверено ${level.number}/400`);
    }));}
  }else{
    // Keep workers occupied; accept results in level order for deterministic deduplication.
    const pending=numbers.map(async number=>{
      const retain=rebalance||(refreshSwaps&&!source!.levels[number-1].field.some(b=>b?.swapWith!==undefined));
      for(let attempt=retain?-1:0;attempt<24;attempt++){
        const result=await run(number,attempt);
        if(result.level&&!duplicate(result))return {number,attempt,result};
        failures.push({number,attempt,error:result.error??'Повтор планировки'});
        if(refreshSwaps&&retain)break;
      }
      return {number,attempt:24,result:undefined};
    });
    for(const task of pending){
      const item=await task;
        let result=item.result;
        for(let attempt=item.attempt+1;result&&duplicate(result)&&attempt<24;attempt++){
          const next=await run(item.number,attempt);if(next.level)result=next;
        }
        if(!result?.level||duplicate(result)){failures.push({number:item.number,error:'Позиция не заполнена'});continue;}
        signatures.add(result.signature!);accepted.set(item.number,result);
        console.log(`${accepted.size}/${numbers.length}: уровень ${item.number}, ${Math.round(result.generationMs+result.certificationMs)} мс`);
    }
  }
  const results=[...accepted.values()].sort((a,b)=>a.level!.number-b.level!.number);
  const report={migrationFingerprint:migrationHash,retainedLayouts:results.filter(r=>r.retainedLayout).length,capacityChanges:source?source.levels.map(level=>({number:level.number,before:capacityRanges(playableLevel(level)),after:accepted.get(level.number)?.level?capacityRanges(playableLevel(accepted.get(level.number)!.level!)):undefined,retainedLayout:accepted.get(level.number)?.retainedLayout??false})):undefined,fingerprint:catalogFingerprint,candidateFingerprint:hash,elapsedMs:performance.now()-started,workers,jobs,cached,verified,certificateHits,selected:numbers,accepted:results.length,requested:numbers.length,failures,levels:results.map(({level,proofs,...metrics})=>({number:level!.number,...metrics,proofs:proofs?.map(({decisions,...summary})=>({...summary,moves:decisions.length}))}))};
  writeFileSync(new URL('report.json',directory),JSON.stringify(report,null,2));
  const gallery=results.map(r=>{
    const playable=playableLevel(r.level!);
    return {level:{...r.level,field:playable.field,mechanics:playable.mechanics},pressure:r.pressure,art:[...playable.cells],palette:playable.palette};
  });
  writeFileSync(new URL('gallery.html',directory),`<!doctype html><html lang="ru"><meta charset="utf-8"><title>Кампания: ${results.length} уровней</title><style>body{font:16px system-ui;background:#f5f1e9;color:#254c43;padding:24px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:24px}article{background:white;padding:16px;border-radius:12px}canvas{width:100%;image-rendering:pixelated}.grid{display:grid;gap:2px;margin-top:12px}.cell{aspect-ratio:1;border-radius:3px;display:grid;place-items:center;font-size:11px;color:white;text-shadow:0 1px 3px #000,0 0 2px #000}a{color:inherit}</style><h1>${results.length} уровней</h1><p>Открывайте игровые уровни через npm run dev. Метрики не заменяют оценку интересности.</p><main></main><script>const familyNames=${JSON.stringify(FAMILIES)},names=${JSON.stringify(MECHANIC_NAMES)};const records=${JSON.stringify(gallery)};for(const {level:l,art,palette,pressure} of records){const a=document.createElement('article');a.innerHTML='<h2><a href="http://127.0.0.1:5173/sand-bucket/?level='+l.number+'">'+l.number+'</a></h2><p>Семейство '+familyNames[l.family]+' · Механики '+l.kinds.map(k=>names[k]).join(', ')+' · Занято мест до '+pressure+'</p><canvas width="128" height="128"></canvas>';const ctx=a.querySelector('canvas').getContext('2d');art.forEach((c,i)=>{ctx.fillStyle=palette[c];ctx.fillRect(i%128,Math.floor(i/128),1,1)});const grid=document.createElement('div');grid.className='grid';grid.style.gridTemplateColumns='repeat('+l.columns+',1fr)';l.field.forEach((b,i)=>{const c=document.createElement('div');c.className='cell';c.style.background=l.walls.includes(i)?'#82988b':b?(b.hidden?'#aaa':palette[b.color]):'#eee';const m=l.mechanics;const marks=[];if(m){if(m.queues.some(q=>q.cell===i))marks.push('Q');if(m.platforms.some(p=>p.cells.includes(i)))marks.push('P');if(m.trays.some(t=>t.includes(i)))marks.push('T');if(m.gates.some(t=>t.cells.includes(i)||t.key===b?.id))marks.push('⚿');if(m.lids.some(t=>t.key===b?.id))marks.push('◇');if(m.links.some(t=>t.includes(b?.id)))marks.push('↔');}if(b?.swapWith!==undefined)marks.push('⇄');c.textContent=(b?(b.hidden?'? ':'')+b.capacity:'')+' '+marks.join('');c.title=b?'ID '+b.id:'';grid.append(c)});a.append(grid);document.querySelector('main').append(a)}</script></html>`);
  console.log(JSON.stringify({accepted:report.accepted,requested:report.requested,elapsedSeconds:Math.round(report.elapsedMs/1000),jobs,cached,verified,certificateHits,report:new URL('report.json',directory).pathname}));
  if(results.length!==numbers.length)throw Error('Неполная партия: каталог не изменён; причины в report.json');
  if(!verify){
    for(const result of results){
      const level=result.level!,playable=playableLevel(level);new Game(playable);assertCapacities(playable);
      if(!result.proofs)throw Error('Нет доказательств');
      const key=createHash('sha256').update(checkerHash).update(playableKey(playable)).digest('hex');
      writeVerified(new URL(key+'.json',certificateDirectory),key,result.proofs);
      const tempProof=new URL(level.number+'.tmp',proofDirectory);
      writeFileSync(tempProof,JSON.stringify({level,proofs:result.proofs}));renameSync(tempProof,new URL(level.number+'.json',proofDirectory));
    }
  }
  if(!pilot&&!verify){
    if(refreshSwaps)for(const result of results){
      const original=source!.levels[result.level!.number-1];
      if(!original.field.some(b=>b?.swapWith!==undefined)&&JSON.stringify(original)!==JSON.stringify(result.level))throw Error('Изменён уровень без переключателей');
    }
    const catalog:CampaignCatalog={version:CAMPAIGN_VERSION,fingerprint:catalogFingerprint,levels:results.map(r=>r.level!)};
    const temp=new URL('src/levels/campaign.tmp',root);writeFileSync(temp,JSON.stringify(catalog)+'\n');renameSync(temp,new URL('src/levels/campaign.json',root));
  }
}finally{await Promise.all(pool.map(worker=>worker.terminate()));}
