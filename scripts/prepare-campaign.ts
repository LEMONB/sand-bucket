import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { CAMPAIGN_COUNT, CAMPAIGN_VERSION } from '../src/campaign-rules.ts';
import { catalogArtwork } from '../src/art-catalog.ts';
import type { CandidateResult } from './campaign/candidate.ts';
import type { CampaignCatalog } from '../src/campaign-types.ts';
import { Game } from '../src/game.ts';
import { artworkPalette } from '../src/art-catalog.ts';
import { topology } from './campaign/candidate.ts';
import { structuralSignature } from './campaign/selection.ts';
import { FAMILIES } from './campaign/layout.ts';
import { MECHANIC_NAMES } from '../src/mechanics.ts';

const root=new URL('../',import.meta.url);
const files=['src/game.ts','src/mechanics.ts','src/art-catalog.ts','src/art-scenes.ts','src/generator.ts','src/level-mechanics.ts','src/campaign-rules.ts','scripts/campaign/layout.ts','scripts/campaign/candidate.ts','scripts/campaign/solver.ts'];
const fingerprint=createHash('sha256');for(const file of files)fingerprint.update(file).update(readFileSync(new URL(file,root)));
const hash=fingerprint.digest('hex'),directory=new URL(`.cache/campaign/${hash}/`,root);
const catalogFingerprint=createHash('sha256').update(hash).update(readFileSync(new URL('scripts/campaign/selection.ts',root))).digest('hex');
mkdirSync(directory,{recursive:true});
const args=process.argv.slice(2),pilot=args.includes('--pilot'),verify=args.includes('--verify');
if(!pilot&&!verify&&!args.includes('--all'))throw Error('Укажите --pilot, --all или --verify');
const workerArg=args.find(arg=>arg.startsWith('--workers='));
const workers=workerArg?Number(workerArg.split('=')[1]):Math.min(4,Math.max(1,availableParallelism()-1));
if(!Number.isInteger(workers)||workers<1||workers>8)throw Error('Число workers должно быть от 1 до 8');
const numbers=pilot?[1,6,11,16,21,26,31,36,41,46,103,104,154,203,204,254,304,354,399,400]:Array.from({length:CAMPAIGN_COUNT},(_,i)=>i+1);
const started=performance.now(),accepted=new Map<number,CandidateResult>(),failures:unknown[]=[],signatures=new Set<string>();
let jobs=0,cached=0,processed=0;
const startWorker=()=>new Worker(new URL('./campaign-worker.ts',import.meta.url));
const pool=Array.from({length:workers},startWorker);
const idle=[...pool];
const waiting:Array<(worker:Worker)=>void>=[];
async function work<T>(message:unknown):Promise<T>{
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
      if(saved.level?.number===number&&saved.level.art===(number-1)%100&&saved.proofs?.length===8&&saved.signature===topology(saved.level)){
        new Game({...saved.level,cells:catalogArtwork(saved.level.art),palette:artworkPalette(saved.level.art)});
        cached++;return selected(saved);
      }
    }catch{/* Recompute an interrupted cache record. */}
  }
  jobs++;
  const result=await work<CandidateResult>({number,attempt});
  if(++processed%20===0)console.log(`Обработано ${processed} кандидатов`);
  writeFileSync(new URL(`${number}-${attempt}.tmp`,directory),JSON.stringify(result));
  renameSync(new URL(`${number}-${attempt}.tmp`,directory),file);return selected(result);
}
try{
  if(verify){
    const catalog=JSON.parse(readFileSync(new URL('src/levels/campaign.json',root),'utf8')) as CampaignCatalog;
    if(catalog.fingerprint!==catalogFingerprint||catalog.version!==CAMPAIGN_VERSION||catalog.levels.length!==400)throw Error('Каталог устарел или неполон');
    for(let offset=0;offset<catalog.levels.length;offset+=workers){
    await Promise.all(catalog.levels.slice(offset,offset+workers).map(async (level,index)=>{
      if(level.number!==offset+index+1||level.art!==(level.number-1)%100)throw Error('Нарушен порядок каталога');
      let record:CandidateResult|undefined;
      for(let attempt=0;attempt<24;attempt++){
        const file=new URL(`${level.number}-${attempt}.json`,directory);
        if(existsSync(file)){const candidate=JSON.parse(readFileSync(file,'utf8')) as CandidateResult;if(candidate.level&&JSON.stringify(candidate.level)===JSON.stringify(level)){record=candidate;break;}}
      }
      if(!record?.proofs||record.proofs.length!==8||new Set(record.proofs.map(p=>`${p.speed}:${p.pause}`)).size!==8||record.proofs.some(p=>![1,2].includes(p.speed)||![0,120,1800,-1].includes(p.pause)))throw Error(`Нет доказательств для ${level.number}`);
      const playable={...level,cells:catalogArtwork(level.art),palette:artworkPalette(level.art)};
      new Game(playable);
      record.signature=structuralSignature(level);
      if(signatures.has(record.signature))throw Error(`Повтор или неверная подпись планировки ${level.number}`);signatures.add(record.signature);
      const checked=await work<{error?:string}>({level,proofs:record.proofs});if(checked.error)throw Error(`Уровень ${level.number}: ${checked.error}`);
      accepted.set(level.number,record);
      if(level.number%20===0)console.log(`Проверено ${level.number}/400`);
    }));}
  }else{
    // Keep workers occupied; accept results in level order for deterministic deduplication.
    const pending=numbers.map(async number=>{
      for(let attempt=0;attempt<24;attempt++){
        const result=await run(number,attempt);
        if(result.level)return {number,attempt,result};
        failures.push({number,attempt,error:result.error});
      }
      return {number,attempt:24,result:undefined};
    });
    for(const task of pending){
      const item=await task;
        let result=item.result;
        for(let attempt=item.attempt+1;result&&signatures.has(result.signature!)&&attempt<24;attempt++){
          const next=await run(item.number,attempt);if(next.level)result=next;
        }
        if(!result?.level||signatures.has(result.signature!)){failures.push({number:item.number,error:'Позиция не заполнена'});continue;}
        signatures.add(result.signature!);accepted.set(item.number,result);
        console.log(`${accepted.size}/${numbers.length}: уровень ${item.number}, ${Math.round(result.generationMs+result.certificationMs)} мс`);
    }
  }
  const results=[...accepted.values()].sort((a,b)=>a.level!.number-b.level!.number);
  const report={fingerprint:catalogFingerprint,candidateFingerprint:hash,elapsedMs:performance.now()-started,workers,jobs,cached,accepted:results.length,requested:numbers.length,failures,levels:results.map(({level,proofs,...metrics})=>({number:level!.number,...metrics,proofs:proofs?.map(({decisions,...summary})=>({...summary,moves:decisions.length}))}))};
  writeFileSync(new URL('report.json',directory),JSON.stringify(report,null,2));
  const gallery=results.map(r=>({level:r.level,pressure:r.pressure,art:[...catalogArtwork(r.level!.art)],palette:artworkPalette(r.level!.art)}));
  writeFileSync(new URL('gallery.html',directory),`<!doctype html><html lang="ru"><meta charset="utf-8"><title>Кампания: ${results.length} уровней</title><style>body{font:16px system-ui;background:#f5f1e9;color:#254c43;padding:24px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:24px}article{background:white;padding:16px;border-radius:12px}canvas{width:100%;image-rendering:pixelated}.grid{display:grid;gap:2px;margin-top:12px}.cell{aspect-ratio:1;border-radius:3px;display:grid;place-items:center;font-size:11px;color:white;text-shadow:0 1px 3px #000,0 0 2px #000}a{color:inherit}</style><h1>${results.length} уровней</h1><p>Открывайте игровые уровни через npm run dev. Метрики не заменяют оценку интересности.</p><main></main><script>const familyNames=${JSON.stringify(FAMILIES)},names=${JSON.stringify(MECHANIC_NAMES)};const records=${JSON.stringify(gallery)};for(const {level:l,art,palette,pressure} of records){const a=document.createElement('article');a.innerHTML='<h2><a href="http://127.0.0.1:5173/sand-bucket/?level='+l.number+'">'+l.number+'</a></h2><p>Семейство '+familyNames[l.family]+' · Механики '+l.kinds.map(k=>names[k]).join(', ')+' · Занято мест до '+pressure+'</p><canvas width="128" height="128"></canvas>';const ctx=a.querySelector('canvas').getContext('2d');art.forEach((c,i)=>{ctx.fillStyle=palette[c];ctx.fillRect(i%128,Math.floor(i/128),1,1)});const grid=document.createElement('div');grid.className='grid';grid.style.gridTemplateColumns='repeat('+l.columns+',1fr)';l.field.forEach((b,i)=>{const c=document.createElement('div');c.className='cell';c.style.background=l.walls.includes(i)?'#82988b':b?(b.hidden?'#aaa':palette[b.color]):'#eee';const m=l.mechanics;const marks=[];if(m){if(m.queues.some(q=>q.cell===i))marks.push('Q');if(m.platforms.some(p=>p.cells.includes(i)))marks.push('P');if(m.trays.some(t=>t.includes(i)))marks.push('T');if(m.bridges.some(t=>t.cells.includes(i)))marks.push('B');if(m.bridges.some(t=>t.passage.includes(i)))marks.push('↓');if(m.gates.some(t=>t.cells.includes(i)||t.key===b?.id))marks.push('⚿');if(m.lids.some(t=>t.key===b?.id))marks.push('◇');if(m.links.some(t=>t.includes(b?.id)))marks.push('↔');}if(b?.swapWith!==undefined)marks.push('⇄');c.textContent=(b?(b.hidden?'? ':'')+b.capacity:'')+' '+marks.join('');c.title=b?'ID '+b.id:'';grid.append(c)});a.append(grid);document.querySelector('main').append(a)}</script></html>`);
  console.log(JSON.stringify({accepted:report.accepted,requested:report.requested,elapsedSeconds:Math.round(report.elapsedMs/1000),jobs,cached,report:new URL('report.json',directory).pathname}));
  if(results.length!==numbers.length)throw Error('Неполная партия: каталог не изменён; причины в report.json');
  if(!pilot&&!verify){
    const catalog:CampaignCatalog={version:CAMPAIGN_VERSION,fingerprint:catalogFingerprint,levels:results.map(r=>r.level!)};
    const temp=new URL('src/levels/campaign.tmp',root);writeFileSync(temp,JSON.stringify(catalog)+'\n');renameSync(temp,new URL('src/levels/campaign.json',root));
  }
}finally{await Promise.all(pool.map(worker=>worker.terminate()));}
