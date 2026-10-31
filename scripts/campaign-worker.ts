import { playableLevel } from '../src/campaign-art.ts';
import { parentPort } from 'node:worker_threads';
import { prepare } from './campaign/candidate.ts';
import { certify, replayDecisions, type Proof } from './campaign/solver.ts';
import type { CampaignLevel } from '../src/campaign-types.ts';
parentPort!.on('message',({number,attempt,level,proofs,mergedColors}:{number:number;attempt:number;level?:CampaignLevel;proofs?:Proof[];mergedColors?:boolean})=>{
  if(level&&(proofs||mergedColors)){
    try{
      const playable=playableLevel(level);
      const cases=proofs?.length?proofs:[1,2].flatMap(speed=>[0,120,1800,-1].map(pause=>({speed:speed as 1|2,pause,decisions:[]})));
      const checked = cases.map(proof => {
        try {
          if(proof.decisions.length){
            try { return replayDecisions(playable,proof.decisions,proof.speed,proof.pause); }
            catch(error) { if(!mergedColors)throw error; }
          }else if(!mergedColors)throw Error('Нет решения');
          return certify(playable,proof.speed,proof.pause);
        }catch(error){throw Error(`Скорость ${proof.speed}, пауза ${proof.pause}: ${String(error)}`);}
      });
      parentPort!.postMessage({result:{proofs:checked}});
    }catch(error){parentPort!.postMessage({result:{error:String(error)}});}
  }else parentPort!.postMessage({number,attempt,result:prepare(number,attempt)});
});
