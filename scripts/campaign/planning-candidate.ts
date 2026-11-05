import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { Game, WIDTH, HEIGHT, COLLECTION_DEPTH } from '../../src/game.ts';
import type { CampaignLevel } from '../../src/campaign-types.ts';
import { playableLevel } from '../../src/campaign-art.ts';
import { prepareBaseline, preserveLayout, topology, type CandidateResult } from './candidate.ts';
import { planningKinds, planningProfile } from './planning-profile.ts';
import { assessPlanning, planningProbe, openingDepth } from './planning-analysis.ts';
import { certify, replayDecisions, type Proof } from './solver.ts';
import { assertCapacities } from './capacities.ts';
import { campaignCapacityColors } from './capacity-policy.ts';

const root=new URL('../../',import.meta.url);
const anchors=JSON.parse(readFileSync(new URL('planning-anchors.json',import.meta.url),'utf8')) as CampaignLevel[];
const baseFiles=['src/game.ts','src/mechanics.ts','src/generator.ts','src/level-mechanics.ts','src/art-catalog.ts','src/art-scenes.ts','src/campaign-art.ts','scripts/campaign/candidate.ts','scripts/campaign/layout.ts','scripts/campaign/planning-profile.ts','scripts/campaign/solver.ts','scripts/campaign/capacities.ts','scripts/campaign/swap-capacities.ts','scripts/campaign/capacity-policy.ts','scripts/campaign/capacity-targets.json'];
const hash=createHash('sha256');for(const file of baseFiles)hash.update(file).update(readFileSync(new URL(file,root)));
const directory=new URL(`.cache/planning-base/${hash.digest('hex')}/`,root);mkdirSync(directory,{recursive:true});

export function preparePlanning(number:number,attempt:number):CandidateResult {
  const started=performance.now();
  if(number<=5)return preserveLayout(anchors[number-1]);
  try{
    const group=Math.floor(attempt/12),profile=planningProfile(number,group);
    const file=new URL(`${number}-${group}.json`,directory);
    let base:CandidateResult;
    if(existsSync(file))base=JSON.parse(readFileSync(file,'utf8'));
    else {base=prepareBaseline(number,group,profile);writeFileSync(file,JSON.stringify(base));}
    if(!base.level)throw Error(base.error);
    const record=structuredClone(base.level),level=playableLevel(record);
    let seed=(record.seed+Math.imul(attempt+1,104729))>>>0;
    const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    if(profile.difficulty>=2){
      const depth=profile.difficulty===2?1:2;
      for(const queue of level.mechanics?.queues??[]){
        if(queue.cell>=depth*profile.columns)continue;
        const reserved=new Set([...(level.mechanics?.platforms.flatMap(p=>p.cells)??[]),...(level.mechanics?.trays.flat()??[]),...(level.mechanics?.queues.map(q=>q.cell)??[])]);
        const destination=level.field.findIndex((b,i)=>i>=depth*profile.columns&&b&&b.swapWith===undefined&&!reserved.has(i));
        if(destination<0)throw Error('Нет места для диспенсера за проходом');
        [level.field[queue.cell],level.field[destination]]=[level.field[destination],level.field[queue.cell]];
        queue.cell=destination;
      }
    }
    const protectedIds=new Set(level.mechanics?.links.flat()??[]);
    const protectedCells=new Set([...(level.mechanics?.queues.map(q=>q.cell)??[]),...(level.mechanics?.platforms.flatMap(p=>p.cells)??[]),...(level.mechanics?.trays.flat()??[])]);
    const movable=level.field.flatMap((b,i)=>b&&b.swapWith===undefined&&!protectedIds.has(b.id)&&!protectedCells.has(i)?[i]:[]);
    if(profile.difficulty>=2){
      const colors=new Set(level.cells.slice((HEIGHT-COLLECTION_DEPTH)*WIDTH));
      const depth=profile.difficulty===2?1:2;
      const entries=movable.filter(i=>i<depth*profile.columns);
      const blockers=movable.filter(i=>i>=depth*profile.columns&&!colors.has(level.field[i]!.color));
      for(const entry of entries){
        if(!colors.has(level.field[entry]!.color))continue;
        if(!blockers.length)break;
        const index=Math.floor(random()*blockers.length),other=blockers.splice(index,1)[0];
        [level.field[entry],level.field[other]]=[level.field[other],level.field[entry]];
      }
      if(profile.difficulty===4){
        const lanes=Array.from({length:profile.columns},(_,x)=>[x,profile.columns+x]).filter(cells=>cells.every(i=>entries.includes(i)));
        const weak=lanes.find(cells=>cells.some(i=>colors.has(level.field[i]!.color)));
        if(lanes.length>2&&weak){
          const reserved=new Set([...(level.mechanics?.gates.flatMap(g=>g.cells)??[]),...protectedCells]);
          for(const cell of weak){
            const destination=level.field.findIndex((b,i)=>i>=depth*profile.columns&&!b&&!level.walls!.includes(i)&&!reserved.has(i));
            if(destination<0)throw Error('Нет места для третьего прохода');
            level.field[destination]=level.field[cell];level.field[cell]=null;level.walls!.push(cell);
          }
        }
      }
      const chamber=movable.filter(i=>i>=depth*profile.columns&&level.field[i]);
      for(let i=0;i<(attempt%12)*2;i++){
        const a=chamber[Math.floor(random()*chamber.length)],b=chamber[Math.floor(random()*chamber.length)];
        if(a!==undefined&&b!==undefined)[level.field[a],level.field[b]]=[level.field[b],level.field[a]];
      }
    }else if(profile.difficulty===1){
      for(let i=0;i<1+attempt%6;i++){
        const a=movable[Math.floor(random()*movable.length)],b=movable[Math.floor(random()*movable.length)];
        if(a!==undefined&&b!==undefined)[level.field[a],level.field[b]]=[level.field[b],level.field[a]];
      }
    }
    if(planningKinds(number).includes(8)){
      const game=new Game(level);
      level.field.forEach((b,i)=>{if(b&&!game.paths.has(i)&&i>=profile.columns*2&&(i+number)%3===0)b.hidden=true;});
      record.kinds=[...record.kinds,8];
    }
    record.field=level.field;record.walls=level.walls!;record.mechanics=level.mechanics;record.difficulty=profile.difficulty as CampaignLevel['difficulty'];
    assertCapacities(level,campaignCapacityColors(number));
    const initialDepth=openingDepth(new Game(level));
    if(profile.difficulty>=2&&initialDepth!==null&&initialDepth>0&&initialDepth<(profile.difficulty===2?1:2))throw Error(`Недостаточная глубина входа: ${initialDepth}`);
    const proofs:Proof[]=[];
    for(const speed of [1,2] as const){
      let hint:Proof|undefined;
      for(let policy=0;policy<4;policy++){
        const trial=planningProbe(level,speed,policy);
        if(trial.status==='won'){hint=trial.proof;break;}
      }
      if(!hint)hint=certify(level,speed,0);
      for(const pause of [0,-1]){
        try {if(!hint)throw Error();proofs.push(replayDecisions(level,hint.decisions,speed,pause));}
        catch {proofs.push(certify(level,speed,pause));}
      }
    }
    const rating=assessPlanning(level,profile.difficulty,proofs);
    if(!rating.accepted)return {error:`Сложность ${profile.difficulty}: ${JSON.stringify({...rating,badOrders:undefined})}`,generationMs:performance.now()-started,certificationMs:0};
    return {level:record,proofs,rating,generationMs:performance.now()-started,certificationMs:0,signature:topology(record),pressure:Math.max(...proofs.map(p=>p.peakSlots))};
  }catch(error){return {error:String(error),generationMs:performance.now()-started,certificationMs:0};}
}
