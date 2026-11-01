import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { playableLevel } from '../src/campaign-art.ts';
import type { CampaignCatalog, CampaignLevel } from '../src/campaign-types.ts';
import { auditLevel, FAST_FILL_SECONDS, type AuditResult } from './campaign/capacity-audit.ts';
import { playableKey, readVerified, verificationHash } from './campaign/verification.ts';
import type { Proof } from './campaign/solver.ts';
import { auditReport } from './campaign/capacity-audit-report.ts';
import { auditHashes, auditStats, type AuditStats } from './campaign/capacity-audit-cache.ts';
type Outcome={result:AuditResult;stats:AuditStats};

const root=new URL('../',import.meta.url);
if(!isMainThread){
  try {
    const stats=auditStats(),cache={directory:new URL(workerData.directory),certificates:new URL(workerData.certificates),hashes:workerData.hashes,stats};
    const result=auditLevel(workerData.record,workerData.proofs,workerData.seconds,undefined,cache);
    parentPort!.postMessage({result,stats});
  }
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
  const hashes=auditHashes(read);
  const directory=new URL('.cache/capacity-audit/v2/',root),certificates=new URL('.cache/playable/verified/',root);
  mkdirSync(directory,{recursive:true});mkdirSync(certificates,{recursive:true});
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
  const jobs=levels.map(record=>({record,proofs:baselineProofs(record),seconds,hashes,directory:directory.href,certificates:certificates.href}));
  const stats=auditStats();
  const workers=new Set<Worker>();
  const run=(job:typeof jobs[number])=>new Promise<Outcome>((resolve,reject)=>{
    const worker=new Worker(new URL(import.meta.url),{workerData:job});workers.add(worker);
    let outcome:Outcome|undefined,error:Error|undefined;
    worker.once('message',message=>{outcome=message;if(message.error)error=Error(message.error);});
    worker.once('error',cause=>{error=cause instanceof Error?cause:Error(String(cause));});
    worker.once('exit',code=>{workers.delete(worker);if(error||code!==0||!outcome?.result)reject(error??Error(`Worker exited: ${code}`));else resolve(outcome);});
  });
  let completed=0,stopped=false;
  try {
    await Promise.all(Array.from({length:Math.min(4,Math.max(1,availableParallelism()-1))},async()=>{
      for(;;){
        if(stopped)return;
        const job=jobs.shift();if(!job)return;
        const {result,stats:counts}=await run(job);
        for(const key of Object.keys(stats) as (keyof AuditStats)[])stats[key]+=counts[key];
        results.push(result);
        console.log(`${++completed}/${levels.length}: ${result.number} ${result.status}`);
      }
    }));
  }finally{stopped=true;await Promise.all([...workers].map(worker=>worker.terminate()));}
  results.sort((a,b)=>a.number-b.number);
  const fingerprint=createHash('sha256').update(JSON.stringify([seconds,hashes,levels.map(level=>[level.number,playableKey(playableLevel(level))])])).digest('hex');
  const reportDirectory=new URL(`reports/${fingerprint}/`,directory);mkdirSync(reportDirectory,{recursive:true});
  const prefix=args.includes('--pilot')?'pilot':'report';
  writeFileSync(new URL(`${prefix}.json`,reportDirectory),JSON.stringify({fingerprint,baselineRevision,seconds,stats,results},null,2));
  writeFileSync(new URL(`${prefix}.txt`,reportDirectory),auditReport(results,seconds)+`\nКэш: ${JSON.stringify(stats)}\n`);
  console.log(JSON.stringify(stats));
  console.log(`Отчёт: ${new URL(`${prefix}.txt`,reportDirectory).pathname}`);
}
