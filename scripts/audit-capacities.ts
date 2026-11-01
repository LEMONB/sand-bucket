import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { playableLevel } from '../src/campaign-art.ts';
import type { CampaignCatalog, CampaignLevel } from '../src/campaign-types.ts';
import { auditLevel, FAST_FILL_SECONDS, type AuditResult } from './campaign/capacity-audit.ts';
import { playableKey, readVerified, verificationHash } from './campaign/verification.ts';
import type { Proof } from './campaign/solver.ts';
import { auditReport } from './campaign/capacity-audit-report.ts';

const root=new URL('../',import.meta.url);
if(!isMainThread){
  try { parentPort!.postMessage({result:auditLevel(workerData.record,workerData.proofs,workerData.seconds)}); }
  catch(error){parentPort!.postMessage({error:String(error)});}
}else{
  const args=process.argv.slice(2);
  if(args.some(a=>!['--pilot','--seconds=0.5','--seconds=1'].includes(a))||args.filter(a=>a.startsWith('--seconds=')).length>1)throw Error('Допускаются --pilot и --seconds=0.5 или --seconds=1');
  const seconds=Number(args.find(a=>a.startsWith('--seconds='))?.split('=')[1]??FAST_FILL_SECONDS);
  const read=(file:string)=>readFileSync(new URL(file,root),'utf8');
  const catalog=JSON.parse(read('src/levels/campaign.json')) as CampaignCatalog;
  const currentHash=verificationHash(read);
  // Old certificates are only input routes: every selected route is replayed against current rules.
  const baselineRevision=execFileSync('git',['rev-parse','origin/main'],{cwd:root,encoding:'utf8'}).trim();
  const priorHash=verificationHash(file=>execFileSync('git',['show',`${baselineRevision}:${file}`],{cwd:root,encoding:'utf8'}));
  const files=['scripts/audit-capacities.ts','scripts/campaign/capacity-audit.ts','scripts/campaign/capacities.ts','src/campaign-art.ts','src/art-catalog.ts','src/art-scenes.ts'];
  const hash=createHash('sha256').update(currentHash);
  for(const file of files)hash.update(file).update(read(file));
  hash.update(read('src/levels/campaign.json'));
  hash.update(String(seconds));
  const fingerprint=hash.digest('hex');
  const directory=new URL(`.cache/capacity-audit/${fingerprint}/`,root);
  mkdirSync(directory,{recursive:true});
  const pilot=new Set([1,6,11,16,21,26,31,36,41,46,103,104,154,203,204,254,304,354,399,400]);
  const levels=catalog.levels.filter(r=>!args.includes('--pilot')||pilot.has(r.number));
  const results:AuditResult[]=[];
  const baselineProofs=(record:CampaignLevel):Proof[]=>{
    for(const checkerHash of [currentHash,priorHash]){
      const key=createHash('sha256').update(checkerHash).update(playableKey(playableLevel(record))).digest('hex');
      const proofs=readVerified(new URL(`.cache/playable/verified/${key}.json`,root),key);
      if(proofs)return proofs;
    }
    throw Error(`Уровень ${record.number}: нет сохранённых прохождений для текущих входных данных`);
  };
  const jobs=levels.map(record=>({record,proofs:baselineProofs(record),seconds}));
  const workers=new Set<Worker>();
  const run=(job:typeof jobs[number])=>new Promise<AuditResult>((resolve,reject)=>{
    const worker=new Worker(new URL(import.meta.url),{workerData:job});workers.add(worker);
    let result:AuditResult|undefined,error:Error|undefined;
    worker.once('message',message=>{result=message.result;if(message.error)error=Error(message.error);});
    worker.once('error',cause=>{error=cause instanceof Error?cause:Error(String(cause));});
    worker.once('exit',code=>{workers.delete(worker);if(error||code!==0||!result)reject(error??Error(`Worker exited: ${code}`));else resolve(result);});
  });
  let completed=0,stopped=false;
  try {
    await Promise.all(Array.from({length:Math.min(4,Math.max(1,availableParallelism()-1))},async()=>{
      for(;;){
        if(stopped)return;
        const job=jobs.shift();if(!job)return;
        const file=new URL(`${job.record.number}.json`,directory);
        let result:AuditResult|undefined;
        try { const cached=JSON.parse(readFileSync(file,'utf8'));if(cached.fingerprint===fingerprint&&cached.result.number===job.record.number)result=cached.result; } catch { /* Resume incomplete runs. */ }
        if(!result){
          result=await run(job);
          const temp=new URL(`${job.record.number}.tmp`,directory);
          writeFileSync(temp,JSON.stringify({fingerprint,result}));renameSync(temp,file);
        }
        results.push(result);
        console.log(`${++completed}/${levels.length}: ${result.number} ${result.status}`);
      }
    }));
  }finally{stopped=true;await Promise.all([...workers].map(worker=>worker.terminate()));}
  results.sort((a,b)=>a.number-b.number);
  const prefix=args.includes('--pilot')?'pilot':'report';
  writeFileSync(new URL(`${prefix}.json`,directory),JSON.stringify({fingerprint,baselineRevision,seconds,results},null,2));
  writeFileSync(new URL(`${prefix}.txt`,directory),auditReport(results,seconds));
  console.log(`Отчёт: ${new URL(`${prefix}.txt`,directory).pathname}`);
}
