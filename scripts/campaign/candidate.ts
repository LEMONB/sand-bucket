import { performance } from 'node:perf_hooks';
import { asLevel, generateCandidate, seedFor } from '../../src/generator.ts';
import { mergeArtworkColors } from '../../src/campaign-art.ts';
import { normalizeNewLayout } from './swap-capacities.ts';
import { normalizeCapacities } from './capacities.ts';
import { playableLevel } from '../../src/campaign-art.ts';
import { Game } from '../../src/game.ts';
import type { CampaignLevel } from '../../src/campaign-types.ts';
import { layoutFor } from './layout.ts';
import { balancePauses, certify, type Proof } from './solver.ts';
export interface CandidateResult { level?:CampaignLevel; proofs?:Proof[]; error?:string; generationMs:number; certificationMs:number; signature?:string; pressure?:number; retainedLayout?:boolean }
export function topology(level:CampaignLevel):string {
  const n=level.columns,walls=new Set(level.walls);
  const shape=(mirror:boolean)=>Array.from({length:n*n},(_,i)=>{
    const p=Math.floor(i/n)*n+(mirror?n-1-i%n:i%n);
    return walls.has(p)?'#':level.field[p]?'B':'.';
  }).join('');
  return `${n}:${[shape(false),shape(true)].sort()[0]}:${level.kinds.join(',')}`;
}
export function prepare(number:number,attempt:number):CandidateResult {
  let generationMs=0;const started=performance.now();
  try {
    const profile=layoutFor(number,attempt),seed=(seedFor(number)+Math.imul(attempt,104729))>>>0;
    const generated=generateCandidate(number,seed,profile);let level=mergeArtworkColors(asLevel(generated));
    balancePauses(level);
    level=normalizeNewLayout(level);
    const game=new Game(level);
    if(game.paths.size===0)throw Error('Нет входа');
    if(number>=46){
      const hidden=number%5===2||number%5===3;
      if(hidden){
        level.field.forEach((bucket,i)=>{if(bucket&&!game.paths.has(i)&&(i+number)%3===0)bucket.hidden=true;});
        level.mechanics?.queues.forEach(q=>{q.hidden=true;});
        level.mechanics?.platforms.forEach(p=>{p.hidden=true;});
      }
    }
    generationMs=performance.now()-started;
    const proofs:Proof[]=[];
    for(const speed of [1,2] as const)for(const pause of [0,120,1800,-1])proofs.push(certify(level,speed,pause));
    const record:CampaignLevel={number,art:generated.art!,seed,columns:generated.columns,walls:generated.walls,field:level.field,mechanics:level.mechanics,kinds:generated.kinds??[],family:profile.family};
    if(record.field.some(b=>b?.hidden)||record.mechanics?.queues.some(q=>q.hidden)||record.mechanics?.platforms.some(p=>p.hidden))record.kinds=[...record.kinds,8];
    return {level:record,proofs,generationMs,certificationMs:performance.now()-started-generationMs,signature:topology(record),pressure:Math.max(...proofs.map(p=>p.peakSlots))};
  }catch(error){return {error:error instanceof Error?error.message:String(error),generationMs:generationMs||performance.now()-started,certificationMs:generationMs?performance.now()-started-generationMs:0};}
}

export function preserveLayout(record:CampaignLevel):CandidateResult {
  const started=performance.now();
  try {
    const level=normalizeCapacities(playableLevel(record));
    new Game(level);
    const proofs:Proof[]=[];
    for(const speed of [1,2] as const)for(const pause of [0,120,1800,-1])proofs.push(certify(level,speed,pause));
    const saved={...record,field:level.field,mechanics:level.mechanics};
    return {level:saved,proofs,retainedLayout:true,generationMs:0,certificationMs:performance.now()-started,signature:topology(saved),pressure:Math.max(...proofs.map(p=>p.peakSlots))};
  }catch(error){return {error:String(error),generationMs:0,certificationMs:performance.now()-started};}
}
